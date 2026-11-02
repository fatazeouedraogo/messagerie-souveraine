import { api } from '../api.js';
import { LEVELS, errorList, field, fmtDate, fmtTtl, h, icon, openDialog, stamp, toast } from '../ui.js';

const TTL_PRESETS = [
  ['', 'Durée par défaut du niveau'], ['60', '1 heure'], ['1440', '24 heures'], ['10080', '7 jours'],
  ['43200', '30 jours'], ['525600', '1 an'],
];
const RESTRICTION_TEXT = { noForward: 'Pas de transfert', noScreenshot: 'Pas de capture d\'écran' };

export function roomsView({ me, classifications }) {
  const host = h('div', { class: 'tablewrap', 'aria-live': 'polite' });
  const byId = Object.fromEntries(classifications.map((c) => [c.id, c]));

  async function load() {
    try {
      const rooms = await api.rooms();
      host.replaceChildren(rooms.length ? list(rooms) : h('div', { class: 'empty big' }, h('p', {}, 'Aucun salon pour le moment.'), h('p', { class: 'hint' }, 'Créez un salon pour échanger de manière chiffrée avec vos collègues.')));
    } catch (e) { host.replaceChildren(errorList(e)); }
  }

  function list(rooms) {
    return h('ul', { class: 'roomlist' }, rooms.map((r) => {
      const restrictions = Object.entries(byId[r.level]?.restrictions ?? {}).filter(([, v]) => v).map(([k]) => RESTRICTION_TEXT[k]);
      const mine = r.createdBy === me.username;
      return h('li', { class: 'room' },
        h('div', { class: 'roomhead' }, h('h3', {}, r.name), stamp(r.level)),
        h('p', { class: 'roommeta' },
          h('span', {}, icon('lock', 14), ' Chiffré de bout en bout'),
          h('span', {}, `Conservation : ${fmtTtl(r.ttlMs)}`),
          restrictions.length ? h('span', {}, restrictions.join(' · ')) : null),
        h('p', { class: 'roommeta soft' }, `${r.ministry ?? 'Interministériel'} · créé par ${r.createdBy} · ${fmtDate(r.createdAt)}`),
        (mine || me.isAdmin) ? h('button', { class: 'btn small', onclick: () => openInvite(r) }, 'Inviter un agent') : null);
    }));
  }

  function openInvite(room) {
    openDialog((close) => {
      const u = h('input', { required: true, autocomplete: 'off', placeholder: 'prenom.nom' });
      const errHost = h('div');
      return h('div', { class: 'modalbody' }, h('h2', {}, `Inviter dans « ${room.name} »`),
        h('form', { class: 'form', onsubmit: async (e) => {
          e.preventDefault();
          try { await api.invite(room.roomId, u.value.trim()); toast(`${u.value.trim()} invité`); close(); } catch (err) { errHost.replaceChildren(errorList(err)); }
        } },
        field('Identifiant de l\'agent', u, `Son habilitation doit permettre le niveau « ${LEVELS[room.level].label} ».`), errHost,
        h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: close }, 'Annuler'), h('button', { class: 'btn primary', type: 'submit' }, 'Inviter'))));
    });
  }

  function openCreate() {
    openDialog((close) => {
      const name = h('input', { required: true, maxlength: 100, placeholder: 'Ex. : Cellule de crise inondations' });
      let level = 'NORMAL';
      const radios = Object.entries(LEVELS).map(([id, l]) => {
        const allowed = me.clearance >= l.rank;
        const input = h('input', { type: 'radio', name: 'level', value: id, checked: id === level, disabled: !allowed });
        input.addEventListener('change', () => { level = id; });
        return h('label', { class: `levelcard lv-${l.rank}${allowed ? '' : ' off'}` }, input,
          h('span', { class: 'lname' }, l.label), h('span', { class: 'lblurb' }, allowed ? l.blurb : `Habilitation de niveau ${l.rank} requise.`));
      });
      const ttl = h('select', {}, TTL_PRESETS.map(([v, l]) => h('option', { value: v }, l)));
      const chips = [];
      const chipHost = h('div', { class: 'chips' });
      const invite = h('input', { autocomplete: 'off', placeholder: 'Identifiant, puis Entrée', 'aria-label': 'Ajouter un invité' });
      const addChip = () => {
        const v = invite.value.trim().replace(/,$/, '');
        invite.value = '';
        if (!v || chips.includes(v)) return;
        chips.push(v);
        chipHost.append(h('span', { class: 'chip', 'data-u': v }, v, h('button', { type: 'button', 'aria-label': `Retirer ${v}`, onclick: (e) => { chips.splice(chips.indexOf(v), 1); e.currentTarget.parentElement.remove(); } }, icon('x', 12))));
      };
      invite.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addChip(); } });
      const errHost = h('div');
      const submit = h('button', { class: 'btn primary', type: 'submit' }, 'Créer le salon chiffré');

      return h('div', { class: 'modalbody wide' }, h('h2', {}, 'Nouveau salon'),
        h('form', { class: 'form', onsubmit: async (e) => {
          e.preventDefault();
          addChip();
          submit.disabled = true;
          try {
            const r = await api.createRoom({ name: name.value.trim(), level, invite: chips, ...(ttl.value ? { ttlMinutes: Number(ttl.value) } : {}) });
            toast(`Salon « ${r.name} » créé`);
            close();
          } catch (err) { errHost.replaceChildren(errorList(err)); submit.disabled = false; }
        } },
        field('Nom du salon', name, 'Le nom est visible du serveur (seuls les messages sont chiffrés) : n\'y mettez rien de sensible.'),
        h('fieldset', { class: 'levels' }, h('legend', {}, 'Niveau de classification'), radios),
        field('Conservation des messages', ttl, 'Passé ce délai, le serveur efface les messages.'),
        field('Invités', h('div', {}, chipHost, invite), 'Chaque invité doit avoir une habilitation suffisante pour le niveau choisi.'),
        errHost,
        h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: close }, 'Annuler'), submit)));
    }, { onClose: load });
  }

  load();
  return h('section', { class: 'view' },
    h('header', { class: 'viewhead' },
      h('div', {}, h('h1', {}, 'Salons'), h('p', { class: 'sub' }, 'Conversations chiffrées de bout en bout, classées par niveau')),
      h('button', { class: 'btn primary', onclick: openCreate }, icon('plus', 16), 'Nouveau salon')),
    host);
}
