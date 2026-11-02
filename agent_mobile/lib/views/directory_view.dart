import 'dart:async';

import 'package:flutter/material.dart';
import 'package:ms_core/ms_core.dart';

/// Annuaire : retrouver un collègue actif (nom, ministère, fonction, habilitation).
class DirectoryView extends StatefulWidget {
  const DirectoryView({super.key});

  @override
  State<DirectoryView> createState() => _DirectoryViewState();
}

class _DirectoryViewState extends State<DirectoryView> {
  final _q = TextEditingController();
  Timer? _debounce;
  List<DirectoryEntry> _rows = const [];
  Object? _error;
  bool _busy = false;
  bool _searched = false;

  @override
  void dispose() {
    _debounce?.cancel();
    _q.dispose();
    super.dispose();
  }

  void _onChanged(String v) {
    _debounce?.cancel();
    if (v.trim().length < 2) {
      setState(() {
        _rows = const [];
        _searched = false;
        _error = null;
      });
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 300), () => _run(v.trim()));
  }

  Future<void> _run(String term) async {
    final s = AppScope.of(context);
    setState(() => _busy = true);
    try {
      final r = await s.api.directory(term);
      if (!mounted || _q.text.trim() != term) return;
      setState(() {
        _rows = r;
        _error = null;
        _searched = true;
      });
    } catch (e) {
      if (mounted) setState(() => _error = e);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => ListView(
        padding: const EdgeInsets.fromLTRB(16, 18, 16, 32),
        children: [
          TextField(
            controller: _q,
            onChanged: _onChanged,
            textInputAction: TextInputAction.search,
            decoration: inputDeco(hint: 'Nom ou identifiant (2 lettres minimum)', prefix: const Icon(Icons.search, size: 18)),
          ),
          const SizedBox(height: 14),
          if (_busy) const LinearProgressIndicator(minHeight: 2, color: Palette.green, backgroundColor: Palette.line),
          if (_error != null) ErrorBox(_error!),
          if (!_searched && _error == null)
            const Padding(padding: EdgeInsets.only(top: 24), child: Text("Seuls les agents actifs apparaissent. L'habilitation indique les salons auxquels un collègue peut être invité.", style: kSmall)),
          if (_searched && _rows.isEmpty) const Padding(padding: EdgeInsets.only(top: 24), child: Text('Aucun agent trouvé.', style: kSmall)),
          if (_rows.isNotEmpty)
            Container(
              decoration: BoxDecoration(color: Palette.surface, border: Border.all(color: Palette.line)),
              child: Column(children: [
                for (var i = 0; i < _rows.length; i++) ...[
                  if (i > 0) const Divider(),
                  Padding(
                    padding: const EdgeInsets.all(14),
                    child: Row(children: [
                      InitialsAvatar(_rows[i].fullName),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(_rows[i].fullName, style: const TextStyle(fontWeight: FontWeight.w700)),
                          Text('${_rows[i].jobTitle} · ${_rows[i].ministry}', style: kSmall),
                          Text('@${_rows[i].username}', style: kMono.copyWith(color: Palette.muted)),
                        ]),
                      ),
                      Stamp.rank(_rows[i].clearance),
                    ]),
                  ),
                ],
              ]),
            ),
        ],
      );
}
