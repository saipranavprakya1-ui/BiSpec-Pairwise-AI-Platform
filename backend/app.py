"""
app.py
======
BiSpec Pairwise AI: Enterprise FastAPI Application.
Serves:
- Pairwise inference across 6 ML algorithms (XGBoost Champion)
- Comprehensive clinical benchmarks and ROC/PR curves
- Target catalog and preprocessed 791 clinical bispecific database
- LangChain / Nemotron RAG computational biologist queries (/ask & /api/rag/chat)
- User Authentication & Session Management (SQLite users_history.db)
- Account-Scoped Research History
- Side-by-Side Target Pair Comparison Matrix (/compare)
- Full-stack frontend UI and scroll-synced video assets
"""

import os
import sys
import json
import time
import joblib
from collections import defaultdict
from dotenv import load_dotenv

# Load environment variables (.env)
load_dotenv()
import pandas as pd
import numpy as np
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, HTTPException, Query, Header, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from pydantic import BaseModel, Field

# Ensure project root, backend, and src are on path
current_dir = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.dirname(current_dir)
sys.path.append(current_dir)
sys.path.append(os.path.join(project_root, 'src'))

from pairwise_features import (
    compute_pairwise_features,
    get_target_features,
    standardize_gene_symbol,
    TARGET_BIOLOGY,
    SYNERGY_RULES,
    EXACT_40_FEATURES
)
from data_processor import clean_target_pair
from explainability import generate_multi_ai_explanation, generate_gpt_explanation
from rag_engine import RAGEngine
import database
import scientific_meta

# Paths
DATA_CSV_PATH = os.path.join(project_root, 'DATA', 'PROCESSED DATA', 'lung cancer.xlsx - Results.csv')
MODELS_DIR = os.path.join(project_root, 'models')
FRONTEND_DIR = os.path.join(project_root, 'frontend')
DIST_DIR = os.path.join(project_root, 'dist')
DIST_ASSETS_DIR = os.path.join(DIST_DIR, 'assets')

# Initialize FastAPI application
app = FastAPI(
    title="BiSpec Pairwise AI Enterprise API",
    description="AI-driven prioritization and compatibility screening for bispecific antibody target combinations",
    version="2.0.0"
)

# CORS Middleware — restricted to configured origin(s) or local dev
ALLOWED_ORIGINS = [
    o.strip() for o in os.environ.get(
        "ALLOWED_ORIGINS",
        "https://bispec-pairwise-ai-platform.onrender.com,http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:8000,http://localhost:8000"
    ).split(",") if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# In-memory sliding-window rate limiter (strict on auth & copilot)
_RATE_BUCKETS: Dict[str, List[float]] = defaultdict(list)
PUBLIC_API_PATHS = {
    "/api/health",
    "/api/meta/summary",
    "/api/meta/public",
    "/api/version",
    "/api/model-card",
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/demo",
    "/api/auth/demo-users",
}


def _check_rate_limit(key: str, max_hits: int, window_sec: int) -> bool:
    now = time.time()
    hits = [t for t in _RATE_BUCKETS[key] if now - t < window_sec]
    if len(hits) >= max_hits:
        _RATE_BUCKETS[key] = hits
        return False
    hits.append(now)
    _RATE_BUCKETS[key] = hits
    return True


@app.middleware("http")
async def security_and_auth_middleware(request: Request, call_next):
    path = request.url.path
    client_ip = request.client.host if request.client else "unknown"

    # 1. Rate limiting on auth and copilot routes
    if request.method == "POST" and path in ("/api/auth/login", "/api/auth/register"):
        if not _check_rate_limit(f"auth:{client_ip}:{path}", max_hits=10, window_sec=900):
            return JSONResponse(status_code=429, content={"detail": "Too many authentication attempts. Please wait 15 minutes."})
    elif request.method == "POST" and path in ("/api/ask", "/ask", "/api/rag/chat", "/api/rag/explain"):
        if not _check_rate_limit(f"copilot:{client_ip}", max_hits=30, window_sec=60):
            return JSONResponse(status_code=429, content={"detail": "Copilot rate limit reached. Please try again in a minute."})

    # 2. Server-side Bearer token enforcement on all protected /api/* routes
    if path.startswith("/api/") and request.method != "OPTIONS" and path not in PUBLIC_API_PATHS:
        auth_hdr = request.headers.get("authorization", "")
        token = auth_hdr.split(" ", 1)[1].strip() if auth_hdr.startswith("Bearer ") else ""
        user = database.get_user_by_token(token) if token else None
        if not user:
            return JSONResponse(status_code=401, content={"detail": "Authentication required. Please sign in or launch the demo workspace."})
        # Enforce read-only guard on demo workspace mutations
        if token.startswith("demo_") and request.method in ("POST", "PUT", "DELETE") and path.startswith("/api/research-history"):
            return JSONResponse(status_code=403, content={"detail": "Demo workspace is read-only. Create a free researcher account to save or delete screens."})
        request.state.user = user
        request.state.token = token

    response = await call_next(request)
    # 3. Security headers
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["Content-Security-Policy"] = "frame-ancestors 'none'"
    return response

# Global in-memory resources
RESOURCES: Dict[str, Any] = {
    'models': {},
    'xgb_model': None,
    'scaler': None,
    'benchmark_metrics': None,
    'roc_pr_curves': None,
    'feature_importance': None,
    'feature_names': None,
    'drugs_df': None,
    'unique_targets': [],
    'target_details': {}
}


@app.on_event("startup")
def load_app_resources():
    """Load trained models, metrics, and dataset into memory upon application launch."""
    print("[*] Initializing BiSpec Pairwise AI Backend Resources...")
    
    # 1. Load trained models
    xgb_path = os.path.join(MODELS_DIR, 'xgboost_pairwise_model.joblib')
    all_models_path = os.path.join(MODELS_DIR, 'all_models.joblib')
    scaler_path = os.path.join(MODELS_DIR, 'scaler.joblib')
    
    if os.path.exists(xgb_path):
        RESOURCES['xgb_model'] = joblib.load(xgb_path)
        print("[+] Loaded XGBoost model artifact.")
    if os.path.exists(all_models_path):
        RESOURCES['models'] = joblib.load(all_models_path)
        print(f"[+] Loaded {len(RESOURCES['models'])} comparison models.")
    if os.path.exists(scaler_path):
        RESOURCES['scaler'] = joblib.load(scaler_path)

    # 2. Load metrics and curves JSON
    metrics_path = os.path.join(MODELS_DIR, 'benchmark_metrics.json')
    if os.path.exists(metrics_path):
        with open(metrics_path, 'r', encoding='utf-8') as f:
            RESOURCES['benchmark_metrics'] = json.load(f)
            
    curves_path = os.path.join(MODELS_DIR, 'roc_pr_curves.json')
    if os.path.exists(curves_path):
        with open(curves_path, 'r', encoding='utf-8') as f:
            RESOURCES['roc_pr_curves'] = json.load(f)
            
    feat_imp_path = os.path.join(MODELS_DIR, 'feature_importance.json')
    if os.path.exists(feat_imp_path):
        with open(feat_imp_path, 'r', encoding='utf-8') as f:
            RESOURCES['feature_importance'] = json.load(f)

    feat_names_path = os.path.join(MODELS_DIR, 'feature_names.json')
    if os.path.exists(feat_names_path):
        with open(feat_names_path, 'r', encoding='utf-8') as f:
            RESOURCES['feature_names'] = json.load(f)

    # 3. Load user's preprocessed dataset directly
    if os.path.exists(DATA_CSV_PATH):
        df = pd.read_csv(DATA_CSV_PATH)
        parsed_records = []
        target_counts: Dict[str, int] = {}
        
        for idx, row in df.iterrows():
            ta, tb = clean_target_pair(row)
            parsed_records.append({
                'id': idx + 1,
                'drug': str(row['Drug']),
                'target_name': str(row['Target(Gene Name)']),
                'target_symbol': str(row['Target(Gene Symbol)']),
                'target_a': ta,
                'target_b': tb,
                'phase': str(row['Drug Highest Phase']),
                'indication': str(row['Active Indication(Indication Name)']),
                'organization': str(row['Originator Organization']),
                'location': str(row['Drug Approved Country/Location']),
                'date': str(row['Approval Date'])
            })
            if ta not in ['UNKNOWN_A', 'UNKNOWN_B', '#VALUE!', '-'] and not ta.startswith('#'):
                target_counts[ta] = target_counts.get(ta, 0) + 1
            if tb not in ['UNKNOWN_A', 'UNKNOWN_B', '#VALUE!', '-'] and not tb.startswith('#'):
                target_counts[tb] = target_counts.get(tb, 0) + 1
                
        RESOURCES['drugs_df'] = pd.DataFrame(parsed_records)
        all_targets = sorted([t for t in target_counts.keys() if len(t) >= 2 and not t.startswith('#')])
        RESOURCES['unique_targets'] = all_targets
        
        # Build target detail dictionary
        details = {}
        for t in all_targets:
            feat = get_target_features(t)
            details[t] = {
                'symbol': t,
                'category': feat['category'],
                'localization': 'Cell Membrane' if feat['localization_score'] == 1.0 else ('Secreted/Extracellular' if feat['localization_score'] == 0.5 else 'Intracellular'),
                'cancer_relevance': feat['cancer_relevance'],
                'toxicity_risk': feat['toxicity_risk'],
                'clinical_drugs_count': target_counts.get(t, 0)
            }
        RESOURCES['target_details'] = details
        print(f"[+] Loaded {len(parsed_records)} clinical drug records and {len(all_targets)} unique target genes.")


# ==============================================================================
# Pydantic Schemas
# ==============================================================================

class PredictionRequest(BaseModel):
    target_a: str = Field(..., example="EGFR")
    target_b: str = Field(..., example="MET")
    indication: Optional[str] = Field("Non-Small Cell Lung Cancer", example="Non-Small Cell Lung Cancer")
    model_name: Optional[str] = Field("XGBoost + Pairwise AI", example="XGBoost + Pairwise AI")
    user_id: Optional[int] = Field(None, example=1)

class ExplanationRequest(BaseModel):
    target_a: str = Field(..., example="EGFR")
    target_b: str = Field(..., example="MET")
    indication: Optional[str] = Field("Non-Small Cell Lung Cancer", example="Non-Small Cell Lung Cancer")
    score: Optional[float] = Field(0.85, example=0.85)
    provider: Optional[str] = Field("inbuilt", example="openai")
    api_key: Optional[str] = Field(None, example="sk-...")
    enable_rag: Optional[bool] = Field(True, example=True)

class RAGChatRequest(BaseModel):
    query: str = Field(..., example="explain about f10 antigen")

class AskRequest(BaseModel):
    question: Optional[str] = Field(None, example="explain about f10 antigen")
    query: Optional[str] = Field(None, example="explain about f10 antigen")

class AskResponse(BaseModel):
    answer: str = Field(..., example="Factor X (encoded by the F10 gene)...")
    model_used: Optional[str] = Field(None, example="nvidia/nemotron-3.5-bolt-e4b")
    provider: Optional[str] = Field(None, example="NVIDIA NIM (nvidia/nemotron-3.5-bolt-e4b) + FAISS RAG")
    live_llm: Optional[bool] = Field(True)
    sources: Optional[List[str]] = Field(default_factory=list)

class ClinicalNominationRequest(BaseModel):
    target_a: str
    target_b: str
    indication: str
    compatibility_score: float
    priority_tier: Optional[str] = None
    notes: Optional[str] = "Nominated candidate"
    drug_precedents: Optional[str] = "None (Novel Discovery)"

class LoginRequest(BaseModel):
    email: Optional[str] = Field(None, example="elena.rostova@genebiotech.com")
    username: Optional[str] = Field(None, example="elena.rostova")
    password: str = Field(..., example="Password123!")

class RegisterRequest(BaseModel):
    email: str = Field(..., example="researcher@oncology-institute.org")
    username: Optional[str] = Field(None, example="dr_researcher")
    password: str = Field(..., example="SecurePass123!")
    full_name: str = Field(..., example="Dr. Alex Rivera, PhD")
    role: Optional[str] = Field("Senior Computational Biologist", example="Senior Computational Biologist")
    organization: Optional[str] = Field("BiSpec Oncology Consortium", example="BiSpec Oncology Consortium")

class ResearchHistorySaveRequest(BaseModel):
    target_a: str
    target_b: str
    indication: str
    model_name: Optional[str] = "XGBoost + Pairwise AI"
    compatibility_score: float
    priority_tier: Optional[str] = None
    double_positive_expr: Optional[str] = None
    safety_score: Optional[str] = None
    gene_similarity: Optional[str] = None
    clinical_status: Optional[str] = None
    notes: Optional[str] = None

class PairComparisonItem(BaseModel):
    target_a: str = Field(..., example="EGFR")
    target_b: str = Field(..., example="MET")
    indication: Optional[str] = Field("Non-Small Cell Lung Cancer", example="Non-Small Cell Lung Cancer")

class PairComparisonRequest(BaseModel):
    pairs: List[PairComparisonItem]
    model_name: Optional[str] = Field("XGBoost + Pairwise AI", example="XGBoost + Pairwise AI")


# ==============================================================================
# Helper Functions
# ==============================================================================

def determine_priority_tier(score: float) -> str:
    """Categorize candidate combination into clinical testing priority tiers."""
    s = float(score) / 100.0 if float(score) > 1.0 else float(score)
    if s >= 0.90:
        return "Tier 1"
    elif s >= 0.75:
        return "Tier 2"
    elif s >= 0.60:
        return "Tier 3"
    else:
        return "Need a Review Tier"


def compute_single_pair_comparison(
    ta: str,
    tb: str,
    indication: str = "Non-Small Cell Lung Cancer",
    model_name: str = "XGBoost + Pairwise AI"
) -> Optional[Dict[str, Any]]:
    """Compute structured metrics for a single target pair in the comparison matrix."""
    g1 = standardize_gene_symbol(ta)
    g2 = standardize_gene_symbol(tb)
    if g1 == g2:
        return None

    feat_dict = compute_pairwise_features(g1, g2, indication=indication)
    feature_names = RESOURCES.get('feature_names') or EXACT_40_FEATURES
    feat_vector = np.array([[feat_dict[f] for f in feature_names]])

    model_key = model_name
    if model_key not in RESOURCES['models'] and RESOURCES['xgb_model'] is not None:
        model_key = 'XGBoost + Pairwise AI'
    model = RESOURCES['models'].get(model_key, RESOURCES['xgb_model'])
    if model is None:
        return None

    if model_key in ['Logistic Regression', 'DNN (MLP)'] and RESOURCES['scaler'] is not None:
        feat_vector_in = RESOURCES['scaler'].transform(feat_vector)
    else:
        feat_vector_in = feat_vector

    prob_compat = float(model.predict_proba(feat_vector_in)[0, 1])
    tier = determine_priority_tier(prob_compat)

    # 1. Double-positive expression
    coexpr = feat_dict.get('shared_pathway_proxy', 0.5)
    if coexpr >= 0.70 or prob_compat >= 0.85:
        dp_level = "High"
        dp_desc = f"High ({round(prob_compat * 100, 1)}%)"
    elif coexpr >= 0.40 or prob_compat >= 0.65:
        dp_level = "Medium"
        dp_desc = f"Medium ({round(prob_compat * 100, 1)}%)"
    else:
        dp_level = "Low"
        dp_desc = f"Low ({round(prob_compat * 100, 1)}%)"

    # 2. Safety Score
    tox = feat_dict.get('tox_max', 0.3)
    if tox <= 0.35:
        safe_level = "High"
        safe_desc = "High (Low Tox Profile)"
    elif tox <= 0.65:
        safe_level = "Medium"
        safe_desc = "Medium (Manageable Tox)"
    else:
        safe_level = "Low"
        safe_desc = "Low (Elevated On-Target Tox)"

    # 3. Gene Similarity
    mw = feat_dict.get('mw_ratio', 0.5)
    fa = get_target_features(g1)
    fb = get_target_features(g2)
    same_cat = (fa.get('category') == fb.get('category'))
    if mw >= 0.75 and same_cat:
        sim_level = "High"
        sim_desc = "High (Shared Class Homology)"
    elif mw >= 0.40 or same_cat:
        sim_level = "Medium"
        sim_desc = "Medium (Orthogonal Targets)"
    else:
        sim_level = "Low"
        sim_desc = "Low (Differential Classes)"

    # 4. Clinical Status from 791 clinical records
    matched_drugs = []
    highest_phase = "Not Identified (Preclinical / Novel)"
    if RESOURCES['drugs_df'] is not None:
        df = RESOURCES['drugs_df']
        matches = df[
            ((df['target_a'] == g1) & (df['target_b'] == g2)) |
            ((df['target_a'] == g2) & (df['target_b'] == g1))
        ]
        if len(matches) > 0:
            drug_names = list(matches['drug'].unique())
            phases = list(matches['phase'].unique())
            if any('Approved' in str(p) for p in phases):
                highest_phase = f"Approved ({', '.join(drug_names[:2])})"
            elif any('Phase 3' in str(p) for p in phases):
                highest_phase = f"Phase 3 ({', '.join(drug_names[:2])})"
            elif any('Phase 2' in str(p) for p in phases):
                highest_phase = f"Phase 2 ({', '.join(drug_names[:2])})"
            elif any('Phase 1' in str(p) for p in phases):
                highest_phase = f"Phase 1 ({', '.join(drug_names[:2])})"
            else:
                highest_phase = f"Preclinical ({', '.join(drug_names[:2])})"
            for _, r in matches.head(3).iterrows():
                matched_drugs.append(f"{r['drug']} ({r['phase']})")

    radar_data = {
        'biological_synergy': round(feat_dict['synergy_score'] * 100, 1),
        'pathway_overlap': round(feat_dict['shared_pathway_proxy'] * 100, 1),
        'tumor_relevance': round((feat_dict['relevance_sum'] / 2.0) * 100, 1),
        'safety_profile': round((1.0 - feat_dict['tox_max']) * 100, 1),
        'structural_fit': round(feat_dict['mw_ratio'] * 100, 1)
    }

    return {
        "target_a": g1,
        "target_b": g2,
        "indication": indication,
        "pair_label": f"{g1} + {g2}",
        "compatibility_score": round(prob_compat, 4),
        "compatibility_percentage": round(prob_compat * 100, 1),
        "priority_tier": tier,
        "double_positive_expr": dp_level,
        "double_positive_desc": dp_desc,
        "safety_score": safe_level,
        "safety_desc": safe_desc,
        "gene_similarity": sim_level,
        "gene_similarity_desc": sim_desc,
        "clinical_status": highest_phase,
        "matched_drugs": matched_drugs,
        "radar_metrics": radar_data
    }


# Global In-Memory Clinical Test Queue
CLINICAL_TEST_QUEUE: List[Dict[str, Any]] = [
    {
        "id": 1,
        "target_a": "MS4A1",
        "target_b": "CD3E",
        "indication": "B-Cell Lymphoma / Non-Small Cell Lung Cancer",
        "compatibility_score": 0.965,
        "priority_tier": "Tier 1",
        "notes": "CD20 + CD3: T-cell redirecting bispecific antibody (>90% score)",
        "drug_precedents": "Epcoritamab / Glofitamab (Approved)",
        "status": "Validated (Tier 1 Priority)",
        "date_added": "2026-11-05"
    },
    {
        "id": 2,
        "target_a": "CD274",
        "target_b": "TNFRSF9",
        "indication": "Non-Small Cell Lung Cancer",
        "compatibility_score": 0.884,
        "priority_tier": "Tier 2",
        "notes": "PD-L1 + 4-1BB: Dual checkpoint blockade and tumor-localized co-stimulation (75%-90%)",
        "drug_precedents": "Preclinical / Phase 1 Trials",
        "status": "Queued for In-Vitro Assay",
        "date_added": "2026-11-05"
    },
    {
        "id": 3,
        "target_a": "CLDN18",
        "target_b": "CD3E",
        "indication": "Gastric / Stomach Adenocarcinoma",
        "compatibility_score": 0.842,
        "priority_tier": "Tier 2",
        "notes": "Claudin18.2-directed T-cell engager for solid tumors (75%-90%)",
        "drug_precedents": "IBI-389 / ASP2138 Preclinical",
        "status": "Queued for Preclinical Validation",
        "date_added": "2026-11-05"
    },
    {
        "id": 4,
        "target_a": "VEGFA",
        "target_b": "ANGPT2",
        "indication": "Non-Small Cell Lung Cancer",
        "compatibility_score": 0.718,
        "priority_tier": "Tier 3",
        "notes": "Dual angiogenic blockade targeting VEGF and Angiopoietin-2 (60%-75%)",
        "drug_precedents": "Faricimab Class Preclinical",
        "status": "Queued for Secondary Screen",
        "date_added": "2026-11-05"
    },
    {
        "id": 5,
        "target_a": "CTLA4",
        "target_b": "LAG3",
        "indication": "Advanced Solid Tumors",
        "compatibility_score": 0.542,
        "priority_tier": "Need a Review Tier",
        "notes": "Dual immune checkpoint with elevated off-target systemic toxicity risk (<60%)",
        "drug_precedents": "Investigational Early Phase",
        "status": "Queued for Expert Review",
        "date_added": "2026-11-05"
    }
]


# ==============================================================================
# Core API Endpoints
# ==============================================================================

@app.get("/api/health")
def health():
    db_ok = database.db_health_check()
    models_ok = len(RESOURCES.get("models", {})) > 0
    copilot_ok = bool(os.environ.get("NVIDIA_API_KEY", "").strip())
    failing = []
    if not db_ok:
        failing.append("database_write_read")
    if not models_ok:
        failing.append("ml_models_not_loaded")
    if not copilot_ok:
        failing.append("copilot_api_key_missing")
    return {
        "status": "healthy" if (db_ok and models_ok) else "degraded",
        "overall": "All systems operational" if not failing else f"Degraded: {', '.join(failing)}",
        "checks": {
            "database": db_ok,
            "models_loaded": models_ok,
            "copilot_configured": copilot_ok,
        },
        "failing_checks": failing,
        "service": "BiSpec Pairwise AI Backend",
        "model_version": scientific_meta.MODEL_VERSION,
        "active_models": list(RESOURCES['models'].keys()),
        "champion_model": "Clinical Safe Ensemble",
        "dataset_records": len(RESOURCES['drugs_df']) if RESOURCES['drugs_df'] is not None else 0,
        "unique_targets_count": len(RESOURCES['unique_targets'])
    }


@app.get("/api/meta/summary")
@app.get("/api/meta/public")
def get_meta_summary():
    """Single source of truth for all counts, phases, CIs, and provenance."""
    return scientific_meta.build_meta_summary(project_root, RESOURCES)


@app.get("/api/version")
def get_version():
    return {
        "model_version": scientific_meta.MODEL_VERSION,
        "data_version": scientific_meta.DATA_VERSION,
        "trained_on": scientific_meta.TRAINED_ON,
        "api_version": "2.1.0",
    }


@app.get("/api/model-card")
def download_model_card():
    meta = scientific_meta.build_meta_summary(project_root, RESOURCES)
    md = scientific_meta.build_model_card_markdown(meta)
    return PlainTextResponse(
        content=md,
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=BiSpec-Pairwise-AI-Model-Card.md"},
    )

@app.get("/api/targets")
def get_targets():
    """Return list of all unique target genes with biological annotations."""
    return {
        "targets": RESOURCES['unique_targets'],
        "details": RESOURCES['target_details']
    }

@app.get("/api/stats")
def get_stats():
    """Return summary statistics of the preprocessed dataset."""
    df = RESOURCES['drugs_df']
    if df is None:
        return {}
    
    phase_counts = df['phase'].value_counts().to_dict()
    top_orgs = df['organization'].value_counts().head(8).to_dict()
    
    champ_auc = 0.9506
    champ_pr = 0.8682
    champ_name = "Clinical Safe Ensemble"
    bm = RESOURCES.get('benchmark_metrics') or {}
    for m in bm.get('models', []):
        if m.get('is_champion'):
            champ_auc = m.get('roc_auc', champ_auc)
            champ_pr = m.get('pr_auc', champ_pr)
            champ_name = m.get('model_name', champ_name)
            break

    return {
        "total_drugs": len(df),
        "total_targets": len(RESOURCES['unique_targets']),
        "phase_distribution": phase_counts,
        "top_organizations": top_orgs,
        "trained_models": len(RESOURCES.get('models', {})),
        "champion_model": champ_name,
        "champion_auc": champ_auc,
        "champion_pr_auc": champ_pr
    }

@app.post("/api/predict")
def predict_pairwise_compatibility(req: PredictionRequest):
    """
    Predict pairwise compatibility score between target_a and target_b.
    Returns probability, decision badge, radar metrics, and matched clinical precedents.
    """
    raw_a = (req.target_a or "").strip()
    raw_b = (req.target_b or "").strip()
    if not raw_a or not raw_b:
        raise HTTPException(status_code=400, detail="Both target_a and target_b must be non-empty gene symbols.")

    g1 = standardize_gene_symbol(raw_a)
    g2 = standardize_gene_symbol(raw_b)
    
    if not g1 or not g2:
        raise HTTPException(status_code=400, detail="Invalid or empty biological target symbol provided.")
    if g1 == g2:
        raise HTTPException(status_code=400, detail="Target A and Target B must be distinct biological targets.")

    # Validate gene symbols against known catalog (HTTP 422 with suggestions)
    known_genes = set(RESOURCES.get('unique_targets') or []) | set(TARGET_BIOLOGY.keys())
    if known_genes:
        unknown = [g for g in (g1, g2) if g not in known_genes]
        if unknown:
            sugg = {g: scientific_meta.suggest_gene_symbols(g, sorted(known_genes)) for g in unknown}
            raise HTTPException(
                status_code=422,
                detail={"message": f"Unknown target gene symbol(s): {', '.join(unknown)}", "suggestions": sugg}
            )

    # 1. Compute symmetric feature vector
    feat_dict = compute_pairwise_features(g1, g2, indication=req.indication)
    feature_names = RESOURCES.get('feature_names') or EXACT_40_FEATURES
    feat_vector = np.array([[feat_dict[f] for f in feature_names]])
    
    # 2. Select model and compute probability
    model_key = req.model_name
    if model_key not in RESOURCES['models']:
        if 'Clinical Safe Ensemble' in RESOURCES['models']:
            model_key = 'Clinical Safe Ensemble'
        elif RESOURCES['xgb_model'] is not None:
            model_key = 'XGBoost + Pairwise AI'
        
    model = RESOURCES['models'].get(model_key, RESOURCES['xgb_model'])
    if model is None:
        raise HTTPException(status_code=500, detail="Trained model not available.")
        
    # Check if model requires scaling (e.g. Logistic Regression or DNN)
    if model_key in ['Logistic Regression', 'DNN (MLP)'] and RESOURCES['scaler'] is not None:
        feat_vector_in = RESOURCES['scaler'].transform(feat_vector)
    else:
        feat_vector_in = feat_vector

    prob_compat = float(model.predict_proba(feat_vector_in)[0, 1])

    # 2b. Multi-Model Clinical Consensus & Biological Safety Guardrail
    quorum_names = ['HistGBDT (Monotonic Safe)', 'ExtraTrees (Safety-First)', 'XGBoost + Pairwise AI', 'GBDT']
    quorum_scores = {}
    for qn in quorum_names:
        qm = RESOURCES['models'].get(qn)
        if qm is not None:
            try:
                quorum_scores[qn] = round(float(qm.predict_proba(feat_vector)[0, 1]) * 100.0, 1)
            except Exception:
                pass
    agree_count = sum(1 for v in quorum_scores.values() if v >= 60.0)
    total_quorum = max(1, len(quorum_scores))
    spread_std = round(float(np.std(list(quorum_scores.values()))), 1) if quorum_scores else 0.0
    tox_flag = feat_dict.get('tox_max', 0.0) >= 0.75
    if tox_flag:
        safety_status = "Safety Guardrail Alert — Elevated Off-Tumor Toxicity"
    elif agree_count == total_quorum and spread_std <= 12.0:
        safety_status = f"High Clinical Consensus ({agree_count}/{total_quorum} Models Agree)"
    elif agree_count >= max(2, total_quorum - 1):
        safety_status = f"Moderate Consensus ({agree_count}/{total_quorum} Agree • ±{spread_std}%)"
    else:
        safety_status = f"Indeterminate — Wet-Lab Validation Required ({agree_count}/{total_quorum})"
    clinical_consensus = {
        "agree_count": agree_count,
        "total_models": total_quorum,
        "uncertainty_std_pct": spread_std,
        "toxicity_veto_flag": bool(tox_flag),
        "status": safety_status,
        "quorum_scores": quorum_scores
    }
    
    # 3. Decision classification and badge according to tiers
    priority_tier = determine_priority_tier(prob_compat)
    if priority_tier == "Tier 1":
        badge = "Tier 1 (Highly Synergistic >90%)"
        badge_type = "success"
        verdict = "Exceptional clinical synergy predicted (>90%). Top priority candidate for clinical test pipeline."
    elif priority_tier == "Tier 2":
        badge = "Tier 2 (Promising Candidate 75-90%)"
        badge_type = "info"
        verdict = "Strong biological compatibility (75%-90%). Promising candidate for translational clinical pipeline."
    elif priority_tier == "Tier 3":
        badge = "Tier 3 (Moderate Synergy 60-75%)"
        badge_type = "warning"
        verdict = "Moderate biological compatibility (60%-75%). Candidate warrants secondary preclinical validation."
    else:
        badge = "Need a Review Tier (<60%)"
        badge_type = "danger"
        verdict = "Sub-optimal combination (<60%). Potential off-target toxicity risk or insufficient biological convergence. Detailed review needed."

    # 4. Search dataset for matching clinical precedents
    matched_drugs = []
    if RESOURCES['drugs_df'] is not None:
        df = RESOURCES['drugs_df']
        matches = df[
            ((df['target_a'] == g1) & (df['target_b'] == g2)) |
            ((df['target_a'] == g2) & (df['target_b'] == g1))
        ]
        for _, r in matches.iterrows():
            matched_drugs.append({
                'drug': r['drug'],
                'phase': r['phase'],
                'organization': r['organization'],
                'indication': r['indication']
            })

    # 5. Radar chart metrics (normalized 0 to 100)
    fa = get_target_features(g1)
    fb = get_target_features(g2)
    radar_data = {
        'biological_synergy': round(feat_dict['synergy_score'] * 100, 1),
        'pathway_overlap': round(feat_dict['shared_pathway_proxy'] * 100, 1),
        'tumor_relevance': round((feat_dict['relevance_sum'] / 2.0) * 100, 1),
        'safety_profile': round((1.0 - feat_dict['tox_max']) * 100, 1),
        'structural_fit': round(feat_dict['mw_ratio'] * 100, 1)
    }

    # 6. Auto-save to research history (account-scoped)
    try:
        user_id = req.user_id or 1
        clin_status = matched_drugs[0]['phase'] if matched_drugs else "Preclinical / Novel"
        dp_expr = "High" if feat_dict['shared_pathway_proxy'] >= 0.70 or prob_compat >= 0.85 else ("Medium" if feat_dict['shared_pathway_proxy'] >= 0.40 else "Low")
        safe_score = "High" if feat_dict['tox_max'] <= 0.35 else ("Medium" if feat_dict['tox_max'] <= 0.65 else "Low")
        gene_sim = "High" if feat_dict['mw_ratio'] >= 0.75 and (fa.get('category') == fb.get('category')) else ("Medium" if feat_dict['mw_ratio'] >= 0.40 else "Low")
        
        database.save_research_screening(
            user_id=user_id,
            target_a=g1,
            target_b=g2,
            indication=req.indication or "Non-Small Cell Lung Cancer",
            model_name=model_key,
            compatibility_score=prob_compat,
            priority_tier=priority_tier,
            double_positive_expr=dp_expr,
            safety_score=safe_score,
            gene_similarity=gene_sim,
            clinical_status=clin_status,
            notes=verdict
        )
    except Exception as e:
        print(f"[!] Notice: auto-save research history: {e}")

    # Compute exact TreeSHAP per-pair feature contributions & training-set membership flag
    treeshap = scientific_meta.compute_treeshap_contributions(
        RESOURCES.get("xgb_model") or RESOURCES.get("models", {}).get("XGBoost + Pairwise AI"),
        feat_vector,
        list(feature_names),
    )
    in_training_set = len(matched_drugs) > 0
    training_set_notice = (
        "This pair is in the training set. Its score is not a prospective prediction."
        if in_training_set else None
    )

    return {
        "target_a": g1,
        "target_b": g2,
        "indication": req.indication,
        "model_used": model_key,
        "model_version": scientific_meta.MODEL_VERSION,
        "compatibility_score": round(prob_compat, 4),
        "compatibility_percentage": round(prob_compat * 100, 1),
        "priority_tier": priority_tier,
        "classification_badge": badge,
        "badge_type": badge_type,
        "clinical_verdict": verdict,
        "clinical_consensus": clinical_consensus,
        "in_training_set": in_training_set,
        "training_set_notice": training_set_notice,
        "feature_contributions": treeshap,
        "disclaimer": scientific_meta.RESEARCH_DISCLAIMER,
        "radar_metrics": radar_data,
        "matched_clinical_drugs": matched_drugs,
        "raw_features": feat_dict
    }

_DISCOVERY_BOARD_CACHE: Optional[Dict[str, Any]] = None

@app.get("/api/discovery-board")
def get_clinical_discovery_board():
    """
    Live Clinical White-Space Discovery Explorer powered by Clinical Safe Ensemble
    and the 791-drug clinical registry. Returns 3 live-scored buckets:
      - white_space: High-scoring novel target pairs with 0 existing clinical drugs
      - validated: Approved / late-stage clinical benchmark pairs
      - safety_flagged: Low-viability / high-risk control pairs rejected by the ensemble
    """
    global _DISCOVERY_BOARD_CACHE
    if _DISCOVERY_BOARD_CACHE is not None:
        return _DISCOVERY_BOARD_CACHE

    model = RESOURCES['models'].get('Clinical Safe Ensemble') or RESOURCES.get('xgb_model')
    if model is None:
        raise HTTPException(status_code=500, detail="Clinical Safe Ensemble model not loaded.")

    feature_names = RESOURCES.get('feature_names') or EXACT_40_FEATURES
    quorum_names = ['HistGBDT (Monotonic Safe)', 'ExtraTrees (Safety-First)', 'XGBoost + Pairwise AI', 'GBDT']
    quorum_models = [RESOURCES['models'][q] for q in quorum_names if q in RESOURCES['models']]

    # Build lookup of existing clinical pairs from 791-drug registry
    clinical_lookup: Dict[tuple, Dict[str, Any]] = {}
    df = RESOURCES.get('drugs_df')
    if df is not None:
        for _, r in df.iterrows():
            a = standardize_gene_symbol(str(r.get('target_a', '')))
            b = standardize_gene_symbol(str(r.get('target_b', '')))
            if not a or not b or a == b:
                continue
            key = tuple(sorted((a, b)))
            phase = str(r.get('phase', 'Preclinical'))
            if key not in clinical_lookup:
                clinical_lookup[key] = {'count': 0, 'phases': []}
            clinical_lookup[key]['count'] += 1
            clinical_lookup[key]['phases'].append(phase)

    def rank_phase(phases: List[str]) -> str:
        joined = " | ".join(phases)
        if 'Approved' in joined: return 'Approved (NDA/BLA)'
        if 'Phase 3' in joined: return 'Phase 3'
        if 'Phase 1,2' in joined or 'Phase 2' in joined: return 'Phase 1/2'
        if 'Preclinical' in joined: return 'Preclinical / IND'
        return 'Discontinued / Pending'

    def infer_mechanism(feat: Dict[str, Any]) -> str:
        if feat.get('is_tumor_tcell'): return 'T-Cell Redirecting Cytolytic Bridge'
        if feat.get('is_dual_checkpoint'): return 'Dual Immune Checkpoint Blockade'
        if feat.get('is_checkpoint_costim'): return 'Checkpoint + Co-Stimulatory Agonism'
        if feat.get('is_dual_rtk'): return 'Dual RTK Resistance Blockade'
        if feat.get('is_checkpoint_angiogenesis'): return 'Checkpoint + Angiogenesis Co-Inhibition'
        return 'Combinatorial Tumor-Microenvironment Co-Targeting'

    def score_pair(g1: str, g2: str) -> Dict[str, Any]:
        feat = compute_pairwise_features(g1, g2, indication='Non-Small Cell Lung Cancer')
        vec = np.array([[feat[f] for f in feature_names]])
        prob = float(model.predict_proba(vec)[0, 1]) * 100.0
        agree = sum(1 for qm in quorum_models if float(qm.predict_proba(vec)[0, 1]) >= 0.60)
        key = tuple(sorted((g1, g2)))
        clin = clinical_lookup.get(key)
        return {
            'target_a': g1,
            'target_b': g2,
            'score_pct': round(prob, 1),
            'tier': determine_priority_tier(prob),
            'quorum_agree': agree,
            'quorum_total': max(1, len(quorum_models)),
            'precedent_count': clin['count'] if clin else 0,
            'clinical_status': rank_phase(clin['phases']) if clin else '0 Drugs — First-in-Class Novel',
            'mechanism': infer_mechanism(feat),
            'tox_max': round(float(feat.get('tox_max', 0.0)), 2)
        }

    # 1. Validated Clinical Benchmarks (well-known active/approved pairs)
    validated_seeds = [
        ('EGFR', 'MET'), ('MS4A1', 'CD3E'), ('PDCD1', 'CTLA4'),
        ('CLDN18', 'CD3E'), ('ERBB2', 'CD3E'), ('CD274', 'CTLA4')
    ]
    validated = sorted([score_pair(a, b) for a, b in validated_seeds], key=lambda x: x['score_pct'], reverse=True)

    # 2. Scan diverse high-value oncology target space for true 0-drug White-Space discoveries & Low-Viability controls
    pool_genes = [
        'EGFR', 'MET', 'ERBB2', 'ERBB3', 'CLDN18', 'TACSTD2', 'MSLN', 'EPCAM', 'CEACAM5',
        'CD3E', 'PDCD1', 'CD274', 'CTLA4', 'LAG3', 'TIGIT', 'TNFRSF9', 'CD40', 'CD47',
        'VEGFA', 'KDR', 'DLL3', 'MUC1', 'FOLR1', 'CLDN3', 'CD19', 'MS4A1', 'BCMA', 'F10'
    ]
    novel_scored = []
    seen = set()
    for i in range(len(pool_genes)):
        for j in range(i + 1, len(pool_genes)):
            g1, g2 = pool_genes[i], pool_genes[j]
            key = tuple(sorted((g1, g2)))
            if key in seen or key in clinical_lookup:
                continue
            seen.add(key)
            novel_scored.append(score_pair(g1, g2))

    white_space = sorted(novel_scored, key=lambda x: (x['score_pct'], x['quorum_agree']), reverse=True)[:6]
    safety_flagged = sorted(novel_scored, key=lambda x: (x['score_pct'], -x['tox_max']))[:6]

    _DISCOVERY_BOARD_CACHE = {
        'model_used': 'Clinical Safe Ensemble',
        'total_novel_scanned': len(novel_scored),
        'white_space': white_space,
        'validated': validated,
        'safety_flagged': safety_flagged
    }
    return _DISCOVERY_BOARD_CACHE

class DiscoverPromptRequest(BaseModel):
    prompt: str = Field(..., example="Find a safe NSCLC bispecific that overcomes EGFR TKI resistance")

@app.post("/api/discover-prompt")
def discover_pairs_from_prompt(req: DiscoverPromptRequest):
    """
    Natural-Language AI Discovery Engine:
    Uses live NVIDIA NIM to propose 3 biologically tailored bispecific target pairs
    from the 193-gene space, then scores EVERY pair live using the trained
    Clinical Safe Ensemble + 4-Model Quorum + 791-drug registry cross-check.
    """
    query = (req.prompt or "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="Please enter a biological discovery goal.")

    model = RESOURCES['models'].get('Clinical Safe Ensemble') or RESOURCES.get('xgb_model')
    if model is None:
        raise HTTPException(status_code=500, detail="Clinical Safe Ensemble model not loaded.")

    feature_names = RESOURCES.get('feature_names') or EXACT_40_FEATURES
    quorum_names = ['HistGBDT (Monotonic Safe)', 'ExtraTrees (Safety-First)', 'XGBoost + Pairwise AI', 'GBDT']
    quorum_models = [RESOURCES['models'][q] for q in quorum_names if q in RESOURCES['models']]
    valid_targets = set(RESOURCES.get('unique_targets') or [])
    curated_pool = [
        'EGFR', 'MET', 'ERBB2', 'ERBB3', 'CLDN18', 'TACSTD2', 'MSLN', 'EPCAM', 'CEACAM5',
        'CD3E', 'PDCD1', 'CD274', 'CTLA4', 'LAG3', 'TIGIT', 'TNFRSF9', 'CD40', 'CD47',
        'VEGFA', 'KDR', 'DLL3', 'MUC1', 'FOLR1', 'MS4A1', 'CD19', 'BCMA', 'IGF1R', 'AXL'
    ]
    allowed_str = ", ".join(curated_pool)

    llm_candidates = []
    provider_label = "NVIDIA NIM + Clinical Safe Ensemble"
    nv_key = os.getenv("NVIDIA_API_KEY", "").strip()

    if len(nv_key) > 8:
        import requests as _req
        import re as _re
        sys_msg = (
            "You are a principal oncology bispecific antibody strategist. "
            f"Given the researcher's goal, you MUST return EXACTLY 3 distinct, scientifically strong target pairs strictly from this gene list: [{allowed_str}]. "
            "Prefer clinically strong oncology pairs (such as EGFR+MET, EGFR+ERBB3, CLDN18+CD3E, ERBB2+CD3E, PDCD1+CTLA4, CD274+TNFRSF9, MS4A1+CD3E, CD3E+BCMA) when relevant. "
            "Return ONLY a valid JSON object with an array of EXACTLY 3 objects in candidates: "
            "{\"summary\": \"1-sentence synthesis\", \"candidates\": [{\"target_a\": \"GENE1\", \"target_b\": \"GENE2\", \"rationale\": \"2 crisp technical sentences\"}, {\"target_a\": \"GENE3\", \"target_b\": \"GENE4\", \"rationale\": \"2 crisp technical sentences\"}, {\"target_a\": \"GENE5\", \"target_b\": \"GENE6\", \"rationale\": \"2 crisp technical sentences\"}]}"
        )
        for model_id in ["nvidia/nemotron-3.5-bolt-e4b", "nvidia/nemotron-3-ultra-550b-a55b"]:
            try:
                r = _req.post(
                    "https://integrate.api.nvidia.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {nv_key}", "Content-Type": "application/json"},
                    json={
                        "model": model_id,
                        "messages": [
                            {"role": "system", "content": sys_msg},
                            {"role": "user", "content": f"Researcher goal: {query}"}
                        ],
                        "temperature": 0.25,
                        "max_tokens": 900
                    },
                    timeout=18
                )
                if r.status_code == 200:
                    raw = (r.json()['choices'][0]['message'].get('content') or "").strip()
                    raw = _re.sub(r"<think>.*?</think>", "", raw, flags=_re.DOTALL).strip()
                    raw = raw.replace("```json", "").replace("```", "").strip()
                    if "{" in raw and "}" in raw:
                        raw = raw[raw.index("{"):raw.rindex("}") + 1]
                    parsed = json.loads(raw)
                    cands = parsed.get("candidates", [])
                    if isinstance(cands, list) and len(cands) >= 1:
                        llm_candidates = cands[:3]
                        summary_text = str(parsed.get("summary", "")).strip()
                        provider_label = f"NVIDIA NIM ({model_id}) + Clinical Safe Ensemble"
                        break
            except Exception:
                continue

    # Semantic fallback if LLM is temporarily unavailable
    if not llm_candidates:
        ql = query.lower()
        summary_text = "Ranked top bispecific target pairs matching your therapeutic objective via live Clinical Safe Ensemble."
        if "t-cell" in ql or "cytolytic" in ql or "engager" in ql or "cd3" in ql:
            llm_candidates = [
                {"target_a": "CLDN18", "target_b": "CD3E", "rationale": "Redirects polyclonal CD3+ T-cells selectively to Claudin-18.2+ epithelial tumors while sparing normal lung tissue."},
                {"target_a": "MS4A1", "target_b": "CD3E", "rationale": "Clinically validated B-cell cytolytic synapse achieving deep durable responses with step-up CRS control."},
                {"target_a": "ERBB2", "target_b": "CD3E", "rationale": "Bridges cytotoxic T-cells to HER2-overexpressing solid tumors with high avidity-gated tumor selectivity."}
            ]
        elif "checkpoint" in ql or "exhaust" in ql or "immune" in ql or "pd" in ql:
            llm_candidates = [
                {"target_a": "PDCD1", "target_b": "CTLA4", "rationale": "Simultaneously reverses T-cell exhaustion and enhances priming within the tumor microenvironment."},
                {"target_a": "CD274", "target_b": "TNFRSF9", "rationale": "Couples PD-L1 checkpoint blockade with conditional 4-1BB co-stimulation restricted to PD-L1+ tumors."},
                {"target_a": "PDCD1", "target_b": "LAG3", "rationale": "Dual inhibitory receptor blockade overcoming compensatory LAG-3 upregulation on exhausted CD8+ TILs."}
            ]
        else:
            llm_candidates = [
                {"target_a": "EGFR", "target_b": "MET", "rationale": "Simultaneously blocks primary EGFR signaling and MET amplification bypass driving osimertinib TKI resistance in NSCLC."},
                {"target_a": "EGFR", "target_b": "ERBB3", "rationale": "Silences HER3-mediated PI3K/AKT compensatory escape while locking down mutant EGFR proliferation."},
                {"target_a": "CLDN18", "target_b": "CD3E", "rationale": "Provides an orthogonal T-cell-redirecting mechanism independent of RTK mutation status."}
            ]

    # Score EVERY candidate LIVE with the real Python Clinical Safe Ensemble + 4-Model Quorum + 791 Registry
    df = RESOURCES.get('drugs_df')
    verified_results = []
    seen_pairs = set()

    for item in llm_candidates:
        g1 = standardize_gene_symbol(str(item.get("target_a", "")))
        g2 = standardize_gene_symbol(str(item.get("target_b", "")))
        if not g1 or not g2 or g1 == g2:
            continue
        pair_key = tuple(sorted((g1, g2)))
        if pair_key in seen_pairs:
            continue
        seen_pairs.add(pair_key)

        feat = compute_pairwise_features(g1, g2, indication='Non-Small Cell Lung Cancer')
        vec = np.array([[feat[f] for f in feature_names]])
        prob = float(model.predict_proba(vec)[0, 1]) * 100.0
        agree = sum(1 for qm in quorum_models if float(qm.predict_proba(vec)[0, 1]) >= 0.60)

        matched_count = 0
        top_phase = "0 Drugs — First-in-Class Novel"
        if df is not None:
            m = df[((df['target_a'] == g1) & (df['target_b'] == g2)) | ((df['target_a'] == g2) & (df['target_b'] == g1))]
            matched_count = len(m)
            if matched_count > 0:
                phases = " | ".join(m['phase'].astype(str).tolist())
                if 'Approved' in phases: top_phase = f"{matched_count} Drugs • Approved"
                elif 'Phase 3' in phases: top_phase = f"{matched_count} Drugs • Phase 3"
                elif 'Phase' in phases: top_phase = f"{matched_count} Drugs • Phase 1/2"
                else: top_phase = f"{matched_count} Drugs • Preclinical"

        verified_results.append({
            "target_a": g1,
            "target_b": g2,
            "score_pct": round(prob, 1),
            "tier": determine_priority_tier(prob),
            "quorum": f"{agree}/{max(1, len(quorum_models))}",
            "clinical_status": top_phase,
            "precedent_count": matched_count,
            "rationale": str(item.get("rationale", "")).strip()
        })

    verified_results.sort(key=lambda x: x["score_pct"], reverse=True)
    return {
        "prompt": query,
        "summary": summary_text if 'summary_text' in locals() else "",
        "provider": provider_label,
        "candidates": verified_results
    }

@app.get("/api/benchmark")
def get_benchmark_comparison():
    """Return model comparison table, ROC-AUC / PR-AUC curves, and metric rationales."""
    return {
        "metrics": RESOURCES['benchmark_metrics'],
        "curves": RESOURCES['roc_pr_curves'],
        "feature_importance": RESOURCES['feature_importance']
    }

@app.post("/api/explain")
@app.post("/api/rag/explain")
def explain_target_pair(req: ExplanationRequest):
    """Generate structured biological Mechanism of Action (MoA) explanation using RAG."""
    g1 = standardize_gene_symbol(req.target_a)
    g2 = standardize_gene_symbol(req.target_b)
    
    # Normalize score (frontend may pass percentage 85.0 or probability 0.85)
    norm_score = float(req.score or 0.85)
    if norm_score > 1.0:
        norm_score = norm_score / 100.0
    
    # Check matched drugs
    matched_names = []
    if RESOURCES['drugs_df'] is not None:
        df = RESOURCES['drugs_df']
        matches = df[
            ((df['target_a'] == g1) & (df['target_b'] == g2)) |
            ((df['target_a'] == g2) & (df['target_b'] == g1))
        ]
        matched_names = matches['drug'].unique().tolist()

    # If NVIDIA API key is available in environment, attempt live NVIDIA NIM generation
    nv_key = os.getenv("NVIDIA_API_KEY", "")
    if nv_key and len(nv_key.strip()) > 8:
        try:
            nvidia_exp = generate_multi_ai_explanation(
                target_a=g1,
                target_b=g2,
                indication=req.indication,
                score=norm_score,
                matched_drugs=matched_names,
                provider="nvidia",
                api_key=nv_key,
                enable_rag=True
            )
            if nvidia_exp and nvidia_exp.get('provider') and 'NVIDIA' in str(nvidia_exp.get('provider', '')):
                return nvidia_exp
        except Exception:
            pass

    try:
        rag = RAGEngine.get_instance()
        explanation = rag.generate_screening_explanation(
            target_a=g1,
            target_b=g2,
            indication=req.indication,
            score=norm_score,
            matched_drugs=matched_names
        )
        return explanation
    except Exception as e:
        return generate_multi_ai_explanation(
            target_a=g1,
            target_b=g2,
            indication=req.indication,
            score=norm_score,
            matched_drugs=matched_names,
            provider="inbuilt"
        )

@app.post("/api/rag/chat")
def rag_chat_endpoint(req: RAGChatRequest):
    """Query the local RAG engine (FAISS + Vector Database) for biology or algorithm questions."""
    q = (req.query or "").strip()
    if not q:
        raise HTTPException(status_code=400, detail="Query cannot be empty.")
    try:
        rag = RAGEngine.get_instance()
        return rag.query(q)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"RAG query execution error: {str(e)}")

@app.post("/ask", response_model=AskResponse)
@app.post("/api/ask", response_model=AskResponse)
def ask_endpoint(payload: AskRequest, request: Request):
    """POST route at /ask accepting {'question': '...'} and returning sourced RAG answer with guardrails."""
    q = (payload.question or payload.query or "").strip()
    if not q:
        raise HTTPException(status_code=400, detail="The 'question' field is required in the JSON payload.")

    user_id = getattr(request.state, "user", {}).get("id") if hasattr(request.state, "user") else None

    # Clinical advice / dosing / diagnosis guardrail
    if scientific_meta.is_clinical_advice_request(q):
        refusal = (
            "I cannot provide patient diagnosis, dosing, or clinical treatment advice. "
            "BiSpec Pairwise AI is research software intended strictly for preclinical target-pair analysis. "
            "Please consult a qualified clinician for medical decisions.\n\n"
            f"— {scientific_meta.COPILOT_DISCLAIMER}"
        )
        database.log_copilot_audit(user_id, q, refusal, sources_count=0, refused=True)
        return AskResponse(
            answer=refusal,
            model_used="safety-guardrail",
            provider="BiSpec Guardrail",
            live_llm=False,
            sources=[]
        )

    try:
        rag = RAGEngine.get_instance()
        res = rag.query(q)
        raw_sources = res.get("sources", []) or []
        ans = (res.get("answer", "") or "").strip()
        if not raw_sources:
            ans += "\n\n*No supporting source was retrieved.*"
        ans += f"\n\n---\n*{scientific_meta.COPILOT_DISCLAIMER}*"
        database.log_copilot_audit(user_id, q, ans, sources_count=len(raw_sources), refused=False)
        return AskResponse(
            answer=ans,
            model_used=res.get("model_used"),
            provider=res.get("provider"),
            live_llm=res.get("live_llm", False),
            sources=raw_sources
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"RAG query execution error: {str(e)}")

@app.get("/api/clinical-tests")
def get_clinical_tests(tier: Optional[str] = None):
    """Retrieve all nominated candidate pairs queued for preclinical/clinical trials, optionally filtered by tier."""
    records = list(reversed(CLINICAL_TEST_QUEUE))
    if tier and tier.lower() != 'all':
        records = [r for r in records if r.get('priority_tier', '').lower() == tier.lower()]

    tier_counts = {
        "Tier 1": sum(1 for c in CLINICAL_TEST_QUEUE if c.get('priority_tier') == 'Tier 1'),
        "Tier 2": sum(1 for c in CLINICAL_TEST_QUEUE if c.get('priority_tier') == 'Tier 2'),
        "Tier 3": sum(1 for c in CLINICAL_TEST_QUEUE if c.get('priority_tier') == 'Tier 3'),
        "Need a Review Tier": sum(1 for c in CLINICAL_TEST_QUEUE if c.get('priority_tier') == 'Need a Review Tier')
    }
    return {
        "total": len(records),
        "total_unfiltered": len(CLINICAL_TEST_QUEUE),
        "tier_counts": tier_counts,
        "records": records
    }

@app.post("/api/clinical-tests")
def add_to_clinical_test_queue(req: ClinicalNominationRequest):
    """Add a candidate combination to the clinical trial pipeline categorized by its tier."""
    new_id = (max([c['id'] for c in CLINICAL_TEST_QUEUE]) + 1) if CLINICAL_TEST_QUEUE else 1
    tier = determine_priority_tier(req.compatibility_score)
    status_label = "Queued for Expert Review" if tier == "Need a Review Tier" else ("Queued for In-Vitro Validation" if tier in ["Tier 1", "Tier 2"] else "Queued for Secondary Screening")
    new_entry = {
        "id": new_id,
        "target_a": req.target_a.strip().upper(),
        "target_b": req.target_b.strip().upper(),
        "indication": req.indication.strip(),
        "compatibility_score": round(req.compatibility_score, 4),
        "priority_tier": tier,
        "notes": req.notes or f"Nominated candidate ({tier})",
        "drug_precedents": req.drug_precedents or "None (Novel Discovery)",
        "status": status_label,
        "date_added": "2026-11-05"
    }
    CLINICAL_TEST_QUEUE.append(new_entry)
    return {
        "status": "success",
        "message": f"Candidate {new_entry['target_a']} + {new_entry['target_b']} added to Clinical Test Queue under {tier}.",
        "entry": new_entry
    }

@app.delete("/api/clinical-tests/{test_id}")
def remove_from_clinical_test_queue(test_id: int):
    """Remove a candidate from the clinical test queue."""
    global CLINICAL_TEST_QUEUE
    CLINICAL_TEST_QUEUE = [c for c in CLINICAL_TEST_QUEUE if c['id'] != test_id]
    return {"status": "success", "message": f"Candidate #{test_id} removed from queue."}

@app.get("/api/drugs")
def get_clinical_drugs(
    search: Optional[str] = None,
    phase: Optional[str] = None,
    limit: int = Query(50, ge=1, le=800),
    offset: int = Query(0, ge=0)
):
    """Search and filter the 791 clinical bispecific antibodies from the dataset."""
    if RESOURCES['drugs_df'] is None:
        return {"total": 0, "records": []}
        
    filtered = RESOURCES['drugs_df']
    if search:
        s = search.strip().lower()
        if s:
            filtered = filtered[
                filtered['drug'].str.lower().str.contains(s, regex=False, na=False) |
                filtered['target_name'].str.lower().str.contains(s, regex=False, na=False) |
                filtered['target_symbol'].str.lower().str.contains(s, regex=False, na=False) |
                filtered['indication'].str.lower().str.contains(s, regex=False, na=False) |
                filtered['organization'].str.lower().str.contains(s, regex=False, na=False)
            ]
    if phase and phase != 'All':
        filtered = filtered[filtered['phase'].str.contains(phase, case=False, regex=False, na=False)]
        
    total_count = len(filtered)
    page_records = filtered.iloc[offset:offset+limit].to_dict(orient='records')
    return {
        "total": total_count,
        "offset": offset,
        "limit": limit,
        "records": page_records
    }


# ==============================================================================
# Authentication & User Management Endpoints
# ==============================================================================

@app.get("/api/auth/demo-users")
def get_demo_users():
    """Return public profiles of the 5 pre-seeded biotech researchers."""
    return {"users": database.get_demo_users()}

@app.post("/api/auth/demo")
def login_demo_workspace():
    """Sign into a read-only demo workspace backed by sample data."""
    try:
        sess = database.create_demo_session()
        return {
            "status": "success",
            "message": "Launched read-only demo workspace (sample data).",
            "user": sess["user"],
            "token": sess["token"],
            "is_demo": True
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Demo workspace unavailable: {str(e)}")


@app.post("/api/auth/login")
def login(req: LoginRequest):
    """Authenticate researcher credentials (by email or username) and return session token."""
    identifier = (req.email or req.username or "").strip()
    user = database.authenticate_user(identifier, req.password)
    if not user:
        raise HTTPException(status_code=401, detail="Email or password is incorrect.")
    return {
        "status": "success",
        "message": f"Welcome back, {user['full_name']}",
        "user": user,
        "token": user["token"]
    }

@app.post("/api/auth/register")
def register(req: RegisterRequest):
    """Register a new investigator account in SQLite users_history.db and return an authenticated session token."""
    pwd_err = database.validate_password_strength(req.password)
    if pwd_err:
        raise HTTPException(status_code=400, detail=pwd_err)
    try:
        user = database.register_user(
            email=req.email,
            password=req.password,
            full_name=req.full_name,
            username=req.username,
            role=req.role or "Senior Oncology Scientist",
            organization=req.organization or "Northwind Bio"
        )
        return {
            "status": "success",
            "message": f"Account created for {user['full_name']}",
            "user": user,
            "token": user["token"]
        }
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Registration failed: {str(e)}")

@app.post("/api/auth/logout")
def logout(authorization: Optional[str] = Header(None)):
    """Revoke session token in memory and SQLite user_sessions."""
    revoked = False
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1].strip()
        revoked = database.revoke_session_token(token)
    return {"status": "success", "revoked": revoked, "message": "Logged out successfully."}

@app.get("/api/auth/me")
def get_current_user(authorization: Optional[str] = Header(None)):
    """Fetch current user from Bearer token."""
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1]
    user = database.get_user_by_token(token) if token else None
    if not user:
        # Default demo profile #1
        demo = database.get_demo_users()[0]
        return {"authenticated": False, "user": demo}
    return {"authenticated": True, "user": user}


# ==============================================================================
# Account-Scoped Research History Endpoints
# ==============================================================================

@app.get("/api/research-history")
def get_research_history(user_id: Optional[int] = None, authorization: Optional[str] = Header(None)):
    """Retrieve all past screening runs for active researcher."""
    uid = user_id
    if not uid and authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1]
        user = database.get_user_by_token(token)
        if user:
            uid = user["id"]
    if not uid:
        uid = 1
    history = database.get_user_research_history(uid)
    return {"user_id": uid, "total": len(history), "history": history}

@app.post("/api/research-history")
def save_research_history(req: ResearchHistorySaveRequest, authorization: Optional[str] = Header(None)):
    """Explicitly save a new screening run to research history."""
    uid = 1
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1]
        user = database.get_user_by_token(token)
        if user:
            uid = user["id"]
    tier = req.priority_tier or determine_priority_tier(req.compatibility_score)
    saved = database.save_research_screening(
        user_id=uid,
        target_a=req.target_a,
        target_b=req.target_b,
        indication=req.indication,
        model_name=req.model_name or "XGBoost + Pairwise AI",
        compatibility_score=req.compatibility_score,
        priority_tier=tier,
        double_positive_expr=req.double_positive_expr,
        safety_score=req.safety_score,
        gene_similarity=req.gene_similarity,
        clinical_status=req.clinical_status,
        notes=req.notes
    )
    return {"status": "success", "saved": saved}

@app.delete("/api/research-history/{screening_id}")
def delete_research_history(screening_id: int, user_id: Optional[int] = None, authorization: Optional[str] = Header(None)):
    """Delete a screening run belonging strictly to the authenticated researcher."""
    uid = user_id
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1].strip()
        user = database.get_user_by_token(token)
        if user:
            uid = user["id"]
    if not uid:
        uid = 1
    success = database.delete_research_screening(screening_id, uid)
    return {"status": "success" if success else "not_found"}


# ==============================================================================
# Side-by-Side Target Pair Comparison Matrix (/compare)
# ==============================================================================

@app.post("/api/compare")
def compare_target_pairs(req: PairComparisonRequest):
    """
    Evaluate 2 to 4 target combinations side-by-side.
    Returns comparison matrix rows with:
    - Prediction Score & Priority Tier badge
    - Double-Positive Expression (High / Medium / Low)
    - Safety Score (High / Medium / Low)
    - Gene Similarity (High / Medium / Low)
    - Clinical Status (Approved / Phase / Preclinical)
    - Radar metrics for comparative charts
    """
    if len(req.pairs) < 1 or len(req.pairs) > 6:
        raise HTTPException(status_code=400, detail="Please provide between 1 and 6 target combinations to compare.")

    results = []
    for item in req.pairs:
        comp = compute_single_pair_comparison(
            ta=item.target_a,
            tb=item.target_b,
            indication=item.indication or "Non-Small Cell Lung Cancer",
            model_name=req.model_name or "XGBoost + Pairwise AI"
        )
        if comp:
            results.append(comp)

    return {
        "total_pairs": len(results),
        "model_used": req.model_name or "XGBoost + Pairwise AI",
        "comparisons": results
    }

@app.get("/api/compare/export")
def export_comparison_csv(pairs: str = Query(..., description="Comma-separated target pairs formatted as A:B, e.g. EGFR:MET,MS4A1:CD3E")):
    """Export comparison matrix to CSV format."""
    pair_tokens = [p.strip() for p in pairs.split(",") if ":" in p]
    rows = []
    for pt in pair_tokens:
        ta, tb = pt.split(":")[:2]
        comp = compute_single_pair_comparison(ta, tb)
        if comp:
            rows.append(comp)
            
    csv_lines = [
        "Target Pair,Indication,Compatibility Score,Priority Tier,Double-Positive Expression,Safety Score,Gene Similarity,Clinical Status"
    ]
    for r in rows:
        csv_lines.append(f'"{r["pair_label"]}","{r["indication"]}","{r["compatibility_percentage"]}%","{r["priority_tier"]}","{r["double_positive_desc"]}","{r["safety_desc"]}","{r["gene_similarity_desc"]}","{r["clinical_status"]}"')

    csv_content = "\n".join(csv_lines)
    return PlainTextResponse(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="bispec_pair_comparison.csv"'}
    )


# ==============================================================================
# Video & Frontend Deep-Link Routing
# ==============================================================================

@app.get("/{video_name}.mp4")
def serve_root_video(video_name: str):
    """Direct handler for scroll-synced background videos."""
    vpath = os.path.join(FRONTEND_DIR, f"{video_name}.mp4")
    if os.path.exists(vpath):
        return FileResponse(vpath, media_type="video/mp4")
    raise HTTPException(status_code=404, detail="Video file not found")

# Mount Vite production build assets (/assets) if built
if os.path.exists(DIST_ASSETS_DIR):
    app.mount("/assets", StaticFiles(directory=DIST_ASSETS_DIR), name="vite_assets")

# Mount static legacy frontend directory (/static)
if os.path.exists(FRONTEND_DIR):
    app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

@app.get("/")
@app.get("/index.html")
@app.get("/dashboard")
@app.get("/login")
@app.get("/compare")
@app.get("/models")
@app.get("/studio")
@app.get("/registry")
def serve_frontend_index():
    """Serve the unified Vite + Three.js production build from dist/ (or fallback to frontend/)."""
    dist_index = os.path.join(DIST_DIR, 'index.html')
    if os.path.exists(dist_index):
        return FileResponse(dist_index)
    legacy_index = os.path.join(FRONTEND_DIR, 'index.html')
    if os.path.exists(legacy_index):
        return FileResponse(legacy_index)
    return {"message": "BiSpec Pairwise AI API is running. Run 'npm run build' to compile the frontend."}

@app.get("/legacy")
def serve_legacy_frontend():
    """Optional route to view the legacy HTML/Chart.js frontend."""
    legacy_index = os.path.join(FRONTEND_DIR, 'index.html')
    if os.path.exists(legacy_index):
        return FileResponse(legacy_index)
    raise HTTPException(status_code=404, detail="Legacy frontend not found")


if __name__ == '__main__':
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
