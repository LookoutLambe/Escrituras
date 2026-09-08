/**
 * The Portuguese scriptures, from the Church's own content API.
 *
 * Writes corpus/<gridId>.json — the RAW text, one row per verse:
 *   { book, bookEn, vol, chapter, verse, text }
 *
 * Raw on purpose. verses/*.js in the Spanish edition is the APP format with
 * the gloss column already baked in; that is the output of the toolchain, not
 * its input. The corpus is what the glosser reads, so it stays plain text and
 * is never hand-edited.
 *
 * Usage: node tools/fetch_corpus.js [--resume] [--only <gridId>]
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'corpus');
const API = 'https://www.churchofjesuschrist.org/study/api/v3/language-pages/type/content';
const LANG = 'por';
const DELAY = 350;                       // same courtesy the Spanish build used
const sleep = ms => new Promise(r => setTimeout(r, ms));

const args = process.argv.slice(2);
const RESUME = args.includes('--resume');
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;

/** The verse paragraphs, stripped of markup but keeping the words intact. */
function parseVerses(body) {
  const out = [];
  /* NOT class="verse" EXACTLY. Poetry carries extra classes — the Song of the
     Lamb at D&C 84:99-102 is `class="verse contains-line digits-2"` — and an
     exact match dropped all four verses silently. Match "verse" as a word
     inside the class list instead. */
  const re = /<p class="[^"]*\bverse\b[^"]*"[^>]*>([\s\S]*?)<\/p>/g;
  let m;
  while ((m = re.exec(body))) {
    let h = m[1];
    const num = (h.match(/<span class="verse-number">\s*(\d+)/) || [])[1];
    h = h.replace(/<span class="verse-number">[\s\S]*?<\/span>/g, '');
    /* Each poetic line is its own span; stripping the tags without this joins
       them into "outra vez;O Senhor". */
    h = h.replace(/<span class="line"/g, ' <span class="line"');
    const text = h.replace(/<[^>]+>/g, '')
                  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
                  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#8217;/g, '’')
                  .replace(/\s+/g, ' ').trim();
    if (text) out.push({ verse: num ? +num : out.length + 1, text });
  }
  return out;
}

async function chapter(vol, slug, ch) {
  const uri = `/scriptures/${vol}/${slug}/${ch}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${API}?uri=${encodeURIComponent(uri)}&lang=${LANG}`);
      if (res.status === 429 || res.status >= 500) { await sleep(2000 * attempt); continue; }
      if (!res.ok) return { err: 'HTTP ' + res.status };
      const d = await res.json();
      const body = d.content && d.content.body;
      if (!body) return { err: 'no body' };
      return { verses: parseVerses(body), title: (d.meta && d.meta.title) || '' };
    } catch (e) {
      if (attempt === 3) return { err: e.message };
      await sleep(1500 * attempt);
    }
  }
  return { err: 'retries exhausted' };
}

(async () => {
  const books = JSON.parse(fs.readFileSync(path.join(__dirname, 'books_pt.json'), 'utf8'));
  fs.mkdirSync(OUT, { recursive: true });
  const problems = [];
  let done = 0, totalVerses = 0;
  const todo = ONLY ? books.filter(b => b.gridId === ONLY) : books;

  for (const b of todo) {
    const file = path.join(OUT, b.gridId + '.json');
    if (RESUME && fs.existsSync(file)) {
      const prev = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (prev.chapters === b.count) { done++; totalVerses += prev.rows.length; continue; }
    }
    const rows = [];
    for (let ch = 1; ch <= b.count; ch++) {
      const r = await chapter(b.vol, b.slug, ch);
      if (r.err) { problems.push(`${b.gridId} ${ch}: ${r.err}`); }
      else for (const v of r.verses) {
        rows.push({ book: b.namePor, bookEn: b.nameEn, vol: b.vol, chapter: ch, verse: v.verse, text: v.text });
      }
      await sleep(DELAY);
    }
    fs.writeFileSync(file, JSON.stringify({ gridId: b.gridId, book: b.namePor, bookEn: b.nameEn,
      vol: b.vol, chapters: b.count, rows }, null, 0));
    done++; totalVerses += rows.length;
    console.log(`${String(done).padStart(2)}/${todo.length}  ${b.namePor.padEnd(24)} ${b.count} ch  ${rows.length} verses`);
  }
  console.log(`\nDONE  books ${done}  verses ${totalVerses}  problems ${problems.length}`);
  if (problems.length) { console.log(problems.slice(0, 20).join('\n'));
    fs.writeFileSync(path.join(OUT, '_problems.txt'), problems.join('\n')); }
})();
