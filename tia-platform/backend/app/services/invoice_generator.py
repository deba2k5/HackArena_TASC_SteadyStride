"""
Invoice Generation Service.

Creates Invoice records in the database and generates professional PDF invoices
using ReportLab with QR codes.
"""

from __future__ import annotations

import io
import os
import uuid
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from loguru import logger

from app.config import get_settings
from app.models.invoice import Invoice, InvoiceItem, InvoiceStatus
from app.models.organization import Employee, Client, Project, Contract
from app.schemas.document import ExtractionResult

settings = get_settings()


def _next_invoice_number() -> str:
    """Generate a unique sequential invoice number."""
    prefix = "TIA"
    today = date.today().strftime("%Y%m%d")
    suffix = uuid.uuid4().hex[:6].upper()
    return f"{prefix}-{today}-{suffix}"


def build_invoice_record(
    extraction: ExtractionResult,
    employee: Employee | None,
    client: Client,
    project: Project | None,
    contract: Contract | None,
    fraud_risk_score: float = 0.0,
    fraud_risk_level: str = "low",
) -> Invoice:
    """
    Create an Invoice ORM object from extraction + resolved entities.
    Does NOT persist — caller commits.
    """
    reg_hours = extraction.regular_hours or 0.0
    ot_hours = extraction.overtime_hours or 0.0

    # Determine rates from contract > project > employee > extraction
    if contract:
        hourly_rate = float(contract.billing_rate) or (extraction.hourly_rate or 0.0)
        ot_rate = float(contract.overtime_rate) or (hourly_rate * 1.5)
        gst_rate = float(contract.gst_rate)
        tax_rate = float(contract.tax_rate)
        currency = contract.currency
        payment_terms_days = contract.payment_terms_days
    elif project:
        hourly_rate = float(project.billing_rate) or (extraction.hourly_rate or 0.0)
        ot_rate = float(project.overtime_rate) or (hourly_rate * 1.5)
        gst_rate = 0.0
        tax_rate = 0.0
        currency = project.currency
        payment_terms_days = client.payment_terms_days
    elif employee:
        hourly_rate = extraction.hourly_rate or float(employee.hourly_rate)
        ot_rate = extraction.hourly_rate or float(employee.overtime_rate)
        gst_rate = 0.0
        tax_rate = 0.0
        currency = employee.currency
        payment_terms_days = client.payment_terms_days
    else:
        hourly_rate = extraction.hourly_rate or 0.0
        ot_rate = hourly_rate * 1.5
        gst_rate = 0.0
        tax_rate = 0.0
        currency = extraction.currency or client.currency
        payment_terms_days = client.payment_terms_days

    reg_amount = reg_hours * hourly_rate
    ot_amount = ot_hours * ot_rate
    subtotal = reg_amount + ot_amount
    gst_amount = subtotal * gst_rate
    tax_amount = subtotal * tax_rate
    total_amount = subtotal + gst_amount + tax_amount

    today_str = date.today().isoformat()
    due_date = (date.today() + timedelta(days=payment_terms_days)).isoformat()

    invoice = Invoice(
        invoice_number=_next_invoice_number(),
        employee_id=employee.id if employee else None,
        client_id=client.id,
        project_id=project.id if project else None,
        contract_id=contract.id if contract else None,
        status=InvoiceStatus.DRAFT,
        billing_period_start=extraction.billing_period_start,
        billing_period_end=extraction.billing_period_end,
        invoice_date=today_str,
        due_date=due_date,
        regular_hours=reg_hours,
        overtime_hours=ot_hours,
        hourly_rate=hourly_rate,
        overtime_rate=ot_rate,
        subtotal=subtotal,
        gst_rate=gst_rate,
        gst_amount=gst_amount,
        tax_rate=tax_rate,
        tax_amount=tax_amount,
        discount=0.0,
        total_amount=total_amount,
        currency=currency,
        payment_terms=f"Net {payment_terms_days} days",
        fraud_risk_score=fraud_risk_score,
        fraud_risk_level=fraud_risk_level,
        extraction_confidence=extraction.confidence_score,
    )

    # Line items
    if reg_hours > 0:
        invoice.items.append(InvoiceItem(
            description=f"Regular Hours ({reg_hours}h @ {currency} {hourly_rate:.2f}/h)",
            quantity=reg_hours,
            unit_price=hourly_rate,
            amount=reg_amount,
            item_type="hours",
        ))
    if ot_hours > 0:
        invoice.items.append(InvoiceItem(
            description=f"Overtime Hours ({ot_hours}h @ {currency} {ot_rate:.2f}/h)",
            quantity=ot_hours,
            unit_price=ot_rate,
            amount=ot_amount,
            item_type="overtime",
        ))

    return invoice


# ── PDF Generation ────────────────────────────────────────────────────────────

def generate_pdf(invoice: Invoice, employee: Employee | None, client: Client) -> bytes:
    """
    Generate a professional enterprise invoice PDF using ReportLab.

    Includes: header, logo placeholder, bill-to, line items table,
    totals, QR code, payment terms, digital signature placeholder.
    """
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.platypus import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
    )
    from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER
    import qrcode

    WIDTH, HEIGHT = A4
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        rightMargin=1.5*cm, leftMargin=1.5*cm,
        topMargin=1.5*cm, bottomMargin=1.5*cm
    )

    styles = getSampleStyleSheet()
    # Custom styles
    title_style = ParagraphStyle(
        "TitleStyle", parent=styles["Normal"],
        fontSize=22, textColor=colors.HexColor("#1e3a5f"),
        spaceAfter=4, fontName="Helvetica-Bold"
    )
    heading_style = ParagraphStyle(
        "HeadingStyle", parent=styles["Normal"],
        fontSize=10, textColor=colors.HexColor("#1e3a5f"),
        spaceAfter=2, fontName="Helvetica-Bold"
    )
    normal_style = ParagraphStyle(
        "NormalStyle", parent=styles["Normal"],
        fontSize=9, textColor=colors.HexColor("#333333"), spaceAfter=2
    )
    small_style = ParagraphStyle(
        "SmallStyle", parent=styles["Normal"],
        fontSize=8, textColor=colors.HexColor("#666666"), spaceAfter=1
    )
    right_style = ParagraphStyle(
        "RightStyle", parent=styles["Normal"],
        fontSize=9, alignment=TA_RIGHT
    )

    story = []

    # ── Header row ────────────────────────────────────────────────────────────
    header_data = [[
        Paragraph("<b>TOUCHLESS INVOICE AGENT</b><br/><font size=9 color='#666666'>Enterprise AI Platform</font>", title_style),
        Paragraph(
            f"<b>INVOICE</b><br/>"
            f"<font size=9 color='#666666'># {invoice.invoice_number}</font><br/>"
            f"<font size=8>Date: {invoice.invoice_date or ''}</font><br/>"
            f"<font size=8>Due: {invoice.due_date or ''}</font>",
            right_style
        )
    ]]
    header_table = Table(header_data, colWidths=[10*cm, 8*cm])
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f0f4ff")),
        ("ROUNDEDCORNERS", [6, 6, 6, 6]),
        ("TOPPADDING", (0, 0), (-1, -1), 12),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 0.5*cm))

    # ── Bill To / From ────────────────────────────────────────────────────────
    bill_data = [[
        Paragraph(
            f"<b>BILL TO</b><br/>"
            f"<font size=10><b>{client.company_name}</b></font><br/>"
            f"<font size=9 color='#555555'>{client.contact_name or ''}</font><br/>"
            f"<font size=8>{client.address or ''}</font><br/>"
            f"<font size=8>{client.email or ''}</font><br/>"
            f"<font size=8>Tax ID: {client.tax_id or 'N/A'}</font>",
            normal_style
        ),
        Paragraph(
            f"<b>EMPLOYEE DETAILS</b><br/>"
            f"<font size=10><b>{employee.full_name if employee else 'N/A'}</b></font><br/>"
            f"<font size=9 color='#555555'>ID: {employee.employee_code if employee else 'N/A'}</font><br/>"
            f"<font size=8>{employee.email if employee else ''}</font><br/>"
            f"<font size=8>Dept: {employee.department.name if employee and employee.department else 'N/A'}</font>",
            normal_style
        ),
    ]]
    bill_table = Table(bill_data, colWidths=[9*cm, 9*cm])
    bill_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, 0), 1, colors.HexColor("#e0e8ff")),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(bill_table)
    story.append(Spacer(1, 0.4*cm))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#1e3a5f")))
    story.append(Spacer(1, 0.3*cm))

    # ── Billing period ────────────────────────────────────────────────────────
    period_str = f"{invoice.billing_period_start or 'N/A'} to {invoice.billing_period_end or 'N/A'}"
    story.append(Paragraph(f"<b>Billing Period:</b> {period_str}", heading_style))
    story.append(Spacer(1, 0.3*cm))

    # ── Line items table ──────────────────────────────────────────────────────
    items_header = [
        Paragraph("<b>#</b>", small_style),
        Paragraph("<b>Description</b>", small_style),
        Paragraph("<b>Qty</b>", small_style),
        Paragraph("<b>Unit Price</b>", small_style),
        Paragraph("<b>Amount</b>", small_style),
    ]
    items_data = [items_header]
    for idx, item in enumerate(invoice.items, start=1):
        items_data.append([
            Paragraph(str(idx), small_style),
            Paragraph(item.description, small_style),
            Paragraph(f"{item.quantity:.2f}", small_style),
            Paragraph(f"{invoice.currency} {item.unit_price:.4f}", small_style),
            Paragraph(f"{invoice.currency} {item.amount:.2f}", small_style),
        ])

    items_table = Table(items_data, colWidths=[1*cm, 8*cm, 2*cm, 3.5*cm, 3.5*cm])
    items_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e3a5f")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f7f9ff")]),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#d0d8e8")),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
    ]))
    story.append(items_table)
    story.append(Spacer(1, 0.3*cm))

    # ── Totals ────────────────────────────────────────────────────────────────
    totals_data = [
        ["Subtotal:", f"{invoice.currency} {float(invoice.subtotal):.2f}"],
        [f"GST ({float(invoice.gst_rate)*100:.1f}%):", f"{invoice.currency} {float(invoice.gst_amount):.2f}"],
        [f"Tax ({float(invoice.tax_rate)*100:.1f}%):", f"{invoice.currency} {float(invoice.tax_amount):.2f}"],
        [f"Discount:", f"- {invoice.currency} {float(invoice.discount):.2f}"],
        ["TOTAL DUE:", f"{invoice.currency} {float(invoice.total_amount):.2f}"],
    ]
    totals_table = Table(totals_data, colWidths=[14*cm, 4*cm])
    totals_table.setStyle(TableStyle([
        ("ALIGN", (0, 0), (-1, -1), "RIGHT"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, -1), (-1, -1), 11),
        ("TEXTCOLOR", (0, -1), (-1, -1), colors.HexColor("#1e3a5f")),
        ("LINEABOVE", (0, -1), (-1, -1), 1.5, colors.HexColor("#1e3a5f")),
        ("TOPPADDING", (0, -1), (-1, -1), 6),
        ("BOTTOMPADDING", (0, -1), (-1, -1), 6),
    ]))
    story.append(totals_table)
    story.append(Spacer(1, 0.5*cm))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#c0c8d8")))
    story.append(Spacer(1, 0.4*cm))

    # ── Footer row: QR + signature + payment terms ────────────────────────────
    qr_data = (
        f"INVOICE:{invoice.invoice_number}|"
        f"CLIENT:{client.company_name}|"
        f"TOTAL:{invoice.currency} {float(invoice.total_amount):.2f}|"
        f"DUE:{invoice.due_date}"
    )
    qr_img_buf = io.BytesIO()
    qrcode.make(qr_data).save(qr_img_buf, format="PNG")
    qr_img_buf.seek(0)

    from reportlab.platypus import Image as RLImage
    qr_rl = RLImage(qr_img_buf, width=2.5*cm, height=2.5*cm)

    footer_data = [[
        qr_rl,
        Paragraph(
            f"<b>Payment Terms:</b> {invoice.payment_terms or 'Net 30'}<br/>"
            f"<font size=8 color='#666666'>Please reference invoice number {invoice.invoice_number} "
            f"in all correspondence.</font><br/><br/>"
            f"<b>_________________________</b><br/>"
            f"<font size=8>Authorised Signature</font>",
            normal_style
        ),
        Paragraph(
            f"<font size=7 color='#999999'>"
            f"Generated by Touchless Invoice Agent<br/>"
            f"AI-powered document processing platform<br/>"
            f"This invoice was automatically generated.</font>",
            small_style
        ),
    ]]
    footer_table = Table(footer_data, colWidths=[3*cm, 9*cm, 6*cm])
    footer_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f0f4ff")),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(footer_table)

    doc.build(story)
    return buf.getvalue()


def save_pdf(invoice: Invoice, employee: Employee | None, client: Client) -> str:
    """Generate PDF and save to disk. Returns the file path."""
    upload_dir = Path(settings.UPLOAD_DIR) / "invoices"
    upload_dir.mkdir(parents=True, exist_ok=True)

    filename = f"invoice_{invoice.invoice_number}.pdf"
    file_path = upload_dir / filename

    pdf_bytes = generate_pdf(invoice, employee, client)
    file_path.write_bytes(pdf_bytes)

    logger.info(f"PDF invoice saved: {file_path}")
    return str(file_path)
