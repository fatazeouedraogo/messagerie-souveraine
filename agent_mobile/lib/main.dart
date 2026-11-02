import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:ms_core/ms_core.dart';

import 'mobile_auth.dart';
import 'shell.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
  final config = AppConfig.fromEnvironment(defaultClientId: 'agent-mobile');
  runApp(AgentApp(config: config, auth: MobileAuthService(config)));
}

class AgentApp extends StatelessWidget {
  const AgentApp({super.key, required this.config, required this.auth});

  final AppConfig config;
  final AuthService auth;

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'Messagerie souveraine',
        debugShowCheckedModeBanner: false,
        theme: buildTheme(),
        locale: const Locale('fr'),
        supportedLocales: const [Locale('fr')],
        localizationsDelegates: GlobalMaterialLocalizations.delegates,
        home: MsRoot(
          auth: auth,
          config: config,
          shellBuilder: (context, session) => AgentShell(session: session),
        ),
      );
}
