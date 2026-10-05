/**
 * Le raccourci Ctrl+K : le module `command.js` du socle, à l'étiquette publiée
 * et nulle part ailleurs, et une page qui ne l'annonce que s'il est là.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { rendreAccueil } from '../scripts/accueil.mjs';
import { texteCommandDuSocle } from '../scripts/collecte.mjs';

const ICI = dirname(fileURLToPath(import.meta.url));
const HUB_CMD = readFileSync(join(ICI, '..', 'scripts', 'hub-command.js'), 'utf8');
const CLIENT = readFileSync(join(ICI, '..', 'scripts', 'accueil', 'hub-client.js'), 'utf8');
const DEPOT = { compte: 'exemple', socle: 'socle' };

/** Un `fetch` simulé : il note les URL demandées et rend la réponse prévue. */
const fetchSimule = reponse => {
  const demandes = [];
  const recuperer = async url => {
    demandes.push(url);
    return typeof reponse === 'function' ? reponse(url) : reponse;
  };
  return { recuperer, demandes };
};

test('hub-command.js branche bindSearchHotkeys sur #filtre', () => {
  assert.match(HUB_CMD, /bindSearchHotkeys/);
  assert.match(HUB_CMD, /from ['"]\.\/command\.js['"]/);
  assert.match(HUB_CMD, /getElementById\(['"]filtre['"]\)/);
  // Le script de la page ne double pas le raccourci ; il garde Échap.
  assert.doesNotMatch(CLIENT, /mod && !e\.altKey && !e\.shiftKey && \(e\.key === 'k'/);
  assert.match(CLIENT, /e\.key === 'Escape' && filtre/);
});

test('command.js : lu à l’étiquette publiée, jamais sur main', async () => {
  const { recuperer, demandes } = fetchSimule(new Response('export const x = 1;'));
  const texte = await texteCommandDuSocle(DEPOT, 'v6.30.0', { local: false, recuperer });
  assert.equal(texte, 'export const x = 1;');
  assert.deepEqual(demandes, [
    'https://raw.githubusercontent.com/exemple/socle/v6.30.0/command.js',
  ]);
});

test('command.js absent à l’étiquette : null, sans repli sur main', async () => {
  const { recuperer, demandes } = fetchSimule(new Response('absent', { status: 404 }));
  assert.equal(await texteCommandDuSocle(DEPOT, 'v6.24.0', { local: false, recuperer }), null);
  assert.equal(demandes.length, 1);
  assert.ok(demandes.every(u => !u.includes('/main/')));
});

test('command.js illisible (5xx, réseau) : la construction échoue après trois essais', async () => {
  const { recuperer, demandes } = fetchSimule(new Response('panne', { status: 503 }));
  await assert.rejects(
    texteCommandDuSocle(DEPOT, 'v6.30.0', { local: false, recuperer, pauseMs: 0 }),
    /illisible après 3 essais/
  );
  assert.equal(demandes.length, 3);
  assert.ok(demandes.every(u => !u.includes('/main/')));
});

test('la copie locale du socle ne sert que demandée, et doit exister', async () => {
  const { recuperer, demandes } = fetchSimule(new Response('distant'));
  await assert.rejects(
    texteCommandDuSocle(DEPOT, 'v6.30.0', {
      local: true,
      cheminLocal: join(ICI, 'absent', 'command.js'),
      recuperer,
    }),
    /HUB_SOCLE_LOCAL=1/
  );
  const local = await texteCommandDuSocle(DEPOT, 'v6.30.0', {
    local: true,
    cheminLocal: join(ICI, '..', 'scripts', 'hub-command.js'),
    recuperer,
  });
  assert.equal(local, HUB_CMD);
  assert.equal(demandes.length, 0, 'la copie locale ne doit pas toucher le réseau');
});

const APPS = [
  {
    id: 'miss-alpha',
    name: 'Miss Alpha',
    description: 'Une application.',
    category: 'jeux',
    maturity: 'stable',
    platform: 'web',
    appUrl: 'https://exemple.github.io/miss-alpha/',
  },
];

const accueil = raccourci =>
  rendreAccueil({
    origine: 'https://exemple.github.io',
    compte: 'exemple',
    soi: 'exemple.github.io',
    theme: '#2f4bd1',
    sponsorUrl: 'https://buymeacoffee.com/exemple',
    imageEmpreinte: '0a1b2c3d',
    apps: APPS,
    categories: ['jeux'],
    libellesFr: { categories: { jeux: 'Jeux' }, maturity: {} },
    libellesEn: { categories: { jeux: 'Games' }, maturity: {} },
    descriptionsEn: {},
    pagesParApp: new Map(),
    apercus: new Map(),
    iconeParApp: new Map(),
    enPanne: [],
    pageDeBureau: new Map(),
    coulisses: [],
    pagesParSite: new Map(),
    raccourci,
  }).html;

test('avec command.js, la page charge le module et annonce le raccourci', () => {
  const html = accueil(true);
  assert.match(html, /<script type="module" src="\.\/hub-command\.js"><\/script>/);
  assert.match(html, /aria-keyshortcuts="Control\+K Meta\+K"/);
  assert.match(html, /<kbd class="filtre-kbd"/);
  assert.match(html, /<label class="filtre filtre-raccourci">/);
});

test('sans command.js, ni module, ni indication de raccourci', () => {
  const html = accueil(false);
  assert.doesNotMatch(html, /<script type="module"/);
  assert.doesNotMatch(html, /<kbd[\s>]/);
  assert.doesNotMatch(html, /aria-keyshortcuts=/);
  assert.match(html, /<label class="filtre">/);
});
