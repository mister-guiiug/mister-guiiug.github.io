/**
 * L'extrait de Mister Contrib (scripts/activite.mjs), sans réseau.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rendreAccueil } from '../scripts/accueil.mjs';
import {
  JETON_ACTIVITE,
  activiteHtml,
  fenetre,
  lireActivite,
  niveaux,
} from '../scripts/activite.mjs';
import { donneesFactices } from './catalogue-factice.mjs';

const ORIGINE = 'https://exemple.github.io';

/** Une année entière, comme `donnees.json` : l'avenir à zéro. */
function donnees({ annee = 2026, genere = '2026-11-17T16:21:12.313Z', compte = () => 3, ...autres } = {}) {
  const jours = [];
  for (let d = new Date(Date.UTC(annee, 0, 1)); d.getUTCFullYear() === annee; d.setUTCDate(d.getUTCDate() + 1)) {
    const date = d.toISOString().slice(0, 10);
    jours.push({ date, count: date <= genere.slice(0, 10) ? compte(date) : 0 });
  }
  const contributions = jours.reduce((n, j) => n + j.count, 0);
  return { genere, annee, contributions, depots: 127, jours, ...autres };
}

test('activité : un fichier mal formé est écarté, pas la construction', () => {
  assert.equal(lireActivite(null), null);
  assert.equal(lireActivite('texte'), null);
  assert.equal(lireActivite({ ...donnees(), genere: 'hier' }), null);
  assert.equal(lireActivite({ ...donnees(), depots: -1 }), null);
  assert.equal(lireActivite({ ...donnees(), jours: [] }), null);
  assert.equal(lireActivite({ ...donnees(), jours: [{ date: '2025-12-31', count: 1 }] }), null);
  assert.equal(lireActivite({ ...donnees(), jours: [{ date: '2026-01-01', count: '1' }] }), null);
  const lue = lireActivite(donnees({ partiel: true }));
  assert.equal(lue.releve, '2026-11-17');
  assert.equal(lue.partiel, true);
});

test('activité : les niveaux sont les quartiles des jours actifs, comme Mister Contrib', () => {
  const niveau = niveaux([0, 1, 2, 3, 4, 5, 6, 7, 8].map((count, i) => ({ date: `j${i}`, count })));
  // Actifs : 1…8 ; quartiles à 3, 5 et 7.
  assert.deepEqual([0, 1, 3, 4, 5, 6, 7, 8].map(niveau), [0, 1, 1, 2, 2, 3, 3, 4]);
  assert.equal(niveaux([{ date: 'j', count: 0 }])(0), 0);
});

test('activité : 26 semaines, dimanche en tête, rien après le relevé', () => {
  const semaines = fenetre(lireActivite(donnees()));
  assert.equal(semaines.length, 26);
  assert.ok(semaines.every(s => s.length === 7));
  // Le 17/11/2026 est un mardi : la dernière semaine s'ouvre le dimanche 15.
  const derniere = semaines.at(-1);
  assert.equal(derniere[0].date, '2026-11-15');
  assert.equal(derniere[2].date, '2026-11-17');
  assert.deepEqual(derniere.slice(3), [null, null, null, null]);
  assert.equal(semaines[0][0].date, '2026-05-24');
  assert.equal(new Date(`${semaines[0][0].date}T00:00:00Z`).getUTCDay(), 0);
});

test('activité : en janvier, les jours de l’année précédente restent vides', () => {
  const semaines = fenetre(lireActivite(donnees({ genere: '2026-01-07T10:00:00Z' })));
  const cases = semaines.flat().filter(Boolean);
  assert.equal(cases[0].date, '2026-01-01');
  assert.equal(cases.at(-1).date, '2026-01-07');
  assert.equal(cases.length, 7);
});

test('activité : l’extrait dit le total, les dépôts et le relevé, dans la langue de la page', () => {
  const lue = lireActivite(donnees({ compte: date => (date === '2026-09-12' ? 1047 : 3) }));
  const fr = activiteHtml(lue, { langue: 'fr', origine: ORIGINE });
  const en = activiteHtml(lue, { langue: 'en', origine: ORIGINE });
  const total = lue.contributions;
  assert.ok(fr.includes(`<strong>${new Intl.NumberFormat('fr-FR').format(total)}</strong> contributions en 2026`));
  assert.match(fr, /dans <strong>127<\/strong> dépôts/);
  assert.match(fr, /Relevé du 17 novembre 2026/);
  assert.match(fr, /au plus 1 047 le 12 septembre 2026/);
  assert.ok(en.includes(`<strong>${new Intl.NumberFormat('en-GB').format(total)}</strong> contributions in 2026`));
  assert.match(en, /across <strong>127<\/strong> repositories/);
  assert.match(en, /Counted on 17 November 2026/);
  for (const html of [fr, en]) {
    assert.ok(html.includes(`<a href="${ORIGINE}/mister-contrib/">`), 'lien vers le calendrier complet');
    assert.match(html, /<svg class="activite-grille" viewBox="0 0 335 118" role="img" aria-label="[^"]+">/);
    // La politique de l'accueil refuse les attributs style : des classes seulement.
    assert.doesNotMatch(html, /\sstyle=/);
    // 26 semaines moins les quatre jours après le relevé, et les cinq cases de la légende.
    assert.equal((html.match(/<rect /g) ?? []).length, 26 * 7 - 4 + 5);
  }
  assert.match(activiteHtml(lireActivite(donnees({ partiel: true })), { langue: 'fr', origine: ORIGINE }), /Relevé partiel du/);
});

test('activité : rien à montrer, rien d’affiché', () => {
  assert.equal(activiteHtml(null, { langue: 'fr', origine: ORIGINE }), '');
  assert.equal(activiteHtml(lireActivite(donnees({ compte: () => 0 })), { langue: 'fr', origine: ORIGINE }), '');
});

test('activité : l’accueil réserve la place de l’extrait, l’index des guides non', () => {
  const { pages } = rendreAccueil(donneesFactices());
  for (const p of pages) {
    const n = p.texte.split(JETON_ACTIVITE).length - 1;
    assert.equal(n, p.page === 'accueil' ? 1 : 0, p.chemin);
  }
});
