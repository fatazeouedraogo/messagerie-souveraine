import 'package:flutter/material.dart';

import 'models.dart';
import 'theme.dart';

// --- classification ---
const levelOrder = ['NORMAL', 'DIFFUSION_RESTREINTE', 'CONFIDENTIEL'];
const levelLabels = {'NORMAL': 'Normal', 'DIFFUSION_RESTREINTE': 'Diffusion restreinte', 'CONFIDENTIEL': 'Confidentiel'};
const levelBlurbs = {
  'NORMAL': 'Échanges courants. Chiffré, sur invitation, conservation illimitée.',
  'DIFFUSION_RESTREINTE': 'Effacement automatique sous 30 jours par défaut. Pas de transfert.',
  'CONFIDENTIEL': 'Effacement automatique sous 24 h par défaut. Pas de transfert, pas de capture.',
};
const roleLabels = {'agent': 'Agent', 'admin': 'Administrateur', 'super_admin': 'Super administrateur'};
const statusLabels = {'active': 'Actif', 'revoking': 'Révocation en cours', 'revoked': 'Révoqué'};

String levelOfRank(int r) => levelOrder[r < 0 ? 0 : (r > 2 ? 2 : r)];
int rankOfLevel(String level) {
  final i = levelOrder.indexOf(level);
  return i < 0 ? 0 : i;
}

Color levelColor(int rank) => rank >= 2 ? Palette.red : (rank == 1 ? Palette.amber : Palette.level0);

/// Cachet de classification (bordure fine, capitales espacées), comme sur un document officiel.
class Stamp extends StatelessWidget {
  const Stamp({super.key, required this.level});
  factory Stamp.rank(int rank, {Key? key}) => Stamp(key: key, level: levelOfRank(rank));

  final String level;

  @override
  Widget build(BuildContext context) {
    final c = levelColor(rankOfLevel(level));
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 1),
      decoration: BoxDecoration(border: Border.all(color: c, width: 1.5), borderRadius: BorderRadius.circular(2)),
      child: Text(
        (levelLabels[level] ?? level).toUpperCase(),
        style: TextStyle(color: c, fontSize: 10.5, fontWeight: FontWeight.w700, letterSpacing: 0.7, height: 1.5),
      ),
    );
  }
}

/// Bandeau national : rouge au-dessus, vert dessous (discret, 6 px).
class FlagBar extends StatelessWidget {
  const FlagBar({super.key});

  @override
  Widget build(BuildContext context) => const SizedBox(
        height: 6,
        child: Column(children: [
          Expanded(child: SizedBox.expand(child: ColoredBox(color: Color(0xFFC8312A)))),
          Expanded(child: SizedBox.expand(child: ColoredBox(color: Palette.green))),
        ]),
      );
}

class BrandMark extends StatelessWidget {
  const BrandMark({super.key, this.size = 34});
  final double size;

  @override
  Widget build(BuildContext context) => Container(
        width: size,
        height: size,
        decoration: BoxDecoration(color: Palette.green, borderRadius: BorderRadius.circular(6)),
        child: Icon(Icons.lock_outline, color: Colors.white, size: size * 0.55),
      );
}

String initialsOf(String name) {
  final parts = name.split(RegExp(r'\s+')).where((p) => p.isNotEmpty).take(2);
  return parts.map((p) => p[0].toUpperCase()).join();
}

class InitialsAvatar extends StatelessWidget {
  const InitialsAvatar(this.name, {super.key, this.size = 32});
  final String name;
  final double size;

  @override
  Widget build(BuildContext context) => Container(
        width: size,
        height: size,
        alignment: Alignment.center,
        decoration: const BoxDecoration(color: Palette.greenTint, shape: BoxShape.circle),
        child: Text(initialsOf(name), style: TextStyle(color: Palette.greenInk, fontWeight: FontWeight.w800, fontSize: size * 0.36)),
      );
}

class StatusMark extends StatelessWidget {
  const StatusMark(this.status, {super.key});
  final String status;

  @override
  Widget build(BuildContext context) {
    final c = status == 'revoked' ? Palette.red : (status == 'revoking' ? Palette.amber : Palette.green);
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Container(width: 8, height: 8, decoration: BoxDecoration(color: c, shape: BoxShape.circle)),
      const SizedBox(width: 7),
      Text(statusLabels[status] ?? status, style: const TextStyle(fontSize: 13)),
    ]);
  }
}

enum NoticeKind { warn, danger, ok }

/// Encadré à filet gauche : avertissement (ambre), danger (rouge), succès (vert).
class Notice extends StatelessWidget {
  const Notice({super.key, required this.title, this.message, this.kind = NoticeKind.warn, this.icon});
  final String title;
  final String? message;
  final NoticeKind kind;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final (bg, bar) = switch (kind) {
      NoticeKind.danger => (Palette.redTint, Palette.red),
      NoticeKind.ok => (Palette.greenTint, Palette.green),
      NoticeKind.warn => (Palette.amberTint, Palette.amber),
    };
    final ic = icon ??
        switch (kind) {
          NoticeKind.danger => Icons.lock_outline,
          NoticeKind.ok => Icons.verified_user_outlined,
          NoticeKind.warn => Icons.warning_amber_rounded,
        };
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(color: bg, border: Border(left: BorderSide(color: bar, width: 3))),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(ic, size: 20, color: bar),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
            if (message != null) ...[const SizedBox(height: 2), Text(message!, style: const TextStyle(fontSize: 14, color: Palette.body, height: 1.4))],
          ]),
        ),
      ]),
    );
  }
}

/// Affiche une erreur d'API avec, le cas échéant, le détail ligne par ligne.
class ErrorBox extends StatelessWidget {
  const ErrorBox(this.error, {super.key});
  final Object error;

  @override
  Widget build(BuildContext context) {
    final lines = error is ApiException ? (error as ApiException).detailLines : const <String>[];
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: const BoxDecoration(color: Palette.redTint, border: Border(left: BorderSide(color: Palette.red, width: 3))),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(error.toString(), style: const TextStyle(color: Color(0xFF6E140F), fontWeight: FontWeight.w700, fontSize: 14)),
        for (final l in lines) Padding(padding: const EdgeInsets.only(top: 4), child: Text('• $l', style: const TextStyle(color: Color(0xFF6E140F), fontSize: 14))),
      ]),
    );
  }
}

class LabeledField extends StatelessWidget {
  const LabeledField(this.label, {super.key, required this.child, this.hint});
  final String label;
  final Widget child;
  final String? hint;

  @override
  Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: kLabel),
        const SizedBox(height: 5),
        child,
        if (hint != null) Padding(padding: const EdgeInsets.only(top: 5), child: Text(hint!, style: kSmall)),
      ]);
}

class ViewHeader extends StatelessWidget {
  const ViewHeader({super.key, required this.title, this.subtitle, this.action});
  final String title;
  final String? subtitle;
  final Widget? action;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 20),
        child: Wrap(
          alignment: WrapAlignment.spaceBetween,
          crossAxisAlignment: WrapCrossAlignment.end,
          runSpacing: 12,
          spacing: 16,
          children: [
            Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
              Text(title, style: serif(28)),
              if (subtitle != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text(subtitle!, style: const TextStyle(color: Palette.muted))),
            ]),
            if (action != null) action!,
          ],
        ),
      );
}

// --- formats ---
const _months = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

String fmtDate(DateTime? d) {
  if (d == null) return '—';
  final l = d.toLocal();
  String two(int n) => n.toString().padLeft(2, '0');
  return '${two(l.day)} ${_months[l.month - 1]} ${l.year}, ${two(l.hour)}:${two(l.minute)}';
}

String fmtTtl(int? ms) {
  if (ms == null || ms == 0) return 'Illimitée';
  final min = (ms / 60000).round();
  if (min < 60) return '$min min';
  if (min < 1440) return '${(min / 60).round()} h';
  final days = (min / 1440).round();
  return days >= 365 ? '${(days / 365).round()} an' : '$days j';
}

// --- fenêtres et messages ---
void showToast(BuildContext context, String message, {bool error = false}) {
  ScaffoldMessenger.of(context)
    ..clearSnackBars()
    ..showSnackBar(SnackBar(
      content: Row(children: [
        Icon(error ? Icons.error_outline : Icons.check, color: Colors.white, size: 18),
        const SizedBox(width: 10),
        Expanded(child: Text(message)),
      ]),
      backgroundColor: error ? Palette.red : Palette.ink,
      duration: Duration(seconds: error ? 7 : 4),
    ));
}

/// Fenêtre centrée, défilante (utilisable sur petit écran).
Future<T?> showMsDialog<T>(BuildContext context, WidgetBuilder builder, {double width = 560}) => showDialog<T>(
      context: context,
      builder: (ctx) => Dialog(
        backgroundColor: Palette.paper,
        surfaceTintColor: Colors.transparent,
        insetPadding: const EdgeInsets.all(14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
        child: ConstrainedBox(
          constraints: BoxConstraints(maxWidth: width),
          child: SingleChildScrollView(padding: const EdgeInsets.all(24), child: builder(ctx)),
        ),
      ),
    );

/// Panneau latéral qui glisse depuis la droite (détail d'un agent).
Future<T?> showSidePanel<T>(BuildContext context, WidgetBuilder builder, {double width = 480}) => showGeneralDialog<T>(
      context: context,
      barrierDismissible: true,
      barrierLabel: 'Fermer',
      barrierColor: const Color(0x80000000),
      transitionDuration: const Duration(milliseconds: 200),
      pageBuilder: (ctx, _, __) => Align(
        alignment: Alignment.centerRight,
        child: Material(
          color: Palette.paper,
          elevation: 8,
          child: SizedBox(width: width, height: double.infinity, child: SafeArea(child: builder(ctx))),
        ),
      ),
      transitionBuilder: (ctx, anim, _, child) => SlideTransition(
        position: Tween<Offset>(begin: const Offset(0.08, 0), end: Offset.zero).animate(CurvedAnimation(parent: anim, curve: Curves.easeOut)),
        child: FadeTransition(opacity: anim, child: child),
      ),
    );

class Figure extends StatelessWidget {
  const Figure(this.value, this.label, {super.key});
  final int value;
  final String label;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('$value', style: serif(44, height: 1)),
          const SizedBox(height: 6),
          Text(label, style: kSmall),
        ]),
      );
}
