"""
Google Cloud Vision OCR service with image preprocessing and language hints.
"""

from io import BytesIO
from google.cloud import vision as cloud_vision
from PIL import Image, ImageEnhance, ImageFilter, ImageStat


def _preprocess_image(img: Image.Image) -> Image.Image:
    """Enhance image quality before OCR: contrast, sharpness, noise reduction.

    Applies adaptive preprocessing based on image characteristics:
    - Low contrast images get contrast boost
    - Noisy images get denoising via median filter
    - All images get a mild sharpness enhancement
    """
    try:
        # Convert to RGB if needed (e.g. RGBA, P mode)
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")

        # Detect image stats using PIL (no numpy dependency)
        grayscale = img.convert("L")
        stat = ImageStat.Stat(grayscale)
        mean_val = stat.mean[0]
        std_dev = stat.stddev[0]

        # Low contrast: std dev < 40 (on 0-255 scale)
        if std_dev < 40:
            contrast_factor = min(2.0, 60 / max(std_dev, 1))
            img = ImageEnhance.Contrast(img).enhance(contrast_factor)
            print(f"[OCR PREPROCESS] Low contrast detected (std={std_dev:.0f}), boosted by {contrast_factor:.1f}x")

        # Dark image: boost brightness
        if mean_val < 100:
            brightness_factor = min(1.8, 140 / max(mean_val, 1))
            img = ImageEnhance.Brightness(img).enhance(brightness_factor)
            print(f"[OCR PREPROCESS] Dark image (mean={mean_val:.0f}), brightness boosted by {brightness_factor:.1f}x")

        # Noise reduction via median filter (removes salt-and-pepper noise without blurring text)
        # Only apply if image appears noisy (high frequency content relative to signal)
        if std_dev > 10:  # Skip near-blank images
            img = img.filter(ImageFilter.MedianFilter(size=3))

        # Mild sharpness enhancement to make text edges crisper
        img = ImageEnhance.Sharpness(img).enhance(1.5)

        return img
    except Exception as e:
        print(f"[OCR PREPROCESS] Preprocessing failed ({type(e).__name__}: {e}), using original image")
        return img


def extract_text_cloud_vision(images: list, preprocess: bool = True) -> str:
    """Use Google Cloud Vision API for high-accuracy OCR on page images.

    Args:
        images: List of PIL Image objects (one per page).
        preprocess: If True, apply image preprocessing for better OCR accuracy.

    Features:
        - Image preprocessing (contrast, sharpness, denoising) for scanned/low-quality docs
        - Language hints for Hindi + English (common in Indian lease documents)
        - DOCUMENT_TEXT_DETECTION for better accuracy on forms, tables, and structured docs
    """
    try:
        client = cloud_vision.ImageAnnotatorClient()
        full_text = ""

        # Language hints: English + Hindi for Indian commercial documents
        image_context = cloud_vision.ImageContext(
            language_hints=["en", "hi"],
        )

        for idx, img in enumerate(images):
            # Preprocess image for better OCR
            if preprocess:
                img = _preprocess_image(img)

            buf = BytesIO()
            img.save(buf, format="PNG")
            image = cloud_vision.Image(content=buf.getvalue())

            # Use DOCUMENT_TEXT_DETECTION (better for forms/tables/structured documents)
            # This is the same as document_text_detection() but we pass image_context for language hints
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

                # Log per-page confidence if available
                for page in response.full_text_annotation.pages:
                    if hasattr(page, "confidence") and page.confidence:
                        print(f"[CLOUD VISION] Page {idx + 1} confidence: {page.confidence:.2f}")

        return full_text.strip()
    except Exception as e:
        print(f"[CLOUD VISION] OCR failed: {type(e).__name__}: {e}")
        return ""
