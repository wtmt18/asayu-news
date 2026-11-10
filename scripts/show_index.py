#!/usr/bin/env python3
"""Print recent issues' headlines (decrypted). usage: ASAYU_PASSCODE=... python3 scripts/show_index.py [N]"""
import sys
from asayu_crypto import ROOT, read_enc

n = int(sys.argv[1]) if len(sys.argv) > 1 else 2
for e in read_enc(ROOT / "data/index.json", default=[])[:n]:
    print(f"== {e['id']} {e['edition']} ({e['createdAt']})")
    for h in e["headlines"]:
        print(f"  [{h['s']}] {h['h']}")
