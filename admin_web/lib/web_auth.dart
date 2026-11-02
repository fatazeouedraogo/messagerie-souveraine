import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:ms_core/ms_core.dart';
import 'package:web/web.dart' as web;

/// Connexion OpenID Connect (code d'autorisation + PKCE) par redirection du navigateur.
/// Le jeton d'accès (5 min) est gardé dans sessionStorage : effacé à la fermeture de l'onglet.
class WebAuthService extends AuthService {
  WebAuthService(this.config);

  final AppConfig config;
  String? _token;

  static const _kToken = 'ms.token';
  static const _kFlow = 'ms.flow';

  String get _redirect => '${web.window.location.origin}/';

  @override
  Future<void> restore() async {
    final q = Uri.base.queryParameters;
    if (q.containsKey('code') || q.containsKey('error')) {
      await _handleCallback(q);
      return;
    }
    final saved = web.window.sessionStorage.getItem(_kToken);
    if (jwtStillValid(saved)) {
      _token = saved;
      setSignedIn();
    } else {
      await clearLocal();
      setSignedOut();
    }
  }

  Future<void> _handleCallback(Map<String, String> q) async {
    final flowRaw = web.window.sessionStorage.getItem(_kFlow);
    web.window.sessionStorage.removeItem(_kFlow);
    // Retire ?code=… de la barre d'adresse (le code est à usage unique).
    web.window.history.replaceState(null, '', web.window.location.pathname);

    if (q.containsKey('error')) {
      setSignedOut(message: 'La connexion a été refusée.');
      return;
    }
    Map<String, dynamic>? flow;
    try {
      flow = jsonDecode(flowRaw ?? 'null') as Map<String, dynamic>?;
    } catch (_) {
      flow = null;
    }
    if (flow == null || q['state'] != flow['state']) {
      setSignedOut(message: 'Réponse de connexion invalide (état inattendu).');
      return;
    }
    try {
      final res = await http.post(config.tokenEndpoint, body: {
        'grant_type': 'authorization_code',
        'client_id': config.clientId,
        'code': q['code']!,
        'code_verifier': flow['verifier'] as String,
        'redirect_uri': _redirect,
      });
      if (res.statusCode != 200) throw Exception('token');
      _token = (jsonDecode(res.body) as Map<String, dynamic>)['access_token'] as String;
      web.window.sessionStorage.setItem(_kToken, _token!);
      setSignedIn();
    } catch (_) {
      setSignedOut(message: "Impossible d'obtenir le jeton de connexion.");
    }
  }

  @override
  Future<void> signIn() async {
    final pkce = Pkce.generate();
    web.window.sessionStorage.setItem(_kFlow, jsonEncode({'verifier': pkce.verifier, 'state': pkce.state}));
    final url = config.authorizationEndpoint.replace(queryParameters: {
      'client_id': config.clientId,
      'response_type': 'code',
      'scope': 'openid profile email',
      'redirect_uri': _redirect,
      'state': pkce.state,
      'code_challenge': pkce.challenge,
      'code_challenge_method': 'S256',
    });
    web.window.location.assign(url.toString());
  }

  @override
  Future<String?> accessToken() async => jwtStillValid(_token) ? _token : null;

  @override
  Future<void> signOut() async {
    await clearLocal();
    final url = config.logoutEndpoint.replace(queryParameters: {
      'client_id': config.clientId,
      'post_logout_redirect_uri': _redirect,
    });
    web.window.location.assign(url.toString());
  }

  @override
  Future<void> clearLocal() async {
    _token = null;
    web.window.sessionStorage.removeItem(_kToken);
  }
}
