#!/usr/bin/env python3
"""Decrypt "my areas" registrations from data/inbox.json and update data/areas.json (encrypted).

usage: ASAYU_PASSCODE=... python3 scripts/sync_areas.py
Prints the list of areas the next issue must cover (one per line).
Each device re-sends its areas about weekly; areas not seen for 45 days are dropped (pinned ones stay).
"""
import json, base64, datetime
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from asayu_crypto import ROOT, key, read_enc, write_enc

now = datetime.datetime.now(datetime.timezone.utc)
areas = read_enc(ROOT / "data/areas.json", default={"areas": {}})
reg = areas.setdefault("areas", {})
inbox_p = ROOT / "data/inbox.json"
inbox = json.loads(inbox_p.read_text(encoding="utf-8")) if inbox_p.exists() else []
for b in inbox:
    try:
        d = json.loads(AESGCM(key()).decrypt(base64.b64decode(b["iv"]), base64.b64decode(b["ct"]), None))
    except Exception:
        continue
    if d.get("type") != "areas":
        continue
    for a in d.get("areas", [])[:3]:
        a = str(a).strip()[:30]
        if not a:
            continue
        e = reg.setdefault(a, {"first": now.isoformat()})
        e["last"] = now.isoformat()
cutoff = now - datetime.timedelta(days=45)
for a in list(reg):
    e = reg[a]
    if e.get("pinned"):
        continue
    if datetime.datetime.fromisoformat(e.get("last", e.get("first"))) < cutoff:
        del reg[a]
write_enc(ROOT / "data/areas.json", areas)
if inbox:
    inbox_p.write_text("[]", encoding="utf-8")
for a in sorted(reg):
    print(a)
