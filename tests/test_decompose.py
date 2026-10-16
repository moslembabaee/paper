import json
import unittest
from unittest.mock import patch
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import orchestrator
import issue_bot  # noqa: E402  (decompose_task imports from here)


def make_roadmap():
    return {
        "current_task_id": None,
        "tasks": [
            {
                "id": "T-BIG-1",
                "phase": "Evolution",
                "title": "Huge feature with many parts",
                "description": ("Part 1: x. Part 2: y. Part 3: z. " * 40),
                "assigned_agent": "claude",
                "status": "approved",
                "retry_count": 0,
                "verification_cmd": "cd /root/projects/paper/app && npm run build",
                "github_issue_number": 99,
            }
        ],
    }


class DecomposeTest(unittest.TestCase):
    def test_big_task_is_detected(self):
        task = make_roadmap()["tasks"][0]
        self.assertTrue(orchestrator.is_big_task(task))
        small = dict(task, description="short")
        self.assertFalse(orchestrator.is_big_task(small))

    def test_decompose_keeps_parent_and_links_children(self):
        roadmap = make_roadmap()
        parent = roadmap["tasks"][0]
        with patch("issue_bot.decompose_issue_into_subtasks",
                   return_value=[{"title": "A", "description": "a" * 100},
                                 {"title": "B", "description": "b" * 100}]):
            ok = orchestrator.decompose_task(roadmap, parent)
        self.assertTrue(ok)
        # Parent is NOT removed: it stays as a verification checkpoint
        self.assertEqual(parent["status"], "decomposed")
        self.assertEqual(len(parent["children"]), 2)
        children = [t for t in roadmap["tasks"] if t["id"] != "T-BIG-1"]
        self.assertEqual(len(children), 2)
        for child in children:
            self.assertEqual(child["parent_id"], "T-BIG-1")
            self.assertEqual(child["status"], "approved")
            self.assertEqual(child["github_issue_number"], 99)
        # decompose_task must not write to the real roadmap on disk
        self.assertEqual(Path('/root/projects/paper/ROADMAP.json').read_text().count('T-BIG-'), 0)

    def test_parent_finalized_once_all_children_done(self):
        roadmap = make_roadmap()
        parent = roadmap["tasks"][0]
        with patch("issue_bot.decompose_issue_into_subtasks",
                   return_value=[{"title": "A", "description": "a" * 100},
                                 {"title": "B", "description": "b" * 100}]):
            orchestrator.decompose_task(roadmap, parent)
        children = [t for t in roadmap["tasks"] if t["id"] != "T-BIG-1"]

        # Only one child done -> parent stays decomposed
        children[0]["status"] = "completed"
        with patch("orchestrator.run_cmd", return_value=(1, "no run yet")):
            orchestrator.maybe_finalize_parent(roadmap, "T-BIG-1")
        self.assertEqual(parent["status"], "decomposed")

        # All children done -> verify once; pass -> parent completed
        children[1]["status"] = "completed"

        def fake_run(cmd, **kw):
            if "npm run build" in str(cmd):
                return (0, "verified ok")
            return (0, "ok")

        with patch("orchestrator.run_cmd", side_effect=fake_run), \
             patch("orchestrator.save_roadmap", side_effect=lambda d: None):
            orchestrator.maybe_finalize_parent(roadmap, "T-BIG-1")
        self.assertEqual(parent["status"], "completed")
        self.assertTrue(parent.get("completed_at"))

    def test_parent_blocked_when_goal_not_met(self):
        roadmap = make_roadmap()
        parent = roadmap["tasks"][0]
        with patch("issue_bot.decompose_issue_into_subtasks",
                   return_value=[{"title": "A", "description": "a" * 100},
                                 {"title": "B", "description": "b" * 100}]):
            orchestrator.decompose_task(roadmap, parent)
        for t in roadmap["tasks"]:
            if t["id"] != "T-BIG-1":
                t["status"] = "completed"
        with patch("orchestrator.run_cmd", return_value=(1, "build failed")), \
             patch("orchestrator.save_roadmap", side_effect=lambda d: None):
            orchestrator.maybe_finalize_parent(roadmap, "T-BIG-1")
        self.assertEqual(parent["status"], "blocked")
        self.assertIn("build failed", parent.get("blocked_reason", ""))


if __name__ == "__main__":
    unittest.main(verbosity=2)