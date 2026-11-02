import 'package:flutter/material.dart';
import 'package:ms_core/ms_core.dart';

import 'views/agents.dart';
import 'views/audit.dart';
import 'views/dashboard.dart';

class _NavItem {
  const _NavItem(this.label, this.icon, this.builder);
  final String label;
  final IconData icon;
  final Widget Function() builder;
}

/// Coque : en-tête, navigation latérale (écran large) ou barre du bas (téléphone).
/// Les entrées dépendent du rôle : un agent simple ne voit que « Salons ».
class AdminShell extends StatefulWidget {
  const AdminShell({super.key, required this.session});
  final Session session;

  @override
  State<AdminShell> createState() => _AdminShellState();
}

class _AdminShellState extends State<AdminShell> {
  int _index = 0;

  late final List<_NavItem> _items = [
    if (widget.session.me.isAdmin) _NavItem('Tableau de bord', Icons.dashboard_outlined, () => const DashboardView()),
    if (widget.session.me.isAdmin) _NavItem('Agents', Icons.group_outlined, () => const AgentsView()),
    _NavItem('Salons', Icons.chat_bubble_outline, () => const RoomsView()),
    if (widget.session.me.isSuperAdmin) _NavItem('Journal', Icons.receipt_long_outlined, () => const AuditView()),
  ];

  @override
  Widget build(BuildContext context) {
    final me = widget.session.me;
    final wide = MediaQuery.of(context).size.width >= 860;
    final content = KeyedSubtree(key: ValueKey(_index), child: _items[_index].builder());

    return Scaffold(
      body: Column(children: [
        const FlagBar(),
        _TopBar(session: widget.session, compact: !wide),
        Expanded(
          child: wide
              ? Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  _Rail(items: _items, index: _index, onSelect: (i) => setState(() => _index = i)),
                  Expanded(child: Align(alignment: Alignment.topCenter, child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 1180), child: content))),
                ])
              : content,
        ),
      ]),
      bottomNavigationBar: wide || _items.length < 2
          ? null
          : NavigationBar(
              backgroundColor: Palette.surface,
              indicatorColor: Palette.greenTint,
              selectedIndex: _index,
              onDestinationSelected: (i) => setState(() => _index = i),
              destinations: [for (final it in _items) NavigationDestination(icon: Icon(it.icon), label: it.label)],
            ),
    );
  }
}

class _TopBar extends StatelessWidget {
  const _TopBar({required this.session, required this.compact});
  final Session session;
  final bool compact;

  @override
  Widget build(BuildContext context) {
    final me = session.me;
    return Container(
      padding: EdgeInsets.symmetric(horizontal: compact ? 14 : 24, vertical: 10),
      decoration: const BoxDecoration(color: Palette.surface, border: Border(bottom: BorderSide(color: Palette.line))),
      child: Row(children: [
        const BrandMark(),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
            Text('Messagerie souveraine', style: serif(17, height: 1.1)),
            if (!compact) Text('Administration publique', style: const TextStyle(fontSize: 12, color: Palette.muted)),
          ]),
        ),
        InitialsAvatar(me.name),
        if (!compact) ...[
          const SizedBox(width: 12),
          Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
            Text(me.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14, height: 1.2)),
            Text('${roleLabels[me.role] ?? me.role} · ${me.ministry ?? ''}', style: const TextStyle(fontSize: 12, color: Palette.muted)),
          ]),
        ],
        IconButton(tooltip: 'Se déconnecter', onPressed: session.auth.signOut, icon: const Icon(Icons.logout, color: Palette.muted)),
      ]),
    );
  }
}

class _Rail extends StatelessWidget {
  const _Rail({required this.items, required this.index, required this.onSelect});
  final List<_NavItem> items;
  final int index;
  final ValueChanged<int> onSelect;

  @override
  Widget build(BuildContext context) => Container(
        width: 236,
        padding: const EdgeInsets.fromLTRB(12, 20, 12, 16),
        decoration: const BoxDecoration(border: Border(right: BorderSide(color: Palette.line))),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          for (var i = 0; i < items.length; i++) _RailLink(item: items[i], active: i == index, onTap: () => onSelect(i)),
          const Spacer(),
          const Padding(
            padding: EdgeInsets.fromLTRB(12, 0, 12, 4),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Icon(Icons.verified_user_outlined, size: 14, color: Palette.muted),
              SizedBox(width: 6),
              Expanded(child: Text('Connexion à deux facteurs. Messages chiffrés de bout en bout.', style: TextStyle(fontSize: 12, color: Palette.muted, height: 1.4))),
            ]),
          ),
        ]),
      );
}

class _RailLink extends StatelessWidget {
  const _RailLink({required this.item, required this.active, required this.onTap});
  final _NavItem item;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 2),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(4),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
            decoration: BoxDecoration(
              color: active ? Palette.greenTint : null,
              borderRadius: BorderRadius.circular(4),
              border: Border(left: BorderSide(color: active ? Palette.green : Colors.transparent, width: 3)),
            ),
            child: Row(children: [
              Icon(item.icon, size: 20, color: active ? Palette.greenInk : Palette.muted),
              const SizedBox(width: 12),
              Text(item.label, style: TextStyle(fontWeight: active ? FontWeight.w700 : FontWeight.w500, color: active ? Palette.greenInk : Palette.muted)),
            ]),
          ),
        ),
      );
}
