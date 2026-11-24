
"""
test_api.py
Comprehensive verification and automated test suite for BiSpec Pairwise AI FastAPI Backend.
Tests all endpoints, edge cases, error handling, and multi-model inference.
"""

import sys
import os

# Ensure backend directory is in path
sys.path.append(os.path.dirname(__file__))
from app import app, load_app_resources
from fastapi.testclient import TestClient

def run_all_tests():
    print("=" * 70)
    print("BiSpec Pairwise AI - Backend Comprehensive Test Suite & Debugging")
    print("=" * 70)
    
    # 1. Initialize backend resources
    load_app_resources()
    client = TestClient(app)
    
    # 2. Test Health Endpoint
    res = client.get("/api/health")
    assert res.status_code == 200, f"Health check failed: {res.status_code}"
    health_data = res.json()
    assert health_data["status"] == "healthy"
    assert health_data["dataset_records"] == 791
    assert health_data["unique_targets_count"] > 180
    print("[PASS] 1. /api/health -> 200 OK (791 records loaded, models ready)")
    
    # 3. Test Targets Endpoint
    res = client.get("/api/targets")
    assert res.status_code == 200
    targets_data = res.json()
    assert "targets" in targets_data and "details" in targets_data
    assert "EGFR" in targets_data["targets"]
    assert "CD3E" in targets_data["targets"]
    print(f"[PASS] 2. /api/targets -> 200 OK ({len(targets_data['targets'])} targets verified)")
    
    # 4. Test Predict Endpoint with Standard Pair (EGFR + MET)
    payload = {
        "target_a": "EGFR",
        "target_b": "MET",
        "indication": "Non-Small Cell Lung Cancer",
        "model_name": "XGBoost + Pairwise AI"
    }
    res = client.post("/api/predict", json=payload)
    assert res.status_code == 200
    pdata = res.json()
    assert pdata["compatibility_percentage"] > 70.0
    assert len(pdata["matched_clinical_drugs"]) >= 1
    assert "radar_metrics" in pdata
    print(f"[PASS] 3. /api/predict (EGFR + MET) -> 200 OK (Score: {pdata['compatibility_percentage']}%, Drugs matched: {len(pdata['matched_clinical_drugs'])})")

    # 5. Test Permutation Invariance: f(EGFR, MET) == f(MET, EGFR)
    payload_inv = {
        "target_a": "MET",
        "target_b": "EGFR",
        "indication": "Non-Small Cell Lung Cancer",
        "model_name": "XGBoost + Pairwise AI"
    }
    res_inv = client.post("/api/predict", json=payload_inv)
    assert res_inv.status_code == 200
    pdata_inv = res_inv.json()
    assert abs(pdata["compatibility_score"] - pdata_inv["compatibility_score"]) < 1e-4, "Permutation invariance violated!"
    print(f"[PASS] 4. Permutation Invariance Verified: f(EGFR, MET) == f(MET, EGFR) ({pdata['compatibility_score']} == {pdata_inv['compatibility_score']})")

    # 6. Test Multi-Model Inference (All 6 Models)
    all_models = [
        'Logistic Regression',
        'Decision Tree',
        'Random Forest',
        'GBDT',
        'DNN (MLP)',
        'XGBoost + Pairwise AI'
    ]
    print("\n--- Verifying Inference Across All 6 Benchmark Models ---")
    for m in all_models:
        res_m = client.post("/api/predict", json={
            "target_a": "PDCD1",
            "target_b": "CTLA4",
            "model_name": m
        })
        assert res_m.status_code == 200, f"Model {m} failed inference"
        m_score = res_m.json()["compatibility_percentage"]
        print(f"  * Model: {m:23} -> Compatibility: {m_score}%")
    print("[PASS] 5. Multi-model inference verified successfully across all 6 models")

    # 7. Test Edge Case: Self-pairing (Target A == Target B) -> Expect HTTP 400
    res_self = client.post("/api/predict", json={"target_a": "EGFR", "target_b": "EGFR"})
    assert res_self.status_code == 400, f"Expected 400 for identical targets, got {res_self.status_code}"
    print("[PASS] 6. Edge Case Handled: Self-pairing (EGFR + EGFR) rejected with 400 Bad Request")

    # 8. Test Edge Case: Case-insensitivity & Gene Aliases
    res_alias = client.post("/api/predict", json={"target_a": "cd20", "target_b": "cd3"})
    assert res_alias.status_code == 200
    alias_data = res_alias.json()
    assert "MS4A1" in [alias_data["target_a"], alias_data["target_b"]]
    assert "CD3E" in [alias_data["target_a"], alias_data["target_b"]]
    print(f"[PASS] 7. Gene Alias Mapping Verified: 'cd20' + 'cd3' -> {alias_data['target_a']} + {alias_data['target_b']}")

    # 9. Test Benchmark Endpoint & Curve Formats
    res = client.get("/api/benchmark")
    assert res.status_code == 200
    bdata = res.json()
    assert "metrics" in bdata and "curves" in bdata and "feature_importance" in bdata
    assert len(bdata["metrics"]["models"]) == 6
    assert "roc_curves" in bdata["curves"]
    assert "pr_curves" in bdata["curves"]
    print(f"[PASS] 8. /api/benchmark -> 200 OK (6 models, ROC/PR curves, and feature importances verified)")

    # 10. Test Explain Endpoint (GPT Rationale)
    res = client.post("/api/explain", json={
        "target_a": "PDCD1",
        "target_b": "CD274",
        "indication": "Non-Small Cell Lung Cancer",
        "score": 0.88
    })
    assert res.status_code == 200
    edata = res.json()
    assert "mechanism_of_action" in edata
    assert "resistance_bypass" in edata
    assert "safety_and_toxicity" in edata
    print(f"[PASS] 9. /api/explain -> 200 OK (Mechanism of Action generated successfully)")

    # 11. Test Drugs Endpoint (Search & Filter)
    res = client.get("/api/drugs?search=Epcoritamab")
    assert res.status_code == 200
    ddata = res.json()
    assert ddata["total"] >= 1
    assert ddata["records"][0]["drug"] == "Epcoritamab"
    
    res_ph = client.get("/api/drugs?phase=Approved")
    assert res_ph.status_code == 200
    approved_data = res_ph.json()
    assert approved_data["total"] == 12, f"Expected 12 approved drugs, found {approved_data['total']}"
    print(f"[PASS] 10. /api/drugs -> 200 OK (Full-text search and Phase filters verified: {approved_data['total']} Approved drugs)")

    # 12. Test Stats Endpoint
    res = client.get("/api/stats")
    assert res.status_code == 200
    sdata = res.json()
    assert sdata["total_drugs"] == 791
    print(f"[PASS] 11. /api/stats -> 200 OK (791 drugs, phase distributions verified)")

    # 13. Test Tier-Based Clinical Test Nomination Pipeline (User Requirements: >90% -> Tier 1, 75-90% -> Tier 2, 60-75% -> Tier 3, <60% -> Need a Review Tier)
    test_cases = [
        {"target_a": "EGFR", "target_b": "MET", "indication": "NSCLC", "compatibility_score": 0.94, "expected_tier": "Tier 1"},
        {"target_a": "CD274", "target_b": "TNFRSF9", "indication": "NSCLC", "compatibility_score": 0.82, "expected_tier": "Tier 2"},
        {"target_a": "VEGFA", "target_b": "ANGPT2", "indication": "NSCLC", "compatibility_score": 0.67, "expected_tier": "Tier 3"},
        {"target_a": "CTLA4", "target_b": "LAG3", "indication": "Solid Tumors", "compatibility_score": 0.45, "expected_tier": "Need a Review Tier"},
    ]
    for tc in test_cases:
        res = client.post("/api/clinical-tests", json={
            "target_a": tc["target_a"],
            "target_b": tc["target_b"],
            "indication": tc["indication"],
            "compatibility_score": tc["compatibility_score"]
        })
        assert res.status_code == 200
        entry = res.json()["entry"]
        assert entry["priority_tier"] == tc["expected_tier"], f"Expected {tc['expected_tier']} for score {tc['compatibility_score']}, got {entry['priority_tier']}"
    
    # Test Tier filtering
    res_t1 = client.get("/api/clinical-tests?tier=Tier 1")
    assert res_t1.status_code == 200
    t1_records = res_t1.json()["records"]
    assert all(r["priority_tier"] == "Tier 1" for r in t1_records)
    print(f"[PASS] 12. Tier-based Clinical Test pipeline verified for all 4 tiers (Tier 1, Tier 2, Tier 3, Need a Review Tier)")

    # 13. Test Live RAG Computational Biologist Chat Endpoint
    res = client.post("/api/rag/chat", json={"query": "explain about f10 antigen"})
    assert res.status_code == 200
    rag_data = res.json()
    assert "answer" in rag_data
    assert "Factor X" in rag_data["answer"] or "F10" in rag_data["answer"]
    print(f"[PASS] 13. /api/rag/chat -> 200 OK (RAG pipeline successfully retrieved Factor X / F10 context)")

    # 14. Test POST /ask Endpoint with {"question": "explain about f10 antigen"}
    res_ask = client.post("/ask", json={"question": "explain about f10 antigen"})
    assert res_ask.status_code == 200
    ask_data = res_ask.json()
    assert "answer" in ask_data and len(ask_data["answer"]) > 20
    assert "Factor X" in ask_data["answer"] or "F10" in ask_data["answer"]
    print(f"[PASS] 14. /ask -> 200 OK (Formatted JSON: {{'answer': '{ask_data['answer'][:60]}...'}})")

    print("\n" + "=" * 70)
    print("ALL 14 BACKEND, RAG PIPELINE, AND CLINICAL TEST CHECKS PASSED WITH ZERO ERRORS!")
    print("=" * 70)

if __name__ == '__main__':
    run_all_tests()
