"""Invoice, InvoiceItem, BusinessRule, ValidationLog, FraudLog, AuditLog, ReviewLog, Notification models."""

import enum
from sqlalchemy import Boolean, Enum, ForeignKey, Numeric, String, Text, JSON, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base
from app.models.base import TimestampMixin, UUIDMixin


class InvoiceStatus(str, enum.Enum):
    DRAFT = "draft"
    PENDING_REVIEW = "pending_review"
    APPROVED = "approved"
    REJECTED = "rejected"
    SENT = "sent"
    PAID = "paid"
    OVERDUE = "overdue"
    CANCELLED = "cancelled"


class FraudRiskLevel(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class Invoice(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "invoices"

    invoice_number: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    employee_id: Mapped[str] = mapped_column(String(36), ForeignKey("employees.id"), nullable=True)
    client_id: Mapped[str] = mapped_column(String(36), ForeignKey("clients.id"), nullable=False)
    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=True)
    contract_id: Mapped[str] = mapped_column(String(36), ForeignKey("contracts.id"), nullable=True)

    status: Mapped[InvoiceStatus] = mapped_column(Enum(InvoiceStatus), default=InvoiceStatus.DRAFT)

    # Period
    billing_period_start: Mapped[str] = mapped_column(String(20), nullable=True)
    billing_period_end: Mapped[str] = mapped_column(String(20), nullable=True)
    invoice_date: Mapped[str] = mapped_column(String(20), nullable=True)
    due_date: Mapped[str] = mapped_column(String(20), nullable=True)

    # Amounts
    regular_hours: Mapped[float] = mapped_column(Numeric(8, 2), default=0)
    overtime_hours: Mapped[float] = mapped_column(Numeric(8, 2), default=0)
    hourly_rate: Mapped[float] = mapped_column(Numeric(12, 4), default=0)
    overtime_rate: Mapped[float] = mapped_column(Numeric(12, 4), default=0)
    subtotal: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    gst_rate: Mapped[float] = mapped_column(Numeric(6, 4), default=0)
    gst_amount: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    tax_rate: Mapped[float] = mapped_column(Numeric(6, 4), default=0)
    tax_amount: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    discount: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    total_amount: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    currency: Mapped[str] = mapped_column(String(10), default="USD")

    # PDF
    pdf_path: Mapped[str] = mapped_column(String(1000), nullable=True)
    qr_code_data: Mapped[str] = mapped_column(Text, nullable=True)

    # Metadata
    notes: Mapped[str] = mapped_column(Text, nullable=True)
    payment_terms: Mapped[str] = mapped_column(String(200), nullable=True)
    generated_by_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    sent_at: Mapped[str] = mapped_column(String(50), nullable=True)
    paid_at: Mapped[str] = mapped_column(String(50), nullable=True)

    # Fraud & confidence
    fraud_risk_score: Mapped[float] = mapped_column(Numeric(5, 4), nullable=True)
    fraud_risk_level: Mapped[str] = mapped_column(String(20), nullable=True)
    extraction_confidence: Mapped[float] = mapped_column(Numeric(5, 4), nullable=True)

    # Relationships
    employee: Mapped["Employee"] = relationship("Employee", back_populates="invoices")  # type: ignore[name-defined]
    client: Mapped["Client"] = relationship("Client", back_populates="invoices")  # type: ignore[name-defined]
    project: Mapped["Project"] = relationship("Project", back_populates="invoices")  # type: ignore[name-defined]
    items: Mapped[list["InvoiceItem"]] = relationship("InvoiceItem", back_populates="invoice", cascade="all, delete-orphan")
    timesheets: Mapped[list["Timesheet"]] = relationship("Timesheet", back_populates="invoice", foreign_keys="Timesheet.invoice_id")  # type: ignore[name-defined]
    validation_logs: Mapped[list["ValidationLog"]] = relationship("ValidationLog", back_populates="invoice")
    fraud_logs: Mapped[list["FraudLog"]] = relationship("FraudLog", back_populates="invoice")
    audit_logs: Mapped[list["AuditLog"]] = relationship("AuditLog", back_populates="invoice")


class InvoiceItem(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "invoice_items"

    invoice_id: Mapped[str] = mapped_column(String(36), ForeignKey("invoices.id", ondelete="CASCADE"), nullable=False)
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    quantity: Mapped[float] = mapped_column(Numeric(10, 4), default=1)
    unit_price: Mapped[float] = mapped_column(Numeric(12, 4), default=0)
    amount: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    item_type: Mapped[str] = mapped_column(String(50), default="hours")   # hours, overtime, expense

    invoice: Mapped[Invoice] = relationship("Invoice", back_populates="items")


class BusinessRule(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "business_rules"

    name: Mapped[str] = mapped_column(String(200), nullable=False, unique=True)
    category: Mapped[str] = mapped_column(String(100), nullable=False)    # hours, billing, tax, fraud
    rule_key: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    rule_value: Mapped[str] = mapped_column(Text, nullable=False)         # JSON or scalar
    data_type: Mapped[str] = mapped_column(String(20), default="float")  # float, int, bool, json
    description: Mapped[str] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    client_id: Mapped[str] = mapped_column(String(36), ForeignKey("clients.id"), nullable=True)  # null = global
    severity: Mapped[str] = mapped_column(String(20), default="error")    # error, warning, info


class ValidationLog(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "validation_logs"

    invoice_id: Mapped[str] = mapped_column(String(36), ForeignKey("invoices.id"), nullable=True)
    timesheet_id: Mapped[str] = mapped_column(String(36), ForeignKey("timesheets.id"), nullable=True)
    rule_key: Mapped[str] = mapped_column(String(100), nullable=False)
    rule_name: Mapped[str] = mapped_column(String(200), nullable=True)
    passed: Mapped[bool] = mapped_column(Boolean, nullable=False)
    severity: Mapped[str] = mapped_column(String(20), default="error")
    message: Mapped[str] = mapped_column(Text, nullable=True)
    actual_value: Mapped[str] = mapped_column(String(500), nullable=True)
    expected_value: Mapped[str] = mapped_column(String(500), nullable=True)

    invoice: Mapped[Invoice] = relationship("Invoice", back_populates="validation_logs")


class FraudLog(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "fraud_logs"

    invoice_id: Mapped[str] = mapped_column(String(36), ForeignKey("invoices.id"), nullable=True)
    timesheet_id: Mapped[str] = mapped_column(String(36), ForeignKey("timesheets.id"), nullable=True)
    flag_type: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    risk_score: Mapped[float] = mapped_column(Numeric(5, 4), default=0)
    risk_level: Mapped[str] = mapped_column(String(20), default="low")
    details: Mapped[dict] = mapped_column(JSON, nullable=True)
    is_resolved: Mapped[bool] = mapped_column(Boolean, default=False)
    resolved_by_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    resolution_note: Mapped[str] = mapped_column(Text, nullable=True)

    invoice: Mapped[Invoice] = relationship("Invoice", back_populates="fraud_logs")


class AuditLog(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "audit_logs"

    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    invoice_id: Mapped[str] = mapped_column(String(36), ForeignKey("invoices.id"), nullable=True)
    timesheet_id: Mapped[str] = mapped_column(String(36), ForeignKey("timesheets.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(100), nullable=True)
    resource_id: Mapped[str] = mapped_column(String(36), nullable=True)
    old_values: Mapped[dict] = mapped_column(JSON, nullable=True)
    new_values: Mapped[dict] = mapped_column(JSON, nullable=True)
    ip_address: Mapped[str] = mapped_column(String(50), nullable=True)
    user_agent: Mapped[str] = mapped_column(String(500), nullable=True)
    notes: Mapped[str] = mapped_column(Text, nullable=True)

    user: Mapped["User"] = relationship("User", back_populates="audit_logs")  # type: ignore[name-defined]
    invoice: Mapped[Invoice] = relationship("Invoice", back_populates="audit_logs")


class ReviewLog(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "review_logs"

    timesheet_id: Mapped[str] = mapped_column(String(36), ForeignKey("timesheets.id"), nullable=False)
    reviewer_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    action: Mapped[str] = mapped_column(String(50), nullable=False)   # approved, rejected, modified
    comment: Mapped[str] = mapped_column(Text, nullable=True)
    modified_fields: Mapped[dict] = mapped_column(JSON, nullable=True)

    timesheet: Mapped["Timesheet"] = relationship("Timesheet", back_populates="review_logs")  # type: ignore[name-defined]


class Notification(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "notifications"

    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[str] = mapped_column(String(50), default="info")   # info, warning, error, success
    resource_type: Mapped[str] = mapped_column(String(100), nullable=True)
    resource_id: Mapped[str] = mapped_column(String(36), nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    read_at: Mapped[str] = mapped_column(String(50), nullable=True)
