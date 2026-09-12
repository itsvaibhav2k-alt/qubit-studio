/** Illustration coordinates only. These shapes never produce electrical parameters.
 * See docs/layout-wave1-integration.md before aligning with Fable's 3D checkpoint. */
export const LAYOUT_BOUNDS = { x: 50, y: 30, width: 920, height: 550, centerX: 510, centerY: 305 };
export const LEFT_ELECTRODE = 'M210 235H350V265H375V277H397V286H417V293H436V299H451V304H465V307H487V313H465V316H451V321H436V327H417V334H397V343H375V355H350V385H210Z';
export const RIGHT_ELECTRODE = 'M790 235H650V265H625V277H603V286H583V293H564V299H549V304H535V307H513V313H535V316H549V321H564V327H583V334H603V343H625V355H650V385H790V329H711V291H790Z';
export const GROUND_BOUNDARY = 'M223 147H777L799 169V451L777 473H223L201 451V169Z';
// A cutout in the METAL. The navy substrate under it is continuous.
export const METAL_OPENING = 'M201 226H357V257L410 271L489 294H511L590 271L643 257V226H799V286H815V334H799V394H643V363L590 349L511 326H489L410 349L357 363V394H201Z';
export interface LayoutCamera { x: number; y: number; zoom: number }
export const OVERVIEW_CAMERA: LayoutCamera = { x: LAYOUT_BOUNDS.centerX, y: LAYOUT_BOUNDS.centerY, zoom: 1 };
export const JUNCTION_CAMERA: LayoutCamera = { x: 500, y: 310, zoom: 3.6 };
export function boundedCamera(camera: LayoutCamera): LayoutCamera {
  return { x: Math.max(100, Math.min(900, camera.x)), y: Math.max(70, Math.min(550, camera.y)), zoom: Math.max(1, Math.min(6, camera.zoom)) };
}
/** 100% always means fit the entire illustration, independent of the viewport size. */
export function layoutViewBox(width: number, height: number, camera: LayoutCamera) {
  const aspect = Math.max(width, 1) / Math.max(height, 1);
  const fitWidth = Math.max(LAYOUT_BOUNDS.width, LAYOUT_BOUNDS.height * aspect);
  const fitHeight = fitWidth / aspect;
  const w = fitWidth / camera.zoom, h = fitHeight / camera.zoom;
  return { x: camera.x - w / 2, y: camera.y - h / 2, width: w, height: h };
}
