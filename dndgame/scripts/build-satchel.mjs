// scripts/build-satchel.mjs — kept so old notes still work: the satchel now builds with every other .pxa.
// assets/pixel/satchel.pxa carries `@export frames SATCHEL src/render/satchel-art.js`, and
// tools/pxbuild.mjs writes that module byte for byte as this script used to.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const tool = fileURLToPath(new URL('../tools/pxbuild.mjs', import.meta.url));
const src = fileURLToPath(new URL('../assets/pixel/satchel.pxa', import.meta.url));
process.exit(spawnSync(process.execPath, [tool, src], { stdio: 'inherit' }).status ?? 1);
