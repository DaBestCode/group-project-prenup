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

The current prototype uses deterministic agent policies so every demo is explainable and repeatable. A production messaging integration would keep each private profile with its student's personal agent and exchange the same limited constraint schema over authenticated agent-to-agent messages.

## Test

```bash
python3 -m unittest discover -s tests -v
python3 -m py_compile server.py negotiator.py
```

## Prototype limits

- Sessions are stored in memory and reset when the server restarts.
- The demo uses three sample students and four fixed project roles.
- It does not connect to real calendars or messaging accounts.
- Authentication, encrypted agent transport, persistence, and production messaging adapters remain future work.
