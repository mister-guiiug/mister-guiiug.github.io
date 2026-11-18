/**
 * L'APERÇU LOCAL D'UNE CONSTRUCTION.
 *
 * L'accueil désigne ses propres fichiers par des adresses absolues de la
 * production (`https://mister-guiiug.github.io/previews/…`). Servie ailleurs,
 * par exemple sous `http://localhost:5250/hub-a-f-site/`, une construction
 * montrait donc les miniatures, le manifeste et le worker de la PRODUCTION, et
 * sa politique de sécurité ne pouvait pas être éprouvée : un navigateur refuse
 * d'enregistrer un worker d'une autre origine avant même de la consulter.
 *
 * `HUB_APERCU=<adresse>` réécrit, dans l'accueil et le manifeste, l'adresse des
 * seuls fichiers du hub vers cette adresse. Les liens vers les apps, leurs
 * icônes, l'adresse canonique et les données structurées restent ceux de
 * l'origine. Pour un aperçu seulement : la CI ne pose jamais cette variable.
 */

/** Les fichiers que publie le hub à la racine de l'origine. */
export const FICHIERS_DU_HUB = [
  'previews/',
  'index.html',
  'a-propos.html',
  'mister-quota.html',
  'manifest.webmanifest',
  'en/manifest.webmanifest',
  'sw.js',
  'hub-command.js',
  'command.js',
  'ciel-clair.svg',
  'ciel-sombre.svg',
  'og-image.jpg',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png',
  'favicon.svg',
  'favicon.ico',
  'favicon.png',
];

const litteral = texte => texte.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/**
 * L'adresse d'aperçu lue dans `HUB_APERCU`, sans barre finale, ou `null`.
 *
 * @param {string|undefined} valeur
 */
export function adresseApercu(valeur) {
  if (!valeur) return null;
  const url = new URL(valeur);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`HUB_APERCU : adresse http(s) attendue, reçu ${valeur}`);
  }
  return url.href.replace(/\/+$/, '');
}

/**
 * Réécrit vers l'aperçu l'adresse des fichiers du hub, et d'eux seuls.
 *
 * @param {string} texte
 * @param {{ origine: string, apercu: string|null }} p
 */
export function versApercu(texte, { origine, apercu }) {
  if (!apercu) return texte;
  const motif = new RegExp(
    `${litteral(origine)}/(?=(?:${FICHIERS_DU_HUB.map(litteral).join('|')}))`,
    'g'
  );
  return texte.replace(motif, () => `${apercu}/`);
}
