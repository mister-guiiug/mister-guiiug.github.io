/**
 * LE CIEL DU FOND DE L'ACCUEIL : des constellations aux traits fins sur une
 * poussière d'étoiles, un fichier SVG par thème.
 *
 * Les nuages de la nébuleuse sont des dégradés, dans la palette
 * (scripts/palette.mjs) ; ce qui ne s'écrit pas en dégradé — des traits, deux
 * cents étoiles — vient d'ici. UN FICHIER, PAS UNE IMAGE `data:` : la politique
 * de l'accueil n'admet en `img-src` que l'origine de la famille
 * (scripts/csp.mjs). Servi depuis l'origine, le ciel n'y change rien, se met en
 * cache, et chaque visiteur ne télécharge que celui de son thème.
 *
 * Les étoiles sont tirées au sort, mais d'une graine fixe : deux constructions
 * écrivent le même fichier, octet pour octet.
 */

/** Les fichiers écrits à la racine du site, par thème. */
export const FICHIERS_DU_CIEL = { clair: 'ciel-clair.svg', sombre: 'ciel-sombre.svg' };

/** La tuile, répétée sur toute la page : assez grande pour que la répétition ne se voie pas. */
export const TUILE = { largeur: 960, hauteur: 760 };

/**
 * Les teintes de chaque thème. Les traits prennent celle des nuages — violet
 * encre en clair, blanc lavande en sombre — plutôt que le bleu des liens.
 */
const TEINTES = {
  clair: {
    figures: { couleur: '#5b3fc4', trait: 0.17, etoile: 0.42 },
    etoiles: { couleur: '#5b3fc4', n: 40, rayon: [0.7, 1.2], eclat: [0.12, 0.26] },
    poussiere: { couleur: '#3b4270', n: 110, rayon: [0.4, 0.8], eclat: [0.08, 0.2] },
  },
  sombre: {
    figures: { couleur: '#e0d8ff', trait: 0.22, etoile: 0.85 },
    etoiles: { couleur: '#f1eaff', n: 40, rayon: [0.7, 1.3], eclat: [0.4, 0.85] },
    poussiere: { couleur: '#e8ecff', n: 110, rayon: [0.4, 0.9], eclat: [0.2, 0.5] },
  },
};

/**
 * Quatre figures, en fractions de la tuile : une casserole (Grande Ourse), un
 * W (Cassiopée), un chasseur (Orion), un triangle (celui de l'été).
 */
export const FIGURES = [
  [[0.08, 0.2], [0.15, 0.17], [0.22, 0.19], [0.28, 0.24], [0.27, 0.33], [0.36, 0.34], [0.37, 0.25], [0.28, 0.24]],
  [[0.62, 0.1], [0.68, 0.18], [0.74, 0.12], [0.8, 0.2], [0.87, 0.13]],
  [[0.15, 0.58], [0.22, 0.62], [0.2, 0.72], [0.24, 0.73], [0.28, 0.74], [0.27, 0.62], [0.33, 0.57]],
  [[0.62, 0.62], [0.82, 0.55], [0.74, 0.82], [0.62, 0.62]],
];

/** Un tirage reproductible (mulberry32). */
function tirage(graine) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const un = n => Math.round(n * 10) / 10;
const deux = n => Math.round(n * 100) / 100;

function semis({ couleur, n, rayon, eclat }, hasard) {
  const entre = ([a, b]) => a + (b - a) * hasard();
  let s = `<g fill="${couleur}">`;
  for (let i = 0; i < n; i++) {
    const x = un(hasard() * TUILE.largeur);
    const y = un(hasard() * TUILE.hauteur);
    s += `<circle cx="${x}" cy="${y}" r="${deux(entre(rayon))}" fill-opacity="${deux(entre(eclat))}"/>`;
  }
  return s + '</g>';
}

function figures({ couleur, trait, etoile }, hasard) {
  const point = ([a, b]) => [un(a * TUILE.largeur), un(b * TUILE.hauteur)];
  let s = `<g fill="none" stroke="${couleur}" stroke-opacity="${trait}" stroke-width="0.8" stroke-linecap="round" stroke-linejoin="round">`;
  for (const f of FIGURES) s += `<polyline points="${f.map(p => point(p).join(',')).join(' ')}"/>`;
  s += `</g><g fill="${couleur}">`;
  for (const f of FIGURES) {
    for (const p of f) {
      const [x, y] = point(p);
      const r = 1.4 + hasard();
      // un halo, puis l'étoile
      s += `<circle cx="${x}" cy="${y}" r="${un(r * 2.6)}" fill-opacity="${deux(etoile * 0.12)}"/>`;
      s += `<circle cx="${x}" cy="${y}" r="${un(r)}" fill-opacity="${etoile}"/>`;
    }
  }
  return s + '</g>';
}

/** Le SVG d'un thème : figures, étoiles, puis poussière. */
export function cielSvg(theme) {
  const t = TEINTES[theme];
  if (!t) throw new Error(`ciel : thème inconnu, ${theme}`);
  const hasard = tirage(21);
  const { largeur, hauteur } = TUILE;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${largeur}" height="${hauteur}" viewBox="0 0 ${largeur} ${hauteur}">` +
    figures(t.figures, hasard) +
    semis(t.etoiles, hasard) +
    semis(t.poussiere, hasard) +
    '</svg>\n'
  );
}
