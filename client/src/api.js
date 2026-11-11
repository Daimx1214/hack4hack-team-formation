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
  // One idempotency key per join *intent* for a given team (see joinKeyFor
  // below): retries of the same intent reuse the key, so the server returns
  // the original result instead of joining twice.
  join: async (id) => {
    try {
      const data = await api(`/api/teams/${id}/join`, {
        method: 'POST',
        body: {},
        headers: { 'Idempotency-Key': joinKeyFor(id) },
      });
      clearJoinKey(id); // server answered with success — this intent is done
      return data;
    } catch (err) {
      // If the server ANSWERED (err.status is set — even a 409 verdict),
      // the intent is settled, so drop the key. If there was no response
      // at all (network failure — the join may or may not have happened),
      // KEEP the key so the retry is recognised as a replay, not a new join.
      if (err.status) clearJoinKey(id);
      throw err;
    }
  },
  leave: (id) => api(`/api/teams/${id}/leave`, { method: 'POST', body: {} }),
  remove: (id) => api(`/api/teams/${id}`, { method: 'DELETE' }),
};

// The join key for a team lives in sessionStorage: it survives retries and
// even a page reload mid-flow, but disappears when the tab closes. (The
// server scopes keys per user, so a key string is only ever a replay for
// the account that first used it.)
function joinKeyFor(teamId) {
  const storageKey = `join-key-${teamId}`;
  let key = sessionStorage.getItem(storageKey);
  if (!key) {
    key = `join-${teamId}-${crypto.randomUUID()}`;
    sessionStorage.setItem(storageKey, key);
  }
  return key;
}

function clearJoinKey(teamId) {
  sessionStorage.removeItem(`join-key-${teamId}`);
}
