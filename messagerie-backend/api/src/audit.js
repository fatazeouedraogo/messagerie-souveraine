// Journal d'audit en ajout seul, chaîné par empreintes SHA-256.
// Chaque entrée contient l'empreinte de la précédente : toute modification ou suppression
// après coup casse la chaîne et est détectée par verify().
import { createHash } from 'node:crypto';

export const GENESIS_HASH = '0'.repeat(64);

// JSON canonique (clés triées) pour que l'empreinte soit reproductible.
export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}

export function computeHash({ prevHash, seq, ts, actor, action, target, details }) {
  return createHash('sha256')
    .update(`${prevHash}|${seq}|${ts}|${actor}|${action}|${target ?? ''}|${details}`)
    .digest('hex');
}

const isUniqueViolation = (e) => e?.code === '23505' || /duplicate key|unique constraint/i.test(e?.message ?? '');

export class AuditLog {
  #store;
  #clock;
  #queue = Promise.resolve();

  constructor(store, clock = () => new Date()) {
    this.#store = store;
    this.#clock = clock;
  }

  // Les écritures sont sérialisées ; la clé primaire (seq) protège aussi contre une
  // écriture concurrente venant d'une autre instance.
  append(entry) {
    const run = this.#queue.then(() => this.#append(entry));
    this.#queue = run.catch(() => {});
    return run;
  }

  async #append({ actor, action, target = null, details = {} }) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const last = await this.#store.lastAuditEntry();
      const seq = last ? last.seq + 1 : 1;
      const prevHash = last ? last.hash : GENESIS_HASH;
      const ts = this.#clock().toISOString();
      const detailsText = canonical(details);
      const hash = computeHash({ prevHash, seq, ts, actor, action, target, details: detailsText });
      const entry = { seq, ts, actor, action, target, details: detailsText, prevHash, hash };
      try {
        await this.#store.insertAuditEntry(entry);
        return entry;
      } catch (e) {
        if (!isUniqueViolation(e)) throw e;
      }
    }
    throw new Error("Impossible d'écrire dans le journal d'audit (conflits répétés)");
  }

  async list({ limit = 50, beforeSeq } = {}) {
    const rows = await this.#store.listAudit({ limit: Math.min(Math.max(limit, 1), 200), beforeSeq });
    return rows.map((r) => ({ ...r, details: JSON.parse(r.details) }));
  }

  async verify() {
    let expectedSeq = 1;
    let prevHash = GENESIS_HASH;
    let afterSeq = 0;
    for (;;) {
      const batch = await this.#store.auditBatch({ afterSeq, limit: 500 });
      if (batch.length === 0) break;
      for (const e of batch) {
        const ok =
          e.seq === expectedSeq &&
          e.prevHash === prevHash &&
          e.hash === computeHash({ ...e, prevHash });
        if (!ok) return { ok: false, count: expectedSeq - 1, brokenAt: e.seq };
        prevHash = e.hash;
        expectedSeq += 1;
        afterSeq = e.seq;
      }
    }
    return { ok: true, count: expectedSeq - 1, head: prevHash };
  }
}
