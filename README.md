# Group Project Prenup

> Sign the treaty before the group chat becomes a crime scene.

Group Project Prenup is a working Track 2 prototype for the Cubbie Hackathon. Personal agents privately compare each student's availability, strengths, role preferences, and workload capacity. They exchange only the constraints needed to negotiate a fair task split and meeting time. The proposed treaty becomes final only after every student confirms it.

## Why students need it

Group projects usually fail before the work begins: everyone assumes someone else owns the slides, schedules stay vague, and personal constraints get explained repeatedly in a group chat. The Prenup gives the group one explicit, unanimously accepted plan without requiring students to publish their calendars or private reasons.

## Demo

```bash
python3 server.py
```

Open http://127.0.0.1:8787 and click **Negotiate the prenup**.

## Free hosting

The included `render.yaml` deploys the complete frontend and Python API on Render's free web-service plan. Use the Blueprint button below, choose the free plan shown in the preview, and create the service:

[Deploy to Render](https://render.com/deploy?repo=https://github.com/DaBestCode/group-project-prenup)

Render runs `python3 server.py --host 0.0.0.0 --port $PORT` and checks `/api/health`. No database, paid instance, or Supermemory key is required. Free instances can sleep or restart, so active negotiation sessions may reset; start a new negotiation if that happens.

The sample deliberately creates a conflict: all three agents request the research role, while slides are unpopular. The solver searches every possible assignment, balancing:

- role preference
- skill match
- workload capacity
- effort fairness
- avoided roles
- shared meeting availability

Approve the treaty as each student, or reject one assignment privately to make that role a hard constraint and trigger a materially different negotiation round.

## What agents share

- role and skill signals
- workload capacity
- possible meeting slots
- a newly unavailable role after a rejection

## What stays private

- course names and complete calendars
- jobs, family commitments, and personal explanations
- the reason a student rejected a proposal

The browser receives only the public proposal. Tests verify that private notes and calendar details do not appear in serialized proposal data.

## Architecture

- `negotiator.py` models personal agents and exhaustively searches the small assignment space.
- `server.py` stores negotiation rounds, confirmations, and rejections in memory and exposes a small JSON API.
- `static/` contains a dependency-free responsive demo interface.
- `skills/group-project-prenup/` is the installable Cubbie Skill and its tested Supermemory v5 adapter.

The current prototype uses deterministic agent policies so every demo is explainable and repeatable. Each sponsor has one concrete job:

- **Cubbie** is the private interface for one student. It gathers calendar free/busy windows, preferences, and workload, shows the redacted profile, and asks before sharing or confirming.
- **Supermemory** optionally keeps durable strengths and role preferences between projects. The adapter deliberately excludes meeting availability, calendar events, course details, and private reasons.

The coordinator stays a tiny self-hostable Python service with no cloud dependency or required paid infrastructure.

## Install the Cubbie Skill

Send Cubbie the GitHub link to the `skills/group-project-prenup` folder. The Skill walks one student through the privacy and consent flow and includes a no-network sample:

```bash
python3 skills/group-project-prenup/scripts/preferences.py sample
```

## Optional Supermemory

The demo does not need an API key. To enable preferences that survive between projects, set `SUPERMEMORY_API_KEY` in the environment where the Skill runs, then use:

```bash
python3 skills/group-project-prenup/scripts/preferences.py recall --student-id "student-123"
python3 skills/group-project-prenup/scripts/preferences.py remember --input /tmp/prenup-profile.json
```

The adapter uses Supermemory v5 namespaces: one hashed namespace per student, `POST /ns/{namespace}/document` to remember preferences, and `POST /ns/{namespace}/search` to recall them. Keys stay in the environment and are never collected in chat or committed.

## Test

```bash
python3 -m unittest discover -s tests -v
python3 -m py_compile server.py negotiator.py skills/group-project-prenup/scripts/preferences.py
```

## Prototype limits

- Sessions are stored in memory and reset when the server restarts.
- The demo uses three sample students and four fixed project roles.
- It does not connect to real calendars or messaging accounts.
- Supermemory is optional and requires the student's own API key; automated tests use a fake transport and make no billable calls.
- Authentication, encrypted agent transport, and production messaging adapters remain future work.
