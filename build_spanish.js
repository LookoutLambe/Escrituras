/**
 * build_spanish.js
 * Fetches Spanish scripture text from the Church API and generates
 * verse JS files for the Spanish Interlinear app.
 *
 * Usage: node build_spanish.js [--test] [--resume]
 *   --test   Only fetch Genesis 1 to verify parsing
 *   --resume Skip already-fetched chapters (uses _progress.json)
 */
const fs = require('fs');
const path = require('path');

const VERSES_DIR = path.join(__dirname, 'verses');
const PROGRESS_FILE = path.join(__dirname, '_progress.json');
const ENG_VERSES_FILE = path.join(__dirname, 'english_verses.js');

const API_BASE = 'https://www.churchofjesuschrist.org/study/api/v3/language-pages/type/content';
const DELAY_MS = 300;

// ============================================================
// BOOK DEFINITIONS
// ============================================================
const BOOKS = [
  // OLD TESTAMENT
  { gridId: 'genesis', prefix: 'gen-ch', nameEn: 'Genesis', nameSpa: 'Génesis', slug: 'gen', vol: 'ot', count: 50 },
  { gridId: 'exodus', prefix: 'exo-ch', nameEn: 'Exodus', nameSpa: 'Éxodo', slug: 'ex', vol: 'ot', count: 40 },
  { gridId: 'leviticus', prefix: 'lev-ch', nameEn: 'Leviticus', nameSpa: 'Levítico', slug: 'lev', vol: 'ot', count: 27 },
  { gridId: 'numbers', prefix: 'num-ch', nameEn: 'Numbers', nameSpa: 'Números', slug: 'num', vol: 'ot', count: 36 },
  { gridId: 'deuteronomy', prefix: 'deu-ch', nameEn: 'Deuteronomy', nameSpa: 'Deuteronomio', slug: 'deut', vol: 'ot', count: 34 },
  { gridId: 'joshua', prefix: 'jos-ch', nameEn: 'Joshua', nameSpa: 'Josué', slug: 'josh', vol: 'ot', count: 24 },
  { gridId: 'judges', prefix: 'jdg-ch', nameEn: 'Judges', nameSpa: 'Jueces', slug: 'judg', vol: 'ot', count: 21 },
  { gridId: 'ruth', prefix: 'rut-ch', nameEn: 'Ruth', nameSpa: 'Rut', slug: 'ruth', vol: 'ot', count: 4 },
  { gridId: '1samuel', prefix: '1sa-ch', nameEn: '1 Samuel', nameSpa: '1 Samuel', slug: '1-sam', vol: 'ot', count: 31 },
  { gridId: '2samuel', prefix: '2sa-ch', nameEn: '2 Samuel', nameSpa: '2 Samuel', slug: '2-sam', vol: 'ot', count: 24 },
  { gridId: '1kings', prefix: '1ki-ch', nameEn: '1 Kings', nameSpa: '1 Reyes', slug: '1-kgs', vol: 'ot', count: 22 },
  { gridId: '2kings', prefix: '2ki-ch', nameEn: '2 Kings', nameSpa: '2 Reyes', slug: '2-kgs', vol: 'ot', count: 25 },
  { gridId: '1chronicles', prefix: '1ch-ch', nameEn: '1 Chronicles', nameSpa: '1 Crónicas', slug: '1-chr', vol: 'ot', count: 29 },
  { gridId: '2chronicles', prefix: '2ch-ch', nameEn: '2 Chronicles', nameSpa: '2 Crónicas', slug: '2-chr', vol: 'ot', count: 36 },
  { gridId: 'ezra', prefix: 'ezr-ch', nameEn: 'Ezra', nameSpa: 'Esdras', slug: 'ezra', vol: 'ot', count: 10 },
  { gridId: 'nehemiah', prefix: 'neh-ch', nameEn: 'Nehemiah', nameSpa: 'Nehemías', slug: 'neh', vol: 'ot', count: 13 },
  { gridId: 'esther', prefix: 'est-ch', nameEn: 'Esther', nameSpa: 'Ester', slug: 'esth', vol: 'ot', count: 10 },
  { gridId: 'job', prefix: 'job-ch', nameEn: 'Job', nameSpa: 'Job', slug: 'job', vol: 'ot', count: 42 },
  { gridId: 'psalms', prefix: 'psa-ch', nameEn: 'Psalms', nameSpa: 'Salmos', slug: 'ps', vol: 'ot', count: 150 },
  { gridId: 'proverbs', prefix: 'pro-ch', nameEn: 'Proverbs', nameSpa: 'Proverbios', slug: 'prov', vol: 'ot', count: 31 },
  { gridId: 'ecclesiastes', prefix: 'ecc-ch', nameEn: 'Ecclesiastes', nameSpa: 'Eclesiastés', slug: 'eccl', vol: 'ot', count: 12 },
  { gridId: 'songofsolomon', prefix: 'sng-ch', nameEn: 'Song of Solomon', nameSpa: 'Cantares', slug: 'song', vol: 'ot', count: 8 },
  { gridId: 'isaiah', prefix: 'isa-ch', nameEn: 'Isaiah', nameSpa: 'Isaías', slug: 'isa', vol: 'ot', count: 66 },
  { gridId: 'jeremiah', prefix: 'jer-ch', nameEn: 'Jeremiah', nameSpa: 'Jeremías', slug: 'jer', vol: 'ot', count: 52 },
  { gridId: 'lamentations', prefix: 'lam-ch', nameEn: 'Lamentations', nameSpa: 'Lamentaciones', slug: 'lam', vol: 'ot', count: 5 },
  { gridId: 'ezekiel', prefix: 'ezk-ch', nameEn: 'Ezekiel', nameSpa: 'Ezequiel', slug: 'ezek', vol: 'ot', count: 48 },
  { gridId: 'daniel', prefix: 'dan-ch', nameEn: 'Daniel', nameSpa: 'Daniel', slug: 'dan', vol: 'ot', count: 12 },
  { gridId: 'hosea', prefix: 'hos-ch', nameEn: 'Hosea', nameSpa: 'Oseas', slug: 'hosea', vol: 'ot', count: 14 },
  { gridId: 'joel', prefix: 'jol-ch', nameEn: 'Joel', nameSpa: 'Joel', slug: 'joel', vol: 'ot', count: 3 },
  { gridId: 'amos', prefix: 'amo-ch', nameEn: 'Amos', nameSpa: 'Amós', slug: 'amos', vol: 'ot', count: 9 },
  { gridId: 'obadiah', prefix: 'oba-ch', nameEn: 'Obadiah', nameSpa: 'Abdías', slug: 'obad', vol: 'ot', count: 1 },
  { gridId: 'jonah', prefix: 'jon-ch', nameEn: 'Jonah', nameSpa: 'Jonás', slug: 'jonah', vol: 'ot', count: 4 },
  { gridId: 'micah', prefix: 'mic-ch', nameEn: 'Micah', nameSpa: 'Miqueas', slug: 'micah', vol: 'ot', count: 7 },
  { gridId: 'nahum', prefix: 'nah-ch', nameEn: 'Nahum', nameSpa: 'Nahúm', slug: 'nahum', vol: 'ot', count: 3 },
  { gridId: 'habakkuk', prefix: 'hab-ch', nameEn: 'Habakkuk', nameSpa: 'Habacuc', slug: 'hab', vol: 'ot', count: 3 },
  { gridId: 'zephaniah', prefix: 'zep-ch', nameEn: 'Zephaniah', nameSpa: 'Sofonías', slug: 'zeph', vol: 'ot', count: 3 },
  { gridId: 'haggai', prefix: 'hag-ch', nameEn: 'Haggai', nameSpa: 'Hageo', slug: 'hag', vol: 'ot', count: 2 },
  { gridId: 'zechariah', prefix: 'zec-ch', nameEn: 'Zechariah', nameSpa: 'Zacarías', slug: 'zech', vol: 'ot', count: 14 },
  { gridId: 'malachi', prefix: 'mal-ch', nameEn: 'Malachi', nameSpa: 'Malaquías', slug: 'mal', vol: 'ot', count: 4 },
  // NEW TESTAMENT
  { gridId: 'matthew', prefix: 'mat-ch', nameEn: 'Matthew', nameSpa: 'Mateo', slug: 'matt', vol: 'nt', count: 28 },
  { gridId: 'mark', prefix: 'mrk-ch', nameEn: 'Mark', nameSpa: 'Marcos', slug: 'mark', vol: 'nt', count: 16 },
  { gridId: 'luke', prefix: 'luk-ch', nameEn: 'Luke', nameSpa: 'Lucas', slug: 'luke', vol: 'nt', count: 24 },
  { gridId: 'john', prefix: 'jhn-ch', nameEn: 'John', nameSpa: 'Juan', slug: 'john', vol: 'nt', count: 21 },
  { gridId: 'acts', prefix: 'act-ch', nameEn: 'Acts', nameSpa: 'Hechos', slug: 'acts', vol: 'nt', count: 28 },
  { gridId: 'romans', prefix: 'rom-ch', nameEn: 'Romans', nameSpa: 'Romanos', slug: 'rom', vol: 'nt', count: 16 },
  { gridId: '1corinthians', prefix: '1co-ch', nameEn: '1 Corinthians', nameSpa: '1 Corintios', slug: '1-cor', vol: 'nt', count: 16 },
  { gridId: '2corinthians', prefix: '2co-ch', nameEn: '2 Corinthians', nameSpa: '2 Corintios', slug: '2-cor', vol: 'nt', count: 13 },
  { gridId: 'galatians', prefix: 'gal-ch', nameEn: 'Galatians', nameSpa: 'Gálatas', slug: 'gal', vol: 'nt', count: 6 },
  { gridId: 'ephesians', prefix: 'eph-ch', nameEn: 'Ephesians', nameSpa: 'Efesios', slug: 'eph', vol: 'nt', count: 6 },
  { gridId: 'philippians', prefix: 'php-ch', nameEn: 'Philippians', nameSpa: 'Filipenses', slug: 'philip', vol: 'nt', count: 4 },
  { gridId: 'colossians', prefix: 'col-ch', nameEn: 'Colossians', nameSpa: 'Colosenses', slug: 'col', vol: 'nt', count: 4 },
  { gridId: '1thessalonians', prefix: '1th-ch', nameEn: '1 Thessalonians', nameSpa: '1 Tesalonicenses', slug: '1-thes', vol: 'nt', count: 5 },
  { gridId: '2thessalonians', prefix: '2th-ch', nameEn: '2 Thessalonians', nameSpa: '2 Tesalonicenses', slug: '2-thes', vol: 'nt', count: 3 },
  { gridId: '1timothy', prefix: '1ti-ch', nameEn: '1 Timothy', nameSpa: '1 Timoteo', slug: '1-tim', vol: 'nt', count: 6 },
  { gridId: '2timothy', prefix: '2ti-ch', nameEn: '2 Timothy', nameSpa: '2 Timoteo', slug: '2-tim', vol: 'nt', count: 4 },
  { gridId: 'titus', prefix: 'tit-ch', nameEn: 'Titus', nameSpa: 'Tito', slug: 'titus', vol: 'nt', count: 3 },
  { gridId: 'philemon', prefix: 'phm-ch', nameEn: 'Philemon', nameSpa: 'Filemón', slug: 'philem', vol: 'nt', count: 1 },
  { gridId: 'hebrews', prefix: 'heb-ch', nameEn: 'Hebrews', nameSpa: 'Hebreos', slug: 'heb', vol: 'nt', count: 13 },
  { gridId: 'james', prefix: 'jas-ch', nameEn: 'James', nameSpa: 'Santiago', slug: 'james', vol: 'nt', count: 5 },
  { gridId: '1peter', prefix: '1pe-ch', nameEn: '1 Peter', nameSpa: '1 Pedro', slug: '1-pet', vol: 'nt', count: 5 },
  { gridId: '2peter', prefix: '2pe-ch', nameEn: '2 Peter', nameSpa: '2 Pedro', slug: '2-pet', vol: 'nt', count: 3 },
  { gridId: '1john', prefix: '1jn-ch', nameEn: '1 John', nameSpa: '1 Juan', slug: '1-jn', vol: 'nt', count: 5 },
  { gridId: '2john', prefix: '2jn-ch', nameEn: '2 John', nameSpa: '2 Juan', slug: '2-jn', vol: 'nt', count: 1 },
  { gridId: '3john', prefix: '3jn-ch', nameEn: '3 John', nameSpa: '3 Juan', slug: '3-jn', vol: 'nt', count: 1 },
  { gridId: 'jude', prefix: 'jud-ch', nameEn: 'Jude', nameSpa: 'Judas', slug: 'jude', vol: 'nt', count: 1 },
  { gridId: 'revelation', prefix: 'rev-ch', nameEn: 'Revelation', nameSpa: 'Apocalipsis', slug: 'rev', vol: 'nt', count: 22 },
  // BOOK OF MORMON
  { gridId: '1nephi', prefix: 'ch', nameEn: '1 Nephi', nameSpa: '1 Nefi', slug: '1-ne', vol: 'bofm', count: 22 },
  { gridId: '2nephi', prefix: '2n-ch', nameEn: '2 Nephi', nameSpa: '2 Nefi', slug: '2-ne', vol: 'bofm', count: 33 },
  { gridId: 'jacob', prefix: 'jc-ch', nameEn: 'Jacob', nameSpa: 'Jacob', slug: 'jacob', vol: 'bofm', count: 7 },
  { gridId: 'enos', prefix: 'en-ch', nameEn: 'Enos', nameSpa: 'Enós', slug: 'enos', vol: 'bofm', count: 1 },
  { gridId: 'jarom', prefix: 'jr-ch', nameEn: 'Jarom', nameSpa: 'Jarom', slug: 'jarom', vol: 'bofm', count: 1 },
  { gridId: 'omni', prefix: 'om-ch', nameEn: 'Omni', nameSpa: 'Omni', slug: 'omni', vol: 'bofm', count: 1 },
  { gridId: 'wom', prefix: 'wm-ch', nameEn: 'Words of Mormon', nameSpa: 'Palabras de Mormón', slug: 'w-of-m', vol: 'bofm', count: 1 },
  { gridId: 'mosiah', prefix: 'mo-ch', nameEn: 'Mosiah', nameSpa: 'Mosíah', slug: 'mosiah', vol: 'bofm', count: 29 },
  { gridId: 'alma', prefix: 'al-ch', nameEn: 'Alma', nameSpa: 'Alma', slug: 'alma', vol: 'bofm', count: 63 },
  { gridId: 'helaman', prefix: 'he-ch', nameEn: 'Helaman', nameSpa: 'Helamán', slug: 'hel', vol: 'bofm', count: 16 },
  { gridId: '3nephi', prefix: '3n-ch', nameEn: '3 Nephi', nameSpa: '3 Nefi', slug: '3-ne', vol: 'bofm', count: 30 },
  { gridId: '4nephi', prefix: '4n-ch', nameEn: '4 Nephi', nameSpa: '4 Nefi', slug: '4-ne', vol: 'bofm', count: 1 },
  { gridId: 'mormon', prefix: 'mm-ch', nameEn: 'Mormon', nameSpa: 'Mormón', slug: 'morm', vol: 'bofm', count: 9 },
  { gridId: 'ether', prefix: 'et-ch', nameEn: 'Ether', nameSpa: 'Éter', slug: 'ether', vol: 'bofm', count: 15 },
  { gridId: 'moroni', prefix: 'mr-ch', nameEn: 'Moroni', nameSpa: 'Moroni', slug: 'moro', vol: 'bofm', count: 10 },
  // DOCTRINE & COVENANTS
  { gridId: 'dc', prefix: 'dc-sec', nameEn: 'D&C', nameSpa: 'DyC', slug: 'dc', vol: 'dc-testament', count: 138 },
  // PEARL OF GREAT PRICE
  { gridId: 'moses', prefix: 'ms-ch', nameEn: 'Moses', nameSpa: 'Moisés', slug: 'moses', vol: 'pgp', count: 8 },
  { gridId: 'abraham', prefix: 'ab-ch', nameEn: 'Abraham', nameSpa: 'Abraham', slug: 'abr', vol: 'pgp', count: 5 },
  { gridId: 'jsmatthew', prefix: 'jm-ch', nameEn: 'JS-Matthew', nameSpa: 'JS—Mateo', slug: 'js-m', vol: 'pgp', count: 1 },
  { gridId: 'jshistory', prefix: 'jh-ch', nameEn: 'JS-History', nameSpa: 'JS—Historia', slug: 'js-h', vol: 'pgp', count: 1 },
  { gridId: 'aof', prefix: 'af-ch', nameEn: 'Articles of Faith', nameSpa: 'Artículos de Fe', slug: 'a-of-f', vol: 'pgp', count: 1 },
];

// ============================================================
// LOAD ENGLISH VERSES
// ============================================================
function loadEnglishVerses() {
  console.log('Loading English verses...');
  const window = {};
  eval(fs.readFileSync(ENG_VERSES_FILE, 'utf-8'));
  console.log('  Loaded', Object.keys(window._englishVersesData).length, 'English verses');
  return window._englishVersesData;
}

// ============================================================
// HTML PARSING
// ============================================================
function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, '')        // remove all HTML tags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
    .replace(/\s+/g, ' ')           // normalize whitespace
    .trim();
}

function parseChapterHtml(html) {
  const verses = [];
  // Match each <p class="verse" ...>...</p>
  const verseRegex = /<p[^>]*class="[^"]*verse[^"]*"[^>]*>([\s\S]*?)<\/p>/gi;
  let match;
  while ((match = verseRegex.exec(html)) !== null) {
    const inner = match[1];
    // Extract verse number
    const numMatch = inner.match(/<span[^>]*class="[^"]*verse-number[^"]*"[^>]*>(\d+)\s*<\/span>/i);
    if (!numMatch) continue;
    const num = parseInt(numMatch[1]);
    // Remove verse number span, then strip all HTML
    let text = inner.replace(/<span[^>]*class="[^"]*verse-number[^"]*"[^>]*>[\s\S]*?<\/span>/i, '');
    text = stripHtml(text);
    if (text) {
      verses.push({ num, text });
    }
  }
  return verses;
}

// ============================================================
// DICTIONARY-BASED WORD GLOSSING (like Hebrew interlinear)
// ============================================================

// Normalize a word: lowercase, strip punctuation for dictionary lookup
function normalizeWord(w) {
  return w.toLowerCase().replace(/[.,;:!?¿¡"""''()—–\-]/g, '').trim();
}

// Get trailing punctuation from a word
function getTrailingPunct(w) {
  const m = w.match(/([.,;:!?"""'')\-—–]+)$/);
  return m ? m[1] : '';
}

// Build a Spanish→English dictionary from the parallel verse corpus using PMI
function buildDictionary(progress, engData) {
  console.log('Building Spanish-English word dictionary from parallel corpus...');

  // Count co-occurrences and frequencies
  const cooccur = {};   // spa_norm → { eng_norm → count }
  const spaCount = {};  // spa_norm → total verse count
  const engCount = {};  // eng_norm → total verse count
  let totalVerses = 0;

  const BOOKS = global._BOOKS_REF; // set by caller

  for (const book of BOOKS) {
    for (let ch = 1; ch <= book.count; ch++) {
      const key = `${book.gridId}:${ch}`;
      const verses = progress[key];
      if (!verses) continue;

      for (const verse of verses) {
        const engKey = `${book.nameEn}|${ch}|${verse.num}`;
        const engText = engData[engKey];
        if (!engText) continue;

        totalVerses++;
        const spaWords = new Set(verse.text.split(/\s+/).map(normalizeWord).filter(Boolean));
        const engWords = new Set(engText.split(/\s+/).map(normalizeWord).filter(Boolean));

        for (const sw of spaWords) {
          spaCount[sw] = (spaCount[sw] || 0) + 1;
          if (!cooccur[sw]) cooccur[sw] = {};
          for (const ew of engWords) {
            cooccur[sw][ew] = (cooccur[sw][ew] || 0) + 1;
          }
        }
        for (const ew of engWords) {
          engCount[ew] = (engCount[ew] || 0) + 1;
        }
      }
    }
  }

  console.log(`  Analyzed ${totalVerses} verse pairs, ${Object.keys(spaCount).length} Spanish words, ${Object.keys(engCount).length} English words`);

  // Compute best English gloss for each Spanish word using PMI
  const dictionary = {};
  for (const sw of Object.keys(cooccur)) {
    const pSpa = spaCount[sw] / totalVerses;
    let bestEng = '';
    let bestPMI = -Infinity;

    for (const [ew, count] of Object.entries(cooccur[sw])) {
      const pEng = engCount[ew] / totalVerses;
      const pJoint = count / totalVerses;
      const pmi = Math.log2(pJoint / (pSpa * pEng));

      // Require minimum co-occurrence (higher threshold avoids rare-word noise)
      if (count < 8) continue;
      // Skip very rare English words (likely proper nouns or noise)
      if (engCount[ew] < 5) continue;

      if (pmi > bestPMI) {
        bestPMI = pmi;
        bestEng = ew;
      }
    }
    if (bestEng) {
      dictionary[sw] = bestEng;
    }
  }

  // Override with known high-confidence mappings
  const overrides = {
    'yo': 'I', 'mi': 'my', 'mis': 'my', 'me': 'me', 'mí': 'me',
    'tú': 'thou', 'tu': 'thy', 'tus': 'thy', 'te': 'thee', 'ti': 'thee',
    'él': 'he', 'ella': 'she', 'ellos': 'they', 'ellas': 'they',
    'nosotros': 'we', 'nos': 'us', 'nuestro': 'our', 'nuestra': 'our', 'nuestros': 'our',
    'su': 'his/her', 'sus': 'his/her',
    'y': 'and', 'o': 'or', 'ni': 'nor', 'pero': 'but', 'sino': 'but',
    'de': 'of', 'del': 'of the', 'al': 'to the',
    'en': 'in', 'a': 'to', 'con': 'with', 'por': 'by/for', 'para': 'for',
    'sin': 'without', 'sobre': 'upon', 'entre': 'among', 'hasta': 'until',
    'desde': 'from', 'hacia': 'toward', 'según': 'according to',
    'el': 'the', 'la': 'the', 'los': 'the', 'las': 'the',
    'un': 'a', 'una': 'a', 'unos': 'some', 'unas': 'some',
    'es': 'is', 'son': 'are', 'era': 'was', 'eran': 'were', 'fue': 'was',
    'ser': 'be', 'será': 'shall be', 'serán': 'shall be', 'sido': 'been',
    'está': 'is', 'están': 'are', 'estaba': 'was', 'estaban': 'were',
    'ha': 'has', 'han': 'have', 'había': 'had', 'he': 'I have', 'has': 'thou hast',
    'hay': 'there is', 'hubo': 'there was',
    'no': 'not', 'sí': 'yea', 'también': 'also', 'así': 'thus',
    'como': 'as', 'más': 'more', 'muy': 'very', 'ya': 'already',
    'que': 'that', 'quien': 'who', 'donde': 'where', 'cuando': 'when',
    'porque': 'because', 'pues': 'for', 'si': 'if', 'aunque': 'although',
    'este': 'this', 'esta': 'this', 'estos': 'these', 'estas': 'these',
    'ese': 'that', 'esa': 'that', 'esos': 'those', 'esas': 'those',
    'aquel': 'that', 'aquella': 'that', 'aquellos': 'those',
    'todo': 'all', 'toda': 'all', 'todos': 'all', 'todas': 'all',
    'otro': 'other', 'otra': 'other', 'otros': 'others', 'otras': 'others',
    'cada': 'each', 'mismo': 'same', 'misma': 'same',
    'dios': 'God', 'señor': 'Lord', 'jesús': 'Jesus', 'cristo': 'Christ',
    'jesucristo': 'Jesus Christ', 'espíritu': 'Spirit',
    'tierra': 'earth', 'cielo': 'heaven', 'cielos': 'heavens',
    'pueblo': 'people', 'hombre': 'man', 'hombres': 'men',
    'mujer': 'woman', 'mujeres': 'women',
    'hijo': 'son', 'hija': 'daughter', 'hijos': 'children', 'hijas': 'daughters',
    'padre': 'father', 'madre': 'mother', 'padres': 'parents',
    'hermano': 'brother', 'hermanos': 'brethren',
    'casa': 'house', 'templo': 'temple', 'ciudad': 'city',
    'rey': 'king', 'reina': 'queen',
    'día': 'day', 'días': 'days', 'noche': 'night',
    'agua': 'water', 'aguas': 'waters',
    'mano': 'hand', 'manos': 'hands',
    'palabra': 'word', 'palabras': 'words',
    'corazón': 'heart', 'alma': 'soul',
    'vida': 'life', 'muerte': 'death',
    'hizo': 'made/did', 'hacer': 'make/do',
    'dijo': 'said', 'decir': 'say', 'habló': 'spoke', 'hablar': 'speak',
    'vio': 'saw', 'ver': 'see',
    'dieron': 'gave', 'dio': 'gave', 'dar': 'give',
    'vino': 'came', 'venir': 'come', 'ir': 'go', 'fue': 'went',
    'tiene': 'has', 'tener': 'have', 'tenía': 'had',
    'cosa': 'thing', 'cosas': 'things',
    'tiempo': 'time', 'vez': 'time',
    'grande': 'great', 'grandes': 'great',
    'bueno': 'good', 'buena': 'good', 'buenos': 'good', 'buenas': 'good',
    'malo': 'evil', 'mala': 'evil',
    'santo': 'holy', 'santa': 'holy', 'santos': 'saints',
    'nací': 'born', 'nacer': 'be born',
    'escribo': 'I write', 'escribir': 'write', 'escribió': 'wrote',
    'recibí': 'received', 'recibir': 'receive',
    'conocido': 'known', 'conocer': 'know', 'conocimiento': 'knowledge',
    'sucedió': 'came to pass', 'aconteció': 'came to pass',
    'he aquí': 'behold', 'aquí': 'here',
    'allí': 'there', 'ahora': 'now', 'entonces': 'then',
    'nunca': 'never', 'siempre': 'always', 'jamás': 'never',
    'tanto': 'so much', 'muchos': 'many', 'muchas': 'many',
    'poco': 'little', 'pocos': 'few',
    'bien': 'well', 'mal': 'evil',
    'poder': 'power', 'gloria': 'glory', 'gracia': 'grace',
    'fe': 'faith', 'esperanza': 'hope', 'caridad': 'charity',
    'ley': 'law', 'mandamiento': 'commandment', 'mandamientos': 'commandments',
    'pecado': 'sin', 'pecados': 'sins',
    'arrepentimiento': 'repentance', 'bautismo': 'baptism',
    'oración': 'prayer', 'orar': 'pray',
    'bendición': 'blessing', 'bendiciones': 'blessings',
    'guerra': 'war', 'paz': 'peace',
    'verdad': 'truth', 'verdadera': 'true', 'verdadero': 'true',
    'principio': 'beginning', 'fin': 'end',
    'luz': 'light', 'tinieblas': 'darkness',
    'creó': 'created', 'crear': 'create',
    'llamó': 'called', 'llamar': 'call',
    'separó': 'divided', 'separar': 'divide/separate',

    // Common words PMI gets wrong
    'alguna': 'some', 'alguno': 'some', 'algunos': 'some', 'algunas': 'some',
    'ciencia': 'learning', 'hago': 'I do/make', 'se': '[refl.]',
    'compone': 'consists', 'siendo': 'being', 'propia': 'own', 'propio': 'own',
    'propias': 'own', 'propios': 'own',
    'obstante': 'withstanding', 'logrado': 'obtained', 'lograr': 'obtain',
    'arreglo': 'accordance', 'conocimientos': 'knowledge',
    'relación': 'account', 'idioma': 'language', 'lenguaje': 'language',
    'sé': 'I know', 'verdadera': 'true', 'verdadero': 'true',
    'mano': 'hand', 'manos': 'hands',

    // Verbs - common conjugations
    'doy': 'I give', 'cuenta': 'account', 'completa': 'full',
    'daré': 'I shall give', 'haré': 'I shall make',
    'hará': 'shall make', 'harán': 'shall make',
    'iba': 'went', 'fue': 'was/went', 'fueron': 'were/went',
    'oró': 'prayed', 'apareció': 'appeared', 'descendió': 'descended',
    'descendieron': 'descended', 'volvió': 'returned',
    'salió': 'departed', 'llegó': 'arrived', 'llegaron': 'arrived',
    'tomó': 'took', 'tomar': 'take', 'tomaron': 'took',
    'puso': 'put/placed', 'poner': 'put/place',
    'oyó': 'heard', 'oír': 'hear', 'oyeron': 'heard',
    'murió': 'died', 'morir': 'die', 'murieron': 'died',
    'vivió': 'lived', 'vivir': 'live',
    'mandó': 'commanded', 'mandar': 'command',
    'envió': 'sent', 'enviar': 'send', 'enviaron': 'sent',
    'comió': 'ate', 'comer': 'eat',
    'puso': 'placed', 'sacó': 'brought out',
    'cayó': 'fell', 'caer': 'fall', 'cayeron': 'fell',
    'subió': 'went up', 'subir': 'go up',
    'bajó': 'went down', 'bajar': 'go down',
    'abrió': 'opened', 'abrir': 'open',
    'cerró': 'closed', 'cerrar': 'close',
    'llenó': 'filled', 'llenar': 'fill', 'lleno': 'full',
    'pasó': 'passed', 'pasar': 'pass',
    'quedó': 'remained', 'quedar': 'remain',
    'dejó': 'left', 'dejar': 'leave',
    'llevó': 'carried', 'llevar': 'carry',
    'echó': 'cast', 'echar': 'cast',
    'encontró': 'found', 'encontrar': 'find',
    'buscó': 'sought', 'buscar': 'seek',
    'respondió': 'answered', 'responder': 'answer',
    'preguntó': 'asked', 'preguntar': 'ask',
    'juró': 'swore', 'jurar': 'swear',
    'reinó': 'reigned', 'reinar': 'reign',
    'destruyó': 'destroyed', 'destruir': 'destroy',
    'construyó': 'built', 'construir': 'build',
    'edificó': 'built', 'edificar': 'build',
    'enseñó': 'taught', 'enseñar': 'teach',
    'predicó': 'preached', 'predicar': 'preach',
    'creyó': 'believed', 'creer': 'believe', 'creyeron': 'believed',
    'amó': 'loved', 'amar': 'love',
    'odió': 'hated', 'odiar': 'hate',
    'temió': 'feared', 'temer': 'fear',
    'obedeció': 'obeyed', 'obedecer': 'obey',
    'pecó': 'sinned', 'pecar': 'sin',
    'salvó': 'saved', 'salvar': 'save',
    'juzgó': 'judged', 'juzgar': 'judge',
    'comenzó': 'began', 'comenzar': 'begin',
    'empezó': 'began', 'empezar': 'begin',
    'acabó': 'finished', 'acabar': 'finish',
    'terminó': 'ended', 'terminar': 'end',
    'leyó': 'read', 'leer': 'read', 'leído': 'read',
    'cantó': 'sang', 'cantar': 'sing',
    'gritó': 'cried', 'gritar': 'cry out',
    'clamó': 'cried', 'clamar': 'cry',
    'partió': 'departed', 'partir': 'depart',
    'siguió': 'followed', 'seguir': 'follow', 'siguieron': 'followed',
    'sirvió': 'served', 'servir': 'serve',
    'conoció': 'knew', 'conocer': 'know',
    'supo': 'knew', 'saber': 'know',
    'pudo': 'could', 'poder': 'power/can',
    'quiso': 'wanted', 'querer': 'want',
    'debía': 'ought', 'deber': 'ought',
    'volvió': 'returned', 'volver': 'return',
    'trajo': 'brought', 'traer': 'bring', 'trajeron': 'brought',
    'peleó': 'fought', 'pelear': 'fight',
    'luchó': 'fought', 'luchar': 'fight',
    'nació': 'was born', 'nacer': 'be born',
    'sembró': 'sowed', 'sembrar': 'sow',
    'cosechó': 'reaped', 'cosechar': 'reap',
    'plantó': 'planted', 'plantar': 'plant',
    'cortó': 'cut', 'cortar': 'cut',
    'mató': 'slew', 'matar': 'slay', 'mataron': 'slew',
    'hirió': 'smote', 'herir': 'smite',

    // Adjectives and adverbs
    'nuevo': 'new', 'nueva': 'new', 'nuevos': 'new', 'nuevas': 'new',
    'viejo': 'old', 'vieja': 'old', 'viejos': 'old',
    'antiguo': 'ancient', 'antigua': 'ancient',
    'primero': 'first', 'primera': 'first',
    'segundo': 'second', 'segunda': 'second',
    'último': 'last', 'última': 'last',
    'pequeño': 'small', 'pequeña': 'small', 'pequeños': 'small',
    'justo': 'just/righteous', 'justa': 'just', 'justos': 'righteous',
    'inicuo': 'wicked', 'inicuos': 'wicked',
    'fuerte': 'strong', 'fuertes': 'strong',
    'débil': 'weak', 'débiles': 'weak',
    'largo': 'long', 'larga': 'long',
    'alto': 'high', 'alta': 'high', 'altos': 'high',
    'profundo': 'deep', 'profunda': 'deep',
    'lleno': 'full', 'llena': 'full',
    'solo': 'alone', 'sola': 'alone',
    'cierto': 'certain', 'cierta': 'certain',
    'mucho': 'much', 'mucha': 'much',
    'ningún': 'no', 'ninguno': 'none', 'ninguna': 'none',

    // Nouns - common scriptural
    'nombre': 'name', 'nombres': 'names',
    'camino': 'way', 'caminos': 'ways',
    'tierra': 'land/earth', 'tierras': 'lands',
    'monte': 'mount', 'montes': 'mountains', 'montaña': 'mountain',
    'mar': 'sea', 'mares': 'seas',
    'río': 'river', 'ríos': 'rivers',
    'fuego': 'fire', 'sangre': 'blood',
    'pan': 'bread', 'vino': 'wine',
    'carne': 'flesh', 'hueso': 'bone', 'huesos': 'bones',
    'ojo': 'eye', 'ojos': 'eyes',
    'oído': 'ear', 'oídos': 'ears',
    'boca': 'mouth', 'lengua': 'tongue', 'lenguas': 'tongues',
    'cabeza': 'head', 'rostro': 'face', 'pie': 'foot', 'pies': 'feet',
    'voz': 'voice', 'voces': 'voices',
    'ángel': 'angel', 'ángeles': 'angels',
    'profeta': 'prophet', 'profetas': 'prophets',
    'sacerdote': 'priest', 'sacerdotes': 'priests',
    'siervo': 'servant', 'siervos': 'servants',
    'ejército': 'army', 'ejércitos': 'armies',
    'espada': 'sword', 'espadas': 'swords',
    'pacto': 'covenant', 'pactos': 'covenants',
    'promesa': 'promise', 'promesas': 'promises',
    'testimonio': 'testimony', 'testigo': 'witness', 'testigos': 'witnesses',
    'juicio': 'judgment', 'juicios': 'judgments',
    'justicia': 'justice/righteousness', 'misericordia': 'mercy',
    'iniquidad': 'iniquity', 'iniquidades': 'iniquities',
    'abominación': 'abomination', 'abominaciones': 'abominations',
    'maldad': 'wickedness', 'maldades': 'wickedness',
    'salvación': 'salvation', 'redención': 'redemption',
    'resurrección': 'resurrection', 'expiación': 'atonement',
    'convenio': 'covenant', 'ordenanza': 'ordinance', 'ordenanzas': 'ordinances',
    'sacerdocio': 'priesthood',
    'evangelio': 'gospel', 'doctrina': 'doctrine',
    'escritura': 'scripture', 'escrituras': 'scriptures',
    'revelación': 'revelation', 'visión': 'vision', 'visiones': 'visions',
    'sueño': 'dream', 'sueños': 'dreams',
    'señal': 'sign', 'señales': 'signs',
    'milagro': 'miracle', 'milagros': 'miracles',
    'obra': 'work', 'obras': 'works',
    'fruto': 'fruit', 'frutos': 'fruits',
    'semilla': 'seed', 'árbol': 'tree', 'árboles': 'trees',
    'piedra': 'stone', 'piedras': 'stones',
    'oro': 'gold', 'plata': 'silver', 'hierro': 'iron',
    'planchas': 'plates', 'anales': 'record',
    'desierto': 'wilderness', 'tienda': 'tent', 'tiendas': 'tents',

    // Prepositions, conjunctions, particles
    'ante': 'before', 'tras': 'after', 'después': 'after',
    'antes': 'before', 'mientras': 'while', 'durante': 'during',
    'contra': 'against', 'según': 'according to',
    'mediante': 'through', 'acerca': 'about',
    'además': 'moreover', 'aún': 'yet/still', 'aun': 'even',
    'solamente': 'only', 'apenas': 'scarcely',
    'ciertamente': 'surely', 'verdaderamente': 'truly',
    'especialmente': 'especially', 'particularmente': 'particularly',
    'primeramente': 'firstly', 'finalmente': 'finally',
    'nuevamente': 'again', 'juntamente': 'together',
    'altamente': 'highly', 'extremadamente': 'exceedingly',
    'abundantemente': 'abundantly', 'diligentemente': 'diligently',
    'humildemente': 'humbly', 'fielmente': 'faithfully',

    // More verb forms
    'habiendo': 'having', 'siendo': 'being', 'teniendo': 'having',
    'diciendo': 'saying', 'haciendo': 'doing/making',
    'viniendo': 'coming', 'yendo': 'going',
    'viendo': 'seeing', 'oyendo': 'hearing',
    'dando': 'giving', 'tomando': 'taking',
    'llevando': 'carrying', 'trayendo': 'bringing',
    'saliendo': 'departing', 'entrando': 'entering',
    'hablando': 'speaking', 'orando': 'praying',
    'luchando': 'fighting', 'peleando': 'fighting',

    // Common phrases / function words
    'tal': 'such', 'tales': 'such',
    'cuyo': 'whose', 'cuya': 'whose', 'cuyos': 'whose',
    'cual': 'which', 'cuales': 'which',
    'le': 'him/her', 'les': 'them', 'lo': 'it/him', 'la': 'the',
    'nos': 'us', 'os': 'you',
    'nada': 'nothing', 'nadie': 'no one', 'algo': 'something', 'alguien': 'someone',
    'qué': 'what', 'quién': 'who', 'cuál': 'which',
    'cómo': 'how', 'dónde': 'where', 'cuándo': 'when', 'cuánto': 'how much',
    'acaso': 'perhaps', 'quizá': 'perhaps', 'quizás': 'perhaps',
    'todavía': 'still/yet', 'aún': 'still/yet',
    'luego': 'then', 'después': 'after/afterward',
    'pronto': 'soon', 'tarde': 'late',
    'cerca': 'near', 'lejos': 'far', 'fuera': 'outside', 'dentro': 'within',
    'arriba': 'above', 'abajo': 'below', 'encima': 'upon', 'debajo': 'beneath',
    'delante': 'before', 'detrás': 'behind',
    'junto': 'together', 'juntos': 'together',
    'parte': 'part', 'partes': 'parts',
    'lado': 'side', 'medio': 'midst',
    'manera': 'manner', 'forma': 'form',
    'pesar': 'sorrow', 'gozo': 'joy',
    'compendio': 'abridgment',
    'historia': 'record', 'hechos': 'proceedings',
    'lecho': 'bed', 'roca': 'rock',
    'pilar': 'pillar', 'resplandor': 'luster',
    'brillo': 'brightness', 'faz': 'face',
    'libro': 'book', 'libros': 'books',
    'planchas': 'plates',
    'exclamaciones': 'exclamations',
    'provisiones': 'provisions',
    'herencia': 'inheritance',
    'objetos': 'things', 'preciosos': 'precious',
    'salvo': 'save/except',
    'consigo': 'with him',
    'dominado': 'overcome',
    'arrebatado': 'carried away',
    'sentado': 'sitting', 'rodeado': 'surrounded',
    'innumerables': 'numberless', 'concursos': 'concourses',
    'actitud': 'attitude',
    'cantando': 'singing', 'alabando': 'praising',
    'trono': 'throne',
    'mediodía': 'noonday',
    'firmamento': 'firmament', 'estrellas': 'stars',
    'estremeció': 'quake', 'tembló': 'tremble',

    // PMI garbage fixes - common words getting wrong glosses
    'habían': 'had', 'gran': 'great', 'digo': 'I say', 'dos': 'two',
    'soy': 'I am', 'habéis': 'you have', 'conforme': 'according to',
    'cuanto': 'as much as', 'esto': 'this', 'uno': 'one',
    'vosotros': 'you', 'vuestro': 'your', 'vuestros': 'your', 'vuestra': 'your', 'vuestras': 'your',
    'israel': 'Israel', 'david': 'David', 'judá': 'Judah',
    'ofrenda': 'offering', 'dijeron': 'said',
    'ira': 'wrath', 'tres': 'three', 'hemos': 'we have',
    'mío': 'mine', 'míos': 'mine',
    'corazones': 'hearts', 'motivo': 'reason',
    'tienen': 'have', 'habrá': 'there shall be',
    'reyes': 'kings', 'gente': 'people',
    'dos': 'two', 'diez': 'ten', 'cinco': 'five', 'seis': 'six',
    'siete': 'seven', 'ocho': 'eight', 'nueve': 'nine',
    'veinte': 'twenty', 'treinta': 'thirty', 'cuarenta': 'forty',
    'cincuenta': 'fifty', 'sesenta': 'sixty', 'setenta': 'seventy',
    'ciento': 'hundred', 'mil': 'thousand',
    'muertos': 'dead', 'sol': 'sun',
    'eso': 'that', 'cualquiera': 'whosoever',
    'harás': 'thou shalt make', 'serás': 'thou shalt be',
    'seréis': 'you shall be', 'seáis': 'you may be',
    'seré': 'I shall be', 'estará': 'shall be',
    'sois': 'you are', 'somos': 'we are', 'estoy': 'I am',
    'tengo': 'I have', 'tenemos': 'we have', 'tenéis': 'you have',
    'tenían': 'had', 'tendrá': 'shall have',
    'dará': 'shall give', 'dirá': 'shall say',
    'puede': 'can', 'pueden': 'cannot',
    'debe': 'must', 'debemos': 'we must',
    'dice': 'says', 'decían': 'said',
    'viene': 'comes', 'vendrá': 'shall come', 'venga': 'let come',
    'habla': 'speaks', 'hablado': 'spoken',
    'hace': 'does/makes', 'hacen': 'do/make', 'haga': 'let do',
    'sabe': 'knows', 'sabéis': 'you know', 'sabios': 'wise',
    'oye': 'hears', 'da': 'gives', 'vive': 'lives',
    'mira': 'look', 'ven': 'come/see', 've': 'sees',
    'va': 'goes', 'guarda': 'keeps', 'llama': 'calls/flame',
    'hice': 'I did', 'tuvo': 'had', 'pude': 'I could',
    'estando': 'being', 'hayan': 'may have',
    'fuese': 'might be', 'habría': 'would have',
    'hubieron': 'had', 'hubiera': 'had',
    'pusieron': 'placed', 'hicieron': 'did/made',
    'salieron': 'went out', 'vinieron': 'came',
    'volvieron': 'returned', 'llevaron': 'carried',
    'empezaron': 'began', 'cayeron': 'fell',
    'tomaron': 'took', 'vieron': 'saw',
    'llamaba': 'was called', 'hallaba': 'was found',
    'hallaban': 'were found', 'hallado': 'found',
    'di': 'give/I gave', 'dije': 'I said', 'vi': 'I saw',
    'jacob': 'Jacob', 'josé': 'Joseph', 'abraham': 'Abraham',
    'isaac': 'Isaac', 'moisés': 'Moses', 'saúl': 'Saul',
    'babilonia': 'Babylon', 'egipto': 'Egypt',
    'ocurrió': 'came to pass',
    'embargo': 'nevertheless',
    'jefes': 'chiefs', 'jefe': 'chief',
    'valle': 'valley', 'campo': 'field', 'campos': 'fields',
    'campamento': 'camp', 'grano': 'grain',
    'veces': 'times', 'años': 'years', 'año': 'year', 'mes': 'month',
    'bronce': 'brass', 'madera': 'wood',
    'carros': 'chariots', 'bienes': 'goods',
    'entrada': 'entrance', 'puerta': 'gate', 'puertas': 'gates',
    'muro': 'wall',
    'incienso': 'incense', 'holocausto': 'burnt offering',
    'ofrendas': 'offerings', 'sacrificio': 'sacrifice', 'sacrificios': 'sacrifices',
    'estatutos': 'statutes',
    'demás': 'rest/others', 'contados': 'numbered',
    'clase': 'class/kind', 'grado': 'degree',
    'sumo': 'high', 'bendito': 'blessed',
    'levántate': 'arise',
    'principales': 'chief', 'príncipes': 'princes',
    'derecha': 'right', 'brazo': 'arm',
    'nube': 'cloud', 'polvo': 'dust', 'viento': 'wind',
    'cautiverio': 'captivity', 'cautivos': 'captives',
    'ídolos': 'idols', 'santuario': 'sanctuary',
    'moradores': 'inhabitants', 'habitantes': 'inhabitants',
    'preparado': 'prepared', 'nuevas': 'new',
    'tiempos': 'times', 'fuerzas': 'forces',
    'niño': 'child', 'niños': 'children',
    'joven': 'young man', 'jóvenes': 'young men',
    'esposa': 'wife', 'esposas': 'wives', 'marido': 'husband',
    'quisiera': 'would like', 'cuantos': 'as many as',
    'pondré': 'I shall put', 'toma': 'take',
    'aflicción': 'affliction', 'maldición': 'curse',
    'rectitud': 'righteousness', 'extremo': 'end',
    'eterna': 'eternal', 'eterno': 'eternal',
    'séptimo': 'seventh', 'tercero': 'third', 'cuarto': 'fourth',
    'quinto': 'fifth', 'sexto': 'sixth', 'octavo': 'eighth',
    'noveno': 'ninth', 'décimo': 'tenth',
    'asimismo': 'likewise', 'acontecerá': 'shall come to pass',
    'furor': 'fury', 'semejante': 'like',
    'sed': 'thirst/be', 'haz': 'do',
    'norte': 'north', 'sur': 'south', 'oriente': 'east',
    'allá': 'thither',
    'riquezas': 'riches', 'abundancia': 'abundance',
    'salir': 'go out', 'adelante': 'forward/henceforth',
    'gobierno': 'government', 'autoridad': 'authority',
    'libertad': 'liberty', 'derecho': 'right',
    'generación': 'generation', 'generaciones': 'generations',
    'país': 'country', 'nación': 'nation', 'naciones': 'nations',
    'pueblos': 'peoples', 'multitud': 'multitude',
    'descendencia': 'seed/posterity', 'posteridad': 'posterity',
    'primogénito': 'firstborn',
    'heredad': 'heritage', 'herencia': 'inheritance',
    'posesión': 'possession',
    'lomos': 'loins', 'labios': 'lips',
    'rebaños': 'flocks', 'animales': 'animals',
    'ramas': 'branches', 'viña': 'vineyard',
    'consejo': 'counsel', 'entendimiento': 'understanding',
    'sabiduría': 'wisdom', 'deseo': 'desire',
    'gracias': 'thanks', 'voluntad': 'will',
    'venida': 'coming', 'estado': 'state',
    'pasado': 'past', 'batalla': 'battle',
    'armas': 'weapons', 'límite': 'border',
    'trabajo': 'work/labor', 'servicio': 'service',
    'asunto': 'matter', 'algún': 'some',
    'smith': 'Smith', 'levitas': 'Levites',
    'respondiendo': 'answering',
    'pobre': 'poor', 'pobres': 'poor',
    'concerniente': 'concerning',
    'tampoco': 'neither', 'conmigo': 'with me', 'contigo': 'with thee',
    'mismos': 'selves', 'misma': 'same',
    'estar': 'be', 'haber': 'have',
    'bajo': 'under', 'encima': 'upon',
    'causa': 'cause/sake',
    'tan': 'so', 'acuerdo': 'agreement',
    'ciudades': 'cities', 'aldeas': 'villages',
    'resto': 'remnant', 'tribus': 'tribes', 'tribu': 'tribe',
    'vestidos': 'garments', 'aceite': 'oil',
    'vista': 'sight', 'presencia': 'presence',
    'amado': 'beloved',

    // Proper nouns — always capitalized
    'nefi': 'Nephi', 'lehi': 'Lehi', 'lamán': 'Laman', 'lemuel': 'Lemuel',
    'sam': 'Sam', 'ismael': 'Ishmael', 'labán': 'Laban', 'zoram': 'Zoram',
    'sedequías': 'Zedekiah', 'jerusalén': 'Jerusalem', 'mesías': 'Messiah',
    'aarón': 'Aaron', 'josué': 'Joshua', 'isaías': 'Isaiah',
    'jeremías': 'Jeremiah', 'ezequías': 'Hezekiah', 'noé': 'Noah',
    'adán': 'Adam', 'eva': 'Eve', 'satanás': 'Satan',
    'pedro': 'Peter', 'pablo': 'Paul', 'juan': 'John',
    'salomón': 'Solomon', 'elías': 'Elijah',
    'faraón': 'Pharaoh', 'sion': 'Zion', 'moroni': 'Moroni',
    'zarahemla': 'Zarahemla', 'ammón': 'Ammon',

    // Words wrong in 1 Nephi 1 and similar contexts
    'tanto': 'therefore', // "por tanto" = therefore
    'cuán': 'how', 'cuan': 'how',
    'todopoderoso': 'Almighty',
    'eleva': 'rises', 'alturas': 'heights',
    'extienden': 'extend', 'extender': 'extend',
    'dejarás': 'shalt-suffer', 'perecer': 'perish',
    'acudan': 'come', 'acudir': 'come',
    'expresaba': 'expressed', 'expresar': 'express',
    'alabanzas': 'praises', 'alabanza': 'praise',
    'regocijaba': 'rejoiced', 'regocijarse': 'rejoice', 'regocijo': 'rejoicing',
    'henchido': 'filled',
    'serían': 'should-be',
    'sería': 'should-be',
    'perecerían': 'should-perish',
    'llevados': 'carried',
    'acaeció': 'came-to-pass',
    'prorrumpió': 'exclaimed',
    'maravillosas': 'marvelous', 'maravilloso': 'marvelous', 'maravillosa': 'marvelous',
    'misericordias': 'mercies', 'misericordioso': 'merciful',
    'tiernas': 'tender', 'tierno': 'tender',
    'antigüedad': 'old',
    'irritaron': 'were-angered', 'irritar': 'anger',
    'procuraron': 'sought', 'procurar': 'seek',
    'poderosos': 'mighty', 'poderoso': 'mighty',
    'mostraré': 'I-shall-show', 'mostrar': 'show', 'mostrado': 'shown',
    'burlaron': 'mocked', 'burlar': 'mock',
    'manifestaban': 'manifested', 'manifestar': 'manifest',
    'claramente': 'plainly',
    'arrepintiera': 'repent', 'arrepentirse': 'repent',
    'testificó': 'testified', 'testificar': 'testify',
    'profetizando': 'prophesying', 'profetizar': 'prophesy',
    'profetizó': 'prophesied',
    'reinado': 'reign', 'reinar': 'reign',
    'morado': 'dwelt', 'morar': 'dwell',
    'excedía': 'exceeded', 'exceder': 'exceed',
    'seguían': 'followed', 'seguir': 'follow',
    'avanzaron': 'went-forth', 'avanzar': 'go-forth',
    'descendía': 'descending', 'descender': 'descend',
    'compendiado': 'abridged', 'compendiar': 'abridge',
    'escribiré': 'I-shall-write',
    'supieseis': 'ye-should-know',
    'tantas': 'so-many', 'tantos': 'so-many',
    'respecto': 'respect/concerning',
    'declararles': 'declare-unto-them', 'declarar': 'declare',
    'escogido': 'chosen', 'escoger': 'choose',
    'librarse': 'deliverance',
    'leía': 'read', 'leyera': 'might-read',
    'quitarle': 'take-away-his',
    'apedreado': 'stoned', 'apedrear': 'stone',

    // More PMI fixes
    'oh': 'oh', 'modo': 'manner/way',
    'lamanitas': 'Lamanites', 'nefitas': 'Nephites',
    'codos': 'cubits',
    'ammón': 'Ammon',
    'cualquier': 'any', 'tenga': 'may have',
    'galaad': 'Gilead',
    'quedará': 'shall remain', 'ello': 'it',
    'deben': 'must', 'pueden': 'can',
    'hayan': 'may have', 'hubieran': 'had',
    'recibido': 'received', 'cumplir': 'fulfill',
    'quienes': 'who', 'cuales': 'which',
    'ruego': 'I pray/beseech',
    'eres': 'thou art', 'sois': 'ye are',
    'dar': 'give', 'ir': 'go', 'venir': 'come',
    'ver': 'see', 'oír': 'hear', 'saber': 'know',
    'pasar': 'pass', 'salir': 'go forth',
    'llevar': 'carry', 'tomar': 'take',
    'estar': 'be', 'haber': 'have',
    'recibir': 'receive', 'destruir': 'destroy',
    'beber': 'drink', 'comer': 'eat',
    'entrar': 'enter', 'volver': 'return',

    // Genesis / creation vocabulary
    'haya': 'let there be', 'mañana': 'morning', 'tarde': 'evening',
    'desordenada': 'without form', 'vacía': 'void',
    'abismo': 'deep', 'movía': 'moved',
    'especie': 'kind', 'especies': 'kinds',
    'produjo': 'brought forth', 'produzca': 'let bring forth',
    'separe': 'let separate', 'júntense': 'let be gathered',
    'descúbrase': 'let appear', 'aparezca': 'let appear',
    'reunión': 'gathering', 'seco': 'dry',
    'hierba': 'herb', 'verde': 'green',
    'semilla': 'seed', 'dé': 'yield', 'da': 'gives',
    'naturaleza': 'nature',
    'lumbrera': 'light', 'lumbreras': 'lights',
    'mayor': 'greater', 'menor': 'lesser',
    'estación': 'season', 'estaciones': 'seasons',
    'aves': 'fowl', 'ave': 'fowl',
    'pez': 'fish', 'peces': 'fish',
    'bestia': 'beast', 'bestias': 'beasts',
    'ganado': 'cattle', 'reptil': 'creeping thing',
    'imagen': 'image', 'semejanza': 'likeness',
    'varón': 'male', 'hembra': 'female',
    'bendijo': 'blessed', 'bendecir': 'bless',
    'fructificad': 'be fruitful', 'multiplicad': 'multiply',
    'llenad': 'fill', 'sojuzgadla': 'subdue it',
    'señoread': 'have dominion',
    'reposó': 'rested', 'reposo': 'rest', 'reposar': 'rest',
    'santificó': 'sanctified', 'santificar': 'sanctify',
    'costilla': 'rib', 'huerto': 'garden',
    'serpiente': 'serpent', 'serpientes': 'serpents',
    'arca': 'ark', 'diluvio': 'flood',
    'arco': 'bow', 'iris': 'rainbow',
    'torre': 'tower', 'confundió': 'confounded',
    'lugar': 'place', 'lugares': 'places',
    'e': 'and',
    'esté': 'be', 'estén': 'be',

    // More common verbs/words the PMI mangles
    'haya': 'let there be', 'sean': 'let be',
    'tengan': 'let have', 'sea': 'let be/be',
    'fueron': 'were', 'fuera': 'outside/were',
    'iban': 'went', 'venían': 'came',
    'podía': 'could', 'podían': 'could',
    'debían': 'should', 'debió': 'should',
    'quería': 'wanted', 'querían': 'wanted',
    'sabía': 'knew', 'sabían': 'knew',
    'veía': 'saw', 'veían': 'saw',
    'decía': 'said', 'decían': 'said',
    'hacía': 'did/made', 'hacían': 'did/made',
    'daba': 'gave', 'daban': 'gave',
    'ponía': 'placed', 'ponían': 'placed',
    'salía': 'went out', 'salían': 'went out',
    'entraba': 'entered', 'entraban': 'entered',
    'entró': 'entered', 'entrar': 'enter',
    'quedaron': 'remained', 'quedarse': 'remain',
    'enviado': 'sent', 'llamado': 'called',
    'dado': 'given', 'puesto': 'placed',
    'dicho': 'said', 'hecho': 'done/made',
    'vuelto': 'returned', 'ido': 'gone',
    'traído': 'brought', 'venido': 'come',
    'salido': 'gone out', 'entrado': 'entered',
    'nacido': 'born', 'muerto': 'dead',
    'escrito': 'written', 'visto': 'seen',
    'oído': 'heard', 'hallado': 'found',
    'tomado': 'taken', 'llevado': 'carried',
    'dejado': 'left', 'perdido': 'lost',
    'ganado': 'cattle/gained', 'comido': 'eaten',
    'bebido': 'drunk', 'dormido': 'slept',
    'caído': 'fallen', 'subido': 'gone up',
    'bajado': 'gone down', 'abierto': 'opened',
    'cerrado': 'closed', 'roto': 'broken',
    'cubierto': 'covered', 'vestido': 'clothed',
  };

  for (const [k, v] of Object.entries(overrides)) {
    dictionary[k] = v;
  }

  // Hyphenate all multi-word glosses (matches Hebrew interlinear style)
  for (const k of Object.keys(dictionary)) {
    dictionary[k] = dictionary[k].replace(/ /g, '-');
  }

  console.log(`  Dictionary: ${Object.keys(dictionary).length} entries`);
  return dictionary;
}

// ============================================================
// MORPHOLOGICAL FALLBACK GLOSSER
// ============================================================
// When the dictionary has no entry, attempt to decompose the
// Spanish word morphologically and produce a hyphenated gloss.

function morphGloss(word, dictionary) {
  const w = word.toLowerCase();

  // Helper: look up a word, trying the word itself and common accent variations
  function lookup(w) {
    if (dictionary[w]) return dictionary[w];
    // Try adding/removing common accents
    const accent = { 'a':'á', 'e':'é', 'i':'í', 'o':'ó', 'u':'ú',
                     'á':'a', 'é':'e', 'í':'i', 'ó':'o', 'ú':'u' };
    // Try last vowel accent toggle
    for (let i = w.length - 1; i >= 0; i--) {
      if (accent[w[i]]) {
        const alt = w.slice(0, i) + accent[w[i]] + w.slice(i + 1);
        if (dictionary[alt]) return dictionary[alt];
      }
    }
    return '';
  }

  // Direct lookup first
  const direct = lookup(w);
  if (direct) return direct;

  // 1. Enclitic pronouns: -se/-le/-lo/-la/-nos/-les/-los/-las/-me/-te/-nos attached to verbs
  const cliticRe = /^(.+?)(sele|selo|sela|seles|selos|selas|melo|mela|telo|tela|se|le|lo|la|nos|les|los|las|me|te)$/;
  const cliticMatch = w.match(cliticRe);
  if (cliticMatch) {
    const stem = cliticMatch[1];
    const pron = cliticMatch[2];
    const pronMap = { se:'[refl.]', le:'him', lo:'it', la:'her', nos:'us', les:'them', los:'them', las:'them', me:'me', te:'thee',
                      sele:'[refl.]-him', selo:'[refl.]-it', sela:'[refl.]-her', seles:'[refl.]-them', selos:'[refl.]-them', selas:'[refl.]-them',
                      melo:'me-it', mela:'me-her', telo:'thee-it', tela:'thee-her' };
    const pronGloss = pronMap[pron] || pron;
    // Try stem as-is, then with accent restoration (mandó -> mando+le)
    const stemGloss = lookup(stem);
    if (stemGloss) return stemGloss + '-' + pronGloss;
    // Try infinitive forms: declarar+les -> stem=declarar
    if (stem.endsWith('ar') || stem.endsWith('er') || stem.endsWith('ir')) {
      const infGloss = lookup(stem);
      if (infGloss) return infGloss + '-' + pronGloss;
    }
    // Try gerund: predicándo+le -> predicando
    const gerundGloss = morphGloss(stem, dictionary);
    if (gerundGloss) return gerundGloss + '-' + pronGloss;
  }

  // 2. Gerund: -ando / -iendo / -endo → V-ing
  if (w.endsWith('ando') && w.length > 5) {
    const stem = w.slice(0, -4);
    const inf = lookup(stem + 'ar');
    if (inf) return inf.replace(/^to-/, '') + 'ing';
  }
  if ((w.endsWith('iendo') || w.endsWith('endo')) && w.length > 5) {
    const stem = w.endsWith('iendo') ? w.slice(0, -5) : w.slice(0, -4);
    for (const suf of ['er', 'ir', 'cer', 'cir', 'eer']) {
      const inf = lookup(stem + suf);
      if (inf) return inf.replace(/^to-/, '') + 'ing';
    }
    // stem change: diciendo (decir), viniendo (venir), etc.
    // Try the -iendo form directly in dict
  }

  // 3. Past participle: -ado / -ido
  if (w.endsWith('ado') && w.length > 4) {
    const stem = w.slice(0, -3);
    const inf = lookup(stem + 'ar');
    if (inf) return inf.replace(/^to-/, '') + 'ed';
  }
  if (w.endsWith('ido') && w.length > 4) {
    const stem = w.slice(0, -3);
    for (const suf of ['er', 'ir', 'cer', 'cir']) {
      const inf = lookup(stem + suf);
      if (inf) return inf.replace(/^to-/, '') + 'ed';
    }
  }

  // 4. Verb conjugation patterns — try to find the infinitive and gloss accordingly
  // Preterite -ar verbs: -é, -aste, -ó, -amos, -aron
  // Preterite -er/-ir: -í, -iste, -ió, -imos, -ieron
  // Imperfect -ar: -aba, -abas, -aban, -ábamos
  // Imperfect -er/-ir: -ía, -ías, -ían, -íamos
  // Future: -ré, -rás, -rá, -remos, -rán (all conjugations)
  // Conditional: -ría, -rías, -ríamos, -rían
  // Present subjunctive -ar: -e, -es, -en, -emos
  // Present subjunctive -er/-ir: -a, -as, -an, -amos
  // Imperfect subjunctive: -iera, -ieras, -ieran, -iéramos, -ara, -aras, -aran
  // Imperative: various

  const verbPatterns = [
    // Imperfect -ar: cantaba → cantar
    { re: /^(.+?)(aba|abas|aban|ábamos)$/, inf: s => [s+'ar'], gloss: (g,suf) => suf === 'aban' ? 'were-'+g+'ing' : 'was-'+g+'ing' },
    // Imperfect -er/-ir: comía → comer
    { re: /^(.+?)(ía|ías|ían|íamos)$/, inf: s => [s+'er', s+'ir'], gloss: (g,suf) => suf === 'ían' ? 'were-'+g+'ing' : 'was-'+g+'ing' },
    // Future: -ré, -rás, -rá, -remos, -réis, -rán
    { re: /^(.+?)(ré|rás|rá|remos|réis|rán)$/, inf: s => [s+'r'], gloss: (g,suf) => 'shall-'+g },
    // Conditional: -ría, -rías, -ríamos, -rían
    { re: /^(.+?)(ría|rías|ríamos|rían)$/, inf: s => [s+'r'], gloss: (g,suf) => 'would-'+g },
    // Preterite -ar: -ó, -aron, -aste, -amos, -é
    { re: /^(.+?)(aron)$/, inf: s => [s+'ar'], gloss: g => g+'ed' },
    { re: /^(.+?)ó$/, inf: s => [s+'ar', s+'er', s+'ir'], gloss: g => g+'ed' },
    // Preterite -er/-ir: -ieron
    { re: /^(.+?)(ieron)$/, inf: s => [s+'er', s+'ir'], gloss: g => g+'ed' },
    // Imperfect subjunctive: -iera, -ieran, -iese, -iesen, -ara, -aran, -ase, -asen
    { re: /^(.+?)(iera|ieran|ieras|iese|iesen)$/, inf: s => [s+'er', s+'ir'], gloss: g => 'might-'+g },
    { re: /^(.+?)(ara|aran|aras|ase|asen)$/, inf: s => [s+'ar'], gloss: g => 'might-'+g },
    // Present subjunctive -ar: -e, -en, -es, -emos (from -ar verbs)
    { re: /^(.+?)(en)$/, inf: s => [s+'ar', s+'er', s+'ir'], gloss: g => 'may-'+g },
    // Present -ar: -a, -an, -as, -amos (1st person plural same as pret)
    { re: /^(.+?)(an)$/, inf: s => [s+'ar', s+'er', s+'ir'], gloss: g => g },
  ];

  for (const pat of verbPatterns) {
    const m = w.match(pat.re);
    if (!m) continue;
    const stem = m[1];
    const suffix = m[2];
    const infs = pat.inf(stem);
    for (const inf of infs) {
      const infGloss = lookup(inf);
      if (infGloss) {
        const base = infGloss.replace(/^to-/, '');
        return pat.gloss(base, suffix);
      }
    }
  }

  // 5. Plural: -es / -s
  if (w.endsWith('es') && w.length > 3) {
    const sing = w.slice(0, -2);
    const g = lookup(sing);
    if (g) return g + 's';
    // nación→naciones, ciudad→ciudades
    const withAccent = lookup(sing + 'ón') || lookup(sing + 'ión') || lookup(sing + 'ad') || lookup(sing + 'al');
    if (withAccent) return withAccent + 's';
  }
  if (w.endsWith('s') && !w.endsWith('es') && w.length > 2) {
    const sing = w.slice(0, -1);
    const g = lookup(sing);
    if (g) return g + 's';
  }

  // 6. Feminine: -a from -o
  if (w.endsWith('a') && w.length > 2) {
    const masc = w.slice(0, -1) + 'o';
    const g = lookup(masc);
    if (g) return g;
  }

  // 7. Diminutive: -ito/-ita/-illo/-illa
  const dimRe = /^(.+?)(ito|ita|illo|illa|itos|itas|illos|illas|cito|cita)$/;
  const dimMatch = w.match(dimRe);
  if (dimMatch) {
    const stem = dimMatch[1];
    const g = lookup(stem) || lookup(stem + 'o') || lookup(stem + 'a');
    if (g) return 'little-' + g;
  }

  // 8. -mente adverbs
  if (w.endsWith('mente') && w.length > 6) {
    const adj = w.slice(0, -5);
    const g = lookup(adj) || lookup(adj + 'o');
    if (g) return g + 'ly';
    const adjBase = adj.endsWith('a') ? adj.slice(0, -1) + 'o' : adj;
    const g2 = lookup(adjBase);
    if (g2) return g2 + 'ly';
  }

  // 9. Augmentative / superlative: -ísimo/-ísima
  if (w.match(/ísim[oa]s?$/)) {
    const stem = w.replace(/ísim[oa]s?$/, '');
    const g = lookup(stem) || lookup(stem + 'o');
    if (g) return 'very-' + g;
  }

  return '';
}

function alignPhrases(spa, eng, dictionary) {
  if (!spa || !eng) return [[spa || '', eng || '']];

  // Split Spanish into individual words
  const spaWords = spa.split(/\s+/).filter(Boolean);
  if (spaWords.length === 0) return [[spa, eng]];

  // Split English into words for fallback alignment
  const engWords = eng.split(/\s+/).filter(Boolean);

  // Phase 1: Look up each Spanish word in dictionary / morphology
  const result = [];
  const unglosed = []; // indices of words with no gloss
  const usedEngPositions = new Set();

  for (let i = 0; i < spaWords.length; i++) {
    const word = spaWords[i];
    const norm = normalizeWord(word);
    const punct = getTrailingPunct(word);
    let gloss = dictionary[norm] || morphGloss(norm, dictionary);

    if (gloss) {
      const glossWithPunct = gloss + punct;
      result.push([word, glossWithPunct]);
      // Mark approximate English positions as used (proportional mapping)
      const engIdx = Math.round(i * engWords.length / spaWords.length);
      usedEngPositions.add(engIdx);
    } else {
      result.push([word, null]); // placeholder
      unglosed.push(i);
    }
  }

  // Phase 2: For unglosed words, assign remaining English words by position
  if (unglosed.length > 0 && engWords.length > 0) {
    // Collect unmatched English words (those not near a glossed position)
    const availableEng = [];
    for (let j = 0; j < engWords.length; j++) {
      availableEng.push({ idx: j, word: engWords[j] });
    }

    // Map each unglosed Spanish word to its proportional English position
    for (const spaIdx of unglosed) {
      const punct = getTrailingPunct(spaWords[spaIdx]);
      const proportion = spaIdx / spaWords.length;
      const targetEngIdx = Math.round(proportion * engWords.length);

      // Find the closest available English word(s)
      let bestDist = Infinity;
      let bestJ = -1;
      for (let k = 0; k < availableEng.length; k++) {
        const dist = Math.abs(availableEng[k].idx - targetEngIdx);
        if (dist < bestDist) {
          bestDist = dist;
          bestJ = k;
        }
      }

      if (bestJ >= 0) {
        const engW = normalizeWord(availableEng[bestJ].word);
        const engPunct = getTrailingPunct(availableEng[bestJ].word);
        result[spaIdx] = [spaWords[spaIdx], engW + (punct || engPunct)];
        availableEng.splice(bestJ, 1);
      } else {
        result[spaIdx] = [spaWords[spaIdx], '?'];
      }
    }
  } else {
    // No English text available, mark unknowns
    for (const idx of unglosed) {
      const punct = getTrailingPunct(spaWords[idx]);
      result[idx] = [spaWords[idx], '?' + punct];
    }
  }

  return result;
}

// ============================================================
// API FETCHING
// ============================================================
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchChapter(vol, slug, chapter) {
  const uri = `/scriptures/${vol}/${slug}/${chapter}`;
  const url = `${API_BASE}?uri=${encodeURIComponent(uri)}&lang=spa`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`  HTTP ${res.status} for ${uri}`);
      return null;
    }
    const data = await res.json();
    if (!data.content || !data.content.body) {
      console.error(`  No content body for ${uri}`);
      return null;
    }
    return data.content.body;
  } catch (e) {
    console.error(`  Error fetching ${uri}:`, e.message);
    return null;
  }
}

// ============================================================
// VERSE FILE GENERATION
// ============================================================
function escapeJs(str) {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function generateVerseFile(book, chaptersData, engData, dictionary) {
  let js = '(function() {\n';

  for (const { chapter, verses } of chaptersData) {
    const containerId = `${book.prefix}${chapter}-verses`;
    js += `var v${chapter} = [\n`;

    for (const verse of verses) {
      const engKey = `${book.nameEn}|${chapter}|${verse.num}`;
      const engText = engData[engKey] || '';
      const phrases = alignPhrases(verse.text, engText, dictionary);
      const wordsArr = phrases.map(([s, e]) => `["${escapeJs(s)}", "${escapeJs(e)}"]`);
      js += `  {num:${verse.num},words:[${wordsArr.join(', ')}]},\n`;
    }

    js += `];\n`;
    js += `renderVerseSet(v${chapter}, '${containerId}');\n\n`;
  }

  js += '})();\n';
  return js;
}

// ============================================================
// PROGRESS TRACKING
// ============================================================
function loadProgress() {
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
  } catch { return {}; }
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2), 'utf-8');
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  const args = process.argv.slice(2);
  const testMode = args.includes('--test');
  const resumeMode = args.includes('--resume');

  // Load English verses for alignment
  const engData = loadEnglishVerses();

  // Load or init progress
  const progress = resumeMode ? loadProgress() : {};

  // Count totals
  let totalChapters = 0;
  BOOKS.forEach(b => totalChapters += b.count);
  console.log(`\nTotal books: ${BOOKS.length}, total chapters: ${totalChapters}`);
  if (testMode) console.log('TEST MODE: only fetching Genesis 1\n');

  let fetched = 0, skipped = 0, errors = 0;
  const booksToProcess = testMode ? [BOOKS[0]] : BOOKS;

  // ---- Phase 1: Fetch all verses ----
  for (const book of booksToProcess) {
    const maxCh = testMode ? 1 : book.count;

    console.log(`\n=== ${book.nameSpa} (${book.nameEn}) - ${maxCh} chapters ===`);

    for (let ch = 1; ch <= maxCh; ch++) {
      const key = `${book.gridId}:${ch}`;

      // Skip if already done
      if (progress[key]) {
        skipped++;
        continue;
      }

      process.stdout.write(`  Ch ${ch}/${maxCh}...`);

      const html = await fetchChapter(book.vol, book.slug, ch);
      if (!html) {
        console.log(' FAILED');
        errors++;
        await sleep(DELAY_MS);
        continue;
      }

      const verses = parseChapterHtml(html);
      console.log(` ${verses.length} verses`);

      if (verses.length === 0) {
        console.log('    WARNING: no verses found');
        errors++;
      }

      progress[key] = verses;
      fetched++;

      // Save progress every 10 chapters
      if (fetched % 10 === 0) saveProgress(progress);

      await sleep(DELAY_MS);
    }
  }

  // Save progress after fetching
  saveProgress(progress);

  // ---- Phase 2: Build dictionary from full corpus ----
  global._BOOKS_REF = BOOKS;
  const dictionary = buildDictionary(progress, engData);

  // ---- Phase 3: Generate verse files with proper glosses ----
  console.log('\nGenerating verse files with dictionary glosses...');
  for (const book of booksToProcess) {
    const maxCh = testMode ? 1 : book.count;
    const chaptersData = [];

    for (let ch = 1; ch <= maxCh; ch++) {
      const key = `${book.gridId}:${ch}`;
      if (progress[key]) {
        chaptersData.push({ chapter: ch, verses: progress[key] });
      }
    }

    if (chaptersData.length > 0) {
      const js = generateVerseFile(book, chaptersData, engData, dictionary);
      const outFile = path.join(VERSES_DIR, `${book.gridId}.js`);
      fs.writeFileSync(outFile, js, 'utf-8');
      console.log(`  Wrote ${outFile} (${(js.length / 1024).toFixed(1)} KB)`);
    }
  }

  console.log(`\n========================================`);
  console.log(`Done! Fetched: ${fetched}, Skipped: ${skipped}, Errors: ${errors}`);
  console.log(`========================================`);
}

main().catch(console.error);
