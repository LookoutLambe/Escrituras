/*
 * spa_scorecard.js — the word scorecard for the Spanish interlinear.
 *
 * The Spanish counterpart of the Hebrew root scorecard, showing the same
 * things: what the word's dictionary form is, how often the scriptures use
 * it and in how many verses, how that splits across the volumes, which
 * surface forms it takes, and which English it is glossed with.
 *
 * Hebrew files a word under its ROOT; Spanish files it under its LEMMA — the
 * infinitive for a verb, the singular for a noun — because that is the unit a
 * Spanish reader looks up.
 *
 * The concordance is 1.16 MB, so it is NOT loaded with the page. It arrives
 * on the first word tap, and a warmup fires on the first scroll or touch so
 * the first tap is usually instant. A reader who never taps a word never
 * downloads it.
 *
 *   SpaScorecard.init({ base: '' });
 *   SpaScorecard.fill(slotEl, spanishSurface, glossText);
 */
(function (global) {
  'use strict';

  /* BASE DEFAULTS TO THIS SCRIPT'S OWN DIRECTORY, not the page's. The
     concordance was fetched as a page-relative 'spa_concordance.js', which is
     right from /index.html and 404s from /pt/index.html — the Portuguese
     edition sits a level down and shares this file. Resolving against the
     script's own URL is correct at any depth and needs no per-page setup. */
  var cfg = { base: (function () {
    try {
      var me = document.currentScript && document.currentScript.src;
      if (!me) {
        var all = document.getElementsByTagName('script');
        for (var i = all.length - 1; i >= 0 && !me; i--)
          if (/spa_scorecard\.js/.test(all[i].src)) me = all[i].src;
      }
      return me ? me.replace(/[^/]*$/, '') : '';
    } catch (e) { return ''; }
  })() };
  var loading = false, loaded = false, queue = [];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* Strip the punctuation the corpus keeps on a token for display. The lookup
     key must match the concordance, which was built from stripped forms. */
  function clean(s) {
    return String(s || '').toLowerCase()
      .replace(/^[\s.,;:!?¿¡"“”'`()\[\]—–-]+/, '')
      .replace(/[\s.,;:!?¿¡"“”'`()\[\]—–-]+$/, '');
  }

  function ensure(cb) {
    if (loaded) { cb(); return; }
    queue.push(cb);
    if (loading) return;
    loading = true;
    var el = document.createElement('script');
    el.src = cfg.base + 'spa_concordance.js';
    el.async = true;
    el.onload = function () {
      loaded = true; loading = false;
      var q = queue; queue = [];
      q.forEach(function (f) { try { f(); } catch (e) {} });
    };
    el.onerror = function () {
      loading = false;
      var q = queue; queue = [];
      q.forEach(function (f) { try { f(); } catch (e) {} });
    };
    document.head.appendChild(el);
  }

  /* Warm up on the first real interaction, never on load: the concordance is
     bigger than the whole reading shell, and most readers never tap a word. */
  (function warmup() {
    var fired = false;
    function kick() {
      if (fired) return;
      fired = true;
      ['scroll', 'touchstart', 'pointerdown', 'keydown'].forEach(function (ev) {
        window.removeEventListener(ev, kick);
      });
      var conn = navigator.connection;
      if (conn && (conn.saveData || /2g/.test(conn.effectiveType || ''))) return;
      setTimeout(function () { ensure(function () {}); }, 400);
    }
    ['scroll', 'touchstart', 'pointerdown', 'keydown'].forEach(function (ev) {
      window.addEventListener(ev, kick, { passive: true, once: true });
    });
  })();

  /* The concordance is keyed by lemma, but the reader taps a SURFACE form.
     Try the surface first (it is its own lemma for most nouns), then every
     lemma whose recorded forms include it. */
  var formIndex = null;
  function lookup(surface) {
    var data = global._spaConcordance;
    if (!data) return null;
    var key = clean(surface);
    if (!key) return null;
    /* A direct hit only counts when that lemma actually OWNS this form.
       `sembrado` has an entry of its own but its forms are all `sembrados`;
       taking the direct hit filed the tapped word under a lemma that does not
       admit it, and the card showed it as "here" against a stranger. */
    var direct = data.lemmas[key];
    if (direct && (direct.f || {})[key] != null) return { lemma: key, entry: direct };
    if (!formIndex) {
      formIndex = {};
      for (var lem in data.lemmas) {
        var f = data.lemmas[lem].f || {};
        for (var form in f) {
          var prev = formIndex[form];
          /* data.lemmas[prev] can be absent — the Portuguese edition shares
             this file and its words are not in a Spanish concordance, so the
             lookup threw on every word tap instead of simply finding nothing. */
          var pe = prev && data.lemmas[prev];
          if (!prev || f[form] > ((pe && pe.f && pe.f[form]) || 0)) formIndex[form] = lem;
        }
      }
    }
    var hit = formIndex[key];
    if (hit) return { lemma: hit, entry: data.lemmas[hit] };
    return direct ? { lemma: key, entry: direct } : null;
  }

  function cardHtml(found, surface, glossText) {
    var data = global._spaConcordance;
    var e = found.entry, total = 0, totalVerses = 0;
    e.c.forEach(function (n) { total += n; });
    e.vc.forEach(function (n) { totalVerses += n; });

    var h = '<div class="ssc-head"><span class="ssc-lemma">' + esc(found.lemma) + '</span>' +
            '<span class="ssc-count">' + total + ' uses in ' + totalVerses + ' verses</span></div>';
    if (e.m) h += '<div class="ssc-meaning">' + esc(e.m) + '</div>';

    h += '<div class="ssc-chips">';
    (data.volOrder || []).forEach(function (vk, i) {
      var n = e.c[i];
      if (!n) return;
      h += '<span class="ssc-chip">' + esc((data.volNames || {})[vk] || vk) + ' ' + n + '</span>';
    });
    h += '</div>';

    /* The tapped form and gloss always appear, marked "here" when the
       concordance's cap dropped them — otherwise an idiomatic rendering
       vanishes from the card and the reader sees a definition that does not
       admit the word in front of them. */
    var hereForm = clean(surface);
    var forms = Object.keys(e.f || {});
    var items = forms.map(function (f) {
      var me = f === hereForm ? ' ssc-here' : '';
      return '<span class="ssc-form' + me + '">' + esc(f) + ' <i>' + e.f[f] + '</i></span>';
    });
    if (hereForm && forms.indexOf(hereForm) < 0) {
      items.push('<span class="ssc-form ssc-here">' + esc(hereForm) + ' <i>here</i></span>');
    }
    if (items.length) h += '<div class="ssc-row"><b>Forms</b>' + items.join('') + '</div>';

    var hereGloss = String(glossText || '').replace(/^[\s".,;:!?()—–-]+|[\s".,;:!?()—–-]+$/g, '');
    var glosses = Object.keys(e.g || {});
    var gitems = glosses.slice(0, 6).map(function (g) {
      var me = g.toLowerCase() === hereGloss.toLowerCase() ? ' ssc-here' : '';
      return '<span class="ssc-form' + me + '">' + esc(g) + ' <i>' + e.g[g] + '</i></span>';
    });
    var found2 = glosses.some(function (g) { return g.toLowerCase() === hereGloss.toLowerCase(); });
    if (hereGloss && !found2) {
      gitems.push('<span class="ssc-form ssc-here">' + esc(hereGloss) + ' <i>here</i></span>');
    }
    if (gitems.length) h += '<div class="ssc-row"><b>Glossed</b>' + gitems.join('') + '</div>';
    return h;
  }

  function fill(slotEl, surface, glossText) {
    if (!slotEl) return;
    slotEl.innerHTML = '<div class="ssc-loading">…</div>';
    ensure(function () {
      var found = lookup(surface);
      if (!found) { slotEl.innerHTML = ''; return; }
      slotEl.innerHTML = cardHtml(found, surface, glossText);
    });
  }

  global.SpaScorecard = {
    init: function (o) { if (o && o.base != null) cfg.base = o.base; },
    fill: fill
  };
})(window);
