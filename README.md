# Group Project Prenup

> Sign the treaty before the group chat becomes a crime scene.

Group Project Prenup is a working Cubbie Hackathon Track 2 app. Each student joins the same invite room through the web app or their Cubbie agent. The coordinator compares only approved, shareable preferences and proposes a fair task split and meeting time. A private rejection starts a new negotiation round; the treaty becomes final only after every student approves.

## Try it

- [Interactive demo](https://dabestcode.github.io/group-project-prenup/) — instant, account-free sample in the browser
- [Live shared rooms](https://group-project-prenup.pjanga.workers.dev/room) — persistent invite rooms for separate student agents

The demo starts with a real conflict: all three agents want research and nobody wants slides. Reject an assignment to see the agents bargain again under the new private constraint.

## The student flow

1. One teammate creates a named room for 2–6 people and shares the six-character invite code.
2. Each student submits strengths, preferences, avoided work, capacity, and possible meeting windows.
3. When the room fills, the agents negotiate a role split and shared time.
4. Each student approves or privately rejects. Rejection shares only the newly unavailable role.
5. Unanimous approval signs the treaty and persists it for the group.

The public room response contains names, approval state, and the proposal. It does not contain raw profiles, participant tokens, calendar details, or private explanations. Tokens are hashed before storage.

## Architecture

- `worker/index.js` provides the room API and serves the web app on Cloudflare Workers.
- Cloudflare D1 persists rooms, redacted profiles, negotiation rounds, and approvals.
- `static/negotiator.js` is the deterministic, explainable solver shared by the browser demo and Worker.
- `static/room.html` is the live invite-room UI; `static/index.html` remains the quick judge demo.
- `skills/group-project-prenup/` is an installable Cubbie Skill with coordinator and Supermemory clients.
- `server.py` is the original local Python demo API and a reference implementation used by its tests.

Sponsor tools each have a concrete role:

- **Cubbie** privately gathers one student's preferences, shows the redacted payload, and asks before sharing or confirming.
- **Supermemory** can remember durable strengths and role preferences. Availability, courses, teammates, and private reasons are never stored.
- **Cloudflare Workers + D1** provide a free shared coordinator and persistent rooms without AWS costs.

## Run the full app locally

Requires Node.js 20 or newer.

```bash
npm install
npm run db:migrate:local
npm run dev
```

Open the local URL printed by Wrangler, choose **Create a shared room**, and open the invite in separate browser profiles for each teammate.

## Deploy on Cloudflare's free tier

Authenticate once, create the D1 database, put its returned `database_id` in `wrangler.jsonc`, and deploy:

```bash
npx wrangler login
npx wrangler d1 create group-project-prenup
npm run db:migrate:remote
npm run deploy
```

Static assets and API share one origin, so no paid host or API proxy is required. Usage beyond Cloudflare's free allocation is subject to Cloudflare's current limits.

## Cubbie Skill

Give Cubbie the GitHub link to `skills/group-project-prenup`. Its coordinator client supports the complete room lifecycle:

```bash
python3 skills/group-project-prenup/scripts/coordinator.py sample
python3 skills/group-project-prenup/scripts/coordinator.py create --title "CSE 412 Final" --members 3
python3 skills/group-project-prenup/scripts/coordinator.py join --room "ABC234" --profile "/tmp/shareable-profile.json"
python3 skills/group-project-prenup/scripts/coordinator.py status --room "ABC234"
python3 skills/group-project-prenup/scripts/coordinator.py confirm --room "ABC234" --approve
```

The join command saves the participant token under `~/.config/group-project-prenup/rooms.json` with owner-only permissions. The Skill requires the student's approval before joining or confirming.

## Optional Supermemory

The app works without an API key. To recall durable preferences, set `SUPERMEMORY_API_KEY` where the Skill runs:

```bash
python3 skills/group-project-prenup/scripts/preferences.py recall --student-id "student-123"
python3 skills/group-project-prenup/scripts/preferences.py remember --input /tmp/prenup-profile.json
```

The adapter uses Supermemory v5 namespaces and excludes current availability, calendar events, course details, teammate names, and private reasons.

## API

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/rooms` | Create a room with `title` and `expected_members` |
| `POST` | `/api/rooms/:code/join` | Join with an approved shareable profile |
| `GET` | `/api/rooms/:code` | Read the redacted public room state |
| `POST` | `/api/rooms/:code/confirm` | Approve or reject using the participant bearer token |
| `GET` | `/api/health` | Check the coordinator and D1 binding |

## Verification

```bash
npm test
npx wrangler deploy --dry-run
python3 -m py_compile server.py negotiator.py \
  skills/group-project-prenup/scripts/preferences.py \
  skills/group-project-prenup/scripts/coordinator.py
```

The tests cover negotiation fairness, private-data redaction, consent state, persistence helpers, the browser engine, and the Worker profile boundary. The full Worker flow has also been exercised against local D1 from creation through a rejected round and unanimous signing.

## Current limits

- The solver uses four general project roles; a future version can accept project-specific deliverables.
- Rooms are code-accessible and intended for hackathon demonstrations, not sensitive projects.
- Messaging and calendar integrations are guided by the Cubbie Skill but require the student's connected services.
- Supermemory is optional and uses the student's own key.
