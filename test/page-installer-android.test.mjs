import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pageInstallerAndroid } from '../scripts/page-installer-android.mjs';

const ORIGINE = 'https://mister-guiiug.github.io';

test('la page Android explique la purge WebAPK et l’ordre d’installation', () => {
  const html = pageInstallerAndroid({
    origine: ORIGINE,
    compte: 'mister-guiiug',
    imagePartage: { url: `${ORIGINE}/og-image.jpg`, alt: 'mosaïque' },
  });
  assert.match(html, /installer-android\.html/);
  assert.match(html, /chrome:\/\/webapks/);
  assert.match(html, /pathPrefix|portée/i);
  assert.match(html, /Mister Settle/);
  assert.match(html, /Paramètres Android/);
  assert.match(html, /Effacer les données/);
  // Pas de sous-domaine proposé : la contrainte du parc.
  assert.doesNotMatch(html, /settle\.mister-guiiug|sous-domaine pour chaque/i);
});
