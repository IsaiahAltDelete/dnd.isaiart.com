import assert from 'node:assert/strict';
import { createCharacter, restLong } from '../src/rules/character.js';
import { addCondition, conditionMech } from '../src/rules/conditions.js';

const hero = () => createCharacter({ name: 'Rest regression', speciesId: 'human', classId: 'fighter', level: 3, backgroundId: 'soldier' });
const downed = hero();
downed.hp = 0;
addCondition(downed, 'dying');
addCondition(downed, 'unconscious');
assert.equal(conditionMech(downed).noActions, true);
restLong(downed);
assert.equal(downed.hp, downed.maxHp);
assert.equal(conditionMech(downed).noActions, false);
assert.equal(conditionMech(downed).incapacitated, false);
assert.ok(!conditionMech(downed).ids.includes('dying'));

const tired = hero();
addCondition(tired, 'exhaustion', { level: 2 });
const oldPenalty = conditionMech(tired).d20Penalty;
restLong(tired);
assert.equal(tired.conditions.find(c => c.id === 'exhaustion').level, 1);
assert.equal(oldPenalty, -4);
assert.equal(conditionMech(tired).d20Penalty, -2);

const petrified = hero();
addCondition(petrified, 'petrified');
conditionMech(petrified);
restLong(petrified);
assert.ok(conditionMech(petrified).ids.includes('petrified'));
assert.equal(conditionMech(petrified).incapacitated, true);

const dead = hero();
dead.hp = 0;
dead.deathSaves = { success: 0, fail: 3, stable: false };
restLong(dead);
assert.equal(dead.hp, 0);
console.log('PASS: downed recovery, exhaustion recalculation, persistent petrification, no resurrection.');
