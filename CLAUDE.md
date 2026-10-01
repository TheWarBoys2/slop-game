# Working on Slop Valley

More than one Claude works on this repo, often at the same time, from different places (a Claude in Jay's project, and at least one outside it). They can't see each other's sessions, only what's on GitHub. These rules exist so you don't overwrite each other's work or ship clashing builds. Read this before you change anything.

## Before you start

1. `git fetch --all --prune`, then look at what else is in flight:
   - open PRs: `gh pr list` or the GitHub tools (`list_pull_requests`, state open)
   - remote branches: `git branch -r`, and for each recent one `git log --oneline origin/main..origin/<branch>` and `git diff --stat origin/main...origin/<branch>`
2. If someone else's branch or PR touches the same files or the same system (e.g. both of you changing the Dome, the economy, `server.js` combat, `public/game.js` UI), don't start a parallel version. Build on their branch only if it's yours to drive; otherwise pick different work, or wait for it to merge and start from the new `main`. Say in your PR description which other branch you checked and how you avoided it.

## While you work

- Never commit or push directly to `main`. Work on your own branch (`claude/<short-topic>` unless your session already names one) and land it through a PR.
- Keep each PR to one batch of work. Small PRs merge cleanly; giant ones collide.
- Big shared files (`server.js`, `public/game.js`) are where clashes happen. Prefer adding code in a new block or a new module over reshuffling or reformatting existing code, so a merge stays a merge and not a rewrite.

## Before you merge (every time)

1. `git fetch --all --prune` again and re-check open PRs and branches. Something may have landed or opened since you started.
2. If another open PR or branch touches the same files, look at what it changes. If you'd break it or it'd break you, sort out the order first (usually: whichever is closer to done goes first, the other merges `main` in afterwards). Don't merge over the top of it blind.
3. Merge the latest `origin/main` into your branch (a merge, not a rebase, if anyone else has pushed to your branch), resolve conflicts keeping both sides' behaviour, then re-test:
   ```sh
   bun server.js &                                  # must boot, CI checks / and /game.js load
   SLOP_FAST=1 bun server.js 7778 &
   bun tools/bots.js ws://localhost:7778/ws 4       # bots should play with no errors
   ```
   Test the systems you changed, plus anything the other merged work changed that touches yours.
4. Only then merge the PR.

## PR descriptions

Make it obvious to the other Claude (and to Jay) what moved:
- A **Systems changed** list naming each game system touched (e.g. Dome, stock market, radial menu, crops, story/dialogue, bots) and the main files.
- Anything that changes balance numbers (prices, damage, timings) called out with old → new values.
- Which other branches/PRs you checked for overlap.

## Builds and releases

- `.github/workflows/release.yml` runs on **every push to `main`** that changes game files: it smoke-tests the server, compiles `SlopValley.exe`, and publishes a GitHub release tagged `build-<N>`, where N is the workflow's GitHub `run_number`. Hosts pick it up automatically next time they run `SlopValley.bat`.
- So **a merge to `main` is a release.** That's why merges go through the checks above, and why two batches shouldn't be merged seconds apart without a re-test in between.
- Build numbers are assigned by GitHub, not by you. Never hard-code or promise a build number in code, a PR title or a message before it exists. After your merge, wait for the release workflow to finish and read the real tag (latest release / `list_releases`) before telling anyone "build-N is out". If two merges land close together, each gets its own number and the later one is the latest release.
- Changes that only touch Markdown (like this file) don't trigger a build.

## Where work comes from

The backlog is Jay's Google Sheet **"Slop Game requests"** (tab "Requests"): https://docs.google.com/spreadsheets/d/10WxUCtSSvFdvOd7SgpiaWfvu2vmLg7BNDJxHA7Q2Ug0/edit

Work it highest priority first, skip Done rows, set Status to "In progress" when you start an item (this is also how the other Claude knows you've claimed it) and "Done" with the PR link in Notes when it ships. If a row is already "In progress", someone else has it; don't start it too.

## Running it

See the README's "Running from source" section. `story.js` is spoilers.
