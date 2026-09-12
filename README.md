# Qubit Studio

Interactive transmon-design sandbox with a Next.js 3D interface and a FastAPI/scqubits simulation service.

## Run locally

Open two terminals.

### Terminal 1 — simulation service

```bash
cd simulation
source .venv/bin/activate
uvicorn api:app --reload --port 8000
```

### Terminal 2 — interface

```bash
cd ui
nvm use 22
npm install
npm run dev
```

Open <http://localhost:3100>.

The app is an educational model. Material screening uses reported resonator measurements and explicit
heuristics; it does not predict the guaranteed performance of a fabricated device.
