/**
 * LA COLLECTE DU HUB : tout ce que la construction lit sur le réseau.
 *
 * Le catalogue du socle et ses libellés, à la dernière version publiée ; la
 * liste des dépôts publics du compte ; les sondes des sites publiés (accueil,
 * plan de site, pages de contenu, image de partage, icône) ; la dernière
 * version des applications de bureau ; le module `command.js` du socle. Ce
 * module ne rend rien : il rend des données, que `accueil.mjs` met en page sans
 * réseau.
 *
 * EN PARALLÈLE, MAIS BORNÉE. Les sondes partaient une à une : près de deux cents
 * requêtes attendues l'une après l'autre, 96 s de construction. Elles partent
 * désormais ensemble, huit au plus en vol (`enFile`), et les résultats sont
 * rangés dans l'ordre du catalogue : la page ne dépend pas de l'ordre
 * d'arrivée des réponses.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { alternatesDe } from './guides.mjs';
import { PAGES_BUREAU } from './pages-hub.mjs';
import { dernierLastmod, urlsDuPlan } from './seo-hub.mjs';

const ICI = dirname(fileURLToPath(import.meta.url));
/** La copie de travail du socle, dépôt voisin : seulement avec `HUB_SOCLE_LOCAL=1`. */
const COMMAND_LOCAL = join(ICI, '..', '..', 'dev-pwa-config', 'command.js');

/** Requêtes en vol au plus, vers GitHub Pages comme vers raw.githubusercontent.com. */
export const REQUETES_EN_VOL = 8;

const pause = ms => new Promise(ok => setTimeout(ok, ms));

// ---------------------------------------------------------------------------
// Accès réseau
// ---------------------------------------------------------------------------

/**
 * Une file d'attente : au plus `n` tâches en cours, les suivantes attendent
 * leur tour. Chaque tâche lit sa réponse jusqu'au bout avant de rendre sa
 * place, pour que la borne compte aussi les corps en cours de lecture.
 */
export function limiteur(n) {
  let enCours = 0;
  const file = [];
  const suivante = () => {
    if (enCours >= n || !file.length) return;
    enCours += 1;
    const { tache, ok, ko } = file.shift();
    Promise.resolve()
      .then(tache)
      .then(ok, ko)
      .finally(() => {
        enCours -= 1;
        suivante();
      });
  };
  return tache =>
    new Promise((ok, ko) => {
      file.push({ tache, ok, ko });
      suivante();
    });
}

const enFile = limiteur(REQUETES_EN_VOL);

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

/**
 * Code HTTP d'une URL, retenté : une sonde isolée qui échoue ne prouve rien.
 *
 * HEAD d'abord : la sonde ne lit que le statut, et une image de partage pèse
 * jusqu'à 90 Ko, que la sonde en GET téléchargeait pour rien. Un serveur qui
 * refuse HEAD (405, 501) est relu en GET, dont le corps est abandonné.
 */
export async function statut(url, { essais = 3, pauseMs = 1500, recuperer = fetch } = {}) {
  for (let i = 1; i <= essais; i += 1) {
    try {
      const code = await enFile(async () => {
        const tete = await recuperer(url, { method: 'HEAD', redirect: 'follow' });
        if (tete.status !== 405 && tete.status !== 501) return tete.status;
        const r = await recuperer(url, { redirect: 'follow' });
        await r.body?.cancel();
        return r.status;
      });
      if (code === 200 || i === essais) return code;
    } catch {
      if (i === essais) return 0;
    }
    await pause(pauseMs * i);
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
      const lu = await enFile(async () => {
        const r = await fetch(url);
        if (r.ok) return { texte: await r.text() };
        await r.body?.cancel();
        return { code: r.status };
      });
      if (lu.texte !== undefined) return lu.texte;
      if (lu.code === 404) return null;
    } catch {
      // réseau : on retente
    }
    if (i < essais) await pause(1500 * i);
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
  const lues = await Promise.all(
    entrees.map(async ({ loc }) => {
      if (loc === base || !loc.startsWith(base)) return null;
      const html = await lire(loc);
      if (!html) return null;
      const titre = /<h1[^>]*>([\s\S]*?)<\/h1>/i
        .exec(html)?.[1]
        ?.replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      const langue = (/<html[^>]*\slang="([a-z]{2})/i.exec(html)?.[1] ?? 'fr').toLowerCase();
      return titre
        ? { url: loc, titre: decode(titre), langue, alternates: alternatesDe(html) }
        : null;
    })
  );
  return { pages: lues.filter(Boolean), lastmod: dernierLastmod(entrees) };
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
 *
 * Ce code s'exécute dans le processus de la construction : `build-site.mjs`
 * retire le jeton GitHub de `process.env` avant d'appeler la collecte.
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
 * `command.js` du socle (recherche Ctrl+K), À L'ÉTIQUETTE QUE LIT DÉJÀ LA
 * CONSTRUCTION, et nulle part ailleurs.
 *
 * Jusqu'ici, absent de l'étiquette, il était pris sur `main` : la page publiait
 * du code que le socle n'avait pas encore publié. Et une copie de travail du
 * socle, dépôt voisin, passait avant tout : un build local embarquait ce qui
 * s'y trouvait ce jour-là. Désormais :
 *   - présent à l'étiquette : son texte ;
 *   - absent (404) : `null`, et l'accueil se construit sans le raccourci ;
 *   - la copie locale ne sert que si on la demande, `HUB_SOCLE_LOCAL=1` ;
 *   - toute autre réponse, après trois essais, fait échouer la construction :
 *     un raccourci présent un soir et absent le lendemain changerait
 *     l'empreinte de la page pour rien.
 *
 * @returns {Promise<string|null>}
 */
export async function texteCommandDuSocle(
  { compte, socle },
  etiquette,
  {
    local = process.env.HUB_SOCLE_LOCAL === '1',
    cheminLocal = COMMAND_LOCAL,
    recuperer = fetch,
    essais = 3,
    pauseMs = 1500,
  } = {}
) {
  if (local) {
    if (!existsSync(cheminLocal)) {
      throw new Error(`HUB_SOCLE_LOCAL=1, mais ${cheminLocal} est absent`);
    }
    return readFileSync(cheminLocal, 'utf8');
  }
  const url = `https://raw.githubusercontent.com/${compte}/${socle}/${etiquette}/command.js`;
  for (let i = 1; i <= essais; i += 1) {
    try {
      const r = await recuperer(url);
      if (r.ok) return await r.text();
      if (r.status === 404) return null;
    } catch {
      // réseau : on retente
    }
    if (i < essais) await pause(pauseMs * i);
  }
  throw new Error(`command.js @ ${etiquette} : illisible après ${essais} essais`);
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

  const [catalogue, labelsFr, labelsEn, command] = await Promise.all([
    moduleDuSocle(depot, version, 'apps-catalog.js'),
    moduleDuSocle(depot, version, 'react/labels-fr.js'),
    moduleDuSocle(depot, version, 'react/labels-en.js'),
    texteCommandDuSocle(depot, version),
  ]);
  const libellesFr = labelsFr.default;
  const libellesEn = labelsEn.default;
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
  const sondes = await Promise.all(
    FAMILY_APPS.map(async app => {
      // Une application de bureau pointe vers son dépôt : rien à sonder sur Pages.
      if (!surOrigine(app.appUrl)) return { app, horsOrigine: true };
      const code = await statut(app.appUrl);
      if (code !== 200) {
        return { app, code, pages: [], lastmod: null, aImage: false, aIcone: false };
      }
      const [{ pages, lastmod }, aImage, aIcone] = await Promise.all([
        pagesDe(app.appUrl),
        statut(`${app.appUrl}og-image.jpg`).then(c => c === 200),
        statut(`${app.appUrl}icon-192.png`).then(c => c === 200),
      ]);
      return { app, code, pages, lastmod, aImage, aIcone };
    })
  );

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
  for (const { app, horsOrigine, code, pages, lastmod, aImage, aIcone } of sondes) {
    if (horsOrigine) {
      console.log(`  · ${app.id.padEnd(20)} hors origine (${app.platform})`);
      continue;
    }
    pagesParApp.set(app.id, pages);
    lastmodParPlan.set(app.appUrl, lastmod);
    if (aImage) imageParApp.set(app.id, `${app.appUrl}og-image.jpg`);
    if (aIcone) iconeParApp.set(app.id, `${app.appUrl}icon-192.png`);
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
  /** Nom du site hors catalogue → ses pages de contenu (le squelette en a une). */
  const pagesParSite = new Map();
  const lus = await Promise.all(
    depots.map(async d => {
      const base = `${FAMILY_ORIGIN}/${d.name}/`;
      const estApp = idsCatalogue.has(d.name);
      const [plan, titre] = await Promise.all([
        statut(`${base}sitemap.xml`).then(c => c === 200),
        estApp ? null : titreDe(base).then(t => t ?? d.name),
      ]);
      // Le plan d'une app a déjà été lu par sa sonde.
      const contenu = plan && !lastmodParPlan.has(base) ? await pagesDe(base) : null;
      return { site: { nom: d.name, base, plan, estApp, titre, desc: d.description }, contenu };
    })
  );
  const sites = [];
  for (const { site, contenu } of lus) {
    if (contenu) {
      lastmodParPlan.set(site.base, contenu.lastmod);
      if (!site.estApp) pagesParSite.set(site.nom, contenu.pages);
    }
    sites.push(site);
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
  const bureau = await Promise.all(
    FAMILY_APPS.filter(app => !surOrigine(app.appUrl) && PAGES_BUREAU[app.id]).map(
      async app => {
        const derniere = await apiOuNull(`repos/${compte}/${app.id}/releases/latest`, jeton);
        return {
          app,
          chemin: `/${app.id}.html`,
          version: derniere
            ? { tag: derniere.tag_name, url: derniere.html_url, date: derniere.published_at?.slice(0, 10) ?? null }
            : null,
        };
      }
    )
  );
  for (const { app, version: v } of bureau) {
    console.log(`  · ${app.id.padEnd(20)} page du hub /${app.id}.html · ${v ? v.tag : 'aucune version publiée'}`);
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
  };
}
