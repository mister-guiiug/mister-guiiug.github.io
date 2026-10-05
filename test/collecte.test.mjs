/**
 * La collecte, sans réseau : la file qui borne les requêtes en vol, et la sonde
 * en HEAD qui retombe en GET quand le serveur refuse HEAD.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { limiteur, statut } from '../scripts/collecte.mjs';

test('limiteur : jamais plus de n tâches en cours, résultats dans l’ordre des appels', async () => {
  const enFile = limiteur(3);
  let enCours = 0;
  let maximum = 0;
  const taches = Array.from({ length: 12 }, (_, i) =>
    enFile(async () => {
      enCours += 1;
      maximum = Math.max(maximum, enCours);
      await new Promise(ok => setTimeout(ok, (12 - i) % 4));
      enCours -= 1;
      return i;
    })
  );
  assert.deepEqual(await Promise.all(taches), [...Array(12).keys()]);
  assert.equal(maximum, 3);
});

test('limiteur : une tâche qui échoue rend sa place', async () => {
  const enFile = limiteur(1);
  await assert.rejects(enFile(async () => { throw new Error('panne'); }), /panne/);
  assert.equal(await enFile(async () => 'suite'), 'suite');
});

/** Un `fetch` simulé, qui répond selon la méthode et note les appels. */
const serveur = reponses => {
  const appels = [];
  const recuperer = async (url, options = {}) => {
    const methode = options.method ?? 'GET';
    appels.push(methode);
    return new Response(methode === 'GET' ? 'corps' : null, { status: reponses[methode] });
  };
  return { recuperer, appels };
};

test('statut : HEAD suffit quand le serveur l’accepte', async () => {
  const { recuperer, appels } = serveur({ HEAD: 200 });
  assert.equal(await statut('https://exemple.github.io/a/', { recuperer, pauseMs: 0 }), 200);
  assert.deepEqual(appels, ['HEAD']);
});

test('statut : HEAD refusé (405, 501), la sonde relit en GET', async () => {
  for (const refus of [405, 501]) {
    const { recuperer, appels } = serveur({ HEAD: refus, GET: 200 });
    assert.equal(await statut('https://exemple.github.io/a/', { recuperer, pauseMs: 0 }), 200);
    assert.deepEqual(appels, ['HEAD', 'GET']);
  }
});

test('statut : une erreur est retentée, puis rendue telle quelle', async () => {
  const { recuperer, appels } = serveur({ HEAD: 404 });
  assert.equal(await statut('https://exemple.github.io/a/', { recuperer, pauseMs: 0 }), 404);
  assert.deepEqual(appels, ['HEAD', 'HEAD', 'HEAD']);
  const panne = async () => {
    throw new TypeError('fetch failed');
  };
  assert.equal(await statut('https://exemple.github.io/a/', { recuperer: panne, pauseMs: 0 }), 0);
});
