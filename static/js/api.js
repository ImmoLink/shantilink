// ShantiLink – API client
const API = {
  base: '/api',

  getToken() { return localStorage.getItem('bna_token'); },
  setToken(t) { localStorage.setItem('bna_token', t); },
  clearToken() { localStorage.removeItem('bna_token'); localStorage.removeItem('bna_user'); },

  async req(method, path, body = null) {
    const headers = { 'Content-Type': 'application/json' };
    const t = this.getToken();
    if (t) headers['Authorization'] = 'Bearer ' + t;
    let res;
    try {
      res = await fetch(this.base + path, {
        method,
        headers,
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
      res = await fetch(this.base + '/photos', { method: 'POST', headers, body: formData });
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
  searchUsers(q)            { return this.get('/community/directory?q=' + encodeURIComponent(q) + '&limit=10'); },

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
  closeBrief(id)        { return this.patch('/briefs/' + id + '/close', {}); },
  deleteBrief(id)       { return this.del('/briefs/' + id); },

  // Reviews
  createReview(d)       { return this.post('/reviews', d); },
  getProReviews(proId)  { return this.get('/reviews/pro/' + proId); },

  // Referrals
  getReferrals()        { return this.get('/referrals'); },

  // Platform stats (public)
  getPlatformStats()    { return this.get('/stats/platform'); },
};
