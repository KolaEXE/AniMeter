export const PX_PER_CM = 1;
export const WORLD_HEIGHT_CM = 5000000;
export const WORLD_HEIGHT_PX = WORLD_HEIGHT_CM * PX_PER_CM;
export const GROUND_Y = WORLD_HEIGHT_PX;
export const METERS_ON_RULER = WORLD_HEIGHT_CM / 100;

export function buildRuler(rulerElement) {
  rulerElement.replaceChildren();
}
