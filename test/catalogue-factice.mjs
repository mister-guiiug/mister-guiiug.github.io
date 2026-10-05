/**
 * Un catalogue factice pour rendre l'accueil sans réseau : trois apps (une
 * stable avec image et guide, une bêta avec icône seulement, une de bureau) et
 * un site de coulisses, dont des noms, descriptions, titres et URL piégés.
 * Ce module n'est pas un test : `node --test test/*.test.mjs` ne le lance pas.
 */
export const ORIGINE = 'https://exemple.github.io';

export const PIEGE = '</script><script>alert(1)</script>';

export const APPS = [
  {
    id: 'miss-alpha',
    name: 'Miss <Alpha> & "Co"',
    description: `Décrit ${PIEGE} & "entre guillemets"`,
    category: 'jeux',
    maturity: 'stable',
    platform: 'web',
    appUrl: `${ORIGINE}/miss-alpha/`,
    repoUrl: 'https://github.com/exemple/miss-alpha',
  },
  {
    id: 'mister-beta',
    name: 'Mister Beta',
    description: 'Une application en bêta.',
    category: 'outils',
    maturity: 'beta',
    platform: 'web',
    appUrl: `${ORIGINE}/mister-beta/?x="y"&z=<w>`,
    repoUrl: 'https://github.com/exemple/mister-beta',
  },
  {
    id: 'mister-bureau',
    name: 'Mister Bureau',
    description: 'Une application de bureau.',
    category: 'outils',
    maturity: 'alpha',
    platform: 'desktop',
    appUrl: 'https://github.com/exemple/mister-bureau',
    repoUrl: 'https://github.com/exemple/mister-bureau',
  },
];

export const LIBELLES_FR = {
  categories: { jeux: 'Jeux', outils: 'Outils', sante: 'Santé' },
  maturity: { stable: 'Stable', beta: 'Bêta', alpha: 'Alpha' },
};
export const LIBELLES_EN = {
  categories: { jeux: 'Games', outils: 'Tools', sante: 'Health' },
  maturity: { stable: 'Stable', beta: 'Beta', alpha: 'Alpha' },
};

/** Les données de `rendreAccueil`, surchargeables clé par clé. */
export const donneesFactices = (surcharge = {}) => ({
  origine: ORIGINE,
  compte: 'exemple',
  soi: 'exemple.github.io',
  theme: '#2f4bd1',
  sponsorUrl: 'https://buymeacoffee.com/exemple',
  imageEmpreinte: '0a1b2c3d',
  apps: APPS,
  categories: ['jeux', 'outils', 'sante'],
  libellesFr: LIBELLES_FR,
  libellesEn: LIBELLES_EN,
  descriptionsEn: { 'miss-alpha': 'Described <b>in English</b>.' },
  pagesParApp: new Map([
    [
      'miss-alpha',
      [
        {
          url: `${ORIGINE}/miss-alpha/regles.html`,
          titre: `Règles <du> jeu ${PIEGE}`,
          langue: 'fr',
          alternates: {},
        },
      ],
    ],
    ['mister-beta', []],
  ]),
  apercus: new Map([['miss-alpha', { webp: true }]]),
  iconeParApp: new Map([['mister-beta', `${ORIGINE}/mister-beta/icon-192.png`]]),
  enPanne: [],
  pageDeBureau: new Map([
    ['mister-bureau', { app: APPS[2], chemin: '/mister-bureau.html', version: null }],
  ]),
  coulisses: [
    {
      nom: 'le-socle',
      base: `${ORIGINE}/le-socle/`,
      plan: true,
      estApp: false,
      titre: 'Le <socle> "commun"',
      desc: `Infrastructure ${PIEGE}`,
    },
  ],
  pagesParSite: new Map(),
  raccourci: false,
  ...surcharge,
});
