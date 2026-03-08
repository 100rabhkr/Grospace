"""
WhatsApp messaging via MSG91 API.
"""

import os


def send_whatsapp_via_msg91(phone_number: str, template_name: str, variables: dict) -> bool:
    """Send a WhatsApp message using MSG91 API. Returns True on success."""
    msg91_auth_key = os.getenv("MSG91_AUTH_KEY")
    msg91_template_id = os.getenv("MSG91_WHATSAPP_TEMPLATE_ID", "")
    if not msg91_auth_key or not phone_number:
        return False
    try:
        import requests
        # MSG91 WhatsApp API
        payload = {
            "integrated_number": os.getenv("MSG91_INTEGRATED_NUMBER", ""),
            "content_type": "template",
            "payload": {
                "messaging_product": "whatsapp",
                "type": "template",
                "template": {
                    "name": template_name or msg91_template_id,
                    "language": {"code": "en", "policy": "deterministic"},
                    "components": [
                        {
                            "type": "body",
                            "parameters": [
                                {"type": "text", "text": str(v)} for v in variables.values()
                            ],
                        }
                    ],
                },
                "to": phone_number,
            },
        }
        resp = requests.post(
            "https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/",
            headers={
                "authkey": msg91_auth_key,
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=10,
        )
        return resp.status_code in (200, 201)
    except Exception:
        return False
