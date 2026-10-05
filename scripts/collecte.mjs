/**
 * LA COLLECTE DU HUB : tout ce que la construction lit sur le réseau.
 *
 * Le catalogue du socle et ses libellés, à la dernière version publiée ; la
 * liste des dépôts publics du compte ; les sondes des sites publiés (accueil,
 * plan de site, pages de contenu, image de partage, icône) ; la dernière
 * version des applications de bureau. Ce module ne rend rien : il rend des
 * données, que `accueil.mjs` met en page sans réseau.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { alternatesDe } from './guides.mjs';
import { PAGES_BUREAU } from './pages-hub.mjs';
import { dernierLastmod, urlsDuPlan } from './seo-hub.mjs';

const ICI = dirname(fileURLToPath(import.meta.url));
/** Socle local (sibling sous GithubMister) — priorité sur le fetch publié. */
const COMMAND_LOCAL = join(ICI, '..', '..', 'dev-pwa-config', 'command.js');

// ---------------------------------------------------------------------------
// Accès réseau
// ---------------------------------------------------------------------------

/** Requête à l'API GitHub. Le jeton ne quitte jamais l'en-tête. */
async function api(chemin, jeton) {
  const r = await fetch(`https://api.github.com/${chemin}`, {
    headers: {
      accept: 'application/vnd.github+json',
      ...(jeton ? { authorization: `Bearer ${jeton}` } : {}),
    },
  });
  if (!r.ok) throw new Error(`API GitHub ${chemin} → HTTP ${r.status}`);
  return r.json();
}

/**
 * Comme `api`, mais un 404 est une RÉPONSE : `null` (« pas de version publiée »).
 * Toute autre erreur fait échouer la construction, comme `api` : une page qui
 * dirait « aucun installateur » parce que l'API a hoqueté mentirait.
 */
async function apiOuNull(chemin, jeton) {
  const r = await fetch(`https://api.github.com/${chemin}`, {
    headers: {
      accept: 'application/vnd.github+json',
      ...(jeton ? { authorization: `Bearer ${jeton}` } : {}),
    },
  });
  if (r.status === 404) return null;
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
 * Le texte d'une URL, ou `null`, retenté. UNE LECTURE MANQUÉE CHANGERAIT LA
 * PAGE : un guide omis un soir, puis revenu le lendemain, ferait bouger deux
 * fois l'empreinte de l'accueil, donc son `lastmod`, et partir deux signalements
 * IndexNow pour rien. Un 404 est une réponse, pas une panne : pas de nouvel essai.
 */
async function lire(url, essais = 3) {
  for (let i = 1; i <= essais; i += 1) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.text();
      if (r.status === 404) return null;
    } catch {
      // réseau : on retente
    }
    if (i < essais) await new Promise(ok => setTimeout(ok, 1500 * i));
  }
  return null;
}

/**
 * Les pages de contenu d'un site : les URL de son plan de site autres que
 * l'accueil, avec le titre (`<h1>`) et la langue (`<html lang>`) de chacune, et
 * les traductions qu'elle déclare (`<link rel="alternate" hreflang>`, que
 * `regrouperGuides` apparie), et le `lastmod` le plus récent du plan (pour
 * l'index des plans de site). Depuis
 * le socle 6.17.0, chaque `content/pages/<slug>.md` d'une app devient
 * `<slug>.html` et entre à son plan de site ; les pages anglaises y entreront de
 * même. Les lister ICI donne à chacune un lien depuis le hub, avec son titre pour
 * ancre. Une page qui ne répond pas est simplement omise.
 */
async function pagesDe(base) {
  const xml = await lire(`${base}sitemap.xml`);
  if (!xml) return { pages: [], lastmod: null };
  const entrees = urlsDuPlan(xml);
  const pages = [];
  for (const { loc } of entrees) {
    if (loc === base || !loc.startsWith(base)) continue;
    const html = await lire(loc);
    if (!html) continue;
    const titre = /<h1[^>]*>([\s\S]*?)<\/h1>/i
      .exec(html)?.[1]
      ?.replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const langue = (/<html[^>]*\slang="([a-z]{2})/i.exec(html)?.[1] ?? 'fr').toLowerCase();
    if (titre) {
      pages.push({ url: loc, titre: decode(titre), langue, alternates: alternatesDe(html) });
    }
  }
  return { pages, lastmod: dernierLastmod(entrees) };
}

/** Titre annoncé par un site, ou `null`. */
async function titreDe(url) {
  const html = await lire(url);
  const titre = html?.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1].trim();
  return titre ? decode(titre) : null;
}

/**
 * Importe un module AUTONOME du socle à une étiquette donnée. Le texte passe par
 * une URL `data:` : aucun fichier temporaire, et aucun risque qu'un import
 * relatif aille chercher ailleurs — ces deux modules n'en ont pas.
 */
async function moduleDuSocle({ compte, socle }, etiquette, chemin) {
  const url = `https://raw.githubusercontent.com/${compte}/${socle}/${etiquette}/${chemin}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${chemin} @ ${etiquette} → HTTP ${r.status}`);
  const texte = await r.text();
  return import(
    `data:text/javascript;base64,${Buffer.from(texte).toString('base64')}`
  );
}

/**
 * `command.js` du socle : copie locale sibling d'abord, sinon raw GitHub
 * (étiquette de release, puis `main`). Le paquet npm n'exporte pas encore
 * ce module ; la page doit rester autonome hors ligne.
 */
export async function texteCommandDuSocle({ compte, socle }, etiquette) {
  if (existsSync(COMMAND_LOCAL)) return readFileSync(COMMAND_LOCAL, 'utf8');
  for (const ref of [etiquette, 'main']) {
    const url = `https://raw.githubusercontent.com/${compte}/${socle}/${ref}/command.js`;
    const r = await fetch(url);
    if (r.ok) return await r.text();
  }
  throw new Error(
    `command.js introuvable : ni ${COMMAND_LOCAL}, ni raw GitHub (${etiquette}|main)`
  );
}

// ---------------------------------------------------------------------------
// Lecture
// ---------------------------------------------------------------------------

/**
 * Tout ce que lit la construction.
 *
 * @param {object} p
 * @param {string} p.compte  le compte GitHub
 * @param {string} p.socle   le dépôt du socle
 * @param {string} p.soi     le dépôt du hub, exclu des sites publiés
 * @param {string} p.jeton   un jeton GitHub, ou la chaîne vide
 * @param {boolean} p.strict une app muette fait échouer la construction
 */
export async function collecter({ compte, socle, soi, jeton, strict }) {
  const depot = { compte, socle };
  const { tag_name: version } = await api(`repos/${compte}/${socle}/releases/latest`, jeton);
  console.log(`Catalogue du socle ${version}…`);

  const catalogue = await moduleDuSocle(depot, version, 'apps-catalog.js');
  const libellesFr = (await moduleDuSocle(depot, version, 'react/labels-fr.js')).default;
  const libellesEn = (await moduleDuSocle(depot, version, 'react/labels-en.js')).default;
  const { FAMILY_APPS, CATEGORIES, FAMILY_ORIGIN } = catalogue;

  console.log('Sites publiés…');
  const depotsPublics = (
    await api(`users/${compte}/repos?per_page=100&type=owner`, jeton)
  ).filter(d => !d.private && !d.archived);
  const depots = depotsPublics.filter(d => d.has_pages && d.name !== soi);
  /** Les dépôts qui acceptent des issues : le contact de la page « À propos ». */
  const avecIssues = new Set(depotsPublics.filter(d => d.has_issues).map(d => d.name));

  // -------------------------------------------------------------------------
  // Sondes
  // -------------------------------------------------------------------------

  const surOrigine = url => url.startsWith(`${FAMILY_ORIGIN}/`);

  console.log(`${FAMILY_APPS.length} applications au catalogue :`);
  const enPanne = [];
  /** id de l'app → ses pages de contenu. */
  const pagesParApp = new Map();
  /** URL de base d'un site → `lastmod` le plus récent de son plan de site. */
  const lastmodParPlan = new Map();
  /**
   * id de l'app → URL distante de son og-image (1200×630), si elle répond.
   * À la publication on en écrit une miniature 640w dans `previews/<id>.jpg`
   * (+ `.webp` si sharp est dispo) : même source, poids mobile réduit.
   */
  const imageParApp = new Map();
  /** id de l'app → URL de son icon-192 (repli quand og-image manque). */
  const iconeParApp = new Map();
  for (const app of FAMILY_APPS) {
    // Une application de bureau pointe vers son dépôt : rien à sonder sur Pages.
    if (!surOrigine(app.appUrl)) {
      console.log(`  · ${app.id.padEnd(20)} hors origine (${app.platform})`);
      continue;
    }
    const code = await statut(app.appUrl);
    const { pages, lastmod } =
      code === 200 ? await pagesDe(app.appUrl) : { pages: [], lastmod: null };
    pagesParApp.set(app.id, pages);
    lastmodParPlan.set(app.appUrl, lastmod);
    const imageUrl = `${app.appUrl}og-image.jpg`;
    const aImage = code === 200 && (await statut(imageUrl)) === 200;
    if (aImage) imageParApp.set(app.id, imageUrl);
    const iconUrl = `${app.appUrl}icon-192.png`;
    const aIcone = code === 200 && (await statut(iconUrl)) === 200;
    if (aIcone) iconeParApp.set(app.id, iconUrl);
    console.log(
      `  ${code === 200 ? '✓' : '✗'} ${app.id.padEnd(20)} ${code}` +
        (pages.length ? ` · ${pages.length} page(s) de contenu` : '') +
        (aImage ? ' · image' : aIcone ? ' · icône' : '')
    );
    if (code !== 200) enPanne.push(`${app.id} (${code})`);
  }
  if (enPanne.length) {
    const msg =
      `\nApplications du catalogue hors ligne : ${enPanne.join(', ')}.` +
      (strict
        ? `\nHUB_STRICT=1 — rien n'est publié ; Pages continue de servir la version précédente.`
        : `\nPublication partielle : bandeau « non vérifiée » sur ces cartes.`);
    if (strict) {
      console.error(msg);
      process.exit(1);
    }
    console.warn(msg);
  }

  const idsCatalogue = new Set(FAMILY_APPS.map(a => a.id));
  const sites = [];
  /** Nom du site hors catalogue → ses pages de contenu (le squelette en a une). */
  const pagesParSite = new Map();
  for (const d of depots) {
    const base = `${FAMILY_ORIGIN}/${d.name}/`;
    const plan = (await statut(`${base}sitemap.xml`)) === 200;
    const estApp = idsCatalogue.has(d.name);
    const titre = estApp ? null : ((await titreDe(base)) ?? d.name);
    if (plan && !lastmodParPlan.has(base)) {
      const { pages, lastmod } = await pagesDe(base);
      lastmodParPlan.set(base, lastmod);
      if (!estApp) pagesParSite.set(d.name, pages);
    }
    sites.push({ nom: d.name, base, plan, estApp, titre, desc: d.description });
  }
  const coulisses = sites
    .filter(s => !s.estApp)
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

  /**
   * Les applications de bureau qui ont une page sur le hub : elles n'ont pas de
   * site Pages, c'est leur seule présence indexable sur l'origine. Leur dernière
   * version publiée est lue sur l'API, pour ne jamais annoncer un installateur
   * qui n'existe pas.
   */
  const bureau = [];
  for (const app of FAMILY_APPS) {
    if (surOrigine(app.appUrl) || !PAGES_BUREAU[app.id]) continue;
    const derniere = await apiOuNull(`repos/${compte}/${app.id}/releases/latest`, jeton);
    bureau.push({
      app,
      chemin: `/${app.id}.html`,
      version: derniere
        ? { tag: derniere.tag_name, url: derniere.html_url, date: derniere.published_at?.slice(0, 10) ?? null }
        : null,
    });
    console.log(`  · ${app.id.padEnd(20)} page du hub /${app.id}.html · ${derniere ? derniere.tag_name : 'aucune version publiée'}`);
  }
  const pageDeBureau = new Map(bureau.map(b => [b.app.id, b]));

  return {
    version,
    catalogue,
    apps: FAMILY_APPS,
    categories: CATEGORIES,
    origine: FAMILY_ORIGIN,
    libellesFr,
    libellesEn,
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
  };
}
