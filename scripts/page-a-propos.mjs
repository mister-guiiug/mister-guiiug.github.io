/**
 * LA PAGE « À PROPOS » DU HUB : qui publie ces applications, pourquoi, et ce
 * que chacune fait de vos données.
 *
 * N'Y ÉCRIRE QUE CE QUI SE VÉRIFIE. Le hub a affiché jusqu'au 29/09/2026
 * « hébergées en Europe » et « aucun compte n'est nécessaire pour commencer » :
 * rien n'étayait la première phrase, et cinq applications contredisaient la
 * seconde. Tout ce que cette page dit des applications vient de `RELEVE`,
 * établi le 29/09/2026 dans le code des dépôts ET dans les variables de leur
 * déploiement ; la page affiche cette date.
 *
 * LE CATALOGUE NE SUFFIT PAS. Son champ `backend` dit ce que le code SAIT
 * faire, pas ce que l'application publiée utilise : mister-footcoach et
 * mister-family-map y sont `supabase`, mais leur déploiement ne reçoit aucune
 * variable Supabase et tourne en local ; mister-molkky aussi, Supabase n'y
 * servant qu'à deux options. Une application absente du relevé n'est donc
 * jamais classée par défaut : la page la dit « pas encore relevée ».
 */
import {
  JETONS,
  echappeHtml,
  entiteEditeur,
  entiteSite,
  filJsonLd,
  pageStatique,
} from './pages-hub.mjs';

/**
 * CE QUE FONT LES APPLICATIONS PUBLIÉES, relevé le 29/09/2026 : code de `main`
 * au commit déployé, et noms des variables de déploiement (`gh variable list`).
 * À relever de nouveau quand une application ajoute ou retire un service.
 */
export const RELEVE = {
  date: '29 septembre 2026',
  /** Où vivent les données de l'application publiée. */
  stockage: {
    local: [
      'miss-badminton',
      'miss-contraction',
      'miss-dice',
      'miss-genius',
      'mister-cim10',
      'mister-family-map',
      'mister-footcoach',
      'mister-molkky',
    ],
    supabase: [
      'miss-carbook',
      'miss-lookhouse',
      'miss-uwh',
      'mister-doc',
      'mister-miss-koh',
      'mister-settle',
    ],
    firebase: ['miss-ticket-pwa', 'mister-puzzle', 'mister-qowa'],
    outils: ['miss-supaboss', 'miss-supatool'],
    bureau: ['mister-quota'],
  },
  /**
   * Un compte est nécessaire pour s'en servir : l'écran de connexion garde
   * l'application entière, ou, chez mister-settle, sa fonction principale (les
   * espaces de dépenses).
   */
  compteObligatoire: ['miss-carbook', 'miss-lookhouse', 'miss-uwh', 'mister-doc', 'mister-settle'],
  /** Clé PostHog posée au déploiement : le bandeau de consentement s'affiche. */
  posthog: [
    'miss-badminton',
    'miss-carbook',
    'miss-contraction',
    'miss-dice',
    'miss-genius',
    'miss-lookhouse',
    'miss-supaboss',
    'miss-supatool',
    'miss-ticket-pwa',
    'miss-uwh',
    'mister-cim10',
    'mister-family-map',
    'mister-footcoach',
    'mister-miss-koh',
    'mister-molkky',
    'mister-puzzle',
    'mister-qowa',
    'mister-settle',
  ],
  /**
   * Le choix se change depuis l'application : une section « Mesure
   * d'audience » (`ConsentSection` du socle, 6.20) dans ses réglages ou
   * l'écran qui en tient lieu — « Retirer mon consentement » si l'on a
   * accepté, « Modifier mon choix » si l'on a refusé. Relevé SUR LES SITES
   * PUBLIÉS, pas dans les PR : c'est ce qu'un visiteur trouve. Sa date est à
   * part, `dateRetrait` : ce relevé-là n'est pas celui du 29/09/2026.
   */
  dateRetrait: '30 septembre 2026',
  retraitConsentement: [
    'miss-badminton',
    'miss-carbook',
    'miss-contraction',
    'miss-dice',
    'miss-genius',
    'miss-lookhouse',
    'miss-supaboss',
    'miss-supatool',
    'miss-ticket-pwa',
    'miss-uwh',
    'mister-cim10',
    'mister-family-map',
    'mister-footcoach',
    'mister-miss-koh',
    'mister-molkky',
    'mister-puzzle',
    'mister-qowa',
    'mister-settle',
  ],
  /**
   * « Retirer mon consentement » efface aussi l'identifiant de visite que
   * PostHog garde dans le navigateur : `opt_out_persistence_by_default`, posé
   * par le socle depuis la 6.21.1. Avant, l'identifiant restait après le
   * retrait, et un accord redonné à une visite suivante le reprenait. Relevé
   * SUR LES SITES PUBLIÉS : l'option est dans le code que sert chaque site
   * (les morceaux de son précache). Sa date est à part, `dateOubli`.
   */
  dateOubli: '1er octobre 2026',
  oubliAuRetrait: [
    'miss-badminton',
    'miss-carbook',
    'miss-contraction',
    'miss-dice',
    'miss-genius',
    'miss-lookhouse',
    'miss-supaboss',
    'miss-supatool',
    'miss-ticket-pwa',
    'miss-uwh',
    'mister-cim10',
    'mister-family-map',
    'mister-footcoach',
    'mister-miss-koh',
    'mister-molkky',
    'mister-puzzle',
    'mister-qowa',
    'mister-settle',
  ],
  /** DSN Sentry posé au déploiement : Sentry démarre à l'ouverture. */
  sentry: [
    'miss-badminton',
    'miss-carbook',
    'miss-contraction',
    'miss-dice',
    'miss-genius',
    'miss-lookhouse',
    'miss-supaboss',
    'miss-supatool',
    'miss-ticket-pwa',
    'miss-uwh',
    'mister-cim10',
    'mister-footcoach',
    'mister-miss-koh',
    'mister-molkky',
    'mister-puzzle',
    'mister-qowa',
    'mister-settle',
  ],
  /** `release` passé à Sentry : une session part à chaque ouverture, erreur ou non. */
  sessionsSentry: [
    'miss-genius',
    'miss-lookhouse',
    'miss-supaboss',
    'miss-supatool',
    'miss-uwh',
    'mister-cim10',
    'mister-miss-koh',
  ],
  /** Polices chargées chez Google Fonts. */
  googleFonts: ['miss-contraction', 'miss-genius', 'miss-uwh', 'mister-cim10', 'mister-qowa'],
};

/** Les applications du catalogue que le relevé ne couvre pas : à relever. */
export function appsNonRelevees(apps) {
  const relevees = new Set(Object.values(RELEVE.stockage).flat());
  return apps.filter(a => !relevees.has(a.id));
}

/** « A, B et C » */
const enumere = mots =>
  mots.length <= 1 ? (mots[0] ?? '') : `${mots.slice(0, -1).join(', ')} et ${mots.at(-1)}`;

/**
 * @param {object} p
 * @param {string} p.origine
 * @param {string} p.compte
 * @param {{ url: string, alt: string }} p.imagePartage
 * @param {Array<{ id: string, name: string, platform: string, adresse: string, repoUrl: string }>} p.apps
 * @param {Set<string>} p.avecIssues   les dépôts qui acceptent des issues
 * @param {string} p.sponsorUrl
 */
export function pageAPropos({ origine, compte, imagePartage, apps, avecIssues, sponsorUrl }) {
  const chemin = '/a-propos.html';
  const url = `${origine}${chemin}`;
  const titre = `À propos de ${compte} (GuiiuG) : qui, pourquoi, vos données`;
  const description = `Qui publie les applications de ${compte} (GuiiuG), pourquoi elles sont gratuites et open source, et ce que chacune fait de vos données.`;

  const parId = new Map(apps.map(a => [a.id, a]));
  /** Les apps d'une liste d'identifiants, présentes au catalogue, par ordre alphabétique. */
  const choisir = ids =>
    ids
      .map(id => parId.get(id))
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  /** Une app, liée : son site, ou sa page du hub. */
  const lien = a => `<a href="${echappeHtml(a.adresse)}">${echappeHtml(a.name)}</a>`;
  const liens = ids => enumere(choisir(ids).map(lien));
  const noms = ids => enumere(choisir(ids).map(a => echappeHtml(a.name)));
  /** « Toutes les applications web sauf X » quand c'est plus court que la liste. */
  const webRelevees = choisir(Object.entries(RELEVE.stockage).flatMap(([k, ids]) => (k === 'bureau' ? [] : ids)));
  const parmiLeWeb = ids => {
    const avec = new Set(ids);
    const sans = webRelevees.filter(a => !avec.has(a.id));
    return sans.length && sans.length < avec.size
      ? `Toutes les applications web sauf ${enumere(sans.map(a => echappeHtml(a.name)))}`
      : noms(ids);
  };
  const aussi = (ids, texte) => (choisir(ids).length ? texte : '');

  const nbWeb = apps.filter(a => a.platform !== 'desktop').length;
  const nbBureau = apps.filter(a => a.platform === 'desktop').length;
  const nonRelevees = appsNonRelevees(apps);

  // Revenir sur son choix : ce que la page dit dépend du relevé, application
  // par application. Tant qu'une application qui mesure n'offre pas le retrait,
  // elle garde la seule voie qui existe chez elle : effacer les données du site.
  const avecRetrait = choisir(RELEVE.retraitConsentement);
  const sansRetrait = RELEVE.posthog.filter(id => !RELEVE.retraitConsentement.includes(id));
  const retraitPartout = avecRetrait.length > 0 && choisir(sansRetrait).length === 0;
  const effacer = 'effacer les données du site dans le navigateur, ce qui efface aussi celles que l’application garde sur l’appareil';
  // Effacer l'identifiant au retrait suppose un retrait : le relevé ne compte
  // que les applications qui l'offrent, et la phrase nomme celles qu'il a vues
  // tant qu'il ne les couvre pas toutes.
  const avecOubli = choisir(RELEVE.oubliAuRetrait.filter(id => RELEVE.retraitConsentement.includes(id)));
  const oubli = avecOubli.length
    ? ` ${
        avecOubli.length === avecRetrait.length
          ? 'Le retrait'
          : `Chez ${enumere(avecOubli.map(a => echappeHtml(a.name)))}, le retrait`
      } efface aussi du navigateur l’identifiant de visite de PostHog (relevé sur les sites publiés le ${RELEVE.dateOubli}).`
    : '';
  const revoirSonChoix = avecRetrait.length
    ? `Votre choix est gardé treize mois, et se change à tout moment : ${
        retraitPartout
          ? 'chacune affiche, dans ses réglages ou l’écran qui en tient lieu,'
          : `${noms(RELEVE.retraitConsentement)} affichent, dans leurs réglages ou l’écran qui en tient lieu,`
      } une section « Mesure d’audience » (relevé sur les sites publiés le ${RELEVE.dateRetrait}). Si vous avez accepté, « Retirer mon consentement » arrête la mesure d’un clic, sans vous reposer la question ; si vous avez refusé, « Modifier mon choix » la repose.${oubli}${
        retraitPartout ? '' : ` Pour ${noms(sansRetrait)}, il faut encore ${effacer}.`
      }`
    : `Votre choix est gardé treize mois ; pour le revoir plus tôt, il faut ${effacer}.`;

  const { local, supabase, firebase, outils, bureau } = RELEVE.stockage;
  const sections = [];
  if (choisir(local).length) {
    sections.push(`
      <h3>Stockées sur l’appareil</h3>
      <p>${liens(local)} gardent vos saisies dans le stockage de votre navigateur (<code>localStorage</code> ou IndexedDB), sur votre appareil, sans compte ni base de données en ligne. Effacer les données du site dans le navigateur les supprime. Ce qui sort malgré tout de l’appareil (services extérieurs, mesure d’audience, erreurs) est décrit plus bas.${aussi(
        ['mister-molkky'],
        ` Mister Mölkky propose deux options qui passent par Supabase : la synchronisation, sous une identité anonyme, et le mode direct, dont la partie diffusée, noms des joueurs compris, est publique — son code à six caractères ne la protège pas.`
      )}</p>`);
  }
  if (choisir(supabase).length) {
    sections.push(`
      <h3>Synchronisées par Supabase</h3>
      <p>${liens(supabase)} enregistrent dans <a href="https://supabase.com/">Supabase</a>, un service de base de données hébergé, ce qu’elles partagent entre vos appareils ou entre les membres d’un groupe.${aussi(
        RELEVE.compteObligatoire,
        ` ${noms(RELEVE.compteObligatoire)} demandent un compte pour s’en servir${aussi(
          ['miss-uwh', 'mister-doc'],
          ' : chez Miss UWH, ce sont les clubs qui créent les comptes de leurs membres, et chez Mister Doc, un administrateur valide chaque inscription'
        )}.`
      )}${aussi(
        ['mister-miss-koh'],
        ` Mister &amp; Miss Koh s’utilise sans compte : favoris et épisodes vus restent sur l’appareil, et un compte, facultatif, les synchronise et garde vos notes. Son partage de photo, facultatif lui aussi, dépose l’image sur le serveur jusqu’à sa première ouverture, un jour au plus.`
      )}</p>`);
  }
  if (choisir(firebase).length) {
    sections.push(`
      <h3>Synchronisées par Firebase</h3>
      <p>${liens(firebase)} synchronisent en temps réel par <a href="https://firebase.google.com/">Firebase</a>, le service de Google, sous une identité anonyme créée automatiquement : aucune inscription.${aussi(
        ['miss-ticket-pwa'],
        ' Miss Ticket demande seulement un pseudo.'
      )}${aussi(['mister-puzzle'], ' Une partie de Mister Puzzle, photos comprises, est lisible par quiconque connaît son code.')}</p>`);
  }
  if (choisir(outils).length) {
    sections.push(`
      <h3>Des outils pour vos propres projets Supabase</h3>
      <p>${liens(outils)} n’ont pas de base de données à elles : elles agissent sur <em>vos</em> projets Supabase, avec les accès que vous leur donnez, et leurs appels à l’API de gestion de Supabase passent par un relais du projet.${aussi(
        ['miss-supatool'],
        ' Miss Supatool garde vos clés en mémoire, sans jamais les enregistrer.'
      )}${aussi(
        ['miss-supaboss'],
        ' Miss Supaboss s’ouvre sur des données de démonstration ; en mode réel, votre jeton d’accès est gardé dans le navigateur, en clair sauf si vous activez son chiffrement.'
      )}</p>`);
  }
  if (choisir(bureau).length) {
    sections.push(`
      <h3>Une application de bureau</h3>
      <p>${liens(bureau)} garde tout sur l’ordinateur : ses données dans une base locale, les clés d’API chiffrées par le trousseau du système. Elle n’appelle que les services dont elle suit la consommation, avec vos clés, et n’embarque ni mesure d’audience ni remontée d’erreurs.</p>`);
  }
  if (nonRelevees.length) {
    sections.push(`
      <p class="note">Pas encore relevées : ${enumere(nonRelevees.map(lien))}.</p>`);
  }

  const services = [
    aussi(
      ['mister-cim10'],
      `<li>Mister CIM10 envoie le texte à coder à l’API de la classification de l’OMS (<code>id.who.int</code>), par un relais du projet ; sa dictée vocale, si vous l’acceptez, passe par le service de reconnaissance vocale du navigateur.</li>`
    ),
    aussi(
      ['miss-lookhouse', 'mister-family-map'],
      `<li>Miss LookHouse envoie les adresses saisies à la Base Adresse Nationale (<code>api-adresse.data.gouv.fr</code>) ; Mister FamilyMap envoie ses recherches de lieu à Nominatim, et charge ses cartes chez OpenStreetMap.</li>`
    ),
    aussi(
      ['miss-uwh', 'mister-qowa'],
      `<li>Miss UWH et Mister Qowa peuvent appeler un service d’IA avec <em>votre</em> clé — Anthropic, OpenAI, OpenRouter, Mistral ou Groq pour la première, Gemini ou Anthropic pour la seconde : la requête part de votre navigateur, directement chez ce fournisseur.</li>`
    ),
    aussi(
      ['mister-doc'],
      `<li>Mister Doc envoie ses notifications, si vous les activez, par le service de notification du navigateur (Web Push).</li>`
    ),
    aussi(
      RELEVE.googleFonts,
      `<li>${noms(RELEVE.googleFonts)} chargent leurs polices chez Google Fonts, qui reçoit donc l’adresse IP du visiteur.</li>`
    ),
  ].filter(Boolean);

  const contacts = apps
    .filter(a => avecIssues.has(a.id))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
    .map(a => `        <li><a href="${echappeHtml(a.repoUrl)}/issues">${echappeHtml(a.name)}</a></li>`)
    .join('\n');
  const depotHub = `${compte}.github.io`;

  const corps = `
      <section class="carte" aria-labelledby="en-bref">
        <h2 id="en-bref" style="margin-top: 0">En bref</h2>
        <dl class="faits">
          <dt>Éditeur</dt>
          <dd>${echappeHtml(compte)}, alias GuiiuG</dd>
          <dt>Applications</dt>
          <dd>${nbWeb} applications web installables${nbBureau ? ` et ${nbBureau === 1 ? 'une application' : `${nbBureau} applications`} de bureau` : ''}</dd>
          <dt>Code</dt>
          <dd>public sur <a href="https://github.com/${compte}">GitHub</a>, sous licence MIT</dd>
          <dt>Prix</dt>
          <dd>gratuit, sans publicité ni achat intégré</dd>
          <dt>Mesure d’audience</dt>
          <dd>PostHog, seulement après votre accord${retraitPartout ? ', qui se retire d’un clic' : ''}</dd>
          <dt>Erreurs</dt>
          <dd>Sentry, dès l’ouverture</dd>
          <dt>Pages servies par</dt>
          <dd>GitHub Pages</dd>
          <dt>Contact</dt>
          <dd>les <a href="#contact">issues GitHub</a> de chaque application</dd>
        </dl>
      </section>

      <h2>Qui publie ces applications</h2>
      <p>Toutes les applications du catalogue sont publiées sous le nom <strong>${echappeHtml(compte)}</strong>, qui signe aussi <strong>GuiiuG</strong>, depuis un même compte GitHub : <a href="https://github.com/${compte}">github.com/${compte}</a>. Le code de chacune y est public, avec son historique et ses issues.</p>

      <h2>Pourquoi ces applications</h2>
      <p>Chacune répond à un besoin précis : chronométrer des contractions, calculer une moyenne avec ses coefficients, compter les points d’une partie de Mölkky, tenir les comptes d’un club, partager des dépenses entre proches… L’idée est la même partout : une application qui s’ouvre d’un lien, dans le navigateur, et que l’on installe sur son écran d’accueil si on le souhaite, sans passer par un magasin d’applications.</p>
      <p>Elles partagent un même socle technique, <a href="https://github.com/${compte}/dev-pwa-config">dev-pwa-config</a>, public lui aussi : configuration, composants et vérifications communs, pour qu’une correction profite à toutes.</p>

      <h2>Gratuites, open source, sans publicité</h2>
      <p>Les applications sont gratuites : ni abonnement, ni achat intégré, ni publicité. Leur code est publié sous licence MIT : chacun peut le lire, le réutiliser et proposer une correction. Pour soutenir le projet, le lien <a href="${echappeHtml(sponsorUrl)}">« M’offrir un café »</a>, au bas du catalogue, mène à Buy Me a Coffee.</p>

      <h2 id="donnees">Vos données, selon le type d’application</h2>
      <p>Ce qu’une application fait de vos données dépend de l’endroit où elle les range. Relevé dans le code des applications publiées le ${RELEVE.date}.</p>
${sections.join('\n')}${
    services.length
      ? `

      <h3>Les services extérieurs appelés par certaines applications</h3>
      <ul>
        ${services.join('\n        ')}
      </ul>`
      : ''
  }

      <h3>Mesure d’audience : PostHog, seulement si vous l’acceptez</h3>
      <p>${parmiLeWeb(RELEVE.posthog)} affichent un bandeau de consentement : tant que vous n’avez pas choisi « Accepter », rien n’est chargé ni envoyé. Si vous acceptez, <a href="https://posthog.com/">PostHog</a>, sur ses serveurs européens, reçoit les pages vues et quelques événements d’usage (une partie lancée, un export…)${aussi(
        ['miss-contraction'],
        ', et, pour Miss Contraction, des mesures de vitesse de la page'
      )}, sans cookie : son identifiant reste dans le stockage du navigateur. Ni enregistrement des sessions, ni capture automatique des clics. ${revoirSonChoix}</p>

      <h3>Remontée d’erreurs : Sentry, dès l’ouverture</h3>
      <p>${parmiLeWeb(RELEVE.sentry)} démarrent <a href="https://sentry.io/">Sentry</a> à l’ouverture, sans consentement préalable, sur ses serveurs situés en Allemagne. Quand une erreur survient, Sentry reçoit un rapport technique : le message et la pile d’appels, la page, le navigateur, et le fil des dernières actions (clics, navigation, requêtes réseau avec leur adresse, messages de la console) ; comme tout envoi, il porte l’adresse IP du navigateur.${aussi(
        RELEVE.sessionsSentry,
        ` ${noms(RELEVE.sessionsSentry)} lui envoient aussi, à chaque ouverture, un signal de session sans erreur, qui sert à mesurer leur stabilité.`
      )} Ni enregistrement des sessions, ni mesure de performance.</p>
      <p>Le catalogue lui-même, ces pages comprises, n’a ni mesure d’audience ni remontée d’erreurs.</p>

      <h3>L’hébergement des pages</h3>
      <p>Le catalogue et les applications web sont servis par GitHub Pages. Comme le <a href="https://docs.github.com/fr/pages/getting-started-with-github-pages/about-github-pages#data-collection">documente GitHub</a>, l’adresse IP de chaque visiteur y est enregistrée et conservée à des fins de sécurité.</p>

      <h2 id="contact">Contact</h2>
      <p>Une question, un bug, une idée : ouvrez une issue sur le dépôt GitHub de l’application concernée. Pour le catalogue lui-même, c’est le dépôt <a href="https://github.com/${compte}/${depotHub}/issues">${echappeHtml(depotHub)}</a>.</p>
      <ul class="colonnes">
${contacts}
      </ul>`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'AboutPage',
        '@id': url,
        url,
        name: titre,
        description,
        inLanguage: 'fr',
        isPartOf: { '@id': `${origine}/#site` },
        about: { '@id': `${origine}/#org` },
        mainEntity: { '@id': `${origine}/#org` },
        breadcrumb: { '@id': `${url}#fil` },
        dateModified: JETONS.majIso,
      },
      entiteEditeur({ origine, compte }),
      entiteSite({ origine, compte }),
      filJsonLd(url, [
        { nom: 'Catalogue', url: `${origine}/` },
        { nom: 'À propos', url },
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
      { nom: 'À propos', url },
    ],
    navCourante: chemin,
    imagePartage,
    h1: `À propos de ${echappeHtml(compte)}`,
    chapeau: `${echappeHtml(compte)}, alias GuiiuG, publie les applications de ce catalogue. Qui est derrière, pourquoi elles existent, et ce que chacune fait de vos données.`,
    corps,
  });
}
