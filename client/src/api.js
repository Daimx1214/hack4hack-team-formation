// Tiny API helper: wraps fetch, attaches the JWT from localStorage,
// and throws an Error carrying the server's message on non-2xx responses.

const API_BASE = import.meta.env.VITE_API_URL || '';

export function getToken() {
  return localStorage.getItem('token');
}

export function setToken(token) {
  if (token) localStorage.setItem('token', token);
  else localStorage.removeItem('token');
}

async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const authApi = {
  register: (payload) => api('/api/auth/register', { method: 'POST', body: payload }),
  login: (payload) => api('/api/auth/login', { method: 'POST', body: payload }),
  me: () => api('/api/auth/me'),
};

export const teamsApi = {
  list: () => api('/api/teams'),
  get: (id) => api(`/api/teams/${id}`),
  create: (payload) => api('/api/teams', { method: 'POST', body: payload }),
  // One idempotency key per join *intent*: if the request is retried, the
  // server returns the original result instead of joining twice.
  join: (id) =>
    api(`/api/teams/${id}/join`, {
      method: 'POST',
      body: {},
      headers: { 'Idempotency-Key': `join-${id}-${crypto.randomUUID()}` },
    }),
  leave: (id) => api(`/api/teams/${id}/leave`, { method: 'POST', body: {} }),
  remove: (id) => api(`/api/teams/${id}`, { method: 'DELETE' }),
};
