# 🎸 PromptLoop

AI-powered looping pedal and backing track generator for the web.

## Quick Start

### One-Command Docker Run

```bash
# Windows
run.bat prod

# Linux/Mac
./run.sh prod
```

Or manually:
```bash
docker compose -f docker-compose.prod.yml up --build
```

Then open **http://localhost:8080**

### Development Mode

```bash
# Frontend only (hot reload)
cd frontend && npm install && npm run dev

# Full stack with Docker
docker compose up --build
```

## Architecture

|-----------------------------------------------------|
| Service          | Port | Description               |
|------------------|------|---------------------------|
| Frontend (Nginx) | 8080 | React SPA + API proxy     |
| Rails API        | 3000 | Backend REST API          |
| AI Service       | 8000 | MusicGen audio generation |
|-----------------------------------------------------|

## Features

- 🎹 **16-Pad Looper** - Record, upload, or generate loops
- 🤖 **AI Backing Tracks** - Generate music from text prompts
- 🎙️ **Recording** - Capture audio from your microphone
- 🎨 **Reactive UI** - Colors shift with your music

## Environment Variables

Copy `.env.example` to `.env` and configure:

```
SECRET_KEY_BASE=your_secret_key
JWT_SECRET_KEY=your_jwt_secret
```

## License

MIT
