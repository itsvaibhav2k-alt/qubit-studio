# Qubit Studio

A CAD-style workspace for exploring an isolated transmon model and designing within explicit frequency, charge-variation, and transition-spacing requirements.

The interface uses Next.js/React; numerical calculations use FastAPI and scqubits. These are simplified model calculations, not calibrated predictions for fabricated devices or estimates of coherence/lifetime.

## Run locally

Use Node.js **22.17.1** (`.nvmrc`) and Python **3.12**. GitHub access to this private repository is required.

```sh
git clone https://github.com/itsvaibhav2k-alt/qubit-studio.git
cd qubit-studio
```

Create the Python environment and install the recorded numerical dependencies:

```sh
python3.12 -m venv simulation/.venv
simulation/.venv/bin/python -m pip install -r simulation/requirements.txt
```

Install the frontend using the checked-in lockfile:

```sh
nvm use
npm --prefix ui ci
```

In one terminal, start the calculation service:

```sh
simulation/.venv/bin/python -m uvicorn api:app --app-dir simulation --host 127.0.0.1 --port 8000
```

In a second terminal, start the UI:

```sh
npm --prefix ui run dev
```

Open [localhost:3100](http://localhost:3100). The UI server proxies calculation requests to `http://127.0.0.1:8000`. Set the server-side `QUBIT_API_URL` environment variable if the backend runs elsewhere. No API key or database is needed.

On Windows, use `py -3.12 -m venv simulation/.venv` and replace `simulation/.venv/bin/python` with `simulation\.venv\Scripts\python.exe`. If nvm is unavailable, install the Node version in `.nvmrc` directly.

## Unified workspace

The integration branch combines Myla and the reusable chip builder with the detailed 3D/Layout
workspace. Explore edits a single applied device; Design retains the shared search, stress,
flux, and material-scenario session across tabs. Pin a baseline, inspect candidate trade-offs,
apply explicitly, and save or export the resulting device with its producing inputs.

- **3D / Layout / Split:** linked selection, component isolation, material appearance, layers,
  inspection zoom, saved inspection views, and assembled/exploded presentation.
- **Chip builder:** reusable presets and pieces, replacements, editable geometry/materials,
  connections, layout/circuit/3D previews, JSON import, JSON/SVG export, and numerical Apply.
- **Learn:** short and full guided tours, a step-by-step build workshop, and technical notes.
- **Ask Myla:** immediate local teaching plus an explicit optional Gemini explanation request.
- **Design tools:** local saved devices, restore/history, and shareable links.

See [the unification report](docs/myla-unification.md) for the exact source branches, preserved
contracts, verification commands, and provider-testing limits. Feature branches remain separate
from the original working checkout; this integration does not alter its local UI edits.

## Checks

```sh
simulation/.venv/bin/python -m pytest -q simulation
npm --prefix ui test
npm --prefix ui run lint
npm --prefix ui run build
npm --prefix ui run typecheck
```

The build also checks TypeScript. Running the explicit typecheck after the build includes Next's generated route types. On macOS/Linux, `./scripts/check.sh` runs all of these checks in sequence.

The active [Verification workflow](.github/workflows/verification.yml) runs the frontend,
Python, and browser tiers for pull requests and main pushes. Local passing results are recorded
separately from GitHub CI results. See [testing and integration](docs/testing-integration.md).

`simulation/requirements.in` lists direct dependencies. `simulation/requirements.txt` records the exact tested Python environment, including NumPy and SciPy. Update dependency files together and rerun the numerical tests. `ui/package-lock.json` controls the frontend install; use `npm ci` on a new checkout.

## Repository map

| Path | Purpose |
| --- | --- |
| `ui/` | Next.js application, components, same-origin API proxies, frontend tests |
| `simulation/` | Authoritative model calculations, FastAPI service, numerical tests |
| `docs/` | Build contracts, research decisions, and team handoffs |
| `research/` | Research notes and model limitations |
| `design/reference-pack/` | Visual references and prior design artifacts |

See [CONTRIBUTING.md](CONTRIBUTING.md) for the branch workflow and parallel-work rules.
