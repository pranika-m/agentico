"""
main.py — FastAPI entry point for the Agentico agent backend.

Run with: uvicorn main:app --reload --port 8000
"""

import sys
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent
load_dotenv(BACKEND_DIR / ".env")

# =========================
# [SETUP]
# =========================

# Ensure backend directory is in path
sys.path.insert(0, str(Path(__file__).parent))

# =========================
# [APP]
# =========================
app = FastAPI()

origins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "https://agentico-tau.vercel.app",
    "https://agentico-mzygajmfk-pranikas-projects-37886178.vercel.app",
    "https://agentico-git-main-pranikas-projects-37886178.vercel.app",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================
# [ROUTES]
# =========================

from api.routes import router
app.include_router(router)


@app.get("/")
async def root():
    return {
        "service": "Agentico Support Agent",
        "version": "1.0.0",
        "docs": "/docs"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

