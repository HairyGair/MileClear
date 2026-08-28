#!/usr/bin/env python3
"""Render a 1200x628 Open Graph card for every post in apps/web/src/data/posts.ts.
Output: apps/web/public/og/updates/<slug>.png. Re-run after adding posts."""
import re, os, glob, textwrap
from PIL import Image, ImageDraw, ImageFont
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = open(os.path.join(ROOT, "apps/web/src/data/posts.ts")).read()
posts = re.findall(r'slug:\s*"([^"]+)",\s*title:\s*"([^"]+)",\s*excerpt:\s*"([^"]+)",\s*date:\s*"([^"]+)"', src)
fonts = glob.glob(os.path.join(ROOT, "apps/mobile/assets/fonts/*.ttf"))
bold = next(f for f in fonts if "Bold" in f and "Semi" not in f and "Extra" not in f)
medium = next(f for f in fonts if "Medium" in f)
icon = Image.open(os.path.join(ROOT, "apps/mobile/assets/branding/icon-1024.png")).convert("RGBA").resize((120, 120), Image.LANCZOS)
NAVY, AMBER, WHITE, MUTED = (3, 7, 18), (252, 211, 77), (249, 250, 251), (148, 163, 184)
out = os.path.join(ROOT, "apps/web/public/og/updates"); os.makedirs(out, exist_ok=True)
for slug, title, excerpt, date in posts:
    im = Image.new("RGB", (1200, 628), NAVY); d = ImageDraw.Draw(im)
    d.rectangle([80, 70, 140, 76], fill=AMBER)
    d.text((80, 96), "MILECLEAR UPDATES", font=ImageFont.truetype(medium, 22), fill=AMBER, spacing=4)
    size = 68
    while True:
        f = ImageFont.truetype(bold, size); lines = textwrap.wrap(title, width=int(1040 / (size * 0.52)))
        if len(lines) <= 3 or size <= 40: break
        size -= 4
    y = 150
    for ln in lines[:3]:
        d.text((80, y), ln, font=f, fill=WHITE); y += int(size * 1.22)
    fe = ImageFont.truetype(medium, 28)
    ex = []
    for w in textwrap.wrap(excerpt, width=200):
        pass
    words = excerpt.split(); line = ""
    for w in words:
        t = (line + " " + w).strip()
        if d.textlength(t, font=fe) > 1040: ex.append(line); line = w
        else: line = t
    if line: ex.append(line)
    ex = ex[:3]; y += 24
    for ln in ex:
        if y > 500: break
        d.text((80, y), ln, font=fe, fill=MUTED); y += 40
    d.text((80, 566), "mileclear.com/updates", font=ImageFont.truetype(medium, 24), fill=MUTED)
    d.text((1120 - d.textlength(date, font=fe), 566), date, font=fe, fill=MUTED)
    im.paste(icon, (1000, 60), icon)
    im.save(os.path.join(out, f"{slug}.png"), optimize=True)
print(f"rendered {len(posts)} cards")
