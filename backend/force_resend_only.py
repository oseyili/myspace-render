from pathlib import Path
import re

p = Path("hotel_app.py")
s = p.read_text(encoding="utf-8")

# Remove old SMTP helper block
s = re.sub(
    r'# ={20,}\s*\n# RESERVATION EMAIL SUPPORT[\s\S]*?def send_reservation_email\(payload: dict\):[\s\S]*?    return True\s*\n',
    '',
    s,
    flags=re.MULTILINE
)

# Remove smtplib imports
s = s.replace("import smtplib\n", "")
s = s.replace("from email.message import EmailMessage\n", "")

# Ensure requests import
if "import requests" not in s:
    s = s.replace("import os", "import os\nimport requests", 1)

# Replace/ensure Resend helper
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

# Force request-availability route to use Resend helper only
route = '''
class AvailabilityRequest(BaseModel):
    name: str = ""
    email: str = ""
    message: str = ""
    hotel_name: str = ""
    hotel_id: str = ""
    property: str = ""
    selected_hotel: str = ""

@app.post("/api/request-availability")
def request_availability(req: AvailabilityRequest):
    try:
        send_availability_email(req)
        return {"ok": True, "email_sent": True, "message": "Availability request received.", "support_email": SUPPORT_EMAIL}
    except Exception as e:
        print("AVAILABILITY EMAIL ERROR:", str(e))
        return {"ok": False, "email_sent": False, "message": "Request was received but email could not be sent.", "error": str(e), "support_email": SUPPORT_EMAIL}
'''

s = re.sub(
    r'class AvailabilityRequest\(BaseModel\):[\s\S]*?@app\.post\("/api/request-availability"\)[\s\S]*?def request_availability\(req: AvailabilityRequest\):[\s\S]*?return \{[^\n]*SUPPORT_EMAIL\}',
    route.strip(),
    s
)

p.write_text(s, encoding="utf-8")
print("Old SMTP removed. Resend route forced.")
