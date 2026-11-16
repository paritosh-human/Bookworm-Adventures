# Bookworm Adventures — Web Edition

A combined web remake of the three PopCap games: **Bookworm Deluxe** (classic
word puzzle), **Bookworm Adventures**, and **Bookworm Adventures Volume 2**
(word-combat RPG). One app, one shared letter-grid/word-validation engine,
three modes selectable from the main menu.

## Stack

- TypeScript + [Phaser 3](https://phaser.io/) for rendering/scenes
- Vite for the dev server and static build
- `localStorage` for save data (high score + per-campaign progress) — no
  backend, no accounts, everything stays on the player's machine

## Run locally

```bash
npm install
npm run dev
```

Open the printed `http://localhost:5173` URL.

## Project layout

```
src/
  main.ts              Phaser.Game bootstrap
  scenes/
    BootScene.ts       hands off to the menu
    MainMenuScene.ts   mode select + high score display
    DeluxeScene.ts     classic puzzle: chain words, tiles "burn" over time
    BattleScene.ts     RPG combat: word damage vs. a monster roster
  game/
    LetterGrid.ts       shared chain-select letter grid (used by both modes)
    letterTiles.ts      letter point values / bronze-silver-gold tiers, tile RNG
    wordValidator.ts    dictionary lookup
    campaigns.ts        placeholder monster rosters for Adventures / Volume 2
    saveManager.ts      localStorage read/write
    ui.ts               shared button helper
  assets/dictionary/words.json   167,737-word real dictionary — union of the
                                  Deluxe and Adventures game wordlists
  assets/adventures/creatures.json   real 155-monster roster (names + lore)
                                      for Bookworm Adventures, Books 1-3
  assets/adventures/creature_pam.json   creature name -> .pam file mapping
  game/pam/             PopCap PAM (.pam) animation decoder + Phaser player
                         (pamDecoder.ts, PamActor.ts, pamLoader.ts)
public/deluxe/           real tile art and sound effects extracted from the
                          original game
public/adventures/       real Lex portraits, battle sound effects, and
                          monster .pam animations + composited body-part art
raw-assets/               unpacked game files (images/sounds/fonts/data) for
                          all three games — see scripts/ for how
scripts/
  extract_pak.py          unpacks PopCap's .pak archive format
  decode_wordlist.py      decodes the front-coded word list files
  decode_pam.py           Python prototype of the .pam animation decoder
  composite_pam_images.py  merges each body-part's color (.jpg) + alpha
                           mask (`name_.gif`) into a proper RGBA PNG
  build_creature_pam_manifest.py  maps creature names to .pam filenames
```

## Current state (iteration 4 — real animated monster art)

The three original game zips (`~/Downloads/Bookworm-*.zip`) have been
unpacked into `raw-assets/` (`deluxe/`, `adventures/`, `adventures-vol2/`).
`scripts/extract_pak.py` and `scripts/decode_wordlist.py` do the unpacking —
see those files for the reverse-engineered `.pak` and front-coded wordlist
formats.

**Bookworm Deluxe is now wired to the real assets:**
- Real dictionary: 151,477 words decoded from the game's own `wordlist.txt`
  + `bonus_word_dictionary.txt` (`src/assets/dictionary/words.json`),
  replacing the earlier system-dictionary placeholder.
- Real tile art and board backdrop (`public/deluxe/images/`) and real sound
  effects for click/success/fail/game-over (`public/deluxe/sounds/`).
- Letter point values and frequencies are still an approximation (Scrabble-
  style) — the real tables are compiled into `BookWorm.exe`, not stored as
  data, so they weren't extractable without decompiling native code.
- The tile art only distinguishes two visual tiers (plain wood vs. gold), so
  bronze/silver share one sprite (`DELUXE_TILE_TEXTURES` in
  `src/game/letterTiles.ts`).
- The mobile-responsive canvas scaling (`Phaser.Scale.FIT` in `src/main.ts`)
  and the `#app`/`html`/`body` sizing in `src/style.css` were both fixed
  this pass — the canvas previously had no real parent size to fit into, so
  it just got cropped instead of scaled on narrow (phone) viewports.

**Bookworm Adventures is now wired to a real monster roster:**
- 155 real monsters (`src/assets/adventures/creatures.json`) from the
  original Books 1-3, with real names and real flavor-text lore, replacing
  the 3 placeholder monsters.
- Real Lex portraits (happy/worried, swapped based on battle outcome) and
  real battle sound effects (`public/adventures/`).
- HP/attack values are still an approximated difficulty curve scaled across
  the roster — the real per-monster combat stats are compiled into PopCap
  Lua bytecode (`.luc` files in `raw-assets/adventures/scripts/creatures/`),
  not stored as plain data. Decompiling those would be a separate, sizeable
  task.
- **Real animated monster art.** Monster art in the original game is
  piece-based `.pam` (PopCap AniMation) data — body, jaw, legs, eyes etc. as
  separate color+alpha-mask image pairs, assembled and animated by a
  proprietary binary format with no public spec for this (2008-era, version
  1) variant. It's been fully reverse-engineered — see `src/game/pam/` for
  the decoder/player and `scripts/decode_pam.py` for the byte-exact-verified
  prototype (parses every sample file down to the last byte with zero left
  over). `PamActor` replays a named segment (e.g. "idle") using Phaser
  containers to handle the format's nested symbol-instance transforms, and
  auto-fits each creature to a consistent on-screen size since their
  internal coordinate origins vary per file.
  - 136/155 creatures are matched to a real `.pam` file
    (`scripts/build_creature_pam_manifest.py` — filenames use abbreviated,
    stage-numbered names that don't match the roster 1:1); the rest fall
    back to text/lore-only.
  - A key format quirk: a named segment like "idle" is often just a label
    with no appends of its own — it keeps animating fragments an *earlier*
    segment (e.g. "intro") already added and never removed, so playback
    always replays cumulatively from frame 0, not from the segment's own
    start.
  - Rotation/matrix transforms, nested sprite-of-sprite recursion, and
    per-fragment add/move/remove timelines are all implemented; color-tint
    frames are applied as alpha only (no RGB tinting yet).

**Real intro cutscene.** The original game's intro is a Flash (`.swf`)
animation — Flash itself was discontinued in 2020, so no browser can play it
natively. It's now played via [Ruffle](https://ruffle.rs), an open-source
WASM Flash emulator, showing the *actual* original cutscene file rather than
a re-encoded video (`src/game/cutscene.ts`, triggered from the main menu
before entering Bookworm Adventures). This pulled Ruffle's self-hosted
runtime into `public/ruffle/` (~28MB of WASM — the main reason the build
jumped from 33MB to ~63MB) and the cutscene file into
`public/adventures/cutscenes/`. The 3 remaining Adventures cutscenes
(per-book intros/endings) and Volume 2's 5 cutscenes are extracted but not
wired up yet — see `ASSETS.md`.

**Bookworm Adventures Volume 2** (not yet started): real sprites/sounds/fonts
are sitting in `raw-assets/adventures-vol2/images|sounds|fonts` in standard
formats, same caveats as above apply.

See [ASSETS.md](ASSETS.md) for a running inventory of every extracted asset
category across all three games and whether it's actually wired into the app
yet — there's a lot still sitting unused (minigames, treasure/item art, book
cover art, hall-of-fame UI, board backdrops for battle mode, etc.).

## Hosting (later)

Since all progress is saved to `localStorage`, hosting is just serving the
static `npm run build` output (`dist/`) — GitHub Pages, Netlify, Cloudflare
Pages, etc. No server/database needed.

## Adventures: decompiled rules (current state)

The original `.luc` scripts are decompiled with `scripts/luc.py` + `scripts/luc_decompile.py` into `decompiled/`.
`scripts/extract_game_data.py` turns them into `src/assets/adventures/game_data.json` (Vol. 2: `game_data_vol2.json`).

- `src/game/adventures/rules.ts` — letter bonuses, word damage, enemy attack urgency, gem spawn.
- `src/game/adventures/BattleModel.ts` — pure battle state (hearts, ailments, stun, multipliers, enemy turn).
- `src/scenes/ChapterIntroScene.ts` + `BattleScene.ts` — real chapter/enemy order, per-chapter arena, boss banner,
  checkpoints, enemy attack list, gems and tile statuses (smash/lock/petrify/plague), saved in `localStorage`.
- Tests: `node tests/rules.test.ts` (rules + model, uses node's TS stripping).

Approximated (the original keeps these in native code, not the scripts): `GEM_BONUS_PCT`, the XP/level curve
(`xpForLevel`), level-up bonus sizes, adjusted-length → hearts damage table, plague spread, Freeze (= stun),
Scramble costing a turn. They are tagged `APPROX` in the source.

Not built yet: potion/treasure items on the pedestals, Lex's Level-up banner/XP bar, Volume 2 gameplay
(data is already extracted), the remaining effects (WordEffect, HealingWord, Invincible, WordLength).

### Animation notes (pams)
- Creature pams are authored in stage space and drawn 1:1: Lex's 800x500 pam at the stage origin, enemy pams
  right-aligned (`x = 800 - pamWidth`). Both are lifted by `STAGE_Y` in `BattleScene.ts`.
- Images named `(add)...` are drawn with additive blending (black = transparent).
- `extract_game_data.py` picks, per creature, the pam that actually has idle/flinch/death + its attack labels
  (some scripts also list cutscene pams) and now reads Book 3 style `"images/pam/6Grim"` references.
- Lex's attack labels (attack1..7) are bite / torpedo / big-bite / meteor poses inside `lex.pam`; the engine
  picks one by word length (see `lexAttackFrame`). I found no thrown-book sprites in `lex.pam`.

### Enemy defenses, sounds, Volume 2 plumbing
- `defenses.ts` reads each enemy's named defenses (armor, immunities, word-length immunity, bonus word lists
  from `scripts/wordlists`). `sfx.ts` + `sounds.json` play per-creature attack/hit/engage/death sounds.
- `gameContext.ts` switches between `adventures` and `adventures2` (asset folder `public/adventures-vol2`).
