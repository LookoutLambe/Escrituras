#!/usr/bin/env python3
"""Learn the reading for AMBIGUOUS and CLOSED-CLASS forms, from the corpus.

These are the forms a dictionary cannot settle on its own:

    sobre  -- listed "about; on; over; above". The corpus says "upon", 3,675
              times out of 3,675, and never lists "upon" as a sense at all.
    fue    -- preterite of BOTH ser and ir. The lemma list returns {ser, ir}
              and alphabetical order picks ir, giving "went"; the corpus reads
              "was" in 1,055 of 1,729.
    haya   -- subjunctive of haber; the corpus reads "let there be", 455/455.

This replaces the hand-written STRONG_PRETERITE and HOMOGRAPHS tables, which
encoded the same knowledge by hand and, being hand-written, also encoded a
mistake: they claimed `vino` was "came", when the corpus uses it as "wine" in
744 of 744 tokens.

Scope is deliberately narrow, to avoid freezing the corpus's own errors into
the tool: only forms that are genuinely ambiguous (several lemmas, or both a
verb and a non-verb reading) or closed-class (preposition, conjunction,
determiner, pronoun). Open-class content words keep flowing through the normal
dictionary + morphology pipeline, so fixes there still propagate.

Writes tools/spa_form_choice.json: surface form -> gloss, used verbatim.
"""
import os, re, sys, json
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import spa_lookup as S
import spa_apply as A
import spa_conjug as C
import spa_morph as M
import spa_gloss as G

MIN_COUNT = 8         # attested this often
MIN_SHARE = 0.80      # and this dominant
CLOSED = ('ADP', 'CCONJ', 'SCONJ', 'DET', 'PRON', 'ADV', 'AUX')


def is_ambiguous(form):
    """Several lemmas, or a verb reading competing with a non-verb one."""
    tags = C.form_index().get(form) or []
    lemmas = {l for l, _t in tags}
    if len(lemmas) > 1:
        return True
    pos = M.pos(form)
    if tags and pos and pos not in ('VERB', 'AUX'):
        return True                      # verb form that is also a noun etc.
    if len(M.analyses(form)) > 1:
        parts = {a[1] for a in M.analyses(form)}
        if len(parts) > 1:
            return True
    return False


def main():
    lex, forms, names = A.load()
    tally = Counter()
    for _b, _c, _v, _en, toks in A.walk_verses():
        for sp, gl in toks:
            k = sp.lower().strip(A.STRIP)
            g = gl.strip('.,;:!?"')
            if k and g:
                tally[(k, g)] += 1

    per_form = {}
    for (k, g), n in tally.items():
        per_form.setdefault(k, Counter())[g] = n

    chosen, skipped = {}, 0
    for k, c in per_form.items():
        total = sum(c.values())
        g, n = c.most_common(1)[0]
        if total < MIN_COUNT or n / total < MIN_SHARE:
            continue
        if not (is_ambiguous(k) or M.pos(k) in CLOSED):
            continue                     # open-class: leave it to the pipeline
        if '/' in g or len(g) > 26:
            continue                     # unresolved x/y glosses are not answers
        # A learner reading an imperfect corpus learns its defects. Two guards:
        #   - every word of the value must be real English. Without this the
        #     table recorded whatever junk the gloss column held.
        #   - a BARE PRONOUN is only a valid reading for a word that is itself
        #     a pronoun. "ellos" -> "they" is right; "seguros" -> "i" is a
        #     drift gloss, and recording it made the audit treat "i" as that
        #     word's settled reading and skip it forever.
        import spa_audit as _au
        parts = [t for t in g.lower().replace('-', ' ').split() if t]
        PRONS = ('i', 'you', 'we', 'they', 'he', 'she', 'it', 'me', 'him',
                 'her', 'us', 'them')
        content = [t for t in parts if t not in PRONS]
        if not content and M.pos(k) not in ('PRON', 'DET'):
            continue
        vocab = _au.G._vocab()
        if any(t not in _au.english_words() and t not in vocab
               and t not in _au._known_names() for t in (content or parts)):
            continue
        # A VERB must never learn a bare function word as its reading; for a
        # genuinely closed-class form (sobre -> upon, entre -> among) that is
        # exactly the right answer, so the guard is scoped to verbs.
        import spa_audit
        if M.pos(k) in ('VERB',) and all(
                t in spa_audit.FUNCTION_EN for t in g.lower().replace('-', ' ').split()):
            continue
        # only record where the pipeline currently disagrees
        src, tr = S.gloss_candidates(S.normalise(k), lex, forms, names)
        lemma = src.split(':')[1].split('>')[0] if src and ':' in src else None
        try:
            cur = G.gloss(k, lemma, tr, S.first_sense, {'prev_surface': ''})
        except Exception:
            cur = None
        if cur is not None and str(cur) == g:
            skipped += 1
            continue
        chosen[k] = g

    path = os.path.join(HERE, 'spa_form_choice.json')
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(chosen, fh, ensure_ascii=False, indent=0, sort_keys=True)
    print("  forms with a learned reading : %d" % len(chosen))
    print("  already correct, not recorded: %d" % skipped)
    print()
    for k in ('sobre', 'fue', 'fueron', 'haya', 'vino', 'como', 'para', 'era',
              'eran', 'entre', 'cerca', 'orden', 'sal', 'llama'):
        if k in chosen:
            print("   %-8s -> %-16s (%d of %d in the corpus)" %
                  (k, chosen[k], per_form[k][chosen[k]], sum(per_form[k].values())))
    return 0


if __name__ == '__main__':
    sys.exit(main())
