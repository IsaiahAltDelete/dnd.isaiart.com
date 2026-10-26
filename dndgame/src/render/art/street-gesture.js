// render/art/street-gesture.js — generated from assets/pixel/chars/street-gesture.pxa by tools/pxbuild.mjs; edit the .pxa and rebuild, never this file.
import { defineSprite } from '../sprites.js';

export const STREET_GESTURE = Object.freeze({
  w: 12, h: 6,
  anchor: { x: 6, y: 3 },
  palette: {
    K: '#46332e', s: 'SKIN', l: 'SKIN_L', d: 'SKIN_D', c: 'MAIN', C: 'MAIN_D',
  },
  frames: {
    'clap-open': [
      '............',
      '..Kll..llK..',
      '..Kss..ssK..',
      '...Kd..dK...',
      '............',
      '............',
    ],
    'clap-closed': [
      '............',
      '....KllK....',
      '....KssK....',
      '....KddK....',
      '............',
      '............',
    ],
    offer: [
      '............',
      '......KlllK.',
      '....KssssK..',
      '....KdddK...',
      '............',
      '............',
    ],
    talk: [
      '.......KllK.',
      '.......KssK.',
      '......KsdK..',
      '......KdK...',
      '............',
      '............',
    ],
    'offer-right': [
      '............',
      '............',
      '...ccKllK...',
      '..cCCKssK...',
      '...CCKddK...',
      '............',
    ],
    'offer-left': [
      '............',
      '............',
      '....KllKcc..',
      '....KssKCCc.',
      '....KddKCC..',
      '............',
    ],
    'offer-up': [
      '............',
      '............',
      '....KllK....',
      '....KssK....',
      '.....dc.....',
      '.....cC.....',
    ],
    'offer-down': [
      '.....cC.....',
      '.....dc.....',
      '....KllK....',
      '....KssK....',
      '....KddK....',
      '............',
    ],
    'strum-high': [
      '............',
      '....c.......',
      '....CcKllK..',
      '.....CKssK..',
      '......KddK..',
      '............',
    ],
    'strum-low': [
      '............',
      '............',
      '....c.......',
      '....Cc......',
      '.....CKllK..',
      '......KssK..',
    ],
  },
  anims: {
  },
});

defineSprite('street-gesture', STREET_GESTURE);
export default STREET_GESTURE;
