from __future__ import annotations
from pathlib import Path
from datetime import datetime, timezone
import json

# Paths
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / 'data'
DATA_DIR.mkdir(exist_ok=True)
USERS_PATH = DATA_DIR / 'users_db.json'
VIDEOS_PATH = DATA_DIR / 'video_db.json'
PURCHASES_PATH = DATA_DIR / 'purchases_db.json'


def _load_json(path: Path, default):
    try:
        if not path.exists() or path.stat().st_size == 0:
            return default
        return json.loads(path.read_text() or json.dumps(default))
    except Exception:
        return default


def _save_json(path: Path, data):
    path.write_text(json.dumps(data, indent=2))


def compute_user_points(email: str) -> dict:
    """Compute the user's points snapshot from current DB state.
    Returns a dict with base_points, earned_points, spent_points, total_points.
    """
    email = (email or '').lower()
    videos = _load_json(VIDEOS_PATH, [])
    purchases = _load_json(PURCHASES_PATH, [])

    base_points = 100
    earned = 0
    for v in videos:
        if v.get('owner') == email and v.get('accepted') is True:
            p = v.get('points')
            if isinstance(p, (int, float)):
                earned += int(p)

    spent = 0
    for p in purchases:
        if p.get('user') == email:
            pts = p.get('points')
            if isinstance(pts, (int, float)):
                spent += int(pts)

    total = base_points + earned - spent
    return {
        'base_points': base_points,
        'earned_points': earned,
        'spent_points': spent,
        'total_points': total,
    }


def update_user_points(email: str) -> dict:
    """Compute and persist the user's points snapshot into users_db.json.
    Adds/updates fields on the user record and returns the snapshot.
    """
    email = (email or '').lower()
    snapshot = compute_user_points(email)
    users = _load_json(USERS_PATH, {})
    user = users.get(email) or {}
    user.update({
        'base_points': snapshot['base_points'],
        'earned_points': snapshot['earned_points'],
        'spent_points': snapshot['spent_points'],
        'total_points': snapshot['total_points'],
        'points_updated_at': datetime.now(timezone.utc).isoformat(),
    })
    users[email] = user
    _save_json(USERS_PATH, users)
    return snapshot
