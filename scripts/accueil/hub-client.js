(function () {
  var I18N = __HUB_I18N__;
  var HASARD = __HUB_HASARD__;
  var root = document.documentElement;
  var themeMeta = document.getElementById('theme-color');
  var filtre = document.getElementById('filtre');
  var vide = document.getElementById('filtre-vide');
  var compte = document.getElementById('compte');
  var collant = document.getElementById('collant');
  var entete = document.querySelector('.entete');
  var sommaire = document.querySelector('.sommaire');
  var sommaireWrap = document.getElementById('sommaire-wrap');
  var haut = document.getElementById('haut');
  var maturityFilter = '';
  var platformFilter = '';
  var sortMode = 'stable';
  var activeCat = '';
  var deferredPrompt = null;
  var syncingUrl = false;
  var compteTimer = null;
  var ROBOT = __HUB_ROBOT__;

  function lang() {
    return root.lang === 'en' ? 'en' : 'fr';
  }

  function theme() {
    return root.dataset.theme || 'system';
  }

  function isPwa() {
    return root.dataset.pwa === '1';
  }

  function applyLang(l) {
    l = l === 'en' ? 'en' : 'fr';
    root.lang = l;
    try { localStorage.setItem('hub-lang', l); } catch (e) {}
    var t = I18N[l];
    var pwa = isPwa();
    appliqueTitre();
    var desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute('content', t.description);
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var k = el.getAttribute('data-i18n');
      if (pwa && el.hasAttribute('data-i18n-pwa')) {
        k = el.getAttribute('data-i18n-pwa');
      }
      if (t[k]) el.textContent = t[k];
    });
    document.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
      var k = el.getAttribute('data-i18n-aria');
      if (t[k]) {
        el.setAttribute('aria-label', t[k]);
        if (el.hasAttribute('title')) el.setAttribute('title', t[k]);
      }
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      var k = el.getAttribute('data-i18n-placeholder');
      if (t[k]) el.setAttribute('placeholder', t[k]);
    });
    document.querySelectorAll('[data-i18n-cat]').forEach(function (el) {
      var c = el.getAttribute('data-i18n-cat');
      if (t.categories && t.categories[c]) el.textContent = t.categories[c];
    });
    document.querySelectorAll('[data-i18n-maturity]').forEach(function (el) {
      var m = el.getAttribute('data-i18n-maturity');
      if (t.maturity && t.maturity[m]) el.textContent = t.maturity[m];
    });
    document.querySelectorAll('[data-fr][data-en]').forEach(function (el) {
      el.textContent = el.getAttribute(l === 'en' ? 'data-en' : 'data-fr');
    });
    // Un guide et sa traduction : l'adresse, sa langue et son titre
    // suivent la langue choisie (scripts/guides.mjs).
    ['href', 'hreflang', 'lang', 'title'].forEach(function (attr) {
      document.querySelectorAll('[data-fr-' + attr + '][data-en-' + attr + ']').forEach(function (el) {
        el.setAttribute(attr, el.getAttribute('data-' + l + '-' + attr));
      });
    });
    // Les guides de la langue choisie en tête de leur groupe : dans le
    // DOM, pas seulement à l'œil, pour que la tabulation suive.
    document.querySelectorAll('.guides-liste').forEach(function (ul) {
      var rang = function (li) {
        var langues = (li.getAttribute('data-langues') || '').split(' ');
        return langues.indexOf(l) >= 0 ? 0 : 1;
      };
      Array.prototype.slice
        .call(ul.children)
        .sort(function (a, b) {
          return rang(a) - rang(b) || a.getAttribute('data-ordre') - b.getAttribute('data-ordre');
        })
        .forEach(function (li) {
          ul.appendChild(li);
        });
    });
    document.querySelectorAll('img[data-alt-fr][data-alt-en]').forEach(function (img) {
      img.setAttribute('alt', img.getAttribute(l === 'en' ? 'data-alt-en' : 'data-alt-fr'));
    });
    document.querySelectorAll('[data-set-lang]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.getAttribute('data-set-lang') === l ? 'true' : 'false');
    });
    var plus = document.getElementById('chapeau-plus');
    var chapeau = document.getElementById('chapeau');
    if (plus && chapeau) {
      plus.textContent = chapeau.classList.contains('is-open') ? t.enSavoirMoins : t.enSavoirPlus;
    }
    updateCompte(true);
  }

  function mouvementReduit() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /** Un défilement vers une section : lissé, sauf sous mouvement réduit. */
  function defileVers(cible) {
    if (cible) cible.scrollIntoView({ behavior: mouvementReduit() ? 'auto' : 'smooth', block: 'start' });
  }

  function resolveThemeColor() {
    var th = theme();
    if (th === 'dark') return '#0f1220';
    if (th === 'light') return '#f7f8fc';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? '#0f1220' : '#f7f8fc';
  }

  function applyTheme(th, anime) {
    if (th !== 'light' && th !== 'dark' && th !== 'system') th = 'system';
    var run = function () {
      root.dataset.theme = th;
      try { localStorage.setItem('hub-theme', th); } catch (e) {}
      if (themeMeta) themeMeta.setAttribute('content', resolveThemeColor());
      document.querySelectorAll('[data-set-theme]').forEach(function (btn) {
        btn.setAttribute('aria-pressed', btn.getAttribute('data-set-theme') === th ? 'true' : 'false');
      });
    };
    if (anime && document.startViewTransition && !mouvementReduit()) {
      var transition = document.startViewTransition(run);
      var ignore = function () {};
      if (transition.ready) transition.ready.catch(ignore);
      if (transition.finished) transition.finished.catch(ignore);
      if (transition.updateCallbackDone) transition.updateCallbackDone.catch(ignore);
    } else {
      run();
    }
  }

  // LE TITRE LONG RESTE CELUI DE LA PAGE. Jusqu'au 29/09/2026, il cédait
  // la place à « GuiiuG » au bout de 4 s, dans tout navigateur : Bing,
  // qui indexe la page RENDUE, la classait en erreur « Title too short ».
  // Le titre court ne sert qu'à la fenêtre de l'app installée (barre de
  // titre, sélecteur de tâches), et jamais devant un robot, même rendu
  // dans un mode inhabituel.
  function estInstallee() {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    );
  }

  function appliqueTitre() {
    var t = I18N[lang()];
    var robot = ROBOT.test(navigator.userAgent || '');
    document.title = t.titleCourt && estInstallee() && !robot ? t.titleCourt : t.title;
  }

  function writeUrl() {
    if (syncingUrl) return;
    var p = new URLSearchParams(location.search);
    var pose = function (cle, valeur) {
      if (valeur) p.set(cle, valeur);
      else p.delete(cle);
    };
    pose('q', filtre ? filtre.value.trim() : '');
    pose('m', maturityFilter);
    pose('p', platformFilter);
    pose('sort', sortMode !== 'stable' ? sortMode : '');
    pose('cat', activeCat);
    var qs = p.toString();
    var next = qs ? location.pathname + '?' + qs + location.hash : location.pathname + location.hash;
    var cur = location.pathname + location.search + location.hash;
    if (next !== cur) history.replaceState(null, '', next);
  }

  function updateCompte(immediate) {
    var run = function () {
      var t = I18N[lang()];
      var visible = 0;
      document.querySelectorAll('main .carte[data-search]').forEach(function (carte) {
        if (!carte.hidden) visible += 1;
      });
      var q = filtre ? filtre.value.trim() : '';
      var filtered = q !== '' || maturityFilter !== '' || platformFilter !== '';
      if (compte) {
        compte.textContent = filtered
          ? t.compteFiltre.replace('{n}', String(visible))
          : t.compte;
      }
      if (vide) vide.setAttribute('data-visible', filtered && visible === 0 ? '1' : '0');
      writeUrl();
    };
    if (immediate) {
      if (compteTimer) clearTimeout(compteTimer);
      run();
      return;
    }
    if (compteTimer) clearTimeout(compteTimer);
    compteTimer = setTimeout(run, 180);
  }

  function applySort() {
    document.querySelectorAll('[data-grille]').forEach(function (ul) {
      var cards = Array.prototype.slice.call(ul.querySelectorAll('.carte'));
      cards.sort(function (a, b) {
        if (sortMode === 'az') {
          return (a.getAttribute('data-name') || '').localeCompare(b.getAttribute('data-name') || '', 'fr');
        }
        var ra = Number(a.getAttribute('data-rang') || 9);
        var rb = Number(b.getAttribute('data-rang') || 9);
        if (ra !== rb) return ra - rb;
        return (a.getAttribute('data-name') || '').localeCompare(b.getAttribute('data-name') || '', 'fr');
      });
      cards.forEach(function (c) {
        ul.appendChild(c);
      });
    });
    syncFiltresBadge();
  }

  function applyFilters() {
    var q = filtre ? filtre.value.trim().toLowerCase() : '';
    document.querySelectorAll('main .carte[data-search]').forEach(function (carte) {
      var textOk = q === '' || carte.getAttribute('data-search').indexOf(q) !== -1;
      var mat = carte.getAttribute('data-maturity') || '';
      var matOk = maturityFilter === '' || mat === maturityFilter;
      var plat = carte.getAttribute('data-platform') || '';
      var platOk = platformFilter === '' || plat === platformFilter;
      carte.hidden = !(textOk && matOk && platOk);
    });
    document.querySelectorAll('main > section').forEach(function (sec) {
      if (sec.classList.contains('coulisses')) return;
      var cartes = sec.querySelectorAll('.carte');
      if (!cartes.length) return;
      var visible = false;
      cartes.forEach(function (c) {
        if (!c.hidden) visible = true;
      });
      sec.hidden = !visible;
    });
    updateCompte();
    syncFiltresBadge();
  }

  function clearFilters() {
    if (filtre) filtre.value = '';
    maturityFilter = '';
    platformFilter = '';
    document.querySelectorAll('[data-maturity-filter]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.getAttribute('data-maturity-filter') === '' ? 'true' : 'false');
    });
    document.querySelectorAll('[data-platform-filter]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.getAttribute('data-platform-filter') === '' ? 'true' : 'false');
    });
    applyFilters();
    if (filtre) filtre.focus();
  }

  function readUrl() {
    syncingUrl = true;
    var p = new URLSearchParams(location.search);
    if (filtre && p.has('q')) filtre.value = p.get('q') || '';
    if (p.has('m')) {
      maturityFilter = p.get('m') || '';
      document.querySelectorAll('[data-maturity-filter]').forEach(function (btn) {
        btn.setAttribute(
          'aria-pressed',
          (btn.getAttribute('data-maturity-filter') || '') === maturityFilter ? 'true' : 'false'
        );
      });
    }
    if (p.has('p')) {
      platformFilter = p.get('p') || '';
      document.querySelectorAll('[data-platform-filter]').forEach(function (btn) {
        btn.setAttribute(
          'aria-pressed',
          (btn.getAttribute('data-platform-filter') || '') === platformFilter ? 'true' : 'false'
        );
      });
    }
    if (p.has('sort') && (p.get('sort') === 'az' || p.get('sort') === 'stable')) {
      sortMode = p.get('sort');
      document.querySelectorAll('[data-sort]').forEach(function (btn) {
        btn.setAttribute('aria-pressed', btn.getAttribute('data-sort') === sortMode ? 'true' : 'false');
      });
      applySort();
    }
    applyFilters();
    if (maturityFilter || platformFilter || sortMode !== 'stable') setFiltresOpen(true);
    if (p.has('cat')) {
      activeCat = p.get('cat') || '';
      var target = document.getElementById('cat-' + activeCat);
      if (target) {
        setTimeout(function () {
          defileVers(target);
        }, 50);
      }
    }
    syncingUrl = false;
  }

  function markImages() {
    document.querySelectorAll('.visuel-img').forEach(function (img) {
      var done = function () {
        img.classList.add('is-loaded');
      };
      if (img.complete && img.naturalWidth) done();
      else img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
    });
  }

  function updateSommaireFade() {
    if (!sommaire || !sommaireWrap) return;
    var overflow = sommaire.scrollWidth > sommaire.clientWidth + 4;
    var atEnd = sommaire.scrollLeft + sommaire.clientWidth >= sommaire.scrollWidth - 4;
    var atStart = sommaire.scrollLeft <= 4;
    sommaireWrap.setAttribute('data-overflow', overflow && !atEnd ? '1' : '0');
    sommaireWrap.setAttribute('data-overflow-start', overflow && !atStart ? '1' : '0');
  }

  /** La hauteur de la barre collante, réservée en haut de chaque défilement. */
  function syncChromeHeight() {
    if (!collant) return;
    root.style.setProperty('--collant-h', collant.offsetHeight + 'px');
  }

  function saveUi(key, val) {
    try {
      sessionStorage.setItem(key, val);
    } catch (e) {}
  }

  function loadUi(key) {
    try {
      return sessionStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  document.querySelectorAll('[data-set-lang]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      applyLang(btn.getAttribute('data-set-lang'));
    });
  });
  document.querySelectorAll('[data-set-theme]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      applyTheme(btn.getAttribute('data-set-theme'), true);
    });
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
    if (theme() === 'system') applyTheme('system');
  });
  // Installée depuis l'onglet, la page passe dans la fenêtre de l'app.
  var modeInstalle = window.matchMedia('(display-mode: standalone)');
  if (modeInstalle.addEventListener) modeInstalle.addEventListener('change', appliqueTitre);

  if (filtre) filtre.addEventListener('input', applyFilters);
  document.querySelectorAll('[data-maturity-filter]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      maturityFilter = btn.getAttribute('data-maturity-filter') || '';
      document.querySelectorAll('[data-maturity-filter]').forEach(function (b) {
        b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
      });
      applyFilters();
    });
  });
  document.querySelectorAll('[data-platform-filter]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      platformFilter = btn.getAttribute('data-platform-filter') || '';
      document.querySelectorAll('[data-platform-filter]').forEach(function (b) {
        b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
      });
      applyFilters();
    });
  });
  document.querySelectorAll('[data-sort]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      sortMode = btn.getAttribute('data-sort') || 'stable';
      document.querySelectorAll('[data-sort]').forEach(function (b) {
        b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
      });
      applySort();
      writeUrl();
    });
  });
  var effacer = document.getElementById('filtre-effacer');
  if (effacer) effacer.addEventListener('click', clearFilters);

  document.querySelectorAll('[data-suggest-cat]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      clearFilters();
      activeCat = btn.getAttribute('data-suggest-cat') || '';
      var target = document.getElementById('cat-' + activeCat);
      defileVers(target);
      writeUrl();
    });
  });

  document.querySelectorAll('.sommaire a[data-cat]').forEach(function (a) {
    a.addEventListener('click', function () {
      activeCat = a.getAttribute('data-cat') || '';
      writeUrl();
    });
  });

  var filtresToggle = document.getElementById('filtres-toggle');
  var filtresPanel = document.getElementById('filtres-panel');
  var filtresBadge = document.getElementById('filtres-badge');

  function syncFiltresBadge() {
    if (!filtresToggle) return;
    var n = (maturityFilter ? 1 : 0) + (platformFilter ? 1 : 0) + (sortMode !== 'stable' ? 1 : 0);
    if (n) filtresToggle.setAttribute('data-count', String(n));
    else filtresToggle.removeAttribute('data-count');
    if (filtresBadge) filtresBadge.textContent = n ? String(n) : '';
  }

  function setFiltresOpen(open) {
    if (!filtresToggle || !filtresPanel) return;
    filtresPanel.classList.toggle('is-open', open);
    // Sur mobile, le même bouton déplie aussi les catégories.
    if (collant) collant.classList.toggle('filtres-ouverts', open);
    filtresToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) filtresPanel.removeAttribute('inert');
    else filtresPanel.setAttribute('inert', '');
    saveUi('hub-filtres', open ? '1' : '0');
    syncChromeHeight();
  }

  if (filtresToggle && filtresPanel) {
    if (loadUi('hub-filtres') === '1') setFiltresOpen(true);
    filtresToggle.addEventListener('click', function () {
      setFiltresOpen(!filtresPanel.classList.contains('is-open'));
    });
    filtresPanel.addEventListener('transitionend', function (e) {
      if (e.propertyName === 'grid-template-rows') syncChromeHeight();
    });
  }

  var chapeauPlus = document.getElementById('chapeau-plus');
  var chapeau = document.getElementById('chapeau');
  if (chapeauPlus && chapeau) {
    if (loadUi('hub-chapeau') === '1') {
      chapeau.classList.add('is-open');
      chapeauPlus.setAttribute('aria-expanded', 'true');
      chapeauPlus.textContent = I18N[lang()].enSavoirMoins;
    }
    chapeauPlus.addEventListener('click', function () {
      var open = !chapeau.classList.contains('is-open');
      chapeau.classList.toggle('is-open', open);
      chapeauPlus.setAttribute('aria-expanded', open ? 'true' : 'false');
      chapeauPlus.textContent = open ? I18N[lang()].enSavoirMoins : I18N[lang()].enSavoirPlus;
      saveUi('hub-chapeau', open ? '1' : '0');
    });
  }

  var hasardBtn = document.getElementById('hasard');
  if (hasardBtn && HASARD && HASARD.length) {
    hasardBtn.addEventListener('click', function () {
      var url = HASARD[Math.floor(Math.random() * HASARD.length)];
      window.open(url, '_blank', 'noopener,noreferrer');
    });
  }

  document.addEventListener('keydown', function (e) {
    // Ctrl/Meta+K et « / » : voir hub-command.js (bindSearchHotkeys).
    if (e.key === 'Escape' && filtre && document.activeElement === filtre) {
      clearFilters();
    }
  });

  if ('IntersectionObserver' in window) {
    var links = Array.prototype.slice.call(document.querySelectorAll('.sommaire a[data-cat]'));
    var map = {};
    links.forEach(function (a) {
      map[a.getAttribute('data-cat')] = a;
    });
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var id = entry.target.getAttribute('data-cat-section');
          links.forEach(function (a) {
            a.removeAttribute('aria-current');
          });
          if (map[id]) map[id].setAttribute('aria-current', 'true');
        });
      },
      { rootMargin: '-20% 0px -65% 0px', threshold: 0 }
    );
    document.querySelectorAll('[data-cat-section]').forEach(function (sec) {
      observer.observe(sec);
    });
  }

  if (sommaire) {
    sommaire.addEventListener('scroll', updateSommaireFade, { passive: true });
    window.addEventListener('resize', updateSommaireFade);
    updateSommaireFade();
  }

  syncChromeHeight();
  if (collant && 'ResizeObserver' in window) {
    new ResizeObserver(syncChromeHeight).observe(collant);
  }
  window.addEventListener('resize', syncChromeHeight);

  // LA BARRE SE MASQUE EN DESCENDANT, REVIENT EN REMONTANT, sous mouvement
  // réduit comme ailleurs : la feuille de style y retire seulement la
  // transition. Elle reste là tant qu'on s'en sert (focus, filtres ouverts) et
  // tant qu'elle n'a pas encore atteint le haut de l'écran.
  if (collant) {
    var lastY = window.scrollY;
    var garder = function () {
      return (
        collant.contains(document.activeElement) ||
        collant.classList.contains('filtres-ouverts') ||
        (entete && window.scrollY < entete.offsetTop + entete.offsetHeight + collant.offsetHeight)
      );
    };
    window.addEventListener(
      'scroll',
      function () {
        var y = window.scrollY;
        if (y > lastY + 8 && !garder()) collant.classList.add('is-hidden');
        else if (y < lastY - 8 || garder()) collant.classList.remove('is-hidden');
        lastY = y;
        if (haut) haut.setAttribute('data-visible', y > window.innerHeight * 1.5 ? '1' : '0');
      },
      { passive: true }
    );
    collant.addEventListener('focusin', function () {
      collant.classList.remove('is-hidden');
    });
  }

  var installer = document.getElementById('installer');
  window.addEventListener('beforeinstallprompt', function (e) {
    if (isPwa()) return;
    e.preventDefault();
    deferredPrompt = e;
    if (installer) {
      installer.hidden = false;
      installer.setAttribute('data-visible', '1');
    }
  });
  if (installer) {
    installer.addEventListener('click', function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.finally(function () {
        deferredPrompt = null;
        installer.hidden = true;
        installer.removeAttribute('data-visible');
      });
    });
  }
  window.addEventListener('appinstalled', function () {
    if (installer) {
      installer.hidden = true;
      installer.removeAttribute('data-visible');
    }
  });

  markImages();
  applyLang(lang());
  applyTheme(theme());
  readUrl();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('__HUB_ORIGINE__/sw.js').catch(function () {});
  }
})();
