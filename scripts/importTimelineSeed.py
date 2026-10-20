"""Compile the supplied planning appendix, never create Todoist tasks."""
import json
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1]
text = (root / 'docs/builds/projects-timeline/SPEC.md').read_text(encoding='utf-8-sig')
projects = []
for name, ident, target in re.findall(r'\| ([^|]+) \| `([^`]+)` \| ([^|]+) \|', text.split('## Experience')[0]):
    projects.append(dict(id=ident, name=name.strip(), target='2026-10-24' if 'Spanish' in name else '2026-10-23' if not projects else '2026-10-31', fallback='2026-10-24' if not projects else None, priority=not projects, selected=True))
tasks, blocks = [], []
project = None
for line in text.split('## Appendix A')[1].split('## Appendix B')[0].splitlines():
    if line.startswith('### '):
        project = next(p for p in projects if p['name'] == line[4:].strip())
    match = re.match(r'\| (.*?)<br>`([^`]+)` \| (.*?) \| (.*?) \|', line)
    if not match:
        continue
    title, ident, schedule, estimate = match.groups()
    tasks.append(dict(id=ident, title=title, projectId=project['id'], grouping=schedule.startswith('Group')))
    for i, (day, start, end, kind) in enumerate(re.findall(r'(\d+) Oct (\d\d:\d\d)[–-](\d\d:\d\d) \(([^)]+)\)', schedule)):
        minutes = lambda t: int(t[:2])*60 + int(t[3:])
        blocks.append(dict(id=f'{ident}-{i}', taskId=ident, date=f'2026-10-{int(day):02}', start=start, end=end, kind=kind, activeMinutes=minutes(end)-minutes(start), note='Provisional: confirm booking / dependency' if kind == 'Visit' or title == 'Sell the car' else 'Readiness check; elapsed curing time is separate' if 'cure' in title or 'dry' in title else 'Draft estimate'))
for i, (day, start, end, note) in enumerate(re.findall(r'\| (\d+) Oct 2026 \| (\d\d:\d\d)[–-](\d\d:\d\d) \| ([^|]+) \|', text.split('## Appendix B')[1])):
    blocks.append(dict(id=f'buffer-{i}', date=f'2026-10-{day}', start=start, end=end, kind='Wait' if 'drying' in note else 'Buffer', activeMinutes=0, note=note.strip()))
assert len(projects) == 11 and len(tasks) == 78 and sum(not t['grouping'] for t in tasks) == 75
(root / 'src/timeline/seed.json').write_text(json.dumps(dict(projects=projects, tasks=tasks, blocks=blocks), indent=2, ensure_ascii=False)+'\n', encoding='utf-8')
print(f'Compiled {len(tasks)} existing task references and {len(blocks)} draft blocks.')
