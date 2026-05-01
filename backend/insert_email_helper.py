import re
from pathlib import Path

p = Path("hotel_app.py")
s = p.read_text(encoding="utf-8")

if "import smtplib" not in s:
    s = s.replace("import os", "import os\nimport smtplib\nfrom email.message import EmailMessage", 1)

helper = '''
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

    hotel_name = getattr(req, "hotel_name", "") or getattr(req, "property", "") or getattr(req, "selected_hotel", "") or "Selected stay"
    customer_name = getattr(req, "name", "") or ""
    customer_email = getattr(req, "email", "") or ""
    message_text = getattr(req, "message", "") or ""

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
    marker = "SUPPORT_EMAIL = os.getenv"
    pos = s.find(marker)
    line_end = s.find("\n", pos)
    s = s[:line_end+1] + "\n" + helper + "\n" + s[line_end+1:]

p.write_text(s, encoding="utf-8")
print("send_availability_email helper inserted.")
