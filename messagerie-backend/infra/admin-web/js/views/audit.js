import { api } from '../api.js';
import { errorList, fmtDate, h, icon } from '../ui.js';

export const ACTION_LABEL = {
  'agent.enroll': 'Enrôlement', 'agent.revoke.start': 'Révocation engagée', 'agent.revoke': 'Révocation',
  'agent.update': 'Modification', 'agent.reset-credentials': 'Réinitialisation d\'accès',
  'room.create': 'Création de salon', 'room.invite': 'Invitation', 'bootstrap.superadmin': 'Initialisation',
};

const DETAIL_KEY = { ministry: 'ministère', role: 'rôle', clearance: 'habilitation', reason: 'motif', durationMs: 'durée (ms)', name: 'nom', level: 'niveau', ttlMs: 'conservation (ms)', invited: 'invités', jobTitle: 'fonction' };
const detailText = (d) => Object.entries(d ?? {}).map(([k, v]) => `${DETAIL_KEY[k] ?? k} : ${v}`).join(' · ');

export function auditView() {
  const body = h('tbody');
  const more = h('button', { class: 'btn', onclick: () => load(true) }, 'Charger les entrées plus anciennes');
  const verifyHost = h('div', { 'aria-live': 'polite' });
  let lastSeq;

  async function load(append = false) {
    try {
      const rows = await api.audit({ limit: 40, before: append ? lastSeq : undefined });
      if (!append) body.replaceChildren();
      for (const e of rows) {
        body.append(h('tr', {},
          h('td', { class: 'num' }, String(e.seq).padStart(4, '0')),
          h('td', {}, fmtDate(e.ts)),
          h('td', {}, h('code', {}, e.actor)),
          h('td', {}, h('b', {}, ACTION_LABEL[e.action] ?? e.action)),
          h('td', {}, e.target ? h('code', {}, e.target) : '—'),
          h('td', { class: 'detail' }, detailText(e.details)),
          h('td', {}, h('code', { class: 'hash', title: e.hash }, e.hash.slice(0, 10)))));
      }
      if (rows.length) lastSeq = rows.at(-1).seq;
      more.hidden = rows.length < 40 || lastSeq <= 1;
    } catch (e) { verifyHost.replaceChildren(errorList(e)); }
  }

  async function verify() {
    verifyHost.replaceChildren(h('p', { class: 'hint' }, 'Vérification de la chaîne…'));
    try {
      const r = await api.verifyAudit();
      verifyHost.replaceChildren(r.ok
        ? h('div', { class: 'okbanner' }, icon('shield', 20), h('div', {}, h('b', {}, 'Chaîne intacte'), h('p', {}, `${r.count} entrées vérifiées. Empreinte de tête : `, h('code', {}, r.head.slice(0, 16)), '…')))
        : h('div', { class: 'notice danger' }, icon('alert', 20), h('div', {}, h('b', {}, 'Chaîne rompue'), h('p', {}, `Une entrée a été modifiée ou supprimée à partir du n° ${r.brokenAt}.`))));
    } catch (e) { verifyHost.replaceChildren(errorList(e)); }
  }

  load();
  return h('section', { class: 'view' },
    h('header', { class: 'viewhead' },
      h('div', {}, h('h1', {}, 'Journal d\'audit'), h('p', { class: 'sub' }, 'Registre en ajout seul. Chaque ligne contient l\'empreinte de la précédente.')),
      h('button', { class: 'btn', onclick: verify }, icon('shield', 16), 'Vérifier l\'intégrité')),
    verifyHost,
    h('div', { class: 'tablewrap' }, h('table', { class: 'data ledger' },
      h('thead', {}, h('tr', {}, ['N°', 'Date', 'Auteur', 'Action', 'Cible', 'Détails', 'Empreinte'].map((t) => h('th', { scope: 'col' }, t)))), body)),
    h('div', { class: 'center' }, more));
}
