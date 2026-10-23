"""يطبع ملخص MobSF ويفشل عند أي ملاحظة high أو warning لم تُقبل في accepted.json (العنوان ← السبب).

الاستعمال: check.py <scorecard.json> <accepted.json> [report.json mapping.txt]
مع التقرير وملف R8 يطبع أيضاً الأصناف الأصلية خلف أسماء الكود المشوَّش (a/a.java ← المكتبة الحقيقية).
"""
import json
import sys

scorecard = json.load(open(sys.argv[1], encoding="utf-8"))
accepted = json.load(open(sys.argv[2], encoding="utf-8"))

print(f"Security score: {scorecard.get('security_score')}")
new = []
for level in ("high", "warning", "info", "secure", "hotspot"):
    for item in scorecard.get(level, []):
        title = item.get("title", "")
        mark = "accepted" if title in accepted else ("NEW" if level in ("high", "warning") else "")
        print(f"[{level}] {title}  {mark}".rstrip())
        if mark == "NEW":
            new.append(title)

if len(sys.argv) > 4:
    report = json.load(open(sys.argv[3], encoding="utf-8"))
    original = {}
    for line in open(sys.argv[4], encoding="utf-8"):
        if not line.startswith((" ", "#")) and " -> " in line:
            name, short = line.rstrip(":\n").split(" -> ")
            original[short.replace(".", "/") + ".java"] = name
    print("\nCode findings (obfuscated file -> original class):")
    findings = report.get("code_analysis", {}).get("findings", {})
    for rule, finding in findings.items():
        severity = finding.get("metadata", {}).get("severity")
        if severity in ("high", "warning"):
            print(f"[{severity}] {rule}")
            for path in finding.get("files", {}):
                print(f"    {path} -> {original.get(path, path)}")

if new:
    print(f"\n{len(new)} unaccepted high/warning finding(s). Fix them, or add the title to .mobsf/accepted.json with the reason.")
    sys.exit(1)
