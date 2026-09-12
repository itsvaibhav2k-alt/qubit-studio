import assert from 'node:assert/strict';
import test from 'node:test';
import { INITIAL_LAYOUT_VIEW, INSPECTIONS, inspectPart, returnFromInspection } from './layout-inspection.ts';
import { layoutViewBox } from './layout-geometry.ts';

test('inspection follows different parts and pad focuses without losing the original camera',()=>{
 const origin={...INITIAL_LAYOUT_VIEW,camera:{x:530,y:280,zoom:1.25}};
 let view=inspectPart(origin,'capacitor',1000,560);
 assert.equal(view.inspecting,'capacitor');
 view=inspectPart(view,'capacitor',1000,560,'right');assert.equal(view.padFocus,'right');assert.equal(view.camera.x,670);
 view=inspectPart(view,'gate',1000,560);view=inspectPart(view,'ground',1000,560);
 assert.deepEqual(returnFromInspection(view),{...INITIAL_LAYOUT_VIEW,camera:origin.camera});
 assert.deepEqual(origin.camera,{x:530,y:280,zoom:1.25});
});
test('each non-junction inspection frames its region on desktop and narrow screens',()=>{
 for(const part of ['capacitor','gate','ground','substrate'] as const){
  for(const [w,h] of [[1100,550],[980,400],[390,340]]){
   const view=inspectPart(INITIAL_LAYOUT_VIEW,part,w,h),box=layoutViewBox(w,h,view.camera);
   const [x,y,rw,rh]=INSPECTIONS[part].region;
   assert.ok(box.x<=x-rw/2+1e-8&&box.x+box.width>=x+rw/2-1e-8,part+' horizontal fit');
   assert.ok(box.y<=y-rh/2+1e-8&&box.y+box.height>=y+rh/2-1e-8,part+' vertical fit');
  }
 }
});
