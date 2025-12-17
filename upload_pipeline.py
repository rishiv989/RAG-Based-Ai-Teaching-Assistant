# upload_pipeline.py
import os
import uuid
from typing import List, Tuple

from faster_whisper import WhisperModel

USER_VIDEOS_DIR = "user_videos"
os.makedirs(USER_VIDEOS_DIR, exist_ok=True)

WHISPER_MODEL_NAME = "base"
whisper_model = WhisperModel(WHISPER_MODEL_NAME, device="cpu", compute_type="int8")


def transcribe_video_to_segments(video_path: str) -> List[dict]:
    """
    Run faster-whisper on the video and return a list of segments:
    [{start, end, text}, ...]
    """
    segments_out = []
    segments, info = whisper_model.transcribe(
        video_path,
        beam_size=5,
        best_of=5,
    )

    for seg in segments:
        segments_out.append(
            {
                "start": float(seg.start),
                "end": float(seg.end),
                "text": seg.text.strip(),
            }
        )

    return segments_out


def merge_segments_to_chunks(segments: List[dict], max_chars: int = 400) -> List[dict]:
    """
    Merge small whisper segments into larger chunks better suited for embeddings.
    """
    chunks = []
    current_text = []
    current_start = None
    current_end = None

    for seg in segments:
        text = seg["text"]
        if not text:
            continue

        if current_start is None:
            current_start = seg["start"]

        tentative = (" ".join(current_text + [text])).strip()

        if len(tentative) <= max_chars:
            current_text.append(text)
            current_end = seg["end"]
        else:
            if current_text:
                chunks.append(
                    {
                        "start": current_start,
                        "end": current_end,
                        "text": " ".join(current_text).strip(),
                    }
                )
            current_text = [text]
            current_start = seg["start"]
            current_end = seg["end"]

    if current_text:
        chunks.append(
            {
                "start": current_start,
                "end": current_end,
                "text": " ".join(current_text).strip(),
            }
        )

    return chunks


def process_uploaded_video(
    file_bytes: bytes,
    original_filename: str,
    title: str = None,
) -> Tuple[str, str, List[dict]]:
    """
    - Saves the uploaded video to disk
    - Transcribes it
    - Merges into chunks
    Returns: (video_id, final_title, chunks)
        chunks = [{start, end, text}, ...]
    """
    ext = os.path.splitext(original_filename)[1]
    video_id = str(uuid.uuid4())
    save_name = f"{video_id}{ext}"
    save_path = os.path.join(USER_VIDEOS_DIR, save_name)

    # Save the file
    with open(save_path, "wb") as f:
        f.write(file_bytes)

    # Transcribe
    segments = transcribe_video_to_segments(save_path)
    if not segments:
        return video_id, (title or original_filename), []

    # Merge into chunks
    chunks = merge_segments_to_chunks(segments, max_chars=400)

    return video_id, (title or original_filename), chunks
