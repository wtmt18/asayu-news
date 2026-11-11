(() => {
'use strict';
const C = window.ASAYU_CONFIG || {};
const $view = document.getElementById('view');
const WD = ['日','月','火','水','木','金','土'];

let index = null;              // [{id,date,edition,title,lead,createdAt,headlines:[{s,h}]}], newest first
const cache = new Map();       // id -> full edition
let filter = 'all';
let query = '';

// ---------- helpers ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl = u => /^https?:\/\//i.test(u || '') ? u : '#';
const store = {
  get(k, d){ try{ const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
};
const readSet = new Set(store.get('read', []));
const markRead = id => { if(!readSet.has(id)){ readSet.add(id); store.set('read', [...readSet].slice(-400)); } };

// ---------- family passcode (AES-GCM) ----------
let KEY = null;
const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const b64e = u8 => btoa(String.fromCharCode(...new Uint8Array(u8)));
async function deriveKey(pc){
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pc), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name: 'PBKDF2', salt: b64d(C.salt), iterations: 310000, hash: 'SHA-256'},
    base, {name: 'AES-GCM', length: 256}, true, ['encrypt', 'decrypt']);
}
async function restoreKey(){
  const raw = store.get('k', null);
  if(!raw) return null;
  try{ return await crypto.subtle.importKey('raw', b64d(raw), {name: 'AES-GCM'}, true, ['encrypt', 'decrypt']); }catch(e){ return null; }
}
async function encryptWith(k, obj){
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({name: 'AES-GCM', iv}, k, new TextEncoder().encode(JSON.stringify(obj)));
  return {v: 1, iv: b64e(iv), ct: b64e(ct)};
}
async function decryptWith(k, d){
  const pt = await crypto.subtle.decrypt({name: 'AES-GCM', iv: b64d(d.iv)}, k, b64d(d.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}
const isPM = e => e.edition === '夕刊';
const kind = e => e.edition === '朝刊' ? 'am' : e.edition === '夕刊' ? 'pm' : 'other';
const kanji = e => e.edition === '夕刊' ? '夕' : e.edition === '朝刊' ? '朝' : '初';

function jstToday(offsetDays = 0){
  return new Date(Date.now() + 9*3600e3 - offsetDays*864e5).toISOString().slice(0,10);
}
function dateLabel(ds, withRel = true){
  const d = new Date(ds + 'T12:00:00Z');
  if(isNaN(d)) return ds || '';
  const base = `${d.getUTCMonth()+1}月${d.getUTCDate()}日 ${WD[d.getUTCDay()]}曜日`;
  if(!withRel) return base;
  if(ds === jstToday()) return '今日　' + base;
  if(ds === jstToday(1)) return '昨日　' + base;
  return base;
}

function safeSvg(str){
  if(!str || typeof str !== 'string') return '';
  try{
    const doc = new DOMParser().parseFromString(str, 'text/html');
    const svg = doc.querySelector('svg');
    if(!svg) return '';
    svg.querySelectorAll('script,foreignObject,iframe,image,use,a').forEach(n => n.remove());
    for(const el of [svg, ...svg.querySelectorAll('*')]){
      for(const a of [...el.attributes]){
        const n = a.name.toLowerCase();
        if(n.startsWith('on') || ((n === 'href' || n === 'xlink:href') && !a.value.startsWith('#'))) el.removeAttribute(a.name);
      }
    }
    svg.removeAttribute('width'); svg.removeAttribute('height');
    return svg.outerHTML;
  }catch(e){ return ''; }
}

async function getJSON(url){
  const r = await fetch(url, {cache: 'no-cache'});
  if(!r.ok) throw new Error(r.status);
  return r.json();
}
async function loadIndex(){
  if(index) return index;
  index = await decryptWith(KEY, await getJSON('data/index.json'));
  index.sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return index;
}
async function loadEdition(id){
  if(cache.has(id)) return cache.get(id);
  const e = await decryptWith(KEY, await getJSON('data/editions/' + encodeURIComponent(id) + '.json'));
  e.id = id;
  cache.set(id, e);
  return e;
}

function setTab(name){
  document.querySelectorAll('.tabs a').forEach(a => {
    if(a.dataset.tab === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}
function failView(msg){
  $view.innerHTML = `<p class="empty">${esc(msg)}</p>`;
}

// ---------- views ----------
let firstPaint = true;
async function viewHome(){
  setTab('home');
  const list = await loadIndex();
  if(!list.length){
    $view.innerHTML = `<h1 class="plain-h">朝夕</h1><p class="empty">最初の号は、次の 8:00 か 18:00 に届きます。</p>`;
    return;
  }
  const latest = list[0];
  const rest = list.slice(1);
  const k = kind(latest);
  let html = `<header class="sky ${k === 'pm' ? 'pm' : ''} ${firstPaint ? 'reveal' : ''}">
      <div class="sun"></div><div class="kanji" aria-hidden="true">${kanji(latest)}</div>
      <div class="when">${esc(dateLabel(latest.date))}　${esc(latest.edition)}</div>
      <h1>${esc(latest.headlines?.[0]?.h || latest.title)}</h1>
      <p class="lead">${esc(latest.lead || '')}</p>
      <a class="open" href="#e-${esc(latest.id)}">この号を読む</a>
    </header>
    <nav class="contents" aria-label="この号の記事">
      ${(latest.headlines || []).slice(1).map((x, i) =>
        `<a href="#e-${esc(latest.id)}-${i+1}"><i class="mark ${x.s === 'sci' ? 'sci' : x.s === 'local' ? 'local' : ''}"></i><span class="t">${esc(x.h)}</span></a>`).join('')}
    </nav>`;
  firstPaint = false;
  markRead(latest.id);
  if(rest.length){
    html += `<h2 class="section-h">バックナンバー<small>${rest.length}号</small></h2>`;
    let last = '';
    for(const e of rest){
      if(e.date !== last){ html += `<div class="day">${esc(dateLabel(e.date))}</div>`; last = e.date; }
      html += `<a class="issue" href="#e-${esc(e.id)}">
        <span class="k ${kind(e)}">${kanji(e)}</span>
        <span><span class="h">${esc(e.headlines?.[0]?.h || e.title)}</span><span class="m">${esc(e.edition)}・${(e.headlines||[]).length}本</span></span>
        <span class="dot ${readSet.has(e.id) ? 'read' : ''}" aria-label="${readSet.has(e.id) ? '' : '未読'}"></span>
      </a>`;
    }
  }
  html += `<p class="foot">毎日 8:00 と 18:00 に届きます</p>`;
  $view.innerHTML = html;
  window.scrollTo(0, 0);
}

function story(it, i){
  const cls = it.section === 'sci' ? 'sci' : it.section === 'local' ? 'local' : 'must';
  const srcs = (it.sources || []).map(s => `<a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener">${esc(s.label || '元記事')}</a>`).join('、');
  const point = String(it.point || '').replace(/^\s*(💡|🤓)\s*/, '');
  const icon = (it.point || '').trim().startsWith('🤓') || cls === 'sci' ? '🤓' : '💡';
  return `<article class="story ${cls}" id="s-${i}">
    ${it.svg ? `<div class="ill">${safeSvg(it.svg)}</div>` : ''}
    <div class="tag">${esc(it.tag)}</div>
    <h2>${esc(it.headline)}</h2>
    <p class="sum">${esc(it.summary)}</p>
    ${point ? `<p class="point"><span aria-hidden="true">${icon}</span><span>${esc(point)}</span></p>` : ''}
    ${srcs ? `<div class="src">出典：${srcs}</div>` : ''}
  </article>`;
}


function wxCard(w){
  const pops = (w.pops || []).map(x => `<span class="wx-pop"><i>${esc(x.t)}</i>${esc(x.p)}</span>`).join('');
  const temp = (w.max != null || w.min != null) ? `<span class="wx-t"><b class="hi">${esc(w.max ?? '-')}℃</b><span class="lo">${esc(w.min ?? '-')}℃</span></span>` : '';
  return `<div class="wx-card">
    <div class="wx-top"><span class="wx-ic" aria-hidden="true">${esc(w.icon || '🌤️')}</span>
      <div class="wx-main"><b class="wx-area">${esc(w.area)}</b><span class="wx-tel">${esc(w.telop || '')}</span></div>${temp}</div>
    ${pops ? `<div class="wx-pops"><span class="wx-pl">降水確率</span>${pops}</div>` : ''}
    ${w.comment ? `<p class="wx-c">${esc(w.comment)}</p>` : ''}
    ${w.url ? `<a class="wx-src" href="${esc(w.url)}" target="_blank" rel="noopener">ウェザーニュースで見る ›</a>` : ''}
  </div>`;
}
function weatherBlock(wx){
  if(!wx || !(wx.areas || []).length) return '';
  const mine = myAreas();
  const first = mine.length ? wx.areas.filter(w => mine.includes(w.area)) : wx.areas;
  const rest = mine.length ? wx.areas.filter(w => !mine.includes(w.area)) : [];
  let h = `<section class="wx"><h2 class="group wxh">${esc(wx.day || '')}の天気</h2>`;
  if(mine.length && !first.length) h += `<p class="area-none">登録した地域（${esc(mine.join('、'))}）の天気は、次の号から届きます。</p>`;
  h += `<div class="wx-grid">${first.map(wxCard).join('')}</div>`;
  if(rest.length) h += `<details class="others"><summary>ほかの地域の天気（${rest.length}地域）</summary><div class="wx-grid">${rest.map(wxCard).join('')}</div></details>`;
  h += `<p class="wx-note">出典：${esc(wx.source || 'ウェザーニュース')}${wx.at ? '（' + esc(wx.at) + '時点）' : ''}</p></section>`;
  return h;
}

async function viewEdition(id, focus){
  setTab('home');
  let e;
  try{ e = await loadEdition(id); }catch(err){ failView('この号を読み込めませんでした。電波のよい場所で開き直してください。'); return; }
  markRead(id);
  const items = (e.items || []).map((it, i) => ({...it, _i: i}));
  const must = items.filter(x => x.section === 'must' || !x.section), sci = items.filter(x => x.section === 'sci'), loc = items.filter(x => x.section === 'local');
  const k = kind(e);
  let html = `<header class="sky mini ${k === 'pm' ? 'pm' : ''}">
      <div class="kanji" aria-hidden="true">${kanji(e)}</div>
      <a class="back" href="#"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>ホーム</a>
      <div class="when">${esc(dateLabel(e.date))}　${esc(e.edition)}</div>
      <h1>${esc(e.lead || e.title || '')}</h1>
    </header>
    <div class="seg" role="group" aria-label="記事の絞り込み">
      <button data-f="all" aria-pressed="${filter==='all'}">すべて ${items.length}</button>
      <button data-f="must" aria-pressed="${filter==='must'}">これだけは ${must.length}</button>
      ${loc.length ? `<button data-f="local" aria-pressed="${filter==='local'}">地元 ${loc.length}</button>` : ''}
      <button data-f="sci" aria-pressed="${filter==='sci'}">学術 ${sci.length}</button>
    </div>`;
  const show = f => filter === 'all' || filter === f;
  if(filter === 'all' || filter === 'local') html += weatherBlock(e.weather);
  if(show('must') && must.length) html += `<h2 class="group must">これだけは押さえておく</h2>` + must.map(x => story(x, x._i)).join('');
  if(show('local') && loc.length){
    html += `<h2 class="group local">地元のニュース</h2>`;
    const mine = myAreas();
    const areas = [...new Set(loc.map(x => x.area || 'その他'))];
    const first = mine.length ? areas.filter(a => mine.includes(a)) : areas;
    const rest = mine.length ? areas.filter(a => !mine.includes(a)) : [];
    if(mine.length && !first.length) html += `<p class="area-none">登録した地域（${esc(mine.join('、'))}）のニュースは、次の号から届きます。</p>`;
    if(!mine.length) html += `<p class="area-none">「設定」タブで地元を登録すると、その地域のニュースが先頭に表示されます。</p>`;
    for(const a of first) html += `<h3 class="area-h">📍 ${esc(a)}</h3>` + loc.filter(x => (x.area || 'その他') === a).map(x => story(x, x._i)).join('');
    if(rest.length){
      html += `<details class="others"><summary>ほかの地域のニュース（${rest.length}地域）</summary>`;
      for(const a of rest) html += `<h3 class="area-h">📍 ${esc(a)}</h3>` + loc.filter(x => (x.area || 'その他') === a).map(x => story(x, x._i)).join('');
      html += `</details>`;
    }
  }
  if(show('sci') && sci.length) html += `<h2 class="group sci">学術のおもろいやつ</h2>` + sci.map(x => story(x, x._i)).join('');
  html += `<p class="foot">図はClaudeが描いたイメージです。写真は出典先でどうぞ。</p>`;
  $view.innerHTML = html;
  $view.querySelectorAll('.seg button').forEach(b => b.onclick = () => { filter = b.dataset.f; viewEdition(id); });
  if(focus != null){
    const el = document.getElementById('s-' + focus);
    if(el){ requestAnimationFrame(() => el.scrollIntoView({block: 'start'})); return; }
  }
  window.scrollTo(0, 0);
}

async function viewSearch(){
  setTab('search');
  const list = await loadIndex();
  $view.innerHTML = `<h1 class="plain-h">さがす</h1>
    <p class="plain-p">これまでの見出しから探せます。</p>
    <input class="field" id="q" type="search" placeholder="例：半導体、宇宙、日経平均" value="${esc(query)}" autocomplete="off">
    <div id="hits"></div>`;
  const $q = document.getElementById('q'), $h = document.getElementById('hits');
  const run = () => {
    query = $q.value;
    const qq = query.trim().toLowerCase();
    if(!qq){ $h.innerHTML = ''; return; }
    const hits = [];
    for(const e of list) (e.headlines || []).forEach((x, i) => { if(x.h.toLowerCase().includes(qq)) hits.push({e, x, i}); });
    $h.innerHTML = hits.length
      ? hits.slice(0, 100).map(({e, x, i}) => `<a class="hit" href="#e-${esc(e.id)}-${i}"><small>${esc(dateLabel(e.date, false))}　${esc(e.edition)}</small>${esc(x.h)}</a>`).join('')
      : `<p class="empty">「${esc(query)}」を含む見出しはありません。</p>`;
  };
  $q.oninput = run; run();
}


// ---------- market ----------
let mIndex = null;
const mCache = new Map();
async function loadMIndex(){
  if(mIndex) return mIndex;
  try{ mIndex = await decryptWith(KEY, await getJSON('data/market/index.json')); }
  catch(e){ if(e && e.name === 'OperationError') throw e; mIndex = []; }
  mIndex.sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return mIndex;
}
async function loadMarket(id){
  if(mCache.has(id)) return mCache.get(id);
  const m = await decryptWith(KEY, await getJSON('data/market/' + encodeURIComponent(id) + '.json'));
  m.id = id; mCache.set(id, m); return m;
}
const flag = mk => mk === 'US' ? '🇺🇸' : '🇯🇵';

function pickCard(p){
  const srcs = (p.sources || []).map(s => `<a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener">${esc(s.label || '出典')}</a>`).join('、');
  return `<article class="pick">
    <header><span class="tk ${p.market === 'US' ? 'us' : 'jp'}">${flag(p.market)} ${esc(p.ticker)}</span><h4>${esc(p.name)}</h4></header>
    <p class="biz">${esc(p.biz)}</p>
    <dl>
      <dt class="up">伸びるかもしれない理由</dt><dd>${esc(p.why)}</dd>
      <dt class="dn">気をつけたいこと</dt><dd>${esc(p.risk)}</dd>
      <dt>次に見るポイント</dt><dd>${esc(p.watch)}</dd>
    </dl>
    ${srcs ? `<div class="src">出典：${srcs}</div>` : ''}
  </article>`;
}

async function viewMarket(id){
  setTab('market');
  const list = await loadMIndex();
  if(!list.length){
    $view.innerHTML = `<h1 class="plain-h">マーケット</h1><p class="empty">最初のマーケット情報は、次の 8:00 か 18:00 に届きます。</p>`;
    return;
  }
  const mid = id && list.some(x => x.id === id) ? id : list[0].id;
  let m;
  try{ m = await loadMarket(mid); }catch(err){ if(err && err.name === 'OperationError') throw err; failView('マーケット情報を読み込めませんでした。'); return; }
  const isLatest = mid === list[0].id;
  let html = `<header class="sky mkt">
      <div class="kanji" aria-hidden="true">株</div>
      ${isLatest ? '' : `<a class="back" href="#market"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>最新へ</a>`}
      <div class="when">${esc(dateLabel(m.date))}　${esc(m.edition)}のマーケット</div>
      <h1>${esc(m.headline)}</h1>
      <p class="lead">売買のおすすめではなく、調べる価値がある会社のメモです。</p>
    </header>
    <section class="mk-sec">
      <h2 class="mk-h">いまの経済の流れ</h2>
      ${m.flow.svg ? `<div class="ill flow">${safeSvg(m.flow.svg)}</div>` : ''}
      <p class="mk-sum">${esc(m.flow.summary)}</p>
      <ul class="flowpts">${(m.flow.points || []).map(pt => `<li><span class="ic" aria-hidden="true">${esc(pt.icon)}</span><div><b>${esc(pt.title)}</b><p>${esc(pt.text)}</p></div></li>`).join('')}</ul>
    </section>`;
  if((m.numbers || []).length){
    html += `<section class="mk-sec"><h2 class="mk-h">数字で見る</h2><div class="nums">${m.numbers.map(n =>
      `<div class="num"><span class="nl">${esc(n.label)}</span><span class="nv">${esc(n.value)}</span><span class="nn">${esc(n.note || '')}</span><span class="ns">${esc(n.src || '')}</span></div>`).join('')}</div></section>`;
  }
  html += `<h2 class="mk-h big">テーマと注目の会社</h2>`;
  (m.themes || []).forEach((th, i) => {
    html += `<section class="theme" id="t-${i}">
      <h3>${esc(th.name)}</h3>
      <p class="stage"><span>いまの段階</span>${esc(th.stage)}</p>
      ${th.svg ? `<div class="ill">${safeSvg(th.svg)}</div>` : ''}
      <p class="mk-sum">${esc(th.why)}</p>
      ${th.leaders ? `<p class="leaders"><span>すでに上がった主役</span>${esc(th.leaders)}</p>` : ''}
      <div class="picks">${(th.picks || []).map(pickCard).join('')}</div>
    </section>`;
  });
  html += `<section class="caution"><h3>大事なおことわり</h3><p>${esc(m.caution)}</p></section>`;
  const others = list.filter(x => x.id !== mid);
  if(others.length){
    html += `<h2 class="section-h">これまでのマーケット<small>${others.length}回</small></h2>`;
    html += others.slice(0, 30).map(x => `<a class="issue" href="#m-${esc(x.id)}">
      <span class="k mk">株</span>
      <span><span class="h">${esc(x.headline)}</span><span class="m">${esc(dateLabel(x.date, false))}・${esc(x.edition)}・${x.picks || 0}社</span></span><span></span></a>`).join('');
  }
  $view.innerHTML = html;
  window.scrollTo(0, 0);
}


// ---------- my local areas ----------
const PREFS = ['北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県'];
const myAreas = () => store.get('myAreas', []);
async function sendAreas(force){
  const areas = myAreas();
  if(!areas.length || !KEY || !C.regTopic) return;
  const last = store.get('areasSentAt', 0);
  if(!force && Date.now() - last < 6 * 864e5) return;
  const blob = await encryptWith(KEY, {type: 'areas', areas, at: new Date().toISOString()});
  const r = await withTimeout(fetch('https://ntfy.sh/' + encodeURIComponent(C.regTopic), {method: 'POST', body: JSON.stringify(blob)}), 10000);
  if(!r.ok) throw new Error('areas ' + r.status);
  store.set('areasSentAt', Date.now());
}
function areaPanel(){
  const areas = myAreas();
  return `<section class="panel" id="ap"><h3>わたしの地元</h3>
    <p>登録した地域のニュースが「地元」に優先して表示されます。新しく登録した地域は、次の号から届きます（最大3つ）。</p>
    <ul class="areas">${areas.map((a, i) => `<li><span>📍 ${esc(a)}</span><button class="x" data-i="${i}" aria-label="${esc(a)}を削除">削除</button></li>`).join('') || '<li class="none">まだ登録されていません</li>'}</ul>
    ${areas.length < 3 ? `<div class="area-form"><select id="pref" aria-label="都道府県"><option value="">都道府県</option>${PREFS.map(p => `<option>${p}</option>`).join('')}</select>
      <input id="muni" type="text" placeholder="市区町村（例：長岡市）" aria-label="市区町村"><button class="btn" id="addArea">登録</button></div>` : ''}
    <div class="status" id="ast"></div></section>`;
}
function bindAreaPanel(){
  const $ast = document.getElementById('ast');
  const save = async (areas, msg) => {
    store.set('myAreas', areas);
    try{ await sendAreas(true); viewNotify().then(() => { const s = document.getElementById('ast'); if(s){ s.className = 'status ok'; s.textContent = msg; } }); }
    catch(e){ viewNotify().then(() => { const s = document.getElementById('ast'); if(s){ s.className = 'status ng'; s.textContent = '保存しましたが、送信できませんでした。電波のよい場所で開き直すと自動で再送します。'; } }); store.set('areasSentAt', 0); }
  };
  const add = document.getElementById('addArea');
  if(add) add.onclick = () => {
    const pref = document.getElementById('pref').value;
    const muni = document.getElementById('muni').value.trim().replace(/\s+/g, '');
    if(!pref || !muni){ $ast.className = 'status ng'; $ast.textContent = '都道府県と市区町村を入れてください。'; return; }
    if(!/[市区町村]$/.test(muni)){ $ast.className = 'status ng'; $ast.textContent = '市区町村は「長岡市」「文京区」「東浦町」のように最後まで入れてください。'; return; }
    const name = pref + muni;
    const areas = myAreas();
    if(areas.includes(name)){ $ast.className = 'status'; $ast.textContent = 'すでに登録されています。'; return; }
    add.disabled = true;
    save([...areas, name].slice(0, 3), `「${name}」を登録しました。次の号から地元ニュースが届きます。`);
  };
  document.querySelectorAll('#ap .x').forEach(b => b.onclick = () => {
    const areas = myAreas(); areas.splice(+b.dataset.i, 1);
    save(areas, '削除しました。');
  });
}

// ---------- notifications ----------
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const isStandalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
function b64ToU8(b64){
  const pad = '='.repeat((4 - b64.length % 4) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}
function withTimeout(p, ms){
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}
async function swReady(){
  if(!('serviceWorker' in navigator)) throw new Error('sw');
  return withTimeout(navigator.serviceWorker.ready, 8000);
}
async function currentSub(){
  if(!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  const reg = await swReady();
  return reg.pushManager.getSubscription();
}
// 配信リストへの自動登録（ntfy.sh の非公開トピック経由。GitHub Actions が30分ごとに取り込む）
async function registerSub(sub){
  if(!C.regTopic) throw new Error('no topic');
  const body = JSON.stringify(sub.toJSON());
  const r = await withTimeout(fetch('https://ntfy.sh/' + encodeURIComponent(C.regTopic), {method: 'POST', body}), 10000);
  if(!r.ok) throw new Error('register ' + r.status);
  store.set('regEndpoint', sub.endpoint);
  store.set('regAt', new Date().toISOString());
}
async function ensureRegistered(){
  try{
    const sub = await currentSub();
    if(sub && store.get('regEndpoint', '') !== sub.endpoint) await registerSub(sub);
  }catch(e){}
}

async function viewNotify(){
  setTab('notify');
  let html = `<h1 class="plain-h">設定</h1><p class="plain-p">通知と、わたしの地元の設定です。</p>`;
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const area = areaPanel();
  const guide = `<section class="panel"><h3>はじめかたガイド</h3><p>家族に朝夕をすすめるときは、このガイドのリンクを送ってください。</p><a class="btn ghost" href="guide.html">ガイドをひらく</a></section>`;
  const lock = `<section class="panel"><h3>この端末からロックする</h3><p>合言葉の記憶を消します。次に開くときは合言葉の入力が必要になります。</p><button class="btn ghost" id="lock">ロックする</button></section>`;
  const bindLock = () => { const b = document.getElementById('lock'); if(b) b.onclick = () => { try{ localStorage.removeItem('k'); }catch(e){} KEY = null; index = null; mIndex = null; cache.clear(); mCache.clear(); location.hash = ''; route(); }; };
  if(isIOS && !isStandalone){
    html += `<section class="panel"><h3>ホーム画面のアイコンから開いてください</h3>
      <p>iPhoneでは、ホーム画面に追加した「朝夕」アイコンから開いたときだけ通知を設定できます。いまはSafariで開いています。</p>
      <ol><li>まだなら、Safariの共有メニューから「ホーム画面に追加」</li><li>ホーム画面の「朝夕」アイコンをタップ</li><li>下の「設定」タブを開く</li></ol></section>` + area + guide + lock;
    $view.innerHTML = html; bindLock(); bindAreaPanel(); return;
  }
  if(!supported){
    html += `<section class="panel"><h3>このブラウザは通知に対応していません</h3><p>iPhoneはiOS 16.4以降で、ホーム画面のアイコンから開いてください。AndroidはChromeで開いてください。</p></section>` + area + guide + lock;
    $view.innerHTML = html; bindLock(); bindAreaPanel(); return;
  }
  let sub = null, swErr = false;
  try{ sub = await currentSub(); }catch(e){ swErr = true; }
  const perm = Notification.permission;
  const reg = sub && store.get('regEndpoint', '') === sub.endpoint;
  let body;
  if(swErr){
    body = `<h3>準備に失敗しました</h3><p>アプリを一度閉じて、ホーム画面のアイコンから開き直してください。</p>`;
  }else if(sub && reg){
    body = `<h3>✅ 通知はオンです</h3><p>この端末は配信リストに登録済みです。30分ほどで「登録できました」という通知が届き、その後は新しい号ごとにお知らせします。</p>
      <button class="btn ghost" id="test">テスト通知を出す</button>`;
  }else if(sub){
    body = `<h3>あと少しです</h3><p>通知は許可されていますが、配信リストへの登録がまだです。</p><button class="btn" id="reg">登録する</button>`;
  }else if(perm === 'denied'){
    body = `<h3>通知がブロックされています</h3><p>iPhoneは「設定」→「通知」→「朝夕」で通知をオンにしてから、もう一度開いてください。Androidは、アドレスバーの鍵マーク →「通知」を許可にしてください。</p><button class="btn" id="on">もう一度ためす</button>`;
  }else{
    body = `<h3>通知をオンにする</h3><p>ボタンを押して、表示される確認で「許可」を選んでください。登録まで自動で行います。</p><button class="btn" id="on">通知をオンにする</button>`;
  }
  html += `<section class="panel" id="np">${body}<div class="status" id="st"></div></section>` + area + guide + lock;
  $view.innerHTML = html; bindLock(); bindAreaPanel();

  const $st = document.getElementById('st');
  const doRegister = async (s) => {
    $st.className = 'status'; $st.textContent = '配信リストに登録しています…';
    await registerSub(s);
    viewNotify();
  };
  const on = document.getElementById('on');
  if(on) on.onclick = async () => {
    on.disabled = true; $st.className = 'status'; $st.textContent = '設定しています…';
    try{
      const p = await Notification.requestPermission();
      if(p !== 'granted') throw new Error('通知が許可されませんでした。端末の設定で「朝夕」の通知を許可してください。');
      const r = await swReady();
      const s = (await r.pushManager.getSubscription()) || await r.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: b64ToU8(C.vapidPublicKey)});
      await doRegister(s);
    }catch(err){
      on.disabled = false; $st.className = 'status ng';
      $st.textContent = (err && err.message && !/^(timeout|register|sw)/.test(err.message)) ? err.message : '設定できませんでした。電波のよい場所で、アプリを開き直してもう一度ためしてください。';
    }
  };
  const regBtn = document.getElementById('reg');
  if(regBtn) regBtn.onclick = async () => {
    regBtn.disabled = true;
    try{ await doRegister(sub); }catch(e){ regBtn.disabled = false; $st.className = 'status ng'; $st.textContent = '登録できませんでした。電波のよい場所でもう一度ためしてください。'; }
  };
  const test = document.getElementById('test');
  if(test) test.onclick = async () => {
    const r = await swReady();
    await r.showNotification('朝夕', {body: 'テスト通知です。本番もこの形で届きます。', icon: 'icons/icon-192.png', badge: 'icons/badge-96.png'});
    $st.className = 'status ok'; $st.textContent = 'テスト通知を出しました。';
  };
}

// ---------- lock screen ----------
function viewLock(){
  document.body.classList.add('locked');
  const h = new Date(Date.now() + 9*3600e3).getUTCHours();
  const pm = h >= 12 || h < 4;
  $view.innerHTML = `<section class="sky lock ${pm ? 'pm' : ''} reveal">
      <div class="sun"></div><div class="kanji" aria-hidden="true">${pm ? '夕' : '朝'}</div>
      <div class="lock-in">
        <h1 class="lock-title">朝夕</h1>
        <p class="lead">家族のための、朝と夕方のニュース。</p>
        <form id="lf" autocomplete="off">
          <label for="pc">合言葉</label>
          <input id="pc" type="password" inputmode="text" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="家族から教わった合言葉" required>
          <button class="unlock" type="submit">ひらく</button>
          <p class="lock-msg" id="lm" role="alert"></p>
        </form>
        <p class="lock-note">一度ひらけば、この端末では次から入力しなくて大丈夫です。　<a href="guide.html" style="color:inherit">使い方ガイド</a></p>
      </div>
    </section>`;
  const f = document.getElementById('lf'), msg = document.getElementById('lm'), btn = f.querySelector('button');
  f.onsubmit = async ev => {
    ev.preventDefault();
    const pc = document.getElementById('pc').value.trim();
    if(!pc) return;
    btn.disabled = true; msg.textContent = 'たしかめています…';
    try{
      const k = await deriveKey(pc);
      const list = await decryptWith(k, await getJSON('data/index.json'));
      KEY = k; index = null;
      store.set('k', b64e(await crypto.subtle.exportKey('raw', k)));
      document.body.classList.remove('locked');
      route();
    }catch(err){
      btn.disabled = false;
      msg.textContent = (err && err.name === 'OperationError') ? '合言葉がちがいます。もう一度入力してください。' : 'ニュースを読み込めませんでした。電波のよい場所でもう一度ためしてください。';
    }
  };
}

// ---------- router ----------
async function route(){
  const h = decodeURIComponent(location.hash.replace(/^#/, ''));
  if(!KEY){ KEY = await restoreKey(); }
  if(!KEY){ return viewLock(); }
  document.body.classList.remove('locked');
  if(!window.__regChecked){ window.__regChecked = true; ensureRegistered(); sendAreas(false).catch(() => {}); }
  try{
    if(h === 'search') return await viewSearch();
    if(h === 'notify') return await viewNotify();
    if(h === 'market') return await viewMarket(null);
    if(h.startsWith('m-')) return await viewMarket(h.slice(2));
    const m = h.match(/^e-(\d{4}-\d{2}-\d{2}-[a-z]+)(?:-(\d+))?$/);
    if(m) return await viewEdition(m[1], m[2] != null ? +m[2] : null);
    if(h.startsWith('e-')) return await viewEdition(h.slice(2), null);
    filter = 'all';
    return await viewHome();
  }catch(err){
    if(err && err.name === 'OperationError'){ try{ localStorage.removeItem('k'); }catch(e){} KEY = null; index = null; return viewLock(); }
    failView('ニュースを読み込めませんでした。電波のよい場所で開き直してください。');
  }
}
window.addEventListener('hashchange', route);
route();

if('serviceWorker' in navigator){
  navigator.serviceWorker.register('sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('message', ev => {
    if(ev.data && ev.data.type === 'open' && ev.data.hash){ index = null; mIndex = null; location.hash = ev.data.hash; }
  });
}
document.addEventListener('visibilitychange', () => {
  if(document.visibilityState === 'visible' && (!location.hash || location.hash === '#market')){ index = null; mIndex = null; route(); }
});
})();
