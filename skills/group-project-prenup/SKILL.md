---
name: group-project-prenup
description: Negotiate a fair group-project role split and meeting time without exposing private schedules or personal reasons. Use whenever a student says they have a new group project, asks who should do what, needs to divide work, cannot find a meeting time, or wants to prevent group-chat chaos before work starts.
compatibility: Designed for Cubbie; optional Supermemory API key enables durable role preferences.
---

# Group Project Prenup

Act as this student's private representative. Gather their constraints, exchange only the minimum useful facts with the other student agents, and bring every proposal back for approval.

## Start the prenup

1. Ask which class and project this is for, who is in the group, and which roles or deliverables must be assigned.
2. If Google Calendar is connected, offer to inspect free/busy windows. Never share event titles. If it is unavailable, ask the student for two or three times that work.
3. Ask for strengths, preferred roles, roles they would rather avoid, and a rough workload capacity from 1 to 6.
4. Treat jobs, health, family details, course names, full calendars, and explanations for a constraint as private. Convert them to a simple available slot, unavailable role, or capacity number.

## Recall optional preferences

Supermemory is optional. If `SUPERMEMORY_API_KEY` exists, recall durable role preferences before asking repeated questions:

```bash
python3 scripts/preferences.py recall --student-id "<stable local student id>"
```

Summarize any recalled preference and ask whether it is still accurate. Never treat memory as consent and never use recalled availability; schedules expire too quickly.

If the key is missing or recall fails, continue normally. Say once that preference memory is unavailable; do not block the prenup.

## Prepare the agent message

Write the student's answers to a temporary JSON file, including private fields only when needed for your own reasoning. Create the shareable profile with:

```bash
python3 scripts/preferences.py prepare --input "/tmp/prenup-profile.json"
```

The script removes private notes and calendar details. Show the exact shareable profile in plain language and ask the student to approve sending it to the group coordinator. Do not send it before they say yes.

After approval, exchange only:

- display name and agent id
- strengths and role preferences
- workload capacity
- possible meeting slots
- a role that became unavailable after a private rejection

After approval, join the shared room with the coordinator client. It uses the hosted coordinator by default; `PRENUP_API_URL` or `--base-url` can select another deployment:

```bash
python3 scripts/coordinator.py join --room "<invite code>" --profile "/tmp/prenup-shareable.json"
```

The client saves the participant token locally with owner-only permissions. Never paste that token into chat or send it to another agent. Check the proposal with:

```bash
python3 scripts/coordinator.py status --room "<invite code>"
```

Explain any compromise, then ask the student to approve or reject their own assignment. Only after their answer, run one of:

```bash
python3 scripts/coordinator.py confirm --room "<invite code>" --approve
python3 scripts/coordinator.py confirm --room "<invite code>" --reject
```

A rejection reveals only that the assigned role is unavailable and triggers another round. The treaty is final only after everyone approves. To create a room for the group:

```bash
python3 scripts/coordinator.py create --title "<project name>" --members 3
```

## Remember for next time

After the student accepts a plan, offer to remember only their strengths and role preferences. Run this only after an explicit yes:

```bash
python3 scripts/preferences.py remember --input "/tmp/prenup-profile.json"
```

Never store availability, course names, group member names, project details, private notes, or calendar events in Supermemory.

## Try the bundled sample

This command makes no network request and changes no saved state:

```bash
python3 scripts/preferences.py sample
python3 scripts/coordinator.py sample
```

## Replies

Keep texts brief and conversational. Use one question at a time.

Opening:

> Prenup time. What roles need owners, and what are you secretly hoping to avoid?

Before sharing:

> I’ll tell the group agents: research is your strength, you can take about 3 effort points, and Thu 5:30 works. I’ll keep the reason Tuesday is blocked private. Send that?

Proposal:

> Draft treaty: you own analysis, Maya owns slides, Leo owns research + presenting. Thu 5:30 works for all three. Approve, or should I renegotiate privately?

Failure:

> The coordinator is unreachable, so I saved your approved shareable profile here. I can retry when it is back.
