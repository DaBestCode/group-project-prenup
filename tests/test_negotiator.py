import sys
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).parents[1]))

from negotiator import negotiate, public_proposal  # noqa: E402


STUDENTS = [
    {
        "id": "maya",
        "name": "Maya",
        "strengths": ["research", "writing"],
        "prefers": ["research"],
        "avoids": ["presentation"],
        "available": ["Thu 5:30 PM", "Sun 6:00 PM"],
        "capacity": 3,
        "private_note": "Job interview Tuesday",
        "private_calendar": ["CHM 113", "work shift"],
    },
    {
        "id": "jordan",
        "name": "Jordan",
        "strengths": ["design", "presentation"],
        "prefers": ["research"],
        "avoids": ["slides"],
        "available": ["Thu 5:30 PM", "Sat 11:00 AM"],
        "capacity": 3,
        "private_note": "Does not want the group to know about work schedule",
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


class NegotiationTests(unittest.TestCase):
    def test_assigns_every_role_and_finds_common_meeting(self):
        result = negotiate(STUDENTS)

        self.assertEqual(len(result["assignments"]), 4)
        self.assertEqual(result["meeting"]["slot"], "Thu 5:30 PM")
        self.assertFalse(result["meeting"]["needs_confirmation"])
        self.assertTrue(result["collisions"])
        self.assertGreaterEqual(result["fairness_score"], 70)

    def test_public_proposal_does_not_leak_private_agent_state(self):
        result = negotiate(STUDENTS)
        public = public_proposal(result)
        serialized = str(public)

        self.assertNotIn("private_note", serialized)
        self.assertNotIn("private_calendar", serialized)
        self.assertNotIn("Job interview Tuesday", serialized)
        self.assertNotIn("family commitment", serialized.lower())

    def test_no_common_slot_requests_confirmation(self):
        students = [dict(STUDENTS[0]), dict(STUDENTS[1])]
        students[0]["available"] = ["Monday"]
        students[1]["available"] = ["Tuesday"]

        result = negotiate(students)

        self.assertTrue(result["meeting"]["needs_confirmation"])
        self.assertEqual(result["meeting"]["attendance"], 1)

    def test_rejected_role_is_not_assigned_again(self):
        students = [dict(student) for student in STUDENTS]
        students[1]["declined_roles"] = ["slides"]

        result = negotiate(students)
        slide_assignment = next(
            assignment for assignment in result["assignments"] if assignment["role_id"] == "slides"
        )

        self.assertNotEqual(slide_assignment["owner_id"], "jordan")


if __name__ == "__main__":
    unittest.main()
