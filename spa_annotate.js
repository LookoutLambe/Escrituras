/*
 * spa_annotate.js — highlights, underline and notes for the Spanish reader.
 *
 * The same functions the Hebrew reader has, and the same shape of popover:
 * a colour row, an underline row, note / copy / close, and a note editor.
 *
 * Two things carried over from the Hebrew reader because they were settled
 * there the hard way:
 *   The popover is CENTERED, not anchored to the selection. Anchored, it
 *   covered the words being marked and jumped around on every reselect.
 *   In dark mode the colours are translucent WASHES, not the solid pastels.
 *   A solid pastel on a near-black ground is brighter than the text and the
 *   eye goes to the mark instead of the words.
 *
 * Storage is one localStorage key. A mark is (verse id, word index), which
 * survives re-render and re-pagination; a note belongs to the verse.
 */
(function (global) {
  'use strict';

  var KEY = 'spa-annotations';
  var COLORS = ['#fff9c4', '#bbdefb', '#ef9a9a', '#c8e6c9', '#e1bee7',
                '#ffe0b2', '#b2dfdb', '#f8bbd0', '#ffecb3', '#cfd8dc'];
  var data = load();
  var selUnits = [];

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* A word is addressed by the verse it sits in and its index within it, so a
     mark survives re-render, font changes and view-mode switches. */
  function verseIdOf(el) {
    var v = el.closest && el.closest('.verse');
    if (!v) return null;
    var panel = v.closest('[id$="-verses"]') || v.parentElement;
    var pid = panel && panel.id ? panel.id.replace(/-verses$/, '') : 'x';
    var num = v.querySelector('.verse-num');
    return pid + '|' + (num ? num.textContent.trim() : Array.prototype.indexOf.call(v.parentElement.children, v));
  }
  function wordIndexOf(el) {
    var v = el.closest('.verse');
    if (!v) return -1;
    return Array.prototype.indexOf.call(v.querySelectorAll('.word-unit'), el);
  }

  function entry(vid, make) {
    if (!data[vid] && make) data[vid] = { w: {}, n: '' };
    return data[vid];
  }

  // ---------- painting ----------
  function paintWord(el, mark) {
    el.classList.toggle('ann-ul', !!(mark && mark.u));
    if (mark && mark.c) {
      el.classList.add('ann-hl');
      el.style.setProperty('--ann-color', mark.c);
    } else {
      el.classList.remove('ann-hl');
      el.style.removeProperty('--ann-color');
    }
  }

  function applyAll(root) {
    (root || document).querySelectorAll('.verse').forEach(function (v) {
      var first = v.querySelector('.word-unit');
      if (!first) return;
      var vid = verseIdOf(first);
      var e = data[vid];
      var units = v.querySelectorAll('.word-unit');
      units.forEach(function (u, i) { paintWord(u, e && e.w ? e.w[i] : null); });
      var hasNote = e && e.n;
      var num = v.querySelector('.verse-num');
      if (num) num.classList.toggle('has-note', !!hasNote);
    });
  }

  // ---------- selection ----------
  function selectedUnits() {
    var sel = global.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) return [];
    var out = [];
    document.querySelectorAll('.word-unit').forEach(function (u) {
      try { if (sel.containsNode(u, true)) out.push(u); } catch (e) {}
    });
    return out;
  }

  function showPop() {
    var units = selectedUnits();
    if (!units.length) { hidePop(); return; }
    selUnits = units;
    var pop = document.getElementById('hl-pop');
    if (!pop) return;
    var noteRow = document.getElementById('hl-note-row');
    if (noteRow) noteRow.style.display = 'none';
    pop.classList.add('visible');
  }

  function hidePop() {
    var pop = document.getElementById('hl-pop');
    if (pop) pop.classList.remove('visible');
    var noteRow = document.getElementById('hl-note-row');
    if (noteRow) noteRow.style.display = 'none';
    selUnits = [];
  }

  // ---------- actions ----------
  function apply(color, underline) {
    if (!selUnits.length) return;
    selUnits.forEach(function (u) {
      var vid = verseIdOf(u), i = wordIndexOf(u);
      if (!vid || i < 0) return;
      var e = entry(vid, true);
      var m = e.w[i] || {};
      if (underline === 'toggle') m.u = !m.u;
      if (color !== undefined) m.c = color || '';
      if (!m.c && !m.u) delete e.w[i]; else e.w[i] = m;
      if (!Object.keys(e.w).length && !e.n) delete data[vid];
      paintWord(u, e.w ? e.w[i] : null);
    });
    save();
  }

  function copySelection() {
    var t = String(global.getSelection());
    if (navigator.clipboard) navigator.clipboard.writeText(t).catch(function () {});
    hidePop();
    try { global.getSelection().removeAllRanges(); } catch (e) {}
  }

  function toggleNote() {
    var row = document.getElementById('hl-note-row');
    if (!row || !selUnits.length) return;
    if (row.style.display !== 'none') { row.style.display = 'none'; return; }
    var vid = verseIdOf(selUnits[0]);
    var ta = document.getElementById('hl-note-input');
    ta.value = (data[vid] && data[vid].n) || '';
    row.style.display = 'flex';
    setTimeout(function () { try { ta.focus(); } catch (e) {} }, 0);
  }

  function saveNote() {
    if (!selUnits.length) return;
    var vid = verseIdOf(selUnits[0]);
    var ta = document.getElementById('hl-note-input');
    var e = entry(vid, true);
    e.n = ta.value.trim();
    if (!e.n && !Object.keys(e.w).length) delete data[vid];
    save();
    applyAll();
    hidePop();
    try { global.getSelection().removeAllRanges(); } catch (e2) {}
  }

  function noteFor(el) {
    var vid = verseIdOf(el);
    return (vid && data[vid] && data[vid].n) || '';
  }

  // ---------- wiring ----------
  var t = null;
  document.addEventListener('selectionchange', function () {
    var row = document.getElementById('hl-note-row');
    if (row && row.style.display !== 'none') return;   // typing owns the selection
    clearTimeout(t);
    t = setTimeout(showPop, 120);
  });
  document.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('#hl-pop')) return;
    var sel = global.getSelection();
    if (!sel || sel.isCollapsed) hidePop();
  });

  global.SpaAnnotate = {
    colors: COLORS,
    apply: apply,
    underline: function () { apply(undefined, 'toggle'); },
    copy: copySelection,
    note: toggleNote,
    saveNote: saveNote,
    close: function () { try { global.getSelection().removeAllRanges(); } catch (e) {} hidePop(); },
    refresh: applyAll,
    noteFor: noteFor
  };
})(window);
