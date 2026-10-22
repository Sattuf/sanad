"""يطبع ملخص MobSF ويفشل عند أي ملاحظة high أو warning لم تُقبل في accepted.json (العنوان ← السبب)."""
import json
import sys

scorecard = json.load(open(sys.argv[1], encoding="utf-8"))
accepted = json.load(open(sys.argv[2], encoding="utf-8"))

print(f"Security score: {scorecard.get('security_score')}  grade: {scorecard.get('grade', '-')}")
new = []
for level in ("high", "warning", "info", "secure", "hotspot"):
    for item in scorecard.get(level, []):
        title = item.get("title", "")
        mark = "accepted" if title in accepted else ("NEW" if level in ("high", "warning") else "")
        print(f"[{level}] {title}  {mark}".rstrip())
        if mark == "NEW":
            new.append(title)

if new:
    print(f"\n{len(new)} unaccepted high/warning finding(s). Fix them, or add the title to .mobsf/accepted.json with the reason.")
    sys.exit(1)
