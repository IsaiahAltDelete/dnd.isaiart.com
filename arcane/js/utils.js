// js/utils.js
export const randomItem = arr => arr[Math.floor(Math.random() * arr.length)];
export const randomNumber = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
export const rollDice = diceString => {
  const match = diceString.match(/(\d+)d(\d+)([+-]\d+)?/);
  if (!match) return 0;
  const [, numDice, dieType, modifier] = match;
  let total = 0;
  for (let i = 0; i < parseInt(numDice, 10); i++) {
    total += randomNumber(1, parseInt(dieType, 10));
  }
  return modifier ? total + parseInt(modifier, 10) : total;
};

export const getChargeDieForSpellLevel = level => {
  if (level === 1) return "1d4";
  if (level === 2) return "1d6";
  return "1d10";
};