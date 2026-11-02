import 'package:flutter/material.dart';

/// Palette « papier d'administration » : fond crème, vert d'État, cachets de classification.
class Palette {
  static const paper = Color(0xFFF4F1EA);
  static const surface = Color(0xFFFBFAF6);
  static const ink = Color(0xFF1B1A17);
  static const body = Color(0xFF3D3A33);
  static const muted = Color(0xFF6B675D);
  static const line = Color(0xFFD9D4C7);
  static const lineStrong = Color(0xFFB4AE9E);
  static const green = Color(0xFF1A7F4E);
  static const greenInk = Color(0xFF115C38);
  static const greenTint = Color(0xFFE4F3EA);
  static const red = Color(0xFFB3261E);
  static const redTint = Color(0xFFF8E4E1);
  static const amber = Color(0xFF86550A);
  static const amberTint = Color(0xFFF6EBCF);
  static const level0 = Color(0xFF2F7A52);
}

/// Polices : par défaut celles du système (rien n'est téléchargé). Pour le rendu « document d'État »,
/// ajoutez Inter et Source Serif 4 (voir docs/FLUTTER.md) puis compilez avec --dart-define=BUNDLED_FONTS=true.
const bool kBundledFonts = bool.fromEnvironment('BUNDLED_FONTS');
const String? kBodyFont = kBundledFonts ? 'Inter' : null;
const String? kSerifFont = kBundledFonts ? 'SourceSerif4' : null;
const List<String> kSerifFallback = ['Georgia', 'Times New Roman', 'serif'];

TextStyle serif(double size, {FontWeight weight = FontWeight.w600, Color color = Palette.ink, double height = 1.2}) => TextStyle(
      fontFamily: kSerifFont,
      fontFamilyFallback: kSerifFallback,
      fontSize: size,
      fontWeight: weight,
      color: color,
      height: height,
    );

const TextStyle kSmall = TextStyle(fontSize: 13, color: Palette.muted, height: 1.4);
const TextStyle kLabel = TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Palette.ink);
const TextStyle kMono = TextStyle(fontFamily: 'monospace', fontSize: 12.5, color: Palette.body);

InputDecoration inputDeco({String? hint, Widget? prefix}) => InputDecoration(
      hintText: hint,
      hintStyle: const TextStyle(color: Palette.muted),
      prefixIcon: prefix,
      filled: true,
      fillColor: Palette.surface,
      isDense: true,
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 13),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(3), borderSide: const BorderSide(color: Palette.lineStrong)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(3), borderSide: const BorderSide(color: Palette.lineStrong)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(3), borderSide: const BorderSide(color: Palette.green, width: 2)),
      errorBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(3), borderSide: const BorderSide(color: Palette.red)),
      focusedErrorBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(3), borderSide: const BorderSide(color: Palette.red, width: 2)),
    );

ThemeData buildTheme() {
  final scheme = ColorScheme.fromSeed(seedColor: Palette.green, brightness: Brightness.light).copyWith(
    primary: Palette.green,
    onPrimary: Colors.white,
    surface: Palette.surface,
    onSurface: Palette.ink,
    error: Palette.red,
    outline: Palette.lineStrong,
    outlineVariant: Palette.line,
  );
  final shape = RoundedRectangleBorder(borderRadius: BorderRadius.circular(3));
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    fontFamily: kBodyFont,
    scaffoldBackgroundColor: Palette.paper,
    dividerColor: Palette.line,
    splashFactory: InkRipple.splashFactory,
    textTheme: ThemeData.light().textTheme.apply(bodyColor: Palette.ink, displayColor: Palette.ink),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: Palette.green,
        foregroundColor: Colors.white,
        minimumSize: const Size(0, 44),
        padding: const EdgeInsets.symmetric(horizontal: 18),
        shape: shape,
        textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: Palette.ink,
        backgroundColor: Palette.surface,
        minimumSize: const Size(0, 44),
        padding: const EdgeInsets.symmetric(horizontal: 18),
        side: const BorderSide(color: Palette.lineStrong),
        shape: shape,
        textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
      ),
    ),
    textButtonTheme: TextButtonThemeData(style: TextButton.styleFrom(foregroundColor: Palette.greenInk, shape: shape)),
    dividerTheme: const DividerThemeData(color: Palette.line, space: 1, thickness: 1),
    snackBarTheme: SnackBarThemeData(behavior: SnackBarBehavior.floating, shape: shape),
  );
}
