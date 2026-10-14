import copy
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, patch

import issue_bot
from issue_lifecycle import IGNORED_LABELS, mark_issue_closed
import orchestrator
import roadmap_store
import roadmap_sync
import webhook_server


def task(task_id, status="approved", **extra):
    return {"id": task_id, "status": status, "title": "Example", "description": "Example task", "phase": "Issues",
            "assigned_agent": "claude", "retry_count": 0, "verification_cmd": "build", **extra}


def issue(number=8, labels=(), **extra):
    return {"number": number, "title": "Example", "body": "A small request",
            "author": {"login": "moslembabaee"}, "comments": [],
            "labels": [{"name": name} for name in labels], **extra}


class IssueLifecycleTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "ROADMAP.json"
        self.md = self.path.with_suffix(".md")
        self.data = {"current_task_id": "T-ISSUE-8-1", "tasks": [
            task("T-ISSUE-8-1", "in_progress"), task("T-ISSUE-8-2", "failed"),
            task("T-EVOLVE-custom", github_issue_number=8), task("T-ISSUE-80"),
        ]}
        self.path.write_text(json.dumps(self.data))
        for module in (issue_bot, webhook_server, orchestrator):
            self.enterContext(patch.object(module, "log"))
            self.enterContext(patch.object(module, "ROADMAP_FILE", self.path))
        self.enterContext(patch.object(roadmap_sync, "ROADMAP_JSON", self.path))
        self.enterContext(patch.object(roadmap_sync, "ROADMAP_MD", self.md))

    def read(self):
        return json.loads(self.path.read_text())

    def webhook(self, event, payload):
        handler = object.__new__(webhook_server.GitHubWebhookHandler)
        body = json.dumps(payload).encode()
        handler.headers = {"Content-Length": str(len(body)), "X-GitHub-Event": event}
        handler.rfile = io.BytesIO(body)
        handler.wfile = io.BytesIO()
        handler.send_response = Mock()
        handler.send_header = Mock()
        handler.end_headers = Mock()
        handler.do_POST()
        handler.send_response.assert_called_once_with(200)

    def test_close_matches_all_subtasks_but_not_number_prefix(self):
        self.assertTrue(mark_issue_closed(self.data, 8, "closed-time"))
        self.assertIsNone(self.data["current_task_id"])
        self.assertEqual([t["status"] for t in self.data["tasks"]],
                         ["completed", "completed", "completed", "approved"])
        self.assertFalse(mark_issue_closed(self.data, 8, "another-time"))
        self.assertEqual(self.data["tasks"][0]["completed_at"], "closed-time")

    def test_closure_preserves_existing_completion_time(self):
        data = {"tasks": [task("T-ISSUE-8", "completed", completed_at="verified-time")]}
        mark_issue_closed(data, 8, "closed-time")
        self.assertEqual(data["tasks"][0]["completed_at"], "verified-time")

    def test_close_event_handles_ignored_issues_and_cleans_only_active_labels(self):
        with patch.object(webhook_server.subprocess, "run", return_value=Mock(returncode=0)) as run:
            self.webhook("issues", {"action": "closed", "issue": issue(
                labels=("infra", "approved", "in-progress", "blocked"), closed_at="closed-time")})
        self.assertIsNone(self.read()["current_task_id"])
        self.assertEqual(self.read()["tasks"][0]["closed_at"], "closed-time")
        self.assertIn("Completed Deliverables", self.md.read_text())
        self.assertEqual(run.call_args.args[0][-2:], ["--remove-label", "in-progress,blocked"])
        self.assertEqual(run.call_args.kwargs["timeout"], 30)

    def test_github_timeout_does_not_prevent_local_closure(self):
        with patch.object(webhook_server.subprocess, "run",
                          side_effect=subprocess.TimeoutExpired("gh", 30)):
            webhook_server.handle_issue_closed(8)
        self.assertEqual(self.read()["tasks"][0]["status"], "completed")
        self.assertTrue(self.md.exists())

    def test_stale_snapshot_cannot_restore_closed_task_or_active_pointer(self):
        stale = copy.deepcopy(self.data)
        with patch.object(webhook_server.subprocess, "run", return_value=Mock(returncode=0)):
            webhook_server.handle_issue_closed(8)
        stale["tasks"][0]["status"] = "failed"
        stale["tasks"].append(task("T-ISSUE-9"))
        orchestrator.save_roadmap(stale)
        saved = self.read()
        self.assertIsNone(saved["current_task_id"])
        self.assertEqual(saved["tasks"][0]["status"], "completed")
        self.assertEqual(saved["tasks"][-1]["id"], "T-ISSUE-9")

    def test_stale_snapshot_preserves_newly_queued_tasks(self):
        latest = copy.deepcopy(self.data)
        latest["tasks"].append(task("T-ISSUE-9"))
        roadmap_store.save_roadmap(self.path, latest)
        roadmap_store.save_roadmap(self.path, self.data)
        self.assertEqual(self.read()["tasks"][-1]["id"], "T-ISSUE-9")

    def test_ignored_labels_skip_bot_before_ai_or_github_mutations(self):
        for label in IGNORED_LABELS:
            with self.subTest(label=label), \
                    patch.object(issue_bot, "sync_closed_issues", return_value=False), \
                    patch.object(issue_bot, "fetch_open_issues", return_value=[issue(labels=(label.upper(), "approved"))]), \
                    patch.object(issue_bot, "run_cmd") as run, \
                    patch.object(issue_bot, "analyze_issue_with_ai") as analyze, \
                    patch.object(issue_bot, "decompose_issue_into_subtasks") as decompose:
                issue_bot.process_issues()
                run.assert_not_called()
                analyze.assert_not_called()
                decompose.assert_not_called()

    def test_ignored_completed_issue_is_not_automatically_closed(self):
        self.path.write_text(json.dumps({"tasks": [task("T-ISSUE-8", "completed")]}))
        with patch.object(issue_bot, "sync_closed_issues", return_value=False), \
                patch.object(issue_bot, "fetch_open_issues", return_value=[issue(labels=("manual", "approved"))]), \
                patch.object(issue_bot, "run_cmd") as run:
            issue_bot.process_issues()
        run.assert_not_called()

    def test_application_issue_is_still_dispatched(self):
        with patch.object(issue_bot, "sync_closed_issues", return_value=False), \
                patch.object(issue_bot, "fetch_open_issues", return_value=[issue(9, ("approved",))]), \
                patch.object(issue_bot, "decompose_issue_into_subtasks", return_value=[{"title": "Feature", "description": "Build it"}]), \
                patch.object(issue_bot, "run_cmd", return_value=(0, "")):
            issue_bot.process_issues()
        self.assertEqual(self.read()["tasks"][0]["id"], "T-ISSUE-9")
        self.assertEqual(self.read()["tasks"][0]["status"], "approved")

    def test_closed_polling_paginates_and_excludes_pull_requests(self):
        pages = [[issue(80)], [issue(8, ("blocked",), closed_at="closed-time"),
                              issue(9, ("in-progress",), pull_request={})]]
        with patch.object(issue_bot, "run_cmd", side_effect=[(0, json.dumps(pages)), (1, "offline")]) as run:
            self.assertTrue(issue_bot.sync_closed_issues(self.data))
        self.assertIn("--paginate --slurp", run.call_args_list[0].args[0])
        self.assertEqual(run.call_count, 2)
        self.assertIsNone(self.data["current_task_id"])

    def test_polling_persists_closure_without_any_open_issues(self):
        with patch.object(issue_bot, "run_cmd", return_value=(0, json.dumps([[issue(8)]]))), \
                patch.object(issue_bot, "fetch_open_issues", return_value=[]):
            issue_bot.process_issues()
        self.assertEqual(self.read()["tasks"][0]["status"], "completed")
        self.assertIsNone(self.read()["current_task_id"])

    def test_webhook_approvals_cannot_dispatch_ignored_or_closed_issues(self):
        with patch.object(webhook_server, "trigger_issue_bot") as trigger, \
                patch.object(webhook_server, "mark_task_approved") as approve:
            for label in IGNORED_LABELS:
                self.webhook("issues", {"action": "labeled", "label": {"name": "approved"},
                                        "issue": issue(labels=(label,))})
                self.webhook("issue_comment", {"action": "created", "issue": issue(labels=(label,)),
                    "comment": {"user": {"login": "moslembabaee"}, "body": "/approve"}})
            self.webhook("issues", {"action": "labeled", "label": {"name": "approved"},
                                    "issue": issue(state="closed")})
        trigger.assert_not_called()
        approve.assert_not_called()

    def test_removing_ignored_label_triggers_reconciliation(self):
        with patch.object(webhook_server, "trigger_issue_bot") as trigger:
            self.webhook("issues", {"action": "unlabeled", "label": {"name": "infra"},
                                    "issue": issue(labels=("approved",))})
        trigger.assert_called_once()

    def test_approval_updates_subtasks_but_does_not_resurrect_closed_tasks(self):
        with patch.object(webhook_server.subprocess, "run", return_value=Mock(returncode=0)):
            self.assertTrue(webhook_server.mark_task_approved(8))
            self.assertEqual(self.read()["tasks"][1]["status"], "approved")
            webhook_server.handle_issue_closed(8)
            self.assertFalse(webhook_server.mark_task_approved(8))

    def test_dispatch_guard_skips_closed_or_ignored_queued_issues(self):
        for state, labels in (("CLOSED", []), ("OPEN", [{"name": "infra"}])):
            with self.subTest(state=state):
                self.path.write_text(json.dumps(self.data))
                data = copy.deepcopy(self.data)
                with patch.object(orchestrator, "run_cmd", return_value=(0, json.dumps({"state": state, "labels": labels}))):
                    self.assertFalse(orchestrator.reconcile_issue_before_dispatch(data, data["tasks"][0]))
                self.assertIsNone(self.read()["current_task_id"])

    def test_dispatch_guard_defers_when_github_is_unavailable(self):
        with patch.object(orchestrator, "run_cmd", return_value=(-1, "timeout")):
            self.assertFalse(orchestrator.reconcile_issue_before_dispatch(self.data, self.data["tasks"][0]))
        self.assertEqual(self.read()["tasks"][0]["status"], "in_progress")

    def test_dispatch_guard_allows_app_issues_and_tasks_without_issues(self):
        with patch.object(orchestrator, "run_cmd", return_value=(0, json.dumps({"state": "OPEN", "labels": []}))) as run:
            self.assertTrue(orchestrator.reconcile_issue_before_dispatch(self.data, self.data["tasks"][0]))
            self.assertTrue(orchestrator.reconcile_issue_before_dispatch(self.data, task("T-FEATURE")))
        run.assert_called_once()

    def test_duplicate_close_event_preserves_timestamps(self):
        with patch.object(webhook_server.subprocess, "run", return_value=Mock(returncode=0)):
            webhook_server.handle_issue_closed(8, "first-close")
            webhook_server.handle_issue_closed(8, "second-close")
        self.assertEqual(self.read()["tasks"][0]["closed_at"], "first-close")

    def test_cleanup_still_runs_without_a_roadmap(self):
        self.path.unlink()
        with patch.object(webhook_server.subprocess, "run", return_value=Mock(returncode=0)) as run:
            webhook_server.handle_issue_closed(8)
        run.assert_called_once()

    def test_polling_api_failure_keeps_existing_state(self):
        unchanged = copy.deepcopy(self.data)
        with patch.object(issue_bot, "run_cmd", return_value=(1, "offline")):
            self.assertFalse(issue_bot.sync_closed_issues(self.data))
        self.assertEqual(self.data, unchanged)

    def test_close_during_agent_execution_stops_failover_and_completion_reporting(self):
        data = {"tasks": [task("T-ISSUE-8")], "current_task_id": None}
        self.path.write_text(json.dumps(data))

        def execute(*args, **kwargs):
            roadmap_store.update_roadmap(self.path, lambda roadmap: mark_issue_closed(roadmap, 8))
            return -1, "timed out"

        with patch.object(orchestrator, "check_resources", side_effect=[None, RuntimeError("stop loop")]), \
                patch.object(orchestrator, "reconcile_issue_before_dispatch", return_value=True), \
                patch.object(orchestrator, "execute_agent_task", side_effect=execute) as agent, \
                patch.object(orchestrator, "run_cmd", return_value=(0, "")) as run:
            with self.assertRaisesRegex(RuntimeError, "stop loop"):
                orchestrator.run_loop()
        agent.assert_called_once()
        self.assertEqual(run.call_count, 2)  # Start label and verification only.
        self.assertIsNone(self.read()["current_task_id"])
        self.assertEqual(self.read()["tasks"][0]["status"], "completed")


if __name__ == "__main__":
    unittest.main()
