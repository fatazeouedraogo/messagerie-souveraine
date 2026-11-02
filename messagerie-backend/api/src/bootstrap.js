// Initialisation au démarrage : super administrateur et comptes de démonstration fictifs.
import { logger } from './logger.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function bootstrapSuperAdmin({ store, keycloak, synapse, audit, username = 'superadmin', tries = 30 }) {
  if (await store.getAgent(username)) return;
  for (let i = 0; i < tries; i += 1) {
    try {
      const keycloakId = await keycloak.findUserId(username);
      if (!keycloakId) throw new Error('compte absent de Keycloak (import du royaume en cours ?)');
      const mxid = await synapse.ensureUser({ username, displayName: 'Super administrateur', keycloakId });
      await store.insertAgent({
        username, keycloakId, mxid, fullName: 'Super administrateur', email: 'superadmin@gouv.example',
        ministry: 'Transition digitale', jobTitle: 'Super administrateur', clearance: 2, role: 'super_admin',
        status: 'active', createdBy: 'system',
      });
      await audit.append({ actor: 'system', action: 'bootstrap.superadmin', target: username, details: {} });
      logger.info('super administrateur enregistré', { username });
      return;
    } catch (e) {
      logger.warn('bootstrap en attente', { attempt: i + 1, reason: e.message });
      await sleep(5000);
    }
  }
  logger.error('bootstrap du super administrateur abandonné');
}

// Comptes 100 % fictifs, créés uniquement si DEMO_SEED=true.
export const DEMO_AGENTS = [
  { username: 'a.ouedraogo', fullName: 'Aminata Ouédraogo', email: 'a.ouedraogo@gouv.example', ministry: 'Transition digitale', jobTitle: 'Directrice des systèmes d\'information', clearance: 2, role: 'admin' },
  { username: 'm.sawadogo', fullName: 'Moussa Sawadogo', email: 'm.sawadogo@gouv.example', ministry: 'Transition digitale', jobTitle: 'Ingénieur réseaux', clearance: 1, role: 'agent' },
  { username: 'f.kabore', fullName: 'Fatoumata Kaboré', email: 'f.kabore@gouv.example', ministry: 'Transition digitale', jobTitle: 'Analyste sécurité', clearance: 2, role: 'agent' },
  { username: 'i.zongo', fullName: 'Ibrahim Zongo', email: 'i.zongo@gouv.example', ministry: 'Santé', jobTitle: 'Chargé de mission', clearance: 0, role: 'agent' },
  { username: 's.traore', fullName: 'Salimata Traoré', email: 's.traore@gouv.example', ministry: 'Santé', jobTitle: 'Secrétaire générale', clearance: 1, role: 'admin' },
];

export async function seedDemo({ agents, actor }) {
  const created = [];
  for (const a of DEMO_AGENTS) {
    try {
      const { temporaryPassword } = await agents.enroll(actor, a);
      created.push({ username: a.username, temporaryPassword });
    } catch (e) {
      if (e.status !== 409) throw e;
    }
  }
  return created;
}
