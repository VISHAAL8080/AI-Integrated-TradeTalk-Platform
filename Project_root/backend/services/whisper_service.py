import tempfile
from typing import Optional

import whisper

_model: Optional[whisper.Whisper] = None


def _get_model() -> whisper.Whisper:
    global _model
    if _model is None:
        # Load once and reuse
        _model = whisper.load_model("base")
    return _model


def transcribe_video(file):
    with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as temp_video:
        temp_video.write(file.file.read())
        temp_video.flush()

    model = _get_model()
    # Use Python API to transcribe; requires ffmpeg installed on system
    result = model.transcribe(temp_video.name, language="en", fp16=False)
    transcript = result.get("text", "").strip()
    return transcript