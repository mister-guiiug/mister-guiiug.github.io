/**
 * L'accueil rendu sur un catalogue factice, sans réseau.
 *
 * `index.html` est l'artefact principal du dépôt, et jusqu'au découpage de
 * build-site.mjs aucun test ne le lisait : le module ne s'importait pas sans
 * lancer la collecte. Ces tests appellent `rendreAccueil` sur des données
 * écrites ici, dont des noms, descriptions, titres et URL piégés.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rendreAccueil } from '../scripts/accueil.mjs';
import { JETONS } from '../scripts/pages-hub.mjs';

const ORIGINE = 'https://exemple.github.io';

const PIEGE = '</script><script>alert(1)</script>';

const APPS = [
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

const LIBELLES_FR = {
  categories: { jeux: 'Jeux', outils: 'Outils', sante: 'Santé' },
  maturity: { stable: 'Stable', beta: 'Bêta', alpha: 'Alpha' },
};
const LIBELLES_EN = {
  categories: { jeux: 'Games', outils: 'Tools', sante: 'Health' },
  maturity: { stable: 'Stable', beta: 'Beta', alpha: 'Alpha' },
};

const donnees = (surcharge = {}) => ({
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
  imageParApp: new Map([['miss-alpha', `${ORIGINE}/miss-alpha/og-image.jpg`]]),
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
  ...surcharge,
});

/** Le texte des éléments `<script>` exécutables (ni JSON-LD, ni module externe). */
const scriptsEnLigne = html =>
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);

test('accueil : les noms, descriptions et titres du catalogue sont échappés', () => {
  const { html } = rendreAccueil(donnees());
  assert.ok(!html.includes('<Alpha>'), 'un nom d’app ouvre une balise');
  assert.ok(!html.includes('<du>'), 'un titre de guide ouvre une balise');
  assert.ok(!html.includes('<socle>'), 'un titre de site ouvre une balise');
  assert.ok(!html.includes('<b>in English</b>'), 'une description anglaise ouvre une balise');
  assert.ok(!html.includes('<script>alert(1)'), 'une description injecte un script');
  assert.match(html, /<span class="nom">Miss &lt;Alpha&gt; &amp; &quot;Co&quot;<\/span>/);
  assert.match(html, /data-en="Described &lt;b&gt;in English&lt;\/b&gt;\."/);
  // Toute balise <script> ouverte est refermée par la sienne, et par elle seule.
  assert.equal(
    (html.match(/<script[\s>]/g) ?? []).length,
    (html.match(/<\/script>/g) ?? []).length
  );
});

test('accueil : les URL du catalogue restent dans leur attribut', () => {
  const { html } = rendreAccueil(donnees());
  assert.ok(!html.includes('?x="y"'), 'un guillemet de l’URL ferme l’attribut href');
  assert.ok(!html.includes('z=<w>'), 'un chevron de l’URL ouvre une balise');
  assert.match(html, /href="https:\/\/exemple\.github\.io\/mister-beta\/\?x=&quot;y&quot;&amp;z=&lt;w&gt;"/);
});

test('accueil : les données en ligne sont du JSON valide, sans « < » brut', () => {
  const { html } = rendreAccueil(donnees());
  const ld = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1];
  assert.ok(ld, 'JSON-LD absent');
  assert.ok(!ld.includes('<'));
  const graphe = JSON.parse(ld)['@graph'];
  const liste = graphe.find(n => n['@type'] === 'ItemList');
  // Les deux apps de l'origine, et l'app de bureau par sa page du hub.
  assert.deepEqual(
    liste.itemListElement.map(e => e.url),
    [`${ORIGINE}/miss-alpha/`, `${ORIGINE}/mister-beta/?x="y"&z=<w>`, `${ORIGINE}/mister-bureau.html`]
  );

  const client = scriptsEnLigne(html).find(s => s.includes('var I18N = '));
  assert.ok(client, 'script client absent');
  const i18n = /var I18N = (.*);\n/.exec(client)?.[1];
  assert.ok(i18n && !i18n.includes('<'));
  const libelles = JSON.parse(i18n);
  assert.deepEqual(Object.keys(libelles.fr).sort(), Object.keys(libelles.en).sort());
  const hasard = JSON.parse(/var HASARD = (.*);\n/.exec(client)?.[1]);
  assert.deepEqual(hasard, [`${ORIGINE}/miss-alpha/`]);
});

test('accueil : structure, une section par catégorie peuplée, une carte par app', () => {
  const { html, nbSections, nbGuides, featuredId, description } = rendreAccueil(donnees());
  assert.match(html, /^<!doctype html>\n<html lang="fr"/);
  assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1);
  assert.equal(nbSections, 2);
  assert.deepEqual(
    [...html.matchAll(/data-cat-section="([^"]+)"/g)].map(m => m[1]),
    ['jeux', 'outils']
  );
  // Trois apps au catalogue, plus le site des coulisses.
  assert.equal((html.match(/<li class="carte[ "]/g) ?? []).length, 4);
  assert.equal((html.match(/data-search="/g) ?? []).length, 3);
  // Une app de bureau mène à sa page du hub, pas à son dépôt.
  assert.match(html, /<a href="https:\/\/exemple\.github\.io\/mister-bureau\.html" class="action action-ouvrir">/);
  // Le guide de Miss Alpha est listé, avec son titre pour ancre.
  assert.equal(nbGuides, 1);
  assert.match(html, /<section class="guides" aria-labelledby="guides">/);
  // Aucune app au catalogue sous l'identifiant du projecteur : la première stable avec image.
  assert.equal(featuredId, 'miss-alpha');
  assert.match(description, /^Les applications web installables de exemple : /);
  // Les dates restent des jetons : `dater` les pose après le calcul de l'empreinte.
  assert.ok(html.includes(JETONS.majFr));
});
