// Connexion OpenID Connect (code d'autorisation + PKCE) vers Keycloak, sans bibliothèque.
// Le jeton d'accès (5 min) est gardé en mémoire et dans sessionStorage (effacé à la fermeture de l'onglet).
const cfg = window.APP_CONFIG;
const KEY = 'ms.token';
const FLOW = 'ms.flow';

let accessToken = null;
try { accessToken = sessionStorage.getItem(KEY); } catch { /* stockage indisponible : session mémoire seule */ }

const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const random = (n) => b64url(crypto.getRandomValues(new Uint8Array(n)));
const redirectUri = () => `${location.origin}/`;

function payload(token) {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(part))));
  } catch { return null; }
}

export function token() {
  if (!accessToken) return null;
  const p = payload(accessToken);
  if (!p || p.exp * 1000 < Date.now() + 5000) { clear(); return null; }
  return accessToken;
}

function clear() {
  accessToken = null;
  try { sessionStorage.removeItem(KEY); } catch { /* ignoré */ }
}

export async function login() {
  const verifier = random(48);
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  const state = random(16);
  try { sessionStorage.setItem(FLOW, JSON.stringify({ verifier, state })); } catch { /* ignoré */ }
  const url = new URL(`${cfg.issuer}/protocol/openid-connect/auth`);
  url.search = new URLSearchParams({
    client_id: cfg.clientId, response_type: 'code', scope: 'openid profile email',
    redirect_uri: redirectUri(), state, code_challenge: challenge, code_challenge_method: 'S256',
  });
  location.assign(url);
}

// À appeler au démarrage : échange le code reçu contre un jeton. Renvoie true si une connexion vient d'aboutir.
export async function handleCallback() {
  const params = new URLSearchParams(location.search);
  if (!params.has('code') && !params.has('error')) return false;
  let flow = null;
  try { flow = JSON.parse(sessionStorage.getItem(FLOW) || 'null'); sessionStorage.removeItem(FLOW); } catch { /* ignoré */ }
  history.replaceState(null, '', location.pathname + location.hash);
  if (params.has('error')) throw new Error('La connexion a été refusée.');
  if (!flow || params.get('state') !== flow.state) throw new Error('Réponse de connexion invalide (état inattendu).');

  const res = await fetch(`${cfg.issuer}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code', client_id: cfg.clientId, code: params.get('code'),
      code_verifier: flow.verifier, redirect_uri: redirectUri(),
    }),
  });
  if (!res.ok) throw new Error("Impossible d'obtenir le jeton de connexion.");
  accessToken = (await res.json()).access_token;
  try { sessionStorage.setItem(KEY, accessToken); } catch { /* ignoré */ }
  return true;
}

export function logout() {
  clear();
  const url = new URL(`${cfg.issuer}/protocol/openid-connect/logout`);
  url.search = new URLSearchParams({ client_id: cfg.clientId, post_logout_redirect_uri: redirectUri() });
  location.assign(url);
}
