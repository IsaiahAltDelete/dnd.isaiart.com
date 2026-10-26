// render/art/city-arcana.js — generated from assets/pixel/props/city-arcana.pxa by tools/pxbuild.mjs; edit the .pxa and rebuild, never this file.
import { defineSprite } from '../sprites.js';

export const CITY_ARCANA = Object.freeze({
  w: 32, h: 16,
  anchor: { x: 16, y: 16 },
  palette: {
    K: '#28202a', p: '#e2cfa2', P: '#aa8b60', q: '#645344', g: '#778e75', G: '#b5c6a1',
    r: '#804638', R: '#c18b4d', m: '#8296a0', M: '#4c616e', t: '#bf9b65',
  },
  frames: {
    idle: [
      '.....KK.........................',
      '....KGGK........................',
      '...KGGggK.......................',
      '...KGgggK...............tt......',
      '....KggK...............t..t.....',
      '.....KK...............t.KK.t....',
      '....KRRK.............t.KppK.t...',
      '...KRRrrK.....KK.....t.KpPK.t...',
      '..KRRrrrK....KmmK.....t.KK.t....',
      '..KrrrrrK...KmGGmK.....tttt.....',
      '...KKKKK....KmGgmK......tt......',
      '.............KMMK......KrrK.....',
      '....KKKKK....KrrK.....KrrrrK....',
      '...KpppPPK...KrrK......KKKK.....',
      '...KPPPqqK....KK................',
      '....KKKKK.......................',
    ],
  },
  anims: {
  },
});

defineSprite('city-arcana', CITY_ARCANA);
export default CITY_ARCANA;
