import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { generateKeyPair } from 'jose';
import { buildHarness, newAgent } from './helpers.js';

let h;
before(async () => { h = await buildHarness(); });
after(async () => { await h.close(); });

describe('authentification', () => {
  it('refuse une requête sans jeton', async () => {
    assert.equal((await h.call('GET', '/me')).status, 401);
  });

  it('refuse un jeton signé par une autre clé', async () => {
    const other = (await generateKeyPair('RS256')).privateKey;
    const forged = await h.sign({ preferred_username: 'superadmin', roles: ['super_admin'] }, { key: other });
    assert.equal((await h.call('GET', '/me', { token: forged })).status, 401);
  });

  it('refuse un jeton expiré, un mauvais émetteur, une mauvaise audience', async () => {
    const claims = { preferred_username: 'superadmin', roles: ['super_admin'] };
    assert.equal((await h.call('GET', '/me', { token: await h.sign(claims, { exp: '-1m' }) })).status, 401);
    assert.equal((await h.call('GET', '/me', { token: await h.sign(claims, { issuer: 'https://evil/realms/x' }) })).status, 401);
    assert.equal((await h.call('GET', '/me', { token: await h.sign(claims, { audience: 'autre' }) })).status, 401);
  });

  it('un agent simple ne peut pas administrer', async () => {
    const token = await h.sign({ preferred_username: 'simple', roles: ['agent'] });
    assert.equal((await h.call('GET', '/agents', { token })).status, 403);
    assert.equal((await h.call('POST', '/agents', { token, body: newAgent() })).status, 403);
  });
});

describe('enrôlement', () => {
  it('crée l\'agent dans Keycloak, Synapse et le registre, et journalise', async () => {
    const r = await h.call('POST', '/agents', { token: h.tokens.adminTD, body: newAgent() });
    assert.equal(r.status, 201);
    assert.match(r.body.temporaryPassword, /^[A-Za-z2-9]{5}(-[A-Za-z2-9]{5}){2}$/);
    assert.equal(r.body.agent.mxid, '@m.sawadogo:gouv.test');
    assert.ok(h.keycloak.users.has('kc-m.sawadogo'));
    assert.ok(h.synapse.users.has('@m.sawadogo:gouv.test'));
    assert.ok(h.audit);
    assert.equal((await h.audit.list({ limit: 1 }))[0].action, 'agent.enroll');
  });

  it('refuse un identifiant déjà pris (409) et des données invalides (400)', async () => {
    assert.equal((await h.call('POST', '/agents', { token: h.tokens.adminTD, body: newAgent() })).status, 409);
    const bad = await h.call('POST', '/agents', { token: h.tokens.adminTD, body: newAgent({ username: 'X!', email: 'pas-un-mail' }) });
    assert.equal(bad.status, 400);
    assert.ok(bad.body.error.details.length >= 2);
  });

  it('refuse les champs inconnus (pas d\'élévation par champ caché)', async () => {
    const r = await h.call('POST', '/agents', { token: h.tokens.adminTD, body: { ...newAgent({ username: 'x.hack' }), isSuperAdmin: true } });
    assert.equal(r.status, 400);
  });

  it('un admin ne peut enrôler que dans son ministère, ni admin ni habilitation supérieure', async () => {
    const t = h.tokens.adminSante; // ministère Santé, habilitation 1
    assert.equal((await h.call('POST', '/agents', { token: t, body: newAgent({ username: 'o.autre', ministry: 'Transition digitale' }) })).status, 403);
    assert.equal((await h.call('POST', '/agents', { token: t, body: newAgent({ username: 'o.adm', ministry: 'Santé', role: 'admin' }) })).status, 403);
    assert.equal((await h.call('POST', '/agents', { token: t, body: newAgent({ username: 'o.haut', ministry: 'Santé', clearance: 2 }) })).status, 403);
    assert.equal((await h.call('POST', '/agents', { token: t, body: newAgent({ username: 'o.ok', ministry: 'Santé', clearance: 1 }) })).status, 201);
  });

  it('annule Keycloak si Synapse échoue (pas d\'identité à moitié créée)', async () => {
    h.synapse.failOn = 'ensureUser';
    const r = await h.call('POST', '/agents', { token: h.tokens.adminTD, body: newAgent({ username: 'rollback.ko' }) });
    h.synapse.failOn = null;
    assert.equal(r.status, 500);
    assert.equal(await h.store.getAgent('rollback.ko'), undefined);
    assert.equal(await h.keycloak.findUserId('rollback.ko'), null);
  });

  it('un admin ne voit que les agents de son ministère', async () => {
    const r = await h.call('GET', '/agents', { token: h.tokens.adminSante });
    assert.ok(r.body.length > 0 && r.body.every((a) => a.ministry === 'Santé'));
    const all = await h.call('GET', '/agents', { token: h.tokens.superadmin });
    assert.ok(all.body.some((a) => a.ministry === 'Transition digitale'));
  });
});

describe('révocation', () => {
  it('bloque l\'agent partout et refuse son jeton encore valide', async () => {
    await h.call('POST', '/agents', { token: h.tokens.adminTD, body: newAgent({ username: 'a.partir', fullName: 'Agent Partant' }) });
    const agentToken = await h.sign({ preferred_username: 'a.partir', roles: ['agent'] });
    assert.equal((await h.call('GET', '/me', { token: agentToken })).status, 200);

    const r = await h.call('POST', '/agents/a.partir/revoke', { token: h.tokens.adminTD, body: { reason: 'Fin de mission' } });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.steps.map((s) => s.step), ['registre', 'keycloak', 'synapse', 'verification']);
    assert.equal(r.body.agent.status, 'revoked');
    assert.equal(h.keycloak.users.get('kc-a.partir').enabled, false);
    assert.equal(h.synapse.users.get('@a.partir:gouv.test').deactivated, true);
    assert.equal(h.synapse.users.get('@a.partir:gouv.test').devices, 0);

    const after = await h.call('GET', '/me', { token: agentToken });
    assert.equal(after.status, 401);
    assert.equal(after.body.error.code, 'account_revoked');
  });

  it('est rejouable sans effet (idempotent)', async () => {
    const r = await h.call('POST', '/agents/a.partir/revoke', { token: h.tokens.adminTD, body: { reason: 'Encore' } });
    assert.equal(r.status, 200);
    assert.equal(r.body.alreadyRevoked, true);
  });

  it('si Synapse tombe, l\'agent reste bloqué (revoking) et la révocation peut être relancée', async () => {
    await h.call('POST', '/agents', { token: h.tokens.adminTD, body: newAgent({ username: 'panne.test' }) });
    h.synapse.failOn = 'deactivate';
    const fail = await h.call('POST', '/agents/panne.test/revoke', { token: h.tokens.adminTD, body: { reason: 'Test panne' } });
    h.synapse.failOn = null;
    assert.equal(fail.status, 500);
    assert.equal((await h.store.getAgent('panne.test')).status, 'revoking');
    const token = await h.sign({ preferred_username: 'panne.test', roles: ['agent'] });
    assert.equal((await h.call('GET', '/me', { token })).status, 401);

    const retry = await h.call('POST', '/agents/panne.test/revoke', { token: h.tokens.adminTD, body: { reason: 'Reprise' } });
    assert.equal(retry.status, 200);
    assert.equal(retry.body.agent.status, 'revoked');
  });

  it('refuse l\'auto-révocation et la révocation hors ministère ou d\'un admin', async () => {
    assert.equal((await h.call('POST', '/agents/adm.td/revoke', { token: h.tokens.adminTD, body: { reason: 'moi' } })).status, 403);
    await h.call('POST', '/agents', { token: h.tokens.adminTD, body: newAgent({ username: 'cible.td' }) });
    assert.equal((await h.call('POST', '/agents/cible.td/revoke', { token: h.tokens.adminSante, body: { reason: 'hors périmètre' } })).status, 403);
    assert.equal((await h.call('POST', '/agents/adm.sante/revoke', { token: h.tokens.adminTD, body: { reason: 'collègue' } })).status, 403);
    assert.equal((await h.call('POST', '/agents/adm.sante/revoke', { token: h.tokens.superadmin, body: { reason: 'super admin' } })).status, 200);
  });

  it('exige un motif', async () => {
    assert.equal((await h.call('POST', '/agents/cible.td/revoke', { token: h.tokens.adminTD, body: {} })).status, 400);
  });
});

describe('salons classifiés', () => {
  before(async () => {
    await h.call('POST', '/agents', { token: h.tokens.superadmin, body: newAgent({ username: 'c.haut', clearance: 2 }) });
    await h.call('POST', '/agents', { token: h.tokens.superadmin, body: newAgent({ username: 'c.bas', clearance: 0 }) });
    await h.call('POST', '/agents', { token: h.tokens.superadmin, body: newAgent({ username: 'c.moyen', clearance: 1 }) });
    await h.call('POST', '/agents', { token: h.tokens.superadmin, body: newAgent({ username: 'c.haut2', clearance: 2 }) });
  });

  it('crée un salon Confidentiel chiffré, sur invitation, sans fédération, avec expiration', async () => {
    const token = await h.sign({ preferred_username: 'c.haut', roles: ['agent'] });
    const r = await h.call('POST', '/rooms', { token, body: { name: 'Cellule de crise', level: 'CONFIDENTIEL', invite: ['c.haut2'] } });
    assert.equal(r.status, 201);
    const body = h.synapse.rooms.get(r.body.roomId).body;
    const state = Object.fromEntries(body.initial_state.map((s) => [s.type, s.content]));
    assert.equal(state['m.room.encryption'].algorithm, 'm.megolm.v1.aes-sha2');
    assert.equal(state['m.room.join_rules'].join_rule, 'invite');
    assert.equal(state['m.room.retention'].max_lifetime, 24 * 60 * 60_000);
    assert.equal(state['bf.gov.classification'].restrictions.noScreenshot, true);
    assert.equal(body.creation_content['m.federate'], false);
    assert.ok(body.invite.includes('@c.haut:gouv.test') && body.invite.includes('@c.haut2:gouv.test'));
    // Un agent habilité 1 est refusé pour ce même salon.
    const refused = await h.call('POST', `/rooms/${r.body.roomId}/invite`, { token, body: { username: 'c.moyen' } });
    assert.equal(refused.status, 422);
  });

  it('refuse d\'inviter un agent insuffisamment habilité', async () => {
    const token = await h.sign({ preferred_username: 'c.haut', roles: ['agent'] });
    const r = await h.call('POST', '/rooms', { token, body: { name: 'Secret', level: 'CONFIDENTIEL', invite: ['c.bas', 'inconnu.x'] } });
    assert.equal(r.status, 422);
    assert.equal(r.body.error.details.length, 2);
    const r2 = await h.call('POST', '/rooms', { token, body: { name: 'Normal', level: 'NORMAL', invite: ['c.bas'] } });
    assert.equal(r2.status, 201);
  });

  it('refuse de créer un salon au-dessus de sa propre habilitation', async () => {
    const token = await h.sign({ preferred_username: 'c.bas', roles: ['agent'] });
    const r = await h.call('POST', '/rooms', { token, body: { name: 'Hors droits', level: 'DIFFUSION_RESTREINTE' } });
    assert.equal(r.status, 403);
  });

  it('refuse une durée de conservation hors bornes', async () => {
    const token = await h.sign({ preferred_username: 'c.haut', roles: ['agent'] });
    assert.equal((await h.call('POST', '/rooms', { token, body: { name: 'TTL', level: 'NORMAL', ttlMinutes: 1 } })).status, 422);
  });

  it('un agent révoqué ne peut plus créer de salon', async () => {
    const token = await h.sign({ preferred_username: 'a.partir', roles: ['agent'] });
    assert.equal((await h.call('POST', '/rooms', { token, body: { name: 'Fantôme', level: 'NORMAL' } })).status, 401);
  });
});

describe('journal d\'audit', () => {
  it('est réservé au super administrateur', async () => {
    assert.equal((await h.call('GET', '/audit', { token: h.tokens.adminTD })).status, 403);
    assert.equal((await h.call('GET', '/audit', { token: h.tokens.superadmin })).status, 200);
  });

  it('la chaîne est valide, puis une modification est détectée', async () => {
    const ok = await h.call('GET', '/audit/verify', { token: h.tokens.superadmin });
    assert.equal(ok.body.ok, true);
    assert.ok(ok.body.count > 5);

    h.store.audit[2].actor = 'faussaire';
    const broken = await h.call('GET', '/audit/verify', { token: h.tokens.superadmin });
    assert.equal(broken.body.ok, false);
    assert.equal(broken.body.brokenAt, 3);
  });
});

describe('annuaire', () => {
  it('un agent simple trouve un collègue actif, sans courriel ni rôle', async () => {
    const token = await h.sign({ preferred_username: 'c.haut', roles: ['agent'] });
    const r = await h.call('GET', '/directory?search=haut', { token });
    assert.equal(r.status, 200);
    const hit = r.body.find((a) => a.username === 'c.haut2');
    assert.ok(hit);
    assert.deepEqual(Object.keys(hit).sort(), ['clearance', 'fullName', 'jobTitle', 'ministry', 'username']);
  });

  it('exclut les agents révoqués et refuse une recherche trop courte', async () => {
    const token = await h.sign({ preferred_username: 'c.haut', roles: ['agent'] });
    const revoked = await h.call('GET', '/directory?search=a.partir', { token });
    assert.equal(revoked.body.length, 0);
    assert.equal((await h.call('GET', '/directory?search=a', { token })).status, 400);
    assert.equal((await h.call('GET', '/directory')).status, 401);
  });
});
