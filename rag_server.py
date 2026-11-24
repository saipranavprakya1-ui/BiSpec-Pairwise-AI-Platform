"""
rag_server.py
=============
FastAPI RAG Server module alias for BiSpec Pairwise AI.
Exports the FastAPI app initialized in rag_terminal_app.py.
"""

from rag_terminal_app import app, initialize_rag_pipeline, get_rag_chain, AskRequest, AskResponse

if __name__ == "__main__":
    import os
    import uvicorn
    port = int(os.getenv("RAG_PORT", os.getenv("PORT", 8000)))
    print("=" * 75)
    print("       BiSpec Pairwise AI - RAG FastAPI Server")
    print(f"       Local URL:   http://127.0.0.1:{port}")
    print(f"       Swagger API: http://127.0.0.1:{port}/docs")
    print(f"       Ask Route:   POST http://127.0.0.1:{port}/ask")
    print("=" * 75)
    uvicorn.run("rag_server:app", host="0.0.0.0", port=port, reload=False)
