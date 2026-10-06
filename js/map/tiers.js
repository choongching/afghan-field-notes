// Progressive disclosure: which drawn layers belong to which zoom tier, and where
// each tier fades in. Zoom is relative to "whole map fits the screen" (1 = fit).
// `native` = the tile zoom levels baked for that tier (0 = 1 map px per px, 1 = 2×, …).

export const TIERS = [
  { id: 't0', name: 'sketch', reveal: [0, 0], native: [-1, 2],
    layers: ['surround', 'deserts', 'erased', 'border', 'oases', 'rivers', 'foothills', 'mountains', 'highlands', 'hills', 'landmarks', 'trip', 'places', 'labels', 'compass', 'scale'] },
  { id: 't1', name: 'relief', reveal: [1.3, 1.7], native: [0, 2], layers: ['terrain'] },
  { id: 't2', name: 'detail', reveal: [1.8, 2.2], native: [1, 2], layers: ['towns', 'waters', 'wakhan'] },
  { id: 't3', name: 'margins', reveal: [2.3, 2.7], native: [1, 2], layers: ['notes', 'traveller'] },
];

export const MAX_ZOOM = 3; // relative to fit — one level closer, no further

// Labels: when they appear and who wins a collision (lower = more important).
export function labelRule({ cls, layer }) {
  // overview names that the close-up detail replaces fade out as you lean in
  if (cls.includes('t-region--wakhan')) return { reveal: [0, 0], hide: [1.7, 2.0], priority: 1 };
  // the range's name belongs to the overview; up close the ridges, passes and towns say it, and there's no room
  if (cls.includes('t-region--range')) return { reveal: [0, 0], hide: [1.8, 2.2], priority: 1 };
  if (layer === 'wakhan') return { reveal: [1.9, 2.3], priority: cls.includes('w-peak') || cls.includes('w-place') ? 3 : 5 };
  if (layer === 'waters') return { reveal: [1.5, 1.9], priority: 5 };
  if (layer === 'towns') return { reveal: [1.8, 2.2], priority: cls.includes('t-pass') ? 4 : 5 };
  if (layer === 'notes' || layer === 'traveller') return { reveal: [2.3, 2.7], priority: 6 };
  if (layer === 'landmarks') return { reveal: [1.2, 1.5], priority: 4 };
  if (cls.includes('t-region--soft')) return { reveal: [0, 0], priority: 3 };
  if (cls.includes('t-country')) return { reveal: [0, 0], priority: 3 };
  if (cls.includes('t-river') || cls.includes('t-place--small')) return { reveal: [1.2, 1.5], priority: 4 };
  if (cls.includes('t-place--big')) return { reveal: [0, 0], priority: 0 };
  if (cls.includes('t-place') || cls.includes('t-region')) return { reveal: [0, 0], priority: 1 };
  return { reveal: [0, 0], priority: 2 };
}
