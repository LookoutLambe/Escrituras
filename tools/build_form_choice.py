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


MIN_WITNESS = 0.70


def _core(gloss):
    import spa_audit as _au
    core = [t for t in gloss.lower().replace('-', ' ').split()
            if t not in ('i', 'you', 'we', 'they', 'he', 'she', 'it')]
    if not core or all(t in _au.FUNCTION_EN for t in core):
        return None            # nothing testable: presence proves nothing
    return core


def witness_rates(pairs):
    """{(form, gloss): rate} in ONE walk of the corpus.

    Per-pair walking is O(forms x corpus) and there are ~1,900 candidate
    pairs over 42,000 verses, so it has to be done together.
    """
    import eng_sense as ES
    want = {}
    for form, gloss in pairs:
        c = _core(gloss)
        if c is not None:
            want.setdefault(form, []).append((gloss, c))
    seen, hit = Counter(), Counter()
    for _b, _c, _v, en, toks in A.walk_verses():
        if not en:
            continue
        enw = None
        for sp, _gl in toks:
            k = sp.lower().strip(A.STRIP)
            cands = want.get(k)
            if not cands:
                continue
            if enw is None:
                enw = set()
                for w in re.findall(r"[A-Za-z']+", en.lower()):
                    enw |= ES.variants(w)
            for gloss, core in cands:
                seen[(k, gloss)] += 1
                if all(ES.variants(t) & enw for t in core):
                    hit[(k, gloss)] += 1
    return {p: (hit[p] / seen[p]) for p in seen if seen[p]}


def witness_rate(form, gloss):
    """Single-pair convenience; prefer witness_rates for a whole build."""
    return witness_rates([(form, gloss)]).get((form, gloss))


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
        # A FUNCTION-WORD READING NEEDS POSITIVE EVIDENCE THAT THE FORM IS A
        # FUNCTION WORD. This guard used to be scoped to `M.pos(k) == 'VERB'`,
        # and that scope is where 181 of the 959 learned readings came from:
        #
        #     abandonados -> "of"   abatido -> "the"   abiertas -> "the"
        #     alcance     -> "of"   canción -> "the"   angustiado -> "and"
        #
        # Two leaks, both of them "the form qualifies, so its reading is
        # settled". CLOSED contains 'ADV', so `amargamente` learned "the" and
        # `atentamente` learned "and"; and is_ambiguous() is true of every
        # participle, because a participle is a verb form that is also an
        # adjective, so the whole -ado/-ada/-ido class walked in. M.pos returns
        # ADJ or None for those, never VERB, so the old guard never fired.
        #
        # What made it costly is the second consumer: spa_audit skips any token
        # whose gloss equals its learned reading, as "the corpus's own settled
        # answer". So each of these entries permanently HID the very token it
        # got wrong. D&C 117 audits clean for that reason.
        #
        # A learner reading an imperfect corpus learns its defects. The corpus
        # cannot be the witness to its own drift, so the form's part of speech
        # has to be, and absence of a tag is not evidence.
        import learn_register as _lr
        import eng_sense as _es
        core = [t for t in g.lower().replace('-', ' ').split()
                if t not in PRONS]
        if core and all(t in _au.FUNCTION_EN for t in core):
            _src, _tr = S.gloss_candidates(S.normalise(k), lex, forms, names)
            # The DICTIONARY is allowed to overrule this guard, and has to be:
            # abajo really is "below", arriba "above", atrás "backward", aún
            # "yet". Those are adverbs whose English happens to be spelled like
            # a preposition, and the first version of the guard threw all four
            # away with the drift. What it must still refuse is a reading no
            # dictionary supports -- abatido "the", alcance "of".
            if not (_tr and _es.renders(g, _tr)):
                if not _lr.is_function_word(k, lex, forms, names):
                    continue
        # A CONTEXT-DEPENDENT FORM MUST NOT BE FROZEN AT ALL.
        #
        # `vino` is the noun "wine" and the strong preterite "came", and no
        # accent separates them -- strong preterites are stem-stressed, so
        # there is no `vinó` to write. The corpus glosses it "wine" in 767 of
        # 767, so this builder recorded "wine" as its settled reading with a
        # share of 1.00. Against the printed English, 447 of those verses say
        # "came" and 222 say "wine". The share was measuring the corpus's
        # consistency, not its correctness, and a form that is wrong the same
        # way everywhere looks maximally settled.
        #
        # Dominance in the gloss column is therefore not evidence. The canon is:
        # a reading may be frozen only if the printed English of the verses
        # actually carries it. Where it does not, the form is context-dependent
        # and belongs to pass_homograph_by_canon, which decides per verse.
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

    # THE CANON WITNESS, applied to every candidate in one walk. See the note
    # on context-dependent forms above: dominance in the gloss column measures
    # the corpus's consistency, not its correctness, and a form that is wrong
    # the same way everywhere looks maximally settled.
    rates = witness_rates(list(chosen.items()))
    dropped = 0
    for k in list(chosen):
        r = rates.get((k, chosen[k]))
        if r is not None and r < MIN_WITNESS:
            del chosen[k]
            dropped += 1

    path = os.path.join(HERE, 'spa_form_choice.json')
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(chosen, fh, ensure_ascii=False, indent=0, sort_keys=True)
    print("  refused, canon does not confirm: %d" % dropped)
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
