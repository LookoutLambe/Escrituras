#!/usr/bin/env python3
"""Run every corpus gloss pass, in order, idempotently.

There is a real reason this is a file and not a series of ad-hoc scripts: the
passes have an order (names must settle before capitalisation; the pronoun
pass must run after the verb pass), several of them have guards that were
learned the hard way, and twice in this project a bad ad-hoc pass had to be
undone by `git checkout -- verses/` and everything replayed. Replaying is only
safe if the sequence is written down.

    python3 tools/run_passes.py            # all of them
    python3 tools/run_passes.py --dry-run
"""
import os, re, sys, json, argparse
from difflib import SequenceMatcher
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import spa_apply as A
import spa_morph as M
import spa_audit as AU
import spa_gloss as G
import spa_conjug as C
import spa_lookup as S
import eng_verbs as EV


def tail(g):
    m = re.search(r'([^\w\- ]+)$', g)
    return m.group(1) if m else ''


def _canon_names():
    with open(os.path.join(HERE, 'canon_names_en.json'), encoding='utf-8') as fh:
        return {x.lower() for x in json.load(fh)}


def pass_reflexives(dry):
    """[refl.] is a code, not a translation. The reflexive pronoun agrees with
    its verb, and the person comes from the conjugation tag."""
    fix = {}
    for book, ch, v, en, toks in A.walk_verses():
        for i, (sp, g) in enumerate(toks):
            if 'refl' not in g.lower():
                continue
            k = sp.lower().strip(A.STRIP)
            person = G.CLITIC_PERSON.get(k)
            if not person:
                for j in range(i + 1, min(i + 4, len(toks))):
                    t = C.verb_tag(toks[j][0].lower().strip(A.STRIP))
                    if t and '.' in t:
                        person = t.split('.')[1]
                        break
            tag = C.verb_tag(k) or ''
            word = 'oneself' if tag in ('inf', 'ger', 'part') else \
                   G.reflexive_for(person or '3s', None, en)
            new = re.sub(r'\[?refl\.?\]?', word, g, flags=re.I).replace(']', '').replace('[', '')
            new = re.sub(r'\.(?=$|[,;:.!?])', '', new)
            if new != g:
                fix[(book, ch, v, i)] = new
    return A.edit_tokens(fix, dry)


def _forms(w):
    st = w.rstrip('s')
    return {w, w + 's', w + 'es', st, st + 's', st + 'es', st + 'ed', st + 'ing',
            st + 'eth', st + 'est', EV.third(w), EV.past(w), EV.participle(w), EV.ing(w)}


def pass_xy_witnessed(dry):
    """An x/y gloss where the verse's own English names exactly one side."""
    fix = {}
    for book, ch, v, en, toks in A.walk_verses():
        if not en:
            continue
        low = set(re.findall(r"[a-z']+", en.lower()))
        low |= {EV.base_form(w) for w in low}
        for i, (sp, g) in enumerate(toks):
            core = g.strip('.,;:!?')
            if '/' not in core:
                continue
            parts = [p.strip() for p in core.split('/') if p.strip()]
            if len(parts) != 2:
                continue
            hit = [p for p in parts if _forms(p.lower()) & low]
            if len(hit) == 1:
                fix[(book, ch, v, i)] = hit[0] + tail(g)
    return A.edit_tokens(fix, dry)


def pass_xy_settled(dry):
    """The rest, by whichever side the corpus has already settled on."""
    dist = defaultdict(Counter)
    for _b, _c, _v, _e, toks in A.walk_verses():
        for sp, g in toks:
            core = g.strip('.,;:!?')
            if core and '/' not in core:
                dist[sp.lower().strip(A.STRIP)][core.lower()] += 1
    fix = {}
    for book, ch, v, en, toks in A.walk_verses():
        for i, (sp, g) in enumerate(toks):
            core = g.strip('.,;:!?')
            if '/' not in core:
                continue
            parts = [p.strip() for p in core.split('/') if p.strip()]
            if len(parts) != 2:
                continue
            d = dist.get(sp.lower().strip(A.STRIP), Counter())
            cnt = {p: d.get(p.lower(), 0) for p in parts}
            tot = sum(cnt.values())
            if tot < 10:
                continue
            top = max(cnt, key=cnt.get)
            if cnt[top] / tot < 0.65:
                continue
            fix[(book, ch, v, i)] = top + tail(g)
    return A.edit_tokens(fix, dry)


def pass_repair(dry):
    """The drift and junk detectors, looped until they stop finding anything."""
    total, files = Counter(), 0
    for _ in range(4):
        hits, _checked = AU.audit()
        n = 0
        for kind in ('junk', 'drift'):
            sel = [h for h in hits if h['kind'] == kind]
            if sel:
                ch, f = AU.repair(sel, dry_run=dry)
                total.update(ch)
                files = max(files, f)
                n += sum(ch.values())
        if n == 0 or dry:
            break
    return total, files


def pass_names(dry):
    """A proper name, confirmed by the canon of that very verse. Never
    overwrites a gloss that is already a DIFFERENT valid scripture name --
    the canon carries both OT and NT Greek spellings."""
    with open(os.path.join(HERE, 'bom_names_es_en.json'), encoding='utf-8') as fh:
        names = json.load(fh)
    gaz = _canon_names()
    fix = {}
    for book, ch, v, en, toks in A.walk_verses():
        if not en:
            continue
        for i, (sp, g) in enumerate(toks):
            w = sp.strip(A.STRIP)
            if not w or not w[:1].isupper():
                continue
            target = names.get(w.lower())
            cur = g.strip('.,;:!?')
            if not target or cur == target:
                continue
            if not re.search(r'\b' + re.escape(target) + r'\b', en):
                continue
            fix[(book, ch, v, i)] = target + tail(g)
    return A.edit_tokens(fix, dry)


def pass_name_case(dry):
    """A gloss that IS a scripture name takes the canon's capitalisation --
    but only where that verse actually names it, so Maria stays Miriam in
    Numbers and becomes Mary in the gospels."""
    gaz = _canon_names()
    disp = {}
    for _b, _c, _v, en, _t in A.walk_verses():
        if not en:
            continue
        for w in re.findall(r"\b[A-Z][a-zA-Z'\-]{2,}\b", en):
            if w.lower() in gaz:
                disp.setdefault(w.lower(), w)
    fix = {}
    for book, ch, v, en, toks in A.walk_verses():
        if not en:
            continue
        for i, (sp, g) in enumerate(toks):
            core = g.strip('.,;:!?')
            if not core or ' ' in core or '-' in core or core[:1].isupper():
                continue
            tgt = disp.get(core.lower())
            if not tgt or tgt == core:
                continue
            if not re.search(r'\b' + re.escape(tgt) + r'\b', en):
                continue
            fix[(book, ch, v, i)] = tgt + tail(g)
    return A.edit_tokens(fix, dry)


def pass_name_from_canon(dry):
    """A proper name glosses as itself. Take the spelling from the verse.

    pass_names above can only fix a name that is in bom_names_es_en.json, so it
    is blind to every name outside the Book of Mormon. D&C 117 reads

        Whitney -> "k"   Marks -> "faithful"   Granger -> "but"
        Olaha   -> "plains"                    Adan-ondi-Ahman -> "be"

    because the English was laid down in ENGLISH word order across Spanish
    tokens, and a name received whatever word fell at its index. There is no
    table to look these up in and there should not be one: the verse's own
    printed English contains the name, so the canon can be READ instead.

    THREE GUARDS, and the first two were written after the dry run of the
    first version proposed 2,185 changes of which most were damage:

    1. NEVER overwrite a gloss that is already a proper name. The first
       version wanted `Ahab -> "Acab"`, `Reuben -> "Ruben"`, `Shechem ->
       "Siquem"`, `James -> "Jacobo"` -- correct English replaced by the
       SPANISH spelling, 300+ times, because its fold could not see that
       Acab and Ahab are one name. A gloss that is already capitalised and
       already a name is not the defect this pass is for.

    2. NEVER fall back to the Spanish surface. That fallback IS how the
       damage above happened. If the canon of that verse does not name it,
       this pass does nothing and the token is left for a human.

    3. The English name must be UNCLAIMED -- not already the gloss of some
       other token in the verse. Two Spanish tokens cannot both be Whitney.

    Guard 1 also saves the KJV's own renderings: Seol is glossed "grave" and
    Asera "groves" because that is what the English says, and neither verse
    contains a proper name to claim, so both are left alone.
    """
    import spa_audit as AU
    import learn_register as LR
    gaz = _canon_names()
    _verse_tokens.cache = None          # per-run: these passes iterate
    hits, _ = AU.positional()
    fix = {}
    for h in hits:
        if h.get('rule') != 'name':
            continue
        sp = h['sp'].strip(A.STRIP)
        k = sp.lower()
        cur = h['gloss'].strip('.,;:!?¿¡"')
        # GUARD 1 -- already a name; leave it alone.
        if cur[:1].isupper() or cur.lower() in gaz or cur.lower() in AU._known_names():
            continue
        en = h.get('english') or ''
        claimed = {t.strip('.,;:!?¿¡"').lower()
                   for _sp, t in _verse_tokens(h) if t}
        # GUARD 4 -- the match must be strong AND unambiguous.
        # A loose "same name" test is fine for confirming a name you already
        # believe; it is not fine for CHOOSING one out of a genealogy. In
        # 1 Chronicles 3-4 it picked Hasadias -> "Hashubah", Dalaias ->
        # "Hodaiah" and Ahastari -> "Ahuzam", and shortened the place
        # Atrot-bet-joab to "Joab" -- 15% wrong over 711 changes, which is
        # exactly the shape of the passes that have damaged this corpus
        # before. So: score every unclaimed name in the verse, take the best
        # only if it is both close and clearly ahead of the runner-up.
        cands = []
        for w in re.findall(r"\b[A-Z][A-Za-z'\-]*\b", en):
            if w.lower() in claimed:
                continue                       # GUARD 3 -- another token has it
            cands.append((SequenceMatcher(None, LR._fold(k),
                                          LR._fold(w.lower())).ratio(), w))
        cands.sort(reverse=True)
        # GUARD 2 -- no canon spelling, no change.
        if not cands or cands[0][0] < 0.72:
            continue
        if len(cands) > 1 and cands[0][0] - cands[1][0] < 0.12:
            continue
        target = cands[0][1]
        fix[(h['book'], h['ch'], h['v'], h['i'])] = target + tail(h['gloss'])
    return A.edit_tokens(fix, dry)


def _verse_tokens(h, _reset=False):
    """The tokens of the verse a hit came from, for the unclaimed test.

    The cache is per RUN, not per process: these passes are iterative -- fixing
    `negocios` frees the word "marks" for the token `Marks` -- and a cache that
    survived the first round fed round two its own stale corpus, so nothing
    converged.
    """
    key = (h['book'], h['ch'], h['v'])
    if _reset:
        _verse_tokens.cache = None
    cache = _verse_tokens.__dict__.setdefault('cache', None)
    if cache is None:
        cache = {}
        for book, ch, v, _en, toks in A.walk_verses():
            cache[(book, ch, v)] = toks
        _verse_tokens.cache = cache
    return _verse_tokens.cache.get(key, [])


def _FORM_CHOICE(_cache={}):
    """The learned form readings, loaded once."""
    if not _cache:
        try:
            with open(os.path.join(HERE, 'spa_form_choice.json'), encoding='utf-8') as fh:
                _cache.update(json.load(fh))
        except OSError:
            _cache['__'] = ''
    return _cache

def pass_homograph_by_canon(dry):
    """A noun/verb homograph is decided PER VERSE by the canon, not by a table.

    `vino` is both the noun "wine" and the 3rd-singular preterite of venir,
    "came", and no accent separates them -- which is the whole difficulty. For
    the pairs where an accent DOES separate them the conjugation database
    already settles it and settles it correctly: tomo is pres.1s and tomó is
    pret.3s, hablo/habló, mando/mandó, llego/llegó. Those need no help.

    What has been happening to the ones the accent cannot separate is that a
    TABLE answered for the whole corpus:

        HOMOGRAPHS['vino'] = 'came'      -- the hand table, consulted first
        spa_form_choice['vino'] = 'wine' -- learned from the corpus, 774/774

    and the corpus reads "wine" in all 767 of them. Against the printed
    English, 447 of those verses say "came" and only 222 say "wine". So one
    table is wrong two thirds of the time, the other is wrong a third of the
    time, and the second was built by reading the corpus the first had already
    spoiled. Swapping one blanket answer for the other is not a rule.

    The rule is that a homograph is a per-occurrence question, and the verse's
    own printed English is the witness that answers it. Both readings are
    generated -- the noun from the dictionary, the verb from the conjugation
    tag through the normal pipeline -- and the canon picks. If the canon
    carries both words, or neither, this pass does nothing: an ambiguous case
    is left ambiguous rather than guessed.
    """
    import spa_conjug as C
    import eng_sense as ES
    lex, forms, names = A.load()
    fix = {}
    for book, ch, v, en, toks in A.walk_verses():
        if not en:
            continue
        enw = set()
        for w in re.findall(r"[A-Za-z']+", en.lower()):
            enw |= ES.variants(w)
        for i, (sp, g) in enumerate(toks):
            k = sp.lower().strip(A.STRIP)
            if not k or ' ' in k or sp[:1].isupper():
                continue
            tags = C.form_index().get(k) or []
            if not tags:
                continue                      # no verb reading: not a homograph
            noun_tr = lex.get(k)
            if not noun_tr:
                continue                      # no direct entry: not a homograph
            noun_g = S.first_sense(noun_tr)
            if not noun_g or noun_g.startswith('to '):
                continue                      # the direct entry is itself a verb
            vsrc, vtr = S.gloss_candidates(S.normalise(k), lex, forms, names,
                                           prefer_verb=True)
            if not vtr:
                continue
            vlemma = vsrc.split(':')[1].split('>')[0] if vsrc and ':' in vsrc else k
            try:
                verb_g = G.gloss(k, vlemma, vtr, S.first_sense,
                                 {'prev_surface': toks[i - 1][0] if i else ''},
                                 skip_tables=True)
            except Exception:
                verb_g = None
            if not verb_g:
                continue
            verb_g = str(verb_g)
            if verb_g == noun_g:
                continue
            def carried(text, with_person=False):
                """Does the verse's English carry this reading?

                with_person keeps the subject pronoun in the test, and that is
                what stops a noun being read as a first-person verb. `lleno`
                is the adjective "full" and also llenar 1s, "I fill";
                `testimonio` is the noun and also testimoniar 1s, "I testify".
                Third-person narrative almost never says either, but the bare
                words "fill" and "testify" turn up in the sentence constantly,
                so a person-blind test handed 44 nouns to the verb. Requiring
                the English to carry the "I" as well settles it without a list
                of exceptions."""
                toks_ = text.lower().replace('-', ' ').split()
                PRO = ('i', 'you', 'we', 'they', 'he', 'she', 'it')
                core = toks_ if with_person else [t for t in toks_ if t not in PRO]
                return bool(core) and all(ES.variants(t) & enw for t in core)
            # ── CONTEXT, PART 1: SYNTAX. A word after a determiner or a
            # preposition is in a nominal slot and is a noun, whatever the
            # English of the verse happens to contain elsewhere. Without this
            # gate the canon alone turned `lleno` into "I-fill", `testimonio`
            # into "I-testify", `estado` into "been" and `entrada` into
            # "entered" -- 200+ nouns made into verbs because the verb existed
            # somewhere in the sentence. "el vino" is the wine no matter how
            # many times the verse says "came".
            prev = toks[i - 1][0] if i else ''
            if G.noun_position(prev, k):
                n_ok, v_ok = True, False
            else:
                # ── CONTEXT, PART 2: THE CANON. Where syntax is neutral, the
                # verse's own printed English is the witness.
                n_ok, v_ok = carried(noun_g), carried(verb_g, with_person=True)
            if n_ok == v_ok:
                continue                      # both or neither: leave it alone
            want = noun_g if n_ok else verb_g
            cur = g.strip('.,;:!?¿¡"')
            if cur == want:
                continue
            # A CLOSED-CLASS word never becomes a verb. `como` is the
            # conjunction "as" and also comer 1s "I eat"; `entre` is "among"
            # and also entrar 1s; `salvo` is "except" and also salvar. Sixteen
            # verses that happened to mention eating turned `como` into "to
            # eat". Preposition-to-preposition (entre -> "between", sobre ->
            # "about") is a different thing and stays: that is the same part of
            # speech, just the reading this verse wants.
            if v_ok and M.pos(k) in ('DET', 'PRON', 'ADP', 'CCONJ', 'SCONJ', 'NUM'):
                continue
            # The evidence-derived table outranks this pass. `haya` is
            # "let-there-be" in 525 of 525 places, learned from the corpus and
            # confirmed; this pass must not relitigate it verse by verse.
            if _FORM_CHOICE().get(k):
                continue
            # TWO WITNESSES: only overturn a reading the canon does NOT already
            # support. This is what keeps the pass off settled register --
            # `entre` -> "among", `sobre` -> "upon", `justicia` ->
            # "righteousness" are all confirmed by the verses they stand in,
            # and an earlier version rewrote 300+ of them to the dictionary's
            # first sense.
            if carried(cur):
                continue
            fix[(book, ch, v, i)] = want + tail(g)
    return A.edit_tokens(fix, dry)


def pass_contested(dry):
    """Re-derive a gloss that belongs to a DIFFERENT word in the same verse.

    This is the repair for the defect spa_audit.positional() detects: English
    laid down in ENGLISH word order across Spanish tokens, so each one carries
    whatever word stood at its index. D&C 117:1-3:

        arreglen  -> "they-servant"   negocios -> "marks"
        emprendan -> "they-journey"   irá      -> "well"
        salgan    -> "they-let"       demorar  -> "forth"

    Every one of those is a word the tool can already gloss correctly. The
    conjugation database has arreglen as subj.3p of arreglar and emprendan as
    subj.3p of emprender; the dictionary has negocio as "business" and ir as
    "to go". Nothing had to be taught -- the data simply was not built from
    what the tool knows, so the repair is to ask it again.

    THE GUARDS. A regeneration pass is the shape that has damaged this corpus
    before, so nothing is written on the strength of the detector alone:

      - the candidate must pass spa_audit._acceptable, which refuses a rebuilt
        function word ("thed", "anded"), a closed-class homograph accident and
        any English that is not a word;
      - TWO WITNESSES: the new gloss must be a reading the dictionary gives AND
        one the verse's own printed English carries. A gloss that only the
        dictionary supports is left alone rather than guessed at;
      - capitalised tokens are skipped: those are names, and they have their
        own canon-confirmed pass.
    """
    import spa_audit as AU
    import eng_sense as ES
    lex, forms, names = A.load()
    hits, _ = AU.positional()
    by_verse = {}
    for h in hits:
        if h.get('rule') == 'contested':
            by_verse.setdefault((h['book'], h['ch'], h['v']), []).append(h)
    fix = {}
    for book, ch, v, en, toks in A.walk_verses():
        hs = by_verse.get((book, ch, v))
        if not hs or not en:
            continue
        enw = set()
        for w in re.findall(r"[A-Za-z']+", en.lower()):
            enw |= ES.variants(w)
        for h in hs:
            i = h['i']
            if i >= len(toks):
                continue
            sp, g = toks[i]
            if sp[:1].isupper():
                continue                      # names have their own pass
            k = sp.lower().strip(A.STRIP)
            if not k or ' ' in k:
                continue
            src, tr = S.gloss_candidates(S.normalise(k), lex, forms, names)
            if not tr:
                continue
            lemma = src.split(':')[1].split('>')[0] if src and ':' in src else k
            # THE VERSE CHOOSES THE SENSE. The dictionary lists arreglar as
            # "to fix; to arrange; to settle" and the pipeline takes sense #1,
            # "fix" -- but this verse says "settle up their business", so the
            # canon has already chosen, and it chose the third sense. Trying
            # every sense and keeping the one the printed English carries is
            # what turns the dictionary from a guess into an answer.
            ctx = A.build_ctx(toks, i, lex, forms)
            cand = None
            senses = [x.strip() for x in re.split(r'[;,]', tr) if x.strip()]
            for sense in senses:
                one = re.sub(r'\(.*?\)', '', sense).strip()
                if not one:
                    continue
                try:
                    c2 = G.gloss(k, lemma, one, S.first_sense, ctx)
                except Exception:
                    continue
                if not c2:
                    continue
                body = [t for t in str(c2).lower().replace('-', ' ').split()
                        if t not in ('i', 'you', 'we', 'they', 'he', 'she',
                                     'it', 'to')]
                if body and all(ES.variants(t) & enw for t in body):
                    cand = c2
                    break
            if cand is None:
                try:
                    cand = G.gloss(k, lemma, tr, S.first_sense, ctx)
                except Exception:
                    cand = None
            if cand is None:
                # the nominal gate returns None meaning "keep what is there",
                # which is right for a sound gloss and wrong for one already
                # proved to belong to another word. negocios is a noun and its
                # answer is the dictionary's first sense.
                cand = S.first_sense(tr)
            cand = str(cand or '').strip()
            cur = g.strip('.,;:!?¿¡"')
            if not cand or cand == cur:
                continue
            if not AU._acceptable(cand, k, lex, forms, names, S.first_sense(tr)):
                continue
            # The canon has to carry the WORD, not the shape. A subject
            # pronoun, the infinitival "to" and the modal that marks a
            # subjunctive or a future are all supplied by the grammar from the
            # conjugation tag -- the English of the verse has no reason to
            # contain them. `arreglen` rebuilt as "they-may-settle" was refused
            # because the verse does not say "may", though it says "settle"
            # plainly, which is the only word the dictionary was being asked
            # about.
            SHAPE = ('i', 'you', 'we', 'they', 'he', 'she', 'it', 'to',
                     'may', 'might', 'shall', 'will', 'would', 'should',
                     'let', 'do', 'does', 'did', 'be', 'is', 'are', 'was',
                     'were', 'have', 'has', 'had')
            core = [t for t in cand.lower().replace('-', ' ').split()
                    if t not in SHAPE]
            # THE CANON IS A VETO, and it stays one. It was briefly relaxed
            # here on the reasoning that the detector had already proved the
            # current gloss wrong, so anything the dictionary offered had to be
            # an improvement. The dry run said otherwise: 4,767 proposals with
            # `goat` -> "macho" (the Spanish word), `gods` -> "alien",
            # `Amen.` -> "century.", `record` -> "history", `rejoice` -> "to
            # cheer up". A wrong gloss is not a licence to write a different
            # wrong gloss. Where the canon cannot confirm the rebuild, the
            # token is left for a human and reported instead.
            if not core or not all(ES.variants(t) & enw for t in core):
                continue
            # AGREEMENT. The rebuilt English must not contradict the person the
            # conjugation database reports. `profetizamos` is 1st plural, "we
            # prophesy", and the pipeline offered "prophesies" -- a third
            # singular, which is the one shape that cannot be right for any
            # person but 3s. A bare verb is allowed at any person, because the
            # subject may be written out in the Spanish and the pronoun is
            # dropped on purpose; only an actively WRONG inflection is refused.
            tag = G.verb_tag(k, lemma) or ''
            if tag and not tag.endswith('3s'):
                head = core[-1]
                if head.endswith('s') and not head.endswith('ss'):
                    import eng_verbs as _EV
                    if _EV.known(_EV.base_form(head)) and _EV.third(_EV.base_form(head)) == head:
                        continue
            fix[(book, ch, v, i)] = cand + tail(g)
    return A.edit_tokens(fix, dry)


def pass_registry_names(dry):
    """Apply the name registry. A registered name glosses as itself, always.

    The Hebrew app keeps its transliterated terms in one JSON line that every
    consumer reads, and the engine skips them rather than analysing them. This
    is the same silo for Spanish: tools/spa_names.json, derived from the canon
    by build_name_registry.py, holding only surfaces the dictionary cannot
    render as a common word -- so `Alma` the name never collides with `alma`
    the soul, the collision that once flattened 254 tokens.

    Once a name is registered there is nothing to decide per verse, which is
    the whole point: pass_name_from_canon has to search the verse's English
    and score candidates, and this does not.
    """
    reg = G.name_registry()
    fix = {}
    for book, ch, v, en, toks in A.walk_verses():
        for i, (sp, g) in enumerate(toks):
            bare = sp.strip(A.STRIP)
            want = reg.get(bare)
            if not want:
                continue
            if g.strip('.,;:!?¿¡"') == want:
                continue
            fix[(book, ch, v, i)] = want + tail(g)
    return A.edit_tokens(fix, dry)


# THE PASS THAT IS NOT HERE: "a contested verb takes the verse's unclaimed
# verb". It was written, dry-run and deleted. The idea is sound and it is what
# a human does -- `arreglen` reads "they-servant", the sentence has "settle"
# going spare, and only one token can be it -- but automated it produced
# `Hiram` -> "peacocks", `gold` -> "you-may-break", `man` -> "outs" and
# `ears.` -> "may-let." out of 146 proposals. Taking the leftover word needs
# to know which leftovers are leftovers, and nothing in the toolchain does.
# Left here as a record so it is not reinvented.



def pass_poder_units(dry):
    """"no puede" is English "cannot" -- one word, one token, with its person.
    Two separate passes have flattened these, because "cannot" is not in the
    verb lexicon and every guard that asks "is this a verb?" says no."""
    PRON = {'1s': 'I', '2s': 'you', '1p': 'we', '2p': 'you', '3p': 'they', '3s': ''}
    fix = {}
    for book, ch, v, en, toks in A.walk_verses():
        for i, (sp, g) in enumerate(toks):
            s = sp.strip(A.STRIP).lower()
            if not s.startswith('no '):
                continue
            verb = s[3:].strip()
            hit = C.form_index().get(verb)
            if not hit or not any(l == 'poder' for l, _t in hit):
                continue
            tag = C.verb_tag(verb, 'poder') or ''
            if '.' not in tag:
                continue
            tense, person = tag.split('.')
            stem = {'pres': 'cannot', 'imp': 'cannot', 'pret': 'could-not',
                    'impf': 'could-not', 'cond': 'could-not',
                    'fut': 'will-not-be-able'}.get(tense, 'cannot')
            p = PRON.get(person, '')
            want = (p + '-' if p else '') + stem + tail(g)
            if want != g:
                fix[(book, ch, v, i)] = want
    return A.edit_tokens(fix, dry)


def pass_born(dry):
    """Verbs whose English base is auxiliary + participle. Narrowly scoped to
    exactly that shape: a wider "any multiword base" version rewrote 4,153
    tokens into junk (`according-to` -> "in agreement", `honor` ->
    "honra- honor") and had to be reverted wholesale."""
    lex, forms, names = A.load()
    fix = {}
    for book, ch, v, en, toks in A.walk_verses():
        for i, (sp, g) in enumerate(toks):
            k = sp.lower().strip(A.STRIP)
            tag = C.verb_tag(k)
            if not tag or '.' not in tag:
                continue
            src, tr = S.gloss_candidates(S.normalise(k), lex, forms, names)
            if not src or not tr:
                continue
            base = S.first_sense(tr)
            if not re.match(r'^(to )?be [a-z]+$', base):
                continue                      # ONLY "to be born" and its kin
            lem = src.split(':')[1].split('>')[0] if ':' in src else k
            cand = G.gloss(k, lem, tr, S.first_sense, A.build_ctx(toks, i, lex, forms)) \
                or G.gloss(k, lem, tr, S.first_sense, {'prev_surface': ''})
            if cand and str(cand) != g.strip('.,;:!?'):
                fix[(book, ch, v, i)] = str(cand) + tail(g)
    return A.edit_tokens(fix, dry)


def pass_gentilics(dry):
    """Peoples and nations. Spanish writes them lowercase (judios, egipcios);
    English capitalises them, and the noun is not the adjective -- the
    dictionary's first sense for `judio` is "Jewish", which pluralised to
    "Jewishes". Each entry in the supplement was confirmed against the canon
    before it was added."""
    import spa_lookup as _S
    lex, forms, names = A.load()
    sup = _S.load_supplement()
    gent = {k: v.replace(' (noun)', '') for k, v in sup.items()
            if v.endswith(' (noun)') and v[0].isupper()}
    fix = {}
    for book, ch, v, en, toks in A.walk_verses():
        for i, (sp, g) in enumerate(toks):
            w = sp.strip(A.STRIP).lower()
            if w not in gent:
                continue
            if g.strip('.,;:!?') == gent[w]:
                continue
            fix[(book, ch, v, i)] = gent[w] + tail(g)
    return A.edit_tokens(fix, dry)


def pass_unrelated(dry):
    """A gloss that is a real English word belonging to no sense of its
    Spanish word, where the verse's own English vouches for the replacement.
    Catches what drift and junk cannot: `erigio` glossed "pass", `viajo`
    glossed "toed" — correctly spelled words with nothing to do with the word
    in front of them."""
    rows = AU.unrelated()
    fix = {(r['book'], r['ch'], r['v'], r['i']): r['to'] for r in rows}
    return A.edit_tokens(fix, dry)


def pass_written_subject(dry):
    """A verb keeps its pronoun only when the subject is NOT written out.

    Spanish puts the subject on either side of the verb -- "yo soy" and "eres
    tu" are both subject + verb -- and when it is written it is its own
    interlinear token. Repeating it on the verb gave "Bendito eres[you-are]
    tu[you]": blessed you are you. The PERSON stays, because English still
    needs it to choose am/are/is; only the pronoun goes."""
    lex, forms, names = A.load()
    fix = {}
    for book, ch, v, en, toks in A.walk_verses():
        for i, (sp, g) in enumerate(toks):
            m = re.match(r'^(I|you|we|they|he|she|it)-(.+)$', g)
            if not m:
                continue
            pron = m.group(1).lower()
            adjacent = False
            for j in (i - 1, i + 1):
                if not (0 <= j < len(toks)):
                    continue
                nb = toks[j][0].lower().strip(A.STRIP)
                if nb in G.SUBJECT_PRONOUNS and \
                        toks[j][1].lower().strip('.,;:!?') == pron:
                    adjacent = True
            if not adjacent:
                continue
            k = sp.lower().strip(A.STRIP)
            src, tr = S.gloss_candidates(S.normalise(k), lex, forms, names)
            if not src or not tr:
                continue
            lemma = src.split(':')[1].split('>')[0] if ':' in src else k
            ctx = A.build_ctx(toks, i, lex, forms)
            cand = G.gloss(k, lemma, tr, S.first_sense, ctx)
            if cand and str(cand) != g.strip('.,;:!?'):
                fix[(book, ch, v, i)] = str(cand) + tail(g)
    return A.edit_tokens(fix, dry)


def pass_enclitics(dry):
    """An enclitic pronoun is part of the word and belongs in its gloss.
    "hacerlo" is "to-do-it", not "do"; "darle" is "to-give-him", not "give"."""
    lex, forms, names = A.load()
    fix = {}
    for book, ch, v, en, toks in A.walk_verses():
        for i, (sp, g) in enumerate(toks):
            k = sp.lower().strip(A.STRIP)
            if not G.split_enclitic(k):
                continue
            src, tr = S.gloss_candidates(S.normalise(k), lex, forms, names)
            lemma = src.split(':')[1].split('>')[0] if src and ':' in src else k
            cand = G.gloss(k, lemma, tr or '', S.first_sense,
                           A.build_ctx(toks, i, lex, forms))
            if cand and str(cand) != g.strip('.,;:!?'):
                fix[(book, ch, v, i)] = str(cand) + tail(g)
    return A.edit_tokens(fix, dry)


def pass_dative_possession(dry):
    """Spanish marks possession with a dative clitic plus a DEFINITE article;
    English puts a possessive in the article's slot.

    "quitarte la vida" is "to take your life": the "your" is carried by the
    -te and lands on the article, not on the verb. So both tokens move — the
    verb drops the clitic ("to-take") and the article becomes the possessive
    ("your") — which is the only split that reads as English across the three.

    Applied only where that verse's own English reads the possessive, because
    the same shape is often a plain dative: "predicarles la palabra" is
    "preach the word UNTO them", not "their word". The canon is KJV, so thy
    and thine count as "your" and mine as "my".
    """
    DAT = {'me': ('my', ('my', 'mine')), 'te': ('your', ('thy', 'thine', 'your')),
           'le': ('his', ('his', 'her')), 'nos': ('our', ('our',)),
           'os': ('your', ('your', 'thy')), 'les': ('their', ('their',))}
    ART = {'la', 'el', 'los', 'las'}
    fix = {}
    for book, ch, v, en, toks in A.walk_verses():
        if not en:
            continue
        low = ' ' + re.sub(r"[^a-z ]+", ' ', en.lower()) + ' '
        for i, (sp, g) in enumerate(toks):
            k = sp.lower().strip(A.STRIP)
            enc = G.split_enclitic(k)
            if not enc or i + 2 >= len(toks):
                continue
            stem, clitic, _kind = enc
            if clitic not in DAT:
                continue
            poss, canon_forms = DAT[clitic]
            if toks[i + 1][0].lower().strip(A.STRIP) not in ART:
                continue
            noun = toks[i + 2][1].strip('.,;:!?').lower()
            if not noun:
                continue
            if not any((' ' + cf + ' ' + noun + ' ') in low for cf in canon_forms):
                continue
            # the verb keeps its infinitive but loses the clitic, which has
            # moved onto the article
            cur = g.strip('.,;:!?')
            m = re.match(r'^(.*)-' + re.escape(G.ENCLITIC_EN[clitic]) + r'$', cur)
            if m:
                fix[(book, ch, v, i)] = m.group(1) + tail(g)
            fix[(book, ch, v, i + 1)] = poss + tail(toks[i + 1][1])
    return A.edit_tokens(fix, dry)


def pass_periphrasis(dry):
    """Verbal periphrasis: the LINK carries the infinitival "to".

    A Spanish periphrasis is [governing verb] + link + [infinitive], and the
    link (a / de / que) is not the preposition it looks like. "tratan de
    quitarte la vida" is "they seek TO take your life" -- glossed de[of] +
    quitarte[to-take] it read "they seek OF TO take", the marker both wrong
    and doubled. English writes the link as "to" and the infinitive goes bare,
    exactly as after `a` and `para`.

    Driven by the periphrasis inventory in spa_gloss -- a closed, enumerable
    class of Spanish grammar -- not by a surface pattern, so "despues de" and
    "a punto de", which are not periphrases, are left to pass_locutions.
    """
    verbs, _t = C.load()
    fix = {}
    for book, ch, v, en, toks in A.walk_verses():
        for i in range(len(toks) - 2):
            gov, link, inf = toks[i], toks[i + 1], toks[i + 2]
            if not G.periphrasis_link(gov[0], link[0]):
                continue
            inf_sp = inf[0].lower().strip(A.STRIP)
            if not (inf_sp in verbs or G.split_enclitic(inf_sp)):
                continue
            link_g = link[1].strip('.,;:!?')
            inf_g = inf[1].strip('.,;:!?')
            if link_g.lower() != 'to':
                fix[(book, ch, v, i + 1)] = 'to' + tail(link[1])
            if inf_g.lower().startswith('to-') and len(inf_g) > 3:
                fix[(book, ch, v, i + 2)] = inf_g[3:] + tail(inf[1])
    return A.edit_tokens(fix, dry)


def pass_locutions(dry):
    """Locuciones prepositivas before an infinitive.

    A second closed class, distinct from the periphrases: "a fin de",
    "a punto de", "antes de", "despues de" are fixed prepositional locutions
    whose final `de` is part of the locution, not the preposition "of". Where
    the locution means purpose or imminence, English writes "to".

    Listed rather than inferred, for the same reason the periphrases are:
    they are enumerable, and a surface rule cannot tell "a fin de edificar"
    (in order TO build) from "tiempo de partir" (the time OF departing).
    """
    PURPOSE = {('fin', 'de'), ('punto', 'de'), ('propósito', 'de'),
               ('objeto', 'de'), ('manera', 'de'), ('modo', 'de')}
    verbs, _t = C.load()
    fix = {}
    for book, ch, v, en, toks in A.walk_verses():
        for i in range(len(toks) - 2):
            head = toks[i][0].lower().strip(A.STRIP)
            link = toks[i + 1][0].lower().strip(A.STRIP)
            if (head, link) not in PURPOSE:
                continue
            inf_sp = toks[i + 2][0].lower().strip(A.STRIP)
            if not (inf_sp in verbs or G.split_enclitic(inf_sp)):
                continue
            link_g = toks[i + 1][1].strip('.,;:!?')
            inf_g = toks[i + 2][1].strip('.,;:!?')
            if link_g.lower() != 'to':
                fix[(book, ch, v, i + 1)] = 'to' + tail(toks[i + 1][1])
            if inf_g.lower().startswith('to-') and len(inf_g) > 3:
                fix[(book, ch, v, i + 2)] = inf_g[3:] + tail(toks[i + 2][1])
    return A.edit_tokens(fix, dry)


PASSES = [
    ('reflexive pronouns', pass_reflexives),
    ('x/y by the verse', pass_xy_witnessed),
    ('x/y by settled usage', pass_xy_settled),
    ('drift + junk repair', pass_repair),
    ('unrelated glosses', pass_unrelated),
    ('gentilics (peoples)', pass_gentilics),
    ('proper names', pass_names),
    ('proper names from the registry', pass_registry_names),
    ('names from the canon of the verse', pass_name_from_canon),
    ('noun/verb homographs, decided per verse', pass_homograph_by_canon),
    ('contested glosses, re-derived', pass_contested),
    ('name capitalisation', pass_name_case),
    ('auxiliary+participle verbs', pass_born),
    ('no+poder units', pass_poder_units),
    ('written subject', pass_written_subject),
    ('enclitic pronouns', pass_enclitics),
    ('verbal periphrasis', pass_periphrasis),
    ('dative of possession', pass_dative_possession),
    ('prepositional locutions', pass_locutions),
]


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true')
    a = ap.parse_args(argv)
    grand = 0
    for name, fn in PASSES:
        ch, files = fn(a.dry_run)
        n = sum(ch.values())
        grand += n
        print("  %-28s %6d tokens in %2d files" % (name, n, files))
    print("  %-28s %6d" % ('TOTAL', grand))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
