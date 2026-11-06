# Leviathan — ENC's rarest-answer game

A Krillion-style team game for ENC: every team names a correct answer to a category,
and **the rarer the answer, the more points**. 3 rounds × 7 categories × 25 seconds,
with Bible categories mixed into every round.

The home page (`/`) is **ENC.ICE**, a picker for every game on the site. Leviathan's landing
page is `/leviathan`; its other pages keep their short URLs.

- **Host** runs it from a laptop: `/host/CODE`
- **Projector** shows `/display/CODE` (QR code to join, prompt, countdown, dramatic reveals)
- **Teams** join on one phone each: `/join`

Also on the same site: **Who Said That?!** (`/who`), an icebreaker. Everyone scans one QR code
and enters their name plus 1–3 surprising facts. Each question shows one fact and four names
(the owner + three random people); everyone except the owner guesses on their phone. One
point per correct guess (no speed bonus), one question per fact by default (the host can cap it), leaderboard every 3 questions, ~20 seconds of
story time after each reveal. The host remote (`/who/host/CODE`) lists every fact so you can
skip any before or during the game. Uses the same `HOST_PASSWORD` and Redis.

## Scoring

| Tier | Points |
|---|---|
| Plankton | 10 |
| Schooler | 30 |
| Rare | 60 |
| Deep Cut | 85 |
| One in a Krillion | 100 |
| wrong / blank | 0 |

Tiers are set ahead of time in the category packs. They're **editorial guesses**, not
measured from real answers, so tune them. They are not affected by what other teams answered. Small
typos are forgiven ("Habbakuk" → Habakkuk) only when exactly one answer is that close,
and anything typo-corrected or unrecognized gets flagged on the host screen. One click
awards a tier, marks it wrong, or saves it to the answer bank for future games.

## Content

27 categories live in `src/content/categories/*.json` (format: that folder's README).

- **Bible (16):** books of the Bible, the Twelve, sons/tribes of Jacob, ten plagues, fruit of the
  Spirit, kings of Israel/Judah, judges, prophets, women of the Bible, Jesus' genealogy (Matt 1),
  seven churches, armor of God, "I am the ___", biblical mountains, Adam → Noah, places Paul visited
- **Everything else (11):** US states, state capitals, Africa, Europe, Gen 1 Pokémon, Pixar films,
  elements, presidents, constellations, Shakespeare plays, MBTA subway stations

The default 21-category lineup is in `src/content/lineup.json` (11 of the 21 are Bible). In the
lobby the host can swap any slot or hit **Shuffle**, which keeps about half the lineup Bible.

All answer lists are written from scratch. Nothing comes from Krillion or the third-party
Krillion dataset.

## Run it locally

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # answer matching, packs, game flow
```

Locally the game uses an in-memory store, so there's nothing to configure. On the host page,
**+ 2 test bots** adds fake teams that answer on their own so you can rehearse alone.
Phones on the same Wi-Fi can use `http://<your-laptop-ip>:3000`, but campus Wi-Fi often blocks
that, so deploy before game night.

## Deploy (Vercel + Upstash Redis, ~10 min, free tiers)

1. Push this folder to a GitHub repo.
2. In Vercel: **Add New → Project** → import the repo. No build settings needed.
3. In the project: **Storage → Create Database → Upstash for Redis** (free), connect it to the
   project. That injects `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
4. **Settings → Environment Variables:** add `HOST_PASSWORD` (anything; you'll type it to create games).
5. Redeploy. Open the site, type the password, **Create game**. If you see a yellow
   "in-memory storage" banner on the host page, step 3 didn't take.

Why Redis instead of Supabase: there's no schema, no migrations and no auth setup, and it's a
single click inside Vercel. Clients poll once a second, which stays well within Upstash's free tier
for a ~15 minute game with ~6 phones.

## Game night

1. Laptop on the projector. Create the game, then **Open projector view** and drag it to the projector.
   (Mirroring instead? Open the projector view in the same browser; **Space** advances, **P** pauses and **K** toggles the answer key.)
2. Teams scan the QR code, then the captain enters a team name.
3. Press **Space** (or the big button) for each step: start → reveal → next → … Between rounds
   you get a standings screen.
4. During a category, watch the Answers panel for yellow rows (unrecognized or typo-corrected) and
   settle them before you reveal. You can also fix them after the reveal; standings update.
5. After a reveal, **Show answer key on projector** swaps the depth chart for every accepted answer
   by tier (teams' picks lit up). Phones and solo players get the same key under their result.

Timing: 21 × 25 s answering + ~10 s per reveal ≈ 13–14 minutes. If you need to go faster, set
20 s per category in the lobby.

## How it works

- Next.js App Router; API routes in `src/app/api/games/…`
- `src/lib/engine.ts` holds all game rules. The server decides the timer, accepts one submission
  per team per category (Redis `HSETNX`), and freezes scores at reveal.
- Answer banks never reach the browser. Team and projector views only see other teams' answers
  after the host reveals.
- Phones store their team token in `localStorage`, so a refresh or dropped connection rejoins
  the same team.
- Host access uses a random per-game key stored in the creating browser. It's shown under
  "Host key / reset" if you need to move to another device.
