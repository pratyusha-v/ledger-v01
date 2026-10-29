#!/usr/bin/env python3
"""Build the mid-fi Ledger site from the low-fi wireframes.

Reads wireframes/*.dc.html, swaps the grayscale wireframe palette for the
Sai Seva Sangh palette, makes each page fluid, and writes the pages to the repo root,
where GitHub Pages serves them.
Run from the project root:  python3 tools/build.py
"""
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "wireframes"
OUT = ROOT

WHITE, OFFWHITE, INK, MAUVE = "#FFFFFF", "#FAF7F4", "#2E2430", "#6E5A70"
MAUVE_LIGHT, SAFFRON, STONE, MUTED, HAIRLINE = "#EFE9F0", "#FF911E", "#7C7C7A", "#666664", "#E6E2DE"

# Near-black fills mark primary actions in the wireframes; they become saffron.
PRIMARY_DARK = {"#000000", "#111111", "#1a1a1a", "#1f1f1f", "#222222"}
INK_DARK = {"#2b2b2b", "#333333", "#3d3d3d", "#444444", "#4a4a4a", "#555555"}

BG = {
    "#ffffff": WHITE,
    **{h: OFFWHITE for h in ["#fafafa", "#fcfcfc", "#f9f9f9", "#f2f2f2", "#f4f4f4", "#f6f6f6", "#f0f0f0"]},
    **{h: MAUVE_LIGHT for h in ["#efefef", "#ececec", "#ededed", "#e4e4e4", "#e2e2e2", "#e6e6e6",
                                "#e3e3e3", "#e0e0e0", "#dddddd"]},
    **{h: HAIRLINE for h in ["#d6d6d6", "#c8c8c8", "#cfcfcf", "#bdbdbd", "#b5b5b5"]},
    **{h: STONE for h in ["#a0a0a0", "#9a9a9a", "#8a8a8a", "#767676", "#6b6b6b", "#6a6a6a", "#5c5c5c"]},
    **{h: INK for h in INK_DARK},
    **{h: SAFFRON for h in PRIMARY_DARK},
}
TEXT = {
    "#ffffff": WHITE,
    **{h: INK for h in PRIMARY_DARK | {"#2b2b2b", "#333333", "#3d3d3d"}},
    **{h: MUTED for h in ["#444444", "#4a4a4a", "#555555", "#5c5c5c", "#6a6a6a", "#6b6b6b", "#767676",
                          "#8a8a8a", "#9a9a9a", "#a0a0a0"]},
    **{h: HAIRLINE for h in ["#b5b5b5", "#bdbdbd", "#c8c8c8", "#cfcfcf", "#d6d6d6", "#dddddd", "#e0e0e0",
                             "#e2e2e2", "#e3e3e3", "#e4e4e4", "#e6e6e6", "#ececec", "#ededed", "#efefef"]},
    **{h: OFFWHITE for h in ["#f0f0f0", "#f2f2f2", "#f4f4f4", "#f6f6f6", "#f9f9f9", "#fafafa", "#fcfcfc"]},
}
BORDER = {
    "#ffffff": WHITE,
    **{h: MAUVE for h in PRIMARY_DARK},
    **{h: STONE for h in INK_DARK | {"#5c5c5c", "#6a6a6a", "#6b6b6b", "#767676", "#8a8a8a", "#9a9a9a", "#a0a0a0"}},
    **{h: "#D3CBD4" for h in ["#b5b5b5", "#bdbdbd"]},
    **{h: HAIRLINE for h in ["#c8c8c8", "#cfcfcf", "#d6d6d6", "#dddddd", "#e0e0e0", "#e2e2e2", "#e3e3e3",
                             "#e4e4e4", "#e6e6e6", "#ececec", "#ededed", "#efefef", "#f0f0f0", "#f2f2f2",
                             "#f4f4f4", "#f6f6f6", "#fafafa"]},
}
RADIUS = {"2px": "4px", "3px": "4px", "4px": "8px", "6px": "8px"}

HEX = re.compile(r"#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b")


def norm(h):
    h = h.lower()
    if len(h) == 4:
        h = "#" + "".join(c * 2 for c in h[1:])
    return h


def remap(value, table, override=None):
    def sub(m):
        h = norm(m.group(0))
        if override and h in override:
            return override[h]
        return table.get(h, m.group(0))
    return HEX.sub(sub, value)


def split_decls(text):
    """Split a declaration list on ';' outside quotes and parentheses."""
    out, buf, depth, quote = [], [], 0, None
    for ch in text:
        if quote:
            buf.append(ch)
            if ch == quote:
                quote = None
            continue
        if ch in "'\"":
            quote = ch
        elif ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        elif ch == ";" and depth == 0:
            out.append("".join(buf))
            buf = []
            continue
        buf.append(ch)
    if "".join(buf).strip():
        out.append("".join(buf))
    return out


def map_decls(text):
    """Remap colours, fonts and radii in one declaration block.

    Returns (new_text, is_primary) where is_primary means the block paints a
    near-black fill that is now saffron (so its text must turn ink)."""
    decls = []
    for d in split_decls(text):
        if ":" not in d:
            decls.append((None, d))
            continue
        p, v = d.split(":", 1)
        decls.append((p.strip().lower(), v))
    primary = any(
        p in ("background", "background-color") and any(norm(h) in PRIMARY_DARK for h in HEX.findall(v))
        for p, v in decls if p
    )
    parts = []
    for p, v in decls:
        if p is None:
            parts.append(v)
            continue
        if p in ("background", "background-color"):
            v = remap(v, BG)
        elif p == "color":
            v = remap(v, TEXT, {"#ffffff": INK} if primary else None)
        elif p.startswith("border") and p != "border-radius" or p.startswith("outline"):
            v = remap(v, BORDER, {h: SAFFRON for h in PRIMARY_DARK} if primary else None)
        elif p in ("fill", "stroke", "text-decoration-color", "text-decoration", "caret-color"):
            v = remap(v, TEXT)
        elif p == "box-shadow":
            v = remap(v, BORDER)
        elif p in ("font-family", "font"):
            v = v.replace("'IBM Plex Sans'", "'Lato'").replace("IBM Plex Sans", "Lato")
        if p == "border-radius":
            v = re.sub(r"\b\d+px\b", lambda m: RADIUS.get(m.group(0), m.group(0)), v)
        parts.append(f"{p}:{v}" if not v.startswith(" ") else f"{p}:{v}")
    return ";".join(parts), primary


def map_stylesheet(css):
    return re.sub(r"\{([^{}]*)\}", lambda m: "{" + map_decls(m.group(1))[0] + "}", css)


BUTTON_SIZE = re.compile(r"height:\s*(3[0-9]|4[0-4])px")


def map_tag(m):
    """Rewrite one start tag: style attr, svg colour attrs, button-likes."""
    tag = m.group(0)
    name = m.group(1).lower()
    primary = False

    def style_sub(sm):
        nonlocal primary
        new, primary = map_decls(html.unescape(sm.group(2)))
        return f'{sm.group(1)}="{new.replace(chr(34), "&quot;")}"'

    tag = re.sub(r'(\sstyle)="([^"]*)"', style_sub, tag)
    tag = re.sub(r'(\s(?:fill|stroke))="(#[0-9a-fA-F]{3,6})"',
                 lambda a: f'{a.group(1)}="{remap(a.group(2), BORDER)}"', tag)
    style = re.search(r'\sstyle="([^"]*)"', tag)
    if name in ("a", "button") and style and "inline-flex" in style.group(1) \
            and BUTTON_SIZE.search(style.group(1)) and "50%" not in style.group(1):
        extra = "pill primary" if primary else "pill"
        if re.search(r'\sclass="', tag):
            tag = re.sub(r'\sclass="([^"]*)"', lambda c: f' class="{c.group(1)} {extra}"', tag, count=1)
        else:
            tag = tag.replace(f"<{m.group(1)}", f'<{m.group(1)} class="{extra}"', 1)
    return tag


LOGO_DIV = re.compile(r'<div style="width: (\d+)px; height: (\d+)px;[^"]*">LOGO</div>')


def transform_markup(body):
    body = re.sub(r'href="([A-Za-z]+)\.dc\.html"', r'href="\1.html"', body)

    first = [True]

    def logo(m):
        size = m.group(1)
        if first[0]:
            first[0] = False
            return f'<img class="brand-logo" src="assets/logo.svg" alt="Sai Seva Sangh" width="{size}" height="{size}">'
        return f'<img class="brand-logo" src="assets/logo.svg" alt="School logo" width="{size}" height="{size}">'

    body = LOGO_DIV.sub(logo, body)
    # Tag the Ledger wordmark with the organisation name underneath.
    body = re.sub(
        r'(<span style="font-size: (?:18|22)px; font-weight: 700[^"]*">)Ledger</span>',
        r'<span style="display: flex; flex-direction: column; line-height: 1.1">\1Ledger</span>'
        r'<span class="brand-sub">sai seva sangh</span></span>',
        body, count=1)
    # The wireframe canvas froze every page at 1512 px; the site is fluid.
    body = re.sub(r'width: 1512px; height: \d+px;', 'width: 100%; min-height: 100vh;', body, count=1)
    body = re.sub(r'(min-height: 100vh;[^"]*?); overflow: hidden', r'\1', body, count=1)
    return re.sub(r"<([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*>", map_tag, body)


PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<link rel="icon" href="assets/logo.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Lato:wght@300;400;700;900&display=swap" rel="stylesheet">
<style>
{css}
</style>
<link rel="stylesheet" href="assets/ledger.css">
</head>
<body>
{body}
{script}
</body>
</html>
"""

APP_SCRIPT = '<script type="module" src="assets/app.js"></script>'
# Pages whose markup is the form itself; the app wires it up instead of redrawing it.
KEEP_MAIN = {"Login.dc.html", "ForgotPassword.dc.html"}
LOADING = '<div class="app-loading" role="status">Loading…</div>'


def build_page(src):
    text = src.read_text()
    title = re.search(r"<title>(.*?)</title>", text, re.S).group(1)
    helmet = re.search(r"<helmet>(.*?)</helmet>", text, re.S).group(1)
    css = "\n".join(re.findall(r"<style>(.*?)</style>", helmet, re.S))
    body = re.search(r"</helmet>(.*)</x-dc>", text, re.S).group(1).strip()

    body = transform_markup(body)
    body = body.replace("{{ddOpen}}", "")
    # Teacher Classes dropdown: plain links, no Editable / View only tags.
    body = body.replace(" <small>Editable</small>", "").replace(" <small>View only</small>", "")
    # The wireframes' sample content is replaced by live data from Supabase.
    if src.name not in KEEP_MAIN:
        body = re.sub(r"(<main\b[^>]*>).*?(</main>)", lambda m: m.group(1) + LOADING + m.group(2), body, count=1, flags=re.S)
        body = re.sub(r"(<aside\b[^>]*>).*?(</aside>)", r"\1\2", body, count=1, flags=re.S)
    assert "{{" not in body, f"unrendered template hole in {src.name}"
    out = PAGE.format(title=title, css=map_stylesheet(css).strip(), body=body, script=APP_SCRIPT)
    (OUT / src.name.replace(".dc.html", ".html")).write_text(out)


def build_index():
    canvas = json.loads((SRC / "canvas.json").read_text())
    pages = {p["id"]: p["name"] for p in canvas["pages"]}
    groups = {}
    for name in canvas["order"]:
        b = canvas["boards"][name]
        groups.setdefault(pages.get(b.get("page"), canvas["pages"][0]["name"]), []).append(
            (b.get("title", name).replace("★ ", ""), name.replace(".dc.html", ".html")))
    sections = []
    for group, items in groups.items():
        cards = "".join(
            f'<li><a href="{href}"><span>{html.escape(t)}</span>'
            f'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
            f'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></a></li>'
            for t, href in items)
        sections.append(f'<section><h2>{group}<small>{len(items)} screens</small></h2><ul>{cards}</ul></section>')
    body = f"""<header style="height: 64px; display: flex; align-items: center; padding: 0 32px; gap: 12px">
  <img class="brand-logo" src="assets/logo.svg" alt="Sai Seva Sangh" width="36" height="36">
  <span style="display: flex; flex-direction: column; line-height: 1.1"><span style="font-size: 18px; font-weight: 700">Ledger</span><span class="brand-sub">sai seva sangh</span></span>
</header>
<div class="hub-hero"><div class="hub-wrap">
  <h1>Ledger prototype</h1>
  <p>Mid-fidelity screens for teachers and school admins, built from the wireframes. Start at sign-in, or jump to any screen.</p>
  <div style="display: flex; gap: 10px; flex-wrap: wrap"><a class="btn p" href="Login.html" style="height: 44px; display: inline-flex; align-items: center; text-decoration: none">Start at Sign In</a><a class="btn" href="Dashboard.html" style="height: 44px; display: inline-flex; align-items: center; text-decoration: none">Teacher dashboard</a><a class="btn" href="AdminDashboard.html" style="height: 44px; display: inline-flex; align-items: center; text-decoration: none">Admin dashboard</a></div>
</div></div>
<main class="hub-wrap">{''.join(sections)}</main>"""
    css = """.hub-wrap{max-width:1120px;margin:0 auto;padding:0 32px;box-sizing:border-box}
.hub-hero{background:var(--saffron-light);border-bottom:1px solid #FBDDB8;padding:48px 0}
.hub-hero h1{margin:0 0 8px;font-size:40px;font-weight:900;color:var(--ink);letter-spacing:-0.01em}
.hub-hero p{margin:0 0 24px;font-size:16px;color:var(--muted);max-width:560px;line-height:1.5}
main.hub-wrap{padding-top:32px;padding-bottom:64px;display:flex;flex-direction:column;gap:40px}
main h2{display:flex;align-items:baseline;gap:12px;margin:0 0 16px;font-size:24px}
main h2 small{font-size:13px;font-weight:400;color:var(--muted)}
main ul{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}
main li a{display:flex;justify-content:space-between;align-items:center;gap:12px;min-height:56px;padding:12px 16px;box-sizing:border-box;background:var(--white);border:1px solid var(--hairline);border-radius:12px;color:var(--ink)!important;text-decoration:none;font-size:14px;transition:border-color .15s,background .15s}
main li a:hover{border-color:var(--mauve);background:var(--mauve-light)}
main li a svg{flex-shrink:0;color:var(--stone)}
@media (max-width:600px){.hub-wrap{padding:0 16px}.hub-hero h1{font-size:32px}}"""
    (OUT / "index.html").write_text(PAGE.format(title="Ledger prototype", css=css, body=body, script=""))


def main():
    OUT.mkdir(exist_ok=True)
    files = sorted(SRC.glob("*.dc.html"))
    for f in files:
        build_page(f)
    build_index()
    print(f"Built {len(files)} pages + index.html")


if __name__ == "__main__":
    main()
