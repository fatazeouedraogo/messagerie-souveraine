import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:ms_core/ms_core.dart';

import 'shell.dart';
import 'web_auth.dart';

void main() {
  final config = AppConfig.fromEnvironment(defaultClientId: 'admin-web');
  runApp(AdminApp(config: config, auth: WebAuthService(config)));
}

class AdminApp extends StatelessWidget {
  const AdminApp({super.key, required this.config, required this.auth});

  final AppConfig config;
  final AuthService auth;

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'Messagerie souveraine · Console',
        debugShowCheckedModeBanner: false,
        theme: buildTheme(),
        locale: const Locale('fr'),
        supportedLocales: const [Locale('fr')],
        localizationsDelegates: GlobalMaterialLocalizations.delegates,
        home: MsRoot(
          auth: auth,
          config: config,
          shellBuilder: (context, session) => AdminShell(session: session),
        ),
      );
}
