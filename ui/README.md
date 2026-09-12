# Qubit Studio UI

CAD-style workbench over the transmon solver in `../simulation`.

```bash
npm run dev    # http://localhost:3100  (3000 is taken by another service)
```

Requires the FastAPI backend on `http://127.0.0.1:8000` (override with `QUBIT_API_URL`).
The browser only ever talks to `/api/evaluate` on this origin.

See [IMPLEMENTATION-REPORT.md](./IMPLEMENTATION-REPORT.md) for what is implemented,
what is deliberately missing, and the command list.
