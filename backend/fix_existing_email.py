import re
from pathlib import Path

p = Path("hotel_app.py")
s = p.read_text(encoding="utf-8")

# Add email imports if missing
if "from email.message import EmailMessage" not in s:
    s = s.replace("import os", "import os\nimport smtplib\nfrom email.message import EmailMessage", 1)

email_helper = r'''
def send_availability_email(req):
    smtp_host = os.getenv("SMTP_HOST", "").strip()
    smtp_port = int(os.getenv("SMTP_PORT", "587").strip() or "587")
    smtp_from = os.getenv("SMTP_FROM", "").strip()
    smtp_user = os.getenv("SMTP_USERNAME", "").strip()
    smtp_pass = os.getenv("SMTP_PASSWORD", "").strip()
    smtp_tls = os.getenv("SMTP_USE_TLS", "true").strip().lower() != "false"
    receiver = os.getenv("ADMIN_NOTIFICATION_EMAIL", "").strip() or SUPPORT_EMAIL

    if not smtp_host or not smtp_from or not smtp_user or not smtp_pass or not receiver:
        raise RuntimeError("SMTP email settings are incomplete.")

    hotel_name = getattr(req, "hotel_name", "") or getattr(req, "property", "") or getattr(req, "hotel", "") or getattr(req, "selected_hotel", "") or "Selected stay"
    customer_name = getattr(req, "name", "") or getattr(req, "customer_name", "")
    customer_email = getattr(req, "email", "") or getattr(req, "customer_email", "")
    message_text = getattr(req, "message", "") or getattr(req, "notes", "") or getattr(req, "special_requests", "")

    msg = EmailMessage()
    msg["Subject"] = f"New availability request - {hotel_name}"
    msg["From"] = smtp_from
    msg["To"] = receiver
    if customer_email:
        msg["Reply-To"] = customer_email

    msg.set_content(f"""New availability request

Hotel / stay:
{hotel_name}

Customer name:
{customer_name}

Customer email:
{customer_email}

Request:
{message_text}
""")

    with smtplib.SMTP(smtp_host, smtp_port, timeout=30) as server:
        if smtp_tls:
            server.starttls()
        server.login(smtp_user, smtp_pass)
        server.send_message(msg)

    return True
'''

if "def send_availability_email(req):" not in s:
    s = s.replace('SUPPORT_EMAIL = os.getenv("SUPPORT_EMAIL",\n    "reservations@myspace-hotel.com")', 'SUPPORT_EMAIL = os.getenv("SUPPORT_EMAIL",\n    "reservations@myspace-hotel.com")\n\n' + email_helper, 1)

new_route = r'''
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
        return {"ok": False, "email_sent": False, "message": "Request received but email could not be sent.", "error": str(e), "support_email": SUPPORT_EMAIL}
'''

s = re.sub(
    r'class AvailabilityRequest\(BaseModel\):[\s\S]*?@app\.post\("/api/request-availability"\)[\s\S]*?def request_availability\(req: AvailabilityRequest\):[\s\S]*?return \{[^\n]*SUPPORT_EMAIL\}',
    new_route.strip(),
    s
)

p.write_text(s, encoding="utf-8")
print("hotel_app.py updated to send real SMTP email.")
