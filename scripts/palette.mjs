/**
 * LA PALETTE DU HUB, ÉCRITE UNE FOIS.
 *
 * La palette sombre était recopiée trois fois : pour le thème sombre choisi et
 * pour le thème « système » sur un appareil sombre (accueil/hub.css), puis pour
 * les pages statiques (pages-hub.mjs). Une correction faite dans une copie
 * manquait aux autres : le badge « Non vérifiée » est resté à 2,13:1 dans le
 * thème « système » sombre. Les jetons vivent ici ; la feuille de style de
 * l'accueil et le style des pages statiques les reçoivent à la construction.
 *
 * Le motif du fond de l'accueil fait partie de la palette : il changeait avec
 * elle, dans trois règles qui se recouvraient. C'est un ciel — trois nuages de
 * nébuleuse en dégradés, qui s'effacent en descendant, puis des constellations
 * sur une poussière d'étoiles, un fichier SVG par thème (scripts/ciel.mjs).
 * Une aube pastel en clair, une nuit en sombre.
 *
 * LES NUAGES TEINTENT LE FOND DERRIÈRE DU TEXTE : le titre des sections, le
 * compte, le pied de page. Leurs opacités sont réglées pour que le texte gris
 * (--doux) garde 4,5:1 même là où les trois se superposeraient
 * (test/ciel.test.mjs le vérifie).
 */
import { FICHIERS_DU_CIEL, TUILE } from './ciel.mjs';

/** Les nuages : ellipse, position, teinte. Trois couches qui ne se répètent pas. */
const nuage = (forme, teinte) => `radial-gradient(${forme}, ${teinte}, transparent 70%)`;
const FORMES = ['ellipse 60% 45% at 8% 0%', 'ellipse 55% 40% at 92% 6%', 'ellipse 70% 32% at 55% 36%'];

/** Le thème clair : toutes les couleurs de l'accueil, et son motif. */
export const CLAIR = {
  fond: '#f7f8fc',
  'fond-carte': '#ffffff',
  texte: '#1a1b26',
  doux: '#55586b',
  bord: '#d9dbe6',
  lien: '#2f4bd1',
  barre: '#eef0f7',
  'alpha-fg': '#8a4b08',
  'alpha-bg': '#fff4e5',
  'alpha-bd': '#e0b070',
  'beta-fg': '#0a5c4a',
  'beta-bg': '#e8f7f2',
  'beta-bd': '#7bc4b0',
  chrome: '#f7f8fc',
  // « Non vérifiée » : une teinte, et le texte qui la lit au-dessus de 4,5:1.
  panne: '#b45309',
  'panne-fg': '#9a3412',
  // Lilas, ciel et pêche : une aube. L'adresse part de l'origine, posée au
  // rendu comme celle des icônes : relative, elle visait /en/ciel-….svg depuis
  // la page anglaise. L'aperçu local la réécrit (apercu.mjs).
  motif: [
    nuage(FORMES[0], 'rgb(167 139 250 / 0.24)'),
    nuage(FORMES[1], 'rgb(56 189 248 / 0.18)'),
    nuage(FORMES[2], 'rgb(251 146 60 / 0.1)'),
    `url("__HUB_ORIGINE__/${FICHIERS_DU_CIEL.clair}")`,
  ],
  'motif-taille': `100% 1600px, 100% 1600px, 100% 1600px, ${TUILE.largeur}px ${TUILE.hauteur}px`,
  'motif-repete': 'no-repeat, no-repeat, no-repeat, repeat',
};

/** Le thème sombre : ce qui change par rapport au clair, et rien d'autre. */
export const SOMBRE = {
  fond: '#0f1220',
  'fond-carte': '#15192b',
  texte: '#e8e9f2',
  doux: '#a8abc2',
  bord: '#2a2e45',
  lien: '#9fb2ff',
  barre: '#181c2e',
  'alpha-fg': '#ffd9a0',
  'alpha-bg': '#3a2a12',
  'alpha-bd': '#8a6230',
  'beta-fg': '#a8e8d4',
  'beta-bg': '#12352c',
  'beta-bd': '#3d7a68',
  chrome: '#0f1220',
  'panne-fg': '#fdba74',
  // Violet, bleu et rose : une nébuleuse. Mêmes couches qu'en clair : la
  // taille et la répétition du thème clair valent aussi ici.
  motif: [
    nuage(FORMES[0], 'rgb(124 58 237 / 0.26)'),
    nuage(FORMES[1], 'rgb(14 165 233 / 0.17)'),
    nuage(FORMES[2], 'rgb(236 72 153 / 0.1)'),
    `url("__HUB_ORIGINE__/${FICHIERS_DU_CIEL.sombre}")`,
  ],
};

/** Les jetons que lisent aussi les pages statiques. */
export const JETONS_COMMUNS = ['fond', 'fond-carte', 'texte', 'doux', 'bord', 'lien', 'barre'];

/** Les jetons nommés d'une palette, dans l'ordre demandé. */
export const choisir = (palette, noms) => Object.fromEntries(noms.map(n => [n, palette[n]]));

/**
 * Les déclarations CSS d'une palette, une par ligne, à l'indentation donnée.
 * Une valeur en tableau (le motif) s'écrit une couche par ligne.
 */
export const declarations = (palette, indentation) =>
  Object.entries(palette)
    .map(([nom, valeur]) =>
      Array.isArray(valeur)
        ? `${indentation}--${nom}:\n${valeur.map(v => `${indentation}  ${v}`).join(',\n')};`
        : `${indentation}--${nom}: ${valeur};`
    )
    .join('\n');

const PALETTES = { clair: CLAIR, sombre: SOMBRE };

/**
 * Pose les palettes dans une feuille de style, à la place des marqueurs
 * `/* @palette clair *\/` et `/* @palette sombre *\/`, à leur indentation.
 */
export const poserPalettes = css =>
  css.replace(/^([ \t]*)\/\* @palette (clair|sombre) \*\/$/gm, (_, indentation, nom) =>
    declarations(PALETTES[nom], indentation)
  );
