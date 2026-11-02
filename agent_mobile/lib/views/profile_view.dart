import 'package:flutter/material.dart';
import 'package:ms_core/ms_core.dart';

class ProfileView extends StatelessWidget {
  const ProfileView({super.key, required this.session});
  final Session session;

  @override
  Widget build(BuildContext context) {
    final me = session.me;

    Widget row(String k, Widget v) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            SizedBox(width: 120, child: Text(k, style: const TextStyle(color: Palette.muted))),
            Expanded(child: v),
          ]),
        );

    return ListView(padding: const EdgeInsets.fromLTRB(16, 24, 16, 32), children: [
      Row(children: [
        InitialsAvatar(me.name, size: 56),
        const SizedBox(width: 16),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(me.name, style: serif(21)), const SizedBox(height: 2), Text('@${me.username}', style: kMono.copyWith(color: Palette.muted))])),
      ]),
      const SizedBox(height: 20),
      Container(
        decoration: BoxDecoration(color: Palette.surface, border: Border.all(color: Palette.line)),
        padding: const EdgeInsets.symmetric(horizontal: 16),
        child: Column(children: [
          row('Ministère', Text(me.ministry ?? '—')),
          const Divider(),
          row('Fonction', Text(me.jobTitle ?? '—')),
          const Divider(),
          row('Rôle', Text(roleLabels[me.role] ?? me.role)),
          const Divider(),
          row('Habilitation', Align(alignment: Alignment.centerLeft, child: Stamp.rank(me.clearance))),
        ]),
      ),
      const SizedBox(height: 16),
      const Notice(
        kind: NoticeKind.ok,
        icon: Icons.verified_user_outlined,
        title: 'Compte protégé',
        message: 'Connexion à deux facteurs. Si votre téléphone est perdu, prévenez votre administrateur : il coupera aussitôt vos accès.',
      ),
      const SizedBox(height: 24),
      OutlinedButton.icon(onPressed: session.auth.signOut, icon: const Icon(Icons.logout, size: 18), label: const Text('Se déconnecter')),
    ]);
  }
}
