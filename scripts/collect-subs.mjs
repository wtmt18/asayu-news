// Collects new push subscriptions posted by the app to the private ntfy topic,
// merges them into push/subscriptions.json, and sends each new device a welcome notification.
import fs from 'node:fs';
import webpush from 'web-push';

const cfg = fs.readFileSync('config.js', 'utf8');
const pub = (cfg.match(/vapidPublicKey:\s*"([^"]+)"/) || [])[1];
const topic = (cfg.match(/regTopic:\s*"([^"]+)"/) || [])[1];
const priv = process.env.VAPID_PRIVATE_KEY;
if (!pub || !priv || !topic) { console.error('missing config/secret'); process.exit(1); }
webpush.setVapidDetails(`https://${process.env.GITHUB_REPOSITORY_OWNER || 'asayu'}.github.io`, pub, priv);

const ALLOWED = [/\.push\.apple\.com$/, /^fcm\.googleapis\.com$/, /\.googleapis\.com$/, /\.mozilla\.com$/, /\.notify\.windows\.com$/];
const valid = s => {
  try {
    const u = new URL(s.endpoint);
    return u.protocol === 'https:' && ALLOWED.some(r => r.test(u.hostname)) && s.keys && s.keys.p256dh && s.keys.auth;
  } catch { return false; }
};
const decode = s => typeof s === 'string' ? JSON.parse(Buffer.from(s.trim(), 'base64').toString('utf8')) : s;

const path = 'push/subscriptions.json';
const subs = JSON.parse(fs.readFileSync(path, 'utf8')).map(decode).filter(Boolean);
const known = new Set(subs.map(s => s.endpoint));

const res = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}/json?poll=1&since=all`);
const lines = (await res.text()).split('\n').filter(Boolean);
const fresh = [];
// encrypted "my areas" registrations: kept opaque in data/inbox.json for Claude to decrypt
const inboxPath = 'data/inbox.json';
const inbox = fs.existsSync(inboxPath) ? JSON.parse(fs.readFileSync(inboxPath, 'utf8')) : [];
const seenCt = new Set(inbox.map(b => b.ct));
let inboxAdded = 0;
for (const line of lines) {
  let m; try { m = JSON.parse(line); } catch { continue; }
  if (m.event !== 'message' || !m.message) continue;
  let s; try { s = JSON.parse(m.message); } catch { continue; }
  if (s && s.v === 1 && typeof s.iv === 'string' && typeof s.ct === 'string' && s.ct.length < 4000) {
    if (!seenCt.has(s.ct)) { seenCt.add(s.ct); inbox.push({ v: 1, iv: s.iv, ct: s.ct, t: m.time }); inboxAdded++; }
    continue;
  }
  if (!valid(s) || known.has(s.endpoint)) continue;
  known.add(s.endpoint);
  fresh.push({ endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } });
}
if (inboxAdded) { fs.writeFileSync(inboxPath, JSON.stringify(inbox.slice(-200))); console.log(`inbox +${inboxAdded}`); }
if (!fresh.length) { console.log('no new subscriptions'); process.exit(0); }

const all = [...subs, ...fresh].slice(-60);
fs.writeFileSync(path, JSON.stringify(all, null, 1));
const welcome = JSON.stringify({ title: '朝夕', body: '通知の登録ができました。朝8時と夕方6時ごろに新しい号をお知らせします。', hash: '', tag: 'asayu-welcome' });
for (const s of fresh) {
  try { await webpush.sendNotification(s, welcome, { TTL: 3600 }); } catch (e) { console.warn('welcome failed', e.statusCode); }
}
console.log(`added ${fresh.length}, total ${all.length}`);
