import 'package:flutter/material.dart';
import 'package:ms_core/ms_core.dart';

import 'views/directory_view.dart';
import 'views/profile_view.dart';

/// Coque mobile : trois onglets (Salons, Annuaire, Profil), barre du bas.
class AgentShell extends StatefulWidget {
  const AgentShell({super.key, required this.session});
  final Session session;

  @override
  State<AgentShell> createState() => _AgentShellState();
}

class _AgentShellState extends State<AgentShell> {
  int _index = 0;

  static const _titles = ['Salons', 'Annuaire', 'Profil'];

  @override
  Widget build(BuildContext context) {
    final pages = <Widget>[const RoomsView(), const DirectoryView(), ProfileView(session: widget.session)];
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: Column(children: [
          const FlagBar(),
          Container(
            padding: const EdgeInsets.fromLTRB(16, 10, 8, 10),
            decoration: const BoxDecoration(color: Palette.surface, border: Border(bottom: BorderSide(color: Palette.line))),
            child: Row(children: [
              const BrandMark(),
              const SizedBox(width: 12),
              Expanded(child: Text(_titles[_index], style: serif(19, height: 1.1))),
              
              const SizedBox(width: 8),
            ]),
          ),
          Expanded(child: IndexedStack(index: _index, children: pages)),
        ]),
      ),
      bottomNavigationBar: NavigationBar(
        backgroundColor: Palette.surface,
        indicatorColor: Palette.greenTint,
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.lock_outline), selectedIcon: Icon(Icons.lock), label: 'Salons'),
          NavigationDestination(icon: Icon(Icons.groups_outlined), selectedIcon: Icon(Icons.groups), label: 'Annuaire'),
          NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Profil'),
        ],
      ),
    );
  }
}
