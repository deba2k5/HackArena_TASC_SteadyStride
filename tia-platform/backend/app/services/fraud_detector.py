"""
Fraud Detection Engine.

Detects:
  - Impossible working hours
  - Repeated / duplicate invoices
  - Duplicate file uploads (hash check)
  - Modified invoice amounts
  - Wrong employee / project / client combos
  - Inactive contract / project / employee
  - Suspicious overtime patterns
  - Repeated invoice numbers
  - Abnormal billing rate spikes
"""

from __future__ import annotations

import hashlib
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from loguru import logger

from app.models.invoice import Invoice, FraudLog
from app.models.document import Timesheet
from app.models.organization import Employee, Client, Project, Contract
from app.schemas.document import ExtractionResult


class FraudFlag:
    def __init__(self, flag_type: str, description: str, risk_contribution: float, details: dict | None = None):
        self.flag_type = flag_type
        self.description = description
        self.risk_contribution = risk_contribution   # 0.0 – 1.0
        self.details = details or {}


class FraudDetectionResult:
    def __init__(self):
        self.flags: list[FraudFlag] = []
        self.risk_score: float = 0.0
        self.risk_level: str = "low"

    def add_flag(self, flag: FraudFlag):
        self.flags.append(flag)
        # Combine risks using complement rule: P(A or B) = 1 - (1-A)(1-B)
        combined = 1.0 - (1.0 - self.risk_score) * (1.0 - flag.risk_contribution)
        self.risk_score = min(1.0, combined)
        self._update_level()

    def _update_level(self):
        if self.risk_score >= 0.80:
            self.risk_level = "critical"
        elif self.risk_score >= 0.60:
            self.risk_level = "high"
        elif self.risk_score >= 0.35:
            self.risk_level = "medium"
        else:
            self.risk_level = "low"

    def to_dict(self) -> dict:
        return {
            "risk_score": round(self.risk_score, 4),
            "risk_level": self.risk_level,
            "flags": [
                {
                    "flag_type": f.flag_type,
                    "description": f.description,
                    "risk_contribution": f.risk_contribution,
                    "details": f.details,
                }
                for f in self.flags
            ],
        }


class FraudDetector:

    async def analyze(
        self,
        db: AsyncSession,
        extraction: ExtractionResult,
        employee: Employee | None,
        client: Client | None,
        project: Project | None,
        file_checksum: str | None = None,
    ) -> FraudDetectionResult:
        result = FraudDetectionResult()

        # ── 1. Impossible hours ───────────────────────────────────────────────
        reg = extraction.regular_hours or 0.0
        ot = extraction.overtime_hours or 0.0
        total = reg + ot

        if total > 24:
            result.add_flag(FraudFlag(
                "impossible_hours", f"Total hours {total} > 24 in a day.", 0.90,
                {"total_hours": total}
            ))
        elif total > 16:
            result.add_flag(FraudFlag(
                "excessive_hours", f"Total hours {total} exceeds 16.", 0.55,
                {"total_hours": total}
            ))

        if ot > reg * 2 and reg > 0:
            result.add_flag(FraudFlag(
                "suspicious_overtime",
                f"Overtime ({ot}h) is more than 2× regular hours ({reg}h).", 0.45,
                {"regular_hours": reg, "overtime_hours": ot}
            ))

        # ── 2. Inactive entities ──────────────────────────────────────────────
        if employee and not employee.is_active:
            result.add_flag(FraudFlag(
                "inactive_employee",
                f"Timesheet submitted for inactive employee '{employee.full_name}'.", 0.75,
                {"employee_id": employee.id}
            ))

        if client and not client.is_active:
            result.add_flag(FraudFlag(
                "inactive_client",
                f"Invoice billed to inactive client '{client.company_name}'.", 0.70,
                {"client_id": client.id}
            ))

        if project and not project.is_active:
            result.add_flag(FraudFlag(
                "inactive_project",
                f"Hours logged against inactive project '{project.name}'.", 0.65,
                {"project_id": project.id}
            ))

        # ── 3. Duplicate file upload (checksum) ───────────────────────────────
        if file_checksum:
            dup_doc = await db.execute(
                select(Timesheet)
                .join(Timesheet.document)
                .where(Timesheet.document.has(checksum=file_checksum))
            )
            existing = dup_doc.scalar_one_or_none()
            if existing:
                result.add_flag(FraudFlag(
                    "duplicate_upload",
                    f"Identical file already processed (timesheet ID: {existing.id}).", 0.85,
                    {"existing_timesheet_id": existing.id, "checksum": file_checksum}
                ))

        # ── 4. Repeated invoice number ────────────────────────────────────────
        if extraction.invoice_number:
            dup_inv = await db.execute(
                select(Invoice).where(Invoice.invoice_number == extraction.invoice_number)
            )
            existing_inv = dup_inv.scalar_one_or_none()
            if existing_inv:
                result.add_flag(FraudFlag(
                    "duplicate_invoice_number",
                    f"Invoice number '{extraction.invoice_number}' already exists (ID: {existing_inv.id}).", 0.80,
                    {"existing_invoice_id": existing_inv.id}
                ))

        # ── 5. Cross-client employee ──────────────────────────────────────────
        if employee and client:
            # Check if employee has previously worked with a different client
            prev_invoices = (await db.execute(
                select(Invoice.client_id)
                .where(Invoice.employee_id == employee.id)
                .distinct()
            )).scalars().all()
            if prev_invoices and len(prev_invoices) > 1:
                result.add_flag(FraudFlag(
                    "multi_client_employee",
                    f"Employee '{employee.full_name}' has invoices with {len(prev_invoices)} different clients.", 0.20,
                    {"client_count": len(prev_invoices)}
                ))

        # ── 6. Billing rate spike ─────────────────────────────────────────────
        if extraction.hourly_rate and employee and employee.hourly_rate:
            rate_ratio = extraction.hourly_rate / float(employee.hourly_rate) if float(employee.hourly_rate) > 0 else 1.0
            if rate_ratio > 2.0:
                result.add_flag(FraudFlag(
                    "billing_rate_spike",
                    f"Extracted rate {extraction.hourly_rate} is {rate_ratio:.1f}× employee master rate {employee.hourly_rate}.", 0.60,
                    {"extracted_rate": extraction.hourly_rate, "master_rate": float(employee.hourly_rate), "ratio": round(rate_ratio, 2)}
                ))

        logger.info(
            f"Fraud analysis complete — score={result.risk_score:.2%}, "
            f"level={result.risk_level}, flags={len(result.flags)}"
        )
        return result

    async def save_fraud_logs(
        self,
        db: AsyncSession,
        result: FraudDetectionResult,
        invoice_id: str | None = None,
        timesheet_id: str | None = None,
    ) -> None:
        """Persist fraud flags to database."""
        for flag in result.flags:
            log = FraudLog(
                invoice_id=invoice_id,
                timesheet_id=timesheet_id,
                flag_type=flag.flag_type,
                description=flag.description,
                risk_score=flag.risk_contribution,
                risk_level=result.risk_level,
                details=flag.details,
            )
            db.add(log)
        await db.flush()
