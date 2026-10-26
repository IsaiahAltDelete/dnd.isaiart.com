// render/art/city-papers.js — generated from assets/pixel/props/city-papers.pxa by tools/pxbuild.mjs; edit the .pxa and rebuild, never this file.
import { defineSprite } from '../sprites.js';

export const CITY_PAPERS = Object.freeze({
  w: 32, h: 12,
  anchor: { x: 16, y: 12 },
  palette: {
    K: '#28202a', p: '#e2cfa2', P: '#aa8b60', q: '#645344', r: '#804638', R: '#c18b4d',
    m: '#8296a0', M: '#4c616e', t: '#bf9b65',
  },
  frames: {
    idle: [
      '.........................t......',
      '........................tt......',
      '...KKKKKKKKK...........tt.......',
      '..KpppppppppK...KKK...Ktt.......',
      '..KpqqppqqppK..KmmmK.KmK........',
      '..KpppppppppK..KMMMKKMMK........',
      '..KpqqqqqqppK...KKK..KK.........',
      '..KpppppppppK.......KKKKKK......',
      '..KPPPPPPPPPK......KrrRrrrK.....',
      '...KKKKKKKKK.......KrrRrrrK.....',
      '....................KKKKKK......',
      '................................',
    ],
  },
  anims: {
  },
});

defineSprite('city-papers', CITY_PAPERS);
export default CITY_PAPERS;
