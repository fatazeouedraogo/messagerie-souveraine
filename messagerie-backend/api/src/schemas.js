import { z } from 'zod';
import { badRequest } from './errors.js';
import { LEVEL_NAMES } from './classification.js';

const username = z.string().regex(/^[a-z0-9][a-z0-9._-]{2,31}$/, 'Identifiant : 3 à 32 caractères (a-z, 0-9, . _ -)');
const text = (max = 120) => z.string().trim().min(1).max(max);

export const enrollSchema = z.object({
  username,
  fullName: text(),
  email: z.string().trim().email().max(160),
  ministry: text(80),
  jobTitle: text(80).default('Agent'),
  clearance: z.number().int().min(0).max(2).default(0),
  role: z.enum(['agent', 'admin']).default('agent'),
}).strict();

export const updateSchema = z.object({
  jobTitle: text(80).optional(),
  ministry: text(80).optional(),
  clearance: z.number().int().min(0).max(2).optional(),
  role: z.enum(['agent', 'admin']).optional(),
}).strict().refine((o) => Object.keys(o).length > 0, 'Aucun champ à modifier');

export const revokeSchema = z.object({ reason: text(300) }).strict();

export const createRoomSchema = z.object({
  name: text(100),
  level: z.enum(LEVEL_NAMES),
  ttlMinutes: z.number().int().positive().optional(),
  invite: z.array(username).max(200).default([]),
}).strict();

export const inviteSchema = z.object({ username }).strict();

export const listAgentsQuery = z.object({
  ministry: z.string().max(80).optional(),
  status: z.enum(['active', 'revoking', 'revoked']).optional(),
  search: z.string().max(80).optional(),
});

export const auditQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  before: z.coerce.number().int().positive().optional(),
});

export const directoryQuery = z.object({ search: z.string().trim().min(2).max(80) });

export function parse(schema, data) {
  const result = schema.safeParse(data ?? {});
  if (!result.success) {
    throw badRequest('Données invalides', result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));
  }
  return result.data;
}
