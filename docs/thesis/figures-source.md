# Рисунки до розділу 3.4 — Архітектура SkinMatch

У цій папці лежать рисунки у SVG/PNG форматах, готові до вставки в Google Docs:

- `figure-3.1-architecture.svg` — загальна 4-рівнева архітектура (Frontend ↔ Backend ↔ AI ↔ Storage)
- `figure-3.2-providers.svg` — UML-діаграма provider-based архітектури AI
- `figure-3.3-fusion.svg` — confidence-aware fusion: правила об'єднання AI та квизу

## Як вставити в Google Docs

**Варіант А — SVG напряму (швидко):**
1. У Google Docs: `Вставка → Зображення → Завантажити з комп'ютера`.
2. Вибрати `figure-3.1-architecture.svg` або `figure-3.2-providers.svg`.
3. Google автоматично сконвертує у растрове зображення.

**Варіант Б — попередньо в PNG (вище якість для друку):**
1. Відкрити SVG-файл у Chrome (`файл → відкрити`).
2. Натиснути правою кнопкою → `Зберегти зображення як…` → `PNG`.
3. Завантажити PNG у Google Docs.

**Варіант В — через mermaid.live** (якщо хочеш сам відредагувати):
1. Відкрити https://mermaid.live
2. Вставити Mermaid-код з блоків нижче.
3. Експортувати як PNG/SVG.

---

## Mermaid-source для редагування

### Рисунок 3.1 — Архітектура системи

```mermaid
flowchart TB
    subgraph FE["КЛІЄНТСЬКА ЧАСТИНА — Frontend (React + TypeScript)"]
        direction LR
        L["Landing<br/>Page"]
        SC["Smart Camera<br/>MediaPipe + 3-shot"]
        Q["Quiz Module<br/>7 питань"]
        R["Results Page<br/>AI Skin Report"]
        H["History Module<br/>попередні аналізи"]
    end

    subgraph BE["СЕРВЕРНА ЧАСТИНА — Backend (FastAPI)"]
        direction LR
        A["Автентифікація<br/>scrypt + JWT<br/>get_current_user"]
        API["REST API<br/>/analysis · /auth<br/>/quiz · /history"]
        AS["Analysis Service<br/>валідація + персистенція<br/>+ виклик провайдера"]
        RS["Recommendation +<br/>Plan Services<br/>скорінг + рутина"]
    end

    subgraph AI["AI-РІВЕНЬ — Provider-based аналіз"]
        IP["«interface» SkinAnalysisProvider<br/>analyze(front, left?, right?)"]
        LH["Local<br/>Heuristic<br/>(OpenCV)"]
        MH["Mock Haut<br/>(детерм. мок)"]
        OV["OpenAI Vision<br/>(gpt-4o-mini)"]
        N["Шар нормалізації<br/>NormalizedSkinAnalysisResult"]
        IP -.- LH
        IP -.- MH
        IP -.- OV
        LH --> N
        MH --> N
        OV --> N
    end

    subgraph DB["РІВЕНЬ ЗБЕРЕЖЕННЯ — PostgreSQL"]
        T1["users"]
        T2["skin_scans"]
        T3["quiz_answers"]
        T4["recommendations"]
        T5["routine_plans"]
    end

    FE -- "REST API · HTTPS · JWT" --> BE
    BE -- "SkinAnalysisProvider.analyze()" --> AI
    BE -- "SQLAlchemy ORM" --> DB
    AI -- "Normalized result" --> BE
```

### Рисунок 3.2 — Provider-based архітектура AI

```mermaid
classDiagram
    class SkinAnalysisProvider {
        <<interface>>
        +name: str
        +analyze(front, left?, right?) NormalizedSkinAnalysisResult
    }

    class LocalHeuristicProvider {
        +name = "local"
        +analyze(...)
        -OpenCV + NumPy
        -Haar cascade + HSV
        -fallback за замовчуванням
    }

    class MockHautProvider {
        +name = "mock_haut"
        +analyze(...)
        -seed = sha256(front_bytes)
        -реалістичні розподіли
        -для демо й E2E тестів
    }

    class OpenAIVisionProvider {
        +name = "openai_vision"
        +analyze(...)
        -gpt-4o-mini
        -response_format = json_object
        -без медичних діагнозів
    }

    SkinAnalysisProvider <|.. LocalHeuristicProvider
    SkinAnalysisProvider <|.. MockHautProvider
    SkinAnalysisProvider <|.. OpenAIVisionProvider

    note for SkinAnalysisProvider "Fallback-механізм:\nякщо основний провайдер недоступний,\nфабрика автоматично перемикає\nна резервний (Local або MockHaut).\nЦикл fallback-у заборонений."
```

---

## Підписи під рисунками (для вставки в Google Docs)

> **Рисунок 3.1.** Архітектура AI-орієнтованої системи персоналізованого аналізу шкіри SkinMatch. Чотири рівні (клієнтський застосунок, серверна частина, AI-рівень, рівень зберігання) взаємодіють через REST API, інтерфейс провайдера та SQLAlchemy ORM.

> **Рисунок 3.2.** Provider-based архітектура AI-аналізу. Єдиний інтерфейс `SkinAnalysisProvider` визначає контракт `analyze()`, який реалізують три конкретні провайдери: локальний евристичний (OpenCV), детермінований мок (Mock Haut) та OpenAI Vision. Fallback-механізм забезпечує безперервність роботи при недоступності основного провайдера.

> **Рисунок 3.3.** Довірочно-зважене об'єднання сигналів AI та квизу. Модель скорингу враховує рівень впевненості AI (`confidence_score`) при злитті незалежних джерел: при високій впевненості (≥0.75) AI домінує у визначенні типу шкіри й концернів; при середній (0.50–0.75) AI-сигнали ослабляються лінійно; при низькій (<0.50) пріоритет переходить до самооцінки користувача у квизі, або до нейтрального значення NORMAL у разі відсутності відповіді. Підсумкова вага концерну обчислюється як максимум між вагою з квизу та зваженою (за довірою) вагою з AI.
