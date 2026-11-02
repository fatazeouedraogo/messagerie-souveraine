import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'models.dart';

typedef TokenProvider = Future<String?> Function();

/// Client de l'API d'administration (même contrat que la console HTML testée).
/// Toute réponse 401 déclenche [onUnauthorized] avec le code d'erreur (ex. `account_revoked`).
class ApiClient {
  ApiClient({
    required this.baseUrl,
    required this.token,
    required this.onUnauthorized,
    http.Client? client,
  }) : _client = client ?? http.Client();

  final String baseUrl;
  final TokenProvider token;
  final void Function(String code) onUnauthorized;
  final http.Client _client;

  Future<dynamic> _send(String method, String path, {Object? body, Map<String, String>? query}) async {
    final t = await token();
    if (t == null) {
      onUnauthorized('session_expired');
      throw ApiException(401, 'session_expired', 'Session expirée : reconnectez-vous.');
    }

    var uri = Uri.parse('$baseUrl$path');
    if (query != null && query.isNotEmpty) uri = uri.replace(queryParameters: query);

    final req = http.Request(method, uri)..headers['authorization'] = 'Bearer $t';
    if (body != null) {
      req.headers['content-type'] = 'application/json';
      req.body = jsonEncode(body);
    }

    http.Response res;
    try {
      final streamed = await _client.send(req).timeout(const Duration(seconds: 20));
      res = await http.Response.fromStream(streamed);
    } catch (_) {
      throw ApiException(0, 'network', 'Serveur injoignable. Vérifiez la connexion au réseau.');
    }

    dynamic data;
    if (res.bodyBytes.isNotEmpty) {
      try {
        data = jsonDecode(utf8.decode(res.bodyBytes));
      } catch (_) {
        data = null;
      }
    }

    if (res.statusCode >= 200 && res.statusCode < 300) return data;

    final err = (data is Map && data['error'] is Map) ? data['error'] as Map : const {};
    final code = (err['code'] ?? 'error').toString();
    if (res.statusCode == 401) onUnauthorized(code);
    throw ApiException(res.statusCode, code, (err['message'] ?? 'Erreur ${res.statusCode}').toString(), err['details']);
  }

  Map<String, dynamic> _map(dynamic v) => Map<String, dynamic>.from(v as Map);
  List<Map<String, dynamic>> _list(dynamic v) => [for (final e in (v as List)) Map<String, dynamic>.from(e as Map)];

  // --- profil et référentiels ---
  Future<Principal> me() async => Principal.fromJson(_map(await _send('GET', '/me')));
  Future<List<Classification>> classifications() async =>
      _list(await _send('GET', '/classifications')).map(Classification.fromJson).toList();

  // --- agents (administrateurs) ---
  Future<Stats> stats() async => Stats.fromJson(_map(await _send('GET', '/stats')));

  Future<List<Agent>> agents({String search = '', String status = ''}) async => _list(await _send('GET', '/agents', query: {
        if (search.isNotEmpty) 'search': search,
        if (status.isNotEmpty) 'status': status,
      })).map(Agent.fromJson).toList();

  Future<EnrollResult> enroll(Map<String, dynamic> body) async {
    final j = _map(await _send('POST', '/agents', body: body));
    return EnrollResult(Agent.fromJson(_map(j['agent'])), j['temporaryPassword'] as String);
  }

  Future<Agent> updateAgent(String username, Map<String, dynamic> patch) async =>
      Agent.fromJson(_map(await _send('PATCH', '/agents/${Uri.encodeComponent(username)}', body: patch)));

  Future<RevokeResult> revoke(String username, String reason) async => RevokeResult.fromJson(
      _map(await _send('POST', '/agents/${Uri.encodeComponent(username)}/revoke', body: {'reason': reason})));

  Future<String> resetCredentials(String username) async {
    final j = _map(await _send('POST', '/agents/${Uri.encodeComponent(username)}/reset-credentials'));
    return j['temporaryPassword'] as String;
  }

  // --- annuaire (tout agent) ---
  Future<List<DirectoryEntry>> directory(String search) async =>
      _list(await _send('GET', '/directory', query: {'search': search})).map(DirectoryEntry.fromJson).toList();

  // --- salons ---
  Future<List<RoomInfo>> rooms() async => _list(await _send('GET', '/rooms')).map(RoomInfo.fromJson).toList();

  Future<RoomInfo> createRoom({required String name, required String level, int? ttlMinutes, List<String> invite = const []}) async =>
      RoomInfo.fromJson(_map(await _send('POST', '/rooms', body: {
        'name': name,
        'level': level,
        if (ttlMinutes != null) 'ttlMinutes': ttlMinutes,
        'invite': invite,
      })));

  Future<void> invite(String roomId, String username) async =>
      _send('POST', '/rooms/${Uri.encodeComponent(roomId)}/invite', body: {'username': username});

  // --- journal d'audit (super administrateur) ---
  Future<List<AuditEntry>> audit({int limit = 40, int? before}) async => _list(await _send('GET', '/audit', query: {
        'limit': '$limit',
        if (before != null) 'before': '$before',
      })).map(AuditEntry.fromJson).toList();

  Future<VerifyResult> verifyAudit() async => VerifyResult.fromJson(_map(await _send('GET', '/audit/verify')));
}
