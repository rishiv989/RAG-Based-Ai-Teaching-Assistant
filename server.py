from typing import Optional, List, Dict, Any
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import pandas as pd
import numpy as np
import requests
import joblib
from sklearn.metrics.pairwise import cosine_similarity
import json

from upload_pipeline import process_uploaded_video

# ---------------------------------------
# LOAD INITIAL EMBEDDINGS
# ---------------------------------------
EMBEDDINGS_PATH = "embeddings.joblib"
df = joblib.load(EMBEDDINGS_PATH)

# ---------------------------------------
# FASTAPI APP + CORS
# ---------------------------------------
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------
# MODELS
# ---------------------------------------
class Question(BaseModel):
    question: str
    language: Optional[str] = "en"   # "en", "hi", "mr"
    intent: Optional[str] = "auto"   # "auto", "explain", "code", "debug", "compare"


class QuizRequest(BaseModel):
    question: str
    language: Optional[str] = "en"   # same as /ask


# ---------------------------------------
# HELPERS
# ---------------------------------------
def create_embedding(text_list):
    response = requests.post(
        "http://localhost:11434/api/embed",
        json={"model": "bge-m3", "input": text_list},
    )
    data = response.json()
    return data["embeddings"]


def generate_answer(prompt: str) -> str:
    r = requests.post(
        "http://localhost:11434/api/generate",
        json={
            "model": "llama3.2",
            "prompt": prompt,
            "stream": False,
        },
    )
    data = r.json()
    return data["response"]


# ---------------------------------------
# ROOT CHECK
# ---------------------------------------
@app.get("/")
def home():
    return {"message": "RAG Backend is working!"}


# ---------------------------------------
# MAIN RAG ENDPOINT WITH LANGUAGE + INTENT
# ---------------------------------------
@app.post("/ask")
def ask_ai(body: Question):
    global df

    query = body.question
    if not query.strip():
        return {"answer": "Please type a question.", "matches": []}

    # --- Language instructions ---
    lang = (body.language or "en").lower()
    if lang == "hi":
        lang_instructions = (
            "Answer in simple Hindi (can mix some English like Hinglish), "
            "but main explanation must be in Hindi so an Indian student can understand."
        )
    elif lang == "mr":
        lang_instructions = (
            "Answer in simple Marathi (technical words can stay in English), "
            "but main explanation must be in Marathi so a student from Maharashtra can understand."
        )
    else:
        lang_instructions = "Answer in clear and simple English for an Indian college student."

    # --- Intent instructions ---
    intent = (body.intent or "auto").lower()

    if intent == "code":
        intent_instructions = (
            "Focus mainly on providing clean, well-commented code examples. "
            "Explain briefly, but prioritize showing actual HTML/CSS/JS code that solves the problem."
        )
    elif intent == "debug":
        intent_instructions = (
            "Treat this as a debugging request. "
            "Explain what is likely wrong, why it happens, and how to fix it. "
            "If you show code, highlight the corrected version and briefly explain the fix."
        )
    elif intent == "compare":
        intent_instructions = (
            "Focus on comparing two or more concepts. "
            "Use bullet points or a table-like style in text, and clearly highlight differences and when to use which."
        )
    else:  # "auto" or "explain"
        intent_instructions = (
            "Give a conceptual explanation with some examples. "
            "You can include small code snippets if helpful, but explanation is the priority."
        )

    # --- 1. Embed query ---
    query_embedding = create_embedding([query])[0]

    # --- 2. Similarity vs all chunks ---
    similarities = cosine_similarity(
        np.vstack(df["embedding"]),
        [query_embedding]
    ).flatten()

    # --- 3. Top-k chunks ---
    top_idx = similarities.argsort()[::-1][:5]
    best_chunks = df.loc[top_idx]

    # --- 4. Build context for Llama ---
    context_json = best_chunks[
        ["title", "number", "start", "end", "text"]
    ].to_json(orient="records")

    prompt = f"""
You are an AI teaching assistant for the Sigma Web Development Course.

You are given some transcript chunks from the course:
Each chunk has: title, video number, start time (seconds), end time (seconds), and text.

Chunks (JSON):
{context_json}

User question: "{query}"

Language style:
{lang_instructions}

Intent style (how to answer):
{intent_instructions}

Your answer MUST:
- Mention the relevant video number(s) and title(s) when possible.
- Mention the relevant timestamp ranges in seconds (start–end) when possible.
- Follow the intent style above (more code, more explanation, debug, or comparison).
- Keep the answer focused on web development as taught in this course.

If the question is unrelated to web development or the Sigma Web Development Course, say in the chosen language:
"I can only answer questions about the Sigma Web Development Course and web development topics."
"""

    ai_answer = generate_answer(prompt)

    return {
        "answer": ai_answer,
        "matches": best_chunks[
            ["title", "number", "start", "end", "text"]
        ].to_dict(orient="records"),
    }


# ---------------------------------------
# QUIZ ENDPOINT
# ---------------------------------------
@app.post("/quiz")
def generate_quiz(body: QuizRequest):
    """
    Generate 5 MCQs from the Sigma course content related to the user's question.
    Returns a list of questions with options and correct answers.
    """
    global df

    query = body.question
    if not query.strip():
        return {"quiz": [], "raw": "Empty question."}

    # language handling (for explanations text)
    lang = (body.language or "en").lower()
    if lang == "hi":
        lang_hint = "Write the questions and explanations in simple Hindi. Options can mix Hindi + English."
    elif lang == "mr":
        lang_hint = "Write the questions and explanations in simple Marathi. Options can mix Marathi + English."
    else:
        lang_hint = "Write the questions and explanations in clear English."

    # 1) embed query
    query_embedding = create_embedding([query])[0]

    # 2) similarity vs all chunks
    similarities = cosine_similarity(
        np.vstack(df["embedding"]),
        [query_embedding]
    ).flatten()

    # 3) take a bit more context (top 8)
    top_idx = similarities.argsort()[::-1][:8]
    best_chunks = df.loc[top_idx]

    context_json = best_chunks[
        ["title", "number", "start", "end", "text"]
    ].to_json(orient="records")

    prompt = f"""
You are an AI tutor for the Sigma Web Development Course.

You are given some transcript chunks from the course (JSON):
{context_json}

User question (topic focus): "{query}"

Using ONLY the above content, create 5 multiple choice questions that test understanding of this topic.

Important instructions:
- {lang_hint}
- Make questions short and focused (web development only).
- Each question must have EXACTLY 4 options.
- Only ONE option is correct per question.

Return ONLY valid JSON, no extra text.
Return a JSON array of EXACTLY 5 objects.
Each object MUST have this structure:

{{
  "question": "string",
  "options": ["option A", "option B", "option C", "option D"],
  "answer": "exact text of the correct option (one of the 4 options)",
  "explanation": "short explanation for why this is correct"
}}

Do not wrap the JSON in backticks.
Do not add any other keys.
"""

    raw = generate_answer(prompt).strip()

    quiz_items: List[Dict[str, Any]] = []
    try:
        parsed = json.loads(raw)

        # if it's a dict with "questions", support that too
        if isinstance(parsed, dict) and "questions" in parsed:
            quiz_items = parsed["questions"]
        elif isinstance(parsed, list):
            quiz_items = parsed
        else:
            quiz_items = []
    except Exception:
        # parsing failed
        quiz_items = []

    return {
        "quiz": quiz_items,
        "raw": raw if not quiz_items else None,
    }


# ---------------------------------------
# UPLOAD VIDEO ENDPOINT
# ---------------------------------------
@app.post("/upload_video")
async def upload_video(
    file: UploadFile = File(...),
    title: str = Form(None),
):
    global df

    file_bytes = await file.read()
    original_name = file.filename

    try:
        # returns: (video_id, final_title, chunks)
        video_id, final_title, chunks = process_uploaded_video(
            file_bytes=file_bytes,
            original_filename=original_name,
            title=title,
        )
    except Exception as e:
        print("Upload error:", e)
        return {"success": False, "message": "Video processing failed."}

    if not chunks:
        return {"success": False, "message": "No transcript available."}

    texts = [c["text"] for c in chunks]

    try:
        new_embeddings = create_embedding(texts)
    except Exception as e:
        print("Embedding error:", e)
        return {"success": False, "message": "Embedding failed."}

    new_rows = pd.DataFrame(
        {
            "title": [final_title] * len(chunks),
            "number": [-1] * len(chunks),  # custom videos
            "start": [c["start"] for c in chunks],
            "end": [c["end"] for c in chunks],
            "text": texts,
            "embedding": new_embeddings,
            "source": ["user_video"] * len(chunks),
        }
    )

    df = pd.concat([df, new_rows], ignore_index=True)
    joblib.dump(df, EMBEDDINGS_PATH)

    return {
        "success": True,
        "video_id": video_id,
        "title": final_title,
        "chunks": len(chunks),
    }
