import { token } from './auth.js';

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request(method, path, body) {
  const t = token();
  if (!t) {
    window.dispatchEvent(new CustomEvent('ms:unauthorized', { detail: 'session_expired' }));
    throw new ApiError(401, 'session_expired', 'Session expirée : reconnectez-vous.');
  }
  let res;
  try {
    res = await fetch(`${window.APP_CONFIG.apiBase}${path}`, {
      method,
      headers: { authorization: `Bearer ${t}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'network', 'Serveur injoignable. Vérifiez la connexion au réseau.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = data?.error ?? {};
    if (res.status === 401) window.dispatchEvent(new CustomEvent('ms:unauthorized', { detail: e.code }));
    throw new ApiError(res.status, e.code ?? 'error', e.message ?? `Erreur ${res.status}`, e.details);
  }
  return data;
}

const qs = (o) => {
  const p = new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== ''));
  return p.size ? `?${p}` : '';
};

export const api = {
  me: () => request('GET', '/me'),
  classifications: () => request('GET', '/classifications'),
  stats: () => request('GET', '/stats'),
  agents: (f = {}) => request('GET', `/agents${qs(f)}`),
  enroll: (b) => request('POST', '/agents', b),
  updateAgent: (u, b) => request('PATCH', `/agents/${encodeURIComponent(u)}`, b),
  revoke: (u, reason) => request('POST', `/agents/${encodeURIComponent(u)}/revoke`, { reason }),
  resetCredentials: (u) => request('POST', `/agents/${encodeURIComponent(u)}/reset-credentials`),
  rooms: () => request('GET', '/rooms'),
  createRoom: (b) => request('POST', '/rooms', b),
  invite: (roomId, username) => request('POST', `/rooms/${encodeURIComponent(roomId)}/invite`, { username }),
  audit: (f = {}) => request('GET', `/audit${qs(f)}`),
  verifyAudit: () => request('GET', '/audit/verify'),
};
