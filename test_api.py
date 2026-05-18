"""ShantiLink — test complet de toutes les routes API"""
import urllib.request, json, sys

base = 'http://127.0.0.1:8765'
ok = 0; fail = 0

def req(method, path, data=None, token=None):
    url = base + path
    body = json.dumps(data).encode() if data else None
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    r = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=5) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())

def check(label, condition, detail=''):
    global ok, fail
    if condition:
        print(f'  ✅ {label}' + (f' ({detail})' if detail else ''))
        ok += 1
    else:
        print(f'  ❌ {label}' + (f' — {detail}' if detail else ''))
        fail += 1

print('\n══════════════════════════════════════════')
print('  ShantiLink API — Tests complets')
print('══════════════════════════════════════════\n')

# ── 1. Routes publiques ────────────────────────────────────────────────────────
print('1. Routes publiques')
s, d = req('GET', '/api/stats')
check('GET /api/stats', s == 200, f"users={d.get('users')}, pros={d.get('pros')}")

s, d = req('GET', '/api/professionals')
check('GET /api/professionals', s == 200 and len(d) >= 15, f"{len(d)} pros")

s, d = req('GET', '/api/professionals?role=architecte')
check('GET /api/professionals?role=architecte', s == 200 and all(p['role']=='architecte' for p in d), f"{len(d)} architectes")

s, d = req('GET', '/api/professionals?ville=Casablanca')
check('GET /api/professionals?ville=Casablanca', s == 200, f"{len(d)} pros Casablanca")

# ── 2. Authentification ────────────────────────────────────────────────────────
print('\n2. Authentification')
EMAIL = 'audit_test_2025@shantilink.ma'

# Nettoyage si déjà existant
import sqlite3, os
db_path = os.path.join(os.path.dirname(__file__), 'app', 'shantilink.db')
try:
    conn = sqlite3.connect(db_path)
    conn.execute("DELETE FROM users WHERE email=?", (EMAIL,))
    conn.commit()
    conn.close()
except:
    pass

s, d = req('POST', '/api/auth/register', {'prenom':'Audit','nom':'Test','email':EMAIL,'password':'secure123','role':'client','ville':'Rabat'})
check('POST /api/auth/register', s == 201, f"token={'ok' if d.get('token') else 'MISSING'}")
token = d.get('token', '')

s2, d2 = req('POST', '/api/auth/register', {'prenom':'Dup','email':EMAIL,'password':'123456','role':'client'})
check('POST /api/auth/register (email dupliqué → 409)', s2 == 409)

s, d = req('POST', '/api/auth/login', {'email': EMAIL, 'password': 'secure123'})
check('POST /api/auth/login', s == 200 and bool(d.get('token')))
token = d.get('token', token)

s, d = req('POST', '/api/auth/login', {'email': EMAIL, 'password': 'mauvais'})
check('POST /api/auth/login (mauvais mdp → 401)', s == 401)

# ── 3. Projets ─────────────────────────────────────────────────────────────────
print('\n3. Projets')
s, d = req('POST', '/api/projects', {'nom':'Villa Audit','ville':'Rabat','budget':900000,'type':'Villa / Maison individuelle','etages':1,'description':'Test auto'}, token=token)
check('POST /api/projects', s == 201, f"id={d.get('id','?')}")
pid = d.get('id', '')

s, d = req('GET', '/api/projects', token=token)
check('GET /api/projects', s == 200 and len(d) >= 1, f"{len(d)} projets")

s, d = req('PATCH', f'/api/projects/{pid}/pct', {'pct': 45}, token=token)
check('PATCH /api/projects/{id}/pct', s == 200 and d.get('pct') == 45)

s, d = req('PATCH', f'/api/projects/{pid}/phases', {'phases': '[{"label":"Fondations","status":"finalise"}]'}, token=token)
check('PATCH /api/projects/{id}/phases', s == 200 and d.get('ok'))

s, d = req('PUT', f'/api/projects/{pid}', {'nom':'Villa Audit MAJ','ville':'Rabat','budget':950000,'type':'Villa / Maison individuelle','etages':2,'description':'MAJ'}, token=token)
check('PUT /api/projects/{id}', s == 200 and d.get('nom') == 'Villa Audit MAJ')

# ── 4. Dépenses ────────────────────────────────────────────────────────────────
print('\n4. Dépenses')
s, d = req('POST', '/api/expenses', {'description':'Béton B25','montant':45000.50,'categorie':'Gros oeuvre','date':'2025-04-01','project_id': pid}, token=token)
check('POST /api/expenses (avec project_id)', s == 201 and d.get('id'))
eid = d.get('id', '')

s, d2 = req('POST', '/api/expenses', {'description':'Main oeuvre','montant':28000,'categorie':'Main d\'oeuvre','date':'2025-04-10'}, token=token)
check('POST /api/expenses (sans project_id)', s == 201)

s, d = req('GET', '/api/expenses', token=token)
check('GET /api/expenses', s == 200 and len(d) >= 2, f"{len(d)} dépenses")

s, d = req('DELETE', f'/api/expenses/{eid}', token=token)
check('DELETE /api/expenses (soft-delete)', s == 200 and d.get('ok'))

s, d = req('GET', '/api/expenses', token=token)
deleted = [e for e in d if e.get('deleted')]
check('GET /api/expenses — soft-deleted visible dans historique', any(e['id']==eid for e in deleted))

# ── 5. Photos ──────────────────────────────────────────────────────────────────
print('\n5. Photos')
s, d = req('GET', '/api/photos', token=token)
check('GET /api/photos', s == 200, f"{len(d)} photos")

# Test upload sans fichier (JSON route) — doit retourner 422 car Form requis
# On skip car pas de multipart en urllib facilement

# ── 6. Messages ────────────────────────────────────────────────────────────────
print('\n6. Messages')
s, d = req('POST', '/api/messages', {'professional_id': 1, 'content': 'Bonjour, test audit.'}, token=token)
check('POST /api/messages', s == 200 and len(d) >= 2, f"{len(d)} messages (dont auto-reply)")

s, d = req('GET', '/api/messages', token=token)
check('GET /api/messages (conversations)', s == 200 and len(d) >= 1)

s, d = req('GET', '/api/messages/1', token=token)
check('GET /api/messages/{pro_id}', s == 200 and len(d) >= 1)

# ── 7. Activités ──────────────────────────────────────────────────────────────
print('\n7. Activités')
s, d = req('GET', '/api/activities', token=token)
check('GET /api/activities', s == 200, f"{len(d)} activités")
msgs = [a['msg'] for a in d]
check('Activité: compte créé loggué', any('Compte' in m for m in msgs))
check('Activité: projet créé loggué', any('projet' in m.lower() or 'Projet' in m for m in msgs))
check('Activité: dépense loggée', any('Dépense' in m for m in msgs))

# ── 8. Profil ──────────────────────────────────────────────────────────────────
print('\n8. Profil')
s, d = req('GET', '/api/profile', token=token)
check('GET /api/profile', s == 200 and d.get('email') == EMAIL)

s, d = req('PUT', '/api/profile', {'prenom':'Audit MAJ','ville':'Casablanca','tel':'+212 600 000 000'}, token=token)
check('PUT /api/profile', s == 200 and d.get('prenom') == 'Audit MAJ')

# ── 9. Contact ─────────────────────────────────────────────────────────────────
print('\n9. Contact (form public)')
s, d = req('POST', '/api/contact', {'prenom':'Test','email':'contact@test.ma','message':'Message test audit'})
check('POST /api/contact', s == 200 and d.get('ok'))

# ── 10. Suppression projet ────────────────────────────────────────────────────
print('\n10. Suppression projet + cascade')
# Créer une nouvelle dépense liée au projet avant suppression
s, d_new = req('POST', '/api/expenses', {'description':'Carrelage','montant':15000,'project_id': pid}, token=token)
new_eid = d_new.get('id','')

s, d = req('DELETE', f'/api/projects/{pid}', token=token)
check('DELETE /api/projects/{id}', s == 200 and d.get('ok'))

s, d = req('GET', '/api/expenses', token=token)
linked_deleted = next((e for e in d if e['id'] == new_eid), None)
check('Dépenses liées soft-deleted à la suppression projet', linked_deleted and linked_deleted.get('deleted') == 1)

s, d = req('GET', '/api/activities', token=token)
check('Activité: projet supprimé loggué', any('supprim' in a['msg'].lower() for a in d))

# ── 11. Sécurité ──────────────────────────────────────────────────────────────
print('\n11. Sécurité')
s, d = req('GET', '/api/projects')
check('GET /api/projects sans token → 401', s == 401)

s, d = req('GET', '/api/profile', token='fake.token.invalid')
check('GET /api/profile token invalide → 401', s == 401)

s, d = req('GET', '/api/projects', token=token + 'tampered')
check('GET /api/projects token altéré → 401', s == 401)

# ── Résumé ─────────────────────────────────────────────────────────────────────
print(f'\n══════════════════════════════════════════')
print(f'  Résultat : {ok} ✅  /  {fail} ❌  /  {ok+fail} tests')
print(f'══════════════════════════════════════════')
if fail == 0:
    print('  🎉 Tous les tests passent — Backend prêt !')
else:
    print('  ⚠️  Des corrections sont nécessaires.')
print()
