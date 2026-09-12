import assert from 'node:assert/strict';
import test from 'node:test';
import { boundedCamera, JUNCTION_CAMERA, layoutViewBox, OVERVIEW_CAMERA } from './layout-geometry.ts';

test('100% fits the entire illustration across laptop and desktop aspect ratios',()=>{
 for(const [w,h] of [[1100,560],[980,430],[390,400]]){
  const box=layoutViewBox(w,h,OVERVIEW_CAMERA);
  assert.ok(box.x<=80&&box.y<=48&&box.x+box.width>=942&&box.y+box.height>=562);
  assert.ok(Math.abs(box.width/box.height-w/h)<1e-9);
 }
});
test('inspection and zoom use one magnification convention without physical units',()=>{
 const overview=layoutViewBox(1000,600,OVERVIEW_CAMERA),detail=layoutViewBox(1000,600,JUNCTION_CAMERA);
 assert.equal(overview.width/detail.width,JUNCTION_CAMERA.zoom);
 assert.equal(detail.x+detail.width/2,500);assert.equal(detail.y+detail.height/2,310);
 assert.deepEqual(boundedCamera({x:-50,y:800,zoom:20}),{x:100,y:550,zoom:6});
 assert.deepEqual(boundedCamera({x:510,y:305,zoom:.25}),OVERVIEW_CAMERA);
});
