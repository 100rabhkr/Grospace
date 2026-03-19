"""
Google Cloud Vision OCR service.

Credentials are resolved in this order:
1. GOOGLE_CLOUD_CREDENTIALS_JSON env var (JSON string — best for Railway / containers)
2. GOOGLE_APPLICATION_CREDENTIALS env var (file path — standard GCP approach)
3. Application Default Credentials (gcloud auth application-default login)
"""

import os
import json
from io import BytesIO
from google.cloud import vision as cloud_vision
from google.oauth2.service_account import Credentials


def _build_vision_client() -> cloud_vision.ImageAnnotatorClient:
    """Build a Vision client, preferring an explicit JSON credentials env var."""
    creds_json = os.getenv("GOOGLE_CLOUD_CREDENTIALS_JSON")
    if creds_json:
        info = json.loads(creds_json)
        creds = Credentials.from_service_account_info(
            info, scopes=["https://www.googleapis.com/auth/cloud-vision"]
        )
        return cloud_vision.ImageAnnotatorClient(credentials=creds)
    # Fall back to GOOGLE_APPLICATION_CREDENTIALS file or ADC
    return cloud_vision.ImageAnnotatorClient()


def extract_text_cloud_vision(images: list) -> str:
    """Use Google Cloud Vision API for high-accuracy OCR on page images."""
    try:
        client = _build_vision_client()
        full_text = ""
        for img in images:
            buf = BytesIO()
            img.save(buf, format="PNG")
            image = cloud_vision.Image(content=buf.getvalue())
            response = client.document_text_detection(image=image)
            if response.error.message:
                continue
            if response.full_text_annotation:
                full_text += response.full_text_annotation.text + "\n\n"
        return full_text.strip()
    except Exception as e:
        print(f"[CLOUD VISION] OCR failed: {type(e).__name__}: {e}")
        return ""
