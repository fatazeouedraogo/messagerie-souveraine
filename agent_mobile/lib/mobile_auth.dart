import 'package:flutter_appauth/flutter_appauth.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:ms_core/ms_core.dart';

/// Connexion OpenID Connect (code + PKCE) via le navigateur système (flutter_appauth).
/// Les jetons sont conservés dans le coffre du téléphone (Keystore Android / Keychain iOS).
/// La redirection `bf.gov.messagerie:/oauthredirect` doit être déclarée dans l'app
/// (voir docs/FLUTTER.md) et dans le client Keycloak `agent-mobile`.
class MobileAuthService extends AuthService {
  MobileAuthService(this.config);

  final AppConfig config;
  final _appAuth = const FlutterAppAuth();
  final _store = const FlutterSecureStorage(aOptions: AndroidOptions(encryptedSharedPreferences: true));

  static const redirectUrl = 'bf.gov.messagerie:/oauthredirect';
  static const _kAccess = 'ms.access';
  static const _kRefresh = 'ms.refresh';
  static const _kId = 'ms.id';

  String? _access;
  String? _refresh;
  String? _idToken;

  AuthorizationServiceConfiguration get _service => AuthorizationServiceConfiguration(
        authorizationEndpoint: config.authorizationEndpoint.toString(),
        tokenEndpoint: config.tokenEndpoint.toString(),
        endSessionEndpoint: config.logoutEndpoint.toString(),
      );

  bool get _insecure => config.issuer.startsWith('http://');

  @override
  Future<void> restore() async {
    try {
      _access = await _store.read(key: _kAccess);
      _refresh = await _store.read(key: _kRefresh);
      _idToken = await _store.read(key: _kId);
    } catch (_) {
      await clearLocal();
    }
    if (jwtStillValid(_access) || await _renew()) {
      setSignedIn();
    } else {
      await clearLocal();
      setSignedOut();
    }
  }

  Future<bool> _renew() async {
    final r = _refresh;
    if (r == null) return false;
    try {
      final res = await _appAuth.token(TokenRequest(
        config.clientId,
        redirectUrl,
        serviceConfiguration: _service,
        refreshToken: r,
        scopes: const ['openid', 'profile', 'email'],
        allowInsecureConnections: _insecure,
      ));
      await _keep(res.accessToken, res.refreshToken ?? r, res.idToken ?? _idToken);
      return _access != null;
    } catch (_) {
      return false;
    }
  }

  Future<void> _keep(String? access, String? refresh, String? id) async {
    _access = access;
    _refresh = refresh;
    _idToken = id;
    if (access != null) await _store.write(key: _kAccess, value: access);
    if (refresh != null) await _store.write(key: _kRefresh, value: refresh);
    if (id != null) await _store.write(key: _kId, value: id);
  }

  @override
  Future<void> signIn() async {
    try {
      final res = await _appAuth.authorizeAndExchangeCode(AuthorizationTokenRequest(
        config.clientId,
        redirectUrl,
        serviceConfiguration: _service,
        scopes: const ['openid', 'profile', 'email'],
        allowInsecureConnections: _insecure,
      ));
      if (res.accessToken == null) {
        setSignedOut(message: 'Connexion incomplète. Réessayez.');
        return;
      }
      await _keep(res.accessToken, res.refreshToken, res.idToken);
      setSignedIn();
    } catch (_) {
      // Annulation par l'utilisateur ou échec réseau : on reste sur l'écran de connexion.
      setSignedOut(message: "La connexion n'a pas abouti.");
    }
  }

  @override
  Future<String?> accessToken() async {
    if (jwtStillValid(_access)) return _access;
    return await _renew() ? _access : null;
  }

  @override
  Future<void> signOut() async {
    final id = _idToken;
    await clearLocal();
    setSignedOut();
    if (id != null) {
      try {
        await _appAuth.endSession(EndSessionRequest(
          idTokenHint: id,
          postLogoutRedirectUrl: redirectUrl,
          serviceConfiguration: _service,
          allowInsecureConnections: _insecure,
        ));
      } catch (_) {}
    }
  }

  @override
  Future<void> clearLocal() async {
    _access = _refresh = _idToken = null;
    try {
      await _store.deleteAll();
    } catch (_) {}
  }
}
