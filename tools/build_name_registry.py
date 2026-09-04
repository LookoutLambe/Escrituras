#!/usr/bin/env python3
"""Silo the proper names OUT of the glossing engine, the way the Hebrew does.

The Hebrew app keeps TRANSLIT_TERMS as a single JSON line in root_scorecard.js
-- Adam-ondi-Ahman, Ahman, Shedolamak -- and every consumer reads it from that
one source, so the renderer, the scorecard, the engine and the concordance
builder can never drift apart. The engine does not analyse those words at all:
a transliterated term has no root to find, so it is skipped rather than
guessed at.

A proper name in the Spanish interlinear is the same kind of object and had no
such registry, so it went through the ordinary pipeline and came out the other
side as vocabulary:

    Marks   -> "my"        Whitney -> "k"       Granger -> "but"
    Olaha   -> "plains"    Adan-ondi-Ahman -> "be"

Repairing those one at a time is endless; the fix is to take names out of the
engine's way. A name has no morphology to analyse and no sense to choose. It
glosses as itself.

DERIVED, NOT HAND-WRITTEN. The verse's own printed English already contains
the name, so the registry is read out of the canon rather than typed:

  1. the Spanish token is capitalised and the dictionary cannot render it as a
     common word -- this is what keeps `Alma` (the name) apart from `alma`
     (the soul), which a surface-only key once flattened in 254 places;
  2. an English proper name in the SAME verse matches it, folded for the
     regular Spanish/English correspondences (Sion/Zion, Josue/Joshua) and
     scored, with the best candidate required to be both close and clearly
     ahead of the runner-up;
  3. the same answer comes back in a majority of that name's occurrences, so
     one bad verse cannot register a name.

    python3 tools/build_name_registry.py            # report
    python3 tools/build_name_registry.py --write    # write spa_names.json
"""
import os, re, sys, json
from collections import Counter, defaultdict
from difflib import SequenceMatcher

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import spa_apply as A
import spa_lookup as S
import learn_register as LR

OUT = os.path.join(HERE, 'spa_names.json')
MIN_SCORE = 0.72
MIN_MARGIN = 0.12
MIN_SHARE = 0.60


def build():
    lex, forms, names = A.load()
    votes = defaultdict(Counter)
    total = Counter()
    for _b, _c, _v, en, toks in A.walk_verses():
        if not en:
            continue
        english_names = re.findall(r"\b[A-Z][A-Za-z'\-]*\b", en)
        for i, (sp, g) in enumerate(toks):
            w = sp.strip(A.STRIP)
            if not w or not w[:1].isupper() or i == 0 or len(w) < 2:
                continue
            # "Jose,y" / "Jacob,el" / "Jerusalen,por" -- a comma and the next
            # word swallowed into one token. Registering those would bake a
            # tokenisation defect into the lexicon; they are reported by
            # --tokens instead.
            if re.search(r'[,;:][^\s]', w):
                continue
            # A token's OWN gloss must not count against it. The claimed set
            # exists so two Spanish tokens cannot both be Whitney; keyed
            # without this exclusion it also meant a name already glossed
            # correctly could never be registered, which is how
            # Adan-ondi-Ahman -- the very name this registry is for -- was
            # left out.
            claimed = {t.strip('.,;:!?¿¡"').lower()
                       for j, (_s, t) in enumerate(toks) if t and j != i}
            k = w.lower()
            # (1) the dictionary must NOT know it as a common word
            src, tr = S.gloss_candidates(S.normalise(k), lex, forms, names)
            if tr and src != 'name':
                continue
            total[w] += 1
            cands = []
            for e in english_names:
                if e.lower() in claimed and e.lower() != k:
                    continue
                cands.append((SequenceMatcher(None, LR._fold(k),
                                              LR._fold(e.lower())).ratio(), e))
            cands.sort(reverse=True)
            if not cands or cands[0][0] < MIN_SCORE:
                continue
            if len(cands) > 1 and cands[0][0] - cands[1][0] < MIN_MARGIN:
                continue
            votes[w][cands[0][1]] += 1
    registry = {}
    for w, c in votes.items():
        best, n = c.most_common(1)[0]
        if total[w] and n / total[w] >= MIN_SHARE:
            registry[w] = best
    return registry, total


def main(argv):
    reg, total = build()
    print('registered %d proper names\n' % len(reg))
    rows = sorted(reg.items(), key=lambda kv: -total[kv[0]])
    print('%-24s %-24s %s' % ('SPANISH', 'ENGLISH', 'n'))
    for w, e in rows[:40]:
        print('%-24s %-24s %d' % (w, e, total[w]))
    same = sum(1 for w, e in reg.items() if w == e)
    print('\n  identical spelling: %d   respelled: %d' % (same, len(reg) - same))
    if '--write' in argv:
        with open(OUT, 'w', encoding='utf-8') as fh:
            json.dump(reg, fh, ensure_ascii=False, indent=0, sort_keys=True)
        print('\nwrote %s' % OUT)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
