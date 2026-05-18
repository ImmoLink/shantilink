// ShantiLink – Main application logic (navigation, auth, landing features)

// ── State ────────────────────────────────────────────────────────────────────
let currentUser = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

// UXT-07: EUR/MAD currency switch with daily exchange rate
window._currency = localStorage.getItem('sl_currency') || 'MAD';
window._eurRate  = parseFloat(localStorage.getItem('sl_eur_rate') || '0');
const _EUR_RATE_KEY  = 'sl_eur_rate';
const _EUR_RATE_DATE = 'sl_eur_rate_date';

async function _fetchEurRate() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const cached = localStorage.getItem(_EUR_RATE_DATE);
    if (cached === today && window._eurRate > 0) return;
    // Open exchange rates (no API key needed for MAD/EUR)
    const r = await fetch('https://open.er-api.com/v6/latest/EUR');
    if (!r.ok) throw new Error();
    const data = await r.json();
    const rate = data.rates && data.rates.MAD;
    if (rate && rate > 0) {
      window._eurRate = rate;
      localStorage.setItem(_EUR_RATE_KEY, String(rate));
      localStorage.setItem(_EUR_RATE_DATE, today);
    }
  } catch(e) {
    // fallback: 1 EUR ≈ 10.8 MAD (approximation)
    if (!window._eurRate) window._eurRate = 10.8;
  }
}

function fmt(n) {
  const v = Math.round(n || 0);
  if (window._currency === 'EUR' && window._eurRate > 0) {
    const eur = v / window._eurRate;
    return eur.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €';
  }
  return v.toLocaleString('fr-FR') + ' DH';
}

window.setCurrency = function(cur) {
  window._currency = cur;
  localStorage.setItem('sl_currency', cur);
  // Re-render visible data
  if (typeof renderDashboardOverview === 'function') renderDashboardOverview();
  if (typeof renderDepenses === 'function') renderDepenses();
  if (typeof renderProjets === 'function') renderProjets();
  const btn = document.getElementById('currency-toggle');
  if (btn) btn.textContent = cur === 'EUR' ? '€ EUR → DH' : 'DH → € EUR';
};

function getWeek(d) {
  d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const y = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - y) / 86400000) + 1) / 7);
}

let toastTimer;
function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'toast show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
}

// ── Navigation ────────────────────────────────────────────────────────────────
window._navHistory = [];

window.goPage = function(id, _skipHistory) {
  // Push current page to history before leaving (so user can go back)
  if (!_skipHistory) {
    const currentEl = document.querySelector('.pg.on');
    if (currentEl) {
      const currentId = currentEl.id.replace(/^pg-/, '');
      const targetId  = id.replace(/^pg-/, '');
      if (currentId !== targetId) {
        window._navHistory.push(currentId);
        if (window._navHistory.length > 30) window._navHistory.shift();
      }
    }
  }
  document.querySelectorAll('.pg').forEach(p => p.classList.remove('on'));
  const cleanId = id.startsWith('pg-') ? id : 'pg-' + id;
  const el = document.getElementById(cleanId);
  if (el) { el.classList.add('on'); window.scrollTo(0, 0); }
  // UXT-02: sync URL hash
  const pageSlug = id.replace(/^pg-/, '');
  const newHash = '#/' + pageSlug;
  if (location.hash !== newHash) history.replaceState(null, '', newHash);
  if (id === 'dashboard' || id === 'pg-dashboard') {
    if (currentUser) {
      loadDashboard();
      if (typeof agentShow === 'function') agentShow();
    } else { goPage('auth', true); switchTab('login'); }
  } else {
    if (typeof agentHide === 'function') agentHide();
  }
  if (id === 'community' || id === 'pg-community') {
    setTimeout(loadCommunity, 80);
  }
  // Reset auth form errors when navigating away from auth page
  if (id !== 'auth' && id !== 'pg-auth') {
    const regErr = document.getElementById('reg-err');
    const logErr = document.getElementById('login-err');
    const regOk  = document.getElementById('reg-ok');
    const regBtn = document.getElementById('reg-btn');
    if (regErr) { regErr.style.display = 'none'; regErr.textContent = ''; }
    if (logErr) { logErr.style.display = 'none'; logErr.textContent = ''; }
    if (regOk)  { regOk.style.display  = 'none'; }
    if (regBtn) { regBtn.disabled = false; regBtn.textContent = (window.t ? t('auth_register_btn','Créer mon compte gratuit →') : 'Créer mon compte gratuit →'); }
  }
  _updateBackBtn();
};

window.goBack = function() {
  if (!window._navHistory.length) return;
  const prev = window._navHistory.pop();
  goPage(prev, true); // don't push to history on back
  _updateBackBtn();
};

function _updateBackBtn() {
  const btn = document.getElementById('back-nav-btn');
  if (btn) btn.style.display = window._navHistory.length > 0 ? 'inline-flex' : 'none';
}

window.goSection = function(id) {
  goPage('landing');
  setTimeout(() => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }, 80);
};

function updateNav() {
  const isLoggedIn = !!currentUser;
  document.getElementById('nav-login-btn').style.display   = isLoggedIn ? 'none'  : 'inline-flex';
  document.getElementById('nav-reg-btn').style.display     = isLoggedIn ? 'none'  : 'inline-flex';
  document.getElementById('nav-dash-btn').style.display    = isLoggedIn ? 'block' : 'none';
  const fab = document.getElementById('quick-log-fab');
  if (fab) fab.classList.toggle('visible', isLoggedIn);
}

// ── Welcome modal ─────────────────────────────────────────────────────────────
const PROFILES = {
  client:      { eyebrow: 'Pour les MRE et particuliers qui construisent au Maroc', h1: 'Suivez votre maison au Maroc<br>depuis <em>partout</em>', cta: 'Suivre mon chantier — 3 mois gratuits' },
  promoteur:   { eyebrow: 'Pour les promoteurs et entrepreneurs', h1: 'Pilotez tous vos chantiers<br>depuis un seul <em>endroit</em>', cta: 'Gérer mes projets — 3 mois gratuits' },
  architecte:  { eyebrow: 'Pour les architectes et bureaux d\'études', h1: 'Valorisez votre travail,<br>fidélisez vos <em>clients</em>', cta: 'Créer mon profil pro — 3 mois gratuits' },
  autre:       { eyebrow: 'Pour tous les acteurs de la construction', h1: 'La construction au Maroc,<br>enfin <em>organisée</em>', cta: 'Rejoindre ShantiLink — 3 mois gratuits' },
};

window.setProfile = function(type) {
  const p = PROFILES[type] || PROFILES.client;
  const e = document.getElementById('hero-eyebrow'); if (e) e.textContent = p.eyebrow;
  const h = document.getElementById('hero-h1'); if (h) h.innerHTML = p.h1;
  const c = document.getElementById('hero-cta'); if (c) c.textContent = p.cta;
  closeWelcome();
};
window.closeWelcome = function() {
  const m = document.getElementById('welcome-modal');
  if (m) m.style.display = 'none';
  localStorage.setItem('sl_welcomed', '1');
};

// ── Auth ──────────────────────────────────────────────────────────────────────
window.switchTab = function(t) {
  document.querySelectorAll('.atab').forEach(b => b.classList.remove('on'));
  document.querySelectorAll('.apanel').forEach(p => p.classList.remove('on'));
  if (t === 'register') {
    const savedRef = localStorage.getItem('sl_ref_code') || '';
    const refRow = document.getElementById('ref-code-row');
    const refInput = document.getElementById('r-ref-code');
    if (savedRef && refRow && refInput) {
      refRow.style.display = 'block';
      refInput.value = savedRef;
    } else if (refRow) {
      refRow.style.display = savedRef ? 'block' : 'none';
    }
  }
  const tab   = document.getElementById('atab-' + t);
  const panel = document.getElementById('apanel-' + t);
  if (tab)   tab.classList.add('on');
  if (panel) panel.classList.add('on');
};

window.doRegister = async function() {
  const prenom = document.getElementById('rp').value.trim();
  const nom    = document.getElementById('rn').value.trim();
  const email  = document.getElementById('re').value.trim();
  const role   = document.getElementById('r-role').value;
  const ville  = document.getElementById('r-ville').value.trim();
  const pwd    = document.getElementById('r-pwd').value;
  const errEl  = document.getElementById('reg-err');
  const btn    = document.getElementById('reg-btn');
  errEl.style.display = 'none';

  if (!prenom) { errEl.textContent = 'Le prénom est requis.'; errEl.style.display = 'block'; return; }
  if (!email)  { errEl.textContent = 'L\'email est requis.'; errEl.style.display = 'block'; return; }
  if (pwd.length < 10) { errEl.textContent = 'Mot de passe minimum 10 caractères.'; errEl.style.display = 'block'; return; }
  if (!/[A-Z]/.test(pwd)) { errEl.textContent = 'Le mot de passe doit contenir au moins une majuscule.'; errEl.style.display = 'block'; return; }
  if (!/[0-9]/.test(pwd)) { errEl.textContent = 'Le mot de passe doit contenir au moins un chiffre.'; errEl.style.display = 'block'; return; }
  if (!/[^A-Za-z0-9]/.test(pwd)) { errEl.textContent = 'Le mot de passe doit contenir au moins un caractère spécial.'; errEl.style.display = 'block'; return; }
  const consent = document.getElementById('r-consent');
  if (consent && !consent.checked) { errEl.textContent = 'Veuillez accepter les CGU et la Politique de confidentialité.'; errEl.style.display = 'block'; return; }

  btn.disabled = true;
  btn.innerHTML = '<span class="loading"></span>Création en cours...';
  try {
    const refInput = document.getElementById('r-ref-code');
    const refCode = (refInput && refInput.value.trim()) || localStorage.getItem('sl_ref_code') || '';
    const res = await API.register({ prenom, nom, email, password: pwd, role, ville, ref_code: refCode });
    if (refCode) localStorage.removeItem('sl_ref_code');
    API.setToken(res.token);
    currentUser = res.user;
    localStorage.setItem('sl_user', JSON.stringify(currentUser));
    if (typeof resetDashboardState === 'function') resetDashboardState();
    document.getElementById('reg-ok').style.display = 'block';
    setTimeout(() => {
      updateNav();
      initWorkspace(res.user.role);
      document.getElementById('new-user-banner').style.display = 'block';
      if (res.user.founder_badge) showFounderBadgeToast(res.user.founder_badge);
      const afterAuth = localStorage.getItem('sl_after_auth');
      localStorage.removeItem('sl_after_auth');
      goPage('dashboard');
      if (typeof agentInit === 'function') { agentInit(); agentShow(); }
      if (afterAuth === 'simulateur') {
        setTimeout(() => { if (typeof showDashPanel === 'function') showDashPanel('simulateur', null); }, 200);
      }
      toast('Bienvenue ' + prenom + ' ! Votre espace est prêt.', 'success');
      // UXT-09: start onboarding for new users
      if (!localStorage.getItem('sl_onboarded') && typeof startOnboarding === 'function') {
        setTimeout(() => startOnboarding(res.user.role), 2000);
      }
    }, 1200);
  } catch (e) {
    errEl.textContent = e.message;
    errEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Créer mon compte gratuit →';
  }
};

window.doLogin = async function() {
  const email = document.getElementById('l-email').value.trim();
  const pwd   = document.getElementById('l-pwd').value;
  const errEl = document.getElementById('login-err');
  errEl.style.display = 'none';

  if (!email || !pwd) { errEl.textContent = 'Email et mot de passe requis.'; errEl.style.display = 'block'; return; }
  try {
    const res = await API.login({ email, password: pwd });
    API.setToken(res.token);
    currentUser = res.user;
    localStorage.setItem('sl_user', JSON.stringify(currentUser));
    if (typeof resetDashboardState === 'function') resetDashboardState();
    updateNav();
    initWorkspace(res.user.role);
    const afterAuth = localStorage.getItem('sl_after_auth');
    localStorage.removeItem('sl_after_auth');
    goPage('dashboard');
    if (typeof agentInit === 'function') { agentInit(); agentShow(); }
    if (afterAuth === 'simulateur') {
      setTimeout(() => { if (typeof showDashPanel === 'function') showDashPanel('simulateur', null); }, 200);
    }
    toast('Bon retour, ' + res.user.prenom + ' !', 'success');
  } catch (e) {
    errEl.textContent = e.message;
    errEl.style.display = 'block';
  }
};

window.doLogout = function() {
  API.clearToken();
  currentUser = null;
  if (typeof agentHide === 'function') agentHide();
  if (typeof resetDashboardState === 'function') resetDashboardState();
  updateNav();
  goPage('landing');
  toast('Vous êtes déconnecté.', 'success');
};

// ── Workspace role init ───────────────────────────────────────────────────────
const WS_CONFIG = {
  client:      { label: 'Espace Client',        color: '#1E6FCC', bg: '#EFF6FF', icon: '🏠', desc: 'Suivez votre chantier et vos dépenses en temps réel.' },
  promoteur:   { label: 'Espace Promoteur',     color: '#7C3AED', bg: '#F5F3FF', icon: '🏢', desc: 'Pilotez tous vos chantiers depuis un seul tableau de bord.' },
  architecte:  { label: 'Espace Architecte',    color: '#B45309', bg: '#FFFBEB', icon: '📐', desc: 'Gérez vos projets et gagnez en visibilité sur la marketplace.' },
  comptable:   { label: 'Espace Comptable',     color: '#047857', bg: '#ECFDF5', icon: '🧾', desc: 'Accédez aux dossiers financiers et proposez vos services.' },
  bureau:      { label: 'Bureau d\'études',      color: '#0E7490', bg: '#ECFEFF', icon: '📊', desc: 'Valorisez votre expertise et connectez-vous aux clients.' },
  notaire:     { label: 'Espace Notaire',        color: '#6D28D9', bg: '#F5F3FF', icon: '⚖️', desc: 'Accompagnez vos clients sur les démarches juridiques.' },
  electricien: { label: 'Espace Électricien',   color: '#D97706', bg: '#FFFBEB', icon: '⚡', desc: 'Développez votre activité grâce à la mise en relation ShantiLink.' },
  plombier:    { label: 'Espace Plombier',       color: '#2563EB', bg: '#EFF6FF', icon: '🔧', desc: 'Trouvez des chantiers et gérez vos interventions.' },
  autre:       { label: 'Espace Professionnel', color: '#374151', bg: '#F9FAFB', icon: '💼', desc: 'Bienvenue dans votre espace professionnel ShantiLink.' },
};

const PRO_ROLES = ['architecte','comptable','bureau','notaire','electricien','plombier','autre'];

window.initWorkspace = function(role) {
  const cfg = WS_CONFIG[role] || WS_CONFIG.autre;

  // Role badge in sidebar
  const badge = document.getElementById('ws-role-badge');
  if (badge) {
    badge.textContent = cfg.icon + ' ' + cfg.label;
    badge.style.display = 'block';
    badge.style.background = cfg.bg;
    badge.style.color = cfg.color;
  }

  // Role banner in overview
  const banner = document.getElementById('ws-banner');
  if (banner) {
    banner.style.display = 'block';
    banner.style.background = cfg.bg;
    banner.style.border = '.5px solid ' + cfg.color + '33';
    banner.innerHTML = `<div style="display:flex;align-items:center;gap:.8rem">
      <span style="font-size:22px">${cfg.icon}</span>
      <div>
        <div style="font-size:13px;font-weight:700;color:${cfg.color}">${cfg.label}</div>
        <div style="font-size:12px;color:${cfg.color};opacity:.75;margin-top:.1rem">${cfg.desc}</div>
      </div>
      ${PRO_ROLES.includes(role) ? `<button onclick="showDashPanel('profil',null)" style="margin-left:auto;font-size:11px;font-weight:600;padding:7px 14px;background:${cfg.color};color:white;border:none;border-radius:100px;cursor:pointer;font-family:'Outfit',sans-serif;flex-shrink:0">Mon profil pro →</button>` : ''}
    </div>`;
  }

  const adminBtn = document.getElementById('sb-admin-btn');
  if (adminBtn) adminBtn.style.display = role === 'admin' ? 'flex' : 'none';

  // PRO-02: Sidebar dynamique par rôle — pros voient "Mes chantiers" pas "Mes projets"
  const sbProjects = document.getElementById('sb-projects');
  if (sbProjects) {
    const isProRole = ['pro', 'architecte', 'electricien', 'plombier', 'bureau', 'notaire', 'comptable', 'autre'].includes(role);
    sbProjects.textContent = isProRole ? 'Mes chantiers en cours' : 'Mes projets';
  }
};

// ── Budget simulator ──────────────────────────────────────────────────────────
// Prices aligned with dashboard SIM_REGIONS (same keys & values)
const PRIX = {
  'Casablanca': 5800, 'Rabat': 5500, 'Marrakech': 5200, 'Tanger': 5000,
  'Agadir': 4800, 'Fès': 4500, 'Meknès': 4400, 'Oujda': 4200,
};
// Finition coefficients — identical to dashboard SIM_FINITION_COEF
const PRIX_FIN_COEF = { 'Économique': 0.72, 'Standard': 1.00, 'Haut standing': 1.38, 'Luxe': 1.80 };

window.updS = function() {
  const v = document.getElementById('s-surface').value;
  const el = document.getElementById('sv'); if (el) el.textContent = v;
};

window.calcBudget = function() {
  const ville    = (document.getElementById('s-ville')   || {}).value || 'Casablanca';
  const s        = parseInt((document.getElementById('s-surface') || {}).value) || 150;
  const etages   = parseInt((document.getElementById('s-etages')  || {}).value) || 0;  // integer (0=RDC,1=R+1…)
  const finition = (document.getElementById('s-finition') || {}).value || 'Standard';

  const px       = PRIX[ville] || 4200;
  const finCoef  = PRIX_FIN_COEF[finition] || 1.00;
  const floorPrem = 1 + etages * 0.08; // matches dashboard formula exactly

  const tot = Math.round(px * s * finCoef * floorPrem / 1000) * 1000;
  const lo  = Math.round(tot * .88 / 1000) * 1000;
  const hi  = Math.round(tot * 1.12 / 1000) * 1000;

  const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setTxt('sim-tot', fmt(tot));
  setTxt('sim-rng', (window.t ? t('sim_range_prefix','Fourchette :') : 'Fourchette :') + ' ' + fmt(lo) + ' — ' + fmt(hi));
  setTxt('v-go', fmt(Math.round(tot * .50)));
  setTxt('v-fi', fmt(Math.round(tot * .25)));
  setTxt('v-ep', fmt(Math.round(tot * .15)));
  setTxt('v-fe', fmt(Math.round(tot * .10)));

  // Store for dashboard — all keys match dashboard sim fields exactly
  window._lastSim = {
    ville, surface: s, etages, finition,
    type: 'Villa / Maison individuelle',   // dashboard default
    materiaux: 'Local / Standard',          // dashboard default
    tot, lo, hi,
    date: new Date().toLocaleDateString('fr-FR')
  };
};

window.goSimDash = function() {
  if (window._lastSim) localStorage.setItem('sl_sim', JSON.stringify(window._lastSim));
  if (currentUser) {
    goPage('dashboard');
    // Navigate to simulator panel and show saved result
    setTimeout(() => {
      if (typeof showDashPanel === 'function') showDashPanel('simulateur', null);
    }, 100);
  } else {
    // Flag so after register we redirect to simulator
    localStorage.setItem('sl_after_auth', 'simulateur');
    goPage('auth'); switchTab('register');
  }
};

// ── Demo scenes ───────────────────────────────────────────────────────────────
const SCENES = [
  { tag: 'Le problème', title: 'Vous construisez au Maroc...', body: '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.4rem"><div style="background:var(--red-b);border-radius:7px;padding:.5rem;font-size:11px;color:var(--red)">Aucune visibilité</div><div style="background:var(--red-b);border-radius:7px;padding:.5rem;font-size:11px;color:var(--red)">Budget incontrôlé</div><div style="background:var(--red-b);border-radius:7px;padding:.5rem;font-size:11px;color:var(--red)">Communication chaotique</div><div style="background:var(--red-b);border-radius:7px;padding:.5rem;font-size:11px;color:var(--red)">Pros peu fiables</div></div>' },
  { tag: 'Dashboard ShantiLink', title: 'Tout en temps réel', body: '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:.4rem;margin-bottom:.5rem"><div style="background:var(--white);border-radius:7px;padding:.5rem;text-align:center"><div style="font-family:\'Playfair Display\',serif;font-size:1.2rem;font-weight:600">68%</div><div style="font-size:8px;color:var(--muted)">Avancement</div></div><div style="background:var(--white);border-radius:7px;padding:.5rem;text-align:center"><div style="font-family:\'Playfair Display\',serif;font-size:1.2rem;font-weight:600;color:var(--green)">OK</div><div style="font-size:8px;color:var(--muted)">Budget</div></div><div style="background:var(--white);border-radius:7px;padding:.5rem;text-align:center"><div style="font-family:\'Playfair Display\',serif;font-size:1.2rem;font-weight:600">0j</div><div style="font-size:8px;color:var(--muted)">Retard</div></div></div><div style="background:var(--green-b);border-radius:7px;padding:.5rem;font-size:11px;color:var(--green)">Aucun dépassement détecté</div>' },
  { tag: 'Photos GPS', title: 'Vérification infalsifiable', body: '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.4rem"><div style="background:var(--clay-p);border-radius:7px;aspect-ratio:4/3;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:1.4rem">🏗️<div style="font-size:8px;color:var(--clay)">GPS ✓</div></div><div style="background:var(--clay-p);border-radius:7px;aspect-ratio:4/3;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:1.4rem">🧱<div style="font-size:8px;color:var(--clay)">GPS ✓</div></div></div>' },
  { tag: 'Rapport IA', title: 'PDF automatique chaque semaine', body: '<div style="background:var(--white);border-radius:9px;padding:.8rem"><div style="display:flex;justify-content:space-between;margin-bottom:.5rem"><span style="font-size:12px;font-weight:600">Rapport Semaine 18</span><span style="background:var(--clay);color:white;font-size:8px;padding:2px 8px;border-radius:100px">PDF ✓</span></div><div style="font-size:11px;color:var(--muted)">Dalle R+1 réussie<br>Budget conforme<br>Mur Ouest — S.19</div></div>' },
  { tag: 'ShantiLink', title: '3 mois gratuits — commencez maintenant', body: '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.4rem"><div style="background:var(--green-b);border-radius:7px;padding:.5rem;font-size:11px;color:var(--green)">Dashboard live</div><div style="background:var(--green-b);border-radius:7px;padding:.5rem;font-size:11px;color:var(--green)">Rapports IA</div><div style="background:var(--green-b);border-radius:7px;padding:.5rem;font-size:11px;color:var(--green)">Photos GPS</div><div style="background:var(--green-b);border-radius:7px;padding:.5rem;font-size:11px;color:var(--green)">Marketplace</div></div>' },
];
let currentScene = 0;
window.cycleScene = function() {
  currentScene = (currentScene + 1) % SCENES.length;
  const s = SCENES[currentScene];
  document.getElementById('scene-tag').textContent   = s.tag;
  document.getElementById('scene-title').textContent = s.title;
  document.getElementById('scene-body').innerHTML    = s.body;
  document.getElementById('scene-ctr').textContent   = (currentScene + 1) + '/' + SCENES.length;
};

window.showIP = function(n, btn) {
  for (let i = 1; i <= 5; i++) {
    const p = document.getElementById('ip-' + i);
    if (p) p.style.display = i === n ? 'block' : 'none';
  }
  document.querySelectorAll('.ip-tab-btn').forEach(b => {
    b.style.background = 'rgba(255,255,255,.15)';
    b.style.color = 'rgba(255,255,255,.6)';
  });
  if (btn) { btn.style.background = 'var(--clay)'; btn.style.color = 'white'; }
};

// ── Solution tabs ─────────────────────────────────────────────────────────────
window.showTab = function(id, btn) {
  document.querySelectorAll('.tbtn').forEach(b => b.classList.remove('on'));
  document.querySelectorAll('.tpanel').forEach(p => p.classList.remove('on'));
  if (btn) btn.classList.add('on');
  const p = document.getElementById('tab-' + id); if (p) p.classList.add('on');
};

// ── Language toggle ───────────────────────────────────────────────────────────
const TRANSLATIONS = {
  fr: {
    // Nav
    nav_login: 'Connexion', nav_register: "S'inscrire", nav_dashboard: 'Mon espace',
    nav_about: 'À propos', nav_simulator: 'Simulateur', nav_pros: 'Professionnels',
    nav_solutions: 'Solutions', nav_pricing: 'Tarifs', nav_community: 'Communauté',
    // Hero
    hero_eyebrow: 'Plateforme de confiance pour construire au Maroc',
    hero_badge: 'Plateforme #1 Construction Maroc',
    hero_title: 'Construisez au Maroc<br><em>en toute confiance</em>',
    hero_sub: 'Pilotez votre chantier à distance, vérifiez chaque dépense, et connectez-vous aux meilleurs professionnels vérifiés.',
    hero_cta1: 'Commencer gratuitement', hero_cta2: 'Voir la démo',
    // Trust pills
    trust_free: '3 mois gratuits', trust_no_card: 'Sans carte bancaire',
    trust_langs: 'FR et Arabe', trust_data: 'Données sécurisées',
    // Stats
    stat_projs: 'Projets gérés', stat_cities: 'Villes au Maroc',
    stat_trial: 'Essai gratuit', stat_launch: 'Lancement 2025',
    // Welcome modal
    welcome_tagline: 'Construisez au Maroc en toute confiance',
    welcome_who: 'Vous êtes...', welcome_choose: 'Choisissez votre profil pour une expérience personnalisée',
    profile_client_label: 'Client / MRE', profile_client_sub: 'Je construis ma maison',
    profile_promoteur_label: 'Promoteur', profile_promoteur_sub: 'Je gère des chantiers',
    profile_arch_label: 'Architecte / BE', profile_arch_sub: 'Je conçois des projets',
    profile_autre_label: 'Autre acteur', profile_autre_sub: 'Comptable, notaire...',
    welcome_skip: 'Passer →',
    // Demo
    demo_tag: 'Découvrez ShantiLink',
    demo_title: 'Voyez comment ça <em style="color:var(--clay-l);font-style:italic">fonctionne</em>',
    demo_sub: 'Cliquez sur les scènes pour explorer',
    demo_cta: 'Essayer gratuitement — 3 mois sans carte →',
    // Problem
    prob_tag: 'Le problème',
    prob_title: 'Construire au Maroc sans contrôle,<br>c\'est risquer <em>gros</em>',
    prob_sub: 'Des milliers de familles construisent chaque année sans visibilité réelle sur leur chantier.',
    prob1_title: 'Aucune visibilité à distance', prob1_desc: 'Vous apprenez les retards des semaines après. Trop tard pour agir.',
    prob2_title: 'Budget incontrôlable', prob2_desc: "L'argent part sans traçabilité. Les dépassements s'accumulent en silence.",
    prob3_title: 'Trouver un professionnel fiable', prob3_desc: 'Impossible de vérifier la réputation sans référence solide.',
    prob4_title: 'Aucune idée du budget réel', prob4_desc: 'Impossible de planifier sans connaître les vrais coûts avant de commencer.',
    // Solutions
    sol_tag: 'Nos solutions', sol_title: 'Tout pour construire <em>sereinement</em>',
    sol_tab1: 'Suivi de chantier', sol_tab2: 'Mise en relation', sol_tab3: 'Rapports IA',
    card_s1t: 'Dashboard temps réel', card_s1d: 'Avancement, budget, planning en un coup d\'œil. Mis à jour en permanence.',
    card_s2t: 'Suivi budgétaire précis', card_s2d: 'Chaque dépense tracée avec justificatif. Comparaison avec le marché local.',
    card_s3t: 'Photos GPS vérifiées', card_s3d: 'Date, heure et GPS archivés automatiquement. Infalsifiable.',
    card_s4t: 'Alertes intelligentes', card_s4d: 'Dépassement, retard, anomalie — alerte immédiate.',
    card_s5t: 'App mobile terrain', card_s5d: "L'entrepreneur upload photos et données depuis le chantier.",
    card_s6t: 'IA intégrée', card_s6d: "Détection automatique d'anomalies budgétaires et de retards.",
    card_r1t: 'Professionnels vérifiés', card_r1d: "Entrepreneurs, architectes, bureaux d'études, comptables, notaires — tous vérifiés.",
    card_r2t: 'Recherche géographique', card_r2d: 'Trouvez un professionnel par zone géographique sur une carte interactive.',
    card_r3t: 'Messagerie sécurisée', card_r3d: 'Échangez en toute sécurité. Coordonnées révélées après accord mutuel.',
    card_r4t: 'Avis vérifiés', card_r4d: 'Chaque collaboration génère un avis authentique visible par tous.',
    card_r5t: 'Devis en ligne', card_r5d: 'Recevez et comparez des devis directement sur la plateforme.',
    card_r6t: 'Badge de confiance', card_r6d: 'Les pros certifiés se distinguent et inspirent confiance aux clients.',
    card_p1t: 'Rapport PDF hebdomadaire', card_p1d: 'Rapport complet généré automatiquement chaque semaine. Téléchargeable en un clic.',
    card_p2t: 'Analyse budgétaire', card_p2d: 'Comparaison prévisionnel vs réalisé, alertes dépassement, tendances.',
    card_p3t: 'Galerie photos datée', card_p3d: 'Toutes les photos du chantier organisées par semaine et par phase.',
    card_p4t: 'Indicateurs de performance', card_p4d: 'Avancement, respect des délais, qualité — mesurés automatiquement.',
    card_p5t: 'Envoi automatique', card_p5d: 'Rapport envoyé par email chaque semaine sans aucune action requise.',
    card_p6t: 'Archivage sécurisé', card_p6d: 'Tous les rapports archivés et accessibles à tout moment.',
    // Simulator
    sim_tag: 'Simulateur de budget', sim_title: 'Estimez votre budget <em>en 30 secondes</em>',
    sim_cta: 'Obtenir une estimation détaillée →',
    sim_ville_lbl: 'Ville', sim_surface_lbl: 'Surface', sim_etages_lbl: 'Étages', sim_finition_lbl: 'Finition',
    sim_total_lbl: 'ESTIMATION TOTALE',
    sim_go_lbl: 'Gros œuvre (50%)', sim_fi_lbl: 'Finitions (25%)', sim_ep_lbl: 'Élec & Plomberie (15%)', sim_fe_lbl: 'Finitions ext. (10%)',
    sim_note_txt: 'Estimation indicative. Hors terrain, architecte et frais administratifs.',
    // Confiance
    conf_tag: 'Pourquoi nous faire confiance',
    conf_title: 'La confiance ne se déclare pas,<br>elle se <em>prouve</em>',
    conf1_title: 'Photos GPS infalsifiables', conf1_desc: 'Chaque photo contient date, heure et GPS archivés automatiquement.',
    conf2_title: 'Dépenses archivées', conf2_desc: 'Chaque livraison photographiée. Vérification des quantités et prix.',
    conf3_title: 'Comparaison marché auto', conf3_desc: "L'IA compare chaque dépense aux prix moyens locaux et alerte en cas d'anomalie.",
    conf4_title: 'Professionnels vérifiés', conf4_desc: 'Documents, registre de commerce, références vérifiés par ShantiLink.',
    conf5_title: 'Contrôle vidéo à la demande', conf5_desc: 'Demandez une vidéo en direct du chantier à tout moment.',
    conf6_title: 'Remboursement garanti', conf6_desc: 'Si les informations ne correspondent pas à la réalité, nous remboursons le mois.',
    // Testimonial
    test_quote: "J'ai suivi mon projet de construction au Maroc depuis Lyon sans y aller une seule fois pendant les travaux. ShantiLink m'a donné une visibilité totale chaque semaine.",
    test_author: 'Karim B.', test_location: 'Primo-utilisateur ShantiLink — Paris, France',
    // How it works
    how_tag: 'Comment ça marche', how_title: 'Démarrez en <em>5 minutes</em>',
    how1_title: 'Créez votre compte', how1_desc: 'Inscription en 2 minutes. Choisissez votre profil selon votre rôle.',
    how2_title: 'Décrivez votre projet', how2_desc: 'Ville, surface, budget et phases de construction.',
    how3_title: 'Trouvez un professionnel', how3_desc: 'Parcourez les profils vérifiés et lancez la mise en relation.',
    how4_title: 'Suivez en temps réel', how4_desc: 'Dashboard live, rapports hebdomadaires et alertes automatiques.',
    // Pricing
    pricing_tag: 'Tarifs', pricing_title: 'Simple, transparent, <em>sans mauvaise surprise</em>',
    pricing_free_note: '3 mois gratuits — Sans carte — Annulation à tout moment',
    plan1_for: 'Client / Maître d\'ouvrage', plan1_name: 'Essentiel', plan1_per: '/ mois après 3 mois offerts',
    plan1_f1: '1 projet actif', plan1_f2: 'Dashboard temps réel', plan1_f3: 'Rapport mensuel PDF', plan1_f4: 'Accès marketplace', plan1_f5: 'Messagerie sécurisée',
    plan1_btn: 'Démarrer 3 mois gratuits',
    plan2_tag: 'LE PLUS CHOISI', plan2_for: 'Client / Maître d\'ouvrage', plan2_name: 'Premium', plan2_per: '/ mois après 3 mois offerts',
    plan2_f1: 'Projets illimités', plan2_f2: 'Rapport IA hebdomadaire', plan2_f3: 'Alertes intelligentes', plan2_f4: 'Photos GPS vérifiées', plan2_f5: 'Comparateur prix marché', plan2_f6: 'Contrôle vidéo à la demande',
    plan2_btn: 'Démarrer 3 mois gratuits',
    plan3_for: 'Promoteur / Architecte / Bureau', plan3_name: 'Pro', plan3_per: '/ mois après 3 mois offerts',
    plan3_f1: 'Profil vérifié et badge', plan3_f2: 'Chantiers illimités', plan3_f3: 'Rapports clients auto', plan3_f4: 'Visibilité marketplace', plan3_f5: 'App mobile terrain', plan3_f6: 'Demandes clients qualifiées',
    plan3_btn: 'Démarrer 3 mois gratuits',
    // Contact
    contact_tag: 'Nous contacter', contact_title: 'Une question ?<br>On est <em style="color:var(--clay);font-style:italic">là pour vous</em>',
    contact_sub: 'Notre équipe répond sous 24h.',
    contact_prenom_lbl: 'Prénom', contact_nom_lbl: 'Nom', contact_email_lbl: 'Email', contact_role_lbl: 'Vous êtes', contact_msg_lbl: 'Message',
    contact_send_btn: 'Envoyer →', contact_ok: 'Message envoyé ! Réponse sous 24h. ✓',
    // Footer
    footer_slogan: 'Connecter · Construire · Concrétiser',
    footer_desc: 'La plateforme intelligente de gestion et suivi de projets de construction au Maroc.',
    footer_col1: 'Plateforme', footer_col2: 'Compte',
    footer_link_solutions: 'Solutions', footer_link_simulator: 'Simulateur budget', footer_link_pricing: 'Tarifs', footer_link_about: 'À propos',
    footer_link_register: "S'inscrire", footer_link_login: 'Se connecter', footer_link_legal: 'Mentions légales', footer_link_cgu: 'CGU',
    footer_country: 'Maroc — France — Belgique', footer_rights: '© 2025 ShantiLink — Tous droits réservés',
    // Auth
    auth_login_tab: 'Connexion', auth_register_tab: 'Inscription',
    auth_login_btn: 'Se connecter →', auth_register_btn: 'Créer mon compte gratuit →',
    auth_left_title: 'Construisez au Maroc en toute <em>confiance</em>',
    auth_left_sub: 'Rejoignez des centaines de clients et professionnels qui font confiance à ShantiLink.',
    auth_feat1: 'Suivi en temps réel de votre chantier', auth_feat2: 'Rapports IA hebdomadaires automatiques',
    auth_feat3: 'Professionnels vérifiés et certifiés', auth_feat4: '3 mois gratuits, sans carte bancaire', auth_feat5: 'Données sécurisées — chiffrement JWT',
    auth_login_title: 'Bon retour !', auth_login_sub: 'Connectez-vous à votre espace ShantiLink.',
    auth_email_lbl: 'Email', auth_pwd_lbl: 'Mot de passe',
    auth_no_account: "Pas de compte ? S'inscrire",
    auth_create_title: 'Créer votre compte', auth_create_sub: '3 mois gratuits — Sans carte — Annulation à tout moment',
    auth_prenom_lbl: 'Prénom', auth_nom_lbl: 'Nom', auth_role_lbl: 'Vous êtes', auth_ville_lbl: 'Ville du projet',
    auth_terms: 'En vous inscrivant, vous acceptez nos conditions. Vos données sont sécurisées.',
    auth_back: '← Retour au site',
    // Dashboard static
    dash_overview: 'Vue d\'ensemble', dash_projects: 'Mes Projets',
    dash_reports: 'Rapports', dash_expenses: 'Budget & Dépenses',
    dash_photos: 'Photos GPS', dash_pros: 'Trouver un pro',
    dash_messages: 'Messages', dash_profile: 'Mon Profil', dash_simulator: 'Simulateur',
    dash_sb_principal: 'Principal', dash_sb_marketplace: 'Marketplace', dash_sb_compte: 'Compte',
    dash_sb_params: 'Paramètres', dash_sb_logout: 'Déconnexion',
    new_user_title: 'Bienvenue sur ShantiLink ! 🎉', new_user_sub: 'Votre compte a été créé. Commencez par créer votre premier projet.',
    new_user_create: '+ Créer mon premier projet', new_user_pro: 'Trouver un professionnel',
    greeting_prefix: 'Bonjour,',
    ov_sub: 'Voici l\'état de vos projets cette semaine', ov_new_proj: '+ Nouveau projet', ov_find_pro: 'Trouver un pro',
    kpi_proj_lbl: 'PROJETS ACTIFS', kpi_proj_note: 'Cliquez pour gérer', kpi_bud_lbl: 'BUDGET TOTAL', kpi_bud_note: 'Total engagé',
    kpi_dep_lbl: 'DÉPENSES', kpi_dep_note: 'Total', kpi_rep_lbl: 'PROCHAIN RAPPORT', kpi_rep_val: 'Vendredi', kpi_rep_note: 'Généré auto',
    ov_projs_title: 'Mes projets', ov_see_all: 'Voir tout →',
    ov_activity_title: 'Activité récente', ov_quick_title: 'Actions rapides',
    quick_new_proj: '🏗️ Nouveau projet', quick_find_arch: '📐 Trouver un architecte',
    quick_gen_pdf: '📄 Générer rapport PDF', quick_add_dep: '💰 Ajouter une dépense',
    panel_projs_sub: 'Gérez vos projets de construction', panel_projs_btn: '+ Nouveau projet',
    panel_projs_form_title: 'Nouveau projet', panel_projs_nom_lbl: 'Nom du projet', panel_projs_budget_lbl: 'Budget total (DH)',
    panel_projs_type_lbl: 'Type de projet', panel_projs_etages_lbl: 'Nombre d\'étages', panel_projs_ville_lbl: 'Ville',
    panel_projs_desc_lbl: 'Description (optionnel)', panel_projs_create_btn: 'Créer le projet', panel_projs_cancel: 'Annuler',
    panel_rep_sub: 'Rapports hebdomadaires de vos chantiers', panel_rep_btn: 'Générer PDF',
    panel_rep_empty: 'Les rapports de vos projets apparaîtront ici automatiquement chaque semaine.',
    panel_dep_sub: 'Suivi financier de vos projets', panel_dep_btn: '+ Ajouter dépense',
    panel_dep_form_title: 'Nouvelle dépense', panel_dep_desc_lbl: 'Description', panel_dep_montant_lbl: 'Montant (DH)',
    panel_dep_cat_lbl: 'Catégorie', panel_dep_proj_lbl: 'Projet associé', panel_dep_date_lbl: 'Date', panel_dep_note_lbl: 'Note (optionnel)',
    panel_dep_save_btn: 'Enregistrer', panel_dep_cancel: 'Annuler',
    kpi_total_dep: 'TOTAL DÉPENSÉ', kpi_total_note: 'Projets actifs', kpi_week: 'CETTE SEMAINE', kpi_cat: 'CATÉGORIE PRINCIPALE',
    dep_table_desc: 'Description', dep_table_proj: 'Projet', dep_table_cat: 'Catégorie', dep_table_montant: 'Montant', dep_table_date: 'Date',
    panel_photos_sub: 'Galerie de votre chantier', panel_photos_btn: '+ Ajouter photo',
    panel_photos_form_title: 'Ajouter une photo', panel_photos_take: '📷 Prendre une photo', panel_photos_pick: '🖼️ Choisir un fichier',
    panel_photos_desc_lbl: 'Description', panel_photos_date_lbl: 'Date', panel_photos_phase_lbl: 'Phase', panel_photos_type_lbl: 'Type de vue',
    panel_photos_save_btn: 'Archiver avec GPS', panel_photos_cancel: 'Annuler',
    panel_photos_empty: 'Ajoutez des photos de votre chantier avec GPS',
    panel_pros_sub: '15 professionnels vérifiés — recherche par zone géographique',
    panel_msgs_sub: 'Échanges avec les professionnels', conv_title: 'Conversations', select_conv: 'Sélectionnez une conversation',
    msg_placeholder: 'Votre message...', send_btn: 'Envoyer',
    panel_profil_sub: 'Gérez vos informations personnelles', profil_info_title: 'Informations personnelles',
    profil_prenom_lbl: 'Prénom', profil_nom_lbl: 'Nom', profil_email_lbl: 'Email', profil_ville_lbl: 'Ville du projet', profil_tel_lbl: 'Téléphone',
    profil_save_btn: 'Sauvegarder', profil_trial_title: 'Période d\'essai', profil_trial_active: '3 mois gratuits activés', profil_trial_desc: 'Accès complet à toutes les fonctionnalités',
    panel_params_sub: 'Configurez votre expérience ShantiLink', params_notif_title: 'Notifications',
    params_notif1_title: 'Rapports hebdomadaires', params_notif1_desc: 'Recevoir le rapport PDF chaque semaine',
    params_notif2_title: 'Alertes budget', params_notif2_desc: 'Notification si dépassement détecté',
    params_notif3_title: 'Nouveaux messages', params_notif3_desc: 'Notification lors de nouveaux messages',
    params_danger_title: 'Zone dangereuse', params_delete_btn: 'Supprimer mon compte',
    panel_sim_sub: 'Estimez votre projet en détail — adapté au marché marocain', sim_params_title: 'Paramètres de votre projet',
    dsim_region_lbl: 'Région / Ville', dsim_type_lbl: 'Type de projet', dsim_surface_lbl: 'Surface construite (m²)',
    dsim_etages_lbl: 'Nombre d\'étages', dsim_finition_lbl: 'Qualité de finition', dsim_mat_lbl: 'Matériaux',
    dsim_soussol_lbl: 'Sous-sol / parking', dsim_piscine_lbl: 'Piscine', dsim_calc_btn: '🧮 Calculer l\'estimation',
    sim_detail_lbl: 'Estimation détaillée', sim_range_prefix: 'Fourchette :',
    sim_breakdown_title: 'Ventilation par poste', sim_indicative: 'Estimation indicative basée sur les tarifs moyens au Maroc en 2025',
    sim_create_proj: '🏗️ Créer ce projet',
    sim_b1: 'Fondations & gros œuvre', sim_b2: 'Toiture & étanchéité', sim_b3: 'Électricité & éclairage',
    sim_b4: 'Plomberie & sanitaires', sim_b5: 'Menuiserie extérieure', sim_b6: 'Menuiserie intérieure',
    sim_b7: 'Carrelage & revêtements', sim_b8: 'Peinture & enduits', sim_b9: 'VRD & aménagements extérieurs',
    sim_b10: 'Honoraires (architecte, permis)', sim_b11: 'Imprévus & divers',
    modal_contact_pro: 'Contacter le professionnel', modal_msg_lbl: 'Message', modal_send_btn: 'Envoyer le message', modal_cancel: 'Annuler',
    panel_rap_sub: 'Rapports hebdomadaires de vos chantiers', panel_rap_btn: 'Générer PDF',
    panel_rap_auto: 'Les rapports de vos projets apparaîtront ici automatiquement chaque semaine.',
    dep_active_title: 'Dépenses actives', dep_hist_btn: '📋 Voir historique complet', dep_hist_hide: 'Masquer l\'historique complet',
    dep_empty: 'Aucune dépense enregistrée',
    ov_no_proj: 'Aucun projet.', ov_create_first: 'Créer mon premier projet →',
    ov_no_activity: 'Aucune activité récente',
    proj_done: 'Terminé', proj_progress: 'Avancement', proj_finished_toast: 'Projet terminé !',
    proj_empty_title: 'Aucun projet', proj_empty_desc: 'Créez votre premier projet pour commencer le suivi',
    phase_attente: 'En attente', phase_encours: 'En cours', phase_finalise: 'Finalisé', phase_bloque: 'Bloqué',
    delete_btn: 'Supprimer',
    rap_no_proj: 'Créez un projet pour voir vos rapports.',
    rap_dl_pdf: 'Télécharger PDF', rap_total_budget: 'Budget total', rap_dep: 'Dépenses enregistrées', rap_photos: 'Photos GPS archivées',
    rap_week_prefix: 'Rapport S', rap_auto_gen: 'Généré automatiquement',
    conv_loading: 'Chargement...', conv_msg_hint: 'Cliquez sur une conversation ou contactez un professionnel depuis la marketplace →',
    panel_pros_title: 'Trouver un professionnel', pro_filter_all_types: 'Tous les types', pro_filter_all_cities: 'Toutes les villes', pro_search_ph: 'Rechercher...',
    planning_title: 'Planning de chantier',
    plan_add_task: 'Ajouter une étape personnalisée',
    plan_task_placeholder: "Nom de l'étape...",
    plan_add_btn: 'Ajouter',
    plan_label_required: 'Entrez un nom pour cette étape.',
    plan_period: 'Période',
    nav_back: 'Retour',
    // About
    about_tag: 'À propos de ShantiLink', about_title: 'Une vraie douleur.<br>Une vraie <em style="color:var(--clay);font-style:italic">solution.</em>',
    about_quote: "J'ai géré un projet de construction au Maroc depuis Paris. Sans outil adapté, sans visibilité réelle — juste Excel et beaucoup d'anxiété. C'est cette expérience frustrante qui a donné naissance à ShantiLink.",
    about_h3_1: 'Ce que nous avons vécu.', about_p1: "Construire au Maroc depuis l'étranger, c'est une aventure que des milliers de familles vivent chaque année. Chaque semaine, de l'argent est envoyé sans savoir exactement comment il est utilisé.",
    about_p2: "Nous avons cherché une solution adaptée au marché marocain. Elle n'existait pas. Alors nous l'avons construite.",
    about_h3_2: 'Qui est derrière ShantiLink', about_p3: "ShantiLink est fondé par une équipe d'ingénieurs et de développeurs avec plus de 10 ans d'expérience combinée dans le développement logiciel, l'ingénierie des données et la conception de plateformes digitales.",
    about_cta_sub: "Rejoignez les premiers utilisateurs — 3 mois gratuits, influence directe sur le produit.", about_cta_btn: 'Rejoindre la bêta →',
    about_back: '← Retour',
    // Legal
    legal_title: 'Mentions légales', legal_editor_title: 'Éditeur', legal_editor_val: 'ShantiLink — contact@shantilink.ma',
    legal_host_title: 'Hébergement', legal_host_val: 'Serveur local Python / Uvicorn. Déploiement cloud prévu.',
    legal_data_title: 'Données personnelles', legal_data_val: "Conformément au RGPD, vous disposez d'un droit d'accès, de rectification et de suppression de vos données en nous contactant par email.",
    legal_back: '← Retour',
    // CGU
    cgu_title: "Conditions Générales d'Utilisation", cgu_date: 'Dernière mise à jour : 2025',
    cgu_h1: '1. Objet', cgu_p1: 'Les présentes CGU définissent les conditions d\'utilisation de la plateforme ShantiLink.',
    cgu_h2: '2. Service', cgu_p2: "ShantiLink est en phase bêta permettant le suivi de projets de construction au Maroc et la mise en relation entre acteurs de l'immobilier et de la construction.",
    cgu_h3: '3. Données personnelles', cgu_p3: "Conformément au RGPD, ShantiLink protège vos données. Elles ne sont jamais revendues. Chiffrement JWT pour l'authentification. Base de données SQLite sécurisée.",
    cgu_back: '← Retour',
  },
  en: {
    nav_login: 'Log in', nav_register: 'Sign up', nav_dashboard: 'My space',
    nav_about: 'About', nav_simulator: 'Simulator', nav_pros: 'Professionals',
    nav_solutions: 'Solutions', nav_pricing: 'Pricing', nav_community: 'Community',
    hero_eyebrow: 'Morocco\'s trusted construction platform',
    hero_badge: 'Morocco\'s #1 Construction Platform',
    hero_title: 'Build in Morocco<br><em>with full confidence</em>',
    hero_sub: 'Manage your construction site remotely, track every expense, and connect with top verified professionals.',
    hero_cta1: 'Start for free', hero_cta2: 'Watch demo',
    trust_free: '3 months free', trust_no_card: 'No credit card', trust_langs: 'FR & Arabic', trust_data: 'Secure data',
    stat_projs: 'Projects managed', stat_cities: 'Cities in Morocco', stat_trial: 'Free trial', stat_launch: 'Launch 2025',
    welcome_tagline: 'Build in Morocco with confidence', welcome_who: 'You are...', welcome_choose: 'Choose your profile for a personalized experience',
    profile_client_label: 'Client / MRE', profile_client_sub: 'I\'m building my home',
    profile_promoteur_label: 'Developer', profile_promoteur_sub: 'I manage construction projects',
    profile_arch_label: 'Architect / Office', profile_arch_sub: 'I design projects',
    profile_autre_label: 'Other', profile_autre_sub: 'Accountant, notary...', welcome_skip: 'Skip →',
    demo_tag: 'Discover ShantiLink', demo_title: 'See how it <em style="color:var(--clay-l);font-style:italic">works</em>',
    demo_sub: 'Click on scenes to explore', demo_cta: 'Try for free — 3 months no card →',
    prob_tag: 'The problem', prob_title: 'Building in Morocco without control<br>means risking <em>a lot</em>',
    prob_sub: 'Thousands of families build each year without real visibility over their construction site.',
    prob1_title: 'No remote visibility', prob1_desc: 'You learn about delays weeks later. Too late to act.',
    prob2_title: 'Uncontrollable budget', prob2_desc: 'Money disappears without tracking. Overruns accumulate silently.',
    prob3_title: 'Finding a reliable professional', prob3_desc: 'Impossible to verify reputation without solid references.',
    prob4_title: 'No idea of real costs', prob4_desc: 'Impossible to plan without knowing true costs before you start.',
    sol_tag: 'Our solutions', sol_title: 'Everything to build <em>with peace of mind</em>',
    sol_tab1: 'Site monitoring', sol_tab2: 'Professional matching', sol_tab3: 'AI Reports',
    card_s1t: 'Real-time dashboard', card_s1d: 'Progress, budget, timeline at a glance. Continuously updated.',
    card_s2t: 'Precise budget tracking', card_s2d: 'Every expense tracked with proof. Compared to local market.',
    card_s3t: 'Verified GPS photos', card_s3d: 'Date, time and GPS archived automatically. Tamper-proof.',
    card_s4t: 'Smart alerts', card_s4d: 'Overrun, delay, anomaly — instant alert.',
    card_s5t: 'Field mobile app', card_s5d: 'Contractor uploads photos and data directly from the site.',
    card_s6t: 'Built-in AI', card_s6d: 'Automatic detection of budget anomalies and delays.',
    card_r1t: 'Verified professionals', card_r1d: 'Contractors, architects, engineering offices, accountants, notaries — all verified.',
    card_r2t: 'Geographic search', card_r2d: 'Find a professional by geographic area on an interactive map.',
    card_r3t: 'Secure messaging', card_r3d: 'Communicate safely. Contact details revealed after mutual agreement.',
    card_r4t: 'Verified reviews', card_r4d: 'Each collaboration generates an authentic review visible to all.',
    card_r5t: 'Online quotes', card_r5d: 'Receive and compare quotes directly on the platform.',
    card_r6t: 'Trust badge', card_r6d: 'Certified pros stand out and inspire client confidence.',
    card_p1t: 'Weekly PDF report', card_p1d: 'Complete report generated automatically every week. One-click download.',
    card_p2t: 'Budget analysis', card_p2d: 'Forecast vs actual comparison, overrun alerts, trends.',
    card_p3t: 'Dated photo gallery', card_p3d: 'All site photos organized by week and phase.',
    card_p4t: 'Performance indicators', card_p4d: 'Progress, deadline compliance, quality — measured automatically.',
    card_p5t: 'Automatic sending', card_p5d: 'Report emailed every week without any action required.',
    card_p6t: 'Secure archiving', card_p6d: 'All reports archived and accessible at any time.',
    sim_tag: 'Budget simulator', sim_title: 'Estimate your budget <em>in 30 seconds</em>',
    sim_cta: 'Get a detailed estimate →',
    sim_ville_lbl: 'City', sim_surface_lbl: 'Area', sim_etages_lbl: 'Floors', sim_finition_lbl: 'Finishing',
    sim_total_lbl: 'TOTAL ESTIMATE', sim_go_lbl: 'Structure (50%)', sim_fi_lbl: 'Finishing (25%)',
    sim_ep_lbl: 'Elec & Plumbing (15%)', sim_fe_lbl: 'Ext. finishing (10%)',
    sim_note_txt: 'Indicative estimate. Excludes land, architect and administrative fees.',
    conf_tag: 'Why trust us', conf_title: 'Trust is not declared,<br>it is <em>proven</em>',
    conf1_title: 'Tamper-proof GPS photos', conf1_desc: 'Each photo contains date, time and GPS automatically archived.',
    conf2_title: 'Archived expenses', conf2_desc: 'Every delivery photographed. Quantities and prices verified.',
    conf3_title: 'Auto market comparison', conf3_desc: 'AI compares each expense to local average prices and alerts on anomalies.',
    conf4_title: 'Verified professionals', conf4_desc: 'Documents, trade register, references verified by ShantiLink.',
    conf5_title: 'On-demand video check', conf5_desc: 'Request a live video from the construction site at any time.',
    conf6_title: 'Money-back guarantee', conf6_desc: 'If the information does not match reality, we refund the month.',
    test_quote: "I followed my construction project in Morocco from Lyon without going there once during the works. ShantiLink gave me full visibility every week.",
    test_author: 'Karim B.', test_location: 'First ShantiLink user — Paris, France',
    how_tag: 'How it works', how_title: 'Get started in <em>5 minutes</em>',
    how1_title: 'Create your account', how1_desc: 'Registration in 2 minutes. Choose your profile based on your role.',
    how2_title: 'Describe your project', how2_desc: 'City, area, budget and construction phases.',
    how3_title: 'Find a professional', how3_desc: 'Browse verified profiles and start the connection.',
    how4_title: 'Follow in real time', how4_desc: 'Live dashboard, weekly reports and automatic alerts.',
    pricing_tag: 'Pricing', pricing_title: 'Simple, transparent, <em>no surprises</em>',
    pricing_free_note: '3 months free — No card — Cancel anytime',
    plan1_for: 'Client / Owner', plan1_name: 'Essential', plan1_per: '/ month after 3 free months',
    plan1_f1: '1 active project', plan1_f2: 'Real-time dashboard', plan1_f3: 'Monthly PDF report', plan1_f4: 'Marketplace access', plan1_f5: 'Secure messaging',
    plan1_btn: 'Start 3 months free',
    plan2_tag: 'MOST POPULAR', plan2_for: 'Client / Owner', plan2_name: 'Premium', plan2_per: '/ month after 3 free months',
    plan2_f1: 'Unlimited projects', plan2_f2: 'Weekly AI report', plan2_f3: 'Smart alerts', plan2_f4: 'Verified GPS photos', plan2_f5: 'Market price comparison', plan2_f6: 'On-demand video control',
    plan2_btn: 'Start 3 months free',
    plan3_for: 'Developer / Architect / Office', plan3_name: 'Pro', plan3_per: '/ month after 3 free months',
    plan3_f1: 'Verified profile & badge', plan3_f2: 'Unlimited sites', plan3_f3: 'Auto client reports', plan3_f4: 'Marketplace visibility', plan3_f5: 'Field mobile app', plan3_f6: 'Qualified client requests',
    plan3_btn: 'Start 3 months free',
    contact_tag: 'Contact us', contact_title: 'A question?<br>We are <em style="color:var(--clay);font-style:italic">here for you</em>',
    contact_sub: 'Our team replies within 24 hours.',
    contact_prenom_lbl: 'First name', contact_nom_lbl: 'Last name', contact_email_lbl: 'Email', contact_role_lbl: 'You are', contact_msg_lbl: 'Message',
    contact_send_btn: 'Send →', contact_ok: 'Message sent! Reply within 24h. ✓',
    footer_slogan: 'Connect · Build · Achieve', footer_desc: 'The smart platform for managing and tracking construction projects in Morocco.',
    footer_col1: 'Platform', footer_col2: 'Account',
    footer_link_solutions: 'Solutions', footer_link_simulator: 'Budget simulator', footer_link_pricing: 'Pricing', footer_link_about: 'About',
    footer_link_register: 'Sign up', footer_link_login: 'Log in', footer_link_legal: 'Legal notice', footer_link_cgu: 'Terms',
    footer_country: 'Morocco — France — Belgium', footer_rights: '© 2025 ShantiLink — All rights reserved',
    auth_login_tab: 'Log in', auth_register_tab: 'Sign up',
    auth_login_btn: 'Log in →', auth_register_btn: 'Create my free account →',
    auth_left_title: 'Build in Morocco with <em>confidence</em>',
    auth_left_sub: 'Join hundreds of clients and professionals who trust ShantiLink.',
    auth_feat1: 'Real-time site monitoring', auth_feat2: 'Automatic weekly AI reports',
    auth_feat3: 'Verified and certified professionals', auth_feat4: '3 months free, no credit card', auth_feat5: 'Secure data — JWT encryption',
    auth_login_title: 'Welcome back!', auth_login_sub: 'Sign in to your ShantiLink space.',
    auth_email_lbl: 'Email', auth_pwd_lbl: 'Password', auth_no_account: 'No account? Sign up',
    auth_create_title: 'Create your account', auth_create_sub: '3 months free — No card — Cancel anytime',
    auth_prenom_lbl: 'First name', auth_nom_lbl: 'Last name', auth_role_lbl: 'You are', auth_ville_lbl: 'Project city',
    auth_terms: 'By signing up, you accept our terms. Your data is secure.', auth_back: '← Back to site',
    dash_overview: 'Overview', dash_projects: 'My Projects',
    dash_reports: 'Reports', dash_expenses: 'Budget & Expenses',
    dash_photos: 'GPS Photos', dash_pros: 'Find a pro',
    dash_messages: 'Messages', dash_profile: 'My Profile', dash_simulator: 'Simulator',
    dash_sb_principal: 'Main', dash_sb_marketplace: 'Marketplace', dash_sb_compte: 'Account',
    dash_sb_params: 'Settings', dash_sb_logout: 'Sign out',
    new_user_title: 'Welcome to ShantiLink! 🎉', new_user_sub: 'Your account has been created. Start by creating your first project.',
    new_user_create: '+ Create my first project', new_user_pro: 'Find a professional',
    greeting_prefix: 'Hello,',
    ov_sub: 'Here is the status of your projects this week', ov_new_proj: '+ New project', ov_find_pro: 'Find a pro',
    kpi_proj_lbl: 'ACTIVE PROJECTS', kpi_proj_note: 'Click to manage', kpi_bud_lbl: 'TOTAL BUDGET', kpi_bud_note: 'Total committed',
    kpi_dep_lbl: 'EXPENSES', kpi_dep_note: 'Total', kpi_rep_lbl: 'NEXT REPORT', kpi_rep_val: 'Friday', kpi_rep_note: 'Auto-generated',
    ov_projs_title: 'My projects', ov_see_all: 'View all →',
    ov_activity_title: 'Recent activity', ov_quick_title: 'Quick actions',
    quick_new_proj: '🏗️ New project', quick_find_arch: '📐 Find an architect',
    quick_gen_pdf: '📄 Generate PDF report', quick_add_dep: '💰 Add an expense',
    panel_projs_sub: 'Manage your construction projects', panel_projs_btn: '+ New project',
    panel_projs_form_title: 'New project', panel_projs_nom_lbl: 'Project name', panel_projs_budget_lbl: 'Total budget (DH)',
    panel_projs_type_lbl: 'Project type', panel_projs_etages_lbl: 'Number of floors', panel_projs_ville_lbl: 'City',
    panel_projs_desc_lbl: 'Description (optional)', panel_projs_create_btn: 'Create project', panel_projs_cancel: 'Cancel',
    panel_rep_sub: 'Weekly reports for your construction sites', panel_rep_btn: 'Generate PDF',
    panel_rep_empty: 'Your project reports will appear here automatically every week.',
    panel_dep_sub: 'Financial tracking for your projects', panel_dep_btn: '+ Add expense',
    panel_dep_form_title: 'New expense', panel_dep_desc_lbl: 'Description', panel_dep_montant_lbl: 'Amount (DH)',
    panel_dep_cat_lbl: 'Category', panel_dep_proj_lbl: 'Associated project', panel_dep_date_lbl: 'Date', panel_dep_note_lbl: 'Note (optional)',
    panel_dep_save_btn: 'Save', panel_dep_cancel: 'Cancel',
    kpi_total_dep: 'TOTAL SPENT', kpi_total_note: 'Active projects', kpi_week: 'THIS WEEK', kpi_cat: 'MAIN CATEGORY',
    dep_table_desc: 'Description', dep_table_proj: 'Project', dep_table_cat: 'Category', dep_table_montant: 'Amount', dep_table_date: 'Date',
    panel_photos_sub: 'Your construction site gallery', panel_photos_btn: '+ Add photo',
    panel_photos_form_title: 'Add a photo', panel_photos_take: '📷 Take a photo', panel_photos_pick: '🖼️ Choose a file',
    panel_photos_desc_lbl: 'Description', panel_photos_date_lbl: 'Date', panel_photos_phase_lbl: 'Phase', panel_photos_type_lbl: 'View type',
    panel_photos_save_btn: 'Archive with GPS', panel_photos_cancel: 'Cancel',
    panel_photos_empty: 'Add photos of your construction site with GPS',
    panel_pros_sub: '15 verified professionals — geographic search',
    panel_msgs_sub: 'Exchanges with professionals', conv_title: 'Conversations', select_conv: 'Select a conversation',
    msg_placeholder: 'Your message...', send_btn: 'Send',
    panel_profil_sub: 'Manage your personal information', profil_info_title: 'Personal information',
    profil_prenom_lbl: 'First name', profil_nom_lbl: 'Last name', profil_email_lbl: 'Email', profil_ville_lbl: 'Project city', profil_tel_lbl: 'Phone',
    profil_save_btn: 'Save', profil_trial_title: 'Trial period', profil_trial_active: '3 free months activated', profil_trial_desc: 'Full access to all features',
    panel_params_sub: 'Configure your ShantiLink experience', params_notif_title: 'Notifications',
    params_notif1_title: 'Weekly reports', params_notif1_desc: 'Receive the PDF report every week',
    params_notif2_title: 'Budget alerts', params_notif2_desc: 'Notification if overrun detected',
    params_notif3_title: 'New messages', params_notif3_desc: 'Notification for new messages',
    params_danger_title: 'Danger zone', params_delete_btn: 'Delete my account',
    panel_sim_sub: 'Estimate your project in detail — adapted to the Moroccan market', sim_params_title: 'Your project parameters',
    dsim_region_lbl: 'Region / City', dsim_type_lbl: 'Project type', dsim_surface_lbl: 'Built area (m²)',
    dsim_etages_lbl: 'Number of floors', dsim_finition_lbl: 'Finishing quality', dsim_mat_lbl: 'Materials',
    dsim_soussol_lbl: 'Basement / parking', dsim_piscine_lbl: 'Swimming pool', dsim_calc_btn: '🧮 Calculate estimate',
    sim_detail_lbl: 'Detailed estimate', sim_range_prefix: 'Range:',
    sim_breakdown_title: 'Cost breakdown', sim_indicative: 'Indicative estimate based on average rates in Morocco in 2025',
    sim_create_proj: '🏗️ Create this project',
    sim_b1: 'Foundations & structure', sim_b2: 'Roof & waterproofing', sim_b3: 'Electrical & lighting',
    sim_b4: 'Plumbing & sanitation', sim_b5: 'External joinery', sim_b6: 'Internal joinery',
    sim_b7: 'Tiling & finishes', sim_b8: 'Painting & rendering', sim_b9: 'VRD & outdoor works',
    sim_b10: 'Fees (architect, permits)', sim_b11: 'Contingencies',
    modal_contact_pro: 'Contact professional', modal_msg_lbl: 'Message', modal_send_btn: 'Send message', modal_cancel: 'Cancel',
    panel_rap_sub: 'Weekly reports from your construction sites', panel_rap_btn: 'Generate PDF',
    panel_rap_auto: 'Your project reports will appear here automatically every week.',
    dep_active_title: 'Active expenses', dep_hist_btn: '📋 View full history', dep_hist_hide: 'Hide full history',
    dep_empty: 'No expenses recorded',
    ov_no_proj: 'No projects yet.', ov_create_first: 'Create my first project →',
    ov_no_activity: 'No recent activity',
    proj_done: 'Completed', proj_progress: 'Progress', proj_finished_toast: 'Project completed!',
    proj_empty_title: 'No projects', proj_empty_desc: 'Create your first project to start tracking',
    phase_attente: 'Pending', phase_encours: 'In progress', phase_finalise: 'Completed', phase_bloque: 'Blocked',
    delete_btn: 'Delete',
    rap_no_proj: 'Create a project to see your reports.',
    rap_dl_pdf: 'Download PDF', rap_total_budget: 'Total budget', rap_dep: 'Recorded expenses', rap_photos: 'Archived GPS photos',
    rap_week_prefix: 'Report W', rap_auto_gen: 'Auto-generated',
    conv_loading: 'Loading...', conv_msg_hint: 'Click on a conversation or contact a professional from the marketplace →',
    panel_pros_title: 'Find a professional', pro_filter_all_types: 'All types', pro_filter_all_cities: 'All cities', pro_search_ph: 'Search...',
    planning_title: 'Project planning',
    plan_add_task: 'Add a custom step',
    plan_task_placeholder: 'Step name...',
    plan_add_btn: 'Add',
    plan_label_required: 'Enter a name for this step.',
    plan_period: 'Period',
    nav_back: 'Back',
    about_tag: 'About ShantiLink', about_title: 'A real pain.<br>A real <em style="color:var(--clay);font-style:italic">solution.</em>',
    about_quote: "I managed a construction project in Morocco from Paris. Without proper tools, without real visibility — just Excel and a lot of anxiety. That frustrating experience gave birth to ShantiLink.",
    about_h3_1: 'What we experienced.', about_p1: "Building in Morocco from abroad is an adventure thousands of families experience every year. Each week, money is sent without knowing exactly how it's used.",
    about_p2: "We looked for a solution adapted to the Moroccan market. It didn't exist. So we built it.",
    about_h3_2: 'Who is behind ShantiLink', about_p3: "ShantiLink is founded by a team of engineers and developers with over 10 years of combined experience in software development, data engineering and digital platform design.",
    about_cta_sub: "Join the first users — 3 months free, direct influence on the product.", about_cta_btn: 'Join the beta →',
    about_back: '← Back',
    legal_title: 'Legal Notice', legal_editor_title: 'Publisher', legal_editor_val: 'ShantiLink — contact@shantilink.ma',
    legal_host_title: 'Hosting', legal_host_val: 'Local Python / Uvicorn server. Cloud deployment planned.',
    legal_data_title: 'Personal data', legal_data_val: "In accordance with GDPR, you have the right to access, rectify and delete your data by contacting us by email.",
    legal_back: '← Back',
    cgu_title: 'Terms of Use', cgu_date: 'Last updated: 2025',
    cgu_h1: '1. Purpose', cgu_p1: 'These terms define the conditions for using the ShantiLink platform.',
    cgu_h2: '2. Service', cgu_p2: "ShantiLink is in beta allowing construction project tracking in Morocco and connecting real estate and construction stakeholders.",
    cgu_h3: '3. Personal data', cgu_p3: "In accordance with GDPR, ShantiLink protects your data. It is never resold. JWT encryption for authentication. Secure SQLite database.",
    cgu_back: '← Back',
  },
  ar: {
    // Nav
    nav_login: 'تسجيل الدخول', nav_register: 'إنشاء حساب', nav_dashboard: 'مساحتي', nav_community: 'المجتمع',
    nav_about: 'من نحن', nav_simulator: 'المحاكي', nav_pros: 'المهنيون',
    nav_solutions: 'الحلول', nav_pricing: 'الأسعار',
    // Hero
    hero_eyebrow: 'منصة البناء الموثوقة في المغرب',
    hero_badge: 'المنصة الأولى للبناء في المغرب',
    hero_title: 'ابنِ في المغرب<br><em>بكل ثقة</em>',
    hero_sub: 'أدِر ورشتك عن بُعد، تتبّع كل نفقة، وتواصل مع أفضل المهنيين الموثّقين.',
    hero_cta1: 'ابدأ مجاناً', hero_cta2: 'شاهد العرض',
    // Trust pills
    trust_free: '3 أشهر مجانية', trust_no_card: 'بدون بطاقة بنكية', trust_langs: 'FR والعربية', trust_data: 'بيانات آمنة',
    // Stats
    stat_projs: 'مشروع مُدار', stat_cities: 'مدينة بالمغرب', stat_trial: 'تجربة مجانية', stat_launch: 'إطلاق 2025',
    // Welcome modal
    welcome_tagline: 'ابنِ في المغرب بكل ثقة',
    welcome_who: 'أنت...', welcome_choose: 'اختر ملفك الشخصي لتجربة مخصصة',
    profile_client_label: 'عميل / مغترب', profile_client_sub: 'أبني منزلي',
    profile_promoteur_label: 'مطوّر عقاري', profile_promoteur_sub: 'أدير ورشات',
    profile_arch_label: 'مهندس / مكتب', profile_arch_sub: 'أصمم مشاريع',
    profile_autre_label: 'جهة أخرى', profile_autre_sub: 'محاسب، موثّق...',
    welcome_skip: 'تخطي ←',
    // Demo
    demo_tag: 'اكتشف ShantiLink',
    demo_title: 'شاهد كيف <em style="color:var(--clay-l);font-style:italic">يعمل</em>',
    demo_sub: 'انقر على المشاهد للاستكشاف',
    demo_cta: 'جرّب مجاناً — 3 أشهر بدون بطاقة ←',
    // Problem
    prob_tag: 'المشكلة',
    prob_title: 'البناء في المغرب بدون رقابة<br>يعني المجازفة <em>بالكثير</em>',
    prob_sub: 'آلاف العائلات تبني كل سنة دون رؤية حقيقية على ورشاتهم.',
    prob1_title: 'لا رؤية عن بُعد', prob1_desc: 'تعرف عن التأخيرات بعد أسابيع. فوات الأوان للتدخل.',
    prob2_title: 'ميزانية بلا رقابة', prob2_desc: 'المال يُصرف دون تتبع. تتراكم التجاوزات في صمت.',
    prob3_title: 'إيجاد مهني موثوق', prob3_desc: 'يستحيل التحقق من السمعة دون مراجع موثوقة.',
    prob4_title: 'لا فكرة عن التكلفة الحقيقية', prob4_desc: 'يستحيل التخطيط دون معرفة التكاليف الحقيقية قبل البدء.',
    // Solutions
    sol_tag: 'حلولنا', sol_title: 'كل ما تحتاجه للبناء <em>بهدوء</em>',
    sol_tab1: 'متابعة الورشة', sol_tab2: 'التواصل المهني', sol_tab3: 'تقارير الذكاء الاصطناعي',
    card_s1t: 'لوحة قيادة في الوقت الفعلي', card_s1d: 'التقدم والميزانية والجدول الزمني دفعة واحدة. تحديث مستمر.',
    card_s2t: 'متابعة الميزانية بدقة', card_s2d: 'كل نفقة مُتتبَّعة بمستند. مقارنة مع السوق المحلية.',
    card_s3t: 'صور GPS موثّقة', card_s3d: 'التاريخ والوقت وGPS تُحفظ آلياً. لا يمكن تزويرها.',
    card_s4t: 'تنبيهات ذكية', card_s4d: 'تجاوز، تأخير، شذوذ — تنبيه فوري.',
    card_s5t: 'تطبيق موبايل للميدان', card_s5d: 'المقاول يرفع الصور والبيانات من الورشة مباشرة.',
    card_s6t: 'ذكاء اصطناعي مدمج', card_s6d: 'كشف آلي لشذوذات الميزانية والتأخيرات.',
    card_r1t: 'مهنيون موثّقون', card_r1d: 'مقاولون، مهندسون معماريون، مكاتب دراسات، محاسبون، موثّقون — كلهم موثّقون.',
    card_r2t: 'بحث جغرافي', card_r2d: 'ابحث عن مهني حسب المنطقة الجغرافية على خريطة تفاعلية.',
    card_r3t: 'مراسلة آمنة', card_r3d: 'تواصل بأمان. تُكشف معلومات الاتصال بعد الاتفاق المتبادل.',
    card_r4t: 'تقييمات موثّقة', card_r4d: 'كل تعاون يُولّد تقييماً حقيقياً مرئياً للجميع.',
    card_r5t: 'عروض أسعار أونلاين', card_r5d: 'استلم وقارن عروض الأسعار مباشرة على المنصة.',
    card_r6t: 'شارة الثقة', card_r6d: 'المهنيون المعتمدون يتميّزون ويُلهمون الثقة للعملاء.',
    card_p1t: 'تقرير PDF أسبوعي', card_p1d: 'تقرير شامل يُولَّد آلياً كل أسبوع. قابل للتنزيل بنقرة واحدة.',
    card_p2t: 'تحليل الميزانية', card_p2d: 'مقارنة التوقعات مقابل الإنجاز، تنبيهات التجاوز، الاتجاهات.',
    card_p3t: 'معرض صور مؤرّخ', card_p3d: 'جميع صور الورشة مرتّبة حسب الأسبوع والمرحلة.',
    card_p4t: 'مؤشرات الأداء', card_p4d: 'التقدم، الالتزام بالمواعيد، الجودة — تُقاس آلياً.',
    card_p5t: 'إرسال آلي', card_p5d: 'يُرسل التقرير عبر البريد الإلكتروني كل أسبوع دون أي إجراء.',
    card_p6t: 'أرشفة آمنة', card_p6d: 'جميع التقارير مؤرشفة ومتاحة في أي وقت.',
    // Simulator
    sim_tag: 'محاكي الميزانية', sim_title: 'قدّر ميزانيتك <em>في 30 ثانية</em>',
    sim_cta: 'احصل على تقدير تفصيلي ←',
    sim_ville_lbl: 'المدينة', sim_surface_lbl: 'المساحة', sim_etages_lbl: 'الطوابق', sim_finition_lbl: 'التشطيب',
    sim_total_lbl: 'التقدير الإجمالي',
    sim_go_lbl: 'الهيكل الإنشائي (50%)', sim_fi_lbl: 'التشطيبات (25%)', sim_ep_lbl: 'كهرباء وصرف صحي (15%)', sim_fe_lbl: 'تشطيب خارجي (10%)',
    sim_note_txt: 'تقدير استرشادي. لا يشمل الأرض والمهندس والرسوم الإدارية.',
    // Confiance
    conf_tag: 'لماذا الثقة بنا',
    conf_title: 'الثقة لا تُدّعى،<br>بل <em>تُثبَت</em>',
    conf1_title: 'صور GPS لا يمكن تزويرها', conf1_desc: 'كل صورة تحتوي على التاريخ والوقت وGPS محفوظة آلياً.',
    conf2_title: 'نفقات مؤرشفة', conf2_desc: 'كل توريد مُصوَّر. التحقق من الكميات والأسعار.',
    conf3_title: 'مقارنة السوق الآلية', conf3_desc: 'يقارن الذكاء الاصطناعي كل نفقة بمتوسط الأسعار المحلية وينبّه عند الشذوذ.',
    conf4_title: 'مهنيون موثّقون', conf4_desc: 'الوثائق والسجل التجاري والمراجع يتحقق منها ShantiLink.',
    conf5_title: 'مراقبة فيديو عند الطلب', conf5_desc: 'اطلب فيديو مباشر من الورشة في أي وقت.',
    conf6_title: 'ضمان استرداد الأموال', conf6_desc: 'إذا لم تتطابق المعلومات مع الواقع، نُعيد المبلغ الشهري.',
    // Testimonial
    test_quote: 'تابعت مشروع بنائي في المغرب من ليون دون أن أذهب مرة واحدة أثناء الأشغال. أعطتني ShantiLink رؤية كاملة كل أسبوع.',
    test_author: 'كريم ب.', test_location: 'أول مستخدم لـ ShantiLink — باريس، فرنسا',
    // How it works
    how_tag: 'كيف يعمل', how_title: 'ابدأ في <em>5 دقائق</em>',
    how1_title: 'أنشئ حسابك', how1_desc: 'تسجيل في دقيقتين. اختر ملفك حسب دورك.',
    how2_title: 'صِف مشروعك', how2_desc: 'المدينة، المساحة، الميزانية ومراحل البناء.',
    how3_title: 'ابحث عن مهني', how3_desc: 'تصفّح الملفات الموثّقة وابدأ التواصل.',
    how4_title: 'تابع في الوقت الفعلي', how4_desc: 'لوحة قيادة مباشرة، تقارير أسبوعية وتنبيهات آلية.',
    // Pricing
    pricing_tag: 'الأسعار', pricing_title: 'بسيط، شفاف، <em>بدون مفاجآت</em>',
    pricing_free_note: '3 أشهر مجانية — بدون بطاقة — إلغاء في أي وقت',
    plan1_for: 'عميل / صاحب مشروع', plan1_name: 'الأساسي', plan1_per: '/ شهر بعد 3 أشهر مجانية',
    plan1_f1: 'مشروع نشط واحد', plan1_f2: 'لوحة قيادة في الوقت الفعلي', plan1_f3: 'تقرير PDF شهري', plan1_f4: 'الوصول إلى السوق', plan1_f5: 'مراسلة آمنة',
    plan1_btn: 'ابدأ 3 أشهر مجاناً',
    plan2_tag: 'الأكثر اختياراً', plan2_for: 'عميل / صاحب مشروع', plan2_name: 'البريميوم', plan2_per: '/ شهر بعد 3 أشهر مجانية',
    plan2_f1: 'مشاريع غير محدودة', plan2_f2: 'تقرير ذكاء اصطناعي أسبوعي', plan2_f3: 'تنبيهات ذكية', plan2_f4: 'صور GPS موثّقة', plan2_f5: 'مقارنة أسعار السوق', plan2_f6: 'مراقبة فيديو عند الطلب',
    plan2_btn: 'ابدأ 3 أشهر مجاناً',
    plan3_for: 'مطوّر / مهندس / مكتب', plan3_name: 'الاحترافي', plan3_per: '/ شهر بعد 3 أشهر مجانية',
    plan3_f1: 'ملف موثّق وشارة', plan3_f2: 'ورشات غير محدودة', plan3_f3: 'تقارير عملاء آلية', plan3_f4: 'ظهور في السوق', plan3_f5: 'تطبيق موبايل للميدان', plan3_f6: 'طلبات عملاء مؤهّلة',
    plan3_btn: 'ابدأ 3 أشهر مجاناً',
    // Contact
    contact_tag: 'اتصل بنا', contact_title: 'سؤال ما؟<br><em style="color:var(--clay);font-style:italic">نحن هنا من أجلك</em>',
    contact_sub: 'يرد فريقنا خلال 24 ساعة.',
    contact_prenom_lbl: 'الاسم الأول', contact_nom_lbl: 'اسم العائلة', contact_email_lbl: 'البريد الإلكتروني', contact_role_lbl: 'أنت', contact_msg_lbl: 'الرسالة',
    contact_send_btn: 'إرسال ←', contact_ok: 'تم إرسال رسالتك! رد خلال 24 ساعة. ✓',
    // Footer
    footer_slogan: 'تواصل · ابنِ · حقق',
    footer_desc: 'المنصة الذكية لإدارة ومتابعة مشاريع البناء في المغرب.',
    footer_col1: 'المنصة', footer_col2: 'الحساب',
    footer_link_solutions: 'الحلول', footer_link_simulator: 'محاكي الميزانية', footer_link_pricing: 'الأسعار', footer_link_about: 'من نحن',
    footer_link_register: 'إنشاء حساب', footer_link_login: 'تسجيل الدخول', footer_link_legal: 'الإشعارات القانونية', footer_link_cgu: 'شروط الاستخدام',
    footer_country: 'المغرب — فرنسا — بلجيكا', footer_rights: '© 2025 ShantiLink — جميع الحقوق محفوظة',
    // Auth
    auth_login_tab: 'تسجيل الدخول', auth_register_tab: 'إنشاء حساب',
    auth_login_btn: 'تسجيل الدخول ←', auth_register_btn: 'إنشاء حسابي مجاناً ←',
    auth_left_title: 'ابنِ في المغرب بكل <em>ثقة</em>',
    auth_left_sub: 'انضم إلى مئات العملاء والمهنيين الذين يثقون في ShantiLink.',
    auth_feat1: 'متابعة ورشتك في الوقت الفعلي', auth_feat2: 'تقارير ذكاء اصطناعي أسبوعية تلقائية',
    auth_feat3: 'مهنيون موثّقون ومعتمدون', auth_feat4: '3 أشهر مجانية، بدون بطاقة بنكية', auth_feat5: 'بيانات آمنة — تشفير JWT',
    auth_login_title: 'مرحباً بعودتك!', auth_login_sub: 'سجّل دخولك إلى مساحتك في ShantiLink.',
    auth_email_lbl: 'البريد الإلكتروني', auth_pwd_lbl: 'كلمة المرور',
    auth_no_account: 'ليس لديك حساب؟ سجّل الآن',
    auth_create_title: 'إنشاء حسابك', auth_create_sub: '3 أشهر مجانية — بدون بطاقة — إلغاء في أي وقت',
    auth_prenom_lbl: 'الاسم الأول', auth_nom_lbl: 'اسم العائلة', auth_role_lbl: 'أنت', auth_ville_lbl: 'مدينة المشروع',
    auth_terms: 'بالتسجيل، تقبل شروطنا. بياناتك في أمان.',
    auth_back: '← العودة للموقع',
    // Dashboard
    dash_overview: 'لوحة القيادة', dash_projects: 'مشاريعي',
    dash_reports: 'التقارير', dash_expenses: 'الميزانية والنفقات',
    dash_photos: 'صور GPS', dash_pros: 'ابحث عن مهني',
    dash_messages: 'الرسائل', dash_profile: 'ملفي الشخصي', dash_simulator: 'المحاكي',
    dash_sb_principal: 'الرئيسية', dash_sb_marketplace: 'السوق', dash_sb_compte: 'الحساب',
    dash_sb_params: 'الإعدادات', dash_sb_logout: 'تسجيل الخروج',
    new_user_title: 'مرحباً في ShantiLink! 🎉', new_user_sub: 'تم إنشاء حسابك. ابدأ بإنشاء مشروعك الأول.',
    new_user_create: '+ إنشاء أول مشروع', new_user_pro: 'إيجاد مهني',
    greeting_prefix: 'مرحباً،',
    ov_sub: 'هذا هو حال مشاريعك هذا الأسبوع', ov_new_proj: '+ مشروع جديد', ov_find_pro: 'إيجاد مهني',
    kpi_proj_lbl: 'المشاريع النشطة', kpi_proj_note: 'انقر للإدارة', kpi_bud_lbl: 'الميزانية الإجمالية', kpi_bud_note: 'المجموع المُلتزم',
    kpi_dep_lbl: 'النفقات', kpi_dep_note: 'المجموع', kpi_rep_lbl: 'التقرير القادم', kpi_rep_val: 'الجمعة', kpi_rep_note: 'يُولَّد آلياً',
    ov_projs_title: 'مشاريعي', ov_see_all: 'عرض الكل ←',
    ov_activity_title: 'النشاط الأخير', ov_quick_title: 'إجراءات سريعة',
    quick_new_proj: '🏗️ مشروع جديد', quick_find_arch: '📐 إيجاد مهندس',
    quick_gen_pdf: '📄 توليد تقرير PDF', quick_add_dep: '💰 إضافة نفقة',
    panel_projs_sub: 'أدِر مشاريع البناء الخاصة بك', panel_projs_btn: '+ مشروع جديد',
    panel_projs_form_title: 'مشروع جديد', panel_projs_nom_lbl: 'اسم المشروع', panel_projs_budget_lbl: 'الميزانية الإجمالية (DH)',
    panel_projs_type_lbl: 'نوع المشروع', panel_projs_etages_lbl: 'عدد الطوابق', panel_projs_ville_lbl: 'المدينة',
    panel_projs_desc_lbl: 'الوصف (اختياري)', panel_projs_create_btn: 'إنشاء المشروع', panel_projs_cancel: 'إلغاء',
    panel_rep_sub: 'التقارير الأسبوعية لورشاتك', panel_rep_btn: 'توليد PDF',
    panel_rep_empty: 'ستظهر تقارير مشاريعك هنا آلياً كل أسبوع.',
    panel_dep_sub: 'المتابعة المالية لمشاريعك', panel_dep_btn: '+ إضافة نفقة',
    panel_dep_form_title: 'نفقة جديدة', panel_dep_desc_lbl: 'الوصف', panel_dep_montant_lbl: 'المبلغ (DH)',
    panel_dep_cat_lbl: 'الفئة', panel_dep_proj_lbl: 'المشروع المرتبط', panel_dep_date_lbl: 'التاريخ', panel_dep_note_lbl: 'ملاحظة (اختيارية)',
    panel_dep_save_btn: 'حفظ', panel_dep_cancel: 'إلغاء',
    kpi_total_dep: 'إجمالي المنفق', kpi_total_note: 'المشاريع النشطة', kpi_week: 'هذا الأسبوع', kpi_cat: 'الفئة الرئيسية',
    dep_table_desc: 'الوصف', dep_table_proj: 'المشروع', dep_table_cat: 'الفئة', dep_table_montant: 'المبلغ', dep_table_date: 'التاريخ',
    panel_photos_sub: 'معرض صور ورشتك', panel_photos_btn: '+ إضافة صورة',
    panel_photos_form_title: 'إضافة صورة', panel_photos_take: '📷 التقاط صورة', panel_photos_pick: '🖼️ اختيار ملف',
    panel_photos_desc_lbl: 'الوصف', panel_photos_date_lbl: 'التاريخ', panel_photos_phase_lbl: 'المرحلة', panel_photos_type_lbl: 'نوع العرض',
    panel_photos_save_btn: 'حفظ مع GPS', panel_photos_cancel: 'إلغاء',
    panel_photos_empty: 'أضف صوراً لورشتك مع GPS',
    panel_pros_sub: '15 مهنياً موثّقاً — بحث حسب المنطقة الجغرافية',
    panel_msgs_sub: 'تبادل الرسائل مع المهنيين', conv_title: 'المحادثات', select_conv: 'اختر محادثة',
    msg_placeholder: 'رسالتك...', send_btn: 'إرسال',
    panel_profil_sub: 'أدِر معلوماتك الشخصية', profil_info_title: 'المعلومات الشخصية',
    profil_prenom_lbl: 'الاسم الأول', profil_nom_lbl: 'اسم العائلة', profil_email_lbl: 'البريد الإلكتروني', profil_ville_lbl: 'مدينة المشروع', profil_tel_lbl: 'الهاتف',
    profil_save_btn: 'حفظ', profil_trial_title: 'فترة التجربة', profil_trial_active: '3 أشهر مجانية مُفعَّلة', profil_trial_desc: 'وصول كامل لجميع الميزات',
    panel_params_sub: 'اضبط تجربتك في ShantiLink', params_notif_title: 'الإشعارات',
    params_notif1_title: 'التقارير الأسبوعية', params_notif1_desc: 'استلم تقرير PDF كل أسبوع',
    params_notif2_title: 'تنبيهات الميزانية', params_notif2_desc: 'إشعار عند اكتشاف تجاوز',
    params_notif3_title: 'رسائل جديدة', params_notif3_desc: 'إشعار عند وصول رسائل جديدة',
    params_danger_title: 'منطقة خطر', params_delete_btn: 'حذف حسابي',
    panel_sim_sub: 'قدّر مشروعك بالتفصيل — مُكيَّف مع السوق المغربية', sim_params_title: 'معايير مشروعك',
    dsim_region_lbl: 'المنطقة / المدينة', dsim_type_lbl: 'نوع المشروع', dsim_surface_lbl: 'المساحة المبنية (م²)',
    dsim_etages_lbl: 'عدد الطوابق', dsim_finition_lbl: 'جودة التشطيب', dsim_mat_lbl: 'مواد البناء',
    dsim_soussol_lbl: 'قبو / موقف سيارات', dsim_piscine_lbl: 'مسبح', dsim_calc_btn: '🧮 احسب التقدير',
    sim_detail_lbl: 'تقدير تفصيلي', sim_range_prefix: 'النطاق:',
    sim_breakdown_title: 'تفصيل التكاليف', sim_indicative: 'تقدير استرشادي مبني على متوسط أسعار المغرب 2025',
    sim_create_proj: '🏗️ إنشاء هذا المشروع',
    sim_b1: 'الأساسات والهيكل الإنشائي', sim_b2: 'السقف والعزل المائي', sim_b3: 'الكهرباء والإنارة',
    sim_b4: 'الصرف الصحي والسباكة', sim_b5: 'نجارة خارجية', sim_b6: 'نجارة داخلية',
    sim_b7: 'البلاط والتشطيبات', sim_b8: 'الطلاء واللياسة', sim_b9: 'أعمال الطرق والتهيئة الخارجية',
    sim_b10: 'أتعاب (المهندس والرخص)', sim_b11: 'المصاريف الاحتياطية',
    modal_contact_pro: 'التواصل مع المهني', modal_msg_lbl: 'الرسالة', modal_send_btn: 'إرسال الرسالة', modal_cancel: 'إلغاء',
    panel_rap_sub: 'التقارير الأسبوعية لورشاتك', panel_rap_btn: 'توليد PDF',
    panel_rap_auto: 'ستظهر تقارير مشاريعك هنا تلقائياً كل أسبوع.',
    dep_active_title: 'النفقات النشطة', dep_hist_btn: '📋 عرض السجل الكامل', dep_hist_hide: 'إخفاء السجل الكامل',
    dep_empty: 'لا توجد نفقات مسجلة',
    ov_no_proj: 'لا يوجد مشروع.', ov_create_first: 'إنشاء مشروعي الأول ←',
    ov_no_activity: 'لا يوجد نشاط حديث',
    proj_done: 'مكتمل', proj_progress: 'التقدم', proj_finished_toast: 'اكتمل المشروع!',
    proj_empty_title: 'لا يوجد مشروع', proj_empty_desc: 'أنشئ مشروعك الأول لبدء المتابعة',
    phase_attente: 'في الانتظار', phase_encours: 'جارٍ', phase_finalise: 'مكتمل', phase_bloque: 'محظور',
    delete_btn: 'حذف',
    rap_no_proj: 'أنشئ مشروعاً لعرض تقاريرك.',
    rap_dl_pdf: 'تنزيل PDF', rap_total_budget: 'الميزانية الإجمالية', rap_dep: 'النفقات المسجلة', rap_photos: 'صور GPS المؤرشفة',
    rap_week_prefix: 'تقرير الأسبوع ', rap_auto_gen: 'يُولَّد آلياً',
    conv_loading: 'تحميل...', conv_msg_hint: 'انقر على محادثة أو تواصل مع مهني من السوق ←',
    panel_pros_title: 'ابحث عن مهني', pro_filter_all_types: 'جميع الأنواع', pro_filter_all_cities: 'جميع المدن', pro_search_ph: 'بحث...',
    planning_title: 'جدول الأعمال',
    plan_add_task: 'إضافة مرحلة مخصصة',
    plan_task_placeholder: 'اسم المرحلة...',
    plan_add_btn: 'إضافة',
    plan_label_required: 'أدخل اسماً لهذه المرحلة.',
    plan_period: 'الفترة',
    nav_back: 'رجوع',
    // About
    about_tag: 'عن ShantiLink', about_title: 'ألم حقيقي.<br><em style="color:var(--clay);font-style:italic">حل حقيقي.</em>',
    about_quote: 'أدرت مشروع بناء في المغرب من باريس. بدون أدوات مناسبة، بدون رؤية حقيقية — فقط Excel والكثير من القلق. هذه التجربة المحبطة هي التي أعطت الحياة لـ ShantiLink.',
    about_h3_1: 'ما عشناه.', about_p1: 'البناء في المغرب من الخارج مغامرة تعيشها آلاف العائلات كل سنة. كل أسبوع، تُرسل أموال دون معرفة دقيقة لكيفية استخدامها.',
    about_p2: 'بحثنا عن حل مناسب للسوق المغربية. لم يكن موجوداً. فبنيناه.',
    about_h3_2: 'من وراء ShantiLink', about_p3: 'ShantiLink مؤسَّسة من قِبَل فريق من المهندسين والمطورين بخبرة مشتركة تتجاوز 10 سنوات في تطوير البرمجيات وهندسة البيانات وتصميم المنصات الرقمية.',
    about_cta_sub: 'انضم إلى أوائل المستخدمين — 3 أشهر مجانية، تأثير مباشر على المنتج.', about_cta_btn: 'انضم للإصدار التجريبي ←',
    about_back: '← رجوع',
    // Legal
    legal_title: 'الإشعارات القانونية', legal_editor_title: 'الناشر', legal_editor_val: 'ShantiLink — contact@shantilink.ma',
    legal_host_title: 'الاستضافة', legal_host_val: 'خادم Python / Uvicorn محلي. نشر سحابي مخطط.',
    legal_data_title: 'البيانات الشخصية', legal_data_val: 'وفقاً للـ RGPD، يحق لك الوصول إلى بياناتك وتصحيحها وحذفها بالتواصل معنا عبر البريد الإلكتروني.',
    legal_back: '← رجوع',
    // CGU
    cgu_title: 'شروط الاستخدام', cgu_date: 'آخر تحديث: 2025',
    cgu_h1: '1. الموضوع', cgu_p1: 'تحدّد شروط الاستخدام هذه كيفية استخدام منصة ShantiLink.',
    cgu_h2: '2. الخدمة', cgu_p2: 'ShantiLink في مرحلة تجريبية تتيح متابعة مشاريع البناء في المغرب والتواصل بين مختلف المتدخلين في قطاع العقارات والبناء.',
    cgu_h3: '3. البيانات الشخصية', cgu_p3: 'وفقاً للـ RGPD، تحمي ShantiLink بياناتك. لا تُباع أبداً. تشفير JWT للمصادقة. قاعدة بيانات SQLite آمنة.',
    cgu_back: '← رجوع',
  },
};

// ── Translation helper ────────────────────────────────────────────────────────
window.t = function(key, fallback) {
  const lang = window._currentLang || localStorage.getItem('sl_lang') || 'fr';
  const T = TRANSLATIONS[lang] || TRANSLATIONS.fr;
  if (T[key] !== undefined) return T[key];
  if (fallback !== undefined) return fallback;
  return TRANSLATIONS.fr[key] || key;
};

window.setLang = function(l, btn) {
  window._currentLang = l;
  document.querySelectorAll('.lbtn').forEach(x => x.classList.remove('on'));
  if (btn) btn.classList.add('on');
  document.documentElement.setAttribute('lang', l);
  document.documentElement.setAttribute('dir', l === 'ar' ? 'rtl' : 'ltr');
  localStorage.setItem('sl_lang', l);

  const T = TRANSLATIONS[l] || TRANSLATIONS.fr;

  // translate all data-i18n elements
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (T[key] !== undefined) {
      if (String(T[key]).includes('<')) el.innerHTML = T[key];
      else el.textContent = T[key];
    }
  });

  // update sidebar labels
  const sideMap = {
    dash_overview: 'sb-overview', dash_projects: 'sb-projects',
    dash_reports: 'sb-reports', dash_expenses: 'sb-expenses',
    dash_photos: 'sb-photos', dash_pros: 'sb-pros',
    dash_messages: 'sb-messages', dash_profile: 'sb-profile',
    dash_simulator: 'sb-simulateur',
  };
  Object.entries(sideMap).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (el && T[key]) el.textContent = T[key];
  });

  // update placeholders & aria with data-i18n-placeholder
  document.querySelectorAll('[data-i18n-ph]').forEach(el => {
    const key = el.getAttribute('data-i18n-ph');
    if (T[key] !== undefined) el.placeholder = T[key];
  });

  // translate city dropdowns
  translateCityDropdowns(l);

  // re-run dashboard renders if visible so dynamic content updates
  if (typeof renderOverview  === 'function') try { renderOverview();  } catch(e) {}
  if (typeof renderProjets   === 'function') try { renderProjets();   } catch(e) {}
  if (typeof renderDepenses  === 'function') try { renderDepenses();  } catch(e) {}
  if (typeof renderPhotos    === 'function') try { renderPhotos();    } catch(e) {}
  if (typeof renderRapports  === 'function') try { renderRapports();  } catch(e) {}
  if (typeof renderSimPanel  === 'function') try { renderSimPanel();  } catch(e) {}
};

// ── City name translations ────────────────────────────────────────────────────
const CITY_TRANS = {
  en: {
    'Casablanca': 'Casablanca', 'Rabat': 'Rabat', 'Marrakech': 'Marrakech',
    'Tanger': 'Tangier', 'Agadir': 'Agadir', 'Fès': 'Fes', 'Meknès': 'Meknes',
    'Oujda': 'Oujda', 'Kénitra': 'Kenitra', 'El Jadida': 'El Jadida',
    'Safi': 'Safi', 'Béni Mellal': 'Beni Mellal', 'Laâyoune': 'Laayoune',
    'Dakhla': 'Dakhla', 'Autre ville': 'Other city',
  },
  ar: {
    'Casablanca': 'الدار البيضاء', 'Rabat': 'الرباط', 'Marrakech': 'مراكش',
    'Tanger': 'طنجة', 'Agadir': 'أكادير', 'Fès': 'فاس', 'Meknès': 'مكناس',
    'Oujda': 'وجدة', 'Kénitra': 'القنيطرة', 'El Jadida': 'الجديدة',
    'Safi': 'آسفي', 'Béni Mellal': 'بني ملال', 'Laâyoune': 'العيون',
    'Dakhla': 'الداخلة', 'Autre ville': 'مدينة أخرى',
  },
  fr: {}, // no-op, keep French labels
};

function translateCityDropdowns(lang) {
  const trans = CITY_TRANS[lang] || {};
  document.querySelectorAll('.city-select').forEach(sel => {
    const savedVal = sel.value; // remember selected value (French key)
    Array.from(sel.options).forEach(opt => {
      // opt.value is always the French key (explicit value attribute)
      const tr = trans[opt.value];
      if (tr) opt.textContent = tr;
      else opt.textContent = opt.value; // restore to French key if no translation
    });
    // Restore selected value by key (not by text)
    sel.value = savedVal;
  });
}

// ── Contact form ──────────────────────────────────────────────────────────────
window.submitContact = async function() {
  const prenom  = document.getElementById('cp').value.trim();
  const email   = document.getElementById('ce').value.trim();
  const nom     = document.getElementById('cn') ? document.getElementById('cn').value.trim() : '';
  const role    = document.getElementById('cr') ? document.getElementById('cr').value : '';
  const message = document.getElementById('cm') ? document.getElementById('cm').value.trim() : '';
  if (!email || !message) { toast('Email et message requis.', 'error'); return; }
  try {
    await API.contact({ prenom, nom, email, role, message });
    const ok = document.getElementById('c-ok');
    if (ok) ok.style.display = 'block';
    toast('Message envoyé ! Réponse sous 24h.', 'success');
  } catch (e) {
    toast(e.message, 'error');
  }
};

// ── Scroll-aware nav ─────────────────────────────────────────────────────────
window.addEventListener('scroll', () => {
  const nav = document.querySelector('nav');
  if (nav) nav.classList.toggle('scrolled', window.scrollY > 40);
}, { passive: true });

// ── Community ─────────────────────────────────────────────────────────────────
const ROLE_LABELS = {
  client: 'Client / MRE', promoteur: 'Promoteur', architecte: 'Architecte',
  comptable: 'Comptable', bureau: "Bureau d'études", notaire: 'Notaire',
  electricien: 'Électricien', plombier: 'Plombier', autre: 'Professionnel BTP',
};

const ROLE_COLORS = {
  client:'#1E6FCC', promoteur:'#7C3AED', architecte:'#B45309',
  comptable:'#047857', bureau:'#0E7490', notaire:'#6D28D9',
  electricien:'#D97706', plombier:'#2563EB', autre:'#374151'
};
const ROLE_ICONS = {
  client:'🏠', promoteur:'🏢', architecte:'📐', comptable:'🧾',
  bureau:'📊', notaire:'⚖️', electricien:'⚡', plombier:'🔧', autre:'💼'
};

function _proCard(u, compact) {
  // Support both users table (prenom+nom) and professionals table (nom only)
  const displayName = u.prenom ? (u.prenom + ' ' + (u.nom || '')).trim() : (u.nom || 'Professionnel');
  const bio         = u.bio || u.description || '';
  const isVerified  = u.is_verified || u.verified;
  const roleLabel   = ROLE_LABELS[u.role] || u.role || 'Professionnel';
  const color       = ROLE_COLORS[u.role] || '#374151';
  const icon        = ROLE_ICONS[u.role]  || '💼';
  if (compact) {
    return `<div class="comm-pro-card" style="padding:.8rem;gap:.7rem;display:flex;align-items:center">
      <div class="pro-av-v2" style="background:${color};width:36px;height:36px;font-size:13px;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;flex-shrink:0">${icon}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;color:var(--ink)">${displayName}</div>
        <div style="font-size:11px;color:var(--muted)">${roleLabel}${u.ville ? ' · '+u.ville : ''}</div>
      </div>
    </div>`;
  }
  return `<div class="pro-card-v2">
    <div class="pro-av-v2" style="background:${color}">${icon}</div>
    <div style="flex:1;min-width:0">
      <div class="pro-name-v2">${displayName}</div>
      <div class="pro-role-v2" style="color:${color}">${roleLabel}</div>
      <div class="pro-city-v2">${u.ville ? '📍 '+u.ville : ''}</div>
      ${isVerified ? '<div class="pro-badge-v2">✓ Vérifié ShantiLink</div>' : ''}
      ${bio ? `<div class="pro-bio-v2">${bio}</div>` : ''}
      <button class="pro-contact-btn" onclick="if(window.currentUser){showDashPanel('messages',null);if(typeof openUserChat==='function')openUserChat('${u.id}','${displayName.replace(/'/g,"\\'")}');}else{localStorage.setItem('sl_after_auth','messages');goPage('auth');switchTab('login');}">Contacter →</button>
    </div>
  </div>`;
}

window.loadCommunity = async function() {
  const role  = (document.getElementById('comm-filter-role') || {}).value || '';
  const ville = ((document.getElementById('comm-filter-ville') || {}).value || '').trim();
  const q     = ((document.getElementById('comm-search') || {}).value || '').trim();
  const box   = document.getElementById('comm-directory');
  if (!box) return;
  box.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--muted);font-size:13px">Chargement...</div>';
  try {
    const params = new URLSearchParams();
    if (role)  params.set('role', role);
    if (ville) params.set('ville', ville);
    if (q)     params.set('q', q);
    const res = await fetch('/api/community/directory?' + params.toString());
    const data = await res.json();
    if (!data.length) { box.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--muted);font-size:13px">Aucun profil trouvé pour ces critères.</div>'; return; }
    box.innerHTML = data.map(u => _proCard(u, false)).join('');
  } catch (e) {
    box.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--muted);font-size:13px">Impossible de charger l\'annuaire.</div>';
  }
};

function _renderPostMediaGrid(urls) {
  if (!urls || !urls.length) return '';
  const count = urls.length;
  const cols = count === 1 ? '1fr' : 'repeat(2,1fr)';
  const items = urls.slice(0, 4).map((url, i) => {
    const isVideo = /\.(mp4|webm|mov)/i.test(url);
    const h = count === 1 ? '260px' : '150px';
    const showMore = count > 4 && i === 3;
    const inner = isVideo
      ? '<video src="' + url + '" style="width:100%;height:100%;object-fit:cover" muted preload="metadata"></video>'
        + '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center"><div style="width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.9);display:flex;align-items:center;justify-content:center;font-size:18px;padding-left:4px;cursor:pointer" onclick="openMediaModal(\'' + url + '\',\'video\')">▶</div></div>'
      : '<img src="' + url + '" style="width:100%;height:100%;object-fit:cover;cursor:pointer" loading="lazy" onclick="openMediaModal(\'' + url + '\',\'image\')" onerror="this.style.display=\'none\'"/>';
    const moreOverlay = showMore
      ? '<div style="position:absolute;inset:0;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;color:white;font-size:22px;font-weight:700">+' + (count - 3) + '</div>'
      : '';
    return '<div style="position:relative;height:' + h + ';overflow:hidden;background:var(--sand);border-radius:' + (count === 1 ? '10px' : '6px') + '">'
      + inner + moreOverlay + '</div>';
  }).join('');
  return '<div style="display:grid;grid-template-columns:' + cols + ';gap:3px;margin-top:.7rem;border-radius:10px;overflow:hidden">' + items + '</div>';
}

window.openMediaModal = function(url, type) {
  const existing = document.getElementById('media-modal-overlay');
  if (existing) existing.remove();
  const modal = document.createElement('div');
  modal.id = 'media-modal-overlay';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;cursor:zoom-out';
  modal.onclick = function(e) { if (e.target === modal) modal.remove(); };
  const inner = type === 'video'
    ? '<video src="' + url + '" controls autoplay style="max-width:90vw;max-height:85vh;border-radius:8px"></video>'
    : '<img src="' + url + '" style="max-width:90vw;max-height:85vh;object-fit:contain;border-radius:8px" alt=""/>';
  modal.innerHTML = '<div style="position:relative;max-width:90vw;max-height:90vh">'
    + '<button onclick="document.getElementById(\'media-modal-overlay\').remove()" style="position:absolute;top:-36px;right:0;background:none;border:none;color:white;font-size:28px;cursor:pointer;line-height:1">×</button>'
    + inner + '</div>';
  document.body.appendChild(modal);
};

function _renderCommPost(p) {
  const esc = typeof escHtml === 'function' ? escHtml : (s) => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const ago = typeof timeAgo === 'function' ? timeAgo(p.created_at) : (p.created_at||'').slice(0,10);
  const pinHTML = p.est_epingle
    ? '<span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:100px;background:var(--gold,#E8B84B);color:var(--ink,#0F1D36);margin-left:6px">📌 Épinglé</span>'
    : '';
  const titreHTML = p.titre
    ? '<div style="font-size:14px;font-weight:700;color:var(--ink);margin-bottom:.3rem">' + esc(p.titre) + '</div>'
    : '';
  // Normalise media_urls : utilise media_urls si dispo, sinon fall back sur media_url singulier
  const mediaArr = (Array.isArray(p.media_urls) && p.media_urls.length > 0)
    ? p.media_urls
    : (p.media_url && (p.media_url.startsWith('http') || p.media_url.startsWith('data:') || p.media_url.startsWith('/static/')))
      ? [p.media_url]
      : [];
  const mediaHTML = mediaArr.length > 0 ? _renderPostMediaGrid(mediaArr) : '';
  const tagsHTML = p.tags
    ? '<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:.4rem">'
        + p.tags.split(',').map(tag => tag.trim()).filter(Boolean).map(tag =>
            '<span style="font-size:10px;font-weight:600;padding:2px 8px;border-radius:100px;background:var(--clay-p);color:var(--clay)">' + esc(tag) + '</span>'
          ).join('')
        + '</div>'
    : '';
  return '<div class="comm-post">'
    + '<div class="comm-post-header">'
    + '<div class="comm-post-av">' + esc((p.prenom||'?')[0].toUpperCase()) + '</div>'
    + '<div style="flex:1">'
    + '<div style="font-size:13px;font-weight:600;color:var(--ink)">' + esc(p.prenom||'') + ' ' + esc(p.nom||'') + pinHTML + '</div>'
    + '<div style="font-size:11px;color:var(--muted)">' + ((typeof ROLE_LABELS !== 'undefined' && ROLE_LABELS[p.role]) || p.role || '') + ' · ' + ago + '</div>'
    + '</div>'
    + '</div>'
    + titreHTML
    + '<p style="font-size:13px;color:var(--ink);line-height:1.65;margin:.5rem 0 0;white-space:pre-line">' + esc(p.content||'') + '</p>'
    + mediaHTML
    + tagsHTML
    + '<div style="margin-top:.6rem">'
    + '<button onclick="likePost(this)" data-likes="0" style="font-size:11px;padding:4px 12px;background:transparent;border:1px solid var(--border);border-radius:100px;cursor:pointer;font-family:Outfit,sans-serif;color:var(--muted)">❤ J\'aime</button>'
    + '</div>'
    + '</div>';
}

window.likePost = function(btn) {
  const likes = parseInt(btn.dataset.likes||0) + 1;
  btn.dataset.likes = likes;
  btn.textContent = '❤ ' + likes;
  btn.style.color = 'var(--red)';
};

window.loadDashComm = async function() {
  // Load posts feed
  const postsBox = document.getElementById('dash-comm-posts');
  if (postsBox) {
    postsBox.innerHTML = '<div style="text-align:center;padding:1.5rem;color:var(--muted);font-size:13px">Chargement...</div>';
    try {
      const res = await fetch('/api/community/posts', { headers: { Authorization: 'Bearer ' + (API.getToken() || '') } });
      const posts = await res.json();
      if (!posts.length) {
        postsBox.innerHTML = '<div style="text-align:center;padding:1.5rem;color:var(--muted);font-size:13px">Aucune publication. Soyez le premier à partager !</div>';
      } else {
        const pinnedPosts = posts.filter(p => p.est_epingle);
        const normalPosts = posts.filter(p => !p.est_epingle);
        const sorted = [...pinnedPosts, ...normalPosts];
        postsBox.innerHTML = sorted.map(_renderCommPost).join('');
      }
    } catch(e) { postsBox.innerHTML = '<div style="text-align:center;padding:1.5rem;color:var(--muted);font-size:13px">Impossible de charger le fil.</div>'; }
  }
  // Load directory sidebar
  const dirBox = document.getElementById('dash-comm-dir');
  const q = (document.getElementById('dash-comm-search') || {}).value || '';
  if (dirBox) {
    try {
      const params = new URLSearchParams(); if (q) params.set('q', q);
      const res = await fetch('/api/community/directory?' + params.toString());
      const data = await res.json();
      dirBox.innerHTML = data.slice(0, 8).map(u => _proCard(u, true)).join('') || '<div style="text-align:center;padding:1rem;color:var(--muted);font-size:12px">Aucun profil.</div>';
    } catch(e) { dirBox.innerHTML = ''; }
  }
};

// ── Community post composer state ─────────────────────────────────────────────
let _commImageDataUrl = ''; // legacy compat
let _commMediaItems = []; // [{ tempId, url, localPreview, type, thumbnail, public_id, uploading }]

window.openCommComposer = function() {
  const c = document.getElementById('comm-composer-dash');
  if (!c) return;
  const isOpen = c.style.display !== 'none' && c.style.display !== '';
  if (isOpen) { c.style.display = 'none'; _commMediaItems = []; return; }
  _commMediaItems = [];
  c.innerHTML = '<div style="background:var(--sand);border-radius:14px;padding:1rem 1.1rem;margin-bottom:1rem">'
    + '<input type="text" id="comm-post-titre" placeholder="Titre (optionnel)" maxlength="80" style="width:100%;margin-bottom:.6rem;padding:9px 11px;border-radius:8px;border:1.5px solid var(--border);font-size:13px;box-sizing:border-box;font-family:Outfit,sans-serif;outline:none"/>'
    + '<textarea id="comm-post-text" placeholder="Partagez une actualité, un conseil, une question..." style="width:100%;height:100px;border-radius:8px;border:1.5px solid var(--border);padding:9px 11px;font-size:13px;resize:vertical;box-sizing:border-box;font-family:Outfit,sans-serif;outline:none;line-height:1.6"></textarea>'
    + '<input type="text" id="comm-post-tags" placeholder="Tags : chantier, conseil, btp..." style="width:100%;margin-top:.5rem;padding:8px 11px;border-radius:8px;border:1.5px solid var(--border);font-size:12px;box-sizing:border-box;font-family:Outfit,sans-serif;outline:none"/>'
    // Grille de prévisualisation médias
    + '<div id="comm-media-grid" style="display:none;gap:4px;margin-top:.7rem;border-radius:10px;overflow:hidden"></div>'
    // Barre de progression
    + '<div id="comm-upload-bar" style="display:none;height:3px;background:var(--border);border-radius:2px;margin-top:.5rem;overflow:hidden"><div style="height:100%;background:var(--clay);border-radius:2px;animation:progressIndeterminate 1.2s ease-in-out infinite;width:40%"></div></div>'
    // Actions
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-top:.8rem;flex-wrap:wrap;gap:.4rem">'
    + '<label style="display:inline-flex;align-items:center;gap:5px;padding:7px 13px;border-radius:8px;border:1.5px dashed var(--clay);background:var(--clay-pp);color:var(--clay);font-size:12px;font-weight:600;cursor:pointer;font-family:Outfit,sans-serif" title="Max 4 médias · JPG/PNG/GIF/MP4 · 10Mo images / 50Mo vidéos">'
    + '📷 Image / Vidéo'
    + '<input type="file" id="comm-file-input" accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm" multiple style="display:none" onchange="handleCommFiles(this.files)"/>'
    + '</label>'
    + '<div style="display:flex;gap:.5rem">'
    + '<button onclick="openCommComposer()" style="padding:8px 14px;border-radius:8px;border:1px solid var(--border);background:transparent;font-size:12px;font-weight:600;cursor:pointer;font-family:Outfit,sans-serif;color:var(--muted)">Annuler</button>'
    + '<button onclick="submitCommPost()" id="comm-submit-btn" style="padding:8px 18px;border-radius:8px;border:none;background:var(--clay);color:white;font-size:13px;font-weight:600;cursor:pointer;font-family:Outfit,sans-serif">Publier</button>'
    + '</div>'
    + '</div>'
    + '</div>';
  c.style.display = 'block';
  setTimeout(() => { const t = document.getElementById('comm-post-text'); if (t) t.focus(); }, 50);
};

window.handleCommFiles = async function(files) {
  if (!files || !files.length) return;
  const remaining = 4 - _commMediaItems.length;
  const toProcess = Array.from(files).slice(0, remaining);
  if (files.length > remaining) toast('Maximum 4 médias par post.', 'error');
  for (const file of toProcess) await _uploadCommFile(file);
};

async function _uploadCommFile(file) {
  const isVideo = file.type.startsWith('video/');
  const maxSize = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
  if (file.size > maxSize) { toast('Fichier trop lourd (' + (isVideo ? '50Mo max vidéo' : '10Mo max image') + ')', 'error'); return; }

  const tempId = 'tmp_' + Date.now() + '_' + Math.random().toString(36).slice(2);
  const localPreview = URL.createObjectURL(file);
  _commMediaItems.push({ tempId, url: null, localPreview, type: isVideo ? 'video' : 'image', thumbnail: localPreview, public_id: null, uploading: true });
  _renderCommMediaGrid();
  const bar = document.getElementById('comm-upload-bar');
  if (bar) bar.style.display = 'block';

  try {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/posts/upload-media', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + (API.getToken() || '') },
      body: fd,
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || 'Erreur upload'); }
    const data = await res.json();
    const item = _commMediaItems.find(m => m.tempId === tempId);
    if (item) { item.url = data.url; item.thumbnail = data.thumbnail || data.url; item.public_id = data.public_id; item.uploading = false; URL.revokeObjectURL(localPreview); }
    _renderCommMediaGrid();
    toast('Média ajouté ✓', 'success');
  } catch(err) {
    _commMediaItems = _commMediaItems.filter(m => m.tempId !== tempId);
    URL.revokeObjectURL(localPreview);
    _renderCommMediaGrid();
    toast('Upload échoué : ' + err.message, 'error');
  } finally {
    const bar = document.getElementById('comm-upload-bar');
    if (bar && !_commMediaItems.some(m => m.uploading)) bar.style.display = 'none';
  }
}

function _renderCommMediaGrid() {
  const grid = document.getElementById('comm-media-grid');
  if (!grid) return;
  if (!_commMediaItems.length) { grid.style.display = 'none'; grid.innerHTML = ''; return; }
  const count = _commMediaItems.length;
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = count === 1 ? '1fr' : 'repeat(2,1fr)';
  grid.innerHTML = _commMediaItems.map(item => {
    const src = item.thumbnail || item.localPreview || '';
    const inner = item.type === 'video'
      ? '<video src="' + (item.localPreview || item.url || '') + '" style="width:100%;height:100%;object-fit:cover" muted></video><div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center"><div style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.85);display:flex;align-items:center;justify-content:center;font-size:16px;padding-left:3px">▶</div></div>'
      : '<img src="' + src + '" style="width:100%;height:100%;object-fit:cover" loading="lazy"/>';
    const overlay = item.uploading
      ? '<div style="position:absolute;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center"><div style="width:22px;height:22px;border:2px solid white;border-top-color:transparent;border-radius:50%;animation:spin .7s linear infinite"></div></div>'
      : '<button onclick="removeCommMedia(\'' + item.tempId + '\')" style="position:absolute;top:5px;right:5px;width:22px;height:22px;border-radius:50%;background:rgba(0,0,0,.6);color:white;border:none;cursor:pointer;font-size:14px;line-height:1;display:flex;align-items:center;justify-content:center;font-family:Outfit,sans-serif">×</button>';
    const h = count === 1 ? '220px' : '140px';
    return '<div style="position:relative;height:' + h + ';overflow:hidden;background:var(--border)">' + inner + overlay + '</div>';
  }).join('');
}

window.removeCommMedia = function(tempId) {
  const item = _commMediaItems.find(m => m.tempId === tempId);
  if (item?.public_id) {
    fetch('/api/posts/media/' + encodeURIComponent(item.public_id), {
      method: 'DELETE', headers: { 'Authorization': 'Bearer ' + (API.getToken() || '') }
    }).catch(() => {});
  }
  if (item?.localPreview && item.localPreview.startsWith('blob:')) URL.revokeObjectURL(item.localPreview);
  _commMediaItems = _commMediaItems.filter(m => m.tempId !== tempId);
  _renderCommMediaGrid();
};

window.submitCommPost = async function() {
  const txt   = (document.getElementById('comm-post-text')  || {}).value?.trim();
  const titre = (document.getElementById('comm-post-titre') || {}).value?.trim();
  const tags  = (document.getElementById('comm-post-tags')  || {}).value?.trim();
  if (!txt) { toast('Rédigez votre publication avant de publier.', 'error'); return; }
  if (_commMediaItems.some(m => m.uploading)) { toast('Patientez, upload en cours…', 'error'); return; }
  const btn = document.getElementById('comm-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Publication…'; }
  try {
    const media_urls = _commMediaItems.map(m => m.url).filter(Boolean);
    const payload = { content: txt, titre: titre || '', tags: tags || '', category: 'update', media_urls };
    const res = await fetch('/api/community/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (API.getToken() || '') },
      body: JSON.stringify(payload),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail || 'Erreur serveur'); }
    _commMediaItems = [];
    _commImageDataUrl = '';
    document.getElementById('comm-composer-dash').style.display = 'none';
    toast('Publication envoyée !', 'success');
    loadDashComm();
  } catch(e) {
    toast('Erreur : ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Publier'; }
  }
};

// ── Video modal ───────────────────────────────────────────────────────────────
// ── Demo player (30-second interactive demos) ─────────────────────────────────
const _DM_DUR = 30;
const _DM_TITLES = ['Pilotez votre chantier à distance','Calculez votre budget en 30 sec','Trouvez le bon professionnel'];
const _DM_SUBS  = ['Dashboard · Photos GPS · Planning des phases · KPIs en temps réel','Estimation basée sur les prix moyens marocains 2025','Annuaire vérifié — architectes, bureaux d\'études, notaires, artisans'];

const DEMO_SCREENS = [
/* 0 – Suivi de chantier */
`<div style="font-family:'Outfit',sans-serif">
  <div class="ds-bar" style="margin-bottom:.7rem"><div class="ds-dot" style="background:#ff5f57"></div><div class="ds-dot" style="background:#febc2e"></div><div class="ds-dot" style="background:#28c840"></div><div class="ds-url">ShantiLink.ma · Tableau de bord</div></div>
  <div class="dm-anim" data-anim="m1h" style="margin-bottom:.7rem;opacity:0"><div class="ds-badge-live" style="margin-bottom:.4rem">● Suivi en direct</div><div style="font-size:12px;font-weight:700;color:#1D5FA6">🏗️ Villa Ouazzani — Casablanca R+2</div><div style="font-size:9px;color:rgba(255,255,255,.4);margin-top:2px">Démarré 15 jan. 2025 · Budget total : 1 200 000 DH</div></div>
  <div style="margin-bottom:.8rem">
    <div style="display:flex;justify-content:space-between;font-size:8.5px;color:rgba(255,255,255,.45);margin-bottom:3px"><span>Avancement global</span><span style="color:#1D5FA6;font-weight:700">68%</span></div>
    <div style="height:7px;background:rgba(255,255,255,.08);border-radius:3px;overflow:hidden"><div class="dm-anim" data-anim="m1bar" style="height:100%;background:linear-gradient(90deg,#1D5FA6,#1D9E75);border-radius:3px;width:0"></div></div>
  </div>
  <div style="font-size:8px;font-weight:700;color:rgba(255,255,255,.3);text-transform:uppercase;letter-spacing:.1em;margin-bottom:.4rem">Planning des phases</div>
  <div class="dm-anim ds-phase" data-anim="m1p1" style="background:rgba(40,200,64,.12);color:#28c840;opacity:0">✓ Terrassement — Finalisé · 15 jan. 2025</div>
  <div class="dm-anim ds-phase" data-anim="m1p2" style="background:rgba(40,200,64,.12);color:#28c840;opacity:0">✓ Fondations béton armé — Finalisé · 10 fév. 2025</div>
  <div class="dm-anim ds-phase" data-anim="m1p3" style="background:rgba(29,95,166,.12);color:#1D5FA6;opacity:0">⚙ Gros œuvre (murs + dalles) — En cours depuis 15 mars</div>
  <div class="dm-anim ds-phase" data-anim="m1p4" style="background:rgba(255,255,255,.04);color:rgba(255,255,255,.3);opacity:0">⏳ Charpente &amp; toiture — En attente</div>
  <div class="dm-anim" data-anim="m1photo" style="margin:.7rem 0;opacity:0">
    <div style="font-size:8px;font-weight:700;color:rgba(255,255,255,.3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:.35rem">📸 Photos GPS chantier (23)</div>
    <div style="display:flex;gap:.35rem">
      <div style="width:54px;height:42px;border-radius:6px;background:rgba(29,95,166,.15);border:.5px solid rgba(29,95,166,.25);display:flex;align-items:center;justify-content:center;font-size:18px">🏗️</div>
      <div style="width:54px;height:42px;border-radius:6px;background:rgba(29,95,166,.15);border:.5px solid rgba(29,95,166,.25);display:flex;align-items:center;justify-content:center;font-size:18px">🧱</div>
      <div style="width:54px;height:42px;border-radius:6px;background:rgba(29,95,166,.15);border:.5px solid rgba(29,95,166,.25);display:flex;align-items:center;justify-content:center;font-size:18px">📐</div>
      <div style="flex:1;background:rgba(255,255,255,.04);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:9px;color:rgba(255,255,255,.3)">+20</div>
    </div>
  </div>
  <div class="dm-anim ds-kpi-row" data-anim="m1kpi" style="opacity:0">
    <div class="ds-kpi"><div class="ds-kpi-val">850K</div><div class="ds-kpi-lbl">Dépensé DH</div></div>
    <div class="ds-kpi"><div class="ds-kpi-val">350K</div><div class="ds-kpi-lbl">Restant DH</div></div>
    <div class="ds-kpi"><div class="ds-kpi-val">23</div><div class="ds-kpi-lbl">Photos GPS</div></div>
    <div class="ds-kpi"><div class="ds-kpi-val">2/4</div><div class="ds-kpi-lbl">Phases ✓</div></div>
  </div>
  <div class="dm-anim" data-anim="m1act" style="margin-top:.6rem;background:rgba(255,255,255,.04);border-radius:8px;padding:.45rem .7rem;opacity:0">
    <div style="font-size:8px;color:#28c840;margin-bottom:3px">⚡ Nouvelle photo ajoutée — Gros œuvre · il y a 2h</div>
    <div style="font-size:8px;color:rgba(255,255,255,.35);margin-bottom:2px">📊 Rapport hebdomadaire généré automatiquement · lundi 10h</div>
    <div style="font-size:8px;color:rgba(255,255,255,.35)">💬 Message de l'architecte reçu · hier 14h32</div>
  </div>
</div>`,

/* 1 – Simulateur de budget */
`<div style="font-family:'Outfit',sans-serif">
  <div class="ds-bar" style="margin-bottom:.7rem"><div class="ds-dot" style="background:#ff5f57"></div><div class="ds-dot" style="background:#febc2e"></div><div class="ds-dot" style="background:#28c840"></div><div class="ds-url">ShantiLink.ma · Simulateur de budget</div></div>
  <div class="dm-anim" data-anim="m2h" style="margin-bottom:.7rem;opacity:0"><div class="ds-badge-live" style="margin-bottom:.3rem">● Calcul en direct</div><div style="font-size:12px;font-weight:700;color:rgba(255,255,255,.8)">Estimez votre projet au Maroc</div><div style="font-size:9px;color:rgba(255,255,255,.4)">Prix 2025 · mis à jour chaque trimestre</div></div>
  <div class="dm-anim" data-anim="m2f1" style="margin-bottom:.45rem;opacity:0"><div style="font-size:8px;color:rgba(255,255,255,.35);margin-bottom:2px">📍 Ville / Région</div><div style="font-size:10px;font-weight:600;color:#fff;background:rgba(255,255,255,.07);border-radius:6px;padding:5px 9px">Casablanca — Grand Casablanca</div></div>
  <div class="dm-anim" data-anim="m2f2" style="margin-bottom:.45rem;opacity:0"><div style="font-size:8px;color:rgba(255,255,255,.35);margin-bottom:2px">📐 Surface habitable</div><div style="font-size:10px;font-weight:600;color:#fff;background:rgba(255,255,255,.07);border-radius:6px;padding:5px 9px">250 m² · R+2 (3 niveaux)</div></div>
  <div class="dm-anim" data-anim="m2f3" style="margin-bottom:.45rem;opacity:0"><div style="font-size:8px;color:rgba(255,255,255,.35);margin-bottom:2px">✨ Niveau de finition</div><div style="font-size:10px;font-weight:600;color:#fff;background:rgba(255,255,255,.07);border-radius:6px;padding:5px 9px">Haut standing · Carrelage marbre</div></div>
  <div class="dm-anim" data-anim="m2f4" style="margin-bottom:.55rem;opacity:0"><div style="font-size:8px;color:rgba(255,255,255,.35);margin-bottom:3px">🏗️ Options</div><div style="display:flex;gap:.3rem"><div style="font-size:8.5px;font-weight:600;color:#1D5FA6;background:rgba(29,95,166,.12);border-radius:5px;padding:3px 8px">✓ Sous-sol</div><div style="font-size:8.5px;color:rgba(255,255,255,.4);background:rgba(255,255,255,.05);border-radius:5px;padding:3px 8px">○ Piscine</div><div style="font-size:8.5px;color:rgba(255,255,255,.4);background:rgba(255,255,255,.05);border-radius:5px;padding:3px 8px">○ Garage</div></div></div>
  <div class="dm-anim" data-anim="m2res" style="background:rgba(29,95,166,.1);border:.5px solid rgba(29,95,166,.25);border-radius:10px;padding:.65rem .8rem;opacity:0">
    <div style="font-size:8.5px;color:rgba(255,255,255,.4);margin-bottom:3px">Estimation totale</div>
    <div style="font-size:1.3rem;font-weight:700;color:#1D5FA6;font-family:'Playfair Display',serif">1 812 500 DH</div>
    <div style="font-size:8px;color:rgba(255,255,255,.35)">Fourchette : 1,6M — 2,03M DH</div>
    <div style="height:5px;background:rgba(255,255,255,.07);border-radius:2px;margin:.4rem 0;overflow:hidden"><div class="dm-anim" data-anim="m2mbar" style="height:100%;background:linear-gradient(90deg,#1D5FA6,#1D9E75);border-radius:2px;width:0"></div></div>
    <div style="font-size:8px;font-weight:700;color:rgba(255,255,255,.3);text-transform:uppercase;margin:.4rem 0 .3rem">Ventilation estimée</div>
    <div class="dm-anim" data-anim="m2b1" style="display:flex;justify-content:space-between;font-size:8.5px;padding:3px 0;border-bottom:.5px solid rgba(255,255,255,.06);opacity:0"><span style="color:rgba(255,255,255,.55)">Gros œuvre (50%)</span><span style="color:#fff;font-weight:600">906 250 DH</span></div>
    <div class="dm-anim" data-anim="m2b2" style="display:flex;justify-content:space-between;font-size:8.5px;padding:3px 0;border-bottom:.5px solid rgba(255,255,255,.06);opacity:0"><span style="color:rgba(255,255,255,.55)">Finitions (25%)</span><span style="color:#fff;font-weight:600">453 125 DH</span></div>
    <div class="dm-anim" data-anim="m2b3" style="display:flex;justify-content:space-between;font-size:8.5px;padding:3px 0;border-bottom:.5px solid rgba(255,255,255,.06);opacity:0"><span style="color:rgba(255,255,255,.55)">Équipements (15%)</span><span style="color:#fff;font-weight:600">271 875 DH</span></div>
    <div class="dm-anim" data-anim="m2b4" style="display:flex;justify-content:space-between;font-size:8.5px;padding:3px 0;opacity:0"><span style="color:rgba(255,255,255,.55)">Frais &amp; imprévus (10%)</span><span style="color:#fff;font-weight:600">181 250 DH</span></div>
  </div>
</div>`,

/* 2 – Annuaire professionnel */
`<div style="font-family:'Outfit',sans-serif">
  <div class="ds-bar" style="margin-bottom:.7rem"><div class="ds-dot" style="background:#ff5f57"></div><div class="ds-dot" style="background:#febc2e"></div><div class="ds-dot" style="background:#28c840"></div><div class="ds-url">ShantiLink.ma · Annuaire professionnel</div></div>
  <div class="dm-anim" data-anim="m3h" style="margin-bottom:.7rem;opacity:0"><div class="ds-badge-live" style="margin-bottom:.3rem">● Annuaire vérifié</div><div style="font-size:10px;font-weight:700;color:rgba(255,255,255,.7)">Professionnels certifiés ShantiLink 📍 Maroc</div><div style="background:rgba(255,255,255,.07);border-radius:6px;padding:5px 9px;font-size:9px;color:rgba(255,255,255,.4);margin-top:.4rem">🔍 Architectes à Casablanca...</div></div>
  <div class="ds-pro-card dm-anim" data-anim="m3c1" style="opacity:0;margin-bottom:.35rem"><div class="ds-pro-av" style="background:#B45309">📐</div><div style="flex:1;min-width:0"><div class="ds-pro-name">Karim Benali</div><div class="ds-pro-role">Architecte DPLG · Casablanca</div><div style="font-size:7px;color:rgba(255,255,255,.3);margin-top:1px">⭐ 4.9/5 · 47 avis</div></div><div class="ds-pro-badge">✓ Vérifié</div></div>
  <div class="ds-pro-card dm-anim" data-anim="m3c2" style="opacity:0;margin-bottom:.35rem"><div class="ds-pro-av" style="background:#0E7490">📊</div><div style="flex:1;min-width:0"><div class="ds-pro-name">SBE Ingénierie</div><div class="ds-pro-role">Bureau d'études · Rabat</div><div style="font-size:7px;color:rgba(255,255,255,.3);margin-top:1px">⭐ 4.7/5 · 31 avis</div></div><div class="ds-pro-badge">✓ Vérifié</div></div>
  <div class="ds-pro-card dm-anim" data-anim="m3c3" style="opacity:0;margin-bottom:.35rem"><div class="ds-pro-av" style="background:#D97706">⚡</div><div style="flex:1;min-width:0"><div class="ds-pro-name">Yassine Tazi</div><div class="ds-pro-role">Électricien certifié · Marrakech</div><div style="font-size:7px;color:rgba(255,255,255,.3);margin-top:1px">⭐ 4.8/5 · 23 avis</div></div><div class="ds-pro-badge">✓ Vérifié</div></div>
  <div class="ds-pro-card dm-anim" data-anim="m3c4" style="opacity:0;margin-bottom:.35rem"><div class="ds-pro-av" style="background:#6D28D9">⚖️</div><div style="flex:1;min-width:0"><div class="ds-pro-name">Me. Fatima Haddou</div><div class="ds-pro-role">Notaire · Agadir</div><div style="font-size:7px;color:rgba(255,255,255,.3);margin-top:1px">⭐ 5.0/5 · 18 avis</div></div><div class="ds-pro-badge">✓ Vérifié</div></div>
  <div class="ds-pro-card dm-anim" data-anim="m3c5" style="opacity:0;margin-bottom:.55rem"><div class="ds-pro-av" style="background:#047857">🧾</div><div style="flex:1;min-width:0"><div class="ds-pro-name">Hassan Moujahid</div><div class="ds-pro-role">Comptable BTP · Fès</div><div style="font-size:7px;color:rgba(255,255,255,.3);margin-top:1px">⭐ 4.6/5 · 12 avis</div></div><div class="ds-pro-badge">✓ Vérifié</div></div>
  <div class="dm-anim" data-anim="m3btn" style="opacity:0;text-align:center"><button style="font-size:11px;font-weight:700;padding:9px 24px;background:#1D5FA6;color:#fff;border:none;border-radius:100px;cursor:pointer;font-family:Outfit,sans-serif">💬 Contacter Karim Benali →</button><div style="font-size:8px;color:rgba(255,255,255,.35);margin-top:.4rem">Messagerie sécurisée · Réponse sous 24h</div></div>
</div>`
];

window._demo = { playing: false, offset: 0, startT: 0, raf: null };

function _dmEls() { return document.querySelectorAll('#dm-screen .dm-anim'); }

function _dmApply() {
  _dmEls().forEach(el => {
    const anim = el.dataset.anim;
    el.style.animation = 'none';
    el.offsetHeight;
    el.style.animation = anim + ' ' + _DM_DUR + 's linear ' + (-window._demo.offset) + 's infinite';
    el.style.animationPlayState = window._demo.playing ? 'running' : 'paused';
  });
}

function _dmTick() {
  if (!window._demo.playing) return;
  const pos = ((performance.now() - window._demo.startT) / 1000 + window._demo.offset) % _DM_DUR;
  const seek = document.getElementById('dm-seek');
  const time = document.getElementById('dm-time');
  if (seek) seek.value = (pos / _DM_DUR) * 100;
  if (time) time.textContent = Math.floor(pos) + 's / ' + _DM_DUR + 's';
  window._demo.raf = requestAnimationFrame(_dmTick);
}

window.openDemoModal = function(n) {
  const modal = document.getElementById('demo-modal');
  const screen = document.getElementById('dm-screen');
  if (!modal || !screen) return;
  cancelAnimationFrame(window._demo.raf);
  screen.innerHTML = DEMO_SCREENS[n];
  document.getElementById('dm-modal-title').textContent = _DM_TITLES[n];
  document.getElementById('dm-modal-sub').textContent = _DM_SUBS[n];
  document.getElementById('dm-play-btn').textContent = '⏸';
  const seekEl = document.getElementById('dm-seek');
  const timeEl = document.getElementById('dm-time');
  if (seekEl) seekEl.value = 0;
  if (timeEl) timeEl.textContent = '0s / ' + _DM_DUR + 's';
  window._demo.offset = 0;
  window._demo.playing = true;
  window._demo.startT = performance.now();
  modal.style.display = 'flex';
  setTimeout(_dmApply, 30);
  _dmTick();
};

window.closeDemoModal = function() {
  window._demo.playing = false;
  cancelAnimationFrame(window._demo.raf);
  const m = document.getElementById('demo-modal');
  if (m) m.style.display = 'none';
};

window.toggleDemoPlay = function() {
  if (window._demo.playing) {
    window._demo.offset = ((performance.now() - window._demo.startT) / 1000 + window._demo.offset) % _DM_DUR;
    window._demo.playing = false;
    cancelAnimationFrame(window._demo.raf);
    _dmEls().forEach(el => { el.style.animationPlayState = 'paused'; });
    const btn = document.getElementById('dm-play-btn');
    if (btn) btn.textContent = '▶';
  } else {
    window._demo.playing = true;
    window._demo.startT = performance.now();
    _dmApply();
    const btn = document.getElementById('dm-play-btn');
    if (btn) btn.textContent = '⏸';
    _dmTick();
  }
};

window.seekDemo = function(pct) {
  window._demo.offset = (pct / 100) * _DM_DUR;
  window._demo.startT = performance.now();
  const wasPlaying = window._demo.playing;
  window._demo.playing = true;
  _dmApply();
  if (!wasPlaying) {
    window._demo.playing = false;
    _dmEls().forEach(el => { el.style.animationPlayState = 'paused'; });
  }
};

window.restartDemo = function() {
  window._demo.offset = 0;
  window._demo.startT = performance.now();
  window._demo.playing = true;
  _dmApply();
  const btn = document.getElementById('dm-play-btn');
  if (btn) btn.textContent = '⏸';
  cancelAnimationFrame(window._demo.raf);
  _dmTick();
};

// ── Founder badge ─────────────────────────────────────────────────────────────
window.showFounderBadgeToast = function(num) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:99999;background:linear-gradient(135deg,#E8B84B,#d4a03a);color:white;padding:2rem 2.5rem;border-radius:20px;text-align:center;box-shadow:0 20px 60px rgba(232,184,75,.4);animation:fadeIn .4s ease';
  el.innerHTML = `<div style="font-size:3rem;margin-bottom:.5rem">🏅</div>
    <div style="font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;opacity:.85;margin-bottom:.3rem">Membre Fondateur</div>
    <div style="font-size:2rem;font-weight:800">#${num}</div>
    <div style="font-size:12px;opacity:.9;margin-top:.4rem;max-width:220px;line-height:1.5">Vous êtes parmi les 100 premiers membres de ShantiLink !</div>
    <button onclick="this.parentElement.remove()" style="margin-top:1rem;font-size:12px;padding:7px 20px;background:rgba(255,255,255,.25);color:white;border:none;border-radius:100px;cursor:pointer;font-family:Outfit,sans-serif">Super ! ✨</button>`;
  document.body.appendChild(el);
  setTimeout(() => { if (el.parentElement) el.remove(); }, 6000);
};

function _syncFounderBadge(user) {
  const card = document.getElementById('founder-badge-card');
  if (!card) return;
  if (user && user.founder_badge) {
    card.style.display = 'flex';
    const numEl = document.getElementById('founder-badge-num');
    if (numEl) numEl.textContent = '#' + user.founder_badge;
  } else {
    card.style.display = 'none';
  }
}

// ── Platform stats counter ─────────────────────────────────────────────────────
function animateCounter(el, target, suffix) {
  if (!el) return;
  let start = 0, dur = 1200, step = 16;
  const inc = target / (dur / step);
  const timer = setInterval(() => {
    start = Math.min(start + inc, target);
    el.textContent = Math.round(start).toLocaleString('fr-FR') + (suffix||'');
    if (start >= target) clearInterval(timer);
  }, step);
}

async function loadPlatformStats() {
  try {
    const s = await API.getPlatformStats();
    animateCounter(document.getElementById('stat-pros'), s.pros, '+');
    animateCounter(document.getElementById('stat-cities'), s.cities, '');
    animateCounter(document.getElementById('stat-projects'), s.projects, '+');
  } catch(e) {}
}

// ── Init ──────────────────────────────────────────────────────────────────────
window.addEventListener('load', () => {
  const stored = localStorage.getItem('sl_user');
  if (stored && API.getToken()) {
    try { currentUser = JSON.parse(stored); } catch (e) { API.clearToken(); }
  }
  updateNav();
  if (currentUser) {
    initWorkspace(currentUser.role);
    _syncFounderBadge(currentUser);
  }

    // Vérification silencieuse du token côté serveur
    if (currentUser && API.getToken()) {
      fetch('/api/me', { headers: { 'Authorization': 'Bearer ' + API.getToken() } })
        .then(r => { if (!r.ok) { API.clearToken(); currentUser = null; updateNav(); goPage('landing'); } })
        .catch(() => {}); // pas de connexion → on garde l'état local
    }

  // Handle referral code from URL (?ref=SLXXXXXX)
  const urlParams = new URLSearchParams(window.location.search);
  const refCode = urlParams.get('ref');
  if (refCode) {
    localStorage.setItem('sl_ref_code', refCode);
    if (!currentUser) {
      setTimeout(() => { goPage('auth'); switchTab('register'); }, 300);
    }
  }

  if (!currentUser && !localStorage.getItem('sl_welcomed')) {
    setTimeout(() => {
      const m = document.getElementById('welcome-modal');
      if (m) m.style.display = 'flex';
    }, 800);
  }

  const today = new Date().toISOString().split('T')[0];
  ['dep-date', 'photo-date'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = today;
  });

  calcBudget();
  setTimeout(loadPlatformStats, 500);
  // UXT-07: fetch EUR/MAD rate in background
  _fetchEurRate();
  // Restore currency toggle label
  const ctBtn = document.getElementById('currency-toggle');
  if (ctBtn) ctBtn.textContent = window._currency === 'EUR' ? '€ EUR → DH' : 'DH → € EUR';

  // UXT-02: hash-based routing — restore state from URL on load
  (function _applyInitialHash() {
    const hash = location.hash; // e.g. #/dashboard/projets or #/community
    if (!hash || hash === '#/') return;
    const parts = hash.replace(/^#\//, '').split('/');
    const page = parts[0];
    const panel = parts[1];
    if (page === 'dashboard' && currentUser) {
      goPage('dashboard', true);
      if (panel) setTimeout(() => { if (typeof showDashPanel === 'function') showDashPanel(panel, null); }, 200);
    } else if (page && page !== 'landing') {
      goPage(page, true);
    }
  })();

  // UXT-02: listen for browser back/forward
  window.addEventListener('hashchange', function() {
    const hash = location.hash;
    if (!hash || hash === '#/') { goPage('landing', true); return; }
    const parts = hash.replace(/^#\//, '').split('/');
    const page = parts[0];
    const panel = parts[1];
    if (page === 'dashboard' && currentUser) {
      goPage('dashboard', true);
      if (panel) setTimeout(() => { if (typeof showDashPanel === 'function') showDashPanel(panel, null); }, 150);
    } else if (page) {
      goPage(page, true);
    }
  });

  // restore saved language
  const savedLang = localStorage.getItem('sl_lang') || 'fr';
  window._currentLang = savedLang;
  if (savedLang !== 'fr') {
    const btn = document.querySelector('.lbtn[onclick*="setLang(\'' + savedLang + '\'"]');
    setLang(savedLang, btn);
  } else {
    translateCityDropdowns('fr');
  }
});
