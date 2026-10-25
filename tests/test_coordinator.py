import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "skills" / "group-project-prenup" / "scripts" / "coordinator.py"
SPEC = importlib.util.spec_from_file_location("coordinator", SCRIPT)
coordinator = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(coordinator)


class CoordinatorStateTests(unittest.TestCase):
    def test_membership_token_is_private_and_round_trips(self):
        with tempfile.TemporaryDirectory() as directory:
            state = Path(directory) / "rooms.json"
            coordinator.save_membership("ABC234", {"participant_id": "p1", "participant_token": "secret"}, state)
            self.assertEqual(coordinator.token_for("ABC234", state), "secret")
            self.assertEqual(state.stat().st_mode & 0o777, 0o600)

    def test_read_json_rejects_non_object(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "profile.json"
            source.write_text(json.dumps(["not", "a", "profile"]), encoding="utf-8")
            with self.assertRaises(coordinator.CoordinatorError):
                coordinator.read_json(source)

    def test_missing_room_token_is_clear(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(coordinator.CoordinatorError, "Join it first"):
                coordinator.token_for("ABC234", Path(directory) / "missing.json")

    def test_owner_update_names_only_this_agents_work(self):
        inbox = {
            "agent": {"participant_id": "p1", "name": "Maya"},
            "room": {
                "status": "awaiting_confirmation",
                "round": 2,
                "participants": [{"id": "p1", "name": "Maya", "approval": "pending"}],
                "proposal": {
                    "assignments": [
                        {"owner_id": "p1", "role": "Slide architect"},
                        {"owner_id": "p2", "role": "Research lead"},
                    ],
                    "meeting": {"slot": "Thu 5:30"},
                },
            },
        }
        update = coordinator.owner_update(inbox)
        self.assertEqual(update["event"], "owner_confirmation_needed")
        self.assertIn("Slide architect", update["message"])
        self.assertNotIn("Research lead", update["message"])


if __name__ == "__main__":
    unittest.main()
