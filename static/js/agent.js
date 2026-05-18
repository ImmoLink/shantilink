// ShantiLink – AI Agent Widget (agent.js v1)
// Floating chat panel with streaming SSE, voice input, file upload, confirmation cards

(function () {
  'use strict';

  // ── State ────────────────────────────────────────────────────────────────
  var _ag = {
    open: false,
    history: [],        // [{role, content}]
    streaming: false,
    recording: false,
    recognition: null,
    pendingProposal: null,
    raf: null
  };

  // ── DOM helpers ──────────────────────────────────────────────────────────
  function _el(id) { return document.getElementById(id); }
  function _q(sel) { return document.querySelector(sel); }

  // ── Inject widget HTML ───────────────────────────────────────────────────
  function _injectWidget() {
    if (_el('ag-widget')) return;

    var html = [
      '<div id="ag-widget">',
      // FAB button
      '  <button id="ag-fab" onclick="agToggle()" title="Assistant IA ShantiLink">',
      '    <span id="ag-fab-icon">✨</span>',
      '    <span id="ag-fab-badge" style="display:none">!</span>',
      '  </button>',
      // Chat panel
      '  <div id="ag-panel" style="display:none">',
      '    <div id="ag-header">',
      '      <div id="ag-header-info">',
      '        <span id="ag-avatar">🤖</span>',
      '        <div>',
      '          <div id="ag-title">Assistant ShantiLink</div>',
      '          <div id="ag-status">Prêt à vous aider</div>',
      '        </div>',
      '      </div>',
      '      <div id="ag-header-actions">',
      '        <button class="ag-icon-btn" onclick="agClearHistory()" title="Effacer la conversation">🗑️</button>',
      '        <button class="ag-icon-btn" onclick="agToggle()" title="Fermer">✕</button>',
      '      </div>',
      '    </div>',
      '    <div id="ag-messages">',
      '      <div class="ag-msg ag-msg-bot">',
      '        <div class="ag-bubble">',
      '          Bonjour ! Je suis votre assistant IA ShantiLink. Je peux vous aider à gérer vos projets, dépenses et planning de construction. Que puis-je faire pour vous ?',
      '        </div>',
      '      </div>',
      '    </div>',
      '    <div id="ag-input-area">',
      '      <div id="ag-proposal-zone"></div>',
      '      <div id="ag-file-preview" style="display:none">',
      '        <span id="ag-file-name"></span>',
      '        <button onclick="agClearFile()">✕</button>',
      '      </div>',
      '      <div id="ag-input-row">',
      '        <button id="ag-voice-btn" class="ag-icon-btn" onclick="agToggleVoice()" title="Saisie vocale">🎙️</button>',
      '        <label id="ag-file-btn" class="ag-icon-btn" title="Joindre un fichier">',
      '          📎<input type="file" id="ag-file-input" accept=".pdf,.docx,.xlsx,.csv,.jpg,.jpeg,.png" style="display:none" onchange="agFileSelected(this)">',
      '        </label>',
      '        <textarea id="ag-textarea" placeholder="Posez votre question..." rows="1" onkeydown="agKeyDown(event)" oninput="agAutoResize(this)"></textarea>',
      '        <button id="ag-send-btn" onclick="agSend()" title="Envoyer">➤</button>',
      '      </div>',
      '      <div id="ag-rec-indicator" style="display:none">',
      '        <span class="ag-rec-dot"></span> Enregistrement en cours... <span id="ag-rec-timer">0s</span>',
      '        <button onclick="agStopVoice()">Arrêter</button>',
      '      </div>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('\n');

    var container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container.firstElementChild);
  }

  // ── Open / close ─────────────────────────────────────────────────────────
  window.agToggle = function () {
    var panel = _el('ag-panel');
    _ag.open = !_ag.open;
    panel.style.display = _ag.open ? 'flex' : 'none';
    if (_ag.open) {
      setTimeout(function () {
        var ta = _el('ag-textarea');
        if (ta) ta.focus();
        _scrollBottom();
      }, 80);
    }
  };

  window.agClearHistory = function () {
    _ag.history = [];
    var msgs = _el('ag-messages');
    if (msgs) msgs.innerHTML = '<div class="ag-msg ag-msg-bot"><div class="ag-bubble">Conversation effacée. Comment puis-je vous aider ?</div></div>';
    _el('ag-proposal-zone').innerHTML = '';
    _ag.pendingProposal = null;
  };

  // ── Send message ─────────────────────────────────────────────────────────
  window.agSend = function () {
    if (_ag.streaming) return;
    var ta = _el('ag-textarea');
    var text = (ta ? ta.value.trim() : '');
    var fileInput = _el('ag-file-input');
    var hasFile = fileInput && fileInput.files && fileInput.files.length > 0;

    if (!text && !hasFile) return;

    if (hasFile) {
      _sendWithFile(text, fileInput.files[0]);
      return;
    }

    if (!text) return;
    ta.value = '';
    agAutoResize(ta);
    _addMsg('user', text);
    _ag.history.push({ role: 'user', content: text });
    _streamChat();
  };

  window.agKeyDown = function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      agSend();
    }
  };

  window.agAutoResize = function (ta) {
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  };

  // ── File handling ─────────────────────────────────────────────────────────
  window.agFileSelected = function (input) {
    var f = input.files[0];
    if (!f) return;
    var preview = _el('ag-file-preview');
    _el('ag-file-name').textContent = f.name + ' (' + _fmtSize(f.size) + ')';
    preview.style.display = 'flex';
  };

  window.agClearFile = function () {
    _el('ag-file-input').value = '';
    _el('ag-file-preview').style.display = 'none';
  };

  function _fmtSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function _sendWithFile(text, file) {
    _addMsg('user', (text ? text + '\n' : '') + '📎 ' + file.name);
    _ag.history.push({ role: 'user', content: (text ? text + '\n' : '') + 'Fichier joint: ' + file.name });
    agClearFile();
    var ta = _el('ag-textarea');
    if (ta) { ta.value = ''; agAutoResize(ta); }

    _setStatus('Analyse du fichier...', true);
    var botDiv = _addMsg('bot', '');
    var bubble = botDiv.querySelector('.ag-bubble');

    var fd = new FormData();
    fd.append('file', file);
    fd.append('instruction', text || 'Analyse ce document et extrait les informations utiles pour la gestion de chantier: montants, dates, noms, références.');

    fetch('/api/agent/analyze', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('sl_token') || '') },
      body: fd
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.ok) throw new Error(data.detail || 'Erreur analyse');
      var a = data.analysis || {};
      var txt = '';
      if (a.summary) txt += '**Résumé:** ' + a.summary + '\n\n';
      var ed = a.extracted_data || {};
      if (ed.amounts && ed.amounts.length) txt += '💰 **Montants trouvés:** ' + ed.amounts.join(', ') + '\n';
      if (ed.dates && ed.dates.length) txt += '📅 **Dates:** ' + ed.dates.join(', ') + '\n';
      if (ed.names && ed.names.length) txt += '👤 **Noms:** ' + ed.names.join(', ') + '\n';
      if (ed.references && ed.references.length) txt += '🔖 **Références:** ' + ed.references.join(', ') + '\n';
      if (a.suggested_actions && a.suggested_actions.length) {
        txt += '\n📋 **Actions suggérées:**\n' + a.suggested_actions.map(function (s) { return '• ' + s; }).join('\n');
      }
      bubble.innerHTML = _formatMsg(txt || JSON.stringify(a, null, 2));
      var reply = 'J\'ai analysé le fichier **' + file.name + '**.\n\n' + txt;
      _ag.history.push({ role: 'assistant', content: reply });
      _setStatus('Prêt à vous aider');
      _scrollBottom();
    })
    .catch(function (err) {
      bubble.innerHTML = _formatMsg('❌ Erreur lors de l\'analyse: ' + err.message);
      _setStatus('Prêt à vous aider');
      _scrollBottom();
    });
  }

  // ── Streaming chat ────────────────────────────────────────────────────────
  function _streamChat() {
    _ag.streaming = true;
    _setStatus('Réflexion en cours...', true);
    _el('ag-send-btn').disabled = true;

    var botDiv = _addMsg('bot', '');
    var bubble = botDiv.querySelector('.ag-bubble');
    bubble.innerHTML = '<span class="ag-typing"><span></span><span></span><span></span></span>';

    var token = localStorage.getItem('sl_token') || '';
    var messages = _ag.history.slice(-20); // last 20 turns for context

    fetch('/api/agent/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ messages: messages })
    })
    .then(function (response) {
      var reader = response.body.getReader();
      var decoder = new TextDecoder();
      var accumulated = '';
      var textBuffer = '';
      var firstChunk = true;

      function pump() {
        reader.read().then(function (result) {
          if (result.done) {
            _agDone(textBuffer);
            return;
          }
          var chunk = decoder.decode(result.value, { stream: true });
          accumulated += chunk;
          var lines = accumulated.split('\n');
          accumulated = lines.pop();

          lines.forEach(function (line) {
            if (!line.startsWith('data: ')) return;
            try {
              var evt = JSON.parse(line.slice(6));
              if (evt.type === 'text') {
                if (firstChunk) {
                  bubble.innerHTML = '';
                  firstChunk = false;
                }
                textBuffer += evt.text;
                bubble.innerHTML = _formatMsg(textBuffer) + '<span class="ag-cursor">▋</span>';
                _scrollBottom();
              } else if (evt.type === 'navigate') {
                _handleNavigation(evt.section);
              } else if (evt.type === 'proposal') {
                _showProposal(evt.action, evt.parameters);
              } else if (evt.type === 'error') {
                bubble.innerHTML = '<span style="color:#e55;">❌ ' + evt.text + '</span>';
                _agDone('');
              } else if (evt.type === 'done') {
                bubble.innerHTML = _formatMsg(textBuffer);
                _agDone(textBuffer);
              }
            } catch (e) {}
          });

          pump();
        }).catch(function () { _agDone(textBuffer); });
      }
      pump();
    })
    .catch(function (err) {
      bubble.innerHTML = '<span style="color:#e55;">❌ Connexion perdue. Réessayez.</span>';
      _agDone('');
    });
  }

  function _agDone(text) {
    _ag.streaming = false;
    var btn = _el('ag-send-btn');
    if (btn) btn.disabled = false;
    _setStatus('Prêt à vous aider');
    if (text) _ag.history.push({ role: 'assistant', content: text });
    var cursor = _q('#ag-messages .ag-cursor');
    if (cursor) cursor.remove();
    _scrollBottom();
  }

  // ── Navigation action ─────────────────────────────────────────────────────
  function _handleNavigation(section) {
    if (typeof window.showDashPanel === 'function') {
      setTimeout(function () { window.showDashPanel(section, null); }, 300);
    }
    _addMsg('bot', '↪️ Navigation vers **' + _sectionLabel(section) + '**...');
    _ag.history.push({ role: 'assistant', content: 'Navigation vers ' + section });
  }

  function _sectionLabel(s) {
    var labels = {
      overview: 'Tableau de bord', projets: 'Mes Projets', planning: 'Planning',
      depenses: 'Dépenses', photos: 'Photos', simulateur: 'Simulateur',
      communaute: 'Communauté', messages: 'Messages', profil: 'Profil', rapports: 'Rapports'
    };
    return labels[s] || s;
  }

  // ── Proposal confirmation cards ───────────────────────────────────────────
  function _showProposal(action, params) {
    var zone = _el('ag-proposal-zone');
    if (!zone) return;
    _ag.pendingProposal = { action: action, parameters: params };

    var labels = {
      create_project: '📁 Créer un projet',
      add_expense: '💸 Ajouter une dépense',
      add_planning_phase: '📅 Ajouter une phase planning'
    };

    var details = '';
    if (action === 'create_project') {
      details = '<b>' + (params.nom || '') + '</b>' +
        (params.ville ? ' — ' + params.ville : '') +
        (params.budget ? ' — ' + Number(params.budget).toLocaleString('fr-FR') + ' DH' : '');
    } else if (action === 'add_expense') {
      details = '<b>' + (params.description || '') + '</b>' +
        ' — <b>' + Number(params.montant || 0).toLocaleString('fr-FR') + ' DH</b>' +
        (params.categorie ? ' (' + params.categorie + ')' : '');
    } else if (action === 'add_planning_phase') {
      details = '<b>' + (params.name || '') + '</b>' +
        ' du ' + (params.start_date || '') + ' au ' + (params.end_date || '');
    }

    zone.innerHTML = [
      '<div class="ag-card">',
      '  <div class="ag-card-title">' + (labels[action] || action) + '</div>',
      '  <div class="ag-card-details">' + details + '</div>',
      '  <div class="ag-card-actions">',
      '    <button class="ag-btn-confirm" onclick="agConfirm()">✅ Confirmer</button>',
      '    <button class="ag-btn-cancel" onclick="agCancelProposal()">✕ Annuler</button>',
      '  </div>',
      '</div>'
    ].join('');
  }

  window.agConfirm = function () {
    if (!_ag.pendingProposal) return;
    var p = _ag.pendingProposal;
    _ag.pendingProposal = null;
    _el('ag-proposal-zone').innerHTML = '';

    var lastUserMsg = '';
    for (var i = _ag.history.length - 1; i >= 0; i--) {
      if (_ag.history[i].role === 'user') { lastUserMsg = _ag.history[i].content; break; }
    }

    _addMsg('bot', '⏳ Exécution en cours...');
    fetch('/api/agent/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (localStorage.getItem('sl_token') || '')
      },
      body: JSON.stringify({ action: p.action, parameters: p.parameters, user_message: lastUserMsg })
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var msg = data.message || (data.ok ? '✅ Action effectuée avec succès.' : '❌ Erreur lors de l\'exécution.');
      _addMsg('bot', msg);
      _ag.history.push({ role: 'assistant', content: msg });
      // Refresh dashboard data if on dashboard
      if (typeof loadDashboard === 'function' && document.getElementById('pg-dashboard') &&
          document.getElementById('pg-dashboard').classList.contains('on')) {
        setTimeout(loadDashboard, 500);
      }
    })
    .catch(function () {
      _addMsg('bot', '❌ Erreur de connexion. L\'action n\'a pas été exécutée.');
    });
  };

  window.agCancelProposal = function () {
    _ag.pendingProposal = null;
    _el('ag-proposal-zone').innerHTML = '';
    _addMsg('bot', 'Action annulée. Comment puis-je vous aider autrement ?');
    _ag.history.push({ role: 'assistant', content: 'Action annulée par l\'utilisateur.' });
  };

  // ── Voice input (Web Speech API) ─────────────────────────────────────────
  window.agToggleVoice = function () {
    if (_ag.recording) { agStopVoice(); return; }
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      _addMsg('bot', '🎙️ La reconnaissance vocale n\'est pas disponible sur ce navigateur. Utilisez Chrome ou Edge.');
      return;
    }
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    var rec = new SR();
    rec.lang = 'fr-FR';
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    _ag.recognition = rec;

    var sec = 0;
    var timerInterval = null;

    rec.onstart = function () {
      _ag.recording = true;
      _el('ag-rec-indicator').style.display = 'flex';
      _el('ag-voice-btn').textContent = '⏹️';
      timerInterval = setInterval(function () {
        sec++;
        var t = _el('ag-rec-timer');
        if (t) t.textContent = sec + 's';
      }, 1000);
    };

    rec.onresult = function (e) {
      var transcript = '';
      for (var i = e.resultIndex; i < e.results.length; i++) {
        transcript += e.results[i][0].transcript;
      }
      var ta = _el('ag-textarea');
      if (ta) { ta.value = transcript; agAutoResize(ta); }
    };

    rec.onerror = function (e) {
      _addMsg('bot', '🎙️ Erreur de reconnaissance vocale: ' + (e.error || 'inconnue'));
      agStopVoice();
    };

    rec.onend = function () {
      clearInterval(timerInterval);
      _ag.recording = false;
      _el('ag-rec-indicator').style.display = 'none';
      _el('ag-voice-btn').textContent = '🎙️';
      // Auto-send if text was captured
      var ta = _el('ag-textarea');
      if (ta && ta.value.trim()) {
        setTimeout(agSend, 300);
      }
    };

    rec.start();
  };

  window.agStopVoice = function () {
    if (_ag.recognition) {
      try { _ag.recognition.stop(); } catch (e) {}
      _ag.recognition = null;
    }
    _ag.recording = false;
    _el('ag-rec-indicator').style.display = 'none';
    _el('ag-voice-btn').textContent = '🎙️';
  };

  // ── Message rendering ─────────────────────────────────────────────────────
  function _addMsg(role, text) {
    var msgs = _el('ag-messages');
    if (!msgs) return null;
    var div = document.createElement('div');
    div.className = 'ag-msg ag-msg-' + (role === 'user' ? 'user' : 'bot');
    div.innerHTML = '<div class="ag-bubble">' + _formatMsg(text) + '</div>';
    msgs.appendChild(div);
    _scrollBottom();
    return div;
  }

  function _formatMsg(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  function _scrollBottom() {
    var msgs = _el('ag-messages');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
  }

  // ── Status bar ────────────────────────────────────────────────────────────
  function _setStatus(text, typing) {
    var el = _el('ag-status');
    if (!el) return;
    el.textContent = text;
    el.className = typing ? 'ag-status-typing' : '';
  }

  // ── Public API (called from dashboard.js on login) ────────────────────────
  window.agentInit = function () {
    _injectWidget();
  };

  window.agentDestroy = function () {
    var w = _el('ag-widget');
    if (w) w.style.display = 'none';
    _ag.history = [];
    _ag.open = false;
    _ag.pendingProposal = null;
  };

  window.agentShow = function () {
    var w = _el('ag-widget');
    if (!w) { _injectWidget(); w = _el('ag-widget'); }
    if (w) w.style.display = 'block';
  };

  window.agentHide = function () {
    var w = _el('ag-widget');
    if (w) w.style.display = 'none';
    if (_ag.open) {
      _ag.open = false;
      var panel = _el('ag-panel');
      if (panel) panel.style.display = 'none';
    }
  };

})();
