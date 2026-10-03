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
export function manifesteHub({ origine, compte, description, theme }) {
  return {
    id: `${origine}/`,
    name: `Les applications de ${compte}`,
    short_name: 'GuiiuG',
    description,
    lang: 'fr',
    dir: 'ltr',
    start_url: `${origine}/index.html`,
    scope: `${origine}/index.html`,
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
