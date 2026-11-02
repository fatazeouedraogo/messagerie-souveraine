import { randomInt } from 'node:crypto';

// Mot de passe temporaire lisible, tiré avec un générateur cryptographique.
// Alphabet sans caractères ambigus (0/O, 1/l/I). L'agent doit le changer à la première connexion.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

export function generateTempPassword(groups = 3, size = 5) {
  const part = () => Array.from({ length: size }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  return Array.from({ length: groups }, part).join('-');
}
