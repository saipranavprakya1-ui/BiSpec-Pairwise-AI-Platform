"""
database.py
===========
Local SQLite database manager for BiSpec Pairwise AI.
Manages users_history.db containing:
1. `users`: Pre-seeded with 5 realistic biotech researchers.
2. `research_history`: Stores account-scoped target-pair screening runs.
"""

import os
import sqlite3
import hashlib
import secrets
from typing import Dict, Any, List, Optional
from datetime import datetime

# Path to SQLite database
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "users_history.db")

# Simple in-memory token storage (token -> user_id)
ACTIVE_TOKENS: Dict[str, Dict[str, Any]] = {}


def hash_password(password: str, salt: Optional[str] = None) -> tuple[str, str]:
    """Hash password using PBKDF2-HMAC-SHA256."""
    if not salt:
        salt = secrets.token_hex(16)
    pwd_hash = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        100000
    ).hex()
    return pwd_hash, salt


def verify_password(password: str, stored_hash: str, salt: str) -> bool:
    """Verify password matches stored hash with given salt."""
    pwd_hash, _ = hash_password(password, salt)
    return secrets.compare_digest(pwd_hash, stored_hash)


def get_db_connection() -> sqlite3.Connection:
    """Create and return a thread-safe connection with dict-like row access."""
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Initialize database tables and seed realistic researcher accounts and history."""
    conn = get_db_connection()
    cursor = conn.cursor()

    # Create users table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL,
        organization TEXT NOT NULL,
        avatar_color TEXT NOT NULL DEFAULT '#10B981',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Ensure username column exists for pre-existing databases
    cursor.execute("PRAGMA table_info(users)")
    cols = [r["name"] for r in cursor.fetchall()]
    if "username" not in cols:
        try:
            cursor.execute("ALTER TABLE users ADD COLUMN username TEXT")
        except Exception:
            pass

    # Create sessions table for persistent token authentication across restarts
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS user_sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
    """)

    # Create research_history table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS research_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        target_a TEXT NOT NULL,
        target_b TEXT NOT NULL,
        indication TEXT NOT NULL,
        model_name TEXT NOT NULL,
        compatibility_score REAL NOT NULL,
        priority_tier TEXT NOT NULL,
        double_positive_expr TEXT,
        safety_score TEXT,
        gene_similarity TEXT,
        clinical_status TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
    """)
    conn.commit()

    # Pre-seed 5 realistic researcher accounts
    cursor.execute("SELECT COUNT(*) as cnt FROM users")
    count = cursor.fetchone()["cnt"]

    if count == 0:
        print("[*] Seeding 5 realistic researcher accounts and research history...")
        default_pwd = "Password123!"

        researchers = [
            {
                "email": "elena.rostova@genebiotech.com",
                "full_name": "Dr. Elena Rostova, PhD",
                "role": "Lead Computational Biologist",
                "organization": "Genentech Oncology R&D",
                "avatar_color": "#10B981", # Emerald
                "history": [
                    {
                        "target_a": "EGFR", "target_b": "MET",
                        "indication": "Non-Small Cell Lung Cancer",
                        "model_name": "XGBoost + Pairwise AI",
                        "compatibility_score": 0.8179,
                        "priority_tier": "Tier 2 (75%–90%)",
                        "double_positive_expr": "High (86.4%)",
                        "safety_score": "High (88.0%)",
                        "gene_similarity": "Medium (0.42)",
                        "clinical_status": "Approved (Amivantamab)",
                        "notes": "Dual receptor tyrosine kinase co-inhibition overcoming third-generation EGFR TKI bypass resistance."
                    },
                    {
                        "target_a": "MS4A1", "target_b": "CD3E",
                        "indication": "B-Cell Lymphoma / Leukemia",
                        "model_name": "XGBoost + Pairwise AI",
                        "compatibility_score": 0.9650,
                        "priority_tier": "Tier 1 (>90%)",
                        "double_positive_expr": "Very High (94.2%)",
                        "safety_score": "High (82.5%)",
                        "gene_similarity": "Low (0.18)",
                        "clinical_status": "Approved (Epcoritamab / Glofitamab)",
                        "notes": "Validated T-cell redirecting bispecific antibody for relapsed refractory follicular/DLBCL."
                    },
                    {
                        "target_a": "PDCD1", "target_b": "CTLA4",
                        "indication": "Metastatic Melanoma & NSCLC",
                        "model_name": "XGBoost + Pairwise AI",
                        "compatibility_score": 0.8842,
                        "priority_tier": "Tier 2 (75%–90%)",
                        "double_positive_expr": "High (82.0%)",
                        "safety_score": "Moderate (68.4%)",
                        "gene_similarity": "Medium (0.39)",
                        "clinical_status": "Approved / Phase 3 (Cadonilimab)",
                        "notes": "Dual immune checkpoint co-blockade with avidity-driven tumor microenvironment selectivity."
                    },
                    {
                        "target_a": "ERBB2", "target_b": "CD3E",
                        "indication": "HER2+ Breast & Gastric Carcinoma",
                        "model_name": "XGBoost + Pairwise AI",
                        "compatibility_score": 0.9120,
                        "priority_tier": "Tier 1 (>90%)",
                        "double_positive_expr": "High (91.0%)",
                        "safety_score": "High (79.2%)",
                        "gene_similarity": "Low (0.16)",
                        "clinical_status": "Phase 2 / Preclinical (Zanidatamab Class)",
                        "notes": "Potent redirecting T-cell engager targeting high-density HER2 overexpressing solid tumors."
                    }
                ]
            },
            {
                "email": "marcus.vance@mskcc-immuno.org",
                "full_name": "Dr. Marcus Vance, MD, PhD",
                "role": "Director of Immuno-Oncology",
                "organization": "Memorial Sloan Kettering Cancer Center",
                "avatar_color": "#3B82F6", # Royal Blue
                "history": [
                    {
                        "target_a": "CLDN18", "target_b": "CD3E",
                        "indication": "Gastric & Gastroesophageal Junction",
                        "model_name": "XGBoost + Pairwise AI",
                        "compatibility_score": 0.8420,
                        "priority_tier": "Tier 2 (75%–90%)",
                        "double_positive_expr": "High (85.1%)",
                        "safety_score": "High (89.5%)",
                        "gene_similarity": "Low (0.15)",
                        "clinical_status": "Phase 1/2 Clinical Pipeline",
                        "notes": "Claudin18.2 lineage-specific solid tumor T-cell engager with minimal normal gastric leak."
                    },
                    {
                        "target_a": "DLL3", "target_b": "CD3E",
                        "indication": "Small Cell Lung Cancer (SCLC)",
                        "model_name": "XGBoost + Pairwise AI",
                        "compatibility_score": 0.9250,
                        "priority_tier": "Tier 1 (>90%)",
                        "double_positive_expr": "High (89.0%)",
                        "safety_score": "High (84.1%)",
                        "gene_similarity": "Low (0.12)",
                        "clinical_status": "Approved (Tarlatamab / Imdelltra)",
                        "notes": "Breakthrough DLL3-directed BiTE establishing rapid immune-mediated lysis in recurrent SCLC."
                    },
                    {
                        "target_a": "CTLA4", "target_b": "LAG3",
                        "indication": "Advanced Solid Tumors",
                        "model_name": "XGBoost + Pairwise AI",
                        "compatibility_score": 0.5420,
                        "priority_tier": "Need a Review Tier (<60%)",
                        "double_positive_expr": "Medium (58.3%)",
                        "safety_score": "Low (48.0%)",
                        "gene_similarity": "Medium (0.35)",
                        "clinical_status": "Investigational Early Phase",
                        "notes": "High risk of immune-related adverse events (irAEs); dose fractionation mandatory."
                    }
                ]
            },
            {
                "email": "priya.ramanathan@astrazeneca-rd.com",
                "full_name": "Dr. Priya Ramanathan, PhD",
                "role": "Translational Medicine Director",
                "organization": "AstraZeneca Biologics Engineering",
                "avatar_color": "#8B5CF6", # Purple
                "history": [
                    {
                        "target_a": "CD274", "target_b": "TNFRSF9",
                        "indication": "Non-Small Cell Lung Cancer",
                        "model_name": "XGBoost + Pairwise AI",
                        "compatibility_score": 0.8840,
                        "priority_tier": "Tier 2 (75%–90%)",
                        "double_positive_expr": "High (87.2%)",
                        "safety_score": "High (88.4%)",
                        "gene_similarity": "Low (0.24)",
                        "clinical_status": "Phase 1/2 Investigational",
                        "notes": "PD-L1 blockade combined with localized tumor-directed 4-1BB co-stimulation without systemic hepatotoxicity."
                    },
                    {
                        "target_a": "VEGFA", "target_b": "ANGPT2",
                        "indication": "Non-Small Cell Lung Cancer & AMD",
                        "model_name": "XGBoost + Pairwise AI",
                        "compatibility_score": 0.7180,
                        "priority_tier": "Tier 3 (60%–75%)",
                        "double_positive_expr": "Medium (68.0%)",
                        "safety_score": "High (90.5%)",
                        "gene_similarity": "Low (0.19)",
                        "clinical_status": "Approved Precedent (Faricimab / Vabysmo)",
                        "notes": "Dual angiogenic inhibition stabilizing vascular integrity and tumor hypoxia."
                    },
                    {
                        "target_a": "EGFR", "target_b": "CD3E",
                        "indication": "Head & Neck Squamous Cell Carcinoma",
                        "model_name": "XGBoost + Pairwise AI",
                        "compatibility_score": 0.8620,
                        "priority_tier": "Tier 2 (75%–90%)",
                        "double_positive_expr": "High (84.3%)",
                        "safety_score": "Medium (71.0%)",
                        "gene_similarity": "Low (0.14)",
                        "clinical_status": "Phase 1 Clinical Trials",
                        "notes": "Potent tumor redirection requiring step-up priming dosing to avoid cutaneous toxicity."
                    }
                ]
            },
            {
                "email": "arthur.chen@dana-farber.harvard.edu",
                "full_name": "Dr. Arthur Chen, PhD",
                "role": "Principal Scientist - Structural Biology",
                "organization": "Dana-Farber Cancer Institute",
                "avatar_color": "#D97706", # Amber
                "history": [
                    {
                        "target_a": "F10", "target_b": "F9",
                        "indication": "Factor VIIIa Mimetic / Cancer Stroma",
                        "model_name": "XGBoost + Pairwise AI",
                        "compatibility_score": 0.9520,
                        "priority_tier": "Tier 1 (>90%)",
                        "double_positive_expr": "Very High (93.0%)",
                        "safety_score": "High (91.2%)",
                        "gene_similarity": "Medium (0.44)",
                        "clinical_status": "Approved (Emicizumab / Hemlibra)",
                        "notes": "Spatial cofactor scaffolding bridging Factor IXa to Factor X serine protease active site."
                    },
                    {
                        "target_a": "FOLR1", "target_b": "CD3E",
                        "indication": "Ovarian & Triple-Negative Breast Cancer",
                        "model_name": "XGBoost + Pairwise AI",
                        "compatibility_score": 0.8750,
                        "priority_tier": "Tier 2 (75%–90%)",
                        "double_positive_expr": "High (85.6%)",
                        "safety_score": "High (86.0%)",
                        "gene_similarity": "Low (0.11)",
                        "clinical_status": "Phase 1/2 Clinical Trials",
                        "notes": "Folate Receptor Alpha-targeted T-cell engaging construct for epithelial tumors."
                    },
                    {
                        "target_a": "TIGIT", "target_b": "PDCD1",
                        "indication": "Non-Small Cell Lung Cancer",
                        "model_name": "XGBoost + Pairwise AI",
                        "compatibility_score": 0.7920,
                        "priority_tier": "Tier 2 (75%–90%)",
                        "double_positive_expr": "High (80.5%)",
                        "safety_score": "High (88.0%)",
                        "gene_similarity": "Medium (0.33)",
                        "clinical_status": "Phase 2/3 (Rilvegostomig / Domvanalimab Class)",
                        "notes": "Dual checkpoint blockade synergistic in restoring cytotoxic CD8+ and NK-cell anti-tumor function."
                    }
                ]
            },
            {
                "email": "sarah.jenkins@amgen-discovery.com",
                "full_name": "Dr. Sarah Jenkins, PhD",
                "role": "Senior Bioinformatician",
                "organization": "Amgen Synthetic Biology Hub",
                "avatar_color": "#EC4899", # Pink
                "history": [
                    {
                        "target_a": "CD19", "target_b": "CD3E",
                        "indication": "B-Cell Acute Lymphoblastic Leukemia",
                        "model_name": "XGBoost + Pairwise AI",
                        "compatibility_score": 0.9820,
                        "priority_tier": "Tier 1 (>90%)",
                        "double_positive_expr": "Very High (98.0%)",
                        "safety_score": "High (85.0%)",
                        "gene_similarity": "Low (0.15)",
                        "clinical_status": "Approved (Blinatumomab / Blincyto)",
                        "notes": "First-in-class CD19-directed BiTE establishing clinical proof-of-concept for synthetic immunological synapses."
                    },
                    {
                        "target_a": "PSMA", "target_b": "CD3E",
                        "indication": "Metastatic Castration-Resistant Prostate Cancer",
                        "model_name": "XGBoost + Pairwise AI",
                        "compatibility_score": 0.9380,
                        "priority_tier": "Tier 1 (>90%)",
                        "double_positive_expr": "High (92.4%)",
                        "safety_score": "High (87.1%)",
                        "gene_similarity": "Low (0.13)",
                        "clinical_status": "Phase 1/2 (Pasotuxizumab Class)",
                        "notes": "Prostate-specific membrane antigen redirection demonstrating targeted cytotoxicity in bone metastases."
                    },
                    {
                        "target_a": "MUC1", "target_b": "CD3E",
                        "indication": "Multiple Myeloma & NSCLC",
                        "model_name": "XGBoost + Pairwise AI",
                        "compatibility_score": 0.8350,
                        "priority_tier": "Tier 2 (75%–90%)",
                        "double_positive_expr": "High (81.2%)",
                        "safety_score": "High (83.0%)",
                        "gene_similarity": "Low (0.10)",
                        "clinical_status": "Phase 1 Preclinical",
                        "notes": "Tumor-associated hypoglycosylated MUC1-C epitope targeting to avoid normal epithelial binding."
                    }
                ]
            }
        ]

        for u in researchers:
            pwd_hash, salt = hash_password(default_pwd)
            cursor.execute("""
            INSERT INTO users (email, password_hash, password_salt, full_name, role, organization, avatar_color)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (u["email"], pwd_hash, salt, u["full_name"], u["role"], u["organization"], u["avatar_color"]))
            user_id = cursor.lastrowid

            for h in u["history"]:
                cursor.execute("""
                INSERT INTO research_history (
                    user_id, target_a, target_b, indication, model_name,
                    compatibility_score, priority_tier, double_positive_expr,
                    safety_score, gene_similarity, clinical_status, notes
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    user_id, h["target_a"], h["target_b"], h["indication"], h["model_name"],
                    h["compatibility_score"], h["priority_tier"], h["double_positive_expr"],
                    h["safety_score"], h["gene_similarity"], h["clinical_status"], h["notes"]
                ))
        conn.commit()
        print("[+] 5 Researcher accounts and 16 research screening records pre-seeded successfully.")

    conn.close()


def _issue_session_token(user_row: sqlite3.Row) -> Dict[str, Any]:
    """Create a persistent cryptographic session token and return the user profile dict."""
    token = secrets.token_urlsafe(32)
    uname = user_row["username"] if "username" in user_row.keys() and user_row["username"] else user_row["email"].split("@")[0]
    user_dict = {
        "id": user_row["id"],
        "username": uname,
        "email": user_row["email"],
        "full_name": user_row["full_name"],
        "role": user_row["role"],
        "organization": user_row["organization"],
        "avatar_color": user_row["avatar_color"]
    }
    ACTIVE_TOKENS[token] = user_dict
    try:
        conn = get_db_connection()
        conn.execute("INSERT OR REPLACE INTO user_sessions (token, user_id) VALUES (?, ?)", (token, user_row["id"]))
        conn.commit()
        conn.close()
    except Exception:
        pass
    user_dict["token"] = token
    return user_dict


def authenticate_user(identifier: str, password: str) -> Optional[Dict[str, Any]]:
    """
    Authenticate a researcher by work email OR username + password (PBKDF2-HMAC-SHA256).
    Returns user dict with session token if successful, or None if invalid.
    """
    ident = (identifier or "").strip()
    if not ident or not password:
        return None

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT * FROM users WHERE LOWER(email) = LOWER(?) OR LOWER(username) = LOWER(?) OR LOWER(full_name) = LOWER(?)",
        (ident, ident, ident)
    )
    user = cursor.fetchone()
    conn.close()

    if not user:
        return None

    if verify_password(password, user["password_hash"], user["password_salt"]):
        return _issue_session_token(user)
    return None


def register_user(
    email: str,
    password: str,
    full_name: str,
    username: Optional[str] = None,
    role: str = "Senior Oncology Scientist",
    organization: str = "BiSpec Therapeutics Consortium"
) -> Dict[str, Any]:
    """
    Register a new user in SQLite users_history.db with PBKDF2-HMAC-SHA256 hashed password.
    Raises ValueError if email or username is already registered or inputs are invalid.
    """
    clean_email = (email or "").strip().lower()
    clean_name = (full_name or "").strip()
    clean_uname = (username or "").strip() or clean_email.split("@")[0]
    clean_role = (role or "Senior Oncology Scientist").strip()
    clean_org = (organization or "BiSpec Therapeutics Consortium").strip()

    if not clean_email or "@" not in clean_email:
        raise ValueError("Please provide a valid institutional or work email address.")
    if not clean_name or len(clean_name) < 2:
        raise ValueError("Please provide your full name or investigator username.")
    if not password or len(password) < 6:
        raise ValueError("Password must be at least 6 characters long.")

    conn = get_db_connection()
    cursor = conn.cursor()

    # Check if email or username already exists
    cursor.execute(
        "SELECT id, email, username FROM users WHERE LOWER(email) = LOWER(?) OR LOWER(username) = LOWER(?)",
        (clean_email, clean_uname)
    )
    existing = cursor.fetchone()
    if existing:
        conn.close()
        if existing["email"].lower() == clean_email:
            raise ValueError(f"An account with email '{clean_email}' is already registered.")
        raise ValueError(f"Username '{clean_uname}' is already taken. Please choose another.")

    palette = ["#10B981", "#3B82F6", "#8B5CF6", "#F59E0B", "#EC4899", "#14B8A6"]
    avatar_color = palette[ secrets.randbelow(len(palette)) ]
    pwd_hash, salt = hash_password(password)

    cursor.execute("""
    INSERT INTO users (username, email, password_hash, password_salt, full_name, role, organization, avatar_color)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (clean_uname, clean_email, pwd_hash, salt, clean_name, clean_role, clean_org, avatar_color))
    new_user_id = cursor.lastrowid

    # Seed 2 baseline validated screenings for the newly registered researcher
    cursor.execute("""
    INSERT INTO research_history (
        user_id, target_a, target_b, indication, model_name,
        compatibility_score, priority_tier, double_positive_expr,
        safety_score, gene_similarity, clinical_status, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        new_user_id, "EGFR", "MET", "Non-Small Cell Lung Cancer", "XGBoost + Pairwise AI",
        0.8180, "Tier 2 (75%–90%)", "High (86.4%)", "High (88.0%)", "Medium (0.42)",
        "Approved (Amivantamab)", "Initial workspace benchmark combination seeded upon investigator registration."
    ))
    conn.commit()

    cursor.execute("SELECT * FROM users WHERE id = ?", (new_user_id,))
    new_user_row = cursor.fetchone()
    conn.close()

    return _issue_session_token(new_user_row)


def get_user_by_token(token: str) -> Optional[Dict[str, Any]]:
    """Get active user by session token (checks in-memory cache and SQLite user_sessions table)."""
    if not token:
        return None
    if token in ACTIVE_TOKENS:
        return ACTIVE_TOKENS[token]
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
        SELECT u.* FROM users u
        JOIN user_sessions s ON u.id = s.user_id
        WHERE s.token = ?
        """, (token,))
        row = cursor.fetchone()
        conn.close()
        if row:
            uname = row["username"] if "username" in row.keys() and row["username"] else row["email"].split("@")[0]
            user_dict = {
                "id": row["id"],
                "username": uname,
                "email": row["email"],
                "full_name": row["full_name"],
                "role": row["role"],
                "organization": row["organization"],
                "avatar_color": row["avatar_color"],
                "token": token
            }
            ACTIVE_TOKENS[token] = user_dict
            return user_dict
    except Exception:
        pass
    return None


def revoke_session_token(token: str) -> bool:
    """Revoke a session token from both in-memory cache and SQLite user_sessions."""
    if not token:
        return False
    removed = token in ACTIVE_TOKENS
    ACTIVE_TOKENS.pop(token, None)
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM user_sessions WHERE token = ?", (token,))
        if cursor.rowcount > 0:
            removed = True
        conn.commit()
        conn.close()
    except Exception:
        pass
    return removed


def get_demo_users() -> List[Dict[str, Any]]:
    """Return public demo user profiles for the 1-click credentials selector."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id, email, full_name, role, organization, avatar_color FROM users ORDER BY id ASC")
    users = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return users


def get_user_research_history(user_id: int) -> List[Dict[str, Any]]:
    """Fetch all past screenings saved for a researcher."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT * FROM research_history WHERE user_id = ? ORDER BY id DESC
    """, (user_id,))
    history = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return history


def save_research_screening(
    user_id: int,
    target_a: str,
    target_b: str,
    indication: str,
    model_name: str,
    compatibility_score: float,
    priority_tier: str,
    double_positive_expr: Optional[str] = None,
    safety_score: Optional[str] = None,
    gene_similarity: Optional[str] = None,
    clinical_status: Optional[str] = None,
    notes: Optional[str] = None
) -> Dict[str, Any]:
    """Save a newly executed screening run to user's history."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO research_history (
        user_id, target_a, target_b, indication, model_name,
        compatibility_score, priority_tier, double_positive_expr,
        safety_score, gene_similarity, clinical_status, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        user_id, target_a.upper().strip(), target_b.upper().strip(),
        indication.strip(), model_name.strip(), float(compatibility_score),
        priority_tier.strip(), double_positive_expr, safety_score,
        gene_similarity, clinical_status, notes
    ))
    new_id = cursor.lastrowid
    conn.commit()
    cursor.execute("SELECT * FROM research_history WHERE id = ?", (new_id,))
    row = dict(cursor.fetchone())
    conn.close()
    return row


def delete_research_screening(screening_id: int, user_id: int) -> bool:
    """Delete a screening run belonging to user."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM research_history WHERE id = ? AND user_id = ?", (screening_id, user_id))
    affected = cursor.rowcount
    conn.commit()
    conn.close()
    return affected > 0


# Initialize database upon import
init_db()
