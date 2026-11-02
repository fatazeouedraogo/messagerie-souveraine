import { buildCreateRoomRequest, clearanceAllows, LEVELS, resolvePolicy } from '../classification.js';
import { forbidden, notFound, unprocessable } from '../errors.js';

export function createRoomsService({ store, synapse, audit }) {
  async function resolveInvitees(level, usernames) {
    const problems = [];
    const mxids = [];
    for (const username of new Set(usernames)) {
      const a = await store.getAgent(username);
      if (!a) problems.push({ username, reason: 'inconnu' });
      else if (a.status !== 'active') problems.push({ username, reason: 'compte non actif' });
      else if (!clearanceAllows(a.clearance, level)) problems.push({ username, reason: `habilitation insuffisante pour « ${LEVELS[level].label} »` });
      else mxids.push(a.mxid);
    }
    if (problems.length) throw unprocessable('Invitations refusées', problems);
    return mxids;
  }

  async function mustGetActorAgent(actor) {
    const me = await store.getAgent(actor.username);
    if (!me || me.status !== 'active') throw forbidden('Compte non enregistré dans l\'annuaire');
    return me;
  }

  return {
    async create(actor, { name, level, ttlMinutes, invite = [] }) {
      const me = await mustGetActorAgent(actor);
      if (!clearanceAllows(me.clearance, level)) {
        throw forbidden(`Votre habilitation ne permet pas de créer un salon « ${LEVELS[level].label} »`);
      }
      let policy;
      try {
        policy = resolvePolicy(level, ttlMinutes);
      } catch (e) {
        throw unprocessable(e.message);
      }
      const inviteMxids = await resolveInvitees(level, invite);

      const body = buildCreateRoomRequest({
        name,
        policy,
        creatorMxid: me.mxid,
        serviceMxid: synapse.serviceMxid,
        inviteMxids,
      });
      const roomId = await synapse.createRoom(body);
      const room = await store.insertRoom({ roomId, name, level, ttlMs: policy.ttlMs, ministry: me.ministry, createdBy: me.username });
      await audit.append({ actor: me.username, action: 'room.create', target: roomId, details: { name, level, ttlMs: policy.ttlMs, invited: invite.length } });
      return { ...room, restrictions: policy.restrictions };
    },

    async list(actor) {
      const rooms = await store.listRooms({ ministry: actor.isSuperAdmin ? undefined : actor.ministry });
      return rooms.map((r) => ({ ...r, label: LEVELS[r.level]?.label ?? r.level }));
    },

    async invite(actor, roomId, username) {
      const me = await mustGetActorAgent(actor);
      const room = await store.getRoom(roomId);
      if (!room) throw notFound('Salon introuvable');
      if (room.createdBy !== me.username && !actor.isAdmin) throw forbidden('Réservé au créateur du salon ou à un administrateur');
      const [mxid] = await resolveInvitees(room.level, [username]);
      await synapse.invite(roomId, mxid);
      await audit.append({ actor: me.username, action: 'room.invite', target: roomId, details: { invited: username } });
      return { roomId, invited: username };
    },
  };
}
