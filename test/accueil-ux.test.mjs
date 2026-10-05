/**
 * L'accueil, côté usage : liens qui ne s'ouvrent ailleurs qu'une fois le hub
 * installé, descriptions anglaises, contrastes des jetons de couleur, cibles
 * des guides. Sans réseau, sur le catalogue factice.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { rendreAccueil } from '../scripts/accueil.mjs';
import { DESCRIPTIONS_EN, appsSansDescriptionEn } from '../scripts/descriptions-en.mjs';
import { donneesFactices } from './catalogue-factice.mjs';

const CSS = readFileSync(new URL('../scripts/accueil/hub.css', import.meta.url), 'utf8');
const STATIQUES = readFileSync(new URL('../scripts/pages-hub.mjs', import.meta.url), 'utf8');

test('liens : aucun target=_blank servi ; ceux de la famille sont marqués pour le hub installé', () => {
  const { html } = rendreAccueil(
    donneesFactices({
      pagesParSite: new Map([
        ['le-socle', [{ url: 'https://exemple.github.io/le-socle/guide.html', titre: 'Guide', langue: 'fr', alternates: {} }]],
      ]),
    })
  );
  assert.doesNotMatch(html, /target="_blank"/);
  const liens = [...html.matchAll(/<a\s[^>]*>/g)].map(m => m[0]);
  const famille = liens.filter(l => /data-hors-shell/.test(l));
  // Ouvrir et la carte de chaque app web, le guide et son app, la carte des coulisses.
  assert.ok(famille.length >= 6, `${famille.length} liens de la famille marqués`);
  for (const l of famille) assert.match(l, /rel="noreferrer"/, l);
  // Les liens externes (GitHub, Buy Me a Coffee) ne sont pas marqués.
  for (const l of liens.filter(l => /github\.com|buymeacoffee/.test(l))) {
    assert.doesNotMatch(l, /data-hors-shell/, l);
  }
});

test('descriptions anglaises : miss-devises en a une, et les manquantes sont nommées', () => {
  assert.match(DESCRIPTIONS_EN['miss-devises'], /^Visual currency converter/);
  assert.deepEqual(
    appsSansDescriptionEn([{ id: 'miss-dice' }, { id: 'miss-nouvelle' }, { id: 'mister-vide' }], {
      'miss-dice': 'Dice.',
      'mister-vide': '  ',
    }),
    ['miss-nouvelle', 'mister-vide']
  );
  // Toutes les apps que le hub connaît par leur nom ont une description.
  assert.deepEqual(appsSansDescriptionEn(Object.keys(DESCRIPTIONS_EN).map(id => ({ id }))), []);
});

test('descriptions anglaises : une carte sans traduction garde le français, marqué lang="fr"', () => {
  const { html } = rendreAccueil(donneesFactices());
  // Miss Alpha a sa description anglaise ; Mister Beta non.
  assert.match(html, /<p data-fr="D[^"]*" data-en="Described &lt;b&gt;in English&lt;\/b&gt;\.">/);
  assert.match(html, /<p lang="fr" data-fr="Une application en bêta\." data-en="Une application en bêta\.">/);
});

/** Les jetons d'un bloc de la feuille de style, par sélecteur exact. */
const jetons = selecteur => {
  const debut = CSS.indexOf(`${selecteur} {`);
  assert.ok(debut >= 0, `bloc ${selecteur} absent`);
  const bloc = CSS.slice(debut, CSS.indexOf('}', debut));
  return Object.fromEntries([...bloc.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})/gi)].map(m => [m[1], m[2]]));
};

const rvb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const lineaire = c => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, v, b]) => 0.2126 * lineaire(r) + 0.7152 * lineaire(v) + 0.0722 * lineaire(b);
const contraste = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};
/** color-mix(in srgb, a p%, b), comme le navigateur le compose. */
const melange = (a, p, b) => a.map((c, i) => Math.round(c * p + b[i] * (1 - p)));

test('contraste : lien d’évitement et badge « Non vérifiée » au-dessus de 4,5:1, dans chaque palette', () => {
  const clair = jetons(":root, html[data-theme='light']");
  const sombre = jetons("html[data-theme='dark']");
  const systemeSombre = jetons("  html[data-theme='system']");
  assert.deepEqual(systemeSombre, sombre, 'le thème système sombre doit reprendre la palette sombre');
  for (const [nom, p] of [
    ['clair', clair],
    ['sombre', { ...clair, ...sombre }],
  ]) {
    const evitement = contraste(rvb(p.fond), rvb(p.lien));
    assert.ok(evitement >= 4.5, `évitement ${nom} : ${evitement.toFixed(2)}`);
    const fondBadge = melange(rvb(p.panne), 0.14, rvb(p['fond-carte']));
    const badge = contraste(rvb(p['panne-fg']), fondBadge);
    assert.ok(badge >= 4.5, `badge ${nom} : ${badge.toFixed(2)}`);
  }
  // Les règles lisent ces jetons, plus de couleur en dur.
  assert.match(CSS, /\.skip \{[^}]*color: var\(--fond\);/);
  assert.match(CSS, /\.badge-panne \{[^}]*color: var\(--panne-fg\);/);
  assert.doesNotMatch(CSS, /html\[data-theme='dark'\] \.badge-panne/);
  assert.match(STATIQUES, /\.evitement \{[^}]*color: var\(--fond\);/);
});

test('guides : le nom de l’app et « Read in English » font 24 px de haut au moins', () => {
  assert.match(CSS, /\.guide-meta a \{\s*display: inline-block;\s*min-height: 1\.5rem;\s*line-height: 1\.5rem;/);
  assert.match(CSS, /\.guide-titre \{[^}]*line-height: 1\.5rem;/);
});
