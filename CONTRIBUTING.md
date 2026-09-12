# Working together

Accept your GitHub collaborator invitation, then clone the repository. Use the root README for setup. Each teammate should use their own clone or worktree and create a named feature branch.

```sh
git switch main
git pull --ff-only
git switch -c feat/your-change
# Make and verify your change.
git add path/to/reviewed-file
git commit -m "feat: describe the resulting behavior"
git push -u origin HEAD
```

Open a pull request targeting `main`. Explain the resulting behavior and relevant checks; include a screenshot for a visible UI change. Use a draft PR when the implementation or integration review is still in progress. Request a teammate's review before merging.

## Current responsibilities

- **Search lane:** numerical service, search API, `useDesignSearch`, baseline state, comparison semantics, and their tests.
- **UI lane:** page composition, controls, plots, explanation presentation, and scene/layout behavior.
- **Integration owner:** combines the lanes and verifies the complete user workflow.

The detailed file allocation is in `docs/plans/team-build-handoff.md`. For the current feature, consume the search branch's `ui/lib/search-types.ts` and the existing evaluation pipeline. Python owns physics, eligibility, margins, and recommendations. UI copy must describe returned evidence.

If a branch contains copied files owned by another lane, do not accidentally commit them as a separate implementation. Coordinate the integration commit with the owner, and stage an explicit file list. Do not rewrite another person's branch or force-push shared history.

## Separate workspaces

On one machine, create a worktree for a separate branch:

```sh
git worktree add ../qubit-studio-my-change -b feat/my-change main
```

Install dependencies inside that worktree. Do not share `node_modules`, `.next`, or Python virtual environments between concurrently running worktrees. Pick unused ports for additional previews; do not stop an active teammate's server to reuse a port.

Commit source, tests, and the relevant lockfile. Keep environment files, credentials, virtual environments, build output, and local caches out of Git. No credentials are required for the app's local model calculations.

## Verification before handoff

Run the relevant checks from the root README. For search changes, test fresh/dirty/running/error/infeasible behavior, old responses arriving late, baseline replacement, and changed requirements. For UI changes, also verify the visible Explore → Design → inspect → pin → tighten → Apply workflow with matching labels and evaluated results.

Passing unit tests and a production build does not by itself verify the full combined interface. Include any remaining integration work in the PR description.
