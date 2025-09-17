from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional
import os
from dotenv import load_dotenv
import google.generativeai as genai  # Gemini SDK
import json
import re

load_dotenv()
GEMINI_KEY = os.getenv("GEMINI_API_KEY")

router = APIRouter()

# Configure Gemini client
genai.configure(api_key=GEMINI_KEY)
# Prefer JSON responses from the model
model = genai.GenerativeModel(
    "gemini-2.5-flash",
    generation_config={
        "response_mime_type": "application/json",
    },
)

class Question(BaseModel):
    question: str
    options: List[str]
    answer: str  # correct option

class AssessmentRequest(BaseModel):
    course: str
    answers: Optional[List[str]] = None
    questions: Optional[List[Question]] = None


@router.post("/generate")
def generate_assessment(req: AssessmentRequest):
    prompt = f"""
    Generate 5 multiple-choice questions for a beginner course called "{req.course}".
    Return output strictly in JSON format with the following structure:
    [
      {{
        "question": "Question text",
        "options": ["A", "B", "C", "D"],
        "answer": "Correct Option"
      }}
    ]
    """

    response = model.generate_content(prompt)

    # Handle possible code-fenced responses and parse JSON
    raw_text = (response.text or "").strip()
    if raw_text.startswith("```"):
        m = re.search(r"```(?:json)?\n(.*?)\n```", raw_text, re.DOTALL)
        if m:
            raw_text = m.group(1).strip()
    try:
        questions = json.loads(raw_text)
    except Exception:
        return {"error": "Failed to parse Gemini response", "raw": raw_text}

    return {"questions": questions}


@router.post("/check")
def check_assessment(req: AssessmentRequest):
    if not req.questions or not req.answers:
        return {"result": "fail", "message": "Questions and answers required"}

    def resolve_correct_answer(options: list[str], answer_raw: str) -> str:
        """Return the canonical correct option text, handling letters/numbers/partial text."""
        if not options:
            return answer_raw or ""
        opts_norm = [str(o).strip().lower() for o in options]
        ans_norm = (answer_raw or "").strip().lower()

        # 1) Exact match to one of the options
        if ans_norm in opts_norm:
            return options[opts_norm.index(ans_norm)]

        # 2) Letter mapping (A/B/C/D)
        letter_map = {"a": 0, "b": 1, "c": 2, "d": 3}
        if ans_norm in letter_map and letter_map[ans_norm] < len(options):
            return options[letter_map[ans_norm]]

        # 3) Numeric index (1-based)
        if ans_norm.isdigit():
            idx = int(ans_norm) - 1
            if 0 <= idx < len(options):
                return options[idx]

        # 4) Substring containment
        for i, o in enumerate(opts_norm):
            if ans_norm and ans_norm in o:
                return options[i]

        # Fallback: return raw
        return answer_raw or ""

    correct = 0
    for q, a in zip(req.questions, req.answers):
        # q is a Pydantic model (Question)
        expected = resolve_correct_answer(q.options, q.answer)
        if str(expected).strip().lower() == str(a).strip().lower():
            correct += 1

    if correct == len(req.questions):
        return {"result": "pass"}
    else:
        return {"result": "fail", "message": f"{correct}/{len(req.questions)} correct"}