"""
Document upload, extraction, classification, Q&A endpoints.
"""

import os
import uuid
import json
import time
import hashlib
import asyncio
from typing import Optional
from datetime import datetime
from collections import deque

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Depends, Query
from starlette.requests import Request
import google.generativeai as genai

from core.config import supabase, model, limiter, log_activity
from core.models import (
    CurrentUser, ExtractRequest, ClassifyRequest, QARequest, RiskFlagRequest,
)
from core.dependencies import get_current_user, require_permission
from services.extraction import (
    process_document, classify_document, extract_text_from_pdf,
    download_file, detect_risk_flags, pdf_bytes_to_images,
    clean_ocr_text,
)
from services.ocr_service import extract_text_cloud_vision

router = APIRouter(prefix="/api", tags=["documents"])

# Ring buffer for tracking processing times (last 100)
_processing_times: deque = deque(maxlen=100)


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
async def upload_and_extract(request: Request, file: UploadFile = File(...)):
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
        file_hash = hashlib.sha256(file_bytes).hexdigest()
        try:
            existing = supabase.table("agreements").select(
                "id, document_filename, status, document_url, extracted_data, risk_flags, type, extraction_confidence"
            ).eq("file_hash", file_hash).limit(1).execute()
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
        result = await process_document(file_bytes, filename)
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
        doc_type = await classify_document(req.text)
        return {"document_type": doc_type}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/extract", dependencies=[Depends(require_permission("create_agreements"))])
@limiter.limit("10/minute")
async def extract_endpoint(request: Request, req: ExtractRequest):
    """Process an uploaded document from Supabase URL."""
    try:
        file_bytes = await download_file(req.file_url)
        filename = req.file_url.split("/")[-1].split("?")[0] or "document.pdf"

        result = await process_document(file_bytes, filename)

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
                pdf_bytes = await download_file(doc_url)
                document_text = extract_text_from_pdf(pdf_bytes)
            except Exception:
                document_text = None

        # If text extraction failed, try Cloud Vision OCR first, then Gemini vision
        if (not document_text or len(document_text.strip()) < 100) and doc_url:
            try:
                if not locals().get("pdf_bytes"):
                    pdf_bytes = await download_file(doc_url)
                images = pdf_bytes_to_images(pdf_bytes)
                if images:
                    cloud_text = extract_text_cloud_vision(images)
                    if len(cloud_text.strip()) >= 100:
                        document_text = clean_ocr_text(cloud_text)
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
                            generation_config=genai.GenerationConfig(temperature=0.1, max_output_tokens=1500),
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
            generation_config=genai.GenerationConfig(
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
                pdf_bytes = await download_file(result.data["document_url"])
                document_text = extract_text_from_pdf(pdf_bytes)

        flags = await detect_risk_flags(document_text, req.extracted_data)

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
    user: Optional[CurrentUser] = Depends(get_current_user),
):
    """Upload a document to an outlet (Drive-like multi-doc support)."""
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

    doc_data = {
        "id": str(uuid.uuid4()),
        "org_id": org_id,
        "outlet_id": outlet_id,
        "file_url": file_url,
        "filename": filename,
        "file_type": file_type,
        "category": category or "other",
        "file_size_bytes": file_size,
        "uploaded_by": user.user_id if user else None,
    }

    result = supabase.table("documents").insert(doc_data).execute()

    if org_id:
        log_activity(org_id, user.user_id if user else None, "document", doc_data["id"], "uploaded", {
            "filename": filename,
            "outlet_id": outlet_id,
            "category": category,
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

    # Duplicate detection for async uploads
    file_hash = hashlib.sha256(file_bytes).hexdigest()
    try:
        existing = supabase.table("agreements").select(
            "id, document_filename, status"
        ).eq("file_hash", file_hash).limit(1).execute()
        if existing.data and len(existing.data) > 0:
            prev = existing.data[0]
            return {
                "status": "duplicate",
                "existing_agreement_id": prev["id"],
                "filename": filename,
                "message": f"This document was already uploaded as \"{prev.get('document_filename', 'unknown')}\" (status: {prev.get('status', 'unknown')}).",
            }
    except Exception:
        pass

    # Server-side bulk upload limit: check active processing jobs for this user
    if user:
        try:
            active_jobs = supabase.table("extraction_jobs").select(
                "id", count="exact"
            ).eq("status", "processing").eq(
                "user_id", user.user_id
            ).execute()
            if active_jobs.count and active_jobs.count >= MAX_BULK_FILES:
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
        from services.extraction import get_or_create_demo_org
        org_id = get_or_create_demo_org()

    # Create job record
    job_id = str(uuid.uuid4())
    job_data = {
        "id": job_id,
        "org_id": org_id,
        "user_id": user.user_id if user else None,
        "filename": filename,
        "status": "processing",
    }
    clean_job = {k: v for k, v in job_data.items() if v is not None}
    supabase.table("extraction_jobs").insert(clean_job).execute()

    # Run extraction in background — create_task keeps it on the event loop
    # With --workers 2 in Dockerfile, other worker handles API calls while this blocks
    asyncio.create_task(_process_extraction_job(job_id, file_bytes, filename, file_ext))

    return {"job_id": job_id, "status": "processing", "filename": filename}


async def _process_extraction_job(job_id: str, file_bytes: bytes, filename: str, file_ext: str):
    """Background task to process document extraction and update job status."""
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
        result = await process_document(file_bytes, filename)
        duration = round(time.time() - start_time, 2)
        _processing_times.append(duration)
        result["processing_duration_seconds"] = duration
        if document_url:
            result["document_url"] = document_url

        supabase.table("extraction_jobs").update({
            "status": "completed",
            "result": result,
            "updated_at": datetime.utcnow().isoformat(),
        }).eq("id", job_id).execute()

    except Exception as e:
        supabase.table("extraction_jobs").update({
            "status": "failed",
            "error": str(e),
            "updated_at": datetime.utcnow().isoformat(),
        }).eq("id", job_id).execute()


@router.get("/extraction-jobs", dependencies=[Depends(require_permission("view_agreements"))])
def list_extraction_jobs(
    status: Optional[str] = Query(None),
    user: Optional[CurrentUser] = Depends(get_current_user),
):
    """List extraction jobs for the current user."""
    query = supabase.table("extraction_jobs").select("*").order("created_at", desc=True)
    if status:
        query = query.eq("status", status)
    query = query.limit(20)
    result = query.execute()
    return {"jobs": result.data or []}


@router.patch("/extraction-jobs/{job_id}/seen", dependencies=[Depends(require_permission("view_agreements"))])
def mark_job_seen(job_id: str):
    """Mark an extraction job as seen by the user."""
    result = supabase.table("extraction_jobs").update({"seen": True}).eq("id", job_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"job": result.data[0]}


@router.get("/extraction-jobs/{job_id}", dependencies=[Depends(require_permission("view_agreements"))])
def get_extraction_job(job_id: str):
    """Get the status and result of an extraction job."""
    result = supabase.table("extraction_jobs").select("*").eq("id", job_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Extraction job not found")
    return result.data
