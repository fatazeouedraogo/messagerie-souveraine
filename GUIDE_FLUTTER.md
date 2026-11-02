# Applications Flutter : ce que tu dois faire à la main

Dossiers à la racine : `messagerie-backend/` (serveur), `admin_web/` et `agent_mobile/` (apps), `ms_core/` (paquet partagé, ne pas supprimer : les deux apps en dépendent).

Deux applications partagent un même paquet (`ms_core` : thème, client d'API, écrans de salons) :

| Dossier | Rôle | Cible |
|---|---|---|
| `admin_web` | Console d'administration (tableau de bord, agents, salons, journal) | Web |
| `agent_mobile` | App des agents (salons classifiés, annuaire, profil, ouverture dans Element) | Android / iOS |

> **Important : ce code n'a jamais été compilé** (pas de Flutter dans l'environnement où il a été écrit). Il est relu et cohérent avec l'API (30 tests passent), mais attends-toi à 2 ou 3 petites erreurs de compilation à corriger. Lance `flutter analyze` : elle te dira exactement où. Envoie-moi le texte des erreurs, je corrige.
> La console HTML testée (`messagerie-backend/infra/admin-web`) reste disponible et fonctionne déjà : c'est ton plan B pour la démo.

## 1. Installer (une seule fois)

1. **Flutter SDK 3.24 ou plus** : https://docs.flutter.dev/get-started/install, puis `flutter doctor` et corrige ce qu'il signale.
2. Pour Android : **Android Studio** (SDK + un émulateur). Pour iOS : un Mac avec Xcode.
3. **Chrome** pour le web.

## 2. Générer les dossiers de plateforme (une seule fois)

Les dossiers `android/`, `ios/`, `web/` ne sont pas fournis : Flutter les crée.

```bash
cd admin_web && flutter create . --platforms=web --project-name admin_web   && flutter pub get
cd ../agent_mobile && flutter create . --platforms=android,ios --org bf.gov --project-name agent_mobile && flutter pub get
```

(`flutter create .` ne touche pas à `lib/` ni à `pubspec.yaml` s'ils existent déjà. Si elle remplace `lib/main.dart`, récupère-le depuis le zip.)

## 3. Lancer en démonstration (sans Docker)

Terminal 1 : `cd messagerie-backend/api && npm ci && npm run demo` (écoute sur http://localhost:8080 ; comptes : `superadmin`, `a.ouedraogo`, `f.kabore`… mot de passe affiché sur la page de connexion de démo).

Terminal 2, console web :
```bash
cd admin_web && flutter run -d chrome
```
Terminal 2, mobile (émulateur Android : `localhost` du téléphone n'est pas ton PC, utilise `10.0.2.2`) :
```bash
cd agent_mobile && flutter run \
  --dart-define=API_BASE=http://10.0.2.2:8080/api/v1 \
  --dart-define=ISSUER=http://10.0.2.2:8080/realms/gouv
```
Lance le serveur de démo avec `DEMO_ORIGIN=http://10.0.2.2:8080` si la connexion échoue sur l'émulateur.

## 4. Réglages mobile obligatoires (sinon la connexion ne revient pas dans l'app)

**Android** : dans `agent_mobile/android/app/build.gradle` (ou `.kts`), dans `defaultConfig { ... }` ajoute :
```
manifestPlaceholders += [appAuthRedirectScheme: 'bf.gov.messagerie']
```
et mets `minSdk = 23` (ou `minSdkVersion 23`). Pour tester en `http://` (démo seulement), ajoute `android:usesCleartextTraffic="true"` dans la balise `<application>` de `android/app/src/main/AndroidManifest.xml`. **À retirer en production.**

**iOS** : dans `ios/Runner/Info.plist`, ajoute :
```xml
<key>CFBundleURLTypes</key>
<array><dict>
  <key>CFBundleURLSchemes</key><array><string>bf.gov.messagerie</string></array>
</dict></array>
```

Le client Keycloak `agent-mobile` (déjà dans `messagerie-backend/infra/keycloak/realm-gouv.json`) accepte la redirection `bf.gov.messagerie:/oauthredirect`.

## 5. Mettre en production

Les adresses sont données à la compilation, jamais écrites dans le code :

| Option `--dart-define=` | Exemple |
|---|---|
| `API_BASE` | `https://api.mon-domaine.bf/api/v1` |
| `ISSUER` | `https://auth.mon-domaine.bf/realms/gouv` |
| `CHAT_URL` | `https://chat.mon-domaine.bf` (active « Ouvrir la conversation ») |
| `DEMO` | `false` (retire le bandeau démonstration) |

**Console web** :
```bash
cd admin_web
flutter build web --release --no-web-resources-cdn \
  --dart-define=API_BASE=https://api.mon-domaine.bf/api/v1 \
  --dart-define=ISSUER=https://auth.mon-domaine.bf/realms/gouv --dart-define=DEMO=false
rm -rf ../messagerie-backend/infra/admin-web && cp -r build/web ../messagerie-backend/infra/admin-web
```
`--no-web-resources-cdn` évite de charger quoi que ce soit chez Google (souveraineté). Flutter Web a besoin d'une politique de sécurité (CSP) un peu plus large que la console HTML : dans `messagerie-backend/infra/templates/nginx.conf.tmpl`, bloc `admin`, remplace la CSP par :
```
default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://api.mon-domaine.bf https://auth.mon-domaine.bf; worker-src 'self' blob:; frame-ancestors 'none'
```
La config est compilée dans l'app : plus besoin de `/config.js` pour cette version.

**Mobile** : `flutter build apk --release --dart-define=...` (même options, sans `DEMO`). Pour le Play Store il faut signer l'app : https://docs.flutter.dev/deployment/android

**Polices** (facultatif, plus sobre et hors-ligne) : télécharge *Inter* et *Source Serif 4* (Google Fonts, licence OFL), place les `.ttf` dans `assets/fonts/` de chaque app, décommente le bloc `fonts:` du `pubspec.yaml`, compile avec `--dart-define=BUNDLED_FONTS=true`. Sans cela, Flutter utilise les polices du système : ça marche, c'est juste moins fin.

## 6. Ce que l'app mobile fait et ne fait pas

Fait : connexion Keycloak (2FA, PKCE), salons classifiés (création avec niveau et durée de conservation, invitations avec annuaire), annuaire, profil, accès révoqué = déconnexion immédiate, ouverture de la conversation dans Element.

Ne fait pas : **les messages eux-mêmes.** Le chiffrement de bout en bout (Megolm) est fait par Element ; réécrire un client chiffré sans faille n'a pas sa place dans ce délai. L'interdiction de transfert et de capture d'écran (écrite dans le salon, `bf.gov.classification`) doit être appliquée par un client : c'est le « reste à faire » honnête du projet.
