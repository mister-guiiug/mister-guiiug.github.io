/**
 * Construit le site de la racine — `index.html`, `robots.txt`, `sitemap.xml`,
 * et le fichier de vérification de Search Console —
 * dans un dossier de sortie (`_site` par défaut). Rien n'est commité : le
 * workflow `pages.yml` l'exécute au moment de PUBLIER, chaque nuit et à chaque
 * fusion.
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
 * L'API GITHUB NE SERT PLUS QU'À DEUX CHOSES, que le catalogue ne sait pas :
 *   1. le `robots.txt`, qui doit déclarer le plan de site de TOUS les sites
 *      publiés sous l'origine — outils compris ;
 *   2. la section « Dans les coulisses » : les sites publiés qui ne sont PAS des
 *      applications du catalogue (le showroom du socle, le squelette, le tableau
 *      de bord). Calculée, jamais écrite à la main : un nouveau site
 *      d'infrastructure y apparaît de lui-même.
 *
 * ÉCHOUER EST SÛR. Si une application du catalogue ne répond pas, la
 * construction échoue — et Pages continue de servir la version précédente. On
 * ne publie jamais une page qui promettrait un 404. Chaque sonde est retentée
 * avant de conclure.
 *
 * Usage : node scripts/build-site.mjs [dossier-de-sortie]
 * Un `GITHUB_TOKEN` (ou `GH_TOKEN`) dans l'environnement relève la limite de
 * l'API ; sans lui, les deux requêtes passent quand même.
 */
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { INDEXNOW_CLE } from './indexnow-cle.mjs';

const SORTIE = process.argv[2] ?? '_site';
const COMPTE = 'mister-guiiug';
const SOCLE = 'dev-pwa-config';
const SOI = `${COMPTE}.github.io`;
/** Handle Buy Me a Coffee de la famille — même valeur que `FUNDING.yml`. */
const SPONSOR_URL = 'https://buymeacoffee.com/mister.guiiug';
const THEME = '#2f4bd1';
const JETON = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? '';

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
// Accès réseau
// ---------------------------------------------------------------------------

/** Requête à l'API GitHub. Le jeton ne quitte jamais l'en-tête. */
async function api(chemin) {
  const r = await fetch(`https://api.github.com/${chemin}`, {
    headers: {
      accept: 'application/vnd.github+json',
      ...(JETON ? { authorization: `Bearer ${JETON}` } : {}),
    },
  });
  if (!r.ok) throw new Error(`API GitHub ${chemin} → HTTP ${r.status}`);
  return r.json();
}

/** Code HTTP d'une URL, retenté : une sonde isolée qui échoue ne prouve rien. */
async function statut(url, essais = 3) {
  for (let i = 1; i <= essais; i += 1) {
    try {
      const r = await fetch(url, { redirect: 'follow' });
      if (r.status === 200 || i === essais) return r.status;
    } catch {
      if (i === essais) return 0;
    }
    await new Promise(ok => setTimeout(ok, 1500 * i));
  }
  return 0;
}

const ENTITES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" };
const decode = t => t.replace(/&(amp|lt|gt|quot|#39);/g, (_, e) => ENTITES[e]);

/**
 * Les pages de contenu d'une application : les URL de son plan de site autres
 * que l'accueil, avec le titre (`<h1>`) de chacune. Depuis le socle 6.17.0,
 * chaque `content/pages/<slug>.md` d'une app devient `<slug>.html` et entre à
 * son plan de site. Les lister ICI donne à chacune un lien depuis la seule page
 * du parc déjà indexée. Une page qui ne répond pas est simplement omise.
 */
async function pagesDe(appUrl) {
  try {
    const r = await fetch(`${appUrl}sitemap.xml`);
    if (!r.ok) return [];
    const locs = [...(await r.text()).matchAll(/<loc>([^<]+)<\/loc>/g)]
      .map(m => decode(m[1]))
      .filter(u => u !== appUrl && u.startsWith(appUrl));
    const pages = [];
    for (const url of locs) {
      const p = await fetch(url);
      if (!p.ok) continue;
      const titre = /<h1[^>]*>([^<]+)<\/h1>/i.exec(await p.text())?.[1]?.trim();
      if (titre) pages.push({ url, titre: decode(titre) });
    }
    return pages;
  } catch {
    return [];
  }
}

/** Titre annoncé par un site, ou `null`. */
async function titreDe(url) {
  try {
    const html = await (await fetch(url)).text();
    const m = html.match(/<title>([^<]*)<\/title>/i);
    return m?.[1].trim() || null;
  } catch {
    return null;
  }
}

/**
 * Importe un module AUTONOME du socle à une étiquette donnée. Le texte passe par
 * une URL `data:` : aucun fichier temporaire, et aucun risque qu'un import
 * relatif aille chercher ailleurs — ces deux modules n'en ont pas.
 */
async function moduleDuSocle(etiquette, chemin) {
  const url = `https://raw.githubusercontent.com/${COMPTE}/${SOCLE}/${etiquette}/${chemin}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${chemin} @ ${etiquette} → HTTP ${r.status}`);
  const texte = await r.text();
  return import(
    `data:text/javascript;base64,${Buffer.from(texte).toString('base64')}`
  );
}

const echappe = texte =>
  String(texte ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

const { tag_name: version } = await api(
  `repos/${COMPTE}/${SOCLE}/releases/latest`
);
console.log(`Catalogue du socle ${version}…`);

const catalogue = await moduleDuSocle(version, 'apps-catalog.js');
const libellesFr = (await moduleDuSocle(version, 'react/labels-fr.js')).default;
const libellesEn = (await moduleDuSocle(version, 'react/labels-en.js')).default;
const { FAMILY_APPS, CATEGORIES, FAMILY_ORIGIN } = catalogue;

/**
 * Descriptions EN du catalogue — le socle ne les porte qu'en français
 * (langue de référence). Le hub les double ici pour le bascule FR/EN.
 */
const DESC_EN = {
  'miss-carbook': 'Collaborative vehicle comparison, in real time.',
  'miss-contraction': 'Contraction timer and maternity alerts.',
  'miss-genius': 'School grade average simulator (marks, scenarios, goals).',
  'miss-uwh': 'Season accounting for an underwater hockey club.',
  'mister-cim10': 'ICD-10 coding helper in the browser (TXT/CSV/PDF export).',
  'mister-footcoach':
    'Football team management: line-ups, stats, training sessions.',
  'mister-puzzle': 'Collaborative real-time jigsaw progress tracking.',
  'miss-ticket-pwa': 'PWA remote for the Miss Ticket desktop app.',
  'mister-doc':
    'Synced medical on-call roster: monthly view, weekend and hour counters.',
  'miss-lookhouse':
    'Property watch: multi-source, de-dupe, price history, explainable scoring.',
  'miss-badminton': 'Badminton score tracking and statistics.',
  'miss-dice': 'Six-sided dice roller, fully offline, installable.',
  'miss-supaboss':
    'Multi-account Supabase Free control: pause/restore, quotas, demos.',
  'miss-supatool':
    'Migrate a Supabase project to another: schema, data and files.',
  'mister-molkky': 'Score counter for Mölkky games (multi-device).',
  'mister-qowa':
    'Live interactive quiz: the host drives, players answer.',
  'mister-family-map':
    'Family outing ideas: collaborative map, calendar and field notes.',
  'mister-miss-koh':
    'Adventure-season tracker: castaways, episodes, challenges, councils and votes. Unofficial.',
  'mister-quota': 'AI service usage tracker (desktop app).',
  'mister-settle':
    'Split expenses with friends: who paid, who owes what, suggested reimbursements — no payments.',
};

console.log('Sites publiés…');
const depots = (
  await api(`users/${COMPTE}/repos?per_page=100&type=owner`)
).filter(d => !d.private && !d.archived && d.has_pages && d.name !== SOI);

// ---------------------------------------------------------------------------
// Sondes
// ---------------------------------------------------------------------------

const surOrigine = url => url.startsWith(`${FAMILY_ORIGIN}/`);

console.log(`${FAMILY_APPS.length} applications au catalogue :`);
const enPanne = [];
/** id de l'app → ses pages de contenu. */
const pagesParApp = new Map();
/**
 * id de l'app → URL de son image de partage (1200×630), si elle répond.
 * Même fichier que `og:image` de l'app : on le sonde, on ne le recopie pas —
 * une seule source, celle que chaque application publie déjà.
 */
const imageParApp = new Map();
for (const app of FAMILY_APPS) {
  // Une application de bureau pointe vers son dépôt : rien à sonder sur Pages.
  if (!surOrigine(app.appUrl)) {
    console.log(`  · ${app.id.padEnd(20)} hors origine (${app.platform})`);
    continue;
  }
  const code = await statut(app.appUrl);
  const pages = code === 200 ? await pagesDe(app.appUrl) : [];
  pagesParApp.set(app.id, pages);
  const imageUrl = `${app.appUrl}og-image.jpg`;
  const aImage = code === 200 && (await statut(imageUrl)) === 200;
  if (aImage) imageParApp.set(app.id, imageUrl);
  console.log(
    `  ${code === 200 ? '✓' : '✗'} ${app.id.padEnd(20)} ${code}` +
      (pages.length ? ` · ${pages.length} page(s) de contenu` : '') +
      (aImage ? ' · image' : '')
  );
  if (code !== 200) enPanne.push(`${app.id} (${code})`);
}
if (enPanne.length) {
  console.error(
    `\nÉCHEC — des applications du catalogue ne répondent pas : ${enPanne.join(', ')}.` +
      `\nRien n'est publié ; Pages continue de servir la version précédente.`
  );
  process.exit(1);
}

const idsCatalogue = new Set(FAMILY_APPS.map(a => a.id));
const sites = [];
for (const d of depots) {
  const base = `${FAMILY_ORIGIN}/${d.name}/`;
  const plan = (await statut(`${base}sitemap.xml`)) === 200;
  const estApp = idsCatalogue.has(d.name);
  const titre = estApp ? null : ((await titreDe(base)) ?? d.name);
  sites.push({ nom: d.name, base, plan, estApp, titre, desc: d.description });
}
const coulisses = sites
  .filter(s => !s.estApp)
  .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

// ---------------------------------------------------------------------------
// robots.txt — lu SEULEMENT à la racine d'une origine
// ---------------------------------------------------------------------------

const robots = `# ${FAMILY_ORIGIN}/robots.txt
#
# Un robots.txt n'est lu QU'À LA RACINE d'une origine. Celui d'un sous-chemin
# — /miss-dice/robots.txt, par exemple — est ignoré des robots, et le plan de
# site qu'il déclare avec lui. Ce fichier rassemble donc, au seul endroit qui
# soit lu, les plans de site de tous les sites servis sous cette origine.
#
# Engendré à la publication par scripts/build-site.mjs : chaque plan de site
# ci-dessous répondait 200 à ce moment-là.

User-agent: *
Allow: /

User-agent: bingbot
Allow: /

Sitemap: ${FAMILY_ORIGIN}/sitemap.xml
${sites
  .filter(s => s.plan)
  .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
  .map(s => `Sitemap: ${s.base}sitemap.xml`)
  .join('\n')}
`;

// `lastmod` : le seul champ du plan de site que Google lise vraiment
// (`changefreq` et `priority` sont ignorés). La page change quand le catalogue
// change, et le catalogue n'arrive ici qu'à la publication : le jour de la
// construction est donc la bonne date.
const aujourdhui = new Date().toISOString().slice(0, 10);
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${FAMILY_ORIGIN}/</loc>
    <lastmod>${aujourdhui}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`;

// ---------------------------------------------------------------------------
// Données structurées — le site, et la liste de ses applications
// ---------------------------------------------------------------------------

/**
 * Un `WebSite` et un `ItemList` : ce que la page EST (l'accueil d'une famille
 * d'applications), et ce qu'elle liste. Chaque application porte déjà son
 * propre `WebApplication` (socle, `pwaSeoPlugin`) ; ici on ne fait que les
 * nommer et les relier, par leur URL.
 *
 * `<` est échappé : une description contenant `</script>` fermerait le bloc.
 */
const donneesStructurees = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${FAMILY_ORIGIN}/#site`,
      name: `Les applications de ${COMPTE}`,
      url: `${FAMILY_ORIGIN}/`,
      inLanguage: 'fr',
      publisher: { '@id': `${FAMILY_ORIGIN}/#org` },
      potentialAction: {
        '@type': 'ViewAction',
        target: `${FAMILY_ORIGIN}/`,
        name: `Les applications de ${COMPTE}`,
      },
    },
    {
      '@type': 'Organization',
      '@id': `${FAMILY_ORIGIN}/#org`,
      name: COMPTE,
      url: `${FAMILY_ORIGIN}/`,
      sameAs: [`https://github.com/${COMPTE}`],
    },
    {
      '@type': 'ItemList',
      name: `Applications web de ${COMPTE}`,
      itemListElement: FAMILY_APPS.filter(a => surOrigine(a.appUrl)).map(
        (a, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          url: a.appUrl,
          name: a.name,
        })
      ),
    },
  ],
};
const jsonLd = JSON.stringify(donneesStructurees).replace(/</g, '\\u003c');

// ---------------------------------------------------------------------------
// index.html — groupé par catégorie, dans l'ordre du catalogue
// ---------------------------------------------------------------------------

const maturite = m =>
  m === 'stable'
    ? ''
    : ` <span class="badge badge-${echappe(m)}" data-i18n-maturity="${echappe(m)}">${echappe(libellesFr.maturity?.[m] ?? m)}</span>`;

/**
 * Les liens vers les apps s'ouvrent hors du shell du hub une fois installé :
 * le hub et les apps partagent l'origine `github.io`, donc un `scope: "/"`
 * avalerait sinon toute navigation. `target=_blank` renvoie Chrome / le
 * navigateur, où chaque app reste installable séparément.
 */
const lienHorsShell = (url, texte, attrs = '') =>
  `<a href="${echappe(url)}" target="_blank" rel="noopener noreferrer"${attrs}>${texte}</a>`;

const carteApp = app => {
  const bureau = app.platform === 'desktop';
  const pages = pagesParApp.get(app.id) ?? [];
  const image = imageParApp.get(app.id);
  const descEn = DESC_EN[app.id] ?? app.description;
  const premierePage = pages[0];
  const guide = premierePage
    ? `
            <p class="guide">${lienHorsShell(premierePage.url, '<span data-i18n="guide">Guide</span>', ' class="guide-lien"')}</p>`
    : '';
  const recherche = [
    app.name,
    app.description,
    descEn,
    libellesFr.categories?.[app.category] ?? '',
    libellesEn.categories?.[app.category] ?? '',
  ]
    .join(' ')
    .toLowerCase();
  const visuel = image
    ? `
            <span class="visuel">
              <img
                src="${echappe(image)}"
                alt=""
                width="1200"
                height="630"
                sizes="(max-width: 40rem) 100vw, 320px"
                loading="lazy"
                decoding="async"
              />
            </span>`
    : '';
  const badgeBureau = bureau
    ? ` <span class="badge" data-i18n="badgeDesktop">${echappe('Application de bureau')}</span>`
    : '';
  return `          <li class="carte" data-search="${echappe(recherche)}">
            ${lienHorsShell(app.appUrl, '', ` class="carte-hit" aria-label="${echappe(app.name)}"`)}
${visuel}
            <div class="corps">
              <h3><span class="nom">${echappe(app.name)}</span>${maturite(app.maturity)}${badgeBureau}</h3>
              <p data-fr="${echappe(app.description)}" data-en="${echappe(descEn)}">${echappe(app.description)}</p>${guide}
            </div>
          </li>`;
};

const catsAvecApps = CATEGORIES.filter(cat =>
  FAMILY_APPS.some(a => a.category === cat)
);

const navCats = catsAvecApps
  .map(
    cat =>
      `          <a href="#cat-${cat}" data-i18n-cat="${echappe(cat)}">${echappe(libellesFr.categories?.[cat] ?? cat)}</a>`
  )
  .join('\n');

const sections = CATEGORIES.map(cat => {
  const apps = FAMILY_APPS.filter(a => a.category === cat);
  if (!apps.length) return null;
  return `      <section aria-labelledby="cat-${cat}">
        <h2 id="cat-${cat}" data-i18n-cat="${echappe(cat)}">${echappe(libellesFr.categories?.[cat] ?? cat)}</h2>
        <ul>
${apps.map(carteApp).join('\n')}
        </ul>
      </section>`;
}).filter(Boolean);

const carteCoulisse = s => `          <li class="carte">
            ${lienHorsShell(`/${s.nom}/`, '', ` class="carte-hit" aria-label="${echappe(s.titre)}"`)}
            <div class="corps">
              <h3><span class="nom">${echappe(s.titre)}</span></h3>
              <p>${echappe(s.desc)}</p>
            </div>
          </li>`;

const description =
  `Les applications web installables de ${COMPTE} : ` +
  FAMILY_APPS.slice(0, 6)
    .map(a => a.name)
    .join(', ') +
  ', et les autres.';

const descriptionEn =
  `Installable web apps by ${COMPTE}: ` +
  FAMILY_APPS.slice(0, 6)
    .map(a => a.name)
    .join(', ') +
  ', and more.';

// Bing SEO/GEO : titre ≥ 50 car. Le H1 visible reste le nom de la famille.
const titrePage = `Les applications de ${COMPTE} - PWA web installables hors magasin`;
const titrePageEn = `${COMPTE}'s apps - installable PWAs, no app store`;

const i18nJson = JSON.stringify({
  fr: {
    title: titrePage,
    description,
    h1: `Les applications de ${COMPTE}`,
    chapeau:
      "Une famille d'applications web installables. Chacune s'installe depuis le navigateur, sans magasin d'applications, et la plupart continuent de fonctionner hors ligne une fois ouvertes. Ce catalogue aussi s'installe : menu ⋮ de Chrome → « Installer l'application ».",
    chapeauPwa:
      "Une famille d'applications web installables. Chacune s'ouvre hors de ce catalogue, sans magasin, et la plupart continuent de fonctionner hors ligne.",
    confiance:
      'Open source, hébergées en Europe, sans magasin — et sans compte obligatoire pour démarrer.',
    coulisses: 'Dans les coulisses',
    source: 'Code source sur',
    sponsorBefore: 'Ces applications sont gratuites et open source.',
    sponsorLink: "M'offrir un café",
    badgeDesktop: 'Application de bureau',
    langFr: 'Français',
    langEn: 'English',
    themeLight: 'Clair',
    themeDark: 'Sombre',
    themeSystem: 'Système',
    prefs: 'Langue et thème',
    filtre: 'Filtrer les applications',
    filtrePh: 'Filtrer les applications…',
    nav: 'Catégories',
    guide: 'Guide',
    categories: libellesFr.categories,
    maturity: libellesFr.maturity,
  },
  en: {
    title: titrePageEn,
    description: descriptionEn,
    h1: `Apps by ${COMPTE}`,
    chapeau:
      'A family of installable web apps. Each one installs from the browser, with no app store, and most keep working offline once opened. This catalogue installs too: Chrome ⋮ menu → “Install app”.',
    chapeauPwa:
      'A family of installable web apps. Each one opens outside this catalogue, with no app store, and most keep working offline.',
    confiance:
      'Open source, hosted in Europe, no app store — and no account required to get started.',
    coulisses: 'Behind the scenes',
    source: 'Source code on',
    sponsorBefore: 'These apps are free and open source.',
    sponsorLink: 'Buy me a coffee',
    badgeDesktop: 'Desktop app',
    langFr: 'Français',
    langEn: 'English',
    themeLight: 'Light',
    themeDark: 'Dark',
    themeSystem: 'System',
    prefs: 'Language and theme',
    filtre: 'Filter apps',
    filtrePh: 'Filter apps…',
    nav: 'Categories',
    guide: 'Guide (FR)',
    categories: libellesEn.categories,
    maturity: libellesEn.maturity,
  },
}).replace(/</g, '\\u003c');

const html = `<!doctype html>
<html lang="fr" data-theme="system">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>${titrePage}</title>
    <meta name="description" content="${echappe(description)}" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="${FAMILY_ORIGIN}/" />
    <link rel="manifest" href="${FAMILY_ORIGIN}/manifest.webmanifest" />
    <meta name="theme-color" content="${THEME}" id="theme-color" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-title" content="GuiiuG" />
    <link rel="apple-touch-icon" href="${FAMILY_ORIGIN}/apple-touch-icon.png" />
    <link rel="icon" href="${FAMILY_ORIGIN}/favicon.svg" type="image/svg+xml" />
    <link rel="icon" href="${FAMILY_ORIGIN}/favicon.ico" sizes="any" />
    <meta property="og:type" content="website" />

    <meta property="og:title" content="${titrePage}" />
    <meta property="og:description" content="${echappe(description)}" />
    <meta property="og:url" content="${FAMILY_ORIGIN}/" />
    <meta property="og:image" content="${FAMILY_ORIGIN}/og-image.jpg?v=${IMAGE_EMPREINTE}" />
    <meta property="og:image:type" content="image/jpeg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="Les applications de ${COMPTE} : leurs icônes, en mosaïque" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${titrePage}" />
    <meta name="twitter:image" content="${FAMILY_ORIGIN}/og-image.jpg?v=${IMAGE_EMPREINTE}" />
    <script type="application/ld+json">${jsonLd}</script>
    <script>
      (function () {
        try {
          var t = localStorage.getItem('hub-theme') || 'system';
          var l = localStorage.getItem('hub-lang') || 'fr';
          document.documentElement.dataset.theme = t;
          document.documentElement.lang = l === 'en' ? 'en' : 'fr';
        } catch (e) {}
        if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
          document.documentElement.dataset.pwa = '1';
        }
      })();
    </script>
    <style>
      :root, html[data-theme='light'] {
        color-scheme: light;
        --fond: #ffffff;
        --texte: #1a1b26;
        --doux: #55586b;
        --bord: #d9dbe6;
        --lien: #2f4bd1;
        --barre: #f4f5fa;
        --alpha-fg: #8a4b08;
        --alpha-bg: #fff4e5;
        --alpha-bd: #e0b070;
        --beta-fg: #0a5c4a;
        --beta-bg: #e8f7f2;
        --beta-bd: #7bc4b0;
      }
      html[data-theme='dark'] {
        color-scheme: dark;
        --fond: #0f1220;
        --texte: #e8e9f2;
        --doux: #a8abc2;
        --bord: #2a2e45;
        --lien: #9fb2ff;
        --barre: #181c2e;
        --alpha-fg: #ffd9a0;
        --alpha-bg: #3a2a12;
        --alpha-bd: #8a6230;
        --beta-fg: #a8e8d4;
        --beta-bg: #12352c;
        --beta-bd: #3d7a68;
      }
      @media (prefers-color-scheme: dark) {
        html[data-theme='system'] {
          color-scheme: dark;
          --fond: #0f1220;
          --texte: #e8e9f2;
          --doux: #a8abc2;
          --bord: #2a2e45;
          --lien: #9fb2ff;
          --barre: #181c2e;
          --alpha-fg: #ffd9a0;
          --alpha-bg: #3a2a12;
          --alpha-bd: #8a6230;
          --beta-fg: #a8e8d4;
          --beta-bg: #12352c;
          --beta-bd: #3d7a68;
        }
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0 auto;
        max-width: 60rem;
        padding:
          max(1.5rem, env(safe-area-inset-top, 0px))
          max(1.25rem, env(safe-area-inset-right, 0px))
          max(4rem, env(safe-area-inset-bottom, 0px))
          max(1.25rem, env(safe-area-inset-left, 0px));
        background: var(--fond);
        color: var(--texte);
        font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        line-height: 1.6;
      }
      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
        white-space: nowrap;
        border: 0;
      }
      .topbar {
        position: sticky;
        top: 0;
        z-index: 20;
        display: flex;
        justify-content: flex-end;
        margin: 0 0 1.25rem;
        padding: 0.45rem 0;
        background: color-mix(in srgb, var(--fond) 86%, transparent);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
      }
      .prefs {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        justify-content: flex-end;
      }
      .prefs fieldset {
        display: inline-flex;
        gap: 0.15rem;
        margin: 0;
        padding: 0.2rem;
        border: 1px solid var(--bord);
        border-radius: 999px;
        background: var(--barre);
      }
      .prefs legend {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip: rect(0 0 0 0);
      }
      .prefs button {
        appearance: none;
        border: 0;
        border-radius: 999px;
        padding: 0.45rem;
        min-width: 2.25rem;
        min-height: 2.25rem;
        background: transparent;
        color: var(--doux);
        font: inherit;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .prefs button .ico {
        display: inline-flex;
        width: 1.15rem;
        height: 1.15rem;
        flex-shrink: 0;
      }
      .prefs button .ico svg {
        width: 100%;
        height: 100%;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.75;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      .prefs button .drapeau {
        font-size: 1.15rem;
        line-height: 1;
      }
      .prefs button[aria-pressed='true'] {
        background: var(--fond);
        color: var(--texte);
        box-shadow: 0 0 0 1px var(--bord);
      }
      .prefs button:focus-visible {
        outline: 3px solid var(--lien);
        outline-offset: 2px;
      }
      .hero {
        display: flex;
        gap: 1rem;
        align-items: flex-start;
        margin: 0 0 1.5rem;
      }
      .hero-icone {
        width: 4.5rem;
        height: 4.5rem;
        border-radius: 1rem;
        flex-shrink: 0;
        box-shadow: 0 4px 14px color-mix(in srgb, var(--texte) 12%, transparent);
      }
      .hero-texte {
        min-width: 0;
      }
      h1 {
        font-family: Georgia, 'Iowan Old Style', 'Palatino Linotype', Palatino, serif;
        font-size: clamp(1.7rem, 5vw, 2.45rem);
        font-weight: 700;
        letter-spacing: -0.02em;
        line-height: 1.15;
        margin: 0 0 0.55rem;
      }
      .chapeau {
        color: var(--doux);
        max-width: 42rem;
        margin: 0 0 0.65rem;
      }
      .confiance {
        margin: 0;
        max-width: 42rem;
        color: var(--texte);
        font-size: 0.92rem;
        font-weight: 500;
      }
      .outils {
        margin: 0 0 1.75rem;
      }
      .filtre {
        display: block;
        margin: 0 0 0.75rem;
      }
      .filtre input {
        width: 100%;
        padding: 0.7rem 0.9rem;
        border: 1px solid var(--bord);
        border-radius: 0.75rem;
        background: var(--barre);
        color: var(--texte);
        font: inherit;
      }
      .filtre input:focus-visible {
        outline: 3px solid var(--lien);
        outline-offset: 2px;
      }
      .sommaire {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
      }
      .sommaire a {
        display: inline-flex;
        align-items: center;
        padding: 0.35rem 0.8rem;
        border: 1px solid var(--bord);
        border-radius: 999px;
        background: var(--barre);
        color: var(--texte);
        text-decoration: none;
        font-size: 0.85rem;
      }
      .sommaire a:hover {
        border-color: var(--lien);
        color: var(--lien);
      }
      h2 {
        font-size: 1.05rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--doux);
        margin: 2.25rem 0 0.9rem;
        scroll-margin-top: 4.5rem;
      }
      ul {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 1.25rem;
        grid-template-columns: repeat(auto-fill, minmax(min(17rem, 100%), 1fr));
      }
      .carte {
        position: relative;
        border: 1px solid var(--bord);
        border-radius: 1rem;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        background: var(--fond);
        transition: border-color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
      }
      .carte:hover,
      .carte:focus-within {
        border-color: color-mix(in srgb, var(--lien) 55%, var(--bord));
        transform: translateY(-2px);
        box-shadow: 0 8px 22px color-mix(in srgb, var(--texte) 10%, transparent);
      }
      .carte-hit {
        position: absolute;
        inset: 0;
        z-index: 1;
        color: transparent;
        text-indent: -9999px;
        overflow: hidden;
      }
      .carte-hit:focus-visible {
        outline: 3px solid var(--lien);
        outline-offset: -3px;
      }
      .carte .visuel {
        display: block;
        aspect-ratio: 1200 / 630;
        background: var(--bord);
      }
      .carte .visuel img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .carte .corps {
        position: relative;
        padding: 1rem 1.1rem 1.15rem;
      }
      .carte h3 {
        font-size: 1.05rem;
        margin: 0 0 0.35rem;
      }
      .carte .nom {
        color: var(--texte);
      }
      .carte p {
        margin: 0;
        color: var(--doux);
        font-size: 0.92rem;
      }
      .carte .guide {
        margin-top: 0.65rem;
        font-size: 0.9rem;
      }
      .guide-lien {
        position: relative;
        z-index: 2;
      }
      .badge {
        display: inline-block;
        margin-left: 0.35rem;
        padding: 0 0.45rem;
        border: 1px solid var(--bord);
        border-radius: 999px;
        color: var(--doux);
        font-size: 0.72rem;
        font-weight: 600;
        vertical-align: 0.15em;
        white-space: nowrap;
      }
      .badge-alpha {
        color: var(--alpha-fg);
        background: var(--alpha-bg);
        border-color: var(--alpha-bd);
      }
      .badge-beta {
        color: var(--beta-fg);
        background: var(--beta-bg);
        border-color: var(--beta-bd);
      }
      a {
        color: var(--lien);
      }
      a:focus-visible {
        outline: 3px solid var(--lien);
        outline-offset: 2px;
      }
      .coulisses {
        margin-top: 3rem;
        padding-top: 0.5rem;
        border-top: 1px solid var(--bord);
        opacity: 0.72;
      }
      .coulisses:hover,
      .coulisses:focus-within {
        opacity: 0.92;
      }
      footer {
        margin-top: 3rem;
        padding-top: 1.5rem;
        border-top: 1px solid var(--bord);
        color: var(--doux);
        font-size: 0.9rem;
      }
      footer p {
        margin: 0 0 0.85rem;
      }
      footer p:last-child {
        margin-bottom: 0;
      }
      .sponsor {
        display: inline-flex;
        align-items: center;
        gap: 0.45rem;
        margin-top: 0.35rem;
        padding: 0.55rem 0.95rem;
        border: 1px solid color-mix(in srgb, var(--lien) 35%, var(--bord));
        border-radius: 999px;
        background: var(--barre);
        color: var(--lien);
        text-decoration: none;
        font-weight: 600;
      }
      .sponsor:hover {
        border-color: var(--lien);
        background: color-mix(in srgb, var(--lien) 10%, var(--barre));
      }
      .sponsor .ico {
        display: inline-flex;
        width: 1.05rem;
        height: 1.05rem;
      }
      .sponsor .ico svg {
        width: 100%;
        height: 100%;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.75;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      @media (max-width: 36rem) {
        .hero {
          flex-direction: column;
          align-items: center;
          text-align: center;
        }
        .chapeau,
        .confiance {
          margin-left: auto;
          margin-right: auto;
        }
        .sommaire {
          justify-content: center;
        }
      }
    </style>
  </head>
  <body>
    <div class="topbar">
      <div class="prefs" role="group" data-i18n-aria="prefs" aria-label="Langue et thème">
        <fieldset>
          <legend data-i18n="prefs">Langue et thème</legend>
          <button type="button" data-set-lang="fr" data-i18n-aria="langFr" aria-label="Français" aria-pressed="true" title="Français">
            <span class="drapeau" aria-hidden="true">🇫🇷</span>
          </button>
          <button type="button" data-set-lang="en" data-i18n-aria="langEn" aria-label="English" aria-pressed="false" title="English">
            <span class="drapeau" aria-hidden="true">🇬🇧</span>
          </button>
        </fieldset>
        <fieldset>
          <legend data-i18n="prefs">Langue et thème</legend>
          <button type="button" data-set-theme="light" data-i18n-aria="themeLight" aria-label="Clair" aria-pressed="false" title="Clair">
            <span class="ico" aria-hidden="true">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
            </span>
          </button>
          <button type="button" data-set-theme="dark" data-i18n-aria="themeDark" aria-label="Sombre" aria-pressed="false" title="Sombre">
            <span class="ico" aria-hidden="true">
              <svg viewBox="0 0 24 24"><path d="M21 14.5A8.5 8.5 0 0 1 9.5 3 7 7 0 1 0 21 14.5z"/></svg>
            </span>
          </button>
          <button type="button" data-set-theme="system" data-i18n-aria="themeSystem" aria-label="Système" aria-pressed="true" title="Système">
            <span class="ico" aria-hidden="true">
              <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>
            </span>
          </button>
        </fieldset>
      </div>
    </div>

    <header class="hero">
      <img
        class="hero-icone"
        src="${FAMILY_ORIGIN}/icon-192.png"
        width="72"
        height="72"
        alt=""
        decoding="async"
      />
      <div class="hero-texte">
        <h1 data-i18n="h1">Les applications de ${COMPTE}</h1>
        <p class="chapeau" data-i18n="chapeau" data-i18n-pwa="chapeauPwa">
          Une famille d'applications web installables. Chacune s'installe depuis
          le navigateur, sans magasin d'applications, et la plupart continuent de
          fonctionner hors ligne une fois ouvertes. Ce catalogue aussi
          s'installe : menu ⋮ de Chrome → « Installer l'application ».
        </p>
        <p class="confiance" data-i18n="confiance">
          Open source, hébergées en Europe, sans magasin — et sans compte obligatoire pour démarrer.
        </p>
      </div>
    </header>

    <div class="outils">
      <label class="filtre">
        <span class="sr-only" data-i18n="filtre">Filtrer les applications</span>
        <input
          type="search"
          id="filtre"
          data-i18n-placeholder="filtrePh"
          placeholder="Filtrer les applications…"
          autocomplete="off"
          spellcheck="false"
        />
      </label>
      <nav class="sommaire" data-i18n-aria="nav" aria-label="Catégories">
${navCats}
      </nav>
    </div>

    <main>
${sections.join('\n\n')}
${
  coulisses.length
    ? `
      <section class="coulisses" aria-labelledby="coulisses">
        <h2 id="coulisses" data-i18n="coulisses">Dans les coulisses</h2>
        <ul>
${coulisses.map(carteCoulisse).join('\n')}
        </ul>
      </section>`
    : ''
}
    </main>

    <footer>
      <p>
        <span data-i18n="source">Code source sur</span>
        <a href="https://github.com/${COMPTE}">github.com/${COMPTE}</a>.
      </p>
      <p>
        <span data-i18n="sponsorBefore">Ces applications sont gratuites et open source.</span>
        <a class="sponsor" href="${SPONSOR_URL}" rel="noopener noreferrer">
          <span class="ico" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M4 8h12v8a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V8z"/><path d="M16 9h2.5a2.5 2.5 0 0 1 0 5H16"/><path d="M8 5c0 1.5 1.2 2 2 3 .8-1 2-1.5 2-3a2 2 0 1 0-4 0z"/></svg>
          </span>
          <span data-i18n="sponsorLink">M'offrir un café</span>
        </a>
      </p>
    </footer>
    <script>
      (function () {
        var I18N = ${i18nJson};
        var root = document.documentElement;
        var themeMeta = document.getElementById('theme-color');

        function lang() {
          return root.lang === 'en' ? 'en' : 'fr';
        }

        function theme() {
          return root.dataset.theme || 'system';
        }

        function isPwa() {
          return root.dataset.pwa === '1';
        }

        function applyLang(l) {
          l = l === 'en' ? 'en' : 'fr';
          root.lang = l;
          try { localStorage.setItem('hub-lang', l); } catch (e) {}
          var t = I18N[l];
          var pwa = isPwa();
          document.title = t.title;
          var desc = document.querySelector('meta[name="description"]');
          if (desc) desc.setAttribute('content', t.description);
          document.querySelectorAll('[data-i18n]').forEach(function (el) {
            var k = el.getAttribute('data-i18n');
            if (pwa && el.hasAttribute('data-i18n-pwa')) {
              k = el.getAttribute('data-i18n-pwa');
            }
            if (t[k]) el.textContent = t[k];
          });
          document.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
            var k = el.getAttribute('data-i18n-aria');
            if (t[k]) {
              el.setAttribute('aria-label', t[k]);
              if (el.hasAttribute('title')) el.setAttribute('title', t[k]);
            }
          });
          document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
            var k = el.getAttribute('data-i18n-placeholder');
            if (t[k]) el.setAttribute('placeholder', t[k]);
          });
          document.querySelectorAll('[data-i18n-cat]').forEach(function (el) {
            var c = el.getAttribute('data-i18n-cat');
            if (t.categories && t.categories[c]) el.textContent = t.categories[c];
          });
          document.querySelectorAll('[data-i18n-maturity]').forEach(function (el) {
            var m = el.getAttribute('data-i18n-maturity');
            if (t.maturity && t.maturity[m]) el.textContent = t.maturity[m];
          });
          document.querySelectorAll('[data-fr][data-en]').forEach(function (el) {
            el.textContent = el.getAttribute(l === 'en' ? 'data-en' : 'data-fr');
          });
          document.querySelectorAll('[data-set-lang]').forEach(function (btn) {
            btn.setAttribute('aria-pressed', btn.getAttribute('data-set-lang') === l ? 'true' : 'false');
          });
        }

        function resolveThemeColor() {
          var th = theme();
          if (th === 'dark') return '#0f1220';
          if (th === 'light') return '#ffffff';
          return window.matchMedia('(prefers-color-scheme: dark)').matches ? '#0f1220' : '#ffffff';
        }

        function applyTheme(th) {
          if (th !== 'light' && th !== 'dark' && th !== 'system') th = 'system';
          root.dataset.theme = th;
          try { localStorage.setItem('hub-theme', th); } catch (e) {}
          if (themeMeta) themeMeta.setAttribute('content', resolveThemeColor());
          document.querySelectorAll('[data-set-theme]').forEach(function (btn) {
            btn.setAttribute('aria-pressed', btn.getAttribute('data-set-theme') === th ? 'true' : 'false');
          });
        }

        document.querySelectorAll('[data-set-lang]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            applyLang(btn.getAttribute('data-set-lang'));
          });
        });
        document.querySelectorAll('[data-set-theme]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            applyTheme(btn.getAttribute('data-set-theme'));
          });
        });
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
          if (theme() === 'system') applyTheme('system');
        });

        var filtre = document.getElementById('filtre');
        if (filtre) {
          filtre.addEventListener('input', function () {
            var q = filtre.value.trim().toLowerCase();
            document.querySelectorAll('.carte[data-search]').forEach(function (carte) {
              carte.hidden = q !== '' && carte.getAttribute('data-search').indexOf(q) === -1;
            });
            document.querySelectorAll('main > section').forEach(function (sec) {
              if (sec.classList.contains('coulisses')) return;
              var cartes = sec.querySelectorAll('.carte');
              if (!cartes.length) return;
              var visible = false;
              cartes.forEach(function (c) {
                if (!c.hidden) visible = true;
              });
              sec.hidden = !visible;
            });
          });
        }

        applyLang(lang());
        applyTheme(theme());

        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.register('${FAMILY_ORIGIN}/sw.js').catch(function () {});
        }
      })();
    </script>
  </body>
</html>
`;

// Manifest + service worker : sans eux, Chrome Android n'offre pas
// « Installer l'application ». Le worker ne fait que du réseau d'abord —
// le hub reste une page générée, pas une app hors-ligne riche.
const manifeste = {
  id: `${FAMILY_ORIGIN}/`,
  name: `Les applications de ${COMPTE}`,
  short_name: 'GuiiuG',
  description,
  lang: 'fr',
  dir: 'ltr',
  start_url: `${FAMILY_ORIGIN}/`,
  scope: `${FAMILY_ORIGIN}/`,
  display: 'standalone',
  background_color: THEME,
  theme_color: THEME,
  icons: [
    {
      src: `${FAMILY_ORIGIN}/icon-192.png`,
      sizes: '192x192',
      type: 'image/png',
      purpose: 'any',
    },
    {
      src: `${FAMILY_ORIGIN}/icon-512.png`,
      sizes: '512x512',
      type: 'image/png',
      purpose: 'any',
    },
    {
      src: `${FAMILY_ORIGIN}/icon-512.png`,
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    },
  ],
};

const sw = `/* Hub ${COMPTE} — réseau d'abord, repli cache pour l'accueil. */
const CACHE = 'hub-v1';
const PRECACHE = ['${FAMILY_ORIGIN}/', '${FAMILY_ORIGIN}/index.html', '${FAMILY_ORIGIN}/manifest.webmanifest', '${FAMILY_ORIGIN}/icon-192.png', '${FAMILY_ORIGIN}/icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  event.respondWith(
    fetch(req)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then(r => r || caches.match('${FAMILY_ORIGIN}/')))
  );
});
`;

mkdirSync(SORTIE, { recursive: true });
writeFileSync(join(SORTIE, 'index.html'), html, 'utf8');
writeFileSync(join(SORTIE, 'robots.txt'), robots, 'utf8');
writeFileSync(
  join(SORTIE, 'manifest.webmanifest'),
  JSON.stringify(manifeste, null, 2) + '\n',
  'utf8'
);
writeFileSync(join(SORTIE, 'sw.js'), sw, 'utf8');
writeFileSync(join(SORTIE, 'sitemap.xml'), sitemap, 'utf8');
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

console.log(
  `\nÉcrit dans ${SORTIE}/ : index.html (${FAMILY_APPS.length} applications en ` +
    `${sections.length} catégories, ${coulisses.length} en coulisses), ` +
    `robots.txt (${sites.filter(s => s.plan).length + 1} plans de site), sitemap.xml, ` +
    `${VERIFICATION_GOOGLE}, BingSiteAuth.xml, clé IndexNow, og-image.jpg, ` +
    `manifest.webmanifest, sw.js, icônes PWA`
);
