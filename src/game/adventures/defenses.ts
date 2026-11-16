// Enemy defenses (PAMDefaultDefend entries in the creature scripts): armor, ailment immunities,
// word-length immunity and bonus word categories. The scripts only carry the descriptions, so the
// magnitudes are read from the wording (resistant = x0.75, very resistant = x0.5; APPROX).
import type { CreatureDef } from './types.ts';

export interface DefenseProfile {
  /** damage multiplier from armor */
  resist: number;
  immune: Set<'poison' | 'fire' | 'freeze'>;
  /** word lengths that do no damage */
  immuneLengths: number[];
  /** words that take extra damage, with the multiplier */
  bonus: { name: string; words: Set<string>; mult: number }[];
}

const CATEGORY_LIST: [RegExp, string, string][] = [
  [/bone/, 'bone', 'bone'],
  [/metal/, 'metals', 'metal'],
  [/felin/, 'bigcats', 'feline'],
  [/colou?r/, 'colors', 'color'],
  [/fruit/, 'fruitsandvegs', 'fruit & vegetable'],
  [/\bfire\b(?! attun)(?=.*(words|related))/, 'fire', 'fire'],
];

export function emptyDefense(): DefenseProfile {
  return { resist: 1, immune: new Set(), immuneLengths: [], bonus: [] };
}

export function buildDefense(c: CreatureDef & { defenses?: { list: { name: string; description: string }[]; bonusMult: number } }, wordlists: Record<string, string[]>): DefenseProfile {
  const d = emptyDefense();
  for (const def of c.defenses?.list ?? []) {
    const t = `${def.name} ${def.description}`.toLowerCase();
    if (/very resistant|heavily armored|dug in/.test(t)) d.resist = Math.min(d.resist, 0.5);
    else if (/resistant to damage|armored/.test(t)) d.resist = Math.min(d.resist, 0.75);
    for (const k of ['poison', 'fire', 'freeze'] as const) if (new RegExp(`immune to[^.]*${k}`).test(t)) d.immune.add(k);
    const len = /(\d)\s*\+\s*(\d)-letter|(\d) and (\d)-letter/.exec(t);
    if (len) d.immuneLengths.push(Number(len[1] ?? len[3]), Number(len[2] ?? len[4]));
    else {
      const one = /(\d)-letter/.exec(t);
      if (one && /immun|no effect/.test(t)) d.immuneLengths.push(Number(one[1]));
    }
    if (/bonus category|weak to|extra damage|added damage/.test(t)) {
      for (const [re, list, label] of CATEGORY_LIST) {
        if (re.test(t) && wordlists[list] && !d.bonus.some((b) => b.name === label)) {
          d.bonus.push({ name: label, words: new Set(wordlists[list]), mult: c.defenses?.bonusMult ?? 2 });
        }
      }
    }
  }
  d.immuneLengths = [...new Set(d.immuneLengths)];
  return d;
}
