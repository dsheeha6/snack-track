# Prototype archive

The original SNACK TRACK prototype, retired 2026-11-01. It is not part of the app.

- `index.html` — the reference for the hand-drawn look (`PRODUCT.md` → The look).
- `parse.py` — the baseline pipeline in `evals/run.py`. Keep it unchanged, or the
  baseline numbers stop being comparable.
- `suggest.py` — the macro-shape scoring Phase 5 ports.
- `server.py` + `data/log.json` — only so the page can still be opened.

To see the page, run `python server.py` from this folder and open
http://localhost:4701. Anything you log there writes to `data/log.json`.
