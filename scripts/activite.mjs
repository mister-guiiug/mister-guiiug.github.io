/**
 * L'EXTRAIT DE MISTER CONTRIB, DANS LE HAUT DE L'ACCUEIL.
 *
 * Mister Contrib publie chaque jour `donnees.json` : les contributions de
 * l'année civile, jour par jour, toutes forges confondues et anonymisées. Le
 * hub en montre les 26 dernières semaines, avec le total de l'année et le
 * nombre de dépôts, et renvoie au calendrier complet.
 *
 * RENDU À LA CONSTRUCTION, EN SVG. Ni script ni requête chez le visiteur : la
 * politique de sécurité de l'accueil ne change pas, et l'extrait s'affiche hors
 * ligne avec la page. Les couleurs sont des classes (`n0` à `n4`), lues par
 * `hub.css` : la politique refuse les attributs `style`, et les classes suivent
 * le thème clair ou sombre.
 *
 * HORS DE L'EMPREINTE DE LA PAGE. L'accueil arrive avec `JETON_ACTIVITE` à la
 * place de l'extrait ; `build-site.mjs` calcule l'empreinte, donc la date de
 * mise à jour et les signalements IndexNow, AVANT de le poser. Sans cela, un
 * relevé quotidien changerait la date de l'accueil chaque jour, sans que le
 * catalogue ait bougé.
 *
 * Les niveaux sont ceux de Mister Contrib (quartiles des jours actifs de
 * l'année, `src/features/home/calendar.ts`) : la même journée a la même teinte
 * ici et dans le calendrier complet. Les semaines commencent le dimanche,
 * comme là-bas.
 */
import { echappe } from './echappe.mjs';

/** Remplacé par l'extrait après le calcul de l'empreinte de l'accueil. */
export const JETON_ACTIVITE = '<!--@@ACTIVITE@@-->';

/** Le chemin des données, sous l'origine. */
export const CHEMIN_DONNEES = '/mister-contrib/donnees.json';

/** Les semaines montrées. */
export const NB_SEMAINES = 26;

const JOUR = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Les données lues, vérifiées, ou `null` : un fichier mal formé ne casse pas
 * la construction, l'accueil paraît sans l'extrait.
 *
 * @param {unknown} brut  le JSON de `donnees.json`
 * @returns {{ genere: string, releve: string, annee: number, contributions: number,
 *   depots: number, partiel: boolean, jours: { date: string, count: number }[] } | null}
 */
export function lireActivite(brut) {
  if (!brut || typeof brut !== 'object') return null;
  const { genere, annee, contributions, depots, jours, partiel } = /** @type {any} */ (brut);
  const entier = n => Number.isInteger(n) && n >= 0;
  if (typeof genere !== 'string' || Number.isNaN(Date.parse(genere))) return null;
  if (!Number.isInteger(annee) || !entier(contributions) || !entier(depots)) return null;
  if (!Array.isArray(jours) || !jours.length) return null;
  if (!jours.every(j => j && JOUR.test(j.date) && j.date.startsWith(`${annee}-`) && entier(j.count))) {
    return null;
  }
  const releve = new Date(genere).toISOString().slice(0, 10);
  return { genere, releve, annee, contributions, depots, partiel: partiel === true, jours };
}

/** Les seuils de Mister Contrib : quartiles des jours actifs. */
export function niveaux(jours) {
  const actifs = jours
    .map(j => j.count)
    .filter(c => c > 0)
    .sort((a, b) => a - b);
  const q = p => actifs[Math.min(actifs.length - 1, Math.floor(actifs.length * p))];
  const [t1, t2, t3] = actifs.length ? [q(0.25), q(0.5), q(0.75)] : [0, 0, 0];
  return count => (count <= 0 ? 0 : count <= t1 ? 1 : count <= t2 ? 2 : count <= t3 ? 3 : 4);
}

const jourUtc = date => new Date(`${date}T00:00:00Z`);
const iso = d => d.toISOString().slice(0, 10);

/**
 * Les `nbSemaines` semaines qui finissent avec celle du relevé, dimanche en
 * tête. Une case est `null` après le jour du relevé (l'avenir n'est pas
 * mesuré) et avant le 1er janvier (le fichier ne couvre que l'année).
 *
 * @returns {({ date: string, count: number, niveau: number } | null)[][]}
 */
export function fenetre(activite, nbSemaines = NB_SEMAINES) {
  const { jours, releve, annee } = activite;
  const parJour = new Map(jours.map(j => [j.date, j.count]));
  const niveau = niveaux(jours);
  const debut = jourUtc(releve);
  debut.setUTCDate(debut.getUTCDate() - debut.getUTCDay() - 7 * (nbSemaines - 1));
  const semaines = [];
  for (let s = 0; s < nbSemaines; s += 1) {
    const semaine = [];
    for (let d = 0; d < 7; d += 1) {
      const date = iso(debut);
      const dansLAnnee = debut.getUTCFullYear() === annee;
      if (date > releve || !dansLAnnee) semaine.push(null);
      else {
        const count = parJour.get(date) ?? 0;
        semaine.push({ date, count, niveau: niveau(count) });
      }
      debut.setUTCDate(debut.getUTCDate() + 1);
    }
    semaines.push(semaine);
  }
  return semaines;
}

const LIBELLES = {
  fr: {
    locale: 'fr-FR',
    titre: 'Activité',
    chiffres: (c, d, a) =>
      `<strong>${c}</strong> contributions en ${a}, dans <strong>${d}</strong> dépôts`,
    releve: (jour, partiel) => `${partiel ? 'Relevé partiel' : 'Relevé'} du ${jour}`,
    lien: 'Le calendrier complet',
    moins: 'Moins',
    plus: 'Plus',
    cellule: (jour, n) => `${jour} : ${n} contribution${n === '0' || n === '1' ? '' : 's'}`,
    resume: (debut, fin, total, pic) =>
      `Contributions par jour du ${debut} au ${fin} : ${total} au total` +
      (pic ? `, au plus ${pic.n} le ${pic.jour}.` : '.'),
  },
  en: {
    locale: 'en-GB',
    titre: 'Activity',
    chiffres: (c, d, a) =>
      `<strong>${c}</strong> contributions in ${a}, across <strong>${d}</strong> repositories`,
    releve: (jour, partiel) => `${partiel ? 'Partial count' : 'Counted'} on ${jour}`,
    lien: 'Full calendar',
    moins: 'Less',
    plus: 'More',
    cellule: (jour, n) => `${jour}: ${n} contribution${n === '1' ? '' : 's'}`,
    resume: (debut, fin, total, pic) =>
      `Contributions per day from ${debut} to ${fin}: ${total} in total` +
      (pic ? `, peaking at ${pic.n} on ${pic.jour}.` : '.'),
  },
};

// Géométrie, en unités du viewBox : le SVG s'étire à la largeur disponible.
const CASE = 10;
const PAS = 13;
const HAUT_MOIS = 14;
/** La légende, sous la grille, alignée à droite : « Moins » cinq cases « Plus ». */
const HAUT_LEGENDE = 16;
const CASE_LEGENDE = 8;
const PAS_LEGENDE = 10;
const PLACE_PLUS = 30;

/**
 * L'extrait, dans la langue de la page, ou `''` s'il n'y a rien à montrer
 * (données absentes, ou aucune contribution dans la fenêtre).
 *
 * @param {ReturnType<typeof lireActivite>} activite
 * @param {{ langue: 'fr'|'en', origine: string, nbSemaines?: number }} options
 */
export function activiteHtml(activite, { langue, origine, nbSemaines = NB_SEMAINES }) {
  if (!activite) return '';
  const semaines = fenetre(activite, nbSemaines);
  const cases = semaines.flat().filter(Boolean);
  const total = cases.reduce((n, c) => n + c.count, 0);
  if (!total) return '';

  const L = LIBELLES[langue];
  const nombre = n => new Intl.NumberFormat(L.locale).format(n);
  const date = (jour, avecAnnee = false) =>
    new Intl.DateTimeFormat(L.locale, {
      day: 'numeric',
      month: avecAnnee ? 'long' : 'short',
      ...(avecAnnee ? { year: 'numeric' } : {}),
      timeZone: 'UTC',
    }).format(jourUtc(jour));
  const mois = jour =>
    new Intl.DateTimeFormat(L.locale, { month: 'short', timeZone: 'UTC' }).format(jourUtc(jour));

  // Le nom du mois au-dessus de la semaine qui contient son 1er jour.
  const etiquettes = [];
  semaines.forEach((semaine, col) => {
    const premier = semaine.find(c => c && c.date.endsWith('-01'));
    if (premier && col < nbSemaines - 1) etiquettes.push({ col, texte: mois(premier.date) });
  });

  const rects = semaines
    .flatMap((semaine, col) =>
      semaine.map((c, ligne) =>
        c
          ? `<rect class="n${c.niveau}" x="${col * PAS}" y="${HAUT_MOIS + ligne * PAS}" width="${CASE}" height="${CASE}" rx="2"><title>${echappe(L.cellule(date(c.date), nombre(c.count)))}</title></rect>`
          : ''
      )
    )
    .join('');
  const textes = etiquettes
    .map(e => `<text x="${e.col * PAS}" y="10">${echappe(e.texte)}</text>`)
    .join('');

  const pic = cases.reduce((m, c) => (c.count > (m?.count ?? 0) ? c : m), null);
  const resume = L.resume(
    date(cases[0].date, true),
    date(cases.at(-1).date, true),
    nombre(total),
    pic ? { n: nombre(pic.count), jour: date(pic.date, true) } : null
  );
  const largeur = nbSemaines * PAS - (PAS - CASE);
  const basGrille = HAUT_MOIS + 7 * PAS - (PAS - CASE);
  const hauteur = basGrille + HAUT_LEGENDE;
  const yLegende = basGrille + HAUT_LEGENDE - CASE_LEGENDE;
  const xLegende = largeur - PLACE_PLUS - (5 * PAS_LEGENDE - (PAS_LEGENDE - CASE_LEGENDE));
  const legende =
    `<text class="legende" x="${xLegende - 4}" y="${yLegende + 7.5}" text-anchor="end">${L.moins}</text>` +
    [0, 1, 2, 3, 4]
      .map(
        n =>
          `<rect class="n${n}" x="${xLegende + n * PAS_LEGENDE}" y="${yLegende}" width="${CASE_LEGENDE}" height="${CASE_LEGENDE}" rx="1.5"/>`
      )
      .join('') +
    `<text class="legende" x="${largeur}" y="${yLegende + 7.5}" text-anchor="end">${L.plus}</text>`;

  return `<div class="activite">
          <p class="activite-titre">${L.titre}</p>
          <p class="activite-chiffres">${L.chiffres(nombre(activite.contributions), nombre(activite.depots), activite.annee)}</p>
          <svg class="activite-grille" viewBox="0 0 ${largeur} ${hauteur}" role="img" aria-label="${echappe(resume)}">${textes}${rects}${legende}</svg>
          <p class="activite-source">${L.releve(date(activite.releve, true), activite.partiel)} · <a href="${origine}/mister-contrib/">${L.lien}</a></p>
        </div>`;
}
