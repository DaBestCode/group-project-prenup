#!/usr/bin/env python3
"""Small command-line client for the shared Group Project Prenup coordinator."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sys
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


DEFAULT_BASE_URL = os.environ.get("PRENUP_API_URL", "https://group-project-prenup.pjanga.workers.dev").rstrip("/")
DEFAULT_STATE_PATH = Path(
    os.environ.get(
        "PRENUP_STATE_PATH",
        Path.home() / ".config" / "group-project-prenup" / "rooms.json",
    )
)


class CoordinatorError(RuntimeError):
    pass


def call_api(base_url: str, path: str, method: str = "GET", payload: dict[str, Any] | None = None, token: str | None = None) -> dict[str, Any]:
    headers = {
        "Accept": "application/json",
        "User-Agent": "GroupProjectPrenup/1.0 (+https://github.com/DaBestCode/group-project-prenup)",
    }
    data = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(payload).encode("utf-8")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = Request(f"{base_url.rstrip('/')}{path}", data=data, headers=headers, method=method)
    try:
        with urlopen(request, timeout=15) as response:
            return json.load(response)
    except HTTPError as error:
        try:
            detail = json.load(error).get("error", error.reason)
        except (json.JSONDecodeError, AttributeError):
            detail = error.reason
        raise CoordinatorError(str(detail)) from error
    except URLError as error:
        raise CoordinatorError(f"Coordinator is unreachable: {error.reason}") from error


def read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise CoordinatorError(f"Could not read JSON from {path}: {error}") from error
    if not isinstance(value, dict):
        raise CoordinatorError("The input JSON must be an object.")
    return value


def load_state(path: Path = DEFAULT_STATE_PATH) -> dict[str, Any]:
    if not path.exists():
        return {}
    return read_json(path)


def save_membership(code: str, membership: dict[str, str], path: Path = DEFAULT_STATE_PATH) -> None:
    state = load_state(path)
    state[code] = membership
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
    path.chmod(0o600)


def token_for(code: str, path: Path = DEFAULT_STATE_PATH) -> str:
    try:
        return str(load_state(path)[code]["participant_token"])
    except (KeyError, TypeError) as error:
        raise CoordinatorError(f"No participant token is saved for room {code}. Join it first.") from error


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__)
    root.add_argument("--base-url", default=DEFAULT_BASE_URL)
    root.add_argument("--state", type=Path, default=DEFAULT_STATE_PATH, help=argparse.SUPPRESS)
    commands = root.add_subparsers(dest="command", required=True)

    create = commands.add_parser("create", help="create an invite room")
    create.add_argument("--title", required=True)
    create.add_argument("--members", type=int, default=3)

    join = commands.add_parser("join", help="join with an approved shareable profile")
    join.add_argument("--room", required=True)
    join.add_argument("--profile", type=Path, required=True)

    status = commands.add_parser("status", help="show the public room state")
    status.add_argument("--room", required=True)

    confirm = commands.add_parser("confirm", help="approve or privately reject a proposal")
    confirm.add_argument("--room", required=True)
    decision = confirm.add_mutually_exclusive_group(required=True)
    decision.add_argument("--approve", action="store_true")
    decision.add_argument("--reject", action="store_true")

    commands.add_parser("sample", help="print a no-network walkthrough")
    return root


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        if args.command == "sample":
            print(json.dumps({
                "create": {"title": "CSE 412 Final", "expected_members": 3},
                "join": {"name": "Maya", "strengths": ["research"], "prefers": ["analysis"], "avoids": ["presenting"], "available": ["Thu 5:30"], "capacity": 3},
                "privacy": "Only this shareable profile goes to the coordinator. Tokens stay on this device.",
            }, indent=2))
            return 0
        code = getattr(args, "room", "").upper()
        if args.command == "create":
            result = call_api(args.base_url, "/api/rooms", "POST", {"title": args.title, "expected_members": args.members})
        elif args.command == "join":
            result = call_api(args.base_url, f"/api/rooms/{code}/join", "POST", read_json(args.profile))
            save_membership(code, {"participant_id": result["participant_id"], "participant_token": result["participant_token"]}, args.state)
        elif args.command == "status":
            result = call_api(args.base_url, f"/api/rooms/{code}")
        else:
            result = call_api(args.base_url, f"/api/rooms/{code}/confirm", "POST", {"approved": args.approve}, token_for(code, args.state))
        print(json.dumps(result, indent=2))
        return 0
    except CoordinatorError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
