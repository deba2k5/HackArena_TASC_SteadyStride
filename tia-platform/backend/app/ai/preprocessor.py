"""
Image pre-processing pipeline using OpenCV.

Performs all required transformations before Tesseract OCR:
  deskew, auto-rotate, border removal, noise removal, adaptive thresholding,
  sharpening, contrast enhancement, cropping, resize, perspective correction,
  shadow removal, and quality improvement.
"""

from __future__ import annotations

import io
import math
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from loguru import logger


# ── Helpers ───────────────────────────────────────────────────────────────────

def _to_numpy(source: bytes | str | Path | np.ndarray) -> np.ndarray:
    """Convert various input types to a BGR numpy array."""
    if isinstance(source, np.ndarray):
        return source.copy()
    if isinstance(source, (str, Path)):
        img = cv2.imread(str(source))
        if img is None:
            raise ValueError(f"Cannot read image: {source}")
        return img
    # bytes
    arr = np.frombuffer(source, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Cannot decode image bytes")
    return img


def _to_pil(bgr: np.ndarray) -> Image.Image:
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    return Image.fromarray(rgb)


# ── Individual processing steps ───────────────────────────────────────────────

def remove_shadows(img: np.ndarray) -> np.ndarray:
    """Remove uneven illumination / shadows using morphological operations."""
    channels = cv2.split(img)
    result_channels = []
    for ch in channels:
        dilated = cv2.dilate(ch, np.ones((7, 7), np.uint8))
        blurred = cv2.medianBlur(dilated, 21)
        diff = 255 - cv2.absdiff(ch, blurred)
        normalized = cv2.normalize(diff, None, alpha=0, beta=255,
                                   norm_type=cv2.NORM_MINMAX, dtype=cv2.CV_8UC1)
        result_channels.append(normalized)
    return cv2.merge(result_channels)


def enhance_contrast(img: np.ndarray) -> np.ndarray:
    """CLAHE contrast enhancement on the L channel in LAB colour space."""
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l_ch, a_ch, b_ch = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    l_ch = clahe.apply(l_ch)
    lab = cv2.merge((l_ch, a_ch, b_ch))
    return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)


def remove_noise(img: np.ndarray) -> np.ndarray:
    """Non-local means denoising."""
    return cv2.fastNlMeansDenoisingColored(img, None, h=10, hColor=10,
                                           templateWindowSize=7, searchWindowSize=21)


def sharpen(img: np.ndarray) -> np.ndarray:
    """Unsharp masking."""
    blurred = cv2.GaussianBlur(img, (0, 0), 3)
    return cv2.addWeighted(img, 1.5, blurred, -0.5, 0)


def adaptive_threshold(gray: np.ndarray) -> np.ndarray:
    """Adaptive binarisation suited for uneven lighting."""
    return cv2.adaptiveThreshold(
        gray, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        blockSize=11,
        C=2,
    )


def get_skew_angle(gray: np.ndarray) -> float:
    """Estimate document skew using Hough line transform."""
    edges = cv2.Canny(gray, 50, 150, apertureSize=3)
    lines = cv2.HoughLines(edges, 1, math.pi / 180, threshold=200)
    if lines is None:
        return 0.0
    angles = []
    for line in lines[:30]:
        rho, theta = line[0]
        angle = math.degrees(theta) - 90
        if abs(angle) < 45:
            angles.append(angle)
    if not angles:
        return 0.0
    return float(np.median(angles))


def deskew(img: np.ndarray) -> np.ndarray:
    """Rotate image to correct skew."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    angle = get_skew_angle(gray)
    if abs(angle) < 0.5:
        return img
    h, w = img.shape[:2]
    center = (w // 2, h // 2)
    M = cv2.getRotationMatrix2D(center, angle, 1.0)
    return cv2.warpAffine(img, M, (w, h), flags=cv2.INTER_CUBIC,
                          borderMode=cv2.BORDER_REPLICATE)


def auto_rotate(img: np.ndarray) -> np.ndarray:
    """Detect and correct 90°/180°/270° rotation using text orientation."""
    # Use Tesseract OSD when available; fall back to no rotation
    try:
        import pytesseract
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        osd = pytesseract.image_to_osd(gray, output_type=pytesseract.Output.DICT)
        rotate = osd.get("rotate", 0)
        if rotate:
            k = rotate // 90
            img = np.rot90(img, k=k)
    except Exception:
        pass
    return img


def correct_perspective(img: np.ndarray) -> np.ndarray:
    """Four-point perspective transform to flatten document."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 75, 200)
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return img
    largest = max(contours, key=cv2.contourArea)
    peri = cv2.arcLength(largest, True)
    approx = cv2.approxPolyDP(largest, 0.02 * peri, True)
    if len(approx) != 4:
        return img
    pts = approx.reshape(4, 2).astype(np.float32)
    # Order: top-left, top-right, bottom-right, bottom-left
    s = pts.sum(axis=1)
    diff = np.diff(pts, axis=1)
    ordered = np.array([
        pts[np.argmin(s)],
        pts[np.argmin(diff)],
        pts[np.argmax(s)],
        pts[np.argmax(diff)],
    ], dtype=np.float32)
    (tl, tr, br, bl) = ordered
    w = int(max(np.linalg.norm(br - bl), np.linalg.norm(tr - tl)))
    h = int(max(np.linalg.norm(tr - br), np.linalg.norm(tl - bl)))
    if w < 10 or h < 10:
        return img
    dst = np.array([[0, 0], [w - 1, 0], [w - 1, h - 1], [0, h - 1]], dtype=np.float32)
    M = cv2.getPerspectiveTransform(ordered, dst)
    return cv2.warpPerspective(img, M, (w, h))


def remove_borders(img: np.ndarray, border_size: int = 10) -> np.ndarray:
    """Crop image to remove black borders."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(gray, 15, 255, cv2.THRESH_BINARY)
    coords = cv2.findNonZero(thresh)
    if coords is None:
        return img
    x, y, w, h = cv2.boundingRect(coords)
    pad = border_size
    x = max(0, x - pad)
    y = max(0, y - pad)
    w = min(img.shape[1] - x, w + 2 * pad)
    h = min(img.shape[0] - y, h + 2 * pad)
    return img[y:y + h, x:x + w]


def resize_for_ocr(img: np.ndarray, target_dpi: int = 300, min_width: int = 1200) -> np.ndarray:
    """Ensure image is large enough for good OCR results."""
    h, w = img.shape[:2]
    if w < min_width:
        scale = min_width / w
        new_w = int(w * scale)
        new_h = int(h * scale)
        img = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_LANCZOS4)
    return img


# ── Main pipeline ─────────────────────────────────────────────────────────────

def preprocess_image(source: bytes | str | Path | np.ndarray) -> tuple[np.ndarray, Image.Image]:
    """
    Full preprocessing pipeline.

    Returns:
        (preprocessed_bgr, pil_image_for_ocr)
    """
    logger.debug("Starting image preprocessing pipeline")

    img = _to_numpy(source)

    # 1. Shadow removal
    img = remove_shadows(img)
    logger.debug("Shadow removal done")

    # 2. Contrast enhancement
    img = enhance_contrast(img)

    # 3. Noise removal
    img = remove_noise(img)

    # 4. Border removal
    img = remove_borders(img)

    # 5. Perspective correction
    img = correct_perspective(img)

    # 6. Auto rotate (90°/180°/270°)
    img = auto_rotate(img)

    # 7. Deskew (fine angle)
    img = deskew(img)

    # 8. Sharpen
    img = sharpen(img)

    # 9. Resize for OCR
    img = resize_for_ocr(img)

    pil_img = _to_pil(img)
    logger.debug("Image preprocessing complete")
    return img, pil_img


def preprocess_to_binary(source: bytes | str | Path | np.ndarray) -> tuple[np.ndarray, Image.Image]:
    """
    Full pipeline ending in binarised grayscale — best for heavily printed documents.
    """
    bgr, _ = preprocess_image(source)
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    binary = adaptive_threshold(gray)
    pil_img = Image.fromarray(binary)
    return binary, pil_img
