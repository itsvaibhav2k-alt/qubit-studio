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

## Branches and current work

- `main`: shared checkpoint and collaboration setup. Use feature branches and pull requests to change it.
- `feat/design-search`: completed search API, decision state, frozen baseline assessment, comparison classification, and tests. Its pull request is the search lane handoff.
- `feat/design-workspace`: Claude's separate UI lane; its owner publishes checkpoints when ready. Local uncommitted work is not included in a push.

The current `main` UI is the Explore workspace. The Design workflow becomes a complete product experience after the search and UI lanes are integrated and verified together.

For lane ownership and the shared contract, read [the team handoff](docs/plans/team-build-handoff.md). Its original approval/setup checklist is historical: Git and the shared remote are now configured, and implementation has begun. The search branch's `ui/lib/search-types.ts` is the canonical interface; do not create a competing hook or scoring implementation.

## Checks

```sh
simulation/.venv/bin/python -m pytest -q simulation
npm --prefix ui test
npm --prefix ui run lint
npm --prefix ui run build
npm --prefix ui run typecheck
```

The build also checks TypeScript. Running the explicit typecheck after the build includes Next's generated route types. On macOS/Linux, `./scripts/check.sh` runs all of these checks in sequence.

A GitHub Actions template is prepared at [docs/ci/github-actions.yml](docs/ci/github-actions.yml). It is not active: the publishing GitHub sign-in currently has repository access but lacks the additional `workflow` scope. Once an authorized sign-in has workflow-write permission, move that file to `.github/workflows/ci.yml` and push it to enable checks on `main` pushes and pull requests. The local checks work immediately.

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
