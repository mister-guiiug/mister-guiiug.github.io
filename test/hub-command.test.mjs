/**
 * Le hub délègue Ctrl+K / « / » au module command du socle (copie build-time).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const ICI = dirname(fileURLToPath(import.meta.url));
// La construction, le gabarit de l'accueil et son script client : depuis le
// découpage de build-site.mjs, ce que ce test cherche vit dans ces trois fichiers.
const BUILD = ['build-site.mjs', 'accueil.mjs', 'accueil/hub-client.js']
  .map(f => readFileSync(join(ICI, '..', 'scripts', f), 'utf8'))
  .join('\n');
const HUB_CMD = readFileSync(join(ICI, '..', 'scripts', 'hub-command.js'), 'utf8');

test('hub-command.js branche bindSearchHotkeys sur #filtre', () => {
  assert.match(HUB_CMD, /bindSearchHotkeys/);
  assert.match(HUB_CMD, /from ['"]\.\/command\.js['"]/);
  assert.match(HUB_CMD, /getElementById\(['"]filtre['"]\)/);
});

test('build-site copie command.js et retire les hotkeys dupliqués', () => {
  assert.match(BUILD, /texteCommandDuSocle/);
  assert.match(BUILD, /hub-command\.js/);
  assert.match(BUILD, /['"]\/command\.js['"]/);
  assert.match(BUILD, /type="module" src="\.\/hub-command\.js"/);
  assert.doesNotMatch(BUILD, /mod && !e\.altKey && !e\.shiftKey && \(e\.key === 'k'/);
  assert.match(BUILD, /e\.key === 'Escape' && filtre/);
});
