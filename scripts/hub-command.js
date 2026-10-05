/**
 * Raccourcis Ctrl/Meta+K et « / » → focus `#filtre`.
 * Échap → clearFilters reste dans le script inline (efface aussi maturité/plateforme).
 */
import { bindSearchHotkeys } from './command.js';

const filtre = document.getElementById('filtre');
if (filtre) bindSearchHotkeys(filtre);
