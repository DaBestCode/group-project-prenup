# Group Project Prenup

> Sign the treaty before the group chat becomes a crime scene.

Group Project Prenup is a working Cubbie Hackathon Track 2 app. Joining a room launches a separately authenticated personal agent in the backend for each student. Those agents score role bids, evaluate drafts, counter constraint violations, and escalate only a ready proposal or an unresolved tradeoff to their owners. Cubbie is an optional private owner channel; the web inbox keeps the entire flow usable when Cubbie is unavailable.

## Try it

- [Interactive demo](https://dabestcode.github.io/group-project-prenup/) — instant, account-free sample in the browser
- [Live shared rooms](https://group-project-prenup.pjanga.workers.dev/room) — persistent invite rooms for separate student agents
- [Prepared four-round agent trace](https://group-project-prenup.pjanga.workers.dev/room?room=TMWAA7) — an immediate judge view with competing bids, four counteroffers, and owner escalation

After a room is created, **Open in Cubbie** launches the phone's messaging app with one complete message containing the Skill link, project, room URL, room code, and watcher instruction. **Share with teammate** opens the native share sheet with the same ready-to-send handoff. Cubbie does not publish a universal messaging number, so the student selects their existing Cubbie conversation and taps Send; no links or codes need to be copied separately.

The demo starts with a real conflict: all three agents want research and nobody wants slides. Reject an assignment to see the agents bargain again under the new private constraint.

## The student flow

1. One student creates a named room for 2–6 agents and shares the invite.
2. Every teammate approves a redacted profile; the backend creates an authenticated agent with its own policy and inbox.
3. Each agent submits scored role bids. The coordinator drafts a split, and every agent independently evaluates it.
4. Constraint violations trigger automatic counteroffers and another round. An acceptable draft or unavoidable tradeoff is escalated to each owner.
5. Owners respond in the web room or through Cubbie's watcher. A private rejection reveals only the newly unavailable role.
6. Unanimous approval signs the treaty and sends a final notice to every personal agent.

The live room includes an **Agent Control Room** generated from the Worker protocol. Judges can inspect every sanitized bid, draft, evaluation, counteroffer, round change, and owner handoff. This trace comes from the backend negotiation result rather than a browser animation.

The public room response contains names, approval state, and the proposal. It does not contain raw profiles, participant tokens, calendar details, or private explanations. Tokens are hashed before storage.

## Architecture

- `worker/index.js` provides the room API and serves the web app on Cloudflare Workers.
- `worker/agent-policy.js` gives every participant an independent bid, evaluation, counteroffer, and escalation policy.
- Cloudflare D1 persists rooms, redacted profiles, personal-agent state, negotiation rounds, approvals, and protocol messages.
- `static/negotiator.js` is the deterministic, explainable solver shared by the browser demo and Worker.
- `static/room.html` is the live invite-room UI; `static/index.html` remains the quick judge demo.
- `skills/group-project-prenup/` is an installable Cubbie Skill with coordinator and Supermemory clients.
- `server.py` is the original local Python demo API and a reference implementation used by its tests.

Sponsor tools each have a concrete role:

- **Cubbie** privately gathers one student's preferences and acts as an optional owner notification and consent channel.
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

After joining, Cubbie runs the watcher as a background task and uses its output for the owner-facing text:

```bash
python3 skills/group-project-prenup/scripts/coordinator.py watch --room "ABC234" --timeout 300
python3 skills/group-project-prenup/scripts/coordinator.py inbox --room "ABC234"
```

`watch` returns only when this student needs to decide or when the treaty is signed. `inbox` exposes the protocol trace: the personal agent comes online, bids, evaluates drafts, counters when necessary, and receives the final owner decision or signed treaty. The backend agent continues running if the watcher stops.

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
| `GET` | `/api/rooms/:code/inbox` | Read this authenticated personal agent's messages |
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

The tests cover negotiation fairness, personal-agent bids and decisions, automatic counters, private-data redaction, consent state, owner notification text, persistence helpers, the browser engine, and the Worker profile boundary.

## Current limits

- The solver uses four general project roles; a future version can accept project-specific deliverables.
- Rooms are code-accessible and intended for hackathon demonstrations, not sensitive projects.
- Messaging and calendar integrations are guided by the Cubbie Skill but require the student's connected services.
- Supermemory is optional and uses the student's own key.
