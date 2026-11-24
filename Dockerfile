# =============================================================================
# BiSpec Pairwise AI — Production Multi-Stage Dockerfile
# Compatible with Hugging Face Spaces (port 7860, UID 1000), Railway, Render & Cloud Run
# =============================================================================

# Stage 1: Build Sky & Coral Frontend Bundle (Vite)
FROM node:20-slim AS frontend-builder
WORKDIR /frontend
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY src ./src
COPY public ./public
RUN npm run build

# Stage 2: Python 3.12 FastAPI + 9 ML Models + FAISS RAG Runtime
FROM python:3.12-slim

WORKDIR /app

# Install OpenMP & build libraries required by XGBoost / scikit-learn / FAISS
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Create Hugging Face Spaces non-root user (UID 1000)
RUN useradd -m -u 1000 user

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend, ML models, datasets, and built frontend
COPY --chown=user:user . .
COPY --from=frontend-builder --chown=user:user /frontend/dist ./dist

# Ensure SQLite & FAISS cache directory are writable by UID 1000
RUN chown -R user:user /app

USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    PORT=7860

EXPOSE 7860

CMD ["sh", "-c", "uvicorn backend.app:app --host 0.0.0.0 --port ${PORT:-7860}"]
