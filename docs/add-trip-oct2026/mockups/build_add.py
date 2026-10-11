# Add a past trip mockups, Direction A "From, To, When" (recommended) and
# one Direction B screen for comparison. Demo values only. Today in the
# mockups is Sun 11 Oct 2026; the driver is back-filling Sat 3 Oct.
from lib import *

DIM = "rgba(3,7,18,0.72)"
CHIP_BG = "#111a2b"
SEL_BG = T1
W = 358
X = 16


def fit(text, px, size=15):
    n = int(px / (size * 0.56))
    return text if len(text) <= n else text[: n - 1].rstrip() + "\u2026"


def chip(s, x, y, label):
    """Soft amber Business chip, centred on x."""
    w = 28 + len(label) * 6.6
    x0 = x - w / 2
    s.rect(x0, y, w, 24, 8, AMBER_DIM)
    s.icon(x0 + 8, y + 5, "briefcase", 13, AMBER)
    s.text(x0 + 25, y + 16.5, label, 12, 700, AMBER)


def home_indicator(s):
    s.rect(128, 830, 134, 5, 2.5, T1)


def text_w(t, size):
    return len(t) * size * 0.6


def pill(s, x, y, label, icon=None, selected=False, h=34, size=14, muted=False):
    """A place or day chip. Returns its width."""
    if not label:
        s.circle(x + h / 2, y + h / 2, h / 2, CHIP_BG, "rgba(255,255,255,0.10)")
        s.icon(x + h / 2, y + h / 2 - 8, icon, 16, T2, anchor="middle")
        return h
    w = 24 + text_w(label, size) + (22 if icon else 0)
    fill = SEL_BG if selected else CHIP_BG
    stroke = None if selected else "rgba(255,255,255,0.10)"
    s.rect(x, y, w, h, h / 2, fill, stroke)
    tx = x + 13
    col = BG if selected else (T2 if muted else T1)
    if icon:
        s.icon(tx, y + h / 2 - 8, icon, 16, BG if selected else T2)
        tx += 22
    s.text(tx, y + h / 2 + 5, label, size, 600, col)
    return w


def pills(s, x, y, items, gap=8):
    for it in items:
        x += pill(s, x, y, **it) + gap
    return x


def label(s, y, t):
    s.text(20, y, t, 13, 600, T2)


def place_row_filled(s, y, lab, name, addr, h=72):
    s.text(32, y + 24, lab, 13, 500, T2)
    s.text(32, y + 47, name, 16, 600, T1)
    s.text(32 + text_w(name, 16) + 12, y + 47, "· " + addr, 13, 400, T2)
    s.text(342, y + 41, "Change", 14, 600, T2, "end")
    return h


def place_row_empty(s, y, lab, chips, h=88):
    s.text(32, y + 24, lab, 13, 500, T2)
    pills(s, 30, y + 38, chips)
    return h


PLACE_CHIPS = [
    dict(label="Home", icon="home-outline"),
    dict(label="Depot", icon="business-outline"),
    dict(label="Office", icon="briefcase-outline"),
    dict(label="", icon="search", muted=True),
]
PLACE_CHIPS_FROM_DEPOT = [
    dict(label="Home", icon="home-outline"),
    dict(label="Eldon", icon="time-outline"),
    dict(label="Office", icon="briefcase-outline"),
    dict(label="", icon="search", muted=True),
]


def where_card(s, y, frm=None, to=None, to_chips=PLACE_CHIPS, from_chips=PLACE_CHIPS):
    h1 = 72 if frm else 88
    h2 = 72 if to else 88
    card(s, y, h1 + h2)
    if frm:
        place_row_filled(s, y, "From", *frm)
    else:
        place_row_empty(s, y, "From", from_chips)
    s.line(32, y + h1, 374, y + h1)
    if to:
        place_row_filled(s, y + h1, "To", *to)
    else:
        place_row_empty(s, y + h1, "To", to_chips)
    # swap button on the divider
    if frm and to:
        s.circle(352, y + h1, 15, BG, "rgba(255,255,255,0.12)")
        s.icon(352, y + h1 - 8, "swap-vertical", 16, T2, anchor="middle")
    return y + h1 + h2


def when_card(s, y, day=None, time=None, time_hint=None, context=None, overlap=None):
    """day: label of the selected chip. context: grey line about the day."""
    rows_h = 76 + 56 + (40 if (context or overlap) else 0)
    card(s, y, rows_h)
    s.text(32, y + 24, "When", 13, 500, T2)
    chips = [("Today", None), ("Yesterday", None)]
    items = [dict(label=l, selected=(l == day), h=32, size=13) for l, _ in chips]
    if day and day not in [c for c, _ in chips]:
        items.append(dict(label=day, icon="calendar-outline", selected=True, h=32, size=13))
    else:
        items.append(dict(label="Pick a day", icon="calendar-outline", h=32, size=13, muted=True))
    pills(s, 30, y + 36, items, gap=8)
    yy = y + 76
    s.line(32, yy, 374, yy)
    s.icon(32, yy + 18, "time-outline", 20, T2)
    s.text(64, yy + 34, "Set off at", 15, 500, T1)
    if time:
        s.text(342, yy + 35, time, 17, 700, T1, "end")
    else:
        s.text(342, yy + 34, time_hint or "Choose a time", 15, 500, T3, "end")
    s.chevron(352, yy + 28)
    yy += 56
    if overlap:
        s.line(32, yy, 374, yy)
        s.rect(26, yy + 6, 338, 30, 8, AMBER_DIM)
        s.icon(34, yy + 13, "information-circle-outline", 16, AMBER)
        s.text(56, yy + 26, fit(overlap, 290, 13), 13, 600, AMBER)
        yy += 40
    elif context:
        s.line(32, yy, 374, yy)
        s.text(32, yy + 25, context, 13, 400, T2)
        yy += 40
    return y + rows_h


def worked_out(s, y, miles, arrive):
    card(s, y, 64)
    s.icon(30, y + 22, "navigate-outline", 20, T2)
    s.rich(64, y + 29, [(miles, 700, T1), (" by road", 500, T2)], 15)
    s.text(64, y + 48, arrive, 13, 400, T2)
    s.text(342, y + 37, "Change", 14, 600, T2, "end")
    return y + 64


def miles_box(s, y):
    card(s, y, 96)
    s.text(32, y + 24, "Miles", 13, 500, T2)
    s.rect(30, y + 34, 140, 40, 10, BG, AMBER_GLOW)
    s.text(46, y + 60, "e.g. 12.5", 15, 500, T3)
    s.text(184, y + 50, "No signal, so we couldn't", 12, 400, T2)
    s.text(184, y + 66, "work out the road distance", 12, 400, T2)
    s.text(32, y + 88, "", 1)
    return y + 96


def classify(s, y, chosen=None, app=None):
    label(s, y + 14, "Business or personal?")
    y += 24
    for i, (k, ic, lab) in enumerate([("business", "briefcase", "Business"), ("personal", "person-outline", "Personal")]):
        x = X + i * (W / 2 + 4)
        w = W / 2 - 4
        on = chosen == k
        if on and k == "business":
            s.rect(x, y, w, 48, 14, AMBER_DIM, AMBER_GLOW)
            col = AMBER
        elif on:
            s.rect(x, y, w, 48, 14, PERSONAL, PERSONAL_EDGE)
            col = T1
        else:
            s.rect(x, y, w, 48, 14, SURFACE, "rgba(255,255,255,0.10)")
            col = T1
        base = "briefcase" if k == "business" else "person"
        s.icon(x + w / 2 - 44, y + 15, base if on else base + "-outline", 18, col if on else T2)
        s.text(x + w / 2 - 20, y + 30, lab, 15, 600, col)
    y += 48
    if chosen == "business" and app:
        y += 8
        card(s, y, 52)
        s.text(32, y + 31, "Which app", 15, 500, T1)
        s.text(342, y + 31, app, 15, 600, T1, "end")
        s.chevron(352, y + 26)
        y += 52
    elif not chosen:
        s.text(20, y + 22, "Not sure? Leave it and it goes in To sort.", 13, 400, T2)
        y += 30
    return y


def more_details(s, y, sub="Toyota Prius · no note"):
    card(s, y, 60)
    s.text(32, y + 26, "More details", 15, 500, T1)
    s.text(32, y + 45, sub, 13, 400, T2)
    s.chevron(352, y + 30)
    return y + 60


def add_button(s, y=758, text="Add trip", enabled=True):
    if enabled:
        s.rect(X, y, W, 52, 14, AMBER)
        s.text(195, y + 32, text, 16, 700, BG, "middle")
    else:
        s.rect(X, y, W, 52, 14, "rgba(245,166,35,0.28)")
        s.text(195, y + 32, text, 15, 600, "rgba(3,7,18,0.75)", "middle")


def form_header(s, title="Add a past trip"):
    status_bar(s)
    stack_header(s, title)


# ── A1: opened, empty ─────────────────────────────────────────────────
def a_empty():
    s = Svg()
    form_header(s)
    y = where_card(s, 116)
    y = when_card(s, y + 14)
    s.text(20, y + 26, "Miles and arrival time are worked out", 13, 400, T2)
    s.text(20, y + 44, "once you've said where and when.", 13, 400, T2)
    y = classify(s, y + 60)
    y = more_details(s, y + 10)
    add_button(s, text="Add where you went and when", enabled=False)
    home_indicator(s)
    s.save("a-empty")


# ── A2: filled in, Business, ready to save ────────────────────────────
def filled_screen(s, overlap=False):
    form_header(s)
    y = where_card(s, 116, ("Home", "12 Kenton Lane"), ("Depot", "Team Valley"))
    if overlap:
        y = when_card(s, y + 14, day="Sat 3 Oct", time="08:35",
                      overlap="You already have a trip at 08:40 · Open")
    else:
        y = when_card(s, y + 14, day="Sat 3 Oct", time="08:35",
                      context="Also on Sat 3 Oct: 1 trip, 13:20 to 13:45")
    y = worked_out(s, y + 12, "12.4 miles", "Arrives about 09:01")
    y = classify(s, y + 12, chosen="business", app="Uber Eats")
    if not overlap:
        more_details(s, y + 10)
    add_button(s)
    home_indicator(s)


def a_filled():
    s = Svg()
    filled_screen(s)
    s.save("a-filled")


# ── A3: "MileClear already has a trip around then" ────────────────────
def a_overlap():
    s = Svg()
    filled_screen(s, overlap=True)
    s.rect(0, 0, 390, 844, 0, DIM)
    top = 404
    s.rect(0, top, 390, 460, 24, SURFACE, BORDER)
    s.rect(175, top + 8, 40, 5, 2.5, "rgba(255,255,255,0.18)")
    s.text(24, top + 50, "MileClear already has a", 20, 700, T1)
    s.text(24, top + 76, "trip around then", 20, 700, T1)
    s.text(24, top + 102, "Is it the drive you're adding?", 14, 400, T2)
    # the existing trip
    y = top + 120
    s.rect(16, y, 358, 76, 16, BG, "rgba(255,255,255,0.10)")
    s.rect(28, y + 12, 52, 52, 10, TRACK)
    s.path(f"M40 {y+52} C46 {y+40} 52 {y+44} 56 {y+36} S64 {y+28} 68 {y+24}", stroke=AMBER, sw=2.2)
    s.circle(40, y + 52, 3.5, TRACK, T1, 1.5)
    s.circle(68, y + 24, 3.5, AMBER)
    s.text(94, y + 28, "Home to Tesco Extra", 15, 600, T1)
    s.text(94, y + 47, "08:40 to 09:05 · 9.3 mi", 13, 400, T2)
    s.text(94, y + 64, "Recorded by your phone, saved later", 12, 400, T3)
    s.text(24, y + 104, "Yours: Home to Depot · 08:35 · 12.4 mi", 13, 500, T2)
    # buttons
    y += 124
    s.rect(16, y, 358, 50, 14, AMBER)
    s.text(195, y + 31, "It's the same drive", 16, 700, BG, "middle")
    y += 60
    s.rect(16, y, 358, 50, 14, SURFACE, "rgba(255,255,255,0.14)")
    s.text(195, y + 31, "Open that trip to fix it", 15, 600, T1, "middle")
    y += 66
    s.text(195, y + 10, "Add mine as well", 15, 600, T2, "middle")
    home_indicator(s)
    s.save("a-overlap")


# ── A4: saved, with the next trip one tap away ────────────────────────
def a_saved():
    s = Svg()
    status_bar(s)
    cy = 230
    s.circle(195, cy, 34, "rgba(16,185,129,0.16)")
    s.icon(195, cy - 24, "checkmark-circle", 48, GREEN, anchor="middle")
    s.text(195, cy + 72, "Trip added", 22, 700, T1, "middle")
    s.text(195, cy + 118, "12.4 miles", 34, 700, T1, "middle")
    s.text(195, cy + 150, "Home to Depot · Sat 3 Oct, 08:35 to 09:01", 14, 400, T2, "middle")
    chip(s, 195, cy + 168, "Business · Uber Eats")
    s.text(195, cy + 222, "Worked out from the road route", 13, 400, T3, "middle")
    s.text(195, cy + 240, "Saved to your account", 13, 400, T3, "middle")
    # what next
    y = 560
    s.rect(X, y, W, 60, 14, AMBER)
    s.icon(36, y + 19, "arrow-forward", 20, BG)
    s.text(66, y + 27, "Add the next trip", 16, 700, BG)
    s.text(66, y + 46, "From Depot, Sat 3 Oct, after 09:01", 13, 500, "rgba(3,7,18,0.72)")
    y += 70
    s.rect(X, y, W, 60, 14, SURFACE, "rgba(255,255,255,0.14)")
    s.icon(36, y + 19, "return-up-back", 20, T2)
    s.text(66, y + 27, "Add the way back", 16, 600, T1)
    s.text(66, y + 46, "Depot to Home, same day", 13, 400, T2)
    y += 86
    s.text(195, y + 8, "Done", 16, 600, T2, "middle")
    home_indicator(s)
    s.save("a-saved")


# ── A5: the next trip, carried over ───────────────────────────────────
def a_next():
    s = Svg()
    form_header(s, "Add the next trip")
    y = where_card(s, 116, ("Depot", "Team Valley"), None, to_chips=PLACE_CHIPS_FROM_DEPOT)
    y = when_card(s, y + 14, day="Sat 3 Oct", time_hint="after 09:01",
                  context="Sat 3 Oct so far: 2 trips, 08:35 and 13:20")
    s.text(20, y + 26, "Miles and arrival time are worked out", 13, 400, T2)
    s.text(20, y + 44, "once you've said where and when.", 13, 400, T2)
    y = classify(s, y + 60, chosen="business", app="Uber Eats")
    y = more_details(s, y + 10)
    add_button(s, text="Add where you went and when", enabled=False)
    home_indicator(s)
    s.save("a-next")


# ── A6: Pick a day, with dots on days that already have trips ─────────
def a_day_picker():
    s = Svg()
    filled = Svg()
    form_header(s)
    where_card(s, 116, ("Home", "12 Kenton Lane"), ("Depot", "Team Valley"))
    s.rect(0, 0, 390, 844, 0, DIM)
    top = 300
    s.rect(0, top, 390, 560, 24, SURFACE, BORDER)
    s.rect(175, top + 8, 40, 5, 2.5, "rgba(255,255,255,0.18)")
    s.text(24, top + 48, "Which day?", 20, 700, T1)
    s.text(24, top + 72, "Days with a dot already have trips.", 13, 400, T2)
    # month nav
    s.circle(44, top + 108, 16, BG, "rgba(255,255,255,0.10)")
    s.path(f"M47 {top+102} l-6 6 6 6", stroke=T1, sw=2)
    s.text(195, top + 113, "October 2026", 16, 600, T1, "middle")
    s.circle(346, top + 108, 16, BG, "rgba(255,255,255,0.10)")
    s.path(f"M343 {top+102} l6 6 -6 6", stroke=T3, sw=2)
    days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    cw = 48
    x0 = 27
    for i, d in enumerate(days):
        s.text(x0 + i * cw + cw / 2, top + 150, d, 12, 600, T3, "middle")
    with_trips = {1, 2, 3, 5, 6, 7, 8, 9, 10}
    day = 1
    col = 3  # 1 Oct 2026 is a Thursday
    row = 0
    while day <= 31:
        cx = x0 + col * cw + cw / 2
        cy = top + 186 + row * 46
        future = day > 11
        if day == 3:
            s.circle(cx, cy - 5, 19, T1)
            s.text(cx, cy, str(day), 15, 700, BG, "middle")
        else:
            s.text(cx, cy, str(day), 15, 500, T3 if future else T1, "middle")
            if day == 11:
                s.circle(cx, cy - 5, 19, "none", "rgba(255,255,255,0.25)")
        if day in with_trips:
            s.circle(cx, cy + 11, 2.5, T2)
        day += 1
        col += 1
        if col == 7:
            col = 0
            row += 1
    s.text(24, top + 440, "Sat 3 Oct: 1 trip so far, 13:20 to 13:45", 14, 600, T1)
    s.text(24, top + 460, "Sun 4 Oct has none", 13, 400, T2)
    s.rect(X, top + 478, W, 50, 14, AMBER)
    s.text(195, top + 509, "Use Sat 3 Oct", 16, 700, BG, "middle")
    home_indicator(s)
    s.save("a-day-picker")


# ── A7: no signal ─────────────────────────────────────────────────────
def a_offline():
    s = Svg()
    form_header(s)
    s.rect(X, 112, W, 36, 10, CHIP_BG, "rgba(255,255,255,0.08)")
    s.icon(28, 120, "cloud-offline-outline", 18, T2)
    s.text(54, 135, "No signal. The trip saves on your phone.", 13, 500, T2)
    y = where_card(s, 158, ("Home", "saved place"), ("Depot", "saved place"))
    y = when_card(s, y + 14, day="Yesterday", time="17:10")
    y = miles_box(s, y + 12)
    y = classify(s, y + 12, chosen="business", app="Uber Eats")
    add_button(s)
    home_indicator(s)
    s.save("a-offline")


# ── B: Fill in a day (for comparison) ─────────────────────────────────
def b_day():
    s = Svg()
    form_header(s, "Fill in a day")
    y = 116
    card(s, y, 64)
    s.icon(30, y + 22, "calendar-outline", 20, T2)
    s.text(64, y + 28, "Saturday 3 October", 15, 600, T1)
    s.text(64, y + 47, "Change day", 13, 400, T2)
    s.chevron(352, y + 32)
    y += 80
    label(s, y + 10, "MileClear already has")
    y += 22
    card(s, y, 60)
    s.text(32, y + 26, "Home to Tesco Extra", 15, 500, T1)
    s.text(32, y + 45, "08:40 to 09:05 · recorded", 13, 400, T2)
    s.text(342, y + 37, "9.3 mi", 15, 700, T1, "end")
    y += 68
    s.text(20, y + 14, "Nothing from 09:05 to the end of the day", 13, 400, T3)
    y += 32
    label(s, y + 10, "Add the stops you made after that")
    y += 22
    stops = [("Tesco Extra", "left about 10:15"), ("Depot", "left about 10:50"),
             ("Eldon Square", "left about 11:30"), ("Home", "")]
    legs = ["6.1 mi", "3.4 mi", "5.8 mi"]
    h = 56 * len(stops) + 52
    card(s, y, h)
    for i, (name, when) in enumerate(stops):
        cy = y + 28 + i * 56
        if i < len(stops) - 1:
            s.line(40, cy + 8, 40, cy + 48, "rgba(255,255,255,0.18)", 2, "3 4")
            s.text(342, cy + 33, legs[i], 12, 600, T2, "end")
        s.circle(40, cy, 7, BG if i else T1, T1, 1.6)
        s.text(60, cy + 5, name, 15, 600, T1)
        if when:
            s.text(60 + len(name) * 15 * 0.52 + 6, cy + 5, "· " + when, 13, 400, T2)
    s.icon(32, y + h - 38, "add", 18, T2)
    s.text(60, y + h - 23, "Add a stop", 15, 600, T2)
    y += h + 8
    y = classify(s, y, chosen="business")
    s.text(20, y + 20, "For all 3. You can change each one after.", 13, 400, T2)
    add_button(s, text="Add 3 trips")
    home_indicator(s)
    s.save("b-day")


if __name__ == "__main__":
    a_empty()
    a_filled()
    a_overlap()
    a_saved()
    a_next()
    a_day_picker()
    a_offline()
    b_day()
    print("built 8 mockups")
