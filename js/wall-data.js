// The wall's composition, in stage px (2000 × 1300). Swap seeds for real photo
// filenames later; positions/rotations are hand-placed to feel pinned-up by a human.
import { layouts as L } from './layouts.js';

const R1 = 160, H1 = 352, R2 = 542, H2 = 340, R3 = 908, H3 = 352;

export const sheets = [
  // row 1
  { x: 14,   y: R1 + 8, w: 268, h: H1, rot: -0.5, content: L.cover({ seed: 'trip-cover-7', title: 'Field<br>Notes', sub: 'Vol. 01 — Nine days, one coastline' }) },
  { x: 318,  y: R1 + 2, w: 282, h: H1, rot: 0.35, content: L.toc({ entries: [['Arrival, after dark', '04'], ['The old harbour', '09'], ['Market mornings', '14'], ['Coastline', '20'], ['Up the hill', '27'], ['Contact sheets', '33'], ['Night trains', '38']] }) },
  { x: 612,  y: R1 + 4, w: 268, h: H1, rot: 0, content: L.feature({ seed: 'harbour-02', kicker: 'Day 02', title: 'The Old Harbour', dek: 'Fog until noon, then everything turned gold.' }) },
  { x: 897,  y: R1 + 6, w: 266, h: H1, rot: 0.25, content: L.essay({ seed: 'essay-streets', title: 'Getting lost, on purpose', quote: 'We walked until the streets ran out and the sea began again.' }) },
  { x: 1180, y: R1 + 4, w: 270, h: H1, rot: -0.25, content: L.print({ seed: 'print-05-alley', caption: 'Back alley, 7:12 am', n: '05' }) },
  { x: 1462, y: R1 + 2, w: 246, h: H1, rot: 0, tape: 'top-left', group: 'night', content: L.spread({ seed: 'night-train-9', part: 0, of: 2, title: 'Night<br>Trains' }) },
  { x: 1707, y: R1 + 2, w: 246, h: H1, rot: 0, tape: 'top-right', group: 'night', content: L.spread({ seed: 'night-train-9', part: 1, of: 2 }) },
  // row 2
  { x: 342,  y: R2, w: 259, h: H2, rot: 0, tape: 'top-left', group: 'coast', content: L.spread({ seed: 'coastline-3', part: 0, of: 2, title: 'Coast-<br>line' }) },
  { x: 600,  y: R2, w: 259, h: H2, rot: 0, tape: 'top', group: 'coast', content: L.spread({ seed: 'coastline-3', part: 1, of: 2 }) },
  { x: 882,  y: R2 + 2, w: 268, h: H2, rot: -0.3, content: L.feature({ seed: 'market-14', kicker: 'Day 04', title: 'Market Mornings', dek: 'Oranges in pyramids, fish on ice, arguments about football.' }) },
  { x: 1165, y: R2 + 1, w: 262, h: H2, rot: 0.15, tape: 'top', group: 'hill', content: L.spread({ seed: 'hill-view-2', part: 0, of: 3, title: 'Up the<br>hill' }) },
  { x: 1426, y: R2 + 1, w: 262, h: H2, rot: 0, tape: 'top', group: 'hill', content: L.spread({ seed: 'hill-view-2', part: 1, of: 3 }) },
  { x: 1687, y: R2 + 1, w: 262, h: H2, rot: -0.1, tape: 'top', group: 'hill', content: L.spread({ seed: 'hill-view-2', part: 2, of: 3 }) },
  // row 3
  { x: 342,  y: R3 + 4, w: 264, h: H3, rot: 0.3, content: L.contact({ seed: 'roll-a7', title: 'Contact sheet' }) },
  { x: 626,  y: R3, w: 262, h: H3, rot: -0.2, content: L.print({ seed: 'print-11-ferry', caption: 'Last ferry out', n: '11' }) },
  { x: 905,  y: R3 + 2, w: 258, h: H3, rot: 0.2, content: L.essay({ seed: 'essay-rain', title: 'Day 3: rain, all day', quote: 'Bread still warm in paper bags, windows fogged, nowhere to be.' }) },
];

export const notes = [
  // on the pages — editor's feedback
  { x: 186, y: 142, rot: -5.5, text: 'cover?\nmaybe b&w', font: 'reenie', w: 108, h: 108 },
  { x: 312, y: 318, rot: 3, text: 'add folio\nnumbers', font: 'caveat', w: 110, h: 110 },
  { x: 1086, y: 186, rot: 4, text: 'too long —\ncut ¶2', font: 'nanum', w: 108, h: 108, color: 'lemon' },
  { x: 966, y: 330, rot: -3, text: 'golden hour\n6:40pm', font: 'reenie', w: 112, h: 112 },
  { x: 1052, y: 404, rot: 6, text: 'fav\nframe ★', font: 'caveat', w: 104, h: 104 },
  { x: 1878, y: 312, rot: 10, text: 'print\nBIGGER', font: 'marker', w: 104, h: 104 },
  { x: 1868, y: 432, rot: -9, text: 'the whole\nview :)', font: 'reenie', w: 106, h: 106, color: 'lemon' },
  { x: 1572, y: 396, rot: -2, text: 'sequence\nmatters!', font: 'nanum', w: 112, h: 112 },
  { x: 1660, y: 384, rot: 5, text: 'ferry → market\n→ hill', font: 'caveat', w: 118, h: 112 },
  { x: 548, y: 772, rot: -7, text: 'more\ncolour?', font: 'reenie', w: 104, h: 104 },
  { x: 876, y: 532, rot: 2, text: '', w: 96, h: 96 },
  { x: 1016, y: 758, rot: 1, text: 'crop\ntighter', font: 'gochi', w: 94, h: 94 },
  { x: 1146, y: 690, rot: -4, text: 'is this\nday 4 or 5?', font: 'reenie', w: 100, h: 100 },
  { x: 1362, y: 796, rot: 3, text: 'bigger\nimage', font: 'marker', w: 98, h: 98, color: 'lemon' },
  { x: 1870, y: 788, rot: -4, text: 'ad?', font: 'marker', w: 96, h: 96 },
  { x: 482, y: 922, rot: -4, text: '#07 or #11?', font: 'caveat', w: 104, h: 104 },
  { x: 902, y: 932, rot: -6, text: 'the rain\nday — keep', font: 'reenie', w: 100, h: 100 },
  { x: 322, y: 1066, rot: -12, text: 'last roll\nof the trip', font: 'reenie', w: 108, h: 108 },
  // the loose cluster on the left
  { x: 24, y: 556, rot: 1, text: 'to print:\n12 more', font: 'caveat', w: 104, h: 94 },
  { x: 148, y: 556, rot: -3, text: 'ask K for\nthe map', font: 'nanum', w: 100, h: 94 },
  { x: 16, y: 668, rot: -2, text: 'Day 1 = arrival\nnot the train', font: 'reenie', w: 112, h: 94 },
  { x: 200, y: 752, rot: 0.5, text: '', w: 100, h: 96 },
];

