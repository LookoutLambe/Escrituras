/**
 * Portuguese -> English gloss candidates.
 *
 * Two FreeDict TEI dictionaries, used in both directions:
 *   por-eng  10,661 headwords, read straight
 *   eng-por  15,766 headwords, REVERSED — an English entry listing "casa" as a
 *            translation of "house" is evidence for casa -> house just as much
 *            as the other direction, and the two overlap far less than their
 *            sizes suggest.
 *
 * A gloss seen from both directions is stronger evidence than one seen from
 * either, so the direction is recorded per pair rather than merged away.
 *
 * Writes tools/por_dict.json:  headword -> [[english, pos, dirs], ...]
 *
 * Usage: node tools/build_dictionary.js
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'src');

/** TEI entries: <entry> … <orth>W</orth> … <pos>P</pos> … <quote>T</quote> … */
function parseTEI(file) {
  const xml = fs.readFileSync(file, 'utf8');
  const out = [];
  const re = /<entry\b[\s\S]*?<\/entry>/g;
  let m;
  while ((m = re.exec(xml))) {
    const e = m[0];
    const orth = (e.match(/<orth[^>]*>([\s\S]*?)<\/orth>/) || [])[1];
    if (!orth) continue;
    const pos = ((e.match(/<pos[^>]*>([\s\S]*?)<\/pos>/) || [])[1] || '').trim();
    const quotes = [...e.matchAll(/<quote[^>]*>([\s\S]*?)<\/quote>/g)].map(q => q[1]);
    const clean = s => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&')
                        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
    const head = clean(orth).toLowerCase();
    const trans = quotes.map(clean).filter(Boolean);
    if (head && trans.length) out.push({ head, pos, trans });
  }
  return out;
}

const dict = {};
function add(pt, en, pos, dir) {
  pt = pt.toLowerCase().trim(); en = en.trim();
  if (!pt || !en || /\s{2,}/.test(pt)) return;
  const list = dict[pt] = dict[pt] || [];
  const hit = list.find(x => x[0].toLowerCase() === en.toLowerCase());
  if (hit) { if (!hit[2].includes(dir)) hit[2] += dir; }
  else list.push([en, pos || '', dir]);
}

const pe = parseTEI(path.join(SRC, 'por-eng', 'por-eng.tei'));
for (const e of pe) for (const t of e.trans) add(e.head, t, e.pos, 'f');   // forward

const ep = parseTEI(path.join(SRC, 'eng-por', 'eng-por.tei'));
for (const e of ep) for (const t of e.trans) add(t, e.head, e.pos, 'r');   // reversed

/* both directions agreeing is the strongest signal — sort it first */
for (const k of Object.keys(dict)) {
  dict[k].sort((a, b) => (b[2].length - a[2].length));
}

fs.writeFileSync(path.join(__dirname, 'por_dict.json'), JSON.stringify(dict, null, 0));

const both = Object.values(dict).filter(v => v.some(x => x[2].length === 2)).length;
console.log('  por-eng entries read :', pe.length.toLocaleString());
console.log('  eng-por entries read :', ep.length.toLocaleString());
console.log('  headwords            :', Object.keys(dict).length.toLocaleString());
console.log('  confirmed both ways  :', both.toLocaleString());
for (const w of ['casa', 'palavra', 'coração', 'justiça', 'iniquidade', 'altar', 'louvor'])
  console.log('    ' + w.padEnd(12) + '-> ' + JSON.stringify((dict[w] || []).slice(0, 3)));
