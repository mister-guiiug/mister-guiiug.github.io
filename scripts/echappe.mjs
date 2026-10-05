/**
 * L'ÉCHAPPEMENT HTML DU HUB, ÉCRIT UNE FOIS.
 *
 * Il en existait trois copies identiques (build-site.mjs, guides.mjs,
 * pages-hub.mjs) : une correction faite dans l'une aurait manqué aux deux
 * autres. Il couvre le contenu d'un élément et la valeur d'un attribut écrit
 * entre guillemets doubles, la seule forme que le hub engendre. Les URL qu'il
 * reçoit viennent du catalogue du socle ou de plans de site déjà filtrés : il
 * ne juge pas de leur schéma.
 */
export const echappe = texte =>
  String(texte ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
