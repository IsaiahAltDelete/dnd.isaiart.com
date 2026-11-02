// render/art/counter-goods.js — generated from assets/pixel/props/counter-goods.pxa by tools/pxbuild.mjs; edit the .pxa and rebuild, never this file.
import { defineSprite } from '../sprites.js';

export const COUNTER_GOODS = Object.freeze({
  w: 32, h: 12,
  anchor: { x: 16, y: 12 },
  palette: {
    K: '#30251e', p: '#d6c39b', P: '#776449', q: '#94774f', r: '#6a3934', R: '#bd9d55',
    t: '#c39d62', G: '#a7ad78', g: '#4d7051',
  },
  frames: {
    idle: [
      '................................',
      '..........................KK....',
      '..........................GG....',
      '.........................KggK...',
      '...KKKKKK........KKKK....KGggK..',
      '..KppppppK......KrrrrK...KGggK..',
      '..KpPPpppK..KK..KrrrrK...KgggK..',
      '..KppppppK.KttK.KrRrrK....KKK...',
      '..KqqqqqqK.KttK.KrrrrK..........',
      '...KKKKKK...KK...KKKK...........',
      '................................',
      '................................',
    ],
  },
  anims: {
  },
});

defineSprite('counter-goods', COUNTER_GOODS);
export default COUNTER_GOODS;
