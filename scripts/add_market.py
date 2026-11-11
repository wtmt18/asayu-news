#!/usr/bin/env python3
"""Add (or replace) one market issue in the 朝夕 app's マーケット tab — encrypted.

usage: ASAYU_PASSCODE=... python3 scripts/add_market.py <market.json> <id>
  id: YYYY-MM-DD-am / YYYY-MM-DD-pm (same id as the news issue)
Writes data/market/<id>.json and updates data/market/index.json (both encrypted).
Does NOT touch data/latest.json (the news issue triggers the notification).
"""
import json, re, sys
from asayu_crypto import ROOT, write_enc, read_enc

src, mid = sys.argv[1], sys.argv[2]
if not re.fullmatch(r"\d{4}-\d{2}-\d{2}-[a-z]+", mid):
    sys.exit("bad id: " + mid)

d = json.load(open(src, encoding="utf-8"))
need = {"date", "edition", "title", "createdAt", "headline", "flow", "numbers", "themes", "caution"}
if need - d.keys():
    sys.exit(f"missing keys: {need - d.keys()}")
for k in ("summary", "points", "svg"):
    if k not in d["flow"]:
        sys.exit(f"flow missing {k}")
for i, t in enumerate(d["themes"]):
    for k in ("name", "why", "stage", "svg", "leaders", "picks"):
        if k not in t:
            sys.exit(f"theme {i} missing {k}")
    for j, p in enumerate(t["picks"]):
        for k in ("name", "ticker", "market", "biz", "why", "risk", "watch", "sources"):
            if k not in p:
                sys.exit(f"theme {i} pick {j} missing {k}")
        if p["market"] not in ("JP", "US"):
            sys.exit(f"theme {i} pick {j} market must be JP or US")

labels = " ".join(n.get("label", "") for n in d["numbers"])
for need_label in ("ダウ", "S&P", "VIX"):
    if need_label not in labels:
        sys.exit(f"numbers must include {need_label} (NYダウ・S&P500・VIX は毎号必須)")

(ROOT / "data/market").mkdir(parents=True, exist_ok=True)
write_enc(ROOT / f"data/market/{mid}.json", d)

idx = read_enc(ROOT / "data/market/index.json", default=[])
idx = [e for e in idx if e["id"] != mid]
idx.append({"id": mid, "date": d["date"], "edition": d["edition"], "createdAt": d["createdAt"],
            "headline": d["headline"], "picks": sum(len(t["picks"]) for t in d["themes"])})
idx.sort(key=lambda e: e["createdAt"], reverse=True)
write_enc(ROOT / "data/market/index.json", idx[:120])
print(f"ok: market {mid} ({len(d['themes'])} themes), index has {len(idx)} issues")
