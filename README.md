# edgr-study-planner

A standalone study companion (→ **study.edgr.in**), separate from the main edgr app.

Two areas:

1. **Study Corner** — browse notes, syllabi and previous-year papers by semester → subject.
2. **Analyzer** — a notes-grounded study brain, powered by a **local LLM (Ollama)**:
   - **Roadmap** — from a subject's unit-wise notes, generates **Units → Topics → Sub-topics → an ordered learning path**.
   - **Context chat** — ask questions about a subject and get answers grounded in the actual notes, with citations. No hallucinated MCQs — every answer is tied to source text.

No SRM login required — this is a public study tool.

## Stack

- **Frontend:** React 19 + Vite + TypeScript + Tailwind 4
- **Backend:** Express 5 + PostgreSQL (**pgvector** for embeddings)
- **AI:** **Ollama** (local) — chat/roadmap model + embedding model, both swappable
- Fully **Dockerized** (`docker compose`)

## Quick start (local)

```bash
cp .env.example .env          # adjust if you like
docker compose up -d --build  # postgres(pgvector) + ollama + api

# Pull the local models (one-time; downloads a few GB):
docker exec sp-ollama ollama pull qwen2.5:3b
docker exec sp-ollama ollama pull nomic-embed-text

# App: http://localhost:3100
```

> For much faster inference, install the native **Ollama** app on your Mac
> (Metal GPU) and set `OLLAMA_HOST=http://host.docker.internal:11434` in `.env`.

## Layout

```
server/   Express API (study browse, analyzer: ingest/roadmap/chat), pg + pgvector, Ollama client
src/      React app (Study Corner + Analyzer UI), edgr theme
scripts/  Offline ingest (notes → text/OCR → chunks → embeddings)
```
