"""
Google Cloud Vision OCR service with image preprocessing and language hints.

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
from PIL import Image, ImageEnhance, ImageFilter, ImageStat


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


def _preprocess_image(img: Image.Image) -> Image.Image:
    """Enhance image quality before OCR: contrast, sharpness, noise reduction."""
    try:
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")

        grayscale = img.convert("L")
        stat = ImageStat.Stat(grayscale)
        mean_val = stat.mean[0]
        std_dev = stat.stddev[0]

        if std_dev < 40:
            contrast_factor = min(2.0, 60 / max(std_dev, 1))
            img = ImageEnhance.Contrast(img).enhance(contrast_factor)

        if mean_val < 100:
            brightness_factor = min(1.8, 140 / max(mean_val, 1))
            img = ImageEnhance.Brightness(img).enhance(brightness_factor)

        if std_dev > 10:
            img = img.filter(ImageFilter.MedianFilter(size=3))

        img = ImageEnhance.Sharpness(img).enhance(1.5)
        return img
    except Exception:
        return img


def extract_text_cloud_vision(images: list, preprocess: bool = True) -> str:
    """Use Google Cloud Vision API for high-accuracy OCR on page images.

    Features:
        - Image preprocessing (contrast, sharpness, denoising)
        - Language hints for Hindi + English (common in Indian lease documents)
        - DOCUMENT_TEXT_DETECTION for better accuracy on forms and tables
    """
    try:
        client = _build_vision_client()
        full_text = ""

        image_context = cloud_vision.ImageContext(
            language_hints=["en", "hi"],
        )

        for idx, img in enumerate(images):
            if preprocess:
                img = _preprocess_image(img)

            buf = BytesIO()
            img.save(buf, format="PNG")
            image = cloud_vision.Image(content=buf.getvalue())

            response = client.document_text_detection(
                image=image,
                image_context=image_context,
            )

            if response.error.message:
                print(f"[CLOUD VISION] Page {idx + 1} error: {response.error.message}")
                continue

            if response.full_text_annotation:
                page_text = response.full_text_annotation.text
                full_text += page_text + "\n\n"

                for page in response.full_text_annotation.pages:
                    if hasattr(page, "confidence") and page.confidence:
                        print(f"[CLOUD VISION] Page {idx + 1} confidence: {page.confidence:.2f}")

        return full_text.strip()
    except Exception as e:
        print(f"[CLOUD VISION] OCR failed: {type(e).__name__}: {e}")
        return ""
