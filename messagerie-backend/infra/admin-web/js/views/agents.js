import { api } from '../api.js';
import {
  ROLE_LABEL, clearanceStamp, copyText, errorList, field, fmtDate, h, icon, initials, openDialog, statusMark, toast,
} from '../ui.js';

const CLEARANCE_OPTIONS = [
  [0, 'Niveau 0 · Normal'],
  [1, 'Niveau 1 · Diffusion restreinte'],
  [2, 'Niveau 2 · Confidentiel'],
];

const canManage = (me, a) => me.username !== a.username && (me.isSuperAdmin || (a.role === 'agent' && a.ministry === me.ministry));

export function agentsView({ me }) {
  const state = { search: '', status: '' };
  const tableHost = h('div', { class: 'tablewrap', 'aria-live': 'polite' });

  const search = h('input', { type: 'search', placeholder: 'Rechercher un nom ou un identifiant', 'aria-label': 'Rechercher un agent' });
  const status = h('select', { 'aria-label': 'Filtrer par statut' },
    h('option', { value: '' }, 'Tous les statuts'), h('option', { value: 'active' }, 'Actifs'),
    h('option', { value: 'revoked' }, 'Révoqués'), h('option', { value: 'revoking' }, 'Révocation en cours'));

  let timer;
  search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { state.search = search.value.trim(); load(); }, 250); });
  status.addEventListener('change', () => { state.status = status.value; load(); });

  async function load() {
    try {
      const list = await api.agents({ search: state.search, status: state.status });
      tableHost.replaceChildren(list.length ? table(list) : h('p', { class: 'empty' }, 'Aucun agent ne correspond à cette recherche.'));
    } catch (e) {
      tableHost.replaceChildren(errorList(e));
    }
  }

  function table(list) {
    return h('table', { class: 'data' },
      h('thead', {}, h('tr', {}, ['Agent', 'Ministère', 'Habilitation', 'Rôle', 'Statut'].map((t) => h('th', { scope: 'col' }, t)))),
      h('tbody', {}, list.map((a) => h('tr', { class: a.status !== 'active' ? 'muted' : '' },
        h('td', {}, h('button', { class: 'linkrow', onclick: () => openAgent(a) },
          h('span', { class: 'avatar', 'aria-hidden': 'true' }, initials(a.fullName)),
          h('span', {}, h('b', {}, a.fullName), h('small', {}, `${a.jobTitle} · `, h('code', {}, a.username))))),
        h('td', {}, a.ministry),
        h('td', {}, clearanceStamp(a.clearance)),
        h('td', {}, ROLE_LABEL[a.role] ?? a.role),
        h('td', {}, statusMark(a.status))))));
  }

  function openAgent(a) {
    openDialog((close) => agentPanel(a, close), { drawer: true, onClose: load });
  }

  function agentPanel(a, close) {
    const manageable = canManage(me, a);
    const body = h('div', { class: 'panelbody' });
    const dl = h('dl', { class: 'facts' },
      ...[['Courriel', a.email], ['Ministère', a.ministry], ['Fonction', a.jobTitle], ['Rôle', ROLE_LABEL[a.role]],
        ['Identifiant Matrix', h('code', {}, a.mxid)], ['Enrôlé', `${fmtDate(a.createdAt)} par ${a.createdBy}`]]
        .flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]),
      h('dt', {}, 'Habilitation'), h('dd', {}, clearanceStamp(a.clearance)));
    body.append(dl);

    if (a.status !== 'active') {
      body.append(h('div', { class: 'notice danger' }, icon('lock', 18), h('div', {},
        h('b', {}, a.status === 'revoked' ? 'Accès révoqué' : 'Révocation interrompue : l\'agent est déjà bloqué'),
        h('p', {}, a.revokedAt ? `${fmtDate(a.revokedAt)} par ${a.revokedBy}` : `Engagée par ${a.revokedBy ?? '—'}`),
        a.revokeReason ? h('p', {}, `Motif : ${a.revokeReason}`) : null)));
      if (a.status === 'revoking' && manageable) body.append(h('button', { class: 'btn danger', onclick: () => openRevoke(a, close) }, 'Relancer la révocation'));
    } else if (manageable) {
      body.append(editForm(a, close), h('div', { class: 'danger-zone' },
        h('h3', {}, 'Zone sensible'),
        h('p', { class: 'hint' }, 'Téléphone perdu : nouveau mot de passe temporaire et second facteur à reconfigurer.'),
        h('button', { class: 'btn', onclick: () => resetAccess(a) }, 'Réinitialiser l\'accès'),
        h('p', { class: 'hint' }, 'Départ de l\'agent ou appareil volé : coupe l\'accès partout, immédiatement.'),
        h('button', { class: 'btn danger', onclick: () => openRevoke(a, close) }, 'Révoquer l\'accès')));
    } else if (me.username === a.username) {
      body.append(h('p', { class: 'hint' }, 'C\'est votre propre compte : vous ne pouvez ni le modifier ni le révoquer ici.'));
    } else {
      body.append(h('p', { class: 'hint' }, 'Cet agent n\'est pas dans votre périmètre de gestion.'));
    }

    return h('div', { class: 'panel' },
      h('header', { class: 'panelhead' },
        h('span', { class: 'avatar big', 'aria-hidden': 'true' }, initials(a.fullName)),
        h('div', {}, h('h2', {}, a.fullName), statusMark(a.status)),
        h('button', { class: 'iconbtn', 'aria-label': 'Fermer', onclick: close }, icon('x'))),
      body);
  }

  function editForm(a, close) {
    const job = h('input', { value: a.jobTitle, maxlength: 80 });
    const clr = h('select', {}, CLEARANCE_OPTIONS.filter(([v]) => me.isSuperAdmin || v <= me.clearance).map(([v, l]) => h('option', { value: v, selected: v === a.clearance }, l)));
    const role = me.isSuperAdmin ? h('select', {}, ['agent', 'admin'].map((r) => h('option', { value: r, selected: r === a.role }, ROLE_LABEL[r]))) : null;
    const errHost = h('div');
    const form = h('form', { class: 'form', onsubmit: async (e) => {
      e.preventDefault();
      const patch = {};
      if (job.value.trim() !== a.jobTitle) patch.jobTitle = job.value.trim();
      if (Number(clr.value) !== a.clearance) patch.clearance = Number(clr.value);
      if (role && role.value !== a.role) patch.role = role.value;
      if (!Object.keys(patch).length) { toast('Aucune modification.'); return; }
      try { await api.updateAgent(a.username, patch); toast('Modifications enregistrées'); close(); } catch (err) { errHost.replaceChildren(errorList(err)); }
    } },
      h('h3', {}, 'Modifier'),
      field('Fonction', job), field('Habilitation', clr, 'Détermine les salons que l\'agent peut créer et rejoindre.'),
      role ? field('Rôle', role) : null, errHost,
      h('button', { class: 'btn primary', type: 'submit' }, 'Enregistrer'));
    return form;
  }

  async function resetAccess(a) {
    try {
      const { temporaryPassword } = await api.resetCredentials(a.username);
      openDialog((close) => credentialsCard({ username: a.username, temporaryPassword, title: 'Accès réinitialisé' }, close));
    } catch (e) { toast(e.message, 'err'); }
  }

  function openRevoke(a, closePanel) {
    openDialog((close) => {
      const reason = h('textarea', { rows: 3, maxlength: 300, required: true, placeholder: 'Ex. : fin de mission, perte de l\'appareil…' });
      const errHost = h('div');
      const confirm = h('button', { class: 'btn danger', type: 'submit' }, 'Révoquer maintenant');
      const form = h('form', { class: 'form', onsubmit: async (e) => {
        e.preventDefault();
        confirm.disabled = true;
        confirm.textContent = 'Révocation en cours…';
        try {
          const r = await api.revoke(a.username, reason.value.trim());
          form.replaceWith(revokeResult(r, () => { close(); closePanel(); }));
        } catch (err) {
          errHost.replaceChildren(errorList(err));
          confirm.disabled = false;
          confirm.textContent = 'Réessayer la révocation';
        }
      } },
        h('p', {}, 'Cette action est immédiate. Elle sera consignée dans le journal d\'audit.'),
        h('ol', { class: 'steps' },
          h('li', {}, 'L\'agent est refusé par l\'API, même avec un jeton encore valide.'),
          h('li', {}, 'Son compte d\'identité est désactivé et ses sessions sont fermées.'),
          h('li', {}, 'Son compte de messagerie est désactivé : appareils et jetons supprimés, sortie de tous les salons.'),
          h('li', {}, 'L\'état réel de chaque service est relu avant de confirmer.')),
        field('Motif de la révocation', reason), errHost,
        h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: close }, 'Annuler'), confirm));
      return h('div', { class: 'modalbody' }, h('h2', {}, `Révoquer l'accès de ${a.fullName} ?`), form);
    });
  }

  function revokeResult(r, done) {
    return h('div', { class: 'result' },
      r.alreadyRevoked
        ? h('p', {}, 'Cet agent était déjà révoqué.')
        : [h('div', { class: 'okbanner' }, icon('check', 20), h('div', {}, h('b', {}, 'Accès révoqué'), h('p', {}, `Terminé en ${r.durationMs} ms. L'état réel a été vérifié.`))),
          h('ul', { class: 'timings' }, r.steps.map((s) => h('li', {}, h('span', {}, { registre: 'Registre et API', keycloak: 'Identité (Keycloak)', synapse: 'Messagerie (Synapse)', verification: 'Vérification de l\'état réel' }[s.step] ?? s.step), h('code', {}, `${s.ms} ms`))))],
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: done }, 'Fermer')));
  }

  function openEnroll() {
    openDialog((close) => {
      const f = {
        username: h('input', { required: true, pattern: '[a-z0-9][a-z0-9._\\-]{2,31}', autocomplete: 'off', placeholder: 'prenom.nom' }),
        fullName: h('input', { required: true, maxlength: 120, autocomplete: 'off' }),
        email: h('input', { type: 'email', required: true, autocomplete: 'off' }),
        ministry: h('input', { required: true, maxlength: 80, value: me.ministry ?? '', readonly: !me.isSuperAdmin }),
        jobTitle: h('input', { required: true, maxlength: 80 }),
        clearance: h('select', {}, CLEARANCE_OPTIONS.filter(([v]) => me.isSuperAdmin || v <= me.clearance).map(([v, l]) => h('option', { value: v }, l))),
        role: me.isSuperAdmin ? h('select', {}, ['agent', 'admin'].map((r) => h('option', { value: r }, ROLE_LABEL[r]))) : null,
      };
      const errHost = h('div');
      const submit = h('button', { class: 'btn primary', type: 'submit' }, 'Enrôler l\'agent');
      const form = h('form', { class: 'form grid2', onsubmit: async (e) => {
        e.preventDefault();
        submit.disabled = true;
        try {
          const r = await api.enroll({
            username: f.username.value.trim(), fullName: f.fullName.value.trim(), email: f.email.value.trim(),
            ministry: f.ministry.value.trim(), jobTitle: f.jobTitle.value.trim(),
            clearance: Number(f.clearance.value), role: f.role?.value ?? 'agent',
          });
          form.closest('.modalbody').replaceWith(credentialsCard({ username: r.agent.username, temporaryPassword: r.temporaryPassword, title: 'Agent enrôlé' }, close));
        } catch (err) { errHost.replaceChildren(errorList(err)); submit.disabled = false; }
      } },
        field('Identifiant', f.username, '3 à 32 caractères : a-z, 0-9, point, tiret.'), field('Nom complet', f.fullName),
        field('Courriel professionnel', f.email), field('Ministère', f.ministry, me.isSuperAdmin ? null : 'Vous enrôlez dans votre ministère.'),
        field('Fonction', f.jobTitle), field('Habilitation', f.clearance), f.role ? field('Rôle', f.role) : null,
        h('div', { class: 'span2' }, errHost),
        h('div', { class: 'actions span2' }, h('button', { class: 'btn', type: 'button', onclick: close }, 'Annuler'), submit));
      return h('div', { class: 'modalbody' }, h('h2', {}, 'Enrôler un agent'),
        h('p', { class: 'hint' }, 'Le compte est créé fermé : mot de passe temporaire à transmettre en main propre, second facteur configuré à la première connexion.'), form);
    }, { onClose: load });
  }

  load();
  return h('section', { class: 'view' },
    h('header', { class: 'viewhead' },
      h('div', {}, h('h1', {}, 'Agents'), h('p', { class: 'sub' }, me.isSuperAdmin ? 'Tous les ministères' : `Ministère : ${me.ministry}`)),
      h('button', { class: 'btn primary', onclick: openEnroll }, icon('plus', 16), 'Enrôler un agent')),
    h('div', { class: 'toolbar' }, h('div', { class: 'searchbox' }, icon('search', 16), search), status),
    tableHost);
}

export function credentialsCard({ username, temporaryPassword, title }, close) {
  return h('div', { class: 'modalbody' },
    h('h2', {}, title),
    h('div', { class: 'cred' },
      h('div', {}, h('small', {}, 'Identifiant'), h('code', { class: 'big' }, username)),
      h('div', {}, h('small', {}, 'Mot de passe temporaire'), h('code', { class: 'big pw' }, temporaryPassword)),
      h('button', { class: 'btn', onclick: () => copyText(`${username} / ${temporaryPassword}`) }, icon('copy', 16), 'Copier')),
    h('div', { class: 'notice' }, icon('alert', 18), h('div', {}, h('b', {}, 'Affiché une seule fois.'),
      h('p', {}, 'Transmettez-le à l\'agent en main propre, jamais par messagerie. Il devra le changer et configurer son application d\'authentification à sa première connexion.'))),
    h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: close }, 'J\'ai transmis les identifiants')));
}
