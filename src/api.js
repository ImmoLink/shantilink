import AsyncStorage from '@react-native-async-storage/async-storage';

// Change this to your server IP when testing on a real device
// e.g. 'http://192.168.1.10:8000/api'
export const BASE_URL = 'http://192.168.1.66:8000/api';

async function req(method, path, body = null) {
  const token = await AsyncStorage.getItem('sl_token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const res = await fetch(BASE_URL + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data;
  try { data = await res.json(); } catch { data = {}; }
  if (!res.ok) throw new Error(data.detail || `Erreur ${res.status}`);
  return data;
}

const get  = (p)    => req('GET',    p);
const post = (p, b) => req('POST',   p, b);
const put  = (p, b) => req('PUT',    p, b);
const patch= (p, b) => req('PATCH',  p, b);
const del  = (p)    => req('DELETE', p);

export const API = {
  // Auth
  register: (d) => post('/auth/register', d),
  login:    (d) => post('/auth/login', d),

  // Profile
  getProfile:    ()  => get('/profile'),
  updateProfile: (d) => put('/profile', d),

  // Projects
  getProjects:    ()      => get('/projects'),
  createProject:  (d)     => post('/projects', d),
  updateProject:  (id, d) => put('/projects/' + id, d),
  updatePct:      (id, p) => patch('/projects/' + id + '/pct', { pct: p }),
  deleteProject:  (id)    => del('/projects/' + id),

  // Expenses
  getExpenses:   ()     => get('/expenses'),
  createExpense: (d)    => post('/expenses', d),
  deleteExpense: (id)   => del('/expenses/' + id),

  // Photos
  getPhotos:   () => get('/photos'),
  deletePhoto: (id) => del('/photos/' + id),
  async uploadPhoto(formData) {
    const token = await AsyncStorage.getItem('sl_token');
    const headers = {};
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const res = await fetch(BASE_URL + '/photos', { method: 'POST', headers, body: formData });
    let data;
    try { data = await res.json(); } catch { data = {}; }
    if (!res.ok) throw new Error(data.detail || 'Erreur upload');
    return data;
  },

  // Professionals
  getPros: (params = {}) => {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([,v]) => v)));
    return get('/professionals' + (qs.toString() ? '?' + qs : ''));
  },

  // Messages
  getConversations: ()            => get('/messages'),
  getMessages:      (proId)       => get('/messages/' + proId),
  sendMessage:      (proId, text) => post('/messages', { professional_id: proId, content: text }),

  // Community
  getPosts:   ()    => get('/community'),
  createPost: (d)   => post('/community', d),
  likePost:   (id)  => post('/community/' + id + '/like', {}),

  // Briefs
  getBriefs:    (p={}) => {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(p).filter(([,v]) => v)));
    return get('/briefs' + (qs.toString() ? '?' + qs : ''));
  },
  getMyBriefs:    ()      => get('/briefs/mine'),
  createBrief:    (d)     => post('/briefs', d),
  respondBrief:   (id, d) => post('/briefs/' + id + '/respond', d),
  deleteBrief:    (id)    => del('/briefs/' + id),

  // Reviews
  createReview:  (d)  => post('/reviews', d),
  getProReviews: (id) => get('/reviews/pro/' + id),

  // Referrals
  getReferrals: () => get('/referrals'),

  // Stats
  getPlatformStats: () => get('/stats/platform'),

  // Activities
  getActivities: () => get('/activities'),
};
