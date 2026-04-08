/**
 * crossrefs_engine_spa.js
 *
 * Cross-reference engine adapted for Las Escrituras (Spanish Interlinear).
 * Single-page app — all navigation is internal via navTo().
 *
 * Expected globals:
 *   - window._volumeCrossrefsData  (from crossrefs_all.js)
 *   - window._oaksScriptureIndex   (from oaks_scripture_index.js)
 *   - window._oaksTalksData        (from oaks_talks.js)
 *   - window._oaksAudioUrls        (from oaks_audio_urls.js)
 *   - BOOK_DATA, navTo, getBookChapter, _ensureChapterRendered (from Escrituras.html)
 */

(function() {
  'use strict';

  // ── State ──
  window._crossrefsLoaded = false;
  window._crossrefMap = {};
  var _returnFromChapId = null;
  var _returnFromVerseKey = null;
  var _returnFromLabel = null;
  var _activeAudio = null;

  // ── Scripture abbreviation to full book name ──
  var _abbrToFullBook = {
    'Gen.': 'Genesis', 'Ex.': 'Exodus', 'Lev.': 'Leviticus', 'Num.': 'Numbers',
    'Deut.': 'Deuteronomy', 'Josh.': 'Joshua', 'Judg.': 'Judges', 'Ruth': 'Ruth',
    '1 Sam.': '1 Samuel', '2 Sam.': '2 Samuel', '1 Kgs.': '1 Kings', '2 Kgs.': '2 Kings',
    '1 Chr.': '1 Chronicles', '2 Chr.': '2 Chronicles', 'Ezra': 'Ezra', 'Neh.': 'Nehemiah',
    'Esth.': 'Esther', 'Job': 'Job', 'Ps.': 'Psalms', 'Prov.': 'Proverbs',
    'Eccl.': 'Ecclesiastes', 'Song': 'Song of Solomon', 'Isa.': 'Isaiah', 'Jer.': 'Jeremiah',
    'Lam.': 'Lamentations', 'Ezek.': 'Ezekiel', 'Dan.': 'Daniel', 'Hosea': 'Hosea',
    'Joel': 'Joel', 'Amos': 'Amos', 'Obad.': 'Obadiah', 'Jonah': 'Jonah',
    'Micah': 'Micah', 'Nahum': 'Nahum', 'Hab.': 'Habakkuk', 'Zeph.': 'Zephaniah',
    'Hag.': 'Haggai', 'Zech.': 'Zechariah', 'Mal.': 'Malachi',
    'Matt.': 'Matthew', 'Mark': 'Mark', 'Luke': 'Luke', 'John': 'John',
    'Acts': 'Acts', 'Rom.': 'Romans', '1 Cor.': '1 Corinthians', '2 Cor.': '2 Corinthians',
    'Gal.': 'Galatians', 'Eph.': 'Ephesians', 'Philip.': 'Philippians', 'Col.': 'Colossians',
    '1 Thes.': '1 Thessalonians', '2 Thes.': '2 Thessalonians',
    '1 Tim.': '1 Timothy', '2 Tim.': '2 Timothy', 'Titus': 'Titus', 'Philem.': 'Philemon',
    'Heb.': 'Hebrews', 'James': 'James', '1 Pet.': '1 Peter', '2 Pet.': '2 Peter',
    '1 Jn.': '1 John', '2 Jn.': '2 John', '3 Jn.': '3 John', 'Jude': 'Jude', 'Rev.': 'Revelation',
    'D&C': 'D&C', 'Moses': 'Moses', 'Abr.': 'Abraham', 'JS\u2014H': 'JS-H', 'JS\u2014M': 'JS-M', 'A of F': 'A-of-F',
    '1 Ne.': '1 Nephi', '2 Ne.': '2 Nephi', 'Jacob': 'Jacob', 'Enos': 'Enos',
    'Jarom': 'Jarom', 'Omni': 'Omni', 'W of M': 'Words of Mormon',
    'Mosiah': 'Mosiah', 'Alma': 'Alma', 'Hel.': 'Helaman',
    '3 Ne.': '3 Nephi', '4 Ne.': '4 Nephi', 'Morm.': 'Mormon',
    'Ether': 'Ether', 'Moro.': 'Moroni'
  };

  // ── Map full English book name → prefix and Spanish name ──
  var _bookToPrefix = {};
  var _bookToSpanish = {};
  if (typeof BOOK_DATA !== 'undefined') {
    BOOK_DATA.forEach(function(b) {
      _bookToPrefix[b.nameEn] = b.prefix;
      _bookToSpanish[b.nameEn] = b.name;
    });
  }

  // Convert English reference to Spanish display (e.g., "Gen. 1:26" → "Génesis 1:26")
  function toSpanishRef(refText) {
    var norm = refText.replace(/\u00a0/g, ' ');
    for (var abbr in _abbrToFullBook) {
      if (norm.indexOf(abbr) === 0) {
        var fullEn = _abbrToFullBook[abbr];
        var spanishName = _bookToSpanish[fullEn];
        if (spanishName) {
          return spanishName + norm.substring(abbr.length);
        }
      }
    }
    return refText;
  }

  function parseScriptureRef(refText) {
    var norm = refText.replace(/\u00a0/g, ' ');
    for (var abbr in _abbrToFullBook) {
      if (norm.indexOf(abbr) === 0) {
        var rest = norm.substring(abbr.length).trim();
        var m = rest.match(/^(\d+):(\d+)/);
        if (m) {
          return _abbrToFullBook[abbr] + '|' + m[1] + '|' + m[2];
        }
      }
    }
    return null;
  }

  function getInternalVerseHtml(verseKey) {
    var verseDiv = document.querySelector('[data-verse-key="' + verseKey + '"]');
    if (!verseDiv) return '';
    var wordUnits = verseDiv.querySelectorAll('.word-unit');
    if (wordUnits.length === 0) return '';
    var html = '<div class="xref-ref-content">';
    wordUnits.forEach(function(wu) {
      var hwEl = wu.querySelector('.hw');
      var glEl = wu.querySelector('.gl');
      if (hwEl) {
        html += '<span class="xref-ref-word">';
        html += '<span class="hw">' + hwEl.textContent + '</span>';
        if (glEl) html += '<span class="en">' + glEl.textContent + '</span>';
        html += '</span>';
      }
    });
    html += '</div>';
    var glossArr = [];
    wordUnits.forEach(function(wu) {
      var glEl = wu.querySelector('.gl');
      if (glEl && glEl.textContent) glossArr.push(glEl.textContent);
    });
    if (glossArr.length > 0) {
      html += '<div class="xref-ref-english" style="font-style:italic;">' + glossArr.join(' ') + '</div>';
    }
    return html;
  }

  // ── Load cross-references ──
  function loadCrossRefs() {
    if (window._crossrefsLoaded) return;
    if (!window._volumeCrossrefsData) {
      console.warn('Cross-refs: No data found (window._volumeCrossrefsData not set)');
      return;
    }
    window._crossrefMap = window._volumeCrossrefsData;
    window._crossrefsLoaded = true;
    console.log('Cross-references loaded:', Object.keys(window._crossrefMap).length, 'verses');
    addCrossRefMarkers();
  }

  // ── Simple English stemmer for matching ──
  function simpleStem(w) {
    w = w.toLowerCase().replace(/[^a-z]/g, '');
    if (w.endsWith('ing')) w = w.slice(0, -3);
    else if (w.endsWith('ness')) w = w.slice(0, -4);
    else if (w.endsWith('tion')) w = w.slice(0, -4);
    else if (w.endsWith('ed') && w.length > 4) w = w.slice(0, -2);
    else if (w.endsWith('ly') && w.length > 4) w = w.slice(0, -2);
    else if (w.endsWith('er') && w.length > 4) w = w.slice(0, -2);
    else if (w.endsWith('es') && w.length > 4) w = w.slice(0, -2);
    else if (w.endsWith('s') && !w.endsWith('ss') && w.length > 3) w = w.slice(0, -1);
    return w;
  }

  // ── Add cross-reference markers to all rendered verses ──
  function addCrossRefMarkers() {
    if (!window._crossrefsLoaded) return;

    var allVerses = document.querySelectorAll('[data-verse-key]');
    allVerses.forEach(function(verseDiv) {
      var key = verseDiv.getAttribute('data-verse-key');
      var refs = window._crossrefMap[key];
      if (!refs || refs.length === 0) return;

      var wordFlow = verseDiv.querySelector('.word-flow');
      if (!wordFlow) return;
      var wordUnits = wordFlow.querySelectorAll('.word-unit');
      if (wordUnits.length === 0) return;

      // Skip if already processed
      if (wordFlow.getAttribute('data-xrefs-applied')) return;
      wordFlow.setAttribute('data-xrefs-applied', '1');

      // Build gloss list
      var glossList = [];
      for (var gi = 0; gi < wordUnits.length; gi++) {
        var glEl = wordUnits[gi].querySelector('.gl');
        glossList.push(glEl ? glEl.textContent.toLowerCase().replace(/-/g, ' ').trim() : '');
      }

      function attachMarker(wu, ref) {
        wu.classList.add('xref-linked');
        if (!wu.getAttribute('data-xref-ref')) {
          wu.setAttribute('data-xref-ref', JSON.stringify(ref));
          wu.setAttribute('data-xref-key', key);
          wu.addEventListener('click', (function(r, k) {
            return function(e) {
              e.stopPropagation();
              openXrefPanel(r, k);
            };
          })(ref, key));
        }
      }

      refs.forEach(function(ref) {
        var placed = false;
        if (!ref.text) return;
        var searchText = ref.text.toLowerCase().trim();
        var searchWords = searchText.split(/[\s-]+/);
        var searchStems = searchWords.map(simpleStem).filter(function(s) { return s.length >= 3; });

        // Strategy 1: Direct gloss match
        for (var i = 0; i < wordUnits.length; i++) {
          if (wordUnits[i].classList.contains('xref-linked')) continue;
          var gl = glossList[i];
          if (!gl || gl.length < 2) continue;
          if (gl === searchText || gl.indexOf(searchText) !== -1 || (gl.length >= 3 && searchText.indexOf(gl) !== -1)) {
            attachMarker(wordUnits[i], ref);
            placed = true;
            break;
          }
        }

        // Strategy 2: Stem matching
        if (!placed && searchStems.length > 0) {
          for (var i2 = 0; i2 < wordUnits.length; i2++) {
            if (wordUnits[i2].classList.contains('xref-linked')) continue;
            var gl2 = glossList[i2];
            if (!gl2 || gl2.length < 2) continue;
            var glossWords = gl2.split(/[\s-]+/);
            var glossStems = glossWords.map(simpleStem).filter(function(s) { return s.length >= 3; });
            var matchCount = 0;
            searchStems.forEach(function(ss) {
              glossStems.forEach(function(gs) {
                if (ss === gs || ss.indexOf(gs) === 0 || gs.indexOf(ss) === 0) matchCount++;
              });
            });
            if (matchCount > 0) {
              attachMarker(wordUnits[i2], ref);
              placed = true;
              break;
            }
          }
        }

        // Strategy 3: Position-based fallback
        if (!placed) {
          var idx = Math.min(Math.round(refs.indexOf(ref) / refs.length * wordUnits.length), wordUnits.length - 1);
          for (var off = 0; off <= 3; off++) {
            if (idx + off < wordUnits.length && !wordUnits[idx + off].classList.contains('xref-linked')) {
              attachMarker(wordUnits[idx + off], ref);
              placed = true;
              break;
            }
            if (idx - off >= 0 && !wordUnits[idx - off].classList.contains('xref-linked')) {
              attachMarker(wordUnits[idx - off], ref);
              placed = true;
              break;
            }
          }
        }
      });
    });

    setTimeout(addTalkRefMarkers, 200);
  }

  // ── Open cross-reference panel ──
  function openXrefPanel(ref, sourceVerseKey) {
    var panel = document.getElementById('xref-panel');
    if (!panel) return;

    // Show Spanish word from .hw element
    var spanishWord = '';
    var sourceVerse = document.querySelector('[data-verse-key="' + sourceVerseKey + '"]');
    if (sourceVerse) {
      var linkedWords = sourceVerse.querySelectorAll('.word-unit.xref-linked');
      linkedWords.forEach(function(wu) {
        var storedRef = wu.getAttribute('data-xref-ref');
        if (storedRef) {
          try {
            var parsed = JSON.parse(storedRef);
            if (parsed.text === ref.text && parsed.marker === ref.marker) {
              var hw = wu.querySelector('.hw');
              if (hw) spanishWord = hw.textContent.trim();
            }
          } catch(e) {}
        }
      });
    }
    panel.querySelector('.xref-panel-word').textContent = spanishWord || ref.text || '';

    // Spanish category labels
    var catLabel = ref.category === 'tg' ? 'Guía Temática' :
      ref.category === 'cross-ref' ? 'Referencias' :
      ref.category === 'gst' ? 'Guía de las Escrituras' :
      ref.category === 'heb' ? 'Hebreo/Griego' :
      ref.category === 'ie' ? 'Explicación' :
      ref.category === 'or' ? 'Otras Traducciones' :
      (ref.category || 'Referencias');
    panel.querySelector('.xref-panel-category').textContent = catLabel;

    var refsContainer = document.getElementById('xref-panel-refs');
    refsContainer.innerHTML = '';

    if (ref.refs && ref.refs.length > 0) {
      var lastBookPrefix = '';
      ref.refs.forEach(function(r) {
        var rNorm = r.replace(/\u00a0/g, ' ');

        var foundPrefix = '';
        for (var abbr in _abbrToFullBook) {
          if (rNorm.indexOf(abbr) === 0) { foundPrefix = abbr; break; }
        }
        var fullRef = rNorm;
        if (foundPrefix) {
          lastBookPrefix = foundPrefix;
        } else if (/^\d/.test(rNorm) && lastBookPrefix) {
          fullRef = lastBookPrefix + ' ' + rNorm;
        }

        var card = document.createElement('div');
        card.className = 'xref-ref-card';

        var titleDiv = document.createElement('div');
        titleDiv.className = 'xref-ref-title';

        var refKey = parseScriptureRef(fullRef);

        var tgMatch = fullRef.match(/^TG\s+(.+)/);
        var gsMatch = fullRef.match(/^GS\s+(.+)/);
        var bdMatch = fullRef.match(/^BD\s+(.+)/);

        if (tgMatch || gsMatch || bdMatch) {
          var topic = (tgMatch || gsMatch || bdMatch)[1].trim();
          var slug = topic.toLowerCase().replace(/[,;:'"]/g, '').replace(/\s+/g, '-');
          var section = tgMatch ? 'tg' : gsMatch ? 'gs' : 'bd';
          var url = 'https://www.churchofjesuschrist.org/study/scriptures/' + section + '/' + slug + '?lang=spa';

          var titleLink = document.createElement('a');
          titleLink.href = url;
          titleLink.target = '_blank';
          titleLink.rel = 'noopener';
          titleLink.style.cssText = 'color:var(--accent);text-decoration:none;font-weight:600;cursor:pointer;';
          titleLink.textContent = fullRef;
          titleDiv.appendChild(titleLink);

          var extIcon = document.createElement('span');
          extIcon.style.cssText = 'font-size:0.75em;color:var(--ink-light,#888);margin-left:6px;';
          extIcon.textContent = '\u2197';
          titleDiv.appendChild(extIcon);
        } else {
          var titleSpan = document.createElement('span');
          titleSpan.textContent = toSpanishRef(fullRef);
          if (refKey) {
            titleSpan.style.cursor = 'pointer';
            titleSpan.style.textDecoration = 'underline';
            titleSpan.onclick = (function(k, sv) {
              return function() {
                closeXrefPanel();
                saveReturnLocation(sv);
                navigateToVerseKey(k);
              };
            })(refKey, sourceVerseKey);
          }
          titleDiv.appendChild(titleSpan);

          if (refKey) {
            var gotoBtn = document.createElement('span');
            gotoBtn.className = 'xref-ref-goto';
            gotoBtn.textContent = 'Ir al versículo \u2192';
            gotoBtn.onclick = (function(k, sv) {
              return function() {
                closeXrefPanel();
                saveReturnLocation(sv);
                navigateToVerseKey(k);
              };
            })(refKey, sourceVerseKey);
            titleDiv.appendChild(gotoBtn);
          }
        }

        card.appendChild(titleDiv);

        if (refKey) {
          var intHtml = getInternalVerseHtml(refKey);
          if (intHtml) {
            var intDiv = document.createElement('div');
            intDiv.innerHTML = intHtml;
            card.appendChild(intDiv);
          }
        }

        refsContainer.appendChild(card);
      });
    } else {
      var noData = document.createElement('div');
      noData.className = 'xref-ref-nodata';
      noData.textContent = 'No hay referencias adicionales.';
      refsContainer.appendChild(noData);
    }

    panel.scrollTop = 0;
    panel.classList.add('open');
  }

  // ══════════════════════════════════════════════
  // ── RETURN NAVIGATION ──
  // ══════════════════════════════════════════════

  function getCurrentChapId() {
    return (typeof currentChapterId !== 'undefined') ? currentChapterId : null;
  }

  function getCurrentLabel() {
    var navLabel = document.getElementById('nav-label');
    if (navLabel && navLabel.textContent) {
      return navLabel.textContent.replace(/\s*\u25BE.*$/, '').trim();
    }
    return '';
  }

  function saveReturnLocation(verseKey) {
    _returnFromChapId = getCurrentChapId();
    _returnFromVerseKey = verseKey || null;
    _returnFromLabel = getCurrentLabel();
    if (_returnFromVerseKey) {
      var p = _returnFromVerseKey.split('|');
      var displayText = p.length >= 3 ? p[0] + ' ' + p[1] + ':' + p[2] : _returnFromLabel;
      showReturnBanner(displayText);
    } else if (_returnFromLabel) {
      showReturnBanner(_returnFromLabel);
    }
  }

  function showReturnBanner(label) {
    var banner = document.getElementById('return-banner');
    if (!banner) return;
    document.getElementById('return-verse').textContent = label || 'página anterior';
    banner.style.display = 'block';
  }

  function returnToPrevious() {
    stopActiveAudio();
    var banner = document.getElementById('return-banner');
    if (banner) banner.style.display = 'none';

    if (_returnFromChapId && typeof navTo === 'function') {
      navTo(_returnFromChapId);
      if (_returnFromVerseKey) {
        setTimeout(function() {
          var v = document.querySelector('[data-verse-key="' + _returnFromVerseKey + '"]');
          if (v) {
            v.scrollIntoView({ behavior: 'smooth', block: 'center' });
            v.style.transition = 'background 0.3s';
            v.style.background = 'rgba(200,168,78,0.2)';
            setTimeout(function() { v.style.background = ''; }, 2000);
          }
        }, 400);
      }
    }
    _returnFromChapId = null;
    _returnFromVerseKey = null;
    _returnFromLabel = null;
  }

  function dismissReturnBanner() {
    var banner = document.getElementById('return-banner');
    if (banner) banner.style.display = 'none';
    _returnFromChapId = null;
    _returnFromVerseKey = null;
    _returnFromLabel = null;
  }

  // ── Navigate to a verse key (single-page) ──
  function navigateToVerseKey(verseKey) {
    var parts = verseKey.split('|');
    if (parts.length < 3) return;

    var existing = document.querySelector('[data-verse-key="' + verseKey + '"]');
    if (existing) {
      existing.scrollIntoView({ behavior: 'smooth', block: 'center' });
      existing.style.transition = 'background 0.3s';
      existing.style.background = 'rgba(200,168,78,0.2)';
      setTimeout(function() { existing.style.background = ''; }, 2000);
      return;
    }

    var bookName = parts[0], chapter = parts[1];
    var prefix = _bookToPrefix[bookName];
    if (!prefix) return;
    var chapId = prefix + chapter;

    if (typeof navTo === 'function') {
      navTo(chapId);
      setTimeout(function() {
        var v = document.querySelector('[data-verse-key="' + verseKey + '"]');
        if (v) {
          v.scrollIntoView({ behavior: 'smooth', block: 'center' });
          v.style.transition = 'background 0.3s';
          v.style.background = 'rgba(200,168,78,0.2)';
          setTimeout(function() { v.style.background = ''; }, 2000);
        }
      }, 500);
    }
  }

  // ── Close panel ──
  function closeXrefPanel() {
    var panel = document.getElementById('xref-panel');
    if (panel) panel.classList.remove('open');
  }

  // ── Click outside to close ──
  document.addEventListener('click', function(e) {
    var panel = document.getElementById('xref-panel');
    if (panel && panel.classList.contains('open') && !panel.contains(e.target) && !e.target.classList.contains('xref-marker') && !e.target.classList.contains('talk-ref-badge')) {
      closeXrefPanel();
    }
  });

  // ══════════════════════════════════════════════════════════════
  // ── TALK REFERENCE MARKERS (President Oaks Conference Talks) ──
  // ══════════════════════════════════════════════════════════════

  function addTalkRefMarkers() {
    if (!window._oaksScriptureIndex) return;

    var allVerses = document.querySelectorAll('[data-verse-key]');
    allVerses.forEach(function(verseDiv) {
      if (verseDiv.getAttribute('data-talk-refs-applied')) return;

      var key = verseDiv.getAttribute('data-verse-key');
      var talkRefs = window._oaksScriptureIndex[key];
      if (!talkRefs || talkRefs.length === 0) return;

      verseDiv.setAttribute('data-talk-refs-applied', '1');

      var badge = document.createElement('span');
      badge.className = 'talk-ref-badge';
      badge.title = 'Citado en ' + talkRefs.length + ' discurso' + (talkRefs.length > 1 ? 's' : '') + ' del Presidente Oaks';
      badge.textContent = '\uD83C\uDF99\uFE0F';
      badge.onclick = function(e) {
        e.stopPropagation();
        openTalkRefPanel(key, talkRefs);
      };

      var verseNum = verseDiv.querySelector('.verse-num');
      if (verseNum) {
        verseNum.appendChild(badge);
      }
    });
  }

  // ── Stop any active audio ──
  function stopActiveAudio() {
    if (_activeAudio) {
      _activeAudio.pause();
      _activeAudio.currentTime = 0;
      _activeAudio = null;
    }
  }

  // ── Build audio player for a talk ──
  function buildAudioPlayer(talkId) {
    if (!window._oaksAudioUrls || !window._oaksAudioUrls[talkId]) return null;

    var urls = window._oaksAudioUrls[talkId];
    var hasSpa = !!urls.spa;
    var hasEng = !!urls.eng;
    if (!hasSpa && !hasEng) return null;

    var wrapper = document.createElement('div');
    wrapper.className = 'talk-audio-player';

    if (hasSpa && hasEng) {
      var tabs = document.createElement('div');
      tabs.className = 'talk-audio-lang-tabs';

      var spaTab = document.createElement('button');
      spaTab.textContent = 'Español';
      spaTab.className = 'active';

      var engTab = document.createElement('button');
      engTab.textContent = 'English';

      tabs.appendChild(spaTab);
      tabs.appendChild(engTab);
      wrapper.appendChild(tabs);

      var audio = document.createElement('audio');
      audio.controls = true;
      audio.preload = 'none';
      audio.src = urls.spa;
      wrapper.appendChild(audio);

      spaTab.onclick = function() {
        spaTab.className = 'active';
        engTab.className = '';
        audio.src = urls.spa;
        audio.load();
      };
      engTab.onclick = function() {
        engTab.className = 'active';
        spaTab.className = '';
        audio.src = urls.eng;
        audio.load();
      };

      audio.addEventListener('play', function() {
        if (_activeAudio && _activeAudio !== audio) {
          _activeAudio.pause();
        }
        _activeAudio = audio;
      });
    } else {
      var label = document.createElement('div');
      label.className = 'audio-label';
      label.textContent = hasSpa ? 'Escuchar en Español' : 'Listen in English';
      wrapper.appendChild(label);

      var audio2 = document.createElement('audio');
      audio2.controls = true;
      audio2.preload = 'none';
      audio2.src = hasSpa ? urls.spa : urls.eng;
      wrapper.appendChild(audio2);

      audio2.addEventListener('play', function() {
        if (_activeAudio && _activeAudio !== audio2) {
          _activeAudio.pause();
        }
        _activeAudio = audio2;
      });
    }

    return wrapper;
  }

  var _talkFontSize = 1.0;

  function openTalkRefPanel(verseKey, talkRefs) {
    var panel = document.getElementById('xref-panel');
    if (!panel) return;

    stopActiveAudio();

    var parts = verseKey.split('|');
    var displayRef = parts.length >= 3 ? parts[0] + ' ' + parts[1] + ':' + parts[2] : verseKey;

    panel.querySelector('.xref-panel-word').textContent = displayRef;
    panel.querySelector('.xref-panel-category').textContent =
      'Citado en ' + talkRefs.length + ' Discurso' + (talkRefs.length > 1 ? 's' : '') + ' de Conferencia';

    var refsContainer = document.getElementById('xref-panel-refs');
    refsContainer.innerHTML = '';

    talkRefs.forEach(function(t) {
      var card = document.createElement('div');
      card.className = 'xref-ref-card';
      card.style.cursor = 'pointer';

      var titleDiv = document.createElement('div');
      titleDiv.className = 'xref-ref-title';
      titleDiv.style.flexDirection = 'column';
      titleDiv.style.alignItems = 'flex-start';
      titleDiv.innerHTML = '<div><span style="color:var(--accent);">\uD83C\uDF99\uFE0F</span> ' +
        '<span style="font-weight:600;">' + (t.title || 'Sin título') + '</span></div>' +
        '<span style="font-size:0.8em;color:var(--ink-light,#888);">' + (t.conference || '') + '</span>';
      card.appendChild(titleDiv);

      if (t.snippet) {
        var snippetDiv = document.createElement('div');
        snippetDiv.className = 'xref-ref-english';
        snippetDiv.style.fontStyle = 'italic';
        snippetDiv.textContent = t.snippet;
        card.appendChild(snippetDiv);
      }

      card.onclick = (function(talkRef) {
        return function(e) {
          e.stopPropagation();
          openFullTalkView(talkRef.talkId, verseKey, talkRefs);
        };
      })(t);

      refsContainer.appendChild(card);
    });

    panel.scrollTop = 0;
    panel.classList.add('open');
  }

  // ── Full talk view ──
  function openFullTalkView(talkId, verseKey, talkRefs) {
    var talk = null;
    if (window._oaksTalksData) {
      for (var i = 0; i < window._oaksTalksData.length; i++) {
        if (window._oaksTalksData[i].id === talkId) {
          talk = window._oaksTalksData[i];
          break;
        }
      }
    }
    if (!talk) return;

    stopActiveAudio();

    var panel = document.getElementById('xref-panel');
    panel.querySelector('.xref-panel-word').textContent = talk.title || 'Sin título';
    panel.querySelector('.xref-panel-category').textContent = 'Presidente Oaks \u2014 ' + (talk.conference || '');

    var refsContainer = document.getElementById('xref-panel-refs');
    refsContainer.innerHTML = '';

    var fullView = document.createElement('div');
    fullView.className = 'talk-full-view';

    var backBtn = document.createElement('button');
    backBtn.className = 'talk-back-btn';
    backBtn.textContent = '\u276E Volver a la lista';
    backBtn.onclick = function(e) {
      e.stopPropagation();
      stopActiveAudio();
      openTalkRefPanel(verseKey, talkRefs);
    };
    fullView.appendChild(backBtn);

    var audioPlayer = buildAudioPlayer(talkId);
    if (audioPlayer) {
      fullView.appendChild(audioPlayer);
    }

    var header = document.createElement('div');
    header.className = 'talk-full-header';
    var headerTitle = document.createElement('h4');
    headerTitle.textContent = talk.conference || '';
    header.appendChild(headerTitle);

    var fontControls = document.createElement('div');
    fontControls.className = 'talk-font-controls';

    var minusBtn = document.createElement('button');
    minusBtn.textContent = 'A\u2212';
    minusBtn.title = 'Texto más pequeño';

    var plusBtn = document.createElement('button');
    plusBtn.textContent = 'A+';
    plusBtn.title = 'Texto más grande';

    fontControls.appendChild(minusBtn);
    fontControls.appendChild(plusBtn);
    header.appendChild(fontControls);
    fullView.appendChild(header);

    var parasDiv = document.createElement('div');
    parasDiv.className = 'talk-paragraphs';
    parasDiv.style.fontSize = _talkFontSize + 'em';

    if (talk.paragraphs && talk.paragraphs.length > 0) {
      talk.paragraphs.forEach(function(para) {
        var p = document.createElement('p');
        p.textContent = para.text;
        parasDiv.appendChild(p);
      });
    }

    fullView.appendChild(parasDiv);

    minusBtn.onclick = function(e) {
      e.stopPropagation();
      _talkFontSize = Math.max(0.7, _talkFontSize - 0.1);
      parasDiv.style.fontSize = _talkFontSize.toFixed(1) + 'em';
    };
    plusBtn.onclick = function(e) {
      e.stopPropagation();
      _talkFontSize = Math.min(1.8, _talkFontSize + 0.1);
      parasDiv.style.fontSize = _talkFontSize.toFixed(1) + 'em';
    };

    if (talk.uri) {
      var linkDiv = document.createElement('div');
      linkDiv.style.cssText = 'padding:12px 0;font-size:0.85em;display:flex;flex-direction:column;gap:6px;border-top:1px solid var(--rule-light);margin-top:12px;';

      var spaLink = document.createElement('a');
      spaLink.href = 'https://www.churchofjesuschrist.org' + talk.uri + '?lang=spa';
      spaLink.target = '_blank';
      spaLink.rel = 'noopener';
      spaLink.style.cssText = 'color:var(--accent);text-decoration:none;font-weight:600;';
      spaLink.textContent = '\uD83D\uDCD6 Leer en Español \u2192';
      linkDiv.appendChild(spaLink);

      var engLink = document.createElement('a');
      engLink.href = 'https://www.churchofjesuschrist.org' + talk.uri + '?lang=eng';
      engLink.target = '_blank';
      engLink.rel = 'noopener';
      engLink.style.cssText = 'color:var(--ink-light,#888);text-decoration:none;';
      engLink.textContent = '\uD83C\uDF10 Read in English \u2192';
      linkDiv.appendChild(engLink);

      fullView.appendChild(linkDiv);
    }

    refsContainer.appendChild(fullView);
    panel.scrollTop = 0;
  }

  // ── Expose globally ──
  window.loadCrossRefs = loadCrossRefs;
  window.addCrossRefMarkers = addCrossRefMarkers;
  window.openXrefPanel = openXrefPanel;
  window.closeXrefPanel = closeXrefPanel;
  window.navigateToVerseKey = navigateToVerseKey;
  window.addTalkRefMarkers = addTalkRefMarkers;
  window.openTalkRefPanel = openTalkRefPanel;
  window.dismissReturnBanner = dismissReturnBanner;
  window.returnToPrevious = returnToPrevious;

  // ── Auto-load after delay ──
  setTimeout(loadCrossRefs, 500);

})();
