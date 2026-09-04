#!/usr/bin/env python3
"""Generate accents.html — the palette proposal page.

Ten complete palettes, each in the three reading modes, each rendered on the
real interlinear so the choice is made by looking rather than by reading hex
values.

Three things are held constant, and they are the design, not decoration:

  Sepia is a LIGHT theme. Warm paper, dark ink. A warm DARK ground is the
  trap: positive polarity reads better over long stretches and dark mode
  haloes for astigmatism.

  Paper and chrome are different materials. The bars are never the same value
  as the page; collapsing the two is what killed an earlier dark mode.

  The accent is a MARK, never a FILL -- verse number, chapter rule, link,
  active view. It never tints the reading ground or the body text.

The three modes' NEUTRALS are shared by every family; families differ only in
chrome and accent. That is what makes ten finishes of one system rather than
ten unrelated designs. Every pair is contrast-checked before any CSS is
emitted, and the build fails loudly rather than shipping a failing pair.
"""
import os, sys, json, html as H

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

MODES = {
 'light': dict(bg='#FCFAF7', deep='#F0ECE5', surface='#FFFFFF', row='#F7F4EF',
               ink='#191713', gloss='#554E45', muted='#6D655B', rule='#E2DCD2'),
 'sepia': dict(bg='#F4EAD8', deep='#E8DAC2', surface='#FAF2E4', row='#EFE3CD',
               ink='#2A2318', gloss='#5C503C', muted='#71634C', rule='#DCCDB2'),
 'dark':  dict(bg='#14120F', deep='#0C0B09', surface='#1C1916', row='#191613',
               ink='#EDE6DA', gloss='#B5A896', muted='#9A8D7C', rule='#342E26'),
}
MODE_ORDER = ['light', 'sepia', 'dark']


def fam(chrome, on_chrome, accent_l, accent_s, accent_d, a_chrome, a_chrome_d, blurb):
    return dict(chrome={'light': chrome[0], 'sepia': chrome[0], 'dark': chrome[1]},
                on_chrome={'light': on_chrome[0], 'sepia': on_chrome[0], 'dark': on_chrome[1]},
                accent={'light': accent_l, 'sepia': accent_s, 'dark': accent_d},
                a_chrome={'light': a_chrome, 'sepia': a_chrome, 'dark': a_chrome_d},
                blurb=blurb)


FAMILIES = {
 'Indigo & Gold':        fam(('#1B2A41','#101823'), ('#F3EDE2','#E7E0D4'),
                             '#8E6215','#7A5412','#D9B45F','#DDB768','#E6C87E',
                             'Navy binding, gilt edge. The scholarly default.'),
 'Oxblood & Brass':      fam(('#4A1D1A','#1E1210'), ('#F6EBE4','#EADFD6'),
                             '#8C2F27','#7A281F','#E0A08C','#D9A441','#E3B860',
                             'A bound leather cover. Warm, traditional, quiet.'),
 'Forest & Copper':      fam(('#17392C','#0E1C16'), ('#EAF2ED','#DEE9E2'),
                             '#1B5E3F','#175236','#7CC7A0','#D0A15E','#DDB477',
                             'Deep green and copper. Uncommon in reading UI.'),
 'Charcoal & Sky':       fam(('#23262B','#121316'), ('#EDEFF2','#E2E5E9'),
                             '#1F5F8B','#1B5479','#86BCE4','#8CC0E6','#9BCBEE',
                             'Neutral and modern. Lets the type carry everything.'),
 'Espresso & Terracotta':fam(('#372B22','#17120E'), ('#F4EBE2','#E8DED3'),
                             '#9C4A2A','#8A4024','#E09B76','#D9A06E','#E4B489',
                             'Printed missal. The warmest of the ten.'),
 'Obsidian & Jade':      fam(('#111413','#0A0C0B'), ('#E8EFEB','#DCE6E1'),
                             '#0F6B54','#0D5F4A','#66C9AB','#6FCBAE','#84D6BD',
                             'Near-black and jade. The sharpest, most modern.'),
 'Plum & Rose':          fam(('#3A2340','#1A1020'), ('#F2E9F3','#E5DAE8'),
                             '#7A3160','#6B2A54','#DFA0C0','#C98BAE','#DCA6C4',
                             'Aubergine and dusty rose. Softer, unexpected.'),
 'Teal & Sand':          fam(('#123B42','#08191D'), ('#E6F1F2','#D9E8EA'),
                             '#0F5C63','#0D5158','#7FCBD2','#D6B67F','#E2C494',
                             'Cool teal against warm sand. Coastal, calm.'),
 'Ink & Vermilion':      fam(('#16181C','#0B0C0E'), ('#EFEFF0','#E3E3E5'),
                             '#B23A21','#9C321C','#F09277','#E8724F','#EE8A6B',
                             'Near-black with one hot mark. Bold, high energy.'),
 'Stone & Sage':         fam(('#3E403A','#1A1B18'), ('#EFF0EC','#E3E5DF'),
                             '#4A6141','#405638','#A7C79B','#9DB891','#B0C9A5',
                             'Warm grey and sage. The quietest of the ten.'),
}


def lum(hexv):
    h = hexv.lstrip('#')
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)


def cr(a, b):
    l1, l2 = lum(a), lum(b)
    hi, lo = max(l1, l2), min(l1, l2)
    return (hi + 0.05) / (lo + 0.05)


def verify():
    """Every pair, before any CSS is written. Returns the failures."""
    bad = []
    for name, F in FAMILIES.items():
        for mode, M in MODES.items():
            pairs = [('body ink', M['ink'], M['bg'], 7.0),
                     ('gloss', M['gloss'], M['bg'], 4.5),
                     ('muted', M['muted'], M['bg'], 4.5),
                     ('accent', F['accent'][mode], M['bg'], 4.5),
                     ('ink/surface', M['ink'], M['surface'], 7.0),
                     ('chrome text', F['on_chrome'][mode], F['chrome'][mode], 4.5),
                     ('chrome accent', F['a_chrome'][mode], F['chrome'][mode], 4.5)]
            for label, fg, bg, need in pairs:
                r = cr(fg, bg)
                if r < need:
                    bad.append((name, mode, label, fg, bg, round(r, 2), need))
    return bad


def sample_verse():
    """Alma 32:33 straight out of the corpus — the page must show real text."""
    sys.path.insert(0, HERE)
    import spa_apply as A
    for book, ch, v, en, toks in A.walk_verses():
        if book == 'Alma' and ch == 32 and v == '33':
            return toks, en
    return [], ''


def render():
    toks, _en = sample_verse()
    words = ''.join('<span class="wu"><span class="sp">%s</span><span class="gl">%s</span></span>'
                    % (H.escape(a), H.escape(b)) for a, b in toks)

    def pane(F, mode):
        M = MODES[mode]
        v = (f"--bg:{M['bg']};--surface:{M['surface']};--ink:{M['ink']};--gloss:{M['gloss']};"
             f"--muted:{M['muted']};--rule:{M['rule']};--chrome:{F['chrome'][mode]};"
             f"--on-chrome:{F['on_chrome'][mode]};--accent:{F['accent'][mode]};"
             f"--a-chrome:{F['a_chrome'][mode]}")
        return f'''<div class="pane" style="{v}">
  <div class="hdr"><span class="ic">&#9776;</span><span class="loc">Alma 32</span><span class="ic">&#9906;</span></div>
  <div class="read"><h3 class="ch">Capítulo 32</h3>
    <div class="vrow"><span class="vn">33</span><div class="verse">{words}</div></div>
    <p class="canon">…because ye have <a href="#">tried the experiment</a>, and planted the seed…</p>
  </div>
  <div class="ftr"><span class="b active">Interlineal</span><span class="b">Español</span><span class="b">Dual</span></div>
  <div class="mode-tag">{mode}</div></div>'''

    def tokens(F):
        out = []
        for mode in MODE_ORDER:
            M = MODES[mode]
            sel = {'light': ':root', 'sepia': 'body.sepia-mode', 'dark': 'body.dark-mode'}[mode]
            out.append(f"""{sel} {{
  --bg: {M['bg']};  --bg-deep: {M['deep']};  --surface: {M['surface']};  --row-alt: {M['row']};
  --ink: {M['ink']}; --sp: {M['ink']}; --ink-light: {M['gloss']}; --gloss-en: {M['gloss']};
  --muted: {M['muted']}; --rule: {M['rule']}; --rule-light: {M['rule']};
  --chrome: {F['chrome'][mode]}; --chrome-deep: {F['chrome'][mode]};
  --on-chrome: {F['on_chrome'][mode]}; --chrome-line: {F['a_chrome'][mode]};
  --accent: {F['accent'][mode]}; --accent-chrome: {F['a_chrome'][mode]};
  --link: {F['accent'][mode]}; --verse-num: {F['accent'][mode]};
}}""")
        return H.escape('\n'.join(out))

    cards, nav = '', ''
    for name, F in FAMILIES.items():
        slug = name.lower().replace(' & ', '-').replace(' ', '-')
        nav += f'<a href="#{slug}"><i style="background:{F["chrome"][0] if isinstance(F["chrome"],list) else F["chrome"]["light"]}"></i>{H.escape(name)}</a>'
        chips = ''.join(
            f'<button class="chip" data-hex="{h}"><i style="background:{h}"></i><code>{h}</code></button>'
            for h in (F['chrome']['light'], F['accent']['light'], F['a_chrome']['light']))
        cards += f'''
<article class="fam" id="{slug}">
  <header class="fam-h"><div><h2>{H.escape(name)}</h2><p class="desc">{H.escape(F['blurb'])}</p></div>
  <div class="chips">{chips}</div></header>
  <div class="triple">{''.join(pane(F, m) for m in MODE_ORDER)}</div>
  <details class="tok"><summary>token block — {H.escape(name)}</summary><pre>{tokens(F)}</pre></details>
</article>'''

    css = CSS
    return (f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Palettes — Escrituras</title><style>{css}</style></head><body>
<div class="wrap"><header class="page-h"><h1>Palettes</h1>
<p class="lede">Ten complete palettes — header, reading area, footer, accent — each in the three
reading modes, each on the real interlinear (Alma 32:33). Pick by looking, not by reading hex values.</p>
<div class="note"><b>What is held constant</b><ul>
<li><b>Sepia is a light theme.</b> Warm paper, dark ink. A warm <em>dark</em> ground is the trap —
positive polarity is what reads over long stretches.</li>
<li>Paper and chrome are different materials. The bars are never the same value as the page.</li>
<li>The accent is a <em>mark</em> — verse number, chapter rule, link, active view. It never tints
the reading ground.</li>
<li>Neutrals are shared by all ten; only chrome and accent change. Ten finishes of one system.</li>
<li>All 210 pairs clear WCAG AA and body text clears AAA at 7:1 — checked before any CSS was written.</li>
</ul></div><nav class="jump">{nav}</nav></header>{cards}</div>
<script>
document.querySelectorAll('.chip').forEach(function(b){{b.addEventListener('click',function(){{
var c=b.querySelector('code'),o=c.textContent,d=function(){{c.textContent='copied';
setTimeout(function(){{c.textContent=o;}},1000);}};
if(navigator.clipboard&&navigator.clipboard.writeText){{navigator.clipboard.writeText(b.dataset.hex).then(d,d);}}else d();}});}});
</script></body></html>''')


CSS = """
*,*::before,*::after{box-sizing:border-box}
:root{--pg:#fff;--pi:#111;--pr:#ddd;--s1:8px;--s2:16px;--s3:24px;--s4:40px}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--pg);color:var(--pi);font-family:'Times New Roman',Times,serif;font-size:17px;line-height:1.55}
.wrap{max-width:1240px;margin:0 auto;padding:var(--s4) var(--s3) 80px}
.page-h{border-bottom:2px solid var(--pi);padding-bottom:var(--s3);margin-bottom:var(--s3)}
h1{font-size:2.1rem;margin:0 0 6px;font-weight:600;letter-spacing:-.01em}
.lede{margin:0;max-width:68ch}
.note{margin:var(--s3) 0 0;padding:var(--s2) var(--s3);border:1px solid var(--pr);border-left:4px solid var(--pi);max-width:76ch}
.note b{display:block;margin-bottom:4px}.note ul{margin:6px 0 0;padding-left:1.1em}.note li{margin:3px 0}
.jump{display:flex;gap:6px;flex-wrap:wrap;margin:var(--s3) 0 0}
.jump a{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--pr);padding:7px 12px;
 text-decoration:none;color:var(--pi);font-size:.82rem;min-height:38px;transition:background .18s,color .18s}
.jump a:hover,.jump a:focus-visible{background:var(--pi);color:var(--pg)}
.jump i{width:12px;height:12px;display:block;border:1px solid rgba(0,0,0,.25)}
.fam{border-top:1px solid var(--pr);padding:var(--s4) 0 var(--s3);scroll-margin-top:16px}
.fam-h{display:flex;justify-content:space-between;gap:var(--s3);flex-wrap:wrap;align-items:flex-start;margin-bottom:var(--s3)}
h2{font-size:1.45rem;margin:0;font-weight:600}.desc{margin:2px 0 0;max-width:50ch}
.chips{display:flex;gap:6px;flex-wrap:wrap}
.chip{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--pr);background:var(--pg);
 color:var(--pi);font:inherit;font-size:.78rem;padding:7px 11px;min-height:38px;cursor:pointer;transition:background .18s,color .18s}
.chip:hover,.chip:focus-visible{background:var(--pi);color:var(--pg)}
.chip i{width:14px;height:14px;display:block;border:1px solid rgba(0,0,0,.3)}
.triple{display:grid;grid-template-columns:repeat(3,1fr);gap:var(--s2)}
@media(max-width:1000px){.triple{grid-template-columns:1fr}}
.pane{border:1px solid var(--pr);display:flex;flex-direction:column;min-width:0;
 background:var(--bg);color:var(--ink);position:relative;overflow:hidden}
.mode-tag{position:absolute;top:0;right:0;background:var(--accent);color:var(--bg);
 font-size:.62rem;letter-spacing:.12em;text-transform:uppercase;padding:3px 9px}
.hdr{display:flex;align-items:center;justify-content:space-between;gap:10px;background:var(--chrome);
 color:var(--on-chrome);padding:11px 14px;padding-right:64px;border-bottom:3px solid var(--a-chrome)}
.hdr .ic{font-size:1.05rem;opacity:.85;width:22px;text-align:center}
.loc{font-size:.8rem;letter-spacing:.09em;text-transform:uppercase;color:var(--a-chrome);font-weight:700}
.read{padding:var(--s3) var(--s2);flex:1;background:var(--bg)}
.ch{margin:0 0 var(--s2);font-size:1rem;font-weight:600;letter-spacing:.04em;color:var(--accent);
 border-bottom:1px solid var(--rule);padding-bottom:7px}
.vrow{display:flex;gap:10px;align-items:flex-start}
.vn{color:var(--accent);font-weight:700;font-size:1rem;line-height:1.9;flex:0 0 auto}
.verse{display:flex;flex-wrap:wrap;gap:2px 8px;min-width:0}
.wu{display:flex;flex-direction:column;align-items:center;padding:2px 3px;border-radius:2px}
.wu:hover{background:color-mix(in srgb,var(--accent) 12%,transparent)}
.sp{font-size:1.08em;line-height:1.45;color:var(--ink)}
.gl{font-size:.66em;font-style:italic;line-height:1.25;color:var(--gloss);margin-top:1px}
.canon{margin:var(--s3) 0 0;padding-top:var(--s2);border-top:1px solid var(--rule);
 font-size:.83rem;font-style:italic;color:var(--muted)}
.canon a{color:var(--accent);text-decoration:none;border-bottom:1px solid var(--accent)}
.ftr{display:flex;background:var(--chrome);color:var(--on-chrome);border-top:1px solid var(--rule)}
.b{flex:1;text-align:center;padding:12px 6px;font-size:.76rem;min-height:44px;display:flex;
 align-items:center;justify-content:center;opacity:.72}
.b+.b{border-left:1px solid color-mix(in srgb,var(--on-chrome) 22%,transparent)}
.b.active{color:var(--a-chrome);font-weight:700;opacity:1;box-shadow:inset 0 -3px 0 var(--a-chrome)}
.tok{margin-top:var(--s3)}.tok summary{cursor:pointer;font-size:.88rem;padding:6px 0}
pre{margin:var(--s1) 0 0;padding:var(--s2);border:1px solid var(--pr);overflow-x:auto;
 font-family:ui-monospace,Menlo,Consolas,monospace;font-size:.74rem;line-height:1.6}
@media(prefers-reduced-motion:reduce){*{transition:none!important}}
"""


def main():
    bad = verify()
    if bad:
        print("  REFUSING to write — %d contrast failures:" % len(bad))
        for f in bad:
            print("   %-22s %-6s %-14s %s on %s = %.2f (need %.1f)" % f)
        return 1
    doc = render()
    with open(os.path.join(ROOT, 'accents.html'), 'w', encoding='utf-8') as fh:
        fh.write(doc)
    print("  %d palettes x %d modes — all %d contrast pairs pass"
          % (len(FAMILIES), len(MODE_ORDER), len(FAMILIES) * 21))
    print("  wrote accents.html (%.1f KB)" % (len(doc) / 1024))
    return 0


if __name__ == '__main__':
    sys.exit(main())
