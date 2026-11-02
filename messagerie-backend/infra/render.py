#!/usr/bin/env python3
"""Génère les fichiers de configuration à partir des modèles *.tmpl.

Remplace uniquement les motifs ${NOM} (majuscules) par les variables d'environnement.
Les variables Nginx ($host, $uri...) et inconnues sont laissées intactes.
Échoue si une variable utilisée est absente : pas de configuration à moitié remplie.
"""
import os
import re
import sys
from pathlib import Path

PATTERN = re.compile(r"\$\{([A-Z][A-Z0-9_]*)\}")
src, dst = Path(sys.argv[1]), Path(sys.argv[2])
dst.mkdir(parents=True, exist_ok=True)

missing = set()


def sub(match):
    name = match.group(1)
    value = os.environ.get(name)
    if value is None or value == "":
        missing.add(name)
        return match.group(0)
    return value


count = 0
for tmpl in sorted(src.glob("*.tmpl")):
    out = dst / tmpl.name[: -len(".tmpl")]
    out.write_text(PATTERN.sub(sub, tmpl.read_text(encoding="utf-8")), encoding="utf-8")
    out.chmod(0o644)
    count += 1

if missing:
    sys.exit("Variables manquantes : " + ", ".join(sorted(missing)))
print(f"{count} fichiers générés dans {dst}")
