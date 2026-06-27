"""Timesheet, Document, ExtractedField models."""

import enum
from sqlalchemy import Boolean, Enum, ForeignKey, Numeric, String, Text, JSON, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class DocumentType(str, enum.Enum):
    TIMESHEET = "timesheet"
    INVOICE = "invoice"
    CONTRACT = "contract"
    RECEIPT = "receipt"
    OTHER = "other"


class ProcessingStatus(str, enum.Enum):
    PENDING = "pending"
    PREPROCESSING = "preprocessing"
    OCR_PROCESSING = "ocr_processing"
    AI_PROCESSING = "ai_processing"
    VALIDATION = "validation"
    FRAUD_CHECK = "fraud_check"
    REVIEW_REQUIRED = "review_required"
    APPROVED = "approved"
    REJECTED = "rejected"
    INVOICE_GENERATED = "invoice_generated"
    FAILED = "failed"


class Document(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "documents"

    original_filename: Mapped[str] = mapped_column(String(500), nullable=False)
    stored_filename: Mapped[str] = mapped_column(String(500), nullable=False)
    file_path: Mapped[str] = mapped_column(String(1000), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=True)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=True)
    document_type: Mapped[DocumentType] = mapped_column(Enum(DocumentType), default=DocumentType.TIMESHEET)
    uploaded_by_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    checksum: Mapped[str] = mapped_column(String(64), nullable=True)

    timesheet: Mapped["Timesheet"] = relationship("Timesheet", back_populates="document", uselist=False)


class Timesheet(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "timesheets"

    document_id: Mapped[str] = mapped_column(String(36), ForeignKey("documents.id"), nullable=False)
    employee_id: Mapped[str] = mapped_column(String(36), ForeignKey("employees.id"), nullable=True)
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=True)
    client_id: Mapped[str] = mapped_column(String(36), ForeignKey("clients.id"), nullable=True)

    # Processing state
    status: Mapped[ProcessingStatus] = mapped_column(Enum(ProcessingStatus), default=ProcessingStatus.PENDING)

    # OCR results
    raw_ocr_text: Mapped[str] = mapped_column(Text, nullable=True)
    ocr_words: Mapped[dict] = mapped_column(JSON, nullable=True)        # words + bboxes
    ocr_confidence: Mapped[float] = mapped_column(Numeric(5, 4), nullable=True)

    # LayoutLMv3 extraction results
    extracted_data: Mapped[dict] = mapped_column(JSON, nullable=True)   # full extraction payload
    extraction_confidence: Mapped[float] = mapped_column(Numeric(5, 4), nullable=True)
    ai_model_version: Mapped[str] = mapped_column(String(100), nullable=True)

    # Resolved fields (after identity resolution)
    employee_name: Mapped[str] = mapped_column(String(255), nullable=True)
    employee_code: Mapped[str] = mapped_column(String(50), nullable=True)
    project_name: Mapped[str] = mapped_column(String(300), nullable=True)
    project_code: Mapped[str] = mapped_column(String(50), nullable=True)
    client_name: Mapped[str] = mapped_column(String(300), nullable=True)
    billing_period_start: Mapped[str] = mapped_column(String(20), nullable=True)
    billing_period_end: Mapped[str] = mapped_column(String(20), nullable=True)
    regular_hours: Mapped[float] = mapped_column(Numeric(8, 2), nullable=True)
    overtime_hours: Mapped[float] = mapped_column(Numeric(8, 2), nullable=True)
    total_hours: Mapped[float] = mapped_column(Numeric(8, 2), nullable=True)
    hourly_rate: Mapped[float] = mapped_column(Numeric(12, 4), nullable=True)
    overtime_rate: Mapped[float] = mapped_column(Numeric(12, 4), nullable=True)
    currency: Mapped[str] = mapped_column(String(10), nullable=True)
    remarks: Mapped[str] = mapped_column(Text, nullable=True)

    # Validation
    validation_errors: Mapped[dict] = mapped_column(JSON, nullable=True)
    validation_warnings: Mapped[dict] = mapped_column(JSON, nullable=True)
    is_valid: Mapped[bool] = mapped_column(Boolean, nullable=True)

    # Fraud detection
    fraud_risk_score: Mapped[float] = mapped_column(Numeric(5, 4), nullable=True)
    fraud_risk_level: Mapped[str] = mapped_column(String(20), nullable=True)
    fraud_flags: Mapped[dict] = mapped_column(JSON, nullable=True)

    # Review
    reviewed_by_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    review_comment: Mapped[str] = mapped_column(Text, nullable=True)
    reviewed_at: Mapped[str] = mapped_column(String(50), nullable=True)

    # Invoice link
    invoice_id: Mapped[str] = mapped_column(String(36), ForeignKey("invoices.id"), nullable=True)

    document: Mapped[Document] = relationship("Document", back_populates="timesheet")
    employee: Mapped["Employee"] = relationship("Employee", back_populates="timesheets")  # type: ignore[name-defined]
    project: Mapped["Project"] = relationship("Project", back_populates="timesheets")  # type: ignore[name-defined]
    client: Mapped["Client"] = relationship("Client")  # type: ignore[name-defined]
    invoice: Mapped["Invoice"] = relationship("Invoice", back_populates="timesheets", foreign_keys=[invoice_id])  # type: ignore[name-defined]
    review_logs: Mapped[list["ReviewLog"]] = relationship("ReviewLog", back_populates="timesheet")  # type: ignore[name-defined]
