import { api } from './api.js';
import { handleCallback, login, logout, token } from './auth.js';
import { ROLE_LABEL, h, icon, initials } from './ui.js';
import { agentsView } from './views/agents.js';
import { auditView } from './views/audit.js';
import { dashboardView } from './views/dashboard.js';
import { roomsView } from './views/rooms.js';

const root = document.getElementById('app');
const cfg = window.APP_CONFIG;

const flagbar = () => h('div', { class: 'flagbar', 'aria-hidden': 'true' });
const mark = () => h('span', { class: 'mark', 'aria-hidden': 'true' }, icon('lock', 18));

function landing(message, { revoked = false } = {}) {
  root.replaceChildren(
    flagbar(),
    h('main', { class: 'landing' },
      h('div', { class: 'landing-text' },
        h('p', { class: 'eyebrow' }, 'Administration publique · Burkina Faso'),
        h('h1', {}, 'Messagerie souveraine'),
        h('p', { class: 'lead' }, 'Échanger entre agents de l\'État, sans que le contenu ne quitte le pays ni ne soit lisible du serveur.'),
        h('ul', { class: 'assure' },
          h('li', {}, h('b', {}, 'Chiffrée de bout en bout.'), ' Même les administrateurs ne lisent pas les messages.'),
          h('li', {}, h('b', {}, 'Accès fermé.'), ' Seuls les agents enrôlés par leur ministère peuvent entrer.'),
          h('li', {}, h('b', {}, 'Révocable en un instant.'), ' Un agent qui part perd l\'accès partout.'))),
      h('div', { class: 'landing-box' },
        cfg.demo ? h('div', { class: 'notice' }, icon('alert', 18), h('div', {}, h('b', {}, 'Mode démonstration'), h('p', {}, 'Données fictives, connexion simulée.'))) : null,
        revoked
          ? h('div', { class: 'notice danger' }, icon('lock', 18), h('div', {}, h('b', {}, 'Accès révoqué'), h('p', {}, 'Votre accès a été retiré. Contactez l\'administrateur de votre ministère.')))
          : message ? h('div', { class: 'formerr', role: 'alert' }, h('strong', {}, message)) : null,
        h('h2', {}, 'Connexion'),
        h('p', { class: 'hint' }, 'Avec votre compte gouvernemental. Connexion en deux étapes : mot de passe, puis code de votre application d\'authentification.'),
        revoked
          ? h('button', { class: 'btn', onclick: logout }, 'Fermer la session')
          : h('button', { class: 'btn primary wide', onclick: login }, 'Se connecter'))));
}

const NAV = [
  { id: 'tableau', label: 'Tableau de bord', icon: 'dashboard', show: (me) => me.isAdmin, view: dashboardView },
  { id: 'agents', label: 'Agents', icon: 'users', show: (me) => me.isAdmin, view: agentsView },
  { id: 'salons', label: 'Salons', icon: 'rooms', show: () => true, view: roomsView },
  { id: 'journal', label: 'Journal', icon: 'ledger', show: (me) => me.isSuperAdmin, view: auditView },
];

function shell(me, classifications) {
  const items = NAV.filter((n) => n.show(me));
  const main = h('main', { id: 'main', class: 'content', tabindex: '-1' });
  const links = items.map((n) => h('a', { href: `#/${n.id}`, 'data-id': n.id }, icon(n.icon, 20), h('span', {}, n.label)));

  function route() {
    const id = location.hash.replace('#/', '');
    const item = items.find((n) => n.id === id) ?? items[0];
    if (item.id !== id) { location.replace(`#/${item.id}`); return; }
    links.forEach((l) => { const on = l.dataset.id === item.id; l.classList.toggle('active', on); on ? l.setAttribute('aria-current', 'page') : l.removeAttribute('aria-current'); });
    main.replaceChildren(item.view({ me, classifications }));
    document.title = `${item.label} · Messagerie souveraine`;
    main.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }

  root.replaceChildren(
    h('a', { class: 'skip', href: '#main' }, 'Aller au contenu'),
    flagbar(),
    h('div', { class: 'shell' },
      h('header', { class: 'top' },
        h('div', { class: 'brand' }, mark(), h('div', {}, h('b', {}, 'Messagerie souveraine'), h('small', {}, cfg.demo ? 'Mode démonstration' : 'Administration publique'))),
        h('div', { class: 'who' },
          h('span', { class: 'avatar', 'aria-hidden': 'true' }, initials(me.name)),
          h('div', { class: 'whotext' }, h('b', {}, me.name), h('small', {}, `${ROLE_LABEL[me.role]} · ${me.ministry ?? ''}`)),
          h('button', { class: 'iconbtn', 'aria-label': 'Se déconnecter', title: 'Se déconnecter', onclick: logout }, icon('logout')))),
      h('nav', { class: 'rail', 'aria-label': 'Navigation principale' }, links,
        h('p', { class: 'railnote' }, icon('shield', 14), ' Connexion à deux facteurs. Messages chiffrés de bout en bout.')),
      main));

  window.addEventListener('hashchange', route);
  route();
}

// Toute réponse 401 en cours de session : retour à l'écran de connexion (ou d'accès révoqué).
window.addEventListener('ms:unauthorized', (e) => {
  if (e.detail === 'account_revoked') landing(null, { revoked: true });
  else landing('Votre session a expiré. Reconnectez-vous.');
}, { once: true });

async function boot() {
  try { await handleCallback(); } catch (e) { landing(e.message); return; }
  if (!token()) { landing(); return; }
  try {
    const [me, classifications] = await Promise.all([api.me(), api.classifications()]);
    shell(me, classifications);
  } catch (e) {
    if (e.code === 'account_revoked') landing(null, { revoked: true });
    else if (e.status === 401) landing('Votre session a expiré. Reconnectez-vous.');
    else landing(e.message);
  }
}

boot();
