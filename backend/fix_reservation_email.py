import re
from pathlib import Path

p = Path("hotel_app.py")
s = p.read_text(encoding="utf-8")

email_block = r'''
# =========================================================
# RESERVATION EMAIL SUPPORT
# Uses environment variables only. Do not hard-code secrets.
# Required env:
# SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, RESERVATIONS_EMAIL
# =========================================================
import smtplib
from email.message import EmailMessage

def _env(name, default=""):
    import os
    return os.getenv(name, default).strip()

def send_reservation_email(payload: dict):
    smtp_host = _env("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(_env("SMTP_PORT", "587"))
    smtp_user = _env("SMTP_USER")
    smtp_pass = _env("SMTP_PASS")
    support_email = _env("RESERVATIONS_EMAIL", "reservations@myspace-hotel.com")

    if not smtp_user or not smtp_pass:
        raise RuntimeError("SMTP_USER or SMTP_PASS is missing in environment variables.")

    hotel_name = payload.get("hotel_name") or payload.get("property") or payload.get("property_name") or payload.get("selected_hotel") or "Selected stay"
    customer_name = payload.get("name") or payload.get("customer_name") or ""
    customer_email = payload.get("email") or payload.get("customer_email") or ""
    message_text = payload.get("message") or payload.get("special_requests") or payload.get("notes") or payload.get("request") or ""

    msg = EmailMessage()
    msg["Subject"] = f"New availability request - {hotel_name}"
    msg["From"] = smtp_user
    msg["To"] = support_email
    if customer_email:
        msg["Reply-To"] = customer_email

    msg.set_content(f"""New reservation availability request

Hotel / stay:
{hotel_name}

Customer name:
{customer_name}

Customer email:
{customer_email}

Request:
{message_text}

Full submitted payload:
{payload}
""")

    with smtplib.SMTP(smtp_host, smtp_port, timeout=30) as server:
        server.starttls()
        server.login(smtp_user, smtp_pass)
        server.send_message(msg)

    return True
'''

if "def send_reservation_email(payload: dict):" not in s:
    s = s.replace("from fastapi import", email_block + "\n\nfrom fastapi import", 1)

route_block = r'''
# =========================================================
# RESERVATION REQUEST ENDPOINTS
# =========================================================
@app.post("/api/reservation-request")
async def reservation_request(payload: dict):
    try:
        send_reservation_email(payload)
        return {"ok": True, "email_sent": True, "message": "Availability request sent."}
    except Exception as e:
        print("RESERVATION EMAIL ERROR:", str(e))
        return {"ok": False, "email_sent": False, "message": "Request was received but email could not be sent.", "error": str(e)}

@app.post("/api/request-availability")
async def request_availability(payload: dict):
    try:
        send_reservation_email(payload)
        return {"ok": True, "email_sent": True, "message": "Availability request sent."}
    except Exception as e:
        print("REQUEST AVAILABILITY EMAIL ERROR:", str(e))
        return {"ok": False, "email_sent": False, "message": "Request was received but email could not be sent.", "error": str(e)}
'''

for path in ["/api/reservation-request", "/api/request-availability"]:
    pattern = r'\n@app\.post\("' + re.escape(path) + r'"\)[\s\S]*?(?=\n@app\.|\n# ={10,}|\Z)'
    s = re.sub(pattern, "\n", s)

s = s.rstrip() + "\n\n" + route_block + "\n"

p.write_text(s, encoding="utf-8")
print("hotel_app.py email endpoints fixed.")
