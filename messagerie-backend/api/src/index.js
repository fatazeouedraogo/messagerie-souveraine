import { AuditLog } from './audit.js';
import { createApp } from './app.js';
import { createJwtVerifier } from './auth.js';
import { KeycloakClient } from './clients/keycloak.js';
import { SynapseClient } from './clients/synapse.js';
import { bootstrapSuperAdmin, seedDemo } from './bootstrap.js';
import { loadConfig } from './config.js';
import { logger } from './logger.js';
import { createAgentsService } from './services/agents.js';
import { createRoomsService } from './services/rooms.js';
import { PgStore } from './store/pgStore.js';

const config = loadConfig();

const store = PgStore.fromUrl(config.databaseUrl);
for (let i = 1; ; i += 1) {
  try { await store.init(); break; } catch (e) {
    if (i >= 20) throw e;
    logger.warn('base de données indisponible', { attempt: i });
    await new Promise((r) => setTimeout(r, 3000));
  }
}

const keycloak = new KeycloakClient(config.keycloak);
const synapse = new SynapseClient(config.synapse, config.serverName);
const audit = new AuditLog(store);
const agents = createAgentsService({ store, keycloak, synapse, audit });
const rooms = createRoomsService({ store, synapse, audit });
const verifyToken = createJwtVerifier({
  jwks: `${config.keycloak.url}/realms/${config.keycloak.realm}/protocol/openid-connect/certs`,
  issuer: config.keycloak.issuer,
  audience: config.keycloak.audience,
});

const app = createApp({
  config, store, audit, agents, rooms, verifyToken,
  health: { keycloak: () => keycloak.ping(), synapse: () => synapse.ping() },
});

const server = app.listen(config.port, () => logger.info('API démarrée', { port: config.port }));

// Tâches de fond : ne bloquent pas le démarrage.
(async () => {
  await bootstrapSuperAdmin({ store, keycloak, synapse, audit });
  if (config.demoSeed) {
    const actor = { username: 'superadmin', isSuperAdmin: true, isAdmin: true, ministry: 'Transition digitale', clearance: 2 };
    const created = await seedDemo({ agents, actor });
    if (created.length) {
      // Comptes fictifs : mots de passe temporaires écrits dans un fichier local (jamais dans les logs).
      const { mkdir, writeFile } = await import('node:fs/promises');
      await mkdir(config.stateDir, { recursive: true });
      const lines = created.map((c) => `${c.username}\t${c.temporaryPassword}`).join('\n');
      await writeFile(`${config.stateDir}/demo-credentials.txt`, `${lines}\n`, { mode: 0o600 });
      logger.info('comptes de démonstration créés', { count: created.length, file: `${config.stateDir}/demo-credentials.txt` });
    }
  }
})().catch((e) => logger.error('tâche de démarrage en échec', { message: e.message }));

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => server.close(async () => { await store.close(); process.exit(0); }));
}
