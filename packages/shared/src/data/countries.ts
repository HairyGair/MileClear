// Countries a driver can pick (23 Oct 2026, the first step of going beyond
// the UK). ISO 3166-1 alpha-2 codes, English names, the local currency
// (ISO 4217) and whether road distances there are in kilometres. Only the
// code is stored (users.country); the rest is for screens and later work.

export interface Country {
  code: string;
  name: string;
  currency: string;
  usesKm: boolean;
}

// Places whose roads are signed in miles. Everywhere else uses kilometres.
const MILES = new Set([
  "GB", "JE", "GG", "IM", "US", "LR", "MM", "AG", "BS", "BZ", "DM", "GD", "KN", "LC", "VC",
  "WS", "FK", "VG", "KY", "TC", "AI", "MS", "VI", "GU", "AS", "MP", "PR", "SH",
]);

// code|name|currency
const RAW = `AF|Afghanistan|AFN
AX|Åland Islands|EUR
AL|Albania|ALL
DZ|Algeria|DZD
AS|American Samoa|USD
AD|Andorra|EUR
AO|Angola|AOA
AI|Anguilla|XCD
AG|Antigua and Barbuda|XCD
AR|Argentina|ARS
AM|Armenia|AMD
AW|Aruba|AWG
AU|Australia|AUD
AT|Austria|EUR
AZ|Azerbaijan|AZN
BS|Bahamas|BSD
BH|Bahrain|BHD
BD|Bangladesh|BDT
BB|Barbados|BBD
BY|Belarus|BYN
BE|Belgium|EUR
BZ|Belize|BZD
BJ|Benin|XOF
BM|Bermuda|BMD
BT|Bhutan|BTN
BO|Bolivia|BOB
BA|Bosnia and Herzegovina|BAM
BW|Botswana|BWP
BR|Brazil|BRL
VG|British Virgin Islands|USD
BN|Brunei|BND
BG|Bulgaria|BGN
BF|Burkina Faso|XOF
BI|Burundi|BIF
KH|Cambodia|KHR
CM|Cameroon|XAF
CA|Canada|CAD
CV|Cape Verde|CVE
KY|Cayman Islands|KYD
CF|Central African Republic|XAF
TD|Chad|XAF
CL|Chile|CLP
CN|China|CNY
CO|Colombia|COP
KM|Comoros|KMF
CG|Congo|XAF
CD|Congo (DRC)|CDF
CK|Cook Islands|NZD
CR|Costa Rica|CRC
CI|Côte d'Ivoire|XOF
HR|Croatia|EUR
CU|Cuba|CUP
CW|Curaçao|ANG
CY|Cyprus|EUR
CZ|Czechia|CZK
DK|Denmark|DKK
DJ|Djibouti|DJF
DM|Dominica|XCD
DO|Dominican Republic|DOP
EC|Ecuador|USD
EG|Egypt|EGP
SV|El Salvador|USD
GQ|Equatorial Guinea|XAF
ER|Eritrea|ERN
EE|Estonia|EUR
SZ|Eswatini|SZL
ET|Ethiopia|ETB
FK|Falkland Islands|FKP
FO|Faroe Islands|DKK
FJ|Fiji|FJD
FI|Finland|EUR
FR|France|EUR
GF|French Guiana|EUR
PF|French Polynesia|XPF
GA|Gabon|XAF
GM|Gambia|GMD
GE|Georgia|GEL
DE|Germany|EUR
GH|Ghana|GHS
GI|Gibraltar|GIP
GR|Greece|EUR
GL|Greenland|DKK
GD|Grenada|XCD
GP|Guadeloupe|EUR
GU|Guam|USD
GT|Guatemala|GTQ
GG|Guernsey|GBP
GN|Guinea|GNF
GW|Guinea-Bissau|XOF
GY|Guyana|GYD
HT|Haiti|HTG
HN|Honduras|HNL
HK|Hong Kong|HKD
HU|Hungary|HUF
IS|Iceland|ISK
IN|India|INR
ID|Indonesia|IDR
IR|Iran|IRR
IQ|Iraq|IQD
IE|Ireland|EUR
IM|Isle of Man|GBP
IL|Israel|ILS
IT|Italy|EUR
JM|Jamaica|JMD
JP|Japan|JPY
JE|Jersey|GBP
JO|Jordan|JOD
KZ|Kazakhstan|KZT
KE|Kenya|KES
KI|Kiribati|AUD
XK|Kosovo|EUR
KW|Kuwait|KWD
KG|Kyrgyzstan|KGS
LA|Laos|LAK
LV|Latvia|EUR
LB|Lebanon|LBP
LS|Lesotho|LSL
LR|Liberia|LRD
LY|Libya|LYD
LI|Liechtenstein|CHF
LT|Lithuania|EUR
LU|Luxembourg|EUR
MO|Macao|MOP
MG|Madagascar|MGA
MW|Malawi|MWK
MY|Malaysia|MYR
MV|Maldives|MVR
ML|Mali|XOF
MT|Malta|EUR
MH|Marshall Islands|USD
MQ|Martinique|EUR
MR|Mauritania|MRU
MU|Mauritius|MUR
YT|Mayotte|EUR
MX|Mexico|MXN
FM|Micronesia|USD
MD|Moldova|MDL
MC|Monaco|EUR
MN|Mongolia|MNT
ME|Montenegro|EUR
MS|Montserrat|XCD
MA|Morocco|MAD
MZ|Mozambique|MZN
MM|Myanmar|MMK
NA|Namibia|NAD
NR|Nauru|AUD
NP|Nepal|NPR
NL|Netherlands|EUR
NC|New Caledonia|XPF
NZ|New Zealand|NZD
NI|Nicaragua|NIO
NE|Niger|XOF
NG|Nigeria|NGN
KP|North Korea|KPW
MK|North Macedonia|MKD
MP|Northern Mariana Islands|USD
NO|Norway|NOK
OM|Oman|OMR
PK|Pakistan|PKR
PW|Palau|USD
PS|Palestine|ILS
PA|Panama|PAB
PG|Papua New Guinea|PGK
PY|Paraguay|PYG
PE|Peru|PEN
PH|Philippines|PHP
PL|Poland|PLN
PT|Portugal|EUR
PR|Puerto Rico|USD
QA|Qatar|QAR
RE|Réunion|EUR
RO|Romania|RON
RU|Russia|RUB
RW|Rwanda|RWF
SH|Saint Helena|SHP
KN|Saint Kitts and Nevis|XCD
LC|Saint Lucia|XCD
VC|Saint Vincent and the Grenadines|XCD
WS|Samoa|WST
SM|San Marino|EUR
ST|São Tomé and Príncipe|STN
SA|Saudi Arabia|SAR
SN|Senegal|XOF
RS|Serbia|RSD
SC|Seychelles|SCR
SL|Sierra Leone|SLE
SG|Singapore|SGD
SX|Sint Maarten|ANG
SK|Slovakia|EUR
SI|Slovenia|EUR
SB|Solomon Islands|SBD
SO|Somalia|SOS
ZA|South Africa|ZAR
KR|South Korea|KRW
SS|South Sudan|SSP
ES|Spain|EUR
LK|Sri Lanka|LKR
SD|Sudan|SDG
SR|Suriname|SRD
SE|Sweden|SEK
CH|Switzerland|CHF
SY|Syria|SYP
TW|Taiwan|TWD
TJ|Tajikistan|TJS
TZ|Tanzania|TZS
TH|Thailand|THB
TL|Timor-Leste|USD
TG|Togo|XOF
TO|Tonga|TOP
TT|Trinidad and Tobago|TTD
TN|Tunisia|TND
TR|Turkey|TRY
TM|Turkmenistan|TMT
TC|Turks and Caicos Islands|USD
TV|Tuvalu|AUD
VI|US Virgin Islands|USD
UG|Uganda|UGX
UA|Ukraine|UAH
AE|United Arab Emirates|AED
GB|United Kingdom|GBP
US|United States|USD
UY|Uruguay|UYU
UZ|Uzbekistan|UZS
VU|Vanuatu|VUV
VA|Vatican City|EUR
VE|Venezuela|VES
VN|Vietnam|VND
YE|Yemen|YER
ZM|Zambia|ZMW
ZW|Zimbabwe|ZWG`;

/** Every country, sorted by name. */
export const COUNTRIES: readonly Country[] = RAW.split("\n").map((line) => {
  const [code, name, currency] = line.split("|");
  return { code, name, currency, usesKm: !MILES.has(code) };
});

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));

/** Shown first in the picker: the UK, then the countries we plan for next. */
export const SHORTLIST_COUNTRY_CODES = ["GB", "IE", "AU", "NZ", "CA", "US"] as const;

export const DEFAULT_COUNTRY = "GB";

export function countryByCode(code: string | null | undefined): Country | null {
  if (!code) return null;
  return BY_CODE.get(code.toUpperCase()) ?? null;
}

export function isKnownCountryCode(code: unknown): code is string {
  return typeof code === "string" && /^[A-Z]{2}$/.test(code) && BY_CODE.has(code);
}

/** Missing, unknown or junk is the UK: every driver before 23 Oct 2026 is GB. */
export function countryOf(raw: unknown): string {
  if (typeof raw !== "string") return DEFAULT_COUNTRY;
  const up = raw.trim().toUpperCase();
  return BY_CODE.has(up) ? up : DEFAULT_COUNTRY;
}

export function countryName(code: string | null | undefined): string {
  return countryByCode(code)?.name ?? "United Kingdom";
}
