/**
 * Le ciel du fond de l'accueil : nuages de la palette, constellations et
 * étoiles de scripts/ciel.mjs.
 *
 * POURQUOI CES TESTS-LÀ. Un fond se règle à l'œil, et l'œil ne voit pas deux
 * choses : un nuage trop opaque fait passer le texte gris posé dessus sous
 * 4,5:1, et une image `data:` est refusée par la politique de la page — les
 * maquettes, faites sans elle, ne l'auraient pas montré.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { rendreAccueil } from '../scripts/accueil.mjs';
import { FICHIERS_DU_CIEL, FIGURES, TUILE, cielSvg } from '../scripts/ciel.mjs';
import { politiqueAccueil } from '../scripts/csp.mjs';
import { CLAIR, SOMBRE } from '../scripts/palette.mjs';
import { donneesFactices } from './catalogue-factice.mjs';

const rvb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const luminance = c => {
  const [r, g, b] = c.map(v => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contraste = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
/** Les teintes `rgb(r g b / a)` des nuages d'une palette. */
const nuages = palette => [...palette.motif.join(' ').matchAll(/rgb\((\d+) (\d+) (\d+) \/ ([\d.]+)\)/g)].map(m => m.slice(1).map(Number));

test('le texte gris garde 4,5:1 là où les trois nuages se superposeraient', () => {
  for (const [nom, p] of [
    ['clair', CLAIR],
    ['sombre', { ...CLAIR, ...SOMBRE }],
  ]) {
    const teintes = nuages(p);
    assert.equal(teintes.length, 3, `${nom} : trois nuages`);
    // Le pire cas : tous empilés au même point — plus sévère que la page.
    let fond = rvb(p.fond);
    for (const [r, g, b, a] of teintes) fond = fond.map((c, i) => c + ([r, g, b][i] - c) * a);
    const rapport = contraste(fond, rvb(p.doux));
    assert.ok(rapport >= 4.5, `${nom} : ${rapport.toFixed(2)}:1`);
  }
});

test('chaque thème a son fichier de ciel, relatif, et autant de couches que de tailles et de répétitions', () => {
  const couches = v => v.split(/,(?![^(]*\))/).length;
  for (const [theme, p] of [
    ['clair', CLAIR],
    ['sombre', { ...CLAIR, ...SOMBRE }],
  ]) {
    assert.equal(p.motif.at(-1), `url("${FICHIERS_DU_CIEL[theme]}")`, theme);
    // Relatif : l'aperçu local, servi sous un chemin, trouve son fichier.
    assert.doesNotMatch(p.motif.at(-1), /url\("\//);
    assert.equal(couches(p['motif-taille']), p.motif.length, `${theme} : tailles`);
    assert.equal(couches(p['motif-repete']), p.motif.length, `${theme} : répétitions`);
  }
  // Le sombre reprend la taille et la répétition du clair : mêmes couches.
  assert.equal(SOMBRE['motif-taille'], undefined);
  assert.equal(SOMBRE['motif-repete'], undefined);
});

test('aucune image data: dans la page : la politique ne les admet pas', () => {
  const { html } = rendreAccueil(donneesFactices());
  assert.doesNotMatch(html, /url\(["']?data:/);
  const politique = politiqueAccueil(html, { origine: 'https://exemple.github.io' });
  const imgSrc = /img-src ([^;]+)/.exec(politique)[1];
  assert.doesNotMatch(imgSrc, /data:/);
  // La règle du fond lit la répétition de la palette.
  const css = /<style>([\s\S]*?)<\/style>/.exec(html)[1];
  assert.match(css, /background-repeat: var\(--motif-repete\), repeat;/);
  assert.match(css, /--motif-repete: no-repeat, no-repeat, no-repeat, repeat;/);
});

test('le ciel : le même fichier à chaque construction, ses quatre figures, un poids borné', () => {
  for (const theme of ['clair', 'sombre']) {
    const svg = cielSvg(theme);
    assert.equal(svg, cielSvg(theme), `${theme} : reproductible`);
    assert.match(svg, new RegExp(`^<svg xmlns="http://www.w3.org/2000/svg" width="${TUILE.largeur}" height="${TUILE.hauteur}"`));
    assert.equal(svg.match(/<polyline /g).length, FIGURES.length);
    assert.ok(svg.length < 14_000, `${theme} : ${svg.length} octets`);
  }
  assert.notEqual(cielSvg('clair'), cielSvg('sombre'));
  assert.throws(() => cielSvg('crepuscule'), /thème inconnu/);
});

test('le ciel est écrit à la construction et servi par le worker, même hors ligne', () => {
  const build = readFileSync(new URL('../scripts/build-site.mjs', import.meta.url), 'utf8');
  assert.match(build, /writeFileSync\(join\(SORTIE, fichier\), cielSvg\(theme\), 'utf8'\)/);
  // Dans la liste fermée des fichiers du hub, et précaché si possible.
  const ciel = /\.\.\.Object\.values\(FICHIERS_DU_CIEL\)\.map\(f => `\/\$\{f\}`\)/g;
  assert.equal(build.match(ciel)?.length, 2, 'CHEMINS_DU_HUB et extras');
});
