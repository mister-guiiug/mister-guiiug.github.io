/**
 * La garde contre les signatures d'assistant : ce qu'elle refuse, ce qu'elle
 * laisse passer, et ce dépôt lui-même, relu fichier par fichier.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { estExempt, findAttribution } from '../scripts/check-ai-attribution.mjs';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const ids = texte => findAttribution(texte).map(t => t.id);

test('refuse un Co-Authored-By qui crédite un assistant, en trailer comme en commentaire', () => {
  for (const ligne of [
    'Co-Authored-By: Claude Opus <noreply@anthropic.com>',
    'Co-authored-by: Cursor <cursoragent@cursor.com>',
    'co-authored-by: GitHub Copilot <copilot@github.com>',
    '// Co-Authored-By: Claude',
    '# Co-Authored-By: ChatGPT',
  ]) {
    assert.deepEqual(ids(`fix: quelque chose\n\n${ligne}\n`), ['co-authored-ia'], ligne);
  }
});

test('laisse passer un Co-Authored-By qui crédite une personne', () => {
  assert.deepEqual(ids('feat: x\n\nCo-Authored-By: Camille Martin <camille@example.org>\n'), []);
});

test('refuse les mentions de génération, l’émoji robot et le lien promotionnel', () => {
  assert.deepEqual(ids('Generated with [Claude Code](https://example.org)'), ['generated-with']);
  assert.deepEqual(ids('Généré par ChatGPT'), ['generated-with']);
  assert.deepEqual(ids(`${String.fromCodePoint(0x1f916)} fait main`), ['robot']);
  assert.deepEqual(ids('voir https://claude.ai/code'), ['claude-code-url']);
  // Une ligne ordinaire qui parle d'IA n'est pas une signature.
  assert.deepEqual(ids('Mister Quota suit la consommation des comptes Claude et OpenAI.'), []);
});

test('seuls les fichiers qui énoncent la règle en sont exemptés', () => {
  assert.equal(estExempt('scripts/check-ai-attribution.mjs'), true);
  assert.equal(estExempt('.github\\workflows\\no-ai-attribution.yml'), true);
  assert.equal(estExempt('scripts/build-site.mjs'), false);
  assert.equal(estExempt('README.md'), false);
});

test('aucun fichier versionné de ce dépôt ne porte de signature', t => {
  let fichiers;
  try {
    fichiers = execFileSync('git', ['ls-files'], { cwd: RACINE, encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    t.skip('git indisponible');
    return;
  }
  const BINAIRES = new Set(['.png', '.jpg', '.jpeg', '.ico', '.webp', '.gif']);
  const fautes = [];
  for (const f of fichiers) {
    if (estExempt(f) || BINAIRES.has(extname(f).toLowerCase())) continue;
    let contenu;
    try {
      contenu = readFileSync(join(RACINE, f), 'utf8');
    } catch {
      continue;
    }
    for (const trouve of findAttribution(contenu)) fautes.push(`${f}:${trouve.ligne} ${trouve.id}`);
  }
  assert.deepEqual(fautes, []);
});
