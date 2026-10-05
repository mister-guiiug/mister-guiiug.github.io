/**
 * L'ACCUEIL DU HUB, RENDU SANS RÉSEAU.
 *
 * `rendreAccueil(donnees)` reçoit ce que la collecte a lu (catalogue du socle,
 * sondes des sites, pages de contenu) et rend `index.html`, encore porteur des
 * JETONS de date que `dater` remplace après le calcul de l'empreinte. Elle ne
 * lit ni le réseau ni l'horloge : un test l'appelle sur un catalogue factice.
 *
 * La feuille de style et le script client sont de vrais fichiers,
 * `accueil/hub.css` et `accueil/hub-client.js`, insérés dans la page tels quels
 * (indentés de six espaces, comme le gabarit qui les contenait). Le script
 * porte quatre jetons, `__HUB_I18N__`, `__HUB_HASARD__`, `__HUB_ROBOT__` et
 * `__HUB_ORIGINE__`, remplacés ici par des valeurs déjà échappées pour un
 * élément `<script>`.
 */
import { readFileSync } from 'node:fs';
import { JETON_CSP } from './csp.mjs';
import { echappe } from './echappe.mjs';
import { entreeGuide, lienGuideDeCarte, regrouperGuides } from './guides.mjs';
import { JETONS, entiteEditeur, entiteSite, jsonLdTexte } from './pages-hub.mjs';
import { MOTIF_ROBOT } from './seo-hub.mjs';

const CSS = readFileSync(new URL('./accueil/hub.css', import.meta.url), 'utf8');
const SCRIPT = readFileSync(new URL('./accueil/hub-client.js', import.meta.url), 'utf8');

/** Indente de `n` espaces chaque ligne non vide : la forme qu'avait le gabarit. */
const indente = (texte, n) =>
  texte
    .replace(/\n$/, '')
    .split('\n')
    .map(l => (l ? ' '.repeat(n) + l : l))
    .join('\n');

/** Pose une valeur à la place d'un jeton, sans interpréter ses `$`. */
const pose = (texte, jeton, valeur) => texte.split(jeton).join(valeur);

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
const donneesStructurees = ({ origine, compte, apps, pageDeBureau, surOrigine }) => ({
  '@context': 'https://schema.org',
  '@graph': [
    {
      ...entiteSite({ origine, compte }),
      potentialAction: {
        '@type': 'ViewAction',
        target: `${origine}/`,
        name: `Les applications de ${compte}`,
      },
    },
    entiteEditeur({ origine, compte }),
    {
      '@type': 'ItemList',
      name: `Applications de ${compte}`,
      // Les apps servies sur l'origine, et les apps de bureau par leur page du
      // hub : l'adresse d'un dépôt GitHub n'est pas une page du parc.
      itemListElement: apps
        .filter(a => surOrigine(a.appUrl) || pageDeBureau.has(a.id))
        .map((a, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          url: surOrigine(a.appUrl) ? a.appUrl : `${origine}${pageDeBureau.get(a.id).chemin}`,
          name: a.name,
        })),
    },
  ],
});

// ---------------------------------------------------------------------------
// index.html — groupé par catégorie, dans l'ordre du catalogue
// ---------------------------------------------------------------------------

/** Coup de projecteur éditorial — `null` = première app stable avec image. */
export const FEATURED_ID = 'miss-contraction';

const maturite = (libellesFr, m) =>
  m === 'stable'
    ? ''
    : ` <span class="badge badge-${echappe(m)}" data-i18n-maturity="${echappe(m)}">${echappe(libellesFr.maturity?.[m] ?? m)}</span>`;

/**
 * Les liens vers les apps s'ouvrent hors du shell du hub une fois installé :
 * `target=_blank` renvoie Chrome / le navigateur, où chaque app reste
 * installable séparément — à condition que la portée du hub ne la couvre pas,
 * ce qu'elle a fait du 27/09 au 03/10/2026 (voir scripts/manifeste-hub.mjs).
 */
const lienHorsShell = (url, texte, attrs = '') =>
  `<a href="${echappe(url)}" target="_blank" rel="noopener noreferrer"${attrs}>${texte}</a>`;

/**
 * La vignette d'une app : la miniature de son image de partage. Son `alt` la
 * décrit (« Aperçu de Miss Dice ») : vide, Bing la comptait parmi les images
 * sans texte de remplacement, vingt sur la page. Le bascule FR/EN le traduit.
 */
const visuelPreview = (origine, id, nom, sizes) => `
            <span class="visuel">
              <picture>
                <source type="image/webp" srcset="${origine}/previews/${echappe(id)}.webp" />
                <img
                  class="visuel-img"
                  src="${origine}/previews/${echappe(id)}.jpg"
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

/** Icône PWA de l'app (192) — repli quand og-image manque, avant le monogramme. */
const visuelIcone = (origine, id, nom) => `
            <span class="visuel visuel-icone" aria-hidden="true">
              <img
                class="visuel-icone-img"
                src="${origine}/${echappe(id)}/icon-192.png"
                alt=""
                width="192"
                height="192"
                loading="lazy"
                decoding="async"
              />
              <span class="visuel-icone-nom">${echappe(nom)}</span>
            </span>`;

/**
 * Le lien principal d'une carte. Une app web s'ouvre hors du shell du hub ;
 * une app de bureau mène à SA PAGE DU HUB, qui dit ce qu'elle est et comment
 * l'obtenir : c'est une page du hub, elle s'ouvre donc sur place.
 */
const lienPrincipal = (ctx, app, texte, attrs) => {
  const page = ctx.pageDeBureau.get(app.id);
  return page
    ? `<a href="${ctx.origine}${page.chemin}"${attrs}>${texte}</a>`
    : lienHorsShell(app.appUrl, texte, attrs);
};

const carteApp = (ctx, app, featuredId) => {
  const {
    origine,
    pagesParApp,
    imageParApp,
    iconeParApp,
    enPanne,
    descriptionsEn,
    pageDeBureau,
    libellesFr,
    libellesEn,
    surOrigine,
  } = ctx;
  const bureau = app.platform === 'desktop';
  const pages = pagesParApp.get(app.id) ?? [];
  const aImage = imageParApp.has(app.id);
  const aIcone = iconeParApp.has(app.id);
  const horsLigne = surOrigine(app.appUrl) && enPanne.some(x => x.startsWith(`${app.id} (`));
  const descEn = descriptionsEn[app.id] ?? app.description;
  const lienGuide = lienGuideDeCarte(regrouperGuides(pages));
  const plateforme = bureau ? 'desktop' : 'web';
  const aLaUne = featuredId && app.id === featuredId;
  const libelleOuvrir = pageDeBureau.has(app.id)
    ? '<span data-i18n="presentation">Présentation</span>'
    : '<span data-i18n="ouvrir">Ouvrir</span>';
  const actions = `
            <p class="actions">
              ${lienPrincipal(ctx, app, libelleOuvrir, ' class="action action-ouvrir"')}
              ${lienGuide}
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
    ? visuelPreview(origine, app.id, app.name, '(max-width: 40rem) 100vw, 320px')
    : aIcone
      ? visuelIcone(origine, app.id, app.name)
      : visuelMono(app.name);
  const badgeBureau = bureau
    ? ` <span class="badge" data-i18n="badgeDesktop">${echappe('Application de bureau')}</span>`
    : '';
  const badgeUne = aLaUne
    ? ` <span class="badge badge-une" data-i18n="aLaUne">${echappe('À la une')}</span>`
    : '';
  const badgePanne = horsLigne
    ? ` <span class="badge badge-panne" data-i18n="badgePanne">${echappe('Non vérifiée')}</span>`
    : '';
  const classes = [
    'carte',
    bureau ? 'carte-bureau' : '',
    aLaUne ? 'carte-une' : '',
    horsLigne ? 'carte-panne' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const rang =
    app.maturity === 'stable' ? '0' : app.maturity === 'beta' ? '1' : '2';
  return `          <li class="${classes}" data-search="${echappe(recherche)}" data-maturity="${echappe(app.maturity)}" data-platform="${plateforme}" data-cat="${echappe(app.category)}" data-name="${echappe(app.name.toLowerCase())}" data-rang="${rang}">
            ${lienPrincipal(ctx, app, '', ` class="carte-hit" tabindex="-1" aria-hidden="true"`)}
${visuel}
            <div class="corps">
              <h3><span class="nom">${echappe(app.name)}</span>${maturite(libellesFr, app.maturity)}${badgeBureau}${badgeUne}${badgePanne}</h3>
              <p data-fr="${echappe(app.description)}" data-en="${echappe(descEn)}">${echappe(app.description)}</p>${actions}
            </div>
          </li>`;
};

const ordreApps = (a, b) => {
  const rang = m => (m === 'stable' ? 0 : m === 'beta' ? 1 : 2);
  return rang(a.maturity) - rang(b.maturity) || a.name.localeCompare(b.name, 'fr');
};

const sectionsHtml = ctx =>
  ctx.categories
    .map(cat => {
      const dansCat = ctx.apps.filter(a => a.category === cat).slice().sort(ordreApps);
      if (!dansCat.length) return null;
      return `      <section data-cat-section="${echappe(cat)}" aria-labelledby="cat-${cat}">
        <h2 id="cat-${cat}" data-i18n-cat="${echappe(cat)}">${echappe(ctx.libellesFr.categories?.[cat] ?? cat)}</h2>
        <ul data-grille>
${dansCat.map(a => carteApp(ctx, a, ctx.featuredId)).join('\n')}
        </ul>
      </section>`;
    })
    .filter(Boolean);

const projecteurHtml = (ctx, featuredApp) => {
  if (!featuredApp) return '';
  const { origine, pagesParApp, imageParApp, iconeParApp, descriptionsEn, pageDeBureau } = ctx;
  const featuredPages = pagesParApp.get(featuredApp.id) ?? [];
  const featuredGuide = lienGuideDeCarte(regrouperGuides(featuredPages));
  const featuredDescEn = descriptionsEn[featuredApp.id] ?? featuredApp.description;
  return `
    <aside class="projecteur" aria-labelledby="projecteur-titre">
      <p class="projecteur-label" id="projecteur-titre" data-i18n="projecteur">Coup de projecteur</p>
      <div class="projecteur-carte">
        ${lienPrincipal(ctx, featuredApp, '', ` class="carte-hit" tabindex="-1" aria-hidden="true"`)}
${
  imageParApp.has(featuredApp.id)
    ? visuelPreview(origine, featuredApp.id, featuredApp.name, '(max-width: 40rem) 100vw, 480px').replace(
        'loading="lazy"',
        ''
      )
    : iconeParApp.has(featuredApp.id)
      ? visuelIcone(origine, featuredApp.id, featuredApp.name)
      : visuelMono(featuredApp.name)
}
        <div class="corps">
          <h2 class="projecteur-nom">${echappe(featuredApp.name)}</h2>
          <p data-fr="${echappe(featuredApp.description)}" data-en="${echappe(featuredDescEn)}">${echappe(featuredApp.description)}</p>
          <p class="actions">
            ${lienPrincipal(ctx, featuredApp, pageDeBureau.has(featuredApp.id) ? '<span data-i18n="presentation">Présentation</span>' : '<span data-i18n="ouvrir">Ouvrir</span>', ' class="action action-ouvrir"')}
            ${featuredGuide}
          </p>
        </div>
      </div>
    </aside>`;
};

const carteCoulisse = (ctx, s) => {
  // Le squelette a sa page de contenu : elle n'était liée de nulle part.
  const lienGuide = lienGuideDeCarte(regrouperGuides(ctx.pagesParSite.get(s.nom) ?? []));
  return `          <li class="carte">
            ${lienHorsShell(`/${s.nom}/`, '', ` class="carte-hit" aria-label="${echappe(s.titre)}"`)}
            <div class="corps">
              <h3><span class="nom">${echappe(s.titre)}</span></h3>
              <p>${echappe(s.desc)}</p>${
                lienGuide
                  ? `
              <p class="actions">
                ${lienGuide}
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
 * sites hors catalogue viennent en dernier.
 *
 * UN GUIDE PAR TRADUCTION APPARIÉE, dans la langue choisie : `scripts/guides.mjs`
 * dit comment, et pourquoi le HTML servi garde un lien vers chaque page.
 */
const groupesDeGuides = ctx =>
  [
    ...ctx.catsAvecApps.map(cat => ({
      cle: cat,
      libelle: ctx.libellesFr.categories?.[cat] ?? cat,
      attribut: `data-i18n-cat="${echappe(cat)}"`,
      entrees: ctx.apps
        .filter(a => a.category === cat)
        .slice()
        .sort(ordreApps)
        .flatMap(a =>
          regrouperGuides(ctx.pagesParApp.get(a.id) ?? []).map(guide => ({
            guide,
            nom: a.name,
            site: a.appUrl,
          }))
        ),
    })),
    {
      cle: 'coulisses',
      libelle: 'Dans les coulisses',
      attribut: 'data-i18n="coulisses"',
      entrees: ctx.coulisses.flatMap(s =>
        regrouperGuides(ctx.pagesParSite.get(s.nom) ?? []).map(guide => ({
          guide,
          nom: nomCourt(s.titre),
          site: s.base,
        }))
      ),
    },
  ].filter(g => g.entrees.length);

const guidesSection = (groupesGuides, nbGuides) =>
  nbGuides
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
${g.entrees.map((e, ordre) => entreeGuide(e.guide, { nom: e.nom, site: e.site, ordre })).join('\n')}
            </ul>
          </section>`
  )
  .join('\n')}
        </div>
      </section>`
    : '';

const descriptionFr = (compte, apps) =>
  `Les applications web installables de ${compte} : ` +
  apps
    .slice(0, 6)
    .map(a => a.name)
    .join(', ') +
  ', et les autres.';

const descriptionAnglaise = (compte, apps) =>
  `Installable web apps by ${compte}: ` +
  apps
    .slice(0, 6)
    .map(a => a.name)
    .join(', ') +
  ', and more.';

/**
 * « Mis à jour le … » : la date du dernier VRAI changement de la page, pas celle
 * du build de la nuit. La page est engendrée avec un jeton à sa place ; la date
 * n'est posée qu'après le calcul de l'empreinte (voir « Dates de modification »
 * dans build-site.mjs).
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

const i18nClient = ctx => {
  const {
    compte,
    titrePage,
    titrePageEn,
    description,
    descriptionEn,
    nbApps,
    nbCats,
    plusieursLangues,
    languesGuides,
    libellesFr,
    libellesEn,
  } = ctx;
  return JSON.stringify({
    fr: {
      title: titrePage,
      description,
      marque: 'GuiiuG',
      sousTitre: `Les applications de ${compte}`,
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
      badgePanne: 'Non vérifiée',
      bandeauPanne:
        'Certaines applications du catalogue ne répondent pas pour le moment — leurs cartes restent listées, sans promesse d’ouverture.',
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
      guideFr: 'Guide',
      guideEn: 'Guide (EN)',
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
      sousTitre: `Apps by ${compte}`,
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
      badgePanne: 'Unverified',
      bandeauPanne:
        'Some catalog apps are unreachable right now — their cards stay listed, without promising they will open.',
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
      // « (FR) » seulement quand l'app n'a de guide qu'en français.
      guide: 'Guide',
      guideFr: 'Guide (FR)',
      guideEn: 'Guide',
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
};

/**
 * L'accueil, rendu.
 *
 * @param {object} donnees
 * @param {string} donnees.origine        l'origine de la famille (`FAMILY_ORIGIN`)
 * @param {string} donnees.compte         le compte GitHub
 * @param {string} donnees.soi            le dépôt du hub (`<compte>.github.io`)
 * @param {string} donnees.theme          la couleur de thème
 * @param {string} donnees.sponsorUrl
 * @param {string} donnees.imageEmpreinte l'empreinte de `og-image.jpg`, pour son URL
 * @param {object[]} donnees.apps         `FAMILY_APPS`
 * @param {string[]} donnees.categories   `CATEGORIES`
 * @param {object} donnees.libellesFr     libellés du socle, en français
 * @param {object} donnees.libellesEn     libellés du socle, en anglais
 * @param {Record<string, string>} donnees.descriptionsEn
 * @param {Map<string, object[]>} donnees.pagesParApp   id → pages de contenu
 * @param {Map<string, string>} donnees.imageParApp     id → URL de son og-image
 * @param {Map<string, string>} donnees.iconeParApp     id → URL de son icône
 * @param {string[]} donnees.enPanne      « id (code) » des apps qui ne répondent pas
 * @param {Map<string, object>} donnees.pageDeBureau    id → page du hub d'une app de bureau
 * @param {object[]} donnees.coulisses    les sites publiés hors catalogue
 * @param {Map<string, object[]>} donnees.pagesParSite  nom → pages de contenu
 * @param {boolean} [donnees.raccourci]  le socle publie `command.js` : la page
 *   charge le raccourci Ctrl+K et l'annonce ; sinon ni module, ni indication
 * @returns {{ html: string, description: string, featuredId: string|null, nbSections: number, nbGuides: number }}
 */
export function rendreAccueil(donnees) {
  const { origine, compte, apps, categories, imageParApp } = donnees;
  const surOrigine = url => url.startsWith(`${origine}/`);
  const catsAvecApps = categories.filter(cat => apps.some(a => a.category === cat));

  /** Coup de projecteur : FEATURED_ID si valide, sinon première stable avec image. */
  const featuredApp =
    (FEATURED_ID ? apps.find(a => a.id === FEATURED_ID) : null) ??
    apps.find(a => a.maturity === 'stable' && imageParApp.has(a.id)) ??
    null;
  const featuredId = featuredApp?.id ?? null;

  const ctx = { ...donnees, surOrigine, catsAvecApps, featuredId };

  const jsonLd = jsonLdTexte(donneesStructurees(ctx));

  const navCats = catsAvecApps
    .map(
      cat =>
        `          <a href="#cat-${cat}" data-cat="${echappe(cat)}" data-i18n-cat="${echappe(cat)}">${echappe(ctx.libellesFr.categories?.[cat] ?? cat)}</a>`
    )
    .join('\n');

  const videSuggestions = catsAvecApps
    .slice(0, 3)
    .map(
      cat =>
        `        <button type="button" class="chip vide-cat" data-suggest-cat="${echappe(cat)}" data-i18n-cat="${echappe(cat)}">${echappe(ctx.libellesFr.categories?.[cat] ?? cat)}</button>`
    )
    .join('\n');

  const sections = sectionsHtml(ctx);
  const featuredHtml = projecteurHtml(ctx, featuredApp);

  const urlsHasard = apps
    .filter(a => a.maturity === 'stable' && surOrigine(a.appUrl))
    .map(a => a.appUrl);
  const hasardJson = JSON.stringify(urlsHasard).replace(/</g, '\\u003c');

  const groupesGuides = groupesDeGuides(ctx);
  const nbGuides = groupesGuides.reduce((n, g) => n + g.entrees.length, 0);
  const languesGuides = new Set(
    groupesGuides.flatMap(g => g.entrees.flatMap(e => Object.keys(e.guide)))
  );
  /** Plusieurs langues : l'introduction anglaise ne dit plus « in French ». */
  const plusieursLangues = languesGuides.size > 1;
  const guidesHtml = guidesSection(groupesGuides, nbGuides);

  const description = descriptionFr(compte, apps);
  const descriptionEn = descriptionAnglaise(compte, apps);

  // Bing SEO/GEO : titre ≥ 50 car. Le H1 visible est la marque ; le <title> reste
  // descriptif, et le reste une fois la page rendue (voir `appliqueTitre`).
  const titrePage = `Les applications de ${compte} - PWA web installables hors magasin`;
  const titrePageEn = `${compte}'s apps - installable PWAs, no app store`;

  const nbApps = apps.length;
  const nbCats = catsAvecApps.length;

  const i18nJson = i18nClient({
    ...ctx,
    titrePage,
    titrePageEn,
    description,
    descriptionEn,
    nbApps,
    nbCats,
    plusieursLangues,
    languesGuides,
  });

  const script = indente(
    [
      ['__HUB_ORIGINE__', origine],
      ['__HUB_I18N__', i18nJson],
      ['__HUB_HASARD__', hasardJson],
      ['__HUB_ROBOT__', MOTIF_ROBOT.toString()],
    ].reduce((texte, [jeton, valeur]) => pose(texte, jeton, valeur), SCRIPT),
    6
  );

  const html = pageHtml({
    ...ctx,
    titrePage,
    description,
    jsonLd,
    navCats,
    nbApps,
    nbCats,
    confianceFr,
    featuredHtml,
    videSuggestions,
    sections,
    guidesHtml,
    nbGuides,
    majFr,
    css: indente(CSS, 6),
    script,
  });

  return { html, description, featuredId, nbSections: sections.length, nbGuides };
}

function pageHtml(ctx) {
  const {
    origine,
    compte,
    soi,
    theme,
    sponsorUrl,
    imageEmpreinte,
    libellesFr,
    enPanne,
    coulisses,
    titrePage,
    description,
    jsonLd,
    navCats,
    nbApps,
    nbCats,
    confianceFr,
    featuredHtml,
    videSuggestions,
    sections,
    guidesHtml,
    nbGuides,
    majFr,
    css,
    script,
    raccourci,
  } = ctx;
  return `<!doctype html>
<html lang="fr" data-theme="system">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta http-equiv="Content-Security-Policy" content="${JETON_CSP}" />
    <title>${titrePage}</title>
    <meta name="description" content="${echappe(description)}" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="${origine}/" />
    <link rel="manifest" href="${origine}/manifest.webmanifest" />
    <meta name="theme-color" content="${theme}" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#0f1220" media="(prefers-color-scheme: dark)" />
    <meta name="theme-color" content="${theme}" id="theme-color" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-title" content="GuiiuG" />
    <link rel="apple-touch-icon" href="${origine}/apple-touch-icon.png" />
    <link rel="icon" href="${origine}/favicon.svg" type="image/svg+xml" />
    <link rel="icon" href="${origine}/favicon.ico" sizes="any" />
    <meta property="og:type" content="website" />

    <meta property="og:title" content="${titrePage}" />
    <meta property="og:description" content="${echappe(description)}" />
    <meta property="og:url" content="${origine}/" />
    <meta property="og:image" content="${origine}/og-image.jpg?v=${imageEmpreinte}" />
    <meta property="og:image:type" content="image/jpeg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="Les applications de ${compte} : leurs icônes, en mosaïque" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${titrePage}" />
    <meta name="twitter:description" content="${echappe(description)}" />
    <meta name="twitter:image" content="${origine}/og-image.jpg?v=${imageEmpreinte}" />
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
${css}
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
            src="${origine}/icon-192.png"
            width="44"
            height="44"
            alt=""
            decoding="async"
          />
          <div class="identite-texte">
            <h1 class="marque" data-i18n="marque">GuiiuG</h1>
            <p class="sous-titre" data-i18n="sousTitre">Les applications de ${compte}</p>
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
        <a href="${origine}/" aria-current="page" data-i18n="siteCatalogue">Catalogue</a>
        <a href="${origine}/dev-pwa-config/" data-i18n="siteShowroom">Showroom</a>
        <a href="${origine}/parc-dashboard/" data-i18n="siteParc">Parc</a>
      </nav>

      <label class="filtre${raccourci ? ' filtre-raccourci' : ''}">
          <span class="sr-only" data-i18n="filtre">Rechercher une application</span>
          <span class="filtre-ico" aria-hidden="true">
            <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.2-3.2"/></svg>
          </span>
          <input
            type="search"
            id="filtre"
            data-i18n-placeholder="filtrePh"
            placeholder="Rechercher…"${raccourci ? `
            aria-keyshortcuts="Control+K Meta+K"` : ''}
            autocomplete="off"
            spellcheck="false"
            enterkeyhint="search"
          />${raccourci ? `
          <kbd class="filtre-kbd" aria-hidden="true">
            <span data-mod="ctrl">Ctrl</span>
            <span data-mod="meta">⌘</span>
            <span>K</span>
          </kbd>` : ''}
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
${
  enPanne.length
    ? `      <p class="bandeau-panne" role="status" data-i18n="bandeauPanne">${echappe(libellesFr.bandeauPanne)}</p>\n`
    : ''
}${sections.join('\n\n')}
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
${coulisses.map(s => carteCoulisse(ctx, s)).join('\n')}
        </ul>
      </section>`
    : ''
}
    </main>

    <footer>
      <p>
        <a href="${origine}/a-propos.html" data-i18n="aPropos">À propos</a>${
          nbGuides
            ? `
        ·
        <a href="#guides" data-i18n="guides">Guides pratiques</a>`
            : ''
        }
      </p>
      <p>
        <span data-i18n="source">Code source sur</span>
        <a href="https://github.com/${compte}">github.com/${compte}</a>.
      </p>
      <p>
        <span data-i18n="sponsorBefore">Ces applications sont gratuites et open source.</span>
        <a class="sponsor" href="${sponsorUrl}" rel="noopener noreferrer">
          <span class="ico" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M4 8h12v8a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V8z"/><path d="M16 9h2.5a2.5 2.5 0 0 1 0 5H16"/><path d="M8 5c0 1.5 1.2 2 2 3 .8-1 2-1.5 2-3a2 2 0 1 0-4 0z"/></svg>
          </span>
          <span data-i18n="sponsorLink">M'offrir un café</span>
        </a>
      </p>
      <p>
        <span data-i18n="maj">${majFr}</span>
        ·
        <a href="https://github.com/${compte}/${soi}/blob/main/LICENSE" data-i18n="licence">Licence MIT</a>
      </p>
    </footer>
    <a class="haut" id="haut" href="#catalogue" data-i18n-aria="haut" aria-label="Retour en haut">
      <span class="ico" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
      </span>
    </a>
<script>
${script}
    </script>${raccourci ? `
    <script type="module" src="./hub-command.js"></script>` : ''}
  </body>
</html>
`;
}
