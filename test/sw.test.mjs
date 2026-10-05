/**
 * Le service worker de la racine NE DOIT TOUCHER QU'AU HUB.
 *
 * Le 29/09/2026, `hub-v4` supprimait à l'activation tous les caches de
 * l'origine, donc le précache Workbox des dix-neuf apps servies sous la même
 * origine, et répondait à toute requête des pages qu'il contrôlait. Ces tests
 * chargent le `sw.js` engendré dans un bac à sable (`node:vm`), avec des
 * `caches`, `fetch` et `self` simulés, et rejouent ses trois événements.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { CACHE_HUB, serviceWorkerHub } from '../scripts/hub-sw.mjs';

const ORIGINE = 'https://mister-guiiug.github.io';

const SOURCE = serviceWorkerHub({
  compte: 'mister-guiiug',
  chemins: [
    '/',
    '/index.html',
    '/offline.html',
    '/manifest.webmanifest',
    '/icon-192.png',
    '/icon-512.png',
    '/og-image.jpg',
    '/a-propos.html',
    '/mister-quota.html',
  ],
  essentiels: ['/', '/offline.html'],
  extras: ['/previews/miss-contraction.jpg', '/previews/miss-contraction.webp'],
});

/** Un CacheStorage en mémoire : nom → Map(clé → Response). */
function cachesSimules(nomsExistants = []) {
  const magasins = new Map(nomsExistants.map(n => [n, new Map()]));
  const supprimes = [];
  const cleDe = k => (typeof k === 'string' ? new URL(k, `${ORIGINE}/`).href : k.url);
  const ouvrir = nom => {
    if (!magasins.has(nom)) magasins.set(nom, new Map());
    const m = magasins.get(nom);
    return {
      addAll: async urls => {
        for (const u of urls) m.set(cleDe(u), new Response(`précache ${u}`));
      },
      add: async u => {
        if (u.includes('webp')) throw new Error('miniature absente');
        m.set(cleDe(u), new Response(`précache ${u}`));
      },
      put: async (k, r) => void m.set(cleDe(k), r),
      match: async k => m.get(cleDe(k)),
    };
  };
  return {
    magasins,
    supprimes,
    api: {
      keys: async () => [...magasins.keys()],
      open: async nom => ouvrir(nom),
      delete: async nom => {
        supprimes.push(nom);
        return magasins.delete(nom);
      },
      match: async () => {
        throw new Error('le worker ne doit lire que SON cache, pas tous ceux de l’origine');
      },
    },
  };
}

/** Charge le worker ; renvoie ses écouteurs et l'état simulé. */
function charger({ caches = cachesSimules(), reseau = async () => new Response('réseau') } = {}) {
  const ecouteurs = {};
  const appels = [];
  const self = {
    location: new URL(`${ORIGINE}/sw.js`),
    addEventListener: (type, f) => {
      ecouteurs[type] = f;
    },
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };
  const fetch = async req => {
    appels.push(req.url);
    return reseau(req);
  };
  vm.runInNewContext(SOURCE, { self, caches: caches.api, fetch, URL, Response, Promise });
  return { ecouteurs, caches, appels };
}

/** Un FetchEvent minimal : on regarde s'il est intercepté, et ce qu'il rend. */
function evenement(url, { method = 'GET', mode = 'no-cors' } = {}) {
  const e = {
    request: { url, method, mode },
    reponse: undefined,
    intercepte: false,
    attentes: [],
    respondWith(p) {
      this.intercepte = true;
      this.reponse = p;
    },
    waitUntil(p) {
      this.attentes.push(p);
    },
  };
  return e;
}

test('le worker engendré se compile et porte le cache hub-v6', () => {
  assert.equal(CACHE_HUB, 'hub-v6');
  assert.doesNotThrow(() => new vm.Script(SOURCE));
  assert.match(SOURCE, /const CACHE = 'hub-v6';/);
});

test('activate ne supprime QUE les anciens caches du hub', async () => {
  const caches = cachesSimules([
    'hub-v5',
    'hub-v4',
    'hub-v3',
    CACHE_HUB,
    'workbox-precache-v2-https://mister-guiiug.github.io/miss-dice/',
    'workbox-runtime-https://mister-guiiug.github.io/mister-settle/',
    'supabase-auth',
    'images',
  ]);
  const { ecouteurs } = charger({ caches });
  const attentes = [];
  ecouteurs.activate({ waitUntil: p => attentes.push(p) });
  await Promise.all(attentes);
  assert.deepEqual(caches.supprimes.sort(), ['hub-v3', 'hub-v4', 'hub-v5']);
  assert.deepEqual([...caches.magasins.keys()].sort(), [
    CACHE_HUB,
    'images',
    'supabase-auth',
    'workbox-precache-v2-https://mister-guiiug.github.io/miss-dice/',
    'workbox-runtime-https://mister-guiiug.github.io/mister-settle/',
  ]);
});

test('install précache l’essentiel et tolère une miniature absente', async () => {
  const { ecouteurs, caches } = charger();
  const attentes = [];
  ecouteurs.install({ waitUntil: p => attentes.push(p) });
  await Promise.all(attentes);
  const hub = caches.magasins.get(CACHE_HUB);
  assert.ok(hub.has(`${ORIGINE}/`));
  assert.ok(hub.has(`${ORIGINE}/offline.html`));
  assert.ok(hub.has(`${ORIGINE}/previews/miss-contraction.jpg`));
  assert.ok(!hub.has(`${ORIGINE}/previews/miss-contraction.webp`));
});

test('les requêtes des apps et des autres origines passent sans lui', () => {
  const { ecouteurs } = charger();
  for (const url of [
    `${ORIGINE}/miss-dice/`,
    `${ORIGINE}/miss-dice`,
    `${ORIGINE}/miss-dice/index.html`,
    `${ORIGINE}/miss-dice/assets/index-Ab12Cd34.js`,
    `${ORIGINE}/miss-dice/regles-du-yahtzee.html`,
    `${ORIGINE}/miss-dice/sw.js`,
    `${ORIGINE}/mister-settle/a-propos`,
    `${ORIGINE}/dev-pwa-config/`,
    `${ORIGINE}/parc-dashboard/`,
    `${ORIGINE}/robots.txt`,
    `${ORIGINE}/sitemap.xml`,
    `${ORIGINE}/inconnue.html`,
    'https://abcdefgh.supabase.co/rest/v1/depenses?select=*',
    'https://fonts.googleapis.com/css2?family=Inter',
    'https://mister-guiiug.github.io.evil.example/',
  ]) {
    const e = evenement(url);
    ecouteurs.fetch(e);
    assert.equal(e.intercepte, false, `intercepté à tort : ${url}`);
  }
  // Même sur une page du hub, un POST n'est pas l'affaire du cache.
  const post = evenement(`${ORIGINE}/`, { method: 'POST' });
  ecouteurs.fetch(post);
  assert.equal(post.intercepte, false);
});

test('les requêtes du hub sont servies, et mises en cache sans leur requête', async () => {
  const { ecouteurs, caches } = charger();
  for (const url of [
    `${ORIGINE}/`,
    `${ORIGINE}/?q=d%C3%A9s&m=stable`,
    `${ORIGINE}/index.html`,
    `${ORIGINE}/offline.html`,
    `${ORIGINE}/manifest.webmanifest`,
    `${ORIGINE}/icon-192.png`,
    `${ORIGINE}/og-image.jpg?v=0a1b2c3d`,
    `${ORIGINE}/a-propos.html`,
    `${ORIGINE}/mister-quota.html`,
    `${ORIGINE}/previews/miss-dice.webp`,
  ]) {
    const e = evenement(url, { mode: url.endsWith('.html') || url.includes('/?') ? 'navigate' : 'no-cors' });
    ecouteurs.fetch(e);
    assert.equal(e.intercepte, true, `non servi : ${url}`);
    const r = await e.reponse;
    assert.equal(await r.text(), 'réseau');
    await Promise.all(e.attentes);
  }
  const hub = caches.magasins.get(CACHE_HUB);
  assert.ok(hub.has(`${ORIGINE}/`));
  assert.ok(hub.has(`${ORIGINE}/og-image.jpg`));
  assert.ok(![...hub.keys()].some(k => k.includes('?')), 'une clé de cache garde sa requête');
});

test('une erreur HTTP n’est pas mise en cache', async () => {
  const { ecouteurs, caches } = charger({ reseau: async () => new Response('absent', { status: 404 }) });
  const e = evenement(`${ORIGINE}/a-propos.html`, { mode: 'navigate' });
  ecouteurs.fetch(e);
  assert.equal((await e.reponse).status, 404);
  await Promise.all(e.attentes);
  assert.equal(caches.magasins.get(CACHE_HUB)?.has(`${ORIGINE}/a-propos.html`) ?? false, false);
});

test('hors ligne : la page en cache, sinon la page hors ligne, sinon une erreur réseau', async () => {
  const caches = cachesSimules();
  const { ecouteurs } = charger({
    caches,
    reseau: async () => {
      throw new TypeError('Failed to fetch');
    },
  });
  const installation = [];
  ecouteurs.install({ waitUntil: p => installation.push(p) });
  await Promise.all(installation);

  const accueil = evenement(`${ORIGINE}/?q=dice`, { mode: 'navigate' });
  ecouteurs.fetch(accueil);
  assert.equal(await (await accueil.reponse).text(), 'précache /');

  const page = evenement(`${ORIGINE}/a-propos.html`, { mode: 'navigate' });
  ecouteurs.fetch(page);
  assert.equal(await (await page.reponse).text(), 'précache /offline.html');

  const image = evenement(`${ORIGINE}/previews/miss-dice.jpg`);
  ecouteurs.fetch(image);
  assert.equal((await image.reponse).type, 'error');
});

test('« /index.html », lancement de l’app installée, partage la clé de « / »', async () => {
  // En ligne : la page lue à « /index.html » remplace la copie de « / ».
  const enLigne = charger({ reseau: async () => new Response('page fraîche') });
  const visite = evenement(`${ORIGINE}/index.html`, { mode: 'navigate' });
  enLigne.ecouteurs.fetch(visite);
  await (await visite.reponse).text();
  await Promise.all(visite.attentes);
  const hub = enLigne.caches.magasins.get(CACHE_HUB);
  assert.ok(hub.has(`${ORIGINE}/`));
  assert.ok(!hub.has(`${ORIGINE}/index.html`), 'la page est rangée deux fois');

  // Hors ligne : l'app lancée sur « /index.html » retrouve « / », seul précaché.
  const horsLigne = charger({
    reseau: async () => {
      throw new TypeError('Failed to fetch');
    },
  });
  const installation = [];
  horsLigne.ecouteurs.install({ waitUntil: p => installation.push(p) });
  await Promise.all(installation);
  assert.ok(!horsLigne.caches.magasins.get(CACHE_HUB).has(`${ORIGINE}/index.html`));
  const lancement = evenement(`${ORIGINE}/index.html`, { mode: 'navigate' });
  horsLigne.ecouteurs.fetch(lancement);
  assert.equal(await (await lancement.reponse).text(), 'précache /');
});

test('un chemin mal formé est refusé à la construction', () => {
  assert.throws(() =>
    serviceWorkerHub({ compte: 'x', chemins: ['https://ailleurs.example/'], essentiels: [] })
  );
  assert.throws(() => serviceWorkerHub({ compte: 'x', chemins: ['//ailleurs.example/'], essentiels: [] }));
});
