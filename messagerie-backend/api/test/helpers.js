import { generateKeyPair, SignJWT, exportJWK, createLocalJWKSet } from 'jose';
import { AuditLog } from '../src/audit.js';
import { createApp } from '../src/app.js';
import { createJwtVerifier } from '../src/auth.js';
import { createAgentsService } from '../src/services/agents.js';
import { createRoomsService } from '../src/services/rooms.js';
import { MemoryStore } from '../src/store/memoryStore.js';

export const ISSUER = 'https://auth.test/realms/gouv';
export const AUDIENCE = 'admin-api';

export class FakeKeycloak {
  users = new Map();
  failOn = null;
  calls = [];
  async ping() {}
  async createUser(u) {
    this.calls.push(['createUser', u.username]);
    const id = `kc-${u.username}`;
    this.users.set(id, { ...u, enabled: true, sessions: 1 });
    return id;
  }
  async findUserId(username) { return [...this.users.keys()].find((k) => this.users.get(k).username === username) ?? null; }
  async setRole(id, role) { this.users.get(id).role = role; }
  async updateAttributes(id, patch) { Object.assign(this.users.get(id), patch); }
  async setEnabled(id, enabled) {
    if (this.failOn === 'setEnabled') throw new Error('keycloak down');
    this.users.get(id).enabled = enabled;
  }
  async logout(id) { this.users.get(id).sessions = 0; }
  async isEnabled(id) { return this.users.get(id).enabled; }
  async resetCredentials(id, pw) { this.users.get(id).password = pw; this.users.get(id).otp = false; }
  async deleteUser(id) { this.users.delete(id); }
}

export class FakeSynapse {
  users = new Map();
  rooms = new Map();
  failOn = null;
  mxid(u) { return `@${u}:gouv.test`; }
  get serviceMxid() { return '@svc-greffier:gouv.test'; }
  async ping() {}
  async ensureUser({ username, displayName, keycloakId }) {
    if (this.failOn === 'ensureUser') throw new Error('synapse down');
    const mxid = this.mxid(username);
    this.users.set(mxid, { displayName, keycloakId, deactivated: false, devices: 2 });
    return mxid;
  }
  async deactivate(mxid) {
    if (this.failOn === 'deactivate') throw new Error('synapse down');
    Object.assign(this.users.get(mxid), { deactivated: true, devices: 0 });
  }
  async userState(mxid) { const u = this.users.get(mxid); return { deactivated: u.deactivated, devices: u.devices }; }
  async createRoom(body) {
    const id = `!room${this.rooms.size + 1}:gouv.test`;
    this.rooms.set(id, { body, invited: [...body.invite] });
    return id;
  }
  async invite(roomId, mxid) { this.rooms.get(roomId).invited.push(mxid); }
}

export async function buildHarness() {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), alg: 'RS256', use: 'sig', kid: 'k1' };
  const verifyToken = createJwtVerifier({ jwks: createLocalJWKSet({ keys: [jwk] }), issuer: ISSUER, audience: AUDIENCE });

  const store = new MemoryStore();
  const keycloak = new FakeKeycloak();
  const synapse = new FakeSynapse();
  const audit = new AuditLog(store);
  const agents = createAgentsService({ store, keycloak, synapse, audit });
  const rooms = createRoomsService({ store, synapse, audit });
  const config = { corsOrigin: 'https://admin.gouv.test' };
  const app = createApp({ config, store, audit, agents, rooms, verifyToken, health: {} });

  const sign = (claims, opts = {}) =>
    new SignJWT({ roles: ['agent'], ...claims })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(opts.issuer ?? ISSUER)
      .setAudience(opts.audience ?? AUDIENCE)
      .setSubject(claims.sub ?? `sub-${claims.preferred_username}`)
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? '5m')
      .sign(opts.key ?? privateKey);

  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;

  async function call(method, path, { token, body } = {}) {
    const res = await fetch(base + path, {
      method,
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }

  const tokens = {
    superadmin: await sign({ preferred_username: 'superadmin', roles: ['super_admin'], ministry: 'Transition digitale', clearance: 2 }),
    adminTD: await sign({ preferred_username: 'adm.td', roles: ['admin'], ministry: 'Transition digitale', clearance: 2 }),
    adminSante: await sign({ preferred_username: 'adm.sante', roles: ['admin'], ministry: 'Santé', clearance: 1 }),
  };

  // Le super administrateur existe dans le registre (comme après bootstrap).
  for (const [username, ministry, clearance, role] of [
    ['superadmin', 'Transition digitale', 2, 'super_admin'],
    ['adm.td', 'Transition digitale', 2, 'admin'],
    ['adm.sante', 'Santé', 1, 'admin'],
  ]) {
    const keycloakId = await keycloak.createUser({ username, fullName: username, email: `${username}@x.test`, ministry, jobTitle: 'x', clearance, role, password: 'x' });
    const mxid = await synapse.ensureUser({ username, displayName: username, keycloakId });
    await store.insertAgent({ username, keycloakId, mxid, fullName: username, email: `${username}@x.test`, ministry, jobTitle: 'x', clearance, role, status: 'active', createdBy: 'system' });
  }

  return { store, keycloak, synapse, audit, call, sign, tokens, privateKey, close: () => new Promise((r) => server.close(r)) };
}

export const newAgent = (over = {}) => ({
  username: 'm.sawadogo', fullName: 'Moussa Sawadogo', email: 'm@x.test', ministry: 'Transition digitale',
  jobTitle: 'Ingénieur', clearance: 1, role: 'agent', ...over,
});
