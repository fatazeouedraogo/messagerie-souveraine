import { randomUUID } from 'node:crypto';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { authenticate, requireAdmin, requireSuperAdmin } from './auth.js';
import { LEVELS } from './classification.js';
import { HttpError, notFound } from './errors.js';
import { logger } from './logger.js';
import {
  auditQuery, createRoomSchema, directoryQuery, enrollSchema, inviteSchema, listAgentsQuery, parse, revokeSchema, updateSchema,
} from './schemas.js';

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function createApp({ config, store, audit, agents, rooms, verifyToken, health = {} }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));

  app.use((req, res, next) => {
    req.id = randomUUID();
    res.setHeader('x-request-id', req.id);
    const origin = req.get('origin');
    const allowed = String(config.corsOrigin || '').split(',').map((o) => o.trim()).filter(Boolean);
    if (origin && (allowed.includes(origin) || (config.corsLocalhost && /^http:\/\/localhost(:\d+)?$/.test(origin)))) {
      res.setHeader('access-control-allow-origin', origin);
      res.setHeader('vary', 'Origin');
      res.setHeader('access-control-allow-headers', 'authorization, content-type');
      res.setHeader('access-control-allow-methods', 'GET, POST, PATCH, OPTIONS');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  // Santé : sans authentification, aucune donnée sensible.
  app.get('/health', wrap(async (_req, res) => {
    const checks = { database: false, keycloak: false, synapse: false };
    for (const [name, fn] of Object.entries({ database: () => store.ping(), keycloak: health.keycloak, synapse: health.synapse })) {
      try { await fn?.(); checks[name] = true; } catch { checks[name] = false; }
    }
    const ok = Object.values(checks).every(Boolean);
    res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'degraded', checks });
  }));

  app.use(rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }));
  const sensitiveLimit = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false });

  const auth = authenticate({ verifyToken, store });
  const api = express.Router();
  api.use(auth);

  api.get('/me', (req, res) => res.json(req.principal));

  api.get('/classifications', (_req, res) =>
    res.json(Object.entries(LEVELS).map(([id, l]) => ({ id, label: l.label, rank: l.rank, defaultTtlMin: l.defaultTtlMin, restrictions: l.restrictions }))));

  // --- annuaire (tout agent actif) ---
  api.get('/directory', wrap(async (req, res) => res.json(await agents.directory(parse(directoryQuery, req.query).search))));

  // --- agents (administrateurs) ---
  api.get('/agents', requireAdmin, wrap(async (req, res) => res.json(await agents.list(req.principal, parse(listAgentsQuery, req.query)))));
  api.get('/stats', requireAdmin, wrap(async (req, res) => res.json(await agents.stats(req.principal))));
  api.post('/agents', requireAdmin, sensitiveLimit, wrap(async (req, res) => {
    res.status(201).json(await agents.enroll(req.principal, parse(enrollSchema, req.body)));
  }));
  api.get('/agents/:username', requireAdmin, wrap(async (req, res) => res.json(await agents.get(req.principal, req.params.username))));
  api.patch('/agents/:username', requireAdmin, wrap(async (req, res) => {
    res.json(await agents.update(req.principal, req.params.username, parse(updateSchema, req.body)));
  }));
  api.post('/agents/:username/revoke', requireAdmin, sensitiveLimit, wrap(async (req, res) => {
    const { reason } = parse(revokeSchema, req.body);
    res.json(await agents.revoke(req.principal, req.params.username, reason));
  }));
  api.post('/agents/:username/reset-credentials', requireAdmin, sensitiveLimit, wrap(async (req, res) => {
    res.json(await agents.resetCredentials(req.principal, req.params.username));
  }));

  // --- salons (tout agent actif) ---
  api.get('/rooms', wrap(async (req, res) => res.json(await rooms.list(req.principal))));
  api.post('/rooms', wrap(async (req, res) => res.status(201).json(await rooms.create(req.principal, parse(createRoomSchema, req.body)))));
  api.post('/rooms/:roomId/invite', wrap(async (req, res) => {
    res.json(await rooms.invite(req.principal, req.params.roomId, parse(inviteSchema, req.body).username));
  }));

  // --- audit (super administrateur) ---
  api.get('/audit', requireSuperAdmin, wrap(async (req, res) => {
    const q = parse(auditQuery, req.query);
    res.json(await audit.list({ limit: q.limit, beforeSeq: q.before }));
  }));
  api.get('/audit/verify', requireSuperAdmin, wrap(async (_req, res) => res.json(await audit.verify())));

  app.use('/api/v1', api);
  app.use((_req, _res, next) => next(notFound('Route inconnue')));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (err instanceof HttpError) {
      if (err.status >= 500) logger.error('erreur amont', { id: req.id, code: err.code, details: err.details });
      return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details, requestId: req.id } });
    }
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'bad_json', message: 'JSON invalide', requestId: req.id } });
    }
    logger.error('erreur interne', { id: req.id, message: err?.message, stack: err?.stack });
    res.status(500).json({ error: { code: 'internal', message: 'Erreur interne', requestId: req.id } });
  });

  return app;
}
