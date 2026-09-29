/**
 * Signale à IndexNow les pages DU HUB qui viennent de changer.
 *
 * Joué APRÈS la publication (`pages.yml`, job « Publier ») : la clé doit être
 * en ligne pour que le moteur la vérifie.
 *
 * QUOI SIGNALER. IndexNow demande les URL ajoutées ou modifiées, pas la liste
 * entière à chaque publication : un envoi répété de pages inchangées est
 * ignoré, voire déclassé. Jusqu'au 29/09/2026, ce script relisait les plans de
 * site de TOUT le parc et retenait chaque URL datée d'hier ou d'aujourd'hui. Or
 * le socle datait chaque URL du jour de son build, les apps sont redéployées
 * presque chaque jour, et la racine datait `/` chaque nuit : les 41 URL du parc
 * partaient à chaque publication, quinze fois le 27/09. Désormais :
 *   - le hub ne signale que SES pages, et parmi elles celles dont le contenu a
 *     changé à cette construction : `build-site.mjs` compare leur empreinte à
 *     celle de la publication précédente (`seo-state.json`) et passe la liste
 *     au job « Publier » par la sortie `urls-modifiees`, reçue ici dans la
 *     variable URLS_MODIFIEES (un tableau JSON) ;
 *   - chaque app signale les siennes à son propre déploiement (socle 6.19.0).
 *
 * NE JAMAIS SIGNALER UNE URL QUI RÉPOND 4xx. Bing (et les autres) suivent
 * IndexNow immédiatement : si Pages / Fastly sert encore un 404 en cache —
 * déploiement pas encore propagé, fichier neuf —, le moteur enregistre un
 * « Page Fetch Failed » et laisse l'URL en « Discovered but not crawled ».
 * On attend donc que la clé et chaque URL répondent 200 avant d'envoyer.
 *
 * `--tout` signale toutes les URL du plan de site du hub (premier envoi, ou
 * reprise après panne) ; `--a-blanc` affiche sans envoyer.
 *
 * ÉCHOUER NE CASSE RIEN : le site est déjà publié. Le code de sortie dit
 * seulement si le moteur a accepté ; « rien à signaler » n'est pas un échec.
 */
import { INDEXNOW_CLE } from './indexnow-cle.mjs';
import { urlsDuPlan } from './seo-hub.mjs';

const HOTE = 'mister-guiiug.github.io';
const ORIGINE = `https://${HOTE}`;
const CLE_URL = `${ORIGINE}/${INDEXNOW_CLE}.txt`;
const PLAN_DU_HUB = `${ORIGINE}/sitemap-hub.xml`;
const tout = process.argv.includes('--tout');
const aBlanc = process.argv.includes('--a-blanc');

async function texte(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.text();
}

/** Code HTTP, retenté : une sonde isolée juste après un déploiement ne prouve rien. */
async function statut(url, essais = 6) {
  for (let i = 1; i <= essais; i += 1) {
    try {
      const r = await fetch(url, { redirect: 'follow' });
      if (r.status === 200 || i === essais) return r.status;
    } catch {
      if (i === essais) return 0;
    }
    await new Promise(ok => setTimeout(ok, 2000 * i));
  }
  return 0;
}

/**
 * Attend qu'une URL réponde 200. Pages invalide le CDN au déploiement, mais
 * la propagation peut prendre plusieurs minutes ; un 404 y reste en cache un
 * moment. Sans cette attente, IndexNow inviterait Bing à enregistrer le 404.
 */
async function attendre200(url, { essais = 24, pauseMs = 10_000 } = {}) {
  for (let i = 1; i <= essais; i += 1) {
    const code = await statut(url, 2);
    console.log(`  attente ${url} — essai ${i}/${essais} → ${code}`);
    if (code === 200) return true;
    if (i < essais) await new Promise(ok => setTimeout(ok, pauseMs));
  }
  return false;
}

/** Une page du HUB : sur l'origine, et au premier niveau (`/`, `/a-propos.html`). */
const estDuHub = u => {
  try {
    const { origin, pathname } = new URL(u);
    return origin === ORIGINE && /^\/[^/]*$/.test(pathname);
  } catch {
    return false;
  }
};

/** Les URL à signaler : toutes celles du plan du hub, ou celles que la construction a vues changer. */
async function candidates() {
  if (tout) {
    if (!(await attendre200(PLAN_DU_HUB, { essais: 12 }))) {
      throw new Error(`${PLAN_DU_HUB} ne répond pas 200.`);
    }
    return urlsDuPlan(await texte(PLAN_DU_HUB)).map(u => u.loc);
  }
  let liste = [];
  try {
    liste = JSON.parse(process.env.URLS_MODIFIEES || '[]');
  } catch {
    console.error(`URLS_MODIFIEES illisible : ${process.env.URLS_MODIFIEES}`);
  }
  return Array.isArray(liste) ? liste.filter(u => typeof u === 'string') : [];
}

const urls = [...new Set(await candidates())];
const horsHub = urls.filter(u => !estDuHub(u));
for (const u of horsHub) console.log(`  ✗ hors du hub, omise : ${u}`);
const aSignaler = urls.filter(estDuHub);
console.log(
  `${aSignaler.length} URL du hub ${tout ? '(toutes, --tout)' : 'modifiées à cette construction'}.`
);

if (!aSignaler.length) {
  // Le cas ordinaire d'une nuit sans changement : pas un échec.
  console.log('Rien à signaler : aucune page du hub n’a changé.');
} else {
  // 1. La clé est-elle en ligne ? Sans elle, le moteur refuserait tout.
  //    On attend : elle vient d'être déployée avec le reste du site.
  console.log('Vérification de la clé IndexNow…');
  if (!(await attendre200(CLE_URL))) {
    console.error(`La clé n'est pas servie à ${CLE_URL} : rien n'est signalé.`);
    process.exitCode = 1;
  } else if ((await texte(CLE_URL)).trim() !== INDEXNOW_CLE) {
    console.error(`La clé servie à ${CLE_URL} ne correspond pas : rien n'est signalé.`);
    process.exitCode = 1;
  } else {
    // 2. Ne garder que celles qui répondent 200 — sinon Bing enregistre un 4xx.
    //    Une page neuve peut rester quelques minutes en 404 dans le cache du CDN.
    const liste = [];
    for (const u of aSignaler) {
      if (await attendre200(u, { essais: 12 })) {
        liste.push(u);
        console.log(`  ✓ ${u}`);
      } else {
        console.log(`  ✗ omise (pas de 200) ${u}`);
      }
    }
    console.log(`${liste.length}/${aSignaler.length} URL joignables en 200.`);

    if (!liste.length) {
      console.log('Rien de joignable à signaler.');
      process.exitCode = 1;
    } else if (aBlanc) {
      console.log('(à blanc : rien envoyé)');
    } else {
      // 3. Un seul envoi groupé (jusqu'à 10 000 URL).
      const r = await fetch('https://api.indexnow.org/indexnow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          host: HOTE,
          key: INDEXNOW_CLE,
          keyLocation: CLE_URL,
          urlList: liste,
        }),
      });
      // 200 : reçu ; 202 : reçu, clé en cours de vérification (premier envoi).
      console.log(`IndexNow : HTTP ${r.status} ${await r.text()}`);
      if (r.status !== 200 && r.status !== 202) process.exitCode = 1;
    }
  }
}
