// MODE DÉMONSTRATION, sans Docker : npm run demo  ->  http://localhost:8080
//
// Lance la VRAIE API (même code que la production) avec :
//   - un stockage en mémoire (tout est perdu à l'arrêt),
//   - de faux Keycloak et Synapse (pas de vrai chiffrement, pas de vrais messages),
//   - une SIMULATION de la page de connexion Keycloak (aucun mot de passe, aucun TOTP).
// À n'utiliser que pour voir et tester l'interface. Jamais en production.
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import express from 'express';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import { AuditLog } from '../src/audit.js';
import { createApp } from '../src/app.js';
import { createJwtVerifier } from '../src/auth.js';
import { bootstrapSuperAdmin, seedDemo } from '../src/bootstrap.js';
import { createAgentsService } from '../src/services/agents.js';
import { createRoomsService } from '../src/services/rooms.js';
import { MemoryStore } from '../src/store/memoryStore.js';
import { FakeKeycloak, FakeSynapse } from '../test/helpers.js';

const PORT = Number(process.env.PORT || 8080);
const ORIGIN = process.env.DEMO_ORIGIN || `http://localhost:${PORT}`;
const ISSUER = `${ORIGIN}/realms/gouv`;
const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../infra/admin-web');

const { publicKey, privateKey } = await generateKeyPair('RS256');
const jwk = { ...(await exportJWK(publicKey)), alg: 'RS256', use: 'sig', kid: 'demo' };
const verifyToken = createJwtVerifier({ jwks: createLocalJWKSet({ keys: [jwk] }), issuer: ISSUER, audience: 'admin-api' });

const store = new MemoryStore();
const keycloak = new FakeKeycloak();
const synapse = new FakeSynapse();
const audit = new AuditLog(store);
const agents = createAgentsService({ store, keycloak, synapse, audit });
const rooms = createRoomsService({ store, synapse, audit });

// --- données fictives ---
await keycloak.createUser({ username: 'superadmin', fullName: 'Super Administrateur', email: 'superadmin@gouv.example', ministry: 'Transition digitale', jobTitle: 'Super administrateur', clearance: 2, role: 'super_admin', password: 'x' });
await bootstrapSuperAdmin({ store, keycloak, synapse, audit, tries: 1 });
const superActor = { username: 'superadmin', isSuperAdmin: true, isAdmin: true, ministry: 'Transition digitale', clearance: 2 };
await seedDemo({ agents, actor: superActor });
await agents.enroll(superActor, { username: 'k.compaore', fullName: 'Karim Compaoré', email: 'k.compaore@gouv.example', ministry: 'Santé', jobTitle: 'Chargé d\'études', clearance: 1, role: 'agent' });
await agents.revoke(superActor, 'k.compaore', 'Fin de mission, restitution du téléphone');
const asAgent = (username, clearance) => ({ username, isAdmin: false, isSuperAdmin: false, clearance });
await rooms.create(asAgent('f.kabore', 2), { name: 'Cellule de veille cybersécurité', level: 'CONFIDENTIEL', invite: ['a.ouedraogo'] });
await rooms.create(asAgent('m.sawadogo', 1), { name: 'Déploiement fibre : coordination', level: 'DIFFUSION_RESTREINTE', invite: ['f.kabore', 'a.ouedraogo'] });
await rooms.create(asAgent('a.ouedraogo', 2), { name: 'Annonces de la direction', level: 'NORMAL' });

// --- simulation Keycloak (PKCE) ---
const codes = new Map();
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const roleLabel = { super_admin: 'Super administrateur', admin: 'Administrateur', agent: 'Agent' };

const app = express();
app.use(express.urlencoded({ extended: false }));

app.get('/config.js', (_req, res) => {
  res.type('js').send(`window.APP_CONFIG = ${JSON.stringify({ apiBase: `${ORIGIN}/api/v1`, issuer: ISSUER, clientId: 'admin-web', chatUrl: '', demo: true })};`);
});

app.get('/realms/gouv/protocol/openid-connect/auth', async (req, res) => {
  const { client_id, redirect_uri, state, code_challenge, code_challenge_method } = req.query;
  if (client_id !== 'admin-web' || !redirect_uri || !state || !code_challenge || code_challenge_method !== 'S256') {
    return res.status(400).send('Requête OIDC invalide (PKCE S256 obligatoire)');
  }
  const active = (await store.listAgents({ status: 'active' }));
  const rows = active.map((a) => `<button name="user" value="${esc(a.username)}"><b>${esc(a.fullName)}</b><span>${esc(roleLabel[a.role])} · ${esc(a.ministry)} · habilitation ${a.clearance}</span></button>`).join('');
  res.type('html').send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connexion (simulation)</title>
<style>body{font:16px system-ui;background:#f4f1ea;color:#1b1a17;margin:0;padding:24px}main{max-width:520px;margin:6vh auto}
.warn{background:#fff3cd;border:1px solid #b7791f;padding:10px 12px;margin-bottom:18px;font-size:14px}
h1{font:600 22px Georgia,serif;margin:0 0 14px}form{display:grid;gap:8px}
button{all:unset;cursor:pointer;display:grid;gap:2px;padding:12px 14px;background:#fbfaf6;border:1px solid #d9d4c7}
button:hover,button:focus-visible{border-color:#1a7f4e;outline:2px solid #1a7f4e}button span{font-size:13px;color:#6b675d}</style>
<main><div class="warn"><b>SIMULATION de Keycloak.</b> Mode démonstration : aucun mot de passe, aucun second facteur. En production, cette page est celle de Keycloak (mot de passe + code TOTP).</div>
<h1>Choisir un compte de démonstration</h1>
<form method="post" action="/realms/gouv/login-action">
<input type="hidden" name="redirect_uri" value="${esc(redirect_uri)}"><input type="hidden" name="state" value="${esc(state)}"><input type="hidden" name="code_challenge" value="${esc(code_challenge)}">${rows}</form></main>`);
});

app.post('/realms/gouv/login-action', (req, res) => {
  const { user, redirect_uri, state, code_challenge } = req.body;
  const code = randomBytes(24).toString('base64url');
  codes.set(code, { user, challenge: code_challenge, redirect: redirect_uri, exp: Date.now() + 60_000 });
  const url = new URL(redirect_uri);
  url.searchParams.set('code', code);
  url.searchParams.set('state', state);
  res.redirect(302, url.toString());
});

app.use('/realms', (req, res, next) => {
  const o = req.get('origin');
  if (o && /^http:\/\/localhost(:\d+)?$/.test(o)) {
    res.setHeader('access-control-allow-origin', o);
    res.setHeader('access-control-allow-headers', 'content-type');
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.post('/realms/gouv/protocol/openid-connect/token', async (req, res) => {
  const { grant_type, code, code_verifier, redirect_uri } = req.body;
  const entry = codes.get(code);
  codes.delete(code);
  const fail = (error) => res.status(400).json({ error });
  if (grant_type !== 'authorization_code' || !entry || entry.exp < Date.now() || entry.redirect !== redirect_uri) return fail('invalid_grant');
  if (createHash('sha256').update(code_verifier ?? '').digest('base64url') !== entry.challenge) return fail('invalid_grant');
  const agent = await store.getAgent(entry.user);
  if (!agent || agent.status !== 'active') return fail('invalid_grant');
  const access_token = await new SignJWT({
    preferred_username: agent.username, name: agent.fullName, roles: [agent.role],
    ministry: agent.ministry, function: agent.jobTitle, clearance: agent.clearance,
  }).setProtectedHeader({ alg: 'RS256', kid: 'demo' }).setIssuer(ISSUER).setAudience('admin-api')
    .setSubject(`demo-${agent.username}`).setIssuedAt().setExpirationTime('5m').sign(privateKey);
  res.json({ access_token, token_type: 'Bearer', expires_in: 300 });
});

app.get('/realms/gouv/protocol/openid-connect/logout', (req, res) => {
  const target = String(req.query.post_logout_redirect_uri || '/');
  res.redirect(302, target.startsWith(ORIGIN) || target.startsWith('/') ? target : '/');
});

// Même politique de sécurité de contenu que Nginx en production : les tests navigateur détectent toute violation.
app.use((req, res, next) => {
  if (!req.path.startsWith('/realms/') && !req.path.startsWith('/api/')) {
    res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' ${ORIGIN}; frame-ancestors 'none'; base-uri 'none'; form-action 'self' ${ORIGIN}`);
  }
  next();
});
app.use(express.static(WEB_DIR, { index: 'index.html' }));
app.get(/^\/(?!api\/|health|realms\/).*/, (_req, res) => res.sendFile(path.join(WEB_DIR, 'index.html')));

app.use(createApp({ config: { corsOrigin: ORIGIN, corsLocalhost: true }, store, audit, agents, rooms, verifyToken, health: {} }));

app.listen(PORT, () => {
  console.log(`\nDÉMO  ${ORIGIN}\n`);
  console.log('Comptes : superadmin (super admin), a.ouedraogo (admin Transition digitale), s.traore (admin Santé),');
  console.log('          f.kabore (agent, habilitation 2), m.sawadogo (agent, 1), i.zongo (agent, 0)');
  console.log('Données en mémoire : tout est perdu à l\'arrêt.\n');
});
