"""
Document processing orchestrator.

Pipeline:
  File → preprocessor → OCR → LayoutLMv3 → ExtractionResult

Supports: PDF, JPEG, PNG, TIFF, Excel, CSV, Word
"""

from __future__ import annotations

import io
import json
from pathlib import Path
from typing import Any

from PIL import Image
from loguru import logger

from app.ai.preprocessor import preprocess_image, preprocess_to_binary
from app.ai.ocr_engine import run_ocr, process_pdf_pages
from app.ai.layoutlmv3_extractor import get_extractor
from app.schemas.document import ExtractionResult


SUPPORTED_IMAGE_TYPES = {".jpg", ".jpeg", ".png", ".tiff", ".tif", ".bmp", ".webp"}
SUPPORTED_PDF_TYPES = {".pdf"}
SUPPORTED_EXCEL_TYPES = {".xlsx", ".xls"}
SUPPORTED_CSV_TYPES = {".csv"}
SUPPORTED_WORD_TYPES = {".docx", ".doc"}


def _process_excel(file_path: Path) -> dict[str, Any]:
    """Extract structured data from Excel timesheets."""
    import pandas as pd

    logger.info(f"Processing Excel file: {file_path.name}")
    xl = pd.ExcelFile(str(file_path))
    all_text_parts = []
    tables = []

    for sheet_name in xl.sheet_names:
        df = xl.parse(sheet_name)
        df = df.dropna(how="all")
        table_rows = [df.columns.tolist()] + df.fillna("").values.tolist()
        tables.append([[str(c) for c in row] for row in table_rows])
        all_text_parts.append(f"Sheet: {sheet_name}\n{df.to_string(index=False)}")

    raw_text = "\n\n".join(all_text_parts)
    return {
        "raw_text": raw_text,
        "words": raw_text.split(),
        "boxes": [[0, 0, 100, 20]] * len(raw_text.split()),
        "page_confidence": 0.95,
        "paragraphs": [raw_text],
        "tables": tables,
    }


def _process_csv(file_path: Path) -> dict[str, Any]:
    """Extract data from CSV."""
    import pandas as pd

    logger.info(f"Processing CSV file: {file_path.name}")
    df = pd.read_csv(str(file_path))
    raw_text = df.to_string(index=False)
    table = [df.columns.tolist()] + df.fillna("").values.tolist()
    table_str = [[str(c) for c in row] for row in table]
    words = raw_text.split()
    return {
        "raw_text": raw_text,
        "words": words,
        "boxes": [[0, 0, 100, 20]] * len(words),
        "page_confidence": 0.95,
        "paragraphs": [raw_text],
        "tables": [table_str],
    }


def _process_word(file_path: Path) -> dict[str, Any]:
    """Extract text from Word documents."""
    try:
        from docx import Document
        doc = Document(str(file_path))
        raw_text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
        words = raw_text.split()
        return {
            "raw_text": raw_text,
            "words": words,
            "boxes": [[0, 0, 100, 20]] * len(words),
            "page_confidence": 0.90,
            "paragraphs": [raw_text],
            "tables": [],
        }
    except Exception as exc:
        logger.error(f"Word processing failed: {exc}")
        return {"raw_text": "", "words": [], "boxes": [], "page_confidence": 0.0, "paragraphs": [], "tables": []}


def process_document(file_path: str | Path) -> tuple[ExtractionResult, dict[str, Any]]:
    """
    Main entry point: process any supported document type.

    Returns:
        (ExtractionResult, ocr_data)
    """
    file_path = Path(file_path)
    suffix = file_path.suffix.lower()
    logger.info(f"Processing document: {file_path.name} ({suffix})")

    ocr_data: dict[str, Any] = {}
    pil_image: Image.Image | None = None

    # ── Route by file type ────────────────────────────────────────────────────

    if suffix in SUPPORTED_EXCEL_TYPES:
        ocr_data = _process_excel(file_path)
        # Create a blank image placeholder for LayoutLMv3 (no image available)
        pil_image = Image.new("RGB", (224, 224), color=(255, 255, 255))

    elif suffix in SUPPORTED_CSV_TYPES:
        ocr_data = _process_csv(file_path)
        pil_image = Image.new("RGB", (224, 224), color=(255, 255, 255))

    elif suffix in SUPPORTED_WORD_TYPES:
        ocr_data = _process_word(file_path)
        pil_image = Image.new("RGB", (224, 224), color=(255, 255, 255))

    elif suffix in SUPPORTED_PDF_TYPES:
        # Process all PDF pages, concatenate results
        page_results = process_pdf_pages(file_path)
        if page_results:
            all_words, all_boxes, all_confs = [], [], []
            all_text_parts = []
            all_tables = []
            for page in page_results:
                all_words.extend(page["words"])
                all_boxes.extend(page["boxes"])
                all_confs.extend(page.get("confidences", []))
                all_text_parts.append(page["raw_text"])
                all_tables.extend(page.get("tables", []))

            ocr_data = {
                "words": all_words,
                "boxes": all_boxes,
                "confidences": all_confs,
                "raw_text": "\n\n".join(all_text_parts),
                "paragraphs": all_text_parts,
                "tables": all_tables,
                "page_confidence": float(sum(p["page_confidence"] for p in page_results) / len(page_results)),
            }
            # Use first page as representative image for LayoutLMv3
            from pdf2image import convert_from_path
            pages = convert_from_path(str(file_path), dpi=150, first_page=1, last_page=1)
            if pages:
                _, pil_image = preprocess_image(pages[0])
            else:
                pil_image = Image.new("RGB", (224, 224), color=(255, 255, 255))
        else:
            ocr_data = {"raw_text": "", "words": [], "boxes": [], "page_confidence": 0.0, "paragraphs": [], "tables": []}
            pil_image = Image.new("RGB", (224, 224), color=(255, 255, 255))

    elif suffix in SUPPORTED_IMAGE_TYPES:
        # Preprocess image → OCR → LayoutLMv3
        _, pil_image = preprocess_image(file_path)
        ocr_data = run_ocr(pil_image)

    else:
        raise ValueError(f"Unsupported file type: {suffix}")

    # ── LayoutLMv3 extraction ─────────────────────────────────────────────────
    extractor = get_extractor()
    result = extractor.extract(
        words=ocr_data.get("words", []),
        boxes=ocr_data.get("boxes", []),
        pil_image=pil_image,
        raw_text=ocr_data.get("raw_text", ""),
    )

    logger.info(
        f"Extraction complete — confidence={result.confidence_score:.2%}, "
        f"fields={len([f for f in result.model_dump().values() if f is not None])}"
    )
    return result, ocr_data


def process_document_bytes(
    file_bytes: bytes,
    original_filename: str,
) -> tuple[ExtractionResult, dict[str, Any]]:
    """
    Process document from bytes (used in API upload handler).
    Writes to a temp file, processes, then returns results.
    """
    import tempfile
    import os

    suffix = Path(original_filename).suffix.lower()
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(file_bytes)
        tmp_path = tmp.name

    try:
        return process_document(tmp_path)
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
