// Accès PostgreSQL. Toutes les requêtes sont paramétrées.
import { readFileSync } from 'node:fs';
import pg from 'pg';

const SCHEMA = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');

const toAgent = (r) =>
  r && {
    username: r.username,
    keycloakId: r.keycloak_id,
    mxid: r.mxid,
    fullName: r.full_name,
    email: r.email,
    ministry: r.ministry,
    jobTitle: r.job_title,
    clearance: r.clearance,
    role: r.role,
    status: r.status,
    createdBy: r.created_by,
    createdAt: r.created_at,
    revokedAt: r.revoked_at,
    revokedBy: r.revoked_by,
    revokeReason: r.revoke_reason,
  };

const toRoom = (r) =>
  r && {
    roomId: r.room_id,
    name: r.name,
    level: r.level,
    ttlMs: r.ttl_ms === null ? null : Number(r.ttl_ms),
    ministry: r.ministry,
    createdBy: r.created_by,
    createdAt: r.created_at,
  };

const toAudit = (r) =>
  r && {
    seq: Number(r.seq),
    ts: r.ts,
    actor: r.actor,
    action: r.action,
    target: r.target,
    details: r.details,
    prevHash: r.prev_hash,
    hash: r.hash,
  };

export class PgStore {
  #pool;

  constructor(pool) {
    this.#pool = pool;
  }

  static fromUrl(connectionString) {
    return new PgStore(new pg.Pool({ connectionString, max: 10 }));
  }

  async init() {
    await this.#pool.query(SCHEMA);
  }

  async close() {
    await this.#pool.end();
  }

  async ping() {
    await this.#pool.query('SELECT 1');
  }

  // --- agents ---
  async getAgent(username) {
    const { rows } = await this.#pool.query('SELECT * FROM agents WHERE username = $1', [username]);
    return toAgent(rows[0]);
  }

  async getAgentByMxid(mxid) {
    const { rows } = await this.#pool.query('SELECT * FROM agents WHERE mxid = $1', [mxid]);
    return toAgent(rows[0]);
  }

  async listAgents({ ministry, status, search } = {}) {
    const where = [];
    const params = [];
    if (ministry) {
      params.push(ministry);
      where.push(`ministry = $${params.length}`);
    }
    if (status) {
      params.push(status);
      where.push(`status = $${params.length}`);
    }
    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      where.push(`(LOWER(full_name) LIKE $${params.length} OR LOWER(username) LIKE $${params.length})`);
    }
    const sql = `SELECT * FROM agents ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY full_name`;
    const { rows } = await this.#pool.query(sql, params);
    return rows.map(toAgent);
  }

  async insertAgent(a) {
    await this.#pool.query(
      `INSERT INTO agents (username, keycloak_id, mxid, full_name, email, ministry, job_title, clearance, role, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [a.username, a.keycloakId, a.mxid, a.fullName, a.email, a.ministry, a.jobTitle, a.clearance, a.role, a.status, a.createdBy],
    );
    return this.getAgent(a.username);
  }

  async updateAgent(username, patch) {
    const map = {
      keycloakId: 'keycloak_id',
      fullName: 'full_name',
      email: 'email',
      ministry: 'ministry',
      jobTitle: 'job_title',
      clearance: 'clearance',
      role: 'role',
      status: 'status',
      revokedAt: 'revoked_at',
      revokedBy: 'revoked_by',
      revokeReason: 'revoke_reason',
    };
    const sets = [];
    const params = [];
    for (const [k, v] of Object.entries(patch)) {
      if (!map[k]) throw new Error(`Champ agent inconnu : ${k}`);
      params.push(v);
      sets.push(`${map[k]} = $${params.length}`);
    }
    if (!sets.length) return this.getAgent(username);
    params.push(username);
    await this.#pool.query(`UPDATE agents SET ${sets.join(', ')} WHERE username = $${params.length}`, params);
    return this.getAgent(username);
  }

  // --- salons ---
  async insertRoom(r) {
    await this.#pool.query(
      `INSERT INTO rooms (room_id, name, level, ttl_ms, ministry, created_by) VALUES ($1,$2,$3,$4,$5,$6)`,
      [r.roomId, r.name, r.level, r.ttlMs, r.ministry, r.createdBy],
    );
    return this.getRoom(r.roomId);
  }

  async getRoom(roomId) {
    const { rows } = await this.#pool.query('SELECT * FROM rooms WHERE room_id = $1', [roomId]);
    return toRoom(rows[0]);
  }

  async listRooms({ ministry } = {}) {
    const { rows } = ministry
      ? await this.#pool.query('SELECT * FROM rooms WHERE ministry = $1 OR ministry IS NULL ORDER BY created_at DESC', [ministry])
      : await this.#pool.query('SELECT * FROM rooms ORDER BY created_at DESC');
    return rows.map(toRoom);
  }

  async deleteRoom(roomId) {
    await this.#pool.query('DELETE FROM rooms WHERE room_id = $1', [roomId]);
  }

  // --- audit ---
  async lastAuditEntry() {
    const { rows } = await this.#pool.query('SELECT * FROM audit_log ORDER BY seq DESC LIMIT 1');
    return toAudit(rows[0]);
  }

  async insertAuditEntry(e) {
    await this.#pool.query(
      `INSERT INTO audit_log (seq, ts, actor, action, target, details, prev_hash, hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [e.seq, e.ts, e.actor, e.action, e.target, e.details, e.prevHash, e.hash],
    );
  }

  async listAudit({ limit, beforeSeq }) {
    const { rows } = beforeSeq
      ? await this.#pool.query('SELECT * FROM audit_log WHERE seq < $1 ORDER BY seq DESC LIMIT $2', [beforeSeq, limit])
      : await this.#pool.query('SELECT * FROM audit_log ORDER BY seq DESC LIMIT $1', [limit]);
    return rows.map(toAudit);
  }

  async auditBatch({ afterSeq, limit }) {
    const { rows } = await this.#pool.query('SELECT * FROM audit_log WHERE seq > $1 ORDER BY seq ASC LIMIT $2', [afterSeq, limit]);
    return rows.map(toAudit);
  }
}
