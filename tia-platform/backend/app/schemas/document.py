"""Document / Timesheet / Processing schemas."""

from pydantic import BaseModel
from datetime import datetime
from app.models.document import ProcessingStatus, DocumentType


class DocumentOut(BaseModel):
    id: str
    original_filename: str
    file_size: int | None
    mime_type: str | None
    document_type: DocumentType
    created_at: datetime
    model_config = {"from_attributes": True}


class ExtractionResult(BaseModel):
    """Structured output from LayoutLMv3 extraction."""
    employee_name: str | None = None
    employee_id: str | None = None
    department: str | None = None
    manager: str | None = None
    client: str | None = None
    client_id: str | None = None
    project_name: str | None = None
    project_code: str | None = None
    invoice_number: str | None = None
    billing_period_start: str | None = None
    billing_period_end: str | None = None
    regular_hours: float | None = None
    overtime_hours: float | None = None
    hourly_rate: float | None = None
    currency: str | None = None
    remarks: str | None = None
    dates: list[str] = []
    leave_days: int | None = None
    document_type: str | None = None
    confidence_score: float = 0.0
    field_confidences: dict[str, float] = {}


class TimesheetOut(BaseModel):
    id: str
    document_id: str
    status: ProcessingStatus
    employee_name: str | None
    employee_code: str | None
    project_name: str | None
    project_code: str | None
    client_name: str | None
    billing_period_start: str | None
    billing_period_end: str | None
    regular_hours: float | None
    overtime_hours: float | None
    total_hours: float | None
    hourly_rate: float | None
    overtime_rate: float | None
    currency: str | None
    remarks: str | None
    extraction_confidence: float | None
    ocr_confidence: float | None
    is_valid: bool | None
    validation_errors: dict | None
    validation_warnings: dict | None
    fraud_risk_score: float | None
    fraud_risk_level: str | None
    fraud_flags: dict | None
    extracted_data: dict | None
    review_comment: str | None
    reviewed_at: str | None
    invoice_id: str | None
    created_at: datetime
    document: DocumentOut | None = None
    model_config = {"from_attributes": True}


class TimesheetReviewRequest(BaseModel):
    action: str  # approved | rejected | modified
    comment: str | None = None
    modified_fields: dict | None = None


class ProcessingStatusUpdate(BaseModel):
    status: ProcessingStatus
    notes: str | None = None
