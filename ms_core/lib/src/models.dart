class ApiException implements Exception {
  ApiException(this.status, this.code, this.message, [this.details]);

  final int status;
  final String code;
  final String message;
  final Object? details;

  /// Lignes lisibles pour les erreurs de validation (400) ou d'invitation (422).
  List<String> get detailLines {
    final d = details;
    if (d is! List) return const [];
    return d.map<String>((e) {
      if (e is Map) {
        if (e['username'] != null) return '${e['username']} : ${e['reason']}';
        if (e['field'] != null) return '${e['field']} : ${e['message']}';
      }
      return e.toString();
    }).toList();
  }

  @override
  String toString() => message;
}

DateTime? _date(Object? v) => v == null ? null : DateTime.tryParse(v.toString());

class Principal {
  Principal({
    required this.username,
    required this.name,
    required this.ministry,
    required this.jobTitle,
    required this.clearance,
    required this.role,
    required this.isAdmin,
    required this.isSuperAdmin,
  });

  factory Principal.fromJson(Map<String, dynamic> j) => Principal(
        username: j['username'] as String,
        name: (j['name'] ?? j['username']) as String,
        ministry: j['ministry'] as String?,
        jobTitle: j['function'] as String?,
        clearance: (j['clearance'] as num?)?.toInt() ?? 0,
        role: (j['role'] ?? 'agent') as String,
        isAdmin: j['isAdmin'] == true,
        isSuperAdmin: j['isSuperAdmin'] == true,
      );

  final String username;
  final String name;
  final String? ministry;
  final String? jobTitle;
  final int clearance;
  final String role;
  final bool isAdmin;
  final bool isSuperAdmin;

  String get firstName => name.split(' ').first;
}

class Agent {
  Agent({
    required this.username,
    required this.mxid,
    required this.fullName,
    required this.email,
    required this.ministry,
    required this.jobTitle,
    required this.clearance,
    required this.role,
    required this.status,
    required this.createdBy,
    this.createdAt,
    this.revokedAt,
    this.revokedBy,
    this.revokeReason,
  });

  factory Agent.fromJson(Map<String, dynamic> j) => Agent(
        username: j['username'] as String,
        mxid: (j['mxid'] ?? '') as String,
        fullName: j['fullName'] as String,
        email: (j['email'] ?? '') as String,
        ministry: (j['ministry'] ?? '') as String,
        jobTitle: (j['jobTitle'] ?? '') as String,
        clearance: (j['clearance'] as num?)?.toInt() ?? 0,
        role: (j['role'] ?? 'agent') as String,
        status: (j['status'] ?? 'active') as String,
        createdBy: (j['createdBy'] ?? '') as String,
        createdAt: _date(j['createdAt']),
        revokedAt: _date(j['revokedAt']),
        revokedBy: j['revokedBy'] as String?,
        revokeReason: j['revokeReason'] as String?,
      );

  final String username, mxid, fullName, email, ministry, jobTitle, role, status, createdBy;
  final int clearance;
  final DateTime? createdAt, revokedAt;
  final String? revokedBy, revokeReason;
}

class RoomInfo {
  RoomInfo({
    required this.roomId,
    required this.name,
    required this.level,
    required this.ttlMs,
    required this.ministry,
    required this.createdBy,
    this.createdAt,
  });

  factory RoomInfo.fromJson(Map<String, dynamic> j) => RoomInfo(
        roomId: j['roomId'] as String,
        name: j['name'] as String,
        level: (j['level'] ?? 'NORMAL') as String,
        ttlMs: (j['ttlMs'] as num?)?.toInt(),
        ministry: j['ministry'] as String?,
        createdBy: (j['createdBy'] ?? '') as String,
        createdAt: _date(j['createdAt']),
      );

  final String roomId, name, level, createdBy;
  final int? ttlMs;
  final String? ministry;
  final DateTime? createdAt;
}

class Classification {
  Classification({required this.id, required this.label, required this.rank, required this.restrictions});

  factory Classification.fromJson(Map<String, dynamic> j) => Classification(
        id: j['id'] as String,
        label: j['label'] as String,
        rank: (j['rank'] as num).toInt(),
        restrictions: {
          for (final e in ((j['restrictions'] as Map?) ?? const {}).entries) e.key.toString(): e.value == true,
        },
      );

  final String id, label;
  final int rank;
  final Map<String, bool> restrictions;
}

class AuditEntry {
  AuditEntry({required this.seq, required this.ts, required this.actor, required this.action, required this.target, required this.details, required this.hash});

  factory AuditEntry.fromJson(Map<String, dynamic> j) => AuditEntry(
        seq: (j['seq'] as num).toInt(),
        ts: _date(j['ts']),
        actor: j['actor'] as String,
        action: j['action'] as String,
        target: j['target'] as String?,
        details: Map<String, dynamic>.from((j['details'] as Map?) ?? const {}),
        hash: (j['hash'] ?? '') as String,
      );

  final int seq;
  final DateTime? ts;
  final String actor, action, hash;
  final String? target;
  final Map<String, dynamic> details;
}

class VerifyResult {
  VerifyResult({required this.ok, required this.count, this.head, this.brokenAt});

  factory VerifyResult.fromJson(Map<String, dynamic> j) => VerifyResult(
        ok: j['ok'] == true,
        count: (j['count'] as num?)?.toInt() ?? 0,
        head: j['head'] as String?,
        brokenAt: (j['brokenAt'] as num?)?.toInt(),
      );

  final bool ok;
  final int count;
  final String? head;
  final int? brokenAt;
}

class RevokeStep {
  RevokeStep(this.step, this.ms);
  final String step;
  final int ms;
}

class RevokeResult {
  RevokeResult({required this.agent, required this.steps, required this.durationMs, required this.alreadyRevoked});

  factory RevokeResult.fromJson(Map<String, dynamic> j) => RevokeResult(
        agent: Agent.fromJson(Map<String, dynamic>.from(j['agent'] as Map)),
        steps: [
          for (final s in (j['steps'] as List? ?? const []))
            RevokeStep((s as Map)['step'] as String, (s['ms'] as num).toInt()),
        ],
        durationMs: (j['durationMs'] as num?)?.toInt() ?? 0,
        alreadyRevoked: j['alreadyRevoked'] == true,
      );

  final Agent agent;
  final List<RevokeStep> steps;
  final int durationMs;
  final bool alreadyRevoked;
}

class EnrollResult {
  EnrollResult(this.agent, this.temporaryPassword);
  final Agent agent;
  final String temporaryPassword;
}

class DirectoryEntry {
  DirectoryEntry({required this.username, required this.fullName, required this.ministry, required this.jobTitle, required this.clearance});

  factory DirectoryEntry.fromJson(Map<String, dynamic> j) => DirectoryEntry(
        username: j['username'] as String,
        fullName: j['fullName'] as String,
        ministry: (j['ministry'] ?? '') as String,
        jobTitle: (j['jobTitle'] ?? '') as String,
        clearance: (j['clearance'] as num?)?.toInt() ?? 0,
      );

  final String username, fullName, ministry, jobTitle;
  final int clearance;
}

class Stats {
  Stats({required this.total, required this.byStatus, required this.byMinistry});

  factory Stats.fromJson(Map<String, dynamic> j) => Stats(
        total: (j['total'] as num?)?.toInt() ?? 0,
        byStatus: {for (final e in ((j['byStatus'] as Map?) ?? const {}).entries) e.key.toString(): (e.value as num).toInt()},
        byMinistry: {for (final e in ((j['byMinistry'] as Map?) ?? const {}).entries) e.key.toString(): (e.value as num).toInt()},
      );

  final int total;
  final Map<String, int> byStatus, byMinistry;
}
