/* seed.js — DEMO DATA ONLY.
   Plausible values for an Indian campus smoker: Classic/Gold Flake at Rs 270 per
   pack of 20 (Rs 13.50 a stick), ~20 smoking events a day, most of them shared
   three-puffs-and-pass in a circle of six.
   This is simulated. It exists so the screens are never empty during a demo and
   so the readouts can be checked against known inputs. It is NEVER mixed with
   real data: turning demo mode on replaces the store, turning it off restores it. */

const SEED = (() => {
  const DAYS = 6;
  const CONTEXTS = ['circle', 'circle', 'circle', 'solo', 'circle', 'other'];
  const sessions = [], refusals = [], days = {};
  const now = new Date();
  let id = 1;

  for (let d = DAYS - 1; d >= 0; d--) {
    const day = new Date(now); day.setDate(now.getDate() - d);
    const key = day.toISOString().slice(0, 10);
    // caps walk down over the week: 3 -> 2
    const cap = d > 3 ? 3 : 2;
    const events = 17 + ((d * 7) % 5);           // 17-21 events a day
    let bought = 0;

    for (let e = 0; e < events; e++) {
      const ctx = CONTEXTS[(e + d) % CONTEXTS.length];
      const hour = 8 + Math.floor((e / events) * 14);
      const start = new Date(day); start.setHours(hour, (e * 13) % 60, 0, 0);
      const solo = ctx === 'solo';
      // adherence improves across the week, with honest overshoot
      const slip = ((e * 3 + d) % 5 === 0) ? 1 : 0;
      const drags = solo ? 10 : Math.min(4, cap + slip);
      const end = new Date(start.getTime() + (solo ? 6 : 4) * 60000);
      // ~72% of live sessions tapped before the first drag
      const entry = ((e * 5 + d) % 7 < 5) ? 'before' : 'already';
      sessions.push({
        id: id++, start: start.toISOString(), end: end.toISOString(),
        entry, context: ctx, drags, capAtTime: cap, source: 'live'
      });
      if (solo) bought += 1;
    }
    // one reconstructed session most days — the unhappy path, kept separable
    if (d % 2 === 0) {
      const s = new Date(day); s.setHours(23, 10, 0, 0);
      sessions.push({
        id: id++, start: s.toISOString(), end: s.toISOString(),
        entry: 'reconstructed', context: 'circle', drags: 3, capAtTime: cap, source: 'retro'
      });
    }
    // refusals appear only from day 3 onward, and they are rare
    const refCount = d <= 3 ? 1 : 0;
    for (let r = 0; r < refCount; r++) {
      const s = new Date(day); s.setHours(16 + r, 20, 0, 0);
      refusals.push({ id: id++, at: s.toISOString(), context: 'circle' });
    }
    days[key] = {
      breathHold: 22 + (DAYS - d),   // seconds, improving slowly
      bought: 28 + (d % 4),
      gaveAway: 12 + (d % 5),
      spend: Math.round((28 + (d % 4)) * 13.5)
    };
    void bought;
  }

  return {
    version: 1,
    createdAt: new Date(now.getTime() - DAYS * 864e5).toISOString(),
    demo: true,
    settings: { cap: 2, baselineDrags: 3, dragsPerCig: 10, pricePerCig: 13.5, refusalTarget: 1 },
    sessions, refusals, days,
    trial: { id: 'cap2', startedAt: new Date(now.getTime() - 2 * 864e5).toISOString() }
  };
})();
