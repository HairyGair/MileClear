// UK postcode AREAS -> name, region, nation and an approximate centroid.
//
// The backbone of the admin Geography view (services/geography.ts). An area
// is the leading letters of a postcode: "LN" in "LN1 2AA", "B" in "B5 4TR".
// There are 121 geographic areas in Great Britain + Northern Ireland, plus
// GY (Guernsey), JE (Jersey) and IM (Isle of Man), which use the same
// system but are Crown Dependencies, not part of the UK: they get the
// region and nation "Crown Dependencies" rather than being forced into one
// of the 12 UK regions. Non-geographic codes (BF/BX/XX/GIR) are omitted, so
// they parse as "not a postcode".
//
// Region rule: an area's region is the region of its NAMED post town. A few
// areas straddle a boundary (HP covers Hemel Hempstead in Hertfordshire and
// most of Buckinghamshire; KT covers Kingston and north Surrey; EN reaches
// into Hertfordshire; DA into London). Each one is placed with its named
// town, which keeps the table predictable and checkable against the name.
//
// Centroids are approximate (good to roughly 10 km), used only to place an
// area on the map and to snap a saved-home / trip point to its nearest area
// when no postcode is known.

export const UK_REGIONS = [
  "North East",
  "North West",
  "Yorkshire and the Humber",
  "East Midlands",
  "West Midlands",
  "East of England",
  "London",
  "South East",
  "South West",
  "Wales",
  "Scotland",
  "Northern Ireland",
] as const;

export type UkRegion = (typeof UK_REGIONS)[number];
/** The 12 UK regions/nations plus the Crown Dependencies (GY/JE/IM). */
export type GeoRegion = UkRegion | "Crown Dependencies";
export type GeoNation = "England" | "Scotland" | "Wales" | "Northern Ireland" | "Crown Dependencies";

export const GEO_NATIONS: GeoNation[] = ["England", "Scotland", "Wales", "Northern Ireland", "Crown Dependencies"];

export function nationOfRegion(region: GeoRegion): GeoNation {
  if (region === "Wales") return "Wales";
  if (region === "Scotland") return "Scotland";
  if (region === "Northern Ireland") return "Northern Ireland";
  if (region === "Crown Dependencies") return "Crown Dependencies";
  return "England";
}

export interface PostcodeArea {
  code: string;
  name: string;
  region: GeoRegion;
  nation: GeoNation;
  lat: number;
  lng: number;
}

// [code, name, region, lat, lng]
const RAW: Array<[string, string, GeoRegion, number, number]> = [
  ["AB", "Aberdeen", "Scotland", 57.2, -2.4],
  ["AL", "St Albans", "East of England", 51.77, -0.3],
  ["B", "Birmingham", "West Midlands", 52.48, -1.88],
  ["BA", "Bath", "South West", 51.3, -2.45],
  ["BB", "Blackburn", "North West", 53.78, -2.4],
  ["BD", "Bradford", "Yorkshire and the Humber", 53.83, -1.85],
  ["BH", "Bournemouth", "South West", 50.75, -1.9],
  ["BL", "Bolton", "North West", 53.58, -2.43],
  ["BN", "Brighton", "South East", 50.86, -0.25],
  ["BR", "Bromley", "London", 51.38, 0.05],
  ["BS", "Bristol", "South West", 51.46, -2.6],
  ["BT", "Belfast", "Northern Ireland", 54.6, -6.7],
  ["CA", "Carlisle", "North West", 54.75, -3.0],
  ["CB", "Cambridge", "East of England", 52.2, 0.2],
  ["CF", "Cardiff", "Wales", 51.52, -3.25],
  ["CH", "Chester", "North West", 53.2, -2.95],
  ["CM", "Chelmsford", "East of England", 51.8, 0.4],
  ["CO", "Colchester", "East of England", 51.9, 0.95],
  ["CR", "Croydon", "London", 51.36, -0.1],
  ["CT", "Canterbury", "South East", 51.25, 1.15],
  ["CV", "Coventry", "West Midlands", 52.4, -1.5],
  ["CW", "Crewe", "North West", 53.15, -2.45],
  ["DA", "Dartford", "South East", 51.43, 0.2],
  ["DD", "Dundee", "Scotland", 56.5, -2.95],
  ["DE", "Derby", "East Midlands", 52.95, -1.55],
  ["DG", "Dumfries", "Scotland", 55.1, -3.8],
  ["DH", "Durham", "North East", 54.8, -1.65],
  ["DL", "Darlington", "North East", 54.5, -1.6],
  ["DN", "Doncaster", "Yorkshire and the Humber", 53.55, -0.9],
  ["DT", "Dorchester", "South West", 50.7, -2.45],
  ["DY", "Dudley", "West Midlands", 52.48, -2.15],
  ["E", "London E", "London", 51.53, -0.03],
  ["EC", "London EC", "London", 51.52, -0.1],
  ["EH", "Edinburgh", "Scotland", 55.9, -3.25],
  ["EN", "Enfield", "London", 51.68, -0.08],
  ["EX", "Exeter", "South West", 50.75, -3.65],
  ["FK", "Falkirk", "Scotland", 56.05, -3.9],
  ["FY", "Blackpool", "North West", 53.85, -3.0],
  ["G", "Glasgow", "Scotland", 55.86, -4.25],
  ["GL", "Gloucester", "South West", 51.85, -2.2],
  ["GU", "Guildford", "South East", 51.25, -0.7],
  ["GY", "Guernsey", "Crown Dependencies", 49.45, -2.58],
  ["HA", "Harrow", "London", 51.58, -0.35],
  ["HD", "Huddersfield", "Yorkshire and the Humber", 53.63, -1.8],
  ["HG", "Harrogate", "Yorkshire and the Humber", 54.03, -1.55],
  ["HP", "Hemel Hempstead", "East of England", 51.75, -0.65],
  ["HR", "Hereford", "West Midlands", 52.05, -2.75],
  ["HS", "Outer Hebrides", "Scotland", 57.8, -7.0],
  ["HU", "Hull", "Yorkshire and the Humber", 53.8, -0.4],
  ["HX", "Halifax", "Yorkshire and the Humber", 53.72, -1.88],
  ["IG", "Ilford", "London", 51.57, 0.08],
  ["IM", "Isle of Man", "Crown Dependencies", 54.23, -4.55],
  ["IP", "Ipswich", "East of England", 52.15, 1.15],
  ["IV", "Inverness", "Scotland", 57.5, -4.8],
  ["JE", "Jersey", "Crown Dependencies", 49.21, -2.13],
  ["KA", "Kilmarnock", "Scotland", 55.55, -4.55],
  ["KT", "Kingston upon Thames", "London", 51.37, -0.35],
  ["KW", "Kirkwall", "Scotland", 58.5, -3.4],
  ["KY", "Kirkcaldy", "Scotland", 56.2, -3.1],
  ["L", "Liverpool", "North West", 53.42, -2.95],
  ["LA", "Lancaster", "North West", 54.15, -2.75],
  ["LD", "Llandrindod Wells", "Wales", 52.25, -3.4],
  ["LE", "Leicester", "East Midlands", 52.63, -1.15],
  ["LL", "Llandudno", "Wales", 53.1, -3.85],
  ["LN", "Lincoln", "East Midlands", 53.25, -0.4],
  ["LS", "Leeds", "Yorkshire and the Humber", 53.82, -1.55],
  ["LU", "Luton", "East of England", 51.88, -0.45],
  ["M", "Manchester", "North West", 53.47, -2.25],
  ["ME", "Rochester", "South East", 51.33, 0.55],
  ["MK", "Milton Keynes", "South East", 52.05, -0.75],
  ["ML", "Motherwell", "Scotland", 55.78, -3.9],
  ["N", "London N", "London", 51.58, -0.12],
  ["NE", "Newcastle upon Tyne", "North East", 55.0, -1.7],
  ["NG", "Nottingham", "East Midlands", 53.0, -1.05],
  ["NN", "Northampton", "East Midlands", 52.3, -0.8],
  ["NP", "Newport", "Wales", 51.65, -3.0],
  ["NR", "Norwich", "East of England", 52.65, 1.25],
  ["NW", "London NW", "London", 51.55, -0.2],
  ["OL", "Oldham", "North West", 53.55, -2.1],
  ["OX", "Oxford", "South East", 51.8, -1.35],
  ["PA", "Paisley", "Scotland", 55.95, -5.0],
  ["PE", "Peterborough", "East of England", 52.65, -0.2],
  ["PH", "Perth", "Scotland", 56.6, -3.8],
  ["PL", "Plymouth", "South West", 50.45, -4.25],
  ["PO", "Portsmouth", "South East", 50.82, -1.1],
  ["PR", "Preston", "North West", 53.75, -2.75],
  ["RG", "Reading", "South East", 51.4, -1.05],
  ["RH", "Redhill", "South East", 51.15, -0.2],
  ["RM", "Romford", "London", 51.55, 0.2],
  ["S", "Sheffield", "Yorkshire and the Humber", 53.38, -1.45],
  ["SA", "Swansea", "Wales", 51.75, -4.15],
  ["SE", "London SE", "London", 51.47, -0.05],
  ["SG", "Stevenage", "East of England", 51.92, -0.15],
  ["SK", "Stockport", "North West", 53.38, -2.1],
  ["SL", "Slough", "South East", 51.5, -0.65],
  ["SM", "Sutton", "London", 51.36, -0.18],
  ["SN", "Swindon", "South West", 51.55, -1.85],
  ["SO", "Southampton", "South East", 50.95, -1.4],
  ["SP", "Salisbury", "South West", 51.1, -1.8],
  ["SR", "Sunderland", "North East", 54.88, -1.4],
  ["SS", "Southend-on-Sea", "East of England", 51.57, 0.65],
  ["ST", "Stoke-on-Trent", "West Midlands", 52.95, -2.1],
  ["SW", "London SW", "London", 51.46, -0.17],
  ["SY", "Shrewsbury", "West Midlands", 52.65, -3.0],
  ["TA", "Taunton", "South West", 51.0, -3.1],
  ["TD", "Galashiels", "Scotland", 55.6, -2.5],
  ["TF", "Telford", "West Midlands", 52.7, -2.45],
  ["TN", "Tonbridge", "South East", 51.05, 0.35],
  ["TQ", "Torquay", "South West", 50.45, -3.6],
  ["TR", "Truro", "South West", 50.25, -5.15],
  ["TS", "Cleveland", "North East", 54.57, -1.2],
  ["TW", "Twickenham", "London", 51.45, -0.35],
  ["UB", "Southall", "London", 51.52, -0.4],
  ["W", "London W", "London", 51.51, -0.22],
  ["WA", "Warrington", "North West", 53.38, -2.55],
  ["WC", "London WC", "London", 51.52, -0.12],
  ["WD", "Watford", "East of England", 51.66, -0.4],
  ["WF", "Wakefield", "Yorkshire and the Humber", 53.68, -1.45],
  ["WN", "Wigan", "North West", 53.55, -2.65],
  ["WR", "Worcester", "West Midlands", 52.2, -2.2],
  ["WS", "Walsall", "West Midlands", 52.62, -1.95],
  ["WV", "Wolverhampton", "West Midlands", 52.58, -2.15],
  ["YO", "York", "Yorkshire and the Humber", 54.05, -0.9],
  ["ZE", "Lerwick", "Scotland", 60.3, -1.25],
];

export const UK_POSTCODE_AREAS: Readonly<Record<string, PostcodeArea>> = Object.freeze(
  Object.fromEntries(
    RAW.map(([code, name, region, lat, lng]) => [
      code,
      { code, name, region, nation: nationOfRegion(region), lat, lng },
    ])
  )
);

export function areaInfo(code: string | null | undefined): PostcodeArea | null {
  if (!code) return null;
  return UK_POSTCODE_AREAS[code.toUpperCase()] ?? null;
}

// ── Signup-IP city -> area ───────────────────────────────────────────────
//
// signupLocation is geoip-lite's "city, region, country" ("Leeds, ENG, GB").
// A city maps to an area when it equals an area's name or is a listed alias.
// Ambiguous names list candidates and the IP's nation picks one (Newport in
// Wales is NP, on the Isle of Wight it is PO). "London" maps to the London
// region with no single area.

export const IP_CITY_ALIASES: Record<string, string[]> = {
  newcastle: ["NE"], gateshead: ["NE"], "kingston upon hull": ["HU"],
  middlesbrough: ["TS"], "stockton-on-tees": ["TS"], hartlepool: ["TS"], redcar: ["TS"],
  chatham: ["ME"], gillingham: ["ME"], maidstone: ["ME"],
  southend: ["SS"], basildon: ["SS"], stoke: ["ST"], stafford: ["ST"],
  salford: ["M"], trafford: ["M"], birkenhead: ["CH"], wallasey: ["CH"],
  solihull: ["B"], "sutton coldfield": ["B"], "west bromwich": ["B"],
  derry: ["BT"], londonderry: ["BT"], lisburn: ["BT"], newry: ["BT"],
  bangor: ["LL", "BT"], newport: ["NP", "PO"],
  hove: ["BN"], worthing: ["BN"], eastbourne: ["BN"],
  crawley: ["RH"], horsham: ["RH"], reigate: ["RH"],
  woking: ["GU"], farnborough: ["GU"], aldershot: ["GU"],
  "high wycombe": ["HP"], aylesbury: ["HP"],
  basingstoke: ["RG"], newbury: ["RG"], maidenhead: ["SL"], windsor: ["SL"],
  poole: ["BH"], cheltenham: ["GL"], hastings: ["TN"], ashford: ["TN"],
  "tunbridge wells": ["TN"], "royal tunbridge wells": ["TN"],
  margate: ["CT"], dover: ["CT"], bedford: ["MK"], harlow: ["CM"],
  winchester: ["SO"], richmond: ["TW"], hounslow: ["TW"], uxbridge: ["UB"],
  burnley: ["BB"], rotherham: ["S"], barnsley: ["S"], chesterfield: ["S"],
  scunthorpe: ["DN"], grimsby: ["DN"], stirling: ["FK"], ayr: ["KA"],
  hamilton: ["ML"], "east kilbride": ["G"], livingston: ["EH"], dunfermline: ["KY"],
  wrexham: ["LL"], "milton keynes": ["MK"], "st helens": ["WA"], widnes: ["WA"],
  rochdale: ["OL"], bury: ["BL"], huntingdon: ["PE"], "kings lynn": ["PE"],
  "great yarmouth": ["NR"], lowestoft: ["NR"], "bury st edmunds": ["IP"],
  loughborough: ["LE"], mansfield: ["NG"], kettering: ["NN"], corby: ["NN"],
  nuneaton: ["CV"], rugby: ["CV"], warwick: ["CV"], leamington: ["CV"],
  "leamington spa": ["CV"], redditch: ["B"], kidderminster: ["DY"],
  "burton upon trent": ["DE"], cannock: ["WS"], lichfield: ["WS"], tamworth: ["B"],
  macclesfield: ["SK"], "ellesmere port": ["CH"], southport: ["PR"], wirral: ["CH"],
  "bognor regis": ["PO"], chichester: ["PO"], "isle of wight": ["PO"],
  yeovil: ["BA"], weymouth: ["DT"], barnstaple: ["EX"], "weston-super-mare": ["BS"],
  bridgend: ["CF"], "merthyr tydfil": ["CF"], pontypridd: ["CF"], caerphilly: ["CF"],
  llanelli: ["SA"], carmarthen: ["SA"], aberystwyth: ["SY"],
  "high peak": ["SK"], scarborough: ["YO"], keighley: ["BD"], dewsbury: ["WF"],
  pontefract: ["WF"], castleford: ["WF"], "south shields": ["NE"], "north shields": ["NE"],
  washington: ["NE"], "bishop auckland": ["DL"], stockton: ["TS"], kendal: ["LA"],
  workington: ["CA"], whitehaven: ["CA"], barrow: ["LA"], "barrow-in-furness": ["LA"],
};

/** Lower-case, collapse punctuation/space runs to single spaces. */
export function normaliseCity(s: string): string {
  return s.toLowerCase().replace(/[^a-z-]+/g, " ").replace(/\s+/g, " ").trim();
}

const NAME_INDEX: Map<string, string[]> = (() => {
  const m = new Map<string, string[]>();
  for (const a of Object.values(UK_POSTCODE_AREAS)) {
    if (a.region === "London" && a.name.startsWith("London ")) continue;
    const key = normaliseCity(a.name);
    m.set(key, [...(m.get(key) ?? []), a.code]);
  }
  for (const [k, codes] of Object.entries(IP_CITY_ALIASES)) {
    const key = normaliseCity(k);
    m.set(key, [...new Set([...(m.get(key) ?? []), ...codes])]);
  }
  return m;
})();

export function areaCandidatesForCity(city: string): string[] {
  return NAME_INDEX.get(normaliseCity(city)) ?? [];
}
