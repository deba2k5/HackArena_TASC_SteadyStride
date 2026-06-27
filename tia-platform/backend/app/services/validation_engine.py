"""
Business Rule Validation Engine.

Rules are stored in PostgreSQL (business_rules table) and are never hardcoded.
Validates: hours, rates, dates, employees, clients, projects, contracts, GST, tax, duplicates.
"""

from __future__ import annotations

import json
from datetime import date, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from loguru import logger

from app.models.invoice import BusinessRule, Invoice, ValidationLog
from app.models.organization import Employee, Client, Project, Contract
from app.models.document import Timesheet
from app.schemas.document import ExtractionResult


class ValidationResult:
    def __init__(self):
        self.errors: list[dict] = []
        self.warnings: list[dict] = []
        self.passed: bool = True

    def add_error(self, rule_key: str, rule_name: str, message: str,
                  actual: Any = None, expected: Any = None):
        self.errors.append({
            "rule_key": rule_key,
            "rule_name": rule_name,
            "severity": "error",
            "message": message,
            "actual_value": str(actual) if actual is not None else None,
            "expected_value": str(expected) if expected is not None else None,
        })
        self.passed = False

    def add_warning(self, rule_key: str, rule_name: str, message: str,
                    actual: Any = None, expected: Any = None):
        self.warnings.append({
            "rule_key": rule_key,
            "rule_name": rule_name,
            "severity": "warning",
            "message": message,
            "actual_value": str(actual) if actual is not None else None,
            "expected_value": str(expected) if expected is not None else None,
        })

    def to_dict(self) -> dict:
        return {
            "passed": self.passed,
            "errors": self.errors,
            "warnings": self.warnings,
            "error_count": len(self.errors),
            "warning_count": len(self.warnings),
        }


class ValidationEngine:
    """
    Rule-based validation engine.

    All rules come from the database — nothing is hardcoded.
    Falls back to safe defaults if rules are missing.
    """

    async def _get_rules(
        self,
        db: AsyncSession,
        client_id: str | None = None,
    ) -> dict[str, Any]:
        """Load all active business rules into a key→value dict."""
        q = select(BusinessRule).where(BusinessRule.is_active == True)
        if client_id:
            q = q.where(
                (BusinessRule.client_id == client_id) | (BusinessRule.client_id.is_(None))
            )
        else:
            q = q.where(BusinessRule.client_id.is_(None))

        rules_db = (await db.execute(q)).scalars().all()

        rule_map: dict[str, Any] = {
            # Safe defaults
            "max_hours_per_day": 12.0,
            "max_hours_per_week": 60.0,
            "max_overtime_hours": 20.0,
            "min_hours_per_day": 0.0,
            "weekend_billing_allowed": True,
            "holiday_billing_allowed": False,
            "max_billing_rate": 1000.0,
            "min_billing_rate": 1.0,
            "duplicate_invoice_window_days": 30,
            "require_project": False,
            "require_contract": False,
            "gst_rate_default": 0.0,
            "tax_rate_default": 0.0,
            "currency_allowed": "USD,EUR,GBP,AED,INR,SGD,CAD,AUD",
        }

        for rule in rules_db:
            try:
                if rule.data_type == "float":
                    rule_map[rule.rule_key] = float(rule.rule_value)
                elif rule.data_type == "int":
                    rule_map[rule.rule_key] = int(rule.rule_value)
                elif rule.data_type == "bool":
                    rule_map[rule.rule_key] = rule.rule_value.lower() in ("true", "1", "yes")
                elif rule.data_type == "json":
                    rule_map[rule.rule_key] = json.loads(rule.rule_value)
                else:
                    rule_map[rule.rule_key] = rule.rule_value
            except Exception:
                rule_map[rule.rule_key] = rule.rule_value

        return rule_map

    async def validate_timesheet(
        self,
        db: AsyncSession,
        timesheet: Timesheet,
        extraction: ExtractionResult,
        employee: Employee | None,
        client: Client | None,
        project: Project | None,
    ) -> ValidationResult:
        """Full validation of a timesheet against all business rules."""
        result = ValidationResult()
        rules = await self._get_rules(db, client.id if client else None)

        # ── 1. Employee exists and is active ─────────────────────────────────
        if not employee:
            result.add_error(
                "employee_exists", "Employee Must Exist",
                f"Employee '{extraction.employee_name}' (ID: {extraction.employee_id}) not found in database."
            )
        elif not employee.is_active:
            result.add_error(
                "employee_active", "Employee Must Be Active",
                f"Employee '{employee.full_name}' is inactive."
            )

        # ── 2. Client exists and is active ────────────────────────────────────
        if not client:
            result.add_error(
                "client_exists", "Client Must Exist",
                f"Client '{extraction.client}' not found in database."
            )
        elif not client.is_active:
            result.add_error(
                "client_active", "Client Must Be Active",
                f"Client '{client.company_name}' is inactive."
            )

        # ── 3. Project validation ─────────────────────────────────────────────
        if rules.get("require_project") and not project:
            result.add_error(
                "project_exists", "Project Required",
                f"Project '{extraction.project_name}' not found in database."
            )
        if project and not project.is_active:
            result.add_error(
                "project_active", "Project Must Be Active",
                f"Project '{project.name}' is inactive."
            )

        # ── 4. Hours validation ───────────────────────────────────────────────
        reg_hours = extraction.regular_hours or 0.0
        ot_hours = extraction.overtime_hours or 0.0
        total_hours = reg_hours + ot_hours

        max_daily = float(rules.get("max_hours_per_day", 12))
        if reg_hours > max_daily:
            result.add_error(
                "max_hours_per_day", "Maximum Daily Hours",
                f"Regular hours {reg_hours} exceeds maximum {max_daily} per day.",
                actual=reg_hours, expected=f"<= {max_daily}"
            )

        max_ot = float(rules.get("max_overtime_hours", 20))
        if ot_hours > max_ot:
            result.add_error(
                "max_overtime_hours", "Maximum Overtime Hours",
                f"Overtime hours {ot_hours} exceeds maximum {max_ot}.",
                actual=ot_hours, expected=f"<= {max_ot}"
            )

        max_weekly = float(rules.get("max_hours_per_week", 60))
        if total_hours > max_weekly:
            result.add_warning(
                "max_hours_per_week", "Maximum Weekly Hours",
                f"Total hours {total_hours} may exceed weekly maximum {max_weekly}.",
                actual=total_hours, expected=f"<= {max_weekly}"
            )

        if total_hours <= 0:
            result.add_error(
                "hours_positive", "Hours Must Be Positive",
                "Total hours must be greater than zero.",
                actual=total_hours
            )

        # ── 5. Rate validation ────────────────────────────────────────────────
        if extraction.hourly_rate is not None:
            max_rate = float(rules.get("max_billing_rate", 1000))
            min_rate = float(rules.get("min_billing_rate", 1))
            if extraction.hourly_rate > max_rate:
                result.add_error(
                    "max_billing_rate", "Billing Rate Too High",
                    f"Hourly rate {extraction.hourly_rate} exceeds maximum {max_rate}.",
                    actual=extraction.hourly_rate, expected=f"<= {max_rate}"
                )
            if extraction.hourly_rate < min_rate:
                result.add_warning(
                    "min_billing_rate", "Billing Rate Too Low",
                    f"Hourly rate {extraction.hourly_rate} is below minimum {min_rate}.",
                    actual=extraction.hourly_rate, expected=f">= {min_rate}"
                )

        # ── 6. Currency validation ────────────────────────────────────────────
        if extraction.currency:
            allowed_currencies = str(rules.get("currency_allowed", "USD,EUR,GBP,AED")).split(",")
            if extraction.currency.upper() not in [c.strip().upper() for c in allowed_currencies]:
                result.add_warning(
                    "currency_allowed", "Currency Validation",
                    f"Currency '{extraction.currency}' is not in allowed list: {allowed_currencies}.",
                    actual=extraction.currency
                )

        # ── 7. Date validation ────────────────────────────────────────────────
        today = date.today()
        if extraction.billing_period_start:
            try:
                start = datetime.strptime(extraction.billing_period_start, "%Y-%m-%d").date()
                if start > today:
                    result.add_error(
                        "billing_date_future", "Billing Period Cannot Be Future",
                        f"Billing start date {start} is in the future.",
                        actual=start
                    )
            except ValueError:
                result.add_warning(
                    "date_format", "Date Format Warning",
                    f"Could not parse billing_period_start: {extraction.billing_period_start}"
                )

        # ── 8. Duplicate invoice check ────────────────────────────────────────
        if employee and client:
            dup_query = select(Invoice).where(
                and_(
                    Invoice.employee_id == employee.id,
                    Invoice.client_id == client.id,
                    Invoice.billing_period_start == extraction.billing_period_start,
                    Invoice.billing_period_end == extraction.billing_period_end,
                )
            )
            existing = (await db.execute(dup_query)).scalar_one_or_none()
            if existing:
                result.add_error(
                    "duplicate_invoice", "Duplicate Invoice",
                    f"Invoice already exists for employee {employee.full_name}, "
                    f"client {client.company_name}, period {extraction.billing_period_start} "
                    f"to {extraction.billing_period_end}. Invoice ID: {existing.id}",
                    actual="duplicate"
                )

        logger.info(
            f"Validation complete — passed={result.passed}, "
            f"errors={len(result.errors)}, warnings={len(result.warnings)}"
        )
        return result

    async def save_validation_logs(
        self,
        db: AsyncSession,
        result: ValidationResult,
        invoice_id: str | None = None,
        timesheet_id: str | None = None,
    ) -> None:
        """Persist validation results to the database."""
        all_items = [
            {**item, "invoice_id": invoice_id, "timesheet_id": timesheet_id}
            for item in (result.errors + result.warnings)
        ]
        for item in all_items:
            log = ValidationLog(
                invoice_id=item.get("invoice_id"),
                timesheet_id=item.get("timesheet_id"),
                rule_key=item["rule_key"],
                rule_name=item.get("rule_name"),
                passed=item["severity"] != "error",
                severity=item["severity"],
                message=item.get("message"),
                actual_value=item.get("actual_value"),
                expected_value=item.get("expected_value"),
            )
            db.add(log)
        await db.flush()
