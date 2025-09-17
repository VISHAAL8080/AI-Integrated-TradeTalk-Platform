from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import List, Literal, Optional
import os
import json
from pathlib import Path
from datetime import datetime, timezone

from api.auth import get_user_from_token, COOKIE_NAME

# Gemini
import google.generativeai as genai

router = APIRouter()

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / 'data'
USERS_PATH = DATA_DIR / 'users_db.json'
VIDEOS_PATH = DATA_DIR / 'video_db.json'
PURCHASES_PATH = DATA_DIR / 'purchases_db.json'

# Centralized chat DB (single file)
CHAT_DB_PATH = DATA_DIR / 'chat_db.json'
if not CHAT_DB_PATH.exists():
    CHAT_DB_PATH.write_text(json.dumps({"users": []}, indent=2))


class ChatMessage(BaseModel):
    role: Literal['user', 'assistant', 'system']
    content: str


class ChatBody(BaseModel):
    messages: List[ChatMessage]


def _load_json(path: Path, default):
    try:
        if not path.exists() or path.stat().st_size == 0:
            return default
        return json.loads(path.read_text() or json.dumps(default))
    except Exception:
        return default


def _get_env_api_key() -> Optional[str]:
    return os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")


def _build_user_context(email: str) -> dict:
    users = _load_json(USERS_PATH, {})
    videos = _load_json(VIDEOS_PATH, [])
    purchases = _load_json(PURCHASES_PATH, [])

    user = users.get(email) or {}

    my_teached = [v for v in videos if v.get('owner') == email and v.get('accepted') is True]
    my_teached_sorted = sorted(my_teached, key=lambda v: v.get('id') or 0, reverse=True)[:10]

    my_purchases = [p for p in purchases if p.get('user') == email]
    by_id = {v.get('id'): v for v in videos}
    purchased_videos = [by_id.get(p.get('video_id')) for p in my_purchases if by_id.get(p.get('video_id'))]
    purchased_videos_sorted = sorted(purchased_videos, key=lambda v: v.get('id') or 0, reverse=True)[:10]

    purchased_ids = {v.get('id') for v in purchased_videos if v}

    candidates = [
        v for v in videos
        if v.get('accepted') is True
        and v.get('owner') != email
        and v.get('id') not in purchased_ids
    ]

    if not candidates:
        bases = [*(v.get('title') for v in my_teached_sorted if v), *(v.get('title') for v in purchased_videos_sorted if v)]
        bases = [b for b in bases if isinstance(b, str) and b.strip()]
        seen = set()
        synth = []
        for b in bases:
            for suffix in ["Advanced", "Applications", "Project Lab", "Foundations", "Capstone"]:
                title = f"{b} — {suffix}"
                if title in seen:
                    continue
                seen.add(title)
                synth.append({
                    'id': None,
                    'title': title,
                    'desc': f"A continuation module focusing on {suffix.lower()} of {b}.",
                    'author': None,
                    'owner': None,
                    'points': None,
                    'duration': None,
                })
                if len(synth) >= 8:
                    break
            if len(synth) >= 8:
                break
        candidates = synth

    def _summ(v):
        return {
            'id': v.get('id'),
            'title': v.get('title'),
            'desc': v.get('desc'),
            'author': v.get('author'),
            'owner': v.get('owner'),
            'points': v.get('points'),
            'duration': v.get('duration'),
        }

    ctx = {
        'user': {
            'email': email,
            'name': user.get('name'),
            'earned_points': user.get('earned_points'),
            'spent_points': user.get('spent_points'),
            'total_points': user.get('total_points'),
        },
        'recent_purchases': list(map(_summ, purchased_videos_sorted)),
        'recent_teached': list(map(_summ, my_teached_sorted)),
        'candidate_courses': list(map(_summ, candidates[:50])),
    }
    return ctx


SYSTEM_INSTRUCTIONS = (
    "You are an AI assistant for a learning platform. Your tasks: "
    "(1) Recommend realistic student projects based on the user's recently purchased and their teached courses. "
    "(2) Recommend NEXT courses tailored to the user. Do NOT recommend any course the user already purchased. Prefer the candidate_courses list provided in context. "
    "(3) Answer general questions helpfully. Keep answers concise and actionable. "
    "Never ask the user for candidate lists or any data that is already provided in context. If candidate_courses is empty, infer suitable next-course ideas yourself."
)


JSON_SCHEMA_INSTRUCTIONS = (
    "Output ONLY JSON with this schema (no extra text):\n" \
    "{\n" \
    "  \"project_recommendations\": [\n" \
    "    { \"title\": string, \"why\": string, \"steps\": [string] }\n" \
    "  ],\n" \
    "  \"next_course_recommendations\": [\n" \
    "    { \"id\": number | null, \"title\": string, \"why\": string, \"points\": number | null }\n" \
    "  ],\n" \
    "  \"answer\": string\n" \
    "}\n" \
    "Rules:\n- Use candidate_courses if available and exclude any in recent_purchases.\n- If recommending a next course, include its id if present in candidates.\n- If candidate_courses is empty, still produce next_course_recommendations inferred from user history (id=null, points=null allowed).\n- Keep arrays to at most 5 items each.\n- Do NOT ask the user to provide candidates.\n"
)


# ---------- chat_db.json array-based schema helpers ----------

def _normalize_chat_db(db: dict) -> dict:
    """Normalize legacy formats into the new { users: [ { user_id, user_name, conversations: [...] } ] }."""
    if not isinstance(db, dict):
        return {"users": []}
    # Already new format
    if isinstance(db.get("users"), list):
        # Ensure shapes
        users_arr = []
        for u in db.get("users", []):
            if not isinstance(u, dict):
                continue
            if not isinstance(u.get("conversations"), list):
                u["conversations"] = []
            u["user_id"] = u.get("user_id") or ""
            u["user_name"] = u.get("user_name") or ""
            users_arr.append(u)
        return {"users": users_arr}
    # Legacy map keyed by email -> { user_id/user_name/messages } OR { 'user name'/'user main_id'/messages }
    users_arr = []
    for email, obj in db.items():
        try:
            if not isinstance(obj, dict):
                continue
            # If old flat schema had messages, wrap into a single conversation
            messages = obj.get("messages") if isinstance(obj.get("messages"), list) else []
            user_id = obj.get("user_id") or obj.get("user main_id") or email
            user_name = obj.get("user_name") or obj.get("user name") or ""
            conversations = obj.get("conversations")
            if not isinstance(conversations, list):
                conversations = [{"conversation_id": "conv_legacy", "messages": messages}]
            users_arr.append({
                "user_id": user_id,
                "user_name": user_name,
                "conversations": conversations,
            })
        except Exception:
            continue
    return {"users": users_arr}


def _load_chat_db() -> dict:
    db = _load_json(CHAT_DB_PATH, {"users": []})
    db = _normalize_chat_db(db)
    return db


def _save_chat_db(db: dict) -> None:
    try:
        normalized = _normalize_chat_db(db)
        CHAT_DB_PATH.write_text(json.dumps(normalized, indent=2))
    except Exception:
        pass


def _find_or_create_user(db: dict, user_id: str, user_name: str) -> dict:
    users = db.get("users", [])
    for u in users:
        if isinstance(u, dict) and u.get("user_id") == user_id:
            # Ensure fields
            if not isinstance(u.get("conversations"), list):
                u["conversations"] = []
            if not u.get("user_name"):
                u["user_name"] = user_name or u.get("user_name") or ""
            return u
    # Create new
    new_u = {"user_id": user_id, "user_name": user_name or "", "conversations": []}
    users.append(new_u)
    db["users"] = users
    return new_u


def _gen_msg_id(prefix: str, idx: int) -> str:
    ts = datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')
    return f"{prefix}_{ts}_{idx:03d}"


def _gen_conv_id() -> str:
    return f"conv_{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"


def _append_messages_to_latest_conversation(user_obj: dict, new_messages: List[dict]) -> None:
    conversations = user_obj.get("conversations")
    if not isinstance(conversations, list) or len(conversations) == 0:
        conversations = [{"conversation_id": _gen_conv_id(), "messages": []}]
        user_obj["conversations"] = conversations
    last_conv = conversations[-1]
    msgs = last_conv.get("messages") if isinstance(last_conv.get("messages"), list) else []
    msgs.extend(new_messages)
    last_conv["messages"] = msgs


@router.post('/chat')
async def chat(request: Request, body: ChatBody):
    token = request.cookies.get(COOKIE_NAME)
    user = get_user_from_token(token)
    if not user:
        raise HTTPException(status_code=401, detail='Not authenticated')

    api_key = _get_env_api_key()
    if not api_key:
        raise HTTPException(status_code=500, detail='Missing GEMINI_API_KEY/GOOGLE_API_KEY')

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel('gemini-1.5-flash')

    email = user.get('email')
    name = user.get('name')
    context = _build_user_context(email)

    context_block = (
        "CONTEXT:\n"
        f"User: {context['user']}\n"
        f"RecentPurchases: {context['recent_purchases']}\n"
        f"RecentTeached: {context['recent_teached']}\n"
        f"Candidates: {context['candidate_courses']}\n"
        "Rules: Never recommend a course that is already in RecentPurchases. Never ask the user for candidates; use provided candidates or infer."
    )

    convo_text = [f"System: {SYSTEM_INSTRUCTIONS}", context_block]
    for m in body.messages:
        role = 'User' if m.role == 'user' else 'Assistant' if m.role == 'assistant' else 'System'
        convo_text.append(f"{role}: {m.content}")
    prompt = "\n\n".join(convo_text)

    try:
        resp = model.generate_content(prompt)
        text = resp.text or ""
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Gemini error: {e}")

    now_iso = datetime.now(timezone.utc).isoformat()
    to_append: List[dict] = []
    last_user_msg = next((m for m in reversed(body.messages) if m.role == 'user'), None)
    if last_user_msg is not None:
        to_append.append({
            'id': _gen_msg_id('msg', 1),
            'timestamp': now_iso,
            'role': 'user',
            'content': last_user_msg.content,
        })
    to_append.append({
        'id': _gen_msg_id('msg', 2),
        'timestamp': now_iso,
        'role': 'assistant',
        'content': text,
    })

    # Append to centralized DB (array schema)
    try:
        db = _load_chat_db()
        u = _find_or_create_user(db, email, name or "")
        _append_messages_to_latest_conversation(u, to_append)
        _save_chat_db(db)
    except Exception:
        pass

    return {
        'reply': text,
        'context_used': {
            'recent_purchases_count': len(context['recent_purchases']),
            'recent_teached_count': len(context['recent_teached']),
            'candidate_count': len(context['candidate_courses']),
        }
    }


@router.get('/logs/mine')
async def get_my_logs(request: Request):
    token = request.cookies.get(COOKIE_NAME)
    user = get_user_from_token(token)
    if not user:
        raise HTTPException(status_code=401, detail='Not authenticated')
    email = user.get('email')
    name = user.get('name')

    db = _load_chat_db()
    u = _find_or_create_user(db, email, name or "")
    _save_chat_db(db)  # ensure normalization persisted
    return u


@router.delete('/logs/mine')
async def clear_my_logs(request: Request):
    token = request.cookies.get(COOKIE_NAME)
    user = get_user_from_token(token)
    if not user:
        raise HTTPException(status_code=401, detail='Not authenticated')
    email = user.get('email')
    name = user.get('name')

    try:
        db = _load_chat_db()
        u = _find_or_create_user(db, email, name or "")
        u['conversations'] = []
        _save_chat_db(db)
    except Exception:
        pass

    return { 'ok': True }
