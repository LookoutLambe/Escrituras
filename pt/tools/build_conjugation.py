#!/usr/bin/env python3
"""Generate the Portuguese verb paradigms, and index the ones the corpus uses.

THIS IS THE GRAMMAR TOOL. Everything before it was a tagged corpus (UD) or a
form->lemma list — neither of which can produce a form that is not already in
them, and neither of which contains the archaic second person this text is
written in. mlconjug3's Portuguese tables (Verbiste lineage, 15,267 verbs over
331 templates) are generative: root + template gives the whole paradigm,
including slot 1 (tu) and slot 4 (vós).

  falar  = fal + rez:ar        -> falo  falas  fala  falamos  falais  falam
  dizer  = di  + contradi:zer  -> disse disseste disse dissemos dissestes ...

That replaces guessing at endings, which is what produced "das is a form of
dar" and "dias is a form of der". A generated form carries its lemma, mood,
tense and person with it; nothing has to be inferred from the spelling.

ENCODING: the mood and tense KEYS in conjugation-pt.json are double-encoded
(UTF-8 bytes re-read as Latin-1), so they arrive as 'GerÃºndio' and
'PretÃ©rito'. The VALUES are clean. Keys are repaired on load; without that
every tense lookup misses.

Writes tools/por_conjug.json — only forms the corpus actually contains:
    forms  form -> [[lemma, mood, tense, person, number], ...]

Usage: python3 tools/build_conjugation.py
"""
import os, sys, json, re
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(HERE, 'src')

SLOT = {0: ('1', 'sing'), 1: ('2', 'sing'), 2: ('3', 'sing'),
        3: ('1', 'plur'), 4: ('2', 'plur'), 5: ('3', 'plur')}

# circumflex before a matching vowel, dropped by the 1990 reform
REFORM = re.compile('[êô](?=[eo])')
DEACCENT = str.maketrans('êô', 'eo')


def fix(s):
    """Repair the double-encoded mood/tense names."""
    try:
        return s.encode('latin-1').decode('utf-8') if any(ord(c) > 127 for c in s) else s
    except (UnicodeEncodeError, UnicodeDecodeError):
        return s


def corpus_forms():
    seen = set()
    cdir = os.path.join(ROOT, 'corpus')
    for fn in sorted(os.listdir(cdir)):
        if not fn.endswith('.json') or fn.startswith('_'):
            continue
        d = json.load(open(os.path.join(cdir, fn), encoding='utf-8'))
        for r in d['rows']:
            for t in re.split(r"[^0-9A-Za-zÀ-ÿ\-]+", r['text'].lower()):
                if t:
                    seen.add(t)
                    if '-' in t:                       # enclitic stems count too
                        seen.add(t.split('-')[0])
    return seen


def main():
    C = json.load(open(os.path.join(SRC, 'conjugation-pt.json'), encoding='utf-8'))
    V = json.load(open(os.path.join(SRC, 'verbs-pt.json'), encoding='utf-8'))
    wanted = corpus_forms()

    index = defaultdict(list)
    generated = 0
    for verb, e in V.items():
        tpl = C.get(e['template'])
        if not tpl:
            continue
        root = e['root']
        for mood_raw, tenses in tpl.items():
            mood = fix(mood_raw)
            if not isinstance(tenses, dict):
                continue
            for tense_raw, slots in tenses.items():
                tense = fix(tense_raw)
                if not isinstance(slots, list):
                    continue
                for entry in slots:
                    if not isinstance(entry, list) or len(entry) != 2:
                        continue
                    idx, ending = entry
                    if not ending:
                        continue
                    form = (root + ending).lower()
                    generated += 1
                    person, number = SLOT.get(idx, ('', ''))
                    rec = [verb, mood, tense, person, number]
                    # THE TABLES PREDATE THE 1990 ORTHOGRAPHIC REFORM. They
                    # spell crêem, vêem, dêem, lêem, vôo; this corpus uses the
                    # reformed creem, veem, deem, leem, voo. Indexing only the
                    # table's spelling silently loses every one of them, so
                    # each form is also indexed under its reformed spelling.
                    for f in {form, REFORM.sub(lambda m: m.group(0)[0]
                              .translate(DEACCENT) + m.group(0)[1:], form)}:
                        if f in wanted and rec not in index[f]:
                            index[f].append(rec)

    out = {'forms': {f: v for f, v in index.items()}}
    json.dump(out, open(os.path.join(HERE, 'por_conjug.json'), 'w', encoding='utf-8'),
              ensure_ascii=False)

    second = {f: v for f, v in index.items() if any(r[3] == '2' for r in v)}
    print("  verbs in tables      : %s" % f"{len(V):,}")
    print("  forms generated      : %s" % f"{generated:,}")
    print("  present in the corpus: %s" % f"{len(index):,}")
    print("  of which SECOND PERSON: %s" % f"{len(second):,}")
    for w in ('disseste', 'sereis', 'farás', 'tendes', 'sois', 'vinde', 'sabeis'):
        v = index.get(w)
        print("    %-10s %s" % (w, (v[0][0] + '  ' + v[0][2] + '  ' + v[0][3] + v[0][4]) if v else '(not generated)'))
    return 0


if __name__ == '__main__':
    sys.exit(main())
