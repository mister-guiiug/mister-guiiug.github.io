# mister-guiiug.github.io

La page d'accueil du parc, servie à la **racine** de
[`https://mister-guiiug.github.io/`](https://mister-guiiug.github.io/).

## Pourquoi ce dépôt existe

GitHub Pages n'offre que deux formes pour un compte :

| dépôt | servi à |
| --- | --- |
| `mister-guiiug.github.io` (celui-ci) | `https://mister-guiiug.github.io/` |
| tout autre dépôt avec Pages | `https://mister-guiiug.github.io/<dépôt>/` |

Les sites du parc sont tous dans la seconde forme. Personne n'occupait la
première, et trois choses en dépendaient :

1. **`robots.txt`.** Un robots.txt n'est lu **qu'à la racine** d'une origine.
   Celui d'un sous-chemin — `/miss-dice/robots.txt` — est ignoré, et le plan de
   site qu'il déclare avec lui. Aucun plan de site du parc n'était donc annoncé.
2. **La validation Search Console et Bing Webmaster Tools.** Une propriété
   *préfixe d'URL* couvre tout ce qui est sous elle : validée à la racine, elle
   couvre tous les sites d'un coup, au lieu d'une propriété par application.
3. **Des liens entrants suivables.** Le champ « Website » d'un dépôt GitHub
   porte `rel="nofollow"` : il ne transmet rien. Cette page est le premier
   endroit d'où un robot peut réellement atteindre les applications.

C'est aussi la seule page du parc dont le **corps est servi tel quel** : les
applications sont rendues par React, et un robot qui n'exécute pas le
JavaScript n'y voit qu'un `<div>` vide.

## D'où vient le contenu

**La liste des applications vient du catalogue du socle**, `FAMILY_APPS`
(`@mister-guiiug/dev-pwa-config/apps-catalog`) — celle que chaque application
affiche déjà dans sa grille « Nos autres applications ». Mêmes noms, mêmes
descriptions, mêmes catégories, même maturité : une seule vérité. Elle est lue
**à la dernière version publiée** du socle, avec les libellés français de ses
catégories.

L'API GitHub ne sert plus qu'à ce que le catalogue ignore :

- le **`robots.txt`**, qui déclare le plan de site de *tous* les sites publiés,
  infrastructure comprise ;
- la section **« Dans les coulisses »** : les sites publiés qui ne sont pas des
  applications du catalogue. Calculée, jamais écrite à la main — un nouveau site
  d'infrastructure y apparaît de lui-même.

## Publication

**Rien n'est commité.** Le workflow [`pages.yml`](.github/workflows/pages.yml)
engendre les trois fichiers au moment de publier et les téléverse comme
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

Aucune dépendance : Node et le réseau suffisent. Un `GITHUB_TOKEN` (ou
`GH_TOKEN`) dans l'environnement relève la limite de l'API, mais les deux
requêtes passent sans. Le dossier `_site/` est ignoré par git.
