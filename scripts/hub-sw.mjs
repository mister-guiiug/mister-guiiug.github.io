/**
 * Le service worker de la RACINE, et pourquoi il est bridé.
 *
 * Il est servi depuis `/sw.js` : sa portée est donc TOUTE l'origine
 * `mister-guiiug.github.io`. Or cette origine, le hub la partage avec les dix-neuf
 * applications servies sous `/<app>/`. Chacune a son propre worker (Workbox,
 * portée `/<app>/`) et son précache, rangé dans un cache de la MÊME origine :
 * `caches.keys()` les voit tous.
 *
 * Jusqu'à `hub-v4`, ce worker faisait deux choses qui débordaient du hub :
 *   - à l'activation, il supprimait TOUS les caches de l'origine sauf le sien,
 *     donc le précache Workbox des apps, et avec lui leur mode hors ligne ;
 *   - il répondait à TOUTE requête GET des pages qu'il contrôle, et la mettait
 *     en cache, autres origines et réponses d'API comprises. Une app ouverte
 *     pour la première fois après le hub, avant d'avoir son propre worker,
 *     passait par lui.
 *
 * Désormais :
 *   - il ne supprime que les caches `hub-*` autres que le sien ;
 *   - il ne répond qu'aux requêtes de même origine qui visent le hub lui-même :
 *     une liste FERMÉE de fichiers de premier niveau, engendrée à la
 *     construction, plus `/previews/…` ;
 *   - tout le reste passe sans qu'il y touche : `/<app>/…` et les autres
 *     origines. Sans `respondWith`, le navigateur fait la requête comme si le
 *     worker n'existait pas.
 *
 * Ce qu'il ne peut pas éviter : une page d'app ouverte avant que l'app ait
 * enregistré son worker reste CONTRÔLÉE par celui-ci (la portée `/` la
 * couvre). Il n'intercepte plus rien pour elle, et le worker de l'app la
 * reprend dès son activation (`clientsClaim` de Workbox).
 */

/** Le nom du cache. À changer à chaque modification du worker. */
export const CACHE_HUB = 'hub-v6';

/** Le préfixe des caches du hub, et des seuls que ce worker ait le droit d'effacer. */
export const PREFIXE_CACHE_HUB = 'hub-';

/**
 * Le texte de `sw.js`.
 *
 * @param {object} options
 * @param {string} options.compte   le nom du compte, pour l'en-tête
 * @param {string[]} options.chemins  les chemins de premier niveau servis par le
 *   hub (`/`, `/index.html`, `/a-propos.html`…), les seuls auxquels il réponde
 *   avec `/previews/…`
 * @param {string[]} options.essentiels  précachés à l'installation ; un échec
 *   fait échouer l'installation, comme `addAll`
 * @param {string[]} [options.extras]  précachés si possible : une miniature
 *   absente ne doit pas empêcher le worker de s'installer
 * @param {string} [options.horsLigne]  la page servie à une navigation sans réseau
 */
export function serviceWorkerHub({
  compte,
  chemins,
  essentiels,
  extras = [],
  horsLigne = '/offline.html',
}) {
  for (const c of [...chemins, ...essentiels, ...extras, horsLigne]) {
    if (typeof c !== 'string' || !c.startsWith('/') || c.startsWith('//')) {
      throw new Error(`service worker : chemin relatif à l'origine attendu, reçu ${c}`);
    }
  }
  const liste = valeurs => JSON.stringify(valeurs, null, 2);
  return `/* Hub ${compte} : service worker de la racine, portée « / ».
 *
 * LA PORTÉE « / » COUVRE TOUTE L'ORIGINE, donc aussi les applications servies
 * sous /<app>/, qui ont chacune leur worker et leur précache Workbox dans des
 * caches de la même origine. Ce worker ne touche donc qu'au hub :
 *   - il n'efface que les caches « ${PREFIXE_CACHE_HUB}* » autres que le sien : effacer tous
 *     les caches de l'origine (ce que faisait hub-v4) vidait le précache des
 *     apps et cassait leur mode hors ligne ;
 *   - il ne répond qu'aux requêtes de même origine vers les fichiers du hub
 *     (liste fermée ci-dessous) et vers /previews/ ; /<app>/… et les autres
 *     origines passent sans lui (pas de respondWith).
 * Stratégie : réseau d'abord ; le cache ne sert que hors ligne.
 * Engendré par scripts/build-site.mjs (voir scripts/hub-sw.mjs).
 */
const CACHE = '${CACHE_HUB}';
const PREFIXE = '${PREFIXE_CACHE_HUB}';
const HORS_LIGNE = '${horsLigne}';
const ESSENTIELS = ${liste(essentiels)};
const EXTRAS = ${liste(extras)};
const DU_HUB = new Set(${liste(chemins)});

/** Une requête du hub : même origine, et un fichier du hub ou une miniature. */
function estDuHub(url) {
  if (url.origin !== self.location.origin) return false;
  return DU_HUB.has(url.pathname) || url.pathname.startsWith('/previews/');
}

/**
 * La clé de cache, sans la requête : « /?q=dés » et « / » sont la même page,
 * et « /og-image.jpg?v=… » la même image. Sans ça, chaque filtre partagé par
 * lien ajouterait une copie de la page au cache.
 *
 * « /index.html » est « / » : l'adresse de lancement de l'app installée et
 * l'adresse canonique servent la même page, rangée sous la seule clé « / ».
 * Seule « / » est précachée ; lancée hors ligne, l'app la retrouve.
 */
function cle(url) {
  return url.origin + (url.pathname === '/index.html' ? '/' : url.pathname);
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(c =>
        c
          .addAll(ESSENTIELS)
          .then(() => Promise.all(EXTRAS.map(u => c.add(u).catch(() => {}))))
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(noms =>
        Promise.all(
          noms
            .filter(n => n.startsWith(PREFIXE) && n !== CACHE)
            .map(n => caches.delete(n))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Une app, une API, une police d'une autre origine : pas notre affaire.
  if (!estDuHub(url)) return;
  const k = cle(url);
  event.respondWith(
    fetch(req)
      .then(res => {
        // Même origine seulement (estDuHub) : \`ok\` écarte aussi les réponses
        // opaques, de statut 0. Une erreur HTTP n'écrase jamais la copie saine.
        if (res.ok) {
          const copie = res.clone();
          event.waitUntil(
            caches
              .open(CACHE)
              .then(c => c.put(k, copie))
              .catch(() => {})
          );
        }
        return res;
      })
      .catch(() =>
        caches
          .open(CACHE)
          .then(c => c.match(k).then(r => r || (req.mode === 'navigate' ? c.match(HORS_LIGNE) : undefined)))
          .then(r => r || Response.error())
      )
  );
});
`;
}
