// render/art/floor-waystone.js — generated from assets/pixel/tiles/floor-waystone.pxa by tools/pxbuild.mjs; edit the .pxa and rebuild, never this file.
import { defineSprite } from '../sprites.js';

export const FLOOR_WAYSTONE = Object.freeze({
  w: 16, h: 16,
  anchor: { x: 0, y: 0 },
  palette: {
    d: '#414850', m: '#626b6a', l: '#8a8c7a',
  },
  frames: {
    idle: [
      '.......ll.......',
      '......lmdl......',
      '.....lmddml.....',
      '....lmddddml....',
      '...lm..ll..ml...',
      '..lm...lm...ml..',
      '.lm....lm....ml.',
      'lmllllllmlllllml',
      'ldmmmmmmddddddmd',
      '.dm....md....md.',
      '..dm...md...md..',
      '...dm..dd..md...',
      '....dmddddmd....',
      '.....dmddmd.....',
      '......dmmd......',
      '.......dd.......',
    ],
  },
  anims: {
  },
});

defineSprite('floor-waystone', FLOOR_WAYSTONE);
export default FLOOR_WAYSTONE;
