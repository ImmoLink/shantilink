// ShantiLink – API client
const API = {
  base: '/api',

  getToken() { return localStorage.getItem('sl_token'); },
  setToken(t) { localStorage.setItem('sl_token', t); },
  clearToken() { localStorage.removeItem('sl_token'); localStorage.removeItem('sl_user'); },

  async req(method, path, body = null) {
    const headers = { 'Content-Type': 'application/json' };
    const t = this.getToken();
    if (t) headers['Authorization'] = 'Bearer ' + t;
    let res;
    try {
      res = await fetch(this.base + path, {
        method,
        headers,
        credentials: 'include',
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      throw new Error('Impossible de contacter le serveur. Vérifiez votre connexion.');
    }
    if (res.status === 401) {
      this.clearToken();
      window.goPage('auth');
      throw new Error('Session expirée. Reconnectez-vous.');
    }
    let data;
    try { data = await res.json(); } catch (e) { data = {}; }
    if (!res.ok) throw new Error(data.detail || 'Erreur serveur (' + res.status + ')');
    return data;
  },

  get(path)         { return this.req('GET',    path); },
  post(path, body)  { return this.req('POST',   path, body); },
  put(path, body)   { return this.req('PUT',    path, body); },
  patch(path, body) { return this.req('PATCH',  path, body); },
  del(path)         { return this.req('DELETE', path); },

  // Auth
  register(d)  { return this.post('/auth/register', d); },
  login(d)     { return this.post('/auth/login', d); },

  // Projects
  getProjects()     { return this.get('/projects'); },
  createProject(d)  { return this.post('/projects', d); },
  updateProject(id, d) { return this.put('/projects/' + id, d); },
  updatePct(id, p)      { return this.patch('/projects/' + id + '/pct', { pct: p }); },
  updatePhases(id, ph)  { return this.patch('/projects/' + id + '/phases', { phases: JSON.stringify(ph) }); },
  deleteProject(id) { return this.del('/projects/' + id); },

  // Expenses
  getExpenses()     { return this.get('/expenses'); },
  createExpense(d)  { return this.post('/expenses', d); },
  deleteExpense(id) { return this.del('/expenses/' + id); },

  // Photos
  getPhotos()       { return this.get('/photos'); },
  createPhoto(d)    { return this.post('/photos', d); },
  deletePhoto(id)   { return this.del('/photos/' + id); },
  async uploadPhoto(formData) {
    const headers = {};
    const t = this.getToken();
    if (t) headers['Authorization'] = 'Bearer ' + t;
    let res;
    try {
      res = await fetch(this.base + '/photos', { method: 'POST', headers, credentials: 'include', body: formData });
    } catch (e) { throw new Error('Impossible de contacter le serveur.'); }
    if (res.status === 401) { this.clearToken(); window.goPage('auth'); throw new Error('Session expirée.'); }
    let data;
    try { data = await res.json(); } catch (e) { data = {}; }
    if (!res.ok) throw new Error(data.detail || 'Erreur upload (' + res.status + ')');
    return data;
  },

  // Professionals
  getPros(params = {}) {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([,v]) => v)));
    return this.get('/professionals' + (qs.toString() ? '?' + qs : ''));
  },

  // Messages directs entre inscrits
  getChats()                { return this.get('/chat'); },
  getChat(userId)           { return this.get('/chat/' + userId); },
  sendChat(userId, content) { return this.post('/chat/' + userId, { content }); },
  sendMessage(userId, content) { return this.post('/chat/' + userId, { content }); }, // alias pour sendProContact
  searchUsers(q)            { return this.get('/users/search?q=' + encodeURIComponent(q) + '&limit=10'); },

  // Activities
  getActivities() { return this.get('/activities'); },

  // Profile
  getProfile()    { return this.get('/profile'); },
  updateProfile(d){ return this.put('/profile', d); },

  // Contact
  contact(d)      { return this.post('/contact', d); },

  // Briefs (Demandes de devis)
  getBriefs(params={})  {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([,v])=>v)));
    return this.get('/briefs' + (qs.toString() ? '?' + qs : ''));
  },
  getMyBriefs()         { return this.get('/briefs/mine'); },
  createBrief(d)        { return this.post('/briefs', d); },
  respondBrief(id,d)    { return this.post('/briefs/' + id + '/respond', d); },
  respondBriefForm(id,fd) { // ARC-04: multipart with file
    return fetch(this.base + '/briefs/' + id + '/respond-rich', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + (this.getToken()||'') },
      credentials: 'include',
      body: fd
    }).then(async r => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.detail || 'Erreur envoi');
      return j;
    });
  },
  closeBrief(id)        { return this.patch('/briefs/' + id + '/close', {}); },
  deleteBrief(id)       { return this.del('/briefs/' + id); },

  // Reviews
  createReview(d)       { return this.post('/reviews', d); },
  getProReviews(proId)  { return this.get('/reviews/pro/' + proId); },

  // Referrals
  getReferrals()        { return this.get('/referrals'); },

  // Platform stats (public)
  getPlatformStats()    { return this.get('/stats/platform'); },

  // PRO-01: company profile
  updateCompany(d)      { return this.patch('/me/company', d); },

  // CLT-03: project sharing
  shareProject(id)      { return this.post('/projects/' + id + '/share', {}); },
  getSharedProject(tok) { return this.get('/shared/' + tok); },

  // FNC-01: notifications
  getNotifications()        { return this.get('/notifications'); },
  markNotifRead(nid)        { return this.post('/notifications/' + nid + '/read', {}); },
  markAllNotifsRead()       { return this.post('/notifications/read-all', {}); },

  // FNC-02: documents
  getDocuments(pid)         { return this.get('/projects/' + pid + '/documents'); },
  deleteDocument(did)       { return this.del('/documents/' + did); },
  uploadDocument(pid, fd) {
    const headers = {};
    const t = this.getToken();
    if (t) headers['Authorization'] = 'Bearer ' + t;
    return fetch(this.base + '/projects/' + pid + '/documents', {
      method: 'POST', headers, credentials: 'include', body: fd
    }).then(async r => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.detail || 'Erreur upload');
      return j;
    });
  },

  // PRM-01: team
  getTeam()             { return this.get('/team'); },
  inviteTeam(d)         { return this.post('/team/invite', d); },
  removeTeamMember(id)  { return this.del('/team/' + id); },

  // PRM-02: programmes
  getProgrammes()       { return this.get('/programmes'); },
  createProgramme(d)    { return this.post('/programmes', d); },
  updateProgramme(id,d) { return this.patch('/programmes/' + id, d); },
  deleteProgramme(id)   { return this.del('/programmes/' + id); },
  setProjectProgramme(pid, programme_id) { return this.patch('/projects/' + pid + '/programme', { programme_id }); },

  // PRM-04: ROI
  getPromoterROI()      { return this.get('/promoter/roi'); },

  // Admin
  verifyArchitect(d)    { return this.post('/admin/verify-architect', d); },

  // MRE
  submitMRE(d)          { return this.post('/me/mre-verify', d); },
  getMREStatus()        { return this.get('/me/mre-status'); },
};
