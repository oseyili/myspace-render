from pathlib import Path
import re

p = Path("hotel_app.py")
s = p.read_text(encoding="utf-8")

if "import requests" not in s:
    s = s.replace("import os", "import os\nimport requests", 1)

helper = '''
def send_availability_email(req):
    resend_key = os.getenv("RESEND_API_KEY", "").strip()
    sender = os.getenv("RESEND_FROM", "onboarding@resend.dev").strip()
    receiver = os.getenv("RESERVATIONS_EMAIL", "").strip() or os.getenv("ADMIN_NOTIFICATION_EMAIL", "").strip() or SUPPORT_EMAIL

    if not resend_key:
        raise RuntimeError("RESEND_API_KEY is missing.")
    if not receiver:
        raise RuntimeError("RESERVATIONS_EMAIL is missing.")

    hotel_name = getattr(req, "hotel_name", "") or getattr(req, "property", "") or getattr(req, "selected_hotel", "") or "Selected stay"
    customer_name = getattr(req, "name", "") or ""
    customer_email = getattr(req, "email", "") or ""
    message_text = getattr(req, "message", "") or ""

    response = requests.post(
        "https://api.resend.com/emails",
        headers={
            "Authorization": f"Bearer {resend_key}",
            "Content-Type": "application/json",
        },
        json={
            "from": sender,
            "to": [receiver],
            "subject": f"New availability request - {hotel_name}",
            "reply_to": customer_email,
            "html": f"""
            <h2>New availability request</h2>
            <p><b>Hotel / stay:</b> {hotel_name}</p>
            <p><b>Customer name:</b> {customer_name}</p>
            <p><b>Customer email:</b> {customer_email}</p>
            <p><b>Request:</b><br>{message_text}</p>
            """,
        },
        timeout=30,
    )

    if response.status_code >= 300:
        raise RuntimeError(f"Resend failed: {response.status_code} {response.text[:300]}")

    return True
'''

s = re.sub(
    r'def send_availability_email\(req\):[\s\S]*?    return True\n',
    helper + "\n",
    s
)

p.write_text(s, encoding="utf-8")
print("hotel_app.py switched to Resend email.")
