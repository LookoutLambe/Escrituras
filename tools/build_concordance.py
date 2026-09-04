#!/usr/bin/env python3
"""Build the Spanish word scorecard's concordance.

The Spanish counterpart of the Hebrew root concordance. Where Hebrew files a
word under its ROOT, Spanish files it under its LEMMA — the infinitive for a
verb, the singular for a noun — because that is the unit a Spanish reader
actually looks up.

For every lemma it records, across all five volumes:
    c       uses per volume
    vc      verses per volume
    f       the commonest surface forms, with counts
    g       the commonest English glosses, with counts
    m       the meaning line

Forms and glosses are capped the way the Hebrew one caps them, so the file
stays small enough to ship; the card marks the tapped form or gloss "(here)"
when the cap dropped it, so an idiomatic rendering never silently vanishes.

Writes spa_concordance.js at the repo root.
"""
import os, re, sys, json
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import spa_lookup as S
import spa_apply as A
import spa_gloss as G
import spa_conjug as C

VOL_ORDER = ['ot', 'nt', 'bom', 'dc', 'pgp']
VOL_NAMES = {'ot': 'OT', 'nt': 'NT', 'bom': 'BoM', 'dc': 'D&C', 'pgp': 'PGP'}
MAX_FORMS = 8
MAX_GLOSSES = 10
MIN_USES = 1


def book_volumes():
    """book display name -> volume key, read off BOOK_DATA in index.html."""
    idx = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
    out = {}
    for m in re.finditer(r"\{\s*prefix:\s*'([^']+)'[^}]*?nameEn:\s*'([^']+)'[^}]*?volume:\s*'([a-z]+)'", idx):
        out[m.group(2)] = m.group(3)
    return out


def meaning_for(lemma, lex):
    """The meaning line: the translator's own established word where the corpus
    settled one, the canon-attested sense next, the dictionary last."""
    learned = G.sense_choice(lemma) or G.canon_sense(lemma)
    if learned:
        return learned
    raw = lex.get(lemma) or ''
    senses = []
    for part in re.split(r';', raw):
        w = re.sub(r'\(.*?\)', '', part).strip().rstrip('.,;')
        if w and len(w) < 40:
            senses.append(w)
    return '; '.join(senses[:3])


def main():
    lex, forms, names = A.load()
    vol_of = book_volumes()
    vi = {v: i for i, v in enumerate(VOL_ORDER)}

    counts = defaultdict(lambda: [0] * len(VOL_ORDER))
    verses = defaultdict(lambda: [set() for _ in VOL_ORDER])
    formc = defaultdict(Counter)
    glossc = defaultdict(Counter)

    seen_tokens = 0
    for book, ch, v, _en, toks in A.walk_verses():
        vol = vol_of.get(book)
        if vol is None or vol not in vi:
            continue
        k = vi[vol]
        vid = '%s|%s|%s' % (book, ch, v)
        for sp, gl in toks:
            w = sp.strip(A.STRIP)
            if not w or w[:1].isupper() and w.lower() in names:
                continue                      # proper names get no lemma card
            key = S.normalise(w)
            if not key or len(key) < 2:
                continue
            src, tr = S.gloss_candidates(key, lex, forms, names)
            if not src or src == 'name':
                continue
            lemma = src.split(':')[1].split('>')[0] if ':' in src else key
            # A conjugated verb files under its INFINITIVE, not under whatever
            # the dictionary happened to list. `sembrado` has its own entry as
            # a participle, so without this the card filed it under itself and
            # the tapped word was missing from its own forms list.
            tags = C.form_index().get(key) or []
            verb = [l for l, t in tags if t != 'inf' and l in lex]
            if verb:
                lemma = min(verb, key=len)
            seen_tokens += 1
            counts[lemma][k] += 1
            verses[lemma][k].add(vid)
            formc[lemma][w.lower()] += 1
            g = gl.strip('.,;:!?¿¡"')
            if g:
                glossc[lemma][g] += 1

    out = {}
    for lemma, c in counts.items():
        if sum(c) < MIN_USES:
            continue
        out[lemma] = {
            'c': c,
            'vc': [len(s) for s in verses[lemma]],
            'f': dict(formc[lemma].most_common(MAX_FORMS)),
            'g': dict(glossc[lemma].most_common(MAX_GLOSSES)),
            'm': meaning_for(lemma, lex),
        }

    path = os.path.join(ROOT, 'spa_concordance.js')
    payload = {'volOrder': VOL_ORDER, 'volNames': VOL_NAMES, 'lemmas': out}
    with open(path, 'w', encoding='utf-8') as fh:
        fh.write('window._spaConcordance = ')
        json.dump(payload, fh, ensure_ascii=False, separators=(',', ':'))
        fh.write(';\n')
    size = os.path.getsize(path) / 1024
    print("  tokens filed   : %d" % seen_tokens)
    print("  lemmas         : %d" % len(out))
    print("  spa_concordance.js: %.1f KB" % size)
    top = sorted(out.items(), key=lambda kv: -sum(kv[1]['c']))[:8]
    print()
    for lemma, e in top:
        print("   %-12s %5d uses in %4d verses  %s" %
              (lemma, sum(e['c']), sum(e['vc']), (e['m'] or '')[:34]))
    return 0


if __name__ == '__main__':
    sys.exit(main())
