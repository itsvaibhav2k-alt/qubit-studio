# Linked chip inspection rendering

The Layout pane projects the existing die without the previous horizontal stretch. The shared stepped electrode, substrate and ground contours remain unchanged in 3D. Layout inspects the die and nearby shield aperture; the wider package, mounting hardware, side inserts and exploded stack remain in the assembly view.

`ui/lib/chip-detail.ts` supplies both renderers with the 46 bonds per side, film fan-outs, perforation recipe, overlapping junction electrodes, oxide barrier and fixed contact colors. Component appearance comes from the existing material catalog and page-owned assignments. The layout locator receives the same assignments and hidden component list. Contacts and traces hide with the component that owns them in Assembly.

Layout keeps its dark background, screen-sized labels, pan/zoom, per-pad inspection and full-chip locator. Callouts use a collision-aware screen-space placement function, prioritize selection in tight spaces and reserve space for the locator. Keyboard focus outlines retain a constant screen width under magnification.

No solver, parameter, Myla or session logic changes. The material picker's scope sentence now correctly mentions 3D and Layout.

Verification:

- `cd ui && npm run check`: frontend tests, lint, production build, typecheck and 16 browser journeys.
- With a local UI running, `node qa/browser/render-consistency.cjs http://127.0.0.1:3126`: disposable-browser checks and screenshots for full-chip and capacitor/junction inspection, individual pads, pan/zoom, material changes, shared selection, hidden components, narrow splits and stacked splits. Evidence is written to `test-results/render-consistency/`.

Built on `740d1c8`, preserving the earlier appearance, geometry-bounds, caption-clearance and browser-verification fixes.
