// Niveaux de classification des salons et traduction en configuration Matrix.
//
// Ce qui est appliqué PAR LE SERVEUR : chiffrement activé dès la création (événement
// m.room.encryption, irréversible), salon sur invitation, pas de fédération, durée de
// conservation (purge par Synapse), habilitation vérifiée à l'invitation.
// Ce qui est appliqué PAR LE CLIENT (indiqué dans l'événement bf.gov.classification) :
// interdiction de transfert, blocage des captures d'écran.
export const MIN_TTL_MIN = 5;
export const MAX_TTL_MIN = 365 * 24 * 60;

export const CLASSIFICATION_EVENT = 'bf.gov.classification';

export const LEVELS = Object.freeze({
  NORMAL: Object.freeze({
    rank: 0,
    label: 'Normal',
    defaultTtlMin: null,
    historyVisibility: 'shared',
    restrictions: Object.freeze({ noForward: false, noScreenshot: false }),
  }),
  DIFFUSION_RESTREINTE: Object.freeze({
    rank: 1,
    label: 'Diffusion restreinte',
    defaultTtlMin: 30 * 24 * 60,
    historyVisibility: 'joined',
    restrictions: Object.freeze({ noForward: true, noScreenshot: false }),
  }),
  CONFIDENTIEL: Object.freeze({
    rank: 2,
    label: 'Confidentiel',
    defaultTtlMin: 24 * 60,
    historyVisibility: 'joined',
    restrictions: Object.freeze({ noForward: true, noScreenshot: true }),
  }),
});

export const LEVEL_NAMES = Object.keys(LEVELS);

export function resolvePolicy(level, ttlMinutes) {
  const def = LEVELS[level];
  if (!def) throw new RangeError(`Niveau de classification inconnu : ${level}`);

  const ttl = ttlMinutes ?? def.defaultTtlMin;
  if (ttl !== null && ttl !== undefined) {
    if (!Number.isInteger(ttl) || ttl < MIN_TTL_MIN || ttl > MAX_TTL_MIN) {
      throw new RangeError(`La durée de conservation doit être comprise entre ${MIN_TTL_MIN} minutes et ${MAX_TTL_MIN} minutes`);
    }
  }

  return {
    level,
    rank: def.rank,
    label: def.label,
    ttlMs: ttl == null ? null : ttl * 60_000,
    historyVisibility: def.historyVisibility,
    restrictions: { ...def.restrictions },
  };
}

// Habilitation de l'agent (0, 1, 2) comparée au niveau du salon.
export function clearanceAllows(clearance, level) {
  const def = LEVELS[level];
  return Boolean(def) && Number(clearance) >= def.rank;
}

// Corps de la requête POST /_matrix/client/v3/createRoom.
export function buildCreateRoomRequest({ name, policy, creatorMxid, serviceMxid, inviteMxids = [], now = Date.now() }) {
  const initialState = [
    // Une fois posé, le chiffrement ne peut plus être retiré du salon.
    { type: 'm.room.encryption', state_key: '', content: { algorithm: 'm.megolm.v1.aes-sha2' } },
    { type: 'm.room.join_rules', state_key: '', content: { join_rule: 'invite' } },
    { type: 'm.room.guest_access', state_key: '', content: { guest_access: 'forbidden' } },
    { type: 'm.room.history_visibility', state_key: '', content: { history_visibility: policy.historyVisibility } },
    {
      type: CLASSIFICATION_EVENT,
      state_key: '',
      content: {
        level: policy.level,
        label: policy.label,
        rank: policy.rank,
        restrictions: policy.restrictions,
        ttl_ms: policy.ttlMs,
        created_at: new Date(now).toISOString(),
      },
    },
  ];

  if (policy.ttlMs) {
    initialState.push({
      type: 'm.room.retention',
      state_key: '',
      content: { max_lifetime: policy.ttlMs },
    });
  }

  const invite = [...new Set(inviteMxids)].filter((m) => m !== creatorMxid && m !== serviceMxid);
  if (creatorMxid !== serviceMxid) invite.unshift(creatorMxid);

  return {
    name,
    preset: 'private_chat',
    visibility: 'private',
    invite,
    initial_state: initialState,
    creation_content: { 'm.federate': false },
    power_level_content_override: {
      users: { [creatorMxid]: 100, [serviceMxid]: 100 },
      events: {
        'm.room.encryption': 100,
        'm.room.retention': 100,
        'm.room.history_visibility': 100,
        'm.room.join_rules': 100,
        [CLASSIFICATION_EVENT]: 100,
      },
      invite: 50,
      kick: 50,
      ban: 50,
      events_default: 0,
    },
  };
}
