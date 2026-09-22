# mister-guiiug.github.io

La page d'accueil du parc, servie à la **racine** de
[`https://mister-guiiug.github.io/`](https://mister-guiiug.github.io/).

## Pourquoi ce dépôt existe

GitHub Pages n'offre que deux formes pour un compte :

| dépôt | servi à |
| --- | --- |
| `mister-guiiug.github.io` (celui-ci) | `https://mister-guiiug.github.io/` |
| tout autre dépôt avec Pages | `https://mister-guiiug.github.io/<dépôt>/` |

Les vingt-deux sites du parc sont dans la seconde forme. Personne n'occupait la
première, et trois choses en dépendaient :

1. **`robots.txt`.** Un robots.txt n'est lu **qu'à la racine** d'une origine.
   Celui d'un sous-chemin — `/miss-dice/robots.txt` — est ignoré, et le plan de
   site qu'il déclare avec lui. Les vingt et un plans de site du parc n'étaient
   donc annoncés à personne.
2. **La validation Search Console.** Une propriété *préfixe d'URL* couvre tout
   ce qui est sous elle : validée à la racine, elle couvre les vingt-deux sites
   d'un coup, au lieu d'une propriété par application.
3. **Des liens entrants suivables.** Le champ « Website » d'un dépôt GitHub
   porte `rel="nofollow"` : il ne transmet rien. Cette page est le premier
   endroit d'où un robot peut réellement atteindre les applications.

Accessoirement, c'est la seule page du parc dont le **corps est servi tel
quel** : les applications sont rendues par React, et un robot qui n'exécute pas
le JavaScript n'y voit qu'un `<div>` vide.

## Régénérer

```bash
node scripts/build-site.mjs
```

Le script lit l'état **réel** du compte — dépôts publics qui servent des Pages,
description telle qu'elle est écrite sur GitHub, titre annoncé par chaque site —
puis **sonde** chaque site et chaque plan de site avant de l'inscrire. Rien n'y
est recopié à la main : une liste d'accueil périmée est pire qu'absente, elle
promet des pages qui n'existent plus.

Demande `gh` authentifié et un accès réseau. Réécrit `index.html`, `robots.txt`
et `sitemap.xml` ; à lancer quand une application naît, disparaît ou change de
description.

## Déploiement

Pages sert la branche `main` à la racine du dépôt. Aucune construction : ce sont
des fichiers statiques. `.nojekyll` évite que Jekyll ne s'en mêle.
