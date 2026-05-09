from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uuid
import os
from datetime import datetime
from dotenv import load_dotenv
import stripe
import smtplib
from email.mime.text import MIMEText

load_dotenv()

app = FastAPI()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ENV
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
PUBLIC_APP_URL = os.getenv("PUBLIC_APP_URL", "http://localhost:5173")

SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")
SMTP_FROM = os.getenv("SMTP_FROM", "reservations@myspace-hotel.com")

stripe.api_key = STRIPE_SECRET_KEY

# MEMORY STORE (TEST MODE)
reservations = {}

# MODE SWITCH
AUTO_MODE = True  # <-- THIS ENABLES FULL AUTOMATION

class ReservationRequest(BaseModel):
    hotel_id: str
    hotel_name: str
    destination: str
    checkin: str
    checkout: str
    guests: int
    rooms: int
    customer_name: str
    customer_email: str
    customer_phone: str
    note: str = ""

def send_email(to_email, subject, body):
    if not SMTP_HOST or not SMTP_USER or not SMTP_PASS:
        return False

    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = SMTP_FROM
    msg["To"] = to_email

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(SMTP_FROM, [to_email], msg.as_string())
        return True
    except Exception as e:
        print("Email error:", e)
        return False

@app.get("/hotel-connectivity-status")
def status():
    return {
        "ready": True,
        "system": "MySpace Hotel AUTO MODE",
        "auto_mode": AUTO_MODE,
        "email_ready": bool(SMTP_USER and SMTP_PASS),
        "payment_links_ready": bool(STRIPE_SECRET_KEY),
        "rule": "FULLY AUTOMATED FLOW ENABLED"
    }

@app.post("/reservation-request")
def reservation_request(req: ReservationRequest):
    code = "MSH-" + datetime.now().strftime("%Y%m%d") + "-" + uuid.uuid4().hex[:6].upper()

    reservations[code] = {
        "data": req.dict(),
        "status": "AUTO_APPROVED" if AUTO_MODE else "PENDING",
        "created": str(datetime.now())
    }

    # AUTO MODE → immediately create payment link
    if AUTO_MODE:
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{
                "price_data": {
                    "currency": "gbp",
                    "product_data": {
                        "name": req.hotel_name,
                    },
                    "unit_amount": 50,  # £0.50 test
                },
                "quantity": 1,
            }],
            mode="payment",
            success_url=f"{PUBLIC_APP_URL}/reservation-confirmed?code={code}",
            cancel_url=f"{PUBLIC_APP_URL}",
        )

        reservations[code]["status"] = "PAYMENT_LINK_SENT"

        return {
            "ok": True,
            "reservation_code": code,
            "status": "AUTO_PAYMENT_READY",
            "payment_url": session.url
        }

    return {
        "ok": True,
        "reservation_code": code,
        "status": "PENDING"
    }

# STRIPE WEBHOOK (AUTO CONFIRM BOOKING)
@app.post("/stripe-webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    try:
        event = stripe.Event.construct_from(
            stripe.util.json.loads(payload), stripe.api_key
        )
    except Exception as e:
        return {"error": str(e)}

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]

        success_url = session.get("success_url", "")
        code = None

        if "code=" in success_url:
            code = success_url.split("code=")[-1]

        if code and code in reservations:
            reservations[code]["status"] = "CONFIRMED"

            customer_email = reservations[code]["data"]["customer_email"]
            hotel_name = reservations[code]["data"]["hotel_name"]

            send_email(
                customer_email,
                "Booking Confirmed - MySpace Hotel",
                f"""
Your booking is CONFIRMED.

Hotel: {hotel_name}
Reservation Code: {code}

Thank you for booking with MySpace Hotel.
"""
            )

    return {"status": "success"}

@app.get("/admin/reservations")
def get_reservations():
    return reservations