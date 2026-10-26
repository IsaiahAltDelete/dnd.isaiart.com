// tools/px/crop.mjs — cut a region out of a PNG and blow it up, for judging pixels.
//   node tools/px/crop.mjs in.png out.png x y w h [scale=4]   (coords in the input's pixels)
import { readPNG, writePNGImg, crop } from './pngio.mjs';
const [, , IN, OUT, x, y, w, h, s = '4'] = process.argv;
writePNGImg(OUT, crop(readPNG(IN), +x, +y, +w, +h), +s);
console.log(OUT);
