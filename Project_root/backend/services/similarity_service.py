from sentence_transformers import SentenceTransformer, util

model = SentenceTransformer("all-MiniLM-L6-v2")

def compute_similarity(course: str, transcript: str) -> float:
    course_emb = model.encode(course, convert_to_tensor=True)
    transcript_emb = model.encode(transcript, convert_to_tensor=True)
    score = util.cos_sim(course_emb, transcript_emb).item()
    return round(score, 3)