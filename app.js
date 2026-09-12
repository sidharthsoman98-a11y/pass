/* Pass — a drag-level ledger.
   No backend, no accounts, no network. All state in localStorage under one key. */

const KEY = 'pass.v1';
const clone = o => JSON.parse(JSON.stringify(o));

const DEFAULTS = {
  version: 1,
  createdAt: new Date().toISOString(),
  demo: false,
  settings: { cap: 2, baselineDrags: 3, dragsPerCig: 10, pricePerCig: 13.5, refusalTarget: 1 },
  sessions: [], refusals: [], days: {}, trial: null
};

const TRIALS = [
  { id: 'cap2',    name: 'Cap shared drags at 2', why: 'The core mechanism. Invisible to the circle.' },
  { id: 'cap1',    name: 'Cap shared drags at 1', why: 'One drag and pass. Tests how far the cap can go.' },
  { id: 'nocarry', name: 'Carry nothing',         why: 'Kills solo cigarettes, which need possession.' },
  { id: 'gum',     name: 'Gum before every circle', why: 'Tests whether the craving or the ritual is pulling.' },
  { id: 'refuse3', name: 'Three refusals a day',  why: 'Builds the capability the cap never trains.' }
];

let storageOK = true;
let S = load();
let tab = 'now';
let backup = null;

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return clone(DEFAULTS);
    const parsed = JSON.parse(raw);
    return Object.assign(clone(DEFAULTS), parsed,
      { settings: Object.assign({}, DEFAULTS.settings, parsed.settings || {}) });
  } catch (e) { storageOK = false; return clone(DEFAULTS); }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (e) { storageOK = false; }
}
function commit() { save(); render(); }

/* ---- metrics stub: open the console during a demo and watch these fire ---- */
function track(event, props = {}) {
  console.log('%c[track]', 'color:#F0A93B;font-weight:700', event, props);
}

/* ---------------- helpers ---------------- */
const pad = n => String(n).padStart(2, '0');
const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => dayKey(new Date());
const hhmm = iso => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const rupee = n => '₹' + Math.round(n).toLocaleString('en-IN');
const active = () => S.sessions.find(s => !s.end);
const sessionsOn = k => S.sessions.filter(s => dayKey(new Date(s.start)) === k);
const refusalsOn = k => S.refusals.filter(r => dayKey(new Date(r.at)) === k);
const dayRec = k => S.days[k] || (S.days[k] = { breathHold: null, bought: 0, gaveAway: 0, spend: 0 });
const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

function totals(list) {
  const drags = list.reduce((n, s) => n + s.drags, 0);
  const equiv = drags / S.settings.dragsPerCig;
  const avoided = list.filter(s => s.context !== 'solo')
    .reduce((n, s) => n + Math.max(0, S.settings.baselineDrags - s.drags), 0);
  return { events: list.length, drags, equiv, avoided,
           money: equiv * S.settings.pricePerCig,
           moneyAvoided: (avoided / S.settings.dragsPerCig) * S.settings.pricePerCig };
}

/* A2 gate — the decision this whole build exists to settle.
   Reconstructed sessions are excluded: they were never a live decision point. */
function gate() {
  const live = S.sessions.filter(s => s.source === 'live');
  const before = live.filter(s => s.entry === 'before').length;
  return { n: live.length, before, pct: live.length ? Math.round(before / live.length * 100) : null };
}

function capSuggestion() {
  const shared = S.sessions.filter(s => s.context !== 'solo' && s.end).slice(-7);
  if (shared.length < 5) return null;
  const m = median(shared.map(s => s.drags));
  return m > S.settings.cap ? { observed: m } : null;
}

/* ---------------- actions ---------------- */
function startSession(entry) {
  if (active()) return;
  S.sessions.push({ id: Date.now(), start: new Date().toISOString(), end: null,
    entry, context: 'circle',
    // A late tap means at least one drag is already gone. Starting at 0 would
    // systematically undercount exactly the sessions the gate is measuring.
    drags: entry === 'already' ? 1 : 0,
    capAtTime: S.settings.cap, source: 'live' });
  track('session_start', { entry, cap: S.settings.cap });
  commit();
}
function addDrag(n = 1) {
  const s = active(); if (!s) return;
  s.drags += n;
  track('drag_add', { total: s.drags, cap: s.capAtTime, over: s.drags > s.capAtTime });
  save();
  // Update in place. Re-rendering the view would swap the DOM out from under a
  // thumb that is mid-double-tap, and "End session" sits directly below the pad.
  const num = document.getElementById('bignum');
  const cap = document.getElementById('capline');
  if (!num || !cap) return render();
  num.textContent = s.drags;
  const over = s.drags > s.capAtTime;
  cap.className = 'capline' + (over ? ' over' : '');
  cap.textContent = over
    ? `${s.drags - s.capAtTime} past your cap of ${s.capAtTime}. Noted, not judged.`
    : `cap ${s.capAtTime} \u00B7 started ${hhmm(s.start)}`;
}
function setContext(c) {
  const s = active(); if (!s) return;
  s.context = c; track('context_set', { context: c }); commit();
}
function endSession() {
  const s = active(); if (!s) return;
  s.end = new Date().toISOString();
  const overshoot = Math.max(0, s.drags - s.capAtTime);
  track('session_end', { drags: s.drags, cap: s.capAtTime, context: s.context, overshoot });
  commit();
}
function logRefusal() {
  S.refusals.push({ id: Date.now(), at: new Date().toISOString(), context: 'circle' });
  track('refusal_logged', { todayCount: refusalsOn(today()).length });
  commit();
}
function setCap(n) {
  S.settings.cap = Math.max(0, n);
  track('cap_adjusted', { cap: S.settings.cap });
  commit();
}
function startTrial(id) {
  S.trial = { id, startedAt: new Date().toISOString() };
  track('trial_started', { trial: id });
  commit();
}
function trialDay() {
  if (!S.trial) return 0;
  return Math.floor((Date.now() - new Date(S.trial.startedAt)) / 864e5) + 1;
}
function exportData() {
  const text = JSON.stringify(S, null, 2);
  const done = () => { track('export_data', { bytes: text.length }); alert('Copied. Paste it somewhere safe.'); };
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, () => prompt('Copy:', text));
  else prompt('Copy:', text);
}

/* ---------------- render ---------------- */
const view = document.getElementById('view');

function render() {
  document.getElementById('daychip').textContent =
    new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
    + (S.demo ? '  ·  DEMO' : '');
  renderBanner();
  view.innerHTML = tab === 'now' ? viewNow() : tab === 'today' ? viewToday() : viewData();
  document.querySelectorAll('nav button').forEach(b =>
    b.setAttribute('aria-current', String(b.dataset.tab === tab)));
}

function renderBanner() {
  const b = document.getElementById('banner');
  let html = '';
  if (!storageOK) html += `<div class="banner"><b>Storage is unavailable.</b> The app still works,
    but everything is lost when you close this tab. In Safari, turn off Private Browsing,
    then reload.</div>`;
  if (S.demo) html += `<div class="banner"><b>Demo data.</b> None of this is yours. Turn demo off
    in Data → Settings to get your own store back.</div>`;
  b.innerHTML = html ? `<main style="padding-top:4px">${html}</main>` : '';
}

function stripHTML(t) {
  return `<div class="strip">
    <div><span class="v tnum">${t.events}</span><span class="k">EVENTS</span></div>
    <div><span class="v tnum">${t.drags}</span><span class="k">DRAGS</span></div>
    <div><span class="v tnum">${t.equiv.toFixed(1)}</span><span class="k">CIGS</span></div>
    <div><span class="v tnum">${rupee(t.money)}</span><span class="k">SMOKED</span></div>
  </div>`;
}

function viewNow() {
  const s = active();
  const k = today();
  const t = totals(sessionsOn(k));
  const refs = refusalsOn(k).length;

  if (s) {
    const over = s.drags > s.capAtTime;
    return `
    <div class="counter">
      <div class="bignum tnum" id="bignum">${s.drags}</div>
      <div class="capline ${over ? 'over' : ''}" id="capline">
        ${over ? `${s.drags - s.capAtTime} past your cap of ${s.capAtTime}. Noted, not judged.`
               : `cap ${s.capAtTime} · started ${hhmm(s.start)}`}
      </div>
      <button class="tapzone" id="drag">+1 drag</button>
      <div class="seg" role="group">
        ${['circle', 'solo', 'other'].map(c =>
          `<button data-ctx="${c}" aria-pressed="${s.context === c}">${
            c === 'circle' ? 'Circle' : c === 'solo' ? 'Alone' : 'Other'}</button>`).join('')}
      </div>
      ${s.context === 'solo'
        ? `<button class="btn ghost" id="whole">Smoked a whole one (+${S.settings.dragsPerCig})</button>` : ''}
      <button class="btn" id="end">End session</button>
    </div>
    <p class="note">${s.entry === 'already' ? 'Counted from 1, because you had already taken at least one. ' : ''}One drag is one pull. The count is only as good as your thumb —
    <span class="assume">"drag" is an assumed unit, not a measured one.</span></p>`;
  }

  const first = S.sessions.length === 0;
  const sugg = capSuggestion();

  return `
  ${first ? `<div class="empty"><strong>Nothing logged yet.</strong>
    The next time anyone lights one — including you — open this and press a button
    <em>before</em> you take a drag. That before/after distinction is the entire point.</div>` : ''}
  <div class="stack">
    <button class="bigbtn primary" id="before">
      <span class="lbl">Before my first drag</span>
      <span class="sub">Nothing in my lungs yet from this one</span>
    </button>
    <button class="bigbtn" id="already">
      <span class="lbl">Already smoking</span>
      <span class="sub">Honest is better than tidy. This gets counted separately.</span>
    </button>
    <div class="row">
      <button class="bigbtn" id="refuse" style="min-height:76px">
        <span class="lbl">Passed it up</span>
        <span class="sub">${refs}/${S.settings.refusalTarget} today</span>
      </button>
    </div>
  </div>

  <div class="card"><h3>Today</h3>${stripHTML(t)}
    <p class="note">${t.avoided} drags not taken vs your self-reported 3 per share
    — about ${rupee(t.moneyAvoided)}. <span class="assume">Baseline of 3 is reported, not measured.</span></p>
  </div>

  ${sugg ? `<div class="card"><h3>Your cap is drifting</h3>
    <div class="kv"><span class="k">Cap set to</span><span class="v tnum">${S.settings.cap}</span></div>
    <div class="kv"><span class="k">Actually taking (median)</span><span class="v tnum">${sugg.observed}</span></div>
    <p class="note">The cap follows you, not the other way round. Move it to where you
    actually are and walk it down from there.</p>
    <button class="btn" id="raisecap">Set cap to ${sugg.observed}</button></div>` : ''}

  ${S.trial ? trialCard() : ''}`;
}

function trialCard() {
  const t = TRIALS.find(x => x.id === S.trial.id) || { name: S.trial.id, why: '' };
  const d = trialDay();
  if (d > 3) {
    // Both windows are exactly three days, and both are per-day rates. Comparing raw
    // totals over unequal windows manufactures a result out of nothing.
    const t0 = new Date(S.trial.startedAt); t0.setHours(0, 0, 0, 0);
    const t1 = new Date(t0.getTime() + 3 * 864e5);
    const tMinus = new Date(t0.getTime() - 3 * 864e5);
    const inWin = (a, b) => S.sessions.filter(s => {
      const x = new Date(s.start); return x >= a && x < b;
    });
    const during = inWin(t0, t1), prior = inWin(tMinus, t0);
    const nDaysOf = list => new Set(list.map(s => dayKey(new Date(s.start)))).size;
    const dDays = nDaysOf(during), pDays = nDaysOf(prior);

    if (pDays < 2 || dDays < 2) {
      return `<div class="card"><h3>Trial finished \u00B7 ${t.name}</h3>
        <p class="note">Not enough logged history on either side of this trial to compare
        honestly \u2014 ${pDays} day${pDays === 1 ? '' : 's'} before it, ${dDays} during.
        A percentage here would be an artefact of the gaps, not a result.</p>
        <button class="btn" id="newtrial">Start another trial</button></div>`;
    }

    const a = totals(during), b = totals(prior);
    const rate = (v, n) => v / n;
    const pct = (x, y) => y ? Math.round((x - y) / y * 100) : 0;
    const delta = pct(rate(a.drags, dDays), rate(b.drags, pDays));
    const evD = pct(rate(a.events, dDays), rate(b.events, pDays));
    const sign = n => (n > 0 ? '+' : '') + n + '%';
    return `<div class="card"><h3>Trial finished \u00B7 ${t.name}</h3>
      <div class="kv"><span class="k">Drags / day</span><span class="v tnum">${rate(b.drags, pDays).toFixed(0)} \u2192 ${rate(a.drags, dDays).toFixed(0)} <span style="color:var(--faint);font-weight:400">${sign(delta)}</span></span></div>
      <div class="kv"><span class="k">Sessions / day</span><span class="v tnum">${rate(b.events, pDays).toFixed(1)} \u2192 ${rate(a.events, dDays).toFixed(1)} <span style="color:var(--faint);font-weight:400">${sign(evD)}</span></span></div>
      <p class="note">${delta <= -25 && evD < 15
        ? 'Drags down, sessions flat. That is the pattern that means the cap is working rather than being compensated for.'
        : evD >= 15
          ? 'Sessions rose. That is compensation \u2014 you are smoking more often to make up the dose. This is the failure mode the whole design has to watch for.'
          : 'Not a clear result. Three days is a small sample and one heavy night can swamp it.'}</p>
      <button class="btn" id="newtrial">Start another trial</button></div>`;
  }
  return `<div class="card"><h3>Trial · day ${d} of 3</h3>
    <div class="kv"><span class="k">${t.name}</span><span class="v tnum">${d}/3</span></div>
    <p class="note">${t.why}</p></div>`;
}

function viewToday() {
  const k = today();
  const list = sessionsOn(k).sort((a, b) => new Date(b.start) - new Date(a.start));
  const refs = refusalsOn(k);
  const rec = dayRec(k);
  const t = totals(list);

  const items = [
    ...list.map(s => ({ at: s.start, kind: s.entry, ctx: s.context, drags: s.drags, retro: s.source === 'retro' })),
    ...refs.map(r => ({ at: r.at, kind: 'refusal', ctx: r.context }))
  ].sort((a, b) => new Date(b.at) - new Date(a.at));

  return `
  <div class="card"><h3>Today</h3>${stripHTML(t)}</div>

  <div class="card"><h3>Sessions</h3>
    ${items.length ? `<ul class="sessions">${items.map(i => `
      <li><span class="dot ${i.kind === 'refusal' ? 'refusal' : i.retro ? 'retro' : i.kind === 'already' ? 'already' : ''}"></span>
        ${i.kind === 'refusal' ? 'Passed it up'
          : `${i.ctx === 'solo' ? 'Alone' : i.ctx === 'circle' ? 'Circle' : 'Other'} · ${i.drags} drag${i.drags === 1 ? '' : 's'}`}
        <span class="meta">${hhmm(i.at)}${i.retro ? ' · reconstructed'
          : i.kind === 'already' ? ' · late tap' : ''}</span></li>`).join('')}</ul>`
      : `<div class="empty">No sessions logged today.</div>`}
    <button class="btn ghost" id="retro">Add one I missed</button>
  </div>

  <div class="card"><h3>The day around it</h3>
    <label class="fld"><span>Cigarettes bought</span>
      <input type="number" inputmode="numeric" id="bought" value="${rec.bought}" min="0"></label>
    <label class="fld"><span>Given away</span>
      <input type="number" inputmode="numeric" id="gave" value="${rec.gaveAway}" min="0"></label>
    <label class="fld"><span>Spent (₹)</span>
      <input type="number" inputmode="numeric" id="spend" value="${rec.spend}" min="0"></label>
    <label class="fld"><span>Breath hold (sec)</span>
      <input type="number" inputmode="numeric" id="breath" value="${rec.breathHold ?? ''}" min="0"></label>
    <p class="note">Bought minus given away is the only way to find out whether you are
    funding the circle. Breath hold on waking, before the first one — it is a rough
    proxy, <span class="assume">not a clinical measure.</span></p>
  </div>`;
}

function viewData() {
  const g = gate();
  const keys = Object.keys(S.days).concat(S.sessions.map(s => dayKey(new Date(s.start))));
  const uniq = [...new Set(keys)].sort().reverse().slice(0, 14);
  const all = totals(S.sessions);
  const nDays = Math.max(1, uniq.length);

  return `
  <div class="card"><h3>The gate · tapped before the first drag</h3>
    <div class="gate">
      ${g.pct === null ? `<div class="pct">—</div>`
        : `<div class="pct tnum ${g.pct >= 70 ? 'pass' : 'fail'}">${g.pct}%</div>`}
      <div class="bar"><i style="width:${g.pct ?? 0}%"></i><b></b></div>
      <p class="note" style="margin-top:4px">${g.before} of ${g.n} live sessions.
      The mark at 70% is the build/no-build line from the discovery brief: below it,
      this is a diary rather than an intervention. Reconstructed sessions are excluded
      — they were never a live decision.</p>
    </div>
  </div>

  <div class="card"><h3>All time</h3>
    <div class="kv"><span class="k">Days logged</span><span class="v tnum">${uniq.length}</span></div>
    <div class="kv"><span class="k">Sessions</span><span class="v tnum">${all.events}</span></div>
    <div class="kv"><span class="k">Events / day</span><span class="v tnum">${(all.events / nDays).toFixed(1)}</span></div>
    <div class="kv"><span class="k">Drags / day</span><span class="v tnum">${(all.drags / nDays).toFixed(0)}</span></div>
    <div class="kv"><span class="k">Cigarette equivalents / day</span><span class="v tnum">${(all.equiv / nDays).toFixed(1)}</span></div>
    <div class="kv"><span class="k">Refusals</span><span class="v tnum">${S.refusals.length}</span></div>
    <p class="note">Equivalents assume ${S.settings.dragsPerCig} drags to a cigarette.
    <span class="assume">That divisor is assumed. Change it in settings and every number here moves.</span></p>
  </div>

  <div class="card"><h3>By day</h3><div class="scroll"><table>
    <tr><th>Day</th><th>Ev</th><th>Drags</th><th>Cigs</th><th>Bought</th><th>Gave</th><th>Hold</th></tr>
    ${uniq.map(k => { const t = totals(sessionsOn(k)); const r = S.days[k] || {};
      return `<tr><td>${k.slice(5)}</td><td class="tnum">${t.events}</td><td class="tnum">${t.drags}</td>
      <td class="tnum">${t.equiv.toFixed(1)}</td><td class="tnum">${r.bought ?? 0}</td>
      <td class="tnum">${r.gaveAway ?? 0}</td><td class="tnum">${r.breathHold ?? '—'}</td></tr>`;
    }).join('')}
  </table></div></div>

  ${S.trial ? trialCard() : `<div class="card"><h3>Trials</h3>
    <p class="note">Three days, one variable, then a readout. Short on purpose —
    a plan you have to sustain for a month is a plan you will abandon in nine days.</p>
    <button class="btn" id="newtrial">Start a 3-day trial</button></div>`}

  <div class="card"><h3>Settings</h3>
    <label class="fld"><span>Drag cap (shared)</span>
      <input type="number" inputmode="numeric" id="set-cap" value="${S.settings.cap}" min="0"></label>
    <label class="fld"><span>Baseline drags/share</span>
      <input type="number" inputmode="numeric" id="set-base" value="${S.settings.baselineDrags}" min="1"></label>
    <label class="fld"><span>Drags per cigarette</span>
      <input type="number" inputmode="numeric" id="set-dpc" value="${S.settings.dragsPerCig}" min="1"></label>
    <label class="fld"><span>Price per cigarette (₹)</span>
      <input type="number" inputmode="numeric" id="set-price" value="${S.settings.pricePerCig}" min="0" step="0.5"></label>
    <label class="fld"><span>Daily refusal target</span>
      <input type="number" inputmode="numeric" id="set-ref" value="${S.settings.refusalTarget}" min="0"></label>
    <button class="btn" id="export">Copy all my data</button>
    <button class="btn ghost" id="demo">${S.demo ? 'Turn demo off' : 'Load demo data'}</button>
    <button class="btn danger ghost" id="reset">Erase everything</button>
    <p class="note">Everything lives in this browser and nowhere else. No account, no server,
    nobody else can see it. That also means clearing Safari's data deletes it —
    copy it out every week.</p>
  </div>`;
}

/* ---------------- dialogs ---------------- */
const dlg = document.getElementById('dlg');
function openRetro() {
  const now = new Date();
  dlg.innerHTML = `<h3>Add a session you missed</h3>
    <p class="note" style="margin:6px 0 14px">This is kept separate from live sessions and is
    left out of the gate number — a reconstructed session was never a real decision point.</p>
    <label class="fld"><span>Time</span><input type="time" id="r-time" value="${pad(now.getHours())}:${pad(now.getMinutes())}"></label>
    <label class="fld"><span>Where</span><select id="r-ctx">
      <option value="circle">Circle</option><option value="solo">Alone</option><option value="other">Other</option>
    </select></label>
    <label class="fld"><span>Drags</span><input type="number" inputmode="numeric" id="r-drags" value="3" min="0"></label>
    <button class="btn accent" id="r-save">Add it</button>
    <button class="btn ghost" id="r-cancel">Cancel</button>`;
  dlg.showModal();
  dlg.querySelector('#r-cancel').onclick = () => dlg.close();
  dlg.querySelector('#r-save').onclick = () => {
    const [h, m] = dlg.querySelector('#r-time').value.split(':').map(Number);
    const d = new Date(); d.setHours(h, m, 0, 0);
    S.sessions.push({ id: Date.now(), start: d.toISOString(), end: d.toISOString(),
      entry: 'reconstructed', context: dlg.querySelector('#r-ctx').value,
      drags: Math.max(0, +dlg.querySelector('#r-drags').value || 0),
      capAtTime: S.settings.cap, source: 'retro' });
    track('retro_session_added', { context: dlg.querySelector('#r-ctx').value });
    dlg.close(); commit();
  };
}
function openTrials() {
  dlg.innerHTML = `<h3>Pick a trial</h3>
    <p class="note" style="margin:6px 0 14px">Three days. One variable. Then a readout against
    the three days before it.</p>
    ${TRIALS.map(t => `<button class="btn ghost" data-trial="${t.id}"
      style="flex-direction:column;align-items:flex-start;min-height:60px;text-align:left;padding:12px 14px">
      <span style="font-weight:650">${t.name}</span>
      <span style="font-size:12.5px;color:var(--faint);font-weight:400">${t.why}</span></button>`).join('')}
    <button class="btn ghost" id="t-cancel">Cancel</button>`;
  dlg.showModal();
  dlg.querySelector('#t-cancel').onclick = () => dlg.close();
  dlg.querySelectorAll('[data-trial]').forEach(b =>
    b.onclick = () => { dlg.close(); startTrial(b.dataset.trial); });
}

/* ---------------- events ---------------- */
document.addEventListener('click', e => {
  const el = e.target.closest('button'); if (!el) return;
  const id = el.id;
  if (el.dataset.tab) { tab = el.dataset.tab; track('tab_view', { tab }); render(); return; }
  if (el.dataset.ctx) return setContext(el.dataset.ctx);
  if (id === 'before')   return startSession('before');
  if (id === 'already')  return startSession('already');
  if (id === 'drag')     return addDrag(1);
  if (id === 'whole')    return addDrag(S.settings.dragsPerCig);
  if (id === 'end')      return endSession();
  if (id === 'refuse')   return logRefusal();
  if (id === 'retro')    return openRetro();
  if (id === 'newtrial') return openTrials();
  if (id === 'export')   return exportData();
  if (id === 'raisecap') return setCap(capSuggestion().observed);
  if (id === 'demo') {
    if (S.demo) { S = backup ? backup : clone(DEFAULTS); backup = null; }
    else { backup = clone(S); S = clone(SEED); }
    track('demo_toggled', { demo: S.demo }); return commit();
  }
  if (id === 'reset') {
    if (confirm('Erase every session, refusal and day? This cannot be undone.')) {
      S = clone(DEFAULTS); track('reset_all'); commit();
    }
    return;
  }
});

document.addEventListener('change', e => {
  const id = e.target.id, v = e.target.value;
  const k = today();
  const num = n => Math.max(0, Number(n) || 0);
  if (id === 'bought')  { dayRec(k).bought = num(v); track('purchase_logged', { bought: num(v) }); return commit(); }
  if (id === 'gave')    { dayRec(k).gaveAway = num(v); track('giveaway_logged', { gave: num(v) }); return commit(); }
  if (id === 'spend')   { dayRec(k).spend = num(v); return commit(); }
  if (id === 'breath')  { dayRec(k).breathHold = v === '' ? null : num(v);
                          track('breath_hold_logged', { sec: num(v) }); return commit(); }
  const map = { 'set-cap': 'cap', 'set-base': 'baselineDrags', 'set-dpc': 'dragsPerCig',
                'set-price': 'pricePerCig', 'set-ref': 'refusalTarget' };
  if (map[id]) { S.settings[map[id]] = num(v) || DEFAULTS.settings[map[id]];
                 track('setting_changed', { key: map[id], value: S.settings[map[id]] }); commit(); }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

render();
track('app_open', { sessions: S.sessions.length, demo: S.demo });
