# MileClear Discord — server setup

Reference doc for the MileClear community Discord. Channel structure,
roles, permissions, welcome flow, and the rules.

Goal: a community space for UK self-employed drivers, gig workers, and
PAYE employees who track miles — small enough to feel lively at any
size, structured enough to scale to thousands without churn.

## Server-level settings

- **Name:** MileClear
- **Region:** Auto (Discord picks the closest)
- **Verification level:** **Medium** — must have a verified email and
  account for >5 minutes. Stops the worst drive-by spam without
  blocking normal joiners.
- **Default notifications:** **Only @mentions** — so users don't get
  pinged for every general-chat message.
- **Server icon:** `apps/web/public/branding/logo-120x120.png`
- **MileClear Bot avatar:** `apps/mobile/assets/branding/bot-avatar.png`
  — chat-bubble variant of the M-mark (1024×1024). Upload via the
  Discord Developer Portal → Bot tab → Icon when creating the bot
  application.
- **Server banner:** `Branding/Landscape Banner Ad - 1200x720.png` (or
  re-export at 960×540 for the banner format).
- **Vanity URL:** request `discord.gg/mileclear` once at Boost level 3
  (or 14 active members for Community Servers).
- **Community Server:** enable once at 10+ members. Unlocks
  Announcements channels, Welcome screen, Discovery, Insights.

## Roles (in display order, top to bottom)

| Role | Colour | Who | Granted by |
|------|--------|-----|-----------|
| **Founder** | `#fbbf24` (amber) | Anthony | Manual, server owner |
| **Mod** | `#f59e0b` (deep amber) | Future moderators | Manual |
| **MileClear Bot** | `#10b981` (emerald) | Build-notification + role bots | App OAuth |
| **Pro Member** | `#fcd34d` (light amber) | £4.99/mo or £44.99/yr subscribers | Verified via in-app link |
| **TestFlight Tester** | `#38bdf8` (sky) | Active TestFlight build users | `#welcome` reaction or manual |
| **Sole Trader** | `#a78bfa` (violet) | Self-employed driver | Self-select in `#welcome` |
| **Gig Driver** | `#fb7185` (rose) | Uber/Deliveroo/JE/Flex etc. | Self-select |
| **PAYE Driver** | `#7dd3fc` (light sky) | Employee claiming mileage | Self-select |
| **Member** | default grey | Everyone who's accepted rules | Default on join |

Notes:
- Pro Member verification: see [In-app Discord link](#in-app-discord-link) below.
- The three "what kind of driver are you" roles (Sole Trader / Gig / PAYE)
  let you @-mention specific segments for news that only matters to
  one group, and let you create role-gated channels later if a segment
  grows enough to deserve its own.

## Channel structure

### 📍 INFORMATION (read-only for Members)

| Channel | Topic | Notes |
|---------|-------|-------|
| `#welcome` | "Start here — pick your driver type and grab a role." | Pinned post with the role-react message. Auto-greeter posts when someone joins. |
| `#announcements` | "MileClear news, releases, App Store updates." | Anthony only. Use Announcement channel type so other servers can subscribe. |
| `#whats-new` | "Build notes and changelog. Subscribed to release pings." | Auto-fed by the MileClear Bot when EAS pushes a build (see [Bot wiring](#bot-wiring)). |
| `#rules` | "Be kind. Be helpful. No spam. Full rules pinned." | Read-only. Pin the full rules doc (below). |

### 💬 GENERAL

| Channel | Topic | Notes |
|---------|-------|-------|
| `#general` | "All-purpose chat for MileClear drivers." | The main fire. Keep it open. |
| `#wins` | "Milestones, big tax refunds, streaks. Show off." | Slow-mode 30s to keep it readable. |
| `#introductions` | "New here? Say hi. Tell us what you drive." | Optional but warms the room. |

### 🛟 SUPPORT

| Channel | Topic | Notes |
|---------|-------|-------|
| `#help` | "Stuck? Ask here. Search first — your answer might already be pinned." | Slow-mode 10s. Pin the FAQ and link to `mileclear.com/support`. |
| `#bugs-and-feedback` | "Found a bug or have an idea? Drop it here. We read all of them." | Add a Forum-style channel if Discord-on-day allows it; otherwise a regular text channel with a pinned template. |

### 🧾 TAX & HMRC

The differentiator. Drivers help each other here — Anthony chimes in
for the gnarly ones. **Don't give bespoke tax advice in writing —
"general guidance only, see an accountant for your situation"** in the
pinned post protects everyone.

| Channel | Topic | Notes |
|---------|-------|-------|
| `#tax-and-hmrc` | "Self Assessment, deadlines, allowable expenses — the gnarly bits HMRC won't explain." | Pin the First Self Assessment guide from the app. |
| `#first-self-assessment` | "First time filing? You're not alone. Walk-through and peer support." | Targets the same audience as slot 2 of the App Store screenshots. |

### 🚗 BY DRIVER TYPE

Lets each segment self-organise. Don't sub-divide further until each
of these is busy.

| Channel | Topic | Notes |
|---------|-------|-------|
| `#gig-drivers` | "Uber, Deliveroo, Just Eat, Amazon Flex, Stuart, DPD, Yodel, Evri — platforms, blocks, tips." | Highest expected volume. |
| `#sole-traders` | "Invoices, accountants, sole-trader life. Laura's corner." | Quieter but high-value. |
| `#paye-drivers` | "Claiming mileage back from your employer. Mileage Allowance Relief, P87, employer rates." | Underserved segment in the wider market. |

### 💎 PRO LOUNGE — Pro Member role only

| Channel | Topic | Notes |
|---------|-------|-------|
| `#pro-lounge` | "Pro members only. Early access, deeper feedback loop with Anthony." | Permission: `View Channel` for Pro Member + staff only. |
| `#pro-help` | "Pro tier? Drop your question here for priority help." | Same permission. Quicker SLA than `#help`. |

### 🧪 BETA TESTERS — TestFlight Tester role only

| Channel | Topic | Notes |
|---------|-------|-------|
| `#testflight` | "TestFlight beta build chat. Link: https://testflight.apple.com/join/SGrmnaaH" | TestFlight Tester role only. |
| `#beta-feedback` | "Structured feedback on the latest build. Pinned template." | Use a Forum channel if Community Server is enabled. |

### 🔧 STAFF — Mod role + Founder only

| Channel | Topic | Notes |
|---------|-------|-------|
| `#mod-chat` | "Mods + founder coordination." | Hidden from everyone else. |
| `#bot-logs` | "Bot activity, webhook events, moderation logs." | Hidden. |

## Welcome flow

When a user joins, Discord pings `#welcome`. The pinned post sells the
server in one screen and gives the user their first action (pick a
driver-type role).

### `#welcome` pinned post (copy/paste)

```
👋 **Welcome to MileClear**

The community for UK drivers who track their miles for tax. Self-employed,
gig, or PAYE — we keep your numbers straight and trade tips on the rest.

**Three quick steps to settle in:**

1️⃣ Read **#rules** so we all stay friendly.

2️⃣ Pick your driver type below — it gives you the right channels and
lets us @-mention you only when something's relevant to you.

   🟣 **Sole Trader** — invoice clients, file Self Assessment
   🌹 **Gig Driver** — Uber / Deliveroo / Just Eat / Flex / etc.
   🟦 **PAYE Driver** — claim mileage back from your employer

3️⃣ Say hi in **#introductions** so we know who you are.

**New to MileClear?** Grab the app: https://apps.apple.com/gb/app/mileclear/idXXXXXXXXX

**Need to file your first tax return?** Start in **#first-self-assessment**.

**Already Pro?** Link your account in **#pro-lounge** to unlock the
Pro Member role and priority support.
```

Then post a second message with a **Role Picker** (a single message
with three reaction emoji — 🟣 🌹 🟦 — wired to the three roles via a
reaction-role bot like Carl-bot, MEE6, or YAGPDB).

### Welcome screen (Community Servers)

Once Community Server is enabled, fill the Welcome Screen with:

- Description: "UK drivers tracking miles for tax. Community for
  self-employed, gig, and PAYE."
- Featured channels:
  - `#welcome` — Start here
  - `#general` — Say hi
  - `#tax-and-hmrc` — Ask anything tax
  - `#help` — Stuck in the app?

## Rules (pinned in `#rules`)

```
**MileClear community rules**

We keep this server friendly, useful, and honest. The rules are short
on purpose — read them once and you're set.

**1. Be kind.** No personal attacks, slurs, harassment, or pile-ons.
Drivers come from every walk of life. Treat each other accordingly.

**2. No spam, no self-promo.** Posting your own affiliate links,
referral codes, or competitor apps will be removed. Sharing a YouTube
video that genuinely helps drivers is fine — use judgement.

**3. Stay legal.** Don't ask for or share illegal advice
(insurance dodges, fake mileage, ULEZ workarounds). We're here to make
the legitimate path easier.

**4. Tax help is general, not bespoke.** Drivers help each other
swap tips, but nothing here is qualified tax advice. For your specific
situation, see an accountant or call HMRC. If a thread starts
sounding like personalised advice, anyone can drop a friendly
reminder.

**5. Don't share other people's data.** No real names, plate numbers,
addresses, or screenshots that show another person's data without
their explicit permission.

**6. Use the right channel.** Tax in #tax-and-hmrc, bugs in
#bugs-and-feedback, app help in #help. Mods will gently move
posts if they land in the wrong place.

**7. NSFW is a no.** This is a work app community. Keep it
work-appropriate.

**8. The MileClear team has final say.** Anthony (Founder) and any
appointed Mods can remove messages, time-out users, or ban for
repeated rule-breaks. We'll always explain why.

By chatting here you're agreeing to these. Questions? DM @Founder.
```

## Bot wiring

### Recommended bots (free tiers cover everything below)

| Bot | Purpose | Why this one |
|-----|---------|--------------|
| **Carl-bot** | Reaction roles, auto-mod, welcome messages | Best free tier for reaction roles |
| **YAGPDB** | Backup / alternative for everything Carl-bot does | Open source, very stable |
| **Statbot** | Server insights (member growth, activity) | Free Insights better than Discord's built-in |

### MileClear Bot (your own webhook)

Already have everything needed server-side. Add a Discord incoming
webhook URL to the `.env` and wire it from a few key spots:

1. **EAS build webhook → `#whats-new`** — when EAS publishes a new
   update (OTA or binary), post a message: "Build 68 (1.2.0)
   published — what's new: <link to docs/apple-submission-*.md>".

2. **App store rating drops → `#announcements`** — when a public App
   Store review lands, post the first line + star count so the team
   sees user voice in near-real-time.

3. **Apple IAP first purchase → `#bot-logs`** — celebratory ping when
   a new Pro user signs up, lets you spot conversion timing.

4. **Heartbeat alert / server-side watchdog → `#mod-chat`** — if the
   tracking-recording watchdog flags a stuck trip on production,
   ping mods.

Implementation note: in `apps/api/src/services/`, add
`discord.ts` with a single `postToChannel(channel: keyof DiscordChannels, message: string)`
function. Configure webhook URLs in `.env`:

```
DISCORD_WEBHOOK_WHATSNEW=https://discord.com/api/webhooks/...
DISCORD_WEBHOOK_ANNOUNCEMENTS=https://discord.com/api/webhooks/...
DISCORD_WEBHOOK_BOTLOGS=https://discord.com/api/webhooks/...
DISCORD_WEBHOOK_MODCHAT=https://discord.com/api/webhooks/...
```

Discord webhooks accept JSON POST. No auth, no SDK needed — just fetch.

## In-app Discord link

Add a "Join the Community" link to:

- **Mobile** — `apps/mobile/app/(tabs)/profile.tsx`, under Settings,
  with a Discord icon. Opens `https://discord.gg/<vanity>` in the
  device browser.
- **Web** — `apps/web/src/app/page.tsx` footer + dashboard sidebar
  (the Sidebar component has room).
- **Welcome email** — Brevo template (whoever owns the email rebuild
  after SOYOStudios incorporates).

### Pro Member role auto-link (later, when justified)

If you want to auto-grant the Pro Member role to verified Pro users:

1. User taps "Link Discord" in the mobile profile screen.
2. App opens a Discord OAuth flow scoped to `identify guilds.join`.
3. API receives the OAuth callback, matches the Discord user ID to
   the MileClear user, and (if `isPremium && premiumExpiresAt > now`)
   uses a Discord bot to assign the Pro Member role in the server.
4. Periodic job revokes the role if the subscription lapses.

This is a few hours of work but only justified once Discord has
enough Pro users to make manual role-granting annoying. Until then,
do it by hand from the in-app Pro subscribers list.

## Setup order

Run through this once when creating the server:

1. **Create the server** with Name + Icon (logo-120x120.png).
2. **Create roles** in the order above (Discord uses display order
   for permissions cascade — Founder at the top).
3. **Create categories** in the order above (📍 → 🔧).
4. **Create channels** inside each category. Set the topic for each
   from the table above.
5. **Set permissions per category:**
   - 📍 INFORMATION: `@everyone` cannot send messages (read-only)
   - 💎 PRO LOUNGE: only Pro Member, Mod, Founder can View Channel
   - 🧪 BETA TESTERS: only TestFlight Tester, Mod, Founder
   - 🔧 STAFF: only Mod, Founder
6. **Pin the welcome post + role picker in `#welcome`.**
7. **Pin the rules in `#rules`.**
8. **Pin FAQ + support email in `#help`.**
9. **Invite Carl-bot** (or YAGPDB). Configure:
   - Reaction roles in `#welcome`
   - Auto-greeter that pings new joiners with `#welcome`
   - Slow-mode on `#help` and `#wins`
   - Anti-spam baseline (X messages in Y seconds → time-out)
10. **Add MileClear Bot webhooks** (env vars in `.env`, wire from
    `apps/api/src/services/discord.ts`).
11. **Enable Community Server** once you hit 10 members.
12. **Apply for vanity URL** `discord.gg/mileclear` at Boost level 3
    (or 14 community members, whichever lands first).

## Migration plan from the Facebook group

Single pinned post in the Facebook group + a final post a week later:

**First post (today):**

> 📣 We're moving the MileClear community to Discord. Same drivers,
> same tips, better tools. Join us here: [invite link].
>
> The Facebook group stays open for now — but new conversations,
> announcements, and the TestFlight chat are on Discord from today.

**Second post (one week later):**

> Final reminder — the Facebook group will go quiet from [date]. All
> news, beta builds, and tax chat are on Discord. Join here: [invite].
> See you over there 🚗

Keep the FB group searchable as an archive for ~6 months after migration.
