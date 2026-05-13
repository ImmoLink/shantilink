// ShantiLink – Dashboard logic (all panels, CRUD, map, PDF)

let DB = { projects: [], expenses: [], photos: [], activities: [] };
let prosMap = null, prosMarkers = [], allPros = [], filteredPros = [];
let currentConv = null;
let convCache = {};
let _planPid = null;
let _planPhases = [];
let _ovCharts = {};
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
// ── Mobile sidebar drawer ─────────────────────────────────────────────────────
window.toggleMobileSidebar = function() {
  const sb = document.querySelector('.sidebar');
  const ov = document.getElementById('sidebar-overlay');
  if (!sb) return;
  const isOpen = sb.classList.contains('mob-open');
  sb.classList.toggle('mob-open', !isOpen);
  if (ov) ov.classList.toggle('open', !isOpen);
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
  try { sim = JSON.parse(localStorage.getItem('bna_sim')); } catch(e) {}
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
  try { sim = JSON.parse(localStorage.getItem('bna_sim')); } catch(e) {}
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
          + '<div style="flex:1;color:var(--ink)">' + a.msg + '</div>'
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
          + '<div style="font-size:13px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + p.nom + '</div>'
          + '<div style="font-size:10px;color:var(--muted);margin-bottom:.3rem">' + (p.type||'') + (p.ville ? ' — ' + p.ville : '') + ' — ' + fmt(p.budget||0) + '</div>'
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
        + '<button onclick="openPlanningPanel(\'' + p.id + '\')" style="margin:0;font-size:11px;font-weight:600;padding:5px 12px;background:var(--blue-b);color:var(--blue);border:.5px solid rgba(26,79,139,.2);border-radius:100px;cursor:pointer;font-family:Outfit,sans-serif">📋 ' + t('planning_title','Planning') + '</button>'
        + '<button onclick="delProjet(\'' + p.id + '\')" style="margin:0;font-size:11px;font-weight:500;padding:5px 12px;background:var(--red-b);color:var(--red);border:.5px solid rgba(139,31,31,.2);border-radius:100px;cursor:pointer;font-family:Outfit,sans-serif">' + t('delete_btn','Supprimer') + '</button>'
        + '</div>'
    : '';

  return '<div class="proj-card">'
    + '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:.5rem">'
    + '<div><div class="proj-name">' + p.nom + '</div><div class="proj-meta">' + p.type + ' — ' + p.ville + ' — Budget : ' + fmt(p.budget || 0) + '</div></div>'
    + badge + '</div>'
    + (p.description ? '<div style="font-size:12px;color:var(--muted);margin:.4rem 0">' + p.description + '</div>' : '')
    + '<div class="prog-bar"><div class="prog-fill" style="width:' + pct + '%;background:' + pctColor(pct) + '"></div></div>'
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

window.togglePhaseCustom = function(sel) {
  const custom = document.getElementById('photo-phase-custom');
  if (!custom) return;
  custom.style.display = sel.value === '__autre__' ? 'block' : 'none';
  if (sel.value !== '__autre__') custom.value = '';
};

window.toggleForm = function(id) {
  const f = document.getElementById(id);
  if (f) f.style.display = f.style.display === 'block' ? 'none' : 'block';
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
    await API.updatePct(pid, pct);
    p.pct = pct;
    renderOverview();
    const msg = pct >= 100 ? '🎉 ' + t('proj_finished_toast','Projet terminé !') : t('proj_progress','Avancement') + ' : ' + pct + '%';
    toast(msg, pct >= 100 ? 'success' : 'success');
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
    '<div style="margin-bottom:.8rem">'
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
  renderPlanningBox(pid, p, _planPhases);
  savePhases(pid, _planPhases, calcPlanningPct(_planPhases));
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
  const displayList = showAll
    ? DB.expenses  // full history including soft-deleted
    : activeExpenses();

  let total = 0, semaine = 0;
  const cats = {};
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

  if (displayList.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:2rem">' + t('dep_empty','Aucune dépense enregistrée') + '</td></tr>';
  } else {
    tbody.innerHTML = displayList.map(d => {
      const isDeleted = d.deleted;
      if (!isDeleted) {
        total += d.montant;
        if (d.date >= weekAgo) semaine += d.montant;
        cats[d.categorie] = (cats[d.categorie] || 0) + d.montant;
      }
      const proj = d.project_id ? DB.projects.find(p => p.id === d.project_id) : null;
      const projLabel = proj ? '<span style="font-size:9px;background:var(--clay-p);color:var(--clay);padding:2px 6px;border-radius:100px">' + proj.nom + '</span>' : '';
      const rowStyle = isDeleted ? 'opacity:.45;background:var(--sand-l)' : '';
      return '<tr style="' + rowStyle + '">'
        + '<td>' + d.description + (isDeleted ? ' <span style="font-size:9px;color:var(--red)">(supprimé)</span>' : '') + '</td>'
        + '<td>' + projLabel + '</td>'
        + '<td><span class="bdg bdg-warn">' + d.categorie + '</span></td>'
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
}

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
      + '<div style="font-size:12px;font-weight:600;margin-bottom:2px">' + p.description + '</div>'
      + '<div style="font-size:10px;color:var(--muted)">' + p.phase + ' — ' + (p.date || '') + '</div>'
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
          + '<button onclick="generatePDFForProject(' + JSON.stringify(p.id) + ')" style="font-size:10px;font-weight:600;padding:5px 12px;background:var(--clay);color:white;border:none;border-radius:100px;cursor:pointer;font-family:Outfit,sans-serif;white-space:nowrap;flex-shrink:0">⬇ PDF</button>'
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

window.generatePDFForProject = function(pid) {
  const p = DB.projects.find(x => x.id === pid);
  if (p) { window._rapProjFilter = pid; generatePDF(); }
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
  if (pros.length === 0) { list.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--muted)">Aucun professionnel pour ces critères.</div>'; return; }
  list.innerHTML = pros.map(p => {
    const stars = [1,2,3,4,5].map(i => i <= Math.floor(p.note) ? '★' : '☆').join('');
    const verified = p.verified ? '<span class="pro-verified">Vérifié ✓</span>' : '';
    return '<div class="pro-card"><div class="pro-av">' + p.emoji + '</div>'
      + '<div class="pro-info"><div class="pro-name">' + p.nom + '</div>'
      + '<div class="pro-role">' + (_prosRoleLabels[p.role] || p.role) + '</div>'
      + '<div class="pro-ville">📍 ' + p.ville + '</div>'
      + '<div class="pro-stars">' + stars + ' ' + p.note + '/5 (' + p.avis + ' avis)</div>'
      + '<div style="font-size:11px;color:var(--muted);margin-top:3px">' + (p.description || '').substring(0, 80) + '...</div>'
      + '<div style="font-size:11px;color:var(--clay);margin-top:3px">' + (p.tel || '') + '</div>'
      + '</div>' + verified
      + '<div style="display:flex;gap:.4rem;flex-wrap:wrap">'
      + '<button class="pro-contact-btn" onclick="openProModal(' + p.id + ')">Contacter</button>'
      + '<button onclick="openReviewModal(' + p.id + ',\'' + p.nom.replace(/'/g,"\\'") + '\')" style="font-size:11px;padding:6px 12px;border:.5px solid var(--border);background:white;border-radius:100px;cursor:pointer;font-family:Outfit,sans-serif;color:var(--muted)">⭐ Avis</button>'
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
      const name = (c.prenom || '') + ' ' + (c.nom || '');
      const unreadBadge = c.unread > 0
        ? '<span style="background:var(--clay);color:white;border-radius:100px;font-size:10px;padding:1px 6px;margin-left:auto">' + c.unread + '</span>'
        : '';
      return '<div class="msg-item" style="cursor:pointer;padding:.6rem .8rem;border-radius:10px;margin-bottom:.3rem;' + (c.unread > 0 ? 'background:#FFF7F5;' : '') + '" onclick="openConv(\'' + c.other_id + '\', \'' + name.trim() + '\')">'
        + '<div style="display:flex;align-items:center;gap:.4rem">'
        + '<div style="width:32px;height:32px;border-radius:50%;background:var(--ink);color:white;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0">' + (c.prenom || '?')[0].toUpperCase() + '</div>'
        + '<div style="min-width:0;flex:1">'
        + '<div style="font-size:13px;font-weight:600;display:flex;align-items:center">' + name.trim() + unreadBadge + '</div>'
        + '<div style="font-size:11px;color:var(--muted)">' + (c.role || '') + (c.ville ? ' · ' + c.ville : '') + '</div>'
        + (c.last_msg ? '<div style="font-size:11px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px">' + c.last_msg + '</div>' : '')
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
  const myId = (JSON.parse(localStorage.getItem('bna_user') || '{}')).id;
  el.innerHTML = msgs.map(m =>
    '<div class="msg-bubble ' + (m.sender_id === myId ? 'sent' : 'received') + '">' + escHtml(m.content) + '</div>'
  ).join('');
  el.scrollTop = el.scrollHeight;
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

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
      const myId = (JSON.parse(localStorage.getItem('bna_user') || '{}')).id;
      const filtered = users.filter(u => u.id !== myId);
      if (!filtered.length) { res.style.display = 'none'; return; }
      res.style.display = 'block';
      res.innerHTML = filtered.map(u =>
        '<div style="padding:.5rem .8rem;cursor:pointer;font-size:13px;border-bottom:.5px solid var(--border)" '
        + 'onmousedown="startChatWith(\'' + u.id + '\', \'' + escHtml((u.prenom||'') + ' ' + (u.nom||'')).trim() + '\')">'
        + '<strong>' + escHtml((u.prenom||'') + ' ' + (u.nom||'')) + '</strong>'
        + '<span style="color:var(--muted);font-size:11px;margin-left:.4rem">' + (u.role||'') + (u.ville ? ' · ' + u.ville : '') + '</span>'
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
}

window.saveProfile = async function() {
  const prenom = document.getElementById('edit-prenom').value.trim();
  const nom    = document.getElementById('edit-nom').value.trim();
  const ville  = document.getElementById('edit-ville').value.trim();
  const tel    = document.getElementById('edit-tel').value.trim();
  try {
    const updated = await API.updateProfile({ prenom, nom, ville, tel });
    currentUser = { ...currentUser, ...updated };
    localStorage.setItem('bna_user', JSON.stringify(currentUser));
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
    const W = 210;
    const u = currentUser || { prenom: 'Utilisateur', nom: '', email: 'user@ShantiLink.ma' };
    const week  = getWeek(new Date());
    const today = new Date().toLocaleDateString('fr-FR');

    // ── HEADER ────────────────────────────────────────────────────────────────
    doc.setFillColor(24, 24, 26);
    doc.rect(0, 0, W, 42, 'F');
    // Clay accent line
    doc.setFillColor(160, 82, 45);
    doc.rect(0, 39, W, 3, 'F');
    // Logo
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22); doc.setFont('helvetica', 'bold');
    doc.text('ShantiLink', 14, 20);
    // Tagline
    doc.setFontSize(8.5); doc.setFont('helvetica', 'normal');
    doc.setTextColor(180, 180, 180);
    doc.text('Plateforme de gestion de chantier au Maroc', 14, 29);
    // Report title (right-aligned)
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13); doc.setFont('helvetica', 'bold');
    doc.text('Rapport hebdomadaire', W - 14, 20, { align: 'right' });
    doc.setFontSize(8.5); doc.setFont('helvetica', 'normal');
    doc.setTextColor(180, 180, 180);
    doc.text('Semaine ' + week + '  ·  ' + today, W - 14, 29, { align: 'right' });

    // ── USER INFO BAND ────────────────────────────────────────────────────────
    let y = 52;
    doc.setFillColor(245, 237, 230);
    doc.roundedRect(12, y, W - 24, 20, 3, 3, 'F');
    doc.setFillColor(160, 82, 45);
    doc.roundedRect(12, y, 4, 20, 2, 2, 'F'); // left accent bar
    doc.setTextColor(24, 24, 26);
    doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.text(u.prenom + (u.nom ? ' ' + u.nom : ''), 22, y + 8);
    doc.setFontSize(8.5); doc.setFont('helvetica', 'normal');
    doc.setTextColor(112, 107, 101);
    doc.text(u.email, 22, y + 15);

    // ── KPI BOXES ─────────────────────────────────────────────────────────────
    y += 28;
    const avgPct = DB.projects.length
      ? Math.round(DB.projects.reduce((s, p) => s + (p.pct || 0), 0) / DB.projects.length)
      : 0;
    const totalBudget = DB.projects.reduce((s, p) => s + (p.budget || 0), 0);
    const totalDep    = activeExpenses().reduce((s, e) => s + (e.montant || 0), 0);
    const kpis = [
      { label: 'Projets',       value: String(DB.projects.length) },
      { label: 'Budget total',  value: pdfNum(totalBudget) + ' DH' },
      { label: 'Dépenses',      value: pdfNum(totalDep) + ' DH' },
      { label: 'Avancement moy.', value: avgPct + '%' },
    ];
    const bW = (W - 24 - 9) / 4; // 4 boxes, gap 3mm
    kpis.forEach((k, i) => {
      const bx = 12 + i * (bW + 3);
      doc.setFillColor(250, 246, 242);
      doc.roundedRect(bx, y, bW, 26, 2, 2, 'F');
      doc.setFillColor(160, 82, 45);
      doc.roundedRect(bx, y, bW, 2.5, 1, 1, 'F'); // top accent
      doc.setTextColor(160, 82, 45);
      doc.setFontSize(k.value.length > 10 ? 9 : 13); doc.setFont('helvetica', 'bold');
      doc.text(k.value, bx + bW / 2, y + 16, { align: 'center' });
      doc.setTextColor(140, 130, 120);
      doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
      doc.text(k.label, bx + bW / 2, y + 22, { align: 'center' });
    });

    // ── PROJECTS TABLE ────────────────────────────────────────────────────────
    y += 34;
    doc.setDrawColor(200, 190, 180);
    doc.setLineWidth(0.3);
    doc.setFillColor(250, 246, 242);
    doc.roundedRect(12, y - 1, W - 24, 8, 2, 2, 'F');
    doc.setTextColor(24, 24, 26);
    doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    doc.text('Projets en cours', 16, y + 5);
    y += 10;

    if (DB.projects.length > 0) {
      doc.autoTable({
        startY: y,
        head: [['Projet', 'Ville', 'Budget (DH)', 'Avancement']],
        body: DB.projects.map(p => [
          p.nom || '—',
          p.ville || '—',
          pdfNum(p.budget || 0),
          (p.pct || 0) + '%',
        ]),
        foot: [['', 'TOTAL', pdfNum(totalBudget), '']],
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: { top: 3.5, bottom: 3.5, left: 3, right: 3 }, textColor: [40, 36, 32] },
        headStyles: { fillColor: [160, 82, 45], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
        footStyles: { fillColor: [235, 220, 205], textColor: [80, 50, 20], fontStyle: 'bold', fontSize: 9 },
        alternateRowStyles: { fillColor: [251, 248, 245] },
        columnStyles: {
          0: { cellWidth: 80 },
          1: { cellWidth: 30 },
          2: { cellWidth: 52, halign: 'right' },
          3: { cellWidth: 24, halign: 'center' },
        },
        margin: { left: 12, right: 12 },
      });
      y = doc.lastAutoTable.finalY;
    } else {
      doc.setFontSize(9); doc.setFont('helvetica', 'italic'); doc.setTextColor(170, 160, 150);
      doc.text('Aucun projet enregistré.', 16, y + 6);
      y += 14;
    }

    // ── EXPENSES TABLE ────────────────────────────────────────────────────────
    y += 10;
    if (y > 220) { doc.addPage(); y = 18; }

    doc.setFillColor(250, 246, 242);
    doc.roundedRect(12, y - 1, W - 24, 8, 2, 2, 'F');
    doc.setTextColor(24, 24, 26);
    doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    doc.text('Dernieres depenses', 16, y + 5);
    y += 10;

    const pdfExpenses = activeExpenses().slice(0, 10);
    if (pdfExpenses.length > 0) {
      const depTotal = pdfExpenses.reduce((s, d) => s + (d.montant || 0), 0);
      doc.autoTable({
        startY: y,
        head: [['Description', 'Catégorie', 'Montant (DH)', 'Date']],
        body: pdfExpenses.map(d => [
          d.description || '—',
          d.categorie   || '—',
          pdfNum(d.montant || 0),
          d.date || '—',
        ]),
        foot: [['', 'TOTAL', pdfNum(depTotal), '']],
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: { top: 3.5, bottom: 3.5, left: 3, right: 3 }, textColor: [40, 36, 32] },
        headStyles: { fillColor: [160, 82, 45], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
        footStyles: { fillColor: [235, 220, 205], textColor: [80, 50, 20], fontStyle: 'bold', fontSize: 9 },
        alternateRowStyles: { fillColor: [251, 248, 245] },
        columnStyles: {
          0: { cellWidth: 80 },
          1: { cellWidth: 34 },
          2: { cellWidth: 50, halign: 'right' },
          3: { cellWidth: 22, halign: 'right' },
        },
        margin: { left: 12, right: 12 },
      });
    } else {
      doc.setFontSize(9); doc.setFont('helvetica', 'italic'); doc.setTextColor(170, 160, 150);
      doc.text('Aucune dépense enregistrée.', 16, y + 6);
    }

    // ── FOOTER (all pages) ────────────────────────────────────────────────────
    const pageCount = doc.internal.getNumberOfPages();
    for (let pg = 1; pg <= pageCount; pg++) {
      doc.setPage(pg);
      doc.setFillColor(24, 24, 26);
      doc.rect(0, 284, W, 13, 'F');
      doc.setFillColor(160, 82, 45);
      doc.rect(0, 284, W, 1.5, 'F'); // clay top line
      doc.setTextColor(160, 160, 160);
      doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
      doc.text('ShantiLink  ·  contact@ShantiLink.ma  ·  www.ShantiLink.ma', 14, 292);
      doc.text('Page ' + pg + ' / ' + pageCount, W - 14, 292, { align: 'right' });
    }

    doc.save('ShantiLink_Rapport_S' + week + '_' + today.replace(/\//g, '-') + '.pdf');
    toast('Rapport PDF généré !', 'success');
  } catch (e) {
    console.error(e);
    toast('Erreur génération PDF : ' + e.message, 'error');
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
  const saved = (() => { try { return JSON.parse(localStorage.getItem('bna_sim')) || {}; } catch(e) { return {}; } })();
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
  localStorage.setItem('bna_sim', JSON.stringify(simData));

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
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);margin-bottom:.5rem">Réponses reçues</div>
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
  el.style.display = 'flex';
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
  if (!message) { toast('Message requis', 'error'); return; }
  const btn = document.getElementById('resp-submit-btn');
  btn.disabled=true; btn.textContent='Envoi…';
  try {
    await API.respondBrief(briefId, {message, prix, delai});
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
