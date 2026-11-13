// API client with session handling (Build Spec §8/§9):
//
// - The ACCESS token (15-minute JWT) lives in memory only — never in
//   localStorage, so it cannot be stolen by injected scripts.
// - The REFRESH token lives in an httpOnly cookie the server sets;
//   every fetch sends credentials so the browser attaches it.
// - When a request fails with 401 (expired access token), the client
//   silently refreshes ONCE and retries the original request. If the
//   refresh fails, the session is over.
// - A 'tf-session' flag in localStorage records only THAT a session
//   probably exists, so a page reload knows to attempt a silent restore.

const API_BASE = import.meta.env.VITE_API_URL || '';

let accessToken = null;

export function getToken() {
  return accessToken;
}

export function setToken(token) {
  accessToken = token || null;
  try {
    if (token) localStorage.setItem('tf-session', '1');
    else localStorage.removeItem('tf-session');
  } catch {
    // Storage unavailable (private mode) — the in-memory token still works.
  }
}

export function hasSessionHint() {
  try {
    return localStorage.getItem('tf-session') === '1';
  } catch {
    return false;
  }
}

async function rawFetch(path, { method = 'GET', body, headers = {} } = {}) {
  return fetch(`${API_BASE}${path}`, {
    method,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function parseJson(res) {
  return res.json().catch(() => ({}));
}

function toError(res, data) {
  // API error contract: { error: { code, message } }.
  const serverError = data.error;
  const message =
    (serverError && serverError.message) || serverError || `Request failed (${res.status})`;
  const err = new Error(message);
  err.status = res.status;
  err.code = serverError && serverError.code;
  return err;
}

// One refresh attempt in flight at a time — concurrent 401s share it.
let refreshInFlight = null;
export function refreshSession() {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const res = await rawFetch('/api/auth/refresh', { method: 'POST' });
      const data = await parseJson(res);
      if (!res.ok) throw toError(res, data);
      setToken(data.accessToken);
      return data.accessToken;
    })().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

// When a session truly ends mid-use (refresh rejected), the app shell
// listens for this event and follows the Spec §5.8 contract: toast
// 'Your session expired' and redirect to /login?returnTo=<here>.
function notifySessionExpired() {
  try {
    window.dispatchEvent(new CustomEvent('tf:session-expired'));
  } catch {
    // Non-browser environment — nothing to notify.
  }
}

async function api(path, options = {}) {
  const res = await rawFetch(path, options);
  if (res.status === 401 && !path.startsWith('/api/auth/')) {
    // Access token expired mid-session: refresh once, then retry once.
    try {
      await refreshSession();
    } catch {
      const hadSession = Boolean(accessToken) || hasSessionHint();
      setToken(null);
      if (hadSession) notifySessionExpired();
      throw toError(res, await parseJson(res.clone()).catch(() => ({})));
    }
    const retry = await rawFetch(path, options);
    const retryData = await parseJson(retry);
    if (!retry.ok) {
      if (retry.status === 401) {
        setToken(null);
        notifySessionExpired();
      }
      throw toError(retry, retryData);
    }
    return retryData;
  }
  const data = await parseJson(res);
  if (!res.ok) throw toError(res, data);
  return data;
}

export const authApi = {
  register: (payload) => api('/api/auth/register', { method: 'POST', body: payload }),
  login: (payload) => api('/api/auth/login', { method: 'POST', body: payload }),
  me: () => api('/api/auth/me'),
  refresh: () => refreshSession(),
  logout: () => rawFetch('/api/auth/logout', { method: 'POST' }),
};

export const teamsApi = {
  list: (params = {}) => {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== '')
    ).toString();
    return api(`/api/teams${qs ? `?${qs}` : ''}`);
  },
  get: (id) => api(`/api/teams/${id}`),
  mine: (role) => api(`/api/teams/mine?role=${role}`),
  create: (payload) => api('/api/teams', { method: 'POST', body: payload }),
  update: (id, payload) => api(`/api/teams/${id}`, { method: 'PATCH', body: payload }),
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
  leave: (id) => api(`/api/teams/${id}/leave`, { method: 'DELETE' }),
  remove: (id) => api(`/api/teams/${id}`, { method: 'DELETE' }),
};

export const statsApi = {
  get: () => api('/api/stats'),
};

// The join key for a team lives in sessionStorage: it survives retries and
// even a page reload mid-flow, but disappears when the tab closes. (The
// server scopes keys per user, so a key string is only ever a replay for
// the account that first used it.)
function joinKeyFor(teamId) {
  const storageKey = `join-key-${teamId}`;
  let key = sessionStorage.getItem(storageKey);
  if (!key) {
    // The API requires the key to be a bare UUID (Spec §10.2).
    key = crypto.randomUUID();
    sessionStorage.setItem(storageKey, key);
  }
  return key;
}

function clearJoinKey(teamId) {
  sessionStorage.removeItem(`join-key-${teamId}`);
}
