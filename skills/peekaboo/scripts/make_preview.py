#!/usr/bin/env python3
"""Build a standalone HTML preview of a peekaboo character, so the user can approve it before it goes into the app.

The character folder has the gallery shape: <id>.svg, character.json and an optional <id>.css.
The page shows the reference image and the generated concept art (if given) next to the drawing, every pose at 2x and actual size, the
SVG checker result, the color palette as swatches, and a live peek demo that plays the character's routine.
The file works offline; --serve also serves it on http://127.0.0.1 for browsers or tools that block file:// pages.

Usage: make_preview.py path/to/character-dir [--reference image.png] [--concept concept.png] [--out preview.html]
                       [--serve [--port N]]
Prints the path of the written HTML file (and the URL with --serve, which then runs until stopped).
"""
import argparse
import base64
import html
import http.server
import json
import mimetypes
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL = os.path.dirname(HERE)
DEFAULT_ROUTINE = [[700, "look"], [800, "look-back"], [800, "look-ahead"], [250, "blink"], [320, "pause"], [450, "sink"]]


def load_character(folder):
    with open(os.path.join(folder, "character.json"), encoding="utf-8") as f:
        meta = json.load(f)
    cid = meta.get("id") or os.path.basename(os.path.normpath(folder))
    with open(os.path.join(folder, f"{cid}.svg"), encoding="utf-8") as f:
        svg = f.read().strip()
    css_path = os.path.join(folder, f"{cid}.css")
    css = open(css_path, encoding="utf-8").read() if os.path.isfile(css_path) else ""
    return cid, meta, svg, css


def check_svg(path, opts):
    cmd = [sys.executable, os.path.join(HERE, "check_mascot_svg.py"), path,
           "--width", str(opts["width"]), "--height", str(opts["height"])]
    if not opts["keepsake"]:
        cmd.append("--no-keepsake")
    out = subprocess.run(cmd, capture_output=True, text=True)
    return out.returncode == 0, (out.stdout + out.stderr).strip()


def data_uri(path):
    mime = mimetypes.guess_type(path)[0] or "application/octet-stream"
    with open(path, "rb") as f:
        return f"data:{mime};base64,{base64.b64encode(f.read()).decode()}"


def palette(meta, svg):
    """[(name, hex)]: character.json "palette" if given, else the most used hex colors in the SVG."""
    given = meta.get("palette")
    if isinstance(given, list) and given:
        out = []
        for item in given:
            if isinstance(item, dict) and isinstance(item.get("hex"), str):
                out.append((str(item.get("name", "")), item["hex"]))
            elif isinstance(item, str):
                out.append(("", item))
        return out[:10]
    counts = {}
    for color in re.findall(r'(?:fill|stroke|stop-color)\s*[=:]\s*"?\s*(#[0-9a-fA-F]{3,8})\b', svg):
        color = color.lower()
        if len(color) == 4:
            color = "#" + "".join(ch * 2 for ch in color[1:])
        counts[color] = counts.get(color, 0) + 1
    return [("", c) for c, _ in sorted(counts.items(), key=lambda kv: -kv[1])[:8]]


def serve(page, port):
    """Serve only this page on 127.0.0.1 (nothing else from disk) until interrupted."""
    body = page.encode("utf-8")

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path.split("?")[0] not in ("/", "/preview.html"):
                self.send_error(404)
                return
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    with http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler) as server:
        print(f"http://127.0.0.1:{server.server_address[1]}/", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


def figure(svg, w, h, classes="", attrs="", style=""):
    own = re.match(r'(<svg\b[^>]*?)\sstyle="([^"]*)"', svg)
    if own:  # keep the drawing's own style (e.g. --peekaboo-look-face) and add ours after it
        svg = own.group(1) + svg[own.end():]
        style = own.group(2).rstrip("; ") + ("; " + style if style else "")
    sized = svg.replace("<svg", f'<svg width="{w}" height="{h}"', 1)
    return sized.replace("<svg", f'<svg class="peekaboo-figure {classes}" {attrs} style="{style}"', 1)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("character", help="character folder, or its character.json")
    parser.add_argument("--reference", help="the user's reference image, shown side by side")
    parser.add_argument("--concept", help="concept art from generate_concept.py, shown side by side")
    parser.add_argument("--out", help="output HTML (default: preview.html in the character folder)")
    parser.add_argument("--serve", action="store_true", help="also serve the page on 127.0.0.1 until stopped")
    parser.add_argument("--port", type=int, default=0, help="port for --serve (default: any free port)")
    args = parser.parse_args()

    folder = os.path.dirname(args.character) if args.character.endswith(".json") else args.character
    cid, meta, svg, extra_css = load_character(folder)
    opts = {"width": 80, "height": 100, "keepsake": 14, "accent": "#5368d6", "routine": DEFAULT_ROUTINE}
    opts.update(meta.get("options", {}))
    w, h, keep = opts["width"], opts["height"], opts["keepsake"]
    name = meta.get("name", cid)
    ok, report = check_svg(os.path.join(folder, f"{cid}.svg"), opts)

    with open(os.path.join(SKILL, "assets", "peekaboo.css"), encoding="utf-8") as f:
        base_css = f.read()

    poses = [("Upright", ""), ("Looks left", 'data-look="left"'), ("Looks right", 'data-look="right"'),
             ("Blinks", 'data-pose="blink"')]
    if any(step[1] == "tilt" for step in opts["routine"]):
        poses.append(("Tilts", 'data-pose="tilt"'))

    def pose_card(label, attrs, scale):
        return (f'<figure><div class="stage" style="width:{w * scale}px;height:{h * scale}px">'
                f'{figure(svg, w * scale, h * scale, "peeking", attrs)}</div><figcaption>{label}</figcaption></figure>')

    keepsake_card = (
        f'<figure><div class="stage edge" style="width:{w * 2}px;height:{keep * 2 + 30}px"><div class="clip" style="height:{h * 2}px">'
        f'{figure(svg, w * 2, h * 2, "keepsake", "", f"--peekaboo-sink:{(h - keep) * 2}px")}</div></div>'
        f'<figcaption>Keepsake ({html.escape(str(meta.get("keepsake", "top")))}, {keep}px above the edge)</figcaption></figure>'
    )
    reference = ""
    if args.reference:
        reference = (f'<figure><img class="ref" src="{data_uri(args.reference)}" alt="Reference image">'
                     f'<figcaption>Reference image</figcaption></figure>')
    if args.concept:
        reference += (f'<figure><img class="ref" src="{data_uri(args.concept)}" alt="Concept art">'
                      f'<figcaption>Concept art (generated)</figcaption></figure>')

    facts = {
        "Style": meta.get("style", "chibi"),
        "Look": meta.get("look", ""), "Personality": meta.get("personality", ""),
        "Keepsake": meta.get("keepsake", ""), "Size": f"{w} x {h} px",
        "Visits every": f'{opts.get("interval", [12000, 42000])[0] // 1000}-{opts.get("interval", [12000, 42000])[1] // 1000} s',
        "Suggested shortcut": "+".join(
            [k[:-3].capitalize() for k in ("ctrlKey", "altKey", "shiftKey", "metaKey") if meta.get("suggestedShortcut", {}).get(k)]
            + [meta.get("suggestedShortcut", {}).get("code", "").replace("Key", "")]),
    }
    rows = "".join(f"<tr><th>{k}</th><td>{html.escape(str(v))}</td></tr>" for k, v in facts.items() if v)
    swatches = "".join(
        f'<figure class="swatch"><span style="background:{html.escape(c)}"></span>'
        f'<figcaption>{html.escape(n) + "<br>" if n else ""}<code>{html.escape(c)}</code></figcaption></figure>'
        for n, c in palette(meta, svg))

    page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>{html.escape(name)} preview</title>
<style>
{base_css}
{extra_css}
body {{ margin: 0; font: 14px/1.5 system-ui, sans-serif; color: #1d2433; background: #f5f7fb; }}
body.dark {{ color: #e6e9f2; background: #161a24; }}
main {{ max-width: 1040px; margin: 0 auto; padding: 24px; }}
h1 {{ margin: 0 0 4px; font-size: 22px; }} h2 {{ margin: 28px 0 8px; font-size: 16px; }}
.note {{ color: #667; }} body.dark .note {{ color: #9aa3b8; }}
.row {{ display: flex; flex-wrap: wrap; gap: 20px; align-items: flex-end; }}
figure {{ margin: 0; text-align: center; }} figcaption {{ font-size: 12px; color: #667; margin-top: 6px; }}
.stage {{ position: relative; display: flex; align-items: flex-end; justify-content: center; }}
.stage .peekaboo-figure {{ transition: none; }}
.stage .peekaboo-figure[data-pose=blink] .pb-eyes {{ transform: scaleY(.1); }}
.stage .peekaboo-figure[data-pose=tilt] .pb-face {{ transform: rotate(-7deg); }}
.edge {{ border-bottom: 3px solid #8a94ad; }}
.clip {{ position: absolute; inset: auto 0 0 0; overflow: hidden; }}
.ref {{ max-width: 240px; max-height: 240px; border-radius: 8px; box-shadow: 0 1px 4px #0003; }}
.swatch span {{ display: block; width: 44px; height: 44px; border-radius: 8px; box-shadow: inset 0 0 0 1px #0003; }}
.swatch code {{ font-size: 11px; color: #889; }}
.check {{ padding: 8px 12px; border-radius: 6px; white-space: pre-wrap; font: 12px ui-monospace, monospace; }}
.check.ok {{ background: #e3f6e8; color: #1c5a2c; }} .check.bad {{ background: #fde6e6; color: #8a1f1f; }}
table {{ border-collapse: collapse; }} th {{ text-align: left; padding: 2px 16px 2px 0; color: #667; font-weight: 500; }}
.demo {{ position: relative; height: 260px; border-radius: 8px; overflow: hidden; background: #e9edf5; }}
body.dark .demo {{ background: #222838; }}
.demo header {{ position: absolute; inset: 0 0 auto; height: 56px; background: #fff; box-shadow: 0 1px 0 #0002; display: flex; align-items: center; padding: 0 16px; font-weight: 600; }}
body.dark .demo header {{ background: #2c3347; }}
.demo .panel {{ position: absolute; top: 120px; left: 40px; right: 40px; bottom: 0; background: #fff; border-radius: 8px 8px 0 0; box-shadow: 0 -1px 0 #0002; }}
body.dark .demo .panel {{ background: #2c3347; }}
.demo .peekaboo {{ left: calc(50% - {w / 2}px); top: {120 - h}px; width: {w}px; height: {h}px; z-index: 1; }}
.demo .peekaboo-mark {{ left: calc(50% - {w / 2}px); top: {120 - keep}px; width: {w}px; height: {keep}px; z-index: 2; }}
.controls {{ display: flex; gap: 8px; margin-top: 8px; }}
button.ctl {{ font: inherit; padding: 4px 12px; border: 1px solid #8a94ad; border-radius: 6px; background: transparent; color: inherit; cursor: pointer; }}
</style></head>
<body><main>
<h1>{html.escape(name)}: preview</h1>
<p class="note">Not added to your app yet. Look it over, then answer the approval question in the chat:
approve, or say what to change.</p>
<div class="row">{reference}{pose_card("2x", "", 2)}{pose_card("Actual size", "", 1)}<table>{rows}</table></div>
<h2>Colors</h2>
<div class="row">{swatches}</div>
<h2>Poses</h2>
<div class="row">{"".join(pose_card(label, attrs, 2) for label, attrs in poses)}{keepsake_card}</div>
<h2>Live peek</h2>
<div class="demo"><header>Your app</header><div class="panel"></div>
<div class="peekaboo" data-character="{html.escape(cid)}"><div class="peekaboo-pose">{figure(svg, w, h, "", 'id="live"')}</div></div>
<button class="peekaboo-mark" id="mark" hidden aria-label="Call {html.escape(name)} back" style="--peekaboo-accent:{html.escape(opts["accent"])}"></button>
</div>
<div class="controls"><button class="ctl" id="replay">Replay</button><button class="ctl" id="theme">Dark background</button></div>
<h2>Parts check</h2>
<div class="check {"ok" if ok else "bad"}">{html.escape(report)}</div>
</main>
<script>
const routine = {json.dumps(opts["routine"])};
const fig = document.getElementById('live'), mark = document.getElementById('mark');
fig.style.setProperty('--peekaboo-sink', '{h - keep}px');
let run = 0;
const wait = ms => new Promise(r => setTimeout(r, ms));
async function visit() {{
  const id = ++run; mark.hidden = true;
  fig.classList.remove('keepsake', 'blinking', 'tilting'); delete fig.dataset.look;
  await wait(50); fig.classList.add('peeking');
  for (const [ms, action] of [...routine, ...(routine.at(-1)?.[1] === 'sink' ? [] : [[450, 'sink']])]) {{
    await wait(ms); if (id !== run) return;
    fig.classList.remove('blinking', 'tilting');
    const look = fig.dataset.look;
    if (action === 'look') fig.dataset.look = Math.random() < .5 ? 'left' : 'right';
    else if (action === 'look-back') fig.dataset.look = look === 'left' ? 'right' : 'left';
    else if (action === 'look-ahead') delete fig.dataset.look;
    else if (action === 'blink') fig.classList.add('blinking');
    else if (action === 'tilt') fig.classList.add('tilting');
    else if (action === 'sink') {{ delete fig.dataset.look; fig.classList.remove('peeking'); fig.classList.add('keepsake'); }}
  }}
  await wait(500); if (id !== run) return;
  mark.hidden = false;
  await wait(4000); if (id !== run) return;
  mark.hidden = true; fig.classList.remove('keepsake');
  await wait(1500); if (id === run) visit();
}}
mark.onclick = visit;
document.getElementById('replay').onclick = visit;
document.getElementById('theme').onclick = e => {{
  const dark = document.body.classList.toggle('dark');
  e.target.textContent = dark ? 'Light background' : 'Dark background';
}};
visit();
</script></body></html>
"""
    out = args.out or os.path.join(folder, "preview.html")
    with open(out, "w", encoding="utf-8") as f:
        f.write(page)
    print(os.path.abspath(out), flush=True)
    if args.serve:
        serve(page, args.port)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
