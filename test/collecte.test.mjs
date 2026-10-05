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

test('lireOctets : une erreur n’est jamais prise pour une image', async () => {
  const appels = [];
  const repondre = statut => async url => {
    appels.push(url);
    return new Response(statut === 200 ? 'JPEG' : '<html>erreur</html>', { status: statut });
  };
  const { lireOctets } = await import('../scripts/collecte.mjs');
  assert.equal(String(await lireOctets('https://e/a.jpg', { recuperer: repondre(200), pauseMs: 0 })), 'JPEG');
  assert.equal(await lireOctets('https://e/b.jpg', { recuperer: repondre(503), pauseMs: 0 }), null);
  assert.equal(await lireOctets('https://e/c.jpg', { recuperer: repondre(404), pauseMs: 0 }), null);
  // 503 retenté trois fois, 404 lu une fois.
  assert.equal(appels.filter(u => u.endsWith('b.jpg')).length, 3);
  assert.equal(appels.filter(u => u.endsWith('c.jpg')).length, 1);
});

test('choisirIcone : la plus petite d’au moins 96 px, d’usage any, résolue contre le manifeste', async () => {
  const { choisirIcone } = await import('../scripts/collecte.mjs');
  const base = 'https://exemple.github.io/miss-dice/manifest.webmanifest';
  assert.equal(
    choisirIcone(
      [
        { src: 'icons/icon-512.png', sizes: '512x512', purpose: 'any' },
        { src: 'icons/maskable-192.png', sizes: '192x192', purpose: 'maskable' },
        { src: 'icons/icon-192.png', sizes: '192x192' },
        { src: 'icons/icon-48.png', sizes: '48x48' },
      ],
      base
    ),
    'https://exemple.github.io/miss-dice/icons/icon-192.png'
  );
  // Une icône sans taille (SVG) ne sert qu'à défaut d'une icône raster.
  assert.equal(
    choisirIcone([{ src: 'icon.svg', sizes: 'any' }, { src: 'pwa-512.png', sizes: '512x512' }], base),
    'https://exemple.github.io/miss-dice/pwa-512.png'
  );
  assert.equal(choisirIcone([{ src: 'icon.svg', sizes: 'any' }], base), 'https://exemple.github.io/miss-dice/icon.svg');
  assert.equal(choisirIcone(undefined, base), null);
  assert.equal(choisirIcone([{ src: 'petit.png', sizes: '48x48' }], base), null);
  assert.equal(choisirIcone([{ src: 'seule-maskable.png', sizes: '192x192', purpose: 'maskable' }], base), null);
});
