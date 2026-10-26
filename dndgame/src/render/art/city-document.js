// render/art/city-document.js — generated from assets/pixel/props/city-document.pxa by tools/pxbuild.mjs; edit the .pxa and rebuild, never this file.
import { defineSprite } from '../sprites.js';

export const CITY_DOCUMENT = Object.freeze({
  w: 16, h: 8,
  anchor: { x: 8, y: 8 },
  palette: {
    K: '#28202a', p: '#e2cfa2', P: '#aa8b60', q: '#645344',
  },
  frames: {
    idle: [
      '..KKKKKKKKKK....',
      '.KppppppppppK...',
      '.KpqqppqqpppK...',
      '.KppppppppppK...',
      '.KpqqqqqqpppK...',
      '.KPPPPPPPPPPK...',
      '..KKKKKKKKKK....',
      '................',
    ],
  },
  anims: {
  },
});

defineSprite('city-document', CITY_DOCUMENT);
export default CITY_DOCUMENT;
