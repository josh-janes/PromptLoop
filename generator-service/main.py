"""
PromptLoop Generator Service
Local FastAPI service wrapping ACE-Step 1.5 turbo on CUDA.
Keeps the model hot in GPU VRAM between requests.

Setup (run inside the ACE-Step-1.5 uv environment in WSL2):
    cd ~/dev/ACE-Step-1.5
    uv pip install fastapi uvicorn
    uv run python /mnt/c/Users/joshu/dev/live-guitar/generator-service/main.py

Or with plain pip (if you have a venv active that has torch/torchaudio):
    pip install fastapi uvicorn
    python main.py

Env vars (all optional):
    ACESTEP_DIR      Path to cloned ACE-Step-1.5 repo (default: ~/dev/ACE-Step-1.5)
    INFERENCE_STEPS  Diffusion steps, turbo hard-caps at 8 (default: 8)
    DEFAULT_KEY      Fallback key when none specified by request (default: C Major)
    OUTPUT_LEVEL_DB  Peak output level in dBFS (default: -9.0)
    PORT             HTTP port (default: 8765)
"""

import asyncio
import io
import math
import os
import sys
from concurrent.futures import ThreadPoolExecutor

import soundfile as sf
import torch
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

ACESTEP_DIR    = os.environ.get("ACESTEP_DIR", os.path.expanduser("~/dev/ACE-Step-1.5"))
INFERENCE_STEPS = int(os.environ.get("INFERENCE_STEPS", "8"))
GUIDANCE_SCALE  = float(os.environ.get("GUIDANCE_SCALE", "0.0"))   # ignored by turbo
SHIFT           = float(os.environ.get("SHIFT", "1.0"))            # ignored by turbo
DEFAULT_KEY     = os.environ.get("DEFAULT_KEY", "C Major")
DEFAULT_TIME_SIG = os.environ.get("DEFAULT_TIME_SIG", "4")
OUTPUT_LEVEL_DB = float(os.environ.get("OUTPUT_LEVEL_DB", "-9.0"))
PORT            = int(os.environ.get("PORT", "8765"))

sys.path.insert(0, ACESTEP_DIR)

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(title="PromptLoop Generator", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# Single-worker executor keeps GPU requests sequential (no OOM from parallel runs)
executor = ThreadPoolExecutor(max_workers=1)
device = "cuda" if torch.cuda.is_available() else "cpu"
_dit = None
_llm = None   # LLM planner not used with turbo model


# ---------------------------------------------------------------------------
# Model lifecycle
# ---------------------------------------------------------------------------

def _load_model() -> None:
    global _dit
    from acestep.handler import AceStepHandler

    print(f"[Generator] Loading ACE-Step turbo on {device}...")
    _dit = AceStepHandler()
    _dit.initialize_service(
        project_root=ACESTEP_DIR,
        config_path="acestep-v15-turbo",
        device=device,
        prefer_source="modelscope",
    )
    print(f"[Generator] Model ready on {device}.")


@app.on_event("startup")
async def on_startup() -> None:
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(executor, _load_model)


# ---------------------------------------------------------------------------
# Schema
# ---------------------------------------------------------------------------

class GenerateRequest(BaseModel):
    prompt: str
    bpm: int = 120
    duration_seconds: float = 8.0
    key: str = DEFAULT_KEY


# ---------------------------------------------------------------------------
# Generation (runs in thread so the event loop stays unblocked)
# ---------------------------------------------------------------------------

def make_seamless_loop(audio: torch.Tensor, sr: int, crossfade_sec: float = 0.5) -> torch.Tensor:
    """Crossfade the tail into the head so the loop point is inaudible."""
    n = min(int(crossfade_sec * sr), audio.shape[-1] // 4)
    if n == 0:
        return audio
    fade_out = torch.linspace(1.0, 0.0, n, device=audio.device)
    fade_in  = torch.linspace(0.0, 1.0, n, device=audio.device)
    result = audio.clone()
    result[..., -n:] = audio[..., -n:] * fade_out + audio[..., :n] * fade_in
    return result


def _generate_sync(req: GenerateRequest) -> bytes:
    from acestep.inference import GenerationConfig, GenerationParams, generate_music

    params = GenerationParams(
        task_type="text2music",
        caption=f"{req.prompt}, instrumental, loopable",
        instrumental=True,
        duration=math.ceil(req.duration_seconds),
        inference_steps=INFERENCE_STEPS,
        guidance_scale=GUIDANCE_SCALE,
        shift=SHIFT,
        thinking=False,
        seed=-1,
        bpm=req.bpm,
        keyscale=req.key,
        timesignature=DEFAULT_TIME_SIG,
    )

    result = generate_music(
        _dit, _llm, params,
        GenerationConfig(batch_size=1, audio_format="wav"),
        save_dir=None,
    )

    if not result.success:
        raise RuntimeError(f"ACE-Step failed: {result.error}")

    audio: torch.Tensor = result.audios[0]["tensor"]
    sr: int             = result.audios[0]["sample_rate"]

    target_samples = int(req.duration_seconds * sr)
    audio = audio[..., :target_samples]

    if audio.shape[0] > 1:
        audio = audio.mean(dim=0, keepdim=True)

    audio = make_seamless_loop(audio, sr)
    audio = audio * (10 ** (OUTPUT_LEVEL_DB / 20.0))

    audio_np = audio.cpu().squeeze().numpy()
    buf = io.BytesIO()
    sf.write(buf, audio_np, sr, format="WAV", subtype="PCM_16")
    buf.seek(0)
    return buf.read()


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "device": device,
        "model_loaded": _dit is not None,
        "acestep_dir": ACESTEP_DIR,
    }


@app.post("/generate")
async def generate(req: GenerateRequest):
    if _dit is None:
        raise HTTPException(503, detail="Model still loading, try again in a moment")
    try:
        wav_bytes = await asyncio.get_event_loop().run_in_executor(
            executor, _generate_sync, req
        )
        return Response(content=wav_bytes, media_type="audio/wav")
    except Exception as exc:
        raise HTTPException(500, detail=str(exc))


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="info")
