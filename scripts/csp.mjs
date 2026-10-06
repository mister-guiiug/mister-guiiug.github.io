/**
 * LA POLITIQUE DE SÉCURITÉ DU CONTENU DE L'ACCUEIL, calculée à la construction.
 *
 * L'accueil est la seule page du hub qui exécute du script, et la seule sans
 * politique : les pages statiques ont la leur (`default-src 'none'`, voir
 * pages-hub.mjs). Il partage son origine avec une vingtaine d'applications :
 * `'self'` y autoriserait n'importe quel script servi sous `/<app>/`. La
 * politique nomme donc chaque ressource par son empreinte ou son adresse
 * complète :
 *   - script-src : l'empreinte SHA-256 de chaque script écrit dans la page, et
 *     l'adresse exacte de `hub-command.js` et `command.js` quand le raccourci
 *     Ctrl+K existe. Ni 'unsafe-inline' ni 'self' ;
 *   - style-src : l'empreinte de chaque élément `<style>`. La page n'a aucun
 *     attribut `style` (un test le garde) ; son script ne touche au style que
 *     par l'objet `style` (CSSOM), que la politique ne régit pas ;
 *   - img-src : l'origine de la famille, d'où viennent aperçus, icônes et le
 *     ciel du fond — servi en fichier pour cette raison, pas en `data:` ;
 *   - connect-src 'none' : la page ne lit rien par fetch ;
 *   - worker-src : `sw.js` seul ; manifest-src : le manifeste seul ;
 *   - default-src, object-src, base-uri, form-action : 'none'.
 * `frame-ancestors` est sans effet dans une balise `<meta>`, et GitHub Pages
 * n'envoie aucun en-tête : rien ne peut l'imposer d'ici.
 *
 * LES EMPREINTES PORTENT SUR LA PAGE DATÉE. Le JSON des libellés contient la
 * date « Mis à jour le », que `dater` pose après le calcul de l'empreinte de
 * contenu. La page est donc rendue avec `JETON_CSP` à la place de la
 * politique, et `poserPolitique` le remplace en dernier.
 */
import { createHash } from 'node:crypto';

/** La place de la politique dans la page, jusqu'à `poserPolitique`. */
export const JETON_CSP = '@@CSP@@';

const empreinte = texte => `'sha256-${createHash('sha256').update(texte, 'utf8').digest('base64')}'`;

/** Le texte des `<script>` exécutables écrits dans la page : ni `src`, ni JSON-LD. */
export const scriptsEnLigne = html =>
  [...html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .filter(([, attributs = '']) => !/\ssrc=/.test(attributs) && !/application\/ld\+json/.test(attributs))
    .map(m => m[2]);

/** Le texte des éléments `<style>` de la page. */
export const stylesEnLigne = html =>
  [...html.matchAll(/<style(\s[^>]*)?>([\s\S]*?)<\/style>/g)].map(m => m[2]);

/**
 * La politique de l'accueil.
 *
 * @param {string} html  la page, datée
 * @param {object} p
 * @param {string} p.origine            l'origine de la famille
 * @param {string|null} [p.apercu]      l'adresse d'un aperçu local (voir apercu.mjs) :
 *   les fichiers du hub y sont servis, les icônes des apps restent sur l'origine
 * @param {string[]} [p.scripts]        les adresses complètes des scripts externes
 */
export function politiqueAccueil(html, { origine, apercu = null, scripts = [] }) {
  const hub = apercu ?? origine;
  return [
    "default-src 'none'",
    ['script-src', ...scriptsEnLigne(html).map(empreinte), ...scripts].join(' '),
    ['style-src', ...stylesEnLigne(html).map(empreinte)].join(' '),
    ['img-src', origine, ...(apercu ? [`${apercu}/`] : [])].join(' '),
    "connect-src 'none'",
    `worker-src ${hub}/sw.js`,
    `manifest-src ${hub}/manifest.webmanifest`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

/** Pose la politique à la place de `JETON_CSP`, une fois la page datée. */
export function poserPolitique(html, options) {
  const morceaux = html.split(JETON_CSP);
  if (morceaux.length !== 2) {
    throw new Error(`la page porte ${morceaux.length - 1} jeton(s) de politique, un attendu`);
  }
  return morceaux.join(politiqueAccueil(html, options));
}
