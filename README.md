---
title: BiSpec Pairwise AI
emoji: 🧬
colorFrom: blue
colorTo: pink
sdk: docker
app_port: 7860
pinned: false
short_description: Clinical-Safe Bispecific Antibody Target-Pair Discovery (95.06% ROC-AUC)
---

# BiSpec Pairwise AI

**Clinical-Safe Bispecific Antibody Target-Pair Discovery Platform** — advancing beyond single-model pairwise XGBoost (*Zhang et al., 2024*) with a leakage-free, monotonically safety-constrained **Clinical Safe Ensemble (95.06% Holdout ROC-AUC · 95.54% 5-Fold CV · 90.3% Specificity)**, **FastAPI + SQLite Auth**, **NVIDIA NIM + FAISS Literature RAG**, and a token-pure **Sky & Coral Light UI**.

---

## Team & Branch Architecture (5-Module Prototype)

Each module of the working prototype is organized on its own dedicated feature branch and merged cleanly into `main`:

| # | Branch | Module & Ownership | Contributor | Key Files to Open During Demo |
|---|---|---|---|---|
| **01** | `feat/ml-pairwise-engine` | **ML Pairwise Engine & Safety Ensemble** — 771 deduplicated canonical pairs, 9 models, **Clinical Safe Ensemble (95.06% ROC-AUC)**, monotonic toxicity guardrails (`tox_max: -1`, `sc_safe_score: +1`) | **Prakya Sai Pranav** | [`src/model_trainer.py`](src/model_trainer.py) · [`models/`](models/) · [`DATA/`](DATA/) |
| **02** | `feat/fastapi-backend-auth` | **FastAPI REST API & SQLite Auth** — Live `/api/predict`, `/api/benchmark`, `/api/drugs`, `/api/research-history`, PBKDF2-HMAC-SHA256 auth & persistent token sessions | **Omkar Mansabdar** | [`backend/app.py`](backend/app.py) · [`run.py`](run.py) · [`requirements.txt`](requirements.txt) |
| **03** | `feat/nvidia-nim-rag` | **NVIDIA NIM + FAISS RAG & AI Copilot** — Literature-grounded 4-quadrant mechanistic synthesis & live conversational Q&A (`/api/rag/explain`, `/api/ask`) | **Hansika Ramaram** | [`src/rag_engine.py`](src/rag_engine.py) · [`src/explainability.py`](src/explainability.py) · [`rag_server.py`](rag_server.py) |
| **04** | `feat/sky-coral-ui` | **Sky & Coral Frontend & 3D Hero** — Token-pure `#F3F9FF / #0A74DA / #FF8A6B` interface, Daylight 3D bispecific video, Horizontal Screening Studio, ROC-AUC Model Arena, Pair Comparison & Clinical Registry | **Siddharth Bokka** | [`index.html`](index.html) · [`src/styles/tokens.css`](src/styles/tokens.css) · [`src/styles/daylightTheme.css`](src/styles/daylightTheme.css) · [`src/sections/appWorkspace.js`](src/sections/appWorkspace.js) |
| **05** | `feat/devops-docs-presentation` | **Deployment, Runners & Docs** — Multi-stage `Dockerfile`, `render.yaml`, `vercel.json`, 1-click dual-port launchers, and live demo walkthrough | **Mayank Meegada** | [`Dockerfile`](Dockerfile) · [`render.yaml`](render.yaml) · [`start_app.bat`](start_app.bat) · [`docs/PRESENTATION_WALKTHROUGH.md`](docs/PRESENTATION_WALKTHROUGH.md) |

---

## Verified Benchmark Results (Holdout ROC-AUC)

| Model | Category | ROC-AUC | Highlights |
|---|---|---:|---|
| **Clinical Safe Ensemble** | **New Champion (Live)** | **95.06%** | 4-Model Quorum · 95.54% 5-Fold CV · 90.3% Specificity · `+5.77%` vs Base XGBoost |
| **HistGBDT (Monotonic Safe)** | **New Live Model** | **94.89%** | Hard monotonic toxicity constraints (`tox_max: -1`, `sc_safe_score: +1`) |
| **ExtraTrees (Safety-First)** | **New Live Model** | **93.38%** | Ultra-low `+1.70%` train–test generalization gap |
| XGBoost + Pairwise AI | Base Paper (Fig. 3) | 89.29% | Zhang et al. (2024) single-model baseline peak |
| GBDT | Base Paper (Fig. 3) | 86.70% | Regularized gradient-boosted trees |
| DNN (MLP) | Base Paper (Fig. 3) | 85.92% | Multi-layer perceptron baseline |
| Random Forest | Base Paper (Fig. 3) | 84.93% | 150-tree ensemble baseline |
| Logistic Regression | Base Paper (Fig. 3) | 78.68% | Linear scaled baseline |
| Decision Tree | Base Paper (Fig. 3) | 77.00% | Depth-5 interpretable baseline |

---

## Quick Start (Local)

```powershell
# 1. Copy environment template and add your NVIDIA_API_KEY
copy .env.example .env

# 2. Launch Frontend (Port 5173) + FastAPI Backend (Port 8000) in one click
.\start_app.bat
```

Open [`docs/PRESENTATION_WALKTHROUGH.md`](docs/PRESENTATION_WALKTHROUGH.md) for the exact 5-minute code walkthrough guide during your presentation.
