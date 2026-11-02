import { canManage } from '../auth.js';
import { conflict, forbidden, notFound, unprocessable } from '../errors.js';
import { generateTempPassword } from './passwords.js';

export const publicAgent = (a) => ({
  username: a.username,
  mxid: a.mxid,
  fullName: a.fullName,
  email: a.email,
  ministry: a.ministry,
  jobTitle: a.jobTitle,
  clearance: a.clearance,
  role: a.role,
  status: a.status,
  createdBy: a.createdBy,
  createdAt: a.createdAt,
  revokedAt: a.revokedAt,
  revokedBy: a.revokedBy,
  revokeReason: a.revokeReason,
});

export function createAgentsService({ store, keycloak, synapse, audit, now = () => Date.now() }) {
  async function mustGet(username) {
    const agent = await store.getAgent(username);
    if (!agent) throw notFound(`Agent introuvable : ${username}`);
    return agent;
  }

  function assertCanGrant(actor, { ministry, role, clearance }) {
    if (actor.isSuperAdmin) return;
    if (ministry !== actor.ministry) throw forbidden('Vous ne pouvez enrôler que dans votre ministère');
    if (role !== 'agent') throw forbidden('Seul le super administrateur nomme des administrateurs');
    if (clearance > actor.clearance) throw forbidden("Vous ne pouvez pas accorder une habilitation supérieure à la vôtre");
  }

  return {
    async enroll(actor, input) {
      assertCanGrant(actor, input);
      if (await store.getAgent(input.username)) throw conflict(`L'identifiant « ${input.username} » est déjà pris`);

      const temporaryPassword = generateTempPassword();
      const keycloakId = await keycloak.createUser({ ...input, password: temporaryPassword });

      let agent;
      try {
        const mxid = await synapse.ensureUser({ username: input.username, displayName: input.fullName, keycloakId });
        agent = await store.insertAgent({
          ...input,
          keycloakId,
          mxid,
          status: 'active',
          createdBy: actor.username,
        });
      } catch (e) {
        // Pas d'identité à moitié créée : on annule côté annuaire.
        await keycloak.deleteUser(keycloakId).catch(() => {});
        throw e;
      }

      await audit.append({
        actor: actor.username,
        action: 'agent.enroll',
        target: agent.username,
        details: { ministry: agent.ministry, role: agent.role, clearance: agent.clearance },
      });
      return { agent: publicAgent(agent), temporaryPassword };
    },

    async list(actor, filters = {}) {
      const ministry = actor.isSuperAdmin ? filters.ministry : actor.ministry;
      const agents = await store.listAgents({ ...filters, ministry });
      return agents.map(publicAgent);
    },

    async get(actor, username) {
      const agent = await mustGet(username);
      if (!actor.isSuperAdmin && agent.ministry !== actor.ministry) throw forbidden();
      return publicAgent(agent);
    },

    async update(actor, username, patch) {
      const agent = await mustGet(username);
      if (!canManage(actor, agent)) throw forbidden("Vous ne gérez pas cet agent");
      if (agent.status !== 'active') throw conflict('Agent révoqué : réactivation impossible depuis cette action');
      if (!actor.isSuperAdmin && (patch.role !== undefined || patch.ministry !== undefined)) {
        throw forbidden('Seul le super administrateur change le rôle ou le ministère');
      }
      if (!actor.isSuperAdmin && patch.clearance !== undefined && patch.clearance > actor.clearance) {
        throw forbidden("Habilitation supérieure à la vôtre");
      }
      if (agent.username === actor.username && (patch.role !== undefined || patch.clearance !== undefined)) {
        throw forbidden('Vous ne pouvez pas modifier votre propre rôle ni votre habilitation');
      }

      const attrs = {};
      if (patch.ministry !== undefined) attrs.ministry = patch.ministry;
      if (patch.jobTitle !== undefined) attrs.function = patch.jobTitle;
      if (patch.clearance !== undefined) attrs.clearance = patch.clearance;
      if (Object.keys(attrs).length) await keycloak.updateAttributes(agent.keycloakId, attrs);
      if (patch.role !== undefined && patch.role !== agent.role) await keycloak.setRole(agent.keycloakId, patch.role);

      const updated = await store.updateAgent(username, patch);
      await audit.append({ actor: actor.username, action: 'agent.update', target: username, details: patch });
      return publicAgent(updated);
    },

    // Révocation immédiate. Ordre voulu :
    //  1. le registre passe en « revoking » : l'API refuse déjà l'agent, même avec un jeton valide ;
    //  2. Keycloak : compte désactivé + sessions fermées (plus de nouveau jeton) ;
    //  3. Synapse : compte désactivé, appareils et jetons supprimés, sortie des salons ;
    //  4. vérification de l'état réel des deux services avant de passer en « revoked ».
    // Si une étape échoue, l'agent reste « revoking » (donc bloqué) et l'appel peut être rejoué.
    async revoke(actor, username, reason) {
      const agent = await mustGet(username);
      if (!canManage(actor, agent)) throw forbidden("Vous ne gérez pas cet agent");
      if (agent.username === actor.username) throw forbidden('Vous ne pouvez pas vous révoquer vous-même');
      if (agent.status === 'revoked') return { agent: publicAgent(agent), steps: [], durationMs: 0, alreadyRevoked: true };

      const started = now();
      const steps = [];
      const step = async (name, fn) => {
        const t = now();
        await fn();
        steps.push({ step: name, ms: now() - t });
      };

      await step('registre', async () => {
        await store.updateAgent(username, { status: 'revoking', revokedBy: actor.username, revokeReason: reason });
        await audit.append({ actor: actor.username, action: 'agent.revoke.start', target: username, details: { reason } });
      });

      await step('keycloak', async () => {
        await keycloak.setEnabled(agent.keycloakId, false);
        await keycloak.logout(agent.keycloakId);
      });

      await step('synapse', () => synapse.deactivate(agent.mxid));

      await step('verification', async () => {
        const state = await synapse.userState(agent.mxid);
        const kcEnabled = await keycloak.isEnabled(agent.keycloakId);
        if (!state.deactivated || state.devices > 0 || kcEnabled) {
          throw unprocessable('Révocation incomplète : état réel non conforme', { synapse: state, keycloakEnabled: kcEnabled });
        }
      });

      const revoked = await store.updateAgent(username, { status: 'revoked', revokedAt: new Date() });
      const durationMs = now() - started;
      await audit.append({ actor: actor.username, action: 'agent.revoke', target: username, details: { reason, durationMs } });
      return { agent: publicAgent(revoked), steps, durationMs };
    },

    // Téléphone perdu : nouveau mot de passe temporaire, second facteur (TOTP) supprimé et à
    // reconfigurer, sessions Keycloak fermées. Les appareils Matrix déjà connectés ne sont PAS
    // déconnectés par cette action : en cas de vol de l'appareil, utiliser la révocation.
    async resetCredentials(actor, username) {
      const agent = await mustGet(username);
      if (!canManage(actor, agent)) throw forbidden("Vous ne gérez pas cet agent");
      if (agent.status !== 'active') throw conflict('Agent non actif');
      const temporaryPassword = generateTempPassword();
      await keycloak.resetCredentials(agent.keycloakId, temporaryPassword);
      await audit.append({ actor: actor.username, action: 'agent.reset-credentials', target: username, details: {} });
      return { temporaryPassword };
    },

    // Annuaire minimal ouvert à tout agent actif (pour inviter des collègues) : ni courriel, ni rôle, ni statut.
    async directory(search) {
      const found = await store.listAgents({ status: 'active', search });
      return found.slice(0, 20).map((a) => ({
        username: a.username, fullName: a.fullName, ministry: a.ministry, jobTitle: a.jobTitle, clearance: a.clearance,
      }));
    },

    async stats(actor) {
      const agents = await store.listAgents({ ministry: actor.isSuperAdmin ? undefined : actor.ministry });
      const byStatus = {};
      const byMinistry = {};
      for (const a of agents) {
        byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
        byMinistry[a.ministry] = (byMinistry[a.ministry] ?? 0) + 1;
      }
      return { total: agents.length, byStatus, byMinistry };
    },
  };
}
