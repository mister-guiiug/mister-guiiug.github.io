/**
 * La portée du hub NE DOIT COUVRIR AUCUNE APPLICATION.
 *
 * Du 27/09 au 03/10/2026, elle valait « / ». Chrome tient pour déjà installée
 * toute page dans la portée d'une application installée : une fois le hub
 * installé sur Android, aucune des vingt applications ne pouvait plus l'être.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  dansLaPortee,
  manifesteHub,
  problemePorteeHub,
} from '../scripts/manifeste-hub.mjs';

const ORIGINE = 'https://mister-guiiug.github.io';
const APPS = [
  'mister-miss-koh',
  'miss-genius',
  'miss-dice',
  'mister-molkky',
  'mister-settle',
  'une-app-a-venir',
];
const MANIFESTE = manifesteHub({
  origine: ORIGINE,
  compte: 'mister-guiiug',
  description: 'Les applications de mister-guiiug',
  theme: '#2f4bd1',
});

test('aucune application de la famille n’est dans la portée du hub', () => {
  for (const app of APPS) {
    assert.equal(
      dansLaPortee(`${ORIGINE}/${app}/`, MANIFESTE.scope),
      false,
      `/${app}/ serait tenue pour installée dès que le hub l’est`,
    );
  }
  assert.equal(problemePorteeHub(MANIFESTE, { origine: ORIGINE, appIds: APPS }), null);
});

test('la page du hub, elle, est dans sa portée, et l’application y démarre', () => {
  assert.ok(dansLaPortee(`${ORIGINE}/index.html`, MANIFESTE.scope));
  assert.ok(
    dansLaPortee(MANIFESTE.start_url, MANIFESTE.scope),
    'start_url hors portée : Chrome ignorerait la portée',
  );
});

test('l’identité ne change pas : Chrome met à jour le hub installé au lieu d’en créer un second', () => {
  assert.equal(MANIFESTE.id, `${ORIGINE}/`);
});

test('problemePorteeHub refuse une portée racine ou qui préfixe une app', () => {
  assert.equal(
    problemePorteeHub({ scope: `${ORIGINE}/` }, { origine: ORIGINE, appIds: APPS })?.code,
    'scope-racine',
  );
  assert.equal(
    problemePorteeHub({ scope: '/' }, { origine: ORIGINE, appIds: APPS })?.code,
    'scope-racine',
  );
  const apps = problemePorteeHub(
    { scope: `${ORIGINE}/mister-` },
    { origine: ORIGINE, appIds: APPS },
  );
  assert.equal(apps?.code, 'scope-apps');
  assert.ok(apps.apps.includes('mister-settle'));
  assert.equal(
    problemePorteeHub({}, { origine: ORIGINE, appIds: APPS })?.code,
    'scope-absent',
  );
});
