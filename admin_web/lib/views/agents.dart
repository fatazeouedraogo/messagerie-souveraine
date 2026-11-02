import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:ms_core/ms_core.dart';

const _clearanceOptions = <int, String>{
  0: 'Niveau 0 · Normal',
  1: 'Niveau 1 · Diffusion restreinte',
  2: 'Niveau 2 · Confidentiel',
};

const _stepLabels = {
  'registre': 'Registre et API',
  'keycloak': 'Identité (Keycloak)',
  'synapse': 'Messagerie (Synapse)',
  'verification': "Vérification de l'état réel",
};

bool _canManage(Principal me, Agent a) => me.username != a.username && (me.isSuperAdmin || (a.role == 'agent' && a.ministry == me.ministry));

class AgentsView extends StatefulWidget {
  const AgentsView({super.key});

  @override
  State<AgentsView> createState() => _AgentsViewState();
}

class _AgentsViewState extends State<AgentsView> {
  final _search = TextEditingController();
  String _status = '';
  List<Agent>? _agents;
  Object? _error;
  Timer? _debounce;
  bool _started = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_started) {
      _started = true;
      _load();
    }
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final s = AppScope.of(context);
    try {
      final list = await s.api.agents(search: _search.text.trim(), status: _status);
      if (!mounted) return;
      setState(() {
        _agents = list;
        _error = null;
      });
    } catch (e) {
      if (mounted) setState(() => _error = e);
    }
  }

  Future<void> _enroll() async {
    final s = AppScope.of(context);
    await showMsDialog<void>(context, (ctx) => _EnrollForm(session: s), width: 640);
    if (mounted) _load();
  }

  Future<void> _open(Agent a) async {
    final s = AppScope.of(context);
    await showSidePanel<void>(context, (ctx) => _AgentPanel(session: s, agent: a));
    if (mounted) _load();
  }

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final me = s.me;
    final narrow = MediaQuery.of(context).size.width < 760;
    final agents = _agents;

    return ListView(
      padding: EdgeInsets.fromLTRB(narrow ? 16 : 32, 28, narrow ? 16 : 32, 64),
      children: [
        ViewHeader(
          title: 'Agents',
          subtitle: me.isSuperAdmin ? 'Tous les ministères' : 'Ministère : ${me.ministry}',
          action: FilledButton.icon(onPressed: _enroll, icon: const Icon(Icons.add, size: 18), label: const Text('Enrôler un agent')),
        ),
        Padding(
          padding: const EdgeInsets.only(bottom: 14),
          child: Wrap(spacing: 10, runSpacing: 10, children: [
            SizedBox(
              width: narrow ? double.infinity : 420,
              child: TextField(
                controller: _search,
                decoration: inputDeco(hint: 'Rechercher un nom ou un identifiant', prefix: const Icon(Icons.search, size: 18)),
                onChanged: (_) {
                  _debounce?.cancel();
                  _debounce = Timer(const Duration(milliseconds: 250), _load);
                },
              ),
            ),
            SizedBox(
              width: narrow ? double.infinity : 220,
              child: DropdownButtonFormField<String>(
                value: _status,
                isExpanded: true,
                decoration: inputDeco(),
                items: const [
                  DropdownMenuItem(value: '', child: Text('Tous les statuts')),
                  DropdownMenuItem(value: 'active', child: Text('Actifs')),
                  DropdownMenuItem(value: 'revoked', child: Text('Révoqués')),
                  DropdownMenuItem(value: 'revoking', child: Text('Révocation en cours')),
                ],
                onChanged: (v) {
                  setState(() => _status = v ?? '');
                  _load();
                },
              ),
            ),
          ]),
        ),
        if (_error != null) ErrorBox(_error!),
        if (agents == null && _error == null)
          const Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator(color: Palette.green))),
        if (agents != null && agents.isEmpty)
          Container(
            padding: const EdgeInsets.all(40),
            decoration: BoxDecoration(color: Palette.surface, border: Border.all(color: Palette.lineStrong)),
            child: const Center(child: Text('Aucun agent ne correspond à cette recherche.', style: kSmall)),
          ),
        if (agents != null && agents.isNotEmpty)
          Container(
            decoration: BoxDecoration(color: Palette.surface, border: Border.all(color: Palette.line)),
            child: Column(children: [
              if (!narrow) const _TableHead(),
              for (var i = 0; i < agents.length; i++) ...[
                if (i > 0 || !narrow) const Divider(),
                _AgentRow(agent: agents[i], narrow: narrow, onTap: () => _open(agents[i])),
              ],
            ]),
          ),
      ],
    );
  }
}

class _TableHead extends StatelessWidget {
  const _TableHead();

  @override
  Widget build(BuildContext context) {
    const style = TextStyle(fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 0.7, color: Palette.muted);
    return Container(
      color: Palette.paper,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: const Row(children: [
        Expanded(flex: 40, child: Text('AGENT', style: style)),
        Expanded(flex: 26, child: Text('MINISTÈRE', style: style)),
        Expanded(flex: 26, child: Text('HABILITATION', style: style)),
        Expanded(flex: 20, child: Text('RÔLE', style: style)),
        Expanded(flex: 20, child: Text('STATUT', style: style)),
      ]),
    );
  }
}

class _AgentRow extends StatelessWidget {
  const _AgentRow({required this.agent, required this.narrow, required this.onTap});
  final Agent agent;
  final bool narrow;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final a = agent;
    final dim = a.status != 'active';
    final color = dim ? Palette.muted : Palette.ink;
    final who = Row(children: [
      InitialsAvatar(a.fullName),
      const SizedBox(width: 12),
      Expanded(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(a.fullName, style: TextStyle(fontWeight: FontWeight.w700, color: color)),
          Text('${a.jobTitle} · ${a.username}', style: kSmall, maxLines: 1, overflow: TextOverflow.ellipsis),
        ]),
      ),
    ]);

    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: narrow
            ? Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                who,
                const SizedBox(height: 8),
                Wrap(spacing: 14, runSpacing: 6, crossAxisAlignment: WrapCrossAlignment.center, children: [
                  Text(a.ministry, style: TextStyle(fontSize: 13.5, color: color)),
                  Stamp.rank(a.clearance),
                  StatusMark(a.status),
                ]),
              ])
            : Row(children: [
                Expanded(flex: 40, child: who),
                Expanded(flex: 26, child: Text(a.ministry, style: TextStyle(color: color))),
                Expanded(flex: 26, child: Align(alignment: Alignment.centerLeft, child: Stamp.rank(a.clearance))),
                Expanded(flex: 20, child: Text(roleLabels[a.role] ?? a.role, style: TextStyle(color: color))),
                Expanded(flex: 20, child: Align(alignment: Alignment.centerLeft, child: StatusMark(a.status))),
              ]),
      ),
    );
  }
}

// ---------------------------------------------------------------- panneau de détail

class _AgentPanel extends StatefulWidget {
  const _AgentPanel({required this.session, required this.agent});
  final Session session;
  final Agent agent;

  @override
  State<_AgentPanel> createState() => _AgentPanelState();
}

class _AgentPanelState extends State<_AgentPanel> {
  late final TextEditingController _job = TextEditingController(text: widget.agent.jobTitle);
  late int _clearance = widget.agent.clearance;
  late String _role = widget.agent.role == 'admin' ? 'admin' : 'agent';
  Object? _error;
  bool _busy = false;

  @override
  void dispose() {
    _job.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final a = widget.agent;
    final patch = <String, dynamic>{};
    if (_job.text.trim() != a.jobTitle) patch['jobTitle'] = _job.text.trim();
    if (_clearance != a.clearance) patch['clearance'] = _clearance;
    if (widget.session.me.isSuperAdmin && _role != a.role) patch['role'] = _role;
    if (patch.isEmpty) {
      showToast(context, 'Aucune modification.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.session.api.updateAgent(a.username, patch);
      if (!mounted) return;
      showToast(context, 'Modifications enregistrées');
      Navigator.of(context).pop();
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e;
          _busy = false;
        });
      }
    }
  }

  Future<void> _reset() async {
    try {
      final pw = await widget.session.api.resetCredentials(widget.agent.username);
      if (!mounted) return;
      await showMsDialog<void>(context, (ctx) => _CredentialsCard(username: widget.agent.username, password: pw, title: 'Accès réinitialisé'));
    } catch (e) {
      if (mounted) showToast(context, e.toString(), error: true);
    }
  }

  Future<void> _revoke() async {
    final done = await showMsDialog<bool>(context, (ctx) => _RevokeForm(session: widget.session, agent: widget.agent));
    if (done == true && mounted) Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    final a = widget.agent;
    final me = widget.session.me;
    final manageable = _canManage(me, a);

    Widget fact(String k, Widget v) => Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            SizedBox(width: 130, child: Text(k, style: const TextStyle(color: Palette.muted, fontSize: 14))),
            Expanded(child: v),
          ]),
        );

    return Column(children: [
      Container(
        padding: const EdgeInsets.fromLTRB(20, 18, 8, 16),
        decoration: const BoxDecoration(color: Palette.surface, border: Border(bottom: BorderSide(color: Palette.line))),
        child: Row(children: [
          InitialsAvatar(a.fullName, size: 48),
          const SizedBox(width: 14),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(a.fullName, style: serif(20)), const SizedBox(height: 4), StatusMark(a.status)])),
          IconButton(tooltip: 'Fermer', onPressed: () => Navigator.of(context).pop(), icon: const Icon(Icons.close)),
        ]),
      ),
      Expanded(
        child: ListView(padding: const EdgeInsets.all(20), children: [
          fact('Courriel', Text(a.email)),
          fact('Ministère', Text(a.ministry)),
          fact('Fonction', Text(a.jobTitle)),
          fact('Rôle', Text(roleLabels[a.role] ?? a.role)),
          fact('Identifiant Matrix', Text(a.mxid, style: kMono)),
          fact('Enrôlé', Text('${fmtDate(a.createdAt)} par ${a.createdBy}')),
          fact('Habilitation', Align(alignment: Alignment.centerLeft, child: Stamp.rank(a.clearance))),
          const SizedBox(height: 16),
          if (a.status != 'active') ...[
            Notice(
              kind: NoticeKind.danger,
              title: a.status == 'revoked' ? 'Accès révoqué' : "Révocation interrompue : l'agent est déjà bloqué",
              message: [
                a.revokedAt != null ? '${fmtDate(a.revokedAt)} par ${a.revokedBy}' : 'Engagée par ${a.revokedBy ?? '—'}',
                if (a.revokeReason != null) 'Motif : ${a.revokeReason}',
              ].join('\n'),
            ),
            if (a.status == 'revoking' && manageable) ...[
              const SizedBox(height: 14),
              FilledButton(style: FilledButton.styleFrom(backgroundColor: Palette.red), onPressed: _revoke, child: const Text('Relancer la révocation')),
            ],
          ] else if (manageable) ...[
            Text('Modifier', style: serif(16)),
            const SizedBox(height: 12),
            LabeledField('Fonction', child: TextField(controller: _job, maxLength: 80, decoration: inputDeco().copyWith(counterText: ''))),
            const SizedBox(height: 12),
            LabeledField(
              'Habilitation',
              hint: "Détermine les salons que l'agent peut créer et rejoindre.",
              child: DropdownButtonFormField<int>(
                value: _clearance,
                isExpanded: true,
                decoration: inputDeco(),
                items: [
                  for (final e in _clearanceOptions.entries)
                    if (me.isSuperAdmin || e.key <= me.clearance) DropdownMenuItem(value: e.key, child: Text(e.value)),
                ],
                onChanged: (v) => setState(() => _clearance = v ?? _clearance),
              ),
            ),
            if (me.isSuperAdmin) ...[
              const SizedBox(height: 12),
              LabeledField(
                'Rôle',
                child: DropdownButtonFormField<String>(
                  value: _role,
                  isExpanded: true,
                  decoration: inputDeco(),
                  items: const [DropdownMenuItem(value: 'agent', child: Text('Agent')), DropdownMenuItem(value: 'admin', child: Text('Administrateur'))],
                  onChanged: (v) => setState(() => _role = v ?? _role),
                ),
              ),
            ],
            if (_error != null) ...[const SizedBox(height: 12), ErrorBox(_error!)],
            const SizedBox(height: 14),
            FilledButton(onPressed: _busy ? null : _save, child: const Text('Enregistrer')),
            const SizedBox(height: 28),
            const Divider(color: Palette.lineStrong),
            const SizedBox(height: 14),
            Text('Zone sensible', style: serif(16)),
            const SizedBox(height: 8),
            const Text("Téléphone perdu : nouveau mot de passe temporaire et second facteur à reconfigurer.", style: kSmall),
            const SizedBox(height: 8),
            Align(alignment: Alignment.centerLeft, child: OutlinedButton(onPressed: _reset, child: const Text("Réinitialiser l'accès"))),
            const SizedBox(height: 16),
            const Text("Départ de l'agent ou appareil volé : coupe l'accès partout, immédiatement.", style: kSmall),
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerLeft,
              child: FilledButton(style: FilledButton.styleFrom(backgroundColor: Palette.red), onPressed: _revoke, child: const Text("Révoquer l'accès")),
            ),
          ] else
            Text(me.username == a.username ? "C'est votre propre compte : vous ne pouvez ni le modifier ni le révoquer ici." : "Cet agent n'est pas dans votre périmètre de gestion.", style: kSmall),
        ]),
      ),
    ]);
  }
}

// ---------------------------------------------------------------- révocation

class _RevokeForm extends StatefulWidget {
  const _RevokeForm({required this.session, required this.agent});
  final Session session;
  final Agent agent;

  @override
  State<_RevokeForm> createState() => _RevokeFormState();
}

class _RevokeFormState extends State<_RevokeForm> {
  final _reason = TextEditingController();
  Object? _error;
  bool _busy = false;
  RevokeResult? _result;

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  Future<void> _confirm() async {
    final reason = _reason.text.trim();
    if (reason.isEmpty) {
      setState(() => _error = ApiException(400, 'bad_request', 'Indiquez le motif de la révocation.'));
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final r = await widget.session.api.revoke(widget.agent.username, reason);
      if (mounted) setState(() => _result = r);
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e;
          _busy = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final r = _result;
    if (r != null) {
      return Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text('Révocation', style: serif(20)),
        const SizedBox(height: 14),
        if (r.alreadyRevoked)
          const Text('Cet agent était déjà révoqué.')
        else ...[
          Notice(title: 'Accès révoqué', message: "Terminé en ${r.durationMs} ms. L'état réel a été vérifié.", kind: NoticeKind.ok, icon: Icons.check_circle_outline),
          const SizedBox(height: 12),
          for (final s in r.steps)
            Container(
              padding: const EdgeInsets.symmetric(vertical: 9),
              decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: Palette.line))),
              child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [Text(_stepLabels[s.step] ?? s.step), Text('${s.ms} ms', style: kMono)]),
            ),
        ],
        const SizedBox(height: 20),
        Align(alignment: Alignment.centerRight, child: FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Fermer'))),
      ]);
    }

    Widget step(int n, String text) => Padding(
          padding: const EdgeInsets.only(bottom: 4),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            SizedBox(width: 22, child: Text('$n.', style: const TextStyle(color: Palette.body))),
            Expanded(child: Text(text, style: const TextStyle(color: Palette.body, height: 1.4))),
          ]),
        );

    return Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text("Révoquer l'accès de ${widget.agent.fullName} ?", style: serif(20)),
      const SizedBox(height: 12),
      const Text("Cette action est immédiate. Elle sera consignée dans le journal d'audit."),
      const SizedBox(height: 12),
      step(1, "L'agent est refusé par l'API, même avec un jeton encore valide."),
      step(2, 'Son compte d\'identité est désactivé et ses sessions sont fermées.'),
      step(3, 'Son compte de messagerie est désactivé : appareils et jetons supprimés, sortie de tous les salons.'),
      step(4, "L'état réel de chaque service est relu avant de confirmer."),
      const SizedBox(height: 14),
      LabeledField('Motif de la révocation', child: TextField(controller: _reason, maxLines: 3, maxLength: 300, decoration: inputDeco(hint: "Ex. : fin de mission, perte de l'appareil…"))),
      if (_error != null) ...[const SizedBox(height: 12), ErrorBox(_error!)],
      const SizedBox(height: 14),
      Wrap(alignment: WrapAlignment.end, spacing: 10, runSpacing: 8, children: [
        OutlinedButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Annuler')),
        FilledButton(
          style: FilledButton.styleFrom(backgroundColor: Palette.red),
          onPressed: _busy ? null : _confirm,
          child: Text(_busy ? 'Révocation en cours…' : 'Révoquer maintenant'),
        ),
      ]),
    ]);
  }
}

// ---------------------------------------------------------------- enrôlement

class _EnrollForm extends StatefulWidget {
  const _EnrollForm({required this.session});
  final Session session;

  @override
  State<_EnrollForm> createState() => _EnrollFormState();
}

class _EnrollFormState extends State<_EnrollForm> {
  late final _username = TextEditingController();
  late final _fullName = TextEditingController();
  late final _email = TextEditingController();
  late final _ministry = TextEditingController(text: widget.session.me.ministry ?? '');
  late final _job = TextEditingController();
  int _clearance = 0;
  String _role = 'agent';
  Object? _error;
  bool _busy = false;
  EnrollResult? _result;

  @override
  void dispose() {
    for (final c in [_username, _fullName, _email, _ministry, _job]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final r = await widget.session.api.enroll({
        'username': _username.text.trim(),
        'fullName': _fullName.text.trim(),
        'email': _email.text.trim(),
        'ministry': _ministry.text.trim(),
        'jobTitle': _job.text.trim().isEmpty ? 'Agent' : _job.text.trim(),
        'clearance': _clearance,
        'role': _role,
      });
      if (mounted) setState(() => _result = r);
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e;
          _busy = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final r = _result;
    if (r != null) return _CredentialsCard(username: r.agent.username, password: r.temporaryPassword, title: 'Agent enrôlé');

    final me = widget.session.me;
    final twoCols = MediaQuery.of(context).size.width >= 620;

    Widget pair(Widget a, Widget b) => twoCols
        ? Row(crossAxisAlignment: CrossAxisAlignment.start, children: [Expanded(child: a), const SizedBox(width: 14), Expanded(child: b)])
        : Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [a, const SizedBox(height: 14), b]);

    return Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text('Enrôler un agent', style: serif(22)),
      const SizedBox(height: 6),
      const Text('Le compte est créé fermé : mot de passe temporaire à transmettre en main propre, second facteur configuré à la première connexion.', style: kSmall),
      const SizedBox(height: 18),
      pair(
        LabeledField('Identifiant', hint: '3 à 32 caractères : a-z, 0-9, point, tiret.', child: TextField(controller: _username, decoration: inputDeco(hint: 'prenom.nom'))),
        LabeledField('Nom complet', child: TextField(controller: _fullName, decoration: inputDeco())),
      ),
      const SizedBox(height: 14),
      pair(
        LabeledField('Courriel professionnel', child: TextField(controller: _email, keyboardType: TextInputType.emailAddress, decoration: inputDeco())),
        LabeledField('Ministère', hint: me.isSuperAdmin ? null : 'Vous enrôlez dans votre ministère.', child: TextField(controller: _ministry, readOnly: !me.isSuperAdmin, decoration: inputDeco())),
      ),
      const SizedBox(height: 14),
      pair(
        LabeledField('Fonction', child: TextField(controller: _job, decoration: inputDeco())),
        LabeledField(
          'Habilitation',
          child: DropdownButtonFormField<int>(
            value: _clearance,
            isExpanded: true,
            decoration: inputDeco(),
            items: [
              for (final e in _clearanceOptions.entries)
                if (me.isSuperAdmin || e.key <= me.clearance) DropdownMenuItem(value: e.key, child: Text(e.value)),
            ],
            onChanged: (v) => setState(() => _clearance = v ?? 0),
          ),
        ),
      ),
      if (me.isSuperAdmin) ...[
        const SizedBox(height: 14),
        LabeledField(
          'Rôle',
          child: DropdownButtonFormField<String>(
            value: _role,
            isExpanded: true,
            decoration: inputDeco(),
            items: const [DropdownMenuItem(value: 'agent', child: Text('Agent')), DropdownMenuItem(value: 'admin', child: Text('Administrateur'))],
            onChanged: (v) => setState(() => _role = v ?? 'agent'),
          ),
        ),
      ],
      if (_error != null) ...[const SizedBox(height: 14), ErrorBox(_error!)],
      const SizedBox(height: 20),
      Wrap(alignment: WrapAlignment.end, spacing: 10, runSpacing: 8, children: [
        OutlinedButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Annuler')),
        FilledButton(onPressed: _busy ? null : _submit, child: Text(_busy ? 'Création…' : "Enrôler l'agent")),
      ]),
    ]);
  }
}

class _CredentialsCard extends StatelessWidget {
  const _CredentialsCard({required this.username, required this.password, required this.title});
  final String username;
  final String password;
  final String title;

  @override
  Widget build(BuildContext context) => Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(title, style: serif(22)),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(color: Palette.surface, border: Border.all(color: Palette.lineStrong)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Identifiant', style: kSmall),
            SelectableText(username, style: const TextStyle(fontFamily: 'monospace', fontSize: 18, fontWeight: FontWeight.w600)),
            const SizedBox(height: 14),
            const Text('Mot de passe temporaire', style: kSmall),
            SelectableText(password, style: const TextStyle(fontFamily: 'monospace', fontSize: 22, fontWeight: FontWeight.w700, letterSpacing: 0.8)),
            const SizedBox(height: 14),
            OutlinedButton.icon(
              onPressed: () async {
                await Clipboard.setData(ClipboardData(text: '$username / $password'));
                if (context.mounted) showToast(context, 'Copié dans le presse-papiers');
              },
              icon: const Icon(Icons.copy, size: 16),
              label: const Text('Copier'),
            ),
          ]),
        ),
        const SizedBox(height: 14),
        const Notice(
          title: 'Affiché une seule fois.',
          message: "Transmettez-le à l'agent en main propre, jamais par messagerie. Il devra le changer et configurer son application d'authentification à sa première connexion.",
        ),
        const SizedBox(height: 20),
        Align(alignment: Alignment.centerRight, child: FilledButton(onPressed: () => Navigator.of(context).pop(), child: const Text("J'ai transmis les identifiants"))),
      ]);
}
