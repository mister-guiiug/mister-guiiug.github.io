/**
 * Les pages STATIQUES du hub : `a-propos.html`, une page par application de
 * bureau (`mister-quota.html`) et `404.html`.
 *
 * SANS SCRIPT. Elles sont lues telles quelles par les robots, y compris ceux
 * qui n'exécutent pas JavaScript (GPTBot, ClaudeBot, PerplexityBot…), et par
 * les aperçus de lien. Une CSP `default-src 'none'` le garantit : seuls le
 * style en ligne et les images de l'origine passent. Le JSON-LD n'est pas du
 * code, la CSP ne le bloque pas.
 *
 * L'ÉDITEUR EST UNE SEULE ENTITÉ. `entiteEditeur` et `entiteSite` sont aussi
 * ceux de l'accueil (`build-site.mjs`) : mêmes `@id`, mêmes propriétés, sur
 * toutes les pages. Le socle référencera `#org` par son `@id`.
 *
 * LES DATES SONT DES JETONS. Une page arrive avec `JETONS.majFr` à la place de
 * sa date ; `build-site.mjs` calcule son empreinte sur ce texte, en tire son
 * `lastmod`, puis `dater` pose la date. La date affichée ne fait donc jamais
 * changer l'empreinte.
 */
import { echappe as echappeHtml } from './echappe.mjs';
import { jourAffiche } from './seo-hub.mjs';

/** L'échappement du hub, sous le nom que `page-a-propos.mjs` importe d'ici. */
export { echappeHtml };

/** Les jetons de date, remplacés par `dater` après le calcul de l'empreinte. */
export const JETONS = {
  majFr: '@@MAJ_FR@@',
  majEn: '@@MAJ_EN@@',
  majIso: '@@MAJ_ISO@@',
};

/** Pose la date du dernier changement (AAAA-MM-JJ) à la place des jetons. */
export function dater(texte, jour) {
  return texte
    .replaceAll(JETONS.majFr, jourAffiche(jour, 'fr'))
    .replaceAll(JETONS.majEn, jourAffiche(jour, 'en'))
    .replaceAll(JETONS.majIso, jour);
}

/** Un bloc JSON-LD sûr : un `</script>` dans une chaîne fermerait le bloc. */
export const jsonLdTexte = objet => JSON.stringify(objet).replace(/</g, '\\u003c');

// ---------------------------------------------------------------------------
// Entités
// ---------------------------------------------------------------------------

/**
 * L'éditeur du parc, `#org`. `alternateName` : la marque « GuiiuG », celle du
 * titre du hub et du raccourci installé. `logo` : l'icône 512 px du hub.
 * `sameAs` : le profil GitHub, où vit tout le code.
 */
export function entiteEditeur({ origine, compte }) {
  return {
    '@type': 'Organization',
    '@id': `${origine}/#org`,
    name: compte,
    alternateName: 'GuiiuG',
    url: `${origine}/`,
    logo: `${origine}/icon-512.png`,
    sameAs: [`https://github.com/${compte}`],
  };
}

/** Le site, `#site`, publié par `#org`. */
export function entiteSite({ origine, compte }) {
  return {
    '@type': 'WebSite',
    '@id': `${origine}/#site`,
    name: `Les applications de ${compte}`,
    url: `${origine}/`,
    inLanguage: 'fr',
    publisher: { '@id': `${origine}/#org` },
  };
}

/** La catégorie du catalogue dans le vocabulaire de Google, comme le socle. */
export const CATEGORIES_SCHEMA = {
  sante: 'HealthApplication',
  sport: 'SportsApplication',
  jeux: 'GameApplication',
  loisirs: 'LifestyleApplication',
  education: 'EducationalApplication',
  outils: 'UtilitiesApplication',
  dev: 'DeveloperApplication',
};

/** Le fil d'Ariane d'une page, en `BreadcrumbList` : le même que celui affiché. */
export function filJsonLd(url, etapes) {
  return {
    '@type': 'BreadcrumbList',
    '@id': `${url}#fil`,
    itemListElement: etapes.map((e, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: e.nom,
      item: e.url,
    })),
  };
}

// ---------------------------------------------------------------------------
// Gabarit
// ---------------------------------------------------------------------------

/**
 * Le style du hub, réduit à ce qu'une page de lecture demande : mêmes jetons de
 * couleur, mêmes polices, même fond. Le thème suit le système — sans script, la
 * préférence mémorisée par le hub n'est pas lisible ici.
 */
const STYLE = `
      :root {
        color-scheme: light dark;
        --fond: #f7f8fc;
        --fond-carte: #ffffff;
        --texte: #1a1b26;
        --doux: #55586b;
        --bord: #d9dbe6;
        --lien: #2f4bd1;
        --barre: #eef0f7;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --fond: #0f1220;
          --fond-carte: #15192b;
          --texte: #e8e9f2;
          --doux: #a8abc2;
          --bord: #2a2e45;
          --lien: #9fb2ff;
          --barre: #181c2e;
        }
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0 auto;
        max-width: 46rem;
        padding:
          max(1.25rem, env(safe-area-inset-top, 0px))
          max(1rem, env(safe-area-inset-right, 0px))
          max(3rem, env(safe-area-inset-bottom, 0px))
          max(1rem, env(safe-area-inset-left, 0px));
        background:
          radial-gradient(ellipse 90% 40% at 50% -10%, color-mix(in srgb, var(--lien) 16%, transparent), transparent 70%),
          var(--fond);
        color: var(--texte);
        font-family: "Segoe UI", ui-sans-serif, system-ui, sans-serif;
        line-height: 1.65;
        overflow-wrap: break-word;
      }
      .evitement {
        position: absolute;
        left: 1rem;
        top: 1rem;
        z-index: 10;
        padding: 0.5rem 0.85rem;
        border-radius: 0.5rem;
        background: var(--lien);
        color: #fff;
        transform: translateY(-200%);
      }
      .evitement:focus {
        transform: none;
      }
      .entete {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        margin: 0 0 1.5rem;
      }
      .marque {
        display: inline-flex;
        align-items: center;
        gap: 0.6rem;
        color: var(--texte);
        font-family: "Trebuchet MS", "Segoe UI", ui-sans-serif, system-ui, sans-serif;
        font-size: 1.3rem;
        font-weight: 700;
        letter-spacing: -0.03em;
        text-decoration: none;
      }
      .marque::before {
        content: '';
        width: 2.25rem;
        height: 2.25rem;
        flex-shrink: 0;
        border-radius: 0.6rem;
        background: url('/icon-192.png') center / cover;
        box-shadow: 0 4px 14px color-mix(in srgb, var(--texte) 12%, transparent);
      }
      .sites {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
      }
      .sites a {
        display: inline-flex;
        align-items: center;
        min-height: 2.25rem;
        padding: 0.1rem 0.8rem;
        border: 1px solid var(--bord);
        border-radius: 999px;
        background: var(--fond-carte);
        color: var(--texte);
        font-size: 0.85rem;
        font-weight: 600;
        text-decoration: none;
      }
      .sites a[aria-current='page'] {
        border-color: var(--lien);
        background: color-mix(in srgb, var(--lien) 12%, var(--fond-carte));
        color: var(--lien);
      }
      .fil ol {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem;
        margin: 0 0 1rem;
        padding: 0;
        list-style: none;
        color: var(--doux);
        font-size: 0.85rem;
      }
      .fil li + li::before {
        content: '›';
        margin-right: 0.35rem;
      }
      h1 {
        margin: 0 0 0.75rem;
        font-family: "Trebuchet MS", "Segoe UI", ui-sans-serif, system-ui, sans-serif;
        font-size: clamp(1.6rem, 5vw, 2.15rem);
        line-height: 1.15;
        letter-spacing: -0.02em;
      }
      h2 {
        margin: 2.25rem 0 0.6rem;
        font-size: 1.22rem;
        line-height: 1.3;
      }
      h3 {
        margin: 1.5rem 0 0.4rem;
        font-size: 1.02rem;
        line-height: 1.35;
      }
      p,
      ul,
      ol,
      dl {
        margin: 0 0 1rem;
      }
      ul,
      ol {
        padding-left: 1.25rem;
      }
      li + li {
        margin-top: 0.3rem;
      }
      a {
        color: var(--lien);
      }
      a:focus-visible {
        outline: 3px solid var(--lien);
        outline-offset: 2px;
        border-radius: 0.2rem;
      }
      code {
        padding: 0.05rem 0.3rem;
        border-radius: 0.3rem;
        background: var(--barre);
        font-family: ui-monospace, "Cascadia Mono", "Segoe UI Mono", monospace;
        font-size: 0.9em;
      }
      .chapeau {
        margin: 0 0 1.5rem;
        color: var(--doux);
        font-size: 1.08rem;
      }
      .carte {
        margin: 0 0 1.25rem;
        padding: 1rem 1.15rem;
        border: 1px solid var(--bord);
        border-radius: 1rem;
        background: var(--fond-carte);
      }
      .carte > :last-child {
        margin-bottom: 0;
      }
      .faits {
        display: grid;
        grid-template-columns: max-content minmax(0, 1fr);
        gap: 0.4rem 1rem;
      }
      .faits dt {
        color: var(--doux);
        font-weight: 600;
      }
      .faits dd {
        margin: 0;
      }
      .colonnes {
        columns: 2 16rem;
        column-gap: 2rem;
      }
      .colonnes li {
        break-inside: avoid;
      }
      .note {
        color: var(--doux);
        font-size: 0.9rem;
      }
      footer {
        margin-top: 3rem;
        padding-top: 1.25rem;
        border-top: 1px solid var(--bord);
        color: var(--doux);
        font-size: 0.9rem;
      }
      footer p {
        margin: 0 0 0.6rem;
      }
      @media (max-width: 30rem) {
        .faits {
          grid-template-columns: minmax(0, 1fr);
        }
        .faits dd {
          margin-bottom: 0.5rem;
        }
      }
      @media (forced-colors: active) {
        .sites a,
        .carte {
          border: 1px solid CanvasText;
        }
      }`;

/**
 * Une page statique du hub.
 *
 * @param {object} p
 * @param {string} p.origine
 * @param {string} p.compte
 * @param {string} p.chemin        `/a-propos.html`
 * @param {string} p.titre         le `<title>`, 50 à 70 caractères
 * @param {string} p.description   la meta description, 70 à 160 caractères
 * @param {boolean} [p.indexable]  `false` : `noindex`, ni canonique ni Open Graph
 * @param {object|null} [p.jsonLd]
 * @param {{ nom: string, url: string }[]|null} [p.fil]  fil d'Ariane, page courante en dernier
 * @param {string|null} [p.navCourante]  le chemin de la page à marquer dans la navigation
 * @param {{ url: string, alt: string }|null} [p.imagePartage]
 * @param {string} p.h1
 * @param {string} p.chapeau       du HTML
 * @param {string} p.corps         du HTML
 * @param {boolean} [p.date]       « Mis à jour le … » au pied de page
 */
export function pageStatique({
  origine,
  compte,
  chemin,
  titre,
  description,
  indexable = true,
  jsonLd = null,
  fil = null,
  navCourante = null,
  imagePartage = null,
  h1,
  chapeau,
  corps,
  date = true,
}) {
  const url = `${origine}${chemin}`;
  const courant = c => (c === navCourante ? ' aria-current="page"' : '');
  const meta = indexable
    ? `
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="${echappeHtml(url)}" />
    <meta property="og:type" content="website" />
    <meta property="og:locale" content="fr_FR" />
    <meta property="og:site_name" content="${echappeHtml(`Les applications de ${compte}`)}" />
    <meta property="og:title" content="${echappeHtml(titre)}" />
    <meta property="og:description" content="${echappeHtml(description)}" />
    <meta property="og:url" content="${echappeHtml(url)}" />${
      imagePartage
        ? `
    <meta property="og:image" content="${echappeHtml(imagePartage.url)}" />
    <meta property="og:image:type" content="image/jpeg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${echappeHtml(imagePartage.alt)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="${echappeHtml(imagePartage.url)}" />`
        : ''
    }
    <meta name="twitter:title" content="${echappeHtml(titre)}" />
    <meta name="twitter:description" content="${echappeHtml(description)}" />`
    : `
    <meta name="robots" content="noindex" />`;
  const filHtml = fil
    ? `
    <nav class="fil" aria-label="Fil d'Ariane">
      <ol>
${fil
  .map((e, i) =>
    i === fil.length - 1
      ? `        <li aria-current="page">${echappeHtml(e.nom)}</li>`
      : `        <li><a href="${echappeHtml(e.url)}">${echappeHtml(e.nom)}</a></li>`
  )
  .join('\n')}
      </ol>
    </nav>`
    : '';
  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'" />
    <title>${echappeHtml(titre)}</title>
    <meta name="description" content="${echappeHtml(description)}" />${meta}
    <meta name="theme-color" content="#2f4bd1" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#0f1220" media="(prefers-color-scheme: dark)" />
    <link rel="icon" href="${origine}/favicon.svg" type="image/svg+xml" />
    <link rel="icon" href="${origine}/favicon.ico" sizes="any" />
    <link rel="apple-touch-icon" href="${origine}/apple-touch-icon.png" />${
      jsonLd
        ? `
    <script type="application/ld+json">${jsonLdTexte(jsonLd)}</script>`
        : ''
    }
    <style>${STYLE}
    </style>
  </head>
  <body>
    <a class="evitement" href="#contenu">Aller au contenu</a>
    <header class="entete">
      <a class="marque" href="${origine}/">GuiiuG</a>
      <nav class="sites" aria-label="Pages du hub">
        <a href="${origine}/"${courant('/')}>Catalogue</a>
        <a href="${origine}/a-propos.html"${courant('/a-propos.html')}>À propos</a>
      </nav>
    </header>${filHtml}
    <main id="contenu">
      <h1>${h1}</h1>
      <p class="chapeau">${chapeau}</p>
${corps}
    </main>
    <footer>
      <p>
        <a href="${origine}/">Toutes les applications</a> ·
        <a href="${origine}/a-propos.html">À propos</a> ·
        <a href="https://github.com/${compte}">Code source sur GitHub</a>
      </p>
      <p>${date ? `Mis à jour le ${JETONS.majFr} · ` : ''}<a href="https://github.com/${compte}/${compte}.github.io/blob/main/LICENSE">Licence MIT</a></p>
    </footer>
  </body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Mister Quota
// ---------------------------------------------------------------------------

/**
 * LA PAGE DE MISTER QUOTA, application de bureau Electron sans site Pages. Sans
 * elle, sa seule présence sur l'origine était une carte du hub qui menait au
 * dépôt GitHub : ni page, ni données structurées.
 *
 * Tout ce qu'elle dit vient du README du dépôt, relu le 29/09/2026, et de
 * l'API GitHub à chaque construction pour la dernière version publiée : tant
 * qu'il n'y en a pas, la page le dit, et ne propose aucun téléchargement.
 */
export function pageMisterQuota({ origine, compte, app, version, avecIssues, imagePartage }) {
  const chemin = `/${app.id}.html`;
  const url = `${origine}${chemin}`;
  const depot = `https://github.com/${compte}/${app.id}`;
  const versions = `${depot}/releases`;
  const titre = 'Mister Quota - suivre la consommation de ses comptes d’IA';
  const description =
    'Application de bureau open source pour suivre la consommation de plusieurs comptes d’IA (Claude, Cursor, OpenAI) et voir son avance ou son retard sur le quota.';
  const obtenir = version
    ? `<p>La dernière version publiée est la <a href="${echappeHtml(version.url)}">${echappeHtml(version.tag)}</a>${
        version.date ? `, parue le ${echappeHtml(jourAffiche(version.date, 'fr'))}` : ''
      }. Les versions suivantes paraîtront sur la <a href="${versions}">page des versions du dépôt</a>.</p>`
    : `<p><strong>Aucun installateur n’est publié à ce jour</strong> : le dépôt n’a encore publié aucune version. Quand une version paraîtra, elle sera sur la <a href="${versions}">page des versions du dépôt</a>. D’ici là, l’application se construit depuis ses sources :</p>
      <ol>
        <li>installer Node.js 22.13 ou plus récent (hors 23 et 25) ;</li>
        <li>disposer d’un jeton GitHub de portée <code>read:packages</code> : le socle commun de la famille est publié sur GitHub Packages, qui l’exige même pour un paquet public ;</li>
        <li>dans le dépôt, lancer <code>npm install</code> puis <code>npm run build:electron</code>, qui produit un installateur DMG (macOS), NSIS (Windows) ou AppImage (Linux).</li>
      </ol>`;
  const corps = `
      <section class="carte" aria-labelledby="en-bref">
        <h2 id="en-bref" style="margin-top: 0">En bref</h2>
        <dl class="faits">
          <dt>Type</dt>
          <dd>Application de bureau (Electron), pas une application web</dd>
          <dt>Systèmes</dt>
          <dd>Windows, macOS et Linux</dd>
          <dt>Maturité</dt>
          <dd>Alpha : en développement</dd>
          <dt>Prix</dt>
          <dd>Gratuite</dd>
          <dt>Licence</dt>
          <dd>MIT, <a href="${depot}">code source sur GitHub</a></dd>
          <dt>Installateur</dt>
          <dd>${version ? `<a href="${echappeHtml(version.url)}">${echappeHtml(version.tag)}</a>` : 'aucun publié à ce jour'}</dd>
        </dl>
      </section>

      <h2>Ce qu’elle fait</h2>
      <p>Chaque compte d’IA suivi a son quota — en jetons, en argent, en requêtes ou en crédits — et sa période : semaine, mois, année ou durée sur mesure, calée sur la date anniversaire du compte. Pour chacun, l’application calcule :</p>
      <ul>
        <li>ce qui a été consommé, et ce qu’une consommation régulière aurait donné à la même date ;</li>
        <li>l’écart entre les deux, et un statut : en avance, dans les temps, en retard, quota dépassé ;</li>
        <li>la moyenne quotidienne à tenir pour finir la période dans le quota ;</li>
        <li>une projection de la consommation en fin de période, si le rythme se maintient.</li>
      </ul>
      <p>Les relevés se saisissent à la main ou se collectent automatiquement. Des seuils d’alerte déclenchent une notification du système, une icône dans la zone de notification donne l’état d’un coup d’œil, et chaque compte peut se synchroniser à intervalle régulier. Les données se sauvegardent dans un fichier JSON qui se restaure, s’exportent en CSV, et des relevés s’importent depuis un CSV.</p>

      <h2>La collecte automatique, service par service</h2>
      <ul>
        <li><strong>Claude (Anthropic)</strong> : lit l’API Usage &amp; Cost d’une organisation de la Console Claude, avec une clé Admin d’organisation. Un abonnement individuel (Claude Pro ou Max) n’y a pas accès : il se suit à la main.</li>
        <li><strong>Cursor</strong> : lit l’API d’administration d’une équipe, avec une clé d’administration d’équipe. Un abonnement individuel se suit à la main.</li>
        <li><strong>OpenAI</strong> : connecteur encore à terminer ; ses relevés sont à vérifier avant de s’y fier.</li>
      </ul>

      <h2>Vos données</h2>
      <p>Tout reste sur l’ordinateur : les comptes et les relevés sont dans une base SQLite, dans le dossier de données de l’application. Les clés d’API sont chiffrées par le trousseau du système (Keychain sur macOS, DPAPI sur Windows, libsecret sur Linux) ; elles n’entrent jamais dans une sauvegarde, et sous Linux sans libsecret l’application refuse de les enregistrer plutôt que de les écrire en clair. Elles ne sont déchiffrées qu’au moment d’appeler le service concerné.</p>
      <p>Les seuls échanges réseau sont ces appels, avec vos clés, aux API des services suivis (Anthropic, Cursor, OpenAI). L’application n’embarque ni mesure d’audience ni remontée d’erreurs, et ne cherche pas de mise à jour d’elle-même.</p>
      <p>Les autres applications de la famille, et ce qu’elles font de vos données, sont décrites sur la page <a href="${origine}/a-propos.html">À propos</a>.</p>

      <h2>L’obtenir</h2>
      ${obtenir}

      <h2>Code source et contact</h2>
      <p>Le code est public sur <a href="${depot}">github.com/${compte}/${app.id}</a>, sous licence MIT.${
        avecIssues.has(app.id)
          ? ` Une question, un bug, une idée : <a href="${depot}/issues">ouvrir une issue</a>.`
          : ''
      }</p>`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': url,
        url,
        name: titre,
        description,
        inLanguage: 'fr',
        isPartOf: { '@id': `${origine}/#site` },
        mainEntity: { '@id': `${url}#app` },
        breadcrumb: { '@id': `${url}#fil` },
        dateModified: JETONS.majIso,
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${url}#app`,
        name: app.name,
        description: app.description,
        url,
        applicationCategory: CATEGORIES_SCHEMA[app.category] ?? 'DesktopEnhancementApplication',
        operatingSystem: 'Windows, macOS, Linux',
        isAccessibleForFree: true,
        license: `${depot}/blob/main/LICENSE`,
        sameAs: [depot],
        author: { '@id': `${origine}/#org` },
        publisher: { '@id': `${origine}/#org` },
        ...(version
          ? {
              softwareVersion: version.tag.replace(/^v/, ''),
              downloadUrl: version.url,
              offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
            }
          : {}),
      },
      entiteEditeur({ origine, compte }),
      entiteSite({ origine, compte }),
      filJsonLd(url, [
        { nom: 'Catalogue', url: `${origine}/` },
        { nom: app.name, url },
      ]),
    ],
  };
  return pageStatique({
    origine,
    compte,
    chemin,
    titre,
    description,
    jsonLd,
    fil: [
      { nom: 'Catalogue', url: `${origine}/` },
      { nom: app.name, url },
    ],
    imagePartage,
    h1: 'Mister Quota : suivre la consommation de ses comptes d’IA',
    chapeau: `${echappeHtml(app.name)} est une application de bureau pour suivre plusieurs comptes d’IA — Claude, Cursor, OpenAI… — et voir, pour chacun, l’avance ou le retard pris sur une consommation régulière jusqu’à la fin de la période.`,
    corps,
  });
}

/** Les applications de bureau qui ont leur page sur le hub. */
export const PAGES_BUREAU = {
  'mister-quota': pageMisterQuota,
};

// ---------------------------------------------------------------------------
// 404
// ---------------------------------------------------------------------------

/**
 * LA PAGE 404 DE LA RACINE. GitHub Pages la sert, avec le statut 404, pour
 * toute URL inconnue sous l'origine qui n'appartient à aucun site : une faute
 * de casse (`/Miss-Dice/`), un dépôt sans Pages (`/mister-quota/`), un lien
 * mort. Sans elle, c'était la page par défaut de GitHub.
 *
 * `noindex`, sans canonique ni Open Graph, hors plan de site : ce n'est pas une
 * page à trouver. Ses liens sont ABSOLUS : elle est servie à n'importe quelle
 * profondeur.
 */
export function page404({ origine, compte, apps }) {
  const liste = apps
    .slice()
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
    .map(a => `        <li><a href="${echappeHtml(a.url)}">${echappeHtml(a.nom)}</a></li>`)
    .join('\n');
  return pageStatique({
    origine,
    compte,
    chemin: '/404.html',
    titre: `Page introuvable - Les applications de ${compte}`,
    description: `Cette adresse ne mène à aucune page. Le catalogue des applications de ${compte} est à la racine du site.`,
    indexable: false,
    date: false,
    h1: 'Cette page n’existe pas',
    chapeau:
      'L’adresse demandée ne mène à aucune page. Elle a peut-être changé, ou contient une faute de frappe : les adresses des applications s’écrivent en minuscules.',
    corps: `
      <p><a href="${origine}/"><strong>Retour au catalogue des applications</strong></a></p>
      <h2>Les applications</h2>
      <ul class="colonnes">
${liste}
      </ul>`,
  });
}
