/**
 * Ce que le hub publie POUR LES ROBOTS : plans de site, `robots.txt`, dates de
 * modification. Fonctions pures, hors `lireEtatEnLigne` qui prend son `fetch`
 * en paramètre : elles sont éprouvées par `node --test`, sans réseau.
 */
import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Dates de modification réelles
// ---------------------------------------------------------------------------

/**
 * L'empreinte d'une page, calculée sur son texte AVANT que la date affichée y
 * soit posée : sans ça, la date ferait changer l'empreinte, qui ferait changer
 * la date, chaque nuit.
 */
export const empreinte = texte => createHash('sha256').update(texte).digest('hex');

const JOUR = /^\d{4}-\d{2}-\d{2}$/;

/**
 * LE `lastmod` DE CHAQUE PAGE DU HUB, tiré de son contenu et non du jour de la
 * construction.
 *
 * Jusqu'au 29/09/2026, `/` était datée du jour du build : elle « changeait »
 * chaque nuit, et Google ignore un `lastmod` qu'il juge peu fiable. Désormais
 * l'état de la publication précédente (`seo-state.json`, relu en ligne avant
 * chaque construction) donne, pour chaque URL, son empreinte et son `lastmod`.
 * Même empreinte : le `lastmod` est repris. Empreinte différente, ou URL
 * nouvelle : c'est aujourd'hui.
 *
 * `modifiees` liste les URL dont le CONTENU a changé à cette construction,
 * celles qu'IndexNow doit signaler. Ce sont aussi celles dont le `lastmod` a
 * bougé, sauf dans un cas : une seconde modification le même jour laisse le
 * `lastmod` à aujourd'hui, mais la page a bien changé depuis le dernier
 * signalement, et elle est signalée de nouveau.
 *
 * @param {{ pages?: Record<string, { empreinte: string, lastmod: string }> } | null} precedent
 * @param {{ url: string, empreinte: string }[]} pages
 * @param {string} aujourdhui  AAAA-MM-JJ, en UTC
 */
export function datesDeModification(precedent, pages, aujourdhui) {
  if (!JOUR.test(aujourdhui)) throw new Error(`date invalide : ${aujourdhui}`);
  const avant = precedent?.pages ?? {};
  const etat = { version: 1, pages: {} };
  const modifiees = [];
  for (const { url, empreinte: e } of pages) {
    const a = avant[url];
    const inchangee = Boolean(a) && a.empreinte === e && JOUR.test(a.lastmod ?? '');
    etat.pages[url] = { empreinte: e, lastmod: inchangee ? a.lastmod : aujourdhui };
    if (!inchangee) modifiees.push(url);
  }
  return { etat, modifiees };
}

/**
 * Relit l'état publié, SANS JAMAIS FAIRE ÉCHOUER LA CONSTRUCTION.
 *
 * - 404 : première publication de l'état, rien à reprendre (`absent`) ;
 * - réseau ou 5xx, trois essais : `injoignable`. Toutes les pages sont alors
 *   datées d'aujourd'hui : un faux changement vaut mieux qu'un site non publié.
 *
 * Le paramètre `?t=` contourne le cache du CDN de Pages (dix minutes) : juste
 * après une publication, il servirait encore l'ancien état.
 *
 * @returns {Promise<{ etat: object | null, statut: 'lu' | 'absent' | 'injoignable' }>}
 */
export async function lireEtatEnLigne(
  url,
  { recuperer = globalThis.fetch, essais = 3, pauseMs = 1500 } = {}
) {
  for (let i = 1; i <= essais; i += 1) {
    try {
      const r = await recuperer(`${url}?t=${Date.now()}`, { cache: 'no-store' });
      if (r.status === 404) return { etat: null, statut: 'absent' };
      if (r.ok) {
        const etat = await r.json();
        if (etat && typeof etat === 'object' && etat.pages && typeof etat.pages === 'object') {
          return { etat, statut: 'lu' };
        }
        return { etat: null, statut: 'absent' };
      }
    } catch {
      // réseau, JSON illisible : on retente
    }
    if (i < essais) await new Promise(ok => setTimeout(ok, pauseMs * i));
  }
  return { etat: null, statut: 'injoignable' };
}

/** Un jour AAAA-MM-JJ, affiché : « 29 septembre 2026 » ou « 29 September 2026 ». */
export function jourAffiche(jour, langue) {
  return new Intl.DateTimeFormat(langue === 'en' ? 'en-GB' : 'fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${jour}T00:00:00Z`));
}

// ---------------------------------------------------------------------------
// Plans de site
// ---------------------------------------------------------------------------

export const echappeXml = texte =>
  String(texte)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const decodeXml = texte =>
  texte
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

/**
 * Un plan de site ordinaire. `lastmod` seul : c'est le seul champ que Google
 * lise (`changefreq` et `priority` sont ignorés).
 *
 * @param {{ loc: string, lastmod?: string }[]} entrees
 */
export function planDeSite(entrees) {
  const urls = entrees
    .map(
      ({ loc, lastmod }) =>
        `  <url>\n    <loc>${echappeXml(loc)}</loc>\n` +
        (lastmod ? `    <lastmod>${echappeXml(lastmod)}</lastmod>\n` : '') +
        '  </url>'
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

/**
 * L'INDEX DES PLANS DE SITE, publié à `/sitemap.xml`. Il liste celui du hub et
 * celui de chaque site servi sous l'origine : une seule soumission dans Search
 * Console et Bing Webmaster Tools, et une seule ligne `Sitemap:` au robots.txt.
 * Un index peut nommer des plans de sous-chemins de la même origine ; chaque
 * plan d'app ne liste que des URL sous son propre chemin, comme le veut le
 * protocole.
 *
 * @param {{ loc: string, lastmod?: string | null }[]} plans
 */
export function indexDePlans(plans) {
  const corps = plans
    .map(
      ({ loc, lastmod }) =>
        `  <sitemap>\n    <loc>${echappeXml(loc)}</loc>\n` +
        (lastmod ? `    <lastmod>${echappeXml(lastmod)}</lastmod>\n` : '') +
        '  </sitemap>'
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${corps}
</sitemapindex>
`;
}

/**
 * Les `<url>` d'un plan de site : adresse et `lastmod`, décodés.
 * @returns {{ loc: string, lastmod: string | null }[]}
 */
export function urlsDuPlan(xml) {
  const urls = [];
  for (const [, bloc] of String(xml).matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = /<loc>([^<]+)<\/loc>/.exec(bloc)?.[1]?.trim();
    if (!loc) continue;
    const lastmod = /<lastmod>([^<]+)<\/lastmod>/.exec(bloc)?.[1]?.trim() ?? null;
    urls.push({ loc: decodeXml(loc), lastmod });
  }
  return urls;
}

/**
 * Le `lastmod` le plus récent d'un plan, ramené au jour : celui de l'index.
 * Un plan change quand l'une de ses dates change, c'est le meilleur repère
 * qu'on ait de sa dernière modification.
 */
export function dernierLastmod(entrees) {
  const jours = entrees
    .map(e => e.lastmod?.slice(0, 10))
    .filter(j => j && JOUR.test(j))
    .sort();
  return jours.at(-1) ?? null;
}

// ---------------------------------------------------------------------------
// robots.txt
// ---------------------------------------------------------------------------

/**
 * Moteurs de recherche et de réponse : ils indexent une page, ou la lisent à la
 * demande d'un utilisateur, pour répondre à une question en citant leur source.
 */
export const ROBOTS_RECHERCHE = [
  'bingbot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'PerplexityBot',
  'Perplexity-User',
  'Claude-SearchBot',
  'Claude-User',
];

/** Robots et jetons d'entraînement de modèles de langue. */
export const ROBOTS_ENTRAINEMENT = [
  'GPTBot',
  'ClaudeBot',
  'Google-Extended',
  'Applebot-Extended',
  'CCBot',
];

/**
 * Le robots.txt de l'origine. La politique ne change pas, tout est ouvert. Les
 * groupes nommés L'ÉCRIVENT, robot par robot : le choix devient explicite, et
 * pourra un jour changer pour une famille sans toucher aux autres.
 */
export function robotsTxt({ origine }) {
  return `# ${origine}/robots.txt
#
# Un robots.txt n'est lu QU'À LA RACINE d'une origine. Celui d'un sous-chemin,
# /miss-dice/robots.txt par exemple, est ignoré des robots : ce fichier est
# donc le seul qui compte pour tous les sites servis sous cette origine.
#
# LA POLITIQUE : tout est ouvert, à tous les robots. Les groupes nommés plus
# bas ne changent rien à la règle générale ; ils l'écrivent, robot par robot,
# pour que le choix soit explicite. Un robot suit le groupe le plus précis qui
# le nomme (RFC 9309) : pour lui, son groupe remplace le groupe « * ». Aucun
# « Disallow » : tout changement de politique se décide, il ne s'improvise pas.
#
# Engendré à la publication par scripts/build-site.mjs.

# Tous les robots.
User-agent: *
Allow: /

# Moteurs de recherche et de réponse. bingbot indexe pour Bing ;
# OAI-SearchBot, PerplexityBot et Claude-SearchBot indexent pour les moteurs de
# réponse de ChatGPT, Perplexity et Claude ; ChatGPT-User, Perplexity-User et
# Claude-User lisent une page à la demande d'un utilisateur.
${ROBOTS_RECHERCHE.map(r => `User-agent: ${r}`).join('\n')}
Allow: /

# Entraînement de modèles de langue : autorisé lui aussi, comme tout le reste.
# L'écrire à part permet d'en décider un jour autrement sans toucher aux
# moteurs. GPTBot, ClaudeBot et CCBot collectent des pages pour l'entraînement.
# Google-Extended et Applebot-Extended sont des jetons de contrôle, pas des
# robots : ils ne décident que de l'usage des pages pour l'entraînement, et ne
# changent rien à l'indexation par Google Search ou par Applebot.
${ROBOTS_ENTRAINEMENT.map(r => `User-agent: ${r}`).join('\n')}
Allow: /

# Un seul plan de site : un INDEX, qui nomme celui du hub et celui de chaque
# site publié sous l'origine.
Sitemap: ${origine}/sitemap.xml
`;
}

// ---------------------------------------------------------------------------
// Robots, côté page
// ---------------------------------------------------------------------------

/**
 * UN AGENT UTILISATEUR DE ROBOT. La page du hub s'en sert pour ne JAMAIS
 * poser le titre court devant un robot : Bing indexe la page rendue, et
 * « GuiiuG » seul y était classé « Title too short ».
 *
 * Les noms connus d'abord, puis un générique BORNÉ : « bot », « crawler » ou
 * « spider » en mot isolé, ou en fin de jeton produit suivi d'une version
 * (`AhrefsBot/7.0`). Un simple /bot/ prendrait aussi les téléphones CUBOT, dont
 * le modèle figure dans l'agent utilisateur.
 */
export const MOTIF_ROBOT =
  /googlebot|google-inspectiontool|bingbot|bingpreview|applebot|duckduckbot|yandexbot|baiduspider|gptbot|oai-searchbot|chatgpt-user|claudebot|claude-user|claude-searchbot|perplexitybot|perplexity-user|facebookexternalhit|twitterbot|linkedinbot|\b(?:bot|crawler|spider)\b|[a-z0-9](?:bot|crawler|spider)\//i;
