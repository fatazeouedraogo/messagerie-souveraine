import 'package:flutter/material.dart';
import 'package:ms_core/ms_core.dart';

const auditActionLabels = {
  'agent.enroll': 'Enrôlement',
  'agent.revoke.start': 'Révocation engagée',
  'agent.revoke': 'Révocation',
  'agent.update': 'Modification',
  'agent.reset-credentials': "Réinitialisation d'accès",
  'room.create': 'Création de salon',
  'room.invite': 'Invitation',
  'bootstrap.superadmin': 'Initialisation',
};

const _detailKeys = {
  'ministry': 'ministère',
  'role': 'rôle',
  'clearance': 'habilitation',
  'reason': 'motif',
  'durationMs': 'durée (ms)',
  'name': 'nom',
  'level': 'niveau',
  'ttlMs': 'conservation (ms)',
  'invited': 'invités',
  'jobTitle': 'fonction',
};

String _detailText(Map<String, dynamic> d) => d.entries.map((e) => '${_detailKeys[e.key] ?? e.key} : ${e.value}').join(' · ');

/// Registre en ajout seul : chaque ligne contient l'empreinte de la précédente.
class AuditView extends StatefulWidget {
  const AuditView({super.key});

  @override
  State<AuditView> createState() => _AuditViewState();
}

class _AuditViewState extends State<AuditView> {
  static const _page = 40;
  final List<AuditEntry> _rows = [];
  VerifyResult? _verify;
  bool _verifying = false;
  bool _hasMore = false;
  Object? _error;
  bool _started = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_started) {
      _started = true;
      _load(false);
    }
  }

  Future<void> _load(bool append) async {
    final s = AppScope.of(context);
    try {
      final rows = await s.api.audit(limit: _page, before: append && _rows.isNotEmpty ? _rows.last.seq : null);
      if (!mounted) return;
      setState(() {
        if (!append) _rows.clear();
        _rows.addAll(rows);
        _hasMore = rows.length >= _page && _rows.last.seq > 1;
        _error = null;
      });
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _check() async {
    final s = AppScope.of(context);
    setState(() => _verifying = true);
    try {
      final v = await s.api.verifyAudit();
      if (mounted) setState(() => _verify = v);
    } catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _verifying = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final narrow = MediaQuery.of(context).size.width < 700;
    final v = _verify;
    return ListView(
      padding: EdgeInsets.fromLTRB(narrow ? 16 : 32, 28, narrow ? 16 : 32, 64),
      children: [
        ViewHeader(
          title: "Journal d'audit",
          subtitle: "Registre en ajout seul. Chaque ligne contient l'empreinte de la précédente.",
          action: OutlinedButton.icon(
            onPressed: _verifying ? null : _check,
            icon: const Icon(Icons.shield_outlined, size: 18),
            label: Text(_verifying ? 'Vérification…' : "Vérifier l'intégrité"),
          ),
        ),
        if (_error != null) ...[ErrorBox(_error!), const SizedBox(height: 12)],
        if (v != null) ...[
          v.ok
              ? Notice(title: 'Chaîne intacte', message: "${v.count} entrées vérifiées.", kind: NoticeKind.ok, icon: Icons.shield_outlined)
              : Notice(title: 'Chaîne rompue', message: "Une entrée a été modifiée ou supprimée à partir du n° ${v.brokenAt}.", kind: NoticeKind.danger, icon: Icons.warning_amber_rounded),
          const SizedBox(height: 14),
        ],
        Container(
          decoration: BoxDecoration(color: Palette.surface, border: Border.all(color: Palette.line)),
          child: Column(children: [
            for (var i = 0; i < _rows.length; i++) ...[
              if (i > 0) const Divider(),
              _AuditRow(entry: _rows[i], narrow: narrow),
            ],
            if (_rows.isEmpty && _error == null)
              const Padding(padding: EdgeInsets.all(32), child: Text('Aucune entrée.', style: kSmall)),
          ]),
        ),
        if (_hasMore) Padding(padding: const EdgeInsets.only(top: 16), child: Center(child: OutlinedButton(onPressed: () => _load(true), child: const Text('Charger les entrées plus anciennes')))),
      ],
    );
  }
}

class _AuditRow extends StatelessWidget {
  const _AuditRow({required this.entry, required this.narrow});
  final AuditEntry entry;
  final bool narrow;

  @override
  Widget build(BuildContext context) {
    final e = entry;
    final seq = Text(e.seq.toString().padLeft(4, '0'), style: kMono);
    final hash = Text(e.hash.length >= 10 ? e.hash.substring(0, 10) : e.hash, style: kMono.copyWith(color: Palette.muted));
    final main = Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text.rich(TextSpan(children: [
        TextSpan(text: auditActionLabels[e.action] ?? e.action, style: const TextStyle(fontWeight: FontWeight.w700)),
        if (e.target != null) TextSpan(text: '  ${e.target}', style: kMono),
      ])),
      const SizedBox(height: 2),
      Text('${fmtDate(e.ts)} · par ${e.actor}', style: kSmall),
      if (e.details.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 2), child: Text(_detailText(e.details), style: const TextStyle(fontSize: 13, color: Palette.muted))),
    ]);

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: narrow
          ? Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [seq, const Spacer(), hash]),
              const SizedBox(height: 4),
              main,
            ])
          : Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              SizedBox(width: 56, child: seq),
              Expanded(child: main),
              const SizedBox(width: 12),
              hash,
            ]),
    );
  }
}
