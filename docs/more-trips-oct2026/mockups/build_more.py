# More tab mockups: directions A (jobs with live sentences), B (slim
# shortcuts) and C (car and money cards). Demo values only: "Demo",
# demo@mileclear.com, Toyota Prius hybrid, Pro renewing 3 Nov.
from lib import *


def name_card(s, y, plan="Pro · renews 3 Nov"):
    card(s, y, 72)
    avatar_dot(s, 52, y + 36, 22)
    s.text(86, y + 32, "Demo", 16, 700, T1)
    s.text(86, y + 52, plan, 13, 400, T2)
    s.chevron(352, y + 36)
    return y + 72


def problem_strip(s, y):
    """Home's blocking look, shown under the name card only when broken."""
    s.rect(16, y, 358, 48, 12, "#1f0e18", RED_EDGE)
    s.icon(30, y + 14, "alert-circle", 20, RED)
    s.text(60, y + 29, "Trips aren't recording", 14, 600, T1)
    s.text(342, y + 29, "Fix", 14, 700, RED, "end")
    s.chevron(352, y + 24, RED)
    return y + 48


def group(s, y, label, rows):
    group_label(s, y, label)
    return rows_card(s, y + 10, rows) + 28


# ── Direction A ─────────────────────────────────────────────────────

def a_rows(persona):
    """Every group and row for one driver type. persona: gig | employee | company | justme"""
    work = persona in ("gig", "employee")
    groups = []
    car = [
        dict(icon="car-outline", title="Your cars", sub="Toyota Prius · MOT due 14 Mar"),
        dict(icon="water-outline", title="Fuel", sub="Last fill-up 3 Oct · 136.9p near you"),
        dict(icon="speedometer-outline", title="Odometer", sub="41,831 today"),
        dict(icon="location-outline", title="Saved places", sub="3 places: Home, Depot, Office"),
        dict(icon="construct-outline", title="Road alerts", sub="2 roadworks on roads you use"),
    ]
    groups.append(("Your car", car))
    if persona == "gig":
        groups.append(("Your work", [
            dict(icon="time-outline", title="Shifts", sub="Last shift Mon 5 Oct · 5 h 10 min"),
            dict(icon="calendar-outline", title="Work hours", sub="Mon to Fri, 08:00 to 18:00"),
        ]))
        groups.append(("Your money", [
            dict(icon="cash-outline", title="Earnings", sub="£412.60 in October · 2 apps"),
            dict(icon="receipt-outline", title="Expenses", sub="£36.50 in October"),
            dict(icon="document-text-outline", title="Invoices", sub="1 waiting to be paid · £120.00"),
            dict(icon="business-outline", title="Bank", sub="Monzo linked · 4 payments to sort"),
        ]))
    elif persona == "employee":
        groups.append(("Your work", [
            dict(icon="calendar-outline", title="Work hours", sub="Mon to Fri, 08:00 to 18:00"),
            dict(icon="people-outline", title="Invite your manager", sub="If your employer pays your mileage"),
        ]))
        groups.append(("Your money", [
            dict(icon="receipt-outline", title="Expenses", sub="£36.50 in October"),
        ]))
    elif persona == "company":
        groups.append(("Your work", [
            dict(icon="calendar-outline", title="Work hours", sub="Mon to Fri, 08:00 to 18:00"),
            dict(icon="receipt-outline", title="Expenses", sub="£12.40 in October · parking"),
        ]))
    else:  # just me
        groups.append(("Your records", [
            dict(icon="ribbon-outline", title="Records", sub="Mileage certificate and downloads"),
            dict(icon="briefcase-outline", title="Drive for work?", sub="Tell us and the Tax tab appears"),
        ]))
    prog = []
    if persona != "justme":
        prog.append(dict(icon="stats-chart-outline", title="Insights", sub="This week: 36 miles, 5 trips"))
    prog.append(dict(icon="ribbon-outline" if False else "trophy-outline", title="Badges", sub="12 of 18 · next: Explorer, 22 miles away"))
    groups.append(("Your progress", prog))
    tools = [dict(icon="shield-checkmark-outline", title="Ticket defender", sub="Check a fine against your trips")]
    if persona != "company":
        tools.append(dict(icon="chatbubbles-outline", title="Ask EmSee", sub="Questions about your trips and tax"))
    groups.append(("Tools", tools))
    groups.append(("Help and settings", [
        dict(icon="settings-outline", title="Settings", sub="Recording automatically · all saved"),
        dict(icon="help-circle-outline", title="Help and how-tos"),
        dict(icon="chatbubble-ellipses-outline", title="Tell us about a problem or idea"),
        dict(icon="gift-outline", title="Invite a friend, get Pro free"),
    ]))
    return groups


def a_screen(name, persona="gig", problem=False, full=False, plan="Pro · renews 3 Nov", free=False):
    groups = a_rows(persona)
    if free:
        for _, rows in groups:
            for r in rows:
                if r["title"] in ("Ticket defender", "Ask EmSee"):
                    r["badge"] = "Pro"
                if r["title"] == "Bank":
                    r["sub"] = "Bring in your earnings automatically"
                    r["badge"] = "Pro"
    if full:
        h = 230 + sum(10 + sum(64 if r.get("sub") else 52 for r in rows) + 28 + 18 for _, rows in groups) + 40
        s = Svg(390, int(h))
    else:
        s = Svg()
    status_bar(s)
    tab_header(s, "More", avatar=False)
    y = name_card(s, 112, plan)
    if problem:
        y = problem_strip(s, y + 10)
    y += 36
    for label, rows in groups:
        y = group(s, y, label, rows) + 6
    if full:
        s.text(195, y + 4, "Version 1.3.13 (94)", 12, 400, T3, "middle")
    if not full:
        tab_bar(s, "Insights" if False else "More", TABS_PERSONAL if persona == "justme" else TABS_WORK)
    s.save(name)


# ── Direction B: slim shortcuts ─────────────────────────────────────

def b_screen():
    s = Svg()
    status_bar(s)
    tab_header(s, "More", avatar=False)
    y = name_card(s, 112) + 36
    y = group(s, y, "Your car", [
        dict(icon="car-outline", title="Your cars"),
        dict(icon="water-outline", title="Fuel"),
        dict(icon="speedometer-outline", title="Odometer"),
        dict(icon="construct-outline", title="Road alerts"),
    ]) + 6
    y = group(s, y, "Your money", [
        dict(icon="cash-outline", title="Earnings"),
        dict(icon="receipt-outline", title="Expenses"),
        dict(icon="document-text-outline", title="Invoices"),
        dict(icon="business-outline", title="Bank"),
    ]) + 6
    y = group(s, y, "Your work", [
        dict(icon="time-outline", title="Shifts"),
        dict(icon="shield-checkmark-outline", title="Ticket defender"),
        dict(icon="chatbubbles-outline", title="Ask EmSee"),
    ]) + 6
    y = group(s, y, "", [
        dict(icon="settings-outline", title="Settings and help", sub="Places, work hours, help, invite a friend"),
    ])
    tab_bar(s, "More", TABS_WORK)
    s.save("b-more")


# ── Direction C: car and money cards ────────────────────────────────

def summary_card(s, y, title, icon, big, line, figures, link):
    h = 152
    card(s, y, h)
    s.icon(32, y + 18, icon, 18, T2)
    s.text(58, y + 33, title, 14, 600, T2)
    s.chevron(352, y + 28)
    s.text(32, y + 70, big, 22, 700, T1)
    s.text(32, y + 92, line, 13, 400, T2)
    s.line(32, y + 108, 358, y + 108)
    x = 32
    for lab, val in figures:
        s.text(x, y + 132, val, 15, 700, T1)
        s.text(x + len(val) * 8.6 + 6, y + 132, lab, 13, 400, T2)
        x += 112
    return y + h


def c_screen(name, persona="gig"):
    s = Svg()
    status_bar(s)
    tab_header(s, "More", avatar=False)
    y = name_card(s, 112) + 16
    y = summary_card(s, y, "Your car", "car-outline", "Toyota Prius", "MOT due 14 Mar · odometer 41,831",
                     [("fill-ups", "2"), ("Oct fuel", "£58"), ("places", "3")], "") + 12
    if persona == "gig":
        y = summary_card(s, y, "Your money in October", "wallet-outline", "£412.60 earned",
                         "From 2 apps · 4 bank payments to sort",
                         [("costs", "£94.50"), ("receipts", "6"), ("unpaid invoice", "1")], "") + 28
        rows = [
            dict(icon="time-outline", title="Shifts and work hours", sub="Last shift Mon · 5 h 10 min"),
            dict(icon="stats-chart-outline", title="Insights and badges", sub="12 of 18 badges"),
            dict(icon="shield-checkmark-outline", title="Tools", sub="Ticket defender, Ask EmSee, road alerts"),
            dict(icon="settings-outline", title="Settings and help", sub="Recording automatically · all saved"),
        ]
    else:
        y += 16
        rows = [
            dict(icon="receipt-outline", title="Expenses", sub="£12.40 in October · parking"),
            dict(icon="stats-chart-outline", title="Insights and badges", sub="12 of 18 badges"),
            dict(icon="shield-checkmark-outline", title="Tools", sub="Ticket defender, road alerts"),
            dict(icon="settings-outline", title="Settings and help", sub="Recording automatically · all saved"),
        ]
    rows_card(s, y, rows)
    tab_bar(s, "More", TABS_WORK)
    s.save(name)


if __name__ == "__main__":
    a_screen("a-more", "gig")
    a_screen("a-more-problem", "gig", problem=True, plan="Free plan · see what Pro adds", free=True)
    a_screen("a-more-full", "gig", full=True)
    a_screen("a-more-employee", "employee")
    a_screen("a-more-company", "company", plan="Company car · Acme Ltd")
    a_screen("a-more-justme", "justme", plan="Free plan · see what Pro adds", free=True)
    b_screen()
    c_screen("c-more", "gig")
    c_screen("c-more-company", "company")
