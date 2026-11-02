#!/usr/bin/env bash
# Installation en une commande : ./scripts/install.sh
# Génère .env (secrets aléatoires, une seule fois), puis démarre toute la pile.
set -euo pipefail
cd "$(dirname "$0")/.."

command -v docker >/dev/null || { echo "Docker est requis : https://docs.docker.com/engine/install/" >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "Docker Compose v2 est requis." >&2; exit 1; }

rand() { head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c "${1:-40}"; }

if [ ! -f .env ]; then
  DOMAIN_VALUE="${DOMAIN:-gouv.localhost}"
  SCHEME_VALUE="${SCHEME:-http}"
  umask 077
  cat > .env <<EOF
DOMAIN=${DOMAIN_VALUE}
SCHEME=${SCHEME_VALUE}
HTTP_PORT=80
DEMO_SEED=${DEMO_SEED:-true}
POSTGRES_PASSWORD=$(rand)
SYNAPSE_DB_PASSWORD=$(rand)
KC_DB_PASSWORD=$(rand)
API_DB_PASSWORD=$(rand)
KC_BOOTSTRAP_ADMIN_PASSWORD=$(rand)
SYNAPSE_OIDC_SECRET=$(rand)
ADMIN_API_CLIENT_SECRET=$(rand)
SYNAPSE_REGISTRATION_SHARED_SECRET=$(rand 64)
SYNAPSE_MACAROON_SECRET=$(rand 64)
SYNAPSE_FORM_SECRET=$(rand 64)
SUPERADMIN_PASSWORD=Aa1!$(rand 16)
EOF
  echo "Fichier .env créé avec des secrets aléatoires (droits 600)."
else
  echo "Fichier .env existant conservé."
fi

mkdir -p generated
docker compose up -d --build

set -a; . ./.env; set +a
echo
echo "Démarrage en cours (le premier lancement prend 2 à 3 minutes)."
echo "  Messagerie (Element)   : ${SCHEME}://chat.${DOMAIN}"
echo "  Console d'administration : ${SCHEME}://admin.${DOMAIN}"
echo "  API                    : ${SCHEME}://api.${DOMAIN}/health"
echo
echo "Compte super administrateur : superadmin"
echo "Mot de passe temporaire     : ${SUPERADMIN_PASSWORD}"
echo "(à changer à la première connexion, avec configuration du second facteur)"
echo
echo "Vérifier l'état : ./scripts/check.sh"
