# Trips tab mockups: the recommended refresh (list, "To sort", trip detail)
# and the bolder variant (one card per day). Demo values only.
from lib import *


def mini_route(s, x, y, size=56, d=None, manual=False):
    s.rect(x, y, size, size, 10, TRACK)
    if manual:
        s.line(x + 14, y + size - 14, x + size - 14, y + 14, T3, 1.5, "3 3")
        s.circle(x + 14, y + size - 14, 4, TRACK, T1, 1.5)
        s.circle(x + size - 14, y + 14, 4, AMBER)
        return
    d = d or "M12 44 C18 30 26 36 30 26 S40 14 44 12"
    s.add(f'<g transform="translate({x},{y}) scale({size/56})">'
          f'<path d="{d}" fill="none" stroke="{AMBER}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></g>')
    # start ring and end dot, read from the path ends (approximate)
    pts = d.replace("M", "").replace("C", " ").replace("S", " ").split()
    sx, sy = [float(v) for v in pts[0:2]]
    ex, ey = [float(v) for v in pts[-2:]]
    k = size / 56
    s.circle(x + sx * k, y + sy * k, 3.5, TRACK, T1, 1.5)
    s.circle(x + ex * k, y + ey * k, 3.5, AMBER)


def chip(s, x, y, kind, label=None, right=True):
    """Business / Personal chip, right-aligned at x when right=True. Returns width."""
    if kind == "business":
        label = label or "Business"
        w = 28 + len(label) * 6.6
        x0 = x - w if right else x
        s.rect(x0, y, w, 24, 8, AMBER_DIM)
        s.icon(x0 + 8, y + 5, "briefcase", 13, AMBER)
        s.text(x0 + 25, y + 16.5, label, 12, 700, AMBER)
    else:
        label = label or "Personal"
        w = 28 + len(label) * 6.6
        x0 = x - w if right else x
        s.rect(x0, y, w, 24, 8, PERSONAL)
        s.icon(x0 + 8, y + 5, "person", 13, T1)
        s.text(x0 + 25, y + 16.5, label, 12, 700, T1)
    return w


def classify_control(s, x, y, w, h=40):
    s.rect(x, y, w, h, 10, SURFACE, AMBER_GLOW)
    s.line(x + w / 2, y + 8, x + w / 2, y + h - 8, BORDER)
    for i, (ic, lab) in enumerate([("briefcase-outline", "Business"), ("person-outline", "Personal")]):
        cx = x + w / 4 + i * w / 2
        s.icon(cx - 38, y + h / 2 - 8, ic, 16, T2)
        s.text(cx - 16, y + h / 2 + 5, lab, 14, 600, T1)


def fit(text, px, size=15):
    """Cut text to roughly px wide at this size, with an ellipsis."""
    n = int(px / (size * 0.56))
    return text if len(text) <= n else text[: n - 1].rstrip() + "\u2026"


def trip_row(s, y, route, meta, kind=None, tag=None, tag_icon=None, tag_fill=T2,
             d=None, manual=False, unsorted=False):
    h = 128 if unsorted else (92 if tag else 76)
    card(s, y, h)
    mini_route(s, 30, y + 14, 56, d, manual)
    s.text(100, y + 32, fit(route, 262), 15, 600, T1)
    s.text(100, y + 53, meta, 13, 400, T2)
    if tag:
        if tag_icon:
            s.icon(100, y + 63, tag_icon, 13, tag_fill)
            s.text(118, y + 74, tag, 12, 600, tag_fill)
        else:
            s.text(100, y + 74, tag, 12, 600, tag_fill)
    if kind and not unsorted:
        chip(s, 360, y + 38, kind)
    if unsorted:
        classify_control(s, 100, y + 74, 260)
    return h


def day_header(s, y, day, miles, odo=None):
    s.text(20, y, day, 13, 600, T2)
    s.text(370, y, miles, 13, 600, T2, "end")
    if odo:
        s.text(20, y + 19, odo, 12, 400, T3)
        return 30
    return 12


def segments(s, y, labels, active, counts=None):
    s.rect(16, y, 358, 40, 20, SURFACE, BORDER)
    n = len(labels)
    w = (358 - 4) / n
    for i, lab in enumerate(labels):
        x = 18 + i * w
        if lab == active:
            s.rect(x, y + 2, w, 36, 18, PERSONAL, PERSONAL_EDGE)
        c = counts.get(lab) if counts else None
        col = T1 if lab == active else T2
        if c:
            s.text(x + w / 2 - 9, y + 25, lab, 14, 600, col, "middle")
            bx = x + w / 2 - 9 + len(lab) * 4.1 + 6
            s.rect(bx, y + 11, 18, 18, 9, AMBER)
            s.text(bx + 9, y + 24, c, 11, 700, BG, "middle")
        else:
            s.text(x + w / 2, y + 25, lab, 14, 600, col, "middle")


def trips_header(s):
    tab_header(s, "Trips", buttons=[("map-outline", T2), ("funnel-outline", T2), ("add", T1)])


# ── 1. List, recommended refresh ────────────────────────────────────

def trips_list():
    s = Svg()
    status_bar(s)
    trips_header(s)
    # Warning strip, Home's look: amberDim fill, amber icon, text1 title, action word
    y = 118
    s.rect(16, y, 358, 48, 12, "#1b1714")
    s.icon(30, y + 14, "git-compare-outline", 18, AMBER)
    s.text(58, y + 29, "We may have missed 2 drives", 14, 600, T1)
    s.text(342, y + 29, "Check", 14, 700, AMBER, "end")
    s.chevron(352, y + 24)
    y += 60
    segments(s, y, ["All", "To sort", "Business", "Personal"], "All", {"To sort": "1"})
    y += 64
    y += day_header(s, y, "Today", "15.3 mi", "Odometer 41,816 to 41,831 (recorded)") + 8
    y += trip_row(s, y, "Home to Newcastle Quayside", "08:05 · 12.4 mi · Uber Eats",
                  unsorted=True, d="M10 46 C16 36 22 40 28 30 S38 18 46 10") + 10
    y += trip_row(s, y, "Newcastle Quayside to Gateshead", "09:10 · 2.9 mi · Uber Eats",
                  kind="business", tag="Started with Start Trip", tag_icon="navigate",
                  d="M12 40 C20 38 30 30 34 24 S42 18 46 16") + 22
    y += day_header(s, y, "Yesterday", "21.0 mi", "Odometer about 41,795 to 41,816") + 8
    y += trip_row(s, y, "Home to Work", "07:52 · 7.4 mi · Deliveroo", kind="business",
                  tag="Part 1 of 2 · split at a 20 min stop", tag_icon="cut-outline",
                  d="M10 44 C20 40 24 30 30 28 S42 22 46 12") + 10
    y += trip_row(s, y, "Work to Tesco Extra", "17:40 · 4.2 mi", kind="personal",
                  tag="Saved later, when your phone woke up", tag_icon="time-outline",
                  d="M12 14 C20 22 26 26 30 34 S40 42 44 44") + 10
    tab_bar(s, "Trips", TABS_WORK)
    s.save("trips-list")


# ── 2. "To sort" ────────────────────────────────────────────────────

def trips_to_sort():
    s = Svg()
    status_bar(s)
    trips_header(s)
    y = 118
    segments(s, y, ["All", "To sort", "Business", "Personal"], "To sort", {"To sort": "1"})
    y += 64
    group_label(s, y, "Drives we may have missed")
    y += 10
    card(s, y, 184)
    for i, (route, when) in enumerate([
        ("Old Elvet to Home", "Thu 1 Oct, some time after 17:20 · about 11.8 mi"),
        ("Newcastle Quayside to Home", "Tue 29 Sep, some time after 12:14 · about 9.6 mi"),
    ]):
        yy = y + i * 92
        s.text(32, yy + 28, route, 15, 600, T1)
        s.text(32, yy + 47, when, 13, 400, T2)
        s.rect(32, yy + 58, 92, 32, 10, SURFACE, "rgba(255,255,255,0.12)")
        s.text(78, yy + 79, "Add trip", 14, 600, T1, "middle")
        s.text(150, yy + 79, "Not a trip", 14, 600, T2)
        if i == 0:
            s.line(32, yy + 92, 374, yy + 92)
    y += 184 + 28
    group_label(s, y, "Business or personal?")
    y += 10
    y += trip_row(s, y, "Home to Newcastle Quayside", "Today 08:05 · 12.4 mi · Uber Eats",
                  unsorted=True, d="M10 46 C16 36 22 40 28 30 S38 18 46 10") + 10
    s.text(20, y + 14, "Tip: swipe right for Business, left for Personal.", 12, 400, T3)
    y += 40
    s.icon(195 - 70, y, "help-circle-outline", 16, T2)
    s.text(195 - 48, y + 13, "Missing a trip? Tell us", 14, 600, T2)
    tab_bar(s, "Trips", TABS_WORK)
    s.save("trips-to-sort")


# ── 3. Trip detail ──────────────────────────────────────────────────

def trip_detail():
    s = Svg()
    status_bar(s)
    stack_header(s, "Trip")
    y = 112
    # map: route drawn on track ground (real map tiles in the app)
    s.rect(16, y, 358, 168, 16, TRACK)
    s.add('<g opacity="0.35">' + "".join(
        f'<line x1="{16 + i * 40}" y1="{y}" x2="{16 + i * 40 - 60}" y2="{y + 168}" stroke="#2a3344" stroke-width="1"/>'
        for i in range(2, 11)) + "</g>")
    s.path(f"M60 {y + 140} C90 {y + 120} 110 {y + 128} 150 {y + 96} S220 {y + 60} 250 {y + 58} S310 {y + 40} 330 {y + 30}",
           stroke=AMBER, sw=3)
    s.circle(60, y + 140, 6, TRACK, T1, 2)
    s.circle(330, y + 30, 6, AMBER)
    y += 168 + 22
    s.text(16, y, "Today · 08:05 to 08:31 · 26 min", 14, 400, T2)
    y += 26
    s.circle(24, y + 4, 5, "none", T1, 1.6)
    s.line(24, y + 12, 24, y + 38, T3, 1.2)
    s.circle(24, y + 44, 5, AMBER)
    s.text(42, y + 10, "Home", 18, 600, T1)
    s.text(42 + 58, y + 10, "Sunderland", 14, 400, T3)
    s.text(42, y + 50, "Newcastle Quayside", 18, 600, T1)
    y += 72
    s.text(16, y + 40, "12.4", 44, 700, T1, extra='letter-spacing="-0.5"')
    s.text(112, y + 40, "miles", 18, 600, T2)
    y += 58
    # how it was recorded, one plain sentence
    s.icon(16, y, "checkmark-circle", 16, GREEN)
    s.text(38, y + 13, "Recorded automatically · saved to your account", 13, 500, T2)
    y += 34
    s.text(16, y + 14, "Business or personal?", 16, 600, T1)
    y += 26
    s.rect(16, y, 358, 52, 12, SURFACE, BORDER)
    s.rect(20, y + 4, 175, 44, 9, AMBER)
    s.icon(66, y + 15, "briefcase", 18, BG)
    s.text(92, y + 31, "Business", 16, 700, BG)
    s.icon(232, y + 15, "person-outline", 18, T2)
    s.text(258, y + 31, "Personal", 16, 600, T1)
    y += 68
    # one card of details, each a row that opens a picker
    y = rows_card(s, y, [
        dict(icon="phone-portrait-outline", title="Which app", right_text="Uber Eats"),
        dict(icon="flag-outline", title="Purpose", right_text="Delivery"),
        dict(icon="create-outline", title="Note", right_text="Add", right_fill=AMBER),
    ])
    y += 16
    s.rect(16, y, 358, 52, 12, SURFACE, "rgba(255,255,255,0.12)")
    s.icon(150, y + 16, "pencil", 18, T1)
    s.text(176, y + 32, "Edit trip", 16, 600, T1)
    s.save("trip-detail")


def trip_detail_bottom():
    s = Svg(390, 844)
    status_bar(s)
    stack_header(s, "Trip")
    y = 116
    # a warning, Home's amber strip, with the reason in words
    s.rect(16, y, 358, 64, 12, "#1b1714")
    s.icon(30, y + 12, "alert-circle", 18, AMBER)
    s.text(58, y + 26, "The distance may be off", 14, 600, T1)
    s.text(58, y + 46, "Your phone sent no route for this drive.", 13, 400, T2)
    s.text(360, y + 36, "Check", 14, 700, AMBER, "end")
    y += 100
    group_label(s, y, "Fix this trip")
    y += 10
    y = rows_card(s, y, [
        dict(icon="refresh-outline" if False else "swap-vertical-outline", title="Work out the miles again", sub="Uses the road route between the two places"),
        dict(icon="cut-outline", title="Split into separate trips", sub="If you stopped on the way"),
        dict(icon="git-merge-outline", title="Join with the next trip", sub="Starts 6 min later, 120 m away"),
        dict(icon="speedometer-outline", title="Odometer readings", right_text="Add", right_fill=AMBER),
    ])
    y += 34
    group_label(s, y, "Use this trip")
    y += 10
    y = rows_card(s, y, [
        dict(icon="bookmark-outline", title="Save a place", sub="Name Home or Newcastle Quayside"),
        dict(icon="add", title="New trip from here", sub="Back home, or on to the next drop"),
        dict(icon="shield-checkmark-outline", title="Got a fine for this trip?", badge="Pro"),
    ])
    y += 26
    s.icon(195 - 50, y, "trash-outline", 18, RED)
    s.text(195 - 26, y + 14, "Delete trip", 15, 600, RED)
    s.save("trip-detail-bottom")


# ── 4. Bolder variant: one card per day ─────────────────────────────

def trips_list_days():
    s = Svg()
    status_bar(s)
    trips_header(s)
    y = 118
    # week summary, same family as Home and Insights (plain card, no dial)
    s.rect(16, y, 358, 76, 16, SURFACE, BORDER)
    s.text(32, y + 28, "This week", 14, 500, T2)
    s.rich(32, y + 56, [("36.3", 700, T1), (" miles · ", 500, T2), ("5", 700, T1), (" trips · ", 500, T2), ("1", 700, T1), (" to sort", 500, T2)], 18)
    s.chevron(352, y + 38)
    y += 92
    segments(s, y, ["All", "To sort", "Business", "Personal"], "All", {"To sort": "1"})
    y += 60

    def day_card(y, day, total, odo, trips):
        s.text(20, y, day, 13, 600, T2)
        s.text(370, y, total, 13, 600, T2, "end")
        y += 10
        hs = []
        for t in trips:
            hs.append(104 if t.get("unsorted") else 64)
        h = sum(hs) + 34
        card(s, y, h)
        yy = y
        for i, t in enumerate(trips):
            rh = hs[i]
            s.text(32, yy + 26, t["time"], 13, 600, T2)
            s.text(84, yy + 26, t["route"], 15, 600, T1)
            s.text(84, yy + 46, t["meta"], 13, 400, T2)
            if t.get("unsorted"):
                classify_control(s, 84, yy + 56, 274)
            else:
                chip(s, 358, yy + 12, t["kind"])
            if t.get("icon"):
                s.icon(84 + len(t["meta"]) * 6.6 + 8, yy + 35, t["icon"], 13, T2)
            s.line(32, yy + rh, 358, yy + rh)
            yy += rh
        s.text(32, yy + 22, odo, 12, 400, T3)
        return y + h + 22

    y = day_card(y, "Today", "15.3 mi", "Odometer 41,816 to 41,831 (recorded)", [
        dict(time="08:05", route="Home to Newcastle Quayside", meta="12.4 mi · Uber Eats", unsorted=True),
        dict(time="09:10", route="Quayside to Gateshead", meta="2.9 mi · Start Trip", kind="business"),
    ])
    y = day_card(y, "Yesterday", "21.0 mi", "Odometer about 41,795 to 41,816", [
        dict(time="07:52", route="Home to Work", meta="7.4 mi · part 1 of 2", kind="business"),
        dict(time="12:30", route="Work to Old Elvet", meta="9.4 mi · part 2 of 2", kind="business"),
        dict(time="17:40", route="Work to Tesco Extra", meta="4.2 mi · saved later", kind="personal"),
    ])
    tab_bar(s, "Trips", TABS_WORK)
    s.save("trips-list-days")


if __name__ == "__main__":
    trips_list()
    trips_to_sort()
    trip_detail()
    trip_detail_bottom()
    trips_list_days()
