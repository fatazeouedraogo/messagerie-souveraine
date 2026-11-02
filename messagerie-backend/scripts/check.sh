#!/usr/bin/env bash
# Vérifie que chaque composant répond. Utilise l'en-tête Host : aucune entrée DNS nécessaire.
set -uo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a

ok=0
check() {
  local name="$1" host="$2" path="$3" expect="$4"
  code=$(curl -s -o /dev/null -w '%{http_code}' -H "Host: ${host}" "http://127.0.0.1:${HTTP_PORT:-80}${path}")
  if [ "$code" = "$expect" ]; then echo "  OK   ${name} (${code})"; else echo "  ECHEC ${name} : ${code} (attendu ${expect})"; ok=1; fi
}

echo "Composants"
check "API (santé)"            "api.${DOMAIN}"    /health                      200
check "Synapse (versions)"     "matrix.${DOMAIN}" /_matrix/client/versions     200
check "Element"                "chat.${DOMAIN}"   /                            200
check "Keycloak (royaume)"     "auth.${DOMAIN}"   /realms/gouv/.well-known/openid-configuration 200
check "Console d'administration" "admin.${DOMAIN}" /                           200

echo "Surfaces qui doivent rester fermées"
check "Admin Synapse masquée"  "matrix.${DOMAIN}" /_synapse/admin/v1/server_version 404
check "Console Keycloak masquée" "auth.${DOMAIN}" /admin/master/console/       404
check "API sans jeton refusée" "api.${DOMAIN}"    /api/v1/agents               401

[ $ok -eq 0 ] && echo "Tout est conforme." || { echo "Des vérifications ont échoué : docker compose logs <service>"; exit 1; }
