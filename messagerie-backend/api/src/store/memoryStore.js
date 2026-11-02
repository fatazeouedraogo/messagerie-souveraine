// Magasin en mémoire pour les tests : même interface que PgStore.
export class MemoryStore {
  agents = new Map();
  rooms = new Map();
  audit = [];

  async init() {}
  async close() {}
  async ping() {}

  async getAgent(username) {
    const a = this.agents.get(username);
    return a ? { ...a } : undefined;
  }

  async getAgentByMxid(mxid) {
    for (const a of this.agents.values()) if (a.mxid === mxid) return { ...a };
    return undefined;
  }

  async listAgents({ ministry, status, search } = {}) {
    const q = search?.toLowerCase();
    return [...this.agents.values()]
      .filter((a) => (!ministry || a.ministry === ministry) && (!status || a.status === status))
      .filter((a) => !q || a.fullName.toLowerCase().includes(q) || a.username.toLowerCase().includes(q))
      .sort((x, y) => x.fullName.localeCompare(y.fullName))
      .map((a) => ({ ...a }));
  }

  async insertAgent(a) {
    if (this.agents.has(a.username)) throw Object.assign(new Error('duplicate key'), { code: '23505' });
    this.agents.set(a.username, { createdAt: new Date(), revokedAt: null, revokedBy: null, revokeReason: null, ...a });
    return this.getAgent(a.username);
  }

  async updateAgent(username, patch) {
    const a = this.agents.get(username);
    if (!a) return undefined;
    Object.assign(a, patch);
    return { ...a };
  }

  async insertRoom(r) {
    this.rooms.set(r.roomId, { createdAt: new Date(), ...r });
    return { ...this.rooms.get(r.roomId) };
  }

  async getRoom(roomId) {
    const r = this.rooms.get(roomId);
    return r ? { ...r } : undefined;
  }

  async listRooms({ ministry } = {}) {
    return [...this.rooms.values()].filter((r) => !ministry || r.ministry === ministry || r.ministry == null).map((r) => ({ ...r }));
  }

  async deleteRoom(roomId) {
    this.rooms.delete(roomId);
  }

  async lastAuditEntry() {
    const e = this.audit.at(-1);
    return e ? { ...e } : undefined;
  }

  async insertAuditEntry(e) {
    if (this.audit.some((x) => x.seq === e.seq)) throw Object.assign(new Error('duplicate key'), { code: '23505' });
    this.audit.push({ ...e });
  }

  async listAudit({ limit, beforeSeq }) {
    return this.audit
      .filter((e) => !beforeSeq || e.seq < beforeSeq)
      .sort((a, b) => b.seq - a.seq)
      .slice(0, limit)
      .map((e) => ({ ...e }));
  }

  async auditBatch({ afterSeq, limit }) {
    return this.audit
      .filter((e) => e.seq > afterSeq)
      .sort((a, b) => a.seq - b.seq)
      .slice(0, limit)
      .map((e) => ({ ...e }));
  }
}
