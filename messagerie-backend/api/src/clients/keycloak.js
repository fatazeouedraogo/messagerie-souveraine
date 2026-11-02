// Client de l'API d'administration de Keycloak (compte de service, flux client_credentials).
import { conflict, upstream } from '../errors.js';

export class KeycloakClient {
  #cfg;
  #fetch;
  #token = null;
  #expires = 0;

  constructor(cfg, fetchImpl = fetch) {
    this.#cfg = cfg;
    this.#fetch = fetchImpl;
  }

  async #accessToken() {
    if (this.#token && Date.now() < this.#expires - 10_000) return this.#token;
    const res = await this.#fetch(`${this.#cfg.url}/realms/${this.#cfg.realm}/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.#cfg.clientId,
        client_secret: this.#cfg.clientSecret,
      }),
    });
    if (!res.ok) throw upstream('keycloak', res.status, 'obtention du jeton de service');
    const body = await res.json();
    this.#token = body.access_token;
    this.#expires = Date.now() + body.expires_in * 1000;
    return this.#token;
  }

  async #req(method, path, body) {
    const res = await this.#fetch(`${this.#cfg.url}/admin/realms/${this.#cfg.realm}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${await this.#accessToken()}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 409) throw conflict('Cet identifiant existe déjà dans l\'annuaire');
    if (!res.ok) throw upstream('keycloak', res.status, `${method} ${path.split('?')[0]}`);
    return res;
  }

  async ping() {
    await this.#accessToken();
  }

  async findUserId(username) {
    const res = await this.#req('GET', `/users?username=${encodeURIComponent(username)}&exact=true`);
    const users = await res.json();
    return users[0]?.id ?? null;
  }

  async createUser({ username, email, fullName, ministry, jobTitle, clearance, role, password }) {
    const [firstName, ...rest] = fullName.split(' ');
    const res = await this.#req('POST', '/users', {
      username,
      email,
      firstName,
      lastName: rest.join(' ') || firstName,
      enabled: true,
      emailVerified: true,
      attributes: { ministry: [ministry], function: [jobTitle], clearance: [String(clearance)] },
      credentials: [{ type: 'password', value: password, temporary: true }],
      requiredActions: ['UPDATE_PASSWORD', 'CONFIGURE_TOTP'],
    });
    const id = res.headers.get('location')?.split('/').pop() ?? (await this.findUserId(username));
    try {
      await this.setRole(id, role);
    } catch (e) {
      await this.deleteUser(id).catch(() => {});
      throw e;
    }
    return id;
  }

  async setRole(id, role) {
    const all = ['agent', 'admin', 'super_admin'];
    const current = await (await this.#req('GET', `/users/${id}/role-mappings/realm`)).json();
    const stale = current.filter((r) => all.includes(r.name) && r.name !== role);
    if (stale.length) await this.#req('DELETE', `/users/${id}/role-mappings/realm`, stale);
    const wanted = await (await this.#req('GET', `/roles/${role}`)).json();
    await this.#req('POST', `/users/${id}/role-mappings/realm`, [wanted]);
  }

  async updateAttributes(id, patch) {
    const user = await (await this.#req('GET', `/users/${id}`)).json();
    const attributes = { ...(user.attributes ?? {}) };
    for (const [k, v] of Object.entries(patch)) attributes[k] = [String(v)];
    await this.#req('PUT', `/users/${id}`, { ...user, attributes });
  }

  async setEnabled(id, enabled) {
    const user = await (await this.#req('GET', `/users/${id}`)).json();
    await this.#req('PUT', `/users/${id}`, { ...user, enabled });
  }

  // Coupe toutes les sessions Keycloak : les jetons de rafraîchissement deviennent inutilisables.
  async logout(id) {
    await this.#req('POST', `/users/${id}/logout`);
  }

  async isEnabled(id) {
    const user = await (await this.#req('GET', `/users/${id}`)).json();
    return user.enabled === true;
  }

  // Nouveau mot de passe temporaire + second facteur à reconfigurer (téléphone perdu).
  async resetCredentials(id, password) {
    const creds = await (await this.#req('GET', `/users/${id}/credentials`)).json();
    for (const c of creds.filter((x) => x.type === 'otp')) await this.#req('DELETE', `/users/${id}/credentials/${c.id}`);
    await this.#req('PUT', `/users/${id}/reset-password`, { type: 'password', value: password, temporary: true });
    const user = await (await this.#req('GET', `/users/${id}`)).json();
    await this.#req('PUT', `/users/${id}`, { ...user, requiredActions: ['UPDATE_PASSWORD', 'CONFIGURE_TOTP'] });
    await this.logout(id);
  }

  async deleteUser(id) {
    await this.#req('DELETE', `/users/${id}`);
  }
}
