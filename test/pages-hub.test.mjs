/**
 * Les pages statiques du hub : sans script, avec leur canonique, leur JSON-LD
 * valide et une seule entité éditrice ; la 404 hors des moteurs ; et aucune des
 * deux affirmations retirées le 29/09/2026.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RELEVE, appsNonRelevees, pageAPropos } from '../scripts/page-a-propos.mjs';
import {
  JETONS,
  dater,
  entiteEditeur,
  page404,
  pageMisterQuota,
} from '../scripts/pages-hub.mjs';

const ORIGINE = 'https://mister-guiiug.github.io';
const COMPTE = 'mister-guiiug';
const IMAGE = { url: `${ORIGINE}/og-image.jpg?v=0a1b2c3d`, alt: 'mosaïque' };

/** Une app du catalogue, réduite à ce que les pages lisent. */
const app = (id, name, extra = {}) => ({
  id,
  name,
  platform: 'web',
  category: 'outils',
  description: `Description de ${name}.`,
  adresse: `${ORIGINE}/${id}/`,
  repoUrl: `https://github.com/${COMPTE}/${id}`,
  ...extra,
});

const APPS = Object.values(RELEVE.stockage)
  .flat()
  .map(id =>
    id === 'mister-quota'
      ? app(id, 'Mister Quota', { platform: 'desktop', category: 'dev', adresse: `${ORIGINE}/mister-quota.html` })
      : app(id, id.replace(/(^|-)(\w)/g, (_, s, c) => `${s ? ' ' : ''}${c.toUpperCase()}`))
  );

/** Les blocs JSON-LD d'une page, parsés : un bloc invalide fait échouer le test. */
const jsonLds = html =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m =>
    JSON.parse(m[1])
  );

/** Un `<script>` qui s'exécuterait : tout sauf le JSON-LD. */
const scriptsExecutables = html =>
  [...html.matchAll(/<script\b([^>]*)>/g)].filter(m => !/type="application\/ld\+json"/.test(m[1]));

const titre = html => /<title>([^<]*)<\/title>/.exec(html)?.[1];
const description = html => /<meta name="description" content="([^"]*)"/.exec(html)?.[1];
const decode = t => t.replace(/&amp;/g, '&').replace(/&quot;/g, '"');

test('entiteEditeur : #org, GuiiuG, le logo et GitHub', () => {
  assert.deepEqual(entiteEditeur({ origine: ORIGINE, compte: COMPTE }), {
    '@type': 'Organization',
    '@id': `${ORIGINE}/#org`,
    name: COMPTE,
    alternateName: 'GuiiuG',
    url: `${ORIGINE}/`,
    logo: `${ORIGINE}/icon-512.png`,
    sameAs: [`https://github.com/${COMPTE}`],
  });
});

test('dater remplace chaque jeton par la date du dernier changement', () => {
  const texte = `${JETONS.majFr} | ${JETONS.majEn} | ${JETONS.majIso} | ${JETONS.majFr}`;
  assert.equal(dater(texte, '2026-09-29'), '29 septembre 2026 | 29 September 2026 | 2026-09-29 | 29 septembre 2026');
});

test('À propos : page statique, indexable, JSON-LD AboutPage relié à #org et #site', () => {
  const html = pageAPropos({
    origine: ORIGINE,
    compte: COMPTE,
    imagePartage: IMAGE,
    apps: APPS,
    avecIssues: new Set(APPS.map(a => a.id)),
    sponsorUrl: 'https://buymeacoffee.com/mister.guiiug',
  });
  assert.deepEqual(scriptsExecutables(html), []);
  assert.match(html, new RegExp(`<link rel="canonical" href="${ORIGINE}/a-propos\\.html" />`));
  assert.match(html, /<meta name="robots" content="index, follow" \/>/);
  assert.match(html, /<meta property="og:locale" content="fr_FR" \/>/);
  const t = decode(titre(html));
  const d = decode(description(html));
  assert.ok(t.length >= 50 && t.length <= 70, `titre de ${t.length} caractères : ${t}`);
  assert.ok(d.length >= 70 && d.length <= 160, `description de ${d.length} caractères : ${d}`);

  const [bloc] = jsonLds(html);
  const types = bloc['@graph'].map(n => n['@type']);
  assert.deepEqual(types, ['AboutPage', 'Organization', 'WebSite', 'BreadcrumbList']);
  const [page, org, site] = bloc['@graph'];
  assert.equal(page.about['@id'], `${ORIGINE}/#org`);
  assert.equal(page.isPartOf['@id'], `${ORIGINE}/#site`);
  assert.equal(page.dateModified, JETONS.majIso, 'la date reste un jeton jusqu’à `dater`');
  assert.equal(org.alternateName, 'GuiiuG');
  assert.equal(site.publisher['@id'], `${ORIGINE}/#org`);

  // Chaque app relevée est nommée, et le contact passe par les issues.
  for (const a of APPS) assert.ok(html.includes(`${a.repoUrl}/issues`), `${a.id} sans lien d’issues`);
  assert.match(html, /seulement après votre accord/);
  assert.match(html, /Toutes les applications web sauf Mister Doc affichent un bandeau/);
});

test('les affirmations retirées ne reviennent pas', () => {
  const pages = [
    pageAPropos({
      origine: ORIGINE,
      compte: COMPTE,
      imagePartage: IMAGE,
      apps: APPS,
      avecIssues: new Set(),
      sponsorUrl: 'https://buymeacoffee.com/mister.guiiug',
    }),
    pageMisterQuota({
      origine: ORIGINE,
      compte: COMPTE,
      app: APPS.find(a => a.id === 'mister-quota'),
      version: null,
      avecIssues: new Set(),
      imagePartage: IMAGE,
    }),
  ];
  for (const html of pages) {
    assert.doesNotMatch(html, /h[ée]berg[ée]es? en Europe|hosted in Europe/i);
    assert.doesNotMatch(html, /aucun compte n.est n[ée]cessaire|no account needed/i);
  }
});

test('À propos : une app hors du relevé n’est jamais classée par défaut', () => {
  const nouvelle = app('miss-nouvelle', 'Miss Nouvelle');
  assert.deepEqual(appsNonRelevees([...APPS, nouvelle]), [nouvelle]);
  const html = pageAPropos({
    origine: ORIGINE,
    compte: COMPTE,
    imagePartage: IMAGE,
    apps: [...APPS, nouvelle],
    avecIssues: new Set(),
    sponsorUrl: 'https://buymeacoffee.com/mister.guiiug',
  });
  assert.match(html, /Pas encore relevées : <a href="[^"]+">Miss Nouvelle<\/a>/);
});

test('Mister Quota : SoftwareApplication, et aucun téléchargement tant qu’aucune version n’existe', () => {
  const quota = APPS.find(a => a.id === 'mister-quota');
  const sans = pageMisterQuota({
    origine: ORIGINE,
    compte: COMPTE,
    app: quota,
    version: null,
    avecIssues: new Set(['mister-quota']),
    imagePartage: IMAGE,
  });
  assert.deepEqual(scriptsExecutables(sans), []);
  assert.match(sans, /<link rel="canonical" href="https:\/\/mister-guiiug\.github\.io\/mister-quota\.html" \/>/);
  assert.match(sans, /Aucun installateur n’est publié à ce jour/);
  assert.match(sans, /href="https:\/\/github\.com\/mister-guiiug\/mister-quota\/releases"/);
  const t = decode(titre(sans));
  const d = decode(description(sans));
  assert.ok(t.length >= 50 && t.length <= 70, `titre de ${t.length} caractères : ${t}`);
  assert.ok(d.length >= 70 && d.length <= 160, `description de ${d.length} caractères : ${d}`);
  const logiciel = jsonLds(sans)[0]['@graph'].find(n => n['@type'] === 'SoftwareApplication');
  assert.equal(logiciel.operatingSystem, 'Windows, macOS, Linux');
  assert.equal(logiciel.applicationCategory, 'DeveloperApplication');
  assert.equal(logiciel.publisher['@id'], `${ORIGINE}/#org`);
  assert.equal(logiciel.downloadUrl, undefined);
  assert.equal(logiciel.offers, undefined);

  const avec = pageMisterQuota({
    origine: ORIGINE,
    compte: COMPTE,
    app: quota,
    version: { tag: 'v0.2.0', url: 'https://github.com/mister-guiiug/mister-quota/releases/tag/v0.2.0', date: '2026-10-01' },
    avecIssues: new Set(),
    imagePartage: IMAGE,
  });
  const publie = jsonLds(avec)[0]['@graph'].find(n => n['@type'] === 'SoftwareApplication');
  assert.equal(publie.softwareVersion, '0.2.0');
  assert.equal(publie.downloadUrl, 'https://github.com/mister-guiiug/mister-quota/releases/tag/v0.2.0');
  assert.doesNotMatch(avec, /Aucun installateur/);
});

test('404 : noindex, sans canonique ni Open Graph ni script, liens absolus vers le catalogue', () => {
  const html = page404({
    origine: ORIGINE,
    compte: COMPTE,
    apps: APPS.map(a => ({ nom: a.name, url: a.adresse })),
  });
  assert.match(html, /<meta name="robots" content="noindex" \/>/);
  assert.doesNotMatch(html, /rel="canonical"|property="og:|application\/ld\+json/);
  assert.deepEqual(scriptsExecutables(html), []);
  assert.ok(!Object.values(JETONS).some(j => html.includes(j)), 'la 404 n’a pas de date à poser');
  // Servie à n'importe quelle profondeur : aucun lien relatif.
  for (const [, href] of html.matchAll(/href="([^"]+)"/g)) {
    assert.ok(/^(https:\/\/|#)/.test(href), `lien non absolu : ${href}`);
  }
  assert.match(html, new RegExp(`href="${ORIGINE}/"`));
  assert.ok(html.includes(`${ORIGINE}/mister-quota.html`));
});
