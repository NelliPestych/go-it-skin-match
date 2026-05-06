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

Then:
- Frontend → http://localhost:8080
- Backend  → http://localhost:8000
- Swagger  → http://localhost:8000/docs

### Option B — Run services manually

**Backend**
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # adjust if running PG/Redis on non-default hosts
uvicorn app.main:app --reload
```

**Frontend**
```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

The backend will create tables and seed the product catalogue
automatically on first start.

---

## 🔌 API endpoints

| Method | Path                                | Description                                          |
|--------|-------------------------------------|------------------------------------------------------|
| GET    | `/health`                           | Service health (database + Redis)                    |
| POST   | `/auth/login`                       | Mock login — returns a bearer token for an email     |
| POST   | `/analysis/upload`                  | Upload an image, run AI analysis, persist scan       |
| GET    | `/analysis/{analysis_id}`           | Fetch raw skin features for an analysis              |
| POST   | `/quiz/submit`                      | Submit quiz answers tied to an analysis              |
| GET    | `/recommendations/{analysis_id}`    | Get ranked product recommendations + reasons         |
| GET    | `/plan/{analysis_id}`               | Get morning/evening routine + weekly + lifestyle tips|
| GET    | `/products`                         | List the product catalogue (optional `?category=`)   |
| POST   | `/products`                         | Seed/admin endpoint — create a product               |

Full OpenAPI schema: `GET /openapi.json` (Swagger UI at `/docs`).
A ready-to-import Postman collection lives in
[`postman/SkinMatch.postman_collection.json`](postman/SkinMatch.postman_collection.json).

---

## 🧠 AI module — current state

The current analyzer in
[`backend/app/ai/heuristic_analyzer.py`](backend/app/ai/heuristic_analyzer.py)
is **deliberately heuristic, not learned**:

- Haar-cascade face detection narrows the analysis to the face region.
- Color-space transforms (BGR → HSV/LAB) and morphological operators
  produce per-feature signals (redness, hydration proxy, pigmentation
  proxy, pores).
- A confidence score is derived from image sharpness (Laplacian
  variance) and face-detection success.

This is intentional: the project is an **engineering MVP**, not a
machine-learning thesis. The architecture (single
`SkinAnalyzer` interface + factory in `pipeline.py`) is built so that
the heuristic implementation can be replaced by a trained CNN
(MobileNet, EfficientNet, or a fine-tuned transformer) without
touching the service or API layers.

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
