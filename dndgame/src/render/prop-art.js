import { drawSprite } from './sprites.js';
import './art/scenery-props.js';

export function paintProp(ctx,x,y,frame,variant=0){
  drawSprite(ctx,'scenery-props',frame,x,y,{anchor:'topleft',shadow:false,flip:(frame==='rubble'||frame==='bush')&&!!(variant&1)});
}
