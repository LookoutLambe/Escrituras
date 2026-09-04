#!/usr/bin/env python3
"""Apply the gloss tool to the interlinear corpus.

The one home for "walk verses/*.js and re-gloss". Every gloss decision lives
in spa_gloss.py and every lookup in spa_lookup.py; this file only supplies
each token its verse context and writes the result back.

    python3 tools/spa_apply.py --keys salvo,salvos          # re-gloss those
    python3 tools/spa_apply.py --contextual                 # all CONTEXTUAL
    python3 tools/spa_apply.py --contextual --dry-run
    python3 tools/spa_apply.py --score salvo                # vs english canon
"""
import re, os, sys, json, glob, argparse
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import spa_lookup as S
from spa_gloss import gloss as shape, CONTEXTUAL, SCRIPTURAL

TOK   = re.compile(r'\["((?:[^"\\]|\\.)*)",\s*"((?:[^"\\]|\\.)*)"\]')
VERSE = re.compile(r'\{num:(\d+),words:\[(.*?)\]\}', re.S)
SET   = re.compile(r"var (\w+) = \[(.*?)\];\s*renderVerseSet\(\1, '([^']+)-verses'\)", re.S)
STRIP = '.,;:¿?¡!»«()"“”— '
TAIL  = re.compile(r'([^\w\- ]+)$')


def load():
    lex, forms = S.load_lexicon(), S.load_lemmas()
    names = json.load(open(os.path.join(HERE, 'bom_names_es_en.json'), encoding='utf-8'))
    gaz = set(json.load(open(os.path.join(HERE, 'canon_names_en.json'), encoding='utf-8')))
    return lex, forms, names


def build_ctx(toks, i, lex, forms):
    """Verse context for token i: preceding lemmas, and what follows it."""
    prev = [S.context_lemma(t[0].strip(STRIP), forms) for t in toks[max(0, i - 4):i]]
    nxt  = toks[i + 1][0] if i + 1 < len(toks) else ''
    return {
        'prev': prev,
        'prev_surface': toks[i - 1][0] if i else '',
        'comma_after': toks[i][0].rstrip().endswith(','),
        'next_finite_verb': S.is_finite_verb(nxt.strip(STRIP), lex, forms) if nxt else False,
    }


def senses(translation):
    """Every English verb the dictionary lists for this word, bare."""
    out = []
    for part in re.split(r'[;,]', translation or ''):
        w = re.sub(r'\(.*?\)', '', part).strip()
        if w.lower().startswith('to '):
            w = w[3:].strip()
        if w and ' ' not in w:
            out.append(w.lower())
    return out


def keep_verb_for(old_gloss, translation):
    """The verb ALREADY in the gloss, when it is one of this word's senses.

    Preserves the translator's word choice and corrects only the inflection:
    empezar lists "start" first, but the gloss says "began", so the result is
    "they-began" and not "they-started". Returns None when the existing gloss
    is not a sense of this word -- which is what stops `vino` glossed "wine"
    from being rebuilt as "wined".
    """
    import spa_gloss as G
    core = _core(old_gloss)
    if not core:
        return None
    for v in senses(translation):
        if core in {v, G._third(v), G._past(v), G._parti(v), G._ing(v)}:
            return v
    return None


_AUX = ('to', 'will', 'would', 'may', 'might', 'should', 'shall', 'let',
        'do', 'does', 'did', 'have', 'has', 'had', 'be', 'is', 'are',
        'was', 'were', 'been', 'being', 'i', 'you', 'we', 'they', 'he', 'she', 'it')


def _core(g):
    w = (g or '').lower().replace('-', ' ').strip(' .,;:!?')
    parts = [x for x in w.split() if x not in _AUX]
    return parts[-1] if parts else ''


def same_verb(old, new, base):
    """True when old and new are two FORMS OF THE SAME English verb.

    The guard that makes a corpus-wide re-inflection safe. Re-deriving every
    verb-shaped token from the dictionary proposed `vino` wine -> "came",
    `medio` midst -> "medium" and `segun` according-to -> "in agreement":
    homograph nouns that merely look like verb forms, plus good glosses thrown
    away for a worse first dictionary sense. So only rewrite when the existing
    gloss is ALREADY a shape of this verb and only its tense is wrong --
    "shall-be" -> "will be", never "wine" -> "came".
    """
    import spa_gloss as G
    if not base.startswith('to '):
        return False
    v = base[3:].strip()
    if not v:
        return False
    shapes = {v, G._third(v), G._past(v), G._parti(v), G._ing(v)}
    aux = ('to', 'will', 'would', 'may', 'might', 'should', 'shall', 'let',
           'do', 'does', 'did', 'have', 'has', 'had', 'be', 'is', 'are',
           'was', 'were', 'been', 'being')
    return _core(old) in shapes and _core(new) in shapes


def regloss(keys, dry_run=False, verb_guard=False):
    lex, forms, names = load()
    changes, files = Counter(), 0
    for path in sorted(glob.glob(os.path.join(ROOT, 'verses', '*.js'))):
        src = open(path, encoding='utf-8').read()

        def verse(vm):
            toks = TOK.findall(vm.group(2))
            out, hit = [], False
            for i, (sp, en) in enumerate(toks):
                k, new = sp.lower().strip(STRIP), en
                if k in keys:
                    src2, tr = S.gloss_candidates(S.normalise(k), lex, forms, names)
                    lemma = src2.split(':')[1].split('>')[0] if src2 and ':' in src2 else k
                    t = TAIL.search(en)
                    ctx = build_ctx(toks, i, lex, forms)
                    if verb_guard:
                        ctx['keep_verb'] = keep_verb_for(en, tr or '')
                    cand = shape(k, lemma, tr or k, S.first_sense, ctx)
                    if cand is not None and verb_guard and \
                            not same_verb(en, cand, S.first_sense(tr or '')):
                        cand = None
                    if cand is not None:
                        new = cand + (t.group(1) if t else '')
                if new != en:
                    changes[(en, new)] += 1
                    hit = True
                out.append('["%s","%s"]' % (sp, new))
            return vm.group(0) if not hit else '{num:%s,words:[%s]}' % (vm.group(1), ','.join(out))

        new_src = VERSE.sub(verse, src)
        if new_src != src:
            files += 1
            if not dry_run:
                open(path, 'w', encoding='utf-8').write(new_src)
    return changes, files


def modernise_all(dry_run=False):
    """Rewrite archaic -est/-eth verbs in every gloss. Text-only: the Spanish
    is untouched and no gloss is re-derived from the dictionary."""
    from spa_gloss import modernise
    changes, files = Counter(), 0
    for path in sorted(glob.glob(os.path.join(ROOT, 'verses', '*.js'))):
        src = open(path, encoding='utf-8').read()

        def one(m):
            sp, en = m.group(1), m.group(2)
            new = modernise(en)
            if new != en:
                changes[(en, new)] += 1
                return '["%s","%s"]' % (sp, new)
            return m.group(0)

        new_src = TOK.sub(one, src)
        if new_src != src:
            files += 1
            if not dry_run:
                open(path, 'w', encoding='utf-8').write(new_src)
    return changes, files


def apply_names(dry_run=False):
    """Gloss proper names as names, confirmed verse by verse by the canon.

    Two witnesses, because neither alone is safe: the name table (built from
    the canon's own name inventory plus the regular Spanish/English spelling
    correspondences) AND the printed English of that very verse containing the
    name. "Alma" means soul and is also a proper name; only the canon settles
    which one a given verse means.
    """
    names = json.load(open(os.path.join(HERE, 'bom_names_es_en.json'), encoding='utf-8'))
    gaz = set(json.load(open(os.path.join(HERE, 'canon_names_en.json'), encoding='utf-8')))
    changes, files = Counter(), 0
    per_file = defaultdict(dict)
    for book, ch, v, en, toks in walk_verses():
        if not en:
            continue
        for sp, gl in toks:
            w = sp.strip('.,;:¿?¡!»«()"“”—')
            if not w or not w[:1].isupper():
                continue
            target = names.get(w.lower())
            cur = gl.strip('.,;:!?')
            if not target or cur == target:
                continue
            # Never overwrite a gloss that is ALREADY a properly capitalised
            # scripture name: the canon carries both the OT and the NT Greek
            # spelling of several names, and co-occurrence picked the NT one --
            # Hezekiah -> "Ezekias", Noah -> "Noe", Manasseh -> "Manasses".
            # Apply only two safe cases: a pure capitalisation fix, or a gloss
            # that is not a scripture name at all ("soul" -> Alma). If it is
            # already some OTHER name, leave it: the canon carries both the OT
            # and the NT Greek spelling (Hezekiah/Ezekias, Noah/Noe,
            # Manasseh/Manasses) and co-occurrence picks the wrong one.
            if cur.lower() != target.lower() and cur.lower() in gaz:
                continue
            if re.search(r'\b' + re.escape(target) + r'\b', en):
                per_file[(sp, gl)] = target
    if not per_file:
        return changes, 0
    for path in sorted(glob.glob(os.path.join(ROOT, 'verses', '*.js'))):
        src = open(path, encoding='utf-8').read()

        def one(m):
            sp, gl = m.group(1), m.group(2)
            target = per_file.get((sp, gl))
            if not target:
                return m.group(0)
            tail = re.search(r'([^\w\- ]+)$', gl)
            new = target + (tail.group(1) if tail else '')
            changes[(gl, new)] += 1
            return '["%s","%s"]' % (sp, new)

        new_src = TOK.sub(one, src)
        if new_src != src:
            files += 1
            if not dry_run:
                open(path, 'w', encoding='utf-8').write(new_src)
    return changes, files


def apply_persons(dry_run=False):
    """Prepend the subject pronoun the Spanish verb already carries.

    Spanish is pro-drop: "salieron" IS "they went out". The gloss must say so.
    This pass does NOT re-derive the verb -- it only adds the pronoun -- which
    is why it can fix "went-out" and "began" where a re-derivation cannot: the
    dictionary's first sense for salir is "leave" and for empezar is "start",
    so rebuilding would overwrite the translator's word choice, and the
    same-verb guard rightly blocks it.

    3rd singular is left bare: he/she/it cannot be chosen without knowing the
    subject, and English marks it with -s already.
    """
    import spa_conjug, spa_gloss, spa_morph
    lex, forms, names = load()
    PRON = spa_gloss.PRONOUN
    already = re.compile(r'^(i|you|we|they|he|she|it|thou|ye)\b', re.I)
    # The pronoun may only be added to a gloss that is itself a verb. Some
    # tokens carry a wrong gloss already ("the", "and") and prefixing those
    # gives "they-the". A bare irregular participle is skipped too: "seen"
    # with a preterite tag needs "saw", and "I-seen" is not English.
    STOP_EN = set("""the and of in to a an that this these those for with by from as at
        on or but not no all which who whom what when where there here so then thus yes
        yea also even still very more most out up down upon unto into his her their my
        your our its him them us me one two three now behold therefore because if
        while after before until since about against over under between among""".split())
    import eng_verbs
    # bare irregular participles ("seen", "given", "known"): a preterite tag on
    # one needs "saw", not "I-seen", so the pronoun pass skips them
    PARTICIPLES = {e['part'] for e in eng_verbs._table().values()
                   if e.get('part') and e['part'] != e.get('past')}
    changes, files = Counter(), 0
    for path in sorted(glob.glob(os.path.join(ROOT, 'verses', '*.js'))):
        src = open(path, encoding='utf-8').read()

        def verse(vm):
            toks = TOK.findall(vm.group(2))
            out, hit = [], False
            for i, (sp, en) in enumerate(toks):
                k, new = sp.lower().strip(STRIP), en
                core = en.strip('.,;:!?')
                prev = toks[i - 1][0] if i else ''
                if k and core and not already.match(core.replace('-', ' ')):
                    src2, tr = S.gloss_candidates(S.normalise(k), lex, forms, names)
                    lemma = src2.split(':')[1].split('>')[0] if src2 and ':' in src2 else k
                    tag = spa_conjug.verb_tag(k, lemma)
                    person = tag.partition('.')[2] if tag else ''
                    pos = spa_morph.pos(k)
                    is_verb = pos in ('VERB', 'AUX') or '(verb' in (tr or '')
                    bare = core.replace('-', ' ').strip().lower()
                    if (person in PRON and is_verb
                            and bare not in STOP_EN
                            and bare not in PARTICIPLES
                            and not spa_gloss.noun_position(prev, k)
                            and not spa_gloss.reflexive_position(prev)):
                        t = TAIL.search(en)
                        tail = t.group(1) if t else ''
                        new = PRON[person] + '-' + core + tail
                if new != en:
                    changes[(en, new)] += 1
                    hit = True
                out.append('["%s","%s"]' % (sp, new))
            return vm.group(0) if not hit else '{num:%s,words:[%s]}' % (vm.group(1), ','.join(out))

        new_src = VERSE.sub(verse, src)
        if new_src != src:
            files += 1
            if not dry_run:
                open(path, 'w', encoding='utf-8').write(new_src)
    return changes, files


def english_canon():
    """The printed English column, keyed 'Book|chapter|verse'. Never written."""
    raw = open(os.path.join(ROOT, 'english_verses.js'), encoding='utf-8').read()
    return json.loads(raw.split('=', 1)[1].strip().rstrip(';'))


def book_map():
    idx = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
    return {m.group(1): m.group(2) for m in
            re.finditer(r"\{\s*prefix:\s*'([^']+)'[^}]*?nameEn:\s*'([^']+)'", idx)}


def walk_verses():
    """Yield (book, chapter, verse, english, tokens) for the whole corpus."""
    BOOKS, EN = book_map(), english_canon()
    for path in sorted(glob.glob(os.path.join(ROOT, 'verses', '*.js'))):
        src = open(path, encoding='utf-8').read()
        for sm in SET.finditer(src):
            pm = re.match(r'([a-z0-9]+)-ch(\d+)$', sm.group(3))
            if not pm:
                continue
            book = BOOKS.get(pm.group(1) + '-ch')
            if not book:
                continue
            ch = int(pm.group(2))
            for vm in VERSE.finditer(sm.group(2)):
                en = EN.get('%s|%s|%s' % (book, ch, vm.group(1)))
                yield book, ch, vm.group(1), en, TOK.findall(vm.group(2))


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument('--keys')
    ap.add_argument('--contextual', action='store_true')
    ap.add_argument('--verbs', action='store_true',
                    help='every token the conjugation database recognises')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--persons', action='store_true',
                    help='add the subject pronoun the verb carries')
    ap.add_argument('--names', action='store_true',
                    help='gloss proper names as names (canon-confirmed)')
    ap.add_argument('--modernise', action='store_true',
                    help='archaic -est/-eth verbs -> modern English')
    a = ap.parse_args(argv)
    if a.persons:
        changes, files = apply_persons(a.dry_run)
        print("  %s %d tokens in %d files" %
              ('would change' if a.dry_run else 'changed', sum(changes.values()), files))
        for (o, n), c in changes.most_common(15):
            print('   %-20s -> %-22s %d' % ('"' + o + '"', '"' + n + '"', c))
        return 0
    if a.names:
        changes, files = apply_names(a.dry_run)
        print("  %s %d tokens in %d files" %
              ('would change' if a.dry_run else 'changed', sum(changes.values()), files))
        for (o, n), c in changes.most_common(15):
            print('   %-20s -> %-18s %d' % ('"' + o + '"', '"' + n + '"', c))
        return 0
    if a.modernise:
        changes, files = modernise_all(a.dry_run)
        print("  %s %d tokens in %d files" %
              ('would change' if a.dry_run else 'changed', sum(changes.values()), files))
        for (o, t), c in changes.most_common(18):
            print('   %-20s -> %-20s %d' % ('"' + o + '"', '"' + t + '"', c))
        return 0
    if a.verbs:
        import spa_conjug
        keys = set(spa_conjug.form_index())
    elif a.contextual:
        keys = set(CONTEXTUAL)
    else:
        keys = set((a.keys or '').split(''.join([','])))
    keys.discard('')
    if not keys:
        ap.error('give --keys, --contextual or --verbs')
    changes, files = regloss(keys, a.dry_run, verb_guard=a.verbs)
    print("  %s %d tokens in %d files" %
          ('would change' if a.dry_run else 'changed', sum(changes.values()), files))
    for (o, t), c in changes.most_common(15):
        print('   %-22s -> %-20s %d' % ('"' + o + '"', '"' + t + '"', c))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
