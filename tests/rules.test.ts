import assert from 'node:assert/strict';
import { adjustedLength, wordDamage, urgency, chooseAttack, newAttackStates, pipFrame, lexAttackFrame } from '../src/game/adventures/rules.ts';
import { BattleModel, levelForXp, levelBonuses } from '../src/game/adventures/BattleModel.ts';
import type { CreatureDef } from '../src/game/adventures/types.ts';

assert.equal(adjustedLength('cat'), 4);        // c=.25 -> ceil(3.25)
assert.equal(adjustedLength('sun'), 3);
assert.equal(wordDamage('sun'), 0.5);
assert.equal(wordDamage('sunshine'), 3.5); assert.equal(wordDamage('sunrise'), 2);
assert.equal(wordDamage('ox'), 0);             // min 3 letters
assert.equal(wordDamage('sun', 0.15), 0.75);   // ceilQ(0.575)=0.75
assert.equal(wordDamage('sun', 0, 0, 0.5), 0.25);
assert.equal(pipFrame('a'), 0); assert.equal(pipFrame('b'), 1); assert.equal(pipFrame('z'), 2);
assert.match(lexAttackFrame('sun', () => 0), /^attack[12]$/);

const mk = (min: number, max: number, name: string) => ({ effects: [{ cls: 'DamageEffect', args: [0.5] }], min, max, frame: 'attack1', name, description: '' });
// a max==min attack is forced; one not yet allowed is never chosen
let st = newAttackStates([mk(0, 100, 'a'), mk(3, 3, 'b')]);
assert.equal(urgency(st[1]), 0);
assert.equal(chooseAttack(st, () => 0.5)!.def.name, 'a');
st[1].counter = 3; assert.equal(urgency(st[1]), 100);
assert.equal(chooseAttack(st, () => 0)!.def.name, 'b');

const c: CreatureDef = { id: 'T', name: 'T', hearts: 2, xp: 0, treasure: null, pam: ['x'], defense: null, book: 1,
  attacks: [{ effects: [{ cls: 'DamageEffect', args: [0.5] }, { cls: 'PoisonAilment', args: [0.25, 1, 2, 0] }, { cls: 'StunEffect', args: [1, 100] }, { cls: 'DestroyedTileEffect', args: [2, 3] }], min: 0, max: 0, frame: 'attack1', name: 'Hit', description: '' }] };
const m = new BattleModel(c, 1, undefined, () => 0.1);
assert.equal(m.lexMax, 3);
const t = m.enemyTurn();
assert.equal(t.damage, 0.5); assert.equal(t.ailmentDamage, 0.25); assert.equal(m.lex, 2.25);
assert.equal(m.stunTurns, 1); assert.deepEqual(t.tiles, [{ kind: 'smash', count: 3, turns: 2 }]);
m.enemyTurn(); assert.equal(m.ailments.length, 1); m.enemyTurn(); // poison lasts 2 ticks per application
assert.equal(m.playerAttack('sunshine'), 3.5); assert.ok(m.enemyDead);
assert.equal(levelForXp(0), 1); assert.equal(levelForXp(10), 2);
assert.deepEqual(levelBonuses(4), { health: 1, attack: 0.1, defense: 0.25 });
console.log('rules OK');

// potions + treasures
import { combineTreasures } from '../src/game/adventures/treasures.ts';
const mods = combineTreasures(['HephaestusHammer', 'AegisOfAthena', 'TheseusBoots', 'GoldenFleece']);
const m2 = new BattleModel(c, 1, undefined, () => 0.1, mods);
assert.equal(m2.lexMax, 4);
assert.equal(m2.playerAttack('sun'), 1);                       // 0.5 + 0.5 hammer
const t2 = m2.enemyTurn(); assert.equal(t2.damage, 0);          // aegis negates a 0.5 hit
assert.equal(m2.stunTurns, 0);                                  // boots always resist stun
const m3 = new BattleModel(c, 1, 1, () => 0.9);
assert.equal(m3.usePotion('health'), true); assert.equal(m3.lex, 3);
assert.equal(m3.usePotion('health'), false);                    // already full
assert.equal(m3.usePotion('attack'), true); assert.equal(m3.usePotion('attack'), false);
assert.equal(m3.playerAttack('sun'), 1);                        // x2 of 0.5
console.log('treasures/potions OK');
