"""
Automated P0 Security, Auth, Single-Source Metadata, TreeSHAP & Guardrail Verification Suite.
Run with: C:\\Python314\\python.exe tests/test_security_and_api.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from backend.app import app


def run_all_tests():
    with TestClient(app) as client:
        # 1. Protected routes MUST return 401 without Bearer token (Section A3)
        protected_checks = [
            ("GET", "/api/targets"),
            ("GET", "/api/benchmark"),
            ("GET", "/api/drugs"),
            ("GET", "/api/research-history"),
            ("POST", "/api/predict"),
            ("POST", "/api/ask"),
        ]
        for method, path in protected_checks:
            res = client.request(method, path, json={"target_a": "EGFR", "target_b": "MET"} if method == "POST" else None)
            assert res.status_code == 401, f"Expected 401 on {method} {path}, got {res.status_code}"
        print("[PASS] 1. All 6 protected /api/* routes enforce HTTP 401 without token.")

        # 2. /api/health proves live DB write+read and models loaded (Section A5, B4)
        h = client.get("/api/health")
        assert h.status_code == 200
        hdata = h.json()
        assert hdata["checks"]["database"] is True, "DB write+read probe failed"
        assert hdata["checks"]["models_loaded"] is True, "Models not loaded"
        assert h.headers.get("x-content-type-options") == "nosniff"
        assert h.headers.get("x-frame-options") == "DENY"
        print("[PASS] 2. /api/health proves live DB write/read + models loaded + security headers.")

        # 3. /api/meta/summary single source of truth (Section B1, B2, D1)
        m = client.get("/api/meta/summary")
        assert m.status_code == 200
        meta = m.json()
        assert meta["drugs_in_registry"] == 791, f"Got {meta['drugs_in_registry']}"
        assert meta["genes_with_single_cell_profiles"] == 193, f"Got {meta['genes_with_single_cell_profiles']}"
        assert meta["candidate_pairs_scored"] == 18528, f"Got {meta['candidate_pairs_scored']}"
        assert meta["models_compared"] == 9, f"Got {meta['models_compared']}"
        assert meta["unique_target_pairs_in_registry"] == 324, f"Got {meta['unique_target_pairs_in_registry']}"
        ci = meta["champion_metrics"]
        assert 0.5 < ci["ci_low"] < ci["roc_auc"] < ci["ci_high"] <= 1.0, f"Invalid CI: {ci}"
        print(f"[PASS] 3. /api/meta/summary verified: 791 drugs, 193 genes, 18,528 pairs, 9 models, {ci['formatted']}.")

        # 4. Downloadable Model Card (Section D3)
        mc = client.get("/api/model-card")
        assert mc.status_code == 200 and "Research use only" in mc.text
        print("[PASS] 4. /api/model-card serves downloadable Model Card with disclaimer.")

        # 5. Demo session + authenticated /api/predict + TreeSHAP + In-Training-Set Flag (Section A4, D4, D5)
        demo = client.post("/api/auth/demo")
        assert demo.status_code == 200
        token = demo.json()["token"]
        assert token.startswith("demo_")
        headers = {"Authorization": f"Bearer {token}"}

        pred = client.post("/api/predict", json={"target_a": "MS4A1", "target_b": "CD3E", "indication": "Non-Small Cell Lung Cancer"}, headers=headers)
        assert pred.status_code == 200, pred.text
        pdata = pred.json()
        assert pdata["in_training_set"] is True
        assert "not a prospective prediction" in (pdata.get("training_set_notice") or "")
        assert pdata["feature_contributions"]["available"] is True
        assert "Research use only" in pdata["disclaimer"]
        print("[PASS] 5. Demo auth + /api/predict returns TreeSHAP drivers, in_training_set flag & disclaimer.")

        # 6. Unknown gene symbol validation returns HTTP 422 with suggestions (Section F)
        bad_gene = client.post("/api/predict", json={"target_a": "EGFRX", "target_b": "MET"}, headers=headers)
        assert bad_gene.status_code == 422
        assert "suggestions" in bad_gene.json()["detail"]
        print("[PASS] 6. Unknown gene symbol rejected with HTTP 422 + closest gene suggestions.")

        # 7. Demo workspace is read-only on history deletion (Section A4)
        del_res = client.delete("/api/research-history/1", headers=headers)
        assert del_res.status_code == 403
        print("[PASS] 7. Read-only demo session blocked (HTTP 403) from deleting history.")

        # 8. Copilot medical-advice refusal guardrail (Section D6)
        ask_refuse = client.post("/api/ask", json={"question": "What dosage in mg/kg should I take to treat my cancer?"}, headers=headers)
        assert ask_refuse.status_code == 200
        assert ask_refuse.json()["provider"] == "BiSpec Guardrail"
        assert "Not medical advice" in ask_refuse.json()["answer"]
        print("[PASS] 8. Copilot refuses patient dosing/treatment advice with AI disclaimer.")

        # 9. Weak / breached password rejected on signup (Section A6)
        weak = client.post("/api/auth/register", json={"email": "weak@test.org", "password": "password123", "full_name": "Test User"})
        assert weak.status_code == 400
        print("[PASS] 9. Signup rejects weak / breached passwords (<10 chars or common list).")

    print("\nALL 9/9 P0/P1/SCIENTIFIC CREDIBILITY TESTS PASSED!")


if __name__ == "__main__":
    run_all_tests()
