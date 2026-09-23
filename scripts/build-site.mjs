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
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SORTIE = process.argv[2] ?? '_site';
const COMPTE = 'mister-guiiug';
const SOCLE = 'dev-pwa-config';
const SOI = `${COMPTE}.github.io`;
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
const libelles = (await moduleDuSocle(version, 'react/labels-fr.js')).default;
const { FAMILY_APPS, CATEGORIES, FAMILY_ORIGIN } = catalogue;

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
for (const app of FAMILY_APPS) {
  // Une application de bureau pointe vers son dépôt : rien à sonder sur Pages.
  if (!surOrigine(app.appUrl)) {
    console.log(`  · ${app.id.padEnd(20)} hors origine (${app.platform})`);
    continue;
  }
  const code = await statut(app.appUrl);
  console.log(`  ${code === 200 ? '✓' : '✗'} ${app.id.padEnd(20)} ${code}`);
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
      publisher: {
        '@type': 'Person',
        name: COMPTE,
        url: `https://github.com/${COMPTE}`,
      },
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
    : ` <span class="badge">${echappe(libelles.maturity?.[m] ?? m)}</span>`;

const carteApp = app => {
  const bureau = app.platform === 'desktop';
  return `          <li class="carte">
            <h3><a href="${echappe(app.appUrl)}">${echappe(app.name)}</a>${maturite(app.maturity)}${bureau ? ' <span class="badge">Application de bureau</span>' : ''}</h3>
            <p>${echappe(app.description)}</p>
          </li>`;
};

const sections = CATEGORIES.map(cat => {
  const apps = FAMILY_APPS.filter(a => a.category === cat);
  if (!apps.length) return null;
  return `      <section aria-labelledby="cat-${cat}">
        <h2 id="cat-${cat}">${echappe(libelles.categories?.[cat] ?? cat)}</h2>
        <ul>
${apps.map(carteApp).join('\n')}
        </ul>
      </section>`;
}).filter(Boolean);

const carteCoulisse = s => `          <li class="carte">
            <h3><a href="/${echappe(s.nom)}/">${echappe(s.titre)}</a></h3>
            <p>${echappe(s.desc)}</p>
          </li>`;

const description =
  `Les applications web installables de ${COMPTE} : ` +
  FAMILY_APPS.slice(0, 6)
    .map(a => a.name)
    .join(', ') +
  ', et les autres.';

const html = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Les applications de ${COMPTE}</title>
    <meta name="description" content="${echappe(description)}" />
    <link rel="canonical" href="${FAMILY_ORIGIN}/" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="Les applications de ${COMPTE}" />
    <meta property="og:description" content="${echappe(description)}" />
    <meta property="og:url" content="${FAMILY_ORIGIN}/" />
    <script type="application/ld+json">${jsonLd}</script>
    <style>
      :root {
        color-scheme: light dark;
        --fond: #ffffff;
        --texte: #1a1b26;
        --doux: #55586b;
        --bord: #d9dbe6;
        --lien: #2f4bd1;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --fond: #0f1220;
          --texte: #e8e9f2;
          --doux: #a8abc2;
          --bord: #2a2e45;
          --lien: #9fb2ff;
        }
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0 auto;
        max-width: 60rem;
        padding: 2.5rem 1.25rem 4rem;
        background: var(--fond);
        color: var(--texte);
        font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        line-height: 1.6;
      }
      h1 {
        font-size: clamp(1.6rem, 5vw, 2.3rem);
        margin: 0 0 0.5rem;
      }
      .chapeau {
        color: var(--doux);
        max-width: 42rem;
        margin: 0 0 1.5rem;
      }
      h2 {
        font-size: 1.05rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--doux);
        margin: 2.25rem 0 0.9rem;
      }
      ul {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 0.9rem;
        /* min() : sans lui, une piste ne descend jamais sous 17rem et
           déborde d'un écran plus étroit que 17rem plus les marges. */
        grid-template-columns: repeat(auto-fill, minmax(min(17rem, 100%), 1fr));
      }
      .carte {
        border: 1px solid var(--bord);
        border-radius: 0.75rem;
        padding: 1rem 1.1rem;
      }
      .carte h3 {
        font-size: 1.05rem;
        margin: 0 0 0.35rem;
      }
      .carte p {
        margin: 0;
        color: var(--doux);
        font-size: 0.92rem;
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
      }
      footer {
        margin-top: 3rem;
        padding-top: 1.5rem;
        border-top: 1px solid var(--bord);
        color: var(--doux);
        font-size: 0.9rem;
      }
    </style>
  </head>
  <body>
    <header>
      <h1>Les applications de ${COMPTE}</h1>
      <p class="chapeau">
        Une famille d'applications web installables. Chacune s'installe depuis
        le navigateur, sans magasin d'applications, et la plupart continuent de
        fonctionner hors ligne une fois ouvertes.
      </p>
    </header>

    <main>
${sections.join('\n\n')}
${
  coulisses.length
    ? `
      <section class="coulisses" aria-labelledby="coulisses">
        <h2 id="coulisses">Dans les coulisses</h2>
        <ul>
${coulisses.map(carteCoulisse).join('\n')}
        </ul>
      </section>`
    : ''
}
    </main>

    <footer>
      <p>
        Code source sur
        <a href="https://github.com/${COMPTE}">github.com/${COMPTE}</a>.
      </p>
    </footer>
  </body>
</html>
`;

mkdirSync(SORTIE, { recursive: true });
writeFileSync(join(SORTIE, 'index.html'), html, 'utf8');
writeFileSync(join(SORTIE, 'robots.txt'), robots, 'utf8');
writeFileSync(join(SORTIE, 'sitemap.xml'), sitemap, 'utf8');
// Le contenu exact que Google attend, au caractère près.
writeFileSync(
  join(SORTIE, VERIFICATION_GOOGLE),
  `google-site-verification: ${VERIFICATION_GOOGLE}`,
  'utf8'
);

console.log(
  `\nÉcrit dans ${SORTIE}/ : index.html (${FAMILY_APPS.length} applications en ` +
    `${sections.length} catégories, ${coulisses.length} en coulisses), ` +
    `robots.txt (${sites.filter(s => s.plan).length + 1} plans de site), sitemap.xml, ` +
    VERIFICATION_GOOGLE
);
