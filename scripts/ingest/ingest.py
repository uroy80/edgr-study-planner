#!/usr/bin/env python3
"""
Analyzer ingest — notes → text (+OCR) → chunks → embeddings → pgvector.

For every study_materials row with category='notes', extract the text (PDF
text layer, OCR fallback for scans), split into overlapping chunks, embed each
with Ollama (nomic-embed-text), and store in note_chunks.

Run (from the repo root), once Ollama is running on the host:

  docker run --rm \
    --network edgr-study-planner_default \
    --volumes-from sp-api \
    -e PGHOST=sp-postgres -e PGDATABASE=studyplanner \
    -e PGUSER=studyplanner -e PGPASSWORD=studyplanner \
    -e OLLAMA_HOST=http://host.docker.internal:11434 \
    -e OLLAMA_EMBED_MODEL=nomic-embed-text \
    -e STUDY_MATERIALS_DIR=/app/data/study-materials \
    --add-host host.docker.internal:host-gateway \
    -v "$PWD/scripts/ingest":/ingest \
    python:3.12-slim sh -lc \
    'apt-get update -qq && apt-get install -y -qq tesseract-ocr poppler-utils >/dev/null 2>&1 \
     && pip install -q pdfminer.six pdf2image pytesseract pillow psycopg2-binary \
     && python /ingest/ingest.py'

Set RESUME=1 to only ingest notes not already chunked.
"""
import os, re, sys, time, json, urllib.request, urllib.error
import psycopg2
from pdfminer.high_level import extract_text as pdf_text
from pdf2image import convert_from_path, pdfinfo_from_path
import pytesseract

OLLAMA = os.environ.get("OLLAMA_HOST", "http://host.docker.internal:11434")
EMBED_MODEL = os.environ.get("OLLAMA_EMBED_MODEL", "nomic-embed-text")
MATERIALS_DIR = os.environ.get("STUDY_MATERIALS_DIR", "/app/data/study-materials")
CHUNK, OVERLAP, MAX_PAGES = 1500, 200, 40
WATERMARK = re.compile(r"(lOMoARcPSD|Downloaded by|studocu|coursehero|scanned by)", re.I)


def clean(t):
    return " ".join((t or "").split())


def strip_wm(t):
    return "\n".join(l for l in (t or "").splitlines() if not WATERMARK.search(l))


def extract(path):
    try:
        raw = strip_wm(pdf_text(path) or "")
    except Exception:
        raw = ""
    if len(clean(raw)) >= 400:
        return clean(raw)
    # OCR fallback — ONE page at a time to bound memory (loading a whole
    # scanned PDF at once is what OOM-killed the ingest on a 16GB Mac).
    try:
        info = pdfinfo_from_path(path)
        pages = min(int(info.get("Pages", 0)) or MAX_PAGES, MAX_PAGES)
    except Exception:
        pages = MAX_PAGES
    out = []
    for p in range(1, pages + 1):
        try:
            imgs = convert_from_path(path, dpi=180, first_page=p, last_page=p)
            if imgs:
                out.append(pytesseract.image_to_string(imgs[0].convert("L")))
            imgs = None
        except Exception:
            continue
    return clean("\n".join(out)) or clean(raw)


def chunkify(text):
    out, i, n = [], 0, len(text)
    while i < n:
        out.append(text[i : i + CHUNK])
        i += CHUNK - OVERLAP
    return [c for c in out if len(c.strip()) >= 40]


def embed(text):
    body = json.dumps({"model": EMBED_MODEL, "prompt": text}).encode()
    req = urllib.request.Request(
        f"{OLLAMA}/api/embeddings", body, {"content-type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)["embedding"]


def main():
    # sanity: Ollama reachable?
    try:
        urllib.request.urlopen(f"{OLLAMA}/api/tags", timeout=5)
    except Exception as e:
        print(f"ERROR: Ollama not reachable at {OLLAMA} ({e}). Is it running?", flush=True)
        sys.exit(1)

    conn = psycopg2.connect(
        host=os.environ.get("PGHOST", "sp-postgres"),
        dbname=os.environ.get("PGDATABASE", "studyplanner"),
        user=os.environ.get("PGUSER", "studyplanner"),
        password=os.environ["PGPASSWORD"],
    )
    cur = conn.cursor()
    resume = os.environ.get("RESUME") == "1"
    subj = os.environ.get("SUBJECT_ID")
    clauses = ["sm.category='notes'", "sm.file_path IS NOT NULL", "sm.mime_type='application/pdf'"]
    params: list = []
    if subj:  # single-subject run (for testing) — re-index just this subject
        clauses.append("sm.subject_id = %s")
        params.append(subj)
        cur.execute("DELETE FROM note_chunks WHERE subject_id = %s", (subj,))
        conn.commit()
    elif resume:
        clauses.append("sm.id NOT IN (SELECT DISTINCT material_id FROM note_chunks)")
    else:
        cur.execute("TRUNCATE note_chunks")
        conn.commit()
    cur.execute(
        "SELECT sm.id, sm.subject_id, sm.unit, sm.file_path, sm.title "
        "FROM study_materials sm WHERE " + " AND ".join(clauses),
        params,
    )
    rows = cur.fetchall()
    print(f"{len(rows)} note PDFs to ingest (resume={resume})", flush=True)

    total, t0 = 0, time.time()
    for idx, (mid, sid, unit, fp, _title) in enumerate(rows, 1):
        path = os.path.join(MATERIALS_DIR, fp)
        if not os.path.exists(path):
            continue
        for ci, ck in enumerate(chunkify(extract(path))):
            try:
                vec = embed(ck)
            except Exception as e:
                print(f"  embed error: {e}", flush=True)
                continue
            cur.execute(
                """INSERT INTO note_chunks (subject_id, material_id, unit, chunk_index, content, embedding)
                   VALUES (%s,%s,%s,%s,%s,%s::vector)""",
                (sid, mid, unit, ci, ck, "[" + ",".join(map(str, vec)) + "]"),
            )
            total += 1
        conn.commit()
        if idx % 20 == 0:
            print(f"  {idx}/{len(rows)} notes · {total} chunks · {time.time()-t0:.0f}s", flush=True)

    print(f"DONE: {total} chunks from {len(rows)} notes in {time.time()-t0:.0f}s", flush=True)
    cur.execute("SELECT COUNT(DISTINCT subject_id) FROM note_chunks")
    print("subjects indexed:", cur.fetchone()[0], flush=True)
    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
