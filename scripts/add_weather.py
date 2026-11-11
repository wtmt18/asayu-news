#!/usr/bin/env python3
"""Update the 朝夕 app's 天気 tab (全国の天気) — encrypted.

usage: ASAYU_PASSCODE=... python3 scripts/add_weather.py <weather.json>
Writes data/weather/latest.json (encrypted). Does NOT notify.

weather.json:
{"date":"YYYY-MM-DD","at":"12日昼","source":"ウェザーニュース","summary":"全国の概況（自分の言葉で）",
 "days":["12木","13金",...],                       # 列の見出し（最大5）
 "regions":[{"name":"北海道","cities":[
    {"name":"札幌","area":"北海道札幌市","url":"https://weathernews.jp/...",
     "telop":"くもり時々晴れ","icon":"⛅",          # 任意（ページに書かれている時だけ）
     "d":[[最高,最低,降水確率%],...]}]}]}          # days と同じ順。不明な日は null
"""
import json, sys
from asayu_crypto import ROOT, write_enc

d = json.load(open(sys.argv[1], encoding="utf-8"))
for k in ("date", "days", "regions", "at"):
    if k not in d:
        sys.exit(f"missing {k}")
if not 1 <= len(d["days"]) <= 5:
    sys.exit("days must have 1-5 entries")
n = 0
for r in d["regions"]:
    if not r.get("name") or not r.get("cities"):
        sys.exit(f"bad region {r.get('name')}")
    for c in r["cities"]:
        for k in ("name", "area", "url", "d"):
            if k not in c:
                sys.exit(f"{c.get('name')}: missing {k}")
        if not c["url"].startswith("https://weathernews.jp/"):
            sys.exit(f"{c['name']}: url must be weathernews.jp")
        if len(c["d"]) > len(d["days"]):
            sys.exit(f"{c['name']}: more values than days")
        for x in c["d"]:
            if x is not None and (len(x) != 3 or not all(isinstance(v, int) for v in x)):
                sys.exit(f"{c['name']}: each day must be [max,min,pop] ints or null")
        n += 1
(ROOT / "data/weather").mkdir(parents=True, exist_ok=True)
write_enc(ROOT / "data/weather/latest.json", d)
print(f"ok: weather {d['date']} {d['at']} — {len(d['regions'])} regions, {n} cities")
