import type { LensInfo } from 'expo-camera';

/**
 * How the camera zooms, worked out from the lenses the phone reports.
 *
 * On iPhones with several back lenses we use the combined "virtual" camera,
 * which switches lens by itself as you zoom (like the Camera app): zoom factor
 * 1 is the ultra wide (0.5x), the main lens takes over at the first
 * switch-over factor (1x), the telephoto at the next one (2x/3x/4x/5x).
 *
 * `exact` is only true on builds with Relive's camera patch, which accepts an
 * exact zoom factor. Older builds get the stock 0–1 zoom range instead.
 */
export type ZoomSetup = {
  /** Lens to select (`selectedLens`), or undefined for the default camera. */
  lens: string | undefined;
  exact: boolean;
  /** Zoom factor shown as "1x". */
  wide: number;
  min: number;
  max: number;
  /** Quick-zoom stops, as zoom factors (e.g. 0.5x, 1x, 2x, 5x). */
  stops: number[];
  /** Factors where the phone switches lens, with the lens's name. */
  lenses: { from: number; name: string }[];
};

const T = 'AVCaptureDeviceType';
const TRIPLE = `${T}BuiltInTripleCamera`;
const DUAL_WIDE = `${T}BuiltInDualWideCamera`;
const DUAL = `${T}BuiltInDualCamera`;

export const FALLBACK_ZOOM: ZoomSetup = {
  lens: undefined,
  exact: false,
  wide: 1,
  min: 1,
  max: 1,
  stops: [],
  lenses: [{ from: 1, name: 'Wide' }],
};

export function zoomSetup(lenses: LensInfo[], facing: 'front' | 'back'): ZoomSetup {
  const pick =
    facing === 'back'
      ? (lenses.find((l) => l.deviceType === TRIPLE) ??
        lenses.find((l) => l.deviceType === DUAL_WIDE) ??
        lenses.find((l) => l.deviceType === DUAL))
      : undefined;
  const exact = lenses.some((l) => typeof l.maxZoomFactor === 'number');
  // Unpatched builds: the default camera at its normal 1x (selecting the
  // virtual camera there would start on the ultra wide).
  if (!exact) return FALLBACK_ZOOM;

  if (!pick) {
    // A single lens (front camera, or a one-lens iPhone): digital zoom only.
    const single = lenses[0];
    const min = single?.minZoomFactor ?? 1;
    const max = Math.min(single?.maxZoomFactor ?? 1, facing === 'front' ? 3 : 10);
    return {
      lens: undefined,
      exact: true,
      wide: min,
      min,
      max,
      stops: facing === 'back' && max >= 2 ? [min, 2 * min] : [],
      lenses: [{ from: min, name: facing === 'front' ? 'Front' : 'Wide' }],
    };
  }

  const switches = pick.switchOverZoomFactors ?? [];
  const hasUltraWide = pick.deviceType !== DUAL;
  const wide = hasUltraWide ? (switches[0] ?? 2) : 1;
  const tele = hasUltraWide ? switches[1] : switches[0];
  const min = pick.minZoomFactor ?? 1;
  // Same reach as the Camera app: up to 25x with a 5x telephoto, 15x otherwise, 10x without one.
  const reach = tele ? (tele / wide >= 5 ? 25 : 15) : 10;
  const max = Math.min(pick.maxZoomFactor ?? wide * reach, wide * reach);

  const stops = [...(hasUltraWide ? [min] : []), wide, wide * 2];
  if (tele && tele / wide > 2.2) stops.push(tele);
  const named: ZoomSetup['lenses'] = [];
  if (hasUltraWide) named.push({ from: min, name: 'Ultra Wide' });
  named.push({ from: wide, name: 'Wide' });
  if (tele) named.push({ from: tele, name: 'Telephoto' });

  return { lens: pick.deviceType, exact: true, wide, min, max, stops: [...new Set(stops)].filter((s) => s <= max), lenses: named };
}

/** Zoom as shown to people: 0.5, 1, 2.4 … relative to the main lens. */
export function zoomLabel(factor: number, setup: ZoomSetup) {
  const x = factor / setup.wide;
  if (x < 1) return `.${Math.round(x * 10)}`;
  return x >= 10 || Number.isInteger(Math.round(x * 10) / 10) ? `${Math.round(x)}` : (Math.round(x * 10) / 10).toFixed(1);
}

/** The lens the phone is using at this zoom factor. */
export function lensName(factor: number, setup: ZoomSetup) {
  let name = setup.lenses[0]?.name ?? 'Wide';
  for (const l of setup.lenses) if (factor >= l.from - 0.01) name = l.name;
  return name;
}

/** Value for CameraView's `zoom` prop. */
export function zoomProp(factor: number, setup: ZoomSetup) {
  // Exact factor on patched builds; on older builds stay at the default lens (0).
  return setup.exact ? Math.max(1, factor) : 0;
}
