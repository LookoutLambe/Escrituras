/**
 * The enclitic inventory, and the split.
 *
 * Portuguese attaches object pronouns to the verb with a hyphen — disse-lhe,
 * levanta-te, arrependei-vos — and the reader sees one token where the gloss
 * needs two. 4,274 distinct forms, 11,250 occurrences in this corpus.
 *
 * THE INVENTORY CANNOT COME FROM THE TREEBANK ALONE. UD Portuguese yields
 * a, as, la, las, lhe, lhes, lo, los, me, nos, o, os, se, te — but NOT `vos`,
 * which occurs twice in 546,493 modern tokens and falls under any sane
 * frequency floor. Scripture uses it constantly: digo-vos 101, lembrai-vos 63,
 * arrependei-vos 47, levantai-vos 38. The same register gap that leaves `tu`
 * entirely unattested. So the inventory is the treebank's set UNION the
 * clitics the corpus itself attests in enclitic position, which is the only
 * place the archaic second person shows up.
 *
 * Mesoclisis (dar-lhe-ei, "I will give him") is handled too: the clitic sits
 * INSIDE the future/conditional, between stem and ending.
 *
 * Writes tools/por_clitics.json:  inventory, splits (form -> [stem, clitic…])
 *
 * Usage: node tools/build_clitics.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const M = JSON.parse(fs.readFileSync(path.join(__dirname, 'por_morph.json'), 'utf8'));

/* Attested in the corpus in enclitic position, whatever the treebank says. */
const CORPUS_CLITICS = ['vos', 'te', 'lhe', 'lhes', 'me', 'nos', 'se',
                        'o', 'a', 'os', 'as', 'lo', 'la', 'los', 'las',
                        'no', 'na', 'nos', 'nas'];   // -no/-na after nasal: pô-la, dão-no
const inventory = [...new Set([...Object.keys(M.clitics), ...CORPUS_CLITICS])].sort();
const FUTURE = /^(.*?)(ei|ás|á|emos|eis|ão|ia|ias|íamos|íeis|iam)$/;   // mesoclisis endings

/* THE INFINITIVE LOSES ITS -R BEFORE lo/la/los/las, and the vowel takes an
   accent to show it: fazer + lo -> fazê-lo, ordenar + las -> ordená-las,
   pôr + lo -> pô-lo. Left as written, the stem "fazê" is in no lexicon and
   the whole point of splitting is lost. Restoring the -r puts a real
   infinitive back: á->ar, ê->er, ô->or. Only ever applied before an l-clitic,
   which is the only place the elision happens. */
const L_CLITIC = new Set(['lo', 'la', 'los', 'las']);
const RESTORE = { 'á': 'ar', 'ê': 'er', 'ô': 'or' };
function restoreStem(stem, clitic) {
  if (!L_CLITIC.has(clitic)) return stem;
  const last = stem.slice(-1);
  if (!RESTORE[last]) return stem;
  const out = stem.slice(0, -1) + RESTORE[last];
  /* pô-la -> "por" is the PREPOSITION; the verb keeps its circumflex, pôr.
     Its compounds do not (compor, dispor, propor), so only the bare verb. */
  return out === 'por' ? 'pôr' : out;
}

const freq = {};
for (const f of fs.readdirSync(path.join(ROOT, 'corpus')).filter(f => f.endsWith('.json') && !f.startsWith('_'))) {
  const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'corpus', f), 'utf8'));
  for (const r of d.rows)
    for (const t of r.text.toLowerCase().split(/[^0-9a-zà-ÿÀ-ſ-]+/)) if (t) freq[t] = (freq[t] || 0) + 1;
}

const splits = {};
let enclitic = 0, mesoclitic = 0, tokens = 0;
for (const form of Object.keys(freq)) {
  if (!form.includes('-')) continue;
  const parts = form.split('-');
  const tail = parts[parts.length - 1];

  /* MESOCLISIS FIRST, and it is recognised by the TAIL being a future or
     conditional ending — dar-lhe-ei = dar + ei with lhe wedged inside.
     A first pass tested "middle part is a clitic", which is true of the far
     more common DOUBLE CLITIC (deu-se-lhe, dize-no-lo) and wrongly fused the
     verb to the second pronoun: deu-se-lhe came out as "deulhe + se". */
  if (parts.length === 3 && inventory.includes(parts[1]) && FUTURE.test(parts[0] + parts[2])
      && !inventory.includes(tail)) {
    splits[form] = [restoreStem(parts[0], parts[1]) + parts[2], parts[1]];
    mesoclitic++;
    tokens += freq[form];
    continue;
  }
  if (inventory.includes(tail)) {
    /* two clitics can stack: deu + se + lhe, dize + no + lo */
    if (parts.length === 3 && inventory.includes(parts[1])) {
      splits[form] = [parts[0], parts[1], parts[2]];
    } else {
      splits[form] = [restoreStem(parts.slice(0, -1).join('-'), tail), tail];
    }
    enclitic++;
    tokens += freq[form];
  }
}

fs.writeFileSync(path.join(__dirname, 'por_clitics.json'),
  JSON.stringify({ inventory, splits }, null, 0));

console.log('  inventory            :', inventory.join(', '));
console.log('  from treebank        :', Object.keys(M.clitics).length,
            ' added from the corpus:', inventory.length - Object.keys(M.clitics).length);
console.log('  enclitic forms split :', enclitic.toLocaleString());
console.log('  mesoclitic forms     :', mesoclitic.toLocaleString());
console.log('  tokens covered       :', tokens.toLocaleString());
const ex = Object.keys(splits).sort((a, b) => freq[b] - freq[a]).slice(0, 6);
console.log('\n  ' + ex.map(f => f + ' -> ' + splits[f].join(' + ')).join('\n  '));
