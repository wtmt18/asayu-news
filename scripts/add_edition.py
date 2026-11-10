#!/usr/bin/env python3
"""Add (or replace) one issue in the 朝夕 app — encrypted with the family passcode.

usage: ASAYU_PASSCODE=... python3 scripts/add_edition.py <edition.json> <edition-id>
  edition-id: YYYY-MM-DD-am / YYYY-MM-DD-pm
Writes data/editions/<id>.json (encrypted), updates data/index.json (encrypted)
and data/latest.json (plain: id, edition, count only — no headlines).
Committing data/latest.json triggers the GitHub Action that sends the push notification.
"""
import json, re, sys
from asayu_crypto import ROOT, write_enc, read_enc

src, eid = sys.argv[1], sys.argv[2]
if not re.fullmatch(r"\d{4}-\d{2}-\d{2}-[a-z]+", eid):
    sys.exit("bad edition id: " + eid)

d = json.load(open(src, encoding="utf-8"))
missing = {"date", "edition", "title", "lead", "createdAt", "items"} - d.keys()
if missing:
    sys.exit(f"missing keys: {missing}")
for i, it in enumerate(d["items"]):
    for k in ("section", "tag", "headline", "summary", "point", "svg", "sources"):
        if k not in it:
            sys.exit(f"item {i} missing {k}")
    if it["section"] not in ("must", "sci"):
        sys.exit(f"item {i} bad section")
    if not str(it["svg"]).lstrip().startswith("<svg"):
        sys.exit(f"item {i} svg must start with <svg")

(ROOT / "data/editions").mkdir(parents=True, exist_ok=True)
write_enc(ROOT / f"data/editions/{eid}.json", d)

idx = read_enc(ROOT / "data/index.json", default=[])
idx = [e for e in idx if e["id"] != eid]
idx.append({
    "id": eid, "date": d["date"], "edition": d["edition"], "title": d["title"],
    "lead": d["lead"], "createdAt": d["createdAt"],
    "headlines": [{"s": it["section"], "h": it["headline"]} for it in d["items"]],
})
idx.sort(key=lambda e: e["createdAt"], reverse=True)
write_enc(ROOT / "data/index.json", idx)

(ROOT / "data/latest.json").write_text(json.dumps({
    "id": eid, "edition": d["edition"], "count": len(d["items"]), "createdAt": d["createdAt"],
}, ensure_ascii=False), encoding="utf-8")
print(f"ok: {eid} ({len(d['items'])} items, encrypted), index has {len(idx)} issues")
