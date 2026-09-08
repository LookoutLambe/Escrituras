/* Read one chapter as the interlinear renders it: Portuguese token, its gloss,
   and the English verse underneath. The Dual view decides the rendering. */
const fs = require('fs'), path = require('path');
const { gloss, tokenise } = require('./por_gloss.js');
const { contextual } = require('./por_context.js');
/* Deus -> God, not god: a capitalised source word keeps its capital, the same
   rule por_gloss applies to its own output. */
const AUX_LEMMA = { ter: 1, haver: 1, ser: 1, estar: 1 };
const CONJ = JSON.parse(fs.readFileSync(path.join(__dirname, 'por_conjug.json'), 'utf8')).forms;
function isAuxForm(w) {
  return !!(w && (CONJ[w] || []).some(c => AUX_LEMMA[c[0]] &&
    !/Partic[ií]pio/i.test(c[1])));
}
const cap = (raw, g) => (/^[^0-9A-Za-zÀ-ÿ]*[A-ZÀ-Þ]/.test(raw) && /^[a-z]/.test(g)
  ? g[0].toUpperCase() + g.slice(1) : g);
const [, , slug, chap, only] = process.argv;
const BK = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'corpus', slug + '.json'), 'utf8'));
const rows = BK.rows;
const win = {};
new Function('window', fs.readFileSync(path.join(__dirname, '..', 'english_verses.js'), 'utf8'))(win);
const ENG = win._englishVersesData;
const bookEn = BK.bookEn;
for (const r of rows) {
  if (String(r.chapter) !== String(chap)) continue;
  if (only && String(r.verse) !== String(only)) continue;
  const en = ENG[bookEn + '|' + r.chapter + '|' + r.verse] || '';
  const toks = tokenise(r.text);
  console.log('\n── ' + r.chapter + ':' + r.verse + ' ' + '─'.repeat(60));
  console.log('EN  ' + en);
  const out = [];
  const bares = toks.map(t => t.text.replace(/^[^0-9A-Za-zÀ-ÿ]+|[^0-9A-Za-zÀ-ÿ]+$/g, '').toLowerCase());
  for (let ti = 0; ti < toks.length; ti++) {
    const t = toks[ti];
    const bare = bares[ti];
    const ctx = contextual(bare, {
            after: bares.slice(ti + 1), before: bares.slice(0, ti), en,
            raw: t.text.replace(/^[^0-9A-Za-zÀ-ÿ]+/, ''),
            prevRaw: ti ? toks[ti - 1].text : '',
          });
    const g = t.gloss || (ctx ? t.text.replace(/[0-9A-Za-zÀ-ÿ]+/, cap(t.text, ctx)) : gloss(t.text, en, {
            initial: ti === 0 || /[.;:!?—]$/.test(ti ? toks[ti - 1].text : ''),
            /* a clause head, which is wider: a coordinator also opens one */
            clauseStart: ti === 0 || /[.;:!?—,]$/.test(ti ? toks[ti - 1].text : '') ||
                         /^(e|mas|ou|portanto|pois|sim)$/.test(bares[ti - 1] || ''),
            /* the previous word is a form of ter/haver/ser/estar, so this one
               can only be the participle of a compound tense */
            afterAux: ti > 0 && isAuxForm(bares[ti - 1]),
          }));
    out.push(t.text + ' [' + (g || '***') + ']');
  }
  console.log('PT  ' + out.join('  '));
}
