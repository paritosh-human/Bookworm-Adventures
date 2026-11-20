# Bookworm Adventures — Web Edition

A web remake of two PopCap games: **Bookworm Adventures** and **Bookworm
Adventures Volume 2** (word-combat RPGs, built on the original decompiled
rules/data, not approximations). A third, **Bookworm Deluxe** (classic word
puzzle), is implemented (`DeluxeScene.ts`) but currently unreachable from the
menu — see "Current state" below.

## Stack

- TypeScript + [Phaser 3](https://phaser.io/) for rendering/scenes
- Vite for the dev server and static build
- `localStorage` for save data (per-game progress: book/chapter/enemy, XP,
  hearts, potions, treasures, seen hints) — no backend, no accounts,
  everything stays on the player's machine

## Run locally

```bash
npm install
npm run dev
```

Open the printed `http://localhost:5173` URL.

## Project layout

```
src/
  main.ts              Phaser.Game bootstrap, registers every scene
  scenes/
    BootScene.ts        preloads shared UI art, hands off to MainMenuScene
    MainMenuScene.ts     top-level: pick a game (Adventures / Volume 2) or Settings
    GameMenuScene.ts     per-game menu: Resume / New Game (opens the map) / Reset
    ChapterIntroScene.ts book map: chapter select, progress, Continue/Begin
    BattleScene.ts       the RPG battle itself: grid, attacks, dialogue, hints, XP
    SettingsScene.ts     reset-everything + music toggle
    DeluxeScene.ts       classic word-chain puzzle (not linked from the menu)
  game/
    LetterGrid.ts        shared chain-select letter grid
    letterTiles.ts       letter point values / tile RNG
    wordValidator.ts     dictionary lookup
    saveManager.ts       localStorage read/write (per-game AdvProgress)
    ui.ts                shared button + music-toggle widgets
    music.ts             background-music loader/looper (see "Background music")
    audioSettings.ts     persisted mute on/off flag
    cutscene.ts          plays the original .swf intros via Ruffle
    pam/                 PopCap PAM (.pam) animation decoder + Phaser player
                          (pamDecoder.ts, PamActor.ts, pamLoader.ts)
    adventures/           the data-driven battle engine
      gameData.ts          typed accessors over game_data*.json
      gameContext.ts       which of the 2 Adventures games is active
      rules.ts             letter bonuses, word damage, attack-urgency, gems
      BattleModel.ts       pure battle state (hearts, ailments, mods, enemy turn)
      defenses.ts          per-enemy armor/immunity/word-class defenses
      treasures.ts         equipped-treasure effect combination
      sfx.ts / musicMap.ts per-creature sound cues / per-book music tracks
      hints.ts             first-appearance "Hint!" box copy
      enemyOffsets.ts      manual per-pam on-screen position overrides
  assets/dictionary/words.json       167,737-word real dictionary
  assets/adventures/game_data.json           Adventures: books/chapters/creatures
  assets/adventures/game_data_vol2.json      Volume 2: same shape
  assets/adventures/{creatures,creature_pam,sounds,pam_sounds}*.json  supporting data
public/adventures/        real Lex/monster `.pam` animations, battle art, music,
                           sounds — gitignored (not published; see below)
public/adventures-vol2/   same layout, for Volume 2 — gitignored
public/deluxe/            real Deluxe tile art and sounds — gitignored
raw-assets/                unpacked original game files — gitignored (local only)
decompiled/                decompiled PopLua scripts (reference only) — gitignored
scripts/                  the whole extraction/decompile/build pipeline — see
                           individual files' docstrings; most relevant ones:
  extract_game_data.py     .luc scripts -> game_data*.json (chapters, creatures, rules)
  decode_pam.py            Python reference for the .pam animation format
  prepare_adventures_assets.py / prepare_map_assets.py   raw-assets -> public/
  build_image_index.py     per-game lowercase->real-filename index (case-sensitive hosts)
  extract_music.sh         music.mo3 -> public/adventures/music/song_NN.ogg
  asset_audit.py           regenerates ASSETS_TRACKER.md / ASSETS_UNUSED.txt
```

## Current state

Both Adventures games are fully playable end to end: real chapter/enemy
order per book, real per-chapter arenas, gems/tile statuses, enemy defenses,
dialogue, attack choreography, potions/treasures, XP/leveling, first-time
hint boxes, a chapter-select map, and now real background music (see below).
Progress is saved per game in `localStorage` and survives reloads.

**Bookworm Deluxe** has real tile art, sounds, and dictionary wired up
(`DeluxeScene.ts`), but its menu button was removed — the main menu is
Adventures-only for now. The scene is still registered in `main.ts` if it
gets re-added later.

**Approximated** (the original keeps these in native code or compiled Lua
bytecode, not extractable as plain data): Deluxe's letter point values
(Scrabble-style), the XP/level curve, level-up bonus sizes, gem drop
percentages, potion drop chance, plague spread, Scramble costing a turn.
These are tagged `APPROX` in the source — replace if real values turn up.

**Real intro cutscenes.** The original per-game intros are Flash (`.swf`)
animations, played via [Ruffle](https://ruffle.rs) (an open-source WASM
Flash emulator) so the *actual* original file plays, not a re-encoded video
(`src/game/cutscene.ts`). They have no embedded audio — confirmed by
decompressing the `.swf` and checking every tag/string in it, not just by
absence of sound.

See [ASSETS_TRACKER.md](ASSETS_TRACKER.md) / [ASSETS_UNUSED.txt](ASSETS_UNUSED.txt)
(regenerate with `python3 scripts/asset_audit.py`) for what fraction of each
game's extracted files are actually wired into the app.

## Repository / assets are not published

Per project policy, extracted game art/audio/data (`raw-assets/`,
`decompiled/`, `public/adventures*/{images,sounds,pam,cutscenes,music}`,
`public/deluxe/`) are **gitignored** — only source code is committed/pushed.
Keep them that way; don't `git add -f` these paths. If you need a fresh
checkout, re-run the `scripts/prepare_*`/`extract_*` pipeline against your
own copy of the original game files.

The repo's git history was rewritten once (via `git-filter-repo`) to purge
an earlier accidental commit of these asset directories — if you have an
older clone, don't `git pull` it (history diverged); re-clone instead, or
`git fetch && git reset --hard origin/main`.

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
- Volume 2's extracted `.pam`/image filenames don't always match the case the `.pam` data references them
  by (e.g. data says `lex_petrify1`, disk has `Lex_petrify1.png`; a handful of `.pam` files themselves are
  off too, e.g. `9BookBurner` vs `9Bookburner.pam`) — macOS' case-insensitive filesystem hides this, a normal
  static host won't. `scripts/build_image_index.py` writes `pam/images_index.json` and `pam/pam_index.json`
  (lowercase name → real on-disk name) per game; `pamLoader.ts` looks both up through these indexes before
  requesting a file. Regenerated automatically at the end of `prepare_adventures_assets.py`; re-run it by hand
  after adding/renaming raw Volume 2 art. Verified: all 156 Volume 2 creature/Lex pams and all real Volume 1
  pams now resolve every referenced part image with zero "failed to process file" errors.

### Background music
- `raw-assets/adventures/sounds/music.mo3` is the original game's music: a single tracker module
  (MO3/Impulse Tracker, decoded with `libopenmpt`'s `openmpt123`) bundling 16 unnamed subsongs — one long
  map theme plus several battle/boss cues. Volume 2 ships no music file of its own; its scripts reference the
  same `MUSIC_*` song-position constants Volume 1 uses, so both games share this one source.
- `scripts/extract_music.sh` renders each subsong and re-encodes it to `public/adventures/music/song_NN.ogg`
  (Opus-in-Ogg via `ffmpeg`). Needs `brew install libopenmpt` once.
- `src/game/music.ts` loads/loops/swaps tracks on a scene's sound manager; `src/game/adventures/musicMap.ts`
  maps each book to a `{map, battle, boss}` track triple. **That mapping is an unverified best guess** (picked
  by each subsong's rendered length, not by ear — the real numeric values behind `MUSIC_GREEK_MAP` etc. aren't
  in the decompiled scripts). `ChapterIntroScene` plays the map track; `BattleScene` plays battle or boss music
  per enemy. If a track sounds wrong for its book, swap the index in `musicMap.ts`.
