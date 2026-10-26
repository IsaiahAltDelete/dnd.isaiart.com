// render/art/city-place.js — generated from assets/pixel/props/city-place.pxa by tools/pxbuild.mjs; edit the .pxa and rebuild, never this file.
import { defineSprite } from '../sprites.js';

export const CITY_PLACE = Object.freeze({
  w: 16, h: 8,
  anchor: { x: 8, y: 8 },
  palette: {
    K: '#28202a', p: '#e2cfa2', q: '#645344', w: '#e9ddb8', R: '#c18b4d', m: '#8296a0',
    M: '#4c616e',
  },
  frames: {
    idle: [
      '............KK..',
      '...........KmmK.',
      '..KKKKKK...KwmK.',
      '.KppRpppK..KwmK.',
      '.KpppppqK..KMMK.',
      '..KqqqqK....KK..',
      '...KKKK.........',
      '................',
    ],
  },
  anims: {
  },
});

defineSprite('city-place', CITY_PLACE);
export default CITY_PLACE;
