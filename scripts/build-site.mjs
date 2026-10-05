/**
 * Construit le site de la racine — `index.html`, les pages statiques
 * (`a-propos.html`, `mister-quota.html`, `404.html`), `robots.txt`, l'index des
 * plans de site (`sitemap.xml`) et celui du hub (`sitemap-hub.xml`),
 * `seo-state.json`, le service worker et les fichiers de vérification — dans un
 * dossier de sortie (`_site` par défaut). Rien n'est commité : le workflow
 * `pages.yml` l'exécute au moment de PUBLIER, chaque nuit et à chaque fusion.
 *
 * LES DATES SONT CELLES DU CONTENU, PAS DU BUILD. Chaque page du hub est
 * engendrée avec des jetons à la place de sa date affichée ; son empreinte est
 * calculée sur ce texte, puis comparée à celle de la publication précédente
 * (`seo-state.json`, relu en ligne). Même empreinte : même `lastmod`, même « Mis
 * à jour le ». Seules les pages qui ont réellement changé partent à IndexNow
 * (sortie `urls-modifiees`, lue par le job « Publier »).
 *
 * LA LISTE DES APPLICATIONS VIENT DU CATALOGUE DU SOCLE, pas de GitHub.
 * `FAMILY_APPS` (`@mister-guiiug/dev-pwa-config/apps-catalog`) est la liste que
 * CHAQUE application affiche déjà dans sa grille « Nos autres applications » :
 * mêmes noms, mêmes descriptions, mêmes catégories, même maturité. La première
 * version de ce script l'ignorait et relisait tout depuis l'API GitHub, avec une
 * liste d'« outils » écrite en dur — deux sources pour une même vérité, qui
 * divergeaient dès le premier jour (22 entrées contre 20, d'autres
 * descriptions).
 *
 * On le lit À LA DERNIÈRE VERSION PUBLIÉE, pas sur `main` : c'est ce qu'affiche
 * une application à jour. Les deux modules lus — `apps-catalog.js` et
 * `react/labels-fr.js` — sont autonomes (aucun import) : ils s'importent tels
 * quels depuis leur texte, sans installer le paquet ni jeton de registre.
 *
 * L'API GITHUB NE SERT PLUS QU'À CE QUE LE CATALOGUE NE SAIT PAS :
 *   1. l'index des plans de site (`sitemap.xml`), qui doit nommer le plan de
 *      TOUS les sites publiés sous l'origine — outils compris ;
 *   2. la section « Dans les coulisses » : les sites publiés qui ne sont PAS des
 *      applications du catalogue (le showroom du socle, le squelette, le tableau
 *      de bord). Calculée, jamais écrite à la main : un nouveau site
 *      d'infrastructure y apparaît de lui-même ;
 *   3. la dernière version publiée d'une application de bureau, pour sa page
 *      du hub.
 *
 * PANNE PARTIELLE. Si une application du catalogue ne répond pas, la
 * construction continue : la carte porte un bandeau « non vérifiée » et un
 * fallback visuel, plutôt que de geler tout le hub. `HUB_STRICT=1` (ou
 * `--strict`) restaure l'ancien fail-safe total. Chaque sonde est retentée
 * avant de conclure.
 *
 * Usage : node scripts/build-site.mjs [dossier-de-sortie]
 * Un `GITHUB_TOKEN` (ou `GH_TOKEN`) dans l'environnement relève la limite de
 * l'API ; sans lui, ses quelques requêtes passent quand même.
 *
 * TROIS COUCHES. Ce fichier orchestre ; il ne lit ni ne met en page :
 *   - `collecte.mjs` lit le réseau (API GitHub, catalogue du socle, sondes) ;
 *   - `accueil.mjs` rend `index.html` sans réseau, à partir de ces données ;
 *   - `accueil/hub.css` et `accueil/hub-client.js` sont la feuille de style et
 *     le script de l'accueil, insérés dans la page à la construction.
 * Restent ici les pages statiques, le manifeste, le worker, les dates et
 * l'écriture des fichiers.
 */
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  copyFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rendreAccueil } from './accueil.mjs';
import { collecter, lireOctets } from './collecte.mjs';
import { adresseApercu, versApercu } from './apercu.mjs';
import { JETON_CSP, poserPolitique } from './csp.mjs';
import { DESCRIPTIONS_EN, appsSansDescriptionEn } from './descriptions-en.mjs';
import { serviceWorkerHub } from './hub-sw.mjs';
import { manifesteHub } from './manifeste-hub.mjs';
import { INDEXNOW_CLE } from './indexnow-cle.mjs';
import { appsNonRelevees, pageAPropos } from './page-a-propos.mjs';
import {
  JETONS,
  PAGES_BUREAU,
  dater,
  entiteEditeur,
  page404,
} from './pages-hub.mjs';
import {
  datesDeModification,
  dernierLastmod,
  empreinte,
  indexDePlans,
  lireEtatEnLigne,
  planDeSite,
  robotsTxt,
} from './seo-hub.mjs';

const ICI = dirname(fileURLToPath(import.meta.url));
const SORTIE = process.argv[2] ?? '_site';
/** Un aperçu local, jamais en CI : voir scripts/apercu.mjs. */
const APERCU = adresseApercu(process.env.HUB_APERCU);
const COMPTE = 'mister-guiiug';
const SOCLE = 'dev-pwa-config';
const SOI = `${COMPTE}.github.io`;
/** Handle Buy Me a Coffee de la famille — même valeur que `FUNDING.yml`. */
const SPONSOR_URL = 'https://buymeacoffee.com/mister.guiiug';
const THEME = '#2f4bd1';

/**
 * LE JETON GITHUB NE RESTE PAS DANS L'ENVIRONNEMENT. La collecte exécute, par
 * `import(data:)`, les modules du catalogue lus sur le socle : ils verraient
 * `process.env`. Le jeton est gardé dans cette constante, que rien n'exporte,
 * et retiré de l'environnement avant toute collecte. Limite connue : sous
 * Linux, `/proc/self/environ` garde l'environnement de départ du processus.
 */
const JETON = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? '';
delete process.env.GITHUB_TOKEN;
delete process.env.GH_TOKEN;

/**
 * LE FICHIER DE VÉRIFICATION DE SEARCH CONSOLE, et pourquoi il vit ici.
 *
 * Une seule propriété en PRÉFIXE D'URL, `https://mister-guiiug.github.io/`,
 * couvre les vingt-deux sites : ils ne sont que des chemins sous cette origine.
 * La validation par DOMAINE passe par le DNS, impossible sur `github.io` ; reste
 * un fichier servi À LA RACINE — le seul endroit que ce dépôt, et lui seul,
 * sert.
 *
 * Le nom a été délivré par l'API Site Verification le 23/09/2026 pour le
 * compte de service `ga4-parc@mister-guiiug.iam.gserviceaccount.com`. Il n'a
 * rien de secret : Google le lit en clair, comme tout visiteur. Le RETIRER
 * ferait perdre la propriété — Google revérifie périodiquement.
 */
const VERIFICATION_GOOGLE = 'google9caf2e3f1fe44b09.html';

/**
 * Le code de Bing Webmaster Tools, servi dans `BingSiteAuth.xml` à la racine.
 * Même raisonnement : une propriété sur `https://mister-guiiug.github.io/`
 * couvre tout le parc. Le code a été délivré par l'API Webmaster le 25/09/2026
 * (`AddSite`, puis `GetUserSites`). Il n'a rien de secret, et le retirer ferait
 * perdre la vérification.
 */
const VERIFICATION_BING = 'C186323DB4057177900143ABD890AEC1';

/**
 * L'image de partage de la racine, 1200×630 : le titre et la mosaïque des
 * icônes du catalogue. Dessinée une fois le 25/09/2026 et versionnée dans
 * `static/` ; l'empreinte de son contenu entre dans l'URL, parce que les réseaux
 * gardent une image en cache par URL. Sans elle, un lien vers le parc partagé
 * sur une messagerie sortait sans aucune image.
 */
const IMAGE_PARTAGE = new URL('../static/og-image.jpg', import.meta.url);
const IMAGE_EMPREINTE = createHash('sha256')
  .update(readFileSync(IMAGE_PARTAGE))
  .digest('hex')
  .slice(0, 8);

// ---------------------------------------------------------------------------
// Lecture : voir scripts/collecte.mjs
// ---------------------------------------------------------------------------

const strict =
  process.env.HUB_STRICT === '1' || process.argv.includes('--strict');
const {
  version,
  catalogue,
  apps: FAMILY_APPS,
  categories: CATEGORIES,
  origine: FAMILY_ORIGIN,
  libellesFr,
  libellesEn,
  command,
  avecIssues,
  enPanne,
  pagesParApp,
  lastmodParPlan,
  imageParApp,
  iconeParApp,
  sites,
  coulisses,
  pagesParSite,
  bureau,
  pageDeBureau,
} = await collecter({ compte: COMPTE, socle: SOCLE, soi: SOI, jeton: JETON, strict });

const surOrigine = url => url.startsWith(`${FAMILY_ORIGIN}/`);

// Le raccourci Ctrl+K n'existe que si le socle publie `command.js` à cette
// étiquette (voir `texteCommandDuSocle`). Sinon, la page se construit sans lui.
if (!command) {
  console.log(
    `::warning::command.js absent du socle ${version} : l'accueil est publié sans le raccourci Ctrl+K.`
  );
}

// Une app née au catalogue sans description anglaise : sa carte garde le
// français en anglais, marqué lang="fr" ; la CI le signale.
{
  const sansAnglais = appsSansDescriptionEn(FAMILY_APPS);
  if (sansAnglais.length) {
    console.log(
      `::warning::Description anglaise absente pour ${sansAnglais.join(', ')} : l'ajouter à scripts/descriptions-en.mjs.`
    );
  }
}

// UN SEUL ÉDITEUR. Le socle exporte le même nœud `#org` (`PUBLISHER`, à partir
// de sa 6.19.0) pour que les apps et leurs pages le reprennent : si les deux
// déclarations divergeaient, le graphe retrouverait deux éditeurs sous un
// même `@id`. La CI le signale.
{
  const canon = o => JSON.stringify(Object.keys(o ?? {}).sort().map(k => [k, o[k]]));
  const duHub = entiteEditeur({ origine: FAMILY_ORIGIN, compte: COMPTE });
  if (catalogue.PUBLISHER && canon(catalogue.PUBLISHER) !== canon(duHub)) {
    console.log(
      `::warning::L'éditeur #org du hub diffère de PUBLISHER du socle ${version} : aligner entiteEditeur (scripts/pages-hub.mjs).`
    );
  }
}

// ---------------------------------------------------------------------------
// robots.txt — lu SEULEMENT à la racine d'une origine
// ---------------------------------------------------------------------------

// Une seule ligne `Sitemap:`, vers l'index : voir scripts/seo-hub.mjs.
const robots = robotsTxt({ origine: FAMILY_ORIGIN });

// ---------------------------------------------------------------------------
// Miniatures : écrites AVANT le rendu, qui ne propose que ce qui existe
// ---------------------------------------------------------------------------

/**
 * L'accueil décidait d'une miniature à la sonde, puis l'écrivait après coup :
 * un échec d'écriture (sharp absent ou en erreur, image illisible) laissait
 * une <source type="image/webp"> vers un fichier absent, et <picture> ne
 * retombe pas sur son <img> : l'image était cassée au lieu du repli sur
 * l'icône. Les miniatures sont donc écrites d'abord ; `apercus` dit ce qui
 * l'a été, et le rendu ne propose que cela.
 */
mkdirSync(join(SORTIE, 'previews'), { recursive: true });
let sharpMod = null;
try {
  sharpMod = (await import('sharp')).default;
} catch {
  console.log('sharp absent : miniatures en taille originale, sans WebP');
}
/** id de l'app → { webp } : sa miniature, réellement écrite dans previews/. */
const apercus = new Map();
await Promise.all(
  [...imageParApp].map(async ([id, url]) => {
    const octets = await lireOctets(url);
    if (!octets) {
      console.warn(`  ! miniature ${id} : image illisible, repli sur l'icône`);
      return;
    }
    try {
      const jpg = join(SORTIE, 'previews', `${id}.jpg`);
      if (!sharpMod) {
        writeFileSync(jpg, octets);
        apercus.set(id, { webp: false });
        return;
      }
      const base = sharpMod(octets).resize({ width: 640 });
      await base.clone().jpeg({ quality: 78, mozjpeg: true }).toFile(jpg);
      let webp = true;
      try {
        await base.clone().webp({ quality: 72 }).toFile(join(SORTIE, 'previews', `${id}.webp`));
      } catch (e) {
        webp = false;
        console.warn(`  ! miniature ${id} : pas de WebP (${e.message ?? e})`);
      }
      apercus.set(id, { webp });
    } catch (e) {
      console.warn(`  ! miniature ${id} : ${e.message ?? e}, repli sur l'icône`);
    }
  })
);
console.log(
  `Miniatures : ${apercus.size}/${imageParApp.size}, dont ${[...apercus.values()].filter(a => a.webp).length} en WebP`
);

// ---------------------------------------------------------------------------
// index.html : voir scripts/accueil.mjs
// ---------------------------------------------------------------------------

const {
  html,
  description,
  featuredId,
  nbSections,
  nbGuides,
} = rendreAccueil({
  origine: FAMILY_ORIGIN,
  compte: COMPTE,
  soi: SOI,
  theme: THEME,
  sponsorUrl: SPONSOR_URL,
  imageEmpreinte: IMAGE_EMPREINTE,
  apps: FAMILY_APPS,
  categories: CATEGORIES,
  libellesFr,
  libellesEn,
  descriptionsEn: DESCRIPTIONS_EN,
  pagesParApp,
  apercus,
  iconeParApp,
  enPanne,
  pageDeBureau,
  coulisses,
  pagesParSite,
  raccourci: Boolean(command),
});

// Manifest + service worker : sans eux, Chrome Android n'offre pas
// « Installer l'application ». Le worker ne fait que du réseau d'abord, et
// SEULEMENT pour le hub : sa portée « / » couvre aussi les apps, auxquelles il
// ne doit pas toucher (voir scripts/hub-sw.mjs). Le MANIFESTE, lui, ne couvre
// que la page du hub : une portée « / » rendait les vingt apps impossibles à
// installer dès que le hub l'était (voir scripts/manifeste-hub.mjs).
// En aperçu local, le manifeste entier (id compris) désigne l'aperçu.
const manifeste = manifesteHub({
  origine: APERCU ?? FAMILY_ORIGIN,
  compte: COMPTE,
  description,
  theme: THEME,
});

/**
 * Les fichiers de premier niveau que sert le hub : les SEULS, avec
 * `/previews/…`, auxquels son worker réponde. Tout ce qui est sous `/<app>/`
 * appartient à une app, qui a son propre worker. `robots.txt`, les plans de
 * site, `seo-state.json` et les fichiers de vérification restent hors liste :
 * ils servent aux robots, pas aux pages.
 */
const CHEMINS_DU_HUB = [
  '/',
  '/index.html',
  '/offline.html',
  '/404.html',
  '/a-propos.html',
  ...bureau.map(b => b.chemin),
  '/manifest.webmanifest',
  '/og-image.jpg',
  '/favicon.ico',
  '/favicon.svg',
  '/favicon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
  ...(command ? ['/command.js', '/hub-command.js'] : []),
];

/**
 * UN SEUL DE « / » ET « /index.html » EST PRÉCACHÉ : la même page, téléchargée
 * deux fois à l'installation du worker. On garde « / », l'adresse canonique et
 * celle que charge un visiteur ; « /index.html », adresse de lancement de
 * l'app installée, est rangé sous la même clé par le worker (voir `cle` dans
 * scripts/hub-sw.mjs) : lancée hors ligne, l'app retrouve la page.
 */
/** En aperçu local, le hub est servi sous un chemin : ses fichiers le suivent. */
const SOUS_CHEMIN = APERCU ? new URL(APERCU).pathname.replace(/\/+$/, '') : '';
const sousChemin = chemins => chemins.map(c => `${SOUS_CHEMIN}${c}`);

const sw = serviceWorkerHub({
  compte: COMPTE,
  chemins: sousChemin(CHEMINS_DU_HUB),
  essentiels: sousChemin([
    '/',
    '/offline.html',
    '/manifest.webmanifest',
    '/icon-192.png',
    '/icon-512.png',
  ]),
  // La miniature du projecteur, si elle existe ; sans sharp, pas de WebP.
  extras: sousChemin(
    featuredId && apercus.has(featuredId)
      ? [
          `/previews/${featuredId}.jpg`,
          ...(apercus.get(featuredId).webp ? [`/previews/${featuredId}.webp`] : []),
        ]
      : []
  ),
  horsLigne: `${SOUS_CHEMIN}/offline.html`,
});

const offlineHtml = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Hors ligne — GuiiuG</title>
    <meta name="theme-color" content="${THEME}" />
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 1.5rem;
        font-family: "Segoe UI", system-ui, sans-serif;
        background: #0f1220;
        color: #e8e9f2;
        text-align: center;
      }
      h1 { font-size: 1.5rem; margin: 0 0 0.5rem; }
      p { margin: 0; color: #a8abc2; max-width: 28rem; }
      a { color: #9fb2ff; }
    </style>
  </head>
  <body>
    <div>
      <h1>Hors ligne</h1>
      <p>Le catalogue GuiiuG n'est pas joignable pour le moment. Réouvre la page quand le réseau revient.</p>
      <p style="margin-top:1rem"><a href="${FAMILY_ORIGIN}/">Réessayer</a></p>
    </div>
  </body>
</html>
`;

// ---------------------------------------------------------------------------
// Pages statiques du hub — sans script, voir scripts/pages-hub.mjs
// ---------------------------------------------------------------------------

const commun = {
  origine: FAMILY_ORIGIN,
  compte: COMPTE,
  imagePartage: {
    url: `${FAMILY_ORIGIN}/og-image.jpg?v=${IMAGE_EMPREINTE}`,
    alt: `Les applications de ${COMPTE} : leurs icônes, en mosaïque`,
  },
};
/** Où mène une app : son site, ou sa page du hub pour une app de bureau. */
const adresseDe = app =>
  surOrigine(app.appUrl)
    ? app.appUrl
    : pageDeBureau.has(app.id)
      ? `${FAMILY_ORIGIN}${pageDeBureau.get(app.id).chemin}`
      : app.appUrl;

const aProposHtml = pageAPropos({
  ...commun,
  apps: FAMILY_APPS.map(a => ({ ...a, adresse: adresseDe(a) })),
  avecIssues,
  sponsorUrl: SPONSOR_URL,
});
// Une app née au catalogue après le relevé : la page la dit « pas encore
// relevée » plutôt que de lui prêter des pratiques ; la CI le signale.
const aRelever = appsNonRelevees(FAMILY_APPS);
if (aRelever.length) {
  console.log(
    `::warning::À propos : ${aRelever.map(a => a.id).join(', ')} absente(s) du relevé des pratiques de données (scripts/page-a-propos.mjs, RELEVE).`
  );
}
const pagesBureauHtml = bureau.map(b => ({
  chemin: b.chemin,
  texte: PAGES_BUREAU[b.app.id]({ ...commun, app: b.app, version: b.version, avecIssues }),
}));
const html404 = page404({
  ...commun,
  apps: FAMILY_APPS.map(a => ({ nom: a.name, url: adresseDe(a) })),
});

// ---------------------------------------------------------------------------
// Dates de modification — l'empreinte du contenu, pas le jour du build
// ---------------------------------------------------------------------------

/**
 * Les pages du plan de site du hub, encore porteuses de leurs JETONS de date :
 * leur empreinte ne dépend donc que de leur contenu. `404.html` n'en est pas :
 * elle porte `noindex`, et un plan de site ne liste que des pages à indexer.
 */
const pagesDuPlan = [
  { chemin: '/', fichier: 'index.html', texte: html },
  { chemin: '/a-propos.html', fichier: 'a-propos.html', texte: aProposHtml },
  ...pagesBureauHtml.map(p => ({ chemin: p.chemin, fichier: p.chemin.slice(1), texte: p.texte })),
];
const aujourdhui = new Date().toISOString().slice(0, 10);
const { etat: etatPrecedent, statut: statutEtat } = await lireEtatEnLigne(
  `${FAMILY_ORIGIN}/seo-state.json`
);
if (statutEtat === 'injoignable') {
  console.log(
    "::warning::seo-state.json injoignable : les pages du hub sont datées d'aujourd'hui."
  );
}
const { etat: etatSeo, modifiees } = datesDeModification(
  etatPrecedent,
  pagesDuPlan.map(p => ({ url: `${FAMILY_ORIGIN}${p.chemin}`, empreinte: empreinte(p.texte) })),
  aujourdhui
);
const lastmodDe = chemin => etatSeo.pages[`${FAMILY_ORIGIN}${chemin}`].lastmod;
console.log(
  `seo-state.json ${statutEtat === 'lu' ? 'relu en ligne' : statutEtat} ; ` +
    (modifiees.length
      ? `${modifiees.length} page(s) du hub modifiée(s) : ${modifiees.join(', ')}`
      : 'aucune page du hub modifiée')
);

const planHub = planDeSite(
  pagesDuPlan.map(p => ({ loc: `${FAMILY_ORIGIN}${p.chemin}`, lastmod: lastmodDe(p.chemin) }))
);
const plansDuParc = sites
  .filter(s => s.plan)
  .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
const indexPlans = indexDePlans([
  {
    loc: `${FAMILY_ORIGIN}/sitemap-hub.xml`,
    lastmod: dernierLastmod(pagesDuPlan.map(p => ({ lastmod: lastmodDe(p.chemin) }))),
  },
  ...plansDuParc.map(s => ({
    loc: `${s.base}sitemap.xml`,
    lastmod: lastmodParPlan.get(s.base) ?? null,
  })),
]);

/** Les pages, datées : le jeton cède la place au jour de leur dernier changement. */
const pagesDatees = pagesDuPlan.map(p => ({ ...p, texte: dater(p.texte, lastmodDe(p.chemin)) }));

/**
 * La politique de sécurité de l'accueil, posée sur la page DATÉE : ses
 * empreintes portent sur les scripts tels qu'ils sont publiés, date comprise
 * (voir scripts/csp.mjs). Le module Ctrl+K n'y figure que s'il est publié.
 */
for (const p of pagesDatees) {
  if (p.fichier !== 'index.html') continue;
  const hub = APERCU ?? FAMILY_ORIGIN;
  p.texte = poserPolitique(versApercu(p.texte, { origine: FAMILY_ORIGIN, apercu: APERCU }), {
    origine: FAMILY_ORIGIN,
    apercu: APERCU,
    scripts: command ? [`${hub}/hub-command.js`, `${hub}/command.js`] : [],
  });
}

for (const { fichier, texte } of [...pagesDatees, { fichier: '404.html', texte: html404 }]) {
  if (Object.values(JETONS).some(j => texte.includes(j))) {
    throw new Error(`${fichier} : un jeton de date n'a pas été remplacé`);
  }
  if (texte.includes(JETON_CSP)) {
    throw new Error(`${fichier} : la politique de sécurité n'a pas été posée`);
  }
}

for (const { fichier, texte } of pagesDatees) writeFileSync(join(SORTIE, fichier), texte, 'utf8');
// GitHub Pages sert `/404.html` pour toute URL inconnue sous la racine, avec le
// statut 404 ; `noindex` en plus, par principe.
writeFileSync(join(SORTIE, '404.html'), html404, 'utf8');
writeFileSync(join(SORTIE, 'offline.html'), offlineHtml, 'utf8');
writeFileSync(join(SORTIE, 'robots.txt'), robots, 'utf8');
writeFileSync(
  join(SORTIE, 'manifest.webmanifest'),
  JSON.stringify(manifeste, null, 2) + '\n',
  'utf8'
);
writeFileSync(join(SORTIE, 'sw.js'), sw, 'utf8');
// `/sitemap.xml` est l'INDEX ; les URL du hub sont dans `/sitemap-hub.xml`.
writeFileSync(join(SORTIE, 'sitemap.xml'), indexPlans, 'utf8');
writeFileSync(join(SORTIE, 'sitemap-hub.xml'), planHub, 'utf8');
// Relu en ligne à la construction suivante : c'est lui qui garde les dates.
writeFileSync(join(SORTIE, 'seo-state.json'), JSON.stringify(etatSeo, null, 2) + '\n', 'utf8');
// Le contenu exact que Google attend, au caractère près.
writeFileSync(
  join(SORTIE, VERIFICATION_GOOGLE),
  `google-site-verification: ${VERIFICATION_GOOGLE}`,
  'utf8'
);
// La forme exacte du fichier que propose Bing Webmaster Tools.
writeFileSync(
  join(SORTIE, 'BingSiteAuth.xml'),
  `<?xml version="1.0"?>\n<users>\n\t<user>${VERIFICATION_BING}</user>\n</users>\n`,
  'utf8'
);
// La clé IndexNow, servie à la racine : elle couvre toute l'origine (voir
// scripts/indexnow-cle.mjs). Le fichier ne contient QUE la clé.
writeFileSync(join(SORTIE, `${INDEXNOW_CLE}.txt`), INDEXNOW_CLE, 'utf8');
copyFileSync(IMAGE_PARTAGE, join(SORTIE, 'og-image.jpg'));
// Favicon : sans lui, les robots demandent `/favicon.ico` et reçoivent un 404
// — le premier contact de Bing avec l'origine, souvent, avant même l'accueil.
copyFileSync(
  new URL('../static/favicon.ico', import.meta.url),
  join(SORTIE, 'favicon.ico')
);
copyFileSync(
  new URL('../static/favicon.svg', import.meta.url),
  join(SORTIE, 'favicon.svg')
);
copyFileSync(
  new URL('../static/favicon.png', import.meta.url),
  join(SORTIE, 'favicon.png')
);
copyFileSync(
  new URL('../static/icon-192.png', import.meta.url),
  join(SORTIE, 'icon-192.png')
);
copyFileSync(
  new URL('../static/icon-512.png', import.meta.url),
  join(SORTIE, 'icon-512.png')
);
copyFileSync(
  new URL('../static/apple-touch-icon.png', import.meta.url),
  join(SORTIE, 'apple-touch-icon.png')
);

// Recherche Ctrl+K : module vanilla du socle (+ compagnon hub), s'il est publié.
if (command) {
  writeFileSync(join(SORTIE, 'command.js'), command, 'utf8');
  copyFileSync(join(ICI, 'hub-command.js'), join(SORTIE, 'hub-command.js'));
}

// CE QUE LE JOB « PUBLIER » SIGNALERA À INDEXNOW : les pages du hub dont le
// contenu a changé à cette construction, et elles seules (scripts/indexnow.mjs).
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `urls-modifiees=${JSON.stringify(modifiees)}\n`);
}

console.log(
  `\nÉcrit dans ${SORTIE}/ : index.html (${FAMILY_APPS.length} applications en ` +
    `${nbSections} catégories, ${coulisses.length} en coulisses, ${nbGuides} guides), ` +
    `${pagesDuPlan
      .slice(1)
      .map(p => p.fichier)
      .join(', ')}, 404.html, robots.txt, sitemap.xml (index de ` +
    `${plansDuParc.length + 1} plans), sitemap-hub.xml (${pagesDuPlan.length} URL), seo-state.json, ` +
    `${VERIFICATION_GOOGLE}, BingSiteAuth.xml, clé IndexNow, og-image.jpg, ` +
    `previews/ (${apercus.size}), offline.html, manifest.webmanifest, sw.js, icônes PWA`
);
