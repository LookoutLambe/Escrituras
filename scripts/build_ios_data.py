#!/usr/bin/env python3
"""
Converts the web app's JavaScript data files into JSON resources for the
native app bundle.

Inputs (repo root):
  index.html          -- the BOOK_DATA table: 87 books, their Spanish/English
                         names, chapter counts, and volume assignment
  verses/<id>.js      -- one file per book; `var vN = [{num,words:[[es,en],..]}]`
                         followed by a `renderVerseSet(vN, 'chN-verses')` call
  english_verses.js   -- `window._englishVersesData = {"1 Nephi|1|1": "..."}`
  crossrefs_all.js    -- `window._volumeCrossrefsData = {"Genesis|1|1":[...]}`

Outputs (--out, default ios_data/):
  spa_index.json          -- volumes + book metadata; loaded eagerly at launch
  book_<id>.json          -- one file per book, loaded lazily by the reader
  spa_english.json        -- official English verse text, loaded lazily
  spa_crossrefs.json      -- cross-references, loaded lazily
  spa_search.txt          -- one line per verse, `bookId|ch|v<TAB>folded text`;
                             the reader memory-maps this and scans it bytewise
                             so full-text search never decodes all 87 books

Output is flat on purpose: Xcode's synchronized folder groups flatten resources
into the bundle root, so the per-book files carry a `book_` prefix instead of
living in a subdirectory that wouldn't survive the copy.

Word pairs stay as 2-element ["spanish", "english-gloss"] arrays rather than
{"es":..,"en":..} objects; across 41,996 verses the objects cost ~40% more
bundle size for no gain, and the Swift side decodes the array form directly.
"""

import argparse
import json
import os
import re
import sys
import unicodedata
from collections import Counter

# Volume display names, matching the drawer headers in index.html.
VOLUMES = [
    ("ot",  "Antiguo Testamento",      "Old Testament"),
    ("nt",  "Nuevo Testamento",        "New Testament"),
    ("bom", "El Libro de Mormón",      "The Book of Mormon"),
    ("dc",  "Doctrina y Convenios",    "Doctrine and Covenants"),
    ("pgp", "La Perla de Gran Precio", "Pearl of Great Price"),
]

# A verse object in the source JS. The data is machine-generated and fully
# uniform -- verified across all 87 files: 41,996 matches, zero backslash
# escapes, zero single-quoted strings -- so a targeted rewrite of the two
# unquoted keys is safe without a full JS parser.
VERSE_KEYS = re.compile(r"\{num:(\d+),words:\[")
CHAPTER_BLOCK = re.compile(r"var v(\d+)\s*=\s*\[", re.M)


def strip_trailing_commas(s):
    """Removes JS-legal trailing commas (`...},\\n];`) that JSON rejects.
    Scans outside string literals only, so a gloss containing ", ]" survives."""
    out = []
    in_str = esc = False
    for ch in s:
        if in_str:
            out.append(ch)
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch in "]}":
            # drop any whitespace-separated comma we just buffered
            k = len(out) - 1
            while k >= 0 and out[k].isspace():
                k -= 1
            if k >= 0 and out[k] == ",":
                del out[k]
        out.append(ch)
    return "".join(out)


def die(msg):
    sys.exit("error: " + msg)


def read(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def matching_bracket(s, open_idx):
    """Index of the ] closing the [ at open_idx, ignoring brackets inside
    string literals -- a few glosses carry a stray bracket of their own
    (D&C 117:2 is glossed "lifts.]"), which a naive scan would read as
    the end of the array."""
    depth, in_str, esc = 0, False, False
    for i in range(open_idx, len(s)):
        ch = s[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
            if depth == 0:
                return i
    die("unbalanced brackets starting at offset %d" % open_idx)


def parse_book_metadata(root):
    """Pulls the BOOK_DATA table out of index.html."""
    s = read(os.path.join(root, "index.html"))
    try:
        anchor = s.index("var BOOK_DATA = [")
    except ValueError:
        die("could not find `var BOOK_DATA = [` in index.html")
    start = s.index("[", anchor)
    block = s[start:matching_bracket(s, start) + 1]

    def field(obj, key):
        m = (re.search(r"\b%s\s*:\s*'([^']*)'" % key, obj)
             or re.search(r'\b%s\s*:\s*"([^"]*)"' % key, obj)
             or re.search(r"\b%s\s*:\s*(\d+)" % key, obj))
        return m.group(1) if m else None

    books = []
    for obj in re.findall(r"\{[^{}]*\}", block):
        rec = {k: field(obj, k) for k in
               ("name", "nameEn", "count", "volume", "gridId")}
        if not all(rec.values()):
            die("incomplete BOOK_DATA entry: %s" % obj[:160])
        books.append({
            "id": rec["gridId"],
            "volume": rec["volume"],
            "nameEs": rec["name"],
            "nameEn": rec["nameEn"],
            "chapterCount": int(rec["count"]),
        })

    known = {v[0] for v in VOLUMES}
    for b in books:
        if b["volume"] not in known:
            die("book %s has unknown volume %r" % (b["id"], b["volume"]))
    return books


def parse_verse_file(path):
    """Returns [{"num": chapterNum, "verses": [{"num","words"}]}] for one book."""
    s = read(path)
    chapters = []
    for m in CHAPTER_BLOCK.finditer(s):
        chapter_num = int(m.group(1))
        start = s.index("[", m.start())
        raw = s[start:matching_bracket(s, start) + 1]
        fixed = strip_trailing_commas(VERSE_KEYS.sub(r'{"num":\1,"words":[', raw))
        try:
            verses = json.loads(fixed)
        except json.JSONDecodeError as e:
            die("%s chapter %d: %s" % (os.path.basename(path), chapter_num, e))
        for v in verses:
            for w in v["words"]:
                if not (isinstance(w, list) and len(w) == 2):
                    die("%s ch%d v%s: malformed word pair %r"
                        % (os.path.basename(path), chapter_num, v["num"], w))
        chapters.append({"num": chapter_num, "verses": verses})
    chapters.sort(key=lambda c: c["num"])
    return chapters


def strip_js_assignment(root, filename, global_name):
    """Extracts the JSON object literal from `window._x = {...};`."""
    s = read(os.path.join(root, filename))
    anchor = "window.%s" % global_name
    try:
        i = s.index(anchor)
    except ValueError:
        die("could not find `%s` in %s" % (anchor, filename))
    brace = s.index("{", i)
    depth, end, in_str, esc = 0, None, False, False
    for j in range(brace, len(s)):
        ch = s[j]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                end = j
                break
    if end is None:
        die("unterminated object literal in %s" % filename)
    try:
        return json.loads(s[brace:end + 1])
    except json.JSONDecodeError as e:
        die("%s: %s" % (filename, e))


def fold(s):
    """Case- and accent-folds text for the search index. Must stay in step with
    the Swift side, which folds queries with
    `folding(options: [.caseInsensitive, .diacriticInsensitive])` --
    so "corazon" matches "corazón" and "Nefi" matches "nefi"."""
    decomposed = unicodedata.normalize("NFD", s.lower())
    stripped = "".join(c for c in decomposed if not unicodedata.combining(c))
    return " ".join(stripped.split())


def write_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(obj, fh, ensure_ascii=False, separators=(",", ":"))
    return os.path.getsize(path)


def human(n):
    for unit in ("B", "KB", "MB"):
        if n < 1024 or unit == "MB":
            return "%.1f %s" % (n, unit)
        n /= 1024.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                    help="repo root holding index.html and verses/")
    ap.add_argument("--out", default=None, help="output directory (default <root>/ios_data)")
    args = ap.parse_args()
    root = args.root
    out = args.out or os.path.join(root, "ios_data")

    books = parse_book_metadata(root)
    print("books in BOOK_DATA: %d" % len(books))

    # Loaded up front so the search index can fold the Spanish and the official
    # English for each verse into a single haystack line as books are processed.
    english = strip_js_assignment(root, "english_verses.js", "_englishVersesData")

    total_verses = 0
    total_words = 0
    total_bytes = 0
    index_books = []
    search_lines = []

    for b in books:
        path = os.path.join(root, "verses", "%s.js" % b["id"])
        if not os.path.exists(path):
            die("missing verse file for book %s: %s" % (b["id"], path))
        chapters = parse_verse_file(path)

        if len(chapters) != b["chapterCount"]:
            die("%s: BOOK_DATA says %d chapters, verses/%s.js has %d"
                % (b["id"], b["chapterCount"], b["id"], len(chapters)))
        expected = list(range(1, b["chapterCount"] + 1))
        if [c["num"] for c in chapters] != expected:
            die("%s: chapter numbers are not 1..%d" % (b["id"], b["chapterCount"]))

        vcount = sum(len(c["verses"]) for c in chapters)
        total_verses += vcount
        total_words += sum(len(v["words"]) for c in chapters for v in c["verses"])
        total_bytes += write_json(os.path.join(out, "book_%s.json" % b["id"]), {
            "id": b["id"],
            "volume": b["volume"],
            "nameEs": b["nameEs"],
            "nameEn": b["nameEn"],
            "chapters": chapters,
        })

        for c in chapters:
            for v in c["verses"]:
                spanish = " ".join(w[0] for w in v["words"])
                en = english.get("%s|%d|%d" % (b["nameEn"], c["num"], v["num"]), "")
                search_lines.append("%s|%d|%d\t%s" % (
                    b["id"], c["num"], v["num"], fold(spanish + " " + en)
                ))

        rec = dict(b)
        rec["verseCount"] = vcount
        index_books.append(rec)

    idx_size = write_json(os.path.join(out, "spa_index.json"), {
        "version": 1,
        "volumes": [{"id": i, "nameEs": es, "nameEn": en} for i, es, en in VOLUMES],
        "books": index_books,
    })

    en_size = write_json(os.path.join(out, "spa_english.json"), english)

    crossrefs = strip_js_assignment(root, "crossrefs_all.js", "_volumeCrossrefsData")
    xr_size = write_json(os.path.join(out, "spa_crossrefs.json"), crossrefs)

    search_path = os.path.join(out, "spa_search.txt")
    with open(search_path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(search_lines))
        fh.write("\n")
    se_size = os.path.getsize(search_path)

    # How much of the Spanish text has official English alongside it. The
    # English keys are "<English book name>|ch|v", so a book whose nameEn
    # doesn't match the English data contributes zero -- worth surfacing
    # rather than silently shipping a half-empty Dual mode.
    by_volume = Counter()
    matched = 0
    for b in index_books:
        hits = sum(1 for k in english if k.startswith(b["nameEn"] + "|"))
        matched += hits
        if hits == 0:
            by_volume[b["volume"]] += 1
    print()
    print("chapters:        %d" % sum(b["chapterCount"] for b in index_books))
    print("verses:          %d" % total_verses)
    print("word pairs:      %d" % total_words)
    print()
    print("spa_index.json      %10s" % human(idx_size))
    print("book_*.json         %10s  (%d files)" % (human(total_bytes), len(index_books)))
    print("spa_english.json    %10s  (%d verses)" % (human(en_size), len(english)))
    print("spa_crossrefs.json  %10s  (%d verses)" % (human(xr_size), len(crossrefs)))
    print("spa_search.txt      %10s  (%d lines)" % (human(se_size), len(search_lines)))
    print("total               %10s" % human(idx_size + total_bytes + en_size + xr_size + se_size))
    if by_volume:
        print()
        print("WARNING: %d books have no English verses (Dual mode will be empty):"
              % sum(by_volume.values()))
        for vol, n in by_volume.items():
            print("  %s: %d books" % (vol, n))
    print()
    print("wrote %s" % out)


if __name__ == "__main__":
    main()
