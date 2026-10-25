import sys
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).parents[1]))

from server import SESSIONS, confirm_session, create_session  # noqa: E402


def sample_students():
    return [
        {
            "id": "maya",
            "name": "Maya",
            "strengths": ["research", "writing"],
            "prefers": ["research"],
            "avoids": ["presentation"],
            "available": ["Thu 5:30 PM", "Sun 6:00 PM"],
            "capacity": 3,
            "private_note": "Job interview Tuesday",
        },
        {
            "id": "jordan",
            "name": "Jordan",
            "strengths": ["design", "presentation"],
            "prefers": ["research"],
            "avoids": ["slides"],
            "available": ["Thu 5:30 PM", "Sat 11:00 AM"],
            "capacity": 3,
            "private_note": "Extra work shifts",
        },
        {
            "id": "leo",
            "name": "Leo",
            "strengths": ["analysis", "coding"],
            "prefers": ["research"],
            "avoids": ["slides"],
            "available": ["Thu 5:30 PM", "Sun 6:00 PM"],
            "capacity": 3,
            "private_note": "Family commitment",
        },
    ]


class SessionTests(unittest.TestCase):
    def setUp(self):
        SESSIONS.clear()

    def test_rejection_changes_the_students_assigned_roles(self):
        first = create_session(sample_students())
        previous_roles = {
            item["role_id"]
            for item in first["proposal"]["assignments"]
            if item["owner_id"] == "jordan"
        }

        revised = confirm_session(first["session_id"], "jordan", False)
        revised_roles = {
            item["role_id"]
            for item in revised["proposal"]["assignments"]
            if item["owner_id"] == "jordan"
        }

        self.assertEqual(revised["round"], 2)
        self.assertTrue(previous_roles)
        self.assertTrue(previous_roles.isdisjoint(revised_roles))
        self.assertTrue(all(value == "pending" for value in revised["approvals"].values()))

    def test_treaty_requires_every_students_approval(self):
        session = create_session(sample_students())
        session_id = session["session_id"]

        after_one = confirm_session(session_id, "maya", True)
        after_two = confirm_session(session_id, "jordan", True)
        final = confirm_session(session_id, "leo", True)

        self.assertEqual(after_one["status"], "awaiting_confirmation")
        self.assertEqual(after_two["status"], "awaiting_confirmation")
        self.assertEqual(final["status"], "signed")
        self.assertTrue(all(value == "approved" for value in final["approvals"].values()))


if __name__ == "__main__":
    unittest.main()
