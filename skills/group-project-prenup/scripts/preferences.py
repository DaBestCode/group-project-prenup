#!/usr/bin/env python3
"""Prepare a privacy-safe profile and optionally remember it with Supermemory v5."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen


API_BASE = "https://api.supermemory.ai"
ALLOWED_PROFILE_FIELDS = ("id", "name", "strengths", "prefers", "avoids", "capacity", "available")
DURABLE_FIELDS = ("strengths", "prefers", "avoids")
SAMPLE = Path(__file__).parents[1] / "assets" / "sample-profile.json"


def safe_profile(raw: dict[str, Any]) -> dict[str, Any]:
    """Return only fields that the negotiating agents are allowed to exchange."""
    profile = {key: raw[key] for key in ALLOWED_PROFILE_FIELDS if key in raw}
    if not str(profile.get("id", "")).strip():
        raise ValueError("Profile needs a stable student id.")
    if not str(profile.get("name", "")).strip():
        raise ValueError("Profile needs the student's display name.")
    return profile


def durable_preferences(raw: dict[str, Any]) -> dict[str, list[str]]:
    """Select preferences safe to retain between projects."""
    return {
        key: [str(item).strip() for item in raw.get(key, []) if str(item).strip()]
        for key in DURABLE_FIELDS
    }


def namespace_for(student_id: str) -> str:
    digest = hashlib.sha256(student_id.strip().encode("utf-8")).hexdigest()[:32]
    return f"prenup_user_{digest}"


class SupermemoryClient:
    def __init__(self, api_key: str, opener: Callable[..., Any] = urlopen, api_base: str = API_BASE) -> None:
        if not api_key.strip():
            raise ValueError("SUPERMEMORY_API_KEY is not set.")
        self.api_key = api_key
        self.opener = opener
        self.api_base = api_base.rstrip("/")

    def _post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        request = Request(
            f"{self.api_base}{path}",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
            method="POST",
        )
        try:
            with self.opener(request, timeout=15) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Supermemory returned HTTP {error.code}: {detail[:240]}") from error
        except URLError as error:
            raise RuntimeError(f"Could not reach Supermemory: {error.reason}") from error

    def remember(self, student_id: str, profile: dict[str, Any]) -> dict[str, Any]:
        preferences = durable_preferences(profile)
        content = (
            "Group project preferences chosen by the student. "
            f"Strengths: {', '.join(preferences['strengths']) or 'none stated'}. "
            f"Preferred roles: {', '.join(preferences['prefers']) or 'none stated'}. "
            f"Roles to avoid: {', '.join(preferences['avoids']) or 'none stated'}."
        )
        namespace = quote(namespace_for(student_id), safe="")
        return self._post(
            f"/ns/{namespace}/document",
            {
                "content": content,
                "id": "group-project-prenup-preferences",
                "metadata": {"source": "group-project-prenup", "kind": "role-preferences"},
                "taskType": "memory",
            },
        )

    def recall(self, student_id: str) -> dict[str, Any]:
        namespace = quote(namespace_for(student_id), safe="")
        return self._post(
            f"/ns/{namespace}/search",
            {
                "query": "my group project strengths, preferred roles, and roles to avoid",
                "searchMode": "memories",
                "limit": 5,
                "threshold": 0.3,
            },
        )


def read_profile(path: Path) -> dict[str, Any]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError("Profile JSON must be an object.")
    return data


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("prepare", "remember", "recall", "sample"))
    parser.add_argument("--input", type=Path, help="JSON profile created from the student's answers")
    parser.add_argument("--student-id", help="Stable local student id for an isolated memory namespace")
    args = parser.parse_args()

    try:
        if args.command == "sample":
            profile = read_profile(SAMPLE)
            print(json.dumps({"share_with_group": safe_profile(profile), "remember": durable_preferences(profile)}, indent=2))
            return 0
        if args.command == "prepare":
            if not args.input:
                parser.error("prepare requires --input")
            print(json.dumps(safe_profile(read_profile(args.input)), indent=2))
            return 0

        client = SupermemoryClient(os.environ.get("SUPERMEMORY_API_KEY", ""))
        if args.command == "remember":
            if not args.input:
                parser.error("remember requires --input")
            raw = read_profile(args.input)
            student_id = args.student_id or str(raw.get("id", ""))
            print(json.dumps(client.remember(student_id, raw), indent=2))
            return 0
        if not args.student_id:
            parser.error("recall requires --student-id")
        print(json.dumps(client.recall(args.student_id), indent=2))
        return 0
    except (OSError, ValueError, RuntimeError, json.JSONDecodeError) as error:
        print(str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
