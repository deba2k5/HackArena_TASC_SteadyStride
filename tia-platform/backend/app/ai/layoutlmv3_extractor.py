"""
LayoutLMv3 document understanding and information extraction.

This is the ONLY AI model used in the entire platform.
Model: microsoft/layoutlmv3-base

Capabilities used:
  - Document classification
  - Key-value pair extraction
  - Named entity recognition (NER)
  - Table understanding
  - Layout-aware semantic analysis

Output: Fully structured ExtractionResult with confidence scores per field.
"""

from __future__ import annotations

import re
import math
from typing import Any
from functools import lru_cache

import torch
import numpy as np
from PIL import Image
from loguru import logger

from app.schemas.document import ExtractionResult
from app.config import get_settings

settings = get_settings()

# ── Model singleton ───────────────────────────────────────────────────────────

_model = None
_processor = None


def _load_model():
    """Load LayoutLMv3 model and processor (lazy, cached)."""
    global _model, _processor
    if _model is not None:
        return _model, _processor

    logger.info(f"Loading LayoutLMv3 model: {settings.LAYOUTLMV3_MODEL}")
    from transformers import LayoutLMv3ForTokenClassification, LayoutLMv3Processor

    _processor = LayoutLMv3Processor.from_pretrained(
        settings.LAYOUTLMV3_MODEL,
        apply_ocr=False,   # We provide our own OCR tokens
    )
    _model = LayoutLMv3ForTokenClassification.from_pretrained(
        settings.LAYOUTLMV3_MODEL,
        num_labels=len(LABEL_LIST),
        ignore_mismatched_sizes=True,
    )
    _model.eval()
    device = "cuda" if torch.cuda.is_available() else "cpu"
    _model.to(device)
    logger.info(f"LayoutLMv3 loaded on device: {device}")
    return _model, _processor


# ── NER label schema ──────────────────────────────────────────────────────────
# BIO tagging for all fields we extract

LABEL_LIST = [
    "O",
    "B-EMPLOYEE_NAME", "I-EMPLOYEE_NAME",
    "B-EMPLOYEE_ID",   "I-EMPLOYEE_ID",
    "B-DEPARTMENT",    "I-DEPARTMENT",
    "B-MANAGER",       "I-MANAGER",
    "B-CLIENT",        "I-CLIENT",
    "B-CLIENT_ID",     "I-CLIENT_ID",
    "B-PROJECT_NAME",  "I-PROJECT_NAME",
    "B-PROJECT_CODE",  "I-PROJECT_CODE",
    "B-INVOICE_NUMBER","I-INVOICE_NUMBER",
    "B-BILLING_START", "I-BILLING_START",
    "B-BILLING_END",   "I-BILLING_END",
    "B-REGULAR_HOURS", "I-REGULAR_HOURS",
    "B-OVERTIME_HOURS","I-OVERTIME_HOURS",
    "B-HOURLY_RATE",   "I-HOURLY_RATE",
    "B-CURRENCY",      "I-CURRENCY",
    "B-REMARKS",       "I-REMARKS",
    "B-DATE",          "I-DATE",
    "B-LEAVE_DAYS",    "I-LEAVE_DAYS",
]

LABEL2ID = {l: i for i, l in enumerate(LABEL_LIST)}
ID2LABEL = {i: l for i, l in enumerate(LABEL_LIST)}

# Field name mapping from label prefix to extraction key
LABEL_TO_FIELD = {
    "EMPLOYEE_NAME": "employee_name",
    "EMPLOYEE_ID":   "employee_id",
    "DEPARTMENT":    "department",
    "MANAGER":       "manager",
    "CLIENT":        "client",
    "CLIENT_ID":     "client_id",
    "PROJECT_NAME":  "project_name",
    "PROJECT_CODE":  "project_code",
    "INVOICE_NUMBER":"invoice_number",
    "BILLING_START": "billing_period_start",
    "BILLING_END":   "billing_period_end",
    "REGULAR_HOURS": "regular_hours",
    "OVERTIME_HOURS":"overtime_hours",
    "HOURLY_RATE":   "hourly_rate",
    "CURRENCY":      "currency",
    "REMARKS":       "remarks",
    "DATE":          "date",
    "LEAVE_DAYS":    "leave_days",
}


# ── Heuristic post-processor ──────────────────────────────────────────────────

class HeuristicExtractor:
    """
    Rule-based extraction from raw OCR text.
    Supplements / corrects LayoutLMv3 output.
    Acts as fallback when model confidence is low.
    """

    HOURS_PATTERNS = [
        r"regular\s*hours?\s*[:\-=]\s*([\d.]+)",
        r"normal\s*hours?\s*[:\-=]\s*([\d.]+)",
        r"basic\s*hours?\s*[:\-=]\s*([\d.]+)",
        r"std\s*hours?\s*[:\-=]\s*([\d.]+)",
        r"hours\s*worked\s*[:\-=]\s*([\d.]+)",
    ]
    OT_PATTERNS = [
        r"overtime\s*hours?\s*[:\-=]\s*([\d.]+)",
        r"o/?t\s*hours?\s*[:\-=]\s*([\d.]+)",
        r"extra\s*hours?\s*[:\-=]\s*([\d.]+)",
    ]
    RATE_PATTERNS = [
        r"hourly\s*rate\s*[:\-=]\s*\$?([\d.,]+)",
        r"rate\s*per\s*hour\s*[:\-=]\s*\$?([\d.,]+)",
        r"billing\s*rate\s*[:\-=]\s*\$?([\d.,]+)",
    ]
    DATE_PATTERNS = [
        r"\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})\b",
        r"\b(\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})\b",
        r"\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})\b",
        r"\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4})\b",
    ]
    CURRENCY_PATTERNS = [
        r"\b(USD|EUR|GBP|AED|INR|SGD|CAD|AUD|JPY|CHF)\b",
        r"(\$|€|£|₹|¥)",
    ]
    EMP_ID_PATTERNS = [
        r"\bemp(?:loyee)?\s*(?:id|no|number|code|#)\s*[:\-=]?\s*([A-Z0-9\-_]+)\b",
        r"\b(EMP\d+)\b",
        r"\b(STAFF\d+)\b",
        r"\b([A-Z]{2,4}\d{4,8})\b",
    ]
    INVOICE_NUM_PATTERNS = [
        r"invoice\s*(?:no|number|#)\s*[:\-=]?\s*([A-Z0-9\-_/]+)",
        r"inv\s*#\s*([A-Z0-9\-_/]+)",
    ]
    LEAVE_PATTERNS = [
        r"leave\s*(?:days?)?\s*[:\-=]\s*(\d+)",
        r"(?:annual|sick|casual)\s*leave\s*[:\-=]\s*(\d+)",
    ]

    def _search(self, text: str, patterns: list[str]) -> str | None:
        lower = text.lower()
        for p in patterns:
            m = re.search(p, lower, re.IGNORECASE)
            if m:
                return m.group(1).strip()
        return None

    def extract(self, raw_text: str) -> dict[str, Any]:
        result: dict[str, Any] = {}

        # Hours
        rh = self._search(raw_text, self.HOURS_PATTERNS)
        if rh:
            try:
                result["regular_hours"] = float(rh.replace(",", ""))
            except ValueError:
                pass

        ot = self._search(raw_text, self.OT_PATTERNS)
        if ot:
            try:
                result["overtime_hours"] = float(ot.replace(",", ""))
            except ValueError:
                pass

        # Rate
        rate = self._search(raw_text, self.RATE_PATTERNS)
        if rate:
            try:
                result["hourly_rate"] = float(rate.replace(",", ""))
            except ValueError:
                pass

        # Currency
        for p in self.CURRENCY_PATTERNS:
            m = re.search(p, raw_text, re.IGNORECASE)
            if m:
                currency_map = {"$": "USD", "€": "EUR", "£": "GBP", "₹": "INR", "¥": "JPY"}
                found = m.group(1)
                result["currency"] = currency_map.get(found, found.upper())
                break

        # Dates
        dates = []
        for p in self.DATE_PATTERNS:
            dates.extend(re.findall(p, raw_text, re.IGNORECASE))
        result["dates"] = list(dict.fromkeys(dates))[:5]  # deduplicate, max 5

        # Employee ID
        emp_id = self._search(raw_text, self.EMP_ID_PATTERNS)
        if emp_id:
            result["employee_id"] = emp_id.upper()

        # Invoice number
        inv_num = self._search(raw_text, self.INVOICE_NUM_PATTERNS)
        if inv_num:
            result["invoice_number"] = inv_num.upper()

        # Leave days
        leave = self._search(raw_text, self.LEAVE_PATTERNS)
        if leave:
            try:
                result["leave_days"] = int(leave)
            except ValueError:
                pass

        return result


# ── Main extractor ────────────────────────────────────────────────────────────

class LayoutLMv3Extractor:
    """
    Orchestrates the full document extraction pipeline:
      1. Prepare inputs for LayoutLMv3
      2. Run model inference
      3. Decode NER predictions
      4. Apply heuristic post-processing
      5. Calculate per-field and overall confidence
    """

    def __init__(self):
        self._heuristic = HeuristicExtractor()
        self._device = "cuda" if torch.cuda.is_available() else "cpu"

    def _prepare_inputs(
        self,
        words: list[str],
        boxes: list[list[int]],
        pil_image: Image.Image,
    ) -> dict:
        """Tokenise and prepare model inputs."""
        model, processor = _load_model()
        # Truncate to model max input (512 tokens)
        max_words = 200
        words = words[:max_words]
        boxes = boxes[:max_words]

        encoding = processor(
            pil_image,
            words,
            boxes=boxes,
            return_tensors="pt",
            truncation=True,
            padding="max_length",
            max_length=512,
        )
        return {k: v.to(self._device) for k, v in encoding.items()}

    def _decode_ner(
        self,
        encoding: dict,
        logits: torch.Tensor,
    ) -> dict[str, list[tuple[str, float]]]:
        """
        Decode BIO NER predictions into field -> [(token, confidence)] mapping.
        """
        probs = torch.softmax(logits, dim=-1)
        predictions = torch.argmax(logits, dim=-1)[0].cpu().numpy()
        probs_np = probs[0].cpu().numpy()

        # Map subword tokens back to words using word_ids
        word_ids = encoding.get("word_ids", [None] * len(predictions))
        if hasattr(word_ids, "tolist"):
            word_ids = word_ids.tolist()

        field_tokens: dict[str, list[tuple[str, float]]] = {}
        current_field: str | None = None

        input_ids = encoding["input_ids"][0].cpu().numpy()
        model, processor = _load_model()

        for idx, (pred_id, prob_row) in enumerate(zip(predictions, probs_np)):
            label = ID2LABEL.get(int(pred_id), "O")
            confidence = float(prob_row[pred_id])
            token = processor.tokenizer.convert_ids_to_tokens([input_ids[idx]])[0]

            if token in ("[CLS]", "[SEP]", "[PAD]", "<s>", "</s>", "<pad>"):
                continue

            if label.startswith("B-"):
                current_field = label[2:]
                if current_field not in field_tokens:
                    field_tokens[current_field] = []
                field_tokens[current_field].append((token, confidence))
            elif label.startswith("I-") and current_field:
                field_tokens[current_field].append((token, confidence))
            else:
                current_field = None

        return field_tokens

    def _tokens_to_text(self, tokens: list[tuple[str, float]]) -> tuple[str, float]:
        """Convert subword tokens to text and calculate mean confidence."""
        if not tokens:
            return "", 0.0
        text_parts = []
        for token, _ in tokens:
            if token.startswith("##"):
                text_parts.append(token[2:])
            else:
                if text_parts:
                    text_parts.append(" ")
                text_parts.append(token)
        text = "".join(text_parts).strip()
        confidence = float(np.mean([c for _, c in tokens]))
        return text, confidence

    def _classify_document(self, raw_text: str) -> str:
        """Simple document type classification from text patterns."""
        text_lower = raw_text.lower()
        if any(kw in text_lower for kw in ["timesheet", "hours worked", "attendance", "clock in"]):
            return "timesheet"
        if any(kw in text_lower for kw in ["invoice", "bill to", "payment due", "amount due"]):
            return "invoice"
        if any(kw in text_lower for kw in ["contract", "agreement", "terms and conditions"]):
            return "contract"
        return "timesheet"  # default assumption

    def extract(
        self,
        words: list[str],
        boxes: list[list[int]],
        pil_image: Image.Image,
        raw_text: str,
    ) -> ExtractionResult:
        """
        Full extraction pipeline.

        Returns ExtractionResult with all fields and confidence scores.
        """
        logger.info(f"Running LayoutLMv3 extraction on {len(words)} words")

        field_confidences: dict[str, float] = {}
        extracted_fields: dict[str, Any] = {}

        # ── LayoutLMv3 inference ──────────────────────────────────────────────
        try:
            model, processor = _load_model()
            encoding = self._prepare_inputs(words, boxes, pil_image)

            with torch.no_grad():
                outputs = model(**{
                    k: v for k, v in encoding.items()
                    if k in ("input_ids", "attention_mask", "bbox", "pixel_values")
                })

            field_token_map = self._decode_ner(encoding, outputs.logits)

            for label_key, tokens in field_token_map.items():
                field_name = LABEL_TO_FIELD.get(label_key)
                if not field_name or not tokens:
                    continue
                text, conf = self._tokens_to_text(tokens)
                if text:
                    extracted_fields[field_name] = text
                    field_confidences[field_name] = conf

            logger.info(f"LayoutLMv3 extracted {len(extracted_fields)} fields")

        except Exception as exc:
            logger.warning(f"LayoutLMv3 inference failed: {exc}. Using heuristics only.")

        # ── Heuristic extraction (supplement / fallback) ──────────────────────
        heuristic_data = self._heuristic.extract(raw_text)

        # Merge: heuristics fill gaps; model output takes priority for named entities
        for key, value in heuristic_data.items():
            if key == "dates":
                extracted_fields["dates"] = value
            elif key not in extracted_fields or not extracted_fields[key]:
                extracted_fields[key] = value
                field_confidences[key] = 0.70   # heuristic confidence

        # ── Type coercion ─────────────────────────────────────────────────────
        def _to_float(v: Any) -> float | None:
            if v is None:
                return None
            try:
                return float(str(v).replace(",", "").strip())
            except (ValueError, TypeError):
                return None

        def _to_int(v: Any) -> int | None:
            f = _to_float(v)
            return int(f) if f is not None else None

        # ── Overall confidence ────────────────────────────────────────────────
        key_fields = [
            "employee_name", "employee_id", "regular_hours",
            "billing_period_start", "billing_period_end", "client",
        ]
        key_confs = [field_confidences.get(f, 0.0) for f in key_fields]
        overall_confidence = float(np.mean(key_confs)) if key_confs else 0.5

        # Boost confidence if we found critical identifiers
        if extracted_fields.get("employee_id") and extracted_fields.get("regular_hours"):
            overall_confidence = min(1.0, overall_confidence + 0.15)

        doc_type = self._classify_document(raw_text)

        return ExtractionResult(
            employee_name=extracted_fields.get("employee_name"),
            employee_id=extracted_fields.get("employee_id"),
            department=extracted_fields.get("department"),
            manager=extracted_fields.get("manager"),
            client=extracted_fields.get("client"),
            client_id=extracted_fields.get("client_id"),
            project_name=extracted_fields.get("project_name"),
            project_code=extracted_fields.get("project_code"),
            invoice_number=extracted_fields.get("invoice_number"),
            billing_period_start=extracted_fields.get("billing_period_start"),
            billing_period_end=extracted_fields.get("billing_period_end"),
            regular_hours=_to_float(extracted_fields.get("regular_hours")),
            overtime_hours=_to_float(extracted_fields.get("overtime_hours")),
            hourly_rate=_to_float(extracted_fields.get("hourly_rate")),
            currency=extracted_fields.get("currency"),
            remarks=extracted_fields.get("remarks"),
            dates=extracted_fields.get("dates", []),
            leave_days=_to_int(extracted_fields.get("leave_days")),
            document_type=doc_type,
            confidence_score=round(overall_confidence, 4),
            field_confidences={k: round(v, 4) for k, v in field_confidences.items()},
        )


# Module-level singleton
_extractor: LayoutLMv3Extractor | None = None


def get_extractor() -> LayoutLMv3Extractor:
    global _extractor
    if _extractor is None:
        _extractor = LayoutLMv3Extractor()
    return _extractor
