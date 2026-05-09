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
- **Heuristic AI analysis** of the face image using OpenCV/NumPy →
  produces `skin_type`, `redness_level`, `hydration_level`,
  `pigmentation_level`, `pores_score`, `confidence_score`.
- **Quiz** capturing self-reported skin type, concerns, sensitivity,
  age, and budget.
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
| POST   | `/analysis/upload`                  | Upload an image, run AI analysis, persist scan       |
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
