"""
Tesseract OCR engine wrapper.

Extracts:
  - raw text
  - words + bounding boxes (normalised 0-1000)
  - paragraphs
  - page-level confidence
  - structured table regions
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import pytesseract
import numpy as np
from PIL import Image
from loguru import logger
from app.config import get_settings

settings = get_settings()

if settings.TESSERACT_CMD:
    pytesseract.pytesseract.tesseract_cmd = settings.TESSERACT_CMD

# Tesseract page segmentation modes
PSM_AUTO = 3          # Fully automatic
PSM_SINGLE_BLOCK = 6  # Assume a single uniform block of text
PSM_SPARSE_TEXT = 11  # Find as much text as possible (sparse)


def _normalize_bbox(x: int, y: int, w: int, h: int, img_w: int, img_h: int) -> list[int]:
    """Normalise bounding box to 0-1000 range (LayoutLMv3 expectation)."""
    x0 = int(1000 * x / img_w)
    y0 = int(1000 * y / img_h)
    x1 = int(1000 * (x + w) / img_w)
    y1 = int(1000 * (y + h) / img_h)
    return [
        max(0, min(1000, x0)),
        max(0, min(1000, y0)),
        max(0, min(1000, x1)),
        max(0, min(1000, y1)),
    ]


def extract_words_with_boxes(
    pil_image: Image.Image,
    psm: int = PSM_AUTO,
) -> dict[str, Any]:
    """
    Run Tesseract and return structured word-level data.

    Returns:
        {
          "words": ["word", ...],
          "boxes": [[x0,y0,x1,y1], ...],   # normalised 0-1000
          "confidences": [float, ...],
          "raw_text": "...",
          "page_confidence": float,
          "paragraphs": ["paragraph text", ...],
        }
    """
    img_w, img_h = pil_image.size

    # Full data with bounding boxes
    config = f"--psm {psm} --oem 3"
    data = pytesseract.image_to_data(
        pil_image,
        config=config,
        output_type=pytesseract.Output.DICT,
    )

    words: list[str] = []
    boxes: list[list[int]] = []
    confidences: list[float] = []

    for i, word in enumerate(data["text"]):
        word = word.strip()
        conf = float(data["conf"][i])
        if word and conf > 0:
            x = data["left"][i]
            y = data["top"][i]
            w = data["width"][i]
            h = data["height"][i]
            norm_box = _normalize_bbox(x, y, w, h, img_w, img_h)
            words.append(word)
            boxes.append(norm_box)
            confidences.append(conf / 100.0)

    raw_text = pytesseract.image_to_string(pil_image, config=config)

    # Paragraph-level extraction
    para_data = pytesseract.image_to_string(pil_image, config=f"--psm {PSM_SINGLE_BLOCK} --oem 3")
    paragraphs = [p.strip() for p in re.split(r"\n{2,}", para_data) if p.strip()]

    # Page confidence
    page_conf_values = [c for c in confidences if c > 0]
    page_confidence = float(np.mean(page_conf_values)) if page_conf_values else 0.0

    return {
        "words": words,
        "boxes": boxes,
        "confidences": confidences,
        "raw_text": raw_text.strip(),
        "page_confidence": page_confidence,
        "paragraphs": paragraphs,
    }


def extract_tables(pil_image: Image.Image) -> list[list[list[str]]]:
    """
    Heuristic table extraction from OCR data.

    Groups words into rows by Y-coordinate proximity, then into columns.
    Returns list of tables, where each table is list of rows, each row is list of cells.
    """
    img_w, img_h = pil_image.size
    config = "--psm 6 --oem 3"
    data = pytesseract.image_to_data(
        pil_image, config=config, output_type=pytesseract.Output.DICT
    )

    # Collect all word positions
    cells: list[dict] = []
    for i, word in enumerate(data["text"]):
        word = word.strip()
        conf = float(data["conf"][i])
        if word and conf > 20:
            cells.append({
                "text": word,
                "x": data["left"][i],
                "y": data["top"][i],
                "w": data["width"][i],
                "h": data["height"][i],
                "conf": conf,
            })

    if not cells:
        return []

    # Group by row (Y proximity within 10px)
    cells.sort(key=lambda c: (c["y"], c["x"]))
    rows: list[list[dict]] = []
    current_row: list[dict] = [cells[0]]
    for cell in cells[1:]:
        if abs(cell["y"] - current_row[0]["y"]) < 15:
            current_row.append(cell)
        else:
            rows.append(sorted(current_row, key=lambda c: c["x"]))
            current_row = [cell]
    rows.append(sorted(current_row, key=lambda c: c["x"]))

    # Convert to table format
    table = [[c["text"] for c in row] for row in rows if len(row) > 1]
    return [table] if table else []


def process_pdf_pages(pdf_path: str | Path) -> list[dict[str, Any]]:
    """
    Process each page of a PDF through OCR.

    Returns list of per-page OCR results.
    """
    try:
        from pdf2image import convert_from_path
    except ImportError:
        logger.error("pdf2image not installed — install poppler and pdf2image")
        return []

    logger.info(f"Processing PDF: {pdf_path}")
    pages = convert_from_path(str(pdf_path), dpi=300)
    results = []
    for page_num, pil_page in enumerate(pages, start=1):
        logger.debug(f"OCR page {page_num}/{len(pages)}")
        result = extract_words_with_boxes(pil_page)
        result["page_number"] = page_num
        results.append(result)
    return results


def run_ocr(
    pil_image: Image.Image,
    enhanced: bool = True,
) -> dict[str, Any]:
    """
    Primary OCR entry point.

    Runs both auto and sparse-text modes, merges results.
    """
    logger.debug("Running Tesseract OCR")

    result_auto = extract_words_with_boxes(pil_image, psm=PSM_AUTO)
    result_sparse = extract_words_with_boxes(pil_image, psm=PSM_SPARSE_TEXT)

    # Use the result with more words
    if len(result_sparse["words"]) > len(result_auto["words"]):
        primary = result_sparse
    else:
        primary = result_auto

    tables = extract_tables(pil_image)
    primary["tables"] = tables

    logger.info(
        f"OCR complete: {len(primary['words'])} words, "
        f"confidence={primary['page_confidence']:.2%}"
    )
    return primary
