/**
 * LA PAGE EST TRADUITE À LA CONSTRUCTION, PLUS DANS LE NAVIGATEUR.
 *
 * Jusqu'au 06/10/2026, l'accueil servait un HTML français et le script le
 * réécrivait en anglais au clic : `/en/` répondait 404, et un robot ou un
 * aperçu de lien ne voyait jamais la version anglaise. Les gabarits gardent la
 * même forme — un texte français marqué par la clé du dictionnaire qui le
 * traduit — et ce module fait, une fois par page et par langue, ce que faisait
 * `applyLang` dans hub-client.js :
 *
 *   - `data-i18n="clé"`              le texte de l'élément ← `t[clé]`
 *   - `data-i18n-cat="cat"`          le texte ← `t.categories[cat]`
 *   - `data-i18n-maturity="m"`       le texte ← `t.maturity[m]`
 *   - `data-fr="…" data-en="…"`      le texte ← celui de la langue
 *   - `data-i18n-aria="clé"`         `aria-label` (et `title` s'il existe) ← `t[clé]`
 *   - `data-i18n-placeholder="clé"`  `placeholder` ← `t[clé]`
 *   - `data-fr-href`, `-hreflang`, `-lang`, `-title` (et `data-en-…`) : l'attribut
 *   - `data-alt-fr`, `data-alt-en`   l'`alt` d'une image
 *
 * Puis les marqueurs sont retirés : la page servie ne porte que sa langue.
 *
 * UN ÉLÉMENT MARQUÉ NE CONTIENT QUE DU TEXTE — le script remplaçait son
 * `textContent`, qui aurait effacé tout enfant. Un marqueur que la traduction
 * n'a pas pu traiter fait échouer la construction plutôt que de laisser du
 * français sur la page anglaise. Les blocs `<script>` et `<style>` ne sont
 * jamais touchés.
 */
import { echappe } from './echappe.mjs';

/** Les marqueurs dont la cible est le TEXTE de l'élément. */
const MARQUEURS_TEXTE = /\sdata-(?:i18n|i18n-cat|i18n-maturity|fr|en)="/g;

/** Les attributs de traduction, retirés une fois la page traduite. */
const ATTRIBUTS = /\s+data-(?:i18n(?:-[a-z]+)?|(?:fr|en)(?:-[a-z]+)?|alt-(?:fr|en))="[^"]*"/g;

/** Applique `fn` au HTML hors des blocs `<script>` et `<style>`. */
const horsBlocs = (html, fn) =>
  html
    .split(/(<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>)/)
    .map((morceau, i) => (i % 2 ? morceau : fn(morceau)))
    .join('');

/** La valeur d'un attribut dans une liste d'attributs, ou `undefined`. */
const lis = (attrs, nom) => new RegExp(`\\s${nom}="([^"]*)"`).exec(attrs)?.[1];

/** Pose `nom="valeur"` dans une balise ouvrante : remplace, ou ajoute avant la fin. */
function pose(balise, nom, valeur) {
  const motif = new RegExp(`(\\s${nom}=")[^"]*(")`);
  if (motif.test(balise)) return balise.replace(motif, (_, a, b) => `${a}${valeur}${b}`);
  return balise.replace(/\s*(\/?)>$/, (_, fin) => ` ${nom}="${valeur}"${fin ? ' /' : ''}>`);
}

/**
 * Traduit une page rendue dans la langue `langue`, avec le dictionnaire `t`.
 *
 * @param {string} html
 * @param {Record<string, any>} t  les libellés de la langue (voir `libellesClient`)
 * @param {'fr'|'en'} langue
 * @returns {string} la page, sans aucun marqueur de traduction
 */
export function traduire(html, t, langue) {
  return horsBlocs(html, morceau => {
    const attendus = (morceau.match(MARQUEURS_TEXTE) ?? []).length;
    let traites = 0;

    // 1. Le texte des éléments marqués.
    let sortie = morceau.replace(/<([a-z][a-z0-9]*)(\s[^>]*?)>([^<]*)<\/\1>/g, (tout, nom, attrs, texte) => {
      const cle = lis(attrs, 'data-i18n');
      const cat = lis(attrs, 'data-i18n-cat');
      const mat = lis(attrs, 'data-i18n-maturity');
      const deLaLangue = lis(attrs, `data-${langue}`);
      const marques = (attrs.match(MARQUEURS_TEXTE) ?? []).length;
      if (!marques) return tout;
      traites += marques;
      let nouveau = texte;
      if (cle !== undefined && t[cle] != null) nouveau = echappe(t[cle]);
      else if (cat !== undefined && t.categories?.[cat]) nouveau = echappe(t.categories[cat]);
      else if (mat !== undefined && t.maturity?.[mat]) nouveau = echappe(t.maturity[mat]);
      // Déjà échappé : c'était la valeur d'un attribut.
      else if (deLaLangue !== undefined) nouveau = deLaLangue;
      return `<${nom}${attrs}>${nouveau}</${nom}>`;
    });
    if (traites !== attendus) {
      const reste = sortie.split('\n').find(l => /\sdata-(?:i18n|fr|en)="/.test(l) && !/<\/[a-z]+>/.test(l));
      throw new Error(`traduire (${langue}) : ${attendus - traites} élément(s) marqué(s) non traduit(s), qui contiennent autre chose que du texte : ${reste?.trim() ?? '?'}`);
    }

    // 2. Les attributs : aria-label, placeholder, ceux d'un lien apparié, alt.
    sortie = sortie.replace(/<[a-z][a-z0-9]*\s[^>]*>/g, balise => {
      let b = balise;
      const aria = lis(b, 'data-i18n-aria');
      if (aria !== undefined && t[aria] != null) {
        b = pose(b, 'aria-label', echappe(t[aria]));
        if (/\stitle="/.test(b)) b = pose(b, 'title', echappe(t[aria]));
      }
      const ph = lis(b, 'data-i18n-placeholder');
      if (ph !== undefined && t[ph] != null) b = pose(b, 'placeholder', echappe(t[ph]));
      for (const attr of ['href', 'hreflang', 'lang', 'title']) {
        const v = lis(b, `data-${langue}-${attr}`);
        if (v !== undefined) b = pose(b, attr, v);
      }
      const alt = lis(b, `data-alt-${langue}`);
      if (alt !== undefined) b = pose(b, 'alt', alt);
      return b;
    });

    // 3. Les marqueurs, retirés.
    return sortie.replace(ATTRIBUTS, '');
  });
}
