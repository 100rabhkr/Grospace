"""
Google Cloud Vision OCR service.
"""

from io import BytesIO
from google.cloud import vision as cloud_vision


def extract_text_cloud_vision(images: list) -> str:
    """Use Google Cloud Vision API for high-accuracy OCR on page images."""
    try:
        client = cloud_vision.ImageAnnotatorClient()
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
