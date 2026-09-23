/**
 * La clé IndexNow de l'origine `mister-guiiug.github.io`.
 *
 * IndexNow est le protocole par lequel Bing — et avec lui DuckDuckGo, Ecosia,
 * Qwant, Yandex, Seznam, Naver — apprend qu'une page est neuve ou a changé,
 * sans attendre son robot. Aucun compte : on PROUVE qu'on tient l'hôte en
 * servant, à sa racine, un fichier `<clé>.txt` qui contient la clé.
 *
 * Elle n'a rien de secret : le fichier est public par construction, et la clé
 * ne donne d'autre pouvoir que signaler des URL de CET hôte. Une clé servie à la
 * racine couvre toutes les URL de l'origine, donc les vingt sites du parc.
 *
 * La changer : il suffit d'en tirer une autre (32 caractères hexadécimaux) ;
 * l'ancien fichier disparaît à la publication suivante.
 */
export const INDEXNOW_CLE = '130a4eff7f375c02c7340dcc38504187';
