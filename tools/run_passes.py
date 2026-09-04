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
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import spa_apply as A
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
