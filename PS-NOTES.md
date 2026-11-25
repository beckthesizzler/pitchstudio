# PitchStudio: handover notes

Read this first, in any new chat. It is the one place decisions live, so nobody has to cross-reference old chats.
Last updated: 25 Nov 2026. Whoever finishes a piece of work updates this file in the same branch.
The repo is public until the owner makes it private: keep secrets and business strategy out of this file.

## What it is, and the bar

A free football studio for fans and creators (Beckham Ng, @bbenditlike). Tactics Board, Live Game Analysis, Match Report and Dump & Arrange (brain dump), all signed with the creator's own name and brand, not PitchStudio's.

The bar:
- Each tool must be good enough on its own that people stay. One tool at a time, finished to his satisfaction before the next. No jumping between the four.
- Fast and intuitive first. The things people do most (entering an XI, making their own report) must take seconds.
- Original look. Never copy a reference design; use references to learn what "high level" means, then do something that is PitchStudio's own. Designers should respect the detail.
- Free for creators, no paywall feeling. Words are short and brand-led (CREATE, IMPORT, DESIGN), never long or AI-sounding.
- Computer first. Phone layout is not a priority.
- Delete what is useless. A feature he can't explain in one line should not ship.

## How we work (rules)

1. All code goes through GitHub. Figma Make is retired: never press Publish there (it would overwrite GitHub with an older copy). The Make file (F0JOkvCaxQEzm84JsHV5ED) is frozen at 24 Nov 2026.
2. Claude works on a branch, pushes it, and Vercel builds a preview link (`pitchstudio-git-<branch>-pitch-studio.vercel.app`). Claude merges to `main` only when Beckham says go. Merging to `main` deploys the live site.
3. Show a visual before building anything new. He wants to see it, agree, then it gets built. Answer his questions first, build second.
4. Test before delivering: `tsc`, a production build, and real browser runs of what changed. Say plainly what was not verified.
5. Database changes: Claude applies them through the Supabase connector, but asks him first and explains what changes. Existing data must not be touched.
6. Never commit `src/imports/*.png` (large-file pointers cause conflicts).
7. Commit trailers: `Co-Authored-By: ...` and `Claude-Session: ...` as the session instructs.
8. Landing and tour videos, and the logo/font redesign, come last, after all four tools are final, otherwise they go stale.

## Where everything lives

| Thing | Where |
|---|---|
| Code | github.com/beckthesizzler/pitchstudio (`main` = live) |
| Live site | pitchstudio-brown.vercel.app (Vercel team `pitch-studio`, project `pitchstudio`, SPA rewrites on) |
| Database, auth, storage, edge functions | Supabase project `dixqrvrezugbdokedseh` |
| Analytics | PostHog |
| Connectors Claude should have on | GitHub (attach the repo with push access), Vercel, Supabase, Figma (only for design capture), Google Drive (reference images) |

Preview deployments use the live Supabase, so real boards show up on a preview. Sign-in on a preview address may need that address allowed in Supabase Auth settings.

Reference images and files he shared in chats are NOT in the repo (it is public, and many are other people's designs). Keep them in a Google Drive folder called "PitchStudio references" and tell Claude to read it.

## Stack

React + Vite + Tailwind, react-router, SVG pitch (Board remounts on `loc.key`), Supabase, Vercel. `src/app/App.tsx` (about 6,900 lines) is the Tactics Board and the shell. Splitting it is deliberately deferred until all four tools are final.

Main files: `src/app/App.tsx`, `src/app/board/{Library,Names,Notes,Stage}.tsx`, `src/app/pages/{SharedBoard,Shelf,Home,Landing,Auth,Profile,Report,Analysis,BrainDump,...}.tsx`, `src/app/Root.tsx` (routes, lazy pages).

## Database (Supabase)

- `profiles`, `boards`, `board_events` (RLS: people only touch their own rows; auto-profile trigger).
- `boards.folder_id`, `boards.is_public`; `board_folders` (id, user_id, name, x, y); trigger `boards_folder_owner` checks the folder is the owner's.
- `squad_cache` (team squads for name suggestions), `squad_sync` (RLS on, no policies, intentionally server-only).
- Storage bucket `board-shares` (public, one JPEG per board id, owner-only writes).
- RPC `get_shared_board(b uuid)` (security definer, granted to anon and authenticated) feeds `/b/:id`.
- Edge function `squads-sync` (reads secret `FOOTBALL_DATA_TOKEN` from football-data.org; returns `{skipped:"no token"}` without it).

## State of the Tactics Board (25 Nov 2026)

Done and on `main` (live): green default pitch, tight frame, Match/Teams/Look/Crop panel, zoom 80 to 200%, start card, Same XI, Clear the pitch; naming the XI on the pitch (players run out, Tab moves on, paste a line-up with Cmd/Ctrl+V, team tabs, formation changes that glide) with real-squad name suggestions (suggestions work only once the squads are loaded, see below).
Built on branch `board77`, preview tested, NOT yet merged: the Library (free-floating folders wall + list with ticks, drag boards into folders, bulk move/duplicate/delete, search all boards, empty boards aren't saved); three examples (Grass, Paper, Cobalt) replacing Templates; resizable and hideable panel (Cmd/Ctrl+\); Share link with a public read-only page and Remix.

Open items:
- Merge `board77` after Beckham tests the preview.
- He must add `FOOTBALL_DATA_TOKEN` as a Supabase edge function secret. Then run `squads-sync` and check `squad_cache` fills. The real response format from football-data.org (`/competitions/{code}/teams`) has never been fetched, so squads are unverified.
- Not yet checked: old saved boards in the new layout (a steps board, a blank-canvas board), touch/phone.
- Share links on X use the generic card; per-board previews need a real domain.
- Optional: "Save a copy", Same XI following the account instead of the device.

## Deferred, in order

1. Dump & Arrange: 3 default templates (including a chalkboard look; WIP is git stash "walkout68 chalkboard wip" in Claude's old workspace, may be gone), Walls design stays.
2. Live Analysis (needs his own footage; 10 shots, folders, broadcast-style tag, video up to 10 min is the most important fix).
3. Match Report: 5 default templates, a very easy create-your-own, zoom-out view for hundreds of reports.
4. Then: split `App.tsx`, real domain and link previews, intro and tour videos, landing hero, logo and fonts.

## Mistakes we made (don't repeat)

- Built the "Drop the XI" box without showing a visual first. He rejected it. Show visuals first.
- Shipped Templates and Boards as two things with no clear difference. Every feature needs a one-line reason.
- Spent Figma Make credits on edits that code or SQL could do, and bundled unrelated fixes into one prompt. Pasting through Make cost about 3,000 credits in a day. That is why Make is retired.
- Patching big pastes by hand lost variables once (Examples). Always run `tsc` and a build after patching.
- Old "empty board" saves cluttered the Library. Empty boards are not saved now.
- A migration timed out once because the confirmation went unanswered. Ask, then wait for the yes.
- Never state a figure, squad or API response as fact without fetching it.

## Testing

A local harness (a stubbed Supabase and Playwright runs at 1440, 1280 and 1024 widths) was used for every build. It lives in Claude's temporary workspace and is rebuilt on demand, so don't count on it existing. A regression script should be committed under `tests/` when the next piece is built.
