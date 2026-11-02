import 'package:flutter/material.dart';
import 'package:ms_core/ms_core.dart';

import 'audit.dart' show auditActionLabels;

class DashboardView extends StatefulWidget {
  const DashboardView({super.key});

  @override
  State<DashboardView> createState() => _DashboardViewState();
}

class _DashboardViewState extends State<DashboardView> {
  Stats? _stats;
  int _rooms = 0;
  VerifyResult? _verify;
  List<AuditEntry> _recent = const [];
  Object? _error;
  bool _started = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_started) {
      _started = true;
      _load();
    }
  }

  Future<void> _load() async {
    final s = AppScope.of(context);
    try {
      final stats = await s.api.stats();
      final rooms = await s.api.rooms();
      VerifyResult? verify;
      List<AuditEntry> recent = const [];
      if (s.me.isSuperAdmin) {
        verify = await s.api.verifyAudit();
        recent = await s.api.audit(limit: 7);
      }
      if (!mounted) return;
      setState(() {
        _stats = stats;
        _rooms = rooms.length;
        _verify = verify;
        _recent = recent;
        _error = null;
      });
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final me = s.me;
    final narrow = MediaQuery.of(context).size.width < 700;
    final stats = _stats;

    return RefreshIndicator(
      color: Palette.green,
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: EdgeInsets.fromLTRB(narrow ? 16 : 32, 28, narrow ? 16 : 32, 64),
        children: [
          ViewHeader(title: 'Bonjour ${me.firstName}', subtitle: '${roleLabels[me.role] ?? me.role} · ${me.ministry ?? ''}'),
          if (_error != null) ErrorBox(_error!),
          if (stats == null && _error == null)
            const Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator(color: Palette.green))),
          if (stats != null) ...[
            _Figures(stats: stats, rooms: _rooms),
            const SizedBox(height: 32),
            if (me.isSuperAdmin) _SuperAdminPanels(verify: _verify, recent: _recent, narrow: narrow) else _Perimeter(me: me),
          ],
        ],
      ),
    );
  }
}

class _Figures extends StatelessWidget {
  const _Figures({required this.stats, required this.rooms});
  final Stats stats;
  final int rooms;

  @override
  Widget build(BuildContext context) {
    final revoked = (stats.byStatus['revoked'] ?? 0) + (stats.byStatus['revoking'] ?? 0);
    final ministries = stats.byMinistry.length;
    final items = [
      Figure(stats.byStatus['active'] ?? 0, 'Agents actifs'),
      Figure(revoked, 'Accès révoqués'),
      Figure(rooms, 'Salons chiffrés'),
      Figure(ministries, ministries > 1 ? 'Ministères' : 'Ministère'),
    ];
    return LayoutBuilder(builder: (context, c) {
      final cols = c.maxWidth >= 640 ? 4 : 2;
      final w = c.maxWidth / cols;
      return Container(
        decoration: const BoxDecoration(border: Border(top: BorderSide(color: Palette.ink, width: 2), bottom: BorderSide(color: Palette.line))),
        child: Wrap(children: [
          for (var i = 0; i < items.length; i++)
            Container(
              width: w,
              decoration: BoxDecoration(
                border: Border(
                  left: i % cols == 0 ? BorderSide.none : const BorderSide(color: Palette.line),
                  top: i >= cols ? const BorderSide(color: Palette.line) : BorderSide.none,
                ),
              ),
              child: items[i],
            ),
        ]),
      );
    });
  }
}

class _Perimeter extends StatelessWidget {
  const _Perimeter({required this.me});
  final Principal me;

  @override
  Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Votre périmètre', style: serif(20)),
        const SizedBox(height: 12),
        Wrap(crossAxisAlignment: WrapCrossAlignment.center, spacing: 6, runSpacing: 6, children: [
          Text("Vous gérez les agents du ministère « ${me.ministry} » dont le rôle est « Agent ». Vous pouvez accorder une habilitation jusqu'au niveau", style: kSmall),
          Stamp.rank(me.clearance),
        ]),
      ]);
}

class _SuperAdminPanels extends StatelessWidget {
  const _SuperAdminPanels({required this.verify, required this.recent, required this.narrow});
  final VerifyResult? verify;
  final List<AuditEntry> recent;
  final bool narrow;

  @override
  Widget build(BuildContext context) {
    final v = verify;
    final integrity = Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text('Intégrité du journal', style: serif(20)),
      const SizedBox(height: 12),
      if (v == null)
        const SizedBox.shrink()
      else if (v.ok)
        Notice(title: 'Chaîne intacte', message: '${v.count} entrées. Empreinte de tête ${(v.head ?? '').substring(0, (v.head ?? '').length < 12 ? (v.head ?? '').length : 12)}…', kind: NoticeKind.ok, icon: Icons.shield_outlined)
      else
        Notice(title: 'Chaîne rompue', message: "À partir de l'entrée n° ${v.brokenAt}", kind: NoticeKind.danger, icon: Icons.warning_amber_rounded),
    ]);

    final feed = Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text('Activité récente', style: serif(20)),
      const SizedBox(height: 8),
      for (final e in recent)
        Container(
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: Palette.line))),
          child: narrow
              ? Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(fmtDate(e.ts), style: const TextStyle(fontSize: 12.5, color: Palette.muted)),
                  _feedLine(e),
                ])
              : Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  SizedBox(width: 150, child: Text(fmtDate(e.ts), style: const TextStyle(fontSize: 12.5, color: Palette.muted))),
                  Expanded(child: _feedLine(e)),
                ]),
        ),
    ]);

    return narrow
        ? Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [integrity, const SizedBox(height: 28), feed])
        : Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(flex: 10, child: integrity),
            const SizedBox(width: 40),
            Expanded(flex: 14, child: feed),
          ]);
  }

  Widget _feedLine(AuditEntry e) => Text.rich(
        TextSpan(children: [
          TextSpan(text: auditActionLabels[e.action] ?? e.action, style: const TextStyle(fontWeight: FontWeight.w700)),
          if (e.target != null) TextSpan(text: ' · ${e.target}', style: const TextStyle(fontFamily: 'monospace', fontSize: 12.5)),
          TextSpan(text: '  par ${e.actor}', style: const TextStyle(color: Palette.muted, fontSize: 13)),
        ]),
        style: const TextStyle(fontSize: 14, height: 1.4),
      );
}
