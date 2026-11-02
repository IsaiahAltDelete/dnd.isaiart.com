// render/art/city-meal.js — generated from assets/pixel/props/city-meal.pxa by tools/pxbuild.mjs; edit the .pxa and rebuild, never this file.
import { defineSprite } from '../sprites.js';

export const CITY_MEAL = Object.freeze({
  w: 32, h: 12,
  anchor: { x: 16, y: 12 },
  palette: {
    K: '#28202a', p: '#e2cfa2', q: '#645344', w: '#e9ddb8', r: '#804638', R: '#c18b4d',
    m: '#8296a0', M: '#4c616e',
  },
  frames: {
    idle: [
      '......................KK........',
      '.....................KmmK.......',
      '.....KKKK...........KmwwmK......',
      '...KKppppKK....KKKK.KmwwmKK.....',
      '..KppRppRppK..KmmmmK.KmwwmKmK...',
      '.KppRppRppppK.KmwwmK.KmmmKmK....',
      '.KqppppppppqK.KmwwmKKKKKKK......',
      '..KqqqqqqqqK...KMMK..KrrrK......',
      '...KKKKKKKK.....KK...KRRrK......',
      '......................KKK.......',
      '................................',
      '................................',
    ],
  },
  anims: {
  },
});

defineSprite('city-meal', CITY_MEAL);
export default CITY_MEAL;
