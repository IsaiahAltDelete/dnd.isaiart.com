// render/art/prop-brazier.js — generated from assets/pixel/props/brazier.pxa by tools/pxbuild.mjs; edit the .pxa and rebuild, never this file.
import { defineSprite } from '../sprites.js';

export const PROP_BRAZIER = Object.freeze({
  w: 16, h: 24,
  anchor: { x: 8, y: 24 },
  points: { flame: [7, 10], light: [7, 5] },
  palette: {
    a: '#323439', b: '#555963', c: '#7a808a', d: '#a1a7af', e: '#cbced2', '0': '#671015',
    '1': '#b52f13', '2': '#f07a2a', '3': '#f1c67a', '4': '#f6f0c7', K: '#1d1b24',
  },
  frames: {
    'glow-0': [
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '....KKKKKKKK....',
      '..KKab1021cdKK..',
      '.Keb02130120dcK.',
      'Keb1203423021dcK',
      'Kea0121302120dbK',
      'KdeeeddddcccbbaK',
      '.KcdcbbbbbbbbaK.',
      '..KcdbebbbebaK..',
      '...KcdbbbbbaK...',
      '....KKcbbaKK....',
      '......KcaK......',
      '.....KdcbaK.....',
      '....Kc.ca.bK....',
      '....Kc.ca.bK....',
      '...Kc..ca..bK...',
      '...Kc..ca..bK...',
      '..Kc...ca...bK..',
      '.Kcb..KcaK..baK.',
    ],
    'glow-1': [
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '....KKKKKKKK....',
      '..KKab1031cdKK..',
      '.Keb03140130dcK.',
      'Keb1304434031dcK',
      'Kea0131403130dbK',
      'KdeeeddddcccbbaK',
      '.KcdcbbbbbbbbaK.',
      '..KcdbebbbebaK..',
      '...KcdbbbbbaK...',
      '....KKcbbaKK....',
      '......KcaK......',
      '.....KdcbaK.....',
      '....Kc.ca.bK....',
      '....Kc.ca.bK....',
      '...Kc..ca..bK...',
      '...Kc..ca..bK...',
      '..Kc...ca...bK..',
      '.Kcb..KcaK..baK.',
    ],
    'glow-2': [
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '....KKKKKKKK....',
      '..KKab1021cdKK..',
      '.Keb02120120dcK.',
      'Keb1202322021dcK',
      'Kea0121202120dbK',
      'KdeeeddddcccbbaK',
      '.KcdcbbbbbbbbaK.',
      '..KcdbebbbebaK..',
      '...KcdbbbbbaK...',
      '....KKcbbaKK....',
      '......KcaK......',
      '.....KdcbaK.....',
      '....Kc.ca.bK....',
      '....Kc.ca.bK....',
      '...Kc..ca..bK...',
      '...Kc..ca..bK...',
      '..Kc...ca...bK..',
      '.Kcb..KcaK..baK.',
    ],
  },
  anims: {
    glow: {
      frames: ['glow-0', 'glow-0', 'glow-0', 'glow-0', 'glow-0', 'glow-0', 'glow-0', 'glow-0', 'glow-0', 'glow-0', 'glow-0', 'glow-0', 'glow-1', 'glow-1', 'glow-1', 'glow-1', 'glow-1', 'glow-1', 'glow-1', 'glow-1', 'glow-1', 'glow-1', 'glow-2', 'glow-2', 'glow-2', 'glow-2', 'glow-2', 'glow-2', 'glow-2', 'glow-2', 'glow-2', 'glow-2', 'glow-2', 'glow-2', 'glow-2'],
      fps: 50, loop: true, ms: 700,
      seq: ['glow-0', 'glow-1', 'glow-2'],
      durations: [240, 200, 260],
    },
  },
  recolor: {
    fire: {
      '0': '#671015', '1': '#b52f13', '2': '#f07a2a', '3': '#f1c67a', '4': '#f6f0c7',
    },
    cold: {
      '0': '#295ac2', '1': '#509ae3', '2': '#8ad0f0', '3': '#cbf1f7', '4': '#eafbfa',
    },
    lightning: {
      '0': '#9a6725', '1': '#d8af34', '2': '#e8e070', '3': '#f1ecb4', '4': '#faf9ea',
    },
    thunder: {
      '0': '#473bd0', '1': '#756be3', '2': '#a0a8f0', '3': '#dae3f8', '4': '#eaf2fa',
    },
    acid: {
      '0': '#2c6a22', '1': '#53a22c', '2': '#8ad040', '3': '#bcda78', '4': '#dfe6af',
    },
    poison: {
      '0': '#1f3f1d', '1': '#3f6f2f', '2': '#6aa040', '3': '#9cbe64', '4': '#c4cf96',
    },
    necrotic: {
      '0': '#1d192c', '1': '#40325b', '2': '#6a4a8a', '3': '#986caf', '4': '#be9dc6',
    },
    radiant: {
      '0': '#df7e23', '1': '#efb653', '2': '#f8e08a', '3': '#faf6c8', '4': '#fcfae9',
    },
    psychic: {
      '0': '#763586', '1': '#ba42bc', '2': '#d070c0', '3': '#dfa3ca', '4': '#efd6e1',
    },
    force: {
      '0': '#3225c0', '1': '#4c44e4', '2': '#7a8af0', '3': '#b8cbf5', '4': '#eaf2fb',
    },
    arcane: {
      '0': '#2b1fa8', '1': '#5331e3', '2': '#a070f0', '3': '#dab7f5', '4': '#f6eafb',
    },
    healing: {
      '0': '#2e9d87', '1': '#3ed097', '2': '#70e0a0', '3': '#a9eab9', '4': '#dff6e0',
    },
  },
});

defineSprite('prop-brazier', PROP_BRAZIER);
// One sprite per @recolor variant: prop-brazier-fire, prop-brazier-cold, ...
for (const [kind, palette] of Object.entries(PROP_BRAZIER.recolor)) {
  defineSprite(`prop-brazier-${kind}`, { ...PROP_BRAZIER, palette: { ...PROP_BRAZIER.palette, ...palette } });
}
export default PROP_BRAZIER;
