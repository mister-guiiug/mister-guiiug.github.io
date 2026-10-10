/**
 * LA PAGE « INSTALLER SUR ANDROID » DU HUB.
 *
 * Sur Android, Chrome installe chaque PWA en WebAPK dont le filtre
 * `android:pathPrefix` reprend la `scope` du manifeste. Le hub et les apps
 * partagent l'origine `mister-guiiug.github.io` : si le hub a jamais été
 * installé avec `scope: "/"`, Chrome tient toutes les apps pour « déjà
 * installées » (voir scripts/manifeste-hub.mjs). Cette page dit quoi faire
 * pour réinstaller proprement, sans autre domaine ni sous-domaine.
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
 * @param {object} p
 * @param {string} p.origine
 * @param {string} p.compte
 * @param {{ url: string, alt: string }} p.imagePartage
 */
export function pageInstallerAndroid({ origine, compte, imagePartage }) {
  const chemin = '/installer-android.html';
  const url = `${origine}${chemin}`;
  const titre = `Installer les applications GuiiuG sur Android (Chrome)`;
  const description =
    'Comment installer le catalogue et chaque application PWA sur Android, sans conflit « application déjà installée », en restant sur mister-guiiug.github.io.';
  const hote = echappeHtml(new URL(origine).host);

  const corps = `
      <section class="carte" aria-labelledby="pourquoi">
        <h2 id="pourquoi" style="margin-top: 0">Pourquoi Chrome dit « déjà installée »</h2>
        <p>
          Toutes les applications de la famille sont servies sous la même adresse
          (<code>${hote}</code>), chacune dans son chemin
          (<code>/mister-settle/</code>, <code>/miss-…/</code>). Android
          enregistre une WebAPK dont la portée est un préfixe de chemin. Si le
          catalogue (GuiiuG) a été installé avec une portée trop large
          (<code>/</code>), Chrome propose «&nbsp;Ouvrir dans GuiiuG&nbsp;» au
          lieu d’«&nbsp;Installer&nbsp;» pour chaque application.
        </p>
        <p>
          Depuis octobre 2026, le manifeste du catalogue limite sa portée à
          <code>/index.html</code> : il ne couvre plus les applications. Une
          ancienne WebAPK peut pourtant rester enregistrée après suppression
          de l’icône d’accueil.
        </p>
      </section>

      <section class="carte" aria-labelledby="ordre">
        <h2 id="ordre">Ordre recommandé</h2>
        <ol>
          <li>Installer d’abord l’application voulue (par ex.
            <a href="${origine}/mister-settle/">Mister Settle</a>), depuis
            Chrome — pas depuis le catalogue déjà installé.</li>
          <li>Ensuite seulement, installer le catalogue depuis
            <a href="${origine}/">${origine}/</a>.</li>
        </ol>
        <p>
          Depuis le catalogue installé, les liens vers les applications
          s’ouvrent dans le navigateur : c’est voulu, pour que chaque app
          reste installable à part.
        </p>
      </section>

      <section class="carte" aria-labelledby="purge">
        <h2 id="purge">Si une app refuse de s’installer</h2>
        <ol>
          <li>
            <strong>Paramètres Android → Applications</strong> — désinstaller
            explicitement <em>GuiiuG</em>, l’application concernée, et toute
            autre PWA de <code>${hote}</code> (pas seulement l’icône
            d’accueil).
          </li>
          <li>
            Dans Chrome, ouvrir <code>chrome://webapks</code> (ou
            <code>about://webapks</code>) et vérifier qu’il ne reste aucune
            entrée pour cette origine.
          </li>
          <li>
            Chrome → paramètres du site <code>${hote}</code> →
            <strong>Effacer les données</strong>. Une seule origine : cela
            efface aussi le stockage local de <em>toutes</em> les applications
            de la famille (connexions, saisies hors ligne).
          </li>
          <li>Redémarrer Chrome, puis réinstaller dans l’ordre ci-dessus.</li>
        </ol>
      </section>

      <section class="carte" aria-labelledby="limites">
        <h2 id="limites">Ce qui ne changera pas</h2>
        <p>
          Pas d’autre domaine ni sous-domaine : le déploiement reste GitHub
          Pages sur <code>${hote}</code>. Les permissions et le stockage du
          navigateur restent partagés entre les applications de cette adresse —
          voir aussi <a href="${origine}/a-propos.html">À propos</a>.
        </p>
      </section>
`;

  return pageStatique({
    origine,
    compte,
    chemin,
    titre,
    description,
    h1: 'Installer sur Android',
    chapeau:
      'Catalogue et applications PWA sur le même site GitHub Pages : comment les installer ensemble sur Chrome Android.',
    corps,
    imagePartage,
    navCourante: chemin,
    fil: [
      { nom: 'Catalogue', url: `${origine}/` },
      { nom: 'Installer sur Android', url },
    ],
    jsonLd: {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebPage',
          '@id': `${url}#page`,
          url,
          name: titre,
          description,
          inLanguage: 'fr',
          isPartOf: { '@id': `${origine}/#site` },
          publisher: { '@id': `${origine}/#org` },
          breadcrumb: { '@id': `${url}#fil` },
          dateModified: JETONS.majIso,
        },
        entiteSite({ origine, compte }),
        entiteEditeur({ origine, compte }),
        filJsonLd(url, [
          { nom: 'Catalogue', url: `${origine}/` },
          { nom: 'Installer sur Android', url },
        ]),
      ],
    },
  });
}
