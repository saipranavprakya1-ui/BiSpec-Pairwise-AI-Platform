"""
test_rag_fastapi.py
===================
Automated verification suite for the updated FastAPI RAG Server in rag_terminal_app.py.
Tests:
1. Setup & CORS middleware configuration.
2. Global chain initialization on server startup.
3. POST /ask endpoint with {"question": "explain about f10 antigen"}.
4. Returned format strictly matches {"answer": "<generated_text>"}.
5. Error handling for empty or missing question payload.
6. Health and documentation endpoints.
"""

import sys
from pathlib import Path
from fastapi.testclient import TestClient

from rag_terminal_app import app, initialize_rag_pipeline

def run_tests():
    print("=" * 70)
    print("Testing FastAPI RAG Server Integration (rag_terminal_app.py)")
    print("=" * 70)

    # 1. Initialize global chain and create TestClient
    print("[*] Initializing global retrieval chain...")
    initialize_rag_pipeline()
    client = TestClient(app)

    # 2. Verify CORS Middleware is configured
    cors_middlewares = [m for m in app.user_middleware if "CORSMiddleware" in str(m.cls)]
    assert len(cors_middlewares) > 0, "CORSMiddleware is not registered in FastAPI app!"
    print("[PASS] 1. CORSMiddleware properly initialized and active.")

    # 3. Test Health Endpoint
    res = client.get("/health")
    assert res.status_code == 200, f"Health check failed: {res.status_code}"
    health_data = res.json()
    assert health_data["status"] == "healthy"
    assert health_data["chain_initialized"] is True
    print(f"[PASS] 2. GET /health -> 200 OK (Vector Store & LLM active: {health_data['embeddings_model']}, {health_data['llm_model']})")

    # 4. Test POST /ask Endpoint with {"question": "explain about f10 antigen"}
    print("[*] Testing POST /ask with payload: {'question': 'explain about f10 antigen'}...")
    payload = {"question": "explain about f10 antigen"}
    res = client.post("/ask", json=payload)
    assert res.status_code == 200, f"POST /ask returned status {res.status_code}: {res.text}"
    
    data = res.json()
    assert "answer" in data, f"Key 'answer' not in response: {data}"
    assert isinstance(data["answer"], str), f"data['answer'] is not a string: {type(data['answer'])}"
    assert len(data["answer"].strip()) > 20, "Answer string is empty or unexpectedly short!"
    assert any(term in data["answer"].lower() for term in ["factor x", "f10", "coagulation", "serine"]), \
        f"Answer does not contain biological context for F10: {data['answer']}"
    print("[PASS] 3. POST /ask -> 200 OK")
    print(f"       Response format: {{'answer': '{data['answer'][:80]}...'}}")

    # 5. Test Error Handling: Empty payload -> HTTP 400
    res_empty = client.post("/ask", json={"question": ""})
    assert res_empty.status_code == 400, f"Expected 400 for empty question, got {res_empty.status_code}"
    print("[PASS] 4. Error Handling: Empty question string returns HTTP 400 Bad Request.")

    # 6. Test Error Handling: Missing question field -> HTTP 400
    res_missing = client.post("/ask", json={})
    assert res_missing.status_code == 400, f"Expected 400 for missing question, got {res_missing.status_code}"
    print("[PASS] 5. Error Handling: Missing question field returns HTTP 400 Bad Request.")

    # 7. Test Algorithm Query
    print("[*] Testing POST /ask with benchmark question: {'question': 'why is xgboost champion'}...")
    res_algo = client.post("/ask", json={"question": "why is xgboost champion"})
    assert res_algo.status_code == 200
    algo_data = res_algo.json()
    assert "answer" in algo_data and len(algo_data["answer"]) > 20
    print("[PASS] 6. POST /ask (Benchmark Query) -> 200 OK")

    print("\n" + "=" * 70)
    print("ALL FASTAPI RAG INTEGRATION TESTS PASSED SUCCESSFULLY!")
    print("=" * 70)

if __name__ == "__main__":
    run_tests()
