// Composants d'interface. Tout le contenu venant du serveur passe par textContent : pas d'innerHTML.
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  const add = (c) => {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  children.forEach(add);
  return el;
}

const ICONS = {
  dashboard: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  users: 'M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM21 20v-1a4 4 0 0 0-3-3.9M16 4.1a3.5 3.5 0 0 1 0 6.8',
  rooms: 'M4 5h16v11H9l-5 4zM8 9h8M8 12h5',
  ledger: 'M6 3h12v18H6zM9 8h6M9 12h6M9 16h3',
  logout: 'M9 4H5v16h4M16 8l4 4-4 4M20 12H9',
  plus: 'M12 5v14M5 12h14',
  copy: 'M9 9h11v11H9zM5 15V4h11',
  check: 'M4 12.5l5 5L20 6.5',
  x: 'M6 6l12 12M18 6L6 18',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  shield: 'M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z',
  alert: 'M12 4l9 16H3zM12 10v4M12 17v.5',
};

export function icon(name, size = 18) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', class: 'icon' })) svg.setAttribute(k, v);
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', ICONS[name] ?? '');
  svg.append(path);
  return svg;
}

// --- classification ---
export const LEVELS = {
  NORMAL: { label: 'Normal', rank: 0, blurb: 'Échanges courants. Chiffré, sur invitation, conservation illimitée.' },
  DIFFUSION_RESTREINTE: { label: 'Diffusion restreinte', rank: 1, blurb: 'Effacement automatique sous 30 jours par défaut. Pas de transfert.' },
  CONFIDENTIEL: { label: 'Confidentiel', rank: 2, blurb: 'Effacement automatique sous 24 h par défaut. Pas de transfert, pas de capture.' },
};
export const levelOfRank = (r) => ['NORMAL', 'DIFFUSION_RESTREINTE', 'CONFIDENTIEL'][r] ?? 'NORMAL';
export const stamp = (level) => h('span', { class: `stamp lv-${LEVELS[level]?.rank ?? 0}` }, LEVELS[level]?.label ?? level);
export const clearanceStamp = (rank) => stamp(levelOfRank(rank));

export const ROLE_LABEL = { agent: 'Agent', admin: 'Administrateur', super_admin: 'Super administrateur' };
export const STATUS_LABEL = { active: 'Actif', revoking: 'Révocation en cours', revoked: 'Révoqué' };

export const statusMark = (s) => h('span', { class: `status st-${s}` }, h('i'), STATUS_LABEL[s] ?? s);

// --- formats ---
const dtf = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export const fmtDate = (v) => (v ? dtf.format(new Date(v)) : '—');

export function fmtTtl(ms) {
  if (!ms) return 'Illimitée';
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min`;
  if (min < 1440) return `${Math.round(min / 60)} h`;
  const d = Math.round(min / 1440);
  return d >= 365 ? `${Math.round(d / 365)} an` : `${d} j`;
}

export const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

// --- retours à l'utilisateur ---
let toastHost;
export function toast(message, kind = 'ok') {
  toastHost ??= document.body.appendChild(h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }));
  const t = h('div', { class: `toast ${kind}` }, kind === 'err' ? icon('alert', 16) : icon('check', 16), h('span', {}, message));
  toastHost.append(t);
  setTimeout(() => t.remove(), kind === 'err' ? 7000 : 4000);
}

// Fenêtre native <dialog> : focus piégé et Échap gérés par le navigateur.
export function openDialog(build, { drawer = false, onClose } = {}) {
  const dlg = h('dialog', { class: drawer ? 'drawer' : 'modal' });
  const close = () => dlg.close();
  dlg.append(build(close));
  dlg.addEventListener('close', () => { dlg.remove(); onClose?.(); });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  document.body.append(dlg);
  dlg.showModal();
  return dlg;
}

export function field(label, control, hint) {
  const id = `f${Math.random().toString(36).slice(2, 8)}`;
  control.id ||= id;
  return h('div', { class: 'field' }, h('label', { for: control.id }, label), control, hint ? h('p', { class: 'hint' }, hint) : null);
}

export function errorList(err) {
  if (!err) return null;
  const items = Array.isArray(err.details)
    ? err.details.map((d) => (d.username ? `${d.username} : ${d.reason}` : d.field ? `${d.field} : ${d.message}` : JSON.stringify(d)))
    : [];
  return h('div', { class: 'formerr', role: 'alert' }, h('strong', {}, err.message), items.length ? h('ul', {}, items.map((i) => h('li', {}, i))) : null);
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copié dans le presse-papiers'); } catch { toast('Copie impossible : sélectionnez le texte à la main.', 'err'); }
}
