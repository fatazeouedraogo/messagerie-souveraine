#!/bin/sh
# Crée une base et un utilisateur par composant (moindre privilège : aucun ne voit les autres bases).
# Synapse exige une base en UTF8 avec collation C.
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<SQL
CREATE USER synapse  WITH PASSWORD '${SYNAPSE_DB_PASSWORD}';
CREATE USER keycloak WITH PASSWORD '${KC_DB_PASSWORD}';
CREATE USER adminapi WITH PASSWORD '${API_DB_PASSWORD}';

CREATE DATABASE synapse  ENCODING 'UTF8' LC_COLLATE='C' LC_CTYPE='C' TEMPLATE template0 OWNER synapse;
CREATE DATABASE keycloak ENCODING 'UTF8' TEMPLATE template0 OWNER keycloak;
CREATE DATABASE adminapi ENCODING 'UTF8' TEMPLATE template0 OWNER adminapi;

REVOKE ALL ON DATABASE synapse, keycloak, adminapi FROM PUBLIC;
SQL
