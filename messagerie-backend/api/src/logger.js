// Journal applicatif JSON. Les champs sensibles sont masqués avant écriture.
const SENSITIVE = /pass(word)?|secret|token|authorization|^mac$|private/i;

function clean(value, depth = 0) {
  if (depth > 4) return '[...]';
  if (Array.isArray(value)) return value.map((v) => clean(v, depth + 1));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = SENSITIVE.test(k) ? '[masqué]' : clean(v, depth + 1);
    return out;
  }
  return value;
}

export function log(level, msg, fields = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...clean(fields) });
  (level === 'error' ? console.error : console.log)(line);
}

export const logger = {
  info: (msg, f) => log('info', msg, f),
  warn: (msg, f) => log('warn', msg, f),
  error: (msg, f) => log('error', msg, f),
};
