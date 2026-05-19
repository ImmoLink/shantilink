"""
core.py — Shared utilities, DB setup, auth helpers, and constants for ShantiLink.

All routers import from here. main.py also imports from here for backward
compatibility during the refactoring transition.
"""
import os
import re
import uuid
import hashlib
import hmac
import base64
import json
import time
import random
from datetime import datetime
from typing import Optional

from fastapi import Depends, HTTPException, Request
from sqlalchemy import create_engine, text

# ── Logger ────────────────────────────────────────────────────────────────────
try:
    from loguru import logger
    logger.add("logs/shantilink.log", rotation="10 MB", retention="30 days", level="INFO", enqueue=True)
except ImportError:
    import logging as _logging
    logger = _logging.getLogger("shantilink")
    _logging.basicConfig(level=_logging.INFO)

# ── Cloudinary (optional) ─────────────────────────────────────────────────────
try:
    import cloudinary
    import cloudinary.uploader
    _CLOUDINARY_OK = bool(
        os.environ.get("CLOUDINARY_CLOUD_NAME") and
        os.environ.get("CLOUDINARY_API_KEY") and
        os.environ.get("CLOUDINARY_API_SECRET")
    )
    if _CLOUDINARY_OK:
        cloudinary.config(
            cloud_name=os.environ.get("CLOUDINARY_CLOUD_NAME"),
            api_key=os.environ.get("CLOUDINARY_API_KEY"),
            api_secret=os.environ.get("CLOUDINARY_API_SECRET"),
            secure=True
        )
except ImportError:
    _CLOUDINARY_OK = False

# ── Anthropic agent config ────────────────────────────────────────────────────
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
AGENT_MODEL = "claude-sonnet-4-5"
AGENT_RATE_LIMIT = 30  # max actions per user per hour

# ── Freemium plan system ──────────────────────────────────────────────────────
PLAN_LIMITS = {
    "starter":  {"projects": 3,    "pdf_month": 3,    "team": 0,    "ai": False},
    "pro":      {"projects": None, "pdf_month": None, "team": 5,    "ai": True},
    "business": {"projects": None, "pdf_month": None, "team": None, "ai": True},
}
PLAN_PRICES = {"starter": 0, "pro": 199, "business": 499}

# ── Config ────────────────────────────────────────────────────────────────────
_ENV = os.environ.get("ENV", "dev")
SECRET_KEY = os.environ.get("SHANTILINK_SECRET", "shantilink-dev-secret-2025-xK9m")
if _ENV == "prod" and not os.environ.get("SHANTILINK_SECRET"):
    raise RuntimeError("SHANTILINK_SECRET must be set in production. Set ENV=dev to bypass.")
TOKEN_HOURS = 24
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
UPLOADS_DIR = os.path.join(STATIC_DIR, "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)

# ── Database setup ────────────────────────────────────────────────────────────
DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    _db_path = os.path.join(os.path.dirname(__file__), "shantilink.db")
    DATABASE_URL = f"sqlite:///{_db_path}"

# Render/Heroku expose postgres:// but SQLAlchemy requires postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

_is_sqlite = DATABASE_URL.startswith("sqlite")
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if _is_sqlite else {},
    pool_pre_ping=True,
    pool_recycle=280,
)

ALLOWED_ORIGINS = (
    [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]
    if os.environ.get("ALLOWED_ORIGINS")
    else ["http://localhost:3000", "http://localhost:8000", "http://localhost:19006"]
)


def get_db():
    conn = engine.connect()
    if _is_sqlite:
        conn.execute(text("PRAGMA foreign_keys = ON"))
        conn.execute(text("PRAGMA journal_mode = WAL"))
    return conn


def sql_params(sql: str, params=()):
    """Convert sqlite3 positional ? placeholders to SQLAlchemy :p0, :p1 named params."""
    if not params:
        return text(sql), {}
    named: dict = {}
    idx = 0

    def _repl(m):
        nonlocal idx
        key = f"p{idx}"
        named[key] = params[idx]
        idx += 1
        return f":{key}"

    converted = re.sub(r'\?', _repl, sql)
    return text(converted), named


def now_iso():
    return datetime.utcnow().isoformat()


def uid():
    return uuid.uuid4().hex[:14]


def _run_migration(sql: str):
    """Run a single DDL statement in its own connection/transaction (safe to fail)."""
    try:
        with engine.connect() as mc:
            mc.execute(text(sql))
            mc.commit()
    except Exception as e:
        msg = str(e).lower()
        if "duplicate column" not in msg and "already exists" not in msg:
            print(f"[migration] {sql[:80]!r} → {e}")


# ── Auth helpers ──────────────────────────────────────────────────────────────
try:
    from argon2 import PasswordHasher as _PH
    from argon2.exceptions import VerifyMismatchError as _VME, VerificationError as _VE
    _ph = _PH(time_cost=3, memory_cost=65536, parallelism=2)
    _ARGON2_OK = True
except ImportError:
    _ARGON2_OK = False


def hash_password(password: str) -> str:
    if _ARGON2_OK:
        return _ph.hash(password)
    salt = os.urandom(32).hex()
    key = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 100_000).hex()
    return f"pbkdf2:{salt}:{key}"


def verify_password(password: str, stored: str) -> bool:
    """Returns True if password matches stored hash. Accepts Argon2 and legacy PBKDF2."""
    try:
        if _ARGON2_OK and stored.startswith("$argon2"):
            try:
                return _ph.verify(stored, password)
            except (_VME, _VE):
                return False
        parts = stored.split(":")
        if parts[0] == "pbkdf2":
            salt_hex, key_hex = parts[1], parts[2]
        else:
            salt_hex, key_hex = parts[0], parts[1]
        key = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), 100_000).hex()
        return hmac.compare_digest(key, key_hex)
    except Exception:
        return False


def _needs_rehash(stored: str) -> bool:
    """True when stored hash is legacy PBKDF2 and Argon2 is available."""
    return _ARGON2_OK and not stored.startswith("$argon2")


# ── CMP-03: GPS encryption (AES-GCM) ─────────────────────────────────────────
try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM as _AESGCM
    _GPS_RAW_KEY = os.environ.get("GPS_ENCRYPT_KEY", "")
    if _GPS_RAW_KEY:
        _gps_key = hashlib.sha256(_GPS_RAW_KEY.encode()).digest()
    else:
        _gps_key = hashlib.sha256(("gps:" + SECRET_KEY).encode()).digest()
    _GPS_ENC = True
except ImportError:
    _GPS_ENC = False


def encrypt_gps(gps: str) -> str:
    """Encrypt GPS string with AES-256-GCM. Returns base64-encoded nonce+ciphertext."""
    if not gps or not _GPS_ENC:
        return gps
    nonce = os.urandom(12)
    ct = _AESGCM(_gps_key).encrypt(nonce, gps.encode(), None)
    return "enc:" + base64.urlsafe_b64encode(nonce + ct).decode()


def decrypt_gps(stored: str) -> str:
    """Decrypt AES-GCM encrypted GPS. Returns plain GPS or original if not encrypted."""
    if not stored or not stored.startswith("enc:") or not _GPS_ENC:
        return stored
    try:
        raw = base64.urlsafe_b64decode(stored[4:])
        nonce, ct = raw[:12], raw[12:]
        return _AESGCM(_gps_key).decrypt(nonce, ct, None).decode()
    except Exception:
        return stored


def create_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email, "exp": time.time() + TOKEN_HOURS * 3600}
    payload_b64 = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    sig = hmac.new(SECRET_KEY.encode(), payload_b64.encode(), hashlib.sha256).hexdigest()
    return f"{payload_b64}.{sig}"


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def verify_token(token: str) -> dict:
    try:
        payload_b64, sig = token.rsplit(".", 1)
        expected = hmac.new(SECRET_KEY.encode(), payload_b64.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            raise ValueError("bad sig")
        padding = "=" * (4 - len(payload_b64) % 4)
        payload = json.loads(base64.urlsafe_b64decode(payload_b64 + padding).decode())
        if payload["exp"] < time.time():
            raise ValueError("expired")
        th = _token_hash(token)
        try:
            conn = get_db()
            revoked = conn.execute(*sql_params("SELECT 1 FROM revoked_tokens WHERE token_hash=?", [th])).fetchone()
            conn.close()
            if revoked:
                raise ValueError("revoked")
        except HTTPException:
            raise
        except Exception:
            pass
        return payload
    except (HTTPException, ValueError):
        raise HTTPException(status_code=401, detail="Token invalide ou expiré")


def get_current_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    if not auth:
        cookie_token = request.cookies.get("sl_auth", "")
        if cookie_token:
            auth = "Bearer " + cookie_token
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Non authentifié")
    return verify_token(auth[7:])


def log_activity(conn, user_id: str, msg: str):
    conn.execute(
        text("INSERT INTO activities (id,user_id,msg,created_at) VALUES (:id,:uid,:msg,:at)"),
        {"id": "a" + uid(), "uid": user_id, "msg": msg, "at": now_iso()}
    )


def push_notification(conn, user_id: str, ntype: str, title: str, body_text: str = None, link: str = None):
    conn.execute(text(
        "INSERT INTO notifications (user_id,type,title,body,link,read,created_at) "
        "VALUES (:uid,:type,:title,:body,:link,0,datetime('now'))"
    ), {"uid": user_id, "type": ntype, "title": title, "body": body_text, "link": link})


def require_admin(user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        row = conn.execute(*sql_params("SELECT role FROM users WHERE id=?", [user["sub"]])).fetchone()
        if not row or row[0] != "admin":
            raise HTTPException(403, "Accès réservé aux administrateurs")
        return user
    finally:
        conn.close()


def init_db():
    """Create all tables, run migrations, seed data."""
    tables = [
        """CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY, prenom TEXT NOT NULL, nom TEXT DEFAULT '',
            email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
            role TEXT DEFAULT 'client', ville TEXT DEFAULT '', tel TEXT DEFAULT '',
            created_at TEXT)""",
        """CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY, user_id TEXT NOT NULL, nom TEXT NOT NULL,
            ville TEXT DEFAULT '', budget INTEGER DEFAULT 0,
            type TEXT DEFAULT 'Villa / Maison individuelle', etages INTEGER DEFAULT 0,
            description TEXT DEFAULT '', pct INTEGER DEFAULT 0,
            phases TEXT DEFAULT '', created_at TEXT)""",
        """CREATE TABLE IF NOT EXISTS expenses (
            id TEXT PRIMARY KEY, user_id TEXT NOT NULL, project_id TEXT DEFAULT NULL,
            description TEXT NOT NULL, montant REAL NOT NULL,
            categorie TEXT DEFAULT 'Autre', date TEXT, deleted INTEGER DEFAULT 0)""",
        """CREATE TABLE IF NOT EXISTS photos (
            id TEXT PRIMARY KEY, user_id TEXT NOT NULL, description TEXT NOT NULL,
            date TEXT, phase TEXT DEFAULT 'Fondations', emoji TEXT DEFAULT '🏗️',
            gps TEXT DEFAULT '33.57N, 7.59W', image_url TEXT DEFAULT '')""",
        """CREATE TABLE IF NOT EXISTS professionals (
            id INTEGER PRIMARY KEY, nom TEXT NOT NULL, role TEXT, ville TEXT,
            lat REAL, lng REAL, note REAL DEFAULT 0, avis INTEGER DEFAULT 0,
            verified INTEGER DEFAULT 1, description TEXT, emoji TEXT, tel TEXT)""",
        """CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY, user_id TEXT NOT NULL, professional_id INTEGER NOT NULL,
            content TEXT NOT NULL, from_user INTEGER DEFAULT 1, created_at TEXT)""",
        """CREATE TABLE IF NOT EXISTS activities (
            id TEXT PRIMARY KEY, user_id TEXT NOT NULL, msg TEXT NOT NULL, created_at TEXT)""",
        """CREATE TABLE IF NOT EXISTS contacts (
            id TEXT PRIMARY KEY, prenom TEXT, nom TEXT, email TEXT,
            role TEXT, message TEXT, created_at TEXT)""",
        """CREATE TABLE IF NOT EXISTS community_posts (
            id TEXT PRIMARY KEY, user_id TEXT NOT NULL, content TEXT NOT NULL,
            category TEXT DEFAULT 'update', likes INTEGER DEFAULT 0, created_at TEXT)""",
        """CREATE TABLE IF NOT EXISTS community_ratings (
            id TEXT PRIMARY KEY, rater_id TEXT NOT NULL, rated_pro_id INTEGER,
            rating INTEGER, comment TEXT DEFAULT '', created_at TEXT)""",
        """CREATE TABLE IF NOT EXISTS agent_audit_log (
            id TEXT PRIMARY KEY, user_id TEXT NOT NULL, action TEXT NOT NULL,
            parameters TEXT DEFAULT '{}', result TEXT DEFAULT '{}',
            user_message TEXT DEFAULT '', created_at TEXT)""",
        """CREATE TABLE IF NOT EXISTS agent_rate_limit (
            user_id TEXT PRIMARY KEY, count INTEGER DEFAULT 0, window_start TEXT DEFAULT '')""",
        """CREATE TABLE IF NOT EXISTS revoked_tokens (
            token_hash TEXT PRIMARY KEY, revoked_at TEXT NOT NULL)""",
        """CREATE TABLE IF NOT EXISTS project_briefs (
            id TEXT PRIMARY KEY, user_id TEXT NOT NULL, titre TEXT NOT NULL,
            description TEXT DEFAULT '', ville TEXT DEFAULT '',
            categorie TEXT DEFAULT 'entrepreneur', budget_min INTEGER DEFAULT 0,
            budget_max INTEGER DEFAULT 0, deadline TEXT DEFAULT '',
            status TEXT DEFAULT 'open', created_at TEXT)""",
        """CREATE TABLE IF NOT EXISTS brief_responses (
            id TEXT PRIMARY KEY, brief_id TEXT NOT NULL, pro_user_id TEXT NOT NULL,
            message TEXT NOT NULL, prix INTEGER DEFAULT 0, delai TEXT DEFAULT '',
            status TEXT DEFAULT 'pending', created_at TEXT)""",
        """CREATE TABLE IF NOT EXISTS referrals (
            id TEXT PRIMARY KEY, referrer_id TEXT NOT NULL, referred_email TEXT NOT NULL,
            referred_user_id TEXT DEFAULT '', status TEXT DEFAULT 'pending', created_at TEXT)""",
        """CREATE TABLE IF NOT EXISTS pro_reviews (
            id TEXT PRIMARY KEY, reviewer_id TEXT NOT NULL, pro_user_id TEXT DEFAULT '',
            pro_catalog_id INTEGER DEFAULT 0, project_id TEXT DEFAULT '',
            rating INTEGER NOT NULL, comment TEXT DEFAULT '', created_at TEXT)""",
        """CREATE TABLE IF NOT EXISTS founder_badges (
            user_id TEXT PRIMARY KEY, badge_number INTEGER NOT NULL, created_at TEXT)""",
        """CREATE TABLE IF NOT EXISTS user_chats (
            id TEXT PRIMARY KEY, sender_id TEXT NOT NULL, recipient_id TEXT NOT NULL,
            content TEXT NOT NULL, read_at TEXT DEFAULT '', created_at TEXT)""",
    ]
    for stmt in tables:
        _run_migration(stmt)

    for migration in [
        "ALTER TABLE users ADD COLUMN referral_code TEXT DEFAULT ''",
        "ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'",
        "ALTER TABLE users ADD COLUMN bio TEXT DEFAULT ''",
        "ALTER TABLE users ADD COLUMN photo_url TEXT DEFAULT ''",
        "ALTER TABLE users ADD COLUMN is_verified INTEGER DEFAULT 0",
        "ALTER TABLE photos ADD COLUMN image_url TEXT DEFAULT ''",
        "ALTER TABLE projects ADD COLUMN phases TEXT DEFAULT ''",
        "ALTER TABLE projects ADD COLUMN etages INTEGER DEFAULT 0",
        "ALTER TABLE expenses ADD COLUMN project_id TEXT DEFAULT NULL",
        "ALTER TABLE expenses ADD COLUMN deleted INTEGER DEFAULT 0",
        "ALTER TABLE users ADD COLUMN plan TEXT DEFAULT 'starter'",
        "ALTER TABLE users ADD COLUMN plan_expires TEXT DEFAULT ''",
        "ALTER TABLE community_posts ADD COLUMN titre TEXT DEFAULT ''",
        "ALTER TABLE community_posts ADD COLUMN tags TEXT DEFAULT '[]'",
        "ALTER TABLE community_posts ADD COLUMN est_epingle INTEGER DEFAULT 0",
        "ALTER TABLE community_posts ADD COLUMN media_url TEXT DEFAULT ''",
        "ALTER TABLE community_posts ADD COLUMN media_urls TEXT DEFAULT '[]'",
        "ALTER TABLE project_briefs ADD COLUMN brief_type TEXT DEFAULT 'demand'",
        "ALTER TABLE brief_responses ADD COLUMN conditions TEXT DEFAULT ''",
        "ALTER TABLE brief_responses ADD COLUMN phases TEXT DEFAULT NULL",
        "ALTER TABLE brief_responses ADD COLUMN attachment_url TEXT DEFAULT ''",
        "ALTER TABLE users ADD COLUMN mre_country TEXT DEFAULT ''",
        "ALTER TABLE users ADD COLUMN mre_verified INTEGER DEFAULT 0",
        "ALTER TABLE users ADD COLUMN mre_document TEXT DEFAULT ''",
        "ALTER TABLE projects ADD COLUMN share_token TEXT DEFAULT ''",
        "ALTER TABLE users ADD COLUMN ice TEXT",
        "ALTER TABLE users ADD COLUMN cnss TEXT",
        "ALTER TABLE users ADD COLUMN rc TEXT",
        "ALTER TABLE users ADD COLUMN rib TEXT",
        "ALTER TABLE users ADD COLUMN company_name TEXT",
        "ALTER TABLE users ADD COLUMN company_address TEXT",
        "ALTER TABLE users ADD COLUMN arc_badge TEXT",
        "ALTER TABLE users ADD COLUMN arc_number TEXT",
        "ALTER TABLE professionals ADD COLUMN arc_badge TEXT",
        "ALTER TABLE projects ADD COLUMN programme_id INTEGER",
    ]:
        _run_migration(migration)

    _run_migration("""CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT,
        link TEXT,
        read INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
    )""")

    _run_migration("""CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER,
        uploaded_by TEXT NOT NULL,
        filename TEXT NOT NULL,
        url TEXT NOT NULL,
        category TEXT DEFAULT 'other',
        shared_with TEXT,
        created_at TEXT DEFAULT (datetime('now'))
    )""")

    _run_migration("""CREATE TABLE IF NOT EXISTS promoter_team (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        promoter_id TEXT NOT NULL,
        member_email TEXT NOT NULL,
        role TEXT DEFAULT 'viewer',
        invited_at TEXT DEFAULT (datetime('now'))
    )""")

    _run_migration("""CREATE TABLE IF NOT EXISTS programmes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        promoter_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        created_at TEXT DEFAULT (datetime('now'))
    )""")

    for idx in [
        "CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)",
        "CREATE INDEX IF NOT EXISTS idx_users_role_ville ON users(role, ville)",
        "CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_expenses_user_project ON expenses(user_id, project_id)",
        "CREATE INDEX IF NOT EXISTS idx_photos_user_id ON photos(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_messages_user_pro ON messages(user_id, professional_id)",
        "CREATE INDEX IF NOT EXISTS idx_posts_created ON community_posts(created_at)",
    ]:
        _run_migration(idx)

    # Backfill referral codes & seed data
    try:
        conn = get_db()
    except Exception as e:
        print(f"[init_db] DB connection failed, skipping seed/backfill: {e}")
        return
    try:
        rows = conn.execute(text(
            "SELECT id FROM users WHERE referral_code='' OR referral_code IS NULL"
        )).fetchall()
        for row in rows:
            code = "SL" + row[0][-6:].upper()
            conn.execute(*sql_params("UPDATE users SET referral_code=? WHERE id=?", [code, row[0]]))
        conn.commit()

        count = conn.execute(text("SELECT COUNT(*) FROM professionals")).fetchone()[0]
        if count < 80:
            _seed_professionals(conn)

        post_count = conn.execute(text("SELECT COUNT(*) FROM community_posts")).fetchone()[0]
        if post_count == 0:
            _seed_community_posts(conn)

        conn.commit()
    finally:
        conn.close()

    # CMP-06: auto-purge audit log > 90j
    try:
        from datetime import timedelta
        _cutoff = (datetime.utcnow() - timedelta(days=90)).isoformat()
        _pconn = get_db()
        _pconn.execute(*sql_params("DELETE FROM agent_audit_log WHERE created_at < ?", [_cutoff]))
        _pconn.commit()
        _pconn.close()
    except Exception:
        pass


def _seed_professionals(conn):
    """Seed the professionals table with 82 entries."""
    conn.execute(text("DELETE FROM professionals"))
    pros = [
        (1,"Alaoui Construction","entrepreneur","Casablanca",33.5731,-7.5898,4.8,47,1,"Entrepreneur général spécialisé villas et immeubles R+1 à R+5. 18 ans d'expérience sur Casablanca et région.","🏗️","+212 661 234 567"),
        (2,"Mansouri BTP","entrepreneur","Casablanca",33.5850,-7.6050,4.7,38,1,"Gros œuvre, maçonnerie et finitions tous corps d'état. Projets résidentiels et commerciaux sur Casablanca.","🏗️","+212 662 112 334"),
        (3,"Benbrahim Constructions","entrepreneur","Rabat",34.0209,-6.8417,4.6,29,1,"Entreprise générale de bâtiment basée à Rabat. Villas individuelles, extensions et rénovations.","🏗️","+212 663 445 566"),
        (4,"Atlas Construction","entrepreneur","Marrakech",31.6295,-7.9811,4.7,34,1,"Construction villas haut standing et riads à Marrakech. Spécialiste architecture traditionnelle marocaine.","🏗️","+212 664 778 899"),
        (5,"Berrada & Fils BTP","entrepreneur","Fes",34.0181,-5.0078,4.7,31,1,"Entreprise familiale 3e génération, Fès. Gros œuvre, ravalement façades, réhabilitation médina.","🏗️","+212 665 667 788"),
        (6,"Souss Bâtisseurs","entrepreneur","Agadir",30.4278,-9.5981,4.6,26,1,"Construction tous types de bâtiments résidentiels à Agadir et région du Souss-Massa.","🏗️","+212 668 901 234"),
        (7,"Rifi Construction","entrepreneur","Oujda",34.6814,-1.9086,4.7,21,1,"Entrepreneur local Oujda, gros œuvre et finitions, références solides dans la région orientale.","🏗️","+212 660 123 456"),
        (8,"Tanger Constructions","entrepreneur","Tanger",35.7595,-5.8340,4.5,19,1,"Projets résidentiels et commerciaux à Tanger et Tétouan. Entreprise agréée, garantie décennale.","🏗️","+212 661 556 677"),
        (9,"Meknès Travaux","entrepreneur","Meknes",33.8935,-5.5473,4.5,17,1,"Entrepreneur général basé à Meknès. Villas, immeubles R+2, rénovations et extensions.","🏗️","+212 669 012 345"),
        (10,"El Jadida Construction","entrepreneur","El Jadida",33.2316,-8.5007,4.4,14,1,"Construction et rénovation à El Jadida et Azemmour. Spécialiste maisons bord de mer et villas.","🏗️","+212 663 334 455"),
        (21,"Cabinet Tahiri","architecte","Rabat",34.0209,-6.8417,4.6,18,1,"Cabinet d'architecture moderne à Rabat. Plans, permis de construire, suivi de chantier, réception.","📐","+212 662 345 678"),
        (22,"Atelier Filali Architecture","architecte","Casablanca",33.5780,-7.6100,4.9,52,1,"Architecte DPLG à Casablanca. Villas contemporaines, immeubles, bureaux et projets commerciaux haut standing.","📐","+212 661 789 900"),
        (23,"Studio Marrakchia","architecte","Marrakech",31.6250,-7.9900,4.7,36,1,"Cabinet d'architecture à Marrakech. Conception riads, villas, hôtels boutique, fusion moderne/traditionnel.","📐","+212 664 556 678"),
        (36,"Electro Pro Tanger","electricien","Tanger",35.7595,-5.8340,4.5,14,1,"Électricien certifié à Tanger. Installation complète courant fort, faible, domotique, alarme.","⚡","+212 664 567 890"),
        (39,"Spark Electric Casablanca","electricien","Casablanca",33.5900,-7.6200,4.7,28,1,"Électricien à Casablanca. Installation et mise aux normes, tableaux RGIE, courant faible, fibre optique.","⚡","+212 661 890 012"),
        (47,"Plomberie Fassie","plombier","Fes",34.0181,-5.0078,4.7,19,1,"Plombier à Fès. Sanitaires, chauffage central, climatisation, traitement eau, détection fuites.","🔧","+212 665 678 901"),
        (48,"Bensouda Plomberie","plombier","Casablanca",33.5850,-7.6050,4.5,13,1,"Plombier général à Casablanca. Sanitaires, chauffage central au gaz, climatisation, dépannage urgent.","🔧","+212 664 567 891"),
        (57,"BET Maroc Ingénierie","bureau","Marrakech",31.6295,-7.9811,4.9,31,1,"Bureau d'études structures béton armé à Marrakech. Notes de calcul sismiques, supervision chantier.","📊","+212 663 456 789"),
        (58,"Cabinet Lazraq BET","bureau","Casablanca",33.5600,-7.6300,4.8,35,1,"Bureau d'études tout corps d'état à Casablanca. Structures, VRD, fluides, contrôle technique.","📊","+212 662 345 679"),
        (67,"Benali Comptabilite BTP","comptable","Casablanca",33.5950,-7.6187,4.4,11,1,"Expert-comptable spécialisé BTP à Casablanca. Gestion budgets chantiers, déclarations fiscales, liasse.","💼","+212 666 789 012"),
        (75,"Maitre Alami","notaire","Rabat",34.0132,-6.8326,4.8,27,1,"Notaire à Rabat. Actes de vente immobilière, permis construire, hypothèques, successions.","⚖️","+212 667 890 123"),
        (76,"Tahiri & Associes","notaire","Casablanca",33.5780,-7.5950,4.7,22,1,"Étude notariale à Casablanca. Transactions immobilières, contrats BTP, partages et successions.","⚖️","+212 665 678 902"),
        (77,"Etude Benali Notaire","notaire","Marrakech",31.6280,-7.9820,4.6,19,1,"Notaire à Marrakech. Actes VEFA, copropriété, lotissements, transactions riads et villas.","⚖️","+212 664 223 445"),
        (80,"Maitre Rachidi","notaire","Agadir",30.4300,-9.5950,4.6,18,1,"Notaire à Agadir. Actes de vente, lotissements, copropriété, successions et donations.","⚖️","+212 668 667 889"),
    ]
    _fields = ["id","nom","role","ville","lat","lng","note","avis","verified","description","emoji","tel"]
    _ins = text("INSERT INTO professionals (id,nom,role,ville,lat,lng,note,avis,verified,description,emoji,tel) VALUES (:id,:nom,:role,:ville,:lat,:lng,:note,:avis,:verified,:description,:emoji,:tel)")
    for p in pros:
        conn.execute(_ins, dict(zip(_fields, p)))


def _seed_community_posts(conn):
    """Seed initial community posts."""
    seed_user_id = "system-seed"
    sys_user = conn.execute(*sql_params("SELECT id FROM users WHERE id=?", [seed_user_id])).fetchone()
    if not sys_user:
        conn.execute(*sql_params(
            "INSERT INTO users (id,prenom,nom,email,password_hash,role,created_at) VALUES (?,?,?,?,?,?,?)",
            [seed_user_id, "ShantiLink", "Équipe", "team@shantilink.ma", hash_password(uid()), "admin", now_iso()]
        ))
    seed_posts = [
        ("Bienvenue sur la communauté ShantiLink", "Bienvenue sur la communauté ShantiLink — l'espace des professionnels et clients du BTP au Maroc.", "annonce", '["annonce"]', 1, ""),
        ("Guide : Choisir un bon entrepreneur BTP au Maroc", "5 critères essentiels pour bien choisir votre entrepreneur BTP.", "conseil", '["conseil","client"]', 1, ""),
    ]
    for titre, content, category, tags, epingle, media_url in seed_posts:
        conn.execute(*sql_params(
            "INSERT INTO community_posts (id,user_id,content,titre,category,tags,est_epingle,likes,media_url,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
            ["cp" + uid(), seed_user_id, content, titre, category, tags, epingle, random.randint(3, 28), media_url, now_iso()]
        ))
