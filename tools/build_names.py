#!/usr/bin/env python3
"""Rebuild the Spanish->English proper-name table.

The previous table was derived by positional alignment and drifted onto the
neighbouring name: Sodoma->"gomorrah", Sadrac->"meshach", Abiram->"dathan",
Mahli->"mushi" -- every one of them the OTHER half of a name pair that always
appears alongside it. It also mapped ordinary sentence-initial Spanish words
onto names: Mas->Moses, Los->Elisha, Has->Jesus, Tus->This.

So position is not enough. A pair is accepted here only when TWO independent
witnesses agree:
  1. spelling  -- the regular Spanish/English correspondences (Nefi/Nephi,
     Moises/Moses, Sadrac/Shadrach), compared on a folded key.
  2. distribution -- they co-occur across verses, and the English name is
     present in most verses where the Spanish word appears capitalised.
Neither alone admits a pair.
"""
import os, re, sys, json
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import spa_lookup as S
import spa_apply as A

# Names Spanish TRANSLATES rather than transliterates: no spelling rule can
# reach these, so they are stated.
# Only PERSONAL and PLACE names that Spanish translates rather than spells out.
# Titles and divine epithets are deliberately absent: hijo/padre/santo/senor are
# ordinary nouns most of the time ("su hijo" is "his son"), and putting them
# here title-cased 1,300 common nouns. Jehova is left to the supplement, which
# renders it "the LORD"; and jesucristo is NOT mapped to "Jesus" because that
# silently drops Christ.
TRANSLATED = {
    'pablo': 'Paul', 'pedro': 'Peter', 'juan': 'John', 'santiago': 'James',
    'jacobo': 'James', 'mateo': 'Matthew', 'marcos': 'Mark', 'lucas': 'Luke',
    'esteban': 'Stephen', 'josué': 'Joshua', 'jonás': 'Jonah',
    'egipto': 'Egypt', 'roma': 'Rome', 'atenas': 'Athens',
    'jerusalén': 'Jerusalem', 'nazaret': 'Nazareth', 'belén': 'Bethlehem',
    'damasco': 'Damascus', 'antioquía': 'Antioch', 'corinto': 'Corinth',
    'éfeso': 'Ephesus', 'filipos': 'Philippi', 'galilea': 'Galilee',
}

# Never re-gloss these: the existing rendering is deliberate or the canon
# spelling would be a regression.
NAME_SKIP = {'jehová', 'jehova', 'jesucristo', 'cristo', 'sion', 'sión',
             'dios', 'señor', 'padre', 'hijo', 'santo', 'espíritu', 'amén',
             'salvador', 'redentor', 'mesías', 'maestro'}

# Spanish words that are capitalised only because a sentence starts with them.
STOP_ES = set("""y e o u ni pero mas sino porque pues que si no se de del al a en con por
para sobre entre hasta desde segun tras ante bajo contra el la los las un una unos unas
lo yo tu el ella nos vos ellos ellas me te le les nuestro nuestra nuestros nuestras
vuestro vuestra vuestros vuestras mi mis su sus este esta estos estas ese esa esos esas
aquel aquella aquellos aquellas esto eso aquello cuando donde como cuanto quien quienes
cual cuales todo toda todos todas cada mucho mucha muchos muchas poco poca mas menos
he aqui ahora entonces asi tambien tampoco aun aunque siempre nunca jamas antes despues
luego ya bien mal muy tan tanto tanta tantos tantas otro otra otros otras mismo misma
ha han has habia habian hay sera seran es son era eran fue fueron sea sean soy somos
dijo dijeron dice dicen hizo hicieron ved mirad oid id venid haced""".split())
STOP_EN = set("""and but or nor for so yet the a an this that these those he she it they
we you i him her them us my thy your his their our its who whom whose which what when
where how why now then thus therefore behold yea nay verily lo also even though although
if unless until while because since after before upon into unto with without within
of in on at by from to as is are was were be been being have has had do does did shall
will would should may might must can could let there here all every each any some no
not one two three first second third great lord god""".split())


def fold(w):
    """Spelling-neutral key: Nefi==Nephi, Moises==Moses, Sadrac==Shadrach."""
    w = S._strip_accents(w.lower())
    for a, b in (('ph', 'f'), ('th', 't'), ('ch', 'c'), ('qu', 'c'), ('k', 'c'),
                 ('j', 'h'), ('z', 's'), ('y', 'i'), ('v', 'b'), ('ll', 'l'),
                 ('ss', 's'), ('gu', 'g'), ('x', 's')):
        w = w.replace(a, b)
    w = re.sub(r'h', '', w)
    return re.sub(r'(.)\1+', r'\1', w)


def nm(w):
    """Spanish writes a final -m as -n: Jerusalen/Jerusalem, Adan/Adam.

    This has to be an ALTERNATIVE key, not a rewrite of fold(): folding
    Sodom to "sodon" stopped it matching Sodoma, which had matched before.
    """
    return re.sub(r'm$', 'n', w)


def skeleton(w):
    return re.sub(r'[aeiou]', '', fold(w))


def similar(es, en):
    """Do the two spellings correspond by the regular rules?"""
    a, b = fold(es), fold(en)
    if a == b or nm(a) == nm(b):
        return 3
    if a and b and (a.startswith(b) or b.startswith(a)) and abs(len(a) - len(b)) <= 2:
        return 2
    if skeleton(es) and skeleton(es) == skeleton(en):
        return 2
    # one edit apart
    if abs(len(a) - len(b)) <= 1:
        sa, sb = (a, b) if len(a) <= len(b) else (b, a)
        for i in range(len(sb)):
            if sb[:i] + sb[i + 1:] == sa:
                return 1
    return 0


def gazetteer():
    """The scripture-name inventory, taken from the English canon itself.

    A word is a name when the canon capitalises it and essentially never
    writes it lowercase: Nephi 478/0, Shadrach 16/0, Dinah 7/0 -- while
    "behold" (1308 capitalised, 2202 lowercase) and "master" and "honour" are
    ordinary words that merely start sentences. This is what gives the tool
    actual knowledge of Bible and Book of Mormon names instead of guessing
    them from alignment.
    """
    path = os.path.join(HERE, 'canon_names_en.json')
    if os.path.exists(path):
        with open(path, encoding='utf-8') as fh:
            return {w for w in json.load(fh)}
    cap, low = Counter(), Counter()
    for _b, _c, _v, en, _t in A.walk_verses():
        if not en:
            continue
        for w in re.findall(r"\b[A-Za-z][a-zA-Z'\-]{1,}\b", en):
            (cap if w[:1].isupper() else low)[w.lower()] += 1
    names = {w for w, c in cap.items() if c >= 2 and low.get(w, 0) <= max(1, c * 0.02)}
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(sorted(names), fh, indent=0)
    return names


def main():
    GAZ = gazetteer()
    by_fold = defaultdict(set)
    for n in GAZ:
        by_fold[fold(n)].add(n)
        by_fold[nm(fold(n))].add(n)
    es_caps = Counter()
    en_caps = Counter()
    co = defaultdict(Counter)
    es_verses = Counter()
    for book, ch, v, en, toks in A.walk_verses():
        if not en:
            continue
        es_words = set()
        for i, (sp, _) in enumerate(toks):
            w = sp.strip('.,;:¿?¡!»«()"“”—…\'')
            if len(w) < 3 or not w[:1].isupper():
                continue
            if S._strip_accents(w.lower()) in STOP_ES:
                continue
            es_words.add(w)
        en_words = {w for w in re.findall(r"\b[A-Z][a-zA-Z'\-]{2,}\b", en)
                    if w.lower() not in STOP_EN}
        for a in es_words:
            es_caps[a] += 1
            es_verses[a] += 1
            for b in en_words:
                co[a][b] += 1
        for b in en_words:
            en_caps[b] += 1

    display = {}          # canon spelling, e.g. Alma -> Alma
    for _b, _c, _v, en, _t in A.walk_verses():
        if not en:
            continue
        for w in re.findall(r"\b[A-Z][a-zA-Z'\-]{2,}\b", en):
            if w.lower() in GAZ:
                display.setdefault(w.lower(), w)

    table, rejected = {}, []
    for a in es_caps:
        if a.lower() in NAME_SKIP:
            continue
        if a.lower() in TRANSLATED:
            table[a.lower()] = TRANSLATED[a.lower()]
            continue
        # 0. the Spanish spelling IS a canon name (Lot, Alma, Moroni). An exact
        #    match must win outright: folding merges Lot with Loth and then the
        #    pair falls through to co-occurrence and is lost.
        if a.lower() in GAZ:
            table[a.lower()] = display.get(a.lower(), a)
            continue
        # 1. fold match against the gazetteer -- the tool KNOWS this name
        hits = by_fold.get(fold(a), set()) or by_fold.get(nm(fold(a)), set())
        if len(hits) == 1:
            n = next(iter(hits))
            table[a.lower()] = display.get(n, n.title())
            continue
        # 2. several candidates share a folded key: let co-occurrence choose
        best = None
        for b, n in co[a].items():
            if b.lower() not in GAZ:
                continue
            sim = similar(a, b)
            if not sim:
                continue
            rate = n / es_verses[a]
            if sim >= 2 and rate >= 0.4 and n >= 2:
                score = (sim, rate, n)
                if best is None or score > best[0]:
                    best = (score, b)
        if best:
            table[a.lower()] = best[1]
        else:
            rejected.append(a)
    return table, rejected, es_caps


if __name__ == '__main__':
    table, rejected, es_caps = main()
    out = os.path.join(HERE, 'bom_names_es_en.json')
    old = json.load(open(out, encoding='utf-8')) if os.path.exists(out) else {}
    with open(out, 'w', encoding='utf-8') as fh:
        json.dump(table, fh, ensure_ascii=False, indent=0, sort_keys=True)
    print("  names accepted : %d   (was %d)" % (len(table), len(old)))
    print("  rejected       : %d capitalised forms with no confident match" % len(rejected))
    for k in ('alma', 'nefi', 'moises', 'moisés', 'sadrac', 'sodoma', 'lot', 'mahli',
              'abiram', 'mas', 'los', 'has', 'tus'):
        if k in table or k in old:
            print("     %-10s new=%-14s old=%s" % (k, table.get(k, '—'), old.get(k, '—')))
