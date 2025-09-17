from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from pathlib import Path
import json, shutil
from datetime import datetime, timezone

from api.auth import get_user_from_token, COOKIE_NAME
from services.user_points_service import update_user_points

router = APIRouter()

# Data directory for JSON databases
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / 'data'
DATA_DIR.mkdir(exist_ok=True)

# Prefer data dir; migrate legacy files if present at backend root
VIDEO_DB = DATA_DIR / 'video_db.json'
LEGACY_VIDEO_DB = BASE_DIR / 'video_db.json'
if not VIDEO_DB.exists() and LEGACY_VIDEO_DB.exists():
    try:
        shutil.move(str(LEGACY_VIDEO_DB), str(VIDEO_DB))
    except Exception:
        try:
            shutil.copy2(str(LEGACY_VIDEO_DB), str(VIDEO_DB))
        except Exception:
            pass

PURCHASES_DB = DATA_DIR / 'purchases_db.json'
LEGACY_PURCHASES_DB = BASE_DIR / 'purchases_db.json'
if not PURCHASES_DB.exists() and LEGACY_PURCHASES_DB.exists():
    try:
        shutil.move(str(LEGACY_PURCHASES_DB), str(PURCHASES_DB))
    except Exception:
        try:
            shutil.copy2(str(LEGACY_PURCHASES_DB), str(PURCHASES_DB))
        except Exception:
            pass
PURCHASES_DB.touch(exist_ok=True)
if PURCHASES_DB.read_text().strip() == "":
    PURCHASES_DB.write_text(json.dumps([]))


class PurchaseBody(BaseModel):
    video_id: int


def load_videos():
    try:
        if not VIDEO_DB.exists() or VIDEO_DB.stat().st_size == 0:
            return []
        return json.loads(VIDEO_DB.read_text() or "[]")
    except Exception:
        return []


def load_purchases():
    try:
        return json.loads(PURCHASES_DB.read_text() or "[]")
    except Exception:
        return []


def save_purchases(data: list):
    PURCHASES_DB.write_text(json.dumps(data, indent=2))


def _get_user_email(request: Request) -> str:
    token = request.cookies.get(COOKIE_NAME)
    user = get_user_from_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user.get("email")


def _compute_earned_points(email: str) -> int:
    """Sum points from accepted videos owned by this user."""
    videos = load_videos()
    total = 0
    for v in videos:
        if v.get("owner") == email and v.get("accepted") is True:
            p = v.get("points")
            if isinstance(p, (int, float)):
                total += int(p)
    return total


def _compute_spent_points(email: str) -> int:
    purchases = load_purchases()
    spent = 0
    for p in purchases:
        if p.get("user") == email:
            pts = p.get("points")
            if isinstance(pts, (int, float)):
                spent += int(pts)
    return spent


@router.get('/mine')
def list_my_purchases(request: Request):
    email = _get_user_email(request)
    purchases = [p for p in load_purchases() if p.get('user') == email]
    # Join with video details
    videos = {v.get('id'): v for v in load_videos()}
    enriched = []
    for p in purchases:
        v = videos.get(p.get('video_id'))
        if v:
            enriched.append({
                **p,
                'video': {
                    'id': v.get('id'),
                    'title': v.get('title'),
                    'desc': v.get('desc'),
                    'author': v.get('author'),
                    'owner': v.get('owner'),
                    'url': v.get('url'),
                    'duration': v.get('duration'),
                    'duration_seconds': v.get('duration_seconds'),
                    'points': v.get('points'),
                    'similarity_score': v.get('similarity_score'),
                }
            })
    return enriched


@router.get('/has/{video_id}')
def has_purchased(video_id: int, request: Request):
    email = _get_user_email(request)
    purchases = load_purchases()
    bought = any(p.get('user') == email and p.get('video_id') == video_id for p in purchases)
    return { 'purchased': bought }


@router.get('/spent')
def get_spent(request: Request):
    email = _get_user_email(request)
    spent = _compute_spent_points(email)
    return { 'email': email, 'spent_points': spent }


@router.post('/buy')
def buy_video(body: PurchaseBody, request: Request):
    email = _get_user_email(request)
    videos = load_videos()
    video = next((v for v in videos if v.get('id') == body.video_id), None)
    if not video:
        raise HTTPException(status_code=404, detail='Video not found')

    # Prevent buying own video
    if video.get('owner') == email:
        raise HTTPException(status_code=400, detail='Cannot purchase your own video')

    # Prevent double purchase
    purchases = load_purchases()
    if any(p.get('user') == email and p.get('video_id') == body.video_id for p in purchases):
        return { 'ok': True, 'alreadyPurchased': True }

    price = int(video.get('points') or 0)
    if price < 0:
        price = 0

    # Compute available balance: base (100) + earned - spent
    base = 100
    earned = _compute_earned_points(email)
    spent = _compute_spent_points(email)
    balance = base + earned - spent
    if balance < price:
        raise HTTPException(status_code=400, detail='Insufficient points to purchase this video')

    # Append purchase
    purchase = {
        'id': (purchases[-1]['id'] + 1) if purchases else 1,
        'user': email,
        'video_id': int(body.video_id),
        'points': price,
        'purchased_at': datetime.now(timezone.utc).isoformat()
    }
    purchases.append(purchase)
    save_purchases(purchases)

    # Persist updated totals for this user to users_db.json
    update_user_points(email)

    return { 'ok': True, 'purchase': purchase, 'balance_after': balance - price }
