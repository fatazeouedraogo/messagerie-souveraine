# Ce que le serveur voit, et ce qu'il ne voit pas

## Le serveur NE voit PAS
- Le **contenu** des messages, des fichiers et des noms de fichiers des salons chiffrés : ils sont chiffrés sur l'appareil de l'expéditeur (Megolm) et déchiffrés sur l'appareil des destinataires.
- Les clés de chiffrement des salons.
- Le compte de service de l'API n'a aucune clé : même s'il est compromis, il ne lit aucun message.

## Le serveur VOIT (métadonnées)
- Qui est inscrit, avec ministère, fonction, habilitation (annuaire Keycloak et registre de l'API).
- Quels comptes sont membres de quels salons, et le **nom** de chaque salon (par défaut les noms de salons ne sont pas chiffrés dans Matrix).
- L'événement de classification d'un salon (niveau, durée de conservation).
- Quand et à quelle fréquence chaque compte envoie des messages, et la taille approximative des messages et des fichiers.
- Les adresses IP des connexions (les journaux Nginx ne conservent pas les paramètres d'URL).

## Conséquences pratiques
- Ne mettez pas d'information sensible dans le **nom** d'un salon.
- Un administrateur du serveur peut voir qui parle à qui et quand, pas ce qui se dit.
- Un administrateur du serveur peut ajouter un nouvel appareil frauduleux à un compte : les clients Matrix affichent un avertissement de vérification d'appareil ; les agents doivent le prendre au sérieux. Vérification croisée des appareils recommandée pour le niveau Confidentiel.
