import base64
import hashlib
import hmac
import json
import secrets
from datetime import UTC, datetime, timedelta


def utcnow() -> datetime:
    return datetime.now(UTC)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    salt_text = base64.urlsafe_b64encode(salt).decode()
    digest_text = base64.urlsafe_b64encode(digest).decode()
    return f"scrypt${salt_text}${digest_text}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, salt_value, expected_value = encoded.split("$", 2)
        if algorithm != "scrypt":
            return False
        salt = base64.urlsafe_b64decode(salt_value)
        expected = base64.urlsafe_b64decode(expected_value)
        actual = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def create_admin_token(username: str, secret: str, minutes: int) -> tuple[str, datetime]:
    expires_at = utcnow() + timedelta(minutes=minutes)
    payload = {"sub": username, "exp": int(expires_at.timestamp())}
    serialized = json.dumps(payload, separators=(",", ":")).encode()
    body = base64.urlsafe_b64encode(serialized).rstrip(b"=")
    signature = hmac.new(secret.encode(), body, hashlib.sha256).digest()
    token = f"{body.decode()}.{base64.urlsafe_b64encode(signature).rstrip(b'=').decode()}"
    return token, expires_at


def verify_admin_token(token: str, secret: str) -> str | None:
    try:
        body_value, signature_value = token.split(".", 1)
        body = body_value.encode()
        padding = "=" * (-len(signature_value) % 4)
        signature = base64.urlsafe_b64decode(signature_value + padding)
        expected = hmac.new(secret.encode(), body, hashlib.sha256).digest()
        if not hmac.compare_digest(signature, expected):
            return None
        body_padding = "=" * (-len(body_value) % 4)
        payload = json.loads(base64.urlsafe_b64decode(body_value + body_padding))
        if int(payload["exp"]) <= int(utcnow().timestamp()):
            return None
        return str(payload["sub"])
    except (ValueError, KeyError, TypeError, json.JSONDecodeError):
        return None
