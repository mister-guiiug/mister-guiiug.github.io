/**
 * Plans de site, dates de modification, robots.txt : ce que le hub publie pour
 * les robots. Sans réseau.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MOTIF_ROBOT,
  ROBOTS_ENTRAINEMENT,
  ROBOTS_RECHERCHE,
  datesDeModification,
  dernierLastmod,
  empreinte,
  indexDePlans,
  jourAffiche,
  lireEtatEnLigne,
  planDeSite,
  robotsTxt,
  urlsDuPlan,
} from '../scripts/seo-hub.mjs';

const ORIGINE = 'https://mister-guiiug.github.io';
const ACCUEIL = `${ORIGINE}/`;
const A_PROPOS = `${ORIGINE}/a-propos.html`;

// ---------------------------------------------------------------------------
// lastmod
// ---------------------------------------------------------------------------

test('même contenu : le lastmod précédent est repris, rien à signaler', () => {
  const precedent = {
    version: 1,
    pages: {
      [ACCUEIL]: { empreinte: empreinte('accueil'), lastmod: '2026-09-20' },
      [A_PROPOS]: { empreinte: empreinte('à propos'), lastmod: '2026-09-21' },
    },
  };
  const { etat, modifiees } = datesDeModification(
    precedent,
    [
      { url: ACCUEIL, empreinte: empreinte('accueil') },
      { url: A_PROPOS, empreinte: empreinte('à propos') },
    ],
    '2026-09-29'
  );
  assert.deepEqual(modifiees, []);
  assert.equal(etat.pages[ACCUEIL].lastmod, '2026-09-20');
  assert.equal(etat.pages[A_PROPOS].lastmod, '2026-09-21');
});

test('contenu changé ou page nouvelle : aujourd’hui, et à signaler', () => {
  const precedent = {
    pages: { [ACCUEIL]: { empreinte: empreinte('v1'), lastmod: '2026-09-20' } },
  };
  const { etat, modifiees } = datesDeModification(
    precedent,
    [
      { url: ACCUEIL, empreinte: empreinte('v2') },
      { url: A_PROPOS, empreinte: empreinte('neuve') },
    ],
    '2026-09-29'
  );
  assert.deepEqual(modifiees, [ACCUEIL, A_PROPOS]);
  assert.equal(etat.pages[ACCUEIL].lastmod, '2026-09-29');
  assert.equal(etat.pages[A_PROPOS].lastmod, '2026-09-29');
  assert.equal(etat.pages[ACCUEIL].empreinte, empreinte('v2'));
});

test('état absent ou abîmé : tout est daté d’aujourd’hui', () => {
  for (const precedent of [null, {}, { pages: { [ACCUEIL]: { empreinte: 'x' } } }]) {
    const { etat, modifiees } = datesDeModification(
      precedent,
      [{ url: ACCUEIL, empreinte: 'x' }],
      '2026-09-29'
    );
    assert.deepEqual(modifiees, [ACCUEIL]);
    assert.equal(etat.pages[ACCUEIL].lastmod, '2026-09-29');
  }
  assert.throws(() => datesDeModification(null, [], '29/09/2026'));
});

test('une page retirée sort de l’état', () => {
  const { etat } = datesDeModification(
    { pages: { [ACCUEIL]: { empreinte: 'a', lastmod: '2026-09-01' }, [A_PROPOS]: { empreinte: 'b', lastmod: '2026-09-01' } } },
    [{ url: ACCUEIL, empreinte: 'a' }],
    '2026-09-29'
  );
  assert.deepEqual(Object.keys(etat.pages), [ACCUEIL]);
});

test('lireEtatEnLigne : lu, absent, injoignable, sans jamais lever', async () => {
  const etat = { version: 1, pages: { [ACCUEIL]: { empreinte: 'a', lastmod: '2026-09-01' } } };
  const lu = await lireEtatEnLigne(`${ORIGINE}/seo-state.json`, {
    recuperer: async url => {
      assert.match(url, /\/seo-state\.json\?t=\d+$/, 'le cache du CDN doit être contourné');
      return new Response(JSON.stringify(etat), { status: 200 });
    },
  });
  assert.equal(lu.statut, 'lu');
  assert.deepEqual(lu.etat, etat);

  const absent = await lireEtatEnLigne('x', { recuperer: async () => new Response('', { status: 404 }) });
  assert.deepEqual(absent, { etat: null, statut: 'absent' });

  let essais = 0;
  const panne = await lireEtatEnLigne('x', {
    pauseMs: 0,
    recuperer: async () => {
      essais += 1;
      throw new TypeError('fetch failed');
    },
  });
  assert.deepEqual(panne, { etat: null, statut: 'injoignable' });
  assert.equal(essais, 3);

  const illisible = await lireEtatEnLigne('x', {
    pauseMs: 0,
    recuperer: async () => new Response('<html>', { status: 200 }),
  });
  assert.equal(illisible.etat, null);
});

test('jourAffiche : la date du jour UTC, en français et en anglais', () => {
  assert.equal(jourAffiche('2026-09-29', 'fr'), '29 septembre 2026');
  assert.equal(jourAffiche('2026-09-29', 'en'), '29 September 2026');
  assert.equal(jourAffiche('2026-01-01', 'fr'), '1 janvier 2026');
});

// ---------------------------------------------------------------------------
// Plans de site
// ---------------------------------------------------------------------------

test('l’index des plans de site : un sitemapindex, échappé, lastmod facultatif', () => {
  const xml = indexDePlans([
    { loc: `${ORIGINE}/sitemap-hub.xml`, lastmod: '2026-09-29' },
    { loc: `${ORIGINE}/miss-dice/sitemap.xml`, lastmod: null },
    { loc: `${ORIGINE}/a&b/sitemap.xml` },
  ]);
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<sitemapindex xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.equal((xml.match(/<sitemap>/g) ?? []).length, 3);
  assert.equal((xml.match(/<lastmod>/g) ?? []).length, 1);
  assert.match(xml, /<loc>https:\/\/mister-guiiug\.github\.io\/a&amp;b\/sitemap\.xml<\/loc>/);
  assert.doesNotMatch(xml, /<urlset/);
});

test('le plan du hub : lastmod seul, relu à l’identique', () => {
  const entrees = [
    { loc: ACCUEIL, lastmod: '2026-09-20' },
    { loc: A_PROPOS, lastmod: '2026-09-29' },
  ];
  const xml = planDeSite(entrees);
  assert.doesNotMatch(xml, /changefreq|priority/);
  assert.deepEqual(urlsDuPlan(xml), entrees);
  assert.equal(dernierLastmod(urlsDuPlan(xml)), '2026-09-29');
});

test('urlsDuPlan lit un plan d’app, entités comprises', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${ORIGINE}/miss-dice/</loc><lastmod>2026-09-28</lastmod><changefreq>weekly</changefreq></url>
  <url><loc>${ORIGINE}/miss-dice/regles-du-yahtzee.html?a=1&amp;b=2</loc><lastmod>2026-09-28T10:00:00+00:00</lastmod></url>
  <url><loc>${ORIGINE}/miss-dice/sans-date.html</loc></url>
</urlset>`;
  assert.deepEqual(urlsDuPlan(xml), [
    { loc: `${ORIGINE}/miss-dice/`, lastmod: '2026-09-28' },
    { loc: `${ORIGINE}/miss-dice/regles-du-yahtzee.html?a=1&b=2`, lastmod: '2026-09-28T10:00:00+00:00' },
    { loc: `${ORIGINE}/miss-dice/sans-date.html`, lastmod: null },
  ]);
  assert.equal(dernierLastmod(urlsDuPlan(xml)), '2026-09-28');
  assert.equal(dernierLastmod([]), null);
});

// ---------------------------------------------------------------------------
// robots.txt
// ---------------------------------------------------------------------------

/** Les groupes d'un robots.txt : ses agents et ses règles, commentaires ôtés. */
function groupes(texte) {
  const res = [];
  let courant = null;
  for (const brute of texte.split('\n')) {
    const ligne = brute.replace(/#.*$/, '').trim();
    if (!ligne) continue;
    const [cle, ...reste] = ligne.split(':');
    const valeur = reste.join(':').trim();
    if (/^user-agent$/i.test(cle)) {
      if (!courant || courant.regles.length) res.push((courant = { agents: [], regles: [] }));
      courant.agents.push(valeur);
    } else if (/^(allow|disallow)$/i.test(cle)) {
      courant.regles.push(`${cle.toLowerCase()}: ${valeur}`);
    }
  }
  return res;
}

test('robots.txt : un seul plan de site, l’index', () => {
  const txt = robotsTxt({ origine: ORIGINE });
  assert.deepEqual(
    txt.split('\n').filter(l => /^sitemap:/i.test(l)),
    [`Sitemap: ${ORIGINE}/sitemap.xml`]
  );
});

test('robots.txt : tout est autorisé, à tous, groupe par groupe', () => {
  const txt = robotsTxt({ origine: ORIGINE });
  assert.doesNotMatch(txt.replace(/#.*$/gm, ''), /disallow/i);
  const gs = groupes(txt);
  assert.deepEqual(gs[0], { agents: ['*'], regles: ['allow: /'] });
  const nommes = gs.slice(1).flatMap(g => g.agents);
  for (const r of [...ROBOTS_RECHERCHE, ...ROBOTS_ENTRAINEMENT]) {
    assert.ok(nommes.includes(r), `${r} n’a pas de groupe`);
  }
  for (const g of gs) assert.deepEqual(g.regles, ['allow: /'], `groupe ${g.agents.join(', ')}`);
  // Les robots demandés, ni plus ni moins.
  assert.deepEqual(
    [...ROBOTS_RECHERCHE].sort(),
    ['ChatGPT-User', 'Claude-SearchBot', 'Claude-User', 'OAI-SearchBot', 'Perplexity-User', 'PerplexityBot', 'bingbot'].sort()
  );
  assert.deepEqual(
    [...ROBOTS_ENTRAINEMENT].sort(),
    ['Applebot-Extended', 'CCBot', 'ClaudeBot', 'GPTBot', 'Google-Extended'].sort()
  );
});

// ---------------------------------------------------------------------------
// Agents utilisateurs de robots
// ---------------------------------------------------------------------------

test('MOTIF_ROBOT reconnaît les robots, et pas les navigateurs', () => {
  const robots = [
    'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.7339.207 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (compatible; Google-InspectionTool/1.0;)',
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/116.0.1938.76 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) BingPreview/1.0b',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Safari/605.1.15 (Applebot/0.1; +http://www.apple.com/go/applebot)',
    'DuckDuckBot/1.1; (+http://duckduckgo.com/duckduckbot.html)',
    'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)',
    'Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)',
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot',
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot',
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot',
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-User/1.0; +Claude-User@anthropic.com)',
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-SearchBot/1.0; +Claude-SearchBot@anthropic.com)',
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)',
    'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)',
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'Twitterbot/1.0',
    'LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)',
    'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)',
    'Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)',
    'some crawler (research)',
  ];
  for (const ua of robots) assert.ok(MOTIF_ROBOT.test(ua), `robot manqué : ${ua}`);

  const navigateurs = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (X11; Linux x86_64; rv:143.0) Gecko/20100101 Firefox/143.0',
    // Les téléphones CUBOT portent « BOT » dans leur modèle.
    'Mozilla/5.0 (Linux; Android 10; CUBOT X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 12; KINGKONG 7 Build/SP1A.210812.016) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  ];
  for (const ua of navigateurs) assert.ok(!MOTIF_ROBOT.test(ua), `navigateur pris pour un robot : ${ua}`);
});
