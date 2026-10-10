/**
 * Le manifeste du hub.
 *
 * LA PORTÉE NE DOIT COUVRIR AUCUNE APPLICATION. Le hub et les applications
 * partagent l'origine `mister-guiiug.github.io`, et Chrome tient pour « déjà
 * installée » toute page située dans la portée d'une application installée :
 * sur Android, la WebAPK capte sa portée par un filtre `android:pathPrefix`.
 * Du 27/09 au 03/10/2026, la portée valait « / » : dès que le hub était
 * installé, AUCUNE des vingt applications ne pouvait plus l'être — le menu de
 * Chrome proposait « Ouvrir dans GuiiuG » à la place d'« Installer ».
 *
 * Une portée est un PRÉFIXE : aucune ne contient « / » sans contenir aussi
 * « /mister-miss-koh/ ». Elle se réduit donc à la page du hub, `/index.html`.
 * Chrome permet d'installer depuis une page hors de la portée (« / ») : c'est
 * le cas d'usage d'un index de PWA servies dans des sous-chemins.
 *
 * L'`id` NE CHANGE PAS : c'est lui qui fait l'identité de l'application
 * installée. Le changer créerait une seconde application ; le garder fait que
 * Chrome met à jour celle qui est installée, portée comprise.
 */

/** « Dans la portée », au sens du manifeste : même origine, chemin préfixé. */
export const dansLaPortee = (url, portee) => {
  const u = new URL(url);
  const p = new URL(portee, u.origin);
  return u.origin === p.origin && u.pathname.startsWith(p.pathname);
};

/**
 * Ce qui rendrait le hub installable « par-dessus » les apps.
 *
 * @param {{ scope?: string }} manifeste
 * @param {object} opts
 * @param {string} opts.origine
 * @param {string[]} opts.appIds  identifiants de dépôt (`mister-settle`, …)
 * @returns {null | { code: string, detail: string, apps?: string[] }}
 */
export function problemePorteeHub(manifeste, { origine, appIds }) {
  if (!manifeste || typeof manifeste.scope !== 'string' || !manifeste.scope) {
    return { code: 'scope-absent', detail: 'manifeste du hub sans scope' };
  }
  const scope = new URL(manifeste.scope, origine);
  const chemin = scope.pathname;
  if (chemin === '/' || chemin === '') {
    return {
      code: 'scope-racine',
      detail: `scope « ${manifeste.scope} » couvre toute l'origine : aucune app ne serait plus installable`,
    };
  }
  const couvertes = appIds.filter(id =>
    dansLaPortee(`${origine.replace(/\/$/, '')}/${id}/`, scope.href)
  );
  if (couvertes.length) {
    return {
      code: 'scope-apps',
      detail: `scope « ${manifeste.scope} » couvre ${couvertes.length} app(s)`,
      apps: couvertes,
    };
  }
  return null;
}

export function manifesteHub({ origine, compte, description, theme, langue = 'fr' }) {
  // L'ANGLAIS A SON MANIFESTE, sous /en/ : une autre application installable,
  // dans sa langue, dont la portée ne couvre elle aussi aucune application.
  const en = langue === 'en';
  return {
    id: en ? `${origine}/en/` : `${origine}/`,
    name: en ? `Apps by ${compte}` : `Les applications de ${compte}`,
    short_name: 'GuiiuG',
    description,
    lang: langue,
    dir: 'ltr',
    start_url: en ? `${origine}/en/` : `${origine}/index.html`,
    scope: en ? `${origine}/en/` : `${origine}/index.html`,
    display: 'standalone',
    background_color: theme,
    theme_color: theme,
    icons: [
      {
        src: `${origine}/icon-192.png`,
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: `${origine}/icon-512.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: `${origine}/icon-512.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
