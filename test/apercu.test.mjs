/**
 * L'aperçu local : seuls les fichiers du hub changent d'adresse, et la
 * politique de sécurité suit.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { adresseApercu, versApercu } from '../scripts/apercu.mjs';
import { politiqueAccueil } from '../scripts/csp.mjs';

const ORIGINE = 'https://mister-guiiug.github.io';
const APERCU = 'http://localhost:5250/hub-a-f-site';

test('adresseApercu : absente, nulle ; présente, sans barre finale ; http(s) seulement', () => {
  assert.equal(adresseApercu(undefined), null);
  assert.equal(adresseApercu(''), null);
  assert.equal(adresseApercu(`${APERCU}/`), APERCU);
  assert.throws(() => adresseApercu('javascript:alert(1)'), /http\(s\)/);
});

test('versApercu : les fichiers du hub, et eux seuls', () => {
  const page = [
    `<link rel="canonical" href="${ORIGINE}/" />`,
    `<link rel="manifest" href="${ORIGINE}/manifest.webmanifest" />`,
    `<img src="${ORIGINE}/previews/miss-dice.jpg" />`,
    `<img src="${ORIGINE}/icon-192.png" />`,
    `<img src="${ORIGINE}/miss-dice/icon-192.png" />`,
    `<a href="${ORIGINE}/miss-dice/">Ouvrir</a>`,
    `<a href="${ORIGINE}/a-propos.html">À propos</a>`,
    `register('${ORIGINE}/sw.js')`,
  ].join('\n');
  const apercu = versApercu(page, { origine: ORIGINE, apercu: APERCU });
  assert.ok(apercu.includes(`href="${ORIGINE}/"`), 'la canonique reste celle de l’origine');
  assert.ok(apercu.includes(`${APERCU}/manifest.webmanifest`));
  assert.ok(apercu.includes(`${APERCU}/previews/miss-dice.jpg`));
  assert.ok(apercu.includes(`src="${APERCU}/icon-192.png"`));
  assert.ok(apercu.includes(`${ORIGINE}/miss-dice/icon-192.png`), 'l’icône d’une app reste sur l’origine');
  assert.ok(apercu.includes(`href="${ORIGINE}/miss-dice/"`), 'le lien d’une app reste sur l’origine');
  assert.ok(apercu.includes(`${APERCU}/a-propos.html`));
  assert.ok(apercu.includes(`register('${APERCU}/sw.js')`));
  assert.equal(versApercu(page, { origine: ORIGINE, apercu: null }), page);
});

test('politique : en aperçu, worker et manifeste locaux, images des deux côtés', () => {
  const p = politiqueAccueil('<p></p>', { origine: ORIGINE, apercu: APERCU });
  assert.match(p, new RegExp(`img-src ${ORIGINE} ${APERCU}/;`));
  assert.match(p, new RegExp(`worker-src ${APERCU}/sw\\.js;`));
  assert.match(p, new RegExp(`manifest-src ${APERCU}/manifest\\.webmanifest;`));
  const production = politiqueAccueil('<p></p>', { origine: ORIGINE });
  assert.match(production, new RegExp(`img-src ${ORIGINE};`));
  assert.match(production, new RegExp(`worker-src ${ORIGINE}/sw\\.js;`));
});
