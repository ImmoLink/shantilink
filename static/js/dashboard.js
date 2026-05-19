// ShantiLink – Dashboard logic (all panels, CRUD, map, PDF)

// SEC-12: HTML escape helper — always use for user-supplied content in innerHTML
function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
                  .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

let DB = { projects: [], expenses: [], photos: [], activities: [] };
let prosMap = null, prosMarkers = [], allPros = [], filteredPros = [];
let currentConv = null;
let convCache = {};
let _planPid = null;
let _planPhases = [];
let _planUnsaved = false;

// ── Event delegation pour les boutons PDF par projet ─────────────────────────
document.addEventListener('click', function(e) {
  const btn = e.target.closest('[data-pdf-pid]');
  if (!btn) return;
  const pid = btn.getAttribute('data-pdf-pid');
  if (typeof window.generatePDFForProject === 'function') {
    window.generatePDFForProject(pid);
  } else {
    console.error('generatePDFForProject non disponible');
  }
});

const EXPENSE_CATEGORIES = {
  'Matériaux':    { color:'#3b82f6', bg:'#dbeafe', icon:'🧱' },
  "Main d'œuvre": { color:'#10b981', bg:'#d1fae5', icon:'👷' },
  'Transport':    { color:'#f59e0b', bg:'#fef3c7', icon:'🚛' },
  'Équipement':   { color:'#8b5cf6', bg:'#ede9fe', icon:'🔧' },
  'Honoraires':   { color:'#ec4899', bg:'#fce7f3', icon:'📋' },
  'Gros œuvre':   { color:'#0e7490', bg:'#cffafe', icon:'🏗️' },
  'Électricité':  { color:'#d97706', bg:'#fef3c7', icon:'⚡' },
  'Plomberie':    { color:'#2563eb', bg:'#eff6ff', icon:'🔧' },
  'Peinture':     { color:'#7c3aed', bg:'#f5f3ff', icon:'🎨' },
  'Menuiserie':   { color:'#92400e', bg:'#fef3c7', icon:'🪵' },
  'Carrelage':    { color:'#065f46', bg:'#ecfdf5', icon:'🟦' },
  'Fondations':   { color:'#1f2937', bg:'#f3f4f6', icon:'🏚️' },
  'Autre':        { color:'#6b7280', bg:'#f3f4f6', icon:'📦' },
};
function catBadge(cat) {
  const c = EXPENSE_CATEGORIES[cat] || EXPENSE_CATEGORIES['Autre'];
  return `<span style="display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:600;padding:2px 8px;border-radius:100px;background:${c.bg};color:${c.color};border:1px solid ${c.color}20">${c.icon} ${cat||'Autre'}</span>`;
}
let _ovCharts = {};
let _depCatFilter = null;
let _detailPid = null;
window._detailPid = null;

// ── State reset (call on login / logout to prevent cross-user data leakage) ──
window.resetDashboardState = function() {
  DB = { projects: [], expenses: [], photos: [], activities: [] };
  _planPid    = null;
  _planPhases = [];
  _detailPid  = null;
  window._detailPid = null;
  currentConv = null;
  convCache   = {};
  allPros     = [];
  filteredPros = [];
  prosMarkers  = [];
  Object.values(_ovCharts).forEach(c => { try { c.destroy(); } catch(e){} });
  _ovCharts = {};
  // Reset UI to overview panel
  document.querySelectorAll('.dash-panel').forEach(p => p.classList.remove('on'));
  const ov = document.getElementById('panel-overview');
  if (ov) ov.classList.add('on');
  document.querySelectorAll('.sblink').forEach(b => b.classList.remove('on'));
  const firstBtn = document.querySelector('.sblink');
  if (firstBtn) firstBtn.classList.add('on');
};

// ── Panel switching ───────────────────────────────────────────────────────────
// ── Mobile nav (hamburger) ────────────────────────────────────────────────────
function _isDashboardVisible() {
  const d = document.getElementById('pg-dashboard');
  return d && (d.classList.contains('on') || d.style.display !== 'none');
}

window.toggleMobileNav = function() {
  if (_isDashboardVisible()) {
    // Dashboard : ouvre le sidebar drawer
    const sb = document.querySelector('.sidebar');
    const ov = document.getElementById('sidebar-overlay');
    if (!sb) return;
    const isOpen = sb.classList.contains('mob-open');
    sb.classList.toggle('mob-open', !isOpen);
    if (ov) ov.classList.toggle('open', !isOpen);
    // ferme le dropdown landing si ouvert
    closeMobileNav();
  } else {
    // Landing / autres pages : ouvre le dropdown nav
    const dd = document.getElementById('mob-nav-dropdown');
    if (!dd) return;
    const isOpen = dd.style.display === 'flex';
    dd.style.display = isOpen ? 'none' : 'flex';
    // Sync boutons Mon espace / S'inscrire selon état auth
    const logged = !!localStorage.getItem('sl_token');
    const mobDash = document.getElementById('mob-dash-btn');
    const mobReg  = document.getElementById('mob-reg-btn');
    const mobLog  = document.getElementById('mob-login-btn');
    if (mobDash) mobDash.style.display = logged ? 'block' : 'none';
    if (mobReg)  mobReg.style.display  = logged ? 'none'  : 'block';
    if (mobLog)  mobLog.style.display  = logged ? 'none'  : 'block';
  }
};

window.closeMobileNav = function() {
  const dd = document.getElementById('mob-nav-dropdown');
  if (dd) dd.style.display = 'none';
};

window.closeMobileSidebar = function() {
  const sb = document.querySelector('.sidebar');
  const ov = document.getElementById('sidebar-overlay');
  if (sb) sb.classList.remove('mob-open');
  if (ov) ov.classList.remove('open');
};

window.showDashPanel = function(name, btn) {
  document.querySelectorAll('.dash-panel').forEach(p => p.classList.remove('on'));
  const panel = document.getElementById('panel-' + name);
  if (panel) panel.classList.add('on');
  document.querySelectorAll('.sblink').forEach(b => b.classList.remove('on'));
  // If no btn passed, try to find it by the sb-* id pattern inside the button
  const activBtn = btn || document.querySelector('.sblink [id="sb-' + name + '"]')?.closest('.sblink');
  if (activBtn) activBtn.classList.add('on');
  // UXT-02: deep-linkable panel URL
  const panelHash = '#/dashboard/' + name;
  if (location.hash !== panelHash) history.replaceState(null, '', panelHash);
  // Close mobile drawer after selecting a section
  closeMobileSidebar();
  if (name === 'pros') initMap();
  if (name === 'profil') loadProfilePanel();
  if (name === 'messages') loadConversations();
  if (name === 'depenses') renderDepenses();
  if (name === 'photos') renderPhotos();
  if (name === 'projets') renderProjets();
  if (name === 'rapports') renderRapports();
  if (name === 'simulateur') renderSimPanel();
  if (name === 'planning') renderPlanningPanel();
  if (name === 'communaute') loadDashComm();
  if (name === 'projet-detail' && _detailPid) renderProjectDetail(_detailPid);
  if (name === 'devis') loadBriefsPanel();
  if (name === 'parrainage') loadReferralPanel();
  if (name === 'admin') renderAdminPanel();
};

// ── Load dashboard ────────────────────────────────────────────────────────────
window.loadDashboard = async function() {
  if (!currentUser) return;
  const g = document.getElementById('dash-greet');
  if (g) g.textContent = t('greeting_prefix', 'Bonjour,') + ' ' + currentUser.prenom + ' !';
  try {
    const [projs, exps, phts, acts] = await Promise.all([
      API.getProjects(), API.getExpenses(), API.getPhotos(), API.getActivities()
    ]);
    DB.projects   = projs;
    DB.expenses   = exps;
    DB.photos     = phts;
    DB.activities = acts;
    renderOverview();
  } catch (e) { toast(e.message, 'error'); }
};

// ── Overview ──────────────────────────────────────────────────────────────────
function renderSimBanner() {
  const simEl = document.getElementById('ov-sim-banner');
  if (!simEl) return;
  let sim = null;
  try { sim = JSON.parse(localStorage.getItem('sl_sim')); } catch(e) {}
  if (!sim) { simEl.style.display = 'none'; return; }
  simEl.style.display = 'block';
  simEl.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:.8rem">'
    + '<div>'
    + '<div style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--clay);margin-bottom:.4rem">📊 Votre estimation du ' + sim.date + '</div>'
    + '<div style="font-size:1.3rem;font-family:\'Playfair Display\',serif;font-weight:600;color:var(--ink)">' + sim.tot.toLocaleString('fr-FR') + ' DH</div>'
    + '<div style="font-size:11px;color:var(--muted);margin-top:.2rem">Fourchette : ' + sim.lo.toLocaleString('fr-FR') + ' — ' + sim.hi.toLocaleString('fr-FR') + ' DH</div>'
    + '<div style="display:flex;gap:.8rem;margin-top:.6rem;flex-wrap:wrap">'
    + '<span style="font-size:11px;background:var(--clay-p);color:var(--clay);padding:3px 10px;border-radius:100px">📍 ' + sim.ville + '</span>'
    + '<span style="font-size:11px;background:var(--clay-p);color:var(--clay);padding:3px 10px;border-radius:100px">📐 ' + sim.surface + ' m²</span>'
    + '<span style="font-size:11px;background:var(--clay-p);color:var(--clay);padding:3px 10px;border-radius:100px">🏗️ ' + sim.etages + ' étage(s)</span>'
    + '<span style="font-size:11px;background:var(--clay-p);color:var(--clay);padding:3px 10px;border-radius:100px">✨ ' + sim.finition + '</span>'
    + '</div>'
    + '<div style="margin-top:.8rem;display:grid;grid-template-columns:repeat(2,1fr);gap:.4rem;max-width:400px">'
    + simRow('Gros œuvre (50%)', Math.round(sim.tot * .50))
    + simRow('Finitions (25%)',   Math.round(sim.tot * .25))
    + simRow('Équipements (15%)', Math.round(sim.tot * .15))
    + simRow('Frais & imprévus (10%)', Math.round(sim.tot * .10))
    + '</div>'
    + '</div>'
    + '<button onclick="createProjectFromSim()" style="font-size:12px;font-weight:600;padding:10px 18px;background:var(--clay);color:white;border:none;border-radius:100px;cursor:pointer;font-family:Outfit,sans-serif;white-space:nowrap;align-self:flex-start">🏗️ Créer ce projet</button>'
    + '</div>';
}
function simRow(label, val) {
  return '<div style="background:var(--clay-pp);border-radius:8px;padding:.4rem .6rem"><div style="font-size:9px;color:var(--muted)">' + label + '</div><div style="font-size:12px;font-weight:600">' + val.toLocaleString('fr-FR') + ' DH</div></div>';
}
window.createProjectFromSim = function() {
  let sim = null;
  try { sim = JSON.parse(localStorage.getItem('sl_sim')); } catch(e) {}
  if (!sim) return;
  showDashPanel('projets', null);
  toggleForm('add-proj-form');
  setTimeout(() => {
    const n = document.getElementById('proj-nom'); if (n) n.value = 'Mon projet ' + sim.ville;
    const v = document.getElementById('proj-ville'); if (v) v.value = sim.ville;
    const b = document.getElementById('proj-budget'); if (b) b.value = sim.tot;
    const d = document.getElementById('proj-desc'); if (d) d.value = 'Estimation : ' + sim.surface + ' m² — ' + sim.finition;
  }, 80);
};

function renderOverview() {
  const totalBudget = DB.projects.reduce((s, p) => s + (p.budget || 0), 0);
  const totalDep    = activeExpenses().reduce((s, e) => s + (e.montant || 0), 0);
  const remaining   = Math.max(0, totalBudget - totalDep);
  const budPct      = totalBudget > 0 ? Math.round((totalDep / totalBudget) * 100) : 0;

  // Phase stats across all projects
  let allPhases = [];
  DB.projects.forEach(p => {
    try { const ph = p.phases ? JSON.parse(p.phases) : []; allPhases = allPhases.concat(ph); } catch(e) {}
  });
  const nFin = allPhases.filter(x => x.status === 'finalise').length;
  const nEnc = allPhases.filter(x => x.status === 'encours').length;
  const nBlq = allPhases.filter(x => x.status === 'bloque').length;
  const nAtt = allPhases.length - nFin - nEnc - nBlq;

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('kpi-proj',       DB.projects.length);
  set('kpi-proj-note',  DB.projects.length + ' projet' + (DB.projects.length !== 1 ? 's' : '') + ' actif' + (DB.projects.length !== 1 ? 's' : ''));
  set('kpi-bud',        totalBudget > 0 ? fmt(totalBudget) : '—');
  set('kpi-bud-note',   totalBudget > 0 ? budPct + '% consommé' : 'Budget non défini');
  set('kpi-dep',        fmt(totalDep));
  set('kpi-dep-note',   totalBudget > 0 ? 'Reste : ' + fmt(remaining) : 'Total dépensé');
  set('kpi-photos',     DB.photos.length);
  set('kpi-photos-note',DB.photos.filter(p => p.gps && p.gps.includes(',')).length + ' avec position GPS');
  set('kpi-phases',     allPhases.length ? nFin + '/' + allPhases.length : '—');
  set('kpi-phases-note',allPhases.length ? nEnc + ' en cours • ' + nBlq + ' bloquée' + (nBlq !== 1 ? 's' : '') : 'Aucune phase');

  // Activity feed
  const ac = document.getElementById('ov-activite');
  if (ac) {
    if (DB.activities.length === 0) {
      ac.innerHTML = '<div style="font-size:13px;color:var(--muted);text-align:center;padding:1rem">Aucune activité récente</div>';
    } else {
      ac.innerHTML = DB.activities.slice(0, 10).map(a => {
        const dt = a.created_at ? new Date(a.created_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '';
        const icon = /[Pp]hoto/.test(a.msg) ? '📸' : /[Pp]rojet/.test(a.msg) ? '🏗️' : /[Dd][ée]pense/.test(a.msg) ? '💰' : /message/.test(a.msg) ? '💬' : '⚡';
        return '<div style="display:flex;gap:.6rem;align-items:flex-start;font-size:12px;padding:.4rem 0;border-bottom:.5px solid var(--border)">'
          + '<span style="flex-shrink:0">' + icon + '</span>'
          + '<div style="flex:1;color:var(--ink)">' + esc(a.msg) + '</div>'
          + '<div style="font-size:10px;color:var(--muted);white-space:nowrap;flex-shrink:0">' + dt + '</div></div>';
      }).join('');
    }
  }

  // Projects summary (clickable rows)
  const ov = document.getElementById('ov-projets');
  if (ov) {
    if (DB.projects.length === 0) {
      ov.innerHTML = '<div style="text-align:center;padding:1.5rem;color:var(--muted);font-size:13px">Aucun projet. <span style="color:var(--clay);cursor:pointer" onclick="showDashPanel(\'projets\',null);toggleForm(\'add-proj-form\')">Créer mon premier projet →</span></div>';
    } else {
      ov.innerHTML = DB.projects.map(p => {
        const pc = p.pct || 0;
        return '<div onclick="showProjectDetail(\'' + p.id + '\')" style="display:flex;align-items:center;gap:.8rem;padding:.65rem .8rem;border-radius:10px;cursor:pointer;transition:background .15s" onmouseover="this.style.background=\'var(--sand)\'" onmouseout="this.style.background=\'transparent\'">'
          + '<div style="flex:1;min-width:0">'
          + '<div style="font-size:13px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(p.nom) + '</div>'
          + '<div style="font-size:10px;color:var(--muted);margin-bottom:.3rem">' + esc(p.type||'') + (p.ville ? ' — ' + esc(p.ville) : '') + ' — ' + fmt(p.budget||0) + '</div>'
          + '<div style="height:5px;background:var(--border);border-radius:3px;overflow:hidden"><div style="height:100%;width:' + pc + '%;background:' + pctColor(pc) + ';border-radius:3px;transition:width .4s"></div></div>'
          + '</div>'
          + '<div style="font-size:13px;font-weight:700;color:' + pctColor(pc) + ';flex-shrink:0;min-width:36px;text-align:right">' + pc + '%</div>'
          + '<span style="color:var(--muted);font-size:16px">›</span></div>';
      }).join('');
    }
  }

  // Show/hide chart wrapper
  const wrap = document.getElementById('ov-chart-progress-wrap');
  const noMsg = document.getElementById('ov-no-proj-msg');
  if (DB.projects.length === 0) {
    if (wrap) wrap.style.display = 'none';
    if (noMsg) noMsg.style.display = 'block';
  } else {
    if (wrap) wrap.style.display = '';
    if (noMsg) noMsg.style.display = 'none';
  }

  if (typeof Chart === 'undefined') return;

  const mkChart = (id, cfg) => {
    if (_ovCharts[id]) { try { _ovCharts[id].destroy(); } catch(e) {} delete _ovCharts[id]; }
    const el = document.getElementById(id); if (!el) return;
    _ovCharts[id] = new Chart(el, cfg);
  };

  // Chart 1: Horizontal bar — project progress
  if (DB.projects.length > 0) {
    mkChart('chart-proj-progress', {
      type: 'bar',
      data: {
        labels: DB.projects.map(p => p.nom.length > 20 ? p.nom.slice(0,18) + '…' : p.nom),
        datasets: [{ label: 'Avancement',
          data: DB.projects.map(p => p.pct || 0),
          backgroundColor: DB.projects.map(p => { const v = p.pct||0; return v>=100?'rgba(31,107,58,.75)':v>=60?'rgba(160,82,45,.75)':v>=30?'rgba(245,158,11,.75)':'rgba(156,163,175,.55)'; }),
          borderRadius: 5, borderSkipped: false }]
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend:{display:false}, tooltip:{callbacks:{label: c=>' '+c.raw+'%'}} },
        scales: {
          x: { min:0, max:100, ticks:{font:{size:10},callback:v=>v+'%'}, grid:{color:'rgba(0,0,0,.05)'} },
          y: { ticks:{font:{size:10}}, grid:{display:false} }
        }
      }
    });
  }

  // Chart 2: Doughnut — budget consumed
  const budLegend = document.getElementById('ov-budget-legend');
  if (totalBudget > 0) {
    mkChart('chart-budget', {
      type: 'doughnut',
      data: { labels:['Dépensé','Restant'],
        datasets:[{ data:[totalDep, remaining], backgroundColor:['rgba(160,82,45,.85)','rgba(160,82,45,.12)'], borderWidth:0, hoverOffset:4 }] },
      options: { responsive:true, maintainAspectRatio:false, cutout:'72%',
        plugins:{ legend:{display:false}, tooltip:{callbacks:{label:c=>' '+fmt(c.raw)}} } },
      plugins: [{ id:'centerText', beforeDraw(chart) {
        const {ctx,chartArea:{left,top,right,bottom}} = chart;
        const cx=(left+right)/2, cy=(top+bottom)/2;
        ctx.save(); ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.font='bold 18px Outfit,sans-serif'; ctx.fillStyle='#3A2010';
        ctx.fillText(budPct+'%', cx, cy-8);
        ctx.font='10px Outfit,sans-serif'; ctx.fillStyle='#9CA3AF';
        ctx.fillText('consommé', cx, cy+10); ctx.restore();
      }}]
    });
    if (budLegend) budLegend.innerHTML =
      '<span style="font-size:10px;color:var(--muted);display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;background:rgba(160,82,45,.85);border-radius:3px;display:inline-block"></span>Dépensé : ' + fmt(totalDep) + '</span>'
     +'<span style="font-size:10px;color:var(--muted);display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;background:rgba(160,82,45,.12);border:1px solid rgba(160,82,45,.3);border-radius:3px;display:inline-block"></span>Restant : ' + fmt(remaining) + '</span>';
  } else {
    if (budLegend) budLegend.innerHTML = '<span style="font-size:11px;color:var(--muted)">Aucun budget défini</span>';
  }

  // Chart 3: Doughnut — phase statuses
  const phaseLegend = document.getElementById('ov-phases-legend');
  if (allPhases.length > 0) {
    mkChart('chart-phases', {
      type: 'doughnut',
      data: { labels:['Finalisé','En cours','Bloqué','En attente'],
        datasets:[{ data:[nFin,nEnc,nBlq,nAtt], backgroundColor:['rgba(31,107,58,.8)','rgba(160,82,45,.8)','rgba(139,31,31,.8)','rgba(156,163,175,.45)'], borderWidth:0 }] },
      options: { responsive:true, maintainAspectRatio:false, cutout:'55%',
        plugins:{ legend:{display:false}, tooltip:{callbacks:{label:c=>' '+c.label+': '+c.raw}} } }
    });
    if (phaseLegend) phaseLegend.innerHTML = [
      ['✅','Finalisé',nFin,'var(--green)'],['🔄','En cours',nEnc,'var(--clay)'],
      ['⛔','Bloqué',nBlq,'var(--red)'],['⏳','Attente',nAtt,'#9CA3AF']
    ].map(([ic,lb,n,c])=>'<div style="display:flex;justify-content:space-between;margin-bottom:2px"><span style="color:'+c+'">' + ic + ' ' + lb + '</span><b>' + n + '</b></div>').join('');
  } else {
    if (phaseLegend) phaseLegend.innerHTML = '<div style="font-size:11px;color:var(--muted);text-align:center;padding:.5rem">Aucune phase définie</div>';
  }
}

// ── Project detail ────────────────────────────────────────────────────────────
window.showProjectDetail = function(pid) {
  _detailPid = pid; window._detailPid = pid;
  showDashPanel('projet-detail', null);
  renderProjectDetail(pid);
};

function detailStat(label, value, color) {
  return '<div style="background:var(--clay-pp);border-radius:10px;padding:.7rem .9rem">'
    + '<div style="font-size:10px;color:var(--muted);margin-bottom:.2rem">' + label + '</div>'
    + '<div style="font-size:16px;font-weight:700;color:' + color + '">' + value + '</div></div>';
}

function renderProjectDetail(pid) {
  const p = DB.projects.find(x => x.id === pid);
  if (!p) return;
  const nameEl = document.getElementById('proj-detail-name');
  const subEl  = document.getElementById('proj-detail-sub');
  if (nameEl) nameEl.textContent = p.nom;
  if (subEl)  subEl.textContent  = (p.type||'') + (p.etages ? ' R+'+p.etages : ' RDC') + ' — ' + (p.ville||'') + ' — Budget : ' + fmt(p.budget||0);
  const box = document.getElementById('proj-detail-box');
  if (!box) return;

  // Phases
  let phases = [];
  try { phases = p.phases ? JSON.parse(p.phases) : []; } catch(e) {}
  phases = mergePhasesWithDefaults(phases, getProjectPhases(p.type, p.etages||0));
  const pc   = p.pct || 0;
  const nFin = phases.filter(x => x.status === 'finalise').length;
  const nEnc = phases.filter(x => x.status === 'encours').length;
  const nBlq = phases.filter(x => x.status === 'bloque').length;

  // Expenses for this project
  const projDep   = activeExpenses().filter(e => e.projet === p.nom || e.projet === p.id);
  const totalDep  = projDep.reduce((s, e) => s + (e.montant||0), 0);
  const overBudget = (p.budget||0) > 0 && totalDep > (p.budget||0);

  // Photos (all, limited preview)
  const photos6 = DB.photos.slice(0, 6);

  box.innerHTML =
    // ── Stat cards ──────────────────────────────────────────────────────────
    '<div class="dcard" style="margin-bottom:1rem">'
    + '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:.7rem;margin-bottom:1rem">'
    + detailStat('💰 Budget', fmt(p.budget||0), 'var(--clay)')
    + detailStat('📊 Avancement', pc+'%', pctColor(pc))
    + detailStat('✅ Phases terminées', nFin+'/'+phases.length, 'var(--green)')
    + detailStat('🔄 En cours', nEnc, 'var(--clay)')
    + detailStat('⛔ Bloquées', nBlq, nBlq>0?'var(--red)':'var(--muted)')
    + detailStat('💸 Dépenses', fmt(totalDep), overBudget?'var(--red)':'var(--muted)')
    + '</div>'
    // Progress bar
    + '<div style="display:flex;justify-content:space-between;font-size:11px;font-weight:600;margin-bottom:.3rem"><span>Avancement global</span><span style="color:'+pctColor(pc)+'">'+pc+'%</span></div>'
    + '<div style="height:10px;background:var(--border);border-radius:5px;overflow:hidden"><div style="height:100%;width:'+pc+'%;background:'+pctColor(pc)+';border-radius:5px;transition:width .6s"></div></div>'
    + (overBudget ? '<div style="font-size:11px;color:var(--red);margin-top:.4rem">⚠️ Budget dépassé de ' + fmt(totalDep-(p.budget||0)) + '</div>' : '')
    + '</div>'
    // ── Phases ──────────────────────────────────────────────────────────────
    + '<div class="dcard" style="margin-bottom:1rem">'
    + '<div class="dcard-tit">📋 Phases du planning <span style="cursor:pointer;color:var(--clay);font-weight:500" onclick="openPlanningPanel(\''+pid+'\')">Ouvrir le planning complet →</span></div>'
    + '<div style="display:flex;flex-direction:column;gap:.28rem">'
    + phases.slice(0,10).map(ph => {
        const st = PHASE_STATUS[ph.status] || PHASE_STATUS.attente;
        const dur = ph.startDate && ph.endDate ? ' · ' + ph.startDate.replace(/-/g,'/') + '→' + ph.endDate.replace(/-/g,'/') : '';
        return '<div style="display:flex;align-items:center;gap:.5rem;padding:.35rem .6rem;border-radius:8px;background:'+st.bg+'">'
          + '<div style="width:3px;height:18px;background:'+st.color+';border-radius:2px;flex-shrink:0"></div>'
          + '<span style="flex:1;font-size:12px;color:var(--ink)">' + translatePhLabel(ph.label) + '</span>'
          + (dur ? '<span style="font-size:9px;color:var(--muted)">' + dur + '</span>' : '')
          + '<span style="font-size:10px;padding:2px 8px;border-radius:100px;background:white;color:'+st.color+';font-weight:600">'+st.icon+' '+st.label+'</span>'
          + '</div>';
      }).join('')
    + (phases.length>10 ? '<div style="font-size:11px;color:var(--muted);text-align:center;padding:.4rem">+ '+(phases.length-10)+' autres phases — <span style="color:var(--clay);cursor:pointer" onclick="openPlanningPanel(\''+pid+'\')">voir tout</span></div>' : '')
    + '</div></div>'
    // ── Photos preview ───────────────────────────────────────────────────────
    + (DB.photos.length>0 ? '<div class="dcard" style="margin-bottom:1rem">'
    + '<div class="dcard-tit">📸 Photos chantier <span style="cursor:pointer;color:var(--clay);font-weight:500" onclick="showDashPanel(\'photos\',null)">Voir tout →</span></div>'
    + '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:.5rem">'
    + photos6.map(ph=>'<div style="border-radius:10px;overflow:hidden;cursor:pointer;position:relative" onclick="openPhotoFull(\'' + (ph.image_url||'') + '\')">'
      + (ph.image_url
        ? '<img src="'+ph.image_url+'" style="width:100%;aspect-ratio:1;object-fit:cover"/>'
        : '<div style="background:var(--clay-pp);aspect-ratio:1;display:flex;align-items:center;justify-content:center;font-size:1.8rem">'+ph.emoji+'</div>')
      + '<div style="padding:.3rem .4rem;font-size:9px;color:var(--muted);background:white">' + ph.description.slice(0,22) + '</div>'
      + (ph.gps ? '<div style="font-size:8px;color:var(--clay);padding:0 .4rem .3rem">📍</div>' : '')
      + '</div>').join('')
    + '</div></div>' : '')
    // ── Expenses ─────────────────────────────────────────────────────────────
    + (projDep.length>0 ? '<div class="dcard">'
    + '<div class="dcard-tit">💰 Dépenses liées <span style="cursor:pointer;color:var(--clay);font-weight:500" onclick="showDashPanel(\'depenses\',null)">Voir tout →</span></div>'
    + projDep.slice(0,6).map(e=>'<div style="display:flex;justify-content:space-between;align-items:center;padding:.4rem 0;border-bottom:.5px solid var(--border);font-size:12px">'
      + '<div><div style="font-weight:500;color:var(--ink)">' + e.description + '</div>'
      + '<div style="font-size:10px;color:var(--muted)">' + (e.categorie||'Autre') + ' — ' + (e.date||'') + '</div></div>'
      + '<div style="font-weight:700;color:var(--clay);white-space:nowrap">' + fmt(e.montant||0) + '</div></div>').join('')
    + '<div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;padding:.5rem 0;color:var(--ink)"><span>Total</span><span style="color:'+(overBudget?'var(--red)':'var(--clay)')+'">'+fmt(totalDep)+'</span></div>'
    + '</div>' : '<div class="dcard" style="text-align:center;color:var(--muted);font-size:13px;padding:1rem">Aucune dépense enregistrée pour ce projet.<br><span style="color:var(--clay);cursor:pointer" onclick="showDashPanel(\'depenses\',null);toggleForm(\'add-dep-form\')">+ Ajouter une dépense</span></div>');
}

// ── Projects ──────────────────────────────────────────────────────────────────
function pctColor(pct) {
  if (pct >= 100) return 'var(--green)';
  if (pct >= 60)  return 'var(--clay)';
  if (pct >= 30)  return 'var(--amber)';
  return '#aaa';
}

function projCardHTML(p, showActions = false) {
  const pct = p.pct || 0;
  const badgeId = 'pct-badge-' + p.id;
  // Budget vs dépenses
  const projExp = (DB.expenses || []).filter(e => e.project_id === p.id && !e.deleted);
  const totalDep = projExp.reduce((s, e) => s + (e.montant || 0), 0);
  const overBudget = p.budget > 0 && totalDep > p.budget;
  const budgetPct = p.budget > 0 ? Math.min(100, Math.round(totalDep / p.budget * 100)) : 0;
  const budgetBar = p.budget > 0
    ? '<div style="margin-top:.5rem">'
      + '<div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:3px">'
      + '<span style="color:var(--muted)">💰 Dépenses / Budget</span>'
      + '<span style="font-weight:700;color:' + (overBudget ? 'var(--red)' : 'var(--ink)') + '">' + fmt(totalDep) + ' / ' + fmt(p.budget) + '</span>'
      + '</div>'
      + '<div style="height:5px;background:var(--sand);border-radius:3px"><div style="height:100%;border-radius:3px;background:' + (overBudget ? 'var(--red)' : budgetPct > 75 ? 'var(--amber)' : 'var(--green)') + ';width:' + budgetPct + '%"></div></div>'
      + '</div>'
    : '';
  const badge = pct >= 100
    ? '<span id="' + badgeId + '" class="bdg bdg-ok">✓ ' + t('proj_done','Terminé') + '</span>'
    : pct >= 60 ? '<span id="' + badgeId + '" class="bdg bdg-warn">' + pct + '%</span>'
    : '<span id="' + badgeId + '" class="bdg" style="background:var(--sand);color:var(--muted)">' + pct + '%</span>';

  const sliderBlock = showActions
    ? '<div style="margin-top:.9rem">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.3rem">'
        + '<span style="font-size:11px;font-weight:600;color:var(--ink)">' + t('proj_progress','Avancement') + '</span>'
        + '<span id="pct-lbl-' + p.id + '" style="font-size:12px;font-weight:700;color:' + pctColor(pct) + '">' + pct + '%</span>'
        + '</div>'
        + '<input type="range" min="0" max="100" step="5" value="' + pct + '" id="pct-slider-' + p.id + '" '
        + 'style="width:100%;accent-color:var(--clay);cursor:pointer" '
        + 'oninput="liveUpdatePct(\'' + p.id + '\',this.value)" '
        + 'onchange="savePct(\'' + p.id + '\',this.value)"/>'
        + '<div style="display:flex;justify-content:space-between;font-size:9px;color:var(--muted);margin-top:1px"><span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span></div>'
        + '</div>'
        + '<div style="margin-top:.6rem;display:flex;gap:.5rem;flex-wrap:wrap">'
        + '<button onclick="addExpenseForProject(\'' + p.id + '\',\'' + p.nom.replace(/'/g,"\\'") + '\')" style="margin:0;font-size:11px;font-weight:600;padding:5px 12px;background:#eafaf1;color:#1e8449;border:.5px solid rgba(30,132,73,.25);border-radius:100px;cursor:pointer;font-family:Outfit,sans-serif">💸 Dépense</button>'
        + '<button onclick="openPlanningPanel(\'' + p.id + '\')" style="margin:0;font-size:11px;font-weight:600;padding:5px 12px;background:var(--blue-b);color:var(--blue);border:.5px solid rgba(26,79,139,.2);border-radius:100px;cursor:pointer;font-family:Outfit,sans-serif">📋 ' + t('planning_title','Planning') + '</button>'
        + '<button onclick="openEditProject(\'' + p.id + '\')" style="margin:0;font-size:11px;font-weight:600;padding:5px 12px;background:var(--sand);color:var(--ink);border:.5px solid var(--border);border-radius:100px;cursor:pointer;font-family:Outfit,sans-serif">✏️ Modifier</button>'
        + '<button onclick="delProjet(\'' + p.id + '\')" style="margin:0;font-size:11px;font-weight:500;padding:5px 12px;background:var(--red-b);color:var(--red);border:.5px solid rgba(139,31,31,.2);border-radius:100px;cursor:pointer;font-family:Outfit,sans-serif">' + t('delete_btn','Supprimer') + '</button>'
        + '<button onclick="shareProject(\'' + p.id + '\')" style="margin:0;font-size:11px;font-weight:600;padding:5px 12px;background:#EFF6FF;color:#1D4ED8;border:.5px solid rgba(29,78,216,.2);border-radius:100px;cursor:pointer;font-family:Outfit,sans-serif">&#x1F517; Partager</button>'
        + '<button onclick="openDocumentsPanel(\'' + p.id + '\',\'' + p.nom.replace(/'/g,"\\'") + '\')" style="margin:0;font-size:11px;font-weight:600;padding:5px 12px;background:#F0FDF4;color:#059669;border:.5px solid rgba(5,150,105,.2);border-radius:100px;cursor:pointer;font-family:Outfit,sans-serif">&#x1F4C1; Docs</button>'
        + '</div>'
    : '';

  return '<div class="proj-card">'
    + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:.5rem">'
    + '<div><div class="proj-name">' + p.nom + '</div><div class="proj-meta">' + p.type + ' — ' + p.ville + ' — Budget : ' + fmt(p.budget || 0) + '</div></div>'
    + badge + '</div>'
    + (p.description ? '<div style="font-size:12px;color:var(--muted);margin:.4rem 0">' + p.description + '</div>' : '')
    + '<div class="prog-bar"><div class="prog-fill" style="width:' + pct + '%;background:' + pctColor(pct) + '"></div></div>'
    + budgetBar
    + sliderBlock
    + '</div>';
}

function renderProjets() {
  const list = document.getElementById('projets-list');
  if (!list) return;
  if (DB.projects.length === 0) {
    list.innerHTML = '<div style="text-align:center;padding:3rem;color:var(--muted)"><div style="font-size:2rem;margin-bottom:1rem">🏗️</div><div style="font-size:14px;font-weight:600;margin-bottom:.5rem">' + t('proj_empty_title','Aucun projet') + '</div><div style="font-size:13px">' + t('proj_empty_desc','Créez votre premier projet pour commencer le suivi') + '</div></div>';
    return;
  }
  list.innerHTML = DB.projects.map(p => projCardHTML(p, true)).join('');
}

window.addExpenseForProject = function(projectId, projectName) {
  // Navigate to depenses panel
  showDashPanel('depenses', null);
  // After render, pre-select the project and open the add form
  setTimeout(() => {
    const sel = document.getElementById('dep-project');
    if (sel) {
      sel.value = projectId;
      // Dispatch change event in case listeners depend on it
      sel.dispatchEvent(new Event('change'));
    }
    // Open the add expense form if not already open
    const form = document.getElementById('add-dep-form');
    if (form && form.style.display !== 'block') {
      toggleForm('add-dep-form');
    }
    // Scroll form into view
    if (form) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 150);
};

window.togglePhaseCustom = function(sel) {
  const custom = document.getElementById('photo-phase-custom');
  if (!custom) return;
  custom.style.display = sel.value === '__autre__' ? 'block' : 'none';
  if (sel.value !== '__autre__') custom.value = '';
};

window.toggleForm = function(id) {
  const f = document.getElementById(id);
  if (!f) return;
  const opening = f.style.display !== 'block';
  f.style.display = opening ? 'block' : 'none';
  if (opening && id === 'add-dep-form' && typeof window.onDepFormOpen === 'function') {
    window.onDepFormOpen();
  }
};

window.addProjet = async function() {
  const nom    = document.getElementById('proj-nom').value.trim();
  const ville  = document.getElementById('proj-ville').value.trim();
  const budget = parseInt(document.getElementById('proj-budget').value) || 0;
  const type   = document.getElementById('proj-type').value;
  const etages = parseInt(document.getElementById('proj-etages')?.value) || 0;
  const desc   = document.getElementById('proj-desc').value.trim();
  if (!nom || !ville) { toast('Nom et ville requis.', 'error'); return; }
  try {
    const p = await API.createProject({ nom, ville, budget, type, etages, description: desc });
    DB.projects.unshift(p);
    renderProjets(); renderOverview();
    toggleForm('add-proj-form');
    ['proj-nom', 'proj-ville', 'proj-budget', 'proj-desc'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    toast('Projet "' + nom + '" créé !', 'success');
  } catch (e) { toast(e.message, 'error'); }
};

// Live label update while dragging slider (no API call)
window.liveUpdatePct = function(pid, val) {
  const pct  = parseInt(val);
  const col  = pctColor(pct);
  const lbl  = document.getElementById('pct-lbl-' + pid);
  const fill = document.querySelector('#pct-slider-' + pid)
    ?.closest('.proj-card')?.querySelector('.prog-fill');
  const badge = document.getElementById('pct-badge-' + pid);
  if (lbl)  { lbl.textContent = pct + '%'; lbl.style.color = col; }
  if (fill) { fill.style.width = pct + '%'; fill.style.background = col; }
  if (badge) {
    if (pct >= 100) {
      badge.textContent = '✓ ' + t('proj_done','Terminé');
      badge.className = 'bdg bdg-ok';
      badge.style = '';
    } else if (pct >= 60) {
      badge.textContent = pct + '%';
      badge.className = 'bdg bdg-warn';
      badge.style = '';
    } else {
      badge.textContent = pct + '%';
      badge.className = 'bdg';
      badge.style.background = 'var(--sand)';
      badge.style.color = 'var(--muted)';
    }
  }
};

// Save on slider release (API call)
window.savePct = async function(pid, val) {
  const pct = Math.min(100, Math.max(0, parseInt(val) || 0));
  const p = DB.projects.find(x => x.id === pid);
  if (!p) return;
  try {
    const res = await API.updatePct(pid, pct);
    p.pct = pct;
    renderOverview();
    const msg = pct >= 100 ? '🎉 ' + t('proj_finished_toast','Projet terminé !') : t('proj_progress','Avancement') + ' : ' + pct + '%';
    toast(msg, pct >= 100 ? 'success' : 'success');
    // PRO-09: prompt for review when project just reached 100%
    if (res && res.just_completed) {
      setTimeout(() => {
        if (confirm('🎉 Projet terminé ! Souhaitez-vous laisser un avis sur votre prestataire ?')) {
          showDashPanel('communaute', null);
          setTimeout(() => { if (typeof openReviewModal === 'function') openReviewModal(null, null); }, 300);
        }
      }, 1500);
    }
  } catch (e) { toast(e.message, 'error'); }
};

// ── Planning phases — dynamic, 4 statuses ─────────────────────────────────────
const PHASE_STATUS = {
  attente:  { get label() { return t('phase_attente','En attente'); }, color: '#9CA3AF', bg: '#F9FAFB', icon: '⏳' },
  encours:  { get label() { return t('phase_encours','En cours'); },   color: 'var(--clay)', bg: 'var(--clay-pp)', icon: '🔄' },
  finalise: { get label() { return t('phase_finalise','Finalisé'); },  color: 'var(--green)', bg: 'var(--green-b)', icon: '✅' },
  bloque:   { get label() { return t('phase_bloque','Bloqué'); },      color: 'var(--red)', bg: 'var(--red-b)', icon: '🚫' },
};

function getProjectPhases(type, nFloors) {
  nFloors = Math.max(0, Math.min(10, parseInt(nFloors) || 0));
  const t = (type || '').toLowerCase();
  let labels = [];

  if (t.includes('rénovation') || t.includes('renovation') || t.includes('extension')) {
    labels = [
      '📋 Autorisations & permis de construire',
      '🔍 Diagnostic & audit de l\'existant',
      '🔨 Démolition & dépose des anciens revêtements',
      '🏗️ Renforcement & consolidation de structure',
    ];
    if (nFloors > 0) labels.push('🧱 Extension — gros œuvre (' + nFloors + ' niveau' + (nFloors>1?'x':'') + ')');
    labels.push(...[
      '⚡ Électricité — mise aux normes & 1er passage',
      '🔧 Plomberie — mise aux normes & 1er passage',
      '🏠 Toiture & étanchéité',
      '🪟 Menuiserie extérieure (portes, fenêtres)',
      '🟦 Carrelage & revêtements sols & murs',
      '🚪 Menuiserie intérieure',
      '🎨 Peinture & finitions',
      '💡 Électricité — finitions',
      '🚿 Plomberie — finitions & sanitaires',
      '✅ Nettoyage & réception',
    ]);

  } else if (t.includes('immeuble') || t.includes('collectif') || t.includes('promoteur')) {
    labels = [
      '📋 Permis de construire, études sol & sismique',
      '📐 Implantation & terrassement',
      '⬛ Fondations profondes (pieux & semelles)',
    ];
    if (nFloors > 0) labels.push('🚗 Sous-sol / parking (structure)');
    labels.push('🧱 Gros œuvre — RDC (dalles, poteaux, voiles)');
    for (let f = 1; f <= nFloors; f++) labels.push('🧱 Gros œuvre — R+' + f + ' (structure & dalle)');
    labels.push(...[
      '🏠 Dalle terrasse & étanchéité',
      '🧱 Cloisons & parties communes',
      '🛗 Cage d\'escalier & ascenseur',
      '⚡ Électricité — colonnes montantes & gaines',
      '🔧 Plomberie — colonnes & collecteurs',
      '🪟 Menuiserie extérieure (façades, vitrages)',
      '🏗️ Enduits extérieurs & ravalement façades',
      '🟦 Carrelage parties communes',
      '🔑 Finitions appartements (par tranche)',
      '🌿 VRD & aménagements extérieurs',
      '✅ Réception, conformité & livraisons',
    ]);

  } else if (t.includes('bureau') || t.includes('commercial') || t.includes('local')) {
    labels = [
      '📋 Permis de construire & autorisations',
      '📐 Étude de sol & topographie',
      '🏗️ Terrassement & fondations',
      '🧱 Gros œuvre — structure (RDC' + (nFloors > 0 ? ' + ' + nFloors + ' niv.' : '') + ')',
      '🏠 Toiture / Terrasse technique',
      '⚡ Électricité — distribution & 1er passage',
      '🔧 Plomberie & sanitaires — 1er passage',
      '🌡️ Climatisation & ventilation (gaines)',
      '🪟 Menuiserie extérieure & vitrerie',
      '🏗️ Enduits & façades',
      '🟦 Carrelage & faux-planchers',
      '🚪 Cloisons & menuiserie intérieure',
      '🎨 Peinture & finitions',
      '💡 Électricité — finitions & éclairage',
      '🚿 Plomberie — finitions',
      '✅ Nettoyage & réception',
    ];

  } else {
    // Villa / Maison individuelle — le plus courant au Maroc
    labels = [
      '📋 Permis de construire, plans architecte & études',
      '📐 Implantation, piquetage & topographie',
      '🏗️ Terrassement & fouilles',
      '⬛ Fondations — semelles filantes, longrines & hérisson',
      '🟫 Dalle bas RDC (plancher bas)',
      '🧱 Maçonnerie — RDC (coffrages, poteaux, chainages)',
    ];
    for (let f = 1; f <= nFloors; f++) {
      labels.push('⬛ Dalle R+' + f + ' (plancher intermédiaire)');
      labels.push('🧱 Maçonnerie — R+' + f + ' (poteaux, chainages, poutres)');
    }
    labels.push(...[
      '🏠 Dalle toiture & étanchéité (imperméabilisation)',
      '🧱 Maçonnerie intérieure & cloisons (doublage)',
      '⚡ Électricité — 1er passage (gaines, boîtes, tableau)',
      '🔧 Plomberie — 1er passage (alimentation & évacuations)',
      '🪟 Menuiserie extérieure (portes, fenêtres, volets roulants)',
      '🏗️ Enduits extérieurs & crépi façades',
      '🟦 Carrelage & revêtements sols & murs',
      '🚪 Menuiserie intérieure (portes, placards, dressings)',
      '🎨 Peinture intérieure',
      '💡 Électricité — finitions (prises, interrupteurs, luminaires)',
      '🚿 Plomberie — finitions (robinetterie, sanitaires, douches)',
      '🍳 Cuisine & aménagements intégrés',
      '🌿 Clôture, aménagements extérieurs & pavage',
      '✅ Nettoyage & réception du chantier',
    ]);
  }
  return labels.map((label, i) => ({ key: 'plan_ph_' + i, label, status: 'attente', startDate: '', endDate: '', notes: '', custom: false }));
}

function calcPlanningPct(phases) {
  if (!phases || !phases.length) return 0;
  const score = phases.reduce((s, ph) => {
    if (ph.status === 'finalise') return s + 1;
    if (ph.status === 'encours')  return s + 0.5;
    return s;
  }, 0);
  return Math.round((score / phases.length) * 100);
}

function mergePhasesWithDefaults(saved, defaults) {
  if (!saved || saved.length === 0) return defaults;
  // Build a map from French label → full saved phase object
  const phMap = {};
  saved.forEach(ph => { phMap[ph.key || ph.label] = ph; });
  // Merge default phases, preserving dates / notes from saved
  const merged = defaults.map(ph => {
    const s = phMap[ph.key || ph.label] || {};
    return { ...ph, status: s.status || 'attente', startDate: s.startDate || '', endDate: s.endDate || '', notes: s.notes || '', custom: false };
  });
  // Append custom phases from saved (not present in defaults)
  const defKeys = new Set(defaults.map(ph => ph.key || ph.label));
  saved.filter(ph => ph.custom && !defKeys.has(ph.key || ph.label)).forEach(ph => {
    merged.push({ label: ph.label, key: ph.key, status: ph.status || 'attente', startDate: ph.startDate || '', endDate: ph.endDate || '', notes: ph.notes || '', custom: true });
  });
  return merged;
}

// ── Phase label translation ─────────────────────────────────────────────────
function getPhaseLabel(ph) {
  const lang = window._currentLang || 'fr';
  // If phase has a translation key, try t() first
  if (ph.key) {
    const tr = window.t ? t(ph.key, ph.label) : ph.label;
    if (tr !== ph.key) return tr; // t() found a translation
  }
  // Fallback: label as-is (French with emoji)
  return ph.label;
}

// ── Duration helper ──────────────────────────────────────────────────────────
function calcDuration(s, e) {
  if (!s || !e) return '';
  const days = Math.round((new Date(e) - new Date(s)) / 86400000);
  if (days < 0) return '';
  if (days === 0) return '(1 j)';
  return '(' + (days + 1) + ' j)';
}

// ── Planning modal — redesigned with dates, custom tasks ─────────────────────

// Phase label translations (FR label → EN / AR)
const PHASE_TRANS = {
  en: {
    'Permis de construire, plans architecte & études':         'Building permit, architect plans & studies',
    'Implantation, piquetage & topographie':                   'Site layout, staking & topography',
    'Terrassement & fouilles':                                 'Earthworks & excavation',
    'Fondations — semelles filantes, longrines & hérisson':    'Foundations — footings & slab base',
    'Dalle bas RDC (plancher bas)':                           'Ground floor slab',
    'Maçonnerie — RDC (coffrages, poteaux, chainages)':       'Masonry — GF (formwork, columns, ring beams)',
    'Dalle toiture & étanchéité (imperméabilisation)':        'Roof slab & waterproofing',
    'Maçonnerie intérieure & cloisons (doublage)':            'Interior masonry & partition walls',
    'Électricité — 1er passage (gaines, boîtes, tableau)':    'Electrical — 1st pass (conduits, boxes, panel)',
    'Plomberie — 1er passage (alimentation & évacuations)':   'Plumbing — 1st pass (supply & drainage)',
    'Menuiserie extérieure (portes, fenêtres, volets roulants)':'Exterior carpentry (doors, windows, shutters)',
    'Enduits extérieurs & crépi façades':                     'Exterior rendering & facade plaster',
    'Carrelage & revêtements sols & murs':                    'Tiling & floor/wall coverings',
    'Menuiserie intérieure (portes, placards, dressings)':    'Interior carpentry (doors, closets)',
    'Peinture intérieure':                                    'Interior painting',
    'Électricité — finitions (prises, interrupteurs, luminaires)': 'Electrical — finishing (sockets, switches, lights)',
    'Plomberie — finitions (robinetterie, sanitaires, douches)':   'Plumbing — finishing (taps, sanitary, showers)',
    'Cuisine & aménagements intégrés':                        'Kitchen & built-in fittings',
    'Clôture, aménagements extérieurs & pavage':              'Perimeter wall, landscaping & paving',
    'Nettoyage & réception du chantier':                      'Final clean-up & site handover',
    'Autorisations & permis de construire':                   'Authorisations & building permit',
    'Diagnostic & audit de l\'existant':                      'Diagnosis & audit of existing structure',
    'Démolition & dépose des anciens revêtements':            'Demolition & removal of old finishes',
    'Renforcement & consolidation de structure':              'Structural reinforcement & consolidation',
    'Toiture & étanchéité':                                   'Roofing & waterproofing',
    'Nettoyage & réception':                                  'Clean-up & handover',
    'Permis de construire, études sol & sismique':            'Building permit, soil & seismic studies',
    'Implantation & terrassement':                            'Site layout & earthworks',
    'Fondations profondes (pieux & semelles)':                'Deep foundations (piles & footings)',
    'Gros œuvre — RDC (dalles, poteaux, voiles)':            'Main structure — GF (slabs, columns, walls)',
    'Dalle terrasse & étanchéité':                            'Roof terrace slab & waterproofing',
    'Cloisons & parties communes':                            'Partitions & common areas',
    'VRD & aménagements extérieurs':                         'Utilities & external works',
    'Réception, conformité & livraisons':                     'Handover, compliance & deliveries',
    'Terrassement & fondations':                              'Earthworks & foundations',
    'Climatisation & ventilation (gaines)':                   'Air conditioning & ventilation (ducts)',
  },
  ar: {
    'Permis de construire, plans architecte & études':         'رخصة البناء والمخططات والدراسات',
    'Implantation, piquetage & topographie':                   'التوطين والرسم الطوبوغرافي',
    'Terrassement & fouilles':                                 'الحفر والتسوية',
    'Fondations — semelles filantes, longrines & hérisson':    'الأساسات — القواعد والحشو',
    'Dalle bas RDC (plancher bas)':                           'بلاطة الطابق الأرضي',
    'Maçonnerie — RDC (coffrages, poteaux, chainages)':       'البناء — الطابق الأرضي (قوالب وأعمدة وأحزمة)',
    'Dalle toiture & étanchéité (imperméabilisation)':        'بلاطة السطح والعزل المائي',
    'Maçonnerie intérieure & cloisons (doublage)':            'البناء الداخلي والجدران الفاصلة',
    'Électricité — 1er passage (gaines, boîtes, tableau)':    'الكهرباء — المرور الأول (القنوات والصناديق)',
    'Plomberie — 1er passage (alimentation & évacuations)':   'السباكة — المرور الأول (التزويد والتصريف)',
    'Menuiserie extérieure (portes, fenêtres, volets roulants)':'النجارة الخارجية (أبواب ونوافذ ومصاريع)',
    'Enduits extérieurs & crépi façades':                     'اللياسة الخارجية وطلاء الواجهات',
    'Carrelage & revêtements sols & murs':                    'البلاط وتكسية الأرضيات والجدران',
    'Menuiserie intérieure (portes, placards, dressings)':    'النجارة الداخلية (أبواب وخزائن)',
    'Peinture intérieure':                                    'الطلاء الداخلي',
    'Électricité — finitions (prises, interrupteurs, luminaires)': 'الكهرباء — التشطيبات (مقابس ومفاتيح وإضاءة)',
    'Plomberie — finitions (robinetterie, sanitaires, douches)':   'السباكة — التشطيبات (الصنابير والصحية والدش)',
    'Cuisine & aménagements intégrés':                        'المطبخ والتجهيزات المدمجة',
    'Clôture, aménagements extérieurs & pavage':              'السياج والتهيئة الخارجية والرصف',
    'Nettoyage & réception du chantier':                      'التنظيف واستلام الورشة',
    'Autorisations & permis de construire':                   'التصاريح ورخصة البناء',
    'Diagnostic & audit de l\'existant':                      'تشخيص وتدقيق البنية القائمة',
    'Démolition & dépose des anciens revêtements':            'الهدم وإزالة التشطيبات القديمة',
    'Renforcement & consolidation de structure':              'تعزيز وتدعيم الهيكل',
    'Toiture & étanchéité':                                   'السقف والعزل المائي',
    'Nettoyage & réception':                                  'التنظيف والاستلام',
    'VRD & aménagements extérieurs':                         'الشبكات والتهيئة الخارجية',
    'Réception, conformité & livraisons':                     'الاستلام والمطابقة والتسليم',
    'Terrassement & fondations':                              'الحفر والأساسات',
    'Climatisation & ventilation (gaines)':                   'التكييف والتهوية',
  },
};

function translatePhLabel(label) {
  const lang = window._currentLang || 'fr';
  if (lang === 'fr') return label;
  // Strip emoji prefix (1-2 chars) + space
  const m = label.match(/^([\s\S]{1,3})\s+(.+)$/);
  if (!m) return label;
  const emoji = m[1], text = m[2];
  const tr = (PHASE_TRANS[lang] || {})[text];
  return tr ? emoji + ' ' + tr : label;
}

window.openPlanningPanel = function(pid) {
  const p = DB.projects.find(x => x.id === pid);
  if (!p) return;
  let saved = [];
  try { saved = p.phases ? JSON.parse(p.phases) : []; } catch(e) {}
  _planPid    = pid;
  _planPhases = mergePhasesWithDefaults(saved, getProjectPhases(p.type, p.etages || 0));
  _planUnsaved = false;
  const planBtn = document.querySelector('.sblink [id="sb-planning"]')?.closest('.sblink');
  // Switch panel without re-triggering renderPlanningPanel (we render directly)
  document.querySelectorAll('.dash-panel').forEach(x => x.classList.remove('on'));
  const panel = document.getElementById('panel-planning');
  if (panel) panel.classList.add('on');
  document.querySelectorAll('.sblink').forEach(b => b.classList.remove('on'));
  if (planBtn) planBtn.classList.add('on');
  // Update selector
  const sel = document.getElementById('plan-proj-select');
  if (sel) {
    if (DB.projects.length > 1) {
      sel.style.display = '';
      sel.innerHTML = DB.projects.map(pr =>
        '<option value="' + pr.id + '"' + (pr.id === _planPid ? ' selected' : '') + '>' + pr.nom + '</option>'
      ).join('');
    } else { sel.style.display = 'none'; }
  }
  renderPlanningBox(_planPid, p, _planPhases);
};

function renderPlanningPanel() {
  // Auto-select first project if none selected yet
  if (!_planPid && DB.projects.length > 0) {
    const p0 = DB.projects[0];
    let saved = [];
    try { saved = p0.phases ? JSON.parse(p0.phases) : []; } catch(e) {}
    _planPid    = p0.id;
    _planPhases = mergePhasesWithDefaults(saved, getProjectPhases(p0.type, p0.etages || 0));
  }
  // Populate project selector
  const sel = document.getElementById('plan-proj-select');
  if (sel) {
    if (DB.projects.length > 1) {
      sel.style.display = '';
      sel.innerHTML = DB.projects.map(p =>
        '<option value="' + p.id + '"' + (p.id === _planPid ? ' selected' : '') + '>' + p.nom + '</option>'
      ).join('');
    } else {
      sel.style.display = 'none';
    }
  }
  if (!_planPid) {
    const box = document.getElementById('plan-panel-box');
    if (box) box.innerHTML = '<div style="text-align:center;padding:3rem;color:var(--muted)"><div style="font-size:2.5rem;margin-bottom:1rem">🏗️</div><div style="font-size:14px;font-weight:600">Créez un projet pour accéder au planning</div></div>';
    return;
  }
  const p = DB.projects.find(x => x.id === _planPid);
  if (p) renderPlanningBox(_planPid, p, _planPhases);
}

window.switchPlanProject = function(pid) {
  if (!pid) return;
  window.openPlanningPanel(pid);
};

function renderPlanningBox(pid, p, phases) {
  const box = document.getElementById('plan-panel-box');
  if (!box) return;
  const pct  = calcPlanningPct(phases);
  const nFin = phases.filter(x => x.status === 'finalise').length;
  const nEnc = phases.filter(x => x.status === 'encours').length;
  const nBlq = phases.filter(x => x.status === 'bloque').length;
  const nAtt = phases.length - nFin - nEnc - nBlq;
  const dated = phases.filter(ph => ph.startDate && ph.endDate);
  const allDates = dated.flatMap(ph => [ph.startDate, ph.endDate]).sort();
  const dateMin  = allDates[0] || '';
  const dateMax  = allDates[allDates.length - 1] || '';

  const quickTpls = [
    ['🏗️','Fondations'], ['🧱','Gros œuvre'], ['⚡','Électricité'],
    ['🔧','Plomberie'], ['🎨','Finitions'], ['🪟','Menuiserie'],
  ];

  const leftCol =
    '<div style="background:var(--white);border:.5px solid var(--border);border-radius:14px;padding:1rem;margin-bottom:.8rem">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">'
    + '<span style="font-size:12px;font-weight:600;color:var(--ink)">📈 ' + t('proj_progress','Avancement') + '</span>'
    + '<span id="plan-pct-lbl" style="font-size:16px;font-weight:800;color:' + pctColor(pct) + '">' + pct + '%</span>'
    + '</div>'
    + '<div style="height:12px;background:var(--border);border-radius:6px;overflow:hidden">'
    + '<div id="plan-bar" style="height:100%;width:' + pct + '%;background:' + pctColor(pct) + ';border-radius:6px;transition:width .5s"></div>'
    + '</div>'
    + '<div style="display:flex;gap:.35rem;margin-top:.6rem;flex-wrap:wrap;align-items:center">'
    + planBadge(nFin + ' Finalisé', 'var(--green)', 'var(--green-b)')
    + planBadge(nEnc + ' En cours', 'var(--clay)', 'var(--clay-pp)')
    + (nBlq ? planBadge(nBlq + ' Bloqué', 'var(--red)', 'var(--red-b)') : '')
    + planBadge(nAtt + ' En attente', '#9CA3AF', '#F4F4F5')
    + (dateMin && dateMax ? '<span style="font-size:10px;color:var(--muted);margin-left:auto;font-style:italic">' + dateMin.replace(/-/g,'/') + ' → ' + dateMax.replace(/-/g,'/') + '</span>' : '')
    + '</div>'
    + '</div>'
    + '<div id="plan-phase-list">'
    + phases.map((ph, i) => phaseRowHTML(pid, i, ph, phases.length)).join('')
    + '</div>'
    + '<div style="margin-top:.8rem;background:var(--white);border:.5px solid var(--border);border-radius:12px;padding:.8rem 1rem">'
    + '<div style="font-size:10px;font-weight:700;color:var(--muted);margin-bottom:.5rem;text-transform:uppercase;letter-spacing:.06em">Ajout rapide</div>'
    + '<div style="display:flex;gap:.35rem;flex-wrap:wrap;margin-bottom:.6rem">'
    + quickTpls.map(tpl =>
        '<button onclick="addQuickPhase(\'' + pid + '\',\'' + tpl[0] + ' ' + tpl[1] + '\')" '
        + 'style="font-size:10px;padding:4px 10px;border:.5px solid var(--border);border-radius:100px;background:var(--clay-pp);color:var(--ink);cursor:pointer;font-family:Outfit,sans-serif">'
        + tpl[0] + ' ' + tpl[1] + '</button>'
      ).join('')
    + '</div>'
    + '<div style="display:flex;gap:.4rem;flex-wrap:wrap">'
    + '<input id="plan-new-label" type="text" placeholder="Nom de l\'étape personnalisée..." style="flex:1;min-width:160px;font-size:12px;padding:7px 10px;border:.5px solid var(--border);border-radius:8px;font-family:Outfit,sans-serif;background:var(--clay-pp)">'
    + '<input id="plan-new-start" type="date" title="Date de début" style="font-size:11px;padding:6px 8px;border:.5px solid var(--border);border-radius:8px;font-family:Outfit,sans-serif">'
    + '<input id="plan-new-end" type="date" title="Date de fin" style="font-size:11px;padding:6px 8px;border:.5px solid var(--border);border-radius:8px;font-family:Outfit,sans-serif">'
    + '<button onclick="addCustomPhase(\'' + pid + '\')" style="font-size:12px;font-weight:600;padding:6px 16px;background:var(--clay);color:white;border:none;border-radius:8px;cursor:pointer;font-family:Outfit,sans-serif">+ Ajouter</button>'
    + '</div>'
    + '</div>'
    + '<div style="margin-top:.6rem;font-size:10px;color:var(--muted);padding:.5rem .8rem;border-radius:8px;background:var(--clay-pp)">'
    + '✅ Finalisé = 100% | 🔄 En cours = 50% | ⏳ En attente / 🚫 Bloqué = 0%'
    + '</div>';

  const rightCol =
    '<div class="plan-right-sticky">'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.6rem;margin-bottom:.8rem">'
    + planMiniKpi('✅ Finalisées', nFin + '/' + phases.length, 'var(--green)')
    + planMiniKpi('🔄 En cours', nEnc, 'var(--clay)')
    + planMiniKpi('🚫 Bloquées', nBlq, nBlq > 0 ? 'var(--red)' : 'var(--muted)')
    + planMiniKpi('📅 Planifiées', dated.length, 'var(--blue)')
    + '</div>'
    + '<div id="plan-gantt-section">' + inlineGanttHTML(phases) + '</div>'
    + '</div>';

  box.innerHTML =
    `<div id="plan-save-bar" style="display:${_planUnsaved?'flex':'none'};align-items:center;gap:.8rem;background:var(--amber-b);border:1px solid var(--gold);border-radius:10px;padding:10px 14px;margin-bottom:12px">
      <span style="flex:1;font-size:13px;color:var(--amber);font-weight:600">⚠️ Modifications non sauvegardées</span>
      <button onclick="savePlanningPhases()" style="padding:6px 18px;background:var(--gold);color:var(--ink);border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">💾 Sauvegarder</button>
    </div>`
    + '<div style="margin-bottom:.8rem">'
    + '<div style="font-family:\'Playfair Display\',serif;font-size:1.2rem;font-weight:600;color:var(--ink)">' + p.nom + '</div>'
    + '<div style="font-size:11px;color:var(--muted);margin-top:.2rem">' + (p.type||'') + (p.etages ? ' — R+'+p.etages : ' — RDC') + ' • ' + (p.ville||'') + '</div>'
    + '</div>'
    + '<div class="plan-layout">'
    + '<div>' + leftCol + '</div>'
    + rightCol
    + '</div>';
}

function planMiniKpi(label, value, color) {
  return '<div style="background:var(--white);border:.5px solid var(--border);border-radius:10px;padding:.6rem .8rem">'
    + '<div style="font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-bottom:.3rem">' + label + '</div>'
    + '<div style="font-size:1.25rem;font-weight:800;color:' + color + ';font-family:\'Playfair Display\',serif;line-height:1">' + value + '</div>'
    + '</div>';
}

window.addQuickPhase = function(pid, label) {
  _planPhases.push({ label, key: null, status: 'attente', startDate: '', endDate: '', notes: '', custom: true });
  const p = DB.projects.find(x => x.id === pid);
  _planUnsaved = true;
  renderPlanningBox(pid, p, _planPhases);
  savePhases(pid, _planPhases, calcPlanningPct(_planPhases));
  toast('Étape ajoutée.', 'success');
};

window.addCustomPhase = function(pid) {
  const label = (document.getElementById('plan-new-label') || {}).value || '';
  const start = (document.getElementById('plan-new-start') || {}).value || '';
  const end   = (document.getElementById('plan-new-end')   || {}).value || '';
  if (!label.trim()) { toast('Entrez un nom pour l\'étape.', 'error'); return; }
  _planPhases.push({ label: label.trim(), key: null, status: 'attente', startDate: start, endDate: end, notes: '', custom: true });
  const p = DB.projects.find(x => x.id === pid);
  _planUnsaved = true;
  renderPlanningBox(pid, p, _planPhases);
  savePhases(pid, _planPhases, calcPlanningPct(_planPhases));
  toast('Étape ajoutée.', 'success');
};


function planBadge(txt, color, bg) {
  return '<span style="font-size:10px;background:' + bg + ';color:' + color + ';padding:3px 9px;border-radius:100px;font-weight:600">' + txt + '</span>';
}

function phaseRowHTML(pid, i, ph, total) {
  const s      = PHASE_STATUS[ph.status] || PHASE_STATUS.attente;
  const isDone = ph.status === 'finalise';
  const opts   = Object.entries(PHASE_STATUS).map(([val, st]) =>
    '<option value="' + val + '"' + (ph.status === val ? ' selected' : '') + '>' + st.icon + ' ' + st.label + '</option>'
  ).join('');
  const displayLabel = translatePhLabel(ph.label);
  const dur = calcDuration(ph.startDate, ph.endDate);
  const safeLabel = displayLabel.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const hasNotes = ph.notes && ph.notes.trim();
  const safeNotes = (ph.notes || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  return '<div id="ph-row-' + i + '" style="border-radius:10px;margin-bottom:.4rem;overflow:hidden;border:.5px solid ' + (isDone ? 'rgba(31,107,58,.25)' : 'var(--border)') + ';box-shadow:0 1px 3px rgba(0,0,0,.04)">'
    // ── Main body ────────────────────────────────────────────────────────────
    + '<div style="display:flex;align-items:stretch">'
    + '<div style="width:5px;background:' + s.color + ';flex-shrink:0;border-radius:0"></div>'
    + '<div style="flex:1;background:' + s.bg + ';padding:.6rem .75rem">'
    // Row 1: move arrows + icon + label + action buttons
    + '<div style="display:flex;align-items:center;gap:.45rem">'
    + '<div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;gap:0">'
    + '<button onclick="movePhase(' + JSON.stringify(pid) + ',' + i + ',-1)" ' + (i===0 ? 'disabled' : '') + ' title="Monter" style="background:none;border:none;cursor:' + (i===0?'default':'pointer') + ';font-size:9px;line-height:1;padding:1px 4px;color:' + (i===0?'rgba(0,0,0,.15)':'var(--muted)') + '">▲</button>'
    + '<button onclick="movePhase(' + JSON.stringify(pid) + ',' + i + ',1)" ' + (i===total-1 ? 'disabled' : '') + ' title="Descendre" style="background:none;border:none;cursor:' + (i===total-1?'default':'pointer') + ';font-size:9px;line-height:1;padding:1px 4px;color:' + (i===total-1?'rgba(0,0,0,.15)':'var(--muted)') + '">▼</button>'
    + '</div>'
    + '<span style="font-size:16px;flex-shrink:0">' + s.icon + '</span>'
    + '<input type="text" value="' + safeLabel + '" onchange="renamePhase(' + JSON.stringify(pid) + ',' + i + ',this.value)" class="ph-label-inp" style="text-decoration:' + (isDone ? 'line-through' : 'none') + ';color:' + (isDone ? 'var(--muted)' : 'var(--ink)') + ';font-weight:' + (isDone ? '400' : '600') + ';font-size:13px">'
    + '<button onclick="togglePhaseEdit(\'' + pid + '\',' + i + ')" title="Modifier / Notes" class="ph-edit-btn" id="ph-edit-btn-' + i + '">'
    + (hasNotes ? '📝' : '✏️')
    + '</button>'
    + '<button onclick="deletePhase(' + JSON.stringify(pid) + ',' + i + ')" title="Supprimer cette étape" class="ph-del-btn">✕</button>'
    + '</div>'
    // Row 2: status + dates
    + '<div style="display:flex;align-items:center;gap:.5rem;margin-top:.45rem;flex-wrap:wrap;padding-left:1.8rem">'
    + '<select onchange="setPhaseStatus(' + JSON.stringify(pid) + ',' + i + ',this.value)" style="font-size:11px;padding:3px 8px;border:.5px solid var(--border);border-radius:100px;background:white;cursor:pointer;font-family:Outfit,sans-serif;color:' + s.color + ';font-weight:600;flex-shrink:0">' + opts + '</select>'
    + '<span style="font-size:11px;color:var(--muted)">📅</span>'
    + '<input type="date" value="' + (ph.startDate || '') + '" onchange="setPhaseDates(' + JSON.stringify(pid) + ',' + i + ',\'start\',this.value)" title="Date de début" style="font-size:11px;border:.5px solid var(--border);border-radius:7px;padding:3px 7px;background:white;color:var(--ink);font-family:Outfit,sans-serif;cursor:pointer">'
    + '<span style="font-size:11px;color:var(--muted)">→</span>'
    + '<input type="date" value="' + (ph.endDate || '') + '" onchange="setPhaseDates(' + JSON.stringify(pid) + ',' + i + ',\'end\',this.value)" title="Date de fin" style="font-size:11px;border:.5px solid var(--border);border-radius:7px;padding:3px 7px;background:white;color:var(--ink);font-family:Outfit,sans-serif;cursor:pointer">'
    + (dur ? '<span style="font-size:11px;color:var(--muted);font-style:italic">' + dur + '</span>' : '')
    + '</div>'
    // Notes preview
    + '<div class="ph-notes-preview" style="margin-top:.35rem;padding-left:1.8rem;font-size:11px;color:var(--muted);font-style:italic;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;' + (hasNotes ? '' : 'display:none') + '">'
    + (hasNotes ? '📝 ' + (ph.notes.length > 70 ? ph.notes.slice(0,68) + '…' : ph.notes) : '')
    + '</div>'
    + '</div></div>'
    // ── Expandable notes section ─────────────────────────────────────────────
    + '<div id="ph-edit-' + i + '" style="display:none;background:var(--white);border-top:.5px solid var(--border);padding:.75rem 1rem .75rem 1.2rem">'
    + '<div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:.45rem">📝 Notes &amp; observations</div>'
    + '<textarea id="ph-notes-ta-' + i + '" oninput="updatePhaseNotes(' + JSON.stringify(pid) + ',' + i + ',this.value)" placeholder="Ajouter des notes, contacts, matériaux, observations..." style="width:100%;font-size:12px;font-family:Outfit,sans-serif;border:.5px solid var(--border);border-radius:9px;padding:.5rem .75rem;resize:vertical;min-height:64px;background:var(--clay-pp);color:var(--ink);box-sizing:border-box;outline:none;line-height:1.5">' + safeNotes + '</textarea>'
    + '</div>'
    + '</div>';
}

window.closePlanning = function() {
  const modal = document.getElementById('planning-modal');
  if (modal) modal.classList.remove('on');
};

window.setPhaseStatus = function(pid, idx, status) {
  const phases = _planPhases;
  if (!phases[idx]) return;
  phases[idx].status = status;
  // Re-render just the row
  const row = document.getElementById('ph-row-' + idx);
  if (row) {
    const tmp = document.createElement('div');
    tmp.innerHTML = phaseRowHTML(pid, idx, phases[idx], phases.length);
    row.replaceWith(tmp.firstChild);
  }
  // Update progress indicator
  const pct = calcPlanningPct(phases);
  const bar = document.getElementById('plan-bar');
  if (bar) { bar.style.width = pct + '%'; bar.style.background = pctColor(pct); }
  const lbl = document.getElementById('plan-pct-lbl');
  if (lbl) { lbl.textContent = pct + '%'; lbl.style.color = pctColor(pct); }
  updateGanttSection(phases);
  savePhases(pid, phases, pct);
};

window.setPhaseDates = function(pid, idx, which, val) {
  const phases = _planPhases;
  if (!phases[idx]) return;
  if (which === 'start') phases[idx].startDate = val;
  else                   phases[idx].endDate   = val;
  updateGanttSection(phases);
  savePhases(pid, phases, calcPlanningPct(phases));
};

window.renamePhase = function(pid, idx, newName) {
  if (!_planPhases[idx]) return;
  const trimmed = newName.trim();
  if (trimmed) _planPhases[idx].label = trimmed;
  savePhases(pid, _planPhases, calcPlanningPct(_planPhases));
};

window.renameCustomPhase = window.renamePhase;

window.deletePhase = function(pid, idx) {
  const ph = _planPhases[idx];
  if (!ph) return;
  const label = translatePhLabel(ph.label);
  if (!confirm('Supprimer "' + label + '" ?')) return;
  _planPhases.splice(idx, 1);
  const p = DB.projects.find(x => x.id === pid);
  _planUnsaved = true;
  renderPlanningBox(pid, p, _planPhases);
  savePhases(pid, _planPhases, calcPlanningPct(_planPhases));
  toast('Étape supprimée.', 'success');
};

window.deleteCustomPhase = window.deletePhase;

window.togglePhaseEdit = function(pid, idx) {
  const el = document.getElementById('ph-edit-' + idx);
  if (!el) return;
  const open = el.style.display !== 'none';
  el.style.display = open ? 'none' : 'block';
  const btn = document.getElementById('ph-edit-btn-' + idx);
  const hasNotes = _planPhases[idx] && _planPhases[idx].notes && _planPhases[idx].notes.trim();
  if (btn) btn.style.opacity = (!open || hasNotes) ? '1' : '';
  if (!open) {
    const ta = document.getElementById('ph-notes-ta-' + idx);
    if (ta) ta.focus();
  }
};

window.updatePhaseNotes = function(pid, idx, val) {
  if (!_planPhases[idx]) return;
  _planPhases[idx].notes = val;
  // Update notes preview inline without re-rendering the full row
  const hasNotes = val && val.trim();
  const btn = document.getElementById('ph-edit-btn-' + idx);
  if (btn) btn.textContent = hasNotes ? '📝' : '✏️';
  const row = document.getElementById('ph-row-' + idx);
  if (row) {
    const preview = row.querySelector('.ph-notes-preview');
    if (preview) {
      preview.textContent = hasNotes ? '📝 ' + (val.length > 70 ? val.slice(0,68) + '…' : val) : '';
      preview.style.display = hasNotes ? '' : 'none';
    }
  }
  savePhases(pid, _planPhases, calcPlanningPct(_planPhases));
};

window.movePhase = function(pid, idx, dir) {
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= _planPhases.length) return;
  [_planPhases[idx], _planPhases[newIdx]] = [_planPhases[newIdx], _planPhases[idx]];
  const p = DB.projects.find(x => x.id === pid);
  _planUnsaved = true;
  renderPlanningBox(pid, p, _planPhases);
  savePhases(pid, _planPhases, calcPlanningPct(_planPhases));
};

window.savePlanningPhases = async function() {
  if (!_planPid) return;
  const p = DB.projects.find(x => x.id === _planPid);
  if (!p) return;
  const btn = document.querySelector('#plan-save-bar button');
  if (btn) { btn.textContent = '⏳…'; btn.disabled = true; }
  try {
    await API.updatePhases(_planPid, _planPhases);
    p.phases = JSON.stringify(_planPhases);
    _planUnsaved = false;
    toast('Planning sauvegardé ✓', 'success');
    const bar = document.getElementById('plan-save-bar');
    if (bar) bar.style.display = 'none';
  } catch(e) {
    toast('Erreur sauvegarde planning', 'error');
  } finally {
    if (btn) { btn.textContent = '💾 Sauvegarder'; btn.disabled = false; }
  }
};

// ── Inline Gantt (always visible below the phase list) ──────────────────────

function updateGanttSection(phases) {
  const el = document.getElementById('plan-gantt-section');
  if (el) el.innerHTML = inlineGanttHTML(phases);
}

function parsePlanDate(s) {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function inlineGanttHTML(phases) {
  const dated = phases.filter(ph => ph.startDate && ph.endDate);

  const wrapper = (content) =>
    '<div style="margin-top:1.4rem;border-top:.5px solid var(--border);padding-top:1rem">'
    + '<div style="font-size:12px;font-weight:700;color:var(--ink);margin-bottom:.7rem;display:flex;align-items:center;gap:.35rem">'
    + '<span style="font-size:15px">📊</span> Diagramme de Gantt'
    + (dated.length ? '<span style="font-size:10px;color:var(--muted);font-weight:400;margin-left:.25rem">· ' + dated.length + ' étape' + (dated.length > 1 ? 's' : '') + ' planifiée' + (dated.length > 1 ? 's' : '') + '</span>' : '')
    + '</div>' + content + '</div>';

  if (dated.length === 0) {
    return wrapper(
      '<div style="padding:1.1rem 1rem;background:var(--clay-pp);border-radius:10px;text-align:center;border:.5px dashed var(--border)">'
      + '<div style="font-size:11px;color:var(--muted)">📅 Ajoutez des dates de début et de fin aux étapes pour visualiser le planning Gantt.</div>'
      + '</div>'
    );
  }

  // ── Date range ────────────────────────────────────────────────────────────
  const allStarts = dated.map(ph => parsePlanDate(ph.startDate));
  const allEnds   = dated.map(ph => parsePlanDate(ph.endDate));
  const minDate   = new Date(Math.min(...allStarts));
  const maxDate   = new Date(Math.max(...allEnds));
  const totalDays = Math.max(1, Math.ceil((maxDate - minDate) / 86400000) + 1);

  const LABEL_W = 134;
  const DAY_PX  = Math.max(2, Math.min(7, Math.floor(340 / totalDays)));
  const CHART_W = totalDays * DAY_PX;
  const ROW_H   = 32;

  // ── Today ─────────────────────────────────────────────────────────────────
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayOff = Math.ceil((today - minDate) / 86400000);
  const todayPx  = todayOff * DAY_PX;
  const showToday = todayOff >= 0 && todayOff <= totalDays;

  // ── Month markers ─────────────────────────────────────────────────────────
  const months = [];
  let cur = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  while (cur <= maxDate) {
    const px = Math.max(0, Math.ceil((cur - minDate) / 86400000)) * DAY_PX;
    months.push({ label: cur.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }), px });
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }

  const STATUS_OPA = { finalise: 0.92, encours: 0.86, attente: 0.28, bloque: 0.82 };

  let g = '<div style="overflow-x:auto;border-radius:10px;border:.5px solid var(--border)">';
  g += '<div style="min-width:' + (LABEL_W + CHART_W + 16) + 'px">';

  // ── Header row ─────────────────────────────────────────────────────────────
  g += '<div style="display:flex;background:#F5EDE6;border-bottom:.5px solid var(--border)">';
  g += '<div style="width:' + LABEL_W + 'px;flex-shrink:0;padding:.35rem .6rem;font-size:10px;font-weight:700;color:var(--muted);border-right:.5px solid var(--border)">Étape</div>';
  g += '<div style="flex:1;position:relative;height:' + ROW_H + 'px">';
  months.forEach(m => {
    g += '<div style="position:absolute;left:' + m.px + 'px;top:0;height:100%;border-left:.5px solid rgba(160,82,45,.18);padding:8px 3px;font-size:9px;color:var(--muted);white-space:nowrap">' + m.label + '</div>';
  });
  if (showToday) {
    g += '<div style="position:absolute;left:' + todayPx + 'px;top:0;height:100%;border-left:2px solid #EF4444;z-index:4">'
      + '<span style="position:absolute;top:2px;left:3px;font-size:8px;color:#EF4444;font-weight:700;white-space:nowrap;background:rgba(255,255,255,.9);padding:0 3px;border-radius:2px">Aujourd\'hui</span>'
      + '</div>';
  }
  g += '</div></div>';

  // ── Phase rows ─────────────────────────────────────────────────────────────
  phases.forEach((ph, i) => {
    const st       = PHASE_STATUS[ph.status] || PHASE_STATUS.attente;
    const rowBg    = i % 2 === 0 ? '#FFFFFF' : '#FAFAFA';
    const lbl      = translatePhLabel(ph.label);
    const hasDates = ph.startDate && ph.endDate;

    g += '<div style="display:flex;border-bottom:.5px solid var(--border);background:' + rowBg + '">';
    // Label cell
    g += '<div style="width:' + LABEL_W + 'px;flex-shrink:0;padding:.3rem .45rem;border-right:.5px solid var(--border);display:flex;align-items:center;gap:.28rem" title="' + lbl.replace(/"/g, '&quot;') + '">';
    g += '<span style="width:6px;height:6px;border-radius:50%;background:' + st.color + ';flex-shrink:0;display:inline-block"></span>';
    g += '<span style="font-size:10px;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + lbl + '</span>';
    g += '</div>';
    // Bar cell
    g += '<div style="flex:1;position:relative;height:' + ROW_H + 'px">';
    if (showToday) {
      g += '<div style="position:absolute;left:' + todayPx + 'px;top:0;height:100%;border-left:1.5px dashed rgba(239,68,68,.30);z-index:1;pointer-events:none"></div>';
    }
    if (hasDates) {
      const d0  = parsePlanDate(ph.startDate);
      const d1  = parsePlanDate(ph.endDate);
      const x0  = Math.ceil((d0 - minDate) / 86400000) * DAY_PX;
      const x1  = Math.ceil((d1 - minDate) / 86400000) * DAY_PX;
      const bw  = Math.max(x1 - x0, DAY_PX * 2);
      const dur = calcDuration(ph.startDate, ph.endDate);
      const sFmt = d0.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
      const eFmt = d1.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
      const opa  = STATUS_OPA[ph.status] || 0.4;
      // Bar
      g += '<div style="position:absolute;left:' + x0 + 'px;top:5px;width:' + bw + 'px;height:' + (ROW_H - 12) + 'px;background:' + st.color + ';border-radius:4px;opacity:' + opa + ';display:flex;align-items:center;justify-content:center;overflow:hidden;z-index:2" title="' + sFmt + ' → ' + eFmt + '  ' + dur + '">';
      if (bw >= 56) {
        g += '<span style="font-size:8px;color:white;white-space:nowrap;padding:0 5px;text-shadow:0 1px 2px rgba(0,0,0,.3)">' + sFmt + ' – ' + eFmt + '</span>';
      } else if (bw >= 28) {
        g += '<span style="font-size:8px;color:white;white-space:nowrap;padding:0 4px;text-shadow:0 1px 2px rgba(0,0,0,.3)">' + dur + '</span>';
      }
      g += '</div>';
      // Duration label below bar (always visible, doesn't depend on bar width)
      g += '<span style="position:absolute;left:' + x0 + 'px;bottom:1px;font-size:8px;color:var(--muted);white-space:nowrap;opacity:.8">' + dur + '</span>';
    } else {
      g += '<div style="display:flex;align-items:center;height:100%;padding-left:.5rem;font-size:9px;color:var(--muted);font-style:italic">sans date</div>';
    }
    g += '</div></div>';
  });

  g += '</div></div>'; // end scrollable

  // ── Legend ────────────────────────────────────────────────────────────────
  g += '<div style="display:flex;gap:.7rem;flex-wrap:wrap;margin-top:.55rem;align-items:center">';
  Object.entries(PHASE_STATUS).forEach(([, st]) => {
    g += '<span style="display:flex;align-items:center;gap:.25rem;font-size:10px;color:var(--muted)">'
      + '<span style="width:10px;height:6px;border-radius:2px;background:' + st.color + ';display:inline-block"></span>' + st.label + '</span>';
  });
  if (showToday) {
    g += '<span style="display:flex;align-items:center;gap:.25rem;font-size:10px;color:#EF4444;font-weight:600">'
      + '<span style="width:12px;height:0;border-top:2px solid #EF4444;display:inline-block"></span>Aujourd\'hui</span>';
  }
  g += '</div>';

  return wrapper(g);
}

function savePhases(pid, phases, pct) {
  clearTimeout(window._phasesSaveTimer);
  window._phasesSaveTimer = setTimeout(async () => {
    try {
      await API.updatePhases(pid, phases);
      await API.updatePct(pid, pct);
      const p = DB.projects.find(x => x.id === pid);
      if (p) { p.phases = JSON.stringify(phases); p.pct = pct; }
      renderProjets(); renderOverview();
    } catch(e) { toast(e.message, 'error'); }
  }, 600);
}

window.delProjet = async function(pid) {
  if (!confirm('Supprimer ce projet ? Cette action est irréversible.')) return;
  try {
    await API.deleteProject(pid);
    DB.projects = DB.projects.filter(p => p.id !== pid);
    renderProjets(); renderOverview();
    toast('Projet supprimé.', 'success');
  } catch (e) { toast(e.message, 'error'); }
};

// ── Expenses ──────────────────────────────────────────────────────────────────
// Active expenses = not deleted + linked to an active project (or no project)
function activeExpenses() {
  const activeProjIds = new Set(DB.projects.map(p => p.id));
  return DB.expenses.filter(d => {
    if (d.deleted) return false;
    if (d.project_id && !activeProjIds.has(d.project_id)) return false;
    return true;
  });
}

function renderDepenses(showAll) {
  // Populate project selector
  const projEl = document.getElementById('dep-project');
  if (projEl) {
    const cur = projEl.value;
    projEl.innerHTML = '<option value="">— Sans projet spécifique —</option>'
      + DB.projects.map(p => '<option value="' + p.id + '"' + (p.id === cur ? ' selected' : '') + '>' + p.nom + '</option>').join('');
  }

  const tbody = document.getElementById('dep-tbody');
  if (!tbody) return;
  const baseList = showAll
    ? DB.expenses  // full history including soft-deleted
    : activeExpenses();

  // Build cats from all non-deleted expenses (for the chart, unfiltered by category)
  let total = 0, semaine = 0;
  const cats = {};
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  baseList.forEach(d => {
    if (!d.deleted) {
      cats[d.categorie] = (cats[d.categorie] || 0) + d.montant;
    }
  });

  // Apply category filter for table display
  const displayList = _depCatFilter
    ? baseList.filter(d => d.categorie === _depCatFilter)
    : baseList;

  if (displayList.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:2rem">' + t('dep_empty','Aucune dépense enregistrée') + '</td></tr>';
  } else {
    tbody.innerHTML = displayList.map(d => {
      const isDeleted = d.deleted;
      if (!isDeleted) {
        total += d.montant;
        if (d.date >= weekAgo) semaine += d.montant;
      }
      const proj = d.project_id ? DB.projects.find(p => p.id === d.project_id) : null;
      const projLabel = proj ? '<span style="font-size:9px;background:var(--clay-p);color:var(--clay);padding:2px 6px;border-radius:100px">' + esc(proj.nom) + '</span>' : '';
      const rowStyle = isDeleted ? 'opacity:.45;background:var(--sand-l)' : '';
      return '<tr style="' + rowStyle + '">'
        + '<td>' + esc(d.description) + (isDeleted ? ' <span style="font-size:9px;color:var(--red)">(supprimé)</span>' : '') + '</td>'
        + '<td>' + projLabel + '</td>'
        + '<td>' + catBadge(d.categorie) + '</td>'
        + '<td style="font-weight:600">' + fmt(d.montant) + '</td>'
        + '<td>' + (d.date || '') + '</td>'
        + '<td>' + (!isDeleted ? '<button onclick="delDepense(\'' + d.id + '\')" style="font-size:11px;padding:3px 10px;background:var(--red-b);color:var(--red);border:none;border-radius:100px;cursor:pointer;font-family:Outfit,sans-serif">✕</button>' : '') + '</td>'
        + '</tr>';
    }).join('');
  }
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('total-dep', fmt(total));
  set('dep-sem', fmt(semaine));
  const dm = document.getElementById('dep-cat-main');
  if (dm) dm.textContent = Object.keys(cats).sort((a, b) => cats[b] - cats[a])[0] || '—';
  renderDepChart(cats);
}

window.clearDepFilter = function() { _depCatFilter = null; renderDepenses(); };

function renderDepChart(cats) {
  const canvas = document.getElementById('chart-dep-cat');
  const placeholder = document.getElementById('dep-chart-placeholder');
  const legendEl = document.getElementById('dep-chart-legend');
  if (!canvas) return;
  const catKeys = Object.keys(cats);
  if (!catKeys.length || typeof Chart === 'undefined') {
    if (placeholder) placeholder.style.display = 'block';
    canvas.style.display = 'none';
    if (legendEl) legendEl.innerHTML = '';
    return;
  }
  if (placeholder) placeholder.style.display = 'none';
  canvas.style.display = 'block';
  // Destroy existing chart
  if (_ovCharts['depCat']) { try { _ovCharts['depCat'].destroy(); } catch(e){} }
  const bgColors = catKeys.map(cat => {
    const hex = EXPENSE_CATEGORIES[cat]?.color || '#9CA3AF';
    return hex + 'CC'; // ~0.8 opacity in hex
  });
  const totalAll = catKeys.reduce((s, k) => s + cats[k], 0);
  _ovCharts['depCat'] = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: catKeys,
      datasets: [{ data: catKeys.map(k => cats[k]), backgroundColor: bgColors, borderWidth: 2, borderColor: 'var(--white,#fff)' }]
    },
    options: {
      cutout: '65%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(ctx) { return ctx.label + ' : ' + fmt(ctx.parsed); }
          }
        }
      },
      onClick: function(evt, elements) {
        if (!elements.length) return;
        const label = _ovCharts['depCat'].data.labels[elements[0].index];
        _depCatFilter = (_depCatFilter === label) ? null : label;
        renderDepenses();
      }
    },
    plugins: [{
      id: 'centerText',
      afterDraw(chart) {
        const { ctx, chartArea: { top, left, width, height } } = chart;
        ctx.save();
        const cx = left + width / 2, cy = top + height / 2;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = 'var(--ink,#0F1D36)';
        ctx.font = 'bold 12px Outfit,sans-serif';
        ctx.fillText(fmt(totalAll), cx, cy - 7);
        ctx.font = '10px Outfit,sans-serif';
        ctx.fillStyle = 'var(--muted,#6B7280)';
        ctx.fillText('dépenses', cx, cy + 9);
        ctx.restore();
      }
    }]
  });
  // Build legend
  if (legendEl) {
    legendEl.innerHTML = catKeys.map(cat => {
      const color = EXPENSE_CATEGORIES[cat]?.color || '#9CA3AF';
      const pct = totalAll ? Math.round(cats[cat] / totalAll * 100) : 0;
      const isActive = _depCatFilter === cat;
      return '<div onclick="window._depCatClickLegend(\'' + cat.replace(/'/g,"&#39;") + '\')" style="display:flex;align-items:center;gap:6px;padding:3px 6px;border-radius:6px;cursor:pointer;margin-bottom:2px;' + (isActive ? 'background:var(--sand);' : '') + '">'
        + '<div style="width:10px;height:10px;border-radius:2px;flex-shrink:0;background:' + color + '"></div>'
        + '<span style="flex:1;color:var(--ink);font-size:11px">' + cat + '</span>'
        + '<span style="color:var(--muted);font-size:10px">' + pct + '%</span>'
        + '</div>';
    }).join('');
  }
  // Update filter chip
  const chip = document.getElementById('dep-cat-filter-chip');
  if (chip) {
    if (_depCatFilter) {
      chip.textContent = 'Filtre : ' + _depCatFilter + ' ✕';
      chip.style.display = 'inline';
    } else {
      chip.style.display = 'none';
    }
  }
}

window._depCatClickLegend = function(cat) {
  _depCatFilter = (_depCatFilter === cat) ? null : cat;
  renderDepenses();
};

window.addDepense = async function() {
  const desc    = document.getElementById('dep-desc').value.trim();
  const montant = parseFloat(document.getElementById('dep-montant').value) || 0;
  const cat     = document.getElementById('dep-cat').value;
  const date    = document.getElementById('dep-date').value;
  const projEl  = document.getElementById('dep-project');
  const project_id = projEl && projEl.value ? projEl.value : null;
  if (!desc || !montant) { toast('Description et montant requis.', 'error'); return; }
  try {
    const d = await API.createExpense({ description: desc, montant, categorie: cat, date, project_id });
    DB.expenses.unshift(d);
    renderDepenses(); renderOverview();
    toggleForm('add-dep-form');
    document.getElementById('dep-desc').value    = '';
    document.getElementById('dep-montant').value = '';
    if (typeof window.AutoDraft !== 'undefined') AutoDraft.clear();
    if (typeof window.recordExpenseHistory === 'function') {
      recordExpenseHistory({ description: desc, montant, categorie: cat, date });
    }
    toast('Dépense enregistrée : ' + fmt(montant), 'success');
  } catch (e) { toast(e.message, 'error'); }
};

window.delDepense = async function(eid) {
  if (!confirm('Supprimer cette dépense ? Elle restera dans l\'historique.')) return;
  try {
    await API.deleteExpense(eid);
    const d = DB.expenses.find(x => x.id === eid);
    if (d) d.deleted = 1;
    renderDepenses(); renderOverview();
    toast('Dépense supprimée de vos rapports.', 'success');
  } catch (e) { toast(e.message, 'error'); }
};

window.toggleHistorique = function(btn) {
  const showAll = btn.dataset.show !== 'all';
  btn.dataset.show = showAll ? 'all' : '';
  btn.textContent  = showAll ? t('dep_hist_hide','Masquer l\'historique complet') : t('dep_hist_btn','📋 Voir historique complet');
  renderDepenses(showAll);
};

// ── Photos ────────────────────────────────────────────────────────────────────
function renderPhotos() {
  const grid = document.getElementById('photos-grid');
  if (!grid) return;
  if (DB.photos.length === 0) {
    grid.innerHTML = '<div style="text-align:center;padding:3rem;color:var(--muted);grid-column:1/-1;font-size:13px"><div style="font-size:2rem;margin-bottom:.8rem">📸</div>' + t('panel_photos_empty','Ajoutez des photos de votre chantier avec GPS') + '</div>';
    return;
  }
  grid.innerHTML = DB.photos.map(p => {
    const imgBlock = p.image_url
      ? '<img src="' + p.image_url + '" style="width:100%;aspect-ratio:4/3;object-fit:cover;display:block;cursor:pointer" loading="lazy" onclick="openPhotoFull(\'' + p.image_url + '\')"/>'
      : '<div style="background:var(--clay-p);aspect-ratio:4/3;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:2rem">' + p.emoji + '<div style="font-size:9px;color:var(--clay);margin-top:4px">Pas d\'image</div></div>';
    return '<div style="background:var(--white);border:.5px solid var(--border);border-radius:12px;overflow:hidden">'
      + imgBlock
      + '<div style="padding:.7rem">'
      + '<div style="font-size:12px;font-weight:600;margin-bottom:2px">' + esc(p.description) + '</div>'
      + '<div style="font-size:10px;color:var(--muted)">' + esc(p.phase) + ' — ' + esc(p.date || '') + '</div>'
      + (p.gps ? '<div style="font-size:9px;color:var(--clay);margin-top:2px">📍 <a href="https://www.openstreetmap.org/?mlat=' + encodeURIComponent(p.gps.split(',')[0]) + '&mlon=' + encodeURIComponent((p.gps.split(',')[1]||'').trim()) + '&zoom=17" target="_blank" style="color:var(--clay);text-decoration:underline">' + p.gps + '</a></div>' : '<div style="font-size:9px;color:var(--muted);margin-top:2px">📍 Position non disponible</div>')
      + '<button onclick="delPhoto(\'' + p.id + '\')" style="margin-top:.4rem;font-size:10px;padding:2px 9px;background:var(--red-b);color:var(--red);border:none;border-radius:100px;cursor:pointer;font-family:Outfit,sans-serif">' + t('delete_btn','Supprimer') + '</button>'
      + '</div></div>';
  }).join('');
}

window.previewPhoto = async function(input) {
  const file = input.files[0];
  if (!file) return;
  // show preview
  const wrap = document.getElementById('photo-preview-wrap');
  const img  = document.getElementById('photo-preview-img');
  const name = document.getElementById('photo-preview-name');
  img.src = URL.createObjectURL(file);
  name.textContent = file.name + ' (' + (file.size / 1024).toFixed(0) + ' Ko)';
  wrap.style.display = 'block';
  // auto-fill description if empty
  const descEl = document.getElementById('photo-desc');
  if (!descEl.value) descEl.value = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
  // Try to read GPS from EXIF
  const gpsStatus = document.getElementById('photo-gps-status');
  if (gpsStatus) {
    gpsStatus.style.display = '';
    gpsStatus.style.background = 'var(--sand)';
    gpsStatus.style.color = 'var(--muted)';
    gpsStatus.textContent = '📍 Lecture des données GPS de l\'image…';
    try {
      const exif = window.exifr ? await window.exifr.gps(file) : null;
      if (exif && exif.latitude && exif.longitude) {
        gpsStatus.style.background = 'var(--green-b)';
        gpsStatus.style.color = 'var(--green)';
        gpsStatus.textContent = '✅ GPS trouvé dans l\'image : ' + exif.latitude.toFixed(5) + ', ' + exif.longitude.toFixed(5);
        gpsStatus.dataset.exifGps = exif.latitude.toFixed(6) + ',' + exif.longitude.toFixed(6);
      } else {
        gpsStatus.style.background = '#FEF3C7';
        gpsStatus.style.color = '#92400E';
        gpsStatus.textContent = '⚠️ Aucune donnée GPS dans cette image — la position sera captée au moment de l\'envoi.';
        gpsStatus.dataset.exifGps = '';
      }
    } catch(e) {
      gpsStatus.style.background = '#FEF3C7';
      gpsStatus.style.color = '#92400E';
      gpsStatus.textContent = '⚠️ Impossible de lire l\'EXIF — la position sera captée au moment de l\'envoi.';
      gpsStatus.dataset.exifGps = '';
    }
  }
};

window.openPhotoFull = function(url) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:9999;display:flex;align-items:center;justify-content:center;cursor:zoom-out';
  overlay.innerHTML = '<img src="' + url + '" style="max-width:95vw;max-height:92vh;border-radius:10px;object-fit:contain"/>';
  overlay.onclick = () => overlay.remove();
  document.body.appendChild(overlay);
};

window.openCamera = async function() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    // Fallback: trigger native capture input
    document.getElementById('photo-file-cam').click();
    return;
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
  } catch(e) {
    if (e.name === 'NotAllowedError') {
      toast('Accès à la caméra refusé. Autorisez la caméra dans les paramètres du navigateur.', 'error');
    } else {
      document.getElementById('photo-file-cam').click();
    }
    return;
  }
  // Build overlay
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.96);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem';
  const video = document.createElement('video');
  video.style.cssText = 'width:min(100vw,640px);max-height:72vh;border-radius:12px;object-fit:cover';
  video.autoplay = true; video.playsInline = true;
  video.srcObject = stream;
  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:1rem';
  const btnCapture = document.createElement('button');
  btnCapture.textContent = '📸 Capturer';
  btnCapture.style.cssText = 'font-size:15px;font-weight:700;padding:12px 28px;background:var(--clay);color:white;border:none;border-radius:100px;cursor:pointer;font-family:Outfit,sans-serif';
  const btnCancel = document.createElement('button');
  btnCancel.textContent = 'Annuler';
  btnCancel.style.cssText = 'font-size:13px;padding:12px 22px;background:rgba(255,255,255,.15);color:white;border:none;border-radius:100px;cursor:pointer;font-family:Outfit,sans-serif';
  btnRow.append(btnCapture, btnCancel);
  ov.append(video, btnRow);
  document.body.appendChild(ov);

  const closeCamera = () => { stream.getTracks().forEach(t => t.stop()); ov.remove(); };
  btnCancel.onclick = closeCamera;
  btnCapture.onclick = () => {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob(blob => {
      closeCamera();
      if (!blob) return;
      const file = new File([blob], 'camera_' + Date.now() + '.jpg', { type: 'image/jpeg' });
      const dt = new DataTransfer();
      dt.items.add(file);
      const input = document.getElementById('photo-file-cam');
      input.files = dt.files;
      window.previewPhoto(input);
    }, 'image/jpeg', 0.90);
  };
};

window.captureGPS = async function() {
  const btn = document.getElementById('photo-gps-btn');
  const gpsStatus = document.getElementById('photo-gps-status');
  if (!navigator.geolocation) {
    if (gpsStatus) {
      gpsStatus.style.display = '';
      gpsStatus.style.background = '#FEF3C7';
      gpsStatus.style.color = '#92400E';
      gpsStatus.textContent = '⚠️ Géolocalisation non supportée par ce navigateur.';
    }
    return;
  }
  if (btn) { btn.disabled = true; btn.textContent = '🔄 Localisation en cours…'; }
  if (gpsStatus) {
    gpsStatus.style.display = '';
    gpsStatus.style.background = '#EFF6FF';
    gpsStatus.style.color = '#1D4ED8';
    gpsStatus.textContent = '🔄 Demande d\'accès à la position…';
    gpsStatus.dataset.exifGps = '';
  }
  try {
    const pos = await new Promise((res, rej) =>
      navigator.geolocation.getCurrentPosition(res, rej, { timeout: 15000, enableHighAccuracy: true, maximumAge: 0 })
    );
    const gps = pos.coords.latitude.toFixed(6) + ',' + pos.coords.longitude.toFixed(6);
    if (gpsStatus) {
      gpsStatus.dataset.exifGps = gps;
      gpsStatus.style.background = 'var(--green-b, #DCFCE7)';
      gpsStatus.style.color = 'var(--green, #166534)';
      gpsStatus.textContent = '✅ Position : ' + gps;
    }
  } catch(e) {
    let msg = '⚠️ Position non disponible.';
    if (e.code === 1) msg = '🚫 Accès à la position refusé. Autorisez la localisation dans les paramètres du navigateur.';
    else if (e.code === 3) msg = '⏱️ Délai dépassé — réessayez en extérieur.';
    if (gpsStatus) {
      gpsStatus.dataset.exifGps = '';
      gpsStatus.style.background = '#FEF3C7';
      gpsStatus.style.color = '#92400E';
      gpsStatus.textContent = msg;
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📍 Recapturer la position'; }
  }
};

window.addPhoto = async function() {
  const desc  = document.getElementById('photo-desc').value.trim();
  const date  = document.getElementById('photo-date').value;
  const phaseEl = document.getElementById('photo-phase');
  const phaseCustomEl = document.getElementById('photo-phase-custom');
  const phase = (phaseEl && phaseEl.value === '__autre__')
    ? (phaseCustomEl && phaseCustomEl.value.trim() ? phaseCustomEl.value.trim() : 'Autre')
    : (phaseEl ? phaseEl.value : 'Fondations');
  const emoji = document.getElementById('photo-emoji').value;
  if (!desc) { toast('Décrivez la photo.', 'error'); return; }

  // Prevent double-click
  const saveBtn = document.querySelector('#add-photo-form .submit-btn');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '⏳ Envoi en cours…'; }

  const fileCam  = document.getElementById('photo-file-cam').files[0];
  const filePick = document.getElementById('photo-file-pick').files[0];
  const imageFile = fileCam || filePick || null;

  const gpsStatus = document.getElementById('photo-gps-status');
  const gps = (gpsStatus && gpsStatus.dataset.exifGps) || '';

  try {
    const fd = new FormData();
    fd.append('description', desc);
    fd.append('date', date);
    fd.append('phase', phase);
    fd.append('emoji', emoji);
    fd.append('gps', gps);
    if (imageFile) fd.append('image', imageFile);
    const ph = await API.uploadPhoto(fd);
    DB.photos.unshift(ph);
    // Hide form first, then render photos
    const formEl = document.getElementById('add-photo-form');
    if (formEl) formEl.style.display = 'none';
    document.getElementById('photo-desc').value = '';
    document.getElementById('photo-file-cam').value  = '';
    document.getElementById('photo-file-pick').value = '';
    document.getElementById('photo-preview-wrap').style.display = 'none';
    if (gpsStatus) { gpsStatus.style.display = 'none'; gpsStatus.dataset.exifGps = ''; }
    renderPhotos();
    toast('Photo archivée' + (gps ? ' avec GPS !' : '.'), 'success');
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Archiver avec GPS'; }
  }
};

window.delPhoto = async function(phid) {
  if (!confirm('Supprimer cette photo ?')) return;
  try {
    await API.deletePhoto(phid);
    DB.photos = DB.photos.filter(p => p.id !== phid);
    renderPhotos();
    toast('Photo supprimée.', 'success');
  } catch (e) { toast(e.message, 'error'); }
};

function renderRapports() {
  const kpiRow = document.getElementById('rap-kpi-row');
  const rapList = document.getElementById('rapports-list');
  const actFeed = document.getElementById('rap-activity-feed');
  if (!kpiRow) return;

  const totalBudget = DB.projects.reduce((s, p) => s + (p.budget || 0), 0);
  const totalDep    = DB.expenses.reduce((s, e) => s + (e.montant || 0), 0);
  const avgPct      = DB.projects.length ? Math.round(DB.projects.reduce((s, p) => s + (p.pct || 0), 0) / DB.projects.length) : 0;
  const nDone       = DB.projects.filter(p => (p.pct || 0) >= 100).length;
  const nEnc        = DB.projects.filter(p => (p.pct || 0) > 0 && (p.pct || 0) < 100).length;
  const nAtt        = DB.projects.filter(p => !(p.pct || 0)).length;
  const restant     = totalBudget - totalDep;
  const overBudget  = totalDep > totalBudget && totalBudget > 0;

  // KPI cards
  kpiRow.innerHTML =
    rapKpi('🏗️ Projets', DB.projects.length + ' projets', nDone + ' terminés', 'var(--ink)')
    + rapKpi('💰 Budget total', fmt(totalBudget), 'Tous projets', 'var(--clay)')
    + rapKpi('💸 Dépenses', fmt(totalDep), overBudget ? '⚠️ Dépassement' : fmt(restant) + ' restant', overBudget ? 'var(--red)' : 'var(--green)')
    + rapKpi('📈 Avancement', avgPct + '%', nEnc + ' en cours · ' + nAtt + ' en attente', avgPct >= 80 ? 'var(--green)' : 'var(--clay)');

  // Per-project cards
  if (rapList) {
    if (DB.projects.length === 0) {
      rapList.innerHTML = '<div style="text-align:center;padding:2.5rem;color:var(--muted);font-size:13px;grid-column:1/-1">Créez un projet pour voir ses rapports.</div>';
    } else {
      rapList.innerHTML = DB.projects.map(p => {
        const depProj  = DB.expenses.filter(e => e.project_id === p.id).reduce((s, e) => s + (e.montant || 0), 0);
        const depTotal2 = DB.expenses.reduce((s, e) => s + (e.montant || 0), 0);
        const dep      = p.id ? depProj : depTotal2;
        const pct      = p.pct || 0;
        const photos   = DB.photos.filter(ph => ph.project_id === p.id).length;
        const over     = dep > (p.budget || 0) && (p.budget || 0) > 0;
        const week     = getWeek(new Date());
        return '<div class="rap-proj-card">'
          + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:.5rem;margin-bottom:.4rem">'
          + '<div>'
          + '<div class="rap-proj-card-name">' + p.nom + '</div>'
          + '<div class="rap-proj-card-meta">' + (p.type||'Projet') + ' · ' + (p.ville||'') + ' · Rapport S' + week + '</div>'
          + '</div>'
          + '<button data-pdf-pid="' + p.id + '" style="font-size:10px;font-weight:600;padding:5px 12px;background:var(--clay);color:white;border:none;border-radius:100px;cursor:pointer;font-family:Outfit,sans-serif;white-space:nowrap;flex-shrink:0">&#11015; PDF</button>'
          + '</div>'
          + '<div class="rap-mini-bar-wrap"><div class="rap-mini-bar" style="width:' + pct + '%;background:' + pctColor(pct) + '"></div></div>'
          + '<div style="display:flex;justify-content:space-between;font-size:10px;color:var(--muted);margin-bottom:.7rem"><span>' + pct + '% avancement</span><span>' + (p.budget ? fmt(p.budget) + ' budget' : 'Budget non défini') + '</span></div>'
          + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:.5rem">'
          + rapProjStat('💸 Dépenses', fmt(dep), over ? 'var(--red)' : 'var(--muted)')
          + rapProjStat('💰 Restant', p.budget ? fmt((p.budget||0) - dep) : '—', over ? 'var(--red)' : 'var(--green)')
          + rapProjStat('📸 Photos', photos + ' photos', 'var(--muted)')
          + rapProjStat('📋 Statut', pct >= 100 ? '✅ Terminé' : pct > 0 ? '🔄 En cours' : '⏳ En attente', pct >= 100 ? 'var(--green)' : pct > 0 ? 'var(--clay)' : 'var(--muted)')
          + '</div>'
          + '</div>';
      }).join('');
    }
  }

  // Activity feed in global view
  if (actFeed) {
    const recentActs = (DB.activities || []).slice(0, 5);
    if (recentActs.length) {
      actFeed.innerHTML = '<div class="rap-chart-box">'
        + '<div class="rap-chart-title">Activité récente</div>'
        + recentActs.map(a => '<div style="display:flex;gap:.6rem;align-items:flex-start;padding:.5rem 0;border-bottom:.5px solid var(--border)">'
          + '<span style="font-size:16px">' + (a.emoji || '📌') + '</span>'
          + '<div><div style="font-size:12px;color:var(--ink);font-weight:500">' + (a.description || a.action || '') + '</div>'
          + '<div style="font-size:10px;color:var(--muted)">' + (a.created_at ? new Date(a.created_at).toLocaleDateString('fr-FR') : '') + '</div></div>'
          + '</div>').join('')
        + '</div>';
    } else {
      actFeed.innerHTML = '';
    }
  }

  // Destroy old charts
  ['rapStatus','rapBudget','rapProgress'].forEach(k => {
    if (_ovCharts[k]) { _ovCharts[k].destroy(); delete _ovCharts[k]; }
  });

  if (typeof Chart === 'undefined') return;

  // Chart 1: doughnut status
  const ctxS = document.getElementById('rap-chart-status');
  if (ctxS) {
    _ovCharts.rapStatus = new Chart(ctxS, {
      type: 'doughnut',
      data: {
        labels: ['Terminés', 'En cours', 'En attente'],
        datasets: [{ data: [nDone, nEnc, nAtt], backgroundColor: ['#1F6B3A','#1D5FA6','#9CA3AF'], borderWidth: 2, borderColor: '#fff' }]
      },
      options: { cutout: '68%', plugins: { legend: { position: 'bottom', labels: { font: { family: 'Outfit', size: 11 }, padding: 12 } } }, responsive: true, maintainAspectRatio: false }
    });
  }

  // Chart 2: budget vs depenses bar
  const ctxB = document.getElementById('rap-chart-budget');
  if (ctxB && DB.projects.length) {
    const labels = DB.projects.map(p => p.nom.length > 12 ? p.nom.substring(0,12) + '…' : p.nom);
    const budgets = DB.projects.map(p => p.budget || 0);
    const depenses = DB.projects.map(p => DB.expenses.filter(e => e.project_id === p.id).reduce((s, e) => s + (e.montant || 0), 0));
    _ovCharts.rapBudget = new Chart(ctxB, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Budget', data: budgets, backgroundColor: 'rgba(29,95,166,.25)', borderColor: '#1D5FA6', borderWidth: 1.5, borderRadius: 4 },
          { label: 'Dépenses', data: depenses, backgroundColor: 'rgba(139,31,31,.25)', borderColor: '#8B1F1F', borderWidth: 1.5, borderRadius: 4 }
        ]
      },
      options: { plugins: { legend: { labels: { font: { family: 'Outfit', size: 11 } } } }, scales: { y: { ticks: { callback: v => (v/1000)+'k', font: { size: 10 } } } }, responsive: true, maintainAspectRatio: false }
    });
  }

  // Chart 3: progress bar chart
  const ctxP = document.getElementById('rap-chart-progress');
  if (ctxP && DB.projects.length) {
    const labels = DB.projects.map(p => p.nom.length > 14 ? p.nom.substring(0,14) + '…' : p.nom);
    const pcts   = DB.projects.map(p => p.pct || 0);
    const colors = pcts.map(v => v >= 100 ? 'rgba(31,107,58,.7)' : v >= 50 ? 'rgba(29,95,166,.7)' : 'rgba(156,163,175,.5)');
    _ovCharts.rapProgress = new Chart(ctxP, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Avancement (%)', data: pcts, backgroundColor: colors, borderRadius: 4 }] },
      options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { max: 100, ticks: { callback: v => v + '%', font: { size: 10 } } } }, responsive: true, maintainAspectRatio: false }
    });
  }
}

function rapKpi(label, value, note, color) {
  return '<div class="rap-kpi-card">'
    + '<div class="rap-kpi-lbl">' + label + '</div>'
    + '<div class="rap-kpi-val" style="color:' + color + '">' + value + '</div>'
    + '<div class="rap-kpi-sub">' + note + '</div>'
    + '</div>';
}

function rapProjStat(label, value, color) {
  return '<div style="background:var(--clay-pp);border-radius:8px;padding:.45rem .6rem">'
    + '<div style="font-size:9px;color:var(--muted);font-weight:700;letter-spacing:.05em;text-transform:uppercase;margin-bottom:.2rem">' + label + '</div>'
    + '<div style="font-size:12px;font-weight:600;color:' + color + '">' + value + '</div>'
    + '</div>';
}

window.switchRapTab = function(tab) {
  const globalView  = document.getElementById('rap-global-view');
  const projetsView = document.getElementById('rap-projets-view');
  const btnGlobal   = document.getElementById('rap-tab-global');
  const btnProjets  = document.getElementById('rap-tab-projets');
  if (!globalView || !projetsView) return;
  globalView.style.display  = tab === 'global'  ? 'block' : 'none';
  projetsView.style.display = tab === 'projets' ? 'block' : 'none';
  if (btnGlobal)  { btnGlobal.classList.toggle('on',  tab === 'global'); }
  if (btnProjets) { btnProjets.classList.toggle('on', tab === 'projets'); }
};

window.generatePDFForProject = async function(pid) {
  // Normalize id type — button may pass string or number
  const p = DB.projects.find(x => String(x.id) === String(pid));
  if (!p) { toast('Projet introuvable', 'error'); return; }
  if (!window.jspdf) { toast('Librairie PDF non chargee — rechargez la page', 'error'); return; }
  toast('Ouverture du rapport PDF...', 'success');
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
    const W = 210; const H = 297; const M = 14;
    let y = 0;

    // Palette officielle ShantiLink: navy #0F1D36 + gold #E8B84B
    const NAVY  = [15, 29, 54];
    const NAVYL = [26, 48, 85];
    const GOLD  = [232, 184, 75];
    const GOLDL = [245, 208, 128];
    const GOLDB = [253, 248, 232];
    const BLUE  = [29, 95, 166];
    const BLUEB = [232, 240, 251];
    const GREEN = [31, 107, 58];
    const GREENB= [232, 245, 238];
    const RED   = [139, 31, 31];
    const REDB  = [253, 234, 234];
    const MUTED = [100, 116, 139];

    // ── HEADER BAND ───────────────────────────────────────────────────────
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, W, 46, 'F');
    // Gold accent stripe at bottom of header
    doc.setFillColor(...GOLD);
    doc.rect(0, 43, W, 3, 'F');
    // Gold left accent bar
    doc.setFillColor(...GOLD);
    doc.rect(0, 0, 4, 43, 'F');
    // ShantiLink logo text
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22); doc.setFont('helvetica', 'bold');
    doc.text('Shanti', 10, 20);
    doc.setTextColor(...GOLD);
    doc.text('Link', 10 + doc.getTextWidth('Shanti'), 20);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GOLDL);
    doc.text('Plateforme BTP Maroc  |  www.shantilink.ma', 10, 29);
    // Badge top-right (gold on white)
    doc.setFillColor(...GOLDB);
    doc.roundedRect(W - 62, 8, 50, 16, 2, 2, 'F');
    doc.setDrawColor(...GOLD);
    doc.setLineWidth(0.5);
    doc.roundedRect(W - 62, 8, 50, 16, 2, 2, 'S');
    doc.setTextColor(...NAVY);
    doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.text('RAPPORT PROJET', W - 37, 15, { align: 'center' });
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(...MUTED);
    doc.text(new Date().toLocaleDateString('fr-FR'), W - 37, 21, { align: 'center' });

    // ── PROJECT TITLE BAND ─────────────────────────────────────────────────
    y = 52;
    doc.setFillColor(...GOLDB);
    doc.rect(0, y, W, 28, 'F');
    doc.setFillColor(...GOLD);
    doc.rect(0, y, 4, 28, 'F');
    doc.setTextColor(...NAVY);
    doc.setFontSize(17); doc.setFont('helvetica', 'bold');
    doc.text(p.nom, M + 4, y + 14);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(...MUTED);
    const metaParts = [p.type || 'Projet', p.ville ? p.ville : '', p.etages ? 'R+' + p.etages : 'RDC'].filter(Boolean);
    doc.text(metaParts.join('   |   '), M + 4, y + 22);
    y += 36;

    // ── KPI BOXES ─────────────────────────────────────────────────────────
    const projExpenses = DB.expenses.filter(e => e.project_id === pid && !e.deleted);
    const totalDep = projExpenses.reduce((s, e) => s + (e.montant || 0), 0);
    const budget   = p.budget || 0;
    const restant  = budget - totalDep;
    const pct      = p.pct || 0;
    const overBudget = budget > 0 && totalDep > budget;
    const kpis = [
      { l: 'Avancement', v: pct + '%',
        c: pct >= 80 ? GREEN : pct >= 40 ? BLUE : MUTED,
        bg: pct >= 80 ? GREENB : pct >= 40 ? BLUEB : [248,250,252] },
      { l: 'Budget',     v: budget > 0 ? pdfNum(budget) + ' DH' : 'N/D', c: NAVY,  bg: GOLDB },
      { l: 'Depenses',   v: pdfNum(totalDep) + ' DH', c: overBudget ? RED : BLUE, bg: overBudget ? REDB : BLUEB },
      { l: 'Restant',    v: budget > 0 ? pdfNum(Math.abs(restant)) + ' DH' : 'N/D', c: overBudget ? RED : GREEN, bg: overBudget ? REDB : GREENB },
    ];
    const kW = (W - 2*M - 9) / 4;
    kpis.forEach((k, i) => {
      const bx = M + i * (kW + 3);
      doc.setFillColor(...k.bg);
      doc.roundedRect(bx, y, kW, 24, 2, 2, 'F');
      // Gold top accent
      doc.setFillColor(...GOLD);
      doc.roundedRect(bx, y, kW, 2.5, 1, 1, 'F');
      doc.setTextColor(...k.c);
      doc.setFontSize(k.v.length > 11 ? 9 : 12); doc.setFont('helvetica', 'bold');
      doc.text(k.v, bx + kW/2, y + 14, { align: 'center' });
      doc.setTextColor(...MUTED); doc.setFontSize(7); doc.setFont('helvetica', 'normal');
      doc.text(k.l, bx + kW/2, y + 20.5, { align: 'center' });
    });
    y += 32;

    // ── PROGRESS BAR ──────────────────────────────────────────────────────
    doc.setFillColor(226, 232, 240);
    doc.roundedRect(M, y, W - 2*M, 7, 2, 2, 'F');
    const barW = Math.min(pct / 100, 1) * (W - 2*M);
    if (barW > 0) {
      doc.setFillColor(...(pct >= 80 ? GREEN : pct >= 40 ? GOLD : BLUE));
      doc.roundedRect(M, y, barW, 7, 2, 2, 'F');
    }
    doc.setTextColor(255,255,255); doc.setFontSize(7); doc.setFont('helvetica', 'bold');
    if (pct > 10) doc.text(pct + '%', M + barW - 3, y + 5, { align: 'right' });
    doc.setTextColor(...MUTED); doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
    doc.text('Avancement global du projet', M, y + 12);
    y += 18;

    // ── DESCRIPTION ───────────────────────────────────────────────────────
    if (p.description && p.description.trim()) {
      doc.setFillColor(...GOLDB);
      doc.roundedRect(M, y, W - 2*M, 10, 2, 2, 'F');
      doc.setFillColor(...GOLD); doc.rect(M, y, 3, 10, 'F');
      doc.setTextColor(...NAVY); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
      doc.text('Description :', M + 7, y + 5);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(...MUTED);
      const desc = p.description.length > 110 ? p.description.substring(0, 107) + '...' : p.description;
      doc.text(desc, M + 35, y + 5);
      y += 16;
    }

    // ── PHASES TABLE ──────────────────────────────────────────────────────
    let phases = [];
    try { phases = p.phases ? JSON.parse(p.phases) : []; } catch(e) {}
    if (phases.length) {
      if (y > H - 80) { doc.addPage(); y = M; }
      doc.setFillColor(...NAVY);
      doc.roundedRect(M, y, W - 2*M, 9, 2, 2, 'F');
      doc.setFillColor(...GOLD); doc.rect(M, y, 3, 9, 'F');
      doc.setTextColor(...GOLD); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
      doc.text('PLANNING DES PHASES', M + 7, y + 6.2);
      y += 12;
      const phaseStatusText = { finalise: 'Finalise', encours: 'En cours', bloque: 'Bloque', attente: 'En attente' };
      doc.autoTable({
        startY: y,
        head: [['Phase', 'Statut', 'Debut', 'Fin']],
        body: phases.map(ph => [
          ph.label || '--',
          phaseStatusText[ph.status] || 'En attente',
          ph.startDate || '--',
          ph.endDate || '--'
        ]),
        theme: 'grid',
        headStyles: { fillColor: NAVYL, textColor: [232,184,75], fontStyle: 'bold', fontSize: 8, cellPadding: 4 },
        bodyStyles: { fontSize: 8, cellPadding: 3.5 },
        alternateRowStyles: { fillColor: GOLDB },
        columnStyles: {
          0: { cellWidth: 80 },
          1: { cellWidth: 35, fontStyle: 'bold' },
          2: { cellWidth: 35, halign: 'center' },
          3: { cellWidth: 32, halign: 'center' },
        },
        didParseCell: function(data) {
          if (data.column.index === 1 && data.section === 'body') {
            const val = data.cell.raw;
            data.cell.styles.textColor = val === 'Finalise' ? GREEN : val === 'En cours' ? BLUE : val === 'Bloque' ? RED : MUTED;
          }
        },
        margin: { left: M, right: M },
      });
      y = doc.lastAutoTable.finalY + 10;
    }

    // ── EXPENSES TABLE ────────────────────────────────────────────────────
    if (y > H - 80) { doc.addPage(); y = M; }
    doc.setFillColor(...NAVY);
    doc.roundedRect(M, y, W - 2*M, 9, 2, 2, 'F');
    doc.setFillColor(...GOLD); doc.rect(M, y, 3, 9, 'F');
    doc.setTextColor(...GOLD); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('DETAIL DES DEPENSES', M + 7, y + 6.2);
    y += 12;
    if (projExpenses.length === 0) {
      doc.setFillColor(...GOLDB);
      doc.roundedRect(M, y, W - 2*M, 12, 2, 2, 'F');
      doc.setFontSize(8.5); doc.setFont('helvetica', 'italic'); doc.setTextColor(...MUTED);
      doc.text('Aucune depense enregistree pour ce projet.', W/2, y + 7.5, { align: 'center' });
      y += 18;
    } else {
      const byCat = {};
      projExpenses.forEach(e => { const cat = e.categorie || 'Autre'; byCat[cat] = (byCat[cat]||0)+(e.montant||0); });
      doc.autoTable({
        startY: y,
        head: [['Date', 'Categorie', 'Description', 'Montant (DH)']],
        body: projExpenses.map(e => [
          e.date || '--', e.categorie || 'Autre', e.description || '--',
          { content: pdfNum(e.montant||0), styles: { halign:'right', fontStyle:'bold', textColor: NAVY } }
        ]),
        foot: [[
          { content: 'TOTAL', colSpan: 3, styles: { fontStyle:'bold', halign:'right', fillColor: NAVY, textColor: [232,184,75] } },
          { content: pdfNum(totalDep)+' DH', styles: { fontStyle:'bold', halign:'right', fillColor: GOLD, textColor: NAVY } }
        ]],
        theme: 'grid',
        headStyles: { fillColor: NAVYL, textColor: [232,184,75], fontStyle:'bold', fontSize:8, cellPadding:4 },
        bodyStyles: { fontSize:8, cellPadding:3.5 },
        footStyles: { fontSize:9, cellPadding:4 },
        alternateRowStyles: { fillColor: GOLDB },
        columnStyles: {
          0: { cellWidth:26, halign:'center' },
          1: { cellWidth:36 },
          2: { cellWidth:100 },
          3: { cellWidth:24, halign:'right' },
        },
        margin: { left: M, right: M },
      });
      y = doc.lastAutoTable.finalY + 10;

      if (Object.keys(byCat).length > 1 && y < H - 50) {
        doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...NAVY);
        doc.text('Repartition par categorie :', M, y + 5);
        y += 10;
        const catColors = [GOLD, BLUE, GREEN, [168,85,247], [29,158,117], RED];
        let ci = 0;
        Object.entries(byCat).forEach(([cat, amt]) => {
          const bw = (totalDep > 0 ? amt/totalDep : 0) * (W - 2*M - 50);
          doc.setFillColor(226, 232, 240);
          doc.roundedRect(M+42, y, W-2*M-52, 6, 1, 1, 'F');
          doc.setFillColor(...(catColors[ci % catColors.length]));
          if (bw > 0) doc.roundedRect(M+42, y, bw, 6, 1, 1, 'F');
          doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(...MUTED);
          doc.text(cat, M, y + 5);
          doc.setTextColor(...NAVY); doc.setFont('helvetica', 'bold');
          doc.text(pdfNum(amt)+' DH', W-M, y+5, { align:'right' });
          y += 9; ci++;
        });
        y += 4;
      }
    }

    // ── PHOTOS COUNT ──────────────────────────────────────────────────────
    const photoCount = (DB.photos||[]).filter(ph => ph.project_id === pid).length;
    if (photoCount > 0 && y < H - 30) {
      doc.setFillColor(...GOLDB);
      doc.roundedRect(M, y, W-2*M, 12, 2, 2, 'F');
      doc.setFillColor(...GOLD); doc.rect(M, y, 3, 12, 'F');
      doc.setTextColor(...NAVY); doc.setFontSize(8.5); doc.setFont('helvetica', 'bold');
      doc.text('Photos de chantier :', M+7, y+8);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(...BLUE);
      doc.text(photoCount + ' photo' + (photoCount>1?'s':'') + ' enregistree' + (photoCount>1?'s':''), M+50, y+8);
      y += 18;
    }

    // ── FOOTER ALL PAGES ─────────────────────────────────────────────────
    const np = doc.internal.getNumberOfPages();
    for (let pg = 1; pg <= np; pg++) {
      doc.setPage(pg);
      doc.setFillColor(...NAVY);
      doc.rect(0, H-12, W, 12, 'F');
      doc.setFillColor(...GOLD);
      doc.rect(0, H-12, W, 1.5, 'F');
      doc.setTextColor(...GOLDL); doc.setFontSize(7); doc.setFont('helvetica', 'normal');
      doc.text('ShantiLink  |  Plateforme BTP Maroc  |  contact@shantilink.ma', M, H-5);
      doc.text('Page ' + pg + ' / ' + np, W-M, H-5, { align:'right' });
    }

    // Telecharger le PDF (evite le blocage popup des navigateurs)
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rapport-' + p.nom.replace(/[^a-zA-Z0-9À-ɏ]/g, '-') + '.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('Rapport "' + p.nom + '" telecharge !', 'success');
  } catch(err) {
    console.error('PDF error', err);
    toast('Erreur PDF : ' + (err.message || String(err)), 'error');
  }
};

// CLT-08: Weekly report email
window.sendWeeklyReport = async function() {
  const btn = document.getElementById('btn-weekly-report');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Envoi…'; }
  try {
    const res = await fetch('/api/reports/weekly/email', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + (API.getToken() || '') }
    });
    const data = await res.json();
    if (data.ok) {
      toast('Rapport hebdomadaire envoyé à votre email !', 'success');
    } else {
      toast(data.message || 'Service email non disponible', 'error');
    }
  } catch(e) { toast(e.message, 'error'); }
  finally { if (btn) { btn.disabled = false; btn.textContent = '📧 Rapport hebdo'; } }
};

window.exportRapportExcel = function() {
  const rows = [['Projet','Ville','Type','Budget','Avancement','Dépenses']];
  DB.projects.forEach(p => {
    const dep = DB.expenses.filter(e => e.project_id === p.id).reduce((s, e) => s + (e.montant || 0), 0);
    rows.push([p.nom, p.ville||'', p.type||'', p.budget||0, (p.pct||0)+'%', dep]);
  });
  const csv = rows.map(r => r.map(c => '"' + String(c).replace(/"/g,'""') + '"').join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'rapport_ShantiLink_' + new Date().toISOString().slice(0,10) + '.csv';
  a.click();
  toast('Rapport CSV exporté.', 'success');
};

// ── Professionals / Map ───────────────────────────────────────────────────────
async function initMap() {
  if (!allPros.length) {
    try { allPros = await API.getPros(); filteredPros = allPros.slice(); } catch (e) { return; }
  }
  if (prosMap) { prosMap.invalidateSize(); renderProsList(filteredPros); return; }
  try {
    prosMap = L.map('pros-map').setView([32.5, -5.5], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(prosMap);
    renderProsMap(allPros);
    renderProsList(allPros);
  } catch (e) { console.error('Map error', e); }
}

function renderProsMap(pros) {
  if (!prosMap) return;
  prosMarkers.forEach(m => prosMap.removeLayer(m));
  prosMarkers = [];
  pros.forEach(p => {
    const icon = L.divIcon({
      html: '<div style="background:#A0522D;color:white;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,.2);border:2px solid white">' + p.emoji + '</div>',
      iconSize: [30, 30], className: ''
    });
    const m = L.marker([p.lat, p.lng], { icon }).addTo(prosMap);
    m.bindPopup('<div style="font-family:Outfit,sans-serif;min-width:160px"><div style="font-weight:600;font-size:13px">' + p.nom + '</div><div style="font-size:11px;color:#706B65">' + p.ville + ' — ' + p.note + '/5</div><div style="font-size:11px;color:#706B65;margin-top:3px">' + (p.description || '').substring(0, 60) + '...</div><button onclick="openProModal(' + p.id + ')" style="margin-top:8px;font-size:11px;padding:5px 12px;background:#A0522D;color:white;border:none;border-radius:100px;cursor:pointer;font-family:Outfit,sans-serif">Contacter</button></div>');
    prosMarkers.push(m);
  });
}

function renderProsList(pros) {
  const _prosRoleLabels = { entrepreneur: 'Entrepreneur / Maçon', architecte: 'Architecte', electricien: 'Électricien', plombier: 'Plombier', bureau: "Bureau d'études", comptable: 'Comptable BTP', notaire: 'Notaire' };
  const list = document.getElementById('pros-list');
  if (!list) return;
  if (pros.length === 0) {
    list.innerHTML = '<div style="text-align:center;padding:2.5rem 1rem"><div style="font-size:2rem;margin-bottom:.8rem">📍</div><div style="font-weight:600;color:var(--text);margin-bottom:.4rem">Aucun professionnel dans cette zone</div><div style="font-size:13px;color:var(--muted);margin-bottom:1rem">Essayez d\'élargir votre recherche ou de changer de filtre</div><button onclick="document.getElementById(\'pro-type-filter\').value=\'\';document.getElementById(\'pro-ville-filter\').value=\'\';window.filterPros()" style="font-size:12px;padding:8px 20px;background:var(--clay);color:white;border:none;border-radius:100px;cursor:pointer;font-family:Outfit,sans-serif">Élargir la recherche</button></div>';
    return;
  }
  list.innerHTML = pros.map(p => {
    const stars = [1,2,3,4,5].map(i => i <= Math.floor(p.note) ? '★' : '☆').join('');
    const verified = p.verified ? '<span class="pro-verified">Vérifié ✓</span>' : '';
    const arcBadge = p.arc_badge === 'verified' ? '<span style="display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:700;padding:2px 8px;border-radius:100px;background:#EEF2FF;color:#4338CA;border:1px solid #C7D2FE">&#x1F3DB; OA Certifié</span>' : '';
    return '<div class="pro-card"><div class="pro-av">' + esc(p.emoji) + '</div>'
      + '<div class="pro-info"><div class="pro-name">' + esc(p.nom) + (arcBadge ? ' ' + arcBadge : '') + '</div>'
      + '<div class="pro-role">' + esc(_prosRoleLabels[p.role] || p.role) + '</div>'
      + '<div class="pro-ville">📍 ' + esc(p.ville) + '</div>'
      + '<div class="pro-stars">' + stars + ' ' + esc(String(p.note)) + '/5 (' + esc(String(p.avis)) + ' avis)</div>'
      + '<div style="font-size:11px;color:var(--muted);margin-top:3px">' + esc((p.description || '').substring(0, 80)) + '...</div>'
      + '<div style="font-size:11px;color:var(--clay);margin-top:3px">' + esc(p.tel || '') + '</div>'
      + '</div>' + verified
      + '<div style="display:flex;gap:.4rem;flex-wrap:wrap">'
      + '<button class="pro-contact-btn" onclick="openProModal(' + p.id + ')">Contacter</button>'
      + '<button onclick="openReviewModal(' + p.id + ',\'' + esc(p.nom).replace(/'/g,'&#39;') + '\')" style="font-size:11px;padding:6px 12px;border:.5px solid var(--border);background:white;border-radius:100px;cursor:pointer;font-family:Outfit,sans-serif;color:var(--muted)">⭐ Avis</button>'
      + '</div></div>';
  }).join('');
}

window.filterPros = async function() {
  const role   = document.getElementById('pro-type-filter').value;
  const ville  = document.getElementById('pro-ville-filter').value;
  const search = (document.getElementById('pro-search').value || '').toLowerCase();
  filteredPros = allPros.filter(p =>
    (!role || p.role === role) &&
    (!ville || p.ville === ville) &&
    (!search || p.nom.toLowerCase().includes(search) || (p.description || '').toLowerCase().includes(search))
  );
  renderProsMap(filteredPros);
  renderProsList(filteredPros);
};

let currentPro = null;
window.openProModal = function(id) {
  currentPro = allPros.find(p => p.id === id);
  if (!currentPro) return;
  document.getElementById('modal-pro-name').textContent = 'Contacter ' + currentPro.nom;
  document.getElementById('modal-pro-info').textContent = currentPro.ville + ' — ' + currentPro.note + '/5 — ' + currentPro.tel;
  document.getElementById('modal-pro').classList.add('on');
};

window.sendProContact = async function() {
  if (!currentPro) return;
  const msg = document.getElementById('modal-pro-msg').value.trim();
  if (!msg) { toast('Écrivez un message.', 'error'); return; }
  if (!currentUser) { goPage('auth'); switchTab('login'); return; }
  try {
    await API.sendMessage(currentPro.id, msg);
    document.getElementById('modal-pro').classList.remove('on');
    document.getElementById('modal-pro-msg').value = '';
    toast('Message envoyé ! Le professionnel vous répondra sous 24h.', 'success');
    convCache = {};
  } catch (e) { toast(e.message, 'error'); }
};

// ── Messages directs entre inscrits ───────────────────────────────────────────
async function loadConversations() {
  const convList = document.getElementById('conv-list');
  if (!convList) return;
  try {
    const chats = await API.getChats();
    if (chats.length === 0) {
      convList.innerHTML = '<div style="padding:1rem;font-size:12px;color:var(--muted);text-align:center">Aucune conversation.<br>Cherchez un inscrit ci-dessus.</div>';
      return;
    }
    convList.innerHTML = chats.map(c => {
      const name = esc((c.prenom || '') + ' ' + (c.nom || ''));
      const unreadBadge = c.unread > 0
        ? '<span style="background:var(--clay);color:white;border-radius:100px;font-size:10px;padding:1px 6px;margin-left:auto">' + c.unread + '</span>'
        : '';
      return '<div class="msg-item" style="cursor:pointer;padding:.6rem .8rem;border-radius:10px;margin-bottom:.3rem;' + (c.unread > 0 ? 'background:#FFF7F5;' : '') + '" onclick="openConv(\'' + esc(c.other_id) + '\', \'' + name.trim().replace(/'/g,'&#39;') + '\')">'
        + '<div style="display:flex;align-items:center;gap:.4rem">'
        + '<div style="width:32px;height:32px;border-radius:50%;background:var(--ink);color:white;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0">' + esc((c.prenom || '?')[0].toUpperCase()) + '</div>'
        + '<div style="min-width:0;flex:1">'
        + '<div style="font-size:13px;font-weight:600;display:flex;align-items:center">' + name.trim() + unreadBadge + '</div>'
        + '<div style="font-size:11px;color:var(--muted)">' + esc(c.role || '') + (c.ville ? ' · ' + esc(c.ville) : '') + '</div>'
        + (c.last_msg ? '<div style="font-size:11px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px">' + esc(c.last_msg) + '</div>' : '')
        + '</div></div></div>';
    }).join('');
  } catch (e) { toast(e.message, 'error'); }
}

window.openConv = async function(userId, userName) {
  currentConv = userId;
  document.getElementById('conv-name').textContent = userName || 'Conversation';
  const msgs = document.getElementById('conv-msgs');
  msgs.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:12px;padding:2rem">Chargement...</div>';
  try {
    const data = await API.getChat(userId);
    renderMessages(data.messages || []);
    // refresh list to reset unread badges
    loadConversations();
  } catch (e) { msgs.innerHTML = '<div style="color:var(--red);font-size:13px;padding:1rem">' + e.message + '</div>'; }
};

function renderMessages(msgs) {
  const el = document.getElementById('conv-msgs');
  if (!el) return;
  if (!msgs || !msgs.length) {
    el.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:13px;padding:2rem">Envoyez un premier message.</div>';
    return;
  }
  const myId = (JSON.parse(localStorage.getItem('sl_user') || '{}')).id;
  el.innerHTML = msgs.map(m =>
    '<div class="msg-bubble ' + (m.sender_id === myId ? 'sent' : 'received') + '">' + escHtml(m.content) + '</div>'
  ).join('');
  el.scrollTop = el.scrollHeight;
}

function escHtml(s) { return esc(s); } // alias — use esc() for new code

window.sendMsg = async function() {
  if (!currentConv) return;
  const input = document.getElementById('msg-input');
  const txt = input.value.trim();
  if (!txt) return;
  input.value = '';
  try {
    await API.sendChat(currentConv, txt);
    const data = await API.getChat(currentConv);
    renderMessages(data.messages || []);
  } catch (e) { toast(e.message, 'error'); input.value = txt; }
};

let _searchTimer = null;
window.searchUsersForChat = function(q) {
  clearTimeout(_searchTimer);
  const res = document.getElementById('user-search-results');
  if (!res) return;
  if (!q || q.length < 2) { res.style.display = 'none'; return; }
  _searchTimer = setTimeout(async () => {
    try {
      const users = await API.searchUsers(q);
      if (!users.length) { res.style.display = 'none'; return; }
      const myId = (JSON.parse(localStorage.getItem('sl_user') || '{}')).id;
      const filtered = users.filter(u => u.id !== myId);
      if (!filtered.length) { res.style.display = 'none'; return; }
      res.style.display = 'block';
      res.innerHTML = filtered.map(u =>
        '<div style="padding:.5rem .8rem;cursor:pointer;font-size:13px;border-bottom:.5px solid var(--border)" '
        + 'onmousedown="startChatWith(\'' + u.id + '\', \'' + escHtml((u.prenom||'') + ' ' + (u.nom||'')).trim() + '\')">'
        + '<strong>' + escHtml((u.prenom||'') + ' ' + (u.nom||'')) + '</strong>'
        + '<span style="color:var(--muted);font-size:11px;margin-left:.4rem">' + esc(u.role||'') + (u.ville ? ' · ' + esc(u.ville) : '') + '</span>'
        + '</div>'
      ).join('');
    } catch(e) {}
  }, 300);
};

window.startChatWith = function(userId, userName) {
  const res = document.getElementById('user-search-results');
  const inp = document.getElementById('user-search-input');
  if (res) res.style.display = 'none';
  if (inp) inp.value = '';
  openConv(userId, userName);
};

// ── Profile ───────────────────────────────────────────────────────────────────
function loadProfilePanel() {
  if (!currentUser) return;
  const u = currentUser;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
  const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v || ''; };
  const av = document.getElementById('profil-av'); if (av) av.textContent = (u.prenom || '?')[0].toUpperCase();
  setTxt('profil-name', (u.prenom || '') + (u.nom ? ' ' + u.nom : ''));
  setTxt('profil-role', u.role || '');
  setTxt('profil-email', u.email || '');
  set('edit-prenom', u.prenom);
  set('edit-nom',    u.nom);
  set('edit-email',  u.email);
  set('edit-ville',  u.ville);
  set('edit-tel',    u.tel);
  // PRO-01: render company profile section
  if (typeof window.renderCompanyProfile === 'function') window.renderCompanyProfile();
  // CLT-02: render MRE section
  if (typeof window.renderMRESection === 'function') window.renderMRESection();
}

window.saveProfile = async function() {
  const prenom = document.getElementById('edit-prenom').value.trim();
  const nom    = document.getElementById('edit-nom').value.trim();
  const ville  = document.getElementById('edit-ville').value.trim();
  const tel    = document.getElementById('edit-tel').value.trim();
  try {
    const updated = await API.updateProfile({ prenom, nom, ville, tel });
    currentUser = { ...currentUser, ...updated };
    localStorage.setItem('sl_user', JSON.stringify(currentUser));
    loadProfilePanel();
    const g = document.getElementById('dash-greet'); if (g) g.textContent = 'Bonjour, ' + currentUser.prenom + ' !';
    toast('Profil mis à jour !', 'success');
  } catch (e) { toast(e.message, 'error'); }
};

// ── PDF generation ────────────────────────────────────────────────────────────
// Helper: format numbers for PDF (avoids non-breaking spaces from toLocaleString)
function pdfNum(n) {
  return String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

window.generatePDF = function() {
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W = 210; const H = 297; const M = 14;
    const u = currentUser || { prenom: 'Utilisateur', nom: '', email: 'user@shantilink.ma' };
    const week  = getWeek(new Date());
    const today = new Date().toLocaleDateString('fr-FR');

    // ── HEADER ─────────────────────────────────────────────────────────────────
    // Rich dark header
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, W, 48, 'F');
    // Gradient-style accent bars
    doc.setFillColor(160, 82, 45);
    doc.rect(0, 44, W, 4, 'F');
    doc.setFillColor(200, 115, 60);
    doc.rect(0, 44, W/3, 4, 'F');
    // Left side decor
    doc.setFillColor(160, 82, 45);
    doc.rect(0, 0, 4, 44, 'F');
    // Logo
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22); doc.setFont('helvetica', 'bold');
    doc.text('ShantiLink', 10, 20);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.setTextColor(180, 160, 140);
    doc.text('Plateforme de gestion de chantier au Maroc', 10, 29);
    // Badge top-right
    doc.setFillColor(160, 82, 45);
    doc.roundedRect(W - 68, 7, 56, 16, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('RAPPORT GLOBAL', W - 40, 14, { align: 'center' });
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
    doc.text('Semaine ' + week + '  |  ' + today, W - 40, 20, { align: 'center' });

    // ── USER INFO BAND ─────────────────────────────────────────────────────────
    let y = 54;
    doc.setFillColor(253, 246, 236);
    doc.roundedRect(M, y, W - 2*M, 22, 3, 3, 'F');
    doc.setFillColor(160, 82, 45);
    doc.roundedRect(M, y, 4, 22, 2, 2, 'F');
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.text(u.prenom + (u.nom ? ' ' + u.nom : ''), M + 9, y + 9);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(120, 100, 80);
    doc.text(u.email, M + 9, y + 17);
    // Report date right
    doc.setTextColor(160, 82, 45); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.text('Semaine ' + week, W - M, y + 9, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(120, 100, 80);
    doc.text(today, W - M, y + 17, { align: 'right' });

    // ── KPI BOXES ─────────────────────────────────────────────────────────────
    y += 30;
    const avgPct = DB.projects.length
      ? Math.round(DB.projects.reduce((s, p) => s + (p.pct || 0), 0) / DB.projects.length)
      : 0;
    const totalBudget = DB.projects.reduce((s, p) => s + (p.budget || 0), 0);
    const totalDep    = activeExpenses().reduce((s, e) => s + (e.montant || 0), 0);
    const nDone = DB.projects.filter(p => (p.pct||0) >= 100).length;
    const overG = totalDep > totalBudget && totalBudget > 0;
    const kpis = [
      { label: 'Projets actifs',    value: String(DB.projects.length),    accent: [160,82,45],   bg: [253,246,236] },
      { label: 'Budget total',      value: pdfNum(totalBudget) + ' DH',   accent: [15,23,42],    bg: [245,245,250] },
      { label: 'Total depenses',    value: pdfNum(totalDep) + ' DH',      accent: overG ? [185,28,28] : [15,23,42], bg: overG ? [254,242,242] : [245,245,250] },
      { label: 'Avancement moyen',  value: avgPct + '%',                   accent: avgPct >= 60 ? [5,150,105] : [160,82,45], bg: avgPct >= 60 ? [240,253,244] : [253,246,236] },
    ];
    const bW = (W - 2*M - 9) / 4;
    kpis.forEach((k, i) => {
      const bx = M + i * (bW + 3);
      doc.setFillColor(...k.bg);
      doc.roundedRect(bx, y, bW, 28, 3, 3, 'F');
      doc.setFillColor(...k.accent);
      doc.roundedRect(bx, y, bW, 3, 1, 1, 'F');
      // Shadow line
      doc.setDrawColor(220, 205, 185);
      doc.setLineWidth(0.3);
      doc.roundedRect(bx, y, bW, 28, 3, 3, 'S');
      doc.setTextColor(...k.accent);
      doc.setFontSize(k.value.length > 11 ? 9 : 13); doc.setFont('helvetica', 'bold');
      doc.text(k.value, bx + bW/2, y + 17, { align: 'center' });
      doc.setTextColor(120, 100, 80); doc.setFontSize(7); doc.setFont('helvetica', 'normal');
      doc.text(k.label, bx + bW/2, y + 24, { align: 'center' });
    });
    y += 36;

    // ── GLOBAL PROGRESS BAR ───────────────────────────────────────────────────
    doc.setFillColor(235, 220, 205);
    doc.roundedRect(M, y, W - 2*M, 8, 2, 2, 'F');
    const gBarW = Math.min(avgPct / 100, 1) * (W - 2*M);
    if (gBarW > 0) {
      const gc = avgPct >= 80 ? [5,150,105] : avgPct >= 50 ? [160,82,45] : [200,130,60];
      doc.setFillColor(...gc);
      doc.roundedRect(M, y, gBarW, 8, 2, 2, 'F');
    }
    doc.setTextColor(255,255,255); doc.setFontSize(7); doc.setFont('helvetica', 'bold');
    if (avgPct > 12) doc.text(avgPct + '%', M + gBarW - 3, y + 5.5, { align: 'right' });
    doc.setTextColor(100,80,60); doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
    doc.text('Avancement moyen de tous les projets', M, y + 14);
    if (nDone > 0) {
      doc.setTextColor(5,150,105); doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
      doc.text(nDone + ' projet(s) termine(s)', W - M, y + 14, { align: 'right' });
    }
    y += 20;

    // ── PROJECTS TABLE ─────────────────────────────────────────────────────────
    doc.setFillColor(15, 23, 42);
    doc.roundedRect(M, y, W - 2*M, 9, 2, 2, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('MES PROJETS', M + 4, y + 6.2);
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(180, 160, 140);
    doc.text('Vue d\'ensemble', W - M, y + 6.2, { align: 'right' });
    y += 12;

    if (DB.projects.length > 0) {
      doc.autoTable({
        startY: y,
        head: [['Projet', 'Ville', 'Type', 'Budget (DH)', 'Depenses (DH)', 'Avancement']],
        body: DB.projects.map(p => {
          const dep = DB.expenses.filter(e => e.project_id === p.id && !e.deleted).reduce((s,e) => s+(e.montant||0), 0);
          const over = dep > (p.budget||0) && (p.budget||0) > 0;
          return [
            p.nom || '—',
            p.ville || '—',
            (p.type || '—').replace('Villa / Maison individuelle', 'Villa'),
            { content: pdfNum(p.budget || 0), styles: { halign: 'right' } },
            { content: pdfNum(dep), styles: { halign: 'right', textColor: over ? [185,28,28] : [40,36,32], fontStyle: over ? 'bold' : 'normal' } },
            { content: (p.pct || 0) + '%', styles: { halign: 'center', fontStyle: 'bold', textColor: (p.pct||0) >= 100 ? [5,150,105] : (p.pct||0) >= 50 ? [160,82,45] : [100,80,60] } },
          ];
        }),
        foot: [[
          { content: 'TOTAUX', colSpan: 3, styles: { fontStyle: 'bold', halign: 'right', fillColor: [15,23,42], textColor: [255,255,255] } },
          { content: pdfNum(totalBudget), styles: { halign: 'right', fontStyle: 'bold', fillColor: [15,23,42], textColor: [255,255,255] } },
          { content: pdfNum(totalDep), styles: { halign: 'right', fontStyle: 'bold', fillColor: [160,82,45], textColor: [255,255,255] } },
          { content: avgPct + '%', styles: { halign: 'center', fontStyle: 'bold', fillColor: [15,23,42], textColor: [255,255,255] } },
        ]],
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 3.5, textColor: [40, 36, 32] },
        headStyles: { fillColor: [160, 82, 45], textColor: [255,255,255], fontStyle: 'bold', fontSize: 8, cellPadding: 4 },
        footStyles: { fontSize: 9, cellPadding: 4 },
        alternateRowStyles: { fillColor: [253, 248, 244] },
        columnStyles: {
          0: { cellWidth: 54 },
          1: { cellWidth: 26 },
          2: { cellWidth: 30 },
          3: { cellWidth: 30, halign: 'right' },
          4: { cellWidth: 30, halign: 'right' },
          5: { cellWidth: 12, halign: 'center' },
        },
        margin: { left: M, right: M },
      });
      y = doc.lastAutoTable.finalY + 10;
    } else {
      doc.setFillColor(253, 248, 244);
      doc.roundedRect(M, y, W - 2*M, 14, 2, 2, 'F');
      doc.setFontSize(8.5); doc.setFont('helvetica', 'italic'); doc.setTextColor(150, 130, 110);
      doc.text('Aucun projet enregistre.', W/2, y + 9, { align: 'center' });
      y += 20;
    }

    // ── EXPENSES TABLE ─────────────────────────────────────────────────────────
    if (y > H - 85) { doc.addPage(); y = M; }
    doc.setFillColor(15, 23, 42);
    doc.roundedRect(M, y, W - 2*M, 9, 2, 2, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
    doc.text('DERNIERES DEPENSES', M + 4, y + 6.2);
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(180, 160, 140);
    doc.text('10 dernieres transactions', W - M, y + 6.2, { align: 'right' });
    y += 12;

    const pdfExpenses = activeExpenses().slice(0, 10);
    if (pdfExpenses.length > 0) {
      const depTotal = pdfExpenses.reduce((s, d) => s + (d.montant || 0), 0);
      // Get project name helper
      const projName = (pid) => { const pr = DB.projects.find(x => x.id === pid); return pr ? pr.nom : '—'; };
      doc.autoTable({
        startY: y,
        head: [['Projet', 'Description', 'Categorie', 'Montant (DH)', 'Date']],
        body: pdfExpenses.map(d => [
          projName(d.project_id),
          d.description || '—',
          d.categorie   || 'Autre',
          { content: pdfNum(d.montant || 0), styles: { halign: 'right', fontStyle: 'bold' } },
          d.date || '—',
        ]),
        foot: [[
          { content: 'TOTAL', colSpan: 3, styles: { fontStyle: 'bold', halign: 'right', fillColor: [15,23,42], textColor: [255,255,255] } },
          { content: pdfNum(depTotal) + ' DH', styles: { halign: 'right', fontStyle: 'bold', fillColor: [160,82,45], textColor: [255,255,255] } },
          { content: '', styles: { fillColor: [15,23,42] } },
        ]],
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 3.5, textColor: [40, 36, 32] },
        headStyles: { fillColor: [71, 55, 40], textColor: [255,255,255], fontStyle: 'bold', fontSize: 8, cellPadding: 4 },
        footStyles: { fontSize: 9, cellPadding: 4 },
        alternateRowStyles: { fillColor: [253, 248, 244] },
        columnStyles: {
          0: { cellWidth: 40 },
          1: { cellWidth: 64 },
          2: { cellWidth: 34 },
          3: { cellWidth: 30, halign: 'right' },
          4: { cellWidth: 14, halign: 'center' },
        },
        margin: { left: M, right: M },
      });
      y = doc.lastAutoTable.finalY + 8;
    } else {
      doc.setFillColor(253, 248, 244);
      doc.roundedRect(M, y, W - 2*M, 14, 2, 2, 'F');
      doc.setFontSize(8.5); doc.setFont('helvetica', 'italic'); doc.setTextColor(150, 130, 110);
      doc.text('Aucune depense enregistree.', W/2, y + 9, { align: 'center' });
    }

    // ── FOOTER ALL PAGES ──────────────────────────────────────────────────────
    const pageCount = doc.internal.getNumberOfPages();
    for (let pg = 1; pg <= pageCount; pg++) {
      doc.setPage(pg);
      doc.setFillColor(15, 23, 42);
      doc.rect(0, H - 12, W, 12, 'F');
      doc.setFillColor(160, 82, 45);
      doc.rect(0, H - 12, W, 1.5, 'F');
      doc.setTextColor(180, 160, 140); doc.setFontSize(7); doc.setFont('helvetica', 'normal');
      doc.text('ShantiLink  |  contact@shantilink.ma  |  www.shantilink.ma', M, H - 5);
      doc.text('Page ' + pg + ' / ' + pageCount, W - M, H - 5, { align: 'right' });
    }

    doc.save('ShantiLink_Rapport_S' + week + '_' + today.replace(/\//g, '-') + '.pdf');
    toast('Rapport PDF genere !', 'success');
  } catch (e) {
    console.error(e);
    toast('Erreur generation PDF : ' + (e.message || e), 'error');
  }
};

// ── Simulator panel (dashboard) ───────────────────────────────────────────────
const SIM_REGIONS = {
  'Casablanca':   5800, 'Rabat':       5500, 'Marrakech':  5200,
  'Tanger':       5000, 'Agadir':      4800, 'Fès':        4500,
  'Meknès':       4400, 'Kénitra':     4700, 'Oujda':      4200,
  'El Jadida':    4300, 'Safi':        4100, 'Béni Mellal':4000,
  'Laâyoune':     4600, 'Dakhla':      4800, 'Autre ville':4200,
};
const SIM_TYPE_COEF = {
  'Villa / Maison individuelle': 1.00,
  'Appartement':                 0.88,
  'Immeuble collectif':          0.82,
  'Bureau / Local commercial':   1.08,
  'Rénovation / Extension':      0.62,
};
const SIM_FINITION_COEF = {
  'Économique':    0.72,
  'Standard':      1.00,
  'Haut standing': 1.38,
  'Luxe':          1.80,
};
const SIM_MAT_COEF = {
  'Local / Standard': 1.00,
  'Mi-gamme importé': 1.18,
  'Premium importé':  1.42,
};
const SIM_BREAKDOWN = [
  { get label() { return t('sim_b1','Fondations & gros œuvre'); },         pct: 0.36 },
  { get label() { return t('sim_b2','Toiture & étanchéité'); },             pct: 0.07 },
  { get label() { return t('sim_b3','Électricité & éclairage'); },          pct: 0.07 },
  { get label() { return t('sim_b4','Plomberie & sanitaires'); },           pct: 0.06 },
  { get label() { return t('sim_b5','Menuiserie extérieure'); },            pct: 0.08 },
  { get label() { return t('sim_b6','Menuiserie intérieure'); },            pct: 0.05 },
  { get label() { return t('sim_b7','Carrelage & revêtements'); },          pct: 0.08 },
  { get label() { return t('sim_b8','Peinture & enduits'); },               pct: 0.05 },
  { get label() { return t('sim_b9','VRD & aménagements extérieurs'); },    pct: 0.04 },
  { get label() { return t('sim_b10','Honoraires (architecte, permis)'); }, pct: 0.06 },
  { get label() { return t('sim_b11','Imprévus & divers'); },               pct: 0.08 },
];

function renderSimPanel() {
  const saved = (() => { try { return JSON.parse(localStorage.getItem('sl_sim')) || {}; } catch(e) { return {}; } })();
  const res = document.getElementById('sim-result-box');
  if (res) res.innerHTML = '';

  // ── backward-compat: old landing sim stored etages as float multiplier (1, 1.15, 1.28…)
  //    new format stores integer (0, 1, 2…)
  const OLD_ETAGES_MAP = { 1: 0, '1': 0, 1.15: 1, '1.15': 1, 1.28: 2, '1.28': 2, 1.4: 3, '1.4': 3, 1.5: 4, '1.5': 4 };
  const etagesVal = (Number.isInteger(Number(saved.etages)) && Number(saved.etages) <= 5)
    ? Number(saved.etages)
    : (OLD_ETAGES_MAP[saved.etages] !== undefined ? OLD_ETAGES_MAP[saved.etages] : 0);

  // ── old landing sim stored finition as 'Confort'/'Prestige' which don't exist in dashboard options
  const OLD_FIN_MAP = { 'Confort': 'Haut standing', 'Prestige': 'Luxe' };
  const finVal = OLD_FIN_MAP[saved.finition] || saved.finition || 'Standard';

  // pre-fill all fields
  const set = (id, v) => { const el = document.getElementById(id); if (el && v !== undefined && v !== null) el.value = v; };
  set('dsim-region',   saved.ville  || 'Casablanca');
  set('dsim-type',     saved.type   || 'Villa / Maison individuelle');
  set('dsim-surface',  saved.surface);
  set('dsim-etages',   etagesVal);
  set('dsim-finition', finVal);
  set('dsim-materiaux',saved.materiaux || 'Local / Standard');
  const ss = document.getElementById('dsim-soussol'); if (ss) ss.checked = !!saved.sousSol;
  const pi = document.getElementById('dsim-piscine');  if (pi) pi.checked = !!saved.piscine;

  // If we have a complete saved sim, show result immediately
  if (saved.tot && saved.tot > 0) {
    runSimDash();
  }
}

window.runSimDash = function() {
  const region   = document.getElementById('dsim-region').value;
  const type     = document.getElementById('dsim-type').value;
  const surface  = parseFloat(document.getElementById('dsim-surface').value) || 0;
  const etages   = parseInt(document.getElementById('dsim-etages').value) || 0;
  const finition = document.getElementById('dsim-finition').value;
  const mat      = document.getElementById('dsim-materiaux').value;
  const sousSol  = document.getElementById('dsim-soussol').checked;
  const piscine  = document.getElementById('dsim-piscine').checked;

  if (!surface || surface < 20) { toast('Entrez une surface construite valide (min 20 m²).', 'error'); return; }

  const basePrixM2 = SIM_REGIONS[region] || 4200;
  const typeCoef   = SIM_TYPE_COEF[type]  || 1.00;
  const finCoef    = SIM_FINITION_COEF[finition] || 1.00;
  const matCoef    = SIM_MAT_COEF[mat]    || 1.00;
  const floorPrem  = 1 + etages * 0.08;

  let base = surface * basePrixM2 * typeCoef * finCoef * matCoef * floorPrem;
  if (sousSol) base += Math.max(150000, surface * 800);
  if (piscine) base += 180000;

  const tot = Math.round(base / 1000) * 1000;
  const lo  = Math.round(tot * 0.88 / 1000) * 1000;
  const hi  = Math.round(tot * 1.18 / 1000) * 1000;
  const m2  = Math.round(tot / surface);
  const date = new Date().toLocaleDateString('fr-FR');

  // Save for banner + project creation
  const simData = { ville: region, type, surface, etages, finition, materiaux: mat, sousSol, piscine, tot, lo, hi, date };
  localStorage.setItem('sl_sim', JSON.stringify(simData));

  const res = document.getElementById('sim-result-box');
  if (!res) return;

  const rows = SIM_BREAKDOWN.map(b => {
    const val = Math.round(tot * b.pct / 1000) * 1000;
    return '<tr><td style="font-size:12px;color:var(--muted);padding:6px 8px">' + b.label + '</td>'
      + '<td style="font-size:12px;font-weight:600;text-align:right;padding:6px 8px">' + val.toLocaleString('fr-FR') + ' DH</td>'
      + '<td style="font-size:11px;color:var(--muted);text-align:right;padding:6px 8px">' + Math.round(b.pct * 100) + '%</td></tr>';
  }).join('');

  res.innerHTML = '<div style="border:.5px solid var(--sand);border-radius:16px;overflow:hidden;margin-top:1.5rem">'
    + '<div style="background:var(--clay);padding:1.2rem 1.4rem;color:white">'
    + '<div style="font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;opacity:.7;margin-bottom:.3rem">' + t('sim_detail_lbl','Estimation détaillée') + ' · ' + date + '</div>'
    + '<div style="font-family:\'Playfair Display\',serif;font-size:2rem;font-weight:600">' + tot.toLocaleString('fr-FR') + ' <span style="font-size:1rem;opacity:.8">DH</span></div>'
    + '<div style="font-size:12px;opacity:.8;margin-top:.3rem">' + t('sim_range_prefix','Fourchette :') + ' ' + lo.toLocaleString('fr-FR') + ' — ' + hi.toLocaleString('fr-FR') + ' DH</div>'
    + '<div style="display:flex;gap:.5rem;margin-top:.8rem;flex-wrap:wrap">'
    + '<span style="background:rgba(255,255,255,.2);padding:3px 10px;border-radius:100px;font-size:11px">📍 ' + region + '</span>'
    + '<span style="background:rgba(255,255,255,.2);padding:3px 10px;border-radius:100px;font-size:11px">📐 ' + surface + ' m²</span>'
    + '<span style="background:rgba(255,255,255,.2);padding:3px 10px;border-radius:100px;font-size:11px">🏗️ R+' + etages + '</span>'
    + '<span style="background:rgba(255,255,255,.2);padding:3px 10px;border-radius:100px;font-size:11px">✨ ' + finition + '</span>'
    + '<span style="background:rgba(255,255,255,.2);padding:3px 10px;border-radius:100px;font-size:11px">💡 ' + m2.toLocaleString('fr-FR') + ' DH/m²</span>'
    + '</div></div>'
    + '<div style="background:var(--white);padding:1rem 1.2rem">'
    + '<div style="font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--clay);margin-bottom:.5rem">' + t('sim_breakdown_title','Ventilation par poste') + '</div>'
    + '<table style="width:100%;border-collapse:collapse"><tbody>' + rows + '</tbody></table>'
    + '</div>'
    + '<div style="background:var(--sand);padding:.9rem 1.2rem;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.6rem">'
    + '<div style="font-size:11px;color:var(--muted)">' + t('sim_indicative','Estimation indicative basée sur les tarifs moyens au Maroc en 2025') + '</div>'
    + '<button onclick="createProjectFromSim()" style="font-size:12px;font-weight:600;padding:9px 18px;background:var(--clay);color:white;border:none;border-radius:100px;cursor:pointer;font-family:Outfit,sans-serif">' + t('sim_create_proj','🏗️ Créer ce projet') + '</button>'
    + '</div></div>';

// ── Briefs / Demandes de devis ─────────────────────────────────────────────────
let _briefsView = 'list'; // 'list' | 'mine'

window.loadBriefsPanel = async function() {
  const isPro = currentUser && currentUser.role !== 'client';
  const subEl = document.getElementById('devis-sub');
  const addBtn = document.getElementById('brief-add-btn');
  const tabMy = document.getElementById('tab-my-briefs');
  const tabAll = document.getElementById('tab-all-briefs');
  if (isPro) {
    if (subEl) subEl.textContent = 'Trouvez des projets et envoyez vos offres';
    if (addBtn) addBtn.style.display = 'none';
    if (tabMy) { tabMy.style.background='white'; tabMy.style.color='var(--ink)'; tabMy.style.borderColor='var(--border)'; }
    if (tabAll) { tabAll.style.background='var(--clay)'; tabAll.style.color='white'; tabAll.style.borderColor='var(--clay)'; }
    await loadBriefsList();
  } else {
    if (addBtn) addBtn.style.display = 'block';
    if (tabMy) { tabMy.style.background='var(--clay)'; tabMy.style.color='white'; tabMy.style.borderColor='var(--clay)'; }
    if (tabAll) { tabAll.style.background='white'; tabAll.style.color='var(--ink)'; tabAll.style.borderColor='var(--border)'; }
    await loadMyBriefs();
  }
};

window.loadBriefsList = async function(filters) {
  const el = document.getElementById('briefs-list-content');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--muted);font-size:13px">Chargement…</div>';
  try {
    const params = {};
    const villeEl = document.getElementById('brief-filter-ville');
    const catEl = document.getElementById('brief-filter-cat');
    if (villeEl && villeEl.value) params.ville = villeEl.value;
    if (catEl && catEl.value) params.categorie = catEl.value;
    const briefs = await API.getBriefs(params);
    if (!briefs.length) {
      el.innerHTML = '<div style="text-align:center;padding:3rem;color:var(--muted);font-size:13px">Aucune demande disponible dans votre zone.<br><span style="font-size:12px;opacity:.7">Revenez plus tard ou ajustez les filtres.</span></div>';
      return;
    }
    el.innerHTML = briefs.map(b => `
      <div class="dcard" style="margin-bottom:.8rem;cursor:pointer" onclick="showBriefDetail('${b.id}')">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;flex-wrap:wrap">
          <div>
            <div style="font-weight:600;font-size:14px;margin-bottom:.3rem">${escHtml(b.titre)}</div>
            <div style="font-size:12px;color:var(--muted);margin-bottom:.4rem">
              📍 ${escHtml(b.ville||'Non précisée')} &nbsp;·&nbsp; 🔧 ${escHtml(b.categorie)}
              ${b.deadline ? ' &nbsp;·&nbsp; 📅 ' + escHtml(b.deadline) : ''}
            </div>
            <div style="font-size:12px;color:var(--ink);line-height:1.5;max-height:3em;overflow:hidden">${escHtml(b.description||'')}</div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            ${b.budget_max ? `<div style="font-size:13px;font-weight:600;color:var(--clay)">${(b.budget_min||0).toLocaleString('fr-FR')} – ${b.budget_max.toLocaleString('fr-FR')} DH</div>` : ''}
            <div style="font-size:10px;color:var(--muted);margin-top:.2rem">${timeAgo(b.created_at)}</div>
            <button onclick="event.stopPropagation();openRespondBrief('${b.id}','${escHtml(b.titre)}')" style="margin-top:.6rem;font-size:11px;font-weight:600;padding:6px 14px;background:var(--clay);color:white;border:none;border-radius:100px;cursor:pointer;font-family:Outfit,sans-serif">Répondre →</button>
          </div>
        </div>
      </div>`).join('');
  } catch(e) { el.innerHTML = `<div style="color:var(--muted);padding:1rem;text-align:center;font-size:13px">${e.message}</div>`; }
};

window.loadMyBriefs = async function() {
  const el = document.getElementById('briefs-list-content');
  if (!el) return;
  el.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--muted);font-size:13px">Chargement…</div>';
  try {
    const briefs = await API.getMyBriefs();
    const addBtn = document.getElementById('brief-add-btn');
    if (addBtn) addBtn.style.display = 'block';
    if (!briefs.length) {
      el.innerHTML = `<div style="text-align:center;padding:3rem;color:var(--muted);font-size:13px">
        Aucune demande publiée.<br>
        <span style="font-size:12px;opacity:.7">Décrivez votre projet pour recevoir des devis de professionnels.</span><br>
        <button onclick="showAddBriefForm()" style="margin-top:1rem;font-size:12px;font-weight:600;padding:9px 18px;background:var(--clay);color:white;border:none;border-radius:100px;cursor:pointer;font-family:Outfit,sans-serif">+ Publier une demande</button>
      </div>`;
      return;
    }
    el.innerHTML = briefs.map(b => `
      <div class="dcard" style="margin-bottom:.8rem">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:.8rem">
          <div>
            <div style="display:flex;align-items:center;gap:.6rem;margin-bottom:.2rem">
              <span style="font-weight:600;font-size:14px">${escHtml(b.titre)}</span>
              <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:100px;background:${b.status==='open'?'#e8f5e9':'#f5f5f5'};color:${b.status==='open'?'#2e7d32':'#999'}">${b.status==='open'?'Ouvert':'Clôturé'}</span>
            </div>
            <div style="font-size:12px;color:var(--muted)">📍 ${escHtml(b.ville||'—')} · ${escHtml(b.categorie)} · ${timeAgo(b.created_at)}</div>
            <div style="font-size:12px;color:var(--clay);font-weight:500;margin-top:.4rem">${(b.responses||[]).length} réponse${(b.responses||[]).length!==1?'s':''}</div>
          </div>
          <div style="display:flex;gap:.5rem;align-items:center">
            ${b.status==='open' ? `<button onclick="closeBriefAction('${b.id}')" style="font-size:11px;padding:5px 12px;border:.5px solid var(--border);background:white;border-radius:100px;cursor:pointer;font-family:Outfit,sans-serif;color:var(--muted)">Clôturer</button>` : ''}
            <button onclick="deleteBriefAction('${b.id}')" style="font-size:11px;padding:5px 12px;border:.5px solid #fcc;background:white;border-radius:100px;cursor:pointer;font-family:Outfit,sans-serif;color:#c00">✕</button>
          </div>
        </div>
        ${(b.responses||[]).length ? `<div style="margin-top:.8rem;padding-top:.8rem;border-top:.5px solid var(--border)">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)">${(b.responses||[]).length} réponse${(b.responses||[]).length>1?'s':''}</div>
            ${(b.responses||[]).length >= 2 ? `<button onclick="compareQuotes('${b.id}')" style="font-size:11px;padding:4px 12px;background:var(--clay-p);color:var(--clay);border:.5px solid var(--clay);border-radius:100px;cursor:pointer;font-family:Outfit,sans-serif;font-weight:600">⚖️ Comparer</button>` : ''}
          </div>
          ${(b.responses||[]).map(r=>`
            <div style="background:var(--sand);border-radius:10px;padding:.7rem .9rem;margin-bottom:.5rem">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.3rem">
                <span style="font-weight:600;font-size:13px">${escHtml(r.prenom)} ${escHtml(r.nom)}</span>
                <span style="font-size:12px;color:var(--clay);font-weight:500">${r.prix?r.prix.toLocaleString('fr-FR')+' DH':''}</span>
              </div>
              <div style="font-size:12px;color:var(--ink);margin-bottom:.3rem">${escHtml(r.message)}</div>
              ${r.delai?`<div style="font-size:11px;color:var(--muted)">⏱ ${escHtml(r.delai)}</div>`:''}
              ${r.tel?`<a href="https://wa.me/${r.tel.replace(/\D/g,'')}" target="_blank" style="font-size:11px;color:#25D366;font-weight:600;text-decoration:none;margin-top:.3rem;display:inline-block">💬 WhatsApp</a>`:''}
            </div>`).join('')}
        </div>` : ''}
      </div>`).join('');
  } catch(e) { el.innerHTML = `<div style="color:var(--muted);padding:1rem;text-align:center;font-size:13px">${e.message}</div>`; }
};

// CLT-06: Quote comparison view
let _compareResponses = [];
window.compareQuotes = function(briefId) {
  // Find the brief in the current user's briefs (already loaded)
  const wrap = document.getElementById('compare-modal');
  if (!wrap) return;
  // Collect responses from the rendered DOM data via API refetch
  API.getMyBriefs().then(briefs => {
    const brief = briefs.find(b => b.id === briefId);
    if (!brief || !brief.responses || !brief.responses.length) return;
    _compareResponses = brief.responses;
    renderCompareTable('prix');
    wrap.style.display = 'flex';
  }).catch(() => {});
};

window.renderCompareTable = function(sortBy) {
  const wrap = document.getElementById('compare-table-wrap');
  if (!wrap || !_compareResponses.length) return;
  const sorted = [..._compareResponses].sort((a, b) => {
    if (sortBy === 'prix') return (a.prix || Infinity) - (b.prix || Infinity);
    if (sortBy === 'note') return (b.note || 0) - (a.note || 0);
    if (sortBy === 'delai') {
      // parse delai as number of days if possible
      const da = parseInt(a.delai || '9999'), db = parseInt(b.delai || '9999');
      return da - db;
    }
    return 0;
  });
  const best = sorted[0];
  wrap.innerHTML = '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">'
    + '<thead><tr style="background:var(--clay-pp);text-align:left">'
    + '<th style="padding:.6rem .8rem">Professionnel</th>'
    + '<th style="padding:.6rem .6rem">Prix</th>'
    + '<th style="padding:.6rem .6rem">Délai</th>'
    + '<th style="padding:.6rem .6rem">Note</th>'
    + '<th style="padding:.6rem .6rem">Message</th>'
    + '<th style="padding:.6rem .6rem">Contact</th>'
    + '</tr></thead><tbody>'
    + sorted.map((r, i) => {
      const isBest = r === best;
      const rowBg = isBest ? 'background:#f0fdf4' : (i%2===0?'background:white':'background:var(--sand)');
      return '<tr style="border-bottom:.5px solid var(--border);' + rowBg + '">'
        + '<td style="padding:.6rem .8rem;font-weight:600">' + esc(r.prenom) + ' ' + esc(r.nom) + (isBest ? ' <span style="font-size:9px;font-weight:700;background:#bbf7d0;color:#166534;padding:1px 6px;border-radius:100px">Meilleur</span>' : '') + '</td>'
        + '<td style="padding:.6rem .6rem;font-weight:600;color:var(--clay)">' + (r.prix ? r.prix.toLocaleString('fr-FR') + ' DH' : '—') + '</td>'
        + '<td style="padding:.6rem .6rem">' + esc(r.delai || '—') + '</td>'
        + '<td style="padding:.6rem .6rem">' + (r.note ? '★'.repeat(Math.round(r.note)) + ' ' + r.note : '—') + '</td>'
        + '<td style="padding:.6rem .6rem;font-size:12px;color:var(--muted);max-width:200px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(r.message || '—') + '</td>'
        + '<td style="padding:.6rem .6rem">' + (r.tel ? '<a href="https://wa.me/' + r.tel.replace(/\D/g,'') + '" target="_blank" style="font-size:11px;color:#25D366;font-weight:600;text-decoration:none">💬 WA</a>' : '—') + '</td>'
        + '</tr>';
    }).join('')
    + '</tbody></table></div>';
};

window.showAddBriefForm = function() {
  const el = document.getElementById('add-brief-form');
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
};

window.submitBrief = async function() {
  const titre = document.getElementById('bf-titre').value.trim();
  const desc = document.getElementById('bf-desc').value.trim();
  const ville = document.getElementById('bf-ville').value.trim();
  const cat = document.getElementById('bf-cat').value;
  const budMin = parseInt(document.getElementById('bf-bud-min').value)||0;
  const budMax = parseInt(document.getElementById('bf-bud-max').value)||0;
  const deadline = document.getElementById('bf-deadline').value;
  if (!titre) { toast('Titre requis', 'error'); return; }
  const btn = document.getElementById('brief-submit-btn');
  btn.disabled = true; btn.textContent = 'Publication…';
  try {
    await API.createBrief({titre,description:desc,ville,categorie:cat,budget_min:budMin,budget_max:budMax,deadline});
    toast('Demande publiée !', 'success');
    document.getElementById('add-brief-form').style.display = 'none';
    await loadMyBriefs();
  } catch(e) { toast(e.message, 'error'); }
  finally { btn.disabled=false; btn.textContent='Publier'; }
};

window.openRespondBrief = function(briefId, titre) {
  const el = document.getElementById('respond-brief-modal');
  if (!el) return;
  el.dataset.briefId = briefId;
  document.getElementById('respond-brief-titre').textContent = titre;
  document.getElementById('resp-msg').value='';
  document.getElementById('resp-prix').value='';
  document.getElementById('resp-delai').value='';
  const rows = document.getElementById('resp-phase-rows');
  if (rows) rows.innerHTML = '';
  const cond = document.getElementById('resp-conditions');
  if (cond) cond.value = '';
  const att = document.getElementById('resp-attachment');
  if (att) att.value = '';
  el.style.display = 'flex';
};

window.addRespPhaseRow = function() {
  const rows = document.getElementById('resp-phase-rows');
  if (!rows) return;
  const idx = rows.children.length;
  const div = document.createElement('div');
  div.style.cssText = 'display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:.4rem;align-items:center';
  div.innerHTML = '<input type="text" placeholder="Fondations, Gros œuvre…" style="padding:5px 8px;border:.5px solid var(--border);border-radius:7px;font-size:12px;font-family:Outfit,sans-serif"/>'
    + '<input type="number" placeholder="DH" style="padding:5px 8px;border:.5px solid var(--border);border-radius:7px;font-size:12px;font-family:Outfit,sans-serif"/>'
    + '<input type="text" placeholder="Durée" style="padding:5px 8px;border:.5px solid var(--border);border-radius:7px;font-size:12px;font-family:Outfit,sans-serif"/>'
    + '<button type="button" onclick="this.parentElement.remove()" style="background:none;border:none;cursor:pointer;font-size:14px;color:var(--muted)">✕</button>';
  rows.appendChild(div);
};

window.closeRespondBriefModal = function() {
  const el = document.getElementById('respond-brief-modal');
  if (el) el.style.display = 'none';
};

window.submitBriefResponse = async function() {
  const el = document.getElementById('respond-brief-modal');
  const briefId = el.dataset.briefId;
  const message = document.getElementById('resp-msg').value.trim();
  const prix = parseInt(document.getElementById('resp-prix').value)||0;
  const delai = document.getElementById('resp-delai').value.trim();
  const conditions = (document.getElementById('resp-conditions')?.value || '').trim();
  // Collect phase rows (ARC-04)
  const phaseRows = document.getElementById('resp-phase-rows');
  const phases = phaseRows ? Array.from(phaseRows.children).map(row => {
    const inputs = row.querySelectorAll('input');
    return { label: inputs[0]?.value.trim(), prix: parseInt(inputs[1]?.value)||0, duree: inputs[2]?.value.trim() };
  }).filter(p => p.label) : [];
  if (!message) { toast('Message requis', 'error'); return; }
  const btn = document.getElementById('resp-submit-btn');
  btn.disabled=true; btn.textContent='Envoi…';
  try {
    // ARC-04: use FormData if file attached
    const fileInput = document.getElementById('resp-attachment');
    const file = fileInput && fileInput.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) { toast('Fichier trop volumineux (max 5 Mo)', 'error'); return; }
      const fd = new FormData();
      fd.append('message', message);
      fd.append('prix', String(prix));
      fd.append('delai', delai);
      fd.append('conditions', conditions);
      if (phases.length) fd.append('phases', JSON.stringify(phases));
      fd.append('attachment', file);
      await API.respondBriefForm(briefId, fd);
    } else {
      await API.respondBrief(briefId, { message, prix, delai, conditions, phases: phases.length ? phases : undefined });
    }
    toast('Réponse envoyée !', 'success');
    closeRespondBriefModal();
  } catch(e) { toast(e.message, 'error'); }
  finally { btn.disabled=false; btn.textContent='Envoyer'; }
};

window.closeBriefAction = async function(id) {
  if (!confirm('Clôturer cette demande ?')) return;
  try { await API.closeBrief(id); toast('Demande clôturée', 'success'); await loadMyBriefs(); }
  catch(e) { toast(e.message, 'error'); }
};

window.deleteBriefAction = async function(id) {
  if (!confirm('Supprimer cette demande ?')) return;
  try { await API.deleteBrief(id); toast('Demande supprimée', 'success'); await loadMyBriefs(); }
  catch(e) { toast(e.message, 'error'); }
};

// ── Referral Panel ──────────────────────────────────────────────────────────────
window.loadReferralPanel = async function() {
  if (!currentUser) return;
  // Sync founder badge
  if (typeof _syncFounderBadge === 'function') _syncFounderBadge(currentUser);
  // Update earned total
  const earnedEl = document.getElementById('referral-earned');
  const countEl2 = document.getElementById('referral-count');
  const codeEl = document.getElementById('referral-code-display');
  if (codeEl && currentUser.referral_code) codeEl.textContent = currentUser.referral_code;
  const linkEl = document.getElementById('referral-link-display');
  if (linkEl && currentUser.referral_code) {
    const url = window.location.origin + '/?ref=' + currentUser.referral_code;
    linkEl.textContent = url;
    linkEl.href = url;
  }
  try {
    const refs = await API.getReferrals();
    const listEl = document.getElementById('referral-list');
    if (!listEl) return;
    if (!refs.length) {
      listEl.innerHTML = '<div style="text-align:center;padding:1.5rem;color:var(--muted);font-size:13px">Aucun filleul pour l\'instant.<br><span style="font-size:12px;opacity:.7">Partagez votre code pour commencer !</span></div>';
      return;
    }
    listEl.innerHTML = refs.map(r=>`
      <div style="display:flex;justify-content:space-between;align-items:center;padding:.7rem 0;border-bottom:.5px solid var(--border)">
        <div>
          <div style="font-size:13px;font-weight:500">${escHtml(r.referred_email)}</div>
          <div style="font-size:11px;color:var(--muted)">${timeAgo(r.created_at)}</div>
        </div>
        <span style="font-size:10px;font-weight:700;padding:3px 10px;border-radius:100px;background:${r.status==='completed'?'#e8f5e9':'#fff3e0'};color:${r.status==='completed'?'#2e7d32':'#e65100'}">${r.status==='completed'?'✓ Inscrit':'En attente'}</span>
      </div>`).join('');
    const completed = refs.filter(r=>r.status==='completed').length;
    if (countEl2) countEl2.textContent = completed;
    if (earnedEl) earnedEl.textContent = (completed * 250).toLocaleString('fr-FR') + ' DH';
  } catch(e) {}
};

window.copyReferralCode = function() {
  const code = currentUser && currentUser.referral_code;
  if (!code) return;
  const url = window.location.origin + '/?ref=' + code;
  navigator.clipboard.writeText(url).then(()=>toast('Lien copié !','success')).catch(()=>toast('Copiez manuellement','error'));
};

window.shareWhatsApp = function() {
  const code = currentUser && currentUser.referral_code;
  if (!code) return;
  const url = window.location.origin + '/?ref=' + code;
  const msg = encodeURIComponent('Rejoins ShantiLink, la plateforme pour gérer ton chantier au Maroc ! ' + url);
  window.open('https://wa.me/?text=' + msg, '_blank');
};

// ── Reviews / Notes ────────────────────────────────────────────────────────────
window.openReviewModal = function(proId, proName) {
  const el = document.getElementById('review-modal');
  if (!el) return;
  el.dataset.proId = proId;
  document.getElementById('review-pro-name').textContent = proName;
  document.getElementById('review-rating').value = '5';
  document.getElementById('review-comment').value = '';
  el.style.display = 'flex';
  renderStarSelector('review-rating-stars', 5);
};

window.closeReviewModal = function() {
  const el = document.getElementById('review-modal');
  if (el) el.style.display = 'none';
};

window.submitReview = async function() {
  const el = document.getElementById('review-modal');
  const proId = parseInt(el.dataset.proId);
  const rating = parseInt(document.getElementById('review-rating').value)||5;
  const comment = document.getElementById('review-comment').value.trim();
  const btn = document.getElementById('review-submit-btn');
  btn.disabled=true; btn.textContent='Envoi…';
  try {
    await API.createReview({pro_catalog_id: proId, rating, comment});
    toast('Avis publié ! Merci.', 'success');
    closeReviewModal();
  } catch(e) { toast(e.message, 'error'); }
  finally { btn.disabled=false; btn.textContent='Publier mon avis'; }
};

function renderStarSelector(containerId, defaultVal) {
  const el = document.getElementById(containerId);
  if (!el) return;
  let val = defaultVal || 5;
  const render = () => {
    el.innerHTML = [1,2,3,4,5].map(i=>`<span onclick="setReviewStar(${i})" style="font-size:1.6rem;cursor:pointer;color:${i<=val?'#E8B84B':'#ddd'};transition:color .15s">★</span>`).join('');
  };
  window.setReviewStar = function(n) {
    val = n;
    document.getElementById('review-rating').value = n;
    render();
  };
  render();
}

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff/60000), h = Math.floor(m/60), d = Math.floor(h/24);
  if (d>30) return new Date(iso).toLocaleDateString('fr-FR');
  if (d>0) return `il y a ${d}j`;
  if (h>0) return `il y a ${h}h`;
  if (m>0) return `il y a ${m}min`;
  return 'à l\'instant';
}

function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
};

// ── ADMIN PANEL ───────────────────────────────────────────────────────────────
let _adminUsers = [];
let _adminSearch = '';

window.renderAdminPanel = async function() {
  const panel = document.getElementById('panel-admin');
  if (!panel) return;
  if (!currentUser || currentUser.role !== 'admin') {
    panel.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--red)">Acces refuse</div>';
    return;
  }
  panel.innerHTML = '<div style="padding:1.5rem;color:var(--muted);font-size:13px;text-align:center">Chargement...</div>';
  try {
    const [stats, users] = await Promise.all([
      API.get('/admin/stats'),
      API.get('/admin/users?limit=200'),
    ]);
    _adminUsers = users;
    _adminSearch = '';

    const roles = ['client','pro','promoteur','architecte','admin'];
    const roleColor = { admin:'#7C3AED', pro:'#1D4ED8', promoteur:'#0D9488', architecte:'#D97706', client:'#64748B' };
    const planBadge = p => p === 'pro' ? '<span style="background:#FEF3C7;color:#92400E;border-radius:100px;padding:1px 7px;font-size:9px;font-weight:700">PRO</span>'
      : p === 'business' ? '<span style="background:#EDE9FE;color:#6D28D9;border-radius:100px;padding:1px 7px;font-size:9px;font-weight:700">BIZ</span>'
      : '<span style="background:#F1F5F9;color:#64748B;border-radius:100px;padding:1px 7px;font-size:9px">Gratuit</span>';

    function renderUserRows(list) {
      if (!list.length) return '<tr><td colspan="8" style="text-align:center;padding:1.5rem;color:var(--muted);font-size:12px">Aucun utilisateur</td></tr>';
      return list.map(u => {
        const rc = roleColor[u.role] || '#64748B';
        const initials = (u.prenom||'?')[0].toUpperCase() + (u.nom ? u.nom[0].toUpperCase() : '');
        const dep = u.total_expenses ? Math.round(u.total_expenses).toLocaleString('fr-FR') + ' DH' : '0 DH';
        return '<tr id="arow-'+u.id+'">'
          + '<td style="padding:.6rem .8rem">'
            + '<div style="display:flex;align-items:center;gap:.6rem">'
            + '<div style="width:32px;height:32px;border-radius:50%;background:'+rc+';display:flex;align-items:center;justify-content:center;color:white;font-size:11px;font-weight:700;flex-shrink:0">'+esc(initials)+'</div>'
            + '<div><div style="font-weight:600;font-size:12px">'+esc(u.prenom)+' '+esc(u.nom||'')+'</div>'
            + '<div style="font-size:10px;color:var(--muted)">'+esc(u.email)+'</div></div>'
            + '</div>'
          + '</td>'
          + '<td style="padding:.4rem .6rem">'+planBadge(u.plan||'starter')+'</td>'
          + '<td style="padding:.4rem .6rem">'
            + '<select onchange="adminSetRole(\''+u.id+'\',this.value)" style="font-size:11px;padding:3px 8px;border:.5px solid var(--border);border-radius:6px;background:white;color:'+rc+';font-weight:600">'
            + roles.map(r=>'<option value="'+r+'" style="color:'+(roleColor[r]||'#64748B')+'"'+(u.role===r?' selected':'')+'>'+r+'</option>').join('')
            + '</select>'
          + '</td>'
          + '<td style="padding:.4rem .6rem;font-size:11px;color:var(--muted)">'+esc(u.ville||'—')+'</td>'
          + '<td style="padding:.4rem .6rem;text-align:center"><span style="background:var(--clay-pp);border-radius:100px;padding:2px 8px;font-size:11px;font-weight:600">'+(u.nb_projects||0)+'</span></td>'
          + '<td style="padding:.4rem .6rem;font-size:11px;color:var(--ink);font-weight:500">'+dep+'</td>'
          + '<td style="padding:.4rem .6rem;font-size:10px;color:var(--muted)">'+(u.created_at?u.created_at.slice(0,10):'—')+'</td>'
          + '<td style="padding:.4rem .6rem;text-align:center">'
            + '<button onclick="adminDeleteUser(\''+u.id+'\')" title="Supprimer" style="width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;background:var(--red-b);color:var(--red);border:none;border-radius:50%;cursor:pointer;font-size:14px;line-height:1">x</button>'
          + '</td>'
          + '</tr>';
      }).join('');
    }

    window._adminRenderRows = function() {
      const q = _adminSearch.toLowerCase();
      const filtered = q ? _adminUsers.filter(u =>
        (u.prenom+' '+u.nom+' '+u.email+' '+u.ville+' '+u.role).toLowerCase().includes(q)
      ) : _adminUsers;
      const tbody = document.getElementById('admin-users-tbody');
      if (tbody) tbody.innerHTML = renderUserRows(filtered);
      const countEl = document.getElementById('admin-user-count');
      if (countEl) countEl.textContent = filtered.length + ' / ' + _adminUsers.length + ' utilisateurs';
    };

    const nByRole = {};
    users.forEach(u => { nByRole[u.role] = (nByRole[u.role]||0)+1; });

    panel.innerHTML =
      // Header
      '<div class="dh"><div>'
      + '<div class="dh-title">Administration ShantiLink</div>'
      + '<div class="dh-sub">Vue plateforme — acces admin uniquement</div>'
      + '</div>'
      + '<button onclick="renderAdminPanel()" style="font-size:11px;padding:6px 14px;background:var(--clay-pp);border:.5px solid var(--border);border-radius:100px;cursor:pointer;font-family:Outfit,sans-serif;color:var(--ink)">Actualiser</button>'
      + '</div>'

      // KPI row
      + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:.8rem;margin-bottom:1.5rem">'
      + _adminKpi('Utilisateurs', stats.total_users, '+'+stats.new_users_today+' auj.', '#1D4ED8', '#EFF6FF')
      + _adminKpi('Projets', stats.total_projects, 'sur la plateforme', '#0D9488', '#F0FDFA')
      + _adminKpi('Depenses totales', Math.round(stats.total_expenses).toLocaleString('fr-FR')+' DH', 'toutes categories', '#D97706', '#FEF3C7')
      + _adminKpi('Posts communaute', stats.total_posts, 'publications', '#7C3AED', '#EDE9FE')
      + '</div>'

      // Role breakdown
      + '<div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:1.2rem">'
      + Object.entries(nByRole).sort((a,b)=>b[1]-a[1]).map(([r,n])=>
          '<span style="background:'+(roleColor[r]||'#64748B')+'22;color:'+(roleColor[r]||'#64748B')+';border-radius:100px;padding:3px 10px;font-size:11px;font-weight:600">'+r+' ('+n+')</span>'
        ).join('')
      + '</div>'

      // Search bar
      + '<div style="display:flex;gap:.6rem;align-items:center;margin-bottom:.8rem">'
      + '<input id="admin-search-input" type="text" placeholder="Rechercher par nom, email, ville, role..." oninput="_adminSearch=this.value;_adminRenderRows()" style="flex:1;padding:.5rem .9rem;border:.5px solid var(--border);border-radius:100px;font-family:Outfit,sans-serif;font-size:12px;outline:none"/>'
      + '<span id="admin-user-count" style="font-size:11px;color:var(--muted);white-space:nowrap">'+users.length+' / '+users.length+' utilisateurs</span>'
      + '</div>'

      // Table
      + '<div class="dcard" style="padding:0;overflow:hidden">'
      + '<div style="overflow-x:auto">'
      + '<table style="width:100%;border-collapse:collapse;font-size:12px">'
      + '<thead><tr style="background:var(--clay-pp);border-bottom:.5px solid var(--border)">'
      + '<th style="padding:.6rem .8rem;text-align:left;font-size:10px;font-weight:700;color:var(--muted);letter-spacing:.05em;text-transform:uppercase">Utilisateur</th>'
      + '<th style="padding:.6rem .6rem;text-align:left;font-size:10px;font-weight:700;color:var(--muted);letter-spacing:.05em;text-transform:uppercase">Plan</th>'
      + '<th style="padding:.6rem .6rem;text-align:left;font-size:10px;font-weight:700;color:var(--muted);letter-spacing:.05em;text-transform:uppercase">Role</th>'
      + '<th style="padding:.6rem .6rem;text-align:left;font-size:10px;font-weight:700;color:var(--muted);letter-spacing:.05em;text-transform:uppercase">Ville</th>'
      + '<th style="padding:.6rem .6rem;text-align:center;font-size:10px;font-weight:700;color:var(--muted);letter-spacing:.05em;text-transform:uppercase">Projets</th>'
      + '<th style="padding:.6rem .6rem;text-align:left;font-size:10px;font-weight:700;color:var(--muted);letter-spacing:.05em;text-transform:uppercase">Depenses</th>'
      + '<th style="padding:.6rem .6rem;text-align:left;font-size:10px;font-weight:700;color:var(--muted);letter-spacing:.05em;text-transform:uppercase">Inscription</th>'
      + '<th style="padding:.6rem .6rem"></th>'
      + '</tr></thead>'
      + '<tbody id="admin-users-tbody">' + renderUserRows(users) + '</tbody>'
      + '</table>'
      + '</div></div>'

      // ARC-02: Section certification OA
      + '<div class="dcard" style="margin-top:1.5rem">'
      + '<div class="dcard-tit">&#x1F3DB; Certification Ordre des Architectes (OA)</div>'
      + '<div style="font-size:12px;color:var(--muted);margin:.4rem 0 .8rem">Certifier ou révoquer le badge OA d\'un utilisateur architecte.</div>'
      + '<div style="display:flex;gap:.6rem;flex-wrap:wrap;align-items:flex-end">'
      + '<div style="display:flex;flex-direction:column;gap:.3rem;flex:1;min-width:180px">'
      + '<label style="font-size:11px;font-weight:600;color:var(--muted)">ID Utilisateur</label>'
      + '<input id="arc-user-id-input" type="text" placeholder="ID utilisateur (uid_...)" style="padding:.45rem .8rem;border:.5px solid var(--border);border-radius:8px;font-family:Outfit,sans-serif;font-size:12px"/>'
      + '</div>'
      + '<button onclick="adminCertifyOA(\'verify\')" style="padding:.45rem 1.1rem;background:#4338CA;color:white;border:none;border-radius:100px;font-family:Outfit,sans-serif;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap">&#x2713; Certifier OA</button>'
      + '<button onclick="adminCertifyOA(\'revoke\')" style="padding:.45rem 1.1rem;background:var(--red-b);color:var(--red);border:.5px solid rgba(139,31,31,.2);border-radius:100px;font-family:Outfit,sans-serif;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap">&#x2715; Révoquer</button>'
      + '</div></div>';

  } catch(e) {
    panel.innerHTML = '<div style="padding:2rem;color:var(--red);text-align:center">Erreur : '+e.message+'</div>';
  }
};

function _adminKpi(label, value, note, color, bg) {
  return '<div style="background:'+bg+';border-radius:12px;padding:1rem;border:.5px solid '+color+'22">'
    + '<div style="font-size:9px;font-weight:700;color:'+color+';text-transform:uppercase;letter-spacing:.06em;margin-bottom:.3rem">'+label+'</div>'
    + '<div style="font-size:1.3rem;font-weight:800;color:'+color+'">'+value+'</div>'
    + (note?'<div style="font-size:10px;color:'+color+'99;margin-top:.2rem">'+note+'</div>':'')
    + '</div>';
}

window.adminSetRole = async function(uid, role) {
  try {
    await API.put('/admin/users/'+uid+'/role', {role});
    const u = _adminUsers.find(x => x.id === uid);
    if (u) u.role = role;
    toast('Role mis a jour : ' + role, 'success');
  } catch(e) { toast(e.message,'error'); }
};

window.adminDeleteUser = async function(uid) {
  const u = _adminUsers.find(x => x.id === uid);
  if (!confirm('Supprimer ' + (u ? u.prenom + ' ' + (u.nom||'') + ' (' + u.email + ')' : 'cet utilisateur') + ' definitivement ?')) return;
  try {
    await API.del('/admin/users/'+uid);
    _adminUsers = _adminUsers.filter(x => x.id !== uid);
    if (typeof _adminRenderRows === 'function') _adminRenderRows();
    toast('Utilisateur supprime', 'success');
  } catch(e) { toast(e.message,'error'); }
};

window.adminCertifyOA = async function(action) {
  const uid = (document.getElementById('arc-user-id-input')||{}).value||'';
  if (!uid.trim()) { toast('ID utilisateur requis', 'error'); return; }
  try {
    await API.verifyArchitect({ user_id: uid.trim(), action });
    toast(action === 'verify' ? 'Badge OA certifié !' : 'Badge OA révoqué', 'success');
  } catch(e) { toast(e.message, 'error'); }
};

// ── PROJECT EDITING ───────────────────────────────────────────────────────────
window.openEditProject = function(pid) {
  const p = DB.projects.find(x => x.id === pid);
  if (!p) return;
  const modal = document.getElementById('edit-project-modal');
  if (!modal) return;
  document.getElementById('edit-proj-id').value = p.id;
  document.getElementById('edit-proj-nom').value = p.nom || '';
  document.getElementById('edit-proj-ville').value = p.ville || '';
  document.getElementById('edit-proj-budget').value = p.budget || '';
  document.getElementById('edit-proj-type').value = p.type || 'Villa / Maison individuelle';
  document.getElementById('edit-proj-desc').value = p.description || '';
  modal.style.display = 'flex';
};

window.closeEditProject = function() {
  const modal = document.getElementById('edit-project-modal');
  if (modal) modal.style.display = 'none';
};

window.saveEditProject = async function() {
  const id     = document.getElementById('edit-proj-id').value;
  const nom    = document.getElementById('edit-proj-nom').value.trim();
  const ville  = document.getElementById('edit-proj-ville').value.trim();
  const budget = parseInt(document.getElementById('edit-proj-budget').value) || 0;
  const type   = document.getElementById('edit-proj-type').value;
  const description = document.getElementById('edit-proj-desc').value.trim();
  if (!nom || !ville) { toast('Nom et ville requis.', 'error'); return; }
  const btn = document.getElementById('edit-proj-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Sauvegarde…'; }
  try {
    const updated = await API.updateProject(id, { nom, ville, budget, type, description });
    const idx = DB.projects.findIndex(x => x.id === id);
    if (idx !== -1) DB.projects[idx] = { ...DB.projects[idx], ...updated };
    closeEditProject();
    renderProjets();
    renderOverview();
    toast('Projet mis à jour !', 'success');
  } catch (e) { toast(e.message, 'error'); }
  finally { if (btn) { btn.disabled = false; btn.textContent = 'Enregistrer'; } }
};

// ── ONBOARDING GUIDE ─────────────────────────────────────────────────────────
const ONBOARDING_GUIDES = {
  overview: [
    { target: '#kpi-proj',       title: '🏗️ Vos projets', text: 'Créez votre premier projet pour démarrer le suivi.' },
    { target: '#ov-activite',    title: '⚡ Activité',     text: 'Retrouvez ici toutes vos actions récentes.' },
    { target: '#chart-proj-progress', title: '📊 Avancement', text: 'Ce graphique montre l\'avancement de chaque projet.' },
  ],
  depenses: [
    { target: '#btn-photo-scan', title: '📸 Scanner un reçu', text: 'Photographiez votre reçu — l\'IA extrait automatiquement le montant et la catégorie.' },
    { target: '#btn-voice',      title: '🎙️ Saisie vocale',  text: 'Dites « 3500 DH pour le béton » et le formulaire se remplit.' },
    { target: '#chart-dep-cat',  title: '📊 Graphique catégories', text: 'Cliquez une tranche pour filtrer vos dépenses par catégorie.' },
  ],
  projets: [
    { target: '.proj-card',      title: '🏗️ Carte projet', text: 'Glissez le curseur pour mettre à jour l\'avancement. Cliquez ✏️ pour modifier.' },
  ],
  planning: [
    { target: '#plan-save-bar',  title: '💾 Sauvegarde',   text: 'N\'oubliez pas de sauvegarder après toute modification du planning.' },
  ],
};

const _onboardingShown = new Set(
  JSON.parse(localStorage.getItem('sl_onboarding_done') || '[]')
);

window.maybeShowOnboarding = function(panel) {
  if (_onboardingShown.has(panel)) return;
  const steps = ONBOARDING_GUIDES[panel];
  if (!steps || !steps.length) return;
  setTimeout(() => _runOnboarding(panel, steps, 0), 600);
};

function _runOnboarding(panel, steps, idx) {
  if (idx >= steps.length) {
    _onboardingShown.add(panel);
    const done = JSON.parse(localStorage.getItem('sl_onboarding_done') || '[]');
    done.push(panel);
    localStorage.setItem('sl_onboarding_done', JSON.stringify(done));
    return;
  }
  const step = steps[idx];
  const target = document.querySelector(step.target);
  const tip = document.createElement('div');
  tip.id = 'onboarding-tip';
  tip.style.cssText = 'position:fixed;z-index:2000;background:var(--ink,#0F1D36);color:white;border-radius:12px;padding:.9rem 1.1rem;max-width:260px;font-size:13px;font-family:Outfit,sans-serif;box-shadow:0 8px 32px rgba(0,0,0,.35);pointer-events:all';
  tip.innerHTML = '<div style="font-weight:700;margin-bottom:.3rem">' + step.title + '</div>'
    + '<div style="font-size:12px;opacity:.85;line-height:1.5">' + step.text + '</div>'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:.8rem">'
    + '<span style="font-size:10px;opacity:.5">' + (idx+1) + ' / ' + steps.length + '</span>'
    + '<button id="onboarding-next-btn" style="font-size:12px;font-weight:600;padding:5px 14px;border-radius:100px;border:none;background:var(--gold,#E8B84B);color:var(--ink,#0F1D36);cursor:pointer;font-family:Outfit,sans-serif">' + (idx+1 < steps.length ? 'Suivant →' : 'Compris ✓') + '</button>'
    + '</div>';
  document.body.appendChild(tip);
  if (target) {
    const rect = target.getBoundingClientRect();
    const tipTop  = Math.min(rect.bottom + 10, window.innerHeight - 180);
    const tipLeft = Math.min(Math.max(rect.left, 8), window.innerWidth - 280);
    tip.style.top  = tipTop + 'px';
    tip.style.left = tipLeft + 'px';
    target.style.outline = '2px solid var(--gold,#E8B84B)';
    target.style.outlineOffset = '3px';
    target.style.transition = 'outline .2s';
  } else {
    tip.style.bottom = '90px';
    tip.style.right  = '20px';
  }
  document.getElementById('onboarding-next-btn').onclick = function() {
    tip.remove();
    if (target) { target.style.outline = ''; target.style.outlineOffset = ''; }
    _runOnboarding(panel, steps, idx + 1);
  };
}

// ── PRO-01: Formulaire profil entreprise ──────────────────────────────────────
window.renderCompanyProfile = function() {
  const container = document.getElementById('company-profile-section');
  if (!container) return;
  if (!currentUser) return;
  const proRoles = ['pro', 'architecte', 'promoteur'];
  if (!proRoles.includes(currentUser.role)) {
    container.style.display = 'none';
    return;
  }
  container.style.display = 'block';
  const u = currentUser;
  container.innerHTML =
    '<div class="form-section" style="margin-top:1.5rem">'
    + '<div class="form-title">Profil Entreprise</div>'
    + '<div class="fg-row">'
    + '<div class="fg"><label>ICE</label><input type="text" id="cp-ice" value="' + esc(u.ice||'') + '" placeholder="ICE (15 chiffres)"/></div>'
    + '<div class="fg"><label>CNSS</label><input type="text" id="cp-cnss" value="' + esc(u.cnss||'') + '" placeholder="Numéro CNSS"/></div>'
    + '</div>'
    + '<div class="fg-row">'
    + '<div class="fg"><label>RC (Registre du Commerce)</label><input type="text" id="cp-rc" value="' + esc(u.rc||'') + '" placeholder="Numéro RC"/></div>'
    + '<div class="fg"><label>RIB bancaire</label><input type="text" id="cp-rib" value="' + esc(u.rib||'') + '" placeholder="RIB (24 chiffres)"/></div>'
    + '</div>'
    + '<div class="fg"><label>Raison sociale</label><input type="text" id="cp-company-name" value="' + esc(u.company_name||'') + '" placeholder="Nom de votre société"/></div>'
    + '<div class="fg"><label>Adresse entreprise</label><input type="text" id="cp-company-address" value="' + esc(u.company_address||'') + '" placeholder="Adresse complète"/></div>'
    + '<button class="submit-btn" onclick="saveCompanyProfile()">Enregistrer le profil entreprise</button>'
    + '</div>';
};

window.saveCompanyProfile = async function() {
  const fields = {
    ice: (document.getElementById('cp-ice')||{}).value||'',
    cnss: (document.getElementById('cp-cnss')||{}).value||'',
    rc: (document.getElementById('cp-rc')||{}).value||'',
    rib: (document.getElementById('cp-rib')||{}).value||'',
    company_name: (document.getElementById('cp-company-name')||{}).value||'',
    company_address: (document.getElementById('cp-company-address')||{}).value||'',
  };
  try {
    await API.updateCompany(fields);
    currentUser = { ...currentUser, ...fields };
    localStorage.setItem('sl_user', JSON.stringify(currentUser));
    toast('Profil entreprise enregistré !', 'success');
  } catch(e) { toast(e.message, 'error'); }
};

// ── CLT-02: UI Vérification MRE ───────────────────────────────────────────────
window.renderMRESection = function() {
  const container = document.getElementById('mre-verification-section');
  if (!container) return;
  if (!currentUser) return;
  const u = currentUser;
  if (u.mre_verified) {
    container.innerHTML = '<div class="form-section" style="margin-top:1.5rem"><div class="form-title">Statut MRE</div>'
      + '<div style="display:flex;align-items:center;gap:.8rem;padding:1rem;background:var(--green-b);border-radius:12px">'
      + '<div style="font-size:1.5rem">&#x2705;</div>'
      + '<div><div style="font-weight:600;color:var(--green)">MRE Vérifié</div>'
      + '<div style="font-size:12px;color:var(--green)">Résidence : ' + esc(u.mre_country||'') + '</div></div>'
      + '</div></div>';
    return;
  }
  container.innerHTML = '<div class="form-section" style="margin-top:1.5rem"><div class="form-title">Vérification MRE</div>'
    + '<div class="fg"><label>Pays de résidence</label>'
    + '<select id="mre-country">'
    + ['France','Espagne','Italie','Belgique','Pays-Bas','Allemagne','Canada','USA','UK','Suisse','Autres']
      .map(c => '<option value="' + c + '"' + (u.mre_country===c?' selected':'') + '>' + c + '</option>').join('')
    + '</select></div>'
    + '<div class="fg"><label>Numéro de document d\'identité</label><input type="text" id="mre-doc-num" placeholder="Passeport / CIN / Titre de séjour" value="' + esc(u.mre_document||'') + '"/></div>'
    + '<button class="submit-btn" onclick="submitMRE()">Soumettre pour vérification</button>'
    + '</div>';
};

window.submitMRE = async function() {
  const country = (document.getElementById('mre-country')||{}).value||'';
  const doc = (document.getElementById('mre-doc-num')||{}).value||'';
  if (!country) { toast('Sélectionnez votre pays de résidence', 'error'); return; }
  try {
    await API.submitMRE({ country, document_type: doc });
    currentUser = { ...currentUser, mre_country: country, mre_document: doc };
    localStorage.setItem('sl_user', JSON.stringify(currentUser));
    toast('Demande de vérification MRE envoyée. Traitement sous 48h.', 'success');
    renderMRESection();
  } catch(e) { toast(e.message, 'error'); }
};

// ── CLT-03: Partage projet ─────────────────────────────────────────────────────
window.shareProject = async function(pid) {
  try {
    const res = await API.shareProject(pid);
    const shareUrl = window.location.origin + '/shared/' + res.share_token;
    await navigator.clipboard.writeText(shareUrl);
    toast('Lien copié !', 'success');
  } catch(e) {
    toast(e.message || 'Erreur partage', 'error');
  }
};

// ── ARC-02: Badge OA dans la liste des professionnels ─────────────────────────
// renderProsList is extended below to show arc_badge
// Store reference to original so we can wrap it
const _origRenderProsList = typeof renderProsList === 'function' ? renderProsList : null;

// ── FNC-01: Notifications in-app ──────────────────────────────────────────────
let _notifTimer = null;
let _notifUnread = 0;

window.initNotifications = function() {
  if (!currentUser) return;
  loadNotifications();
  if (_notifTimer) clearInterval(_notifTimer);
  _notifTimer = setInterval(loadNotifications, 30000);
};

async function loadNotifications() {
  if (!currentUser) return;
  try {
    const notifs = await API.getNotifications();
    _notifUnread = notifs.filter(n => !n.read).length;
    updateNotifBadge(_notifUnread);
    renderNotifDropdown(notifs);
  } catch(e) {}
}

function updateNotifBadge(count) {
  const badge = document.getElementById('notif-badge');
  if (!badge) return;
  badge.textContent = count > 0 ? (count > 99 ? '99+' : count) : '';
  badge.style.display = count > 0 ? 'flex' : 'none';
}

function renderNotifDropdown(notifs) {
  const list = document.getElementById('notif-list');
  if (!list) return;
  if (!notifs || !notifs.length) {
    list.innerHTML = '<div style="padding:1.5rem;text-align:center;font-size:13px;color:var(--muted)">Aucune notification</div>';
    return;
  }
  list.innerHTML = notifs.slice(0,15).map(n => {
    const timeAgo = _timeAgo(n.created_at);
    return '<div class="notif-item' + (n.read ? '' : ' notif-unread') + '" onclick="clickNotif(' + n.id + ',\'' + esc(n.link||'') + '\')" style="padding:.7rem 1rem;border-bottom:.5px solid var(--border);cursor:pointer;background:' + (n.read ? 'transparent' : 'var(--clay-pp)') + '">'
      + '<div style="font-size:12px;font-weight:' + (n.read ? '400' : '600') + ';color:var(--ink)">' + esc(n.title) + '</div>'
      + (n.body ? '<div style="font-size:11px;color:var(--muted);margin-top:2px">' + esc(n.body) + '</div>' : '')
      + '<div style="font-size:10px;color:var(--muted);margin-top:3px">' + timeAgo + '</div>'
      + '</div>';
  }).join('');
}

function _timeAgo(isoStr) {
  if (!isoStr) return '';
  const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000);
  if (diff < 60) return 'à l\'instant';
  if (diff < 3600) return Math.floor(diff/60) + ' min';
  if (diff < 86400) return Math.floor(diff/3600) + 'h';
  return Math.floor(diff/86400) + 'j';
}

window.clickNotif = async function(nid, link) {
  try { await API.markNotifRead(nid); } catch(e) {}
  const dropdown = document.getElementById('notif-dropdown');
  if (dropdown) dropdown.style.display = 'none';
  loadNotifications();
  if (link) {
    const panel = link.replace('#panel-', '');
    if (panel && panel !== link) showDashPanel(panel, null);
  }
};

window.toggleNotifDropdown = function() {
  const dd = document.getElementById('notif-dropdown');
  if (!dd) return;
  const isOpen = dd.style.display === 'block';
  dd.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) loadNotifications();
};

window.markAllNotifsRead = async function() {
  try {
    await API.markAllNotifsRead();
    loadNotifications();
    toast('Toutes les notifications marquées lues', 'success');
  } catch(e) {}
};

// ── FNC-02: Panel Documents par projet ────────────────────────────────────────
window.openDocumentsPanel = async function(pid, projectName) {
  const overlay = document.getElementById('docs-modal-overlay');
  if (!overlay) {
    // Create modal dynamically
    const m = document.createElement('div');
    m.id = 'docs-modal-overlay';
    m.style.cssText = 'position:fixed;inset:0;background:rgba(15,29,54,.5);z-index:9000;display:flex;align-items:center;justify-content:center;padding:1rem';
    m.innerHTML = '<div id="docs-modal" style="background:var(--white);border-radius:20px;width:min(600px,100%);max-height:80vh;overflow:hidden;display:flex;flex-direction:column">'
      + '<div style="padding:1.2rem 1.5rem;border-bottom:.5px solid var(--border);display:flex;justify-content:space-between;align-items:center">'
      + '<div style="font-size:15px;font-weight:700" id="docs-modal-title">Documents</div>'
      + '<button onclick="document.getElementById(\'docs-modal-overlay\').style.display=\'none\'" style="background:none;border:none;font-size:1.2rem;cursor:pointer;color:var(--muted)">&#x2715;</button>'
      + '</div>'
      + '<div style="padding:1rem 1.5rem;border-bottom:.5px solid var(--border)">'
      + '<div style="display:flex;gap:.6rem;align-items:center;flex-wrap:wrap">'
      + '<select id="doc-category-sel" style="font-size:12px;padding:.4rem .7rem;border:.5px solid var(--border);border-radius:8px;font-family:Outfit,sans-serif">'
      + '<option value="other">Autre</option><option value="permis">Permis de construire</option>'
      + '<option value="plan_masse">Plan masse</option><option value="etude_impact">Étude d\'impact</option>'
      + '<option value="contrat">Contrat</option><option value="photo">Photo chantier</option>'
      + '<option value="devis">Devis/Facture</option>'
      + '</select>'
      + '<label style="display:inline-flex;align-items:center;gap:.4rem;font-size:12px;font-weight:600;padding:.4rem 1rem;background:var(--clay);color:white;border-radius:100px;cursor:pointer">'
      + '&#x2b06; Uploader<input type="file" id="doc-file-input" style="display:none" onchange="uploadDocumentFile(\'' + pid + '\')">'
      + '</label>'
      + '</div>'
      + '</div>'
      + '<div id="docs-list" style="overflow-y:auto;padding:1rem 1.5rem;flex:1"></div>'
      + '</div>';
    document.body.appendChild(m);
  } else {
    overlay.style.display = 'flex';
    const inp = document.getElementById('doc-file-input');
    if (inp) inp.setAttribute('onchange', 'uploadDocumentFile(\'' + pid + '\')');
  }
  document.getElementById('docs-modal-overlay').style.display = 'flex';
  const titleEl = document.getElementById('docs-modal-title');
  if (titleEl) titleEl.textContent = 'Documents — ' + (projectName || pid);
  await refreshDocsList(pid);
};

async function refreshDocsList(pid) {
  const list = document.getElementById('docs-list');
  if (!list) return;
  list.innerHTML = '<div style="text-align:center;padding:1rem;color:var(--muted);font-size:12px">Chargement...</div>';
  try {
    const docs = await API.getDocuments(pid);
    if (!docs.length) {
      list.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--muted);font-size:13px">Aucun document. Uploadez le premier.</div>';
      return;
    }
    const catIcon = { permis:'📋', plan_masse:'🗺️', etude_impact:'📊', contrat:'📄', photo:'📷', devis:'💰', other:'📁' };
    list.innerHTML = docs.map(d => {
      const icon = catIcon[d.category] || '📁';
      return '<div style="display:flex;align-items:center;gap:.8rem;padding:.7rem 0;border-bottom:.5px solid var(--border)">'
        + '<div style="font-size:1.5rem;flex-shrink:0">' + icon + '</div>'
        + '<div style="flex:1;min-width:0">'
        + '<div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(d.filename) + '</div>'
        + '<div style="font-size:10px;color:var(--muted)">' + esc(d.category) + ' · ' + (d.created_at||'').slice(0,10) + '</div>'
        + '</div>'
        + '<div style="display:flex;gap:.4rem;flex-shrink:0">'
        + '<a href="' + esc(d.url) + '" target="_blank" style="font-size:11px;padding:4px 10px;background:var(--blue-b);color:var(--blue);border-radius:100px;text-decoration:none;font-weight:600">&#x21e9; Voir</a>'
        + '<button onclick="deleteDocumentFile(' + d.id + ',\'' + pid + '\')" style="font-size:11px;padding:4px 10px;background:var(--red-b);color:var(--red);border:.5px solid rgba(139,31,31,.2);border-radius:100px;cursor:pointer;font-family:Outfit,sans-serif;font-weight:600">&#x2715;</button>'
        + '</div>'
        + '</div>';
    }).join('');
  } catch(e) {
    list.innerHTML = '<div style="color:var(--red);text-align:center;padding:1rem;font-size:12px">' + esc(e.message) + '</div>';
  }
}

window.uploadDocumentFile = async function(pid) {
  const input = document.getElementById('doc-file-input');
  const catSel = document.getElementById('doc-category-sel');
  if (!input || !input.files[0]) return;
  const fd = new FormData();
  fd.append('file', input.files[0]);
  fd.append('category', catSel ? catSel.value : 'other');
  try {
    await API.uploadDocument(pid, fd);
    toast('Document uploadé !', 'success');
    input.value = '';
    await refreshDocsList(pid);
  } catch(e) { toast(e.message, 'error'); }
};

window.deleteDocumentFile = async function(did, pid) {
  if (!confirm('Supprimer ce document ?')) return;
  try {
    await API.deleteDocument(did);
    toast('Document supprimé', 'success');
    await refreshDocsList(pid);
  } catch(e) { toast(e.message, 'error'); }
};

// ── PRM-01: Panel équipe promoteur ────────────────────────────────────────────
window.renderTeamPanel = async function() {
  const panel = document.getElementById('panel-team');
  if (!panel) return;
  if (!currentUser || currentUser.role !== 'promoteur') {
    panel.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--muted)">Réservé aux promoteurs</div>';
    return;
  }
  panel.innerHTML = '<div style="padding:1.5rem;color:var(--muted);font-size:13px;text-align:center">Chargement...</div>';
  try {
    const team = await API.getTeam();
    panel.innerHTML =
      '<div class="dh"><div><div class="dh-title">Mon équipe</div><div class="dh-sub">Gérez les accès à vos projets</div></div></div>'
      + '<div class="dcard" style="margin-bottom:1.2rem">'
      + '<div class="dcard-tit">Inviter un membre</div>'
      + '<div style="display:flex;gap:.6rem;flex-wrap:wrap;margin-top:.8rem">'
      + '<input id="team-email-input" type="email" placeholder="email@example.com" style="flex:1;min-width:180px;padding:.5rem .8rem;border:.5px solid var(--border);border-radius:8px;font-family:Outfit,sans-serif;font-size:13px"/>'
      + '<select id="team-role-sel" style="padding:.5rem .8rem;border:.5px solid var(--border);border-radius:8px;font-family:Outfit,sans-serif;font-size:13px">'
      + '<option value="viewer">Lecteur</option><option value="editor">Éditeur</option></select>'
      + '<button onclick="inviteTeamMember()" style="padding:.5rem 1.2rem;background:var(--clay);color:white;border:none;border-radius:100px;font-family:Outfit,sans-serif;font-size:13px;font-weight:600;cursor:pointer">Inviter</button>'
      + '</div></div>'
      + '<div class="dcard">'
      + '<div class="dcard-tit">Membres (' + team.length + ')</div>'
      + (team.length ? team.map(m =>
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:.6rem 0;border-bottom:.5px solid var(--border)">'
        + '<div><div style="font-size:13px;font-weight:600">' + esc(m.member_email) + '</div>'
        + '<div style="font-size:11px;color:var(--muted)">' + esc(m.role) + ' · invité le ' + (m.invited_at||'').slice(0,10) + '</div></div>'
        + '<button onclick="removeTeamMember(' + m.id + ')" style="font-size:11px;padding:4px 10px;background:var(--red-b);color:var(--red);border:.5px solid rgba(139,31,31,.2);border-radius:100px;cursor:pointer;font-family:Outfit,sans-serif">Retirer</button>'
        + '</div>'
      ).join('') : '<div style="text-align:center;padding:1.5rem;color:var(--muted);font-size:13px">Aucun membre. Invitez votre équipe.</div>')
      + '</div>';
  } catch(e) {
    panel.innerHTML = '<div style="padding:2rem;color:var(--red);text-align:center">' + esc(e.message) + '</div>';
  }
};

window.inviteTeamMember = async function() {
  const email = (document.getElementById('team-email-input')||{}).value||'';
  const role = (document.getElementById('team-role-sel')||{}).value||'viewer';
  if (!email) { toast('Email requis', 'error'); return; }
  try {
    await API.inviteTeam({ member_email: email, role });
    toast('Invitation envoyée à ' + email, 'success');
    renderTeamPanel();
  } catch(e) { toast(e.message, 'error'); }
};

window.removeTeamMember = async function(tid) {
  if (!confirm('Retirer ce membre ?')) return;
  try {
    await API.removeTeamMember(tid);
    toast('Membre retiré', 'success');
    renderTeamPanel();
  } catch(e) { toast(e.message, 'error'); }
};

// ── PRM-02: Programmes ────────────────────────────────────────────────────────
let _programmes = [];

window.loadProgrammes = async function() {
  if (!currentUser || currentUser.role !== 'promoteur') return;
  try {
    _programmes = await API.getProgrammes();
    renderProgrammeDropdown();
  } catch(e) {}
};

function renderProgrammeDropdown() {
  const sel = document.getElementById('proj-programme-sel');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Aucun programme —</option>'
    + _programmes.map(p => '<option value="' + p.id + '">' + esc(p.name) + '</option>').join('');
}

window.renderProgrammesPanel = async function() {
  const panel = document.getElementById('panel-programmes');
  if (!panel) return;
  if (!currentUser || currentUser.role !== 'promoteur') {
    panel.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--muted)">Réservé aux promoteurs</div>';
    return;
  }
  try {
    _programmes = await API.getProgrammes();
    panel.innerHTML =
      '<div class="dh"><div><div class="dh-title">Programmes</div><div class="dh-sub">Regroupez vos projets par programme immobilier</div></div></div>'
      + '<div class="dcard" style="margin-bottom:1.2rem">'
      + '<div class="dcard-tit">Nouveau programme</div>'
      + '<div style="display:flex;gap:.6rem;flex-direction:column;margin-top:.8rem">'
      + '<input id="prog-name-input" type="text" placeholder="Nom du programme" style="padding:.5rem .8rem;border:.5px solid var(--border);border-radius:8px;font-family:Outfit,sans-serif;font-size:13px"/>'
      + '<input id="prog-desc-input" type="text" placeholder="Description (optionnel)" style="padding:.5rem .8rem;border:.5px solid var(--border);border-radius:8px;font-family:Outfit,sans-serif;font-size:13px"/>'
      + '<button onclick="createProgramme()" style="padding:.5rem 1.2rem;background:var(--clay);color:white;border:none;border-radius:100px;font-family:Outfit,sans-serif;font-size:13px;font-weight:600;cursor:pointer;align-self:flex-start">Créer</button>'
      + '</div></div>'
      + '<div class="dcard">'
      + '<div class="dcard-tit">Programmes (' + _programmes.length + ')</div>'
      + (_programmes.length ? _programmes.map(p => {
        const projCount = DB.projects.filter(proj => String(proj.programme_id) === String(p.id)).length;
        return '<div style="display:flex;align-items:center;justify-content:space-between;padding:.7rem 0;border-bottom:.5px solid var(--border)">'
          + '<div><div style="font-size:13px;font-weight:600">' + esc(p.name) + '</div>'
          + '<div style="font-size:11px;color:var(--muted)">' + projCount + ' projet(s) · ' + (p.description ? esc(p.description) : '') + '</div></div>'
          + '<div style="display:flex;gap:.4rem">'
          + '<button onclick="deleteProgramme(' + p.id + ')" style="font-size:11px;padding:4px 10px;background:var(--red-b);color:var(--red);border:.5px solid rgba(139,31,31,.2);border-radius:100px;cursor:pointer;font-family:Outfit,sans-serif">Supprimer</button>'
          + '</div></div>';
      }).join('') : '<div style="text-align:center;padding:1.5rem;color:var(--muted);font-size:13px">Aucun programme.</div>')
      + '</div>';
  } catch(e) {
    panel.innerHTML = '<div style="padding:2rem;color:var(--red);text-align:center">' + esc(e.message) + '</div>';
  }
};

window.createProgramme = async function() {
  const name = (document.getElementById('prog-name-input')||{}).value||'';
  const desc = (document.getElementById('prog-desc-input')||{}).value||'';
  if (!name.trim()) { toast('Nom requis', 'error'); return; }
  try {
    await API.createProgramme({ name: name.trim(), description: desc });
    toast('Programme créé !', 'success');
    renderProgrammesPanel();
  } catch(e) { toast(e.message, 'error'); }
};

window.deleteProgramme = async function(pid) {
  if (!confirm('Supprimer ce programme ?')) return;
  try {
    await API.deleteProgramme(pid);
    toast('Programme supprimé', 'success');
    renderProgrammesPanel();
  } catch(e) { toast(e.message, 'error'); }
};

// ── PRM-04: Dashboard ROI promoteur ───────────────────────────────────────────
window.renderROIPanel = async function() {
  const panel = document.getElementById('panel-roi');
  if (!panel) return;
  if (!currentUser || currentUser.role !== 'promoteur') {
    panel.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--muted)">Réservé aux promoteurs</div>';
    return;
  }
  panel.innerHTML = '<div style="padding:1.5rem;color:var(--muted);font-size:13px;text-align:center">Chargement...</div>';
  try {
    const roi = await API.getPromoterROI();
    const ratio = roi.roi_ratio || 0;
    const ratioColor = ratio >= 80 ? 'var(--green)' : ratio >= 50 ? 'var(--amber)' : 'var(--red)';
    panel.innerHTML =
      '<div class="dh"><div><div class="dh-title">Dashboard ROI</div><div class="dh-sub">Vue financière de vos programmes immobiliers</div></div></div>'
      // KPIs
      + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:.8rem;margin-bottom:1.5rem">'
      + _roiKpi('Projets', roi.nb_projects, '#1D4ED8', '#EFF6FF')
      + _roiKpi('Budget total', fmt(roi.total_budget), '#0D9488', '#F0FDFA')
      + _roiKpi('Dépenses', fmt(roi.total_expenses), roi.total_expenses > roi.total_budget ? '#DC2626' : '#D97706', roi.total_expenses > roi.total_budget ? '#FEF2F2' : '#FEF3C7')
      + _roiKpi('Économies', fmt(roi.total_budget - roi.total_expenses), ratio >= 0 ? '#059669' : '#DC2626', ratio >= 0 ? '#ECFDF5' : '#FEF2F2')
      + _roiKpi('Briefs actifs', roi.nb_active_briefs, '#7C3AED', '#EDE9FE')
      + '</div>'
      // Budget vs Dépenses bar
      + '<div class="dcard">'
      + '<div class="dcard-tit">Budget vs Dépenses</div>'
      + '<div style="margin-top:.8rem">'
      + (roi.total_budget > 0 ? '<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:.3rem"><span>Consommation budget</span><span style="font-weight:700;color:' + ratioColor + '">' + (100-ratio).toFixed(1) + '%</span></div>'
        + '<div style="height:12px;background:var(--sand);border-radius:6px;overflow:hidden"><div style="height:100%;width:' + Math.min(100, 100-ratio) + '%;background:' + ratioColor + ';border-radius:6px;transition:width .5s"></div></div>'
        + '<div style="display:flex;justify-content:space-between;font-size:10px;color:var(--muted);margin-top:.3rem"><span>' + fmt(roi.total_expenses) + ' dépensés</span><span>/ ' + fmt(roi.total_budget) + ' budget</span></div>'
        : '<div style="text-align:center;padding:1rem;color:var(--muted);font-size:13px">Aucun projet avec budget</div>')
      + '</div>'
      // Project breakdown
      + '<div style="margin-top:1.2rem">'
      + DB.projects.filter(p => p.budget > 0).map(p => {
        const pExp = (DB.expenses||[]).filter(e => e.project_id === p.id && !e.deleted).reduce((s,e) => s+(e.montant||0), 0);
        const pct = Math.min(100, Math.round(pExp / p.budget * 100));
        const col = pct > 100 ? 'var(--red)' : pct > 75 ? 'var(--amber)' : 'var(--green)';
        return '<div style="margin-bottom:.8rem">'
          + '<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:.3rem"><span style="font-weight:600">' + esc(p.nom) + '</span><span style="color:' + col + ';font-weight:700">' + fmt(pExp) + ' / ' + fmt(p.budget) + '</span></div>'
          + '<div style="height:8px;background:var(--sand);border-radius:4px;overflow:hidden"><div style="height:100%;width:' + pct + '%;background:' + col + ';border-radius:4px"></div></div>'
          + '</div>';
      }).join('')
      + '</div></div>';
  } catch(e) {
    panel.innerHTML = '<div style="padding:2rem;color:var(--red);text-align:center">' + esc(e.message) + '</div>';
  }
};

function _roiKpi(label, value, color, bg) {
  return '<div style="background:' + bg + ';border-radius:12px;padding:1rem;border:.5px solid ' + color + '22">'
    + '<div style="font-size:9px;font-weight:700;color:' + color + ';text-transform:uppercase;letter-spacing:.06em;margin-bottom:.3rem">' + label + '</div>'
    + '<div style="font-size:1.2rem;font-weight:800;color:' + color + '">' + value + '</div>'
    + '</div>';
}

// ── ARC-02: badge dans la liste des pros ──────────────────────────────────────
// Patch renderProsList to add arc_badge display
const _origRenderProsListFn = window.renderProsList;
if (typeof renderProsList === 'function') {
  // We'll inject arc_badge in the pros list rendering via patching
  // The actual injection happens inside renderProsList by checking d.arc_badge
}

// ── Hook: init notifications when dashboard loads ─────────────────────────────
const _origLoadDashboard = window.loadDashboard;
window.loadDashboard = async function() {
  if (_origLoadDashboard) await _origLoadDashboard.call(this);
  initNotifications();
  if (currentUser && (currentUser.role === 'promoteur')) {
    loadProgrammes();
  }
};

