import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';

enum AuthStatus { loading, signedOut, signedIn }

/// État de connexion partagé. Les sous-classes implémentent le flux OpenID Connect propre à la
/// plateforme (redirection navigateur sur le web, flutter_appauth sur mobile).
abstract class AuthService extends ChangeNotifier {
  AuthStatus status = AuthStatus.loading;

  /// Message à afficher sur l'écran de connexion (session expirée, refus…).
  String? notice;

  /// Vrai si le serveur a répondu `account_revoked` : l'écran affiche « Accès révoqué ».
  bool revoked = false;

  Future<void> restore();
  Future<void> signIn();
  Future<void> signOut();

  /// Jeton d'accès valide (renouvelé si besoin), ou null.
  Future<String?> accessToken();

  /// Efface les jetons conservés localement.
  @protected
  Future<void> clearLocal();

  /// Appelé par le client d'API à toute réponse 401.
  void expire(String code) {
    revoked = code == 'account_revoked';
    notice = revoked ? null : 'Votre session a expiré. Reconnectez-vous.';
    clearLocal();
    status = AuthStatus.signedOut;
    notifyListeners();
  }

  @protected
  void setSignedIn() {
    revoked = false;
    notice = null;
    status = AuthStatus.signedIn;
    notifyListeners();
  }

  @protected
  void setSignedOut({String? message}) {
    notice = message;
    status = AuthStatus.signedOut;
    notifyListeners();
  }
}

/// Paramètres PKCE (RFC 7636) : vérificateur secret, empreinte S256, état anti-rejeu.
class Pkce {
  Pkce._(this.verifier, this.challenge, this.state);

  factory Pkce.generate() {
    final verifier = _randomString(48);
    final challenge = base64Url.encode(sha256.convert(utf8.encode(verifier)).bytes).replaceAll('=', '');
    return Pkce._(verifier, challenge, _randomString(16));
  }

  final String verifier;
  final String challenge;
  final String state;

  static String _randomString(int bytes) {
    final rnd = Random.secure();
    return base64Url.encode(List<int>.generate(bytes, (_) => rnd.nextInt(256))).replaceAll('=', '');
  }
}

/// Date d'expiration (`exp`) d'un jeton JWT, sans vérifier la signature (l'API s'en charge).
DateTime? jwtExpiry(String token) {
  try {
    final part = token.split('.')[1];
    final json = jsonDecode(utf8.decode(base64Url.decode(base64.normalize(part)))) as Map<String, dynamic>;
    final exp = json['exp'];
    return exp is num ? DateTime.fromMillisecondsSinceEpoch(exp.toInt() * 1000) : null;
  } catch (_) {
    return null;
  }
}

bool jwtStillValid(String? token, {Duration margin = const Duration(seconds: 10)}) {
  if (token == null) return false;
  final exp = jwtExpiry(token);
  return exp != null && exp.isAfter(DateTime.now().add(margin));
}
