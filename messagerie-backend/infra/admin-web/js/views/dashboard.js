import { api } from '../api.js';
import { ROLE_LABEL, clearanceStamp, errorList, fmtDate, h, icon } from '../ui.js';
import { ACTION_LABEL } from './audit.js';

export function dashboardView({ me }) {
  const figures = h('div', { class: 'figures' });
  const side = h('div', { class: 'cols' });

  async function load() {
    try {
      const [stats, rooms] = await Promise.all([api.stats(), api.rooms()]);
      const fig = (n, label) => h('div', { class: 'figure' }, h('span', { class: 'n' }, String(n)), h('span', { class: 'l' }, label));
      figures.replaceChildren(
        fig(stats.byStatus.active ?? 0, 'Agents actifs'),
        fig((stats.byStatus.revoked ?? 0) + (stats.byStatus.revoking ?? 0), 'Accès révoqués'),
        fig(rooms.length, 'Salons chiffrés'),
        fig(Object.keys(stats.byMinistry).length, Object.keys(stats.byMinistry).length > 1 ? 'Ministères' : 'Ministère'));

      if (me.isSuperAdmin) {
        const [verify, recent] = await Promise.all([api.verifyAudit(), api.audit({ limit: 7 })]);
        side.replaceChildren(
          h('div', {}, h('h2', {}, 'Intégrité du journal'),
            verify.ok
              ? h('div', { class: 'okbanner' }, icon('shield', 20), h('div', {}, h('b', {}, 'Chaîne intacte'), h('p', {}, `${verify.count} entrées. Empreinte de tête `, h('code', {}, verify.head.slice(0, 12)), '…')))
              : h('div', { class: 'notice danger' }, icon('alert', 20), h('div', {}, h('b', {}, 'Chaîne rompue'), h('p', {}, `À partir de l'entrée n° ${verify.brokenAt}`)))),
          h('div', {}, h('h2', {}, 'Activité récente'),
            h('ul', { class: 'feed' }, recent.map((e) => h('li', {}, h('span', { class: 'when' }, fmtDate(e.ts)), h('span', {}, h('b', {}, ACTION_LABEL[e.action] ?? e.action), e.target ? [' · ', h('code', {}, e.target)] : null, h('small', {}, ` par ${e.actor}`)))))));
      } else {
        side.replaceChildren(h('div', {}, h('h2', {}, 'Votre périmètre'),
          h('p', { class: 'hint' }, `Vous gérez les agents du ministère « ${me.ministry} » dont le rôle est « Agent ». Vous pouvez accorder une habilitation jusqu'au niveau`, ' ', clearanceStamp(me.clearance), '.')));
      }
    } catch (e) { figures.replaceChildren(errorList(e)); }
  }

  load();
  return h('section', { class: 'view' },
    h('header', { class: 'viewhead' }, h('div', {}, h('h1', {}, `Bonjour ${me.name.split(' ')[0]}`), h('p', { class: 'sub' }, `${ROLE_LABEL[me.role]} · ${me.ministry}`))),
    figures, side);
}
