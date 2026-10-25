import importlib.util
import json
import sys
import unittest
from pathlib import Path


SCRIPT = Path(__file__).parents[1] / "skills" / "group-project-prenup" / "scripts" / "preferences.py"
SPEC = importlib.util.spec_from_file_location("prenup_preferences", SCRIPT)
preferences = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules[SPEC.name] = preferences
SPEC.loader.exec_module(preferences)


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return json.dumps(self.payload).encode("utf-8")


class PreferenceTests(unittest.TestCase):
    def setUp(self):
        self.profile = {
            "id": "maya@example.edu",
            "name": "Maya",
            "strengths": ["research"],
            "prefers": ["analysis"],
            "avoids": ["presentation"],
            "capacity": 3,
            "available": ["Thu 5:30 PM"],
            "private_note": "medical appointment",
            "private_calendar": ["doctor visit"],
        }

    def test_shareable_profile_removes_private_fields(self):
        safe = preferences.safe_profile(self.profile)

        self.assertNotIn("private_note", safe)
        self.assertNotIn("private_calendar", safe)
        self.assertEqual(safe["available"], ["Thu 5:30 PM"])

    def test_supermemory_write_contains_only_durable_preferences(self):
        captured = {}

        def opener(request, timeout):
            captured["url"] = request.full_url
            captured["payload"] = json.loads(request.data)
            captured["authorization"] = request.headers["Authorization"]
            captured["timeout"] = timeout
            return FakeResponse({"id": "preference-doc", "status": "queued"})

        client = preferences.SupermemoryClient("test-key", opener=opener)
        result = client.remember(self.profile["id"], self.profile)
        encoded = json.dumps(captured["payload"])

        self.assertEqual(result["status"], "queued")
        self.assertIn("/ns/prenup_user_", captured["url"])
        self.assertNotIn("medical appointment", encoded)
        self.assertNotIn("doctor visit", encoded)
        self.assertNotIn("Thu 5:30 PM", encoded)
        self.assertIn("analysis", encoded)

    def test_recall_uses_isolated_namespace_and_memory_search(self):
        captured = {}

        def opener(request, timeout):
            captured["url"] = request.full_url
            captured["payload"] = json.loads(request.data)
            return FakeResponse({"results": []})

        client = preferences.SupermemoryClient("test-key", opener=opener)
        client.recall(self.profile["id"])

        self.assertTrue(captured["url"].endswith("/search"))
        self.assertEqual(captured["payload"]["searchMode"], "memories")


if __name__ == "__main__":
    unittest.main()
