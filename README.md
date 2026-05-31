# SkinMatch

> AI-driven personalized skincare recommendation system — MSc Software Engineering thesis MVP.

SkinMatch lets a user upload a face photo and answer a short quiz, then
returns a structured skin analysis, ranked product recommendations, and
a personalized daily/weekly beauty plan.

The repository is structured as a layered, container-ready full-stack
project that can be extended with a real ML model and deployed to AWS
without rewriting the API contracts.

---

## ✨ MVP features

- **Photo upload** with image validation (format, size, dimensions).
  Two ingestion paths share the same `/analysis/upload` endpoint:
  a legacy single-image form (manual uploader, older clients) and a
  Smart Camera 3-shot form (`front` + optional `left` / `right`)
  used by the in-browser guided capture. See
  [Smart Camera capture](#-smart-camera-capture) below.
- **Heuristic AI analysis** of the face image using OpenCV/NumPy →
  produces `skin_type`, `redness_level`, `hydration_level`,
  `pigmentation_level`, `pores_score`, `confidence_score`.
- **Quiz** — config-driven 7-step skincare survey covering
  self-perceived skin type, primary concerns, sensitivity level,
  current routine, breakout frequency, daily environment, and
  sunscreen habits. Questions live in
  [`frontend/src/config/skinQuiz.ts`](frontend/src/config/skinQuiz.ts);
  see [Skincare quiz design](#-skincare-quiz-design) for the
  signal-flow rationale.
- **Rule-based + scoring recommendation engine** combining AI features
  and quiz answers to rank a product catalogue, with human-readable
  explanations for every match.
- **Beauty plan generator** producing morning + evening routines,
  weekly tips, and lifestyle suggestions.
- **Redis caching** for recommendations and plans by analysis ID
  (degrades gracefully if Redis is unavailable).
- **PostgreSQL** persistence via SQLAlchemy 2.0 (typed models).
- **OpenAPI / Swagger UI** auto-generated at `/docs`.
- **React + TypeScript** UI for upload → quiz → results flow.
- **Docker Compose** orchestrating all four services
  (`frontend`, `backend`, `postgres`, `redis`).
- **pytest** suite + **Postman collection**.
- **GitHub Actions** CI: backend tests, frontend build, Docker build.

---

## 🧱 Architecture

```
┌────────────────────────┐      HTTPS / JSON        ┌──────────────────────────────┐
│ React + TypeScript SPA │ ───────────────────────▶ │ FastAPI backend              │
│  (Vite, React Router)  │                          │  api/v1 → services →         │
└────────────────────────┘                          │  repositories → SQLAlchemy   │
                                                    │       │              │       │
                                                    │       ▼              ▼       │
                                                    │  ai/ pipeline    Redis cache │
                                                    │  (heuristic /     (recos +   │
                                                    │   future CNN)     plans)     │
                                                    └──────────────┬───────────────┘
                                                                   │
                                                            PostgreSQL 16
```

**Layered backend** — clean separation of concerns:

```
backend/app/
  api/v1/endpoints/   # HTTP routers (thin)
  services/           # business logic
  repositories/       # data access
  models/             # SQLAlchemy ORM
  schemas/            # Pydantic IO contracts
  ai/                 # SkinAnalyzer interface + heuristic impl
  db/                 # session, init, seed
  core/               # config, security
```

This makes it simple to:
- Swap the heuristic analyzer for a real CNN by adding a new
  `SkinAnalyzer` subclass (e.g. ONNX runtime, PyTorch) and wiring it
  into `app/ai/pipeline.py`.
- Replace the mock auth in `core/security.py` with JWT/OAuth without
  touching endpoints.
- Add a worker queue (Celery, RQ) by moving the analyzer call out of
  the request thread.

---

## 🧰 Tech stack

| Layer       | Technology                                                                 |
|-------------|----------------------------------------------------------------------------|
| Frontend    | React 18, TypeScript, Vite, React Router, plain CSS                        |
| Backend     | Python 3.11, FastAPI, Pydantic v2, SQLAlchemy 2.0, Uvicorn                 |
| Database    | PostgreSQL 16                                                              |
| Cache       | Redis 7                                                                    |
| AI / CV     | OpenCV (`opencv-python-headless`), NumPy, Pillow                           |
| Tests       | pytest, FastAPI `TestClient`, Postman collection                           |
| DevOps      | Docker, docker-compose, GitHub Actions (lint/test/build), AWS-ready        |

---

## 🚀 Local quick start

### Option A — Docker Compose (recommended)

```bash
docker compose up --build
```

Then open in a browser:
- **Frontend (UI)** → http://localhost:8080
- **Backend (API)** → http://localhost:8000
- **Swagger UI** → http://localhost:8000/docs

Healthcheck:
```bash
curl http://localhost:8000/health
# {"status":"ok","database":"up","redis":"up"}
```

### Option B — Run services manually (no Docker)

**Backend** (uses SQLite by default if `DATABASE_URL` is overridden):
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# For a no-Postgres local run, set in backend/.env:
#   DATABASE_URL=sqlite:///./skinmatch.db
#   REDIS_URL=redis://localhost:6390/0   # unreachable on purpose; cache degrades gracefully
uvicorn app.main:app --reload
```

**Frontend**:
```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

The backend will create tables and seed the product catalogue
automatically on first start.

### Testing the Smart Camera locally

The guided 3-shot flow needs a real camera + a secure context.
`http://localhost` is treated as secure by every modern browser,
so the dev setup above works without TLS:

1. `docker compose up --build` (or the manual `uvicorn` + `npm run
   dev` combo).
2. Open `http://localhost:8080` (Docker) or `http://localhost:5173`
   (manual).
3. Navigate to `/capture` and pick **"Take 3 selfies"**.
4. Grant camera permission when the browser prompts.
5. Follow the headline / chips — once all three turn green, the
   3-2-1 countdown plays and the shutter captures.
6. Repeat for left and right poses; on the review screen press
   **Continue** to fall through to the quiz → analyzing → results
   pipeline.
7. The manual uploader is reachable from the same `/capture` page
   via **"Upload photo instead"**; this exercises the legacy
   single-image path.

Backend smoke check after capture:

```bash
sqlite3 backend/skinmatch.db \
  'SELECT id, image_front_path, image_left_path, image_right_path FROM skin_scans ORDER BY id DESC LIMIT 1;'
# all three columns should be populated paths for Smart Camera scans
# and NULL on rows created via the legacy single-image uploader.
```

If the camera button never starts: open DevTools → Console for the
`getUserMedia` rejection reason. On non-localhost HTTP origins this
will be a `NotAllowedError` because the secure-context check fails;
serve over HTTPS or use `localhost`.

### Running the tests

```bash
# Backend (34 tests, in-memory SQLite, no Docker required)
cd backend && pytest -q

# Frontend (17 tests: cameraGuidance + FlowProvider + api)
cd frontend && npm test

# Frontend type-check / production build (CI parity)
cd frontend && npm run typecheck && npm run build
```

---

## 🎬 Week 2 demo flow

Recommended live walkthrough — **5 minutes end-to-end**:

1. **Start the stack**
   ```bash
   docker compose up --build
   ```
   Wait for `postgres` and `redis` healthchecks to pass and the
   `backend` log line `Application startup complete.`.

2. **Verify all services are up**
   ```bash
   curl -s http://localhost:8000/health
   # → {"status":"ok","database":"up","redis":"up"}
   curl -s http://localhost:8000/products | jq 'length'
   # → 13   (seeded catalogue)
   ```

3. **Open the UI** → http://localhost:8080

4. **Click "Start Analysis"** → uploads a face photo
   (any clear, frontal portrait JPG/PNG/WEBP, ≤ 10 MB).
   The frontend validates type and size client-side before sending.

5. **Quiz Step 1 of 3** — pick one skin type (Dry / Oily /
   Combination / Normal). Continue is enabled only when a choice
   is made.

6. **Quiz Step 2 of 3** — pick one or more concerns. Labels match
   the backend `Concern` enum 1:1, so they flow through unchanged
   to the recommendation engine.

7. **Analyzing screen** — the bullets animate while the app calls
   `POST /analysis/upload` and `POST /quiz/submit` in sequence.
   On error you see "Try again" / "Back home" buttons instead of
   getting stuck.

8. **Results screen** displays:
   - **Skin analysis** chips (e.g. "Mild Redness", "Hydrated") and
     a hydration meter, derived from real `SkinFeatures` returned
     by `GET /analysis/{id}`.
   - **Recommended products** carousel — each card shows the
     product, its category and brand, and **the actual scoring
     reasons** returned by `GET /recommendations/{id}` (e.g.
     "Calms redness", "Within budget").
   - **Daily Beauty Plan** — morning + evening routines from
     `GET /plan/{id}`.

9. **Talking points for the mentor**
   - The AI module today is heuristic (OpenCV) but lives behind a
     `SkinAnalyzer` interface; swapping in a CNN is a one-file change.
   - Recommendation reasons are persisted with each recommendation
     so the UI can explain *why*.
   - Redis is a derived-data cache; the API stays functional if it
     goes down (graceful degradation).
   - Auth is mocked but shaped like a real JWT flow.

If something breaks during the demo, see the **Troubleshooting**
section below.

### Smoke test (no UI)
```bash
# 1) upload
ANALYSIS=$(curl -s -F "file=@./design/01-intro.png;type=image/png" \
  http://localhost:8000/analysis/upload | jq -r '.analysis_id')

# 2) quiz
curl -s -X POST http://localhost:8000/quiz/submit \
  -H 'Content-Type: application/json' \
  -d "{\"analysis_id\":$ANALYSIS,\"self_reported_skin_type\":\"combination\",\"concerns\":[\"hydration\",\"pores\"],\"sensitivity\":false,\"budget\":\"medium\"}"

# 3) recommendations
curl -s http://localhost:8000/recommendations/$ANALYSIS | jq '.items | length'

# 4) plan
curl -s http://localhost:8000/plan/$ANALYSIS | jq '.summary'
```

### Troubleshooting

| Symptom | Fix |
|---|---|
| `docker compose up` hangs on Postgres | first boot can take ~15 s; healthcheck waits |
| `connection refused` to Redis from backend | `redis` container not yet up — backend retries; the cache also degrades gracefully |
| Frontend says "Failed to fetch" | check that `BACKEND_CORS_ORIGINS` in compose includes the URL you opened in the browser |
| `/analysis/upload` returns 415 | the file isn't JPG/PNG/WEBP — UI now validates this before the call |
| `/analysis/upload` returns 422 | image is smaller than 64×64 px — pick a bigger photo |

---

## 🔌 API endpoints

| Method | Path                                | Description                                          |
|--------|-------------------------------------|------------------------------------------------------|
| GET    | `/health`                           | Service health (database + Redis)                    |
| POST   | `/auth/login`                       | Mock login — returns a bearer token for an email     |
| POST   | `/analysis/upload`                  | Single (`file`) or 3-shot (`front`+`left?`+`right?`) — see [Smart Camera capture](#-smart-camera-capture) |
| GET    | `/analysis/history`                 | List previous analyses (newest first) for the user   |
| GET    | `/analysis/{analysis_id}`           | Fetch raw skin features for an analysis              |
| GET    | `/analysis/{analysis_id}/details`   | Full snapshot — features + quiz + recos + plan       |
| POST   | `/quiz/submit`                      | Submit quiz answers (eagerly persists recos + plan)  |
| GET    | `/recommendations/{analysis_id}`    | Get ranked product recommendations + reasons         |
| GET    | `/plan/{analysis_id}`               | Get morning/evening routine + weekly + lifestyle tips|
| GET    | `/products`                         | List the product catalogue (optional `?category=`)   |
| POST   | `/products`                         | Seed/admin endpoint — create a product               |

Full OpenAPI schema: `GET /openapi.json` (Swagger UI at `/docs`).
A ready-to-import Postman collection lives in
[`postman/SkinMatch.postman_collection.json`](postman/SkinMatch.postman_collection.json).

---

## 🧠 AI module — current state

The analyzer in
[`backend/app/ai/heuristic_analyzer.py`](backend/app/ai/heuristic_analyzer.py)
is **deliberately heuristic, not a trained model**. For the MVP it
extracts five named OpenCV/NumPy signals from the face region and maps
them to the six output features:

```
brightness   = mean(V channel of HSV)
redness      = mean(R - 0.5 * (G + B))            normalised 0..1
contrast     = std(grayscale)                      normalised 0..1
saturation   = mean(S channel of HSV)              normalised 0..1
sharpness    = var(Laplacian of grayscale)         normalised 0..1
```

Mapping rules:

- `skin_type` — `oily` if bright + smooth; `dry` if dim + textured;
  `combination` if mid-bright + moderately saturated; otherwise
  `normal`.
- `redness_level`, `pigmentation_level` — bucketed from the redness
  and contrast signals.
- `hydration_level` — bucketed from `1 - contrast` (smoother = more
  hydrated, in this proxy).
- `pores_score` — contrast, dampened on dim images.
- `confidence_score` — `0.6 * sharpness + 0.4 * face_found`.

This is intentional: the project is an **engineering MVP**, not a
machine-learning thesis. The architecture (single
`SkinAnalyzer` interface + factory in `pipeline.py`) is built so that
the heuristic implementation can be replaced by a trained CNN
(MobileNet, EfficientNet, or a fine-tuned transformer) without
touching the service or API layers.

### AI Skin Report on the ResultsPage

The provider abstraction (`local`, `mock_haut`, …) can return a
normalized superset of `SkinFeatures` — `oiliness`, `acne`,
`fine_lines`, `texture`, `recommendation_signals`, `confidence_score`,
`provider`, `analyzed_at`. `/analysis/{id}/details` exposes those as
an optional `ai_metrics` sidecar alongside the legacy `features`
block, so old scans keep working and new scans surface the richer
signals.

The frontend `ResultsPage` reads both:

- **Hero summary** — keeps the original skin-type heading and blob
  aesthetic; adds a confidence pill (High / Medium / Low) and a
  user-facing source label (*AI-powered analysis* or *Basic analysis*).
  Internal provider names like `mock_haut` are never shown.
- **Skin profile** — 2-column metric grid driven by legacy features
  (hydration / redness / pigmentation / pores) plus, when present,
  the extended metrics from `ai_metrics`.
- **Focus areas** — 2–4 actionable chips (*Oil control*, *Hydration
  support*, *Barrier support*, *Texture smoothing*, *Pore care*,
  *Breakout support*, *Tone balance*, *Daily SPF support*) ranked
  by signal strength.
- **Personalized insights** — 2–3 cautious, hedged sentences ("may",
  "suggests", "can help") — never diagnostic.
- **Recommendations** — existing product cards, with a tagline that
  ties the picks back to the top focus areas.

Legacy fallback: when `ai_metrics` is missing or its
`provider === "legacy"`, the page renders just the legacy profile,
shows *Basic analysis*, and hides extended metric rows. Final product
recommendations still combine image-derived metrics with quiz answers
exactly as before — the AI report is purely a presentation layer.

Pure helpers live in
[`frontend/src/lib/aiReport.ts`](frontend/src/lib/aiReport.ts) and
are covered by [`aiReport.test.ts`](frontend/src/lib/aiReport.test.ts);
the page itself is covered by
[`ResultsPage.test.tsx`](frontend/src/pages/ResultsPage.test.tsx).

### Real Haut.AI provider

`SKIN_ANALYSIS_PROVIDER` switches the analyzer at runtime — no code
change needed to flip a Railway deploy between the local heuristic, the
deterministic mock, and the real third-party AI:

| value         | provider                       | when to use                                                                                  |
| ------------- | ------------------------------ | -------------------------------------------------------------------------------------------- |
| `local`         | OpenCV heuristic (default)        | Local dev with no network. Cheap, deterministic, single-image only.                          |
| `mock_haut`     | `MockHautAIProvider`              | Demos & dev. Deterministic per image hash, returns realistic AI-shaped metrics. **No API key required.** |
| `haut_ai`       | `HautAIProvider` (real)           | Production. Calls the live Haut.AI HTTP API via `httpx.AsyncClient`. Requires `HAUT_AI_API_KEY`. |
| `openai_vision` | `OpenAIVisionProvider` (real)     | Production. Calls OpenAI Vision (`gpt-4o-mini`) via the official SDK with a strict-JSON cosmetic-skin prompt. Requires `OPENAI_API_KEY`. |

The real provider lives in
[`backend/app/ai/providers/haut_ai.py`](backend/app/ai/providers/haut_ai.py)
and is structured so the wire shape can be swapped without touching
the rest of the system:

- `_build_request_payload(...)` composes the outbound JSON
  (`{"images": [{"pose": "front", "content_base64": "..."}]}` today).
  Multi-image is already supported — `left` / `right` photos are
  appended when present.
- `_send_request(...)` is the **only** place the network is touched.
  Uses `httpx.AsyncClient` inside an `asyncio.run(...)` so the public
  `analyze()` method stays synchronous (no churn on the service
  layer / FastAPI request handlers).
- `_normalize_response(...)` projects the vendor payload onto
  `NormalizedSkinAnalysisResult`.  Tolerant by design: every metric
  is optional, accepts numeric 0–100 *or* 0–1 *or* `"low|medium|high"`
  strings, and falls back to conservative schema defaults rather
  than crashing on a missing field.

The placeholder endpoint and field names live as constants at the top
of `haut_ai.py` — when we get real Haut.AI credentials and docs, only
those constants plus the three private methods above should need
updating.

#### Required environment

| var                                 | required when               | notes                                                                                      |
| ----------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------ |
| `SKIN_ANALYSIS_PROVIDER`            | always                      | `local` \| `mock_haut` \| `haut_ai`. Defaults to `local`.                                  |
| `HAUT_AI_API_KEY`                   | when provider = `haut_ai`   | Missing key → `HautAIConfigError` raised loudly at factory time. Never logged.             |
| `HAUT_AI_BASE_URL`                  | optional                    | Defaults to `https://api.haut.ai`. Override for staging / mock servers.                    |
| `HAUT_AI_TIMEOUT_SECONDS`           | optional                    | Defaults to `30`. Applies to every Haut.AI HTTP call.                                      |
| `SKIN_ANALYSIS_FALLBACK_PROVIDER`   | optional                    | `local` or `mock_haut`. **Cannot be `haut_ai`** (would loop) — rejected at factory time. |

#### Fallback behaviour

If `SKIN_ANALYSIS_FALLBACK_PROVIDER` is set and a Haut.AI request fails
at runtime (auth, 4xx, 5xx, timeout, network), the configured fallback
provider runs and its result is returned with two extra keys on
`raw_summary`:

```json
{
  "fallback_used": true,
  "original_provider": "haut_ai",
  "original_provider_error": "Haut.AI server error (HTTP 503)"
}
```

That way operators can spot fallback events in `features_json` without
trawling logs. **Config errors (missing API key, invalid fallback
name) never trigger the fallback** — they propagate so a deploy-time
misconfig fails loudly instead of silently degrading the experience.

#### Safety

- API keys are read once at startup and never logged.
- Raw provider payloads are **not** stored — `raw_summary` is limited
  to `provider_request_id`, `model_version`, `received_metrics`,
  `images_received`, `processing_time_ms`, plus the fallback markers.
  No base64, no masks, no thumbnails.
- The frontend only ever sees the normalized `ai_metrics` view; it has
  no path to the raw vendor JSON.
- In production, set `HAUT_AI_BASE_URL` to an HTTPS endpoint and store
  `HAUT_AI_API_KEY` as a secret (Railway / 1Password / Doppler — never
  in version control).

#### Tests

`backend/app/tests/ai/test_providers_haut_ai.py` covers:

- construction-time config errors (missing key, looping fallback),
- request payload shape (endpoint, auth header, base64 image list),
- normalization across numeric + categorical responses,
- tolerance to missing optional metrics,
- error classification (401/403 → auth, 4xx → request, 5xx →
  server, timeout → server, invalid JSON → request),
- the fallback contract (request-time errors only, `raw_summary`
  annotation present),
- `raw_summary` discipline (no base64, no `images` key, no full
  vendor body),
- factory routing (`haut_ai`, fallback resolution, rejection of
  `haut_ai` as its own fallback and of unknown fallback names).

A single live integration test (`test_live_haut_ai_smoke`) opts in via
`HAUT_AI_API_KEY` in the environment; the normal test suite skips it.

### OpenAI Vision provider

`SKIN_ANALYSIS_PROVIDER=openai_vision` routes analyses through OpenAI's
vision-capable chat completion (`gpt-4o-mini` by default) using the
official `openai` Python SDK. It is structured the same way as the
Haut.AI provider so the rest of the system stays untouched:

- `_build_messages(...)` composes the request: a strict system prompt
  (cosmetic-only, JSON-only) plus a single user turn carrying a `text`
  part and an `image_url` part with the front photo inlined as a base64
  data URL.
- `_call_openai(...)` is the **only** place the SDK is touched. It
  uses `response_format={"type": "json_object"}` so the model returns
  strict JSON, classifies every failure mode into a typed
  `OpenAIVisionError` subclass, and parses the JSON content defensively.
- `_normalize_response(...)` projects the model JSON onto
  `NormalizedSkinAnalysisResult`. Tolerant by design: every metric is
  optional, categorical strings (`"low" | "medium" | "high"`) and
  numeric scores (0–1 or 0–100) both parse, and anything we can't
  parse falls back to conservative schema defaults. The `pores_score`
  legacy field is derived from `pores_visibility` (`LOW→0.2`,
  `MEDIUM→0.5`, `HIGH→0.8`).

Only the front photo is sent today. The `left` / `right` parameters
on `analyze(...)` are accepted and dropped to preserve interface
compatibility — they are still persisted by the service layer, so a
future multi-angle variant can pick them up without touching the
`SkinAnalysisProvider` contract.

#### Safety prompt

The system prompt explicitly forbids medical or dermatological
diagnosis, disease names, and certainty language; the model is asked
for visually estimable cosmetic signals only. A unit test pins the
"do not provide medical" / "dermatological diagnosis" / "disease"
markers so anyone editing the prompt is forced to keep the safety
guidance explicit.

#### Required environment

| var                                 | required when                    | notes                                                                                      |
| ----------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------ |
| `SKIN_ANALYSIS_PROVIDER`            | always                           | One of `local`, `mock_haut`, `haut_ai`, `openai_vision`. Defaults to `local`.              |
| `OPENAI_API_KEY`                    | when provider = `openai_vision`  | Missing key → `OpenAIVisionConfigError` raised loudly at factory time. Never logged.       |
| `OPENAI_MODEL`                      | optional                         | Defaults to `gpt-4o-mini`. Override to point at a different vision-capable chat model.     |
| `OPENAI_TIMEOUT_SECONDS`            | optional                         | Defaults to `30`. Applies to every OpenAI call.                                            |
| `SKIN_ANALYSIS_FALLBACK_PROVIDER`   | optional                         | `local` or `mock_haut`. **Cannot be `openai_vision`** (would loop) — rejected at factory time. |

#### Fallback behaviour

If `SKIN_ANALYSIS_FALLBACK_PROVIDER` is set and an OpenAI call fails
at runtime (auth, 4xx, 5xx, timeout, network, rate-limit), the
configured fallback provider runs and its result is returned with
three extra keys on `raw_summary`:

```json
{
  "fallback_used": true,
  "original_provider": "openai_vision",
  "original_provider_error": "OpenAI rate limit exceeded"
}
```

Same rules as Haut.AI: config errors (missing key, missing SDK,
recursive fallback) **never** trigger the fallback — they propagate
so a deploy-time misconfig fails loudly.

#### Safety / privacy

- API keys are read once at startup and never logged.
- Raw model responses are **not** stored. `raw_summary` is restricted
  to `model`, `response_id`, `prompt_tokens`, `completion_tokens`,
  `received_metrics`, the short `summary` string, and the fallback
  audit markers above. No base64 image bytes ever land in
  `features_json`.
- The image is sent as an inline base64 `data:` URL inside a single
  Chat Completions request — no intermediate storage on OpenAI's
  side beyond the request itself, and no image bytes echoed back
  into the persisted result.
- The `summary` field returned by the model is hard-capped at 240
  characters in case the model ignores the "under 120 characters"
  instruction.

#### Tests

`backend/app/tests/ai/test_providers_openai_vision.py` covers:

- construction-time config errors (missing key, looping fallback),
- request shape (system prompt, JSON response format, `image_url`
  data-URL carrying the base64 front bytes, low temperature),
- the prompt's safety wording (no medical / disease language, JSON
  only),
- normalization across categorical + numeric metric shapes,
- tolerance to missing optional metrics (conservative schema
  defaults) and to unknown skin-type strings (fall back to `normal`),
- error classification (auth, rate limit → server, timeout → server,
  network → server, bad request → request, generic API → server,
  invalid / empty / non-object JSON → request),
- the fallback contract (request-time errors fall back; config
  errors propagate; `raw_summary` is annotated with audit markers),
- `raw_summary` discipline (no base64, no `data:image`, no
  `image_url`, summary length capped),
- interface compatibility — side images are accepted and dropped
  without crashing,
- factory routing (`openai_vision`, fallback resolution, rejection
  of `openai_vision` as its own fallback).

A single live integration test (`test_live_openai_vision_smoke`)
opts in via `OPENAI_API_KEY` in the environment; the normal test
suite skips it.

---

## 📸 Smart Camera capture

The `/smart-camera` route is an LRP-style guided 3-shot capture
flow built on top of MediaPipe FaceLandmarker (478 landmarks),
WebRTC `getUserMedia`, and a Canvas2D overlay. It walks the user
through three poses — **front**, **left**, **right** — gating each
capture on three independent checks:

| Gate           | Source                                         |
|----------------|------------------------------------------------|
| Lighting       | 4 Hz Rec.709 luminance sampler over a 64×64 patch |
| Face position  | size + centring of the bounding box from MediaPipe |
| Pose (yaw)     | rough degrees from `(noseTip.x − eyeMidX) / eyeWidth × 60` |

When all three gates pass we hold for 800 ms (stability), play a
3-2-1 countdown, flash, and capture a JPEG.

### Multi-image upload contract

`POST /analysis/upload` accepts **either** payload, never a mix:

```http
# Legacy (manual uploader / older clients)
file: <image>

# Smart Camera 3-shot (front required, sides optional)
front: <image>
left:  <image>?
right: <image>?
```

Server-side behaviour:

- Each frame is validated independently (content-type, extension,
  size). A bad side frame fails the whole request with a 415.
- All accepted frames are persisted to disk; the front file is
  mirrored into the legacy `image_path` column on `SkinScan` so
  history, details, and recommendation reads keep working with
  zero branching.
- Per-pose paths land in the new nullable columns
  `image_front_path`, `image_left_path`, `image_right_path`.
- **MVP heuristic analysis runs on the FRONT image only.** The
  side photos are stored for a future multi-angle pipeline (the
  `SkinAnalyzer` interface is ready to accept multiple frames once
  a trained model can use them).

The response payload echoes whichever paths were set:

```json
{
  "analysis_id": 42,
  "features": { ... },
  "image_path":        "uploads/abcdef.jpg",   // = image_front_path on multi
  "image_front_path":  "uploads/abcdef.jpg",   // null on legacy
  "image_left_path":   "uploads/123456.jpg",   // null if not sent
  "image_right_path":  "uploads/789abc.jpg"    // null if not sent
}
```

The frontend dispatches automatically: `AnalyzingPage` posts to
`uploadAnalysisMulti` whenever `flow.additionalImages` carries
either side photo, and falls back to the legacy `uploadAnalysis`
otherwise — so the manual uploader remains a fully supported path.

### Manual upload fallback

The `/capture` route still mounts a `SmartCameraIntroPage` that
offers **both** options side-by-side:

- **"Take 3 selfies"** → opens `/smart-camera` and the guided flow.
- **"Upload photo instead"** → opens the system file picker, hands
  the picked file straight to `flow.setImageFile`, and navigates to
  `/quiz/skin-type`. The legacy `CapturePage.tsx` is retained on
  disk as a reference for the previous capture UI but is no longer
  routed to.

If the user denies camera permission, or the device has no camera,
the Smart Camera flow surfaces an error overlay with a "Try again"
button and the same "Upload photo instead" pill in the footer is
always available.

### Browser / device requirements

- **HTTPS is required in production.** Browsers gate
  `navigator.mediaDevices.getUserMedia` behind a secure context;
  the only exception is `http://localhost`, which is treated as
  secure for local dev. Any non-localhost HTTP origin (LAN IP,
  staging on plain `http://`) will silently return `undefined` for
  `mediaDevices` and the camera will refuse to start. The deploy
  story therefore needs a TLS-terminating proxy or load balancer
  in front of the frontend.
- **MediaPipe assets.** The face landmarker pulls its WASM bundle
  from `cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm`
  and a ~3.7 MB `face_landmarker.task` float-16 model from
  `storage.googleapis.com/mediapipe-models/...`. Both must be
  reachable from the user's browser; if you self-host the bundle,
  override the CDN paths in `useFaceMesh.ts`. Total Smart Camera
  payload over the wire on first visit is ≈ 6 MB (WASM + model);
  subsequent loads are cached.
- **iOS Safari quirk.** The `<video>` element must carry both
  `autoPlay` and `playsInline` — without `playsInline`, iOS opens
  the stream full-screen. Both are already set on `SmartCameraPage`.

### Storage note (no production DB yet)

Because the project is **not deployed yet**, the new `image_front_path`,
`image_left_path`, and `image_right_path` columns are part of the
initial schema that `Base.metadata.create_all()` materialises from
SQLAlchemy. There are no production rows to migrate.

⚠️ **Future deployments with an existing database WILL need a
migration.** `Base.metadata.create_all()` only creates *missing*
tables; it does not add columns to existing ones. When the project
ships, introduce Alembic (or a one-shot `ALTER TABLE` script in
`backend/app/db/`) and add the three columns as nullable before
rolling out the new image. Until then, fresh dev databases just
work out of the box.

---

## 🧬 Skincare quiz design

The Smart Camera + AI analyser tells us **what the skin looks like**;
the quiz tells us **what the user is doing about it and what they
need help with**. The two streams meet inside the recommendation +
plan services. We keep the quiz config-driven (`frontend/src/config/
skinQuiz.ts`) so questions can be added or reworded without touching
the rendering page.

### Why a quiz at all (and not just AI)

Heuristic image analysis returns six numeric signals (skin type +
4 levels + 2 scores) but cannot — and shouldn't try to — infer:

| Signal | Source | Why not the AI |
|--------|--------|----------------|
| Self-perceived skin type | Quiz (Q1) | Lets us compare with AI-detected type → confidence reading; lets undecided users defer to AI ("not sure"). |
| User-prioritised concerns | Quiz (Q2) | The image can spot redness/pores objectively, but "acne breakouts" / "fine lines" / "dryness as a feeling" are subjective. |
| Sensitivity level | Quiz (Q3) | Reactivity is behavioural — only the user knows whether retinol burns. |
| Current routine level | Quiz (Q4) | Plan complexity has to match the user's actual willingness, not their skin's objective need. |
| Breakout frequency | Quiz (Q5) | A clear-looking day in the photo says nothing about monthly cycles. |
| Daily environment | Quiz (Q6) | Pollution / sun exposure depends on geography + lifestyle, not on facial pixels. |
| Sunscreen usage | Quiz (Q7) | Pure behaviour question; SPF education is high-value for the "rarely or never" cohort. |

### Question → answer slot → backend signal

The full set is a flat `QuizQuestion[]` array (see
`frontend/src/config/skinQuiz.ts`). At submit time
`frontend/src/services/quizMapping.ts` projects the rich UI
vocabulary down to the legacy `Concern` enum the recommendation
engine has always understood, and the new fields ride along as
optional extras:

```
UI option            → wire field                            → consumer
─────────────────────────────────────────────────────────────────────────
Q1 skin_type         self_reported_skin_type (legacy)           reco confidence
                     ("not_sure" collapses to omitted field —
                      backend treats it as "AI decides")
Q2 concerns          concerns      (legacy, mapped + deduped)   reco scoring
                   + raw_concerns  (new, preserved 7-way)       analytics
Q3 sensitivity       sensitivity   (legacy bool — true ONLY     reco engine
                                    for "very_sensitive")
                   + raw_sensitivity (new, 3-way)               plan rules
Q4 routine_level     routine_level (new)                        plan rules
Q5 breakout_freq     breakout_frequency (new)                   reco rule
Q6 daily_env         daily_environment (new)                    reco rule
Q7 sunscreen_usage   sunscreen_usage (new)                      reco + plan
```

The 6 new optional fields land in `QuizAnswer.answers_json`
without a DB migration — the column is already a JSON blob and
`QuizService.submit()` already dumps the whole Pydantic payload.

### How answers shape recommendations

`backend/app/services/recommendation_service.py` keeps its existing
algebra (concern weights, budget, skin-type filter, core-category
bonus). Three new IF-branches inside the per-product loop add small,
deterministic bumps:

| Quiz signal | Catalogue match | Score bonus | Reason emitted |
|-------------|-----------------|-------------|----------------|
| `breakout_frequency == "often"` | `concerns ∋ "oiliness"` OR `"pores"` | **+0.5** | "Helps with frequent breakouts" |
| `sunscreen_usage == "rarely_never"` | `category == "sunscreen"` | **+0.6** | "Supports daily sun protection" |
| `daily_environment == "urban_pollution"` | `concerns ∋ "pigmentation"` (antioxidant proxy) | **+0.3** | "Helps protect skin from pollution" |

Rules are independent — no compounding, no thresholds, no
ingredient-string parsing. Each one reads exactly one quiz field
and matches against exactly one static catalogue tag. Unknown /
typo values for a quiz field silently degrade to no-op.

A subtle Step-4 design choice: the `sunscreen_usage` bonus is
applied **before** the score-zero filter, so an SPF product
appears in the top-N even for a user who declared no explicit
concerns. This matches the intent of "tell rare-sunscreen users
they need SPF".

### How answers shape the routine plan

`backend/app/services/plan_service.py` exposes the same kind of
single-purpose IF-branches at the plan layer:

| Quiz signal | Effect |
|-------------|--------|
| `routine_level == "no"` | Collapse to a 3-step morning (cleanser → moisturizer → SPF) and a 2-step evening (cleanser → moisturizer). Beginners get something they can actually keep up with. |
| `sensitivity == True` *or* `raw_sensitivity == "very_sensitive"` | Drop the evening "treatment" (retinol/acid) step. Swap the Monday weekly tip to a gentler enzyme-exfoliation suggestion. Append a 24h patch-test reminder to lifestyle tips. |
| `sunscreen_usage == "rarely_never"` | Add an "Every day" weekly SPF reminder and a "set a phone reminder for the first 2 weeks" lifestyle nudge. |

If both `routine_level=no` and `very_sensitive` are set, the
beginner sequence wins — it already lacks the "treatment" step,
so the rules converge rather than conflict.

### Diploma-defence cheat sheet

- **Every rule is one IF-statement** — searchable by the constants
  `BREAKOUT_BONUS` / `SUNSCREEN_BONUS` / `POLLUTION_BONUS` in
  `recommendation_service.py` and `_select_sequences()` /
  `_is_very_sensitive()` in `plan_service.py`. No "scoring
  pipelines", no derived weights.
- **Every rule emits a human-readable reason** persisted in
  `Recommendation.reason_json`. The `/recommendations/:id` UI
  shows them verbatim, so any scoring decision can be explained
  back to the user without reading source.
- **Every rule is unit-tested in isolation** — see `test_plan.py` +
  the 5 new cases in `test_recommendations.py`. A regression in
  one rule fails one specific test name.
- **All Step-3..Step-5 wire additions are optional** — legacy
  callers (manual upload + pre-existing tests) keep working
  byte-for-byte. Documented inline in every affected schema.

---

## 🗂 History flow

Every analysis is fully persisted in PostgreSQL across four tables:

| Table             | When written                                  |
|-------------------|-----------------------------------------------|
| `skin_scans`      | `POST /analysis/upload`                       |
| `quiz_answers`    | `POST /quiz/submit`                           |
| `recommendations` | eagerly during `POST /quiz/submit`            |
| `routine_plans`   | eagerly during `POST /quiz/submit`            |

The eager persistence path means that by the time `/quiz/submit`
returns, the full snapshot (features + quiz + recos + plan) is
durable. `GET /analysis/history` therefore always shows top-product
names for completed flows.

The frontend exposes this via:

- A **"View my results"** link on the home screen.
- A **history icon** in the results header.
- The **`/history`** route — a list of previous analyses with date,
  detected skin type, AI confidence and the top three recommended
  product names.
- Tapping a card opens **`/results/:id`** which reuses the same
  `ResultsPage` UI but loads from `GET /analysis/{id}/details` (a
  single round-trip).

### Demo: view previous results

1. Run at least one full analysis (upload → quiz → results).
2. From the home screen tap **"View my results"** (or the ≡ icon
   in the results header).
3. The history page shows your most recent analysis card with date,
   skin type, AI confidence and top-3 product names.
4. Tap the card → opens the same results screen for that historical
   analysis. Run a second analysis and the new card appears at the
   top.

Smoke-test the same path with curl:
```bash
# After running the full flow at least once
curl -s http://localhost:8000/analysis/history | jq
curl -s http://localhost:8000/analysis/1/details | jq '.features, .recommendations | length'
```

---

## 🧪 Testing

```bash
cd backend
pytest -ra
```

The suite covers:
- `/health` endpoint and root metadata.
- Heuristic analyzer (output ranges, validation of tiny images).
- `/analysis/upload` — full request/response cycle on an in-memory
  SQLite database.
- Recommendation engine (skin-type filtering, reasons, budget rules).
- Product CRUD + filtering.

The Postman collection lets you exercise the same flow manually in 5
clicks: login → upload → quiz → recommendations → plan.

---

## 🐳 Docker layout

```
docker compose up --build
├─ postgres   (port 5432, persistent volume)
├─ redis      (port 6379, persistent volume)
├─ backend    (port 8000, mounts /app/uploads volume)
└─ frontend   (port 8080, nginx serving the Vite build)
```

Healthchecks on PostgreSQL and Redis ensure the backend only starts
once dependencies are ready. Uploaded images are stored on a Docker
volume — for AWS deployment this should be replaced with S3 (the
`AnalysisService._persist` method is the single integration point).

---

## ☁️ AWS deployment notes

The MVP is ready for AWS in the following shape:
- `backend` → ECS Fargate or App Runner (image pushed to ECR by CI).
- `frontend` → S3 + CloudFront, or container on ECS.
- `postgres` → RDS for PostgreSQL.
- `redis` → ElastiCache.
- `uploads` → S3 (replace `AnalysisService._persist` with an S3 client).
- `secrets` → AWS Secrets Manager / SSM Parameter Store.

The GitHub Actions workflow already builds container images; adding a
deploy step (`docker login` → ECR → `aws ecs update-service`) is a
short follow-up.

---

## 🔭 Architectural decisions (for the thesis defense)

1. **Layered architecture (api / services / repositories / models)**
   — separates HTTP, business logic, and persistence so each layer
   can be tested and replaced independently.
2. **Pluggable AI module via a single `SkinAnalyzer` interface** —
   today a heuristic, tomorrow an ONNX or PyTorch model; consumers
   never change.
3. **Pydantic schemas at the boundary** — typed request/response
   contracts, automatic OpenAPI documentation, and runtime validation
   without manual code.
4. **Redis as a cache, not a source of truth** — recommendations and
   plans are derived data; cache is invalidated on quiz/upload events.
5. **Mock auth** — the `core/security.py` module has the same shape as
   a real JWT flow, so swapping is local and minimally disruptive.
6. **Docker Compose for local parity** — every developer (and CI) sees
   the same stack: Postgres, Redis, backend, frontend.
7. **Idempotent seed** — product catalogue auto-seeds on first boot,
   safe on every restart/redeploy.

---

## ✅ What's already done

- End-to-end MVP: upload → analyze → quiz → recommendations → plan.
- Full API surface with OpenAPI/Swagger.
- React frontend with the complete user journey.
- PostgreSQL schema (User, SkinScan, QuizAnswer, Product,
  Recommendation, RoutinePlan).
- Redis caching with graceful degradation.
- Heuristic AI module with deterministic, explainable outputs.
- Rule-based + scoring recommendation engine with reasons.
- pytest suite covering the core paths.
- Postman collection.
- Docker Compose orchestration.
- GitHub Actions CI (tests, typecheck, builds).

## 🟡 What is mock / heuristic (and why)

- **AI analyzer** — heuristic CV signals, *not* a trained model. The
  goal of the diploma is the system, not the model. The interface is
  ML-ready.
- **Auth** — token equals base64(email). Adequate for an MVP demo;
  swap for `python-jose` JWT or OAuth in production.
- **Image storage** — local filesystem volume; production should use S3.
- **Product catalogue** — small curated seed; production should be
  populated from a real e-commerce / affiliate source.

## 🚀 Next steps

1. **Train a real model.** Fine-tune MobileNetV3 / EfficientNet-B0 on a
   labelled skin-condition dataset; ship as ONNX; add an
   `OnnxSkinAnalyzer(SkinAnalyzer)` and switch via `AI_ANALYZER` env.
2. **Real auth.** Replace `core/security.py` with signed JWTs and add
   an OAuth provider (Google / Apple sign-in).
3. **S3 storage adapter.** Extract `AnalysisService._persist` into a
   `StorageBackend` interface with `LocalStorage` and `S3Storage`
   implementations.
4. **Async job queue.** Move analyzer execution off the request path
   into Celery/RQ; return a job ID and a websocket update.
5. **Personalization & history.** Per-user analysis history,
   progress tracking, before/after comparisons.
6. **A/B-testable recommendation engine.** Pluggable scoring strategies
   (rule-based, learned-to-rank) behind a feature flag.
7. **Observability.** Structured logging, OpenTelemetry traces,
   Prometheus metrics, error tracking (Sentry).
8. **Deploy to AWS** via Terraform (RDS, ElastiCache, ECS, S3,
   CloudFront).

---

## 📁 Repository structure

```
.
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── core/         # config, security
│   │   ├── api/v1/       # routers (health, auth, analysis, quiz, ...)
│   │   ├── models/       # SQLAlchemy ORM
│   │   ├── schemas/      # Pydantic
│   │   ├── services/     # business logic
│   │   ├── repositories/ # DB access
│   │   ├── db/           # session, init, seed
│   │   ├── ai/           # SkinAnalyzer + heuristic impl
│   │   └── tests/        # pytest
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/api.ts
│   │   ├── types/
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── Dockerfile
├── postman/
│   └── SkinMatch.postman_collection.json
├── docker-compose.yml
├── .github/workflows/ci.yml
└── README.md
```

---

## License

Educational use — MSc thesis project. Free for academic and personal
exploration; commercial use of brand names in the seed catalogue is not
implied.
