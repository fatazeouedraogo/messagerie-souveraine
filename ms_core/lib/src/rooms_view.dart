import 'dart:async';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import 'app_root.dart';
import 'models.dart';
import 'theme.dart';
import 'widgets.dart';

const _restrictionText = {'noForward': 'Pas de transfert', 'noScreenshot': "Pas de capture d'écran"};

final List<MapEntry<int?, String>> _ttlPresets = [
  const MapEntry<int?, String>(null, 'Durée par défaut du niveau'),
  const MapEntry<int?, String>(60, '1 heure'),
  const MapEntry<int?, String>(1440, '24 heures'),
  const MapEntry<int?, String>(10080, '7 jours'),
  const MapEntry<int?, String>(43200, '30 jours'),
  const MapEntry<int?, String>(525600, '1 an'),
];

/// Liste des salons chiffrés + création classifiée + invitations. Partagée par l'admin web et le mobile.
class RoomsView extends StatefulWidget {
  const RoomsView({super.key});

  @override
  State<RoomsView> createState() => _RoomsViewState();
}

class _RoomsViewState extends State<RoomsView> {
  List<RoomInfo>? _rooms;
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
      final rooms = await s.api.rooms();
      if (!mounted) return;
      setState(() {
        _rooms = rooms;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e);
    }
  }

  Future<void> _create() async {
    final s = AppScope.of(context);
    final created = await showMsDialog<RoomInfo>(context, (ctx) => _CreateRoomForm(session: s), width: 680);
    if (created != null && mounted) {
      showToast(context, 'Salon « ${created.name} » créé');
      _load();
    }
  }

  Future<void> _invite(RoomInfo room) async {
    final s = AppScope.of(context);
    final who = await showMsDialog<String>(context, (ctx) => _InviteForm(session: s, room: room));
    if (who != null && mounted) showToast(context, '$who invité');
  }

  @override
  Widget build(BuildContext context) {
    final s = AppScope.of(context);
    final byId = {for (final c in s.classifications) c.id: c};
    final rooms = _rooms;
    final narrow = MediaQuery.of(context).size.width < 700;

    return RefreshIndicator(
      color: Palette.green,
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: EdgeInsets.fromLTRB(narrow ? 16 : 32, 28, narrow ? 16 : 32, 64),
        children: [
          ViewHeader(
            title: 'Salons',
            subtitle: 'Conversations chiffrées de bout en bout, classées par niveau',
            action: FilledButton.icon(onPressed: _create, icon: const Icon(Icons.add, size: 18), label: const Text('Nouveau salon')),
          ),
          if (_error != null) ErrorBox(_error!),
          if (rooms == null && _error == null)
            const Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator(color: Palette.green)))
          else if (rooms != null && rooms.isEmpty)
            Container(
              padding: const EdgeInsets.symmetric(vertical: 44, horizontal: 16),
              decoration: BoxDecoration(color: Palette.surface, border: Border.all(color: Palette.lineStrong)),
              child: const Column(children: [
                Text('Aucun salon pour le moment.'),
                SizedBox(height: 6),
                Text('Créez un salon pour échanger de manière chiffrée avec vos collègues.', style: kSmall, textAlign: TextAlign.center),
              ]),
            )
          else if (rooms != null)
            Container(
              decoration: BoxDecoration(color: Palette.surface, border: Border.all(color: Palette.line)),
              child: Column(children: [
                for (var i = 0; i < rooms.length; i++) ...[
                  if (i > 0) const Divider(),
                  _RoomTile(room: rooms[i], session: s, classification: byId[rooms[i].level], onInvite: () => _invite(rooms[i])),
                ],
              ]),
            ),
        ],
      ),
    );
  }
}

class _RoomTile extends StatelessWidget {
  const _RoomTile({required this.room, required this.session, required this.classification, required this.onInvite});

  final RoomInfo room;
  final Session session;
  final Classification? classification;
  final VoidCallback onInvite;

  @override
  Widget build(BuildContext context) {
    final restrictions = [
      for (final e in (classification?.restrictions ?? const <String, bool>{}).entries)
        if (e.value && _restrictionText.containsKey(e.key)) _restrictionText[e.key]!,
    ];
    final me = session.me;
    final canInvite = room.createdBy == me.username || me.isAdmin;
    final uri = session.config.roomUri(room.roomId);

    return Padding(
      padding: const EdgeInsets.all(18),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Wrap(crossAxisAlignment: WrapCrossAlignment.center, spacing: 12, runSpacing: 6, children: [
          Text(room.name, style: serif(17)),
          Stamp(level: room.level),
        ]),
        const SizedBox(height: 8),
        Wrap(spacing: 18, runSpacing: 4, children: [
          const Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(Icons.lock_outline, size: 14, color: Palette.body),
            SizedBox(width: 5),
            Text('Chiffré de bout en bout', style: TextStyle(fontSize: 13.5)),
          ]),
          Text('Conservation : ${fmtTtl(room.ttlMs)}', style: const TextStyle(fontSize: 13.5)),
          if (restrictions.isNotEmpty) Text(restrictions.join(' · '), style: const TextStyle(fontSize: 13.5)),
        ]),
        const SizedBox(height: 4),
        Text('${room.ministry ?? 'Interministériel'} · créé par ${room.createdBy} · ${fmtDate(room.createdAt)}',
            style: const TextStyle(fontSize: 12.5, color: Palette.muted)),
        if (canInvite || uri != null) ...[
          const SizedBox(height: 12),
          Wrap(spacing: 8, runSpacing: 8, children: [
            if (uri != null)
              FilledButton.icon(
                style: FilledButton.styleFrom(minimumSize: const Size(0, 36)),
                onPressed: () => launchUrl(uri, mode: LaunchMode.externalApplication),
                icon: const Icon(Icons.chat_bubble_outline, size: 16),
                label: const Text('Ouvrir la conversation'),
              ),
            if (canInvite)
              OutlinedButton(style: OutlinedButton.styleFrom(minimumSize: const Size(0, 36)), onPressed: onInvite, child: const Text('Inviter un agent')),
          ]),
        ],
      ]),
    );
  }
}

class _InviteForm extends StatefulWidget {
  const _InviteForm({required this.session, required this.room});
  final Session session;
  final RoomInfo room;

  @override
  State<_InviteForm> createState() => _InviteFormState();
}

class _InviteFormState extends State<_InviteForm> {
  final _user = TextEditingController();
  Object? _error;
  bool _busy = false;

  @override
  void dispose() {
    _user.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final u = _user.text.trim();
    if (u.isEmpty) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.session.api.invite(widget.room.roomId, u);
      if (mounted) Navigator.of(context).pop(u);
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
  Widget build(BuildContext context) => Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text('Inviter dans « ${widget.room.name} »', style: serif(20)),
        const SizedBox(height: 16),
        LabeledField(
          "Identifiant de l'agent",
          hint: "Son habilitation doit permettre le niveau « ${levelLabels[widget.room.level]} ».",
          child: TextField(controller: _user, autofocus: true, decoration: inputDeco(hint: 'prenom.nom'), onSubmitted: (_) => _submit()),
        ),
        if (_error != null) ...[const SizedBox(height: 12), ErrorBox(_error!)],
        const SizedBox(height: 20),
        Row(mainAxisAlignment: MainAxisAlignment.end, children: [
          OutlinedButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Annuler')),
          const SizedBox(width: 10),
          FilledButton(onPressed: _busy ? null : _submit, child: const Text('Inviter')),
        ]),
      ]);
}

class _CreateRoomForm extends StatefulWidget {
  const _CreateRoomForm({required this.session});
  final Session session;

  @override
  State<_CreateRoomForm> createState() => _CreateRoomFormState();
}

class _CreateRoomFormState extends State<_CreateRoomForm> {
  final _name = TextEditingController();
  final _invite = TextEditingController();
  final List<String> _invited = [];
  List<DirectoryEntry> _suggestions = [];
  String _level = 'NORMAL';
  int? _ttl;
  Timer? _debounce;
  Object? _error;
  bool _busy = false;

  @override
  void dispose() {
    _debounce?.cancel();
    _name.dispose();
    _invite.dispose();
    super.dispose();
  }

  void _onInviteChanged(String text) {
    if (text.endsWith(',')) {
      _addInvite(text.substring(0, text.length - 1));
      return;
    }
    _debounce?.cancel();
    final q = text.trim();
    if (q.length < 2) {
      setState(() => _suggestions = []);
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 300), () async {
      try {
        final found = await widget.session.api.directory(q);
        if (!mounted) return;
        final need = rankOfLevel(_level);
        setState(() => _suggestions = found
            .where((d) => d.username != widget.session.me.username && !_invited.contains(d.username) && d.clearance >= need)
            .take(5)
            .toList());
      } catch (_) {
        if (mounted) setState(() => _suggestions = []);
      }
    });
  }

  void _addInvite(String raw) {
    final u = raw.trim();
    _invite.clear();
    setState(() {
      _suggestions = [];
      if (u.isNotEmpty && !_invited.contains(u)) _invited.add(u);
    });
  }

  Future<void> _submit() async {
    final name = _name.text.trim();
    if (name.isEmpty) {
      setState(() => _error = ApiException(400, 'bad_request', 'Donnez un nom au salon.'));
      return;
    }
    final invites = [..._invited];
    final pending = _invite.text.trim();
    if (pending.isNotEmpty && !invites.contains(pending)) invites.add(pending);

    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final room = await widget.session.api.createRoom(name: name, level: _level, ttlMinutes: _ttl, invite: invites);
      if (mounted) Navigator.of(context).pop(room);
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
    final me = widget.session.me;
    return Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text('Nouveau salon', style: serif(22)),
      const SizedBox(height: 18),
      LabeledField(
        'Nom du salon',
        hint: "Le nom est visible du serveur (seuls les messages sont chiffrés) : n'y mettez rien de sensible.",
        child: TextField(controller: _name, maxLength: 100, autofocus: true, decoration: inputDeco(hint: 'Ex. : Cellule de crise inondations').copyWith(counterText: '')),
      ),
      const SizedBox(height: 16),
      const Text('Niveau de classification', style: kLabel),
      const SizedBox(height: 8),
      for (final id in levelOrder) _LevelCard(
        level: id,
        selected: _level == id,
        allowed: me.clearance >= rankOfLevel(id),
        onTap: () => setState(() {
          _level = id;
          _suggestions = [];
        }),
      ),
      const SizedBox(height: 8),
      LabeledField(
        'Conservation des messages',
        hint: 'Passé ce délai, le serveur efface les messages.',
        child: DropdownButtonFormField<int?>(
          value: _ttl,
          isExpanded: true,
          decoration: inputDeco(),
          items: [for (final p in _ttlPresets) DropdownMenuItem<int?>(value: p.key, child: Text(p.value))],
          onChanged: (v) => setState(() => _ttl = v),
        ),
      ),
      const SizedBox(height: 16),
      LabeledField(
        'Invités',
        hint: 'Chaque invité doit avoir une habilitation suffisante pour le niveau choisi.',
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          if (_invited.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Wrap(spacing: 6, runSpacing: 6, children: [
                for (final u in _invited)
                  Chip(
                    label: Text(u, style: const TextStyle(fontFamily: 'monospace', fontSize: 13)),
                    backgroundColor: Palette.greenTint,
                    side: BorderSide.none,
                    shape: const StadiumBorder(),
                    onDeleted: () => setState(() => _invited.remove(u)),
                  ),
              ]),
            ),
          TextField(
            controller: _invite,
            decoration: inputDeco(hint: 'Rechercher un nom ou un identifiant', prefix: const Icon(Icons.search, size: 18)),
            onChanged: _onInviteChanged,
            onSubmitted: _addInvite,
          ),
          for (final d in _suggestions)
            InkWell(
              onTap: () => _addInvite(d.username),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: const BoxDecoration(color: Palette.surface, border: Border(bottom: BorderSide(color: Palette.line), left: BorderSide(color: Palette.line), right: BorderSide(color: Palette.line))),
                child: Row(children: [
                  InitialsAvatar(d.fullName, size: 28),
                  const SizedBox(width: 10),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(d.fullName, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                    Text('${d.username} · ${d.ministry}', style: kSmall),
                  ])),
                  Stamp.rank(d.clearance),
                ]),
              ),
            ),
        ]),
      ),
      if (_error != null) ...[const SizedBox(height: 14), ErrorBox(_error!)],
      const SizedBox(height: 22),
      Wrap(alignment: WrapAlignment.end, spacing: 10, runSpacing: 8, children: [
        OutlinedButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Annuler')),
        FilledButton(onPressed: _busy ? null : _submit, child: Text(_busy ? 'Création…' : 'Créer le salon chiffré')),
      ]),
    ]);
  }
}

class _LevelCard extends StatelessWidget {
  const _LevelCard({required this.level, required this.selected, required this.allowed, required this.onTap});
  final String level;
  final bool selected;
  final bool allowed;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final rank = rankOfLevel(level);
    final accent = rank == 0 ? Palette.ink : levelColor(rank);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Opacity(
        opacity: allowed ? 1 : 0.5,
        child: InkWell(
          onTap: allowed ? onTap : null,
          borderRadius: BorderRadius.circular(3),
          child: Container(
            padding: const EdgeInsets.fromLTRB(12, 12, 14, 12),
            decoration: BoxDecoration(
              color: selected ? Palette.greenTint : Palette.surface,
              borderRadius: BorderRadius.circular(3),
              border: Border.all(color: selected ? Palette.green : Palette.lineStrong, width: selected ? 1.5 : 1),
            ),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Icon(selected ? Icons.radio_button_checked : Icons.radio_button_unchecked, size: 20, color: selected ? Palette.green : Palette.muted),
              const SizedBox(width: 12),
              Expanded(
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(levelLabels[level]!, style: TextStyle(fontWeight: FontWeight.w800, color: accent)),
                  const SizedBox(height: 2),
                  Text(allowed ? levelBlurbs[level]! : 'Habilitation de niveau $rank requise.', style: kSmall),
                ]),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}
