# Pass

A drag-level ledger. One screen, one tap, no account, no server.

Built to settle one question before anything else gets built on top of it:
**does the tap happen before the drag, or after it?** If it happens before, this is an
intervention. If it happens after, it is a diary with good typography. The Data tab
shows that number against a 70% line and does not flatter it.

## Run it

```bash
python3 -m http.server 8899
```

Then open `http://localhost:8899`. No build step, no dependencies, no Node.

## Put it on the iOS home screen

Open the deployed HTTPS link in **Safari** (not Chrome — only Safari can install to the
home screen), tap Share → **Add to Home Screen**. It then opens full-screen with no
browser chrome, which is the only way the two-tap loop is fast enough to use in a circle.

## How it works

- **Now** — two buttons to open a session: *Before my first drag* or *Already smoking*.
  That choice is the entire measurement. A late tap starts the count at 1, because you
  had already taken at least one and starting at 0 would undercount exactly the sessions
  being measured. Then a large pad: +1 drag, once per pull.
- **Passed it up** — one tap when you decline one. This is the only thing in the app that
  trains the ability to refuse; the cap never does.
- **Today** — sessions, plus cigarettes bought, cigarettes given away, money spent,
  and a morning breath-hold.
- **Data** — the gate percentage, all-time rates, a day table, 3-day trials, settings,
  and a copy-everything button.

The cap never scolds. Go past it and the app records the real number and offers to move
the cap up to where you actually are. A number you are afraid of is a number you stop
entering.

## What is real and what is not

**Real:** every session, drag, refusal, purchase and breath-hold you enter; every total,
rate and percentage computed from them; the gate calculation; the trial comparison.
All arithmetic runs on your own data.

**Simulated:** the demo dataset in `seed.js`, and only when demo mode is on. It is
6 days of plausible campus figures — Rs 270 a pack, ~19 events a day, a 72% gate — and
exists so the screens can be checked against known inputs. Turning demo on stashes your
real store in memory and restores it when you turn demo off. **It is never mixed in.**

**Assumed, not measured** — these are marked in amber in the interface wherever they
affect a number:
- **10 drags to a cigarette.** Every "cigarette equivalent" and every rupee figure
  divides by this. It is a guess. Change it in Settings and watch every number move.
- **3 drags per share as your baseline.** "Drags not taken" is measured against this
  self-reported figure, not against anything observed.
- **Rs 13.50 a cigarette** (Rs 270 ÷ 20).
- **A "drag" is not a standard unit.** Inhalation depth is not captured, and depth is
  exactly the channel through which compensation happens. The breath-hold field is a
  crude physical cross-check, not a clinical measure.

## Limitations, stated plainly

- **n=1.** No accounts, no sync, no sharing. Data lives in one browser on one device.
- **Storage is not durable.** Clearing Safari's website data deletes everything. iOS can
  also evict storage for web apps that go unused. Use *Copy all my data* weekly.
- **The gate can be gamed.** Nothing stops you tapping *Before my first drag* after the
  fact. The number is only worth what your honesty is worth.
- **Reconstructed sessions are excluded from the gate** but included in every volume
  total. They were never a live decision, so they cannot count as one.
- **A 3-day trial is a small sample.** One heavy night swamps it. The readout refuses to
  print a percentage when there is under two days of logged history on either side.
- **Offline loading works** — the service worker was confirmed registered and activated
  on the live HTTPS site. Files are served cache-first and refreshed in the background,
  so a new version can take one extra load to appear.
- **This is not medical care.** It measures a habit. It does not treat one.

## Re-deploying

Source of truth is this folder. To push an update to the live site:

```bash
bash deploy.sh
```
