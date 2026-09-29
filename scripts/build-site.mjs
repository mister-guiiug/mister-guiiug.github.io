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
 * ÉCHOUER EST SÛR. Si une application du catalogue ne répond pas, la
 * construction échoue — et Pages continue de servir la version précédente. On
 * ne publie jamais une page qui promettrait un 404. Chaque sonde est retentée
 * avant de conclure.
 *
 * Usage : node scripts/build-site.mjs [dossier-de-sortie]
 * Un `GITHUB_TOKEN` (ou `GH_TOKEN`) dans l'environnement relève la limite de
 * l'API ; sans lui, ses quelques requêtes passent quand même.
 */
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  copyFileSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { serviceWorkerHub } from './hub-sw.mjs';
import { INDEXNOW_CLE } from './indexnow-cle.mjs';
import { appsNonRelevees, pageAPropos } from './page-a-propos.mjs';
import {
  JETONS,
  PAGES_BUREAU,
  dater,
  entiteEditeur,
  entiteSite,
  jsonLdTexte,
  page404,
} from './pages-hub.mjs';
import {
  MOTIF_ROBOT,
  datesDeModification,
  dernierLastmod,
  empreinte,
  indexDePlans,
  lireEtatEnLigne,
  planDeSite,
  robotsTxt,
  urlsDuPlan,
} from './seo-hub.mjs';

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

/**
 * Comme `api`, mais un 404 est une RÉPONSE : `null` (« pas de version publiée »).
 * Toute autre erreur fait échouer la construction, comme `api` : une page qui
 * dirait « aucun installateur » parce que l'API a hoqueté mentirait.
 */
async function apiOuNull(chemin) {
  const r = await fetch(`https://api.github.com/${chemin}`, {
    headers: {
      accept: 'application/vnd.github+json',
      ...(JETON ? { authorization: `Bearer ${JETON}` } : {}),
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
 * le `lastmod` le plus récent du plan (pour l'index des plans de site). Depuis
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
    if (titre) pages.push({ url: loc, titre: decode(titre), langue });
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
const depotsPublics = (
  await api(`users/${COMPTE}/repos?per_page=100&type=owner`)
).filter(d => !d.private && !d.archived);
const depots = depotsPublics.filter(d => d.has_pages && d.name !== SOI);
/** Les dépôts qui acceptent des issues : le contact de la page « À propos ». */
const avecIssues = new Set(depotsPublics.filter(d => d.has_issues).map(d => d.name));

// ---------------------------------------------------------------------------
// Sondes
// ---------------------------------------------------------------------------

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
  const derniere = await apiOuNull(`repos/${COMPTE}/${app.id}/releases/latest`);
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

// ---------------------------------------------------------------------------
// robots.txt — lu SEULEMENT à la racine d'une origine
// ---------------------------------------------------------------------------

// Une seule ligne `Sitemap:`, vers l'index : voir scripts/seo-hub.mjs.
const robots = robotsTxt({ origine: FAMILY_ORIGIN });

// ---------------------------------------------------------------------------
// Données structurées — le site, son éditeur, et la liste de ses applications
// ---------------------------------------------------------------------------

/**
 * Un `WebSite`, son éditeur et un `ItemList` : ce que la page EST (l'accueil
 * d'une famille d'applications), qui la publie, et ce qu'elle liste. Chaque
 * application porte déjà son propre `WebApplication` (socle, `pwaSeoPlugin`) ;
 * ici on ne fait que les nommer et les relier, par leur URL.
 *
 * L'ÉDITEUR EST UNE SEULE ENTITÉ, `#org`, la même sur toutes les pages du hub
 * (scripts/pages-hub.mjs) et celle que le socle référencera par son `@id`.
 *
 * `<` est échappé : une description contenant `</script>` fermerait le bloc.
 */
const donneesStructurees = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      ...entiteSite({ origine: FAMILY_ORIGIN, compte: COMPTE }),
      potentialAction: {
        '@type': 'ViewAction',
        target: `${FAMILY_ORIGIN}/`,
        name: `Les applications de ${COMPTE}`,
      },
    },
    entiteEditeur({ origine: FAMILY_ORIGIN, compte: COMPTE }),
    {
      '@type': 'ItemList',
      name: `Applications de ${COMPTE}`,
      // Les apps servies sur l'origine, et les apps de bureau par leur page du
      // hub : l'adresse d'un dépôt GitHub n'est pas une page du parc.
      itemListElement: FAMILY_APPS.filter(
        a => surOrigine(a.appUrl) || pageDeBureau.has(a.id)
      ).map((a, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: surOrigine(a.appUrl) ? a.appUrl : `${FAMILY_ORIGIN}${pageDeBureau.get(a.id).chemin}`,
        name: a.name,
      })),
    },
  ],
};
const jsonLd = jsonLdTexte(donneesStructurees);

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

/**
 * La vignette d'une app : la miniature de son image de partage. Son `alt` la
 * décrit (« Aperçu de Miss Dice ») : vide, Bing la comptait parmi les images
 * sans texte de remplacement, vingt sur la page. Le bascule FR/EN le traduit.
 */
const visuelPreview = (id, nom, sizes) => `
            <span class="visuel">
              <picture>
                <source type="image/webp" srcset="${FAMILY_ORIGIN}/previews/${echappe(id)}.webp" />
                <img
                  class="visuel-img"
                  src="${FAMILY_ORIGIN}/previews/${echappe(id)}.jpg"
                  alt="${echappe(`Aperçu de ${nom}`)}"
                  data-alt-fr="${echappe(`Aperçu de ${nom}`)}"
                  data-alt-en="${echappe(`Preview of ${nom}`)}"
                  width="640"
                  height="336"
                  sizes="${echappe(sizes)}"
                  loading="lazy"
                  decoding="async"
                />
              </picture>
            </span>`;

const visuelMono = nom => {
  const initiale = [...String(nom ?? '?')][0]?.toUpperCase() ?? '?';
  return `
            <span class="visuel visuel-mono" aria-hidden="true">
              <span class="mono-lettre">${echappe(initiale)}</span>
            </span>`;
};

/** Le guide d'une carte : le premier en français, langue du hub servi. */
const guideDeCarte = pages => pages.find(p => p.langue === 'fr') ?? pages[0];

/**
 * Le lien principal d'une carte. Une app web s'ouvre hors du shell du hub ;
 * une app de bureau mène à SA PAGE DU HUB, qui dit ce qu'elle est et comment
 * l'obtenir : c'est une page du hub, elle s'ouvre donc sur place.
 */
const lienPrincipal = (app, texte, attrs) => {
  const page = pageDeBureau.get(app.id);
  return page
    ? `<a href="${FAMILY_ORIGIN}${page.chemin}"${attrs}>${texte}</a>`
    : lienHorsShell(app.appUrl, texte, attrs);
};

const carteApp = (app, featuredId) => {
  const bureau = app.platform === 'desktop';
  const pages = pagesParApp.get(app.id) ?? [];
  const aImage = imageParApp.has(app.id);
  const descEn = DESC_EN[app.id] ?? app.description;
  const premierePage = guideDeCarte(pages);
  const plateforme = bureau ? 'desktop' : 'web';
  const aLaUne = featuredId && app.id === featuredId;
  const libelleOuvrir = pageDeBureau.has(app.id)
    ? '<span data-i18n="presentation">Présentation</span>'
    : '<span data-i18n="ouvrir">Ouvrir</span>';
  const actions = `
            <p class="actions">
              ${lienPrincipal(app, libelleOuvrir, ' class="action action-ouvrir"')}
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
    // Chercher « yahtzee » trouve Miss Dice : le titre de ses guides en parle.
    ...pages.map(p => p.titre),
  ]
    .join(' ')
    .toLowerCase();
  const visuel = aImage
    ? visuelPreview(app.id, app.name, '(max-width: 40rem) 100vw, 320px')
    : visuelMono(app.name);
  const badgeBureau = bureau
    ? ` <span class="badge" data-i18n="badgeDesktop">${echappe('Application de bureau')}</span>`
    : '';
  const badgeUne = aLaUne
    ? ` <span class="badge badge-une" data-i18n="aLaUne">${echappe('À la une')}</span>`
    : '';
  const classes = ['carte', bureau ? 'carte-bureau' : '', aLaUne ? 'carte-une' : '']
    .filter(Boolean)
    .join(' ');
  const rang =
    app.maturity === 'stable' ? '0' : app.maturity === 'beta' ? '1' : '2';
  return `          <li class="${classes}" data-search="${echappe(recherche)}" data-maturity="${echappe(app.maturity)}" data-platform="${plateforme}" data-cat="${echappe(app.category)}" data-name="${echappe(app.name.toLowerCase())}" data-rang="${rang}">
            ${lienPrincipal(app, '', ` class="carte-hit" tabindex="-1" aria-hidden="true"`)}
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

const ordreApps = (a, b) => {
  const rang = m => (m === 'stable' ? 0 : m === 'beta' ? 1 : 2);
  return rang(a.maturity) - rang(b.maturity) || a.name.localeCompare(b.name, 'fr');
};

const sections = CATEGORIES.map(cat => {
  const apps = FAMILY_APPS.filter(a => a.category === cat).slice().sort(ordreApps);
  if (!apps.length) return null;
  return `      <section data-cat-section="${echappe(cat)}" aria-labelledby="cat-${cat}">
        <h2 id="cat-${cat}" data-i18n-cat="${echappe(cat)}">${echappe(libellesFr.categories?.[cat] ?? cat)}</h2>
        <ul data-grille>
${apps.map(a => carteApp(a, featuredId)).join('\n')}
        </ul>
      </section>`;
}).filter(Boolean);

const featuredPages = featuredApp ? (pagesParApp.get(featuredApp.id) ?? []) : [];
const featuredGuide = guideDeCarte(featuredPages);
const featuredDescEn = featuredApp
  ? (DESC_EN[featuredApp.id] ?? featuredApp.description)
  : '';
const featuredHtml = featuredApp
  ? `
    <aside class="projecteur" aria-labelledby="projecteur-titre">
      <p class="projecteur-label" id="projecteur-titre" data-i18n="projecteur">Coup de projecteur</p>
      <div class="projecteur-carte">
        ${lienPrincipal(featuredApp, '', ` class="carte-hit" tabindex="-1" aria-hidden="true"`)}
${imageParApp.has(featuredApp.id) ? visuelPreview(featuredApp.id, featuredApp.name, '(max-width: 40rem) 100vw, 480px').replace('loading="lazy"', '') : visuelMono(featuredApp.name)}
        <div class="corps">
          <h2 class="projecteur-nom">${echappe(featuredApp.name)}</h2>
          <p data-fr="${echappe(featuredApp.description)}" data-en="${echappe(featuredDescEn)}">${echappe(featuredApp.description)}</p>
          <p class="actions">
            ${lienPrincipal(featuredApp, pageDeBureau.has(featuredApp.id) ? '<span data-i18n="presentation">Présentation</span>' : '<span data-i18n="ouvrir">Ouvrir</span>', ' class="action action-ouvrir"')}
            ${
              featuredGuide
                ? lienHorsShell(
                    featuredGuide.url,
                    '<span data-i18n="guide">Guide</span>',
                    ` class="action action-guide guide-lien" title="${echappe(featuredGuide.titre)}"`
                  )
                : ''
            }
          </p>
        </div>
      </div>
    </aside>`
  : '';

const urlsHasard = FAMILY_APPS.filter(
  a => a.maturity === 'stable' && surOrigine(a.appUrl)
).map(a => a.appUrl);
const hasardJson = JSON.stringify(urlsHasard).replace(/</g, '\\u003c');

const carteCoulisse = s => {
  // Le squelette a sa page de contenu : elle n'était liée de nulle part.
  const guide = guideDeCarte(pagesParSite.get(s.nom) ?? []);
  return `          <li class="carte">
            ${lienHorsShell(`/${s.nom}/`, '', ` class="carte-hit" aria-label="${echappe(s.titre)}"`)}
            <div class="corps">
              <h3><span class="nom">${echappe(s.titre)}</span></h3>
              <p>${echappe(s.desc)}</p>${
                guide
                  ? `
              <p class="actions">
                ${lienHorsShell(guide.url, '<span data-i18n="guide">Guide</span>', ` class="action action-guide guide-lien" title="${echappe(guide.titre)}"`)}
              </p>`
                  : ''
              }
            </div>
          </li>`;
};

// ---------------------------------------------------------------------------
// Guides pratiques — TOUTES les pages de contenu, dans le HTML servi
// ---------------------------------------------------------------------------

/** « PWA Starter Kit - squelette… » → « PWA Starter Kit » : le nom, sans l'accroche. */
const nomCourt = titre => String(titre).split(/\s[-–—]\s/)[0].trim();

/**
 * LES GUIDES, TOUS, AVEC LEUR TITRE POUR ANCRE. Le hub ne liait que la
 * PREMIÈRE page de contenu de chaque app, sous l'ancre « Guide », qui ne dit
 * rien de la page ; les suivantes, et celle du squelette, n'avaient aucun lien
 * depuis l'origine. Groupés par catégorie, dans l'ordre du catalogue ; les
 * sites hors catalogue viennent en dernier. Les pages anglaises, qui vont
 * entrer aux plans de site, portent leur `lang` et leur `hreflang`.
 */
const groupesGuides = [
  ...catsAvecApps.map(cat => ({
    cle: cat,
    libelle: libellesFr.categories?.[cat] ?? cat,
    attribut: `data-i18n-cat="${echappe(cat)}"`,
    entrees: FAMILY_APPS.filter(a => a.category === cat)
      .slice()
      .sort(ordreApps)
      .flatMap(a =>
        (pagesParApp.get(a.id) ?? []).map(p => ({ ...p, nom: a.name, site: a.appUrl }))
      ),
  })),
  {
    cle: 'coulisses',
    libelle: 'Dans les coulisses',
    attribut: 'data-i18n="coulisses"',
    entrees: coulisses.flatMap(s =>
      (pagesParSite.get(s.nom) ?? []).map(p => ({ ...p, nom: nomCourt(s.titre), site: s.base }))
    ),
  },
].filter(g => g.entrees.length);
const nbGuides = groupesGuides.reduce((n, g) => n + g.entrees.length, 0);
const languesGuides = new Set(groupesGuides.flatMap(g => g.entrees.map(e => e.langue)));
/** Une seule langue : aucune étiquette. Plusieurs : chaque guide dit la sienne. */
const plusieursLangues = languesGuides.size > 1;

const entreeGuide = e => {
  const langue = e.langue === 'fr' ? '' : ` lang="${echappe(e.langue)}"`;
  const etiquette = plusieursLangues
    ? ` <span class="guide-langue">${echappe(e.langue.toUpperCase())}</span>`
    : '';
  return `              <li${langue}>
                ${lienHorsShell(e.url, echappe(e.titre), ` class="guide-titre" hreflang="${echappe(e.langue)}"`)}${etiquette}
                <span class="guide-meta">${lienHorsShell(e.site, echappe(e.nom), ' class="guide-app"')}</span>
              </li>`;
};

const guidesHtml = nbGuides
  ? `
      <section class="guides" aria-labelledby="guides">
        <h2 id="guides" data-i18n="guides">Guides pratiques</h2>
        <p class="guides-intro" data-i18n="guidesIntro">Les pages de contenu des applications : méthodes pas à pas, règles et questions fréquentes.</p>
        <div class="guides-grille">
${groupesGuides
  .map(
    g => `          <section class="guides-groupe" aria-labelledby="guides-${g.cle}">
            <h3 id="guides-${g.cle}" ${g.attribut}>${echappe(g.libelle)}</h3>
            <ul class="guides-liste">
${g.entrees.map(entreeGuide).join('\n')}
            </ul>
          </section>`
  )
  .join('\n')}
        </div>
      </section>`
  : '';

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

// Bing SEO/GEO : titre ≥ 50 car. Le H1 visible est la marque ; le <title> reste
// descriptif, et le reste une fois la page rendue (voir `appliqueTitre`).
const titrePage = `Les applications de ${COMPTE} - PWA web installables hors magasin`;
const titrePageEn = `${COMPTE}'s apps - installable PWAs, no app store`;

/**
 * « Mis à jour le … » : la date du dernier VRAI changement de la page, pas celle
 * du build de la nuit. La page est engendrée avec un jeton à sa place ; la date
 * n'est posée qu'après le calcul de l'empreinte (voir « Dates de modification »
 * plus bas).
 */
const majFr = `Mis à jour le ${JETONS.majFr}`;
const majEn = `Updated ${JETONS.majEn}`;

/**
 * « Open source, hébergées en Europe. Aucun compte n'est nécessaire pour
 * commencer. » : deux affirmations fausses ou invérifiables, retirées le
 * 29/09/2026. Les pages sont servies par GitHub Pages, et miss-uwh comme
 * mister-doc demandent un compte. Ne reste que ce qui se vérifie : le code est
 * public, sous licence MIT ; les apps sont gratuites ; elles s'installent
 * depuis le navigateur.
 */
const confianceFr =
  "Open source et gratuites, installables sans passer par un magasin d'applications.";
const confianceEn = 'Open source and free, installable without going through an app store.';

const nbApps = FAMILY_APPS.length;
const nbCats = catsAvecApps.length;

const i18nJson = JSON.stringify({
  fr: {
    title: titrePage,
    description,
    marque: 'GuiiuG',
    sousTitre: `Les applications de ${COMPTE}`,
    chapeau:
      "Des applications web à installer depuis le navigateur. Pas de magasin, et la plupart restent utilisables hors ligne.",
    chapeauPwa:
      "Des applications web, chacune ouverte en dehors de ce catalogue. Pas de magasin, et la plupart restent utilisables hors ligne.",
    confiance: confianceFr,
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
    filtre: 'Rechercher une application',
    filtrePh: 'Rechercher…',
    sites: 'Pages du parc',
    siteCatalogue: 'Catalogue',
    siteShowroom: 'Showroom',
    siteParc: 'Parc',
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
    triFiltre: 'Tri',
    triStable: 'Stables d’abord',
    triAz: 'A–Z',
    hasard: 'Au hasard',
    haut: 'Retour en haut',
    coulissesIntro: 'Infrastructure de la famille — pas des applications à installer.',
    licence: 'Licence MIT',
    nav: 'Catégories',
    guide: 'Guide',
    guides: 'Guides pratiques',
    guidesIntro:
      'Les pages de contenu des applications : méthodes pas à pas, règles et questions fréquentes.',
    aPropos: 'À propos',
    presentation: 'Présentation',
    skip: 'Aller aux applications',
    installer: 'Installer le catalogue',
    projecteur: 'Coup de projecteur',
    maturiteTous: 'Toutes',
    maturiteFiltre: 'Maturité',
    compte: `${nbApps} applications · ${nbCats} catégories`,
    compteFiltre: '{n} sur ' + nbApps,
    maj: majFr,
    // Le titre de la FENÊTRE de l'app installée, et d'elle seule.
    titleCourt: 'GuiiuG',
    categories: libellesFr.categories,
    maturity: libellesFr.maturity,
  },
  en: {
    title: titrePageEn,
    description: descriptionEn,
    marque: 'GuiiuG',
    sousTitre: `Apps by ${COMPTE}`,
    chapeau:
      'Web apps you install from the browser. No app store, and most keep working offline.',
    chapeauPwa:
      'Web apps, each one opened outside this catalogue. No app store, and most keep working offline.',
    confiance: confianceEn,
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
    filtre: 'Search apps',
    filtrePh: 'Search…',
    sites: 'Family pages',
    siteCatalogue: 'Catalogue',
    siteShowroom: 'Showroom',
    siteParc: 'Estate',
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
    triFiltre: 'Sort',
    triStable: 'Stable first',
    triAz: 'A–Z',
    hasard: 'Feeling lucky',
    haut: 'Back to top',
    coulissesIntro: 'Family infrastructure — not apps to install.',
    licence: 'MIT license',
    nav: 'Categories',
    guide: 'Guide (FR)',
    guides: 'Practical guides',
    // Tant que tous les guides sont en français, la phrase le dit.
    guidesIntro: plusieursLangues || !languesGuides.has('fr')
      ? 'Content pages from the apps: step-by-step methods, rules and FAQs.'
      : 'Content pages from the apps: step-by-step methods, rules and FAQs, in French.',
    aPropos: 'About (FR)',
    presentation: 'Overview (FR)',
    skip: 'Skip to apps',
    installer: 'Install this catalogue',
    projecteur: 'Spotlight',
    maturiteTous: 'All',
    maturiteFiltre: 'Maturity',
    compte: `${nbApps} apps · ${nbCats} categories`,
    compteFiltre: '{n} of ' + nbApps,
    maj: majEn,
    titleCourt: 'GuiiuG',
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
    <meta name="theme-color" content="${THEME}" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#0f1220" media="(prefers-color-scheme: dark)" />
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
    <meta name="twitter:description" content="${echappe(description)}" />
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
        var mac = /Mac|iPhone|iPad/.test(navigator.platform || '') || /Mac/.test(navigator.userAgent || '');
        document.documentElement.dataset.mod = mac ? 'meta' : 'ctrl';
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
      .chrome-slot {
        min-height: var(--chrome-h, 0px);
      }
      .chrome {
        position: sticky;
        top: 0;
        z-index: 20;
        margin: 0 0 1.25rem;
        padding: 0.4rem 1rem 0.75rem;
        background: var(--chrome);
        border-bottom: 1px solid color-mix(in srgb, var(--bord) 70%, transparent);
        transition: transform 0.2s ease;
      }
      .chrome.is-hidden {
        transform: translateY(calc(-100% - 1px));
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
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        margin: 0 0 0.75rem;
        min-width: 0;
      }
      .identite {
        display: flex;
        align-items: center;
        gap: 0.7rem;
        min-width: 0;
        flex: 1 1 auto;
      }
      .identite-texte {
        min-width: 0;
      }
      .prefs {
        display: flex;
        flex: 0 0 auto;
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
        width: 2.75rem;
        height: 2.75rem;
        border-radius: 0.7rem;
        flex-shrink: 0;
        box-shadow: 0 4px 14px color-mix(in srgb, var(--texte) 12%, transparent);
      }
      .hero-texte {
        min-width: 0;
      }
      .marque {
        font-family: "Trebuchet MS", "Segoe UI", ui-sans-serif, system-ui, sans-serif;
        font-size: clamp(1.35rem, 2.6vw, 1.65rem);
        font-weight: 700;
        letter-spacing: -0.03em;
        line-height: 1.05;
        margin: 0;
      }
      .sous-titre {
        margin: 0.12rem 0 0;
        color: var(--doux);
        font-size: 0.92rem;
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
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
        min-width: 0;
      }
      .filtre {
        position: relative;
        display: block;
        min-width: 0;
        margin: 0 0 0.75rem;
      }
      .filtre-ico {
        position: absolute;
        left: 0.85rem;
        top: 50%;
        width: 1.05rem;
        height: 1.05rem;
        transform: translateY(-50%);
        color: var(--doux);
        pointer-events: none;
        display: flex;
      }
      .filtre-ico svg {
        width: 100%;
        height: 100%;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.75;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      .filtre input {
        width: 100%;
        min-height: 2.75rem;
        padding: 0.55rem 5.6rem 0.55rem 2.55rem;
        border: 1px solid color-mix(in srgb, var(--bord) 75%, var(--lien));
        border-radius: 0.9rem;
        background: var(--fond-carte);
        color: var(--texte);
        font: inherit;
        box-shadow:
          0 1px 2px color-mix(in srgb, var(--texte) 6%, transparent),
          0 10px 28px color-mix(in srgb, var(--lien) 7%, transparent);
      }
      .filtre input::-webkit-search-cancel-button {
        -webkit-appearance: none;
        appearance: none;
      }
      .filtre input::placeholder {
        color: var(--doux);
      }
      .filtre:focus-within input {
        padding-right: 0.95rem;
        border-color: var(--lien);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--lien) 28%, transparent);
      }
      .filtre input:focus-visible {
        outline: none;
      }
      .filtre-kbd {
        position: absolute;
        right: 0.5rem;
        top: 50%;
        transform: translateY(-50%);
        display: inline-flex;
        gap: 0.22rem;
        margin: 0;
        pointer-events: none;
      }
      .filtre-kbd span {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 1.35rem;
        padding: 0.08rem 0.38rem;
        border: 1px solid var(--bord);
        border-bottom-width: 2px;
        border-radius: 0.35rem;
        background: var(--barre);
        color: var(--doux);
        font-family: ui-monospace, "Cascadia Mono", "Segoe UI Mono", monospace;
        font-size: 0.68rem;
        line-height: 1.45;
      }
      .filtre-kbd [data-mod='meta'] {
        display: none;
      }
      html[data-mod='meta'] .filtre-kbd [data-mod='ctrl'] {
        display: none;
      }
      html[data-mod='meta'] .filtre-kbd [data-mod='meta'] {
        display: inline-flex;
      }
      .filtre:focus-within .filtre-kbd {
        opacity: 0;
      }
      .sites {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
        margin: 0 0 0.65rem;
      }
      .sites a {
        display: inline-flex;
        align-items: center;
        min-height: 2rem;
        padding: 0.1rem 0.7rem;
        border: 1px solid var(--bord);
        border-radius: 999px;
        background: var(--fond-carte);
        color: var(--texte);
        font-size: 0.82rem;
        font-weight: 600;
        text-decoration: none;
      }
      .sites a[aria-current='page'] {
        border-color: var(--lien);
        background: color-mix(in srgb, var(--lien) 14%, var(--fond-carte));
        color: var(--lien);
      }
      .compte {
        margin: 0;
        color: var(--doux);
        font-size: 0.85rem;
      }
      .maturite {
        display: inline-flex;
        flex-wrap: wrap;
        gap: 0.3rem;
        align-items: center;
        width: fit-content;
        max-width: 100%;
        padding: 0.28rem 0.4rem 0.28rem 0.7rem;
        border: 1px solid var(--bord);
        border-radius: 999px;
        background: color-mix(in srgb, var(--barre) 65%, var(--fond-carte));
      }
      .rail-label {
        margin-right: 0.15rem;
        color: var(--doux);
        font-size: 0.72rem;
        font-weight: 600;
        letter-spacing: 0.02em;
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
        padding: 0.15rem 0.35rem;
        scroll-padding-inline: 0.35rem;
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
        margin: 0 0 2rem;
        padding: 1.1rem 1.1rem 1.25rem;
        border: 1px solid var(--bord);
        border-radius: 1.15rem;
        background: color-mix(in srgb, var(--lien) 6%, var(--fond-carte));
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
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
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
        box-shadow: 0 8px 22px color-mix(in srgb, var(--texte) 10%, transparent);
      }
      @media (prefers-reduced-motion: reduce) {
        .carte,
        .projecteur-carte {
          transition: none;
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
      .carte .visuel,
      .projecteur-carte .visuel {
        display: block;
        aspect-ratio: 1200 / 630;
        background: var(--bord);
      }
      .visuel-mono {
        display: grid;
        place-items: center;
        background:
          radial-gradient(circle at 30% 25%, color-mix(in srgb, var(--lien) 28%, transparent), transparent 55%),
          var(--barre);
      }
      .mono-lettre {
        font-family: "Trebuchet MS", "Segoe UI", ui-sans-serif, system-ui, sans-serif;
        font-size: clamp(2.5rem, 8vw, 3.5rem);
        font-weight: 700;
        color: var(--lien);
        opacity: 0.85;
        line-height: 1;
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
      .coulisses-titre {
        display: inline-flex;
        align-items: center;
        gap: 0.45rem;
      }
      .coulisses-titre .ico {
        display: inline-flex;
        width: 1rem;
        height: 1rem;
        color: var(--doux);
      }
      .coulisses-titre .ico svg {
        width: 100%;
        height: 100%;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.75;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      .coulisses-intro {
        margin: 0 0 0.9rem;
        color: var(--doux);
        font-size: 0.9rem;
        font-weight: 400;
        text-transform: none;
        letter-spacing: 0;
      }
      main > section[data-cat-section] {
        content-visibility: auto;
        contain-intrinsic-size: auto 28rem;
      }
      .haut {
        position: fixed;
        right: max(1rem, env(safe-area-inset-right, 0px));
        bottom: max(1rem, env(safe-area-inset-bottom, 0px));
        z-index: 30;
        display: none;
        align-items: center;
        justify-content: center;
        width: 2.75rem;
        height: 2.75rem;
        border: 1px solid var(--bord);
        border-radius: 999px;
        background: color-mix(in srgb, var(--fond-carte) 90%, transparent);
        color: var(--lien);
        text-decoration: none;
        box-shadow: 0 4px 14px color-mix(in srgb, var(--texte) 12%, transparent);
      }
      .haut[data-visible='1'] {
        display: inline-flex;
      }
      .haut .ico {
        width: 1.15rem;
        height: 1.15rem;
      }
      .haut .ico svg {
        width: 100%;
        height: 100%;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.75;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      .parcours {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        margin: 0 0 1.25rem;
      }
      .parcours .chip-link {
        text-decoration: none;
      }
      .guides {
        margin-top: 3rem;
      }
      .guides-intro {
        margin: -0.35rem 0 1rem;
        max-width: 42rem;
        color: var(--doux);
        font-size: 0.92rem;
      }
      .guides-grille {
        display: grid;
        gap: 1rem;
        grid-template-columns: repeat(auto-fill, minmax(min(17rem, 100%), 1fr));
      }
      .guides-groupe {
        min-width: 0;
        padding: 0.9rem 1.05rem 1rem;
        border: 1px solid var(--bord);
        border-radius: 1rem;
        background: var(--fond-carte);
      }
      .guides-groupe h3 {
        margin: 0 0 0.65rem;
        color: var(--doux);
        font-size: 0.78rem;
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }
      ul.guides-liste {
        grid-template-columns: minmax(0, 1fr);
        gap: 0.75rem;
      }
      .guide-titre {
        font-weight: 600;
        line-height: 1.35;
        text-decoration: none;
      }
      .guide-titre:hover {
        text-decoration: underline;
      }
      .guide-meta {
        display: block;
        margin-top: 0.1rem;
        font-size: 0.82rem;
      }
      .guide-app {
        color: var(--doux);
      }
      .guide-langue {
        display: inline-block;
        margin-left: 0.3rem;
        padding: 0 0.35rem;
        border: 1px solid var(--bord);
        border-radius: 0.3rem;
        color: var(--doux);
        font-size: 0.68rem;
        font-weight: 700;
        vertical-align: 0.1em;
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
      .outils-ligne {
        display: flex;
        align-items: center;
        gap: 0.55rem;
        min-width: 0;
      }
      .outils-ligne .sommaire-wrap {
        flex: 1 1 auto;
      }
      .filtres-toggle {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        flex: 0 0 auto;
        min-height: 2.25rem;
        padding: 0.3rem 0.75rem;
        border: 1px solid var(--bord);
        border-radius: 999px;
        background: var(--barre);
        color: var(--texte);
        font: inherit;
        font-size: 0.85rem;
        font-weight: 600;
        cursor: pointer;
      }
      .filtres-toggle .ico {
        display: inline-flex;
        width: 0.95rem;
        height: 0.95rem;
      }
      .filtres-toggle .ico svg {
        width: 100%;
        height: 100%;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.75;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
      .filtres-toggle[aria-expanded='true'],
      .filtres-toggle[data-count]:not([data-count='0']) {
        border-color: var(--lien);
        color: var(--lien);
        background: color-mix(in srgb, var(--lien) 10%, var(--barre));
      }
      .filtres-badge {
        display: none;
        min-width: 1.15rem;
        height: 1.15rem;
        padding: 0 0.28rem;
        border-radius: 999px;
        background: var(--lien);
        color: var(--fond);
        font-size: 0.68rem;
        font-weight: 700;
        line-height: 1;
        align-items: center;
        justify-content: center;
      }
      .filtres-toggle[data-count]:not([data-count='0']) .filtres-badge {
        display: inline-flex;
      }
      .filtres-panel {
        display: grid;
        grid-template-rows: 0fr;
        margin-top: -0.65rem;
        transition: grid-template-rows 0.22s ease, margin-top 0.22s ease;
      }
      .filtres-panel.is-open {
        grid-template-rows: 1fr;
        margin-top: 0;
      }
      .filtres-panel-inner {
        overflow: hidden;
        min-height: 0;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.55rem;
      }
      .sommaire-wrap {
        position: relative;
        min-width: 0;
      }
      .sommaire-wrap::before,
      .sommaire-wrap::after {
        content: '';
        position: absolute;
        top: 0;
        bottom: 0;
        width: 2.25rem;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.15s;
        z-index: 1;
      }
      .sommaire-wrap::before {
        left: 0;
        background: linear-gradient(to left, transparent, var(--chrome));
      }
      .sommaire-wrap[data-overflow-start='1']::before {
        opacity: 1;
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
        .chrome,
        .filtres-panel {
          transition: none;
        }
      }
      @media (forced-colors: active) {
        .carte,
        .guides-groupe,
        .chip,
        .sommaire a,
        .sponsor,
        .prefs fieldset,
        .filtre input,
        .filtre-kbd span,
        .maturite,
        .filtres-toggle,
        .installer {
          border: 1px solid CanvasText;
        }
        .carte-hit:focus-visible,
        a:focus-visible,
        .prefs button:focus-visible,
        .chip:focus-visible,
        .filtre input:focus-visible {
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
        .confiance {
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
        .topbar {
          flex-wrap: wrap;
        }
        .filtre {
          flex: 1 1 100%;
        }
        .filtre-kbd {
          display: none;
        }
        .filtre input,
        .filtre:focus-within input {
          padding-right: 0.95rem;
        }
        .filtres-panel.is-open .filtres-panel-inner {
          flex-direction: column;
          align-items: flex-start;
        }
        .projecteur-carte {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <a class="skip" href="#catalogue" data-i18n="skip">Aller aux applications</a>

    <div class="chrome-slot" id="chrome-slot">
    <div class="chrome" id="chrome">
      <div class="topbar">
        <div class="identite">
          <img
            class="hero-icone"
            src="${FAMILY_ORIGIN}/icon-192.png"
            width="44"
            height="44"
            alt=""
            decoding="async"
          />
          <div class="identite-texte">
            <h1 class="marque" data-i18n="marque">GuiiuG</h1>
            <p class="sous-titre" data-i18n="sousTitre">Les applications de ${COMPTE}</p>
          </div>
        </div>
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

      <nav class="sites" aria-labelledby="sites-label">
        <span id="sites-label" class="sr-only" data-i18n="sites">Pages du parc</span>
        <a href="${FAMILY_ORIGIN}/" aria-current="page" data-i18n="siteCatalogue">Catalogue</a>
        <a href="${FAMILY_ORIGIN}/dev-pwa-config/" data-i18n="siteShowroom">Showroom</a>
        <a href="${FAMILY_ORIGIN}/parc-dashboard/" data-i18n="siteParc">Parc</a>
      </nav>

      <label class="filtre">
          <span class="sr-only" data-i18n="filtre">Rechercher une application</span>
          <span class="filtre-ico" aria-hidden="true">
            <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.2-3.2"/></svg>
          </span>
          <input
            type="search"
            id="filtre"
            data-i18n-placeholder="filtrePh"
            placeholder="Rechercher…"
            aria-keyshortcuts="Control+K Meta+K"
            autocomplete="off"
            spellcheck="false"
            enterkeyhint="search"
          />
          <kbd class="filtre-kbd" aria-hidden="true">
            <span data-mod="ctrl">Ctrl</span>
            <span data-mod="meta">⌘</span>
            <span>K</span>
          </kbd>
      </label>

      <div class="outils">
        <div class="outils-ligne">
        <button type="button" class="filtres-toggle" id="filtres-toggle" aria-expanded="false" aria-controls="filtres-panel">
          <span class="ico" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M4 5h16l-6.2 7.2V19l-3.6 2v-8.8z"/></svg>
          </span>
          <span data-i18n="filtresPlus">Filtres</span>
          <span class="filtres-badge" id="filtres-badge"></span>
        </button>
        <div class="sommaire-wrap" id="sommaire-wrap">
          <nav class="sommaire" data-i18n-aria="nav" aria-label="Catégories">
${navCats}
          </nav>
        </div>
        </div>
        <div class="filtres-panel" id="filtres-panel" inert>
          <div class="filtres-panel-inner">
          <div class="maturite" role="group" data-i18n-aria="maturiteFiltre" aria-label="Maturité">
            <span class="rail-label" aria-hidden="true" data-i18n="maturiteFiltre">Maturité</span>
            <button type="button" class="chip" data-maturity-filter="" aria-pressed="true" data-i18n="maturiteTous">Toutes</button>
            <button type="button" class="chip" data-maturity-filter="stable" aria-pressed="false" data-i18n-maturity="stable">Stable</button>
            <button type="button" class="chip" data-maturity-filter="alpha" aria-pressed="false" data-i18n-maturity="alpha">Alpha</button>
            <button type="button" class="chip" data-maturity-filter="beta" aria-pressed="false" data-i18n-maturity="beta">Bêta</button>
          </div>
          <div class="maturite plateforme" role="group" data-i18n-aria="plateformeFiltre" aria-label="Plateforme">
            <span class="rail-label" aria-hidden="true" data-i18n="plateformeFiltre">Plateforme</span>
            <button type="button" class="chip" data-platform-filter="" aria-pressed="true" data-i18n="plateformeTous">Toutes</button>
            <button type="button" class="chip" data-platform-filter="web" aria-pressed="false" data-i18n="plateformeWeb">PWA</button>
            <button type="button" class="chip" data-platform-filter="desktop" aria-pressed="false" data-i18n="plateformeDesktop">Bureau</button>
          </div>
          <div class="maturite tri" role="group" data-i18n-aria="triFiltre" aria-label="Tri">
            <span class="rail-label" aria-hidden="true" data-i18n="triFiltre">Tri</span>
            <button type="button" class="chip" data-sort="stable" aria-pressed="true" data-i18n="triStable">Stables d’abord</button>
            <button type="button" class="chip" data-sort="az" aria-pressed="false" data-i18n="triAz">A–Z</button>
          </div>
          </div>
        </div>
        <p class="compte" id="compte" data-i18n="compte" aria-live="polite">${nbApps} applications · ${nbCats} catégories</p>
      </div>
    </div>
    </div>

    <header class="hero">
      <div class="hero-texte">
        <p class="chapeau" id="chapeau" data-i18n="chapeau" data-i18n-pwa="chapeauPwa">
          Des applications web à installer depuis le navigateur. Pas de magasin, et la plupart restent utilisables hors ligne.
        </p>
        <button type="button" class="chapeau-plus" id="chapeau-plus" data-i18n="enSavoirPlus" aria-expanded="false" aria-controls="chapeau">En savoir plus</button>
        <p class="confiance" data-i18n="confiance">
          ${echappe(confianceFr)}
        </p>
        <button type="button" class="installer" id="installer" data-i18n="installer" hidden>Installer le catalogue</button>
      </div>
    </header>

${featuredHtml}

    <p class="parcours">
      <button type="button" class="chip" id="hasard" data-i18n="hasard">Au hasard</button>
    </p>

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
${guidesHtml}
${
  coulisses.length
    ? `
      <section class="coulisses" aria-labelledby="coulisses">
        <h2 id="coulisses" class="coulisses-titre">
          <span class="ico" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.1-3.1a5.2 5.2 0 0 1-7.4 7.4L6 21a2.1 2.1 0 0 1-3-3l7.4-7.4a5.2 5.2 0 0 1 4.3-4.3z"/></svg>
          </span>
          <span data-i18n="coulisses">Dans les coulisses</span>
        </h2>
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
        <a href="${FAMILY_ORIGIN}/a-propos.html" data-i18n="aPropos">À propos</a>${
          nbGuides
            ? `
        ·
        <a href="#guides" data-i18n="guides">Guides pratiques</a>`
            : ''
        }
      </p>
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
        <span data-i18n="maj">${majFr}</span>
        ·
        <a href="https://github.com/${COMPTE}/${SOI}/blob/main/LICENSE" data-i18n="licence">Licence MIT</a>
      </p>
    </footer>
    <a class="haut" id="haut" href="#catalogue" data-i18n-aria="haut" aria-label="Retour en haut">
      <span class="ico" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
      </span>
    </a>
<script>
      (function () {
        var I18N = ${i18nJson};
        var HASARD = ${hasardJson};
        var root = document.documentElement;
        var themeMeta = document.getElementById('theme-color');
        var filtre = document.getElementById('filtre');
        var vide = document.getElementById('filtre-vide');
        var compte = document.getElementById('compte');
        var chromeEl = document.getElementById('chrome');
        var chromeSlot = document.getElementById('chrome-slot');
        var sommaire = document.querySelector('.sommaire');
        var sommaireWrap = document.getElementById('sommaire-wrap');
        var haut = document.getElementById('haut');
        var maturityFilter = '';
        var platformFilter = '';
        var sortMode = 'stable';
        var activeCat = '';
        var deferredPrompt = null;
        var syncingUrl = false;
        var compteTimer = null;
        var ROBOT = ${MOTIF_ROBOT.toString()};

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
          appliqueTitre();
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
          document.querySelectorAll('img[data-alt-fr][data-alt-en]').forEach(function (img) {
            img.setAttribute('alt', img.getAttribute(l === 'en' ? 'data-alt-en' : 'data-alt-fr'));
          });
          document.querySelectorAll('[data-set-lang]').forEach(function (btn) {
            btn.setAttribute('aria-pressed', btn.getAttribute('data-set-lang') === l ? 'true' : 'false');
          });
          var plus = document.getElementById('chapeau-plus');
          var chapeau = document.getElementById('chapeau');
          if (plus && chapeau) {
            plus.textContent = chapeau.classList.contains('is-open') ? t.enSavoirMoins : t.enSavoirPlus;
          }
          updateCompte(true);
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

        // LE TITRE LONG RESTE CELUI DE LA PAGE. Jusqu'au 29/09/2026, il cédait
        // la place à « GuiiuG » au bout de 4 s, dans tout navigateur : Bing,
        // qui indexe la page RENDUE, la classait en erreur « Title too short ».
        // Le titre court ne sert qu'à la fenêtre de l'app installée (barre de
        // titre, sélecteur de tâches), et jamais devant un robot, même rendu
        // dans un mode inhabituel.
        function estInstallee() {
          return (
            window.matchMedia('(display-mode: standalone)').matches ||
            window.navigator.standalone === true
          );
        }

        function appliqueTitre() {
          var t = I18N[lang()];
          var robot = ROBOT.test(navigator.userAgent || '');
          document.title = t.titleCourt && estInstallee() && !robot ? t.titleCourt : t.title;
        }

        function writeUrl() {
          if (syncingUrl) return;
          var p = new URLSearchParams();
          var q = filtre ? filtre.value.trim() : '';
          if (q) p.set('q', q);
          if (maturityFilter) p.set('m', maturityFilter);
          if (platformFilter) p.set('p', platformFilter);
          if (sortMode && sortMode !== 'stable') p.set('sort', sortMode);
          if (activeCat) p.set('cat', activeCat);
          var qs = p.toString();
          var next = qs ? location.pathname + '?' + qs + location.hash : location.pathname + location.hash;
          var cur = location.pathname + location.search + location.hash;
          if (next !== cur) history.replaceState(null, '', next);
        }

        function updateCompte(immediate) {
          var run = function () {
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
          };
          if (immediate) {
            if (compteTimer) clearTimeout(compteTimer);
            run();
            return;
          }
          if (compteTimer) clearTimeout(compteTimer);
          compteTimer = setTimeout(run, 180);
        }

        function applySort() {
          document.querySelectorAll('[data-grille]').forEach(function (ul) {
            var cards = Array.prototype.slice.call(ul.querySelectorAll('.carte'));
            cards.sort(function (a, b) {
              if (sortMode === 'az') {
                return (a.getAttribute('data-name') || '').localeCompare(b.getAttribute('data-name') || '', 'fr');
              }
              var ra = Number(a.getAttribute('data-rang') || 9);
              var rb = Number(b.getAttribute('data-rang') || 9);
              if (ra !== rb) return ra - rb;
              return (a.getAttribute('data-name') || '').localeCompare(b.getAttribute('data-name') || '', 'fr');
            });
            cards.forEach(function (c) {
              ul.appendChild(c);
            });
          });
          syncFiltresBadge();
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
          syncFiltresBadge();
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
          if (p.has('sort') && (p.get('sort') === 'az' || p.get('sort') === 'stable')) {
            sortMode = p.get('sort');
            document.querySelectorAll('[data-sort]').forEach(function (btn) {
              btn.setAttribute('aria-pressed', btn.getAttribute('data-sort') === sortMode ? 'true' : 'false');
            });
            applySort();
          }
          applyFilters();
          if (maturityFilter || platformFilter || sortMode !== 'stable') setFiltresOpen(true);
          if (p.has('cat')) {
            activeCat = p.get('cat') || '';
            var target = document.getElementById('cat-' + activeCat);
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
          var atStart = sommaire.scrollLeft <= 4;
          sommaireWrap.setAttribute('data-overflow', overflow && !atEnd ? '1' : '0');
          sommaireWrap.setAttribute('data-overflow-start', overflow && !atStart ? '1' : '0');
        }

        function syncChromeHeight() {
          if (!chromeEl || !chromeSlot) return;
          chromeSlot.style.setProperty('--chrome-h', chromeEl.offsetHeight + 'px');
        }

        function saveUi(key, val) {
          try {
            sessionStorage.setItem(key, val);
          } catch (e) {}
        }

        function loadUi(key) {
          try {
            return sessionStorage.getItem(key);
          } catch (e) {
            return null;
          }
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
        // Installée depuis l'onglet, la page passe dans la fenêtre de l'app.
        var modeInstalle = window.matchMedia('(display-mode: standalone)');
        if (modeInstalle.addEventListener) modeInstalle.addEventListener('change', appliqueTitre);

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
        document.querySelectorAll('[data-sort]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            sortMode = btn.getAttribute('data-sort') || 'stable';
            document.querySelectorAll('[data-sort]').forEach(function (b) {
              b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
            });
            applySort();
            writeUrl();
          });
        });
        var effacer = document.getElementById('filtre-effacer');
        if (effacer) effacer.addEventListener('click', clearFilters);

        document.querySelectorAll('[data-suggest-cat]').forEach(function (btn) {
          btn.addEventListener('click', function () {
            clearFilters();
            activeCat = btn.getAttribute('data-suggest-cat') || '';
            var target = document.getElementById('cat-' + activeCat);
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            writeUrl();
          });
        });

        document.querySelectorAll('.sommaire a[data-cat]').forEach(function (a) {
          a.addEventListener('click', function () {
            activeCat = a.getAttribute('data-cat') || '';
            writeUrl();
          });
        });

        var filtresToggle = document.getElementById('filtres-toggle');
        var filtresPanel = document.getElementById('filtres-panel');
        var filtresBadge = document.getElementById('filtres-badge');

        function syncFiltresBadge() {
          if (!filtresToggle) return;
          var n = (maturityFilter ? 1 : 0) + (platformFilter ? 1 : 0) + (sortMode !== 'stable' ? 1 : 0);
          if (n) filtresToggle.setAttribute('data-count', String(n));
          else filtresToggle.removeAttribute('data-count');
          if (filtresBadge) filtresBadge.textContent = n ? String(n) : '';
        }

        function setFiltresOpen(open) {
          if (!filtresToggle || !filtresPanel) return;
          filtresPanel.classList.toggle('is-open', open);
          filtresToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
          if (open) filtresPanel.removeAttribute('inert');
          else filtresPanel.setAttribute('inert', '');
          saveUi('hub-filtres', open ? '1' : '0');
          syncChromeHeight();
        }

        if (filtresToggle && filtresPanel) {
          if (loadUi('hub-filtres') === '1') setFiltresOpen(true);
          filtresToggle.addEventListener('click', function () {
            setFiltresOpen(!filtresPanel.classList.contains('is-open'));
          });
          filtresPanel.addEventListener('transitionend', function (e) {
            if (e.propertyName === 'grid-template-rows') syncChromeHeight();
          });
        }

        var chapeauPlus = document.getElementById('chapeau-plus');
        var chapeau = document.getElementById('chapeau');
        if (chapeauPlus && chapeau) {
          if (loadUi('hub-chapeau') === '1') {
            chapeau.classList.add('is-open');
            chapeauPlus.setAttribute('aria-expanded', 'true');
            chapeauPlus.textContent = I18N[lang()].enSavoirMoins;
          }
          chapeauPlus.addEventListener('click', function () {
            var open = !chapeau.classList.contains('is-open');
            chapeau.classList.toggle('is-open', open);
            chapeauPlus.setAttribute('aria-expanded', open ? 'true' : 'false');
            chapeauPlus.textContent = open ? I18N[lang()].enSavoirMoins : I18N[lang()].enSavoirPlus;
            saveUi('hub-chapeau', open ? '1' : '0');
          });
        }

        var hasardBtn = document.getElementById('hasard');
        if (hasardBtn && HASARD && HASARD.length) {
          hasardBtn.addEventListener('click', function () {
            var url = HASARD[Math.floor(Math.random() * HASARD.length)];
            window.open(url, '_blank', 'noopener,noreferrer');
          });
        }

        document.addEventListener('keydown', function (e) {
          var mod = e.ctrlKey || e.metaKey;
          if (mod && !e.altKey && !e.shiftKey && (e.key === 'k' || e.key === 'K')) {
            if (!filtre) return;
            e.preventDefault();
            filtre.focus();
            filtre.select();
            return;
          }
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
                activeCat = id || '';
                links.forEach(function (a) {
                  a.removeAttribute('aria-current');
                });
                if (map[id]) map[id].setAttribute('aria-current', 'true');
                writeUrl();
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

        syncChromeHeight();
        if (chromeEl && 'ResizeObserver' in window) {
          new ResizeObserver(syncChromeHeight).observe(chromeEl);
        }
        window.addEventListener('resize', syncChromeHeight);

        if (chromeEl && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          var lastY = window.scrollY;
          window.addEventListener(
            'scroll',
            function () {
              var y = window.scrollY;
              if (y > lastY + 8 && y > 96) chromeEl.classList.add('is-hidden');
              else if (y < lastY - 8) chromeEl.classList.remove('is-hidden');
              lastY = y;
              if (haut) haut.setAttribute('data-visible', y > window.innerHeight * 1.5 ? '1' : '0');
            },
            { passive: true }
          );
        } else if (haut) {
          window.addEventListener(
            'scroll',
            function () {
              haut.setAttribute('data-visible', window.scrollY > window.innerHeight * 1.5 ? '1' : '0');
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
  </body>
</html>
`;

// Manifest + service worker : sans eux, Chrome Android n'offre pas
// « Installer l'application ». Le worker ne fait que du réseau d'abord, et
// SEULEMENT pour le hub : sa portée « / » couvre aussi les apps, auxquelles il
// ne doit pas toucher (voir scripts/hub-sw.mjs).
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
];

const sw = serviceWorkerHub({
  compte: COMPTE,
  chemins: CHEMINS_DU_HUB,
  essentiels: [
    '/',
    '/index.html',
    '/offline.html',
    '/manifest.webmanifest',
    '/icon-192.png',
    '/icon-512.png',
  ],
  // La miniature du projecteur, si elle existe ; sans sharp, pas de WebP.
  extras:
    featuredId && imageParApp.has(featuredId)
      ? [`/previews/${featuredId}.jpg`, `/previews/${featuredId}.webp`]
      : [],
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
for (const { fichier, texte } of [...pagesDatees, { fichier: '404.html', texte: html404 }]) {
  if (Object.values(JETONS).some(j => texte.includes(j))) {
    throw new Error(`${fichier} : un jeton de date n'a pas été remplacé`);
  }
}

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

// CE QUE LE JOB « PUBLIER » SIGNALERA À INDEXNOW : les pages du hub dont le
// contenu a changé à cette construction, et elles seules (scripts/indexnow.mjs).
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `urls-modifiees=${JSON.stringify(modifiees)}\n`);
}

console.log(
  `\nÉcrit dans ${SORTIE}/ : index.html (${FAMILY_APPS.length} applications en ` +
    `${sections.length} catégories, ${coulisses.length} en coulisses, ${nbGuides} guides), ` +
    `${pagesDuPlan
      .slice(1)
      .map(p => p.fichier)
      .join(', ')}, 404.html, robots.txt, sitemap.xml (index de ` +
    `${plansDuParc.length + 1} plans), sitemap-hub.xml (${pagesDuPlan.length} URL), seo-state.json, ` +
    `${VERIFICATION_GOOGLE}, BingSiteAuth.xml, clé IndexNow, og-image.jpg, ` +
    `previews/ (${previewsOk}), offline.html, manifest.webmanifest, sw.js, icônes PWA`
);
