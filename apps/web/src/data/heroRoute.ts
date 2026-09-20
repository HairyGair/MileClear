/** The drive the hero plays, and the map it plays on.
 *
 *  A real route: Grey's Monument to the Quayside in Newcastle, taken from
 *  OSRM (the same router the app uses for road distances), so the line on the
 *  map follows real streets rather than a drawn squiggle. 2.68 miles,
 *  455 seconds of driving.
 *
 *  The map is six OpenStreetMap tiles at zoom 13, positioned by percentage
 *  inside a frame 516.8 x 242.2 map pixels, which is also the SVG viewBox, so the
 *  route and the map cannot drift apart at any size. OSM tiles are already
 *  allowed by the CSP in next.config.ts (img-src), and the dashboard maps use
 *  the same source. Attribution is shown on the map.
 *
 *  Regenerate: fetch the OSRM route, convert each point to global pixels at
 *  the zoom, crop to the frame, and write the percentages out. */
export const HERO_ROUTE = {
 zoom: 13,
 /** Frame size in map pixels. Doubles as the SVG viewBox. */
 w: 516.8,
 h: 242.2,
 miles: 2.68,
 seconds: 455,
 start: { x: 230.6, y: 124.9 },
 end: { x: 308.9, y: 177.9 },
 path: "M 230.6 124.9 L 230.2 123.3 L 229.8 121.4 L 229.2 121.2 L 227.6 122.7 L 227.7 124.5 L 222.8 124.1 L 218.0 123.7 L 210.2 123.0 L 209.6 123.0 L 208.0 121.3 L 209.3 116.0 L 212.2 109.7 L 214.4 105.8 L 215.2 104.4 L 215.5 104.0 L 217.3 101.1 L 218.3 99.4 L 220.1 96.1 L 222.9 90.9 L 224.1 88.4 L 225.9 85.0 L 227.5 81.7 L 230.0 77.4 L 232.6 73.3 L 233.6 71.4 L 234.3 69.6 L 235.6 65.4 L 236.2 53.1 L 234.4 43.6 L 234.3 36.6 L 235.9 35.4 L 239.0 35.1 L 243.9 36.8 L 252.2 40.9 L 266.2 52.1 L 271.6 60.9 L 277.6 73.1 L 278.4 75.8 L 278.9 78.8 L 278.7 82.5 L 275.1 95.2 L 270.1 117.5 L 268.9 127.8 L 268.2 136.7 L 264.3 144.8 L 260.5 150.9 L 259.0 155.0 L 259.0 158.2 L 261.1 164.0 L 263.0 168.6 L 281.5 200.3 L 287.3 207.0 L 288.0 206.5 L 288.3 205.4 L 285.2 199.4 L 284.5 198.4 L 283.2 198.2 L 281.5 197.6 L 280.5 197.3 L 279.0 197.2 L 278.0 197.2 L 276.1 197.8 L 274.2 198.3 L 274.4 196.8 L 276.9 195.0 L 278.6 193.9 L 282.8 190.5 L 287.4 187.3 L 291.7 185.5 L 297.5 182.6 L 301.8 181.3 L 305.3 180.2 L 308.9 177.9",
 tiles: [
  { x: 4058, y: 2591, left: -19.138, top: -69.337, w: 49.538, h: 105.68 },
  { x: 4058, y: 2592, left: -19.138, top: 36.343, w: 49.538, h: 105.68 },
  { x: 4059, y: 2591, left: 30.4, top: -69.337, w: 49.538, h: 105.68 },
  { x: 4059, y: 2592, left: 30.4, top: 36.343, w: 49.538, h: 105.68 },
  { x: 4060, y: 2591, left: 79.937, top: -69.337, w: 49.538, h: 105.68 },
  { x: 4060, y: 2592, left: 79.937, top: 36.343, w: 49.538, h: 105.68 },
 ],
} as const;
