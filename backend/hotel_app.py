import hashlib
import hmac
import ipaddress
import json
import os
import re
import sqlite3
import time
from contextlib import closing
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Literal, Optional

import stripe
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field

# =========================================================
# ENV / APP SETUP
# =========================================================

load_dotenv()

APP_NAME = "My Space Hotel Booking API"
APP_VERSION = "2026-04-21-risk-layers"

STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "").strip()
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "").strip()
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000").strip()

DB_PATH = os.getenv("BOOKING_DB_PATH", "hotel_app.db").strip()
RISK_HMAC_SECRET = os.getenv("RISK_HMAC_SECRET", "change-this-in-env").strip()

DEFAULT_CURRENCY = os.getenv("DEFAULT_CURRENCY", "gbp").strip().lower()
HIGH_VALUE_THRESHOLD = int(os.getenv("HIGH_VALUE_THRESHOLD", "80000"))  # minor units
FAILED_ATTEMPT_WINDOW_MINUTES = int(os.getenv("FAILED_ATTEMPT_WINDOW_MINUTES", "30"))
FAILED_ATTEMPT_BLOCK_COUNT = int(os.getenv("FAILED_ATTEMPT_BLOCK_COUNT", "3"))
NEW_USER_AGE_HOURS = int(os.getenv("NEW_USER_AGE_HOURS", "72"))
SAME_DAY_RISK_HOURS = int(os.getenv("SAME_DAY_RISK_HOURS", "24"))

if STRIPE_SECRET_KEY:
    stripe.api_key = STRIPE_SECRET_KEY

app = FastAPI(title=APP_NAME, version=APP_VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL, "http://127.0.0.1:3000", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================================================
# DISPOSABLE EMAIL DOMAINS
# Keep short and practical. You can expand later.
# =========================================================

DISPOSABLE_EMAIL_DOMAINS = {
    "mailinator.com",
    "guerrillamail.com",
    "10minutemail.com",
    "10minutemail.net",
    "temp-mail.org",
    "tempmail.com",
    "tempmailo.com",
    "yopmail.com",
    "fakeinbox.com",
    "sharklasers.com",
    "grr.la",
    "dispostable.com",
    "throwawaymail.com",
    "getnada.com",
    "maildrop.cc",
    "trashmail.com",
    "mintemail.com",
}

HIGH_RISK_CARD_COUNTRIES = {
    # Example starter set. Keep this configurable to your business needs.
    "NG",
    "GH",
    "PK",
}

HIGH_RISK_BIN_PREFIXES = {
    # Example placeholder BIN prefixes.
    # Replace with real risk intelligence / processor intelligence as needed.
    "400000",
    "411111",
    "424242",
}

# =========================================================
# DATABASE
# =========================================================

def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with closing(get_conn()) as conn:
        cur = conn.cursor()

        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                user_id TEXT PRIMARY KEY,
                email TEXT NOT NULL,
                created_at TEXT NOT NULL,
                email_verified INTEGER NOT NULL DEFAULT 0,
                twofa_enabled INTEGER NOT NULL DEFAULT 0,
                last_device_hash TEXT,
                last_ip_country TEXT
            )
            """
        )

        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS payment_attempts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL,
                user_id TEXT,
                booking_reference TEXT,
                email TEXT,
                email_domain TEXT,
                ip_address TEXT,
                ip_country TEXT,
                billing_country TEXT,
                card_country TEXT,
                card_bin TEXT,
                card_fingerprint_hash TEXT,
                device_hash TEXT,
                amount INTEGER NOT NULL,
                currency TEXT NOT NULL,
                processor TEXT NOT NULL,
                payment_intent_id TEXT,
                status TEXT NOT NULL,
                reason_codes TEXT NOT NULL,
                risk_score INTEGER NOT NULL DEFAULT 0,
                same_day_booking INTEGER NOT NULL DEFAULT 0,
                requires_review INTEGER NOT NULL DEFAULT 0,
                blocked INTEGER NOT NULL DEFAULT 0
            )
            """
        )

        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS manual_reviews (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL,
                booking_reference TEXT NOT NULL,
                user_id TEXT,
                payment_intent_id TEXT,
                status TEXT NOT NULL,
                risk_score INTEGER NOT NULL,
                reason_codes TEXT NOT NULL,
                payload_json TEXT NOT NULL
            )
            """
        )

        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS card_account_usage (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL,
                card_fingerprint_hash TEXT NOT NULL,
                user_id TEXT NOT NULL
            )
            """
        )

        conn.commit()


init_db()

# =========================================================
# HELPERS
# =========================================================

def now_utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def stable_hash(value: str) -> str:
    return hmac.new(
        RISK_HMAC_SECRET.encode("utf-8"),
        value.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def normalize_country(value: Optional[str]) -> str:
    if not value:
        return ""
    return value.strip().upper()


def parse_email_domain(email: str) -> str:
    return email.split("@", 1)[-1].strip().lower()


def is_temporary_email(email: str) -> bool:
    domain = parse_email_domain(email)
    return domain in DISPOSABLE_EMAIL_DOMAINS


def get_client_ip(request: Request, x_forwarded_for: Optional[str]) -> str:
    if x_forwarded_for:
        first_ip = x_forwarded_for.split(",")[0].strip()
        if first_ip:
            return first_ip
    if request.client and request.client.host:
        return request.client.host
    return "0.0.0.0"


def is_private_ip(ip: str) -> bool:
    try:
        return ipaddress.ip_address(ip).is_private
    except Exception:
        return False


def guess_ip_country(ip_country_header: Optional[str]) -> str:
    # In production, pass this from your trusted proxy / edge / CDN / Cloudflare header.
    return normalize_country(ip_country_header)


def booking_is_same_day(checkin_iso: str) -> bool:
    try:
        checkin = datetime.fromisoformat(checkin_iso.replace("Z", "+00:00"))
        current = datetime.now(timezone.utc)
        return (checkin - current) <= timedelta(hours=SAME_DAY_RISK_HOURS)
    except Exception:
        return False


def hours_since(iso_value: str) -> float:
    try:
        dt = datetime.fromisoformat(iso_value.replace("Z", "+00:00"))
        return (datetime.now(timezone.utc) - dt).total_seconds() / 3600
    except Exception:
        return 999999.0


def recent_failed_attempts_count(
    *,
    email: str,
    ip_address: str,
    device_hash: str,
    user_id: Optional[str],
) -> int:
    since = (datetime.now(timezone.utc) - timedelta(minutes=FAILED_ATTEMPT_WINDOW_MINUTES)).isoformat()
    with closing(get_conn()) as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT COUNT(*) AS total
            FROM payment_attempts
            WHERE created_at >= ?
              AND status IN ('failed', 'blocked')
              AND (
                    email = ?
                    OR ip_address = ?
                    OR device_hash = ?
                    OR (user_id IS NOT NULL AND user_id = ?)
                  )
            """,
            (since, email, ip_address, device_hash, user_id),
        )
        row = cur.fetchone()
        return int(row["total"] or 0)


def count_distinct_accounts_for_card(card_fingerprint_hash: str) -> int:
    if not card_fingerprint_hash:
        return 0
    with closing(get_conn()) as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT COUNT(DISTINCT user_id) AS total
            FROM card_account_usage
            WHERE card_fingerprint_hash = ?
            """,
            (card_fingerprint_hash,),
        )
        row = cur.fetchone()
        return int(row["total"] or 0)


def find_user(user_id: str) -> Optional[sqlite3.Row]:
    with closing(get_conn()) as conn:
        cur = conn.cursor()
        cur.execute("SELECT * FROM users WHERE user_id = ?", (user_id,))
        return cur.fetchone()


def upsert_user(
    user_id: str,
    email: str,
    email_verified: bool,
    twofa_enabled: bool,
    device_hash: str,
    ip_country: str,
) -> None:
    existing = find_user(user_id)
    if existing:
        with closing(get_conn()) as conn:
            cur = conn.cursor()
            cur.execute(
                """
                UPDATE users
                SET email = ?,
                    email_verified = ?,
                    twofa_enabled = ?,
                    last_device_hash = ?,
                    last_ip_country = ?
                WHERE user_id = ?
                """,
                (
                    email,
                    1 if email_verified else 0,
                    1 if twofa_enabled else 0,
                    device_hash,
                    ip_country,
                    user_id,
                ),
            )
            conn.commit()
    else:
        with closing(get_conn()) as conn:
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO users (
                    user_id, email, created_at, email_verified, twofa_enabled,
                    last_device_hash, last_ip_country
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    user_id,
                    email,
                    now_utc(),
                    1 if email_verified else 0,
                    1 if twofa_enabled else 0,
                    device_hash,
                    ip_country,
                ),
            )
            conn.commit()


def save_attempt(payload: Dict[str, Any]) -> int:
    with closing(get_conn()) as conn:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO payment_attempts (
                created_at, user_id, booking_reference, email, email_domain,
                ip_address, ip_country, billing_country, card_country, card_bin,
                card_fingerprint_hash, device_hash, amount, currency, processor,
                payment_intent_id, status, reason_codes, risk_score,
                same_day_booking, requires_review, blocked
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload["created_at"],
                payload.get("user_id"),
                payload.get("booking_reference"),
                payload.get("email"),
                payload.get("email_domain"),
                payload.get("ip_address"),
                payload.get("ip_country"),
                payload.get("billing_country"),
                payload.get("card_country"),
                payload.get("card_bin"),
                payload.get("card_fingerprint_hash"),
                payload.get("device_hash"),
                payload.get("amount"),
                payload.get("currency"),
                payload.get("processor"),
                payload.get("payment_intent_id"),
                payload.get("status"),
                json.dumps(payload.get("reason_codes", [])),
                payload.get("risk_score", 0),
                1 if payload.get("same_day_booking") else 0,
                1 if payload.get("requires_review") else 0,
                1 if payload.get("blocked") else 0,
            ),
        )
        conn.commit()
        return int(cur.lastrowid)


def create_manual_review(
    booking_reference: str,
    user_id: Optional[str],
    payment_intent_id: Optional[str],
    risk_score: int,
    reason_codes: List[str],
    payload: Dict[str, Any],
) -> None:
    with closing(get_conn()) as conn:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO manual_reviews (
                created_at, booking_reference, user_id, payment_intent_id,
                status, risk_score, reason_codes, payload_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                now_utc(),
                booking_reference,
                user_id,
                payment_intent_id,
                "pending",
                risk_score,
                json.dumps(reason_codes),
                json.dumps(payload),
            ),
        )
        conn.commit()


def record_card_usage(user_id: str, card_fingerprint_hash: str) -> None:
    if not user_id or not card_fingerprint_hash:
        return
    with closing(get_conn()) as conn:
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO card_account_usage (
                created_at, card_fingerprint_hash, user_id
            )
            VALUES (?, ?, ?)
            """,
            (now_utc(), card_fingerprint_hash, user_id),
        )
        conn.commit()


# =========================================================
# MODELS
# =========================================================

class BookingUser(BaseModel):
    user_id: str = Field(..., min_length=2)
    email: EmailStr
    email_verified: bool = False
    twofa_passed: bool = False
    account_created_at: Optional[str] = None


class BookingRequest(BaseModel):
    booking_reference: str = Field(..., min_length=3)
    hotel_id: str = Field(..., min_length=1)
    hotel_name: str = Field(..., min_length=1)
    checkin_date: str
    checkout_date: str
    amount: int = Field(..., gt=0)
    currency: str = Field(default=DEFAULT_CURRENCY, min_length=3, max_length=3)
    card_country: str = ""
    billing_country: str = ""
    card_bin: str = ""
    card_fingerprint: str = ""
    device_fingerprint: str = ""
    require_login: bool = True
    processor: Literal["stripe", "adyen"] = "stripe"
    user: Optional[BookingUser] = None


class PrecheckResponse(BaseModel):
    allowed: bool
    action: Literal["allow", "review", "block"]
    require_3ds: bool
    risk_score: int
    reason_codes: List[str]
    payment_status: Literal["proceed", "manual_review", "blocked"]


class CreatePaymentIntentResponse(BaseModel):
    status: Literal["requires_payment_method", "requires_action", "processing", "manual_review", "blocked"]
    payment_intent_id: Optional[str] = None
    client_secret: Optional[str] = None
    require_3ds: bool = False
    risk_score: int
    reason_codes: List[str]


# =========================================================
# RISK ENGINE
# =========================================================

def evaluate_risk(
    *,
    booking: BookingRequest,
    request: Request,
    ip_address: str,
    ip_country: str,
) -> Dict[str, Any]:
    reasons: List[str] = []
    risk_score = 0
    blocked = False
    requires_review = False
    require_3ds = False

    card_country = normalize_country(booking.card_country)
    billing_country = normalize_country(booking.billing_country)
    card_bin = booking.card_bin.strip()
    device_hash = stable_hash(booking.device_fingerprint or "no-device")
    card_fingerprint_hash = stable_hash(booking.card_fingerprint) if booking.card_fingerprint else ""

    same_day = booking_is_same_day(booking.checkin_date)
    temp_email = False
    failed_count = 0
    card_multi_account_count = 0
    new_user_high_value = False
    suspicious_device = False

    # Require login for bookings
    if booking.require_login and not booking.user:
        reasons.append("login_required")
        blocked = True
        risk_score += 100

    user_id = booking.user.user_id if booking.user else None
    email = booking.user.email if booking.user else "guest@invalid.local"

    if booking.user:
        temp_email = is_temporary_email(booking.user.email)
        if temp_email:
            reasons.append("temporary_email_domain")
            risk_score += 30
            requires_review = True

        if not booking.user.email_verified:
            reasons.append("email_not_verified")
            risk_score += 40
            blocked = True

        # Optional 2FA for riskier flows
        if booking.amount >= HIGH_VALUE_THRESHOLD and not booking.user.twofa_passed:
            reasons.append("high_value_without_2fa")
            risk_score += 25
            requires_review = True

        user_created_hours = 999999.0
        if booking.user.account_created_at:
            user_created_hours = hours_since(booking.user.account_created_at)
        else:
            existing_user = find_user(booking.user.user_id)
            if existing_user:
                user_created_hours = hours_since(existing_user["created_at"])

        if booking.amount >= HIGH_VALUE_THRESHOLD and user_created_hours <= NEW_USER_AGE_HOURS:
            reasons.append("high_value_new_user")
            risk_score += 35
            requires_review = True
            new_user_high_value = True

        existing_user = find_user(booking.user.user_id)
        if existing_user:
            last_device_hash = existing_user["last_device_hash"] or ""
            last_ip_country = existing_user["last_ip_country"] or ""
            if last_device_hash and last_device_hash != device_hash:
                reasons.append("device_change_detected")
                risk_score += 15
                suspicious_device = True
            if last_ip_country and ip_country and last_ip_country != ip_country:
                reasons.append("ip_country_changed")
                risk_score += 10

    if same_day:
        reasons.append("same_day_booking")
        risk_score += 25
        requires_review = True
        require_3ds = True

    if ip_country and card_country and ip_country != card_country:
        reasons.append("ip_country_card_country_mismatch")
        risk_score += 40
        require_3ds = True
        requires_review = True

    if billing_country and card_country and billing_country != card_country:
        reasons.append("billing_country_card_country_mismatch")
        risk_score += 25
        require_3ds = True

    if card_country in HIGH_RISK_CARD_COUNTRIES:
        reasons.append("high_risk_card_country")
        risk_score += 45
        require_3ds = True
        requires_review = True

    if any(card_bin.startswith(prefix) for prefix in HIGH_RISK_BIN_PREFIXES if prefix):
        reasons.append("high_risk_bin")
        risk_score += 50
        require_3ds = True
        requires_review = True

    failed_count = recent_failed_attempts_count(
        email=email,
        ip_address=ip_address,
        device_hash=device_hash,
        user_id=user_id,
    )
    if failed_count >= 1:
        reasons.append("recent_failed_payments")
        risk_score += 15
    if failed_count >= 2:
        reasons.append("multiple_recent_failed_payments")
        risk_score += 25
        require_3ds = True
        requires_review = True
    if failed_count >= FAILED_ATTEMPT_BLOCK_COUNT:
        reasons.append("kill_switch_failed_attempts")
        risk_score += 100
        blocked = True

    if card_fingerprint_hash:
        card_multi_account_count = count_distinct_accounts_for_card(card_fingerprint_hash)
        if booking.user and card_multi_account_count >= 1:
            reasons.append("same_card_seen_on_multiple_accounts")
            risk_score += 60
            blocked = True

    if suspicious_device:
        reasons.append("suspicious_device_fingerprint")
        risk_score += 30
        requires_review = True

    # Escalation thresholds
    if risk_score >= 80:
        require_3ds = True
        requires_review = True

    if risk_score >= 120:
        blocked = True

    action: Literal["allow", "review", "block"] = "allow"
    payment_status: Literal["proceed", "manual_review", "blocked"] = "proceed"

    if blocked:
        action = "block"
        payment_status = "blocked"
    elif requires_review:
        action = "review"
        payment_status = "manual_review"

    return {
        "user_id": user_id,
        "email": email,
        "email_domain": parse_email_domain(email),
        "ip_address": ip_address,
        "ip_country": ip_country,
        "billing_country": billing_country,
        "card_country": card_country,
        "card_bin": card_bin,
        "card_fingerprint_hash": card_fingerprint_hash,
        "device_hash": device_hash,
        "risk_score": risk_score,
        "reason_codes": sorted(set(reasons)),
        "same_day_booking": same_day,
        "require_3ds": require_3ds,
        "requires_review": requires_review,
        "blocked": blocked,
        "action": action,
        "payment_status": payment_status,
        "temp_email": temp_email,
        "failed_count": failed_count,
        "card_multi_account_count": card_multi_account_count,
        "new_user_high_value": new_user_high_value,
    }


# =========================================================
# ROUTES
# =========================================================

@app.get("/health")
def health() -> Dict[str, Any]:
    return {
        "ok": True,
        "app": APP_NAME,
        "version": APP_VERSION,
        "stripe_configured": bool(STRIPE_SECRET_KEY),
        "frontend_url": FRONTEND_URL,
    }


@app.post("/auth/upsert-user")
async def auth_upsert_user(
    payload: BookingUser,
    request: Request,
    x_ip_country: Optional[str] = Header(default=None),
) -> Dict[str, Any]:
    ip_country = guess_ip_country(x_ip_country)
    device_hash = stable_hash(request.headers.get("x-device-fingerprint", "no-device"))
    upsert_user(
        user_id=payload.user_id,
        email=payload.email,
        email_verified=payload.email_verified,
        twofa_enabled=payload.twofa_passed,
        device_hash=device_hash,
        ip_country=ip_country,
    )
    return {"ok": True}


@app.post("/payments/precheck", response_model=PrecheckResponse)
async def payments_precheck(
    booking: BookingRequest,
    request: Request,
    x_forwarded_for: Optional[str] = Header(default=None),
    x_ip_country: Optional[str] = Header(default=None),
) -> PrecheckResponse:
    ip_address = get_client_ip(request, x_forwarded_for)
    ip_country = guess_ip_country(x_ip_country)

    risk = evaluate_risk(
        booking=booking,
        request=request,
        ip_address=ip_address,
        ip_country=ip_country,
    )

    attempt_status = "blocked" if risk["blocked"] else ("review" if risk["requires_review"] else "prechecked")
    save_attempt(
        {
            "created_at": now_utc(),
            "user_id": risk["user_id"],
            "booking_reference": booking.booking_reference,
            "email": risk["email"],
            "email_domain": risk["email_domain"],
            "ip_address": risk["ip_address"],
            "ip_country": risk["ip_country"],
            "billing_country": risk["billing_country"],
            "card_country": risk["card_country"],
            "card_bin": risk["card_bin"],
            "card_fingerprint_hash": risk["card_fingerprint_hash"],
            "device_hash": risk["device_hash"],
            "amount": booking.amount,
            "currency": booking.currency.lower(),
            "processor": booking.processor,
            "payment_intent_id": None,
            "status": attempt_status,
            "reason_codes": risk["reason_codes"],
            "risk_score": risk["risk_score"],
            "same_day_booking": risk["same_day_booking"],
            "requires_review": risk["requires_review"],
            "blocked": risk["blocked"],
        }
    )

    if risk["requires_review"] and not risk["blocked"]:
        create_manual_review(
            booking_reference=booking.booking_reference,
            user_id=risk["user_id"],
            payment_intent_id=None,
            risk_score=risk["risk_score"],
            reason_codes=risk["reason_codes"],
            payload=booking.model_dump(),
        )

    return PrecheckResponse(
        allowed=not risk["blocked"],
        action=risk["action"],
        require_3ds=risk["require_3ds"],
        risk_score=risk["risk_score"],
        reason_codes=risk["reason_codes"],
        payment_status=risk["payment_status"],
    )


@app.post("/payments/create-intent", response_model=CreatePaymentIntentResponse)
async def payments_create_intent(
    booking: BookingRequest,
    request: Request,
    x_forwarded_for: Optional[str] = Header(default=None),
    x_ip_country: Optional[str] = Header(default=None),
) -> CreatePaymentIntentResponse:
    if booking.processor != "stripe":
        raise HTTPException(
            status_code=400,
            detail="This backend replacement is configured for Stripe payment intent flow.",
        )

    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=500, detail="Stripe secret key is not configured.")

    ip_address = get_client_ip(request, x_forwarded_for)
    ip_country = guess_ip_country(x_ip_country)

    risk = evaluate_risk(
        booking=booking,
        request=request,
        ip_address=ip_address,
        ip_country=ip_country,
    )

    if risk["blocked"]:
        save_attempt(
            {
                "created_at": now_utc(),
                "user_id": risk["user_id"],
                "booking_reference": booking.booking_reference,
                "email": risk["email"],
                "email_domain": risk["email_domain"],
                "ip_address": risk["ip_address"],
                "ip_country": risk["ip_country"],
                "billing_country": risk["billing_country"],
                "card_country": risk["card_country"],
                "card_bin": risk["card_bin"],
                "card_fingerprint_hash": risk["card_fingerprint_hash"],
                "device_hash": risk["device_hash"],
                "amount": booking.amount,
                "currency": booking.currency.lower(),
                "processor": booking.processor,
                "payment_intent_id": None,
                "status": "blocked",
                "reason_codes": risk["reason_codes"],
                "risk_score": risk["risk_score"],
                "same_day_booking": risk["same_day_booking"],
                "requires_review": risk["requires_review"],
                "blocked": True,
            }
        )
        return CreatePaymentIntentResponse(
            status="blocked",
            payment_intent_id=None,
            client_secret=None,
            require_3ds=risk["require_3ds"],
            risk_score=risk["risk_score"],
            reason_codes=risk["reason_codes"],
        )

    if risk["requires_review"]:
        create_manual_review(
            booking_reference=booking.booking_reference,
            user_id=risk["user_id"],
            payment_intent_id=None,
            risk_score=risk["risk_score"],
            reason_codes=risk["reason_codes"],
            payload=booking.model_dump(),
        )
        save_attempt(
            {
                "created_at": now_utc(),
                "user_id": risk["user_id"],
                "booking_reference": booking.booking_reference,
                "email": risk["email"],
                "email_domain": risk["email_domain"],
                "ip_address": risk["ip_address"],
                "ip_country": risk["ip_country"],
                "billing_country": risk["billing_country"],
                "card_country": risk["card_country"],
                "card_bin": risk["card_bin"],
                "card_fingerprint_hash": risk["card_fingerprint_hash"],
                "device_hash": risk["device_hash"],
                "amount": booking.amount,
                "currency": booking.currency.lower(),
                "processor": booking.processor,
                "payment_intent_id": None,
                "status": "review",
                "reason_codes": risk["reason_codes"],
                "risk_score": risk["risk_score"],
                "same_day_booking": risk["same_day_booking"],
                "requires_review": True,
                "blocked": False,
            }
        )
        return CreatePaymentIntentResponse(
            status="manual_review",
            payment_intent_id=None,
            client_secret=None,
            require_3ds=risk["require_3ds"],
            risk_score=risk["risk_score"],
            reason_codes=risk["reason_codes"],
        )

    metadata = {
        "booking_reference": booking.booking_reference,
        "hotel_id": booking.hotel_id,
        "hotel_name": booking.hotel_name[:400],
        "checkin_date": booking.checkin_date,
        "checkout_date": booking.checkout_date,
        "user_id": risk["user_id"] or "",
        "ip_country": risk["ip_country"],
        "card_country": risk["card_country"],
        "billing_country": risk["billing_country"],
        "risk_score": str(risk["risk_score"]),
        "risk_reasons": ",".join(risk["reason_codes"])[:500],
        "same_day_booking": "1" if risk["same_day_booking"] else "0",
    }

    try:
        intent = stripe.PaymentIntent.create(
            amount=booking.amount,
            currency=booking.currency.lower(),
            metadata=metadata,
            automatic_payment_methods={"enabled": True},
            confirmation_method="automatic",
            capture_method="automatic",
            payment_method_options={
                "card": {
                    "request_three_d_secure": "any" if risk["require_3ds"] else "automatic"
                }
            },
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Stripe PaymentIntent creation failed: {exc}")

    save_attempt(
        {
            "created_at": now_utc(),
            "user_id": risk["user_id"],
            "booking_reference": booking.booking_reference,
            "email": risk["email"],
            "email_domain": risk["email_domain"],
            "ip_address": risk["ip_address"],
            "ip_country": risk["ip_country"],
            "billing_country": risk["billing_country"],
            "card_country": risk["card_country"],
            "card_bin": risk["card_bin"],
            "card_fingerprint_hash": risk["card_fingerprint_hash"],
            "device_hash": risk["device_hash"],
            "amount": booking.amount,
            "currency": booking.currency.lower(),
            "processor": booking.processor,
            "payment_intent_id": intent["id"],
            "status": "requires_payment_method",
            "reason_codes": risk["reason_codes"],
            "risk_score": risk["risk_score"],
            "same_day_booking": risk["same_day_booking"],
            "requires_review": False,
            "blocked": False,
        }
    )

    return CreatePaymentIntentResponse(
        status=intent["status"],
        payment_intent_id=intent["id"],
        client_secret=intent["client_secret"],
        require_3ds=risk["require_3ds"],
        risk_score=risk["risk_score"],
        reason_codes=risk["reason_codes"],
    )


@app.post("/payments/webhook")
async def stripe_webhook(request: Request) -> Dict[str, Any]:
    if not STRIPE_WEBHOOK_SECRET:
        raise HTTPException(status_code=500, detail="Stripe webhook secret is not configured.")

    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    try:
        event = stripe.Webhook.construct_event(
            payload=payload,
            sig_header=sig_header,
            secret=STRIPE_WEBHOOK_SECRET,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid webhook: {exc}")

    event_type = event["type"]
    obj = event["data"]["object"]

    if event_type == "payment_intent.succeeded":
        payment_intent_id = obj.get("id")
        metadata = obj.get("metadata", {})
        booking_reference = metadata.get("booking_reference", "")
        user_id = metadata.get("user_id", "")

        payment_method = obj.get("payment_method")
        card_fingerprint_hash = ""

        try:
            if payment_method:
                pm = stripe.PaymentMethod.retrieve(payment_method)
                fingerprint = (((pm or {}).get("card") or {}).get("fingerprint") or "").strip()
                if fingerprint:
                    card_fingerprint_hash = stable_hash(fingerprint)
        except Exception:
            pass

        if user_id and card_fingerprint_hash:
            record_card_usage(user_id=user_id, card_fingerprint_hash=card_fingerprint_hash)

        save_attempt(
            {
                "created_at": now_utc(),
                "user_id": user_id or None,
                "booking_reference": booking_reference,
                "email": "",
                "email_domain": "",
                "ip_address": "",
                "ip_country": metadata.get("ip_country", ""),
                "billing_country": metadata.get("billing_country", ""),
                "card_country": metadata.get("card_country", ""),
                "card_bin": "",
                "card_fingerprint_hash": card_fingerprint_hash,
                "device_hash": "",
                "amount": int(obj.get("amount", 0)),
                "currency": (obj.get("currency") or DEFAULT_CURRENCY).lower(),
                "processor": "stripe",
                "payment_intent_id": payment_intent_id,
                "status": "succeeded",
                "reason_codes": [],
                "risk_score": int(metadata.get("risk_score", "0") or "0"),
                "same_day_booking": metadata.get("same_day_booking") == "1",
                "requires_review": False,
                "blocked": False,
            }
        )

    elif event_type == "payment_intent.payment_failed":
        payment_intent_id = obj.get("id")
        metadata = obj.get("metadata", {})
        save_attempt(
            {
                "created_at": now_utc(),
                "user_id": metadata.get("user_id") or None,
                "booking_reference": metadata.get("booking_reference", ""),
                "email": "",
                "email_domain": "",
                "ip_address": "",
                "ip_country": metadata.get("ip_country", ""),
                "billing_country": metadata.get("billing_country", ""),
                "card_country": metadata.get("card_country", ""),
                "card_bin": "",
                "card_fingerprint_hash": "",
                "device_hash": "",
                "amount": int(obj.get("amount", 0)),
                "currency": (obj.get("currency") or DEFAULT_CURRENCY).lower(),
                "processor": "stripe",
                "payment_intent_id": payment_intent_id,
                "status": "failed",
                "reason_codes": ["processor_payment_failed"],
                "risk_score": int(metadata.get("risk_score", "0") or "0"),
                "same_day_booking": metadata.get("same_day_booking") == "1",
                "requires_review": False,
                "blocked": False,
            }
        )

    return {"received": True, "type": event_type}


@app.get("/risk/manual-reviews")
def list_manual_reviews() -> Dict[str, Any]:
    with closing(get_conn()) as conn:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT id, created_at, booking_reference, user_id, payment_intent_id,
                   status, risk_score, reason_codes
            FROM manual_reviews
            WHERE status = 'pending'
            ORDER BY id DESC
            LIMIT 100
            """
        )
        rows = [dict(row) for row in cur.fetchall()]
        return {"items": rows}


@app.post("/risk/manual-reviews/{review_id}/approve")
def approve_manual_review(review_id: int) -> Dict[str, Any]:
    with closing(get_conn()) as conn:
        cur = conn.cursor()
        cur.execute(
            "UPDATE manual_reviews SET status = 'approved' WHERE id = ?",
            (review_id,),
        )
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Manual review not found.")
    return {"ok": True, "review_id": review_id, "status": "approved"}


@app.post("/risk/manual-reviews/{review_id}/reject")
def reject_manual_review(review_id: int) -> Dict[str, Any]:
    with closing(get_conn()) as conn:
        cur = conn.cursor()
        cur.execute(
            "UPDATE manual_reviews SET status = 'rejected' WHERE id = ?",
            (review_id,),
        )
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Manual review not found.")
    return {"ok": True, "review_id": review_id, "status": "rejected"}