from fastapi import APIRouter, UploadFile, File, Form, Request, HTTPException
from fastapi.responses import FileResponse
import os, json, subprocess, shutil
from pathlib import Path
from services.whisper_service import transcribe_video
from services.similarity_service import compute_similarity
from services.points_service import compute_points
from services.user_points_service import update_user_points
from api.auth import get_user_from_token, COOKIE_NAME

router = APIRouter()

# Data directory for JSON databases
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

VIDEO_DIR = Path("uploaded_videos")
VIDEO_DIR.mkdir(exist_ok=True)

# Prefer data dir; migrate legacy file if needed
VIDEO_DB = DATA_DIR / "video_db.json"
LEGACY_VIDEO_DB = BASE_DIR / "video_db.json"
if not VIDEO_DB.exists() and LEGACY_VIDEO_DB.exists():
    try:
        shutil.move(str(LEGACY_VIDEO_DB), str(VIDEO_DB))
    except Exception:
        # Fallback to copy if move fails (e.g., cross-device)
        try:
            shutil.copy2(str(LEGACY_VIDEO_DB), str(VIDEO_DB))
        except Exception:
            pass


def load_videos():
    if not VIDEO_DB.exists() or VIDEO_DB.stat().st_size == 0:
        return []
    try:
        content = VIDEO_DB.read_text()
        return json.loads(content or "[]")
    except json.JSONDecodeError:
        return []


def save_videos(videos):
    VIDEO_DB.write_text(json.dumps(videos, indent=2))


# Removed _compute_points; points are now computed via services.points_service.compute_points


def _probe_duration_seconds(file_path: Path) -> float | None:
    """Use ffprobe to get duration in seconds as float. Returns None if unavailable."""
    try:
        # ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 file
        result = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(file_path),
            ],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode != 0:
            return None
        val = (result.stdout or "").strip()
        if not val:
            return None
        seconds = float(val)
        if seconds <= 0:
            return None
        return seconds
    except Exception:
        return None


def _format_duration(seconds: float | int | None) -> str:
    if seconds is None or seconds <= 0:
        return "00:00"
    s = int(round(seconds))
    h = s // 3600
    m = (s % 3600) // 60
    sec = s % 60
    if h > 0:
        return f"{h}:{m:02d}:{sec:02d}"
    return f"{m:02d}:{sec:02d}"


def _ensure_duration_fields(video: dict) -> bool:
    """Ensure `duration` (formatted) and `duration_seconds` exist when file is present.
    Returns True if the object was modified.
    """
    url = str(video.get("url") or "")
    filename = url.rsplit("/", 1)[-1] if "/" in url else url
    if not filename:
        return False
    file_path = VIDEO_DIR / filename
    if not file_path.exists():
        return False
    # Only compute if missing or clearly a placeholder
    dur_sec = video.get("duration_seconds")
    dur_str = str(video.get("duration") or "")
    need = False
    if not isinstance(dur_sec, (int, float)) or dur_sec <= 0:
        need = True
    if not dur_str or dur_str.count(":") == 1 and dur_str == "2:30":  # previous placeholder
        need = True
    if not need:
        return False
    seconds = _probe_duration_seconds(file_path)
    if seconds is None:
        return False
    video["duration_seconds"] = round(float(seconds), 2)
    video["duration"] = _format_duration(seconds)
    return True


@router.post("/check")
async def check_similarity(request: Request, course: str = Form(...), file: UploadFile = File(...)):
    # Resolve current user from cookie (Teach page is protected, so this should exist)
    token = request.cookies.get(COOKIE_NAME)
    user = get_user_from_token(token)
    owner_email = user.get("email") if user else None
    owner_name = user.get("name") if user else "Anonymous"

    # Ensure the file pointer is at the start for transcription
    await file.seek(0)
    # Step 1: Transcribe video
    transcript = transcribe_video(file)

    # Step 2: Compare transcript vs course name
    score = compute_similarity(course, transcript)
    accepted = score >= 0.3

    # Step 3: Always save file & metadata (even if similarity is low)
    file_path = VIDEO_DIR / file.filename
    # Rewind before saving because the stream was consumed during transcription
    await file.seek(0)
    with open(file_path, "wb") as f:
        f.write(await file.read())

    # Probe precise duration
    seconds = _probe_duration_seconds(file_path)
    duration_fmt = _format_duration(seconds if seconds is not None else 0)

    videos = load_videos()
    video_data = {
        "id": len(videos) + 1,
        "title": course,
        "desc": f"Course video on {course}",
        "author": owner_name,
        "owner": owner_email,  # used for filtering per user
        # Include the similarity router prefix
        "url": f"/api/similarity/videos/{file.filename}",
        "duration": duration_fmt,
        "duration_seconds": round(float(seconds), 2) if seconds is not None else None,
        "points": compute_points(score),
        "similarity_score": score,
        "accepted": accepted,
    }
    videos.append(video_data)
    save_videos(videos)

    # Persist updated totals for the owner
    if owner_email:
        try:
            update_user_points(owner_email)
        except Exception:
            pass

    return {
        "course": course,
        "similarity_score": score,
        "accepted": accepted,
        "video": video_data,
    }


def _normalize_accept_flag(videos):
    changed = False
    for v in videos:
        # Ensure duration fields are present and correct
        if _ensure_duration_fields(v):
            changed = True
        sim = v.get("similarity_score")
        # Recompute acceptance based on similarity score when available
        if isinstance(sim, (int, float)):
            new_accepted = sim >= 0.3
            if v.get("accepted") != new_accepted:
                v["accepted"] = new_accepted
                changed = True
            # Ensure points reflect the current formula
            new_points = compute_points(sim)
            if v.get("points") != new_points:
                v["points"] = new_points
                changed = True
        else:
            # Fallback: if accepted was stored as numeric, coerce to boolean
            if isinstance(v.get("accepted"), (int, float)):
                v["accepted"] = v["accepted"] >= 0.3
                changed = True
    if changed:
        save_videos(videos)
    return videos


@router.get("/videos/all")
def list_all_videos():
    videos = _normalize_accept_flag(load_videos())
    return videos


@router.get("/videos/mine")
def list_my_videos(request: Request):
    token = request.cookies.get(COOKIE_NAME)
    user = get_user_from_token(token)
    if not user:
        return []
    owner = user.get("email")
    videos = _normalize_accept_flag(load_videos())
    return [v for v in videos if v.get("owner") == owner]


# Backward-compatible endpoint (returns all videos)
@router.get("/videos")
def list_videos():
    return _normalize_accept_flag(load_videos())


@router.get("/points/total")
def get_my_total_points(request: Request):
    """Return the current user's total points: base 100 + sum of accepted video points."""
    token = request.cookies.get(COOKIE_NAME)
    user = get_user_from_token(token)
    base_points = 100
    if not user:
        # Consistent with other endpoints returning empty data when not authenticated
        return {
            "email": None,
            "name": None,
            "base_points": base_points,
            "video_points": 0,
            "total_points": base_points,
        }

    email = user.get("email")
    name = user.get("name")
    videos = _normalize_accept_flag(load_videos())
    # Only count accepted videos that belong to the user
    video_points = 0
    for v in videos:
        if v.get("owner") == email and v.get("accepted") is True:
            p = v.get("points")
            if isinstance(p, (int, float)):
                video_points += int(p)

    total_points = base_points + video_points
    return {
        "email": email,
        "name": name,
        "base_points": base_points,
        "video_points": video_points,
        "total_points": total_points,
    }


@router.delete("/videos/{video_id}")
def delete_my_video(video_id: int, request: Request):
    """Delete a video by id for the current user. Also removes the file if present.
    Returns the deleted video's points so the client can update totals.
    """
    token = request.cookies.get(COOKIE_NAME)
    user = get_user_from_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    owner = user.get("email")
    videos = load_videos()
    idx = next((i for i, v in enumerate(videos) if v.get("id") == video_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Video not found")

    video = videos[idx]
    if video.get("owner") != owner:
        raise HTTPException(status_code=403, detail="Not authorized to delete this video")

    # Attempt to remove the stored file
    url = str(video.get("url") or "")
    filename = url.rsplit("/", 1)[-1] if "/" in url else url
    if filename:
        file_path = VIDEO_DIR / filename
        try:
            if file_path.exists():
                file_path.unlink()
        except Exception:
            # Ignore file deletion errors to avoid blocking DB update
            pass

    # Remove from DB and persist
    deleted = videos.pop(idx)
    save_videos(videos)

    points = deleted.get("points")
    deleted_points = int(points) if isinstance(points, (int, float)) else 0

    # Update totals for the owner after deletion
    try:
        update_user_points(owner)
    except Exception:
        pass

    return {"deleted": True, "video_id": video_id, "deleted_points": deleted_points}


@router.get("/videos/{filename}")
def get_video(filename: str):
    file_path = VIDEO_DIR / filename
    if file_path.exists():
        return FileResponse(file_path, media_type="video/mp4")
    return {"error": "File not found"}