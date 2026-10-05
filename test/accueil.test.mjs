/**
 * L'accueil rendu sur un catalogue factice, sans réseau.
 *
 * `index.html` est l'artefact principal du dépôt, et jusqu'au découpage de
 * build-site.mjs aucun test ne le lisait : le module ne s'importait pas sans
 * lancer la collecte. Ces tests appellent `rendreAccueil` sur les données de
 * test/catalogue-factice.mjs, dont des noms, descriptions, titres et URL piégés.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rendreAccueil } from '../scripts/accueil.mjs';
import { JETONS } from '../scripts/pages-hub.mjs';
import { ORIGINE, donneesFactices } from './catalogue-factice.mjs';

const donnees = donneesFactices;

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

test('accueil : un h1 qui dit ce qu’est la page, la marque restant visible', () => {
  const { html } = rendreAccueil(donnees());
  const h1 = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map(m => m[1]);
  assert.deepEqual(h1, ['Les applications de exemple']);
  assert.match(html, /<p class="marque" data-i18n="marque">GuiiuG<\/p>/);
  const libelles = JSON.parse(/var I18N = (.*);\n/.exec(html)[1]);
  assert.equal(libelles.fr.titre, 'Les applications de exemple');
  assert.equal(libelles.en.titre, 'Apps by exemple');
});

test('accueil : deux groupes de préférences, deux légendes distinctes', () => {
  const { html } = rendreAccueil(donnees());
  const legendes = [...html.matchAll(/<legend data-i18n="([^"]+)">([^<]*)<\/legend>/g)].map(m => [m[1], m[2]]);
  assert.deepEqual(legendes, [
    ['langue', 'Langue'],
    ['themeLegende', 'Thème'],
  ]);
  const libelles = JSON.parse(/var I18N = (.*);\n/.exec(html)[1]);
  assert.equal(libelles.en.langue, 'Language');
  assert.equal(libelles.en.themeLegende, 'Theme');
});

test('accueil : recherche et filtres dans un repère, barre collante enfant de body', () => {
  const { html } = rendreAccueil(donnees());
  assert.ok(!html.includes('chrome-slot'), 'l’enveloppe qui empêchait la barre de coller est revenue');
  // Le repère <search> suit l'en-tête, au niveau de <body>, et contient la
  // recherche, les catégories et les filtres.
  const recherche = /\n    <\/header>\n\n    <search class="collant" id="collant"[^>]*>([\s\S]*?)\n    <\/search>\n/.exec(html)?.[1];
  assert.ok(recherche, 'la barre n’est pas enfant direct de <body>, juste après l’en-tête');
  for (const motif of [/id="filtre"/, /id="filtres-toggle"/, /class="sommaire"/, /id="filtres-panel"/]) {
    assert.match(recherche, motif);
  }
  assert.match(recherche, /aria-controls="sommaire-wrap filtres-panel"/);
  // Le décompte et l'état vide sont dans <main>, plus entre deux repères.
  const main = /<main id="catalogue">([\s\S]*?)<\/main>/.exec(html)[1];
  assert.match(main, /<p class="compte" id="compte"[^>]*aria-live="polite"/);
  assert.match(main, /<div class="vide" id="filtre-vide"/);
  assert.ok(!html.includes('class="parcours"'));
});

test('accueil : le bandeau de publication partielle porte son texte dans le HTML servi', () => {
  const sans = rendreAccueil(donnees()).html;
  assert.ok(!sans.includes('bandeau-panne"'), 'pas de bandeau sans panne');
  const { html } = rendreAccueil(donnees({ enPanne: ['mister-beta (503)'] }));
  const bandeau = /<p class="bandeau-panne" role="status" data-i18n="bandeauPanne">([^<]*)<\/p>/.exec(html)?.[1];
  assert.ok(bandeau && bandeau.length > 20, `bandeau vide : ${JSON.stringify(bandeau)}`);
  assert.match(bandeau, /^Certaines applications du catalogue ne répondent pas/);
  assert.match(html, /<span class="badge badge-panne" data-i18n="badgePanne">Non vérifiée<\/span>/);
});

/** Le <picture> d'une carte, repéré par l'identifiant de son app. */
const visuelDe = (html, id) =>
  new RegExp(String.raw`<picture>((?:(?!</picture>)[\s\S])*?previews/${id}\.jpg[\s\S]*?)</picture>`).exec(html)?.[1];

test('accueil : une miniature n’est proposée que si elle a été écrite', () => {
  // WebP écrit : sa source est proposée.
  const avec = rendreAccueil(donnees()).html;
  assert.match(visuelDe(avec, 'miss-alpha'), /<source type="image\/webp" srcset="https:\/\/exemple\.github\.io\/previews\/miss-alpha\.webp" \/>/);
  // Sans WebP (sharp absent ou en échec) : aucune source WebP, l'<img> JPEG seul.
  const sansWebp = rendreAccueil(donnees({ apercus: new Map([['miss-alpha', { webp: false }]]) })).html;
  assert.ok(!sansWebp.includes('image/webp'), 'une source WebP vers un fichier absent casse l’image');
  assert.ok(visuelDe(sansWebp, 'miss-alpha'));
  // Miniature non écrite : l'icône si elle existe, sinon l'initiale.
  const sans = rendreAccueil(
    donnees({
      apercus: new Map(),
      iconeParApp: new Map([['miss-alpha', 'https://exemple.github.io/miss-alpha/icon-192.png']]),
    })
  ).html;
  assert.ok(!sans.includes('/previews/'), 'aucune miniature proposée');
  assert.match(sans, /class="visuel-icone-img"\s+src="https:\/\/exemple\.github\.io\/miss-alpha\/icon-192\.png"/);
  // Plus aucun attribut sizes sans srcset de largeurs.
  assert.doesNotMatch(avec, /<img[^>]*\ssizes=/);
});

test('accueil : sur mobile l’icône, choisie par une source media, et le projecteur en priorité', () => {
  const html = rendreAccueil(
    donnees({ iconeParApp: new Map([['miss-alpha', 'https://exemple.github.io/miss-alpha/icon-192.png']]) })
  ).html;
  // Le projecteur (miss-alpha, première stable avec miniature) et sa carte.
  const visuels = [...html.matchAll(/<picture>([\s\S]*?)<\/picture>/g)].map(m => m[1]);
  assert.equal(visuels.length, 2);
  for (const v of visuels) {
    assert.match(
      v,
      /<source media="\(max-width: 40rem\)" srcset="https:\/\/exemple\.github\.io\/miss-alpha\/icon-192\.png" width="192" height="192" \/>/
    );
    // La source media précède la source WebP : elle l'emporte sur mobile.
    assert.ok(v.indexOf('media=') < v.indexOf('image/webp'));
  }
  const [projecteur, carte] = visuels;
  assert.match(projecteur, /fetchpriority="high"/);
  assert.doesNotMatch(projecteur, /loading="lazy"/);
  assert.match(carte, /loading="lazy"/);
  assert.doesNotMatch(carte, /fetchpriority/);
});

test('accueil : sans script, les miniatures restent visibles', () => {
  const { html } = rendreAccueil(donnees());
  const theme = /<script>\s*\(function \(\) \{([\s\S]*?)\}\)\(\);\s*<\/script>/.exec(html)?.[1] ?? '';
  assert.match(theme, /document\.documentElement\.classList\.add\('js'\)/);
  const style = /<style>([\s\S]*?)<\/style>/.exec(html)[1];
  assert.match(style, /html\.js \.visuel-img:not\(\.is-loaded\) \{\s*opacity: 0;/);
  // Aucune règle ne cache une miniature hors de html.js.
  for (const [, selecteurs, corps] of style.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (/opacity:\s*0;/.test(corps) && /\.visuel-img/.test(selecteurs)) {
      assert.match(selecteurs, /html\.js/, `règle sans html.js : ${selecteurs.trim()}`);
    }
  }
});
