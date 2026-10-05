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
 * Le motif du fond de l'accueil, un halo et des points, fait partie de la
 * palette : il changeait avec elle, dans trois règles qui se recouvraient.
 */

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
  motif: [
    'radial-gradient(ellipse 90% 55% at 50% -15%, color-mix(in srgb, var(--lien) 16%, transparent), transparent 70%)',
    'radial-gradient(circle at 12% 18%, color-mix(in srgb, var(--texte) 4%, transparent) 0 1px, transparent 1.5px)',
    'radial-gradient(circle at 78% 32%, color-mix(in srgb, var(--texte) 3.5%, transparent) 0 1px, transparent 1.5px)',
  ],
  'motif-taille': 'auto, 3.2rem 3.2rem, 4.1rem 4.1rem',
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
  motif: [
    'radial-gradient(ellipse 90% 55% at 50% -15%, color-mix(in srgb, var(--lien) 22%, transparent), transparent 70%)',
    'radial-gradient(circle at 12% 18%, color-mix(in srgb, var(--texte) 14%, transparent) 0 1.15px, transparent 1.8px)',
    'radial-gradient(circle at 78% 32%, color-mix(in srgb, var(--texte) 11%, transparent) 0 1px, transparent 1.6px)',
    'radial-gradient(circle at 42% 70%, color-mix(in srgb, var(--texte) 9%, transparent) 0 1px, transparent 1.5px)',
  ],
  'motif-taille': 'auto, 2.8rem 2.8rem, 3.6rem 3.6rem, 4.4rem 4.4rem',
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
