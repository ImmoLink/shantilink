from fastapi import FastAPI, HTTPException, Depends, Request, UploadFile, File, Form
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel
import re, uuid, os, hashlib, hmac, base64, json, time, random, shutil, asyncio
from datetime import datetime
from typing import Optional, List, Dict, Any
from sqlalchemy import create_engine, text

# ── Cloudinary (optionnel — uniquement si env vars définies) ──────────────────
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
            cloud_name = os.environ.get("CLOUDINARY_CLOUD_NAME"),
            api_key    = os.environ.get("CLOUDINARY_API_KEY"),
            api_secret = os.environ.get("CLOUDINARY_API_SECRET"),
            secure     = True
        )
except ImportError:
    _CLOUDINARY_OK = False

# ── Anthropic agent config ────────────────────────────────────────────────────
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
AGENT_MODEL = "claude-sonnet-4-6"
AGENT_RATE_LIMIT = 30   # max actions per user per hour

# ── Freemium plan system ───────────────────────────────────────────────────────
PLAN_LIMITS = {
    "starter":  {"projects": 3,    "pdf_month": 3,    "team": 0,    "ai": False},
    "pro":      {"projects": None, "pdf_month": None, "team": 5,    "ai": True},
    "business": {"projects": None, "pdf_month": None, "team": None, "ai": True},
}
PLAN_PRICES = {"starter": 0, "pro": 199, "business": 499}

# ── Config ────────────────────────────────────────────────────────────────────
SECRET_KEY = os.environ.get("SHANTILINK_SECRET", "shantilink-dev-secret-2025-xK9m")
TOKEN_HOURS = 72
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

def get_db():
    conn = engine.connect()
    if _is_sqlite:
        conn.execute(text("PRAGMA foreign_keys = ON"))
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
    except Exception:
        pass

def init_db():
    # ── Create tables (each in own transaction for safety) ───────────────────
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

    # ── Column migrations (safe to fail if column already exists) ────────────
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
    ]:
        _run_migration(migration)

    # ── Backfill referral codes ───────────────────────────────────────────────
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

        # ── Seed professionals if table is empty ─────────────────────────────
        count = conn.execute(text("SELECT COUNT(*) FROM professionals")).fetchone()[0]
        if count < 80:
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
                (11,"Kenitra Bâtiment","entrepreneur","Kenitra",34.2610,-6.5802,4.6,22,1,"Entreprise générale de construction à Kénitra. Gros œuvre, charpente, finitions clé en main.","🏗️","+212 664 556 677"),
                (12,"Settat Constructions","entrepreneur","Settat",33.0014,-7.6190,4.5,16,1,"Entrepreneur à Settat et Berrechid. Villas, R+2, fermes et bâtiments agricoles.","🏗️","+212 665 889 900"),
                (13,"Nador Bâtisseurs","entrepreneur","Nador",35.1683,-2.9302,4.4,13,1,"Construction résidentielle à Nador et Berkane. Maisons, duplex et petits immeubles.","🏗️","+212 666 112 233"),
                (14,"Sahara Build","entrepreneur","Laayoune",27.1253,-13.1625,4.3,10,1,"Entreprise spécialisée constructions dans le sud marocain. Adaptation aux contraintes climatiques.","🏗️","+212 668 334 455"),
                (15,"Sale Entreprise Générale","entrepreneur","Sale",34.0531,-6.7985,4.6,25,1,"Entreprise de construction à Salé. Villas et immeubles R+, lotissements résidentiels.","🏗️","+212 662 667 788"),
                (16,"Ouarzazate BTP","entrepreneur","Ouarzazate",30.9202,-6.9038,4.4,12,1,"Construction tout type à Ouarzazate. Spécialiste pisé, adobe et matériaux locaux pour projets touristiques.","🏗️","+212 661 889 900"),
                (17,"Mohammedia Build","entrepreneur","Mohammedia",33.6866,-7.3832,4.6,20,1,"Promoteur-constructeur à Mohammedia. Résidences balnéaires, villas et appartements.","🏗️","+212 663 223 344"),
                (18,"Beni Mellal BTP","entrepreneur","Beni Mellal",32.3373,-6.3498,4.4,15,1,"Construction et rénovation à Beni Mellal et Tadla. Maisons individuelles et immeubles collectifs.","🏗️","+212 664 445 566"),
                (19,"Safi Travaux","entrepreneur","Safi",32.2994,-9.2372,4.5,18,1,"Entrepreneur à Safi et Essaouira. Villas, riad et bâtiments industriels côte atlantique.","🏗️","+212 665 778 899"),
                (20,"Tetouan Construction","entrepreneur","Tetouan",35.5789,-5.3626,4.4,13,1,"Construction et réhabilitation à Tétouan et Martil. Villas, résidences secondaires et commerces.","🏗️","+212 661 334 556"),
                (21,"Cabinet Tahiri","architecte","Rabat",34.0209,-6.8417,4.6,18,1,"Cabinet d'architecture moderne à Rabat. Plans, permis de construire, suivi de chantier, réception.","📐","+212 662 345 678"),
                (22,"Atelier Filali Architecture","architecte","Casablanca",33.5780,-7.6100,4.9,52,1,"Architecte DPLG à Casablanca. Villas contemporaines, immeubles, bureaux et projets commerciaux haut standing.","📐","+212 661 789 900"),
                (23,"Studio Marrakchia","architecte","Marrakech",31.6250,-7.9900,4.7,36,1,"Cabinet d'architecture à Marrakech. Conception riads, villas, hôtels boutique, fusion moderne/traditionnel.","📐","+212 664 556 678"),
                (24,"Archi Fassia","architecte","Fes",34.0250,-5.0150,4.5,21,1,"Architecte à Fès. Spécialiste réhabilitation médina, permis de construire, plans architecturaux.","📐","+212 665 334 456"),
                (25,"Cabinet Benomar","architecte","Tanger",35.7650,-5.8450,4.6,27,1,"Architecte DPLG à Tanger. Villas bord de mer, immeubles résidentiels, équipements collectifs.","📐","+212 661 667 889"),
                (26,"Atlas Architecture Agadir","architecte","Agadir",30.4150,-9.6050,4.5,19,1,"Cabinet d'architecture à Agadir. Résidences touristiques, villas, commerces et hôtels du Souss.","📐","+212 668 789 900"),
                (27,"Atelier Zouaghi","architecte","Meknes",33.8900,-5.5500,4.4,14,1,"Architecte à Meknès. Plans de maisons individuelles, extensions, rénovations patrimoniales.","📐","+212 669 112 234"),
                (28,"Modern Arch Tetouan","architecte","Tetouan",35.5800,-5.3700,4.5,16,1,"Architecte à Tétouan. Conception villas et résidences secondaires, intégration paysagère.","📐","+212 661 445 667"),
                (29,"Cabinet Skalli Architecture","architecte","Kenitra",34.2650,-6.5850,4.4,13,1,"Architecte à Kénitra et Salé. Plans toutes typologies, dossiers permis de construire complets.","📐","+212 664 778 900"),
                (30,"Maison Design El Jadida","architecte","El Jadida",33.2400,-8.4900,4.3,11,1,"Architecte à El Jadida. Conception villas contemporaines, extensions et rénovations côtières.","📐","+212 663 556 778"),
                (31,"Casablanca Archi Premium","architecte","Casablanca",33.5700,-7.5950,4.8,44,1,"Cabinet haut de gamme à Casablanca. Architecture contemporaine et durable, MOE complète.","📐","+212 662 890 012"),
                (32,"Archi Souss Premium","architecte","Agadir",30.4320,-9.5900,4.7,29,1,"Architecte DPLG à Agadir. Résidences balnéaires, eco-construction, villas avec piscine.","📐","+212 668 223 445"),
                (33,"Beni Mellal Architectes","architecte","Beni Mellal",32.3400,-6.3550,4.3,10,1,"Cabinet d'architecture à Beni Mellal. Maisons individuelles, immeubles R+2, projets agricoles.","📐","+212 664 667 889"),
                (34,"Oujda Architecture","architecte","Oujda",34.6850,-1.9150,4.4,15,1,"Architecte à Oujda. Permis de construire, plans villas et petits immeubles, region orientale.","📐","+212 660 556 778"),
                (35,"Safi Design Studio","architecte","Safi",32.3000,-9.2400,4.3,9,1,"Architecte à Safi. Conception maisons individuelles, rénovation et extension de bâtiments existants.","📐","+212 665 445 667"),
                (36,"Electro Pro Tanger","electricien","Tanger",35.7595,-5.8340,4.5,14,1,"Électricien certifié à Tanger. Installation complète courant fort, faible, domotique, alarme.","⚡","+212 664 567 890"),
                (37,"Elec Souss","electricien","Agadir",30.4200,-9.6000,4.3,9,1,"Électricien industriel et résidentiel à Agadir. Domotique, panneaux solaires photovoltaïques.","⚡","+212 661 234 568"),
                (38,"Hajji Electricité","electricien","Fes",34.0350,-5.0200,4.6,17,1,"Électricien certifié à Fès. Courant fort/faible, domotique, panneaux solaires, tableaux divisionnaires.","⚡","+212 663 456 780"),
                (39,"Spark Electric Casablanca","electricien","Casablanca",33.5900,-7.6200,4.7,28,1,"Électricien à Casablanca. Installation et mise aux normes, tableaux RGIE, courant faible, fibre optique.","⚡","+212 661 890 012"),
                (40,"Volta Rabat","electricien","Rabat",34.0300,-6.8500,4.5,21,1,"Électricien à Rabat et Salé. Résidentiel, tertiaire, maintenance électrique, dépannage 24h/7j.","⚡","+212 663 123 345"),
                (41,"Marrakech Electro","electricien","Marrakech",31.6200,-7.9750,4.4,16,1,"Électricien à Marrakech. Villas, riads, hôtels. Installation complète courant fort/faible, climatisation.","⚡","+212 664 334 556"),
                (42,"Elec Meknes","electricien","Meknes",33.8950,-5.5600,4.5,18,1,"Électricien à Meknès. Installation électrique, tableaux, éclairage LED, domotique, panneaux solaires.","⚡","+212 669 556 778"),
                (43,"Oriental Electrique","electricien","Oujda",34.6800,-1.9100,4.3,11,1,"Électricien à Oujda. Résidentiel et commercial, mise aux normes, courant faible et télécommunications.","⚡","+212 660 778 900"),
                (44,"SolarTech Maroc","electricien","Agadir",30.4350,-9.5850,4.8,35,1,"Spécialiste solaire photovoltaïque à Agadir. Installation panneaux, batteries, onduleurs, raccordement réseau.","⚡","+212 668 445 667"),
                (45,"Domotique Nord","electricien","Tanger",35.7700,-5.8250,4.5,14,1,"Expert domotique et éclairage intelligent à Tanger. KNX, Zigbee, alarme incendie et intrusion.","⚡","+212 661 223 445"),
                (46,"CasaVolt Pro","electricien","Casablanca",33.5800,-7.5800,4.6,23,1,"Électricien industriel et résidentiel à Casablanca. Groupes électrogènes, UPS, armoires TGBT.","⚡","+212 662 667 889"),
                (47,"Plomberie Fassie","plombier","Fes",34.0181,-5.0078,4.7,19,1,"Plombier à Fès. Sanitaires, chauffage central, climatisation, traitement eau, détection fuites.","🔧","+212 665 678 901"),
                (48,"Bensouda Plomberie","plombier","Casablanca",33.5850,-7.6050,4.5,13,1,"Plombier général à Casablanca. Sanitaires, chauffage central au gaz, climatisation, dépannage urgent.","🔧","+212 664 567 891"),
                (49,"Aqua Pro Rabat","plombier","Rabat",34.0150,-6.8300,4.6,20,1,"Plombier à Rabat et Salé. Installation sanitaire complète, chauffe-eau solaire, adoucisseurs.","🔧","+212 663 345 567"),
                (50,"Souss Plomberie","plombier","Agadir",30.4100,-9.6100,4.4,15,1,"Plomberie et sanitaires à Agadir. Chauffage, climatisation, chauffe-eau thermodynamique.","🔧","+212 668 112 334"),
                (51,"HydroService Tanger","plombier","Tanger",35.7550,-5.8400,4.5,17,1,"Plombier à Tanger. Installation complète sanitaires, chauffage gaz, VMC, filtration eau.","🔧","+212 661 778 900"),
                (52,"Aqua Marrakech","plombier","Marrakech",31.6350,-7.9900,4.3,11,1,"Plombier à Marrakech. Piscines, hammams, robinetterie, sanitaires haut de gamme pour riads.","🔧","+212 664 890 012"),
                (53,"Plomberie Premium Casa","plombier","Casablanca",33.5650,-7.6000,4.7,26,1,"Plombier haut de gamme à Casablanca. Marques Grohe, Roca, Geberit. Salles de bain design.","🔧","+212 662 334 556"),
                (54,"Saidi Plomberie","plombier","Meknes",33.9000,-5.5450,4.4,12,1,"Plombier à Meknès. Installations sanitaires, chauffage fuel et gaz, entretien et dépannage.","🔧","+212 669 556 778"),
                (55,"Eau Sanitaires Oujda","plombier","Oujda",34.6900,-1.9200,4.3,10,1,"Plombier à Oujda. Sanitaires, chauffage, VMC. Intervention rapide résidentiel et commercial.","🔧","+212 660 334 556"),
                (56,"Jadida Plomberie","plombier","El Jadida",33.2400,-8.4900,4.4,13,1,"Plombier à El Jadida. Installations complètes, dessalage eau, anti-corrosion milieu marin.","🔧","+212 663 667 889"),
                (57,"BET Maroc Ingénierie","bureau","Marrakech",31.6295,-7.9811,4.9,31,1,"Bureau d'études structures béton armé à Marrakech. Notes de calcul sismiques, supervision chantier.","📊","+212 663 456 789"),
                (58,"Cabinet Lazraq BET","bureau","Casablanca",33.5600,-7.6300,4.8,35,1,"Bureau d'études tout corps d'état à Casablanca. Structures, VRD, fluides, contrôle technique.","📊","+212 662 345 679"),
                (59,"BET Structures Rabat","bureau","Rabat",34.0250,-6.8350,4.7,28,1,"Bureau d'études structures à Rabat. Béton armé, charpente métallique, expertise sismique RPS.","📊","+212 663 567 789"),
                (60,"BET Fassi","bureau","Fes",34.0200,-5.0100,4.6,22,1,"Bureau d'études à Fès. Structures, assainissement, VRD, études de sol et géotechnique.","📊","+212 665 112 234"),
                (61,"Geotec Tanger","bureau","Tanger",35.7500,-5.8500,4.5,18,1,"Bureau études géotechniques à Tanger. Sondages, essais SPT, fondations profondes et spéciales.","📊","+212 661 890 012"),
                (62,"Socomat BET","bureau","Agadir",30.4250,-9.5950,4.6,23,1,"Bureau d'études à Agadir. Structures, assainissement, VRD, conception parasismique zone III.","📊","+212 668 223 445"),
                (63,"BET Merinides","bureau","Meknes",33.8850,-5.5550,4.5,16,1,"Bureau d'études à Meknès. Structures BA, charpente, notes de calcul, dossier techniques.","📊","+212 669 334 556"),
                (64,"TechBuild Casablanca","bureau","Casablanca",33.5750,-7.5700,4.8,41,1,"Bureau d'études multidisciplinaire à Casablanca. Structures, HQE, audit énergétique, BIM.","📊","+212 661 556 778"),
                (65,"BET Oriental","bureau","Oujda",34.6750,-1.9000,4.4,14,1,"Bureau d'études à Oujda. Structures béton armé, VRD, fluides, suivi et contrôle chantiers.","📊","+212 660 445 667"),
                (66,"Bureau Etudes Sale","bureau","Sale",34.0600,-6.8100,4.5,19,1,"Bureau d'études à Salé. Structures, assainissement, lots techniques, dossier PC complet.","📊","+212 662 112 334"),
                (67,"Benali Comptabilite BTP","comptable","Casablanca",33.5950,-7.6187,4.4,11,1,"Expert-comptable spécialisé BTP à Casablanca. Gestion budgets chantiers, déclarations fiscales, liasse.","💼","+212 666 789 012"),
                (68,"Fiduciaire Atlas","comptable","Marrakech",31.6300,-7.9850,4.5,16,1,"Fiduciaire à Marrakech. Comptabilité BTP et immobilier, TVA sur marge, fiscalité promoteurs.","💼","+212 664 112 234"),
                (69,"Cabinet Berrada Expert","comptable","Rabat",34.0180,-6.8380,4.6,20,1,"Expert-comptable à Rabat. Suivi financier chantiers, prix de revient, contrôle de gestion.","💼","+212 663 445 667"),
                (70,"Expertise Fassia","comptable","Fes",34.0150,-5.0050,4.5,14,1,"Fiduciaire à Fès. Comptabilité générale et analytique BTP, déclarations IS et TVA, paie.","💼","+212 665 556 778"),
                (71,"Fiduciaire Nord Maroc","comptable","Tanger",35.7450,-5.8350,4.3,9,1,"Cabinet comptable à Tanger. BTP, immobilier, TVA, gestion sociale chantiers, CNSS.","💼","+212 661 334 556"),
                (72,"Cabinet Agadir Compta","comptable","Agadir",30.4400,-9.5900,4.4,12,1,"Expert-comptable à Agadir. Suivi budgétaire promoteurs, fiscalité, commissariat aux comptes.","💼","+212 668 556 778"),
                (73,"Compta Expert Casa","comptable","Casablanca",33.5700,-7.5850,4.6,18,1,"Fiduciaire BTP à Casablanca. Comptabilité de chantier, situations de travaux, décomptes.","💼","+212 662 890 012"),
                (74,"Tazi Expertise Comptable","comptable","Sale",34.0480,-6.8050,4.3,8,1,"Expert-comptable à Salé. PME et artisans BTP, comptabilité, déclarations, conseil fiscal.","💼","+212 663 778 900"),
                (75,"Maitre Alami","notaire","Rabat",34.0132,-6.8326,4.8,27,1,"Notaire à Rabat. Actes de vente immobilière, permis construire, hypothèques, successions.","⚖️","+212 667 890 123"),
                (76,"Tahiri & Associes","notaire","Casablanca",33.5780,-7.5950,4.7,22,1,"Étude notariale à Casablanca. Transactions immobilières, contrats BTP, partages et successions.","⚖️","+212 665 678 902"),
                (77,"Etude Benali Notaire","notaire","Marrakech",31.6280,-7.9820,4.6,19,1,"Notaire à Marrakech. Actes VEFA, copropriété, lotissements, transactions riads et villas.","⚖️","+212 664 223 445"),
                (78,"Maitre Kettani","notaire","Fes",34.0120,-5.0050,4.7,24,1,"Notaire à Fès. Spécialiste droit immobilier marocain, actes authentiques, mutations de propriété.","⚖️","+212 665 445 667"),
                (79,"Notariat Nord Maroc","notaire","Tanger",35.7600,-5.8300,4.5,16,1,"Notaire à Tanger. Transactions immobilières, sociétés immobilières, baux commerciaux.","⚖️","+212 661 556 778"),
                (80,"Maitre Rachidi","notaire","Agadir",30.4300,-9.5950,4.6,18,1,"Notaire à Agadir. Actes de vente, lotissements, copropriété, successions et donations.","⚖️","+212 668 667 889"),
                (81,"Etude Tazi Casablanca","notaire","Casablanca",33.5820,-7.6050,4.5,15,1,"Étude notariale à Casablanca. VEFA, divisions, fusions, actes de prêt et garanties immobilières.","⚖️","+212 662 778 900"),
                (82,"Maitre Hassani","notaire","Meknes",33.8870,-5.5420,4.6,17,1,"Notaire à Meknès. Actes authentiques, ventes immobilières, permis de construire, donations.","⚖️","+212 669 889 001"),
            ]
            _fields = ["id","nom","role","ville","lat","lng","note","avis","verified","description","emoji","tel"]
            _ins = text("INSERT INTO professionals (id,nom,role,ville,lat,lng,note,avis,verified,description,emoji,tel) VALUES (:id,:nom,:role,:ville,:lat,:lng,:note,:avis,:verified,:description,:emoji,:tel)")
            for p in pros:
                conn.execute(_ins, dict(zip(_fields, p)))

        # ── Seed community posts if table is empty ────────────────────────────────
        post_count = conn.execute(text("SELECT COUNT(*) FROM community_posts")).fetchone()[0]
        if post_count == 0:
            seed_user_id = "system-seed"
            # Créer un user système si absent
            sys_user = conn.execute(*sql_params("SELECT id FROM users WHERE id=?", [seed_user_id])).fetchone()
            if not sys_user:
                conn.execute(*sql_params(
                    "INSERT INTO users (id,prenom,nom,email,password_hash,role,created_at) VALUES (?,?,?,?,?,?,?)",
                    [seed_user_id,"ShantiLink","Équipe","team@shantilink.ma",hash_password(uid()),"admin",now_iso()]
                ))
            SEED_POSTS = [
                (
                    "Bienvenue sur la communauté ShantiLink 🏗️",
                    "Bienvenue sur la communauté ShantiLink — l'espace des professionnels et clients du BTP au Maroc. 🇲🇦\n\nCe fil est le vôtre.\n\nIci, vous pouvez :\n📌 Partager des conseils de chantier\n📌 Poser des questions techniques\n📌 Signaler les prix du marché\n📌 Présenter vos réalisations\n📌 Trouver des collaborateurs\n📌 Rester informés de la réglementation\n\nShantiLink est une plateforme BTP marocaine créée pour simplifier la gestion de chantier et relier clients et professionnels. Notre mission : rendre la construction au Maroc plus transparente, plus professionnelle et plus simple pour tout le monde.\n\nComment participer ?\n→ Cliquez « Publier » pour partager\n→ Invitez vos collègues et clients à rejoindre\n\nOn démarre avec du contenu — à vous de prendre la suite. 🤝\nL'équipe ShantiLink",
                    "annonce", '["annonce"]', 1, "/static/images/posts/post-bienvenue.svg"
                ),
                (
                    "Guide : Choisir un bon entrepreneur BTP au Maroc",
                    "Choisir le mauvais entrepreneur, c'est le risque numéro 1 d'un projet BTP raté.\nVoici les 5 critères que tout client doit vérifier — sans exception.\n\n✅ 1. Registre du commerce actif\nDemande le numéro RC et vérifie-le sur le portail du Tribunal de Commerce. Un entrepreneur sans RC officiel = aucun recours légal en cas de litige.\n\n✅ 2. Références de chantiers similaires\nPas juste des photos — demande à visiter un chantier terminé et à parler au client. Un bon professionnel accepte sans hésiter.\n\n✅ 3. Devis détaillé par lot\nBéton, maçonnerie, plomberie, électricité... chaque poste doit être chiffré séparément. Un devis global « forfait » cache souvent des surprises.\n\n✅ 4. Attestation d'assurance\nAssurance décennale obligatoire pour les gros travaux. Demande le certificat — s'il ne l'a pas, passe ton chemin.\n\n✅ 5. Visite de chantier en cours\nObserve comment il gère ses ouvriers, sa propreté, ses délais. Un chantier bien tenu = un pro sérieux.\n\n💡 Les profils vérifiés sur ShantiLink ont tous passé ces 5 critères.",
                    "conseil", '["conseil","client"]', 1, "/static/images/posts/post-choisir-entrepreneur.svg"
                ),
                (
                    "Prix matériaux BTP Mai 2026 — Ciment, Fer, Sable",
                    "Mise à jour des prix courants au Maroc (mai 2026). Ces prix sont des moyennes — ils varient selon la région et le fournisseur.\n\n🏗️ GROS ŒUVRE\n• Ciment CPJ45 (50kg) : 68–75 MAD / sac\n• Ciment CPJ55 (50kg) : 82–90 MAD / sac\n• Fer à béton HA12 : 8,2–9,0 MAD / kg\n• Fer rond HA8 : 8,5–9,2 MAD / kg\n• Treillis soudé ST25 : 180–220 MAD / m²\n\n🪨 GRANULATS & MAÇONNERIE\n• Sable de rivière : 180–220 MAD / tonne\n• Sable de carrière : 120–150 MAD / tonne\n• Gravier 15/25 : 200–240 MAD / tonne\n• Parpaing 20×20×40 : 4,5–5,5 MAD / unité\n• Brique rouge 6 trous : 1,8–2,2 MAD / unité\n\n🏠 SECOND ŒUVRE\n• Carrelage 60×60 céramique : 90–150 MAD / m²\n• Carrelage grès cérame : 180–350 MAD / m²\n• Enduit ciment (sac 40kg) : 55–70 MAD / sac\n\n💡 Conseil : demandez toujours 3 devis fournisseurs avant d'acheter en grande quantité. Les grossistes offrent des remises de 10–20% à partir de 5 tonnes.",
                    "materiaux", '["matériaux","prix"]', 0, "/static/images/posts/post-prix-materiaux.svg"
                ),
                (
                    "Normes parasismiques RPS 2011 révisées — Impact sur vos chantiers",
                    "Suite au séisme d'Al Haouz (2023), le Maroc a accéléré l'application du Règlement Parasismique des Bâtiments (RPS 2011 révisé).\n\n📍 Ce qui a changé en 2024 :\n\nZONAGE RÉVISÉ :\n→ Zone 1 (faible) : Sahara, extrême sud\n→ Zone 2 (modéré) : Casablanca, Rabat, côte atlantique ← NOUVEAU pour Casablanca\n→ Zone 3 (fort) : Rif, Atlas, Agadir\n\nIMPACT CONCRET SUR LE FERRAILLAGE :\nPour une villa R+1 à Casablanca (zone 2 désormais) :\n• Semelles filantes : ferraillage minimum HA12 tous les 15cm (au lieu de 20cm)\n• Chaînages horizontaux : HA10 minimum à chaque plancher\n• Poteaux : HA12 minimum, cadres HA8 tous les 10cm en zone nodale\n\n⚠️ Non-conformité = refus de réception par le bureau de contrôle.\n\nPour les projets en cours : vérifiez avec votre architecte si votre permis a été établi sous l'ancienne zone.",
                    "reglementation", '["réglementation","pro"]', 0, "/static/images/posts/post-normes-parasismiques.svg"
                ),
                (
                    "Checklist réception de chantier — Évitez les malfaçons",
                    "La réception de chantier est le moment le plus important du projet. C'est là que vous acceptez — ou refusez — le travail effectué. Une fois signée, il est très difficile de revenir en arrière.\n\n📋 CHECKLIST COMPLÈTE\n\nPLANÉITÉ & NIVEAUX\n☐ Sols : testez avec une règle de 2m → écart max 5mm autorisé\n☐ Murs : vérifiez la verticalité avec un niveau à bulle\n☐ Plafonds : recherchez les variations de niveau\n\nCARRELAGE & FAÏENCE\n☐ Joints réguliers et bien remplis (pas de joints creux au son)\n☐ Pas de carreaux fêlés ou mal collés\n☐ Alignement des joints d'une pièce à l'autre\n\nÉTANCHÉITÉ\n☐ Terrasse : versez 10L d'eau → aucune infiltration sous 24h\n☐ Joints silicone baignoire/douche continus\n\nPLOMBERIE & ÉLECTRICITÉ\n☐ Toutes les robinetteries et prises testées\n☐ Disjoncteurs fonctionnels — testez chaque circuit\n☐ Tableau électrique : étiquetage de chaque disjoncteur\n\nEN CAS DE RÉSERVE\n→ Notez par écrit sur le PV de réception\n→ Retenez 5% du montant total jusqu'à levée complète",
                    "conseil", '["conseil","qualité","client"]', 0, "/static/images/posts/post-checklist-reception.svg"
                ),
                (
                    "Devis vs Contrat : Ne confondez plus ces deux documents",
                    "C'est l'erreur la plus répandue chez les propriétaires au Maroc : signer un devis en croyant avoir un contrat.\n\n📄 LE DEVIS\n• C'est une OFFRE commerciale de l'entrepreneur\n• Il n'est pas contraignant tant qu'il n'est pas signé des deux parties\n• Il a une durée de validité limitée (généralement 30 jours)\n• Il indique les prix, quantités et délais ESTIMÉS\n\n📋 LE CONTRAT\n• C'est un ENGAGEMENT juridique bilatéral\n• Il est opposable devant un tribunal\n• Il doit préciser : délais, pénalités de retard, garanties, conditions de paiement\n• Les modifications nécessitent un avenant signé\n\n⚠️ Ce qui manque souvent dans les contrats marocains :\n1. Clause de pénalité de retard (ex: 0,5% par semaine de retard)\n2. Planning détaillé annexé\n3. Conditions de réception et de garantie\n\n✅ La règle simple :\nNe versez AUCUN acompte avant d'avoir un contrat SIGNÉ.\n\n💡 ShantiLink génère automatiquement des rapports d'avancement qui servent de preuve opposable en cas de litige.",
                    "reglementation", '["réglementation","client"]', 0, "/static/images/posts/post-devis-vs-contrat.svg"
                ),
                (
                    "Photographiez votre chantier : la meilleure protection contre les litiges",
                    "Un litige de chantier sur deux aurait pu être évité avec de bonnes photos.\n\n📸 QUAND PHOTOGRAPHIER (étapes clés absolues)\n\nAvant les travaux :\n→ État des lieux complet (sols, murs, plafond, extérieur)\n\nGros œuvre :\n→ Ferraillage AVANT le coulage du béton ← le plus important\n→ Fouilles et semelles, chaînages et poteaux avant coffrage\n\nAvant fermeture :\n→ Réseaux plomberie AVANT la chape\n→ Réseaux électriques AVANT l'enduit\n\n📱 COMMENT PHOTOGRAPHIER EFFICACEMENT\n• Activez la géolocalisation → preuve de lieu automatique\n• La date/heure s'enregistre dans les métadonnées EXIF\n• Photographiez avec un objet de référence pour l'échelle\n\n💡 ShantiLink enregistre automatiquement les coordonnées GPS de chaque photo uploadée. Vos preuves sont horodatées et géolocalisées — opposables juridiquement.",
                    "conseil", '["conseil","documentation"]', 0, "/static/images/posts/post-photos-chantier.svg"
                ),
                (
                    "Grille des salaires BTP Maroc 2026 — Référence officielle",
                    "Vous recrutez pour un chantier ? Voici les rémunérations de référence pour respecter vos obligations légales.\n\n💰 SMIG BTP (base légale 2026)\n• Taux horaire : 16,29 MAD / heure\n• Journée 8h : 130 MAD / jour\n• Mensuel (26 jours) : 3 380 MAD\n\n👷 OUVRIERS — Salaire journalier\n• Manœuvre (OS1) : 130–150 MAD / jour\n• Aide-maçon (OS2) : 150–180 MAD / jour\n• Maçon qualifié (OS3) : 180–220 MAD / jour\n• Maçon spécialisé (P1) : 220–280 MAD / jour\n• Chef d'équipe (P2) : 280–380 MAD / jour\n\n🔌 CORPS DE MÉTIERS SPÉCIALISÉS\n• Électricien qualifié : 200–300 MAD / jour\n• Plombier qualifié : 200–280 MAD / jour\n• Carreleur : 180–280 MAD / jour\n\n👔 ENCADREMENT (salaires mensuels)\n• Chef de chantier junior : 4 000–6 000 MAD / mois\n• Conducteur de travaux : 8 000–15 000 MAD / mois\n\n⚠️ OBLIGATIONS LÉGALES : CNSS obligatoire, congés payés 1,5 j/mois, heures sup +25%.",
                    "rh", '["ressources humaines","pro"]', 0, "/static/images/posts/post-salaires-btp.svg"
                ),
                (
                    "Isolation thermique RTBM : Ce que la réglementation impose",
                    "Depuis 2014, le Règlement Thermique du Bâtiment Marocain (RTBM) est obligatoire pour tout nouveau bâtiment.\n\n🌡️ LES COEFFICIENTS U IMPOSÉS\n(U = coefficient de transmission thermique — plus il est bas, mieux c'est)\n\nZONE 1 (côtière — Casablanca, Rabat, Tanger) :\n• Murs extérieurs : U ≤ 0,6 W/m²K\n• Toiture-terrasse : U ≤ 0,4 W/m²K\n• Vitrage : Ug ≤ 2,5 W/m²K\n\nZONE 2 (semi-aride — Fès, Meknès, Marrakech) :\n• Murs extérieurs : U ≤ 0,5 W/m²K\n• Toiture-terrasse : U ≤ 0,35 W/m²K\n\n🧱 SOLUTIONS PRATIQUES\n→ Isolation par l'extérieur (ITE) : 6cm polystyrène expansé\n→ Doubles parois avec lame d'air + isolant 4cm\n→ Liège expansé 6–8cm sous chape de terrasse\n\n⚠️ Non-respect = refus de réception + consommation énergétique 40–60% plus élevée.\n\n💡 Demandez à votre architecte l'étude thermique RTBM — elle doit figurer dans le dossier de permis de construire.",
                    "reglementation", '["réglementation","énergie"]', 0, "/static/images/posts/post-isolation-thermique.svg"
                ),
                (
                    "Comment lire un plan d'architecte : Guide complet pour les clients",
                    "Votre architecte vous a remis des plans et vous ne savez pas par où commencer ? Ce guide vous permet de comprendre les bases en 5 minutes.\n\n📐 LES ÉCHELLES\n1:50 → 1 cm sur le plan = 50 cm en réalité\n1:100 → 1 cm = 1 mètre (vue d'ensemble)\n1:20 → 1 cm = 20 cm (détails de construction)\n\n📏 LES TYPES DE TRAITS\nTrait épais continu → Murs porteurs (ne pas toucher !)\nTrait fin continu → Cloisons légères (peuvent être déplacées)\nTrait interrompu (tirets) → Éléments en hauteur ou cachés\nTrait mixte → Axes de symétrie ou de coupe\n\n🚪 LES SYMBOLES COURANTS\nPorte → Arc de cercle indiquant le sens d'ouverture\nFenêtre → Trait fin entre deux traits épais\nEscalier → Flèche avec « Mont. » ou « Desc. »\n\n❓ QUESTIONS À POSER À VOTRE ARCHITECTE\n• Où sont les murs porteurs ?\n• Quels sont les vides sanitaires et gaines techniques ?\n• Quelle est l'orientation par rapport au soleil ?\n• Les plans AS-BUILT correspondent-ils aux plans permis ?",
                    "conseil", '["conseil","client","plans"]', 0, "/static/images/posts/post-lire-un-plan.svg"
                ),
            ]
            for titre, content, category, tags, epingle, media_url in SEED_POSTS:
                conn.execute(*sql_params(
                    "INSERT INTO community_posts (id,user_id,content,titre,category,tags,est_epingle,likes,media_url,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
                    ["cp"+uid(), seed_user_id, content, titre, category, tags, epingle, random.randint(3,28), media_url, now_iso()]
                ))
        conn.commit()
    finally:
        conn.close()

# ── Auth helpers ──────────────────────────────────────────────────────────────
def hash_password(password: str) -> str:
    salt = os.urandom(32).hex()
    key = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), 100_000).hex()
    return f"{salt}:{key}"

def verify_password(password: str, stored: str) -> bool:
    try:
        salt_hex, key_hex = stored.split(":", 1)
        key = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), 100_000).hex()
        return hmac.compare_digest(key, key_hex)
    except Exception:
        return False

def create_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email, "exp": time.time() + TOKEN_HOURS * 3600}
    payload_b64 = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    sig = hmac.new(SECRET_KEY.encode(), payload_b64.encode(), hashlib.sha256).hexdigest()
    return f"{payload_b64}.{sig}"

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
        return payload
    except Exception:
        raise HTTPException(status_code=401, detail="Token invalide ou expiré")

def get_current_user(request: Request) -> dict:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Non authentifié")
    return verify_token(auth[7:])

def log_activity(conn, user_id: str, msg: str):
    conn.execute(
        text("INSERT INTO activities (id,user_id,msg,created_at) VALUES (:id,:uid,:msg,:at)"),
        {"id": "a" + uid(), "uid": user_id, "msg": msg, "at": now_iso()}
    )

# ── Pydantic models ───────────────────────────────────────────────────────────
class RegisterIn(BaseModel):
    prenom: str
    nom: Optional[str] = ""
    email: str
    password: str
    role: str = "client"
    ville: Optional[str] = ""
    ref_code: Optional[str] = ""

class LoginIn(BaseModel):
    email: str
    password: str

class ProjectIn(BaseModel):
    nom: str
    ville: Optional[str] = ""
    budget: Optional[int] = 0
    type: Optional[str] = "Villa / Maison individuelle"
    etages: Optional[int] = 0
    description: Optional[str] = ""

class PctIn(BaseModel):
    pct: int

class ExpenseIn(BaseModel):
    description: str
    montant: float
    categorie: Optional[str] = "Autre"
    date: Optional[str] = ""
    project_id: Optional[str] = None

class PhotoIn(BaseModel):
    description: str
    date: Optional[str] = ""
    phase: Optional[str] = "Fondations"
    emoji: Optional[str] = "🏗️"

class MessageIn(BaseModel):
    professional_id: int
    content: str

class ContactIn(BaseModel):
    prenom: Optional[str] = ""
    nom: Optional[str] = ""
    email: str
    role: Optional[str] = ""
    message: str

class ProfileIn(BaseModel):
    prenom: Optional[str] = None
    nom: Optional[str] = None
    ville: Optional[str] = None
    tel: Optional[str] = None
    bio: Optional[str] = None

class BriefIn(BaseModel):
    titre: str
    description: Optional[str] = ""
    ville: Optional[str] = ""
    categorie: Optional[str] = "entrepreneur"
    budget_min: Optional[int] = 0
    budget_max: Optional[int] = 0
    deadline: Optional[str] = ""

class BriefResponseIn(BaseModel):
    message: str
    prix: Optional[int] = 0
    delai: Optional[str] = ""

class ReviewIn(BaseModel):
    pro_user_id: Optional[str] = ""
    pro_catalog_id: Optional[int] = 0
    project_id: Optional[str] = ""
    rating: int
    comment: Optional[str] = ""

class ChatMessageIn(BaseModel):
    content: str

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="ShantiLink API", version="1.0.0", docs_url="/api/docs")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup():
    init_db()

@app.get("/health")
def health():
    try:
        conn = get_db()
        conn.execute(text("SELECT 1"))
        conn.close()
        db_type = "postgresql" if not _is_sqlite else "sqlite"
        return {"status": "ok", "db": db_type}
    except Exception as e:
        return {"status": "error", "detail": str(e)}

@app.get("/api/me")
def get_me(user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        row = conn.execute(*sql_params("SELECT id,prenom,nom,email,role,ville,plan FROM users WHERE id=?", [user["sub"]])).fetchone()
        if not row: raise HTTPException(404, "Utilisateur non trouvé")
        return dict(row._mapping)
    finally:
        conn.close()

# ── Auth ──────────────────────────────────────────────────────────────────────
@app.post("/api/auth/register", status_code=201)
def register(data: RegisterIn):
    if len(data.password) < 6:
        raise HTTPException(400, "Mot de passe minimum 6 caractères")
    if "@" not in data.email or "." not in data.email.split("@")[-1]:
        raise HTTPException(400, "Email invalide")
    conn = get_db()
    try:
        existing = conn.execute(*sql_params("SELECT id FROM users WHERE email=?", [data.email.lower()])).fetchone()
        if existing:
            raise HTTPException(409, "Cet email est déjà utilisé. Connectez-vous.")
        user_id = "u" + uid()
        referral_code = "SL" + user_id[-6:].upper()
        conn.execute(*sql_params(
            "INSERT INTO users (id,prenom,nom,email,password_hash,role,ville,created_at,status,bio,photo_url,is_verified,referral_code) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
            [user_id, data.prenom.strip(), data.nom.strip(), data.email.lower(),
             hash_password(data.password), data.role, data.ville.strip(), now_iso(),
             'active', '', '', 0, referral_code]
        ))
        # Track referral if code provided
        ref_code = getattr(data, 'ref_code', None)
        if ref_code:
            referrer = conn.execute(*sql_params("SELECT id FROM users WHERE referral_code=?", [ref_code])).fetchone()
            if referrer:
                conn.execute(*sql_params(
                    "INSERT INTO referrals (id,referrer_id,referred_email,referred_user_id,status,created_at) VALUES (?,?,?,?,?,?)",
                    ["r"+uid(), referrer[0], data.email.lower(), user_id, "completed", now_iso()]
                ))
        # Award founder badge to first 100 users
        founder_count = conn.execute(text("SELECT COUNT(*) FROM founder_badges")).fetchone()[0]
        founder_badge = None
        if founder_count < 100:
            badge_num = founder_count + 1
            conn.execute(*sql_params(
                "INSERT INTO founder_badges (user_id, badge_number, created_at) VALUES (?,?,?)",
                [user_id, badge_num, now_iso()]
            ))
            founder_badge = badge_num
        log_activity(conn, user_id, f"Compte créé")
        conn.commit()
        token = create_token(user_id, data.email.lower())
        return {
            "token": token,
            "user": {"id": user_id, "prenom": data.prenom, "nom": data.nom,
                     "email": data.email.lower(), "role": data.role, "ville": data.ville,
                     "tel": "", "status": "active", "bio": "", "photo_url": "", "is_verified": 0,
                     "referral_code": referral_code, "founder_badge": founder_badge}
        }
    finally:
        conn.close()

@app.post("/api/auth/login")
def login(data: LoginIn):
    conn = get_db()
    try:
        row = conn.execute(*sql_params("SELECT * FROM users WHERE email=?", [data.email.lower()])).fetchone()
        if not row:
            raise HTTPException(401, "Email ou mot de passe incorrect")
        m = dict(row._mapping)
        if not verify_password(data.password, m["password_hash"]):
            raise HTTPException(401, "Email ou mot de passe incorrect")
        status = m.get("status", "active") or "active"
        if status == "suspended":
            raise HTTPException(403, "Votre compte a été suspendu. Contactez le support.")
        token = create_token(m["id"], m["email"])
        user_keys = ("id","prenom","nom","email","role","ville","tel")
        user_data = {k: m[k] for k in user_keys}
        for extra in ("status","bio","photo_url","is_verified","referral_code"):
            user_data[extra] = m.get(extra, "active" if extra == "status" else "") or ("active" if extra == "status" else "")
        fb = conn.execute(*sql_params("SELECT badge_number FROM founder_badges WHERE user_id=?", [m["id"]])).fetchone()
        user_data["founder_badge"] = fb[0] if fb else None
        return {"token": token, "user": user_data}
    finally:
        conn.close()

# ── Projects ──────────────────────────────────────────────────────────────────
@app.get("/api/projects")
def get_projects(user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        rows = conn.execute(
            *sql_params("SELECT * FROM projects WHERE user_id=? ORDER BY created_at DESC", [user["sub"]])
        ).fetchall()
        return [dict(r._mapping) for r in rows]
    finally:
        conn.close()

@app.post("/api/projects", status_code=201)
def create_project(data: ProjectIn, user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        plan_r = conn.execute(*sql_params("SELECT plan FROM users WHERE id=?", [user["sub"]])).fetchone()
        plan = (plan_r[0] or "starter") if plan_r else "starter"
        if plan == "starter":
            n = conn.execute(*sql_params("SELECT COUNT(*) FROM projects WHERE user_id=?", [user["sub"]])).fetchone()[0]
            if n >= 3:
                raise HTTPException(403, "PLAN_LIMIT:Vous avez atteint la limite de 3 chantiers (plan Starter). Passez à Pro pour des chantiers illimités.")
        pid = "p" + uid()
        conn.execute(*sql_params(
            "INSERT INTO projects (id,user_id,nom,ville,budget,type,etages,description,pct,created_at) VALUES (?,?,?,?,?,?,?,?,0,?)",
            [pid, user["sub"], data.nom, data.ville, data.budget, data.type, data.etages or 0, data.description, now_iso()]
        ))
        log_activity(conn, user["sub"], f"Nouveau projet créé : {data.nom}")
        conn.commit()
        row = conn.execute(*sql_params("SELECT * FROM projects WHERE id=?", [pid])).fetchone()
        return dict(row._mapping)
    finally:
        conn.close()

@app.put("/api/projects/{pid}")
def update_project(pid: str, data: ProjectIn, user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        p = conn.execute(*sql_params("SELECT id FROM projects WHERE id=? AND user_id=?", [pid, user["sub"]])).fetchone()
        if not p:
            raise HTTPException(404, "Projet non trouvé")
        conn.execute(*sql_params(
            "UPDATE projects SET nom=?,ville=?,budget=?,type=?,etages=?,description=? WHERE id=?",
            [data.nom, data.ville, data.budget, data.type, data.etages or 0, data.description, pid]
        ))
        conn.commit()
        return dict(conn.execute(*sql_params("SELECT * FROM projects WHERE id=?", [pid])).fetchone()._mapping)
    finally:
        conn.close()

@app.patch("/api/projects/{pid}/pct")
def update_pct(pid: str, data: PctIn, user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        p = conn.execute(*sql_params("SELECT id FROM projects WHERE id=? AND user_id=?", [pid, user["sub"]])).fetchone()
        if not p:
            raise HTTPException(404, "Projet non trouvé")
        pct = max(0, min(100, data.pct))
        conn.execute(*sql_params("UPDATE projects SET pct=? WHERE id=?", [pct, pid]))
        conn.commit()
        return {"ok": True, "pct": pct}
    finally:
        conn.close()

class PhasesIn(BaseModel):
    phases: str  # JSON string

@app.patch("/api/projects/{pid}/phases")
def update_phases(pid: str, data: PhasesIn, user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        p = conn.execute(*sql_params("SELECT id FROM projects WHERE id=? AND user_id=?", [pid, user["sub"]])).fetchone()
        if not p:
            raise HTTPException(404, "Projet non trouvé")
        conn.execute(*sql_params("UPDATE projects SET phases=? WHERE id=?", [data.phases, pid]))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()

@app.delete("/api/projects/{pid}")
def delete_project(pid: str, user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        conn.execute(*sql_params("UPDATE expenses SET deleted=1 WHERE project_id=? AND user_id=?", [pid, user["sub"]]))
        r = conn.execute(*sql_params("DELETE FROM projects WHERE id=? AND user_id=?", [pid, user["sub"]]))
        if r.rowcount == 0:
            raise HTTPException(404, "Projet non trouvé")
        log_activity(conn, user["sub"], f"Projet supprimé")
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()

# ── Expenses ──────────────────────────────────────────────────────────────────
@app.get("/api/expenses")
def get_expenses(user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        rows = conn.execute(
            *sql_params("SELECT * FROM expenses WHERE user_id=? ORDER BY date DESC, rowid DESC", [user["sub"]])
        ).fetchall()
        return [dict(r._mapping) for r in rows]
    finally:
        conn.close()

@app.post("/api/expenses", status_code=201)
def create_expense(data: ExpenseIn, user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        eid = "e" + uid()
        date = data.date or datetime.utcnow().strftime("%Y-%m-%d")
        conn.execute(*sql_params(
            "INSERT INTO expenses (id,user_id,project_id,description,montant,categorie,date) VALUES (?,?,?,?,?,?,?)",
            [eid, user["sub"], data.project_id, data.description, data.montant, data.categorie, date]
        ))
        log_activity(conn, user["sub"], f"Dépense ajoutée : {data.description} ({int(round(data.montant)):,} DH)")
        conn.commit()
        return dict(conn.execute(*sql_params("SELECT * FROM expenses WHERE id=?", [eid])).fetchone()._mapping)
    finally:
        conn.close()

@app.delete("/api/expenses/{eid}")
def delete_expense(eid: str, user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        row = conn.execute(*sql_params("SELECT description, montant FROM expenses WHERE id=? AND user_id=?", [eid, user["sub"]])).fetchone()
        if not row:
            raise HTTPException(404, "Dépense non trouvée")
        # soft delete: mark as deleted, keep in history
        conn.execute(*sql_params("UPDATE expenses SET deleted=1 WHERE id=?", [eid]))
        log_activity(conn, user["sub"], f"Dépense supprimée : {row[0]} ({int(row[1] or 0):,} DH)")
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()

# ── Photos ────────────────────────────────────────────────────────────────────
@app.get("/api/photos")
def get_photos(user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        rows = conn.execute(
            *sql_params("SELECT * FROM photos WHERE user_id=? ORDER BY date DESC, rowid DESC", [user["sub"]])
        ).fetchall()
        return [dict(r._mapping) for r in rows]
    finally:
        conn.close()

@app.post("/api/photos", status_code=201)
async def create_photo(
    request: Request,
    description: str = Form(...),
    date: str = Form(""),
    phase: str = Form("Fondations"),
    emoji: str = Form("🏗️"),
    gps: str = Form(""),
    image: Optional[UploadFile] = File(None),
    user: dict = Depends(get_current_user),
):
    conn = get_db()
    try:
        phid = "ph" + uid()
        date_val = date or datetime.utcnow().strftime("%Y-%m-%d")
        image_url = ""
        if image and image.filename:
            ext = os.path.splitext(image.filename)[-1].lower() or ".jpg"
            allowed = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic"}
            if ext not in allowed:
                raise HTTPException(400, "Format non supporté. Utilisez JPG, PNG ou WEBP.")
            filename = phid + ext
            dest = os.path.join(UPLOADS_DIR, filename)
            with open(dest, "wb") as f:
                shutil.copyfileobj(image.file, f)
            image_url = "/static/uploads/" + filename
        conn.execute(*sql_params(
            "INSERT INTO photos (id,user_id,description,date,phase,emoji,gps,image_url) VALUES (?,?,?,?,?,?,?,?)",
            [phid, user["sub"], description, date_val, phase, emoji, gps, image_url]
        ))
        log_activity(conn, user["sub"], f"Photo GPS archivée : {description}")
        conn.commit()
        return dict(conn.execute(*sql_params("SELECT * FROM photos WHERE id=?", [phid])).fetchone()._mapping)
    finally:
        conn.close()

@app.delete("/api/photos/{phid}")
def delete_photo(phid: str, user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        r = conn.execute(*sql_params("DELETE FROM photos WHERE id=? AND user_id=?", [phid, user["sub"]]))
        conn.commit()
        if r.rowcount == 0:
            raise HTTPException(404, "Photo non trouvée")
        return {"ok": True}
    finally:
        conn.close()

# ── Professionals ─────────────────────────────────────────────────────────────
@app.get("/api/professionals")
def get_professionals(
    role: Optional[str] = None,
    ville: Optional[str] = None,
    search: Optional[str] = None
):
    conn = get_db()
    try:
        q = "SELECT * FROM professionals WHERE 1=1"
        params = []
        if role:
            q += " AND role=?"; params.append(role)
        if ville:
            q += " AND ville=?"; params.append(ville)
        if search:
            q += " AND (nom LIKE ? OR description LIKE ?)"; params += [f"%{search}%", f"%{search}%"]
        rows = conn.execute(*sql_params(q, params)).fetchall()
        return [dict(r._mapping) for r in rows]
    finally:
        conn.close()

# ── Messages ──────────────────────────────────────────────────────────────────
@app.get("/api/messages")
def get_all_conversations(user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        rows = conn.execute(*sql_params("""
            SELECT m.professional_id, p.nom, p.emoji, p.role, p.ville,
                   MAX(m.created_at) as last_at,
                   (SELECT content FROM messages WHERE user_id=? AND professional_id=m.professional_id ORDER BY created_at DESC LIMIT 1) as last_msg
            FROM messages m
            JOIN professionals p ON p.id = m.professional_id
            WHERE m.user_id=?
            GROUP BY m.professional_id
            ORDER BY last_at DESC
        """, [user["sub"], user["sub"]])).fetchall()
        return [dict(r._mapping) for r in rows]
    finally:
        conn.close()

@app.get("/api/messages/{pro_id}")
def get_conversation(pro_id: int, user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        rows = conn.execute(
            *sql_params("SELECT * FROM messages WHERE user_id=? AND professional_id=? ORDER BY created_at ASC", [user["sub"], pro_id])
        ).fetchall()
        return [dict(r._mapping) for r in rows]
    finally:
        conn.close()

@app.post("/api/messages")
def send_message(data: MessageIn, user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        pro = conn.execute(*sql_params("SELECT * FROM professionals WHERE id=?", [data.professional_id])).fetchone()
        if not pro:
            raise HTTPException(404, "Professionnel non trouvé")
        mid = "m" + uid()
        conn.execute(*sql_params(
            "INSERT INTO messages (id,user_id,professional_id,content,from_user,created_at) VALUES (?,?,?,?,1,?)",
            [mid, user["sub"], data.professional_id, data.content, now_iso()]
        ))
        conn.commit()
        rows = conn.execute(
            *sql_params("SELECT * FROM messages WHERE user_id=? AND professional_id=? ORDER BY created_at ASC", [user["sub"], data.professional_id])
        ).fetchall()
        return [dict(r._mapping) for r in rows]
    finally:
        conn.close()

# ── Activities ────────────────────────────────────────────────────────────────
@app.get("/api/activities")
def get_activities(user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        rows = conn.execute(
            *sql_params("SELECT * FROM activities WHERE user_id=? ORDER BY created_at DESC LIMIT 20", [user["sub"]])
        ).fetchall()
        return [dict(r._mapping) for r in rows]
    finally:
        conn.close()

# ── Profile ───────────────────────────────────────────────────────────────────
@app.get("/api/profile")
def get_profile(user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        row = conn.execute(
            *sql_params("SELECT id,prenom,nom,email,role,ville,tel,bio,photo_url,is_verified,referral_code,plan,plan_expires,created_at FROM users WHERE id=?", [user["sub"]])
        ).fetchone()
        if not row:
            raise HTTPException(404, "Utilisateur non trouvé")
        data_out = dict(row._mapping)
        fb = conn.execute(*sql_params("SELECT badge_number FROM founder_badges WHERE user_id=?", [user["sub"]])).fetchone()
        data_out["founder_badge"] = fb[0] if fb else None
        ref_count = conn.execute(*sql_params("SELECT COUNT(*) FROM referrals WHERE referrer_id=? AND status='completed'", [user["sub"]])).fetchone()[0]
        data_out["referral_count"] = ref_count
        plan = data_out.get("plan") or "starter"
        data_out["plan"] = plan
        data_out["plan_limits"] = PLAN_LIMITS.get(plan, PLAN_LIMITS["starter"])
        proj_count = conn.execute(*sql_params("SELECT COUNT(*) FROM projects WHERE user_id=?", [user["sub"]])).fetchone()[0]
        data_out["usage"] = {"projects": proj_count}
        return data_out
    finally:
        conn.close()

@app.put("/api/profile")
def update_profile(data: ProfileIn, user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        updates, params = [], []
        for field, val in [("prenom", data.prenom), ("nom", data.nom), ("ville", data.ville), ("tel", data.tel), ("bio", data.bio)]:
            if val is not None:
                updates.append(f"{field}=?"); params.append(val)
        if updates:
            params.append(user["sub"])
            conn.execute(*sql_params(f"UPDATE users SET {','.join(updates)} WHERE id=?", params))
            conn.commit()
        row = conn.execute(
            *sql_params("SELECT id,prenom,nom,email,role,ville,tel,bio,photo_url,is_verified,referral_code FROM users WHERE id=?", [user["sub"]])
        ).fetchone()
        return dict(row._mapping)
    finally:
        conn.close()

# ── Contact ───────────────────────────────────────────────────────────────────
@app.post("/api/contact")
def submit_contact(data: ContactIn):
    conn = get_db()
    try:
        conn.execute(*sql_params(
            "INSERT INTO contacts (id,prenom,nom,email,role,message,created_at) VALUES (?,?,?,?,?,?,?)",
            ["c"+uid(), data.prenom, data.nom, data.email, data.role, data.message, now_iso()]
        ))
        conn.commit()
        return {"ok": True, "message": "Message envoyé ! Réponse sous 24h."}
    finally:
        conn.close()

# ── Stats ─────────────────────────────────────────────────────────────────────
@app.get("/api/stats")
def get_stats():
    conn = get_db()
    try:
        users = conn.execute(text("SELECT COUNT(*) FROM users")).fetchone()[0]
        projects = conn.execute(text("SELECT COUNT(*) FROM projects")).fetchone()[0]
        return {"users": users, "projects": projects, "pros": 15, "villes": 12}
    finally:
        conn.close()

# ── Community ─────────────────────────────────────────────────────────────────
class PostIn(BaseModel):
    content: str
    category: Optional[str] = "update"
    titre: Optional[str] = ""
    tags: Optional[str] = "[]"
    media_url: Optional[str] = ""   # rétrocompat singulier
    media_urls: Optional[List[str]] = []  # multi-médias (URLs Cloudinary)

class CommunityProfileIn(BaseModel):
    bio: Optional[str] = None
    photo_url: Optional[str] = None

class RatingIn(BaseModel):
    rated_pro_id: int
    rating: int
    comment: Optional[str] = ""

@app.get("/api/community/directory")
def community_directory(q: str = "", role: str = "", ville: str = "", limit: int = 50):
    conn = get_db()
    try:
        # Query registered users with professional roles
        pro_roles = ('architecte','promoteur','bureau','notaire','electricien','plombier','comptable','autre','client')
        placeholders = ','.join('?' * len(pro_roles))
        query = f"SELECT id,prenom,nom,role,ville,tel,created_at FROM users WHERE role IN ({placeholders})"
        params: list = list(pro_roles)
        if role:
            query = f"SELECT id,prenom,nom,role,ville,tel,created_at FROM users WHERE role=?"
            params = [role]
        if ville:
            query += " AND ville LIKE ?"; params.append(f"%{ville}%")
        if q:
            query += " AND (prenom LIKE ? OR nom LIKE ?)"; params += [f"%{q}%", f"%{q}%"]
        query += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)
        users = conn.execute(*sql_params(query, params)).fetchall()
        results = [dict(r._mapping) for r in users]
        # If no registered users yet, fall back to seeded professionals
        if not results:
            pq = "SELECT id,nom,role,ville,description,verified,note FROM professionals WHERE 1=1"
            pp: list = []
            if role:
                pq += " AND role=?"; pp.append(role)
            if ville:
                pq += " AND ville LIKE ?"; pp.append(f"%{ville}%")
            if q:
                pq += " AND (nom LIKE ? OR description LIKE ?)"; pp += [f"%{q}%", f"%{q}%"]
            pq += " ORDER BY note DESC LIMIT ?"; pp.append(limit)
            rows = conn.execute(*sql_params(pq, pp)).fetchall()
            results = [dict(r._mapping) for r in rows]
        return results
    finally:
        conn.close()

@app.get("/api/community")
@app.get("/api/community/posts")
def get_community_posts(limit: int = 20):
    conn = get_db()
    try:
        rows = conn.execute(*sql_params("""
            SELECT cp.id, cp.content, cp.titre, cp.category, cp.tags, cp.est_epingle,
                   cp.media_url, cp.media_urls, cp.likes, cp.created_at,
                   u.id as user_id, u.prenom, u.nom, u.role, u.ville
            FROM community_posts cp
            JOIN users u ON u.id = cp.user_id
            ORDER BY cp.est_epingle DESC, cp.created_at DESC
            LIMIT ?
        """, [limit])).fetchall()
        result = []
        for r in rows:
            d = dict(r._mapping)
            # Normalise media_urls en liste Python
            try:
                d["media_urls"] = json.loads(d.get("media_urls") or "[]")
            except Exception:
                d["media_urls"] = []
            # Rétrocompat : si media_url singulier et pas de media_urls, l'inclure
            if d.get("media_url") and not d["media_urls"]:
                d["media_urls"] = [d["media_url"]]
            result.append(d)
        return result
    finally:
        conn.close()

@app.post("/api/community", status_code=201)
@app.post("/api/community/posts", status_code=201)
def create_community_post(data: PostIn, user: dict = Depends(get_current_user)):
    if not data.content or not data.content.strip():
        raise HTTPException(400, "Le contenu ne peut pas être vide")
    conn = get_db()
    try:
        post_id = "cp" + uid()
        media_urls_json = json.dumps(data.media_urls or [])
        conn.execute(*sql_params(
            "INSERT INTO community_posts (id,user_id,content,category,titre,tags,media_url,media_urls,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
            [post_id, user["sub"], data.content.strip()[:2000], data.category, (data.titre or '')[:200], (data.tags or '[]'), (data.media_url or ''), media_urls_json, now_iso()]
        ))
        conn.commit()
        return {"id": post_id, "ok": True}
    finally:
        conn.close()

@app.post("/api/community/{post_id}/like")
def like_community_post(post_id: str, user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        r = conn.execute(*sql_params("UPDATE community_posts SET likes=likes+1 WHERE id=?", [post_id]))
        conn.commit()
        if r.rowcount == 0:
            raise HTTPException(404, "Post non trouvé")
        row = conn.execute(*sql_params("SELECT likes FROM community_posts WHERE id=?", [post_id])).fetchone()
        return {"ok": True, "likes": row[0] if row else 0}
    finally:
        conn.close()

@app.get("/api/community/profile/{user_id}")
def get_community_profile(user_id: str):
    conn = get_db()
    try:
        row = conn.execute(
            *sql_params("SELECT id,prenom,nom,role,ville,bio,photo_url,created_at FROM users WHERE id=?", [user_id])
        ).fetchone()
        if not row:
            raise HTTPException(404, "Profil non trouvé")
        posts = conn.execute(
            *sql_params("SELECT id,content,category,created_at FROM community_posts WHERE user_id=? ORDER BY created_at DESC LIMIT 5", [user_id])
        ).fetchall()
        result = dict(row._mapping)
        result["posts"] = [dict(p._mapping) for p in posts]
        return result
    finally:
        conn.close()

@app.put("/api/community/profile")
def update_community_profile(data: CommunityProfileIn, user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        updates, params = [], []
        if data.bio is not None:
            updates.append("bio=?"); params.append(data.bio[:500])
        if data.photo_url is not None:
            updates.append("photo_url=?"); params.append(data.photo_url)
        if updates:
            params.append(user["sub"])
            conn.execute(*sql_params(f"UPDATE users SET {','.join(updates)} WHERE id=?", params))
            conn.commit()
        return {"ok": True}
    finally:
        conn.close()

@app.post("/api/community/ratings", status_code=201)
def rate_professional(data: RatingIn, user: dict = Depends(get_current_user)):
    if not 1 <= data.rating <= 5:
        raise HTTPException(400, "La note doit être entre 1 et 5")
    conn = get_db()
    try:
        existing = conn.execute(
            *sql_params("SELECT id FROM community_ratings WHERE rater_id=? AND rated_pro_id=?", [user["sub"], data.rated_pro_id])
        ).fetchone()
        if existing:
            conn.execute(*sql_params(
                "UPDATE community_ratings SET rating=?,comment=? WHERE id=?",
                [data.rating, data.comment, existing[0]]
            ))
        else:
            conn.execute(*sql_params(
                "INSERT INTO community_ratings (id,rater_id,rated_pro_id,rating,comment,created_at) VALUES (?,?,?,?,?,?)",
                ["r"+uid(), user["sub"], data.rated_pro_id, data.rating, data.comment, now_iso()]
            ))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()

# ── AI Agent ─────────────────────────────────────────────────────────────────

# ── Agent Pydantic models ─────────────────────────────────────────────────────
class AgentMessage(BaseModel):
    role: str
    content: str

class AgentChatIn(BaseModel):
    messages: List[AgentMessage]

class AgentExecuteIn(BaseModel):
    action: str
    parameters: Dict[str, Any] = {}
    user_message: Optional[str] = ""

# ── Agent tool definitions (Claude tool use) ──────────────────────────────────
AGENT_TOOLS = [
    {
        "name": "navigate_to",
        "description": "Navigate the user to a specific section of their workspace. Use this when the user asks to go to a page or open a section.",
        "input_schema": {
            "type": "object",
            "properties": {
                "section": {
                    "type": "string",
                    "enum": ["overview", "projets", "planning", "depenses", "photos", "simulateur", "communaute", "messages", "profil", "rapports"],
                    "description": "The workspace section to navigate to"
                }
            },
            "required": ["section"]
        }
    },
    {
        "name": "get_user_data",
        "description": "Retrieve the user's projects, recent expenses and activities to answer questions about their construction data.",
        "input_schema": {
            "type": "object",
            "properties": {}
        }
    },
    {
        "name": "propose_create_project",
        "description": "Propose creating a new construction project. The user must confirm before it is saved.",
        "input_schema": {
            "type": "object",
            "properties": {
                "nom": {"type": "string", "description": "Project name"},
                "ville": {"type": "string", "description": "City"},
                "budget": {"type": "integer", "description": "Budget in MAD"},
                "type": {"type": "string", "description": "Construction type, e.g. Villa / Maison individuelle"},
                "description": {"type": "string", "description": "Short project description"}
            },
            "required": ["nom"]
        }
    },
    {
        "name": "propose_add_expense",
        "description": "Propose adding an expense entry. The user must confirm before it is saved.",
        "input_schema": {
            "type": "object",
            "properties": {
                "description": {"type": "string", "description": "Expense description"},
                "montant": {"type": "number", "description": "Amount in MAD"},
                "categorie": {
                    "type": "string",
                    "enum": ["Matériaux", "Main-d'œuvre", "Transport", "Équipements", "Administration", "Autre"],
                    "description": "Expense category"
                },
                "project_id": {"type": "string", "description": "Optional project ID to link this expense"}
            },
            "required": ["description", "montant"]
        }
    },
    {
        "name": "propose_add_planning_phase",
        "description": "Propose adding a planning phase to a project. The user must confirm before it is saved.",
        "input_schema": {
            "type": "object",
            "properties": {
                "project_id": {"type": "string", "description": "Project ID"},
                "name": {"type": "string", "description": "Phase name, e.g. Fondations, Gros œuvre, Finitions"},
                "start_date": {"type": "string", "description": "Start date YYYY-MM-DD"},
                "end_date": {"type": "string", "description": "End date YYYY-MM-DD"}
            },
            "required": ["project_id", "name", "start_date", "end_date"]
        }
    }
]

# ── Agent helpers ─────────────────────────────────────────────────────────────
def _check_rate_limit(conn, user_id: str) -> bool:
    """Return True if user is within rate limit."""
    row = conn.execute(*sql_params("SELECT count, window_start FROM agent_rate_limit WHERE user_id=?", [user_id])).fetchone()
    now = time.time()
    if not row:
        if _is_sqlite:
            conn.execute(*sql_params("INSERT OR REPLACE INTO agent_rate_limit (user_id, count, window_start) VALUES (?,1,?)", [user_id, str(now)]))
        else:
            conn.execute(text("INSERT INTO agent_rate_limit (user_id, count, window_start) VALUES (:uid, 1, :now) ON CONFLICT (user_id) DO UPDATE SET count=1, window_start=EXCLUDED.window_start"), {"uid": user_id, "now": str(now)})
        return True
    rm = dict(row._mapping)
    window_start = float(rm["window_start"]) if rm["window_start"] else now
    if now - window_start > 3600:  # reset after 1 hour
        conn.execute(*sql_params("UPDATE agent_rate_limit SET count=1, window_start=? WHERE user_id=?", [str(now), user_id]))
        return True
    if rm["count"] >= AGENT_RATE_LIMIT:
        return False
    conn.execute(*sql_params("UPDATE agent_rate_limit SET count=count+1 WHERE user_id=?", [user_id]))
    return True

def _log_agent_action(conn, user_id: str, action: str, parameters: dict, result: dict, user_message: str = ""):
    conn.execute(*sql_params(
        "INSERT INTO agent_audit_log (id, user_id, action, parameters, result, user_message, created_at) VALUES (?,?,?,?,?,?,?)",
        ["al" + uid(), user_id, action, json.dumps(parameters), json.dumps(result), user_message[:500], now_iso()]
    ))

def _execute_agent_tool(tool_name: str, tool_input: dict, user_id: str) -> dict:
    """Execute a tool call and return the result dict."""
    conn = get_db()
    try:
        if tool_name == "get_user_data":
            projects = conn.execute(
                *sql_params("SELECT id, nom, ville, budget, pct, type, created_at FROM projects WHERE user_id=? ORDER BY created_at DESC LIMIT 10", [user_id])
            ).fetchall()
            expenses = conn.execute(
                *sql_params("SELECT description, montant, categorie, date FROM expenses WHERE user_id=? AND deleted=0 ORDER BY date DESC LIMIT 10", [user_id])
            ).fetchall()
            activities = conn.execute(
                *sql_params("SELECT msg, created_at FROM activities WHERE user_id=? ORDER BY created_at DESC LIMIT 5", [user_id])
            ).fetchall()
            total_budget = sum(dict(p._mapping).get("budget") or 0 for p in projects)
            total_expenses = conn.execute(
                *sql_params("SELECT COALESCE(SUM(montant),0) FROM expenses WHERE user_id=? AND deleted=0", [user_id])
            ).fetchone()[0]
            return {
                "projects": [dict(p._mapping) for p in projects],
                "recent_expenses": [dict(e._mapping) for e in expenses],
                "recent_activities": [dict(a._mapping) for a in activities],
                "summary": {
                    "total_projects": len(projects),
                    "total_budget_MAD": total_budget,
                    "total_spent_MAD": round(total_expenses, 2)
                }
            }

        elif tool_name == "navigate_to":
            return {"navigated_to": tool_input.get("section"), "ok": True}

        elif tool_name in ("propose_create_project", "propose_add_expense", "propose_add_planning_phase"):
            # These are proposals — just confirm the proposal was understood
            return {"proposed": True, "parameters": tool_input, "awaiting_user_confirmation": True}

        else:
            return {"error": f"Unknown tool: {tool_name}"}

    finally:
        conn.close()

def _build_system_prompt(user_id: str) -> str:
    conn = get_db()
    try:
        row = conn.execute(*sql_params("SELECT prenom, nom, role, ville FROM users WHERE id=?", [user_id])).fetchone()
        rm = dict(row._mapping) if row else {}
        prenom = rm.get("prenom", "l'utilisateur")
        role = rm.get("role", "client")
        ville = rm.get("ville", "")
        n_projects = conn.execute(*sql_params("SELECT COUNT(*) FROM projects WHERE user_id=?", [user_id])).fetchone()[0]
    finally:
        conn.close()

    return f"""Tu es l'assistant IA de ShantiLink, une plateforme marocaine de gestion de chantiers et projets de construction.

Tu aides {prenom} ({role}{', ' + ville if ville else ''}) à gérer son espace personnel.

## Contexte utilisateur
- Nombre de projets: {n_projects}
- Rôle: {role}

## Instructions essentielles
- Réponds TOUJOURS dans la même langue que l'utilisateur (français, arabe, ou darija marocain)
- Sois concis, précis et professionnel
- Tous les montants sont en dirhams marocains (MAD / DH)
- Pour les actions destructives (créer, modifier), utilise TOUJOURS le bon outil "propose_*" et explique ce que tu vas faire
- N'accède JAMAIS aux données d'autres utilisateurs
- Si tu ne sais pas quelque chose, dis-le honnêtement
- Pour naviguer vers une section, utilise l'outil navigate_to
- Pour récupérer des données, utilise get_user_data en premier si l'utilisateur pose des questions sur ses projets/dépenses

## Actions disponibles
- Naviguer dans le dashboard
- Répondre à des questions sur les projets, dépenses, planning
- Proposer de créer des projets ou dépenses (avec confirmation obligatoire de l'utilisateur)
- Analyser des documents uploadés
- Calculer des estimations de coût de construction"""

# ── Agent chat endpoint (streaming SSE) ──────────────────────────────────────
@app.post("/api/agent/chat")
async def agent_chat(data: AgentChatIn, user: dict = Depends(get_current_user)):
    if not ANTHROPIC_API_KEY:
        async def no_key():
            yield f"data: {json.dumps({'type': 'error', 'text': 'Agent IA non configuré. Veuillez définir la variable ANTHROPIC_API_KEY sur le serveur.'})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        return StreamingResponse(no_key(), media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    # Rate limit check
    conn = get_db()
    try:
        if not _check_rate_limit(conn, user["sub"]):
            conn.commit()
            async def rate_limited():
                yield f"data: {json.dumps({'type': 'error', 'text': 'Limite de requêtes atteinte (30/heure). Réessayez dans une heure.'})}\n\n"
                yield f"data: {json.dumps({'type': 'done'})}\n\n"
            return StreamingResponse(rate_limited(), media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
        conn.commit()
    finally:
        conn.close()

    user_id = user["sub"]
    messages = [{"role": m.role, "content": m.content} for m in data.messages]
    system_prompt = _build_system_prompt(user_id)

    async def stream_agent():
        try:
            import anthropic as _anthropic
            client = _anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
            api_messages = messages.copy()
            max_iterations = 5

            for _ in range(max_iterations):
                response = client.messages.create(
                    model=AGENT_MODEL,
                    max_tokens=2048,
                    system=system_prompt,
                    tools=AGENT_TOOLS,
                    messages=api_messages
                )

                # Collect text and tool use blocks
                text_parts = []
                tool_calls = []
                for block in response.content:
                    if block.type == "text":
                        text_parts.append(block.text)
                    elif block.type == "tool_use":
                        tool_calls.append(block)

                full_text = "".join(text_parts).strip()

                # Stream text in chunks for realistic effect
                if full_text:
                    chunk_size = 12
                    for i in range(0, len(full_text), chunk_size):
                        chunk = full_text[i:i+chunk_size]
                        yield f"data: {json.dumps({'type': 'text', 'text': chunk})}\n\n"
                        await asyncio.sleep(0.02)

                if response.stop_reason == "end_turn" or not tool_calls:
                    break

                # Execute tool calls
                api_messages.append({"role": "assistant", "content": response.content})
                tool_results = []

                for tc in tool_calls:
                    result = _execute_agent_tool(tc.name, tc.input, user_id)

                    # Emit navigation immediately to frontend
                    if tc.name == "navigate_to":
                        yield f"data: {json.dumps({'type': 'navigate', 'section': tc.input.get('section', 'overview')})}\n\n"

                    # Emit proposal cards
                    elif tc.name.startswith("propose_"):
                        action_map = {
                            "propose_create_project": "create_project",
                            "propose_add_expense": "add_expense",
                            "propose_add_planning_phase": "add_planning_phase"
                        }
                        yield f"data: {json.dumps({'type': 'proposal', 'action': action_map.get(tc.name, tc.name), 'parameters': tc.input})}\n\n"

                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": tc.id,
                        "content": json.dumps(result, ensure_ascii=False)
                    })

                api_messages.append({"role": "user", "content": tool_results})

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'text': f'Erreur agent: {str(e)[:200]}'})}\n\n"

        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(stream_agent(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ── Agent execute confirmed action ────────────────────────────────────────────
@app.post("/api/agent/execute")
def agent_execute(data: AgentExecuteIn, user: dict = Depends(get_current_user)):
    user_id = user["sub"]
    action = data.action
    params = data.parameters
    conn = get_db()
    try:
        result = {}
        if action == "create_project":
            proj_id = "p" + uid()
            conn.execute(*sql_params(
                "INSERT INTO projects (id,user_id,nom,ville,budget,type,description,pct,created_at) VALUES (?,?,?,?,?,?,?,0,?)",
                [proj_id, user_id, params.get("nom","Projet"), params.get("ville",""),
                 params.get("budget", 0), params.get("type","Villa / Maison individuelle"),
                 params.get("description",""), now_iso()]
            ))
            log_activity(conn, user_id, f"Projet créé via agent IA: {params.get('nom','')}")
            _log_agent_action(conn, user_id, action, params, {"project_id": proj_id}, data.user_message)
            conn.commit()
            result = {"ok": True, "project_id": proj_id, "message": f"Projet '{params.get('nom','')}' créé avec succès."}

        elif action == "add_expense":
            exp_id = "e" + uid()
            conn.execute(*sql_params(
                "INSERT INTO expenses (id,user_id,project_id,description,montant,categorie,date) VALUES (?,?,?,?,?,?,?)",
                [exp_id, user_id, params.get("project_id"), params.get("description",""),
                 params.get("montant", 0), params.get("categorie","Autre"),
                 params.get("date", now_iso()[:10])]
            ))
            log_activity(conn, user_id, f"Dépense ajoutée via agent IA: {params.get('description','')} — {params.get('montant',0)} DH")
            _log_agent_action(conn, user_id, action, params, {"expense_id": exp_id}, data.user_message)
            conn.commit()
            result = {"ok": True, "expense_id": exp_id, "message": f"Dépense de {params.get('montant',0)} DH ajoutée."}

        elif action == "add_planning_phase":
            proj_id = params.get("project_id")
            if not proj_id:
                raise HTTPException(400, "project_id requis")
            proj = conn.execute(*sql_params("SELECT phases FROM projects WHERE id=? AND user_id=?", [proj_id, user_id])).fetchone()
            if not proj:
                raise HTTPException(404, "Projet non trouvé")
            try:
                phases = json.loads(proj[0] or "[]")
            except Exception:
                phases = []
            new_phase = {
                "id": uid(),
                "name": params.get("name","Nouvelle phase"),
                "start": params.get("start_date", now_iso()[:10]),
                "end": params.get("end_date", now_iso()[:10]),
                "done": False
            }
            phases.append(new_phase)
            conn.execute(*sql_params("UPDATE projects SET phases=? WHERE id=?", [json.dumps(phases), proj_id]))
            _log_agent_action(conn, user_id, action, params, {"phase_id": new_phase["id"]}, data.user_message)
            conn.commit()
            result = {"ok": True, "phase_id": new_phase["id"], "message": f"Phase '{new_phase['name']}' ajoutée au planning."}

        else:
            raise HTTPException(400, f"Action inconnue: {action}")

        return result
    finally:
        conn.close()


# ── Agent file analysis ───────────────────────────────────────────────────────
@app.post("/api/agent/analyze")
async def agent_analyze(
    file: UploadFile = File(...),
    instruction: str = Form(default="Analyse ce document et extrait les informations utiles pour la gestion de chantier: montants, dates, noms, adresses, références."),
    user: dict = Depends(get_current_user)
):
    if not ANTHROPIC_API_KEY:
        raise HTTPException(503, "Agent IA non configuré")

    # File size limit: 10MB
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(413, "Fichier trop volumineux (max 10 MB)")

    fname = (file.filename or "document").lower()
    ext = fname.rsplit(".", 1)[-1] if "." in fname else ""

    import anthropic as _anthropic
    client = _anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    try:
        # Build content for Claude
        msg_content = []
        b64 = base64.standard_b64encode(content).decode()

        if ext in ("jpg", "jpeg", "png", "gif", "webp"):
            media_map = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "gif": "image/gif", "webp": "image/webp"}
            msg_content.append({
                "type": "image",
                "source": {"type": "base64", "media_type": media_map.get(ext, "image/jpeg"), "data": b64}
            })
        elif ext == "pdf":
            msg_content.append({
                "type": "document",
                "source": {"type": "base64", "media_type": "application/pdf", "data": b64}
            })
        else:
            # Try to decode as text
            try:
                text_content = content.decode("utf-8", errors="replace")[:8000]
                msg_content.append({"type": "text", "text": f"Contenu du fichier '{file.filename}':\n\n{text_content}"})
            except Exception:
                raise HTTPException(422, "Type de fichier non supporté pour l'analyse")

        msg_content.append({"type": "text", "text": instruction + "\n\nRéponds en JSON avec les champs: { summary, extracted_data: { amounts[], dates[], names[], addresses[], references[] }, suggested_actions[] }"})

        response = client.messages.create(
            model=AGENT_MODEL,
            max_tokens=1500,
            messages=[{"role": "user", "content": msg_content}]
        )

        text = next((b.text for b in response.content if b.type == "text"), "{}")
        # Try to extract JSON from response
        try:
            start = text.find("{")
            end = text.rfind("}") + 1
            parsed = json.loads(text[start:end]) if start >= 0 else {"summary": text}
        except Exception:
            parsed = {"summary": text}

        return {"ok": True, "filename": file.filename, "analysis": parsed}

    except _anthropic.APIError as e:
        raise HTTPException(502, f"Erreur API Claude: {str(e)[:200]}")


# ── Agent audit logs ──────────────────────────────────────────────────────────
@app.get("/api/agent/logs")
def agent_logs(user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        rows = conn.execute(
            *sql_params("SELECT action, parameters, result, user_message, created_at FROM agent_audit_log WHERE user_id=? ORDER BY created_at DESC LIMIT 50", [user["sub"]])
        ).fetchall()
        return [dict(r._mapping) for r in rows]
    finally:
        conn.close()


# ── Project Briefs (Demandes de devis) ────────────────────────────────────────
@app.post("/api/briefs", status_code=201)
def create_brief(data: BriefIn, user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        bid = "b" + uid()
        conn.execute(*sql_params(
            "INSERT INTO project_briefs (id,user_id,titre,description,ville,categorie,budget_min,budget_max,deadline,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            [bid, user["sub"], data.titre, data.description, data.ville, data.categorie,
             data.budget_min, data.budget_max, data.deadline, "open", now_iso()]
        ))
        log_activity(conn, user["sub"], f"Demande de devis publiée : {data.titre}")
        conn.commit()
        row = conn.execute(*sql_params("SELECT * FROM project_briefs WHERE id=?", [bid])).fetchone()
        return dict(row._mapping)
    finally:
        conn.close()

@app.get("/api/briefs")
def list_briefs(ville: Optional[str] = None, categorie: Optional[str] = None,
                user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        query = "SELECT pb.*, u.prenom, u.nom FROM project_briefs pb JOIN users u ON pb.user_id=u.id WHERE pb.status='open'"
        params = []
        if ville:
            query += " AND pb.ville=?"; params.append(ville)
        if categorie:
            query += " AND pb.categorie=?"; params.append(categorie)
        query += " ORDER BY pb.created_at DESC LIMIT 50"
        rows = conn.execute(*sql_params(query, params)).fetchall()
        return [dict(r._mapping) for r in rows]
    finally:
        conn.close()

@app.get("/api/briefs/mine")
def my_briefs(user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        rows = conn.execute(
            *sql_params("SELECT * FROM project_briefs WHERE user_id=? ORDER BY created_at DESC", [user["sub"]])
        ).fetchall()
        result = []
        for r in rows:
            brief = dict(r._mapping)
            responses = conn.execute(
                *sql_params("SELECT br.*, u.prenom, u.nom, u.ville, u.tel FROM brief_responses br JOIN users u ON br.pro_user_id=u.id WHERE br.brief_id=? ORDER BY br.created_at DESC", [brief["id"]])
            ).fetchall()
            brief["responses"] = [dict(resp._mapping) for resp in responses]
            result.append(brief)
        return result
    finally:
        conn.close()

@app.post("/api/briefs/{brief_id}/respond", status_code=201)
def respond_brief(brief_id: str, data: BriefResponseIn, user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        _br = conn.execute(*sql_params("SELECT * FROM project_briefs WHERE id=?", [brief_id])).fetchone()
        if not _br:
            raise HTTPException(404, "Demande non trouvée")
        brief = dict(_br._mapping)
        if brief["status"] != "open":
            raise HTTPException(400, "Cette demande est clôturée")
        existing = conn.execute(
            *sql_params("SELECT id FROM brief_responses WHERE brief_id=? AND pro_user_id=?", [brief_id, user["sub"]])
        ).fetchone()
        if existing:
            raise HTTPException(409, "Vous avez déjà répondu à cette demande")
        rid = "br" + uid()
        conn.execute(*sql_params(
            "INSERT INTO brief_responses (id,brief_id,pro_user_id,message,prix,delai,status,created_at) VALUES (?,?,?,?,?,?,?,?)",
            [rid, brief_id, user["sub"], data.message, data.prix, data.delai, "pending", now_iso()]
        ))
        log_activity(conn, user["sub"], f"Réponse envoyée pour la demande : {brief['titre']}")
        conn.commit()
        return {"ok": True, "id": rid}
    finally:
        conn.close()

@app.delete("/api/briefs/{brief_id}")
def delete_brief(brief_id: str, user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        _br = conn.execute(*sql_params("SELECT * FROM project_briefs WHERE id=?", [brief_id])).fetchone()
        if not _br:
            raise HTTPException(404, "Demande non trouvée")
        brief = dict(_br._mapping)
        if brief["user_id"] != user["sub"]:
            raise HTTPException(403, "Non autorisé")
        conn.execute(*sql_params("DELETE FROM project_briefs WHERE id=?", [brief_id]))
        conn.execute(*sql_params("DELETE FROM brief_responses WHERE brief_id=?", [brief_id]))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()

@app.patch("/api/briefs/{brief_id}/close")
def close_brief(brief_id: str, user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        _br = conn.execute(*sql_params("SELECT * FROM project_briefs WHERE id=?", [brief_id])).fetchone()
        brief = dict(_br._mapping) if _br else None
        if not brief or brief["user_id"] != user["sub"]:
            raise HTTPException(403, "Non autorisé")
        conn.execute(*sql_params("UPDATE project_briefs SET status='closed' WHERE id=?", [brief_id]))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()

# ── Reviews ────────────────────────────────────────────────────────────────────
@app.post("/api/reviews", status_code=201)
def create_review(data: ReviewIn, user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        if not 1 <= data.rating <= 5:
            raise HTTPException(400, "Note entre 1 et 5")
        existing = conn.execute(
            *sql_params("SELECT id FROM pro_reviews WHERE reviewer_id=? AND pro_catalog_id=? AND pro_user_id=?",
                        [user["sub"], data.pro_catalog_id or 0, data.pro_user_id or ""])
        ).fetchone()
        if existing:
            raise HTTPException(409, "Vous avez déjà noté ce professionnel")
        rid = "rv" + uid()
        conn.execute(*sql_params(
            "INSERT INTO pro_reviews (id,reviewer_id,pro_user_id,pro_catalog_id,project_id,rating,comment,created_at) VALUES (?,?,?,?,?,?,?,?)",
            [rid, user["sub"], data.pro_user_id or "", data.pro_catalog_id or 0,
             data.project_id or "", data.rating, data.comment, now_iso()]
        ))
        conn.commit()
        return {"ok": True, "id": rid}
    finally:
        conn.close()

@app.get("/api/reviews/pro/{pro_id}")
def get_pro_reviews(pro_id: int):
    conn = get_db()
    try:
        rows = conn.execute(
            *sql_params("SELECT pr.*, u.prenom, u.nom FROM pro_reviews pr JOIN users u ON pr.reviewer_id=u.id WHERE pr.pro_catalog_id=? ORDER BY pr.created_at DESC", [pro_id])
        ).fetchall()
        return [dict(r._mapping) for r in rows]
    finally:
        conn.close()

# ── Referrals ──────────────────────────────────────────────────────────────────
@app.get("/api/referrals")
def get_referrals(user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        rows = conn.execute(
            *sql_params("SELECT * FROM referrals WHERE referrer_id=? ORDER BY created_at DESC", [user["sub"]])
        ).fetchall()
        return [dict(r._mapping) for r in rows]
    finally:
        conn.close()

@app.get("/api/stats/platform")
def platform_stats():
    conn = get_db()
    try:
        pro_count = conn.execute(text("SELECT COUNT(*) FROM professionals")).fetchone()[0]
        project_count = conn.execute(text("SELECT COUNT(*) FROM projects")).fetchone()[0]
        user_count = conn.execute(text("SELECT COUNT(*) FROM users")).fetchone()[0]
        city_count = conn.execute(text("SELECT COUNT(DISTINCT ville) FROM professionals WHERE ville!=''")).fetchone()[0]
        return {
            "pros": pro_count,
            "projects": project_count,
            "users": user_count,
            "cities": city_count
        }
    finally:
        conn.close()

# ── Plan status & trial ───────────────────────────────────────────────────────
@app.get("/api/plan/status")
def plan_status(user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        row = conn.execute(*sql_params("SELECT plan, plan_expires FROM users WHERE id=?", [user["sub"]])).fetchone()
        rm = dict(row._mapping) if row else {}
        plan = (rm.get("plan") or "starter")
        expires = (rm.get("plan_expires") or "")
        proj_count = conn.execute(*sql_params("SELECT COUNT(*) FROM projects WHERE user_id=?", [user["sub"]])).fetchone()[0]
        limits = PLAN_LIMITS.get(plan, PLAN_LIMITS["starter"])
        return {
            "plan": plan,
            "plan_expires": expires,
            "limits": limits,
            "price": PLAN_PRICES.get(plan, 0),
            "usage": {"projects": proj_count},
        }
    finally:
        conn.close()

@app.post("/api/plan/trial")
def activate_trial(user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        row = conn.execute(*sql_params("SELECT plan, plan_expires FROM users WHERE id=?", [user["sub"]])).fetchone()
        if not row:
            raise HTTPException(404, "Utilisateur non trouvé")
        rm = dict(row._mapping)
        plan = rm.get("plan") or "starter"
        if plan != "starter":
            raise HTTPException(400, "Essai disponible uniquement depuis le plan Starter")
        expires = rm.get("plan_expires") or ""
        if expires:
            raise HTTPException(400, "Vous avez déjà utilisé votre essai gratuit")
        from datetime import timedelta
        trial_end = (datetime.utcnow() + timedelta(days=30)).isoformat()
        conn.execute(*sql_params("UPDATE users SET plan='pro', plan_expires=? WHERE id=?", [trial_end, user["sub"]]))
        log_activity(conn, user["sub"], "Essai Pro 30 jours activé")
        conn.commit()
        return {"ok": True, "plan": "pro", "plan_expires": trial_end, "message": "Essai Pro 30 jours activé !"}
    finally:
        conn.close()

# ── User-to-user direct messaging ─────────────────────────────────────────────
@app.get("/api/chat")
def list_chats(user: dict = Depends(get_current_user)):
    """List all DM conversations for the current user."""
    conn = get_db()
    try:
        uid = user["sub"]
        rows = conn.execute(*sql_params("""
            SELECT
                CASE WHEN uc.sender_id=? THEN uc.recipient_id ELSE uc.sender_id END AS other_id,
                u.prenom, u.nom, u.role, u.ville, u.photo_url,
                MAX(uc.created_at) AS last_at,
                (SELECT content FROM user_chats uc2
                 WHERE (uc2.sender_id=? AND uc2.recipient_id=CASE WHEN uc.sender_id=? THEN uc.recipient_id ELSE uc.sender_id END)
                    OR (uc2.sender_id=CASE WHEN uc.sender_id=? THEN uc.recipient_id ELSE uc.sender_id END AND uc2.recipient_id=?)
                 ORDER BY uc2.created_at DESC LIMIT 1) AS last_msg,
                SUM(CASE WHEN uc.recipient_id=? AND (uc.read_at IS NULL OR uc.read_at='') THEN 1 ELSE 0 END) AS unread
            FROM user_chats uc
            JOIN users u ON u.id = CASE WHEN uc.sender_id=? THEN uc.recipient_id ELSE uc.sender_id END
            WHERE uc.sender_id=? OR uc.recipient_id=?
            GROUP BY CASE WHEN uc.sender_id=? THEN uc.recipient_id ELSE uc.sender_id END,
                     u.prenom, u.nom, u.role, u.ville, u.photo_url
            ORDER BY last_at DESC
        """, [uid, uid, uid, uid, uid, uid, uid, uid, uid, uid])).fetchall()
        return [dict(r._mapping) for r in rows]
    finally:
        conn.close()

@app.get("/api/chat/{other_id}")
def get_chat(other_id: str, user: dict = Depends(get_current_user)):
    """Get message history with a specific user and mark as read."""
    conn = get_db()
    try:
        other = conn.execute(*sql_params("SELECT id,prenom,nom,role,ville,photo_url FROM users WHERE id=?", [other_id])).fetchone()
        if not other:
            raise HTTPException(404, "Utilisateur non trouvé")
        rows = conn.execute(*sql_params("""
            SELECT * FROM user_chats
            WHERE (sender_id=? AND recipient_id=?) OR (sender_id=? AND recipient_id=?)
            ORDER BY created_at ASC
        """, [user["sub"], other_id, other_id, user["sub"]])).fetchall()
        # Mark incoming messages as read
        conn.execute(*sql_params(
            "UPDATE user_chats SET read_at=? WHERE sender_id=? AND recipient_id=? AND (read_at IS NULL OR read_at='')",
            [now_iso(), other_id, user["sub"]]
        ))
        conn.commit()
        return {
            "other": dict(other._mapping),
            "messages": [dict(r._mapping) for r in rows]
        }
    finally:
        conn.close()

@app.post("/api/chat/{other_id}", status_code=201)
def send_chat(other_id: str, data: ChatMessageIn, user: dict = Depends(get_current_user)):
    """Send a message to another registered user."""
    if not data.content or not data.content.strip():
        raise HTTPException(400, "Le message ne peut pas être vide")
    if other_id == user["sub"]:
        raise HTTPException(400, "Vous ne pouvez pas vous envoyer un message")
    conn = get_db()
    try:
        other = conn.execute(*sql_params("SELECT id FROM users WHERE id=?", [other_id])).fetchone()
        if not other:
            raise HTTPException(404, "Destinataire non trouvé")
        mid = "uc" + uid()
        conn.execute(*sql_params(
            "INSERT INTO user_chats (id,sender_id,recipient_id,content,created_at) VALUES (?,?,?,?,?)",
            [mid, user["sub"], other_id, data.content.strip()[:2000], now_iso()]
        ))
        conn.commit()
        return {"ok": True, "id": mid, "created_at": now_iso()}
    finally:
        conn.close()

# ── Analyse IA de reçus / documents BTP ──────────────────────────────────────
_RECEIPT_SYSTEM = """Tu es un assistant spécialisé dans l'extraction de données de documents BTP marocains.
Analyse l'image fournie (ticket de caisse, facture, bon de livraison, étiquette de prix)
et retourne UNIQUEMENT un objet JSON valide avec ces champs :
{
  "montant": <nombre ou null>,
  "devise": "MAD" | "EUR" | null,
  "fournisseur": <string ou null>,
  "date": <"YYYY-MM-DD" ou null>,
  "description": <string court ou null>,
  "categorie": "materiaux"|"maindoeuvre"|"transport"|"equipement"|"autre"|null,
  "articles": [{"nom":string,"quantite":number,"prix_unitaire":number}] | null
}
Règles : montant en dirhams → devise MAD. Retourne SEULEMENT le JSON, sans texte autour."""

_VOICE_SYSTEM = """Tu es un assistant BTP marocain. L'utilisateur parle en français ou en darija marocaine.
Extrais les informations financières depuis ce texte et retourne UNIQUEMENT un objet JSON :
{
  "montant": <nombre ou null>,
  "devise": "MAD" | "EUR" | null,
  "fournisseur": <string ou null>,
  "date": <"YYYY-MM-DD" ou null>,
  "description": <string ou null>,
  "categorie": "materiaux"|"maindoeuvre"|"transport"|"equipement"|"autre"|null
}
Exemples darija : "khems miyya d reaux" = 500 MAD. Retourne SEULEMENT le JSON."""

class AnalyzeReceiptIn(BaseModel):
    image: str        # base64
    media_type: str = "image/jpeg"

class ExtractVoiceIn(BaseModel):
    transcription: str

@app.post("/api/analyze-receipt")
async def analyze_receipt(data: AnalyzeReceiptIn, user: dict = Depends(get_current_user)):
    if not ANTHROPIC_API_KEY:
        raise HTTPException(400, "Analyse IA non configurée sur ce serveur.")
    try:
        import anthropic as _anthropic
        client = _anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
        response = client.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=800,
            system=_RECEIPT_SYSTEM,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": data.media_type, "data": data.image}},
                    {"type": "text", "text": "Extrais les données de ce document BTP."}
                ]
            }]
        )
        raw = response.content[0].text if response.content else ""
        import re as _re
        m = _re.search(r'\{[\s\S]*\}', raw)
        if not m:
            return {"result": None}
        return {"result": json.loads(m.group(0))}
    except Exception as e:
        raise HTTPException(500, f"Analyse échouée : {str(e)}")

def _extract_voice_regex(transcription: str) -> dict:
    """Extraction locale French + Darija — zéro API, zéro coût."""
    import re as _re
    t = transcription.lower().strip()
    result: dict = {"devise": "MAD", "date": now_iso()[:10]}

    # Montant : priorité au nombre avant/après DH/MAD, sinon le plus grand
    pm = _re.search(r'(\d[\d\s]*(?:[.,]\d{1,2})?)\s*(?:dh|mad|dirham)', t) or \
         _re.search(r'(?:à|a|pour|coûte?|prix)\s*(\d[\d\s]*(?:[.,]\d{1,2})?)', t)
    if pm:
        result["montant"] = float(pm.group(1).replace(' ','').replace(',','.'))
    else:
        nums = [float(x.replace(',','.')) for x in _re.findall(r'\d+(?:[.,]\d{1,2})?', t)
                if float(x.replace(',','.')) > 9]
        if nums: result["montant"] = max(nums)
    # Darija / mots français (si pas de montant numérique trouvé)
    if "montant" not in result:
        darija = [
            (r'miyatayn|miytin|deux\s*cent', 200), (r'tlet\s*miyya|trois\s*cent', 300),
            (r'rba3\s*miyya|quatre\s*cent', 400),  (r'khemsa?\s*miyya|cinq\s*cent', 500),
            (r'setta?\s*miyya|six\s*cent', 600),    (r'sba3\s*miyya|sept\s*cent', 700),
            (r'tmanya\s*miyya|huit\s*cent', 800),   (r'ts3ud\s*miyya|neuf\s*cent', 900),
            (r'alfayn|alfen|deux\s*mille', 2000),   (r'\balf\b|mille(?!\s*\d)', 1000),
            (r'\bmiyya\b|miya\b|cent(?!\s*\d)', 100),
        ]
        for pat, val in darija:
            if _re.search(pat, t):
                result["montant"] = float(val); break

    # Date
    if _re.search(r"aujourd.?hui|lyoum|l\s?yom", t):
        pass  # already today
    elif _re.search(r"hier|lbara7", t):
        from datetime import date, timedelta
        result["date"] = (date.today() - timedelta(days=1)).isoformat()
    elif _re.search(r"avant.?hier", t):
        from datetime import date, timedelta
        result["date"] = (date.today() - timedelta(days=2)).isoformat()

    # Fournisseur
    fm = _re.search(r'(?:chez|de\s*chez|3nd)\s+([a-zÀ-ÿ0-9]+(?:\s+[a-zÀ-ÿ0-9]+)?)', t)
    if fm:
        result["fournisseur"] = fm.group(1).strip().title()
        result["description"] = result["fournisseur"]

    # Catégorie
    cat_map = [
        (['ciment','sable','gravier','fer ','brique','béton','beton','parpaing','lhajra','lhdid','mwad'], 'materiaux'),
        (['ouvrier','maçon','macon','khdama','main.d','plâtrier','carreleur'], 'maindoeuvre'),
        (['transport','camion','livraison','chauffeur'], 'transport'),
        (['outil','machine','bétonnière','betoniere','perceuse','moada'], 'equipement'),
        (['architecte','honoraire','ingénieur','ujra'], 'honoraires'),
        (['électricité','electricite','câble','disjoncteur','kahrrba'], 'electricite'),
        (['plomberie','tuyau','robinet','sanitaire','sabak'], 'plomberie'),
        (['peinture','enduit','lwan'], 'peinture'),
        (['menuiserie','porte ','fenêtre','bois ','nijara'], 'menuiserie'),
        (['carrelage','zelij','faience'], 'carrelage'),
    ]
    for kws, cat in cat_map:
        if any(k in t for k in kws):
            result["categorie"] = cat
            break
    else:
        result["categorie"] = "autre"

    if "description" not in result:
        result["description"] = result.get("categorie", "")

    return result

@app.post("/api/extract-voice")
async def extract_voice(data: ExtractVoiceIn, user: dict = Depends(get_current_user)):
    # Si Anthropic configuré → utilise l'IA, sinon → regex local gratuit
    if ANTHROPIC_API_KEY:
        try:
            import anthropic as _anthropic
            client = _anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
            today = now_iso()[:10]
            response = client.messages.create(
                model="claude-sonnet-4-5", max_tokens=400,
                system=_VOICE_SYSTEM + f"\nDate du jour : {today}",
                messages=[{"role": "user", "content": f'Transcription : "{data.transcription}"'}]
            )
            raw = response.content[0].text if response.content else ""
            import re as _re
            m = _re.search(r'\{[\s\S]*\}', raw)
            if m:
                return {"result": json.loads(m.group(0))}
        except Exception:
            pass  # fallback regex
    return {"result": _extract_voice_regex(data.transcription)}

# ── Admin routes ───────────────────────────────────────────────────────────────
def require_admin(user: dict = Depends(get_current_user)):
    conn = get_db()
    try:
        row = conn.execute(*sql_params("SELECT role FROM users WHERE id=?", [user["sub"]])).fetchone()
        if not row or row[0] != "admin":
            raise HTTPException(403, "Accès réservé aux administrateurs")
        return user
    finally:
        conn.close()

@app.get("/api/admin/stats")
def admin_stats(admin=Depends(require_admin)):
    conn = get_db()
    try:
        today = now_iso()[:10]
        total_users    = conn.execute(text("SELECT COUNT(*) FROM users")).fetchone()[0]
        new_today      = conn.execute(*sql_params("SELECT COUNT(*) FROM users WHERE created_at >= ?", [today])).fetchone()[0]
        total_projects = conn.execute(text("SELECT COUNT(*) FROM projects")).fetchone()[0]
        total_expenses = conn.execute(text("SELECT COALESCE(SUM(montant),0) FROM expenses WHERE deleted=0")).fetchone()[0]
        total_posts    = conn.execute(text("SELECT COUNT(*) FROM community_posts")).fetchone()[0]
        return {
            "total_users": total_users,
            "new_users_today": new_today,
            "total_projects": total_projects,
            "total_expenses": float(total_expenses),
            "total_posts": total_posts,
        }
    finally:
        conn.close()

@app.get("/api/admin/users")
def admin_list_users(skip: int = 0, limit: int = 50, admin=Depends(require_admin)):
    conn = get_db()
    try:
        rows = conn.execute(*sql_params("""
            SELECT u.id, u.prenom, u.nom, u.email, u.role, u.ville, u.plan, u.created_at,
                   COUNT(p.id) as nb_projects
            FROM users u
            LEFT JOIN projects p ON p.user_id = u.id
            GROUP BY u.id
            ORDER BY u.created_at DESC
            LIMIT ? OFFSET ?
        """, [limit, skip])).fetchall()
        return [dict(r._mapping) for r in rows]
    finally:
        conn.close()

@app.put("/api/admin/users/{user_id}/role")
def admin_update_role(user_id: str, body: dict, admin=Depends(require_admin)):
    conn = get_db()
    try:
        new_role = body.get("role", "client")
        if new_role not in ["client","pro","admin","promoteur","architecte","comptable","bureau","notaire","electricien","plombier","autre"]:
            raise HTTPException(400, "Rôle invalide")
        conn.execute(*sql_params("UPDATE users SET role=? WHERE id=?", [new_role, user_id]))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()

@app.delete("/api/admin/users/{user_id}")
def admin_delete_user(user_id: str, admin=Depends(require_admin)):
    conn = get_db()
    try:
        conn.execute(*sql_params("DELETE FROM users WHERE id=?", [user_id]))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()

@app.put("/api/admin/posts/{post_id}/pin")
def admin_pin_post(post_id: str, body: dict, admin=Depends(require_admin)):
    conn = get_db()
    try:
        val = 1 if body.get("pin") else 0
        conn.execute(*sql_params("UPDATE community_posts SET est_epingle=? WHERE id=?", [val, post_id]))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()

@app.patch("/api/admin/posts/{post_id}")
def admin_update_post(post_id: str, body: dict, admin=Depends(require_admin)):
    """Update titre, content, tags, media_url, est_epingle of a post (admin only)."""
    conn = get_db()
    try:
        fields, vals = [], []
        for col in ("titre", "content", "tags", "media_url", "media_urls", "est_epingle"):
            if col in body:
                fields.append(col + "=?")
                vals.append(body[col])
        if not fields:
            raise HTTPException(400, "Aucun champ à mettre à jour")
        vals.append(post_id)
        conn.execute(*sql_params(
            f"UPDATE community_posts SET {', '.join(fields)} WHERE id=?", vals
        ))
        conn.commit()
        return {"ok": True, "post_id": post_id}
    finally:
        conn.close()

@app.delete("/api/admin/posts/{post_id}")
def admin_delete_post(post_id: str, admin=Depends(require_admin)):
    conn = get_db()
    try:
        conn.execute(*sql_params("DELETE FROM community_posts WHERE id=?", [post_id]))
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()

@app.post("/api/posts/upload-media")
async def upload_post_media(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    """Upload un média pour un post communauté (Cloudinary si configuré, sinon local)."""
    ALLOWED_IMAGES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
    ALLOWED_VIDEOS = {"video/mp4", "video/webm", "video/quicktime"}
    ALLOWED = ALLOWED_IMAGES | ALLOWED_VIDEOS

    ct = file.content_type or ""
    if ct not in ALLOWED:
        raise HTTPException(400, "Format non supporté. Acceptés : JPG, PNG, GIF, WEBP, MP4, WEBM")

    is_video = ct.startswith("video/")
    MAX_SIZE = 50 * 1024 * 1024 if is_video else 10 * 1024 * 1024
    contents = await file.read()
    if len(contents) > MAX_SIZE:
        limit_label = "50MB" if is_video else "10MB"
        raise HTTPException(400, f"Fichier trop volumineux. Limite : {limit_label}")

    media_type = "video" if is_video else "image"

    # ── Cloudinary path ───────────────────────────────────────────────────────
    if _CLOUDINARY_OK:
        try:
            result = cloudinary.uploader.upload(
                contents,
                folder        = f"shantilink/posts/{user['sub']}",
                resource_type = media_type,
                transformation = [
                    {"width": 1200, "height": 900, "crop": "limit", "quality": "auto:good"}
                ] if media_type == "image" else [],
                eager = [
                    {"width": 600, "height": 450, "crop": "fill", "format": "jpg"}
                ] if media_type == "video" else [],
            )
            thumbnail = (result.get("eager") or [{}])[0].get("secure_url", result["secure_url"]) if is_video else result["secure_url"]
            return {
                "url":       result["secure_url"],
                "type":      media_type,
                "thumbnail": thumbnail,
                "public_id": result["public_id"],
                "width":     result.get("width"),
                "height":    result.get("height"),
            }
        except Exception as e:
            raise HTTPException(500, f"Erreur Cloudinary : {str(e)}")

    # ── Fallback : stockage local ─────────────────────────────────────────────
    ext = os.path.splitext(file.filename or "file")[-1].lower() or (".mp4" if is_video else ".jpg")
    fname = "cm_" + uid() + ext
    dest  = os.path.join(UPLOADS_DIR, fname)
    with open(dest, "wb") as f:
        f.write(contents)
    url = "/static/uploads/" + fname
    return {"url": url, "type": media_type, "thumbnail": url, "public_id": fname, "width": None, "height": None}


@app.delete("/api/posts/media/{public_id:path}")
async def delete_post_media(public_id: str, user: dict = Depends(get_current_user)):
    """Supprime un média uploadé (si l'utilisateur annule sa publication)."""
    if _CLOUDINARY_OK:
        # Sécurité : vérifie que le public_id appartient à cet utilisateur
        if f"posts/{user['sub']}" not in public_id and "admin" not in public_id:
            raise HTTPException(403, "Non autorisé")
        try:
            cloudinary.uploader.destroy(public_id, resource_type="image")
        except Exception:
            pass  # silencieux si déjà supprimé
    else:
        # Local : supprime le fichier
        fname = os.path.basename(public_id)
        path  = os.path.join(UPLOADS_DIR, fname)
        if os.path.exists(path):
            os.remove(path)
    return {"ok": True}


@app.post("/bootstrap/admin")
def bootstrap_admin(body: dict):
    secret = os.environ.get("BOOTSTRAP_SECRET", "")
    if not secret or body.get("secret") != secret:
        raise HTTPException(403, "Clé invalide")
    conn = get_db()
    try:
        existing = conn.execute(text("SELECT id FROM users WHERE role='admin' LIMIT 1")).fetchone()
        if existing:
            raise HTTPException(400, "Admin déjà existant")
        pwd = body.get("password", "Admin2024!")
        uid_val = "admin-" + uid()
        hashed = hash_password(pwd)
        code = "SLADMIN"
        conn.execute(*sql_params(
            "INSERT INTO users (id,prenom,nom,email,password_hash,role,ville,referral_code,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
            [uid_val, "Admin", "ShantiLink", "admin@shantilink.ma", hashed, "admin", "Casablanca", code, now_iso()]
        ))
        conn.commit()
        return {"ok": True, "email": "admin@shantilink.ma", "id": uid_val}
    finally:
        conn.close()

@app.post("/bootstrap/reset-admin")
def bootstrap_reset_admin(body: dict):
    secret = os.environ.get("BOOTSTRAP_SECRET", "")
    if not secret or body.get("secret") != secret:
        raise HTTPException(403, "Clé invalide")
    pwd = body.get("password")
    if not pwd or len(pwd) < 6:
        raise HTTPException(400, "Mot de passe trop court (min 6 caractères)")
    conn = get_db()
    try:
        row = conn.execute(text("SELECT id, email FROM users WHERE role='admin' LIMIT 1")).fetchone()
        if not row:
            raise HTTPException(404, "Aucun admin trouvé")
        hashed = hash_password(pwd)
        conn.execute(*sql_params("UPDATE users SET password_hash=? WHERE id=?", [hashed, row[0]]))
        conn.commit()
        return {"ok": True, "email": row[1], "message": "Mot de passe réinitialisé"}
    finally:
        conn.close()

# ── Static files & SPA ────────────────────────────────────────────────────────
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/")
async def root():
    landing = os.path.join(STATIC_DIR, "landing.html")
    target = landing if os.path.exists(landing) else os.path.join(STATIC_DIR, "index.html")
    resp = FileResponse(target)
    resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return resp

@app.get("/app")
async def serve_app():
    resp = FileResponse(os.path.join(STATIC_DIR, "index.html"))
    resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return resp

@app.get("/{path:path}")
async def spa_fallback(path: str):
    if path.startswith("api/"):
        raise HTTPException(404, "Route API non trouvée")
    idx = os.path.join(STATIC_DIR, "index.html")
    return FileResponse(idx) if os.path.exists(idx) else JSONResponse({"error": "Frontend manquant"}, 404)
