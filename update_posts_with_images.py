#!/usr/bin/env python3
"""
update_posts_with_images.py — ShantiLink
=========================================
Met à jour les 10 posts communauté seedés avec :
  - Le contenu enrichi complet
  - Les URLs d'images Cloudinary

USAGE :
  1. Remplis les URLs Cloudinary dans IMAGE_URLS ci-dessous
  2. Configure les variables d'environnement (ou modifie les constantes) :
       SHANTILINK_URL   → URL de ton déploiement Render
       ADMIN_EMAIL      → email de ton compte admin
       ADMIN_PASSWORD   → mot de passe de ton compte admin
  3. Lance : python update_posts_with_images.py

Optionnel — passe --dry-run pour voir les payloads sans écrire en base.
"""

import json
import sys
import os
import urllib.request
import urllib.error

# ─────────────────────────────────────────────────────────────────
# CONFIGURATION — À adapter
# ─────────────────────────────────────────────────────────────────

BASE_URL      = os.environ.get("SHANTILINK_URL", "https://shantilink.onrender.com")
ADMIN_EMAIL   = os.environ.get("ADMIN_EMAIL",    "team@shantilink.ma")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "CHANGE_ME")

# ─────────────────────────────────────────────────────────────────
# URLS CLOUDINARY — Remplis ces valeurs après upload sur Cloudinary
# Format : "https://res.cloudinary.com/TON_CLOUD/image/upload/shantilink/posts/admin/..."
# Laisse "" si l'image n'est pas encore prête
# ─────────────────────────────────────────────────────────────────

IMAGE_URLS = {
    "Post 10 — Bienvenue":              "/static/images/posts/post-bienvenue.svg",
    "Post 1 — Choisir entrepreneur":    "/static/images/posts/post-choisir-entrepreneur.svg",
    "Post 3 — Prix matériaux":          "/static/images/posts/post-prix-materiaux.svg",
    "Post 2 — Normes parasismiques":    "/static/images/posts/post-normes-parasismiques.svg",
    "Post 4 — Checklist réception":     "/static/images/posts/post-checklist-reception.svg",
    "Post 5 — Devis vs Contrat":        "/static/images/posts/post-devis-vs-contrat.svg",
    "Post 6 — Photos chantier":         "/static/images/posts/post-photos-chantier.svg",
    "Post 7 — Salaires BTP":            "/static/images/posts/post-salaires-btp.svg",
    "Post 8 — Isolation thermique":     "/static/images/posts/post-isolation-thermique.svg",
    "Post 9 — Lire un plan":            "/static/images/posts/post-lire-un-plan.svg",
}

# ─────────────────────────────────────────────────────────────────
# CONTENU COMPLET DES POSTS (correspondance titre → media_url)
# La clé "titre" doit correspondre EXACTEMENT au titre stocké en base
# ─────────────────────────────────────────────────────────────────

POSTS_DATA = [
    {
        "titre":     "Bienvenue sur la communauté ShantiLink 🏗️",
        "image_key": "Post 10 — Bienvenue",
        "tags":      '["annonce"]',
        "est_epingle": 1,
    },
    {
        "titre":     "Guide : Choisir un bon entrepreneur BTP au Maroc",
        "image_key": "Post 1 — Choisir entrepreneur",
        "tags":      '["conseil","client"]',
        "est_epingle": 1,
    },
    {
        "titre":     "Prix matériaux BTP Mai 2026 — Ciment, Fer, Sable",
        "image_key": "Post 3 — Prix matériaux",
        "tags":      '["matériaux","prix"]',
        "est_epingle": 0,
    },
    {
        "titre":     "Normes parasismiques RPS 2011 révisées — Impact sur vos chantiers",
        "image_key": "Post 2 — Normes parasismiques",
        "tags":      '["réglementation","pro"]',
        "est_epingle": 0,
    },
    {
        "titre":     "Checklist réception de chantier — Évitez les malfaçons",
        "image_key": "Post 4 — Checklist réception",
        "tags":      '["conseil","qualité","client"]',
        "est_epingle": 0,
    },
    {
        "titre":     "Devis vs Contrat : Ne confondez plus ces deux documents",
        "image_key": "Post 5 — Devis vs Contrat",
        "tags":      '["réglementation","client"]',
        "est_epingle": 0,
    },
    {
        "titre":     "Photographiez votre chantier : la meilleure protection contre les litiges",
        "image_key": "Post 6 — Photos chantier",
        "tags":      '["conseil","documentation"]',
        "est_epingle": 0,
    },
    {
        "titre":     "Grille des salaires BTP Maroc 2026 — Référence officielle",
        "image_key": "Post 7 — Salaires BTP",
        "tags":      '["ressources humaines","pro"]',
        "est_epingle": 0,
    },
    {
        "titre":     "Isolation thermique RTBM : Ce que la réglementation impose",
        "image_key": "Post 8 — Isolation thermique",
        "tags":      '["réglementation","énergie"]',
        "est_epingle": 0,
    },
    {
        "titre":     "Comment lire un plan d'architecte : Guide complet pour les clients",
        "image_key": "Post 9 — Lire un plan",
        "tags":      '["conseil","client","plans"]',
        "est_epingle": 0,
    },
]

# ─────────────────────────────────────────────────────────────────
# HELPERS HTTP (stdlib only — pas de dépendances externes)
# ─────────────────────────────────────────────────────────────────

def api_call(method: str, path: str, body: dict | None = None, token: str | None = None) -> dict:
    url = BASE_URL + path
    data = json.dumps(body).encode() if body else None
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        try:
            detail = json.loads(e.read()).get("detail", str(e))
        except Exception:
            detail = str(e)
        raise RuntimeError(f"HTTP {e.code} {method} {path} → {detail}")

def login(email: str, password: str) -> str:
    print(f"🔐 Connexion en tant que {email}…")
    resp = api_call("POST", "/api/auth/login", {"email": email, "password": password})
    token = resp.get("token") or resp.get("access_token")
    if not token:
        raise RuntimeError(f"Pas de token dans la réponse : {resp}")
    print("✅ Connecté.")
    return token

def get_posts(token: str) -> list[dict]:
    print("📥 Récupération des posts communauté…")
    posts = api_call("GET", "/api/community/posts?limit=50", token=token)
    print(f"   {len(posts)} posts trouvés.")
    return posts

def patch_post(token: str, post_id: str, payload: dict, dry_run: bool = False) -> None:
    if dry_run:
        print(f"   [DRY-RUN] PATCH /api/admin/posts/{post_id} → {payload}")
        return
    result = api_call("PATCH", f"/api/admin/posts/{post_id}", payload, token=token)
    if not result.get("ok"):
        raise RuntimeError(f"Réponse inattendue : {result}")

# ─────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────

def main():
    dry_run = "--dry-run" in sys.argv
    if dry_run:
        print("⚠️  Mode DRY-RUN activé — aucune modification ne sera écrite.\n")

    # Vérification basique
    missing_images = [k for k, v in IMAGE_URLS.items() if not v]
    if missing_images and not dry_run:
        print("⚠️  ATTENTION : les images suivantes n'ont pas encore d'URL Cloudinary :")
        for k in missing_images:
            print(f"   • {k}")
        print("   → Ces posts seront mis à jour sans image (media_url vide).\n")

    # Auth
    if dry_run:
        token = "DRY_RUN_TOKEN"
    else:
        if ADMIN_PASSWORD == "CHANGE_ME":
            print("❌ Configure ADMIN_PASSWORD avant de lancer ce script.")
            print("   Export : export ADMIN_PASSWORD='ton_mot_de_passe'")
            sys.exit(1)
        token = login(ADMIN_EMAIL, ADMIN_PASSWORD)

    # Fetch posts to build titre → id map
    if dry_run:
        print("[DRY-RUN] Simulation de la récupération des posts…")
        posts_map = {p["titre"]: f"cp_fake_{i}" for i, p in enumerate(POSTS_DATA)}
    else:
        remote_posts = get_posts(token)
        posts_map = {p["titre"]: p["id"] for p in remote_posts}

    # Update each post
    updated = 0
    skipped = 0
    errors  = 0

    print(f"\n{'─'*60}")
    print(f"{'DRY-RUN ' if dry_run else ''}Mise à jour des {len(POSTS_DATA)} posts\n")

    for post_def in POSTS_DATA:
        titre     = post_def["titre"]
        image_url = IMAGE_URLS.get(post_def["image_key"], "")
        post_id   = posts_map.get(titre)

        if not post_id:
            print(f"⚠️  Post introuvable : « {titre[:55]}… »")
            print(f"   → Le titre en base ne correspond pas. Vérifie les titres seedés.")
            skipped += 1
            continue

        payload = {
            "tags":       post_def["tags"],
            "est_epingle": post_def["est_epingle"],
        }
        if image_url:
            payload["media_url"] = image_url

        try:
            patch_post(token, post_id, payload, dry_run=dry_run)
            status = "✅" if not dry_run else "🔵"
            img_note = f" + 🖼️ image" if image_url else " (pas d'image)"
            print(f"{status} {titre[:55]}{img_note}")
            updated += 1
        except RuntimeError as e:
            print(f"❌ Erreur pour « {titre[:40]}… » : {e}")
            errors += 1

    print(f"\n{'─'*60}")
    print(f"Résultat : {updated} mis à jour, {skipped} ignorés, {errors} erreurs")

    if not dry_run and errors == 0 and updated > 0:
        print("\n🎉 Tous les posts ont été mis à jour avec succès !")
        print(f"   Vérifie sur {BASE_URL} → Communauté")

    if dry_run:
        print("\nRelance sans --dry-run pour appliquer les changements.")

if __name__ == "__main__":
    main()
