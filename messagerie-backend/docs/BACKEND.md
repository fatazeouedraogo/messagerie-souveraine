# Documentation technique du backend

## 1. Architecture

```
Internet / réseau de l'État
        │ :80 (TLS à ajouter en production)
     ┌──▼──┐
     │Nginx│  point d'entrée unique, limitation de débit, console Keycloak et admin Synapse masquées
     └─┬───┘
  ┌────┼──────────┬───────────┬──────────┐
  ▼    ▼          ▼           ▼          ▼
Element Synapse  Keycloak    API admin  Console web
(client) (Matrix) (identités  (Node.js)  (frontend)
          │       + TOTP)       │
          └────────┬────────────┘
               PostgreSQL (3 bases, 3 utilisateurs séparés)
```

Sous-domaines : `chat.` (Element), `matrix.` (Synapse), `auth.` (Keycloak), `api.` (API), `admin.` (console).

## 2. Authentification

1. L'agent ouvre Element, qui redirige vers Keycloak (SSO OIDC).
2. Keycloak demande mot de passe **puis** code TOTP. Première connexion : changement de mot de passe + configuration du TOTP obligatoires (politique : 14 caractères minimum, majuscule, minuscule, chiffre, spécial).
3. Verrouillage progressif après 5 échecs (protection contre le bourrage d'identifiants).
4. Jetons d'accès de 5 minutes ; session SSO limitée à 30 min d'inactivité / 10 h.
5. Les comptes agents Synapse sont créés **sans mot de passe local** : la seule porte d'entrée est le SSO.

Exception documentée : le compte de service de l'API (`svc-greffier`) a un mot de passe dérivé du secret partagé d'enregistrement de Synapse. Il peut gérer les salons mais n'a **aucune clé de chiffrement** : il ne peut lire aucun message.

## 3. Rôles et périmètres

| Action | agent | admin | super_admin |
|---|---|---|---|
| Créer un salon (selon habilitation) | oui | oui | oui |
| Enrôler / révoquer / modifier un agent | non | son ministère, rôle agent seulement | tous |
| Nommer un administrateur | non | non | oui |
| Accorder une habilitation | non | jusqu'à la sienne | toutes |
| Lire le journal d'audit | non | non | oui |

Un administrateur ne peut ni se révoquer, ni modifier son propre rôle ou son habilitation.

## 4. Révocation

`POST /api/v1/agents/:username/revoke` avec `{ "reason": "..." }` :

1. **Registre** : statut `revoking`. L'API refuse l'agent immédiatement, même avec un jeton encore valide (testé).
2. **Keycloak** : compte désactivé, sessions fermées. Un événement de déconnexion « backchannel » est aussi envoyé à Synapse.
3. **Synapse** : compte désactivé, tous les appareils et jetons supprimés, sortie des salons.
4. **Vérification** : l'API relit l'état réel (Synapse : désactivé, 0 appareil ; Keycloak : désactivé). Sinon la révocation échoue et l'agent reste `revoking` (donc bloqué) ; l'appel est rejouable.

La réponse donne la durée de chaque étape.

**Limite connue** : un message déjà déchiffré et lu par l'agent avant sa révocation reste lisible sur son appareil tant que l'appareil n'est pas effacé. Aucun système de messagerie ne peut l'empêcher.

## 5. Salons classifiés

| Niveau | Habilitation requise | Conservation par défaut | Historique | Restrictions déclarées au client |
|---|---|---|---|---|
| `NORMAL` | 0 | illimitée | partagé | aucune |
| `DIFFUSION_RESTREINTE` | 1 | 30 jours | depuis l'invitation | pas de transfert |
| `CONFIDENTIEL` | 2 | 24 h | depuis l'invitation | pas de transfert, pas de capture |

**Appliqué par le serveur** : chiffrement (événement posé à la création), salon sur invitation, pas de fédération, durée de conservation (Synapse purge toutes les 5 min les salons à courte durée), habilitation de chaque invité vérifiée.

**Déclaré mais appliqué par le client** : « pas de transfert » et « pas de capture d'écran » sont écrits dans l'événement d'état `bf.gov.classification`. Un client modifié peut les ignorer : ce sont des garde-fous d'usage, pas une garantie cryptographique. À implémenter dans le client Flutter.

Bornes de durée : 5 minutes à 1 an.

## 6. Journal d'audit

Chaque action sensible (enrôlement, révocation, changement de rôle, création de salon, invitation) ajoute une ligne contenant l'empreinte SHA-256 de la ligne précédente. Modifier ou supprimer une ligne casse la chaîne : `GET /api/v1/audit/verify` renvoie `{ ok: false, brokenAt: N }` (testé).

Limite : un administrateur de base de données qui réécrit **toute** la chaîne depuis le début ne serait pas détecté. Pour s'en protéger, exporter régulièrement l'empreinte de tête (`head`) vers un support séparé.

## 7. Points d'API

Préfixe `/api/v1`, jeton `Authorization: Bearer <JWT Keycloak>`.

| Méthode | Chemin | Rôle |
|---|---|---|
| GET | `/me` | profil du jeton |
| GET | `/classifications` | niveaux disponibles |
| GET / POST | `/agents` | lister / enrôler (admin) |
| GET / PATCH | `/agents/:username` | consulter / modifier (admin) |
| POST | `/agents/:username/revoke` | révoquer (admin) |
| POST | `/agents/:username/reset-credentials` | téléphone perdu : nouveau mot de passe temporaire, TOTP à reconfigurer (admin) |
| GET | `/stats` | compteurs (admin) |
| GET / POST | `/rooms` | lister / créer un salon classifié |
| POST | `/rooms/:roomId/invite` | inviter (créateur ou admin) |
| GET | `/audit`, `/audit/verify` | journal (super_admin) |
| GET | `/health` (hors `/api/v1`) | santé des dépendances |

## 8. Passage en production

- **TLS** : placer un certificat valide devant Nginx (ou ajouter un bloc `listen 443 ssl` dans `infra/templates/nginx.conf.tmpl`), puis `SCHEME=https`.
- Changer `DEMO_SEED=false` : les 5 comptes fictifs de démonstration ne doivent pas exister en production.
- Sauvegarder les volumes `pg-data` et `synapse-data` (la clé de signature de Synapse est dans `synapse-data`).
- Épingler et mettre à jour régulièrement les versions d'images dans `docker-compose.yml`.

## 9. Ce qui n'a pas pu être testé ici

L'environnement de développement n'avait pas de démon Docker actif ni accès au registre d'images. Ont été vérifiés : **la console web dans un vrai navigateur** (parcours complet : connexion PKCE, enrôlement, doublon refusé, révocation, salon refusé pour habilitation insuffisante, création, journal et vérification de la chaîne, droits d'un agent simple, mobile sans défilement horizontal, zéro violation de la politique CSP) contre la vraie API ; les 30 tests de l'API (logique métier, rôles, révocation, audit, classification, avec faux services Keycloak/Synapse), la validité du `docker-compose.yml` (`docker compose config`), du royaume Keycloak (JSON), des modèles de configuration rendus (YAML/JSON) et de la syntaxe des scripts.

**Non vérifié en conditions réelles** : le démarrage conjoint des conteneurs, l'import du royaume Keycloak, la connexion SSO Synapse ↔ Keycloak, les appels réels aux API de Synapse et de Keycloak, la configuration Nginx, et l'existence des étiquettes d'images pinées. Le premier `./scripts/install.sh` sur une machine avec Docker servira de test d'intégration ; consulter `docker compose logs <service>` en cas d'échec.

## 10. Ajouts récents

- `GET /api/v1/directory?search=` : annuaire des agents actifs (nom, ministère, fonction, habilitation), utilisé pour inviter dans les salons. 2 lettres minimum, 20 résultats.
- Client Keycloak `agent-mobile` (public, PKCE) pour l'application Flutter.
- `CORS_ORIGIN` accepte plusieurs origines séparées par des virgules.
- Les applications Flutter (`admin_web`, `agent_mobile`) n'ont pas été compilées dans l'environnement de développement.
