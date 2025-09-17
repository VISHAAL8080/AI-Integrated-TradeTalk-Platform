from fastapi import APIRouter, HTTPException, Response, Request, Depends
from pydantic import BaseModel, EmailStr
from passlib.context import CryptContext
from jose import jwt, JWTError
from datetime import datetime, timedelta, timezone
import os, json
from pathlib import Path
from dotenv import load_dotenv
import shutil
from services.user_points_service import update_user_points

# Google token verification
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests

router = APIRouter()

# Simple file-based user store (support legacy filename user_db.json)
BASE_DIR = Path(__file__).resolve().parent.parent
# Use a dedicated data directory
DATA_DIR = BASE_DIR / 'data'
DATA_DIR.mkdir(exist_ok=True)

# Preferred path
primary = DATA_DIR / 'users_db.json'
# Legacy locations at backend root
legacy = BASE_DIR / 'user_db.json'
legacy2 = BASE_DIR / 'users_db.json'

# Migrate legacy to data dir if needed
if not primary.exists():
    src = None
    if legacy.exists():
        src = legacy
    elif legacy2.exists():
        src = legacy2
    if src is not None:
        try:
            shutil.move(str(src), str(primary))
        except Exception:
            try:
                shutil.copy2(str(src), str(primary))
            except Exception:
                pass

USERS_PATH = primary
USERS_PATH.touch(exist_ok=True)
if USERS_PATH.read_text().strip() == "":
    USERS_PATH.write_text(json.dumps({}))

pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

JWT_SECRET = os.environ.get("AUTH_SECRET", "dev-secret-change-me")
JWT_ALG = "HS256"
COOKIE_NAME = "access_token"
COOKIE_MAX_DAYS = 7

# Load environment for Google OAuth client id
load_dotenv()
GOOGLE_CLIENT_ID = os.environ.get("AUTH_GOOGLE_CLIENT_ID")

class SignupBody(BaseModel):
    fullName: str
    email: EmailStr
    password: str

class LoginBody(BaseModel):
    email: EmailStr
    password: str

class GoogleBody(BaseModel):
    idToken: str


def load_users():
    try:
        raw = json.loads(USERS_PATH.read_text())
        # Normalize legacy formats:
        # 1) { "users": [ { email, ... }, ... ] }
        # 2) [ { email, ... }, ... ]
        # into { email_lower: user_obj, ... }
        changed = False
        data = raw
        if isinstance(raw, dict) and 'users' in raw and isinstance(raw['users'], list):
            data = {}
            for u in raw['users']:
                if isinstance(u, dict) and 'email' in u:
                    key = (u.get('email') or '').lower()
                    if key:
                        data[key] = u
                        # Ensure email field is normalized lowercase
                        data[key]['email'] = key
            changed = True
        elif isinstance(raw, list):
            data = {}
            for u in raw:
                if isinstance(u, dict) and 'email' in u:
                    key = (u.get('email') or '').lower()
                    if key:
                        data[key] = u
                        data[key]['email'] = key
            changed = True
        elif isinstance(raw, dict):
            # If already a dict but keys are not emails, try to detect nested mapping by user_id etc.
            # Otherwise assume it's already normalized.
            pass

        # Persist normalized structure for consistency
        if changed and isinstance(data, dict):
            save_users(data)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def save_users(data: dict):
    USERS_PATH.write_text(json.dumps(data, indent=2))


def create_token(sub: str):
    now = datetime.now(timezone.utc)
    payload = {
        "sub": sub,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=COOKIE_MAX_DAYS)).timestamp()),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def get_user_from_token(token: str | None):
    if not token:
        return None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        sub = payload.get("sub")
        if not sub:
            return None
        users = load_users()
        user = users.get(sub)
        if not user:
            return None
        return {k: v for k, v in user.items() if k != 'password_hash'}
    except JWTError:
        return None


@router.post('/signup')
async def signup(body: SignupBody, response: Response):
    users = load_users()
    email_key = body.email.lower()
    if email_key in users:
        raise HTTPException(status_code=400, detail='Email already registered')
    users[email_key] = {
        'email': email_key,
        'name': body.fullName,
        'password_hash': pwd.hash(body.password),
    }
    save_users(users)
    token = create_token(email_key)
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        samesite='lax',
        secure=False,
        max_age=COOKIE_MAX_DAYS * 24 * 3600,
        path='/'
    )
    return { 'user': { 'email': email_key, 'name': body.fullName } }


@router.post('/login')
async def login(body: LoginBody, response: Response):
    users = load_users()
    email_key = body.email.lower()
    user = users.get(email_key)
    if not user or not pwd.verify(body.password, user.get('password_hash','')):
        raise HTTPException(status_code=401, detail='Invalid email or password')
    token = create_token(email_key)
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        samesite='lax',
        secure=False,
        max_age=COOKIE_MAX_DAYS * 24 * 3600,
        path='/'
    )
    return { 'user': { 'email': email_key, 'name': user.get('name') } }


@router.get('/me')
async def me(request: Request):
    token = request.cookies.get(COOKIE_NAME)
    user = get_user_from_token(token)
    if not user:
        raise HTTPException(status_code=401, detail='Not authenticated')
    # Recompute and persist up-to-date points, then merge into response
    try:
        snapshot = update_user_points(user.get('email'))
        # Merge snapshot into user dict for immediate visibility
        user = { **user, **snapshot }
    except Exception:
        # If points update fails, return user as-is
        pass
    return { 'user': user }


@router.get('/config')
async def auth_config():
    """Expose non-secret auth configuration to the frontend at runtime."""
    return {
        'googleClientId': GOOGLE_CLIENT_ID
    }


@router.post('/logout')
async def logout(response: Response):
    response.delete_cookie(COOKIE_NAME, path='/')
    return { 'ok': True }


@router.post('/google')
async def login_google(body: GoogleBody, response: Response):
    if not body.idToken:
        raise HTTPException(status_code=400, detail='Missing idToken')
    try:
        # Verify the ID token against our client id (audience)
        request = google_requests.Request()
        info = google_id_token.verify_oauth2_token(body.idToken, request, GOOGLE_CLIENT_ID)
        email = (info.get('email') or '').lower()
        name = info.get('name') or email.split('@')[0]
        if not email:
            raise HTTPException(status_code=400, detail='Invalid Google token')

        users = load_users()
        user = users.get(email)
        if not user:
            # Create a new user without password
            users[email] = { 'email': email, 'name': name, 'password_hash': '' }
            save_users(users)

        token = create_token(email)
        response.set_cookie(
            key=COOKIE_NAME,
            value=token,
            httponly=True,
            samesite='lax',
            secure=False,
            max_age=COOKIE_MAX_DAYS * 24 * 3600,
            path='/'
        )
        return { 'user': { 'email': email, 'name': name, 'provider': 'google' } }
    except ValueError:
        raise HTTPException(status_code=401, detail='Invalid Google ID token')
