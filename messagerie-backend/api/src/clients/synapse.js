// Client Synapse : API d'administration + création de salons par le compte de service.
//
// Le compte de service n'a aucun appareil chiffré (pas de clés E2EE) : il peut gérer les
// salons (inviter, régler les droits) mais ne peut lire aucun message.
import { createHmac } from 'node:crypto';
import { upstream } from '../errors.js';

export class SynapseClient {
  #cfg;
  #serverName;
  #fetch;
  #token = null;

  constructor(cfg, serverName, fetchImpl = fetch) {
    this.#cfg = cfg;
    this.#serverName = serverName;
    this.#fetch = fetchImpl;
  }

  mxid(username) {
    return `@${username}:${this.#serverName}`;
  }

  get serviceMxid() {
    return this.mxid(this.#cfg.serviceUser);
  }

  // Mot de passe du compte de service dérivé du secret partagé : rien à stocker de plus.
  #servicePassword() {
    return createHmac('sha256', this.#cfg.sharedSecret).update('service-account-password').digest('hex');
  }

  async #raw(method, path, { body, token } = {}) {
    const res = await this.#fetch(`${this.#cfg.url}${path}`, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = {};
    }
    return { status: res.status, ok: res.ok, json };
  }

  async #login() {
    const { ok, status, json } = await this.#raw('POST', '/_matrix/client/v3/login', {
      body: {
        type: 'm.login.password',
        identifier: { type: 'm.id.user', user: this.#cfg.serviceUser },
        password: this.#servicePassword(),
        initial_device_display_name: 'api-administration',
      },
    });
    if (!ok) return null;
    if (status !== 200) return null;
    return json.access_token;
  }

  // Crée le compte de service administrateur (inscription par secret partagé) puis s'y connecte.
  async #serviceToken() {
    if (this.#token) return this.#token;
    let token = await this.#login();
    if (!token) {
      const nonceRes = await this.#raw('GET', '/_synapse/admin/v1/register');
      if (!nonceRes.ok) throw upstream('synapse', nonceRes.status, 'nonce');
      const nonce = nonceRes.json.nonce;
      const password = this.#servicePassword();
      const mac = createHmac('sha1', this.#cfg.sharedSecret)
        .update(nonce).update('\0').update(this.#cfg.serviceUser).update('\0')
        .update(password).update('\0').update('admin')
        .digest('hex');
      const reg = await this.#raw('POST', '/_synapse/admin/v1/register', {
        body: { nonce, username: this.#cfg.serviceUser, displayname: 'Service administration', password, admin: true, mac },
      });
      if (!reg.ok) throw upstream('synapse', reg.status, "création du compte de service");
      token = reg.json.access_token;
    }
    this.#token = token;
    return token;
  }

  async #call(method, path, body) {
    let token = await this.#serviceToken();
    let res = await this.#raw(method, path, { body, token });
    if (res.status === 401) {
      this.#token = null;
      token = await this.#serviceToken();
      res = await this.#raw(method, path, { body, token });
    }
    if (!res.ok) throw upstream('synapse', res.status, `${method} ${path.split('?')[0]} : ${res.json.error ?? ''}`.trim());
    return res.json;
  }

  async ping() {
    const res = await this.#raw('GET', '/_matrix/client/versions');
    if (!res.ok) throw upstream('synapse', res.status, 'versions');
  }

  // Crée (ou met à jour) le compte Matrix et le lie à l'identité Keycloak : à la première
  // connexion SSO, l'agent retrouve ce compte au lieu d'en créer un autre.
  async ensureUser({ username, displayName, keycloakId }) {
    const mxid = this.mxid(username);
    await this.#call('PUT', `/_synapse/admin/v2/users/${encodeURIComponent(mxid)}`, {
      displayname: displayName,
      admin: false,
      deactivated: false,
      locked: false,
      external_ids: [{ auth_provider: 'oidc-keycloak', external_id: keycloakId }],
    });
    return mxid;
  }

  // Désactive le compte : tous les appareils et jetons sont supprimés, l'agent quitte ses salons.
  async deactivate(mxid) {
    await this.#call('POST', `/_synapse/admin/v1/deactivate/${encodeURIComponent(mxid)}`, { erase: false });
  }

  async userState(mxid) {
    const u = await this.#call('GET', `/_synapse/admin/v2/users/${encodeURIComponent(mxid)}`);
    const devices = await this.#call('GET', `/_synapse/admin/v2/users/${encodeURIComponent(mxid)}/devices`);
    return { deactivated: u.deactivated === true, devices: devices.total ?? devices.devices?.length ?? 0 };
  }

  async createRoom(body) {
    const res = await this.#call('POST', '/_matrix/client/v3/createRoom', body);
    return res.room_id;
  }

  async invite(roomId, mxid) {
    await this.#call('POST', `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/invite`, { user_id: mxid });
  }

  async kick(roomId, mxid, reason) {
    await this.#call('POST', `/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/kick`, { user_id: mxid, reason });
  }
}
