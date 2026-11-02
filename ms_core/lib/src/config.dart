/// Adresses du serveur, injectées à la compilation :
///   flutter build web --dart-define=API_BASE=https://api.gouv.bf/api/v1 --dart-define=ISSUER=https://auth.gouv.bf/realms/gouv
/// Les valeurs par défaut visent le mode démonstration (`cd api && npm run demo`).
const String _envApi = String.fromEnvironment('API_BASE');
const String _envIssuer = String.fromEnvironment('ISSUER');
const String _envClient = String.fromEnvironment('CLIENT_ID');
const String _envChat = String.fromEnvironment('CHAT_URL');
const bool _envDemo = bool.fromEnvironment('DEMO', defaultValue: false);

class AppConfig {
  const AppConfig({
    required this.apiBase,
    required this.issuer,
    required this.clientId,
    required this.chatUrl,
    required this.demo,
  });

  factory AppConfig.fromEnvironment({required String defaultClientId}) => AppConfig(
        apiBase: _envApi.isEmpty ? 'http://localhost:8080/api/v1' : _envApi,
        issuer: _envIssuer.isEmpty ? 'http://localhost:8080/realms/gouv' : _envIssuer,
        clientId: _envClient.isEmpty ? defaultClientId : _envClient,
        chatUrl: _envChat,
        demo: _envDemo,
      );

  final String apiBase;
  final String issuer;
  final String clientId;

  /// Adresse d'Element (ex. https://chat.gouv.bf), pour ouvrir une conversation. Vide = bouton masqué.
  final String chatUrl;

  /// Affiche un bandeau « mode démonstration ». Mettre --dart-define=DEMO=false en production.
  final bool demo;

  Uri get authorizationEndpoint => Uri.parse('$issuer/protocol/openid-connect/auth');
  Uri get tokenEndpoint => Uri.parse('$issuer/protocol/openid-connect/token');
  Uri get logoutEndpoint => Uri.parse('$issuer/protocol/openid-connect/logout');
  String get discoveryUrl => '$issuer/.well-known/openid-configuration';

  Uri? roomUri(String roomId) =>
      chatUrl.isEmpty ? null : Uri.parse('$chatUrl/#/room/${Uri.encodeComponent(roomId)}');
}
