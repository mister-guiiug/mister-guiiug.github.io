/**
 * Signale à IndexNow les pages du parc qui viennent de changer.
 *
 * Joué APRÈS la publication (`pages.yml`, job « Publier ») : la clé doit être
 * en ligne pour que le moteur la vérifie.
 *
 * QUOI SIGNALER. IndexNow demande les URL ajoutées ou modifiées, pas la liste
 * entière chaque nuit — un envoi répété de pages inchangées est ignoré, voire
 * déclassé. On lit donc les plans de site que déclare le `robots.txt` de la
 * racine, et on ne retient que les URL dont le `lastmod` date d'hier ou
 * d'aujourd'hui (UTC). Depuis le socle 6.10.0, chaque app date son plan de
 * site au jour de son build : un déploiement d'app devient ainsi un
 * signalement, sans rien changer à son dépôt.
 *
 * `--tout` signale toutes les URL (premier envoi, ou reprise après panne) ;
 * `--a-blanc` affiche sans envoyer.
 *
 * ÉCHOUER NE CASSE RIEN : le site est déjà publié. Le code de sortie dit
 * seulement si le moteur a accepté.
 */
import { INDEXNOW_CLE } from './indexnow-cle.mjs';

const HOTE = 'mister-guiiug.github.io';
const ORIGINE = `https://${HOTE}`;
const CLE_URL = `${ORIGINE}/${INDEXNOW_CLE}.txt`;
const tout = process.argv.includes('--tout');
const aBlanc = process.argv.includes('--a-blanc');

const jour = d => d.toISOString().slice(0, 10);
const hier = jour(new Date(Date.now() - 24 * 3600 * 1000));

async function texte(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.text();
}

// 1. La clé est-elle en ligne ? Sans elle, le moteur refuserait tout.
const servie = (await texte(CLE_URL).catch(() => '')).trim();
if (servie !== INDEXNOW_CLE) {
  console.error(`La clé n'est pas servie à ${CLE_URL} : rien n'est signalé.`);
  process.exitCode = 1;
} else {
  // 2. Les URL, depuis les plans de site déclarés à la racine.
  const robots = await texte(`${ORIGINE}/robots.txt`);
  const plans = [...robots.matchAll(/^Sitemap:\s*(\S+)$/gm)].map(m => m[1]);
  const urls = [];
  for (const plan of plans) {
    const xml = await texte(plan).catch(() => '');
    for (const [, bloc] of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
      const loc = /<loc>([^<]+)<\/loc>/.exec(bloc)?.[1]?.trim();
      const lastmod = /<lastmod>([^<]+)<\/lastmod>/.exec(bloc)?.[1]?.trim();
      if (!loc?.startsWith(`${ORIGINE}/`)) continue;
      if (tout || (lastmod && lastmod.slice(0, 10) >= hier)) urls.push(loc);
    }
  }
  const liste = [...new Set(urls)];
  console.log(
    `${plans.length} plans de site lus ; ${liste.length} URL ${tout ? '(toutes)' : `modifiées depuis le ${hier}`}.`
  );
  for (const u of liste) console.log(`  ${u}`);

  if (!liste.length) {
    console.log('Rien de neuf à signaler.');
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
