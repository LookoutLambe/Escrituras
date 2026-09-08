#!/usr/bin/env python3
"""Build a Portuguese morphological lexicon from the UD treebanks.

The same move the Spanish edition made: read the closed classes and the
nominal/verbal morphology off tagged real Portuguese instead of hand-writing
tables that are each partial and each a place to be wrong.

Sources: UD Portuguese-Bosque (European) and UD Portuguese-GSD (Brazilian),
both used, exactly as the Spanish build uses AnCora + GSD together.

TWO THINGS THIS DOES THAT THE SPANISH ONE DOES NOT, because Portuguese needs
them:

1. CONTRACTIONS ARE KEPT. UD splits "do" into "de" + "o" and marks the surface
   with a range line (7-8). The Spanish script skips ranges, which is harmless
   there — Spanish contracts only "del" and "al". In Portuguese the contracted
   preposition+article is everywhere (do, da, no, na, pelo, à, ao, dos, nas,
   num, dum...), and skipping ranges would lose the surface form the reader
   actually sees. Ranges are captured here with their parts, so "do" can be
   glossed "of-the" instead of vanishing.

2. CLITICS ARE FOUND BY CASE, NOT BY Reflex=Yes. The Spanish build keys its
   reflexive set on the feature Reflex=Yes. That tag occurs ONCE in 546,493
   tokens of Portuguese UD — carrying the Spanish rule over produced an empty
   set and would have left the glosser with no clitic inventory at all.
   Portuguese marks these as PRON with Case=Acc or Case=Dat and PronType=Prs,
   which is what is counted here: me, te, se, nos, vos, o, a, lhe, lhes.

3. THE TWO VARIETIES STAY DISTINGUISHABLE. Bosque is European, GSD Brazilian,
   and they disagree about exactly the things a glosser must not guess at —
   second-person tu vs você above all. Every form records which treebank
   attests it, so a disagreement is visible in the data rather than silently
   resolved by whichever corpus happened to be larger.

Writes tools/por_morph.json:
    forms         form -> [[lemma, upos, feats, count], ...]  most frequent first
    closed        upos -> [forms]   for DET, ADP, PRON, CCONJ, SCONJ, AUX, NUM
    clitics       object pronouns, PRON + Case=Acc/Dat + PronType=Prs
    contractions  surface -> [[part lemma, upos], ...]
    variety       form -> "bosque" | "gsd" | "both"

Usage: python3 tools/build_morph.py
"""
import os, sys, json, glob
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'src')
CLOSED = ('DET', 'ADP', 'PRON', 'CCONJ', 'SCONJ', 'AUX', 'NUM')


def read_conllu(path):
    """Yields ('tok', form, lemma, upos, feats) and ('range', surface, [ids])."""
    with open(path, encoding='utf-8') as fh:
        for line in fh:
            line = line.rstrip('\n')
            if not line or line.startswith('#'):
                continue
            c = line.split('\t')
            if len(c) < 6:
                continue
            if '.' in c[0]:
                continue                       # empty nodes
            if '-' in c[0]:
                a, b = c[0].split('-')
                yield ('range', c[1], list(range(int(a), int(b) + 1)))
                continue
            yield ('tok', c[1], c[2], c[3], c[5], int(c[0]))


def main():
    files = sorted(glob.glob(os.path.join(SRC, '*.conllu')))
    if not files:
        print("  no .conllu in tools/src -- download the UD treebanks first")
        return 1

    analyses = defaultdict(Counter)
    closed = defaultdict(Counter)
    clitics = defaultdict(Counter)
    contraction_parts = defaultdict(Counter)
    seen_in = defaultdict(set)
    total = 0

    for path in files:
        tb = 'bosque' if 'bosque' in os.path.basename(path) else 'gsd'
        pending = {}          # token id -> contraction surface it belongs to
        for rec in read_conllu(path):
            if rec[0] == 'range':
                _, surface, ids = rec
                for i in ids:
                    pending[i] = surface.lower()
                continue
            _, form, lemma, upos, feats, tid = rec
            total += 1
            f = form.lower()
            analyses[f][(lemma.lower(), upos, feats)] += 1
            seen_in[f].add(tb)
            if upos in CLOSED:
                closed[upos][f] += 1
            if upos == 'PRON' and 'PronType=Prs' in feats:
                for case in ('Acc', 'Dat'):
                    if 'Case=' + case in feats:
                        clitics[f][case] += 1
            if tid in pending:                 # this token is half of a contraction
                surf = pending.pop(tid)
                contraction_parts[surf][(lemma.lower(), upos)] += 1
                seen_in[surf].add(tb)

    def _contraction(counter):
        parts = [[l, p] for (l, p), _n in counter.most_common(2)]
        if not any(p == 'ADP' for _l, p in parts):
            return None
        parts.sort(key=lambda lp: 0 if lp[1] == 'ADP' else 1)
        return parts

    def variety(f):
        s = seen_in.get(f, set())
        return 'both' if len(s) == 2 else (list(s)[0] if s else '')

    out = {
        'forms': {f: [[l, p, ft, n] for (l, p, ft), n in c.most_common(4)]
                  for f, c in analyses.items()},
        # a closed-class member must be dominant for that form, not incidental
        'closed': {p: sorted(f for f, n in c.items()
                             if n >= 3 and n >= 0.30 * sum(
                                 x for (_l, _p, _ft), x in analyses[f].items()))
                   for p, c in closed.items()},
        # a contraction is two parts; a third entry is only ever mis-tagging noise
        'clitics': {f: sorted(c.keys()) for f, c in clitics.items() if sum(c.values()) >= 3},
        # THE PREPOSITION COMES FIRST, AND THERE MUST BE ONE.
        #   most_common() orders the parts by FREQUENCY, so `da` came out
        #   [o DET, de ADP] and glossed "the-of"; `dele` glossed "him-of".
        #   A Portuguese contraction is always PREP + (DET|PRON), so sorting
        #   the preposition to the front restores the surface order.
        #   Requiring one also drops the reflexive verbs (refere-se,
        #   queixa-se) that UD marks as multiword ranges too — those are
        #   enclisis and belong to the clitic splitter, not here.
        'contractions': {s: _contraction(c) for s, c in contraction_parts.items()
                         if sum(c.values()) >= 3 and _contraction(c)},
        'variety': {f: variety(f) for f in analyses},
    }
    with open(os.path.join(HERE, 'por_morph.json'), 'w', encoding='utf-8') as fh:
        json.dump(out, fh, ensure_ascii=False)

    print("  treebank tokens read : %s  (%d files)" % (f"{total:,}", len(files)))
    print("  distinct forms       : %s" % f"{len(out['forms']):,}")
    for p in CLOSED:
        print("    %-6s %d forms" % (p, len(out['closed'].get(p, []))))
    print("  clitic pronouns      : %s" % ', '.join(
        '%s(%s)' % (f, '/'.join(c)) for f, c in sorted(out['clitics'].items())))
    print("  contractions kept    : %d" % len(out['contractions']))
    v = Counter(out['variety'].values())
    print("  attestation          : both %s | bosque only %s | gsd only %s"
          % (f"{v['both']:,}", f"{v['bosque']:,}", f"{v['gsd']:,}"))
    return 0


if __name__ == '__main__':
    sys.exit(main())
