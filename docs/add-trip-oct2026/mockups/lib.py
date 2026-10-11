# Small SVG kit for the mockups (copied from docs/more-trips-oct2026, 11 Oct 2026).
# Phone 390 x 844 pt, dark theme from apps/mobile/lib/theme.ts,
# Plus Jakarta Sans for text and Ionicons (the app's icon font) for icons.
# build.py draws the screens; render.sh turns each SVG into a 2x PNG with
# headless Chrome, loading the app's own font files.

import json
import os
from xml.sax.saxutils import escape

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))

# theme.ts
BG = "#030712"
SURFACE = "#0a1120"
BORDER = "rgba(255,255,255,0.06)"
HAIR = "rgba(255,255,255,0.08)"
AMBER = "#f5a623"
AMBER_DIM = "rgba(245,166,35,0.12)"
AMBER_GLOW = "rgba(245,166,35,0.35)"
T1 = "#f0f2f5"
T2 = "#8494a7"
T3 = "#94a3b8"
GREEN = "#10b981"
RED = "#ef4444"
RED_DIM = "rgba(239,68,68,0.12)"
RED_EDGE = "rgba(239,68,68,0.35)"
LIVE = "#34c759"
PERSONAL = "#374151"
PERSONAL_EDGE = "#94a3b8"
TRACK = "#191f2d"
HERO_TINT = "#181a20"

FONT = "Plus Jakarta Sans, -apple-system, Helvetica, Arial, sans-serif"

_GLYPHS = None


def _glyphs():
    global _GLYPHS
    if _GLYPHS is None:
        for p in [
            os.path.join(REPO, "node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json"),
            "/Users/anthony/Projects/MileClear/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json",
        ]:
            if os.path.exists(p):
                _GLYPHS = json.load(open(p))
                break
    return _GLYPHS


class Svg:
    def __init__(self, w=390, h=844):
        self.w, self.h = w, h
        self.parts = [f'<rect width="{w}" height="{h}" fill="{BG}"/>']

    def add(self, s):
        self.parts.append(s)

    def text(self, x, y, s, size=15, weight=500, fill=T1, anchor="start", extra=""):
        self.add(
            f'<text x="{x}" y="{y}" font-family="{FONT}" font-size="{size}" '
            f'font-weight="{weight}" fill="{fill}" text-anchor="{anchor}" {extra}>{escape(s)}</text>'
        )

    def rich(self, x, y, spans, size=15, anchor="start"):
        """spans: list of (text, weight, fill)."""
        inner = "".join(
            f'<tspan font-weight="{w}" fill="{f}">{escape(t)}</tspan>' for t, w, f in spans
        )
        self.add(
            f'<text x="{x}" y="{y}" font-family="{FONT}" font-size="{size}" text-anchor="{anchor}">{inner}</text>'
        )

    def icon(self, x, y, name, size=20, fill=T2, anchor="start"):
        """x, y is the top-left of the icon box."""
        cp = _glyphs()[name]
        self.add(
            f'<text x="{x}" y="{y + size * 0.86}" font-family="Ionicons" font-size="{size}" '
            f'fill="{fill}" text-anchor="{anchor}">&#{cp};</text>'
        )

    def rect(self, x, y, w, h, rx=0, fill="none", stroke=None, sw=1, extra=""):
        st = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ""
        self.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"{st} {extra}/>')

    def line(self, x1, y1, x2, y2, stroke=HAIR, sw=1, dash=None):
        d = f' stroke-dasharray="{dash}"' if dash else ""
        self.add(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{stroke}" stroke-width="{sw}"{d}/>')

    def circle(self, cx, cy, r, fill="none", stroke=None, sw=1):
        st = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ""
        self.add(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}"{st}/>')

    def path(self, d, stroke=AMBER, sw=2.5, fill="none"):
        self.add(
            f'<path d="{d}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" '
            f'stroke-linecap="round" stroke-linejoin="round"/>'
        )

    def chevron(self, x, cy, color=T3):
        self.path(f"M{x} {cy - 6} l6 6 -6 6", stroke=color, sw=2)

    def save(self, name):
        svg = (
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.w}" height="{self.h}" '
            f'viewBox="0 0 {self.w} {self.h}">\n' + "\n".join(self.parts) + "\n</svg>\n"
        )
        with open(os.path.join(HERE, name + ".svg"), "w") as f:
            f.write(svg)


# ── Shared chrome ───────────────────────────────────────────────────


def status_bar(s):
    s.text(50, 37, "9:41", 17, 600, T1)
    s.rect(133, 11, 124, 36, 18, "#000")
    for i, h in enumerate([4, 6, 8, 10]):
        s.rect(286 + i * 5, 34 - h, 3, h, 1, T1)
    s.path("M311 27 a9 9 0 0 1 13 0 M313.5 30 a5.5 5.5 0 0 1 8 0", stroke=T1, sw=1.8)
    s.circle(317.5, 33, 1.5, T1)
    s.rect(333, 26, 26, 12, 3.5, "none", T1, 1)
    s.rect(335, 28, 20, 8, 2, T1)


def tab_header(s, title, avatar=True, buttons=()):
    """Tab screen header (AppHeader): title left, round buttons and avatar right."""
    s.text(16, 92, title, 22, 700, T1)
    x = 374
    if avatar:
        avatar_dot(s, x - 18, 84, 18)
        x -= 36 + 10
    for name, color in reversed(buttons):
        s.circle(x - 18, 84, 18, SURFACE, BORDER)
        s.icon(x - 18, 74, name, 20, color, anchor="middle")
        x -= 36 + 8


def stack_header(s, title):
    s.circle(36, 80, 20, SURFACE, BORDER)
    s.path("M39 72 l-8 8 8 8", stroke=T1, sw=2.4)
    s.text(195, 86, title, 17, 600, T1, "middle")


def avatar_dot(s, cx, cy, r):
    s.circle(cx, cy, r, "#4a1d5c", "rgba(255,255,255,0.10)")
    s.icon(cx, cy - r * 0.55, "car", r * 1.1, "#c084fc", anchor="middle")


def tab_bar(s, active, tabs):
    """tabs: list of (label, icon_outline, icon_filled)."""
    y0 = 844 - 83
    s.rect(0, y0, 390, 83, 0, BG)
    s.line(0, y0, 390, y0, HAIR, 0.5)
    n = len(tabs)
    for i, (label, out, filled) in enumerate(tabs):
        cx = 390 / n * (i + 0.5)
        on = label == active
        col = AMBER if on else T2
        s.icon(cx, y0 + 8, filled if on else out, 24, col, anchor="middle")
        s.text(cx, y0 + 48, label, 12, 600, col, "middle")
    s.rect(128, 830, 134, 5, 2.5, T1)


TABS_WORK = [
    ("Home", "home-outline", "home"),
    ("Trips", "car-outline", "car"),
    ("Tax", "document-text-outline", "document-text"),
    ("More", "ellipsis-horizontal-circle-outline", "ellipsis-horizontal-circle"),
]
TABS_PERSONAL = [
    ("Home", "home-outline", "home"),
    ("Trips", "car-outline", "car"),
    ("Insights", "stats-chart-outline", "stats-chart"),
    ("More", "ellipsis-horizontal-circle-outline", "ellipsis-horizontal-circle"),
]


def group_label(s, y, label):
    """Sentence-case group name, 13 semibold text2 (as the Settings mockups)."""
    s.text(20, y, label, 13, 600, T2)


def card(s, y, h, x=16, w=358):
    s.rect(x, y, w, h, 16, SURFACE, BORDER)


def row(s, y, icon, title, sub=None, sub_fill=T2, badge=None, last=False, h=None,
        icon_fill=T2, right_text=None, right_fill=T2, bold_sub=None, chevron=True):
    """A row inside a card that starts at x=16. Returns the row height."""
    rh = h or (64 if sub else 52)
    if icon:
        s.icon(30, y + rh / 2 - 10, icon, 20, icon_fill)
    tx = 64 if icon else 32
    if sub:
        s.text(tx, y + rh / 2 - 3, title, 15, 500, T1)
        if bold_sub:
            s.rich(tx, y + rh / 2 + 16, bold_sub, 13)
        else:
            s.text(tx, y + rh / 2 + 16, sub, 13, 400, sub_fill)
    else:
        s.text(tx, y + rh / 2 + 5, title, 15, 500, T1)
    rx = 352
    if chevron:
        s.chevron(rx, y + rh / 2)
        rx -= 10
    if badge:
        bw = 8 + len(badge) * 7
        s.rect(rx - bw, y + rh / 2 - 10, bw, 20, 8, AMBER_DIM)
        s.text(rx - bw / 2, y + rh / 2 + 4, badge, 11, 600, AMBER, "middle")
    if right_text:
        s.text(rx, y + rh / 2 + 5, right_text, 14, 600, right_fill, "end")
    if not last:
        s.line(tx, y + rh, 374, y + rh)
    return rh


def rows_card(s, y, rows):
    """rows: list of dicts for row(). Draws card + rows; returns bottom y."""
    heights = [r.get("h") or (64 if r.get("sub") or r.get("bold_sub") else 52) for r in rows]
    card(s, y, sum(heights))
    yy = y
    for i, r in enumerate(rows):
        r = dict(r)
        if r.get("bold_sub") and not r.get("sub"):
            r["sub"] = " "
        yy += row(s, yy, last=i == len(rows) - 1, **r)
    return yy


def check_icon(s, cx, cy, ok=True):
    col = GREEN if ok else RED
    if ok:
        s.circle(cx, cy, 11, "rgba(16,185,129,0.16)")
        s.circle(cx, cy, 11, "none", col, 1.4)
        s.path(f"M{cx - 4.5} {cy + 0.2} l3 3 6-6.4", stroke=col, sw=2.2)
    else:
        s.icon(cx, cy - 11, "alert-circle", 22, RED, anchor="middle")
