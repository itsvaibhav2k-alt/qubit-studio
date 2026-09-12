# Qubit Studio UI

CAD-style workbench over the transmon solver in `../simulation`.

```bash
npm run dev    # http://localhost:3100  (3000 is taken by another service)
```

Requires the FastAPI backend on `http://127.0.0.1:8000` (override with `QUBIT_API_URL`).
The browser uses same-origin proxy routes for evaluation, optimization, stress testing,
tunable-transmon analysis, and material sensitivity scenarios.

The Design Lab adds a goal verdict, grid-search optimizer, deterministic nine-corner
EJ/EC stress test, flux and junction-asymmetry controls, demo presets, and JSON report
export. Material combinations remain explicitly labeled as sensitivity scenarios unless
the imported dataset has a matching record.

Design search also includes beginner goal presets, an interactive chart of every passing
electrical design, a plain-language explanation of the selected trade-off, and a printable
one-page PDF report. The chart can be expanded into a larger interactive dialog for easier
comparison.

The workspace lets users explicitly save up to ten designs and restore them without removing
them from the list. It can copy a complete design into a shareable URL, previews whether goals
look reachable with a smaller solver sweep, and includes an assumption-labeled geometry editor
whose junction and capacitor values reshape both its live preview and the applied 3D chip.

See [IMPLEMENTATION-REPORT.md](./IMPLEMENTATION-REPORT.md) for what is implemented,
what is deliberately missing, and the command list.
