#!/usr/bin/env python3
"""Detect glosses that do not belong to their own Spanish word.

The dominant defect in this corpus is alignment drift: a token carries English
that belongs to a NEIGHBOUR, or a fragment of the surrounding sentence.

    desprecian   -> "of"          (should be "despise")
    llegado      -> "hour"        (should be "come")
    obstinacion  -> "of"          (should be "stubbornness")
    humillan     -> "truly"       (bled from the adjacent "verdaderamente")
    muestras     -> "ands"        (not English at all)

The test: does the gloss correspond to ANY sense the word itself has? Resolve
the token, collect every English sense of it and of its lemma, reduce both the
gloss and the senses to English base forms, and ask whether they intersect.
No intersection, on a word the dictionary actually knows, means the gloss came
from somewhere else.

Two things keep the false-positive rate down: multiword idiom tokens (he aqui,
a causa de) and proper names are skipped, and so is any token whose gloss the
corpus itself has established as its dominant reading.
"""
import os, re, sys, json
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import spa_lookup as S
import spa_apply as A
import spa_gloss as G
import spa_morph as M
import eng_verbs as EV

_ENGLISH = None

def english_words():
    """A real English dictionary (words_alpha, 370,105 entries).

    The canon is KJV and the verb lexicon only holds verbs, so between them
    they rejected "impetus", "magnitude", "commission", "dense" and
    "mountainous" -- perfectly good glosses the tool had already worked out,
    which then could not be applied. It still rejects what matters: racimos,
    expresamente, foremans, beginns.
    """
    global _ENGLISH
    if _ENGLISH is None:
        path = os.path.join(HERE, 'words_alpha.txt')
        try:
            with open(path, encoding='utf-8') as fh:
                _ENGLISH = {l.strip() for l in fh if l.strip()}
        except OSError:
            _ENGLISH = set()
    return _ENGLISH

STOPGLOSS = {'', '-'}


def senses_of(raw):
    out = set()
    for part in re.split(r'[;,]', raw or ''):
        w = re.sub(r'\(.*?\)', '', part).strip().lower().rstrip('.')
        if w.startswith('to '):
            w = w[3:].strip()
        if w and len(w) < 30:
            out.add(w)
            out.add(EV.base_form(w))
            for tok in w.split():
                out.add(tok)
                out.add(EV.base_form(tok))
    return {x for x in out if x}


def gloss_forms(gl):
    g = (gl or '').lower().replace('-', ' ').strip(' .,;:!?¿¡"')
    out = {g, EV.base_form(g)}
    for tok in g.split():
        out.add(tok)
        out.add(EV.base_form(tok))
    return {x for x in out if x}


# English function words. A Spanish CONTENT word glossed with one of these is
# the signature of alignment drift -- the gloss belongs to a neighbour.
FUNCTION_EN = set("""a an the this that these those and or but nor for so yet
of in on at to by from with without into onto upon over under above below
between among through during before after since until while as if then than
i you he she it we they me him her us them my your his hers its our their
who whom whose which what when where why how not no very too also even
there here all any some each every both either neither one such own same
unto thou thee thy ye whereby wherein whereof therein thereof""".split())
# Auxiliaries and modals are deliberately ABSENT. "was", "could", "be", "been",
# "can", "will" are perfectly good glosses of Spanish verbs -- fue is "was",
# pudo is "could", sed is "be" -- and including them made the detector report
# 1,040 correct glosses of `fue` alone as defects.

# Glosses that are not English at all: a Spanish word left in the English
# column, or a mangled build like "you-is" / "ands".
def _real_word(t, vocab):
    """Attested in the English canon, or EXACTLY a form the lexicon generates.

    Exact membership is the whole point. Asking merely whether some stem looks
    like a verb excused "beginns" and "hads"; asking only the KJV canon
    condemned "abides", "brings" and "prophesies", which are correct modern
    English the canon happens to write as "abideth" and "prophesieth". The
    generated-form set separates them: abides and brings are in it, while
    beginns, hads, kepts, sinns, committs and grievs are not.
    """
    return t in vocab or t in EV._reverse() or t in english_words()


def is_nonword(g, vocab):
    core = g.lower().replace('-', ' ').replace('\u2014', ' ').replace('\u2013', ' ')
    core = core.strip(' .,;:!?¿¡"')
    if not core or '/' in core:
        return False        # "work/labor" is the x/y ambiguity class, not junk
    toks = [t for t in core.split() if t]
    # Strip the pronoun AND the auxiliaries. "was-toing" is "was" + to + ing;
    # keeping "was" in the test made the whole gloss look like real English and
    # hid 111 of them, every one an imperfect-tense verb.
    AUXV = ('i', 'you', 'we', 'they', 'he', 'she', 'it', 'was', 'were', 'is',
            'are', 'be', 'been', 'will', 'would', 'may', 'might', 'shall',
            'should', 'have', 'has', 'had', 'let', 'do', 'does', 'did')
    while len(toks) > 1 and toks[0] in AUXV:
        toks = toks[1:]
    return bool(toks) and all(not _real_word(t, vocab) for t in toks)


_NAMESET = None

def _known_names():
    global _NAMESET
    if _NAMESET is None:
        import json as _json
        out = set()
        for fn, pick in (('canon_names_en.json', None),
                         ('bom_names_es_en.json', 'values')):
            try:
                with open(os.path.join(HERE, fn), encoding='utf-8') as fh:
                    d = _json.load(fh)
                out |= {str(x).lower() for x in (d.values() if pick else d)}
            except OSError:
                pass
        _NAMESET = out
    return _NAMESET


def audit(book_filter=None, chapter_filter=None, limit=None):
    lex, forms, names = A.load()
    try:
        with open(os.path.join(HERE, 'spa_form_choice.json'), encoding='utf-8') as fh:
            learned = json.load(fh)
    except OSError:
        learned = {}
    vocab = G._vocab()
    hits, checked = [], 0
    for book, ch, v, en, toks in A.walk_verses():
        if book_filter and book != book_filter:
            continue
        if chapter_filter and ch != chapter_filter:
            continue
        for i, (sp, gl) in enumerate(toks):
            k = sp.lower().strip(A.STRIP)
            g = gl.strip('.,;:!?¿¡"')
            if not k or g in STOPGLOSS or ' ' in k:
                continue                       # multiword idiom tokens
            if k in learned and learned[k] == g:
                continue                       # the corpus's own settled reading
            if sp[:1].isupper() and k in names:
                continue                       # proper names
            src, tr = S.gloss_candidates(S.normalise(k), lex, forms, names)
            if not src or src == 'name' or not tr:
                continue
            checked += 1
            sen = senses_of(tr)
            lemma = src.split(':')[1].split('>')[0] if ':' in src else None
            if lemma:
                sen |= senses_of(lex.get(lemma) or '')
            if not sen:
                continue
            if gloss_forms(g) & sen:
                continue
            # Only two signatures are reported, because everything else this
            # test flags is a synonym or a plural and not a defect at all:
            # sinagogas->"synagogues", adorar->"worship", echados->"driven".
            pos = M.pos(k)
            content = pos in ('VERB', 'NOUN', 'ADJ', 'ADV', 'PROPN') or (
                lemma and lemma.endswith(('ar', 'er', 'ir')))
            core = g.lower().replace('-', ' ').strip(' .,;:!?¿¡"')
            stripped = ' '.join(t for t in core.split()
                                if t not in ('i', 'you', 'we', 'they', 'he', 'she', 'it'))
            # A bare auxiliary is a fine gloss for ser/estar/haber/ir -- fue
            # IS "was" -- but on any other verb it is a neighbour's word:
            # sembrado ("sown") glossed "is".
            AUXONLY = {'is', 'are', 'was', 'were', 'be', 'been', 'being',
                       'have', 'has', 'had', 'do', 'does', 'did', 'will',
                       'shall', 'would', 'should', 'may', 'might', 'can'}
            copula = lemma in ('ser', 'estar', 'haber', 'ir', 'poder', 'deber')
            aux_drift = (content and not copula and stripped
                         and all(t in AUXONLY for t in stripped.split()))
            bare_pronoun = content and not stripped and core
            drift = bare_pronoun or aux_drift or (content and stripped and all(
                t in FUNCTION_EN for t in stripped.split()))
            # A gloss that is not English is a defect whatever the Spanish
            # word's part of speech: "a" glossed "toing" and "de" glossed
            # "ofs" are broken regardless, and requiring a CONTENT word here
            # hid 1,478 of them.
            junk = is_nonword(g, vocab)
            if not (drift or junk):
                continue
            neighbour = ''
            for j in (i - 1, i + 1):
                if 0 <= j < len(toks) and g and g.lower() in toks[j][1].lower():
                    neighbour = toks[j][0]
            hits.append({'book': book, 'ch': ch, 'v': v, 'sp': sp, 'gloss': gl,
                         'lemma': lemma or k, 'senses': sorted(sen)[:4],
                         'bled_from': neighbour,
                         'kind': 'drift' if drift else 'junk'})
            if limit and len(hits) >= limit:
                return hits, checked
    return hits, checked


def _acceptable(cand, k, lex, forms, names, base=None):
    """Refuse a repair that is not actually an improvement.

    Three ways the re-derivation can fail, all seen in a dry run:
      the -> "thed", and -> "anded"   the dictionary entry for the token IS a
                                      function word, so inflecting it inflects
                                      the defect
      unas -> "you-may-some"          a determiner matched a verb homograph in
                                      the conjugation index
      nace -> "borns"                 the built English is not a word
    """
    if not cand:
        return False
    text = str(cand)
    # (0) you cannot build a verb from the base "the". When the dictionary
    #     entry for the token is itself a function word, inflecting it just
    #     re-applies the defect: "thed", "anded", "toing". Returning it
    #     unchanged ("to") is the correct answer and must be allowed.
    if base:
        b = base.lower().strip()
        if b.startswith('to '):
            b = b[3:].strip()
        if b in FUNCTION_EN and text.lower().strip('.,;:!? ') != b:
            return False
    core = text.lower().replace('-', ' ').strip(' .,;:!?')
    parts = [t for t in core.split()
             if t not in ('i', 'you', 'we', 'they', 'he', 'she', 'it',
                          'may', 'might', 'will', 'would', 'shall', 'should',
                          'to', 'be', 'is', 'are', 'was', 'were')]
    if not parts:
        # the whole gloss is a function word: right for a preposition or
        # article ("a" -> "to", "el" -> "the"), which is exactly the repair
        # for `a` glossed "toing"
        return bool(base) and text.lower().strip('.,;:!? ') == (
            base[3:].strip().lower() if base.lower().startswith('to ')
            else base.lower().strip())
    # (1) still a bare function word -> the defect was re-applied
    if all(t in FUNCTION_EN for t in parts):
        return False
    # (2) the token is closed-class; a verb reading is a homograph accident
    if M.pos(k) in ('DET', 'PRON', 'ADP', 'CCONJ', 'SCONJ', 'NUM', 'PROPN'):
        return False
    # (3) the built English must be real: known to the verb lexicon or to the
    #     corpus's own English vocabulary
    # (3) the result must be well formed. Detection is strict against the
    #     canon, but a REPAIR is built from a known infinitive by a known rule,
    #     so trusting that construction is right -- it is how a correct modern
    #     form ("prophesies", "abides") is allowed where the KJV canon only
    #     has "prophesieth" and "abideth".
    if base:
        b = base.lower().strip()
        if b.startswith('to '):
            b = b[3:].strip()
        if EV.known(b) or EV.known(b.split()[0] if b else ''):
            return True
    vocab = G._vocab()
    head = parts[-1]
    return head in vocab or EV.known(head) or head in english_words()


def repair(hits, dry_run=True):
    """Re-derive the glosses the detector proved wrong.

    Safe precisely because the detector only reports a CONTENT word carrying an
    English FUNCTION word: that gloss cannot be right, so re-deriving it from
    the dictionary and the conjugation tag can only improve it. The normal
    pipeline is used, so the noun/reflexive context gates and the learned
    vocabulary all still apply.
    """
    lex, forms, names = A.load()
    want = {}
    for h in hits:
        want.setdefault((h['sp'], h['gloss']), 0)
        want[(h['sp'], h['gloss'])] += 1
    changes, files = Counter(), 0
    import glob as _glob
    for path in sorted(_glob.glob(os.path.join(os.path.dirname(HERE), 'verses', '*.js'))):
        src = open(path, encoding='utf-8').read()

        def verse(vm):
            toks = A.TOK.findall(vm.group(2))
            out, hit = [], False
            for i, (sp, en) in enumerate(toks):
                new = en
                if (sp, en) in want and not sp[:1].isupper():
                    # a capitalised token is a name far more often than a verb;
                    # Jalon was being "repaired" to "jerk". Names have their own
                    # canon-confirmed pass.
                    k = sp.lower().strip(A.STRIP)
                    prev = toks[i - 1][0] if i else ''
                    forced = G.reflexive_position(prev)
                    s2, tr = S.gloss_candidates(S.normalise(k), lex, forms, names,
                                                prefer_verb=forced)
                    lemma = s2.split(':')[1].split('>')[0] if s2 and ':' in s2 else k
                    cand = G.gloss(k, lemma, tr or k, S.first_sense,
                                   A.build_ctx(toks, i, lex, forms))
                    if cand is None:
                        # The noun and reflexive gates return None meaning
                        # "keep what is there" -- correct for a sound gloss,
                        # wrong for one already proved junk. "se hincha" was
                        # left reading "beginns" because of the reflexive gate.
                        cand = G.gloss(k, lemma, tr or k, S.first_sense,
                                       {'prev_surface': ''})
                    cand = cand if _acceptable(cand, k, lex, forms, names,
                                               S.first_sense(tr or '')) else None
                    if cand:
                        t = A.TAIL.search(en)
                        new = str(cand) + (t.group(1) if t else '')
                if new != en:
                    changes[(en, new)] += 1
                    hit = True
                out.append('["%s","%s"]' % (sp, new))
            return vm.group(0) if not hit else '{num:%s,words:[%s]}' % (vm.group(1), ','.join(out))

        new_src = A.VERSE.sub(verse, src)
        if new_src != src:
            files += 1
            if not dry_run:
                open(path, 'w', encoding='utf-8').write(new_src)
    return changes, files


def main(argv):
    bk = argv[0] if argv else None
    ch = int(argv[1]) if len(argv) > 1 else None
    hits, checked = audit(bk, ch)
    print("  checked %d resolvable tokens, %d glosses unrelated to their word (%.1f%%)\n"
          % (checked, len(hits), 100 * len(hits) / checked if checked else 0))
    for h in hits[:60]:
        b = ('  <- from "%s"' % h['bled_from']) if h['bled_from'] else ''
        print("   %-5s %-9s %s:%-3s %-15s %-14s -> %s%s"
              % (h['kind'], h['book'], h['ch'], h['v'], h['sp'],
                 '"' + h['gloss'] + '"', ', '.join(h['senses'][:3]), b))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))


def sense_mismatch(book_filter=None, chapter_filter=None):
    """Find glosses that picked the WRONG SENSE of a word they do know.

    Neither the drift nor the junk detector can see these: "fan" for `hincha`
    is a real English word, a content word, and a genuine dictionary sense --
    it is simply the modern one (a football supporter) where scripture means
    "swell". The witness is the printed English of that very verse: it reads
    "swelleth", and the word "fan" appears nowhere in it.

    Reported only when BOTH hold, which is what makes it precise:
      - no inflection of the current gloss appears in the verse's English, AND
      - some OTHER sense of the same Spanish word does appear there.
    The second condition supplies the replacement and proves it belongs.
    """
    lex, forms, names = A.load()
    vocab = G._vocab()
    out = []
    for book, ch, v, en, toks in A.walk_verses():
        if book_filter and book != book_filter:
            continue
        if chapter_filter and ch != chapter_filter:
            continue
        if not en:
            continue
        words = set(re.findall(r"[a-z']+", en.lower()))
        # compare BASE forms both ways: the canon writes "did preach" where the
        # gloss says "preached", and matching the surface only reported that
        # correct gloss as a mismatch
        low = words | {EV.base_form(w) for w in words} | {w.rstrip('s') for w in words}
        for i, (sp, gl) in enumerate(toks):
            k = sp.lower().strip(A.STRIP)
            g = gl.strip('.,;:!?¿¡"—').lower()
            if not k or not g or ' ' in k or '/' in g or sp[:1].isupper():
                continue
            if M.pos(k) in ('DET', 'PRON', 'ADP', 'CCONJ', 'SCONJ', 'NUM'):
                continue
            head = [t for t in g.replace('-', ' ').split()
                    if t not in ('i', 'you', 'we', 'they', 'he', 'she', 'it',
                                 'to', 'will', 'would', 'may', 'might', 'shall',
                                 'should', 'be', 'is', 'are', 'was', 'were')]
            if not head:
                continue
            cur = head[-1]
            if len(cur) < 4:
                continue
            if _appears(cur, low):
                continue                       # the gloss is attested here
            src, tr = S.gloss_candidates(S.normalise(k), lex, forms, names)
            if not src or not tr:
                continue
            for cand in senses_of(tr):
                if len(cand) < 4 or cand == cur or ' ' in cand:
                    continue
                if _appears(cand, low):
                    out.append({'book': book, 'ch': ch, 'v': v, 'sp': sp,
                                'gloss': gl, 'was': cur, 'should': cand})
                    break
    return out


def _appears(word, bases):
    """Is this English word, in any ordinary inflection, in the verse text?"""
    stem = word.rstrip('s')
    cands = {word, stem, EV.base_form(word), EV.base_form(stem),
             word + 's', word + 'es', word + 'ed', word + 'ing',
             stem + 'eth', stem + 'est', stem + 'ed', stem + 'es', stem + 'ing',
             EV.third(word), EV.past(word), EV.participle(word), EV.ing(word)}
    return bool(cands & bases)


def repair_sense(rows, dry_run=True):
    """Switch a gloss to the sense the verse's own English attests.

    `rows` come from sense_mismatch(): the current gloss's word is absent from
    the printed English of that verse, and another sense of the same Spanish
    word is present. The replacement is re-inflected through the normal
    pipeline, so "they-arrived" becomes "they-came" and not "they-come".
    """
    lex, forms, names = A.load()
    want = {}
    for r in rows:
        want[(r['sp'], r['gloss'])] = r['should']
    changes, files = Counter(), 0
    import glob as _glob
    for path in sorted(_glob.glob(os.path.join(os.path.dirname(HERE), 'verses', '*.js'))):
        src = open(path, encoding='utf-8').read()

        def verse(vm):
            toks = A.TOK.findall(vm.group(2))
            out, hit = [], False
            for i, (sp, en) in enumerate(toks):
                new = en
                target = want.get((sp, en))
                if target and not sp[:1].isupper():
                    k = sp.lower().strip(A.STRIP)
                    s2, tr = S.gloss_candidates(S.normalise(k), lex, forms, names)
                    lemma = s2.split(':')[1].split('>')[0] if s2 and ':' in s2 else k
                    ctx = A.build_ctx(toks, i, lex, forms)
                    ctx['keep_verb'] = target
                    cand = G.gloss(k, lemma, tr or k, S.first_sense, ctx)
                    if cand is None:
                        ctx = {'prev_surface': '', 'keep_verb': target}
                        cand = G.gloss(k, lemma, tr or k, S.first_sense, ctx)
                    if cand and _acceptable(cand, k, lex, forms, names, 'to ' + target):
                        t = A.TAIL.search(en)
                        new = str(cand) + (t.group(1) if t else '')
                if new != en:
                    changes[(en, new)] += 1
                    hit = True
                out.append('["%s","%s"]' % (sp, new))
            return vm.group(0) if not hit else '{num:%s,words:[%s]}' % (vm.group(1), ','.join(out))

        new_src = A.VERSE.sub(verse, src)
        if new_src != src:
            files += 1
            if not dry_run:
                open(path, 'w', encoding='utf-8').write(new_src)
    return changes, files


_CANON_DF = None

def _canon_df():
    """How many verses each English word appears in. A word that turns up in
    thousands of verses proves nothing about one token: "pass" is in every
    "it came to pass", so its presence was shielding every token wrongly
    glossed "pass" -- including `erigio`, which means "erected"."""
    global _CANON_DF
    if _CANON_DF is None:
        df, n = Counter(), 0
        for _b, _c, _v, en, _t in A.walk_verses():
            if not en:
                continue
            n += 1
            for w in set(re.findall(r"[a-z']+", en.lower())):
                df[w] += 1
        _CANON_DF = (df, max(n, 1))
    return _CANON_DF


def _common_in_canon(w):
    df, n = _canon_df()
    return df.get(w, 0) / n > 0.02          # in more than 2% of verses


def unrelated(book_filter=None, chapter_filter=None):
    """A gloss that is a real English word belonging to no sense of its word.

    Neither drift nor junk sees these: "pass" for `erigio` (to erect) and
    "toed" for `viajo` (to travel) are ordinary content words, correctly
    spelled. They simply have nothing to do with the Spanish in front of them.

    Four conditions, all required, because each one alone over-fires:
      1. the gloss is not any sense of this word, NOR an inflection of one;
      2. the gloss does NOT appear in that verse's printed English -- which is
         what protects a legitimate idiomatic rendering. `hechos` glossed
         "proceedings" is not a dictionary sense of hecho, but 1 Nephi 1:1
         reads "my proceedings", so it stays;
      3. the tool's own derivation IS a sense of the word, so there is a real
         answer to replace it with rather than a guess.
    """
    lex, forms, names = A.load()
    out = []
    for book, ch, v, en, toks in A.walk_verses():
        if book_filter and book != book_filter:
            continue
        if chapter_filter and ch != chapter_filter:
            continue
        if not en:
            continue
        canon = set(re.findall(r"[a-z']+", en.lower()))
        canon |= {EV.base_form(w) for w in canon}
        for i, (sp, gl) in enumerate(toks):
            k = sp.lower().strip(A.STRIP)
            g = gl.strip('.,;:!?¿¡"')
            if not k or not g or ' ' in k or '/' in g or sp[:1].isupper():
                continue
            if M.pos(k) in ('DET', 'PRON', 'ADP', 'CCONJ', 'SCONJ', 'NUM', 'PROPN'):
                continue
            head = [t for t in g.lower().replace('-', ' ').split()
                    if t not in ('i', 'you', 'we', 'they', 'he', 'she', 'it', 'to',
                                 'will', 'would', 'may', 'might', 'shall', 'should',
                                 'be', 'is', 'are', 'was', 'were', 'have', 'has', 'had')]
            if not head:
                continue
            cur = head[-1]
            if len(cur) < 3:
                continue
            if (cur in canon or EV.base_form(cur) in canon) and not _common_in_canon(cur):
                # The canon uses this very word here, and it is rare enough
                # that its presence means something -- `hechos` glossed
                # "proceedings" is not a dictionary sense of hecho, but
                # 1 Nephi 1:1 reads "my proceedings", so it stays.
                continue
            src, tr = S.gloss_candidates(S.normalise(k), lex, forms, names)
            if not src or not tr or src == 'name':
                continue
            sen = senses_of(tr)
            if gloss_forms(g) & sen:
                continue                       # it IS a sense of this word
            lemma = src.split(':')[1].split('>')[0] if ':' in src else k
            cand = G.gloss(k, lemma, tr, S.first_sense, A.build_ctx(toks, i, lex, forms)) \
                or G.gloss(k, lemma, tr, S.first_sense, {'prev_surface': ''})
            if not cand:
                continue
            if not (gloss_forms(str(cand)) & sen):
                continue                       # the replacement must belong too
            # 4. and the replacement must be ATTESTED IN THIS VERSE. Without
            #    this the detector traded one defensible word for another:
            #    "afflicted" for "distressed", "placed" for "position", and
            #    "descendants" for "descendant", losing the plural. With it,
            #    only a change the printed English actually vouches for lands.
            rep = [t for t in str(cand).lower().replace('-', ' ').split()
                   if t not in ('i', 'you', 'we', 'they', 'he', 'she', 'it', 'to',
                                'will', 'would', 'may', 'might', 'shall', 'should',
                                'be', 'is', 'are', 'was', 'were', 'have', 'has', 'had')]
            if not rep or not (rep[-1] in canon or EV.base_form(rep[-1]) in canon):
                continue
            out.append({'book': book, 'ch': ch, 'v': v, 'i': i, 'sp': sp,
                        'gloss': gl, 'to': str(cand) + (
                            re.search(r'([^\w\- ]+)$', gl).group(1)
                            if re.search(r'([^\w\- ]+)$', gl) else '')})
    return out


# ══════════════════════════════════════════════════════════════════════════
# POSITIONAL DRIFT — the English laid down in ENGLISH order on Spanish tokens
#
# D&C 117:1 audits CLEAN under every test above and reads like this:
#
#     arreglen  -> "they-servant"     negocios -> "marks"
#     Marks     -> "my"               Whitney, -> "k,"
#
# The Spanish says "arreglen sus negocios rápidamente mis siervos William
# Marks"; the English says "unto my servant William Marks ... let them settle
# up their business speedily". Somebody walked the two in parallel and the
# orders do not match, so each token got whatever English word stood at its
# index. Every gloss is a real word FROM THE VERSE, which is exactly why no
# junk test and no non-English test can see it.
#
# The signature that does see it is OWNERSHIP. One English content word belongs
# to one Spanish token. A gloss word is CONTESTED when
#
#   1. it is not a sense of the word it sits on, and
#   2. it does appear in the verse's printed English, and
#   3. some OTHER token in the verse can mean it -- or is the proper name it
#      is a copy of.
#
# Condition 2 is what separates this from ordinary vocabulary error, and
# condition 3 is what separates it from register: `sobre -> "upon"` satisfies
# 1 and 2 in almost every verse it occurs in, and is CORRECT -- no other token
# in the verse has any claim on "upon", so nothing is contested and it passes.
# ══════════════════════════════════════════════════════════════════════════
import functools as _ft
import eng_sense as ES

_PRONOUN_PREFIX = {'i', 'you', 'we', 'they', 'he', 'she', 'it',
                   'my', 'your', 'his', 'her', 'our', 'their', 'its'}

# Shared by construction, so never "contested": every clause can carry a
# copula, and every infinitive an infinitival "to".
_AUX_SHARED = {'be', 'is', 'am', 'are', 'was', 'were', 'been', 'being',
               'have', 'has', 'had', 'do', 'does', 'did', 'will', 'shall',
               'would', 'should', 'may', 'might', 'can', 'could', 'must',
               'let', 'there', 'to'}


def _looks_like_name(k, sp, senses):
    """A capitalised token that the lexicon cannot render as a common word."""
    if k in _known_names():
        return True
    if senses:
        return False              # capitalised but the dictionary knows it
    # Adán-ondi-Ahmán and Olaha Shinehah carry internal capitals after a
    # hyphen; a pattern that allowed only lowercase after the first letter
    # rejected them, and they are exactly the names this rule is for.
    return bool(re.match(r"^[A-ZÁÉÍÓÚÑ][a-záéíóúñ'.]*(?:[-'][A-Za-zÁÉÍÓÚÑáéíóúñ]+)*\.?$",
                         sp.strip(A.STRIP)))


def _gloss_is_name_of(g, k):
    """Does the gloss spell this name? Accent- and orthography-folded, so
    Adán-ondi-Ahmán -> "adan-ondi-ahman" counts and so does Sion -> "zion"."""
    import learn_register as LR
    a = LR._fold(k)
    for part in g.replace('-', ' ').split():
        b = LR._fold(part)
        if b and (a.startswith(b[:4]) or b.startswith(a[:4]) or a == b):
            return True
    return LR._same_name(k, g.replace('-', ' ').split()[0]) if g else False


@_ft.lru_cache(maxsize=1)
def _register():
    try:
        with open(os.path.join(HERE, 'spa_register.json'), encoding='utf-8') as fh:
            return {k: v['gloss'] if isinstance(v, dict) else v
                    for k, v in json.load(fh).items()}
    except OSError:
        return {}


def _resolve(k, lex, forms, names):
    """(senses, is_name) for one surface form. Cached: the corpus is 1.07M
    tokens over ~60k types, so resolving per occurrence is 18x the work."""
    src, tr = S.gloss_candidates(S.normalise(k), lex, forms, names)
    if not src or not tr:
        return set(), src == 'name'
    sen = ES.spread(tr)
    if ':' in str(src):
        lemma = str(src).split(':')[1].split('>')[0]
        sen |= ES.spread(lex.get(lemma) or '')
    reg = _register().get(k)
    if reg:
        sen |= ES.spread(reg)
    return sen, src == 'name'


def positional(book_filter=None, chapter_filter=None):
    lex, forms, names = A.load()
    cache = {}

    def res(k):
        if k not in cache:
            cache[k] = _resolve(k, lex, forms, names)
        return cache[k]

    hits, verses = [], 0
    for book, ch, v, en, toks in A.walk_verses():
        if book_filter and book != book_filter:
            continue
        if chapter_filter and ch != chapter_filter:
            continue
        if not en:
            continue
        verses += 1
        enw = set()
        for w in re.findall(r"[A-Za-z']+", en.lower()):
            enw |= ES.variants(w)
        # every token's senses, and the fold of its own surface (a proper name
        # owns its own spelling even when the lexicon has never heard of it)
        sens, surf = [], []
        for sp, gl in toks:
            k = sp.lower().strip(A.STRIP)
            s, _isname = res(k) if k and ' ' not in k else (set(), False)
            sens.append(s)
            surf.append(ES.variants(k))
        for i, (sp, gl) in enumerate(toks):
            g = gl.lower().strip(' .,;:!?¿¡"')
            core = [t for t in g.replace('-', ' ').split()
                    if t and t not in _PRONOUN_PREFIX and t not in STOPGLOSS]
            k = sp.lower().strip(A.STRIP)

            # ── RULE A: a proper name glosses as itself, and nothing else.
            # Marks -> "my", Whitney -> "k", Granger -> "but", Olaha ->
            # "plains", Adan-ondi-Ahman -> "be". The name is right there in the
            # English; the gloss is whatever word fell at that index instead.
            # This needs no ownership test and no dictionary: a capitalised
            # token mid-sentence whose gloss is not its own spelling is wrong.
            gparts = g.replace('-', ' ').split()
            if (gparts and sp[:1].isupper() and i > 0 and len(k) > 1
                    and not (ES.variants(gparts[0]) & surf[i])):
                folded = ES._fold_name(k) if hasattr(ES, '_fold_name') else k
                if _looks_like_name(k, sp, sens[i]) and not _gloss_is_name_of(g, k):
                    hits.append({'book': book, 'ch': ch, 'v': v, 'i': i,
                                 'rule': 'name', 'sp': sp, 'gloss': gl,
                                 'word': (core[0] if core else g),
                                 'owner': '(itself)',
                                 'english': en,
                                 'owner_gloss': sp.strip(A.STRIP)})
                    continue

            # Rule B needs a content word; Rule A above does not, and must
            # run first. `Marks` glossed "my" has no content word at all, and
            # an early `if not core: continue` skipped it before the name rule
            # could see it -- so the one token whose gloss was purely a stolen
            # possessive was the one the detector could not report.
            if not core:
                continue

            # ── RULE B: a CONTENT word contested by another token.
            # Restricted to content words on purpose. Function words and
            # copulas are legitimately shared -- the infinitival "to" of
            # `guardarla -> "to-keep-it"` duplicates the "to" of `para`, and
            # `hay -> "there-is"` duplicates the "be" of `sea`, and both are
            # correct. Requiring a content word drops those without a list of
            # exceptions.
            for w in core:
                if w in FUNCTION_EN or w in _AUX_SHARED:
                    continue
                wv = ES.variants(w)
                if wv & sens[i] or wv & surf[i]:
                    continue                       # the token owns it
                if not (wv & enw):
                    continue                       # not from this sentence
                owners = [j for j in range(len(toks))
                          if j != i and (wv & sens[j] or wv & surf[j])]
                if not owners:
                    continue                       # register/synonym, not drift
                hits.append({'book': book, 'ch': ch, 'v': v, 'i': i,
                             'rule': 'contested', 'sp': sp, 'gloss': gl,
                             'word': w, 'owner': toks[owners[0]][0],
                             'english': en,
                             'owner_gloss': toks[owners[0]][1]})
                break
    return hits, verses


def main_positional(argv):
    bk = argv[0] if argv else None
    chn = int(argv[1]) if len(argv) > 1 else None
    hits, verses = positional(bk, chn)
    print('  %d contested glosses across %d verses\n' % (len(hits), verses))
    for h in hits[:80]:
        print('   %-9s %-9s %s:%-4s %-18s %-18s  "%s" belongs to %s (%s)'
              % (h.get('rule', ''), h['book'], h['ch'], h['v'], h['sp'],
                 '"' + h['gloss'] + '"', h['word'], h['owner'], h['owner_gloss']))
    return 0
