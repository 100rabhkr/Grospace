"""
Document upload, extraction, classification, Q&A endpoints.
"""

import os
import uuid
import json
import time
import hashlib
import asyncio
from contextlib import suppress
from functools import lru_cache
from typing import Optional
from datetime import datetime, timedelta, timezone
from collections import deque

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends, Query
from starlette.requests import Request

from core.config import execute_supabase_query, supabase, model, limiter, log_activity
from core.models import (
    CurrentUser, ExtractRequest, ClassifyRequest, QARequest, RiskFlagRequest,
)
from core.dependencies import get_current_user, get_db_user_id, get_org_filter, require_permission

router = APIRouter(prefix="/api", tags=["documents"])

def _is_uuid(s: Optional[str]) -> bool:
    """True iff `s` is a real UUID string. Demo tokens carry synthetic
    non-UUID user_ids (e.g. "srabhjot-singh") that cannot be used as
    filters against extraction_jobs.user_id (uuid REFERENCES auth.users)."""
    if not s:
        return False
    try:
        uuid.UUID(s)
        return True
    except (ValueError, AttributeError):
        return False


# Ring buffer for tracking processing times (last 100)
_processing_times: deque = deque(maxlen=100)
_MAX_CONCURRENT_EXTRACTIONS_PER_WORKER = max(1, int(os.getenv("MAX_CONCURRENT_EXTRACTIONS_PER_WORKER", "1")))
_extraction_semaphore = asyncio.Semaphore(_MAX_CONCURRENT_EXTRACTIONS_PER_WORKER)
_EXTRACTION_JOB_HEARTBEAT_SECONDS = max(15, int(os.getenv("EXTRACTION_JOB_HEARTBEAT_SECONDS", "30")))
_STALE_EXTRACTION_JOB_MINUTES = max(5, int(os.getenv("STALE_EXTRACTION_JOB_MINUTES", "10")))

# CRITICAL: strong references for background extraction tasks.
# Per https://docs.python.org/3/library/asyncio-task.html#asyncio.create_task
# the event loop only keeps WEAK references to tasks, so a task whose only
# reference is the one asyncio.create_task() returned gets garbage-collected
# mid-execution. We observed this in production as stuck "processing" jobs
# that never ran (updated_at == created_at, no error, no result).
#
# Fix: keep strong refs in a module-level set and discard on completion.
_background_extraction_tasks: set[asyncio.Task] = set()


@lru_cache(maxsize=1)
def _extraction_service():
    from services import extraction as extraction_service

    return extraction_service


@lru_cache(maxsize=1)
def _ocr_service():
    from services import ocr_service

    return ocr_service


@lru_cache(maxsize=1)
def _genai_module():
    import google.generativeai as genai

    return genai


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_job_timestamp(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _is_stale_processing_job(job: dict) -> bool:
    if job.get("status") != "processing":
        return False

    last_seen_at = _parse_job_timestamp(job.get("updated_at") or job.get("created_at"))
    if last_seen_at is None:
        return False

    return datetime.now(timezone.utc) - last_seen_at > timedelta(minutes=_STALE_EXTRACTION_JOB_MINUTES)


def _mark_job_as_stale(job: dict) -> dict:
    stale_error = "Processing stopped after a backend restart or timeout. Please retry this upload."
    payload = {
        "status": "failed",
        "error": stale_error,
        "updated_at": _utcnow_iso(),
    }
    import logging as _logging
    _logger = _logging.getLogger(__name__)
    try:
        result = supabase.table("extraction_jobs").update(payload).eq("id", job["id"]).execute()
        if result.data:
            return result.data[0]
        _logger.warning(
            "_mark_job_as_stale: update returned no data for job %s — it may remain in 'processing' on next read",
            job.get("id"),
        )
    except Exception as e:
        # Loud logging: if this silently fails the job stays stuck in
        # "processing" forever on the user's dashboard and they get no
        # retry path. We need to know when this happens.
        _logger.error(
            "_mark_job_as_stale: failed to transition job %s to failed state: %s. "
            "Job will remain stuck in 'processing' until the next sweep.",
            job.get("id"), e,
        )
    return {**job, **payload}


def _normalize_processing_jobs(jobs: list[dict]) -> list[dict]:
    normalized: list[dict] = []
    for job in jobs:
        normalized.append(_mark_job_as_stale(job) if _is_stale_processing_job(job) else job)
    return normalized


def _get_extraction_job_status(job_id: str) -> Optional[str]:
    try:
        result = supabase.table("extraction_jobs").select("status").eq("id", job_id).single().execute()
        return result.data.get("status") if result.data else None
    except Exception:
        return None


async def _heartbeat_extraction_job(job_id: str):
    while True:
        await asyncio.sleep(_EXTRACTION_JOB_HEARTBEAT_SECONDS)
        try:
            await asyncio.to_thread(
                lambda: supabase.table("extraction_jobs").update({"updated_at": _utcnow_iso()}).eq("id", job_id).execute()
            )
        except Exception:
            pass


def _run_process_document_sync(file_bytes: bytes, filename: str) -> dict:
    """Run the async extraction pipeline in a worker thread."""
    return asyncio.run(_extraction_service().process_document(file_bytes, filename))


async def _process_document_off_thread(file_bytes: bytes, filename: str) -> dict:
    """Keep the main event loop responsive while extraction work runs."""
    async with _extraction_semaphore:
        return await asyncio.to_thread(_run_process_document_sync, file_bytes, filename)


@router.get("/processing-estimate")
def get_processing_estimate():
    """Return average processing times from recent extractions for accurate UI estimates."""
    if len(_processing_times) == 0:
        return {
            "avg_seconds": 60,
            "min_seconds": 30,
            "max_seconds": 120,
            "sample_count": 0,
        }
    times = list(_processing_times)
    return {
        "avg_seconds": round(sum(times) / len(times), 1),
        "min_seconds": round(min(times), 1),
        "max_seconds": round(max(times), 1),
        "sample_count": len(times),
    }


@router.post("/upload-and-extract", dependencies=[Depends(require_permission("create_agreements"))])
@limiter.limit("5/minute")
async def upload_and_extract(
    request: Request,
    file: UploadFile = File(...),
    user: Optional[CurrentUser] = Depends(get_current_user),
):
    """Upload a document (PDF or image) and extract structured data."""
    MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
    ALLOWED_TYPES = {
        "application/pdf", "image/png", "image/jpeg", "image/webp",
        "image/gif", "image/bmp", "image/tiff",
    }
    ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tiff", ".tif"}

    try:
        filename = file.filename or "unknown"
        file_ext = ("." + filename.rsplit(".", 1)[-1]).lower() if "." in filename else ""
        content_type = file.content_type or ""

        if content_type not in ALLOWED_TYPES and file_ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {content_type or file_ext}. Upload a PDF or image.")

        file_bytes = await file.read()

        if len(file_bytes) > MAX_FILE_SIZE:
            raise HTTPException(status_code=413, detail=f"File too large ({len(file_bytes) / (1024*1024):.1f}MB). Maximum is 50MB.")

        if not file_bytes or len(file_bytes) == 0:
            return {
                "status": "partial",
                "document_type": "lease_loi",
                "extraction": {},
                "confidence": {},
                "risk_flags": [],
                "filename": filename,
                "text_length": 0,
                "extraction_method": "failed",
                "error": "Uploaded file is empty.",
            }

        # --- Duplicate detection: check if this exact file was already uploaded ---
        # Multi-tenant: scope the lookup to the caller's org so we never hand back
        # another tenant's extraction just because the file hash collides.
        file_hash = hashlib.sha256(file_bytes).hexdigest()
        caller_org = get_org_filter(user)
        try:
            dup_query = supabase.table("agreements").select(
                "id, document_filename, status, document_url, extracted_data, risk_flags, type, extraction_confidence, org_id"
            ).eq("file_hash", file_hash)
            if caller_org:
                dup_query = dup_query.eq("org_id", caller_org)
            existing = dup_query.limit(1).execute()
            if existing.data and len(existing.data) > 0:
                prev = existing.data[0]
                return {
                    "status": "duplicate",
                    "document_type": prev.get("type", "lease_loi"),
                    "extraction": prev.get("extracted_data") or {},
                    "confidence": prev.get("extraction_confidence") or {},
                    "risk_flags": prev.get("risk_flags") or [],
                    "filename": filename,
                    "document_url": prev.get("document_url"),
                    "existing_agreement_id": prev["id"],
                    "existing_status": prev.get("status"),
                    "message": f"This document was already uploaded as \"{prev.get('document_filename', 'unknown')}\" (status: {prev.get('status', 'unknown')}). The previous extraction and risk flags have been returned for consistency.",
                }
        except Exception:
            pass  # file_hash column may not exist yet — skip check gracefully

        # Upload file to Supabase storage so it can be viewed later
        document_url = None
        try:
            storage_path = f"uploads/{uuid.uuid4()}{file_ext}"
            supabase.storage.from_("documents").upload(storage_path, file_bytes, {
                "content-type": content_type or "application/octet-stream"
            })
            # Use signed URL (valid 1 year) since bucket may be private
            signed = supabase.storage.from_("documents").create_signed_url(storage_path, 31536000)
            document_url = signed.get("signedURL") or signed.get("signedUrl")
            if not document_url:
                document_url = supabase.storage.from_("documents").get_public_url(storage_path)
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Storage upload failed: {e}")

        start_time = time.time()
        result = await _process_document_off_thread(file_bytes, filename)
        duration = round(time.time() - start_time, 2)
        _processing_times.append(duration)
        result["processing_duration_seconds"] = duration
        result["file_hash"] = file_hash
        if document_url:
            result["document_url"] = document_url
        return result

    except Exception as e:
        return {
            "status": "partial",
            "document_type": "lease_loi",
            "extraction": {},
            "confidence": {},
            "risk_flags": [],
            "filename": file.filename or "unknown",
            "text_length": 0,
            "extraction_method": "failed",
            "error": f"Unexpected error: {str(e)}",
        }


@router.post("/classify", dependencies=[Depends(require_permission("view_agreements"))])
async def classify_endpoint(req: ClassifyRequest):
    """Classify document type from text."""
    try:
        doc_type = await _extraction_service().classify_document(req.text)
        return {"document_type": doc_type}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/extract", dependencies=[Depends(require_permission("create_agreements"))])
@limiter.limit("10/minute")
async def extract_endpoint(request: Request, req: ExtractRequest):
    """Process an uploaded document from Supabase URL."""
    try:
        file_bytes = await _extraction_service().download_file(req.file_url)
        filename = req.file_url.split("/")[-1].split("?")[0] or "document.pdf"

        result = await _process_document_off_thread(file_bytes, filename)

        update_data = {
            "extracted_data": result["extraction"],
            "extraction_confidence": result["confidence"],
            "risk_flags": result["risk_flags"],
            "extraction_status": "review",
            "type": result["document_type"],
        }
        if result.get("document_text"):
            update_data["document_text"] = result["document_text"]
        supabase.table("agreements").update(update_data).eq("id", req.agreement_id).execute()

        return {
            "status": "review",
            "agreement_id": req.agreement_id,
            "document_type": result["document_type"],
            "extraction": result["extraction"],
            "confidence": result["confidence"],
            "risk_flags": result["risk_flags"],
            "extraction_method": result["extraction_method"],
        }

    except Exception as e:
        try:
            supabase.table("agreements").update({
                "extraction_status": "failed",
            }).eq("id", req.agreement_id).execute()
        except Exception:
            pass
        return {
            "status": "failed",
            "agreement_id": req.agreement_id,
            "error": str(e),
            "extraction": {},
            "confidence": {},
            "risk_flags": [],
        }


@router.post("/qa", dependencies=[Depends(require_permission("view_agreements"))])
@limiter.limit("20/minute")
async def qa_endpoint(request: Request, req: QARequest):
    """Answer questions about a specific agreement document with conversation history."""
    try:
        result = supabase.table("agreements").select("extracted_data, document_url, document_text").eq("id", req.agreement_id).single().execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Agreement not found")

        extracted_data = result.data.get("extracted_data", {})
        doc_url = result.data.get("document_url")
        cached_text = result.data.get("document_text")

        # --- Conversation history ---
        session_id = req.session_id
        conversation_history = []
        if session_id:
            try:
                sess = supabase.table("document_qa_sessions").select("messages").eq("id", session_id).single().execute()
                if sess.data:
                    conversation_history = sess.data.get("messages", []) or []
            except Exception:
                pass

        formatted_history = ""
        if conversation_history:
            last_messages = conversation_history[-10:]
            for msg in last_messages:
                role = msg.get("role", "user")
                text_content = msg.get("content", "")
                formatted_history += f"{'User' if role == 'user' else 'Assistant'}: {text_content}\n\n"

        # --- Get document text ---
        document_text = cached_text or req.document_text
        if not document_text and doc_url:
            try:
                extraction_service = _extraction_service()
                pdf_bytes = await extraction_service.download_file(doc_url)
                document_text = extraction_service.extract_text_from_pdf(pdf_bytes)
            except Exception:
                document_text = None

        # If text extraction failed, try Cloud Vision OCR first, then Gemini vision
        if (not document_text or len(document_text.strip()) < 100) and doc_url:
            try:
                extraction_service = _extraction_service()
                if not locals().get("pdf_bytes"):
                    pdf_bytes = await extraction_service.download_file(doc_url)
                images = extraction_service.pdf_bytes_to_images(pdf_bytes)
                if images:
                    cloud_text = _ocr_service().extract_text_cloud_vision(images)
                    if len(cloud_text.strip()) >= 100:
                        document_text = extraction_service.clean_ocr_text(cloud_text)
                    else:
                        history_block = f"\nConversation history:\n{formatted_history}\n" if formatted_history else ""
                        qa_prompt = (
                            "You are GroBot, an AI assistant built by 360Labs, helping users understand their commercial lease documents. "
                            "Look at these document page images carefully.\n\n"
                            "Rules:\n"
                            "- Only answer based on the document provided. Do not make assumptions.\n"
                            "- ALWAYS quote the relevant clause text from the document in your answer using blockquotes.\n"
                            "- Include the section/clause number if identifiable.\n"
                            "- If the answer is not in the document, say so clearly.\n"
                            "- Keep answers concise but complete.\n"
                            f"{history_block}\n"
                            f"User question: {req.question}"
                        )
                        content = [qa_prompt] + images[:15]
                        response = model.generate_content(
                            content,
                            generation_config=_genai_module().GenerationConfig(temperature=0.1, max_output_tokens=1500),
                        )
                        answer = response.text
                        session_id = _save_qa_session(session_id, req.agreement_id, req.question, answer, conversation_history)
                        return {"answer": answer, "agreement_id": req.agreement_id, "session_id": session_id}
            except Exception:
                pass

        # Build context from whatever we have
        extraction_summary = json.dumps(extracted_data, indent=2) if extracted_data else ""
        history_block = f"\nConversation history:\n{formatted_history}\n" if formatted_history else ""

        if document_text and len(document_text.strip()) >= 100:
            prompt = (
                "You are GroBot, an AI assistant built by 360Labs, helping users understand their commercial lease documents. "
                "You have access to the full text of a specific lease/agreement document.\n\n"
                "Rules:\n"
                "- Only answer based on the document provided. Do not make assumptions.\n"
                "- ALWAYS quote the relevant clause text from the document in your answer using blockquotes (> quote).\n"
                "- Include the section/clause number if identifiable.\n"
                "- If the answer is not in the document, say so clearly.\n"
                "- Keep answers concise but complete.\n"
                "- Use simple language, avoid unnecessary legal jargon.\n"
                "- For financial questions (rent, CAM, maintenance, deposits, charges), search the ENTIRE document carefully. "
                "CAM/maintenance charges are often in sections titled 'Other Charges', 'Maintenance', 'Common Area', or within the rent section. "
                "They may be expressed as: Rs X/sqft, a monthly amount, or a percentage.\n"
                f"{history_block}\n"
                f"Document text:\n{document_text[:15000]}\n\n"
                f"Extracted data summary:\n{extraction_summary[:4000]}\n\n"
                f"User question: {req.question}"
            )
        elif extraction_summary and extraction_summary != "{}":
            prompt = (
                "You are GroBot, an AI assistant built by 360Labs, helping users understand their commercial lease documents. "
                "You have access to the AI-extracted structured data from this agreement.\n\n"
                "Rules:\n"
                "- Only answer based on the extracted data provided. Do not make assumptions.\n"
                "- If the specific information is not in the extracted data, say so clearly.\n"
                "- Keep answers concise but complete.\n"
                "- Use simple language, avoid unnecessary legal jargon.\n"
                f"{history_block}\n"
                f"Extracted agreement data:\n{extraction_summary[:12000]}\n\n"
                f"User question: {req.question}"
            )
        else:
            raise HTTPException(status_code=404, detail="No document data available for this agreement")

        response = model.generate_content(
            prompt,
            generation_config=_genai_module().GenerationConfig(
                temperature=0.1,
                max_output_tokens=1500,
            ),
        )

        answer = response.text
        session_id = _save_qa_session(session_id, req.agreement_id, req.question, answer, conversation_history)
        return {"answer": answer, "agreement_id": req.agreement_id, "session_id": session_id}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _save_qa_session(session_id: Optional[str], agreement_id: str, question: str, answer: str, history: list) -> str:
    """Save Q&A exchange to document_qa_sessions table. Returns session_id."""
    new_messages = history + [
        {"role": "user", "content": question},
        {"role": "assistant", "content": answer},
    ]
    try:
        if session_id:
            supabase.table("document_qa_sessions").update({
                "messages": new_messages,
                "updated_at": datetime.utcnow().isoformat(),
            }).eq("id", session_id).execute()
            return session_id
        else:
            new_id = str(uuid.uuid4())
            supabase.table("document_qa_sessions").insert({
                "id": new_id,
                "agreement_id": agreement_id,
                "messages": new_messages,
                "created_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat(),
            }).execute()
            return new_id
    except Exception:
        return session_id or str(uuid.uuid4())


@router.post("/risk-flags", dependencies=[Depends(require_permission("view_agreements"))])
@limiter.limit("10/minute")
async def risk_flags_endpoint(request: Request, req: RiskFlagRequest):
    """Analyze document for risk flags."""
    try:
        document_text = req.document_text or ""
        if not document_text:
            result = supabase.table("agreements").select("document_url").eq("id", req.agreement_id).single().execute()
            if result.data and result.data.get("document_url"):
                extraction_service = _extraction_service()
                pdf_bytes = await extraction_service.download_file(result.data["document_url"])
                document_text = extraction_service.extract_text_from_pdf(pdf_bytes)

        flags = await _extraction_service().detect_risk_flags(document_text, req.extracted_data)

        supabase.table("agreements").update({
            "risk_flags": flags,
        }).eq("id", req.agreement_id).execute()

        return {"risk_flags": flags, "agreement_id": req.agreement_id}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# OUTLET DOCUMENT MANAGEMENT (Drive-like multi-doc per outlet)
# ============================================

@router.get("/outlets/{outlet_id}/documents", dependencies=[Depends(require_permission("view_outlets"))])
def list_outlet_documents(outlet_id: str):
    """List all documents for an outlet."""
    result = supabase.table("documents").select("*").eq("outlet_id", outlet_id).order("uploaded_at", desc=True).execute()
    return {"documents": result.data if result.data else []}


@router.post("/outlets/{outlet_id}/documents", dependencies=[Depends(require_permission("edit_outlets"))])
async def upload_outlet_document(
    outlet_id: str,
    file: UploadFile = File(...),
    category: str = Form("other"),
    expiry_date: Optional[str] = Form(None),
    license_number: Optional[str] = Form(None),
    user: Optional[CurrentUser] = Depends(get_current_user),
):
    """Upload a document to an outlet (Drive-like multi-doc support).

    If category='license' AND expiry_date is supplied, this also creates a
    critical_date event which cascades to an alert (reminder) via the
    Event → Reminder + Payment pipeline. Matches the required flow:
        Licenses → Upload license → Add expiry → System creates reminder
    """
    outlet = supabase.table("outlets").select("id, org_id").eq("id", outlet_id).single().execute()
    if not outlet.data:
        raise HTTPException(status_code=404, detail="Outlet not found")

    org_id = outlet.data.get("org_id")

    file_bytes = await file.read()
    file_size = len(file_bytes)
    if file_size > 50 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large. Maximum 50MB allowed.")

    filename = file.filename or "document"
    ext = os.path.splitext(filename.lower())[1]
    file_type = "pdf" if ext == ".pdf" else ("image" if ext in {".jpg", ".jpeg", ".png"} else "other")

    storage_path = f"documents/{org_id}/{outlet_id}/{uuid.uuid4()}{ext}"
    try:
        supabase.storage.from_("documents").upload(storage_path, file_bytes, {
            "content-type": file.content_type or "application/octet-stream"
        })
        signed = supabase.storage.from_("documents").create_signed_url(storage_path, 31536000)
        file_url = signed.get("signedURL") or signed.get("signedUrl")
        if not file_url:
            file_url = supabase.storage.from_("documents").get_public_url(storage_path)
    except Exception:
        file_url = f"storage://{storage_path}"

    # Validate expiry_date if supplied (ISO YYYY-MM-DD)
    expiry_iso: Optional[str] = None
    if expiry_date:
        from datetime import date as _date
        try:
            _date.fromisoformat(expiry_date)
            expiry_iso = expiry_date
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="expiry_date must be YYYY-MM-DD")

    doc_data = {
        "id": str(uuid.uuid4()),
        "org_id": org_id,
        "outlet_id": outlet_id,
        "file_url": file_url,
        "filename": filename,
        "file_type": file_type,
        "category": category or "other",
        "file_size_bytes": file_size,
        "uploaded_by": get_db_user_id(user),
    }
    if expiry_iso:
        doc_data["expiry_date"] = expiry_iso
    if license_number:
        doc_data["license_number"] = license_number

    # Drop columns the table may not have yet (expiry_date/license_number
    # live behind a migration — keep the upload resilient either way).
    try:
        result = supabase.table("documents").insert(doc_data).execute()
    except Exception:
        stripped = {k: v for k, v in doc_data.items() if k not in ("expiry_date", "license_number")}
        result = supabase.table("documents").insert(stripped).execute()

    # License + expiry → auto-create a critical_date event so the Event →
    # Reminder + Payment pipeline in critical_dates.py fires and schedules
    # an alert at the expiry date.
    if category == "license" and expiry_iso and org_id:
        try:
            import logging as _logging
            _logger = _logging.getLogger(__name__)
            event_id = str(uuid.uuid4())
            event_entry = {
                "id": event_id,
                "org_id": org_id,
                "outlet_id": outlet_id,
                "date_value": expiry_iso,
                "date_type": "custom",
                "event_type": "license_renewal",
                "label": f"License expiry: {filename}",
                "priority": "high",
                "status": "upcoming",
                "task_status": "pending",
                "alert_days": [90, 30, 7],
                "is_financial": False,
                "notes": f"Auto-created from license upload ({filename})"
                         + (f" — #{license_number}" if license_number else ""),
            }
            supabase.table("critical_dates").insert(event_entry).execute()

            # Linked alert at the expiry date — mirrors create_critical_date()
            alert_entry = {
                "id": str(uuid.uuid4()),
                "org_id": org_id,
                "outlet_id": outlet_id,
                "type": "license_expiry",
                "title": f"License expiring: {filename}",
                "message": f"License ({filename}) expires on {expiry_iso}. Renew before this date.",
                "trigger_date": expiry_iso,
                "severity": "high",
                "status": "pending",
                "source_event_id": event_id,
            }
            try:
                supabase.table("alerts").insert(alert_entry).execute()
            except Exception as _e:
                _logger.warning("License upload: failed to create linked alert: %s", _e)
        except Exception as _e:
            import logging as _logging
            _logging.getLogger(__name__).warning(
                "License upload: failed to auto-create reminder event: %s", _e
            )

    if org_id:
        log_activity(org_id, get_db_user_id(user), "document", doc_data["id"], "uploaded", {
            "filename": filename,
            "outlet_id": outlet_id,
            "category": category,
            "expiry_date": expiry_iso,
        })

    return {"document": result.data[0] if result.data else doc_data}


@router.delete("/documents/{document_id}", dependencies=[Depends(require_permission("delete_outlets"))])
def delete_document(document_id: str, user: Optional[CurrentUser] = Depends(get_current_user)):
    """Delete a document."""
    doc = supabase.table("documents").select("id, org_id, file_url, filename, outlet_id").eq("id", document_id).single().execute()
    if not doc.data:
        raise HTTPException(status_code=404, detail="Document not found")

    try:
        file_url = doc.data.get("file_url", "")
        if "storage://" in file_url:
            path = file_url.replace("storage://", "")
            supabase.storage.from_("documents").remove([path])
    except Exception:
        pass

    supabase.table("documents").delete().eq("id", document_id).execute()

    org_id = doc.data.get("org_id")
    if org_id:
        log_activity(org_id, user.user_id if user else None, "document", document_id, "deleted", {
            "filename": doc.data.get("filename"),
            "outlet_id": doc.data.get("outlet_id"),
        })

    return {"deleted": True}


# ============================================
# ASYNC BULK UPLOAD SUPPORT
# ============================================

@router.post("/upload-and-extract-async", dependencies=[Depends(require_permission("create_agreements"))])
@limiter.limit("15/minute")
async def upload_and_extract_async(
    request: Request,
    file: UploadFile = File(...),
    user: Optional[CurrentUser] = Depends(get_current_user),
):
    """Upload a document and extract in background. Returns job_id immediately.

    Server-side limit: maximum 10 concurrent processing jobs per user to prevent abuse.
    """
    MAX_FILE_SIZE = 50 * 1024 * 1024
    MAX_BULK_FILES = 10  # Must match frontend MAX_BULK_FILES
    ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tiff", ".tif"}

    filename = file.filename or "unknown"
    file_ext = ("." + filename.rsplit(".", 1)[-1]).lower() if "." in filename else ""

    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {file_ext}")

    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large. Maximum is 50MB.")

    # Duplicate detection — lean query (don't pull extracted_data JSONB here;
    # if we need it, we fetch it on the follow-up call)
    file_hash = hashlib.sha256(file_bytes).hexdigest()
    caller_org = get_org_filter(user)
    try:
        dup_query = supabase.table("agreements").select(
            "id, document_filename, status, document_url, risk_flags, type"
        ).eq("file_hash", file_hash)
        if caller_org:
            dup_query = dup_query.eq("org_id", caller_org)
        existing = dup_query.limit(1).execute()
        if existing.data and len(existing.data) > 0:
            prev = existing.data[0]
            # Fetch the heavy fields in a second targeted query only for the match
            full = supabase.table("agreements").select(
                "extracted_data, extraction_confidence"
            ).eq("id", prev["id"]).single().execute()
            return {
                "status": "duplicate",
                "existing_agreement_id": prev["id"],
                "existing_status": prev.get("status"),
                "filename": filename,
                "document_type": prev.get("type", "lease_loi"),
                "extraction": (full.data or {}).get("extracted_data") or {},
                "confidence": (full.data or {}).get("extraction_confidence") or {},
                "risk_flags": prev.get("risk_flags") or [],
                "document_url": prev.get("document_url"),
                "file_hash": file_hash,
                "message": f"This document was already uploaded as \"{prev.get('document_filename', 'unknown')}\" (status: {prev.get('status', 'unknown')}). The previous extraction has been returned for review.",
            }
    except Exception:
        pass

    # Server-side bulk upload limit: check active processing jobs for this user
    if user and _is_uuid(user.user_id):
        try:
            active_jobs = supabase.table("extraction_jobs").select(
                "id, status, created_at, updated_at"
            ).eq("status", "processing").eq(
                "user_id", user.user_id
            ).execute()
            live_processing_jobs = [
                job for job in _normalize_processing_jobs(active_jobs.data or [])
                if job.get("status") == "processing"
            ]
            if len(live_processing_jobs) >= MAX_BULK_FILES:
                raise HTTPException(
                    status_code=429,
                    detail=f"Maximum {MAX_BULK_FILES} files per batch. Please wait for current jobs to complete."
                )
        except HTTPException:
            raise
        except Exception:
            pass  # Don't block upload if check fails

    # Determine org_id
    org_id = user.org_id if user else None
    if not org_id:
        # Try to find from profile
        try:
            if user:
                profile = supabase.table("profiles").select("org_id").eq("id", user.user_id).single().execute()
                org_id = profile.data.get("org_id") if profile.data else None
        except Exception:
            pass
    if not org_id:
        from services.extraction_fields import get_or_create_demo_org

        org_id = get_or_create_demo_org()

    # Check if same file is already being processed — prevent duplicate extractions
    try:
        existing_query = supabase.table("extraction_jobs").select(
            "id, filename, status, created_at, updated_at"
        ).eq("filename", filename).eq("status", "processing")
        if user and _is_uuid(user.user_id):
            existing_query = existing_query.eq("user_id", user.user_id)
        elif org_id:
            existing_query = existing_query.eq("org_id", org_id)

        existing = existing_query.execute()
        live_processing_jobs = [
            job for job in _normalize_processing_jobs(existing.data or [])
            if job.get("status") == "processing"
        ]
        if live_processing_jobs:
            existing_job = live_processing_jobs[0]
            print(f"[UPLOAD] Duplicate prevented: {filename} already processing as job {existing_job['id']}")
            return {"job_id": existing_job["id"], "status": "processing", "filename": filename, "duplicate": True}
    except Exception:
        pass

    # Also check by file hash if available
    try:
        file_hash = hashlib.sha256(file_bytes).hexdigest()
        recent_query = supabase.table("extraction_jobs").select("id, status, result").eq(
            "status", "completed"
        )
        if user and _is_uuid(user.user_id):
            recent_query = recent_query.eq("user_id", user.user_id)
        elif org_id:
            recent_query = recent_query.eq("org_id", org_id)
        recent_completed = recent_query.order("created_at", desc=True).limit(10).execute()
        for job in (recent_completed.data or []):
            if job.get("result", {}).get("file_hash") == file_hash:
                print(f"[UPLOAD] Same file already extracted: {filename} (hash match)")
                return {"job_id": job["id"], "status": "completed", "filename": filename, "duplicate": True}
    except Exception:
        pass

    # Create job record
    # IMPORTANT: extraction_jobs.user_id is a uuid REFERENCES auth.users(id).
    # Demo sessions carry synthetic non-UUID user_ids ("demo-user", "srabhjot-singh",
    # etc.) that would fail both the UUID cast AND the FK check. Skip user_id
    # for non-UUID demo users so the job record still inserts successfully.
    job_id = str(uuid.uuid4())
    user_id_value: Optional[str] = None
    if user and user.user_id:
        try:
            uuid.UUID(user.user_id)  # Raises ValueError if not a valid UUID
            user_id_value = user.user_id
        except (ValueError, AttributeError):
            user_id_value = None
    job_data = {
        "id": job_id,
        "org_id": org_id,
        "user_id": user_id_value,
        "filename": filename,
        "status": "processing",
    }
    clean_job = {k: v for k, v in job_data.items() if v is not None}
    supabase.table("extraction_jobs").insert(clean_job).execute()

    # Run extraction in the background but keep heavy work off the main event
    # loop. IMPORTANT: keep a strong reference — the event loop only holds
    # weak refs to tasks so this would otherwise be GC'd mid-run.
    #
    # We also wrap the task in an outer exception handler so any crash in
    # the coroutine gets written into the job row as `failed` with a real
    # error message, instead of leaving the job stuck in `processing`
    # forever (which was the reported bug).
    async def _run_with_guard():
        try:
            await _process_extraction_job(job_id, file_bytes, filename, file_ext, file_hash)
        except Exception as guard_exc:  # pragma: no cover
            import logging as _l
            _l.getLogger(__name__).exception(
                "extraction task crashed for job %s: %s", job_id, guard_exc,
            )
            # Surface a friendly message to the user; the real traceback is
            # captured in the server logs for debugging.
            try:
                supabase.table("extraction_jobs").update({
                    "status": "failed",
                    "error": "We couldn't process this document. Please try again — if it keeps failing contact support.",
                    "updated_at": _utcnow_iso(),
                }).eq("id", job_id).execute()
            except Exception:
                pass

    task = asyncio.create_task(_run_with_guard())
    _background_extraction_tasks.add(task)
    task.add_done_callback(_background_extraction_tasks.discard)

    return {"job_id": job_id, "status": "processing", "filename": filename}


async def _process_extraction_job(job_id: str, file_bytes: bytes, filename: str, file_ext: str, file_hash: str):
    """Background task to process document extraction and update job status."""
    heartbeat_task = asyncio.create_task(_heartbeat_extraction_job(job_id))
    try:
        # Upload to storage
        document_url = None
        try:
            storage_path = f"uploads/{uuid.uuid4()}{file_ext}"
            content_type = "application/pdf" if file_ext == ".pdf" else f"image/{file_ext.lstrip('.')}"
            supabase.storage.from_("documents").upload(storage_path, file_bytes, {
                "content-type": content_type
            })
            signed = supabase.storage.from_("documents").create_signed_url(storage_path, 31536000)
            document_url = signed.get("signedURL") or signed.get("signedUrl")
            if not document_url:
                document_url = supabase.storage.from_("documents").get_public_url(storage_path)
        except Exception:
            pass

        start_time = time.time()
        result = await _process_document_off_thread(file_bytes, filename)
        duration = round(time.time() - start_time, 2)
        _processing_times.append(duration)
        result["processing_duration_seconds"] = duration
        result["file_hash"] = file_hash
        if document_url:
            result["document_url"] = document_url

        if _get_extraction_job_status(job_id) == "cancelled":
            return

        supabase.table("extraction_jobs").update({
            "status": "completed",
            "result": result,
            "updated_at": _utcnow_iso(),
        }).eq("id", job_id).execute()

    except Exception as e:
        if _get_extraction_job_status(job_id) == "cancelled":
            return
        supabase.table("extraction_jobs").update({
            "status": "failed",
            "error": str(e),
            "updated_at": _utcnow_iso(),
        }).eq("id", job_id).execute()
    finally:
        heartbeat_task.cancel()
        with suppress(asyncio.CancelledError):
            await heartbeat_task


@router.get("/extraction-jobs", dependencies=[Depends(require_permission("view_agreements"))])
def list_extraction_jobs(
    status: Optional[str] = Query(None),
    seen: Optional[bool] = Query(None),
    limit: int = Query(20, ge=1, le=50),
    user: Optional[CurrentUser] = Depends(get_current_user),
):
    """List extraction jobs for the current user."""
    def _build_query():
        query = supabase.table("extraction_jobs").select(
            "id, org_id, user_id, filename, status, error, created_at, updated_at, seen"
        ).order("created_at", desc=True)

        if user and _is_uuid(user.user_id):
            query = query.eq("user_id", user.user_id)
        else:
            org_id = get_org_filter(user)
            if org_id:
                query = query.eq("org_id", org_id)

        if status:
            query = query.eq("status", status)
        if seen is not None:
            query = query.eq("seen", seen)
        return query.limit(limit)

    result = execute_supabase_query(_build_query)
    return {"jobs": _normalize_processing_jobs(result.data or [])}


@router.patch("/extraction-jobs/{job_id}/seen", dependencies=[Depends(require_permission("view_agreements"))])
def mark_job_seen(job_id: str, user: Optional[CurrentUser] = Depends(get_current_user)):
    """Mark an extraction job as seen by the user."""
    query = supabase.table("extraction_jobs").update({"seen": True}).eq("id", job_id)
    if user and _is_uuid(user.user_id):
        query = query.eq("user_id", user.user_id)
    else:
        org_id = get_org_filter(user)
        if org_id:
            query = query.eq("org_id", org_id)
    result = query.execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"job": result.data[0]}


@router.patch("/extraction-jobs/{job_id}/cancel", dependencies=[Depends(require_permission("view_agreements"))])
def cancel_extraction_job(job_id: str, user: Optional[CurrentUser] = Depends(get_current_user)):
    """Cancel a processing extraction job."""
    # Check current status
    current_query = supabase.table("extraction_jobs").select("id, status").eq("id", job_id)
    if user and _is_uuid(user.user_id):
        current_query = current_query.eq("user_id", user.user_id)
    else:
        org_id = get_org_filter(user)
        if org_id:
            current_query = current_query.eq("org_id", org_id)
    current = current_query.single().execute()
    if not current.data:
        raise HTTPException(status_code=404, detail="Job not found")
    if current.data["status"] != "processing":
        raise HTTPException(status_code=400, detail="Only processing jobs can be cancelled")
    update_query = supabase.table("extraction_jobs").update({
        "status": "cancelled",
        "error": "Cancelled by user",
    }).eq("id", job_id)
    if user and _is_uuid(user.user_id):
        update_query = update_query.eq("user_id", user.user_id)
    else:
        org_id = get_org_filter(user)
        if org_id:
            update_query = update_query.eq("org_id", org_id)
    result = update_query.execute()
    return {"job": result.data[0] if result.data else {"id": job_id, "status": "cancelled"}}


@router.get("/extraction-jobs/{job_id}", dependencies=[Depends(require_permission("view_agreements"))])
def get_extraction_job(job_id: str, user: Optional[CurrentUser] = Depends(get_current_user)):
    """Get the status and result of an extraction job."""
    query = supabase.table("extraction_jobs").select("*").eq("id", job_id)
    if user and _is_uuid(user.user_id):
        query = query.eq("user_id", user.user_id)
    else:
        org_id = get_org_filter(user)
        if org_id:
            query = query.eq("org_id", org_id)
    result = query.single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Extraction job not found")
    return _mark_job_as_stale(result.data) if _is_stale_processing_job(result.data) else result.data


@router.delete("/extraction-jobs/{job_id}", dependencies=[Depends(require_permission("view_agreements"))])
def delete_extraction_job(job_id: str, user: Optional[CurrentUser] = Depends(get_current_user)):
    """
    Permanently remove an extraction job from the processing page. Only
    allowed for terminal states (failed, cancelled, completed) — in-flight
    processing jobs must be cancelled first.

    Writes a row to the Deletion Audit sheet for traceability.
    """
    query = supabase.table("extraction_jobs").select(
        "id, filename, status, org_id, error"
    ).eq("id", job_id)
    if user and _is_uuid(user.user_id):
        query = query.eq("user_id", user.user_id)
    else:
        caller_org = get_org_filter(user)
        if caller_org:
            query = query.eq("org_id", caller_org)
    current = query.single().execute()
    if not current.data:
        raise HTTPException(status_code=404, detail="Extraction job not found")

    if current.data.get("status") == "processing":
        raise HTTPException(
            status_code=400,
            detail="Cancel the job first before deleting it from the processing page",
        )

    supabase.table("extraction_jobs").delete().eq("id", job_id).execute()

    # Audit
    try:
        from services.sheets_service import write_deletion_audit_row
        write_deletion_audit_row(
            action="delete_forever",
            entity_type="extraction_job",
            entity_id=job_id,
            title=current.data.get("filename") or "",
            status_before=current.data.get("status") or "",
            deleted_by=(user.email if user else "") or "",
            org_id=current.data.get("org_id") or "",
            notes=(current.data.get("error") or "")[:200],
        )
    except Exception:
        pass

    return {"deleted": True, "job_id": job_id}
