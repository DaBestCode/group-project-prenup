#!/usr/bin/env python3
"""Serve the Group Project Prenup demo with no third-party dependencies."""

from __future__ import annotations

import argparse
import json
import mimetypes
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from negotiator import negotiate, public_proposal


ROOT = Path(__file__).parent.resolve()
STATIC = ROOT / "static"
SESSIONS: dict[str, dict[str, Any]] = {}
SESSION_LOCK = threading.Lock()


def create_session(students: list[dict[str, Any]]) -> dict[str, Any]:
    result = negotiate(students)
    session_id = uuid.uuid4().hex
    session = {
        "id": session_id,
        "round": 1,
        "students": result.pop("students"),
        "proposal": result,
        "approvals": {student["id"]: "pending" for student in students},
        "status": "awaiting_confirmation",
    }
    with SESSION_LOCK:
        SESSIONS[session_id] = session
    return session_view(session)


def session_view(session: dict[str, Any]) -> dict[str, Any]:
    return {
        "session_id": session["id"],
        "round": session["round"],
        "status": session["status"],
        "approvals": session["approvals"],
        "proposal": public_proposal(session["proposal"]),
    }


def confirm_session(session_id: str, student_id: str, approved: bool) -> dict[str, Any]:
    with SESSION_LOCK:
        session = SESSIONS.get(session_id)
        if session is None:
            raise ValueError("That negotiation session no longer exists.")
        if student_id not in session["approvals"]:
            raise ValueError("That student is not part of this negotiation.")

        if approved:
            session["approvals"][student_id] = "approved"
            if all(value == "approved" for value in session["approvals"].values()):
                session["status"] = "signed"
            return session_view(session)

        assigned_roles = [
            assignment["role_id"]
            for assignment in session["proposal"]["assignments"]
            if assignment["owner_id"] == student_id
        ]
        student = next(item for item in session["students"] if item["id"] == student_id)
        student["declined_roles"] = sorted(set(student["declined_roles"] + assigned_roles))
        result = negotiate(session["students"])
        session["students"] = result.pop("students")
        result["log"].insert(
            0,
            {
                "speaker": f"{student['name']}'s agent",
                "message": "Student rejected privately. Shared only the newly unavailable role, then reopened bargaining.",
            },
        )
        session["proposal"] = result
        session["round"] += 1
        session["approvals"] = {key: "pending" for key in session["approvals"]}
        session["status"] = "awaiting_confirmation"
        return session_view(session)


class Handler(BaseHTTPRequestHandler):
    server_version = "PrenupDemo/1.0"

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        if path == "/api/health":
            return self.send_json({"ok": True})
        if path == "/":
            path = "/index.html"
        requested = (STATIC / path.lstrip("/")).resolve()
        if STATIC not in requested.parents or not requested.is_file():
            return self.send_error(404)
        content_type = mimetypes.guess_type(requested.name)[0] or "application/octet-stream"
        body = requested.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:  # noqa: N802
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length > 200_000:
                raise ValueError("Request is too large.")
            payload = json.loads(self.rfile.read(length) or b"{}")
            if self.path == "/api/negotiate":
                return self.send_json(create_session(payload.get("students", [])), status=201)
            if self.path == "/api/confirm":
                result = confirm_session(
                    str(payload.get("session_id", "")),
                    str(payload.get("student_id", "")),
                    bool(payload.get("approved")),
                )
                return self.send_json(result)
            self.send_error(404)
        except (ValueError, TypeError, KeyError, json.JSONDecodeError) as error:
            self.send_json({"error": str(error)}, status=400)

    def send_json(self, payload: dict[str, Any], status: int = 200) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: Any) -> None:
        print(f"[{self.log_date_time_string()}] {format % args}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8787)
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"Group Project Prenup is running at http://{args.host}:{args.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
