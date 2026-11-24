# BiSpec Pairwise AI — Live Presentation Code Walkthrough

Use this quick map during your presentation to jump straight to each team member's branch and code section on GitHub.

---

## Part 1 — ML Pairwise Engine & Clinical Safe Ensemble (`feat/ml-pairwise-engine`)
- **Owner**: Prakya Sai Pranav
- **Open on GitHub**:
  - [`src/model_trainer.py`](../src/model_trainer.py) — Canonical pair deduplication (`771` unique pairs, `0%` A–B vs B–A leakage), monotonic toxicity constraints (`tox_max: -1`, `sc_safe_score: +1`), and 9-model training + calibration pipeline.
  - [`models/benchmark_metrics.json`](../models/benchmark_metrics.json) — Verified holdout ROC-AUC (`95.06%`), 5-Fold CV (`95.54%`), and specificity (`90.3%`).
  - [`DATA/processed_dataset.csv`](../DATA/processed_dataset.csv) — Clinical bispecific antibody precedents & single-cell target features (`GSE131907`, `208,506` NSCLC cells).

---

## Part 2 — FastAPI REST Backend & SQLite Auth (`feat/fastapi-backend-auth`)
- **Owner**: Omkar Mansabdar
- **Open on GitHub**:
  - [`backend/app.py`](../backend/app.py) — Live `/api/predict` (returns 4-model quorum consensus, uncertainty `±%`, toxicity guardrail), `/api/benchmark`, `/api/drugs`, `/api/research-history`, `/api/health`, and SQLite PBKDF2-HMAC-SHA256 authentication + persistent session tokens.
  - [`run.py`](../run.py) & [`requirements.txt`](../requirements.txt) — Application server entrypoint and pinned Python dependencies.

---

## Part 3 — NVIDIA NIM + FAISS Literature RAG (`feat/nvidia-nim-rag`)
- **Owner**: Hansika Ramaram
- **Open on GitHub**:
  - [`src/rag_engine.py`](../src/rag_engine.py) — FAISS vector index retrieval over bispecific oncology literature + NVIDIA NIM multi-model fallback chain (`nemotron-3.5-bolt-e4b` → `nemotron-3-ultra-550b`).
  - [`src/explainability.py`](../src/explainability.py) — 4-quadrant mechanistic brief generator (Mechanism of Action, Resistance Bypass, Safety Window, Clinical Outlook).
  - [`test_rag_fastapi.py`](../test_rag_fastapi.py) — End-to-end automated RAG verification suite.

---

## Part 4 — Sky & Coral Light UI & 3D Hero (`feat/sky-coral-ui`)
- **Owner**: Siddharth Bokka
- **Open on GitHub**:
  - [`src/styles/tokens.css`](../src/styles/tokens.css) & [`src/styles/chartPalette.js`](../src/styles/chartPalette.js) — Single-source Sky & Coral design tokens (`#F3F9FF`, `#FFFFFF`, `#DCEEFF`, `#0E2A47`, `#0A74DA`, `#FF8A6B`).
  - [`src/styles/daylightTheme.css`](../src/styles/daylightTheme.css) — Token-pure styling for all 6 workbench views, horizontal Screening Pair Studio deck, ROC-AUC draw animation, and coral hover spotlight.
  - [`src/sections/appWorkspace.js`](../src/sections/appWorkspace.js) — Live FastAPI integration, 4-Model Consensus quorum UI, 5-Axis Radar SVG, ROC-AUC Arena, Pair Comparison Matrix, and 791-record Clinical Registry.
  - [`src/hero/hero.js`](../src/hero/hero.js) & [`public/assets/bispec_hero_daylight.mp4`](../public/assets/bispec_hero_daylight.mp4) — Daylight 3D bispecific antibody hero video & subtle pointer parallax.

---

## Part 5 — Deployment, Runners & Documentation (`feat/devops-docs-presentation`)
- **Owner**: Mayank Meegada
- **Open on GitHub**:
  - [`Dockerfile`](../Dockerfile) & [`.dockerignore`](../.dockerignore) — Production multi-stage Node 20 + Python 3.12 container (Render / Railway / Cloud Run / HF Spaces ready).
  - [`render.yaml`](../render.yaml) & [`vercel.json`](../vercel.json) — Cloud deployment blueprints.
  - [`start_app.bat`](../start_app.bat) & [`start.ps1`](../start.ps1) — One-click local dual-port launcher (`5173` ↔ `8000`).
