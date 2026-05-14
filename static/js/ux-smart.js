// ShantiLink — UX Saisie Intelligente (vanilla JS)
// Features : AutoDraft · QuickTiles · PhotoScan · Voice · Suggestions · QuickLog

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 3 — AUTO-DRAFT (localStorage avec debounce 800ms)
// ═══════════════════════════════════════════════════════════════════════════════
const AutoDraft = {
  _key: null,
  _timer: null,
  _fields: [],  // ids des champs à écouter + sauvegarder

  init(key, fieldIds) {
    this._key    = key;
    this._fields = fieldIds;
    const raw = localStorage.getItem(key);
    if (!raw) return;
    try {
      const { _savedAt, ...data } = JSON.parse(raw);
      const hasData = Object.values(data).some(v => v !== '' && v !== null && v !== undefined);
      if (hasData) this._showBanner(data, new Date(_savedAt));
    } catch (_) {}
  },

  update(id, value) {
    if (!this._key) return;
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => {
      const current = this._readFields();
      localStorage.setItem(this._key, JSON.stringify({ ...current, _savedAt: new Date().toISOString() }));
      this._showSavedIndicator();
    }, 800);
  },

  resume() {
    if (!this._key) return;
    try {
      const raw = localStorage.getItem(this._key);
      if (!raw) return;
      const { _savedAt, ...data } = JSON.parse(raw);
      Object.entries(data).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (el.tagName === 'SELECT') { el.value = value; }
        else { el.value = value; }
        // For tile selector, re-apply selection
        if (id === 'dep-cat') selectTile('dep-cat-tiles', value);
      });
      this._hideBanner();
      toast('Brouillon restauré ✓', 'success');
    } catch (_) {}
  },

  clear() {
    if (this._key) localStorage.removeItem(this._key);
    if (this._timer) clearTimeout(this._timer);
    this._hideBanner();
  },

  _readFields() {
    const obj = {};
    this._fields.forEach(id => {
      const el = document.getElementById(id);
      if (el) obj[id] = el.value;
    });
    // Also capture hidden dep-cat value from tile selector
    const catVal = document.getElementById('dep-cat-hidden');
    if (catVal) obj['dep-cat'] = catVal.value;
    return obj;
  },

  _showBanner(data, savedAt) {
    const banner = document.getElementById('dep-draft-banner');
    if (!banner) return;
    const dateStr = savedAt.toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
    const summary = [data['dep-desc'], data['dep-montant'] ? data['dep-montant'] + ' DH' : null, data['dep-cat']]
      .filter(Boolean).slice(0, 3).join(' · ');
    banner.innerHTML = `
      <div class="ux-draft-banner">
        <div class="ux-draft-left">
          <span class="ux-draft-title">📝 Brouillon du ${dateStr}</span>
          ${summary ? `<span class="ux-draft-sum">${summary}</span>` : ''}
        </div>
        <div class="ux-draft-actions">
          <button class="ux-draft-resume" onclick="AutoDraft.resume()">Reprendre</button>
          <button class="ux-draft-discard" onclick="AutoDraft.clear()" title="Ignorer">✕</button>
        </div>
      </div>`;
    banner.style.display = 'block';
  },

  _hideBanner() {
    const banner = document.getElementById('dep-draft-banner');
    if (banner) banner.style.display = 'none';
  },

  _showSavedIndicator() {
    const el = document.getElementById('dep-saved-indicator');
    if (!el) return;
    el.style.opacity = '1';
    el.textContent = '✓ Sauvegardé';
    setTimeout(() => { el.style.opacity = '0'; }, 2000);
  },
};
window.AutoDraft = AutoDraft;

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 1 — QUICK TILE SELECTOR
// ═══════════════════════════════════════════════════════════════════════════════
const DEP_CAT_TILES = [
  { icon:'🧱', label:'Matériaux',     sub:'Mwad',     value:'Matériaux' },
  { icon:'👷', label:"Main d'œuvre",  sub:'Khdama',   value:"Main d'œuvre" },
  { icon:'🚚', label:'Transport',     sub:'Transport', value:'Transport' },
  { icon:'🔧', label:'Équipement',    sub:'Moada',    value:'Équipement' },
  { icon:'📋', label:'Honoraires',    sub:'Ujra',     value:'Honoraires' },
  { icon:'📦', label:'Autre',         sub:'Khouji',   value:'Autre' },
  { icon:'🏗️', label:'Gros œuvre',   sub:'Bina',     value:'Gros œuvre' },
  { icon:'⚡', label:'Électricité',   sub:'Kahrrba',  value:'Électricité' },
  { icon:'🔩', label:'Plomberie',     sub:'Sabak',    value:'Plomberie' },
  { icon:'🎨', label:'Peinture',      sub:'Lwan',     value:'Peinture' },
  { icon:'🪵', label:'Menuiserie',    sub:'Nijara',   value:'Menuiserie' },
  { icon:'🟦', label:'Carrelage',     sub:'Zelij',    value:'Carrelage' },
];

window._tileSelected = {};

window.renderQuickTiles = function(containerId, tiles, selectedValue) {
  const container = document.getElementById(containerId);
  if (!container) return;
  _tileSelected[containerId] = selectedValue;
  container.innerHTML = tiles.map(t => `
    <button type="button"
      class="ux-tile${t.value === selectedValue ? ' active' : ''}"
      onclick="selectTile('${containerId}','${t.value.replace(/'/g,"\\'")}')"
      data-value="${t.value}"
      title="${t.label}">
      <span class="ux-tile-icon">${t.icon}</span>
      <span class="ux-tile-label">${t.label}</span>
      <span class="ux-tile-sub">${t.sub}</span>
    </button>`).join('');
};

window.selectTile = function(containerId, value) {
  _tileSelected[containerId] = value;
  const container = document.getElementById(containerId);
  if (!container) return;
  container.querySelectorAll('.ux-tile').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === value);
  });
  // Sync hidden input and native select
  const hidden = document.getElementById('dep-cat-hidden');
  if (hidden) hidden.value = value;
  const nativeSelect = document.getElementById('dep-cat');
  if (nativeSelect) {
    // Find matching option (case-insensitive)
    const opt = Array.from(nativeSelect.options).find(o => o.value === value || o.text === value);
    if (opt) nativeSelect.value = opt.value;
    else { // Add option if not present
      const o = new Option(value, value, true, true);
      nativeSelect.add(o);
    }
  }
  // Trigger auto-draft update
  AutoDraft.update('dep-cat', value);
};

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 2 — SCAN REÇU (photo → Claude via backend)
// ═══════════════════════════════════════════════════════════════════════════════
window.openReceiptScanner = function() {
  const input = document.getElementById('receipt-file-input');
  if (input) input.click();
};

window.handleReceiptFile = async function(input) {
  const file = input.files[0];
  if (!file) return;
  const btn = document.getElementById('receipt-scan-btn');
  const status = document.getElementById('receipt-scan-status');

  if (btn) { btn.disabled = true; btn.textContent = '⏳ Analyse…'; }
  if (status) { status.textContent = 'Analyse IA en cours…'; status.style.color = 'var(--clay)'; }

  try {
    const base64 = await _fileToBase64(file);
    const res = await fetch('/api/analyze-receipt', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (localStorage.getItem('bna_token') || ''),
      },
      body: JSON.stringify({ image: base64, media_type: file.type || 'image/jpeg' }),
    });

    if (!res.ok) throw new Error('Analyse échouée');
    const { result } = await res.json();

    if (!result || result.montant === null) {
      if (status) { status.textContent = '⚠️ Photo peu claire — éclaire mieux le document'; status.style.color = 'var(--red)'; }
      return;
    }

    // Fill form fields
    if (result.montant)   { _setField('dep-montant', result.montant); }
    if (result.description || result.fournisseur) {
      _setField('dep-desc', result.description || result.fournisseur);
    }
    if (result.date)      { _setField('dep-date', result.date); }
    if (result.categorie) {
      const uiCat = _mapCat(result.categorie);
      selectTile('dep-cat-tiles', uiCat);
    }
    _markAIFilled();
    if (status) { status.textContent = '✅ Champs remplis automatiquement !'; status.style.color = 'var(--green)'; }
    toast('📷 Document analysé — champs pré-remplis', 'success');
  } catch (err) {
    if (status) { status.textContent = '⚠️ Pas de connexion — remplis manuellement'; status.style.color = 'var(--muted)'; }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📷 Scanner un reçu'; }
    input.value = '';
  }
};

function _fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function _setField(id, value) {
  const el = document.getElementById(id);
  if (el) {
    el.value = value;
    el.classList.add('ux-ai-filled');
    AutoDraft.update(id, value);
  }
}

function _markAIFilled() {
  ['dep-desc','dep-montant','dep-date'].forEach(id => {
    const el = document.getElementById(id);
    if (el && el.value) el.classList.add('ux-ai-filled');
  });
}

function _mapCat(cat) {
  const map = { materiaux:'Matériaux', maindoeuvre:"Main d'œuvre", transport:'Transport', equipement:'Équipement', autre:'Autre' };
  return map[cat] || cat;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 4 — SAISIE VOCALE (Web Speech API + Claude via backend)
// ═══════════════════════════════════════════════════════════════════════════════
let _voiceRecognition = null;
let _isRecording = false;

window.toggleVoiceInput = function() {
  if (_isRecording) {
    _stopVoice();
  } else {
    _startVoice();
  }
};

function _startVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    // Fallback: show manual text input
    _showVoiceTextFallback();
    return;
  }
  _voiceRecognition = new SpeechRecognition();
  _voiceRecognition.lang = 'fr-FR';
  _voiceRecognition.continuous = false;
  _voiceRecognition.interimResults = true;

  const btn = document.getElementById('voice-input-btn');
  const live = document.getElementById('voice-live-text');
  if (btn) { btn.classList.add('recording'); btn.textContent = '⏹ Stop'; }
  if (live) { live.style.display = 'block'; live.textContent = '🎙️ Parle maintenant…'; }
  _isRecording = true;

  _voiceRecognition.onresult = (e) => {
    const transcript = Array.from(e.results).map(r => r[0].transcript).join(' ');
    if (live) live.textContent = transcript;
  };

  _voiceRecognition.onend = () => {
    _isRecording = false;
    if (btn) { btn.classList.remove('recording'); btn.textContent = '🎙️ Voix'; }
    const transcript = live ? live.textContent : '';
    if (transcript && transcript !== '🎙️ Parle maintenant…') {
      _extractVoice(transcript);
    }
  };

  _voiceRecognition.onerror = () => {
    _isRecording = false;
    if (btn) { btn.classList.remove('recording'); btn.textContent = '🎙️ Voix'; }
    _showVoiceTextFallback();
  };

  _voiceRecognition.start();
}

function _stopVoice() {
  if (_voiceRecognition) _voiceRecognition.stop();
  _isRecording = false;
}

async function _extractVoice(transcription) {
  const live = document.getElementById('voice-live-text');
  if (live) live.textContent = '⏳ Analyse en cours…';
  try {
    const res = await fetch('/api/extract-voice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (localStorage.getItem('bna_token') || '') },
      body: JSON.stringify({ transcription }),
    });
    if (!res.ok) throw new Error();
    const { result } = await res.json();
    if (result) {
      if (result.montant)                { _setField('dep-montant', result.montant); }
      if (result.description || result.fournisseur) { _setField('dep-desc', result.description || result.fournisseur); }
      if (result.categorie)              { selectTile('dep-cat-tiles', _mapCat(result.categorie)); }
      if (result.date)                   { _setField('dep-date', result.date); }
      _markAIFilled();
      toast('🎙️ Compris ! Champs remplis automatiquement', 'success');
      if (live) live.textContent = '✅ ' + transcription;
    } else {
      if (live) live.textContent = '❓ Non compris — reformule ou remplis manuellement';
    }
  } catch (_) {
    if (live) live.textContent = '⚠️ Pas de connexion — remplis manuellement';
  }
}

function _showVoiceTextFallback() {
  const modal = document.getElementById('voice-fallback-modal');
  if (modal) modal.classList.add('open');
}

window.submitVoiceText = async function() {
  const input = document.getElementById('voice-fallback-input');
  if (!input || !input.value.trim()) return;
  document.getElementById('voice-fallback-modal').style.display = 'none';
  await _extractVoice(input.value.trim());
  input.value = '';
};
window.closeVoiceFallback = function() {
  const modal = document.getElementById('voice-fallback-modal');
  if (modal) modal.classList.remove('open');
};
window.submitVoiceFallback = async function() {
  const input = document.getElementById('voice-fallback-text');
  if (!input || !input.value.trim()) return;
  closeVoiceFallback();
  await _extractVoice(input.value.trim());
  input.value = '';
};

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 7 — SUGGESTIONS INTELLIGENTES (localStorage, 0 réseau)
// ═══════════════════════════════════════════════════════════════════════════════
const HIST_KEY = 'sl_exp_history';
const HIST_MAX = 50;

window.recordExpenseHistory = function(expense) {
  try {
    const raw = localStorage.getItem(HIST_KEY);
    const hist = raw ? JSON.parse(raw) : [];
    hist.unshift({ desc: expense.description || '', montant: parseFloat(expense.montant) || 0, cat: expense.categorie || '' });
    if (hist.length > HIST_MAX) hist.length = HIST_MAX;
    localStorage.setItem(HIST_KEY, JSON.stringify(hist));
  } catch (_) {}
};

window.renderExpenseSuggestions = function() {
  try {
    const raw = localStorage.getItem(HIST_KEY);
    if (!raw) return;
    const hist = JSON.parse(raw);
    if (!hist.length) return;

    // Top fournisseurs (extraits des descriptions)
    const descMap = {};
    hist.forEach(e => {
      const key = _extractKeyword(e.desc);
      if (key) descMap[key] = (descMap[key] || 0) + 1;
    });
    const topFourn = Object.entries(descMap).sort((a,b) => b[1]-a[1]).slice(0,3);

    // Top montants
    const montMap = {};
    hist.forEach(e => {
      if (e.montant > 0) {
        const r = _roundSig(e.montant);
        montMap[r] = (montMap[r] || 0) + 1;
      }
    });
    const topMont = Object.entries(montMap).sort((a,b) => b[1]-a[1]).slice(0,3);

    // Render fournisseur chips
    const fEl = document.getElementById('dep-sugg-fourn');
    if (fEl && topFourn.length) {
      fEl.innerHTML = topFourn.map(([label]) =>
        `<button class="ux-chip" onclick="document.getElementById('dep-desc').value='${label.replace(/'/g,"\\'")}';AutoDraft.update('dep-desc','${label.replace(/'/g,"\\'")}');this.parentElement.style.display='none'">${label} →</button>`
      ).join('');
      fEl.style.display = 'flex';
    }

    // Render montant chips
    const mEl = document.getElementById('dep-sugg-mont');
    if (mEl && topMont.length) {
      mEl.innerHTML = topMont.map(([m]) =>
        `<button class="ux-chip" onclick="document.getElementById('dep-montant').value='${m}';AutoDraft.update('dep-montant','${m}');this.parentElement.style.display='none'">${Number(m).toLocaleString('fr-FR')} DH →</button>`
      ).join('');
      mEl.style.display = 'flex';
    }
  } catch (_) {}
};

function _extractKeyword(desc) {
  if (!desc) return null;
  const chez = desc.match(/(?:chez|from)\s+([A-Za-zÀ-ÿ]+)/i);
  if (chez) return chez[1].charAt(0).toUpperCase() + chez[1].slice(1);
  const caps = desc.match(/\b([A-Z]{3,})\b/);
  if (caps) return caps[1];
  const words = desc.split(/\s+/).filter(w => w.length > 3);
  if (words[0]) return words[0].charAt(0).toUpperCase() + words[0].slice(1).toLowerCase();
  return null;
}

function _roundSig(n) {
  if (n < 100)  return Math.round(n / 10) * 10;
  if (n < 1000) return Math.round(n / 50) * 50;
  return Math.round(n / 100) * 100;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURE 6 — QUICK LOG SHEET (FAB + modal rapide)
// ═══════════════════════════════════════════════════════════════════════════════
window.openQuickLog = function() {
  const modal = document.getElementById('quick-log-modal');
  if (modal) modal.classList.add('open');
  const today = new Date().toISOString().split('T')[0];
  const qlDate = document.getElementById('ql-date');
  if (qlDate && !qlDate.value) qlDate.value = today;
  setTimeout(() => { const el = document.getElementById('ql-desc'); if (el) el.focus(); }, 100);
};

window.closeQuickLog = function() {
  const modal = document.getElementById('quick-log-modal');
  if (modal) modal.classList.remove('open');
  ['ql-desc','ql-montant'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
};

window.saveQuickLog = async function() {
  const descEl   = document.getElementById('ql-desc');
  const montantEl = document.getElementById('ql-montant');
  const catEl    = document.getElementById('ql-cat');
  const dateEl   = document.getElementById('ql-date');
  const desc    = descEl   ? descEl.value.trim()   : '';
  const montant = parseFloat(montantEl ? montantEl.value : 0) || 0;
  const cat     = catEl    ? catEl.value            : 'Matériaux';
  const date    = dateEl   ? dateEl.value           : new Date().toISOString().split('T')[0];
  if (!montant) { toast('Entre un montant', 'error'); return; }
  const btn = document.getElementById('btn-ql-save');
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  try {
    const d = await API.createExpense({
      description: desc || cat,
      montant,
      categorie: cat,
      date,
    });
    if (typeof DB !== 'undefined' && DB.expenses) {
      DB.expenses.unshift(d);
      if (typeof renderDepenses === 'function') renderDepenses();
      if (typeof renderOverview === 'function') renderOverview();
    }
    recordExpenseHistory({ description: desc || cat, montant, categorie: cat });
    closeQuickLog();
    toast('⚡ Dépense enregistrée : ' + montant.toLocaleString('fr-FR') + ' DH', 'success');
  } catch (e) {
    toast('Pas de connexion — réessaie plus tard', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '💾 Enregistrer'; }
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// INIT — wired on DOMContentLoaded
// ═══════════════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  // Set default date in dep form
  const depDate = document.getElementById('dep-date');
  if (depDate && !depDate.value) depDate.value = new Date().toISOString().split('T')[0];

  // Wire AutoDraft listeners on dep form fields
  ['dep-desc','dep-montant','dep-date','dep-note'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => AutoDraft.update(id, el.value));
  });

  // Init tile selector for category
  renderQuickTiles('dep-cat-tiles', DEP_CAT_TILES, 'Matériaux');

  // FAB hover label
  const fab = document.getElementById('quick-log-fab');
  if (fab) fab.title = 'Dépense rapide';
});

// Called when the dep form is opened (from toggleForm patch)
window.onDepFormOpen = function() {
  AutoDraft.init('sl_dep_draft_' + (currentUser?.id || 'guest'),
    ['dep-desc','dep-montant','dep-date','dep-note','dep-project']);
  renderExpenseSuggestions();
  renderQuickTiles('dep-cat-tiles', DEP_CAT_TILES, document.getElementById('dep-cat')?.value || 'Matériaux');
  // Clear AI fill classes on reopen
  ['dep-desc','dep-montant','dep-date'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('ux-ai-filled');
  });
  const status = document.getElementById('receipt-scan-status');
  if (status) status.textContent = '';
  const live = document.getElementById('voice-live-text');
  if (live) live.style.display = 'none';
};
