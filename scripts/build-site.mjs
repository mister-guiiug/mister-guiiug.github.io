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
 * id de l'app → URL distante de son og-image (1200×630), si elle répond.
 * À la publication on en écrit une miniature 640w dans `previews/<id>.jpg`
 * (+ `.webp` si sharp est dispo) : même source, poids mobile réduit.
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

/** Coup de projecteur éditorial — `null` = première app stable avec image. */
const FEATURED_ID = 'miss-contraction';

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

const visuelPreview = (id, sizes) => `
            <span class="visuel">
              <picture>
                <source type="image/webp" srcset="${FAMILY_ORIGIN}/previews/${echappe(id)}.webp" />
                <img
                  class="visuel-img"
                  src="${FAMILY_ORIGIN}/previews/${echappe(id)}.jpg"
                  alt=""
                  width="640"
                  height="336"
                  sizes="${echappe(sizes)}"
                  loading="lazy"
                  decoding="async"
                />
              </picture>
            </span>`;

const carteApp = (app, featuredId) => {
  const bureau = app.platform === 'desktop';
  const pages = pagesParApp.get(app.id) ?? [];
  const aImage = imageParApp.has(app.id);
  const descEn = DESC_EN[app.id] ?? app.description;
  const premierePage = pages[0];
  const plateforme = bureau ? 'desktop' : 'web';
  const aLaUne = featuredId && app.id === featuredId;
  const actions = `
            <p class="actions">
              ${lienHorsShell(app.appUrl, '<span data-i18n="ouvrir">Ouvrir</span>', ' class="action action-ouvrir"')}
              ${
                premierePage
                  ? lienHorsShell(
                      premierePage.url,
                      '<span data-i18n="guide">Guide</span>',
                      ` class="action action-guide guide-lien" title="${echappe(premierePage.titre)}"`
                    )
                  : ''
              }
            </p>`;
  const recherche = [
    app.name,
    app.description,
    descEn,
    libellesFr.categories?.[app.category] ?? '',
    libellesEn.categories?.[app.category] ?? '',
    app.maturity,
    plateforme,
  ]
    .join(' ')
    .toLowerCase();
  const visuel = aImage ? visuelPreview(app.id, '(max-width: 40rem) 100vw, 320px') : '';
  const badgeBureau = bureau
    ? ` <span class="badge" data-i18n="badgeDesktop">${echappe('Application de bureau')}</span>`
    : '';
  const badgeUne = aLaUne
    ? ` <span class="badge badge-une" data-i18n="aLaUne">${echappe('À la une')}</span>`
    : '';
  const classes = ['carte', bureau ? 'carte-bureau' : '', aLaUne ? 'carte-une' : '']
    .filter(Boolean)
    .join(' ');
  return `          <li class="${classes}" data-search="${echappe(recherche)}" data-maturity="${echappe(app.maturity)}" data-platform="${plateforme}" data-cat="${echappe(app.category)}">
            ${lienHorsShell(app.appUrl, '', ` class="carte-hit" aria-label="${echappe(app.name)}"`)}
${visuel}
            <div class="corps">
              <h3><span class="nom">${echappe(app.name)}</span>${maturite(app.maturity)}${badgeBureau}${badgeUne}</h3>
              <p data-fr="${echappe(app.description)}" data-en="${echappe(descEn)}">${echappe(app.description)}</p>${actions}
            </div>
          </li>`;
};

const catsAvecApps = CATEGORIES.filter(cat =>
  FAMILY_APPS.some(a => a.category === cat)
);

/** Coup de projecteur : FEATURED_ID si valide, sinon première stable avec image. */
const featuredApp =
  (FEATURED_ID ? FAMILY_APPS.find(a => a.id === FEATURED_ID) : null) ??
  FAMILY_APPS.find(a => a.maturity === 'stable' && imageParApp.has(a.id)) ??
  null;
const featuredId = featuredApp?.id ?? null;

const navCats = catsAvecApps
  .map(
    cat =>
      `          <a href="#cat-${cat}" data-cat="${echappe(cat)}" data-i18n-cat="${echappe(cat)}">${echappe(libellesFr.categories?.[cat] ?? cat)}</a>`
  )
  .join('\n');

const videSuggestions = catsAvecApps
  .slice(0, 3)
  .map(
    cat =>
      `        <button type="button" class="chip vide-cat" data-suggest-cat="${echappe(cat)}" data-i18n-cat="${echappe(cat)}">${echappe(libellesFr.categories?.[cat] ?? cat)}</button>`
  )
  .join('\n');

const sections = CATEGORIES.map(cat => {
  const apps = FAMILY_APPS.filter(a => a.category === cat);
  if (!apps.length) return null;
  return `      <section data-cat-section="${echappe(cat)}" aria-labelledby="cat-${cat}">
        <h2 id="cat-${cat}" data-i18n-cat="${echappe(cat)}">${echappe(libellesFr.categories?.[cat] ?? cat)}</h2>
        <ul>
${apps.map(a => carteApp(a, featuredId)).join('\n')}
        </ul>
      </section>`;
}).filter(Boolean);

const featuredDescEn = featuredApp
  ? (DESC_EN[featuredApp.id] ?? featuredApp.description)
  : '';
const featuredHtml = featuredApp
  ? `
    <aside class="projecteur" aria-labelledby="projecteur-titre">
      <p class="projecteur-label" id="projecteur-titre" data-i18n="projecteur">Coup de projecteur</p>
      <div class="projecteur-carte">
        ${lienHorsShell(featuredApp.appUrl, '', ` class="carte-hit" aria-label="${echappe(featuredApp.name)}"`)}
${imageParApp.has(featuredApp.id) ? visuelPreview(featuredApp.id, '(max-width: 40rem) 100vw, 480px').replace('loading="lazy"', '') : ''}
        <div class="corps">
          <h2 class="projecteur-nom">${echappe(featuredApp.name)}</h2>
          <p data-fr="${echappe(featuredApp.description)}" data-en="${echappe(featuredDescEn)}">${echappe(featuredApp.description)}</p>
          <p class="actions">
            ${lienHorsShell(featuredApp.appUrl, '<span data-i18n="ouvrir">Ouvrir</span>', ' class="action action-ouvrir"')}
          </p>
        </div>
      </div>
    </aside>`
  : '';

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

// Bing SEO/GEO : titre ≥ 50 car. Le H1 visible est la marque ; le <title> reste descriptif.
const titrePage = `Les applications de ${COMPTE} - PWA web installables hors magasin`;
const titrePageEn = `${COMPTE}'s apps - installable PWAs, no app store`;

const dateAfficheFr = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
}).format(new Date());
const dateAfficheEn = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
}).format(new Date());

const nbApps = FAMILY_APPS.length;
const nbCats = catsAvecApps.length;

const i18nJson = JSON.stringify({
  fr: {
    title: titrePage,
    description,
    marque: 'GuiiuG',
    sousTitre: `Les applications de ${COMPTE}`,
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
    filtreVide: 'Aucune application ne correspond.',
    filtreEffacer: 'Effacer le filtre',
    filtreSuggestions: 'Essayer une catégorie',
    filtresPlus: 'Filtres',
    enSavoirPlus: 'En savoir plus',
    enSavoirMoins: 'Réduire',
    ouvrir: 'Ouvrir',
    aLaUne: 'À la une',
    plateformeFiltre: 'Plateforme',
    plateformeTous: 'Toutes',
    plateformeWeb: 'PWA',
    plateformeDesktop: 'Bureau',
    coulissesIntro: 'Infrastructure de la famille — pas des applications à installer.',
    licence: 'Licence MIT',
    nav: 'Catégories',
    guide: 'Guide',
    skip: 'Aller aux applications',
    installer: 'Installer le catalogue',
    projecteur: 'Coup de projecteur',
    maturiteTous: 'Toutes',
    maturiteFiltre: 'Maturité',
    compte: `${nbApps} applications · ${nbCats} catégories`,
    compteFiltre: '{n} sur ' + nbApps,
    maj: `Mis à jour le ${dateAfficheFr}`,
    categories: libellesFr.categories,
    maturity: libellesFr.maturity,
  },
  en: {
    title: titrePageEn,
    description: descriptionEn,
    marque: 'GuiiuG',
    sousTitre: `Apps by ${COMPTE}`,
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
    filtreVide: 'No apps match.',
    filtreEffacer: 'Clear filter',
    filtreSuggestions: 'Try a category',
    filtresPlus: 'Filters',
    enSavoirPlus: 'Read more',
    enSavoirMoins: 'Show less',
    ouvrir: 'Open',
    aLaUne: 'Featured',
    plateformeFiltre: 'Platform',
    plateformeTous: 'All',
    plateformeWeb: 'PWA',
    plateformeDesktop: 'Desktop',
    coulissesIntro: 'Family infrastructure — not apps to install.',
    licence: 'MIT license',
    nav: 'Categories',
    guide: 'Guide (FR)',
    skip: 'Skip to apps',
    installer: 'Install this catalogue',
    projecteur: 'Spotlight',
    maturiteTous: 'All',
    maturiteFiltre: 'Maturity',
    compte: `${nbApps} apps · ${nbCats} categories`,
    compteFiltre: '{n} of ' + nbApps,
    maj: `Updated ${dateAfficheEn}`,
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
        --fond: #f7f8fc;
        --fond-carte: #ffffff;
        --texte: #1a1b26;
        --doux: #55586b;
        --bord: #d9dbe6;
        --lien: #2f4bd1;
        --barre: #eef0f7;
        --alpha-fg: #8a4b08;
        --alpha-bg: #fff4e5;
        --alpha-bd: #e0b070;
        --beta-fg: #0a5c4a;
        --beta-bg: #e8f7f2;
        --beta-bd: #7bc4b0;
        --chrome: #f7f8fc;
      }
      html[data-theme='dark'] {
        color-scheme: dark;
        --fond: #0f1220;
        --fond-carte: #15192b;
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
        --chrome: #0f1220;
      }
      @media (prefers-color-scheme: dark) {
        html[data-theme='system'] {
          color-scheme: dark;
          --fond: #0f1220;
          --fond-carte: #15192b;
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
          --chrome: #0f1220;
        }
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0 auto;
        max-width: 60rem;
        padding:
          max(1.25rem, env(safe-area-inset-top, 0px))
          max(1.25rem, env(safe-area-inset-right, 0px))
          max(4rem, env(safe-area-inset-bottom, 0px))
          max(1.25rem, env(safe-area-inset-left, 0px));
        background:
          radial-gradient(ellipse 90% 55% at 50% -15%, color-mix(in srgb, var(--lien) 16%, transparent), transparent 70%),
          radial-gradient(circle at 12% 18%, color-mix(in srgb, var(--texte) 4%, transparent) 0 1px, transparent 1.5px),
          radial-gradient(circle at 78% 32%, color-mix(in srgb, var(--texte) 3.5%, transparent) 0 1px, transparent 1.5px),
          var(--fond);
        background-size: auto, 3.2rem 3.2rem, 4.1rem 4.1rem, auto;
        color: var(--texte);
        font-family: "Segoe UI", ui-sans-serif, system-ui, sans-serif;
        line-height: 1.6;
      }
      html[data-theme='dark'] body,
      html[data-theme='system'] body {
        background:
          radial-gradient(ellipse 90% 55% at 50% -15%, color-mix(in srgb, var(--lien) 22%, transparent), transparent 70%),
          radial-gradient(circle at 12% 18%, color-mix(in srgb, var(--texte) 14%, transparent) 0 1.15px, transparent 1.8px),
          radial-gradient(circle at 78% 32%, color-mix(in srgb, var(--texte) 11%, transparent) 0 1px, transparent 1.6px),
          radial-gradient(circle at 42% 70%, color-mix(in srgb, var(--texte) 9%, transparent) 0 1px, transparent 1.5px),
          var(--fond);
        background-size: auto, 2.8rem 2.8rem, 3.6rem 3.6rem, 4.4rem 4.4rem, auto;
      }
      @media (prefers-color-scheme: light) {
        html[data-theme='system'] body {
          background:
            radial-gradient(ellipse 90% 55% at 50% -15%, color-mix(in srgb, var(--lien) 16%, transparent), transparent 70%),
            radial-gradient(circle at 12% 18%, color-mix(in srgb, var(--texte) 4%, transparent) 0 1px, transparent 1.5px),
            radial-gradient(circle at 78% 32%, color-mix(in srgb, var(--texte) 3.5%, transparent) 0 1px, transparent 1.5px),
            var(--fond);
          background-size: auto, 3.2rem 3.2rem, 4.1rem 4.1rem, auto;
        }
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
      .skip {
        position: absolute;
        left: 1rem;
        top: 1rem;
        z-index: 40;
        padding: 0.5rem 0.85rem;
        border-radius: 0.5rem;
        background: var(--lien);
        color: #fff;
        text-decoration: none;
        transform: translateY(-200%);
      }
      .skip:focus {
        transform: translateY(0);
      }
      .chrome {
        position: sticky;
        top: 0;
        z-index: 20;
        margin: 0 0 1.25rem;
        padding: 0.4rem 0 0.75rem;
        background: var(--chrome);
        border-bottom: 1px solid color-mix(in srgb, var(--bord) 70%, transparent);
      }
      @supports ((-webkit-backdrop-filter: blur(10px)) or (backdrop-filter: blur(10px))) {
        .chrome {
          background: color-mix(in srgb, var(--chrome) 88%, transparent);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
        }
      }
      .topbar {
        display: flex;
        justify-content: flex-end;
        margin: 0 0 0.65rem;
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
        background: var(--fond-carte);
        color: var(--texte);
        box-shadow: 0 0 0 1px var(--bord);
      }
      .prefs button:focus-visible,
      .chip:focus-visible,
      .installer:focus-visible,
      .vide-effacer:focus-visible {
        outline: 3px solid var(--lien);
        outline-offset: 2px;
      }
      .hero {
        display: flex;
        gap: 1rem;
        align-items: flex-start;
        margin: 0 0 1.35rem;
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
      .marque {
        font-family: "Trebuchet MS", "Segoe UI", ui-sans-serif, system-ui, sans-serif;
        font-size: clamp(2rem, 6vw, 2.75rem);
        font-weight: 700;
        letter-spacing: -0.03em;
        line-height: 1.05;
        margin: 0 0 0.25rem;
      }
      .sous-titre {
        margin: 0 0 0.55rem;
        color: var(--doux);
        font-size: 1.05rem;
        font-weight: 500;
      }
      .chapeau {
        color: var(--doux);
        max-width: 42rem;
        margin: 0 0 0.65rem;
      }
      .confiance {
        margin: 0 0 0.75rem;
        max-width: 42rem;
        color: var(--texte);
        font-size: 0.92rem;
        font-weight: 500;
      }
      .installer {
        display: none;
        appearance: none;
        margin: 0 0 0.25rem;
        padding: 0.5rem 0.95rem;
        border: 1px solid color-mix(in srgb, var(--lien) 40%, var(--bord));
        border-radius: 999px;
        background: var(--barre);
        color: var(--lien);
        font: inherit;
        font-weight: 600;
        cursor: pointer;
      }
      .installer[data-visible='1'] {
        display: inline-flex;
      }
      .outils {
        display: grid;
        gap: 0.65rem;
      }
      .filtre input {
        width: 100%;
        padding: 0.7rem 0.9rem;
        border: 1px solid var(--bord);
        border-radius: 0.75rem;
        background: var(--fond-carte);
        color: var(--texte);
        font: inherit;
      }
      .filtre input:focus-visible {
        outline: 3px solid var(--lien);
        outline-offset: 2px;
      }
      .compte {
        margin: 0;
        color: var(--doux);
        font-size: 0.85rem;
      }
      .maturite {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
        align-items: center;
      }
      .chip {
        appearance: none;
        border: 1px solid var(--bord);
        border-radius: 999px;
        padding: 0.3rem 0.75rem;
        background: var(--barre);
        color: var(--texte);
        font: inherit;
        font-size: 0.85rem;
        cursor: pointer;
      }
      .chip[aria-pressed='true'] {
        border-color: var(--lien);
        color: var(--lien);
        background: color-mix(in srgb, var(--lien) 10%, var(--barre));
      }
      .sommaire {
        display: flex;
        flex-wrap: nowrap;
        gap: 0.4rem;
        overflow-x: auto;
        padding-bottom: 0.15rem;
        scrollbar-width: thin;
        -webkit-overflow-scrolling: touch;
      }
      .sommaire a {
        display: inline-flex;
        align-items: center;
        flex: 0 0 auto;
        padding: 0.35rem 0.8rem;
        border: 1px solid var(--bord);
        border-radius: 999px;
        background: var(--barre);
        color: var(--texte);
        text-decoration: none;
        font-size: 0.85rem;
      }
      .sommaire a:hover,
      .sommaire a[aria-current='true'] {
        border-color: var(--lien);
        color: var(--lien);
      }
      .sommaire a[aria-current='true'] {
        background: color-mix(in srgb, var(--lien) 10%, var(--barre));
      }
      .projecteur {
        margin: 0 0 1.75rem;
      }
      .projecteur-label {
        margin: 0 0 0.55rem;
        font-size: 0.85rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--doux);
      }
      .projecteur-carte {
        position: relative;
        display: grid;
        grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
        gap: 0;
        border: 1px solid var(--bord);
        border-radius: 1rem;
        overflow: hidden;
        background: var(--fond-carte);
      }
      .projecteur-carte .visuel {
        aspect-ratio: auto;
        min-height: 100%;
      }
      .projecteur-carte .corps {
        padding: 1.25rem 1.35rem;
        display: flex;
        flex-direction: column;
        justify-content: center;
      }
      .projecteur-nom {
        margin: 0 0 0.4rem;
        font-family: "Trebuchet MS", "Segoe UI", ui-sans-serif, system-ui, sans-serif;
        font-size: 1.35rem;
        text-transform: none;
        letter-spacing: -0.02em;
        color: var(--texte);
      }
      h2 {
        font-size: 1.05rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--doux);
        margin: 2.25rem 0 0.9rem;
        scroll-margin-top: 9rem;
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
        background: var(--fond-carte);
        transition: border-color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
      }
      .carte-bureau {
        border-style: dashed;
        background:
          repeating-linear-gradient(
            -45deg,
            transparent,
            transparent 8px,
            color-mix(in srgb, var(--bord) 35%, transparent) 8px,
            color-mix(in srgb, var(--bord) 35%, transparent) 9px
          ),
          var(--fond-carte);
      }
      .carte:hover,
      .carte:focus-within,
      .projecteur-carte:hover,
      .projecteur-carte:focus-within {
        border-color: color-mix(in srgb, var(--lien) 55%, var(--bord));
        transform: translateY(-2px);
        box-shadow: 0 8px 22px color-mix(in srgb, var(--texte) 10%, transparent);
      }
      @media (prefers-reduced-motion: reduce) {
        .carte,
        .projecteur-carte {
          transition: none;
        }
        .carte:hover,
        .carte:focus-within,
        .projecteur-carte:hover,
        .projecteur-carte:focus-within {
          transform: none;
        }
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
      .carte .visuel,
      .projecteur-carte .visuel {
        display: block;
        aspect-ratio: 1200 / 630;
        background: var(--bord);
      }
      .carte .visuel img,
      .projecteur-carte .visuel img {
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
      .carte p,
      .projecteur-carte p {
        margin: 0;
        color: var(--doux);
        font-size: 0.92rem;
      }
      .carte .actions,
      .projecteur-carte .actions {
        position: relative;
        z-index: 2;
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem 0.85rem;
        margin-top: 0.75rem;
        font-size: 0.9rem;
      }
      .action {
        font-weight: 600;
        text-decoration: none;
      }
      .action:hover {
        text-decoration: underline;
      }
      .guide-lien,
      .action-ouvrir,
      .action-guide {
        position: relative;
        z-index: 2;
      }
      .visuel-img {
        opacity: 0;
        transition: opacity 0.35s ease;
      }
      .visuel-img.is-loaded {
        opacity: 1;
      }
      .badge-une {
        color: var(--lien);
        border-color: color-mix(in srgb, var(--lien) 45%, var(--bord));
        background: color-mix(in srgb, var(--lien) 10%, var(--fond-carte));
      }
      .carte-une {
        box-shadow: 0 0 0 1px color-mix(in srgb, var(--lien) 25%, transparent);
      }
      .vide {
        display: none;
        margin: 1.5rem 0;
        padding: 1.25rem;
        border: 1px dashed var(--bord);
        border-radius: 1rem;
        text-align: center;
        color: var(--doux);
      }
      .vide[data-visible='1'] {
        display: block;
      }
      .vide p {
        margin: 0 0 0.75rem;
      }
      .vide-effacer {
        appearance: none;
        border: 1px solid var(--bord);
        border-radius: 999px;
        padding: 0.4rem 0.85rem;
        background: var(--barre);
        color: var(--lien);
        font: inherit;
        cursor: pointer;
      }
      .vide-suggestions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
        justify-content: center;
        margin: 0.85rem 0 0;
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
      .coulisses-intro {
        margin: 0 0 0.9rem;
        color: var(--doux);
        font-size: 0.9rem;
        font-weight: 400;
        text-transform: none;
        letter-spacing: 0;
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
      .filtres-toggle {
        display: none;
        appearance: none;
        width: 100%;
        padding: 0.55rem 0.85rem;
        border: 1px solid var(--bord);
        border-radius: 0.75rem;
        background: var(--barre);
        color: var(--texte);
        font: inherit;
        font-weight: 600;
        cursor: pointer;
        text-align: left;
      }
      .filtres-panel {
        display: grid;
        gap: 0.55rem;
      }
      .sommaire-wrap {
        position: relative;
      }
      .sommaire-wrap::after {
        content: '';
        position: absolute;
        top: 0;
        right: 0;
        bottom: 0;
        width: 2.25rem;
        pointer-events: none;
        background: linear-gradient(to right, transparent, var(--chrome));
        opacity: 0;
        transition: opacity 0.15s;
      }
      .sommaire-wrap[data-overflow='1']::after {
        opacity: 1;
      }
      .chapeau {
        transition: none;
      }
      .chapeau-plus {
        display: none;
        appearance: none;
        margin: 0 0 0.65rem;
        padding: 0;
        border: 0;
        background: none;
        color: var(--lien);
        font: inherit;
        font-weight: 600;
        cursor: pointer;
      }
      .chrome {
        transition: transform 0.2s ease;
      }
      .chrome.is-hidden {
        transform: translateY(calc(-100% - 1px));
      }
      .marque {
        animation: marque-in 0.55s ease both;
      }
      @keyframes marque-in {
        from {
          opacity: 0;
          transform: translateY(0.35rem);
        }
        to {
          opacity: 1;
          transform: none;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .marque {
          animation: none;
        }
        .visuel-img {
          opacity: 1;
          transition: none;
        }
        .chrome {
          transition: none;
        }
      }
      @media (forced-colors: active) {
        .carte,
        .chip,
        .sommaire a,
        .sponsor,
        .prefs fieldset,
        .filtre input,
        .installer {
          border: 1px solid CanvasText;
        }
        .carte-hit:focus-visible,
        a:focus-visible,
        .prefs button:focus-visible,
        .chip:focus-visible {
          outline: 3px solid Highlight;
        }
        .sommaire a[aria-current='true'],
        .chip[aria-pressed='true'],
        .prefs button[aria-pressed='true'] {
          background: Highlight;
          color: HighlightText;
          forced-color-adjust: none;
        }
      }
      ::view-transition-old(root),
      ::view-transition-new(root) {
        animation-duration: 0.28s;
      }
      @media (max-width: 40rem) {
        .hero {
          flex-direction: column;
          align-items: center;
          text-align: center;
        }
        .chapeau,
        .confiance,
        .sous-titre {
          margin-left: auto;
          margin-right: auto;
        }
        .chapeau {
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 2;
          overflow: hidden;
        }
        .chapeau.is-open {
          display: block;
          -webkit-line-clamp: unset;
          overflow: visible;
        }
        .chapeau-plus {
          display: inline;
        }
        .filtres-toggle {
          display: block;
        }
        .filtres-panel {
          display: none;
        }
        .filtres-panel.is-open {
          display: grid;
        }
        .projecteur-carte {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <a class="skip" href="#catalogue" data-i18n="skip">Aller aux applications</a>

    <div class="chrome">
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
        <button type="button" class="filtres-toggle" id="filtres-toggle" data-i18n="filtresPlus" aria-expanded="false" aria-controls="filtres-panel">Filtres</button>
        <div class="filtres-panel" id="filtres-panel">
          <div class="maturite" role="group" data-i18n-aria="maturiteFiltre" aria-label="Maturité">
            <button type="button" class="chip" data-maturity-filter="" aria-pressed="true" data-i18n="maturiteTous">Toutes</button>
            <button type="button" class="chip" data-maturity-filter="stable" aria-pressed="false" data-i18n-maturity="stable">Stable</button>
            <button type="button" class="chip" data-maturity-filter="alpha" aria-pressed="false" data-i18n-maturity="alpha">Alpha</button>
            <button type="button" class="chip" data-maturity-filter="beta" aria-pressed="false" data-i18n-maturity="beta">Bêta</button>
          </div>
          <div class="maturite plateforme" role="group" data-i18n-aria="plateformeFiltre" aria-label="Plateforme">
            <button type="button" class="chip" data-platform-filter="" aria-pressed="true" data-i18n="plateformeTous">Toutes</button>
            <button type="button" class="chip" data-platform-filter="web" aria-pressed="false" data-i18n="plateformeWeb">PWA</button>
            <button type="button" class="chip" data-platform-filter="desktop" aria-pressed="false" data-i18n="plateformeDesktop">Bureau</button>
          </div>
        </div>
        <div class="sommaire-wrap" id="sommaire-wrap">
          <nav class="sommaire" data-i18n-aria="nav" aria-label="Catégories">
${navCats}
          </nav>
        </div>
        <p class="compte" id="compte" data-i18n="compte" aria-live="polite">${nbApps} applications · ${nbCats} catégories</p>
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
        <h1 class="marque" data-i18n="marque">GuiiuG</h1>
        <p class="sous-titre" data-i18n="sousTitre">Les applications de ${COMPTE}</p>
        <p class="chapeau" id="chapeau" data-i18n="chapeau" data-i18n-pwa="chapeauPwa">
          Une famille d'applications web installables. Chacune s'installe depuis
          le navigateur, sans magasin d'applications, et la plupart continuent de
          fonctionner hors ligne une fois ouvertes. Ce catalogue aussi
          s'installe : menu ⋮ de Chrome → « Installer l'application ».
        </p>
        <button type="button" class="chapeau-plus" id="chapeau-plus" data-i18n="enSavoirPlus" aria-expanded="false" aria-controls="chapeau">En savoir plus</button>
        <p class="confiance" data-i18n="confiance">
          Open source, hébergées en Europe, sans magasin — et sans compte obligatoire pour démarrer.
        </p>
        <button type="button" class="installer" id="installer" data-i18n="installer" hidden>Installer le catalogue</button>
      </div>
    </header>

${featuredHtml}

    <div class="vide" id="filtre-vide" role="status">
      <p data-i18n="filtreVide">Aucune application ne correspond.</p>
      <button type="button" class="vide-effacer" id="filtre-effacer" data-i18n="filtreEffacer">Effacer le filtre</button>
      <p class="vide-suggestions-label" data-i18n="filtreSuggestions">Essayer une catégorie</p>
      <div class="vide-suggestions">
${videSuggestions}
      </div>
    </div>

    <main id="catalogue">
${sections.join('\n\n')}
${
  coulisses.length
    ? `
      <section class="coulisses" aria-labelledby="coulisses">
        <h2 id="coulisses" data-i18n="coulisses">Dans les coulisses</h2>
        <p class="coulisses-intro" data-i18n="coulissesIntro">Infrastructure de la famille — pas des applications à installer.</p>
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
      <p>
        <span data-i18n="maj">Mis à jour le ${dateAfficheFr}</span>
        ·
        <a href="https://github.com/${COMPTE}/${SOI}/blob/main/LICENSE" data-i18n="licence">Licence MIT</a>
      </p>
    </footer>
<script>
      (function () {
        var I18N = ${i18nJson};
        var root = document.documentElement;
        var themeMeta = document.getElementById('theme-color');
        var filtre = document.getElementById('filtre');
        var vide = document.getElementById('filtre-vide');
        var compte = document.getElementById('compte');
        var chromeEl = document.querySelector('.chrome');
        var sommaire = document.querySelector('.sommaire');
        var sommaireWrap = document.getElementById('sommaire-wrap');
        var maturityFilter = '';
        var platformFilter = '';
        var deferredPrompt = null;
        var syncingUrl = false;

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
          var plus = document.getElementById('chapeau-plus');
          var chapeau = document.getElementById('chapeau');
          if (plus && chapeau) {
            plus.textContent = chapeau.classList.contains('is-open') ? t.enSavoirMoins : t.enSavoirPlus;
          }
          updateCompte();
        }

        function resolveThemeColor() {
          var th = theme();
          if (th === 'dark') return '#0f1220';
          if (th === 'light') return '#f7f8fc';
          return window.matchMedia('(prefers-color-scheme: dark)').matches ? '#0f1220' : '#f7f8fc';
        }

        function applyTheme(th) {
          if (th !== 'light' && th !== 'dark' && th !== 'system') th = 'system';
          var run = function () {
            root.dataset.theme = th;
            try { localStorage.setItem('hub-theme', th); } catch (e) {}
            if (themeMeta) themeMeta.setAttribute('content', resolveThemeColor());
            document.querySelectorAll('[data-set-theme]').forEach(function (btn) {
              btn.setAttribute('aria-pressed', btn.getAttribute('data-set-theme') === th ? 'true' : 'false');
            });
          };
          if (document.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            document.startViewTransition(run);
          } else {
            run();
          }
        }

        function writeUrl() {
          if (syncingUrl) return;
          var p = new URLSearchParams();
          var q = filtre ? filtre.value.trim() : '';
          if (q) p.set('q', q);
          if (maturityFilter) p.set('m', maturityFilter);
          if (platformFilter) p.set('p', platformFilter);
          var qs = p.toString();
          var next = qs ? location.pathname + '?' + qs + location.hash : location.pathname + location.hash;
          var cur = location.pathname + location.search + location.hash;
          if (next !== cur) history.replaceState(null, '', next);
        }

        function updateCompte() {
          var t = I18N[lang()];
          var visible = 0;
          document.querySelectorAll('main .carte[data-search]').forEach(function (carte) {
            if (!carte.hidden) visible += 1;
          });
          var q = filtre ? filtre.value.trim() : '';
          var filtered = q !== '' || maturityFilter !== '' || platformFilter !== '';
          if (compte) {
            compte.textContent = filtered
              ? t.compteFiltre.replace('{n}', String(visible))
              : t.compte;
          }
          if (vide) vide.setAttribute('data-visible', filtered && visible === 0 ? '1' : '0');
          writeUrl();
        }

        function applyFilters() {
          var q = filtre ? filtre.value.trim().toLowerCase() : '';
          document.querySelectorAll('main .carte[data-search]').forEach(function (carte) {
            var textOk = q === '' || carte.getAttribute('data-search').indexOf(q) !== -1;
            var mat = carte.getAttribute('data-maturity') || '';
            var matOk = maturityFilter === '' || mat === maturityFilter;
            var plat = carte.getAttribute('data-platform') || '';
            var platOk = platformFilter === '' || plat === platformFilter;
            carte.hidden = !(textOk && matOk && platOk);
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
          updateCompte();
        }

        function clearFilters() {
          if (filtre) filtre.value = '';
          maturityFilter = '';
          platformFilter = '';
          document.querySelectorAll('[data-maturity-filter]').forEach(function (btn) {
            btn.setAttribute('aria-pressed', btn.getAttribute('data-maturity-filter') === '' ? 'true' : 'false');
          });
          document.querySelectorAll('[data-platform-filter]').forEach(function (btn) {
            btn.setAttribute('aria-pressed', btn.getAttribute('data-platform-filter') === '' ? 'true' : 'false');
          });
          applyFilters();
          if (filtre) filtre.focus();
        }

        function readUrl() {
          syncingUrl = true;
          var p = new URLSearchParams(location.search);
          if (filtre && p.has('q')) filtre.value = p.get('q') || '';
          if (p.has('m')) {
            maturityFilter = p.get('m') || '';
            document.querySelectorAll('[data-maturity-filter]').forEach(function (btn) {
              btn.setAttribute(
                'aria-pressed',
                (btn.getAttribute('data-maturity-filter') || '') === maturityFilter ? 'true' : 'false'
              );
            });
          }
          if (p.has('p')) {
            platformFilter = p.get('p') || '';
            document.querySelectorAll('[data-platform-filter]').forEach(function (btn) {
              btn.setAttribute(
                'aria-pressed',
                (btn.getAttribute('data-platform-filter') || '') === platformFilter ? 'true' : 'false'
              );
            });
          }
          applyFilters();
          if (p.has('cat')) {
            var target = document.getElementById('cat-' + p.get('cat'));
            if (target) {
              setTimeout(function () {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }, 50);
            }
          }
          syncingUrl = false;
        }

        function markImages() {
          document.querySelectorAll('.visuel-img').forEach(function (img) {
            var done = function () {
              img.classList.add('is-loaded');
            };
            if (img.complete && img.naturalWidth) done();
            else img.addEventListener('load', done, { once: true });
            img.addEventListener('error', done, { once: true });
          });
        }

        function updateSommaireFade() {
          if (!sommaire || !sommaireWrap) return;
          var overflow = sommaire.scrollWidth > sommaire.clientWidth + 4;
          var atEnd = sommaire.scrollLeft + sommaire.clientWidth >= sommaire.scrollWidth - 4;
          sommaireWrap.setAttribute('data-overflow', overflow && !atEnd ? '1' : '0');
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

        if (filtre) filtre.addEventListener('input', applyFilters);
        document.querySelectorAll('[data-maturity-filter]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            maturityFilter = btn.getAttribute('data-maturity-filter') || '';
            document.querySelectorAll('[data-maturity-filter]').forEach(function (b) {
              b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
            });
            applyFilters();
          });
        });
        document.querySelectorAll('[data-platform-filter]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            platformFilter = btn.getAttribute('data-platform-filter') || '';
            document.querySelectorAll('[data-platform-filter]').forEach(function (b) {
              b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
            });
            applyFilters();
          });
        });
        var effacer = document.getElementById('filtre-effacer');
        if (effacer) effacer.addEventListener('click', clearFilters);

        document.querySelectorAll('[data-suggest-cat]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            clearFilters();
            var cat = btn.getAttribute('data-suggest-cat');
            var target = document.getElementById('cat-' + cat);
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            history.replaceState(null, '', location.pathname + '?cat=' + encodeURIComponent(cat));
          });
        });

        var filtresToggle = document.getElementById('filtres-toggle');
        var filtresPanel = document.getElementById('filtres-panel');
        if (filtresToggle && filtresPanel) {
          filtresToggle.addEventListener('click', function () {
            var open = !filtresPanel.classList.contains('is-open');
            filtresPanel.classList.toggle('is-open', open);
            filtresToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
          });
        }

        var chapeauPlus = document.getElementById('chapeau-plus');
        var chapeau = document.getElementById('chapeau');
        if (chapeauPlus && chapeau) {
          chapeauPlus.addEventListener('click', function () {
            var open = !chapeau.classList.contains('is-open');
            chapeau.classList.toggle('is-open', open);
            chapeauPlus.setAttribute('aria-expanded', open ? 'true' : 'false');
            chapeauPlus.textContent = open ? I18N[lang()].enSavoirMoins : I18N[lang()].enSavoirPlus;
          });
        }

        document.addEventListener('keydown', function (e) {
          if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
            var tag = (e.target && e.target.tagName) || '';
            if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
            if (!filtre) return;
            e.preventDefault();
            filtre.focus();
            filtre.select();
          }
          if (e.key === 'Escape' && filtre && document.activeElement === filtre) {
            clearFilters();
          }
        });

        if ('IntersectionObserver' in window) {
          var links = Array.prototype.slice.call(document.querySelectorAll('.sommaire a[data-cat]'));
          var map = {};
          links.forEach(function (a) {
            map[a.getAttribute('data-cat')] = a;
          });
          var observer = new IntersectionObserver(
            function (entries) {
              entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                var id = entry.target.getAttribute('data-cat-section');
                links.forEach(function (a) {
                  a.removeAttribute('aria-current');
                });
                if (map[id]) map[id].setAttribute('aria-current', 'true');
              });
            },
            { rootMargin: '-20% 0px -65% 0px', threshold: 0 }
          );
          document.querySelectorAll('[data-cat-section]').forEach(function (sec) {
            observer.observe(sec);
          });
        }

        if (sommaire) {
          sommaire.addEventListener('scroll', updateSommaireFade, { passive: true });
          window.addEventListener('resize', updateSommaireFade);
          updateSommaireFade();
        }

        if (chromeEl && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          var lastY = window.scrollY;
          window.addEventListener(
            'scroll',
            function () {
              var y = window.scrollY;
              if (y > lastY + 8 && y > 96) chromeEl.classList.add('is-hidden');
              else if (y < lastY - 8) chromeEl.classList.remove('is-hidden');
              lastY = y;
            },
            { passive: true }
          );
        }

        var installer = document.getElementById('installer');
        window.addEventListener('beforeinstallprompt', function (e) {
          if (isPwa()) return;
          e.preventDefault();
          deferredPrompt = e;
          if (installer) {
            installer.hidden = false;
            installer.setAttribute('data-visible', '1');
          }
        });
        if (installer) {
          installer.addEventListener('click', function () {
            if (!deferredPrompt) return;
            deferredPrompt.prompt();
            deferredPrompt.userChoice.finally(function () {
              deferredPrompt = null;
              installer.hidden = true;
              installer.removeAttribute('data-visible');
            });
          });
        }
        window.addEventListener('appinstalled', function () {
          if (installer) {
            installer.hidden = true;
            installer.removeAttribute('data-visible');
          }
        });

        markImages();
        applyLang(lang());
        applyTheme(theme());
        readUrl();

        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.register('${FAMILY_ORIGIN}/sw.js').catch(function () {});
        }
      })();
    </script>
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

const sw = `/* Hub ${COMPTE} — réseau d'abord, repli offline dédié. */
const CACHE = 'hub-v3';
const OFFLINE = '${FAMILY_ORIGIN}/offline.html';
const PRECACHE = ['${FAMILY_ORIGIN}/', '${FAMILY_ORIGIN}/index.html', OFFLINE, '${FAMILY_ORIGIN}/manifest.webmanifest', '${FAMILY_ORIGIN}/icon-192.png', '${FAMILY_ORIGIN}/icon-512.png'];

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
  const nav = req.mode === 'navigate';
  event.respondWith(
    fetch(req)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() =>
        caches.match(req).then(r => r || (nav ? caches.match(OFFLINE) : caches.match('${FAMILY_ORIGIN}/')))
      )
  );
});
`;

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

mkdirSync(SORTIE, { recursive: true });
mkdirSync(join(SORTIE, 'previews'), { recursive: true });

let sharpMod = null;
try {
  sharpMod = (await import('sharp')).default;
} catch {
  console.log('sharp absent — previews en taille originale');
}
let previewsOk = 0;
for (const [id, url] of imageParApp) {
  try {
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    const destJpg = join(SORTIE, 'previews', `${id}.jpg`);
    const destWebp = join(SORTIE, 'previews', `${id}.webp`);
    if (sharpMod) {
      const base = sharpMod(buf).resize({ width: 640 });
      await base.clone().jpeg({ quality: 78, mozjpeg: true }).toFile(destJpg);
      await base.clone().webp({ quality: 72 }).toFile(destWebp);
    } else {
      writeFileSync(destJpg, buf);
    }
    previewsOk += 1;
  } catch (e) {
    console.warn(`  ! preview ${id} : ${e.message ?? e}`);
  }
}
console.log(`Previews : ${previewsOk}/${imageParApp.size}`);

writeFileSync(join(SORTIE, 'index.html'), html, 'utf8');
writeFileSync(join(SORTIE, 'offline.html'), offlineHtml, 'utf8');
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
    `previews/ (${previewsOk}), offline.html, manifest.webmanifest, sw.js, icônes PWA`
);
