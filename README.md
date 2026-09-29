# Normal Area Explorer

Interactive standard normal distribution explorer for z-score and shaded-area questions.

Live site:

- `https://tools.benhartlage.com/normal-area/`

Compatibility URL:

- `https://rhartlage.github.io/normal-area-explorer/`

Local files:

- `index.html`
- `styles.css`
- `app.js`

This is a standalone static web app with no build step.

The app uses only local HTML, CSS, and JavaScript. It has no account, analytics,
external font, storage, or student-data dependency. A reproducible starting
example, text probability readout, prediction check, and print fallback support
classroom and accessible use.

## Normal models and Excel

Set any finite mean and positive standard deviation. Find probability from original
x cutoffs or z-scores, or find cutoffs from a requested probability. The graph
labels both scales and shows standardization, area arithmetic, and copyable Excel
formulas. NORM.DIST/NORM.S.DIST solve forward questions;
NORM.INV/NORM.S.INV solve inverse questions.

- Forward regions: left, right, between, or symmetric outside tails. In the
  outside-tails case the entered cutoff is a nonnegative distance from the mean.
- Inverse regions: left, right, central interval (equal unshaded tails), or
  symmetric outside tails (equal shaded tails). Inverse inputs require 0 < p < 1.
- Switching x/z input scale preserves the current cutoffs. Changing mean or spread
  keeps whichever input scale the student selected. Graph dragging updates the
  worked solution; central inverse intervals stay centered on the mean.
- Excel uses cumulative left-tail areas. Extremely small inverse tails use
  symmetry to avoid subtracting a tiny probability from 1.
- Calculations retain full floating-point precision. Displayed results are
  rounded, and numerically unresolvable inputs are rejected with an explanation.
  The graph expands through ±12 z; more distant cutoffs are identified in text.

`normal-math.js` is a dependency-free shared math helper. Run numerical and UI
logic regression checks with:

```powershell
node --test tests/*.test.cjs
python -m http.server 4186 --bind 127.0.0.1
```

Open `http://127.0.0.1:4186/` for a local preview. The public hosting repository
`rhartlage/rhartlage.github.io` must pin the source commit and allowlist
`normal-math.js` alongside `index.html`, `styles.css`, and `app.js`.

## Layout controls

On wide screens, drag the divider between setup and graph to resize the columns.
The divider supports Left/Right arrows (Shift for larger steps), Home/End for the
limits, and Enter or double-click to reset. Narrow screens stack the panels.
Widths are kept only for the current page session. Cutoff annotations occupy
separate slots above the curve so close or coincident boundaries stay readable.
The hosted runtime allowlist must also include `layout.js`.
