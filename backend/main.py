"""Optional Python/FastAPI sidecar for CTF Intelligence.

It exposes small, bounded artifact-analysis helpers. It never executes uploaded
content and never receives secrets. Start with: python -m uvicorn backend.main:app --port 3131
"""
from __future__ import annotations

import base64
import binascii
import hashlib
import math
import re
from collections import Counter

from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="CTF Intelligence Python Backend", version="1.0.0")

MAX_BYTES = 10 * 1024 * 1024


class AnalyzeRequest(BaseModel):
    name: str = ""
    dataBase64: str


def mime_guess(data: bytes) -> str:
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"%PDF"):
        return "application/pdf"
    if data.startswith(b"PK\x03\x04"):
        return "application/zip"
    if data.startswith(b"\x7fELF"):
        return "application/x-elf"
    if data.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    if data.startswith(b"RIFF") and len(data) > 12 and data[8:12] == b"WAVE":
        return "audio/wav"
    return "application/octet-stream"


def entropy(data: bytes) -> float:
    if not data:
        return 0.0
    counts = Counter(data)
    total = len(data)
    return round(-sum((n / total) * math.log2(n / total) for n in counts.values()), 4)


def analyze_bytes(data: bytes) -> dict:
    strings = [m.decode("ascii", "ignore") for m in re.findall(rb"[\x20-\x7e]{6,}", data[:2_000_000])]
    hints: list[str] = []
    if mime_guess(data) != "application/octet-stream":
        hints.append(f"Magic bytes: {mime_guess(data)}")
    if entropy(data) > 7.2:
        hints.append("Entropi tinggi: kemungkinan terenkripsi atau terkompresi.")
    if re.search(rb"[A-Za-z0-9+/]{40,}={0,2}", data):
        hints.append("Terdeteksi deretan mirip Base64.")
    if b"flag{" in data or b"FLAG{" in data:
        hints.append("Terdeteksi pola flag di bytes mentah (belum terverifikasi).")
    return {
        "size": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "mimeGuess": mime_guess(data),
        "entropy": entropy(data),
        "strings": strings[:200],
        "hints": hints,
        "untrusted": True,
    }


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "ctf-python-backend", "maxBytes": MAX_BYTES}


@app.post("/analyze")
def analyze(request: AnalyzeRequest) -> dict:
    try:
        data = base64.b64decode(request.dataBase64, validate=True)
    except (binascii.Error, ValueError) as error:
        return {"error": f"Base64 tidak valid: {error}"}
    if len(data) > MAX_BYTES:
        return {"error": f"Artefak terlalu besar (maks {MAX_BYTES} bytes)."}
    return {"name": request.name[:200], **analyze_bytes(data)}
