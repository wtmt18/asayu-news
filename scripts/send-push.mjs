// Sends the "new issue" push notification to every registered device.
// Runs in GitHub Actions when data/latest.json changes.
import fs from 'node:fs';
import webpush from 'web-push';

const pub = (fs.readFileSync('config.js', 'utf8').match(/vapidPublicKey:\s*"([^"]+)"/) || [])[1];
const priv = process.env.VAPID_PRIVATE_KEY;
if (!pub || !priv) { console.error('VAPID keys missing (set the VAPID_PRIVATE_KEY secret)'); process.exit(1); }
const owner = process.env.GITHUB_REPOSITORY_OWNER || 'asayu';
webpush.setVapidDetails(`https://${owner}.github.io`, pub, priv);

const latest = JSON.parse(fs.readFileSync('data/latest.json', 'utf8'));
const label = latest.edition === '夕刊' ? '🌆 夕刊' : latest.edition === '朝刊' ? '🌅 朝刊' : '📰 新しい号';
const payload = JSON.stringify({
  title: `${label}が届きました`,
  body: `今回は${latest.count}本のニュース。タップして読む`,
  hash: `e-${latest.id}`,
  tag: latest.id,
});

const decode = s => typeof s === 'string' ? JSON.parse(Buffer.from(s.trim(), 'base64').toString('utf8')) : s;
const subs = JSON.parse(fs.readFileSync('push/subscriptions.json', 'utf8')).map(decode);
if (!subs.length) { console.log('no subscriptions yet'); process.exit(0); }

let ok = 0;
for (const s of subs) {
  try { await webpush.sendNotification(s, payload, { TTL: 6 * 3600, urgency: 'normal' }); ok++; }
  catch (e) { console.warn('failed:', e.statusCode, (s.endpoint || '').slice(0, 50)); }
}
console.log(`sent ${ok}/${subs.length}`);
