// Les guides pratiques du hub, en deux langues : le module pur, sans réseau.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  alternatesDe,
  entreeGuide,
  guideDeCarte,
  lienGuideDeCarte,
  regrouperGuides,
} from '../scripts/guides.mjs';

const B = 'https://mister-guiiug.github.io/miss-dice/';

/** Une page telle que `pagesDe` la relève, traductions comprises. */
const page = (chemin, titre, langue, alternates = {}) => ({
  url: B + chemin,
  titre,
  langue,
  alternates: Object.fromEntries(
    Object.entries(alternates).map(([l, c]) => [l, B + c])
  ),
});

const R421 = page('regles-du-421.html', 'Règles du 421', 'fr');
const YAHTZEE_FR = page('regles-du-yahtzee.html', 'Règles du Yahtzee', 'fr', {
  fr: 'regles-du-yahtzee.html',
  en: 'en/yahtzee-rules.html',
});
const YAHTZEE_EN = page('en/yahtzee-rules.html', 'Yahtzee rules', 'en', {
  fr: 'regles-du-yahtzee.html',
  en: 'en/yahtzee-rules.html',
});

test('alternatesDe : les traductions déclarées, x-default et autres liens écartés', () => {
  const html = `<head>
    <link rel="canonical" href="${B}en/yahtzee-rules.html" />
    <link rel="alternate" hreflang="fr" href="${B}regles-du-yahtzee.html" />
    <link href="${B}en/yahtzee-rules.html" hreflang="EN" rel="alternate">
    <link rel="alternate" hreflang="x-default" href="${B}regles-du-yahtzee.html" />
    <link rel="alternate" type="application/rss+xml" href="${B}flux.xml" />
  </head>`;
  assert.deepEqual(alternatesDe(html), {
    fr: `${B}regles-du-yahtzee.html`,
    en: `${B}en/yahtzee-rules.html`,
  });
  assert.deepEqual(alternatesDe('<html lang="fr"><h1>x</h1></html>'), {});
});

test('regrouperGuides : une page et sa traduction ne font qu’un guide, dans l’ordre du plan', () => {
  const guides = regrouperGuides([R421, YAHTZEE_FR, YAHTZEE_EN]);
  assert.equal(guides.length, 2);
  assert.deepEqual(guides[0], { fr: R421 });
  assert.deepEqual(guides[1], { fr: YAHTZEE_FR, en: YAHTZEE_EN });
  // L'anglaise listée d'abord : le guide prend la place de sa première version.
  assert.deepEqual(regrouperGuides([YAHTZEE_EN, R421, YAHTZEE_FR])[0], {
    fr: YAHTZEE_FR,
    en: YAHTZEE_EN,
  });
});

test('regrouperGuides : une traduction qui ne répond pas ne s’apparie pas', () => {
  // La page anglaise désigne une autre page française : rien n'est apparié.
  const orpheline = page('en/yahtzee-rules.html', 'Yahtzee rules', 'en', {
    fr: 'autre.html',
  });
  const guides = regrouperGuides([YAHTZEE_FR, orpheline]);
  assert.deepEqual(guides, [{ fr: YAHTZEE_FR }, { en: orpheline }]);
  // Deux pages de même langue ne s'apparient jamais.
  const doublon = page('copie.html', 'Copie', 'fr', { en: 'regles-du-yahtzee.html' });
  assert.equal(regrouperGuides([YAHTZEE_FR, doublon]).length, 2);
});

test('guideDeCarte : le premier guide qui existe dans la langue, sinon le premier', () => {
  const guides = regrouperGuides([R421, YAHTZEE_FR, YAHTZEE_EN]);
  assert.equal(guideDeCarte(guides, 'fr'), R421);
  // En anglais, Miss Dice mène à ses règles du Yahtzee, pas à celles du 421.
  assert.equal(guideDeCarte(guides, 'en'), YAHTZEE_EN);
  assert.equal(guideDeCarte([{ fr: R421 }], 'en'), R421);
  assert.equal(guideDeCarte([], 'fr'), undefined);
});

test('lienGuideDeCarte : servi en français, il dit où mène l’anglais', () => {
  const html = lienGuideDeCarte(regrouperGuides([R421, YAHTZEE_FR, YAHTZEE_EN]));
  assert.match(html, new RegExp(`^<a href="${B}regles-du-421\\.html"`));
  assert.match(html, /hreflang="fr"/);
  assert.match(html, new RegExp(`data-en-href="${B}en/yahtzee-rules\\.html"`));
  assert.match(html, /data-en-hreflang="en"/);
  assert.match(html, /title="Règles du 421" data-fr-title="Règles du 421" data-en-title="Yahtzee rules"/);
  // L'étiquette ne dit « (FR) » en anglais que si le guide est en français.
  assert.match(html, /data-i18n="guide">Guide</);
  const seulementFr = lienGuideDeCarte([{ fr: R421 }]);
  assert.match(seulementFr, /data-i18n="guideFr">Guide</);
  assert.match(seulementFr, /data-en-hreflang="fr"/);
  assert.equal(lienGuideDeCarte([]), '');
});

test('entreeGuide : une traduction, le titre servi en français et l’autre langue à un geste', () => {
  const [, yahtzee] = regrouperGuides([R421, YAHTZEE_FR, YAHTZEE_EN]);
  const html = entreeGuide(yahtzee, { nom: 'Miss Dice', site: B, ordre: 1 });
  assert.match(html, /<li class="guide" data-ordre="1" data-langues="fr en">/);
  // Le titre : français au service, chaque langue en attributs, son `lang`.
  assert.match(
    html,
    new RegExp(
      `<a href="${B}regles-du-yahtzee\\.html" target="_blank" rel="noopener noreferrer" class="guide-titre" hreflang="fr" lang="fr" data-fr-href="${B}regles-du-yahtzee\\.html" data-en-href="${B}en/yahtzee-rules\\.html" data-fr-hreflang="fr" data-en-hreflang="en" data-fr-lang="fr" data-en-lang="en" data-fr="Règles du Yahtzee" data-en="Yahtzee rules">Règles du Yahtzee</a>`
    )
  );
  // L'autre langue : sous le titre, à côté de l'application, dans SA langue,
  // comme le lien que portent les pages de guide elles-mêmes.
  assert.match(
    html,
    new RegExp(
      `class="guide-app">Miss Dice</a><span aria-hidden="true"> · </span><a href="${B}en/yahtzee-rules\\.html" target="_blank" rel="noopener noreferrer" class="guide-autre" hreflang="en" lang="en" data-fr-href="${B}en/yahtzee-rules\\.html" data-en-href="${B}regles-du-yahtzee\\.html" data-fr-hreflang="en" data-en-hreflang="fr" data-fr-lang="en" data-en-lang="fr"><span data-fr="Read in English" data-en="Lire en français">Read in English</span><span class="sr-only" data-fr=": Yahtzee rules" data-en=" : Règles du Yahtzee">: Yahtzee rules</span></a>`
    )
  );
  // Aucune étiquette de langue : la traduction existe, rien à signaler.
  assert.doesNotMatch(html, /guide-seule/);
});

test('entreeGuide : une seule langue, et son étiquette quand elle diffère de celle choisie', () => {
  const html = entreeGuide({ fr: R421 }, { nom: 'Miss Dice', site: B, ordre: 0 });
  assert.match(html, /data-langues="fr"/);
  assert.match(html, /class="guide-titre" hreflang="fr" lang="fr">Règles du 421<\/a>/);
  // L'étiquette « FR » n'apparaît qu'en anglais (CSS sur `html[lang]`) : à
  // l'œil le code, à l'oreille la langue, dite dans celle de la page.
  assert.match(
    html,
    /<span class="guide-langue guide-seule" data-langue="fr" lang="en"><span aria-hidden="true">FR<\/span><span class="sr-only">\(in French\)<\/span><\/span>/
  );
  assert.doesNotMatch(html, /guide-autre/);
  // Un titre est échappé.
  const echappe = entreeGuide(
    { fr: { ...R421, titre: 'A & B <c> "d"' } },
    { nom: 'X & Y', site: B, ordre: 0 }
  );
  assert.match(echappe, />A &amp; B &lt;c&gt; &quot;d&quot;<\/a>/);
  assert.match(echappe, />X &amp; Y<\/a>/);
});
