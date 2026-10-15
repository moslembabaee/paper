#!/usr/bin/env python3
"""Release exactly one Paper Make issue after its predecessor passes all gates."""
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = 'moslembabaee/paper'


def labels(issue):
    return {item['name'] for item in issue['labels']}


def next_held_issue(numbers, issues):
    by_number = {issue['number']: issue for issue in issues}
    for number in numbers:
        issue = by_number.get(number)
        if issue is None:
            raise RuntimeError(f'Issue #{number} absent from issue list; do not skip it')
        if issue['state'] == 'CLOSED':
            continue
        if 'manual' in labels(issue):
            return number
        return None  # Released, reopened, or blocked: never jump ahead.
    return None


def predecessor_ready(issue, tasks, ci_conclusion):
    return (issue['state'] == 'CLOSED' and ci_conclusion == 'success'
            and bool(tasks) and all(
                task.get('status') == 'completed' and task.get('completed_at')
                and task.get('closed_at') and task['completed_at'] != task['closed_at']
                for task in tasks))


def gh(*args):
    result = subprocess.run(['gh', *args], capture_output=True, text=True, timeout=30)
    if result.returncode:
        raise RuntimeError('gh ' + ' '.join(args[:4]) + ': ' + result.stderr[:500])
    return result.stdout.strip()


def run():
    numbers = json.loads((ROOT / 'MAKE_ISSUES.json').read_text())['issue_numbers']
    # Keep the list bounded but include all 24 expected issues.
    issues = json.loads(gh('issue','list','--repo',REPO,'--state','all','--limit','100',
                           '--json','number,state,labels'))
    current = next_held_issue(numbers, issues)
    if current is None:
        return 'No releasable issue (one is active, reopened or all complete).'
    position = numbers.index(current)
    previous = numbers[position-1] if position else 17
    prev_issue = json.loads(gh('issue','view',str(previous),'--repo',REPO,'--json','state,labels'))
    roadmap = json.loads((ROOT / 'ROADMAP.json').read_text())
    tasks = [t for t in roadmap['tasks'] if t.get('github_issue_number') == previous]
    # Match a remote commit belonging to that exact issue; manual closure is not proof.
    commits = json.loads(gh('api',f'repos/{REPO}/commits?per_page=100'))
    matching = next((c['sha'] for c in commits
                     if re.search(rf'Issue #{previous}(?!\d)', c['commit']['message'])), None)
    ci_conclusion = None
    if matching:
        runs = json.loads(gh('run','list','--repo',REPO,'--workflow','CI',
                             '--commit',matching,'--limit','5','--json',
                             'status,conclusion,headSha'))
        if any(r['status'] == 'completed' and r['conclusion'] == 'success'
               and r['headSha'] == matching for r in runs):
            ci_conclusion = 'success'
    if not predecessor_ready(prev_issue, tasks, ci_conclusion):
        return f'Hold #{current}: predecessor #{previous} not closed + locally verified + green CI.'
    # Recheck the exact target immediately before the write.
    target = json.loads(gh('issue','view',str(current),'--repo',REPO,
                           '--json','state,labels'))
    if target['state'] != 'OPEN' or 'manual' not in labels(target):
        return f'Hold #{current}: target changed while checking.'
    gh('issue','edit',str(current),'--repo',REPO,
       '--remove-label','manual','--add-label','approved')
    after = json.loads(gh('issue','view',str(current),'--repo',REPO,
                          '--json','state,labels'))
    if after['state'] != 'OPEN' or 'manual' in labels(after) or 'approved' not in labels(after):
        raise RuntimeError(f'Issue #{current} release did not persist')
    return f'Released #{current} after verified #{previous}.'


if __name__ == '__main__':
    print(run())
