/**
 * L'accueil et l'index des guides, en français et en anglais, rendus à la
 * construction.
 *
 * POURQUOI CES TESTS-LÀ. Jusqu'au 06/10/2026, `/en/` répondait 404 : le HTML
 * servi était français, et le script le réécrivait en anglais au clic. Un
 * robot ou un aperçu de lien ne voyait jamais l'anglais. Ce qui se vérifie
 * ici est ce qu'un robot lit : une page par langue, à son adresse, qui nomme
 * sa traduction, sans un mot de l'autre langue ni un marqueur oublié.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ADRESSES, fichierDe, rendreAccueil } from '../scripts/accueil.mjs';
import { politiqueAccueil } from '../scripts/csp.mjs';
import { manifesteHub } from '../scripts/manifeste-hub.mjs';
import { traduire } from '../scripts/traduire.mjs';
import { ORIGINE, donneesFactices } from './catalogue-factice.mjs';

const A = `${ORIGINE}/miss-alpha/`;
/** Un guide traduit, apparié par ses `hreflang`, et un guide français seul. */
const pagesTraduites = new Map([
  [
    'miss-alpha',
    [
      { url: `${A}regles.html`, titre: 'Règles du jeu', langue: 'fr', alternates: { fr: `${A}regles.html`, en: `${A}en/rules.html` } },
      { url: `${A}en/rules.html`, titre: 'Game rules', langue: 'en', alternates: { fr: `${A}regles.html`, en: `${A}en/rules.html` } },
      { url: `${A}astuces.html`, titre: 'Astuces', langue: 'fr', alternates: {} },
    ],
  ],
  ['mister-beta', []],
]);
const rendu = (surcharge = {}) => rendreAccueil(donneesFactices({ pagesParApp: pagesTraduites, ...surcharge }));
const pageDe = (pages, chemin) => pages.find(p => p.chemin === chemin);
/** Le HTML hors des blocs <script> et <style> : ce que lit un robot. */
const horsBlocs = html => html.replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/g, '');
const lien = (html, rel, hreflang) =>
  new RegExp(`<link rel="${rel}"${hreflang ? ` hreflang="${hreflang}"` : ''} href="([^"]+)"`).exec(html)?.[1];

test('quatre pages, chacune à son adresse et dans son fichier', () => {
  const { pages } = rendu();
  assert.deepEqual(
    pages.map(p => [p.page, p.langue, p.chemin, p.fichier]),
    [
      ['accueil', 'fr', '/', 'index.html'],
      ['guides', 'fr', '/guides.html', 'guides.html'],
      ['accueil', 'en', '/en/', 'en/index.html'],
      ['guides', 'en', '/en/guides.html', 'en/guides.html'],
    ]
  );
  assert.equal(fichierDe('/en/'), 'en/index.html');
  for (const p of pages) assert.match(p.texte, new RegExp(`^<!doctype html>\\n<html lang="${p.langue}"`), p.chemin);
});

test('hreflang réciproques : chaque page nomme sa traduction, qui la nomme en retour', () => {
  const { pages } = rendu();
  for (const p of pages) {
    const soi = `${ORIGINE}${p.chemin}`;
    assert.equal(lien(p.texte, 'canonical'), soi, `${p.chemin} : canonique`);
    assert.equal(lien(p.texte, 'alternate', p.langue), soi, `${p.chemin} : se nomme elle-même`);
    const autre = p.langue === 'fr' ? 'en' : 'fr';
    const traduction = pageDe(pages, ADRESSES[p.page][autre]);
    assert.equal(lien(p.texte, 'alternate', autre), `${ORIGINE}${traduction.chemin}`, `${p.chemin} → ${autre}`);
    assert.equal(lien(traduction.texte, 'alternate', p.langue), soi, `${traduction.chemin} → ${p.langue}`);
    // Le français reste la page par défaut, à l'adresse publiée depuis toujours.
    assert.equal(lien(p.texte, 'alternate', 'x-default'), `${ORIGINE}${ADRESSES[p.page].fr}`);
    assert.match(p.texte, new RegExp(`<meta property="og:url" content="${soi.replace(/[.]/g, '\\.')}" />`));
    assert.match(p.texte, new RegExp(`<meta property="og:locale" content="${p.langue === 'en' ? 'en_GB' : 'fr_FR'}" />`));
  }
});

test('aucun marqueur de traduction ne reste dans le HTML servi', () => {
  for (const p of rendu().pages) {
    assert.doesNotMatch(horsBlocs(p.texte), /\sdata-(?:i18n|fr|en|alt-fr|alt-en)[\s=-]/, p.chemin);
  }
});

test('la page anglaise est en anglais, la française en français', () => {
  const { pages } = rendu();
  const fr = horsBlocs(pageDe(pages, '/').texte);
  const en = horsBlocs(pageDe(pages, '/en/').texte);
  const paires = [
    ['Aller aux applications', 'Skip to apps'],
    ['Rechercher…', 'Search…'],
    ['Coup de projecteur', 'Spotlight'],
    ['Effacer le filtre', 'Clear filter'],
    ['Stables d’abord', 'Stable first'],
    ['Voir tous les guides', 'See all guides'],
    ['Dans les coulisses', 'Behind the scenes'],
    ['>Jeux<', '>Games<'],
  ];
  for (const [motFr, motEn] of paires) {
    assert.ok(fr.includes(motFr), `français : ${motFr}`);
    assert.ok(!fr.includes(motEn), `français sans ${motEn}`);
    assert.ok(en.includes(motEn), `anglais : ${motEn}`);
    assert.ok(!en.includes(motFr), `anglais sans ${motFr}`);
  }
  assert.match(pageDe(pages, '/en/').texte, /<title>exemple's apps - installable PWAs, no app store<\/title>/);
  assert.match(pageDe(pages, '/en/').texte, /<link rel="manifest" href="https:\/\/exemple\.github\.io\/en\/manifest\.webmanifest" \/>/);
  assert.match(pageDe(pages, '/').texte, /<link rel="manifest" href="https:\/\/exemple\.github\.io\/manifest\.webmanifest" \/>/);
});

test('l’accueil renvoie à l’index des guides de sa langue, qui les liste tous', () => {
  const { pages, nbGuides } = rendu();
  assert.equal(nbGuides, 2);
  for (const langue of ['fr', 'en']) {
    const accueil = pageDe(pages, ADRESSES.accueil[langue]).texte;
    const index = `${ORIGINE}${ADRESSES.guides[langue]}`;
    assert.match(accueil, new RegExp(`<a href="${index.replace(/[.]/g, '\\.')}" class="action action-guides">`), langue);
    // Le lien « Guide » de chaque carte reste, vers le guide de la langue.
    const guideCarte = /<a href="([^"]+)"[^>]*class="action action-guide guide-lien"/.exec(accueil)?.[1];
    assert.equal(guideCarte, langue === 'en' ? `${A}en/rules.html` : `${A}regles.html`);
  }
  // L'index : le titre et l'adresse dans la langue de la page, ses guides
  // d'abord ; le guide sans traduction le dit.
  const titres = texte => [...texte.matchAll(/class="guide-titre"[^>]*>([^<]*)<\/a>/g)].map(m => m[1]);
  assert.deepEqual(titres(pageDe(pages, '/guides.html').texte), ['Règles du jeu', 'Astuces']);
  assert.deepEqual(titres(pageDe(pages, '/en/guides.html').texte), ['Game rules', 'Astuces']);
  assert.match(pageDe(pages, '/en/guides.html').texte, /<a href="https:\/\/exemple\.github\.io\/miss-alpha\/en\/rules\.html"[^>]*class="guide-titre" hreflang="en" lang="en"/);
});

test('l’index des guides : une CollectionPage du site, dans sa langue', () => {
  const { pages } = rendu();
  for (const langue of ['fr', 'en']) {
    const texte = pageDe(pages, ADRESSES.guides[langue]).texte;
    const graphe = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(texte)[1])['@graph'];
    const collection = graphe.find(n => n['@type'] === 'CollectionPage');
    assert.equal(collection.inLanguage, langue);
    assert.equal(collection.url, `${ORIGINE}${ADRESSES.guides[langue]}`);
    assert.deepEqual(collection.isPartOf, { '@id': `${ORIGINE}/#site` });
    assert.deepEqual(
      collection.mainEntity.itemListElement.map(e => e.url),
      [langue === 'en' ? `${A}en/rules.html` : `${A}regles.html`, `${A}astuces.html`]
    );
  }
});

test('le script ne réécrit plus la page : il lit les libellés de SA langue', () => {
  const { pages } = rendu();
  for (const p of pages) {
    const client = [...p.texte.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(s => s.includes('var T = '));
    assert.ok(client, p.chemin);
    assert.doesNotMatch(client, /applyLang|data-set-lang|hub-lang|querySelectorAll\('\[data-i18n\]'\)/, p.chemin);
    const t = JSON.parse(/var T = (.*);\n/.exec(client)[1]);
    assert.equal(t.ouvrir, p.langue === 'en' ? 'Open' : 'Ouvrir', p.chemin);
    // Le titre de la fenêtre installée est celui de la page.
    assert.equal(t.title, /<title>([^<]*)<\/title>/.exec(p.texte)[1].replace(/&#39;|&apos;/g, "'"), p.chemin);
  }
});

test('le fond et le raccourci partent de l’origine : relatifs, ils visaient /en/…', () => {
  const { pages } = rendu({ raccourci: true });
  for (const p of pages) {
    assert.doesNotMatch(p.texte, /__HUB_ORIGINE__/, p.chemin);
    assert.match(p.texte, /url\("https:\/\/exemple\.github\.io\/ciel-clair\.svg"\)/, p.chemin);
  }
  assert.match(pageDe(pages, '/en/').texte, /<script type="module" src="https:\/\/exemple\.github\.io\/hub-command\.js">/);
  // L'index des guides n'a pas de recherche : pas de raccourci.
  assert.doesNotMatch(pageDe(pages, '/en/guides.html').texte, /<script type="module"/);
});

test('traduire : un élément marqué qui contient autre chose que du texte arrête la construction', () => {
  const t = { ok: 'Fine' };
  assert.equal(traduire('<p data-i18n="ok">Bien</p>', t, 'en'), '<p>Fine</p>');
  assert.throws(() => traduire('<p data-i18n="ok">Bien <b>gras</b></p>', t, 'en'), /non traduit/);
  // Les scripts ne sont jamais touchés.
  const script = '<script>var x = \'<b data-i18n="ok">Bien</b>\';</script>';
  assert.equal(traduire(script, t, 'en'), script);
});

test('le manifeste anglais : une autre application, sous /en/, qui ne couvre aucune app', () => {
  const fr = manifesteHub({ origine: ORIGINE, compte: 'exemple', description: 'd', theme: '#000' });
  const en = manifesteHub({ origine: ORIGINE, compte: 'exemple', description: 'd', theme: '#000', langue: 'en' });
  assert.equal(fr.id, `${ORIGINE}/`);
  assert.equal(fr.scope, `${ORIGINE}/index.html`);
  assert.deepEqual([en.id, en.start_url, en.scope, en.lang, en.name], [`${ORIGINE}/en/`, `${ORIGINE}/en/`, `${ORIGINE}/en/`, 'en', 'Apps by exemple']);
  // La politique de chaque page n'admet que SON manifeste.
  const politique = politiqueAccueil('', { origine: ORIGINE, manifeste: '/en/manifest.webmanifest' });
  assert.match(politique, /manifest-src https:\/\/exemple\.github\.io\/en\/manifest\.webmanifest;/);
});
