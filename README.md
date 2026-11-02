# Messagerie souveraine de l'administration

Messagerie instantanée (messages, groupes, fichiers) pour les agents de l'administration publique du Burkina Faso, **hébergée sur un serveur de l'État, sans service externe**.

> **Niveau d'engagement : « Étendre et adapter »** (Matrix/Synapse + Element, puis un client Flutter adapté, voir « Reste à faire »).
> Aucune cryptographie n'a été écrite par l'équipe : le chiffrement de bout en bout est celui de Matrix (Olm/Megolm).

## Installation (une commande)

Prérequis : un serveur Linux avec Docker et Docker Compose v2.

```bash
cd messagerie-backend
./scripts/install.sh      # génère les secrets, démarre toute la pile
./scripts/check.sh        # vérifie chaque composant
```

Par défaut le domaine d'essai est `gouv.localhost` (HTTP, sur la machine). Pour un vrai domaine : `DOMAIN=messagerie.gouv.bf SCHEME=https ./scripts/install.sh` (certificat TLS à placer devant Nginx, voir `messagerie-backend/docs/BACKEND.md`).

## Voir l'interface tout de suite (sans Docker)

```bash
cd messagerie-backend/api && npm install && npm run demo      # puis ouvrir http://localhost:8080
```
Lance la vraie API avec des données fictives et une **simulation** de la connexion Keycloak (aucun mot de passe). Idéal pour la vidéo de démonstration. Tout est perdu à l'arrêt.

## Ce que fait le backend

| Besoin du défi | Réalisation |
|---|---|
| Chiffrement de bout en bout | Megolm activé par défaut sur tous les salons (`encryption_enabled_by_default_for_room_type: all`) ; salons classifiés créés avec le chiffrement posé dès la création (irréversible) |
| Enrôlement fermé | Inscription publique désactivée (Synapse **et** Keycloak). Seul un administrateur crée un compte, via `POST /api/v1/agents` |
| Second facteur | Keycloak : mot de passe + TOTP (application d'authentification), configuration obligatoire à la première connexion |
| Rôles | `agent`, `admin` (son ministère), `super_admin` (tout + audit) |
| Révocation immédiate | `POST /api/v1/agents/:username/revoke` : blocage dans l'API, Keycloak (compte + sessions), Synapse (appareils, jetons, salons), puis **vérification de l'état réel** |
| Aucun service externe | Toutes les images tournent sur le serveur ; fédération désactivée ; aperçus d'URL désactivés |
| Innovation : niveaux de classification | `NORMAL`, `DIFFUSION_RESTREINTE`, `CONFIDENTIEL` : habilitation vérifiée à la création et à chaque invitation, durée de conservation appliquée par Synapse |
| Traçabilité | Journal d'audit chaîné par SHA-256, vérifiable (`GET /api/v1/audit/verify`) |

Détails, limites connues et métadonnées visibles par le serveur : [`messagerie-backend/docs/BACKEND.md`](messagerie-backend/docs/BACKEND.md) et [`messagerie-backend/docs/METADONNEES.md`](messagerie-backend/docs/METADONNEES.md).

## Structure

```
messagerie-backend/   Serveur : API, Keycloak, Synapse, Nginx, Docker, docs, tests
  api/                API d'administration (Node.js, 30 tests : cd api && npm test), api/dev = démo
  infra/              Keycloak, modèles Synapse/Nginx/Element, PostgreSQL, console HTML (infra/admin-web)
  scripts/            install.sh, check.sh
  tests/e2e/          parcours navigateur (Playwright)
  docs/               documentation technique
  docker-compose.yml
admin_web/            Console d'administration Flutter Web (jamais compilée)
agent_mobile/         App mobile des agents Flutter (jamais compilée)
ms_core/              Paquet Flutter partagé (thème, client d'API, écrans)
GUIDE_FLUTTER.md      Ce qu'il faut installer et régler à la main
```

## Console web

Accessible sur `admin.<domaine>` : tableau de bord, agents (enrôlement, modification, réinitialisation d'accès, **révocation avec preuve de l'état réel**), salons classifiés (création, invitations, contrôle d'habilitation), journal d'audit avec vérification d'intégrité. Responsive : utilisable sur téléphone. Connexion OpenID Connect + PKCE, aucune ressource externe (pas de CDN, pas de police distante).

## Reste à faire

- **Messagerie dans un client Flutter** (fork de FluffyChat) : application côté client des restrictions « pas de transfert » / « pas de capture d'écran » et interface en langue nationale. Guide : [`GUIDE_FLUTTER.md`](GUIDE_FLUTTER.md). En attendant, Element fait la messagerie chiffrée.

## Licence

GNU AGPL v3 (voir `LICENSE`), compatible avec Synapse, Element et FluffyChat.
