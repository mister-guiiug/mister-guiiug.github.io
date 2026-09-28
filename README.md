# mister-guiiug.github.io

La page d'accueil du parc, servie à la **racine** de
[`https://mister-guiiug.github.io/`](https://mister-guiiug.github.io/).

## Pourquoi ce dépôt existe

GitHub Pages n'offre que deux formes pour un compte :

| dépôt                                | servi à                                    |
| ------------------------------------ | ------------------------------------------ |
| `mister-guiiug.github.io` (celui-ci) | `https://mister-guiiug.github.io/`         |
| tout autre dépôt avec Pages          | `https://mister-guiiug.github.io/<dépôt>/` |

Les sites du parc sont tous dans la seconde forme. Personne n'occupait la
première, et trois choses en dépendaient :

1. **`robots.txt`.** Un robots.txt n'est lu **qu'à la racine** d'une origine.
   Celui d'un sous-chemin — `/miss-dice/robots.txt` — est ignoré, et le plan de
   site qu'il déclare avec lui. Aucun plan de site du parc n'était donc annoncé.
2. **La validation Search Console et Bing Webmaster Tools.** Une propriété
   _préfixe d'URL_ couvre tout ce qui est sous elle : validée à la racine, elle
   couvre tous les sites d'un coup, au lieu d'une propriété par application.
3. **Des liens entrants suivables.** Le champ « Website » d'un dépôt GitHub
   porte `rel="nofollow"` : il ne transmet rien. Cette page est le premier
   endroit d'où un robot peut réellement atteindre les applications.

Hormis les pages de contenu des applications (socle 6.17.0), c'est aussi la
seule page du parc dont le **corps est servi tel quel** : les applications sont
rendues par React, et un robot qui n'exécute pas le JavaScript n'y lit que leur
titre et leur description, servis par le socle depuis sa version 6.11.0.

## D'où vient le contenu

**La liste des applications vient du catalogue du socle**, `FAMILY_APPS`
(`@mister-guiiug/dev-pwa-config/apps-catalog`) — celle que chaque application
affiche déjà dans sa grille « Nos autres applications ». Mêmes noms, mêmes
descriptions, mêmes catégories, même maturité : une seule vérité. Elle est lue
**à la dernière version publiée** du socle, avec les libellés français de ses
catégories.

L'API GitHub ne sert plus qu'à trouver la dernière version publiée du socle, et
à ce que le catalogue ignore :

- le **`robots.txt`**, qui déclare le plan de site de _tous_ les sites publiés,
  infrastructure comprise ;
- la section **« Dans les coulisses »** : les sites publiés qui ne sont pas des
  applications du catalogue. Calculée, jamais écrite à la main — un nouveau site
  d'infrastructure y apparaît de lui-même.

Chaque carte d'application porte aussi un lien « Guide » vers sa première
**page de contenu** (socle 6.17.0 : `content/pages/<slug>.md` → `<slug>.html`),
lue dans le plan de site de l'app, avec son titre en infobulle. C'est le lien
qui la relie à la seule page du parc déjà indexée. Elle affiche aussi une
miniature de l'**image de partage** de l'app (`og-image.jpg`, 1200×630), sondée
à la construction puis réduite à 640 px en JPEG et en WebP dans `previews/` :
absente, la carte montre l'initiale de l'app. L'image de partage de la racine
reste versionnée ici : `static/og-image.jpg`, la mosaïque des icônes du
catalogue.

Le hub est lui-même **installable** (manifest + service worker + icônes
192/512) : sur Android Chrome, menu ⋮ → « Installer l'application ». Les liens
vers les apps s'ouvrent hors du shell du catalogue, pour que chaque PWA reste
installable séparément (même origine `github.io`).

La page propose un bascule **FR / EN** (catégories et maturités du socle,
descriptions EN locales au hub) et un thème **clair / sombre / système**,
mémorisés dans `localStorage`.

## Publication

**Rien n'est commité.** Le workflow [`pages.yml`](.github/workflows/pages.yml)
engendre la page et ses fichiers (`index.html`, `robots.txt`, `sitemap.xml`,
manifeste, service worker, page hors ligne, vérifications Google et Bing, clé
IndexNow, miniatures, icônes) au moment de publier et les téléverse comme
artefact Pages — aucun `git push`, donc la protection de `main` reste entière.

Il tourne **chaque nuit**, à chaque fusion, et à la demande. Sur une PR, il
construit sans publier.

**Échouer est sûr.** Si une application du catalogue ne répond pas, la
construction échoue et rien n'est déployé : Pages continue de servir la version
précédente. On ne publie jamais une page qui promettrait un 404.

## Construire en local

```bash
node scripts/build-site.mjs _site
```

Aucune dépendance obligatoire : Node et le réseau suffisent. Pour des miniatures
identiques à celles de la CI (640 px, JPEG et WebP), installer d'abord sharp
(`npm install --no-save sharp@0.34.4`) ; sans lui, les images sont recopiées en
taille réelle et aucun WebP n'est produit. Un `GITHUB_TOKEN` (ou `GH_TOKEN`)
dans l'environnement relève la limite de l'API, mais les deux requêtes passent
sans. Le dossier `_site/` est ignoré par git.
