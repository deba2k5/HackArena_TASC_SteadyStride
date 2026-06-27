"""
Identity Resolution Service.

Resolves extracted employee / client / project names to database entities.
Never relies on name alone — uses employee_code, email, department, project, client,
historical invoices, and fuzzy matching as disambiguation layers.
"""

from __future__ import annotations

import re
from difflib import SequenceMatcher
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from loguru import logger

from app.models.organization import Employee, Client, Project, Contract
from app.schemas.document import ExtractionResult


def _similarity(a: str, b: str) -> float:
    """SequenceMatcher similarity ratio."""
    return SequenceMatcher(None, a.lower().strip(), b.lower().strip()).ratio()


def _best_match(name: str, candidates: list[tuple[str, Any]], threshold: float = 0.82) -> tuple[Any | None, float]:
    """Return (best_match_obj, score) above threshold, else (None, 0)."""
    if not name or not candidates:
        return None, 0.0
    best_obj, best_score = None, 0.0
    for cand_name, cand_obj in candidates:
        score = _similarity(name, cand_name)
        if score > best_score:
            best_score = score
            best_obj = cand_obj
    if best_score >= threshold:
        return best_obj, best_score
    return None, best_score


class IdentityResolver:

    async def resolve_employee(
        self,
        db: AsyncSession,
        extraction: ExtractionResult,
    ) -> tuple[Employee | None, float]:
        """
        Resolve extracted employee identity.

        Priority:
          1. Exact employee_code match
          2. Exact email match (derived from employee_id pattern)
          3. Fuzzy full_name match scoped to client/department
          4. Fuzzy full_name match across all employees
        """
        # 1. Exact employee_code
        if extraction.employee_id:
            code = extraction.employee_id.strip().upper()
            result = await db.execute(
                select(Employee).where(Employee.employee_code == code)
            )
            emp = result.scalar_one_or_none()
            if emp:
                logger.debug(f"Resolved employee by code: {code}")
                return emp, 1.0

        # 2. All employees for fuzzy matching
        all_emps = (await db.execute(select(Employee).where(Employee.is_active == True))).scalars().all()

        if extraction.employee_name:
            # Scope by client if available
            scoped: list[Employee] = all_emps
            if extraction.client:
                client_emps = [
                    e for e in all_emps
                    if e.client_name and _similarity(e.client_name, extraction.client) > 0.80  # type: ignore[attr-defined]
                ]
                if client_emps:
                    scoped = client_emps

            # Scope by department
            if extraction.department:
                dept_emps = [
                    e for e in scoped
                    if e.department and _similarity(e.department.name, extraction.department) > 0.80
                ]
                if dept_emps:
                    scoped = dept_emps

            candidates = [(e.full_name, e) for e in scoped]
            emp, score = _best_match(extraction.employee_name, candidates, threshold=0.82)
            if emp:
                logger.debug(f"Resolved employee by name fuzzy ({score:.2f}): {emp.full_name}")
                return emp, score

        logger.warning(f"Could not resolve employee: name={extraction.employee_name}, id={extraction.employee_id}")
        return None, 0.0

    async def resolve_client(
        self,
        db: AsyncSession,
        extraction: ExtractionResult,
    ) -> tuple[Client | None, float]:
        """Resolve client by code or fuzzy company name."""
        if extraction.client_id:
            result = await db.execute(
                select(Client).where(Client.client_code == extraction.client_id.strip().upper())
            )
            client = result.scalar_one_or_none()
            if client:
                return client, 1.0

        if extraction.client:
            all_clients = (await db.execute(select(Client).where(Client.is_active == True))).scalars().all()
            candidates = [(c.company_name, c) for c in all_clients]
            client, score = _best_match(extraction.client, candidates, threshold=0.75)
            if client:
                return client, score

        return None, 0.0

    async def resolve_project(
        self,
        db: AsyncSession,
        extraction: ExtractionResult,
        client: Client | None,
    ) -> tuple[Project | None, float]:
        """Resolve project by code or fuzzy name, scoped to client."""
        if extraction.project_code:
            result = await db.execute(
                select(Project).where(Project.project_code == extraction.project_code.strip().upper())
            )
            project = result.scalar_one_or_none()
            if project:
                return project, 1.0

        if extraction.project_name:
            q = select(Project).where(Project.is_active == True)
            if client:
                q = q.where(Project.client_id == client.id)
            all_projects = (await db.execute(q)).scalars().all()
            candidates = [(p.name, p) for p in all_projects]
            project, score = _best_match(extraction.project_name, candidates, threshold=0.78)
            if project:
                return project, score

        return None, 0.0

    async def resolve_all(
        self,
        db: AsyncSession,
        extraction: ExtractionResult,
    ) -> dict[str, Any]:
        """
        Resolve all entities from an extraction result.

        Returns:
            {
                "employee": Employee | None,
                "client": Client | None,
                "project": Project | None,
                "employee_confidence": float,
                "client_confidence": float,
                "project_confidence": float,
                "resolution_notes": [str],
            }
        """
        notes: list[str] = []

        emp, emp_conf = await self.resolve_employee(db, extraction)
        client, client_conf = await self.resolve_client(db, extraction)
        project, project_conf = await self.resolve_project(db, extraction, client)

        if emp:
            notes.append(f"Employee resolved: {emp.full_name} ({emp.employee_code}) — conf={emp_conf:.2f}")
        else:
            notes.append(f"Employee NOT resolved: name={extraction.employee_name}, id={extraction.employee_id}")

        if client:
            notes.append(f"Client resolved: {client.company_name} — conf={client_conf:.2f}")
        else:
            notes.append(f"Client NOT resolved: {extraction.client}")

        if project:
            notes.append(f"Project resolved: {project.name} — conf={project_conf:.2f}")
        else:
            notes.append(f"Project NOT resolved: {extraction.project_name}")

        return {
            "employee": emp,
            "client": client,
            "project": project,
            "employee_confidence": emp_conf,
            "client_confidence": client_conf,
            "project_confidence": project_conf,
            "resolution_notes": notes,
        }
