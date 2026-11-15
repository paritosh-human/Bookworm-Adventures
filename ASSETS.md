# Asset inventory — what's extracted vs. what's wired in

Running tracker so extracted game content doesn't get forgotten. Update the
Status column as things get wired into the app. "N/A" = genuinely not
useful for this remake (DRM, installer chrome, etc.), not just "not done yet".

## Bookworm Deluxe (`raw-assets/deluxe/`)

| Category | Count | Status |
|---|---|---|
| `wordlist.txt` + `bonus_word_dictionary.txt` | 2 files | ✅ decoded into `src/assets/dictionary/words.json` |
| `popdefs.txt` (word definitions) | 1 file | ⬜ not used — could power a "define this word" feature |
| `images/` (tiles, backdrops, UI, fx) | 279 | 🟡 only `tile.gif`/`tile_gold.gif` used; backdrop/UI chrome not used |
| `fonts/` (bitmap fonts) | 44 | ⬜ not used — using system/Phaser text instead |
| `sounds/` | 92 | 🟡 4 used (click/chomp/bad/gameover); voice lines (lex_*), music cues not used |
| `music/Bookworm1.mo3` | 1 | ⬜ not used — `.mo3` is a tracker-module format, needs a player (e.g. libopenmpt) |
| `BookWorm.exe`, `bass.dll` | 2 | N/A — native binary, not extractable without decompiling |

## Bookworm Adventures (`raw-assets/adventures/`) — Volume 2 has the same layout, not started

| Category | Count | Status |
|---|---|---|
| `scripts/creatures/Book{1,2,3}/*.luc` + `lore/*.lore` | ~155 creatures | ✅ roster + lore in `creatures.json` |
| `scripts/creatures/*/dialog/*.luc`, `*/wordlists/*.luc` | ~330 | ⬜ not used — compiled Lua bytecode (battle dialog lines, per-monster attack wordlists); would need `.luc` decompiling |
| `images/pam/*.pam` + `images/pam/images/` | 273 pam + 2964 parts | ✅ 136/155 creatures rendering via the `.pam` player |
| `images/cutscenes/` (gifs/jpgs: curtain, cinematic frame) | 10 | ⬜ not used |
| `cutscenes/intro.swf` | 1 | ✅ plays before entering Bookworm Adventures (via Ruffle — a WASM Flash emulator, since Flash itself is discontinued; see `src/game/cutscene.ts`) |
| `cutscenes/Book2Intro.swf`, `Book3Intro.swf`, `Book3End.swf` | 3 | ⬜ extracted, not wired — would play at book 2/3 transitions, but `BattleScene` doesn't currently track book boundaries within the flattened 155-monster roster |
| `images/mainmenu/` | 64 | ⬜ not used — our menu is plain text/buttons |
| `images/hof/` (Hall of Fame / leaderboard UI) | 33 | ⬜ not used |
| `images/tutorial/` (portraits, tutorial panels) | 73 | 🟡 2 Lex portraits used; rest (other character portraits, tutorial panels) not used |
| `images/statsbook/`, `images/wordscroll/` | 52 | ⬜ not used |
| `images/treasures/`, `images/items/` | 91 | ⬜ not used — no treasure/item system implemented |
| `images/board/ui_top`, `ui_bottom1`, `ui_bottom2` + `widescreen_left/right` (battle screen frame: name bars, bookshelf, curtains, pedestals) | 5 | ✅ battle screen is laid out on the original 800x600 frame |
| `images/arenas/Book{1,2,3}/Sky.jpg` | 3 | 🟡 one sky per book; the other 20 arena backgrounds (sunset, stormy, sea, swamp, underworld…) are per-chapter and need `.luc` decoding to place |
| `pam/MG{book}-{chapter}.pam`, `FG{book}-{chapter}.pam` (+ `MG_Stadium`/`FG_Stadium`) — per-chapter scenery layers (distant islands/clouds; fighting ground, Parthenon, trees, urns) with `stage1`–`stage7` labels | 62 | 🟡 wired for Books 1–3; chapter comes from the monster's pam filename, but the stage (1–7) is a guess since the real order lives in `Book*.luc` — the roster order is alphabetical, not game order |
| `pam/lex.pam` (animated Lex, many labels) | 1 | 🟡 idle/idlesad, attack1-7, flinch, death are triggered by gameplay (monsters: flinch, attack1, death); eat, levelup, stunned/frozen/petrify, click-giggle/burp not used |
| `images/tiles/tile_basic.jpg` + `pips.jpg`, `images/board/heart_small*.png` | 4 | ✅ real cream tiles with bronze/silver/gold pips; hearts for health (Lex 5, monster ~1 per 9 HP) |
| `images/tiles/` gem tiles (ruby, emerald, sapphire, diamond, fire, plagued, smashed…), `pam/fx_*.pam`, `grid_frozen/petrify/stunned.pam` | ~40 | ⬜ not used — gem/status-effect system not implemented |
| `images/board/` (rest: gravestone, altar, boss banner, scramble button, potion/treasure pedestals, xp bar) | ~60 | ⬜ not used |
| `images/books/book{1,2,3}/` (chapter cover art) | 132 | ⬜ not used — no book-select screen |
| `images/minigames/*` (letterrip, linknspell, wordmaster) | 70 | ⬜ not used — minigames not implemented |
| `images/arenas/`, `images/characters/`, `images/effects/`, `images/LevelUp/`, `images/misc/`, `images/upsell/` | ~155 | ⬜ not used |
| `sounds/` (161 files: attack sfx, lex voice lines, music stingers) | 161 | 🟡 4 used (click/chomp/bad/cheer); elemental attack sfx (Lightning/Poison/Slicing/etc.), most lex_* voice lines not used |
| `data/*.xml` (credits, hof, layout_*) | 9 | ⬜ not used — these are original UI layout definitions, not content data |
| `scripts/attacks/`, `defenses/`, `effects/`, `items/`, `packs/`, `tiles/`, `treasures/`, `wordlists/`, `MiniGames/`, `common/`, `fireworks/` | ~115 | ⬜ not used — compiled `.luc` game-logic scripts (combat formulas, gem effects, minigame logic); would need `.luc` decompiling, same blocker as monster stats |
| `fonts/` | 27 | ⬜ not used |
| `properties/` | 11 | ⬜ not used — DRM/partner metadata, likely N/A |

## Bookworm Adventures Volume 2 (`raw-assets/adventures-vol2/`)

Not started at all — same category breakdown as Adventures above, plus Books
0/4/5/6 creature data, its own minigames (goldencoins, luckynumbers,
mutantwords, wordup), and a `replay`/`bookselect` system Adventures 1 doesn't
have. Its 5 cutscenes (`intro.swf`, `Book4Intro`, `Book5Intro`, `Book6Intro`,
`Book6End`) are extracted into `raw-assets/adventures-vol2/cutscenes/` but
not wired up.

## Legend
✅ wired in · 🟡 partially used · 🔵 actively being worked on · ⬜ not started · N/A not applicable
