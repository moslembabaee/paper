import unittest

from make_queue import predecessor_ready, next_held_issue

class MakeQueueTest(unittest.TestCase):
    def setUp(self):
        self.ids = [18, 19, 20]
        self.held = lambda n: {"number": n, "state": "OPEN", "labels": [{"name": "manual"}]}

    def test_first_issue_requires_closed_baseline_and_green_ci(self):
        self.assertFalse(predecessor_ready({"state":"OPEN"}, [], "success"))
        self.assertFalse(predecessor_ready({"state":"CLOSED"}, [{"status":"completed","completed_at":"a","closed_at":"b"}], "failure"))
        self.assertTrue(predecessor_ready({"state":"CLOSED"}, [{"status":"completed","completed_at":"a","closed_at":"b"}], "success"))

    def test_manual_close_does_not_pass(self):
        self.assertFalse(predecessor_ready({"state":"CLOSED"}, [{"status":"completed","completed_at":"same","closed_at":"same"}], "success"))
        self.assertFalse(predecessor_ready({"state":"CLOSED"}, [], "success"))

    def test_only_earliest_held_issue_is_considered(self):
        issues = [self.held(18), self.held(19), self.held(20)]
        self.assertEqual(next_held_issue(self.ids, issues), 18)
        issues[0] = {"number":18,"state":"OPEN","labels":[{"name":"approved"}]}
        self.assertIsNone(next_held_issue(self.ids, issues))
        issues[0]["state"] = "CLOSED"
        self.assertEqual(next_held_issue(self.ids, issues), 19)

    def test_reopened_previous_blocks_next(self):
        issues = [self.held(18), self.held(19), self.held(20)]
        issues[0] = {"number":18,"state":"OPEN","labels":[{"name":"triaged"}]}
        self.assertIsNone(next_held_issue(self.ids, issues))

if __name__ == '__main__': unittest.main()
