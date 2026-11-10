"""Encrypt/decrypt 朝夕 data files with the family passcode.

Format: {"v":1,"iv":<base64>,"ct":<base64>}  (AES-256-GCM)
Key: PBKDF2-HMAC-SHA256(passcode, salt from config.js, 310000 iterations)
The passcode comes from the ASAYU_PASSCODE environment variable.
"""
import base64, json, os, re, secrets, pathlib
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

ROOT = pathlib.Path(__file__).resolve().parent.parent
ITER = 310000


def _salt():
    cfg = (ROOT / "config.js").read_text(encoding="utf-8")
    return base64.b64decode(re.search(r'salt:\s*"([^"]+)"', cfg).group(1))


def _key():
    pc = os.environ.get("ASAYU_PASSCODE")
    if not pc:
        raise SystemExit("ASAYU_PASSCODE is not set")
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=_salt(), iterations=ITER)
    return kdf.derive(pc.encode("utf-8"))


_K = None
def key():
    global _K
    if _K is None:
        _K = _key()
    return _K


def write_enc(path, obj):
    iv = secrets.token_bytes(12)
    ct = AESGCM(key()).encrypt(iv, json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), None)
    pathlib.Path(path).write_text(json.dumps({"v": 1, "iv": base64.b64encode(iv).decode(), "ct": base64.b64encode(ct).decode()}), encoding="utf-8")


def read_enc(path, default=None):
    p = pathlib.Path(path)
    if not p.exists():
        return default
    d = json.loads(p.read_text(encoding="utf-8"))
    pt = AESGCM(key()).decrypt(base64.b64decode(d["iv"]), base64.b64decode(d["ct"]), None)
    return json.loads(pt.decode("utf-8"))
