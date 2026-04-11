"""
Lightweight helpers shared across extraction-adjacent routes.

These utilities intentionally avoid importing the heavy AI/OCR extraction stack so
dashboard, admin, and other non-document routes can boot quickly.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from core.config import supabase


def get_val(field_data):
    """Extract the raw value from a Gemini field (handles {value, confidence} objects)."""
    if field_data is None:
        return None
    if isinstance(field_data, dict) and "value" in field_data:
        value = field_data["value"]
        if value in (None, "", "not_found", "N/A", "null"):
            return None
        return value
    if field_data in ("not_found", "N/A", "", "null"):
        return None
    return field_data


def get_num(field_data):
    """Extract a numeric value from a field."""
    value = get_val(field_data)
    if value is None:
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
        return None


def get_date(field_data) -> Optional[str]:
    """Try to parse a date string from a field. Returns ISO date string or None."""
    value = get_val(field_data)
    if value is None:
        return None
    if isinstance(value, str):
        for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%Y/%m/%d", "%d %b %Y", "%d %B %Y"):
            try:
                return datetime.strptime(value.strip(), fmt).date().isoformat()
            except (ValueError, AttributeError):
                continue
    return None


def get_section(extraction: dict, section_name: str) -> dict:
    """Get a section from extraction data, handling nested value objects."""
    section = extraction.get(section_name, {})
    if isinstance(section, dict) and "value" in section:
        section = section["value"] if isinstance(section["value"], dict) else {}
    return section if isinstance(section, dict) else {}


def get_or_create_demo_org() -> str:
    """Get or create the demo organization, returns org_id."""
    result = (
        supabase.table("organizations")
        .select("id")
        .eq("name", "GroSpace Demo")
        .limit(1)
        .execute()
    )
    if result.data:
        return result.data[0]["id"]

    new_org = supabase.table("organizations").insert({
        "id": str(uuid.uuid4()),
        "name": "GroSpace Demo",
    }).execute()
    return new_org.data[0]["id"]
