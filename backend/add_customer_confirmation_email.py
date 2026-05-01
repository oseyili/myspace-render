from pathlib import Path
import re

p = Path("hotel_app.py")
s = p.read_text(encoding="utf-8")

new_helper = '''
def send_availability_email(req):
    resend_key = os.getenv("RESEND_API_KEY", "").strip()
    sender = os.getenv("RESEND_FROM", "onboarding@resend.dev").strip()
    receiver = os.getenv("RESERVATIONS_EMAIL", "").strip() or os.getenv("ADMIN_NOTIFICATION_EMAIL", "").strip() or SUPPORT_EMAIL

    if not resend_key:
        raise RuntimeError("RESEND_API_KEY is missing.")

    hotel_name = getattr(req, "hotel_name", "") or getattr(req, "property", "") or getattr(req, "selected_hotel", "") or "Selected stay"
    customer_name = getattr(req, "name", "") or ""
    customer_email = getattr(req, "email", "") or ""
    message_text = getattr(req, "message", "") or ""

    headers = {
        "Authorization": f"Bearer {resend_key}",
        "Content-Type": "application/json",
    }

    admin_payload = {
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
    }

    response = requests.post("https://api.resend.com/emails", headers=headers, json=admin_payload, timeout=30)
    if response.status_code >= 300:
        raise RuntimeError(f"Resend admin email failed: {response.status_code} {response.text[:300]}")

    if customer_email:
        customer_payload = {
            "from": sender,
            "to": [customer_email],
            "subject": f"We received your availability request - {hotel_name}",
            "html": f"""
            <h2>Your request has been received</h2>
            <p>Hello {customer_name or "there"},</p>
            <p>Thank you for contacting My Space Hotel.</p>
            <p>We have received your availability request for:</p>
            <p><b>{hotel_name}</b></p>
            <p>Our reservations team will review it and continue by email.</p>
            <p><b>Your message:</b><br>{message_text}</p>
            <p>Kind regards,<br>My Space Hotel Reservations</p>
            """,
        }

        customer_response = requests.post("https://api.resend.com/emails", headers=headers, json=customer_payload, timeout=30)
        if customer_response.status_code >= 300:
            raise RuntimeError(f"Resend customer email failed: {customer_response.status_code} {customer_response.text[:300]}")

    return True
'''

s = re.sub(
    r'def send_availability_email\(req\):[\s\S]*?    return True\n',
    new_helper + "\n",
    s
)

p.write_text(s, encoding="utf-8")
print("Customer confirmation email added.")
