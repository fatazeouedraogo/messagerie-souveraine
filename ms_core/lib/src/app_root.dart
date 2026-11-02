import 'package:flutter/material.dart';

import 'api_client.dart';
import 'auth.dart';
import 'config.dart';
import 'models.dart';
import 'theme.dart';
import 'widgets.dart';

/// Tout ce dont un écran a besoin une fois connecté.
class Session {
  Session({required this.api, required this.me, required this.classifications, required this.config, required this.auth});

  final ApiClient api;
  final Principal me;
  final List<Classification> classifications;
  final AppConfig config;
  final AuthService auth;
}

class AppScope extends InheritedWidget {
  const AppScope({super.key, required this.session, required super.child});
  final Session session;

  static Session of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<AppScope>();
    assert(scope != null, 'AppScope introuvable : utilisez MsRoot.');
    return scope!.session;
  }

  @override
  bool updateShouldNotify(AppScope old) => session != old.session;
}

/// Racine commune : chargement, écran de connexion, accès révoqué, puis la coque propre à l'application.
class MsRoot extends StatefulWidget {
  const MsRoot({super.key, required this.auth, required this.config, required this.shellBuilder});

  final AuthService auth;
  final AppConfig config;
  final Widget Function(BuildContext context, Session session) shellBuilder;

  @override
  State<MsRoot> createState() => _MsRootState();
}

class _MsRootState extends State<MsRoot> {
  late final ApiClient _api = ApiClient(
    baseUrl: widget.config.apiBase,
    token: widget.auth.accessToken,
    onUnauthorized: widget.auth.expire,
  );
  Future<Session>? _session;

  @override
  void initState() {
    super.initState();
    widget.auth.addListener(_onAuth);
    widget.auth.restore();
  }

  @override
  void dispose() {
    widget.auth.removeListener(_onAuth);
    super.dispose();
  }

  void _onAuth() {
    if (widget.auth.status != AuthStatus.signedIn) _session = null;
    if (mounted) setState(() {});
  }

  Future<Session> _load() async {
    final results = await Future.wait([_api.me(), _api.classifications()]);
    return Session(
      api: _api,
      me: results[0] as Principal,
      classifications: results[1] as List<Classification>,
      config: widget.config,
      auth: widget.auth,
    );
  }

  @override
  Widget build(BuildContext context) {
    final auth = widget.auth;
    switch (auth.status) {
      case AuthStatus.loading:
        return const _Splash();
      case AuthStatus.signedOut:
        return LoginScreen(
          demo: widget.config.demo,
          notice: auth.notice,
          revoked: auth.revoked,
          onSignIn: auth.signIn,
          onSignOut: auth.signOut,
        );
      case AuthStatus.signedIn:
        _session ??= _load();
        return FutureBuilder<Session>(
          future: _session,
          builder: (ctx, snap) {
            if (snap.connectionState != ConnectionState.done) return const _Splash();
            if (snap.hasError) {
              return _LoadError(
                error: snap.error!,
                onRetry: () => setState(() => _session = null),
                onSignOut: auth.signOut,
              );
            }
            return AppScope(session: snap.data!, child: widget.shellBuilder(ctx, snap.data!));
          },
        );
    }
  }
}

class _Splash extends StatelessWidget {
  const _Splash();

  @override
  Widget build(BuildContext context) => const Scaffold(
        body: Column(children: [
          FlagBar(),
          Expanded(child: Center(child: SizedBox(width: 28, height: 28, child: CircularProgressIndicator(strokeWidth: 3, color: Palette.green)))),
        ]),
      );
}

class _LoadError extends StatelessWidget {
  const _LoadError({required this.error, required this.onRetry, required this.onSignOut});
  final Object error;
  final VoidCallback onRetry;
  final Future<void> Function() onSignOut;

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Column(children: [
          const FlagBar(),
          Expanded(
            child: Center(
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 440),
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    ErrorBox(error),
                    const SizedBox(height: 16),
                    FilledButton(onPressed: onRetry, child: const Text('Réessayer')),
                    const SizedBox(height: 8),
                    OutlinedButton(onPressed: onSignOut, child: const Text('Se déconnecter')),
                  ]),
                ),
              ),
            ),
          ),
        ]),
      );
}

/// Écran de connexion (aussi utilisé pour « accès révoqué »).
class LoginScreen extends StatelessWidget {
  const LoginScreen({
    super.key,
    required this.onSignIn,
    required this.onSignOut,
    required this.demo,
    this.notice,
    this.revoked = false,
  });

  final Future<void> Function() onSignIn;
  final Future<void> Function() onSignOut;
  final bool demo;
  final String? notice;
  final bool revoked;

  @override
  Widget build(BuildContext context) {
    final intro = Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text('ADMINISTRATION PUBLIQUE · BURKINA FASO',
          style: const TextStyle(color: Palette.greenInk, fontWeight: FontWeight.w800, fontSize: 12, letterSpacing: 1.4)),
      const SizedBox(height: 14),
      Text('Messagerie souveraine', style: serif(40, height: 1.05)),
      const SizedBox(height: 16),
      const Text(
        "Échanger entre agents de l'État, sans que le contenu ne quitte le pays ni ne soit lisible du serveur.",
        style: TextStyle(fontSize: 17, color: Palette.body, height: 1.45),
      ),
      const SizedBox(height: 26),
      const _Assurance('Chiffrée de bout en bout.', ' Même les administrateurs ne lisent pas les messages.'),
      const _Assurance('Accès fermé.', ' Seuls les agents enrôlés par leur ministère peuvent entrer.'),
      const _Assurance('Révocable en un instant.', " Un agent qui part perd l'accès partout."),
    ]);

    final box = Container(
      padding: const EdgeInsets.all(26),
      decoration: BoxDecoration(color: Palette.surface, border: Border.all(color: Palette.lineStrong)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        
        if (revoked) ...[
          const Notice(title: 'Accès révoqué', message: "Votre accès a été retiré. Contactez l'administrateur de votre ministère.", kind: NoticeKind.danger),
          const SizedBox(height: 16),
        ] else if (notice != null) ...[
          Container(
            padding: const EdgeInsets.all(12),
            decoration: const BoxDecoration(color: Palette.redTint, border: Border(left: BorderSide(color: Palette.red, width: 3))),
            child: Text(notice!, style: const TextStyle(fontWeight: FontWeight.w700, color: Color(0xFF6E140F))),
          ),
          const SizedBox(height: 16),
        ],
        Text('Connexion', style: serif(20)),
        const SizedBox(height: 8),
        const Text(
          "Avec votre compte gouvernemental. Connexion en deux étapes : mot de passe, puis code de votre application d'authentification.",
          style: kSmall,
        ),
        const SizedBox(height: 18),
        revoked
            ? OutlinedButton(onPressed: onSignOut, child: const Text('Fermer la session'))
            : FilledButton(onPressed: onSignIn, child: const Text('Se connecter')),
      ]),
    );

    return Scaffold(
      body: Column(children: [
        const FlagBar(),
        Expanded(
          child: LayoutBuilder(builder: (ctx, c) {
            final wide = c.maxWidth >= 860;
            return Center(
              child: SingleChildScrollView(
                padding: EdgeInsets.symmetric(horizontal: wide ? 32 : 18, vertical: 28),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 1040),
                  child: wide
                      ? Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
                          Expanded(flex: 115, child: intro),
                          const SizedBox(width: 56),
                          Expanded(flex: 100, child: box),
                        ])
                      : Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [intro, const SizedBox(height: 28), box]),
                ),
              ),
            );
          }),
        ),
      ]),
    );
  }
}

class _Assurance extends StatelessWidget {
  const _Assurance(this.bold, this.rest);
  final String bold;
  final String rest;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 14),
        child: Container(
          padding: const EdgeInsets.only(left: 14),
          decoration: const BoxDecoration(border: Border(left: BorderSide(color: Palette.green, width: 3))),
          child: Text.rich(TextSpan(children: [
            TextSpan(text: bold, style: const TextStyle(fontWeight: FontWeight.w700, color: Palette.ink)),
            TextSpan(text: rest),
          ]), style: const TextStyle(color: Palette.body, height: 1.4)),
        ),
      );
}
