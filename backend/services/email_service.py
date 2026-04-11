"""
Email sending via Resend API.
"""

import logging
import os

from core.config import supabase, log_activity

logger = logging.getLogger(__name__)


def send_email_via_resend(to_email: str, subject: str, html_body: str) -> bool:
    """
    Send an email using the Resend API. Returns True on success.

    Legacy signature — kept for existing callers. For new code that needs
    the failure reason, use send_email_via_resend_with_reason().
    """
    result = send_email_via_resend_with_reason(to_email, subject, html_body)
    return result["ok"]


def send_email_via_resend_with_reason(to_email: str, subject: str, html_body: str) -> dict:
    """
    Send an email via Resend. Returns a dict with:
      - ok: bool (True on success)
      - reason: str | None ("test_mode_recipient_blocked" | "no_api_key"
                            | "http_error" | "exception" | None)
      - detail: str (human-readable detail for the UI)
      - status_code: int | None

    Resend test mode (sender = onboarding@resend.dev) refuses to deliver
    to anyone except the account owner's verified email. Callers should
    check `reason == "test_mode_recipient_blocked"` and surface a
    "Copy credentials and hand them off manually" UI in that case.
    """
    resend_api_key = os.getenv("RESEND_API_KEY")
    if not resend_api_key:
        return {
            "ok": False,
            "reason": "no_api_key",
            "detail": "RESEND_API_KEY is not configured on the backend.",
            "status_code": None,
        }
    try:
        import requests
        resp = requests.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {resend_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "from": os.getenv("RESEND_FROM_EMAIL", "GroSpace <notifications@grospace.app>"),
                "to": [to_email],
                "subject": subject,
                "html": html_body,
            },
            timeout=10,
        )
        if resp.status_code in (200, 201):
            return {"ok": True, "reason": None, "detail": "Delivered.", "status_code": resp.status_code}

        # Classify the failure. Resend test mode returns 403 with a
        # distinctive message — surface that as a specific reason so the
        # UI can show the "copy and hand off" workflow.
        body_text = resp.text or ""
        if resp.status_code == 403 and "testing emails" in body_text.lower():
            return {
                "ok": False,
                "reason": "test_mode_recipient_blocked",
                "detail": (
                    "Resend is in test mode and can only deliver to the account "
                    "owner's verified email. Verify a custom domain at "
                    "resend.com/domains to unlock other recipients, or hand the "
                    "generated credentials off manually using the Copy button."
                ),
                "status_code": resp.status_code,
            }
        logger.warning("Resend send failed: HTTP %s %s", resp.status_code, body_text[:200])
        return {
            "ok": False,
            "reason": "http_error",
            "detail": f"Resend returned HTTP {resp.status_code}: {body_text[:200]}",
            "status_code": resp.status_code,
        }
    except Exception as e:
        logger.warning("Resend send exception: %s", e)
        return {
            "ok": False,
            "reason": "exception",
            "detail": f"Email provider error: {str(e)[:200]}",
            "status_code": None,
        }


def build_alert_email_html(alert: dict, org_name: str = "GroSpace") -> str:
    """Build an HTML email body for an alert notification."""
    severity = alert.get("severity", "medium")
    severity_color = {"high": "#dc2626", "medium": "#f59e0b", "low": "#3b82f6", "info": "#6b7280"}.get(severity, "#6b7280")
    return f"""
    <html><body style="font-family:sans-serif;max-width:600px;margin:auto;padding:20px">
    <div style="border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:20px">
        <h2 style="margin:0">GroSpace Alert</h2>
        <p style="color:#666;margin:5px 0 0 0">{org_name}</p>
    </div>
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:16px">
        <div style="display:inline-block;background:{severity_color};color:white;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600;text-transform:uppercase;margin-bottom:8px">{severity}</div>
        <h3 style="margin:8px 0 4px 0">{alert.get("title", "Alert")}</h3>
        <p style="color:#666;margin:0">{alert.get("message", "")}</p>
        <p style="color:#999;font-size:12px;margin:8px 0 0 0">Trigger date: {alert.get("trigger_date", "N/A")}</p>
    </div>
    <p style="color:#999;font-size:11px">This is an automated alert from GroSpace. Log in to manage your alerts.</p>
    </body></html>
    """


def get_notification_channels(org_id: str, alert_type: str, severity: str = "medium") -> dict:
    """Determine which channels (email, whatsapp) to use for an alert.
    Returns {"email": bool, "whatsapp": bool}."""
    try:
        result = supabase.table("organizations").select("alert_preferences").eq("id", org_id).single().execute()
        prefs = (result.data or {}).get("alert_preferences") or {}
        notif_prefs = prefs.get("notification_preferences") or {}
        routes = notif_prefs.get("routes") or {}

        # Check per-type route first
        if alert_type in routes:
            route = routes[alert_type]
            return {
                "email": route.get("email", True),
                "whatsapp": route.get("whatsapp", False),
            }

        # Fall back to severity-based defaults
        if severity == "high":
            defaults = notif_prefs.get("default_high_severity", {"email": True, "whatsapp": True})
        else:
            defaults = notif_prefs.get("default_normal", {"email": True, "whatsapp": False})

        return {
            "email": defaults.get("email", True),
            "whatsapp": defaults.get("whatsapp", False),
        }
    except Exception:
        return {"email": True, "whatsapp": False}


def dispatch_notification(org_id: str, alert: dict):
    """Route an alert to the appropriate channels and send via Resend/MSG91."""
    from services.whatsapp_service import send_whatsapp_via_msg91

    alert_type = alert.get("type", "custom")
    severity = alert.get("severity", "medium")
    channels = get_notification_channels(org_id, alert_type, severity)

    results = {"email": None, "whatsapp": None}

    # Log the routing decision
    log_activity(org_id, None, "alert", alert.get("id", ""), "notification_routed", {
        "alert_type": alert_type,
        "severity": severity,
        "channels": channels,
        "title": alert.get("title", ""),
    })

    # Get org info for email content
    try:
        org_result = supabase.table("organizations").select("name, alert_preferences").eq("id", org_id).single().execute()
        org_name = org_result.data.get("name", "GroSpace") if org_result.data else "GroSpace"
        alert_prefs = (org_result.data or {}).get("alert_preferences") or {}
        notif_prefs = alert_prefs.get("notification_preferences") or {}
    except Exception:
        org_name = "GroSpace"
        notif_prefs = {}

    # Send email if configured
    if channels.get("email"):
        # Try to get org admin emails
        try:
            members = supabase.table("profiles").select("email").eq("org_id", org_id).in_("role", ["org_admin", "platform_admin"]).execute()
            emails = [m["email"] for m in (members.data or []) if m.get("email")]
        except Exception:
            emails = []

        if emails:
            html_body = build_alert_email_html(alert, org_name)
            subject = f"[GroSpace] {severity.upper()}: {alert.get('title', 'Alert')}"
            for email in emails:
                sent = send_email_via_resend(email, subject, html_body)
                if results["email"] is None:
                    results["email"] = sent

    # Send WhatsApp if configured
    if channels.get("whatsapp"):
        whatsapp_number = notif_prefs.get("whatsapp_number", "")
        if whatsapp_number:
            sent = send_whatsapp_via_msg91(
                whatsapp_number,
                "grospace_alert",
                {
                    "title": alert.get("title", "Alert"),
                    "severity": severity,
                    "trigger_date": alert.get("trigger_date", "N/A"),
                },
            )
            results["whatsapp"] = sent

    # Log delivery results
    log_activity(org_id, None, "alert", alert.get("id", ""), "notification_sent", {
        "channels": channels,
        "results": results,
    })

    return {**channels, "results": results}
