/**
 * La politique de sécurité de l'accueil : chaque script et chaque style écrits
 * dans la page y figurent par leur empreinte, calculée sur la page DATÉE, et
 * rien d'autre ne s'exécute.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { rendreAccueil } from '../scripts/accueil.mjs';
import {
  JETON_CSP,
  politiqueAccueil,
  poserPolitique,
  scriptsEnLigne,
  stylesEnLigne,
} from '../scripts/csp.mjs';
import { dater } from '../scripts/pages-hub.mjs';
import { ORIGINE, donneesFactices } from './catalogue-factice.mjs';

const MODULES = [`${ORIGINE}/hub-command.js`, `${ORIGINE}/command.js`];

/** L'accueil comme le publie la construction : rendu, daté, puis sa politique. */
const publie = raccourci => {
  const { html } = rendreAccueil(donneesFactices({ raccourci }));
  return poserPolitique(dater(html, '2026-10-05'), {
    origine: ORIGINE,
    scripts: raccourci ? MODULES : [],
  });
};

/** Les directives de la politique posée dans la page, par nom. */
const directives = html => {
  const contenu = /<meta http-equiv="Content-Security-Policy" content="([^"]*)" \/>/.exec(html)?.[1];
  assert.ok(contenu, 'politique absente');
  return Object.fromEntries(
    contenu.split(';').map(d => {
      const [nom, ...valeurs] = d.trim().split(/\s+/);
      return [nom, valeurs];
    })
  );
};

const sha = texte => `'sha256-${createHash('sha256').update(texte, 'utf8').digest('base64')}'`;

test('CSP : l’empreinte de chaque script en ligne, calculée sur la page datée', () => {
  const html = publie(false);
  const scripts = scriptsEnLigne(html);
  assert.equal(scripts.length, 2, 'le script du thème et le script de la page');
  // La date est dans les libellés du script : l'empreinte porte sur elle.
  assert.ok(scripts.some(s => s.includes('5 octobre 2026')));
  const { 'script-src': scriptSrc } = directives(html);
  assert.deepEqual(scriptSrc, scripts.map(sha));
  assert.ok(!scriptSrc.includes("'unsafe-inline'"));
  assert.ok(!scriptSrc.includes("'self'"), "'self' couvrirait les scripts des vingt apps");
});

test('CSP : le module Ctrl+K n’est autorisé que s’il est publié, par son adresse exacte', () => {
  const sans = directives(publie(false))['script-src'];
  assert.ok(sans.every(s => s.startsWith("'sha256-")));
  const avec = directives(publie(true))['script-src'];
  for (const url of MODULES) assert.ok(avec.includes(url), `${url} manque`);
});

test('CSP : styles par empreinte, aucun attribut style ni gestionnaire en ligne', () => {
  const html = publie(false);
  const { 'style-src': styleSrc } = directives(html);
  assert.deepEqual(styleSrc, stylesEnLigne(html).map(sha));
  assert.doesNotMatch(html, /\sstyle="/, 'un attribut style exigerait unsafe-hashes');
  assert.doesNotMatch(html, /\son[a-z]+="/, 'un gestionnaire en ligne serait bloqué');
});

test('CSP : tout le reste est fermé ou nommé', () => {
  const d = directives(publie(false));
  assert.deepEqual(d['default-src'], ["'none'"]);
  assert.deepEqual(d['img-src'], [ORIGINE]);
  assert.deepEqual(d['connect-src'], ["'none'"]);
  assert.deepEqual(d['worker-src'], [`${ORIGINE}/sw.js`]);
  assert.deepEqual(d['manifest-src'], [`${ORIGINE}/manifest.webmanifest`]);
  assert.deepEqual(d['object-src'], ["'none'"]);
  assert.deepEqual(d['base-uri'], ["'none'"]);
  assert.deepEqual(d['form-action'], ["'none'"]);
  // Sans effet dans une balise <meta>, et signalé en console par les navigateurs.
  assert.equal(d['frame-ancestors'], undefined);
});

test('CSP : la politique précède tout ce qu’elle gouverne', () => {
  const html = publie(true);
  const position = motif => html.search(motif);
  const csp = position(/<meta http-equiv="Content-Security-Policy"/);
  assert.ok(csp > 0);
  for (const motif of [/<script/, /<style/, /<link rel="manifest"/, /<link rel="icon"/]) {
    assert.ok(csp < position(motif), `${motif} avant la politique`);
  }
});

test('CSP : un seul jeton, remplacé une fois', () => {
  const { html } = rendreAccueil(donneesFactices());
  assert.equal(html.split(JETON_CSP).length, 2);
  assert.ok(!publie(false).includes(JETON_CSP));
  assert.throws(() => poserPolitique('<p>sans jeton</p>', { origine: ORIGINE }), /0 jeton/);
  assert.throws(
    () => poserPolitique(`${JETON_CSP}${JETON_CSP}`, { origine: ORIGINE }),
    /2 jeton/
  );
  // La politique d'une page sans script ni style reste valide et fermée.
  assert.match(politiqueAccueil('<p></p>', { origine: ORIGINE }), /^default-src 'none'; script-src; style-src;/);
});
