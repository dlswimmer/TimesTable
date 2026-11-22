# Times Table Quest ✖️

A small, kid-friendly times table practice game. Plain HTML, CSS and JavaScript with no build step, hosted on GitHub Pages.

**Play:** https://dlswimmer.github.io/TimesTable/

## What it does

- **Levels:** Rookie (×1, ×2, ×5, ×10), Explorer (×1 to ×10), Champion (×1 to ×12), or *My Tables* to pick exactly which tables to practice.
- **Question styles:** pick one of four answers, type the answer, find the missing number (`6 × ? = 42`), true or false, or a mix. Each level mixes styles differently (Rookie leans on multiple choice, Champion on typing and missing numbers).
- **Modes:** Practice (10 questions), Beat the Clock (60 seconds), and Fix My Mistakes (only facts that were missed).
- **Remembers misses:** every fact sits in a Leitner box. A miss drops it to the bottom and it comes back much more often until it has been answered right several times. A tip is shown after each miss (doubling, ×9 trick, break it up, and so on).
- **Rewards:** points with streak and speed bonuses, stars per round, XP ranks (Number Cub up to Legend of Times), badges, confetti and sounds, and a days-in-a-row counter.
- **Fact Map:** a 12 × 12 grid for grown-ups showing which facts are new, missed, learning or mastered.

Progress is saved in the browser (`localStorage`) on that device.

## Run locally

ES modules need a web server, so open it via one rather than double-clicking the file:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deploying

`.github/workflows/pages.yml` publishes the site on every push to `main`. One-time setup: in the repo go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.

## Code map

| File | What's in it |
| --- | --- |
| `js/facts.js` | Levels, fact keys, weighted picking of missed facts, tips |
| `js/questions.js` | Question type builders (add a new type here) |
| `js/rewards.js` | Points, ranks, badges, day streak |
| `js/storage.js` | Save/load to `localStorage` |
| `js/fx.js` | Sound effects and confetti |
| `js/app.js` | Screens and game flow |
