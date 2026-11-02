// Authentification : jeton d'accès Keycloak (JWT signé) + état du compte dans le registre local.
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { forbidden, unauthorized } from './errors.js';

// `jwks` : URL (chaîne) du point JWKS de Keycloak, ou fonction de résolution de clés (tests).
export function createJwtVerifier({ jwks, issuer, audience }) {
  const keys = typeof jwks === 'string' ? createRemoteJWKSet(new URL(jwks), { cooldownDuration: 30_000 }) : jwks;
  return async (token) => {
    const { payload } = await jwtVerify(token, keys, { issuer, audience, algorithms: ['RS256', 'ES256', 'PS256'] });
    return payload;
  };
}

export function principalFromClaims(claims) {
  const roles = Array.isArray(claims.roles) ? claims.roles : [];
  return {
    sub: claims.sub,
    username: claims.preferred_username,
    name: claims.name ?? claims.preferred_username,
    ministry: claims.ministry ?? null,
    function: claims.function ?? null,
    clearance: Number(claims.clearance ?? 0),
    roles,
    role: roles.includes('super_admin') ? 'super_admin' : roles.includes('admin') ? 'admin' : 'agent',
    isAdmin: roles.includes('admin') || roles.includes('super_admin'),
    isSuperAdmin: roles.includes('super_admin'),
  };
}

export function authenticate({ verifyToken, store }) {
  return async (req, _res, next) => {
    try {
      const header = req.get('authorization') ?? '';
      const match = /^Bearer (.+)$/i.exec(header);
      if (!match) throw unauthorized();

      let claims;
      try {
        claims = await verifyToken(match[1]);
      } catch {
        throw unauthorized('Jeton invalide ou expiré', 'invalid_token');
      }
      if (!claims.preferred_username) throw unauthorized('Jeton sans identité', 'invalid_token');

      const principal = principalFromClaims(claims);

      // Le registre local fait foi : un agent révoqué est refusé immédiatement,
      // sans attendre l'expiration de son jeton (quelques minutes).
      const agent = await store.getAgent(principal.username);
      if (agent) {
        if (agent.status === 'revoked' || agent.status === 'revoking') {
          throw unauthorized('Compte révoqué', 'account_revoked');
        }
        principal.ministry = agent.ministry;
        principal.clearance = agent.clearance;
        principal.function = agent.jobTitle;
        if (agent.role === 'admin' && !principal.isSuperAdmin) {
          principal.role = 'admin';
          principal.isAdmin = true;
        } else if (agent.role === 'agent' && !principal.isSuperAdmin) {
          // Un rôle retiré dans le registre prime sur un jeton encore valide.
          principal.role = 'agent';
          principal.isAdmin = false;
        }
      }

      req.principal = principal;
      next();
    } catch (e) {
      next(e);
    }
  };
}

export const requireAdmin = (req, _res, next) => (req.principal?.isAdmin ? next() : next(forbidden("Réservé aux administrateurs")));
export const requireSuperAdmin = (req, _res, next) =>
  req.principal?.isSuperAdmin ? next() : next(forbidden('Réservé au super administrateur'));

// Un administrateur de ministère gère les agents de SON ministère ; seul le super
// administrateur gère les autres administrateurs et les autres ministères.
export function canManage(principal, target) {
  if (principal.isSuperAdmin) return true;
  if (!principal.isAdmin) return false;
  return target.ministry === principal.ministry && target.role === 'agent';
}
