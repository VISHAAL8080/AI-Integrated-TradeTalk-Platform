from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os
from dotenv import load_dotenv

from api import assessment, similarity, auth
from api import purchase  # NEW: purchases API
from api import ai        # NEW: AI assistant API

# Load .env variables at startup (e.g., AUTH_SECRET)
load_dotenv()

app = FastAPI()

# CORS for dev, restrict in production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(assessment.router, prefix="/api/assessment", tags=["Assessment"])
app.include_router(similarity.router, prefix="/api/similarity", tags=["Similarity"])
app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(purchase.router, prefix="/api/purchase", tags=["Purchase"])  # NEW
app.include_router(ai.router, prefix="/api/ai", tags=["AI"])  # NEW

# Serve React build
frontend_build_path = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "frontend", "build")
)
app.mount("/", StaticFiles(directory=frontend_build_path, html=True), name="frontend")

# SPA fallback: serve index.html for any non-API route to support client-side routing
@app.get("/{full_path:path}")
async def spa_fallback(full_path: str):
    if full_path.startswith("api/"):
        # Let API routes 404 naturally if not found
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Not Found")
    index_path = os.path.join(frontend_build_path, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    # If build is missing, still 404
    from fastapi import HTTPException
    raise HTTPException(status_code=404, detail="index.html not found")