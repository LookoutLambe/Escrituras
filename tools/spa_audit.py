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
    return t in vocab or t in EV._reverse()


def is_nonword(g, vocab):
    core = g.lower().replace('-', ' ').replace('\u2014', ' ').replace('\u2013', ' ')
    core = core.strip(' .,;:!?¿¡"')
    if not core or '/' in core:
        return False        # "work/labor" is the x/y ambiguity class, not junk
    toks = [t for t in core.split() if t]
    if len(toks) > 1 and toks[0] in ('i', 'you', 'we', 'they', 'he', 'she', 'it'):
        toks = toks[1:]
    return bool(toks) and all(not _real_word(t, vocab) for t in toks)


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
            drift = content and stripped and all(
                t in FUNCTION_EN for t in stripped.split())
            junk = content and is_nonword(g, vocab)
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
    # (0) you cannot build a verb from the base "the". When the dictionary
    #     entry for the token is itself a function word, inflecting it just
    #     re-applies the defect: "thed", "anded", "to-toe".
    if base:
        b = base.lower().strip()
        if b.startswith('to '):
            b = b[3:].strip()
        if b in FUNCTION_EN:
            return False
    text = str(cand)
    core = text.lower().replace('-', ' ').strip(' .,;:!?')
    parts = [t for t in core.split()
             if t not in ('i', 'you', 'we', 'they', 'he', 'she', 'it',
                          'may', 'might', 'will', 'would', 'shall', 'should',
                          'to', 'be', 'is', 'are', 'was', 'were')]
    if not parts:
        return False
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
    return head in vocab or EV.known(head)


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
