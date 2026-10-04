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

- l'**index des plans de site**, qui nomme le plan de _tous_ les sites publiés,
  infrastructure comprise ;
- la section **« Dans les coulisses »** : les sites publiés qui ne sont pas des
  applications du catalogue. Calculée, jamais écrite à la main — un nouveau site
  d'infrastructure y apparaît de lui-même ;
- la dernière version publiée d'une application de bureau, pour sa page du hub.

Chaque carte d'application porte aussi un lien « Guide » vers sa première
**page de contenu** en français (socle 6.17.0 : `content/pages/<slug>.md` →
`<slug>.html`), lue dans le plan de site de l'app, avec son titre en infobulle.
La section **« Guides pratiques »** les liste TOUTES, françaises et anglaises,
avec leur titre (`<h1>`) pour ancre, groupées par catégorie ; celle du
squelette y figure aussi. Chaque carte affiche une miniature de l'**image de
partage** de l'app (`og-image.jpg`, 1200×630), sondée à la construction puis
réduite à 640 px en JPEG et en WebP dans `previews/`, avec un `alt` qui la
décrit ; absente, la carte montre l'initiale de l'app. L'image de partage de la
racine reste versionnée ici : `static/og-image.jpg`, la mosaïque des icônes du
catalogue.

Trois **pages statiques**, sans script, s'ajoutent à l'accueil
(`scripts/pages-hub.mjs`, `scripts/page-a-propos.mjs`) :

- `a-propos.html` : qui publie ces applications, pourquoi, et ce que chacune
  fait de vos données, selon son type (relevé dans le code des apps) ;
- `mister-quota.html` : la page de l'application de bureau, qui n'a pas de site
  Pages ; sa carte y mène ;
- `404.html`, en `noindex` : GitHub Pages la sert pour toute URL inconnue sous
  la racine.

L'éditeur est une seule entité JSON-LD, `https://mister-guiiug.github.io/#org`
(`alternateName` « GuiiuG », `logo`, `sameAs` GitHub), la même sur toutes les
pages.

Le hub est lui-même **installable** (manifest + service worker + icônes
192/512) : sur Android Chrome, menu ⋮ → « Installer l'application ». Les liens
vers les apps s'ouvrent hors du shell du catalogue, pour que chaque PWA reste
installable séparément (même origine `github.io`).

**Son service worker ne touche qu'au hub** (`scripts/hub-sw.mjs`). Servi depuis
`/sw.js`, il a pour portée toute l'origine, apps comprises. Il ne supprime donc
que ses propres caches (`hub-*`), et ne répond qu'aux fichiers de premier
niveau du hub et à `/previews/`. Tout ce qui est sous `/<app>/`, et toute autre
origine, passe sans lui. Jusqu'à `hub-v4`, il vidait le précache Workbox des
apps à chaque activation.

Le `<title>` reste le titre long : le titre court « GuiiuG » ne s'affiche que
dans la fenêtre de l'app installée, et jamais pour un robot.

La page propose un bascule **FR / EN** (catégories et maturités du socle,
descriptions EN locales au hub) et un thème **clair / sombre / système**,
mémorisés dans `localStorage`.

**Les guides suivent la langue choisie** (`scripts/guides.mjs`). Chaque page de
contenu déclare sa traduction (`<link rel="alternate" hreflang>`, posé par le
socle) : une page et sa traduction ne font qu'**un** guide, montré dans la
langue choisie. Sous un guide traduit, « Read in English » ou « Lire en
français » mène à l'autre version ; un guide d'une seule langue porte une
étiquette (« FR ») quand elle diffère de celle de la page. En anglais, les
guides traduits passent en tête de leur groupe, et le lien « Guide » d'une
carte mène au premier guide anglais de l'app (« Guide (FR) » s'il n'en a pas).
Le HTML servi reste français et lie **toutes** les pages, traductions
comprises : aucune ne perd le seul lien qui la relie à l'origine.

## Publication

**Rien n'est commité.** Le workflow [`pages.yml`](.github/workflows/pages.yml)
engendre la page et ses fichiers (`index.html`, `a-propos.html`,
`mister-quota.html`, `404.html`, `robots.txt`, `sitemap.xml`,
`sitemap-hub.xml`, `seo-state.json`, manifeste, service worker, page hors
ligne, vérifications Google et Bing, clé IndexNow, miniatures, icônes) au
moment de publier et les téléverse comme artefact Pages — aucun `git push`,
donc la protection de `main` reste entière.

Il tourne **chaque nuit**, à chaque fusion, et à la demande. Sur une PR, il
construit sans publier.

**Pour les robots :**

- `robots.txt` autorise tout, à tous, et l'écrit robot par robot : moteurs de
  recherche et de réponse d'un côté, robots d'entraînement de l'autre. Il ne
  déclare qu'un plan de site, l'index.
- `/sitemap.xml` est un **index** : il nomme `/sitemap-hub.xml` (les pages du
  hub) et le plan de chaque site publié sous l'origine.
- Le `lastmod` d'une page du hub vient de l'**empreinte de son contenu**, date
  affichée exclue. `seo-state.json` garde, pour chaque URL, son empreinte et
  son `lastmod`. Il est relu en ligne avant chaque construction : même
  empreinte, même date. « Mis à jour le … » affiche cette date, celle du
  dernier vrai changement.
- **IndexNow** ne reçoit que les pages du hub dont le contenu a changé à cette
  publication (`scripts/indexnow.mjs`), après avoir attendu qu'elles répondent
  200. Chaque application signale les siennes à son propre déploiement.

**Publication partielle.** Si une application du catalogue ne répond pas, la
construction continue : la carte porte un badge « Non vérifiée », un bandeau
l’explique, et le hub reste à jour pour les autres. `HUB_STRICT=1` (ou
`--strict`) restaure l’ancien fail-safe total (rien n’est déployé). Le repli
visuel d’une carte sans `og-image` est son `icon-192.png`, puis un monogramme.

## Construire en local

```bash
node --test test/*.test.mjs   # sans réseau : worker, plans de site, robots.txt, pages
node scripts/build-site.mjs _site
```

Aucune dépendance obligatoire : Node et le réseau suffisent. Pour des miniatures
identiques à celles de la CI (640 px, JPEG et WebP), installer d'abord sharp
(`npm install --no-save sharp@0.34.4`) ; sans lui, les images sont recopiées en
taille réelle et aucun WebP n'est produit. Un `GITHUB_TOKEN` (ou `GH_TOKEN`)
dans l'environnement relève la limite de l'API, mais ses trois requêtes passent
sans. La construction relit aussi `seo-state.json` en ligne : sans réseau vers
l'origine, les pages du hub sont datées du jour, sans échec. Le dossier `_site/` est ignoré par git.
