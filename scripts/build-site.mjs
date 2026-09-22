/**
 * Génère `index.html`, `robots.txt` et `sitemap.xml` depuis l'état RÉEL du
 * compte : la liste des dépôts publics qui servent des Pages, leur description
 * telle qu'elle est écrite sur GitHub, et le titre que chaque site annonce.
 *
 * POURQUOI UN GÉNÉRATEUR. Vingt-deux entrées recopiées à la main pourrissent à
 * la vingt-troisième application, et une liste d'accueil périmée est pire
 * qu'absente : elle promet des pages qui n'existent plus. Ici, rien n'est
 * inventé — tout vient de l'API ou d'une requête au site lui-même.
 *
 * ON NE DÉCLARE QUE CE QUI RÉPOND. Un `Sitemap:` pointant vers un 404 est du
 * bruit envoyé aux robots : chaque plan de site est sondé avant d'être inscrit,
 * et chaque site avant d'être lié.
 *
 * Usage : node scripts/build-site.mjs   (demande `gh` authentifié + réseau)
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const COMPTE = 'mister-guiiug';
const ORIGINE = `https://${COMPTE}.github.io`;

/** Dépôts publiés qui ne sont pas des applications destinées au public. */
const OUTILS = new Set(['dev-pwa-config', 'pwa-starter-kit', 'parc-dashboard']);

/** Le dépôt d'accueil lui-même : il ne se liste pas. */
const SOI = `${COMPTE}.github.io`;

const echappe = texte =>
  String(texte ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * `execFileSync` fait figurer la ligne de commande complète dans ses messages
 * d'erreur : on n'y passe jamais de secret. `gh` lit le sien depuis son propre
 * magasin, rien ne transite par ici.
 */
function gh(...args) {
  return execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
}

/** Code HTTP d'une URL, ou 0 si elle ne répond pas. */
async function statut(url) {
  try {
    const r = await fetch(url, { redirect: 'follow' });
    return r.status;
  } catch {
    return 0;
  }
}

/** Titre annoncé par un site, ou `null`. */
async function titreDe(url) {
  try {
    const html = await (await fetch(url)).text();
    const m = html.match(/<title>([^<]*)<\/title>/i);
    return m ? m[1].trim() || null : null;
  } catch {
    return null;
  }
}

console.log('Lecture des dépôts…');
const bruts = JSON.parse(
  gh(
    'api',
    `users/${COMPTE}/repos?per_page=100&type=public`,
    '--paginate',
    '--slurp'
  )
).flat();

const candidats = bruts
  .filter(d => d.has_pages && !d.archived && d.name !== SOI)
  .map(d => ({ nom: d.name, description: d.description ?? '' }))
  .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

console.log(`${candidats.length} dépôts avec Pages. Sondage…`);

const sites = [];
for (const c of candidats) {
  const base = `${ORIGINE}/${c.nom}/`;
  const codeSite = await statut(base);
  if (codeSite !== 200) {
    console.warn(`  ✗ ${c.nom} : le site répond ${codeSite}, écarté`);
    continue;
  }
  const codeSitemap = await statut(`${base}sitemap.xml`);
  const titre = (await titreDe(base)) ?? c.nom;
  sites.push({ ...c, base, titre, sitemap: codeSitemap === 200 });
  console.log(
    `  ✓ ${c.nom.padEnd(20)} sitemap ${codeSitemap === 200 ? 'oui' : 'non'}`
  );
}

const applications = sites.filter(s => !OUTILS.has(s.nom));
const outils = sites.filter(s => OUTILS.has(s.nom));

// ---------------------------------------------------------------------------
// robots.txt — LA RAISON D'ÊTRE DE CE DÉPÔT.
// ---------------------------------------------------------------------------
const robots = `# ${ORIGINE}/robots.txt
#
# Un robots.txt n'est lu QU'À LA RACINE d'une origine. Celui d'un sous-chemin
# — /miss-dice/robots.txt, par exemple — est parfaitement ignoré des robots,
# et le plan de site qu'il déclare avec lui. Ce fichier existe pour ça :
# rassembler, au seul endroit qui soit lu, les plans de site des applications
# servies sous cette origine.
#
# Généré par scripts/build-site.mjs. Chaque plan de site ci-dessous a été
# sondé et répondait 200 à la génération.

User-agent: *
Allow: /

Sitemap: ${ORIGINE}/sitemap.xml
${sites
  .filter(s => s.sitemap)
  .map(s => `Sitemap: ${s.base}sitemap.xml`)
  .join('\n')}
`;

// ---------------------------------------------------------------------------
// sitemap.xml — la page d'accueil seule ; chaque application a le sien.
// ---------------------------------------------------------------------------
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${ORIGINE}/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`;

// ---------------------------------------------------------------------------
// index.html — la SEULE page du parc dont le corps est servi tel quel.
// Les applications sont rendues par React : un robot qui n'exécute pas le
// JavaScript ne voit chez elles qu'un <div> vide. Ici, tout est dans le HTML.
// ---------------------------------------------------------------------------
const carte = s => `        <li class="app">
          <h3><a href="/${s.nom}/">${echappe(s.titre)}</a></h3>
          <p>${echappe(s.description)}</p>
        </li>`;

const description =
  'Les applications web installables du compte mister-guiiug : ' +
  applications
    .slice(0, 6)
    .map(a => a.titre.split(/\s[—-]\s/)[0])
    .join(', ') +
  ', et les autres.';

const html = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Les applications de ${COMPTE}</title>
    <meta name="description" content="${echappe(description)}" />
    <link rel="canonical" href="${ORIGINE}/" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="Les applications de ${COMPTE}" />
    <meta property="og:description" content="${echappe(description)}" />
    <meta property="og:url" content="${ORIGINE}/" />
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
        margin: 0 0 2.5rem;
      }
      h2 {
        font-size: 1.15rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--doux);
        margin: 2.5rem 0 1rem;
      }
      ul {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        gap: 0.9rem;
        grid-template-columns: repeat(auto-fill, minmax(17rem, 1fr));
      }
      .app {
        border: 1px solid var(--bord);
        border-radius: 0.75rem;
        padding: 1rem 1.1rem;
      }
      .app h3 {
        font-size: 1.05rem;
        margin: 0 0 0.35rem;
      }
      .app p {
        margin: 0;
        color: var(--doux);
        font-size: 0.92rem;
      }
      a {
        color: var(--lien);
      }
      a:focus-visible {
        outline: 3px solid var(--lien);
        outline-offset: 2px;
      }
      footer {
        margin-top: 3.5rem;
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
      <section>
        <h2>Applications</h2>
        <ul>
${applications.map(carte).join('\n')}
        </ul>
      </section>

      <section>
        <h2>Outils</h2>
        <ul>
${outils.map(carte).join('\n')}
        </ul>
      </section>
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

writeFileSync('robots.txt', robots, 'utf8');
writeFileSync('sitemap.xml', sitemap, 'utf8');
writeFileSync('index.html', html, 'utf8');

console.log(
  `\nÉcrit : index.html (${applications.length} applications, ${outils.length} outils), ` +
    `robots.txt (${sites.filter(s => s.sitemap).length + 1} plans de site), sitemap.xml`
);
