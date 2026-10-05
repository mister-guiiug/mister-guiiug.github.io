/**
 * LES GUIDES PRATIQUES DU HUB, EN DEUX LANGUES. Module pur : ni réseau, ni
 * effet à l'import, pour que `test/guides.test.mjs` l'éprouve sans rien lancer.
 *
 * UN GUIDE, PAS UNE PAGE. Une application publie ses pages de contenu en
 * français, et certaines en anglais (`content/pages/en/`). Le hub les listait
 * page par page : « Règles du Yahtzee » et « Yahtzee rules » faisaient deux
 * entrées, et la liste restait la même quelle que soit la langue choisie, un
 * visiteur anglais lisant d'abord quarante-deux titres français. Chaque page
 * déclare pourtant sa traduction (`<link rel="alternate" hreflang>`, posé par
 * le socle) : le hub les apparie, et montre la version de la langue choisie.
 *
 * LE HTML SERVI RESTE FRANÇAIS ET LIE TOUT. Un robot qui n'exécute pas le
 * JavaScript voit le titre français et, à côté, le lien « EN » de la
 * traduction : aucune page ne perd le seul lien qui la relie à l'origine. Le
 * bascule de langue échange ensuite titres, adresses et `lang` à partir des
 * attributs `data-fr-*` / `data-en-*` que posent ces fonctions.
 */
import { echappe } from './echappe.mjs';

/** Les langues du hub, dans l'ordre où il les sert. */
export const LANGUES = ['fr', 'en'];

/** Un lien hors du shell du hub : celui que `build-site.mjs` écrit aussi. */
const lien = (url, texte, attrs = '') =>
  `<a href="${echappe(url)}" target="_blank" rel="noopener noreferrer"${attrs}>${texte}</a>`;

/** Les attributs d'une balise, quel que soit leur ordre. */
const attributsDe = balise =>
  Object.fromEntries(
    [...balise.matchAll(/([a-z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)].map(
      ([, nom, double, simple]) => [nom.toLowerCase(), double ?? simple]
    )
  );

/**
 * Les traductions qu'une page déclare dans son `<head>` :
 * `<link rel="alternate" hreflang="xx" href="…">`. `x-default` n'est pas une
 * langue, et un autre `rel` n'est pas une traduction.
 *
 * @returns {Record<string, string>}  langue → adresse
 */
export function alternatesDe(html) {
  const traductions = {};
  for (const [balise] of String(html).matchAll(/<link\b[^>]*>/gi)) {
    const a = attributsDe(balise);
    const rels = (a.rel ?? '').toLowerCase().split(/\s+/);
    const langue = (a.hreflang ?? '').toLowerCase();
    if (!rels.includes('alternate') || !/^[a-z]{2}$/.test(langue) || !a.href) {
      continue;
    }
    traductions[langue] ??= a.href.replace(/&amp;/g, '&');
  }
  return traductions;
}

/**
 * Les pages d'un site, regroupées en guides : une page et sa traduction n'en
 * font qu'un. Deux pages s'apparient si elles se désignent L'UNE L'AUTRE et
 * sont de langues différentes ; une déclaration sans réponse ne suffit pas.
 * Un guide prend la place de la première de ses versions dans le plan de
 * site, qui met la française d'abord.
 *
 * @param {{ url: string, titre: string, langue: string, alternates?: Record<string, string> }[]} pages
 * @returns {Record<string, typeof pages[number]>[]}  langue → page, par guide
 */
export function regrouperGuides(pages) {
  const parUrl = new Map(pages.map(p => [p.url, p]));
  const prises = new Set();
  const guides = [];
  for (const p of pages) {
    if (prises.has(p.url)) continue;
    prises.add(p.url);
    const guide = { [p.langue]: p };
    for (const [langue, url] of Object.entries(p.alternates ?? {})) {
      const autre = parUrl.get(url);
      if (
        !autre ||
        guide[langue] ||
        prises.has(autre.url) ||
        autre.langue !== langue ||
        autre.alternates?.[p.langue] !== p.url
      ) {
        continue;
      }
      guide[langue] = autre;
      prises.add(autre.url);
    }
    guides.push(guide);
  }
  return guides;
}

/**
 * Le guide qu'une carte montre dans une langue : le premier qui y existe,
 * sinon la première version du premier guide. En anglais, Miss Dice mène ainsi
 * à « Yahtzee rules » plutôt qu'aux règles du 421, qui n'existent qu'en
 * français.
 */
export function guideDeCarte(guides, langue) {
  const premier = guides.find(g => g[langue])?.[langue];
  if (premier) return premier;
  const g = guides[0];
  return g ? LANGUES.map(l => g[l]).find(Boolean) : undefined;
}

/**
 * Le lien « Guide » d'une carte : servi vers le guide français, il porte aussi
 * l'adresse, le titre et la langue de celui qu'il montrera en anglais.
 * L'étiquette dit « (FR) » en anglais quand le guide n'existe qu'en français,
 * « (EN) » en français dans le cas inverse.
 */
export function lienGuideDeCarte(guides) {
  const fr = guideDeCarte(guides, 'fr');
  const en = guideDeCarte(guides, 'en');
  if (!fr || !en) return '';
  const cle =
    en.langue === 'fr' ? 'guideFr' : fr.langue === 'en' ? 'guideEn' : 'guide';
  const libelle = cle === 'guideEn' ? 'Guide (EN)' : 'Guide';
  return lien(
    fr.url,
    `<span data-i18n="${cle}">${libelle}</span>`,
    ` class="action action-guide guide-lien" hreflang="${echappe(fr.langue)}"` +
      ` data-fr-href="${echappe(fr.url)}" data-en-href="${echappe(en.url)}"` +
      ` data-fr-hreflang="${echappe(fr.langue)}" data-en-hreflang="${echappe(en.langue)}"` +
      ` title="${echappe(fr.titre)}" data-fr-title="${echappe(fr.titre)}" data-en-title="${echappe(en.titre)}"`
  );
}

/**
 * Le lien vers l'autre version, dans SA langue : les mots mêmes que portent
 * les pages de guide (le socle les y écrit).
 */
const LIRE_DANS = { en: 'Read in English', fr: 'Lire en français' };

/**
 * Ce que dit l'étiquette d'un guide d'une seule langue, à l'oreille, dans la
 * langue de la page quand elle se montre : la française ne paraît qu'en
 * anglais, l'anglaise qu'en français.
 */
const DIT_LA_LANGUE = {
  fr: { lang: 'en', texte: '(in French)' },
  en: { lang: 'fr', texte: '(en anglais)' },
};

/**
 * Une entrée de la liste des guides pratiques.
 *
 * - Traduit : le titre dans la langue choisie (français au service) ; sous
 *   lui, à côté de l'application, « Read in English » ou « Lire en
 *   français », chacun dans sa langue et suivi, pour l'oreille seulement, du
 *   titre qu'il ouvre.
 * - Une seule langue : le titre, et une étiquette (« FR ») que la feuille de
 *   style ne montre que si elle diffère de celle choisie.
 *
 * DEUX IDÉES, DEUX PLACES. L'étiquette à côté du titre dit en quelle langue
 * EST le guide ; le lien de la ligne d'en dessous dit qu'il EXISTE dans
 * l'autre. Un premier essai les mettait toutes deux à côté du titre, sous le
 * même « FR » : en anglais, le lecteur ne savait plus lequel était un lien.
 *
 * `data-langues` et `data-ordre` servent au bascule : en anglais, les guides
 * traduits passent en tête de leur groupe, dans le DOM et pas seulement à
 * l'œil, pour que l'ordre de tabulation suive.
 */
export function entreeGuide(guide, { nom, site, ordre }) {
  const langues = LANGUES.filter(l => guide[l]);
  const app = lien(site, echappe(nom), ' class="guide-app"');
  const debut = `              <li class="guide" data-ordre="${ordre}" data-langues="${langues.join(' ')}">`;
  if (guide.fr && guide.en) {
    const { fr, en } = guide;
    const titre = lien(
      fr.url,
      echappe(fr.titre),
      ` class="guide-titre" hreflang="fr" lang="fr"` +
        ` data-fr-href="${echappe(fr.url)}" data-en-href="${echappe(en.url)}"` +
        ` data-fr-hreflang="fr" data-en-hreflang="en" data-fr-lang="fr" data-en-lang="en"` +
        ` data-fr="${echappe(fr.titre)}" data-en="${echappe(en.titre)}"`
    );
    // La ponctuation de chaque langue : « : » sans espace avant en anglais.
    const autre = lien(
      en.url,
      `<span data-fr="${LIRE_DANS.en}" data-en="${LIRE_DANS.fr}">${LIRE_DANS.en}</span>` +
        `<span class="sr-only" data-fr=": ${echappe(en.titre)}" data-en=" : ${echappe(fr.titre)}">: ${echappe(en.titre)}</span>`,
      ` class="guide-autre" hreflang="en" lang="en"` +
        ` data-fr-href="${echappe(en.url)}" data-en-href="${echappe(fr.url)}"` +
        ` data-fr-hreflang="en" data-en-hreflang="fr" data-fr-lang="en" data-en-lang="fr"`
    );
    return `${debut}
                ${titre}
                <span class="guide-meta">${app}<span aria-hidden="true"> · </span>${autre}</span>
              </li>`;
  }
  const seule = guide[langues[0]];
  const langue = echappe(seule.langue);
  const dit = DIT_LA_LANGUE[seule.langue];
  const etiquette = dit
    ? `<span class="guide-langue guide-seule" data-langue="${langue}" lang="${dit.lang}"><span aria-hidden="true">${langue.toUpperCase()}</span><span class="sr-only">${dit.texte}</span></span>`
    : '';
  return `${debut}
                ${lien(seule.url, echappe(seule.titre), ` class="guide-titre" hreflang="${langue}" lang="${langue}"`)} ${etiquette}
                <span class="guide-meta">${app}</span>
              </li>`;
}
