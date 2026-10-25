"""Negotiation engine for the Group Project Prenup prototype."""

from __future__ import annotations

from copy import deepcopy
from itertools import product
from typing import Any


DEFAULT_ROLES = [
    {"id": "research", "label": "Research lead", "skill": "research", "effort": 2},
    {"id": "analysis", "label": "Analysis + build", "skill": "analysis", "effort": 3},
    {"id": "slides", "label": "Slide architect", "skill": "design", "effort": 2},
    {"id": "presentation", "label": "Presentation lead", "skill": "presentation", "effort": 1},
]


def _clean_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def normalize_students(raw_students: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not 2 <= len(raw_students) <= 6:
        raise ValueError("A prenup needs between 2 and 6 student agents.")

    students = []
    seen_ids = set()
    for index, raw in enumerate(raw_students):
        student_id = str(raw.get("id") or f"student-{index + 1}")
        if student_id in seen_ids:
            raise ValueError("Every student agent needs a unique id.")
        seen_ids.add(student_id)
        students.append(
            {
                "id": student_id,
                "name": str(raw.get("name") or f"Student {index + 1}"),
                "strengths": _clean_list(raw.get("strengths")),
                "prefers": _clean_list(raw.get("prefers")),
                "avoids": _clean_list(raw.get("avoids")),
                "declined_roles": _clean_list(raw.get("declined_roles")),
                "available": _clean_list(raw.get("available")),
                "capacity": max(1, min(6, int(raw.get("capacity", 3)))),
                "private_note": str(raw.get("private_note") or ""),
                "private_calendar": _clean_list(raw.get("private_calendar")),
            }
        )
    return students


def _assignment_score(
    students: list[dict[str, Any]],
    roles: list[dict[str, Any]],
    owners: tuple[int, ...],
) -> tuple[int, dict[str, int], list[str]]:
    score = 0
    loads = {student["id"]: 0 for student in students}
    compromises = []

    for role, owner_index in zip(roles, owners):
        student = students[owner_index]
        student_id = student["id"]
        loads[student_id] += int(role["effort"])
        role_id = role["id"]
        skill = role["skill"]

        if role_id in student["prefers"]:
            score += 9
        if skill in student["strengths"]:
            score += 7
        if role_id in student["avoids"]:
            score -= 12
            compromises.append(f"{student['name']} received {role['label']} despite avoiding it")
        if role_id in student["declined_roles"]:
            score -= 1_000

    for student in students:
        load = loads[student["id"]]
        overflow = max(0, load - student["capacity"])
        score -= overflow * 20

    spread = max(loads.values()) - min(loads.values())
    score -= spread * 3
    score -= len(compromises) * 2
    return score, loads, compromises


def choose_assignments(
    students: list[dict[str, Any]],
    roles: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, int], list[str]]:
    candidates = product(range(len(students)), repeat=len(roles))
    best = None
    for owners in candidates:
        score, loads, compromises = _assignment_score(students, roles, owners)
        signature = tuple(students[index]["id"] for index in owners)
        candidate = (score, tuple(-load for load in loads.values()), signature, owners, loads, compromises)
        if best is None or candidate[:3] > best[:3]:
            best = candidate

    assert best is not None
    owners, loads, compromises = best[3], best[4], best[5]
    assignments = []
    for role, owner_index in zip(roles, owners):
        owner = students[owner_index]
        assignments.append(
            {
                "role_id": role["id"],
                "role": role["label"],
                "owner_id": owner["id"],
                "owner": owner["name"],
                "effort": role["effort"],
                "reason": _assignment_reason(owner, role),
            }
        )
    return assignments, loads, compromises


def _assignment_reason(student: dict[str, Any], role: dict[str, Any]) -> str:
    if role["id"] in student["prefers"] and role["skill"] in student["strengths"]:
        return "preferred role + strongest skill match"
    if role["skill"] in student["strengths"]:
        return "strongest skill match"
    if role["id"] in student["prefers"]:
        return "preferred role"
    return "best remaining fairness fit"


def choose_meeting(students: list[dict[str, Any]]) -> dict[str, Any]:
    slot_sets = [set(student["available"]) for student in students]
    common = set.intersection(*slot_sets) if slot_sets else set()
    if common:
        selected = sorted(common)[0]
        return {"slot": selected, "attendance": len(students), "needs_confirmation": False}

    all_slots = sorted(set().union(*slot_sets))
    if not all_slots:
        return {"slot": None, "attendance": 0, "needs_confirmation": True}
    ranked = sorted(
        ((sum(slot in slots for slots in slot_sets), slot) for slot in all_slots),
        key=lambda item: (-item[0], item[1]),
    )
    attendance, selected = ranked[0]
    return {"slot": selected, "attendance": attendance, "needs_confirmation": True}


def negotiate(raw_students: list[dict[str, Any]], raw_roles: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    students = normalize_students(deepcopy(raw_students))
    roles = deepcopy(raw_roles or DEFAULT_ROLES)
    assignments, loads, compromises = choose_assignments(students, roles)
    meeting = choose_meeting(students)
    preference_counts = {
        role["id"]: sum(role["id"] in student["prefers"] for student in students)
        for role in roles
    }
    collisions = [
        f"{count} agents requested {next(role['label'] for role in roles if role['id'] == role_id)}"
        for role_id, count in preference_counts.items()
        if count > 1
    ]
    load_values = list(loads.values())
    fairness = max(
        0,
        min(100, 100 - (max(load_values) - min(load_values)) * 12 - len(compromises) * 6),
    )

    shared_constraints = [
        {
            "student_id": student["id"],
            "name": student["name"],
            "role_signals": sorted(set(student["strengths"] + student["prefers"])),
            "capacity": student["capacity"],
            "available_slots": student["available"],
        }
        for student in students
    ]
    log = [
        {
            "speaker": f"{student['name']}'s agent",
            "message": (
                f"Shared role signals, {student['capacity']} effort points, "
                f"and {len(student['available'])} possible meeting slots. Private details stayed private."
            ),
        }
        for student in students
    ]
    if collisions:
        log.append({"speaker": "Negotiator", "message": f"Conflict found: {'; '.join(collisions)}."})
    if compromises:
        log.append(
            {
                "speaker": "Negotiator",
                "message": "No perfect split exists. Proposed the least costly compromise and flagged it for consent.",
            }
        )
    log.append(
        {
            "speaker": "Negotiator",
            "message": "Drafted a balanced treaty. Nothing becomes final until every student approves.",
        }
    )

    return {
        "students": students,
        "shared_constraints": shared_constraints,
        "assignments": assignments,
        "loads": loads,
        "compromises": compromises,
        "collisions": collisions,
        "meeting": meeting,
        "fairness_score": fairness,
        "log": log,
    }


def public_proposal(result: dict[str, Any]) -> dict[str, Any]:
    """Remove private agent state before sending a proposal to the group UI."""
    return {key: value for key, value in result.items() if key != "students"}
