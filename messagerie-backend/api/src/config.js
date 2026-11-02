// Configuration par variables d'environnement. Aucune valeur secrète n'a de défaut.
export function loadConfig(env = process.env) {
  const need = (key) => {
    const value = env[key];
    if (!value) throw new Error(`Variable d'environnement manquante : ${key}`);
    return value;
  };

  const scheme = env.PUBLIC_SCHEME || 'https';
  if (!['http', 'https'].includes(scheme)) throw new Error('PUBLIC_SCHEME doit valoir http ou https');
  const domain = need('DOMAIN');
  const realm = env.KEYCLOAK_REALM || 'gouv';

  return Object.freeze({
    port: Number(env.PORT || 3000),
    scheme,
    domain,
    serverName: env.SYNAPSE_SERVER_NAME || domain,
    corsOrigin: env.CORS_ORIGIN || `${scheme}://admin.${domain}`,
    stateDir: env.STATE_DIR || '/state',
    databaseUrl: need('DATABASE_URL'),
    demoSeed: env.DEMO_SEED === 'true',
    keycloak: Object.freeze({
      url: need('KEYCLOAK_URL'),
      realm,
      issuer: env.KEYCLOAK_ISSUER || `${scheme}://auth.${domain}/realms/${realm}`,
      clientId: env.ADMIN_API_CLIENT_ID || 'admin-api',
      clientSecret: need('ADMIN_API_CLIENT_SECRET'),
      audience: env.API_AUDIENCE || 'admin-api',
    }),
    synapse: Object.freeze({
      url: need('SYNAPSE_URL'),
      sharedSecret: need('SYNAPSE_REGISTRATION_SHARED_SECRET'),
      serviceUser: env.SYNAPSE_SERVICE_USER || 'svc-greffier',
    }),
  });
}
