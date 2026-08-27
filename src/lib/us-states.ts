/** US FIPS state codes mapped to state names — matches USGS state_code values */
export const US_STATES: { code: string; name: string }[] = [
  { code: "01", name: "Alabama" },
  { code: "02", name: "Alaska" },
  { code: "04", name: "Arizona" },
  { code: "05", name: "Arkansas" },
  { code: "06", name: "California" },
  { code: "08", name: "Colorado" },
  { code: "09", name: "Connecticut" },
  { code: "10", name: "Delaware" },
  { code: "11", name: "District of Columbia" },
  { code: "12", name: "Florida" },
  { code: "13", name: "Georgia" },
  { code: "15", name: "Hawaii" },
  { code: "16", name: "Idaho" },
  { code: "17", name: "Illinois" },
  { code: "18", name: "Indiana" },
  { code: "19", name: "Iowa" },
  { code: "20", name: "Kansas" },
  { code: "21", name: "Kentucky" },
  { code: "22", name: "Louisiana" },
  { code: "23", name: "Maine" },
  { code: "24", name: "Maryland" },
  { code: "25", name: "Massachusetts" },
  { code: "26", name: "Michigan" },
  { code: "27", name: "Minnesota" },
  { code: "28", name: "Mississippi" },
  { code: "29", name: "Missouri" },
  { code: "30", name: "Montana" },
  { code: "31", name: "Nebraska" },
  { code: "32", name: "Nevada" },
  { code: "33", name: "New Hampshire" },
  { code: "34", name: "New Jersey" },
  { code: "35", name: "New Mexico" },
  { code: "36", name: "New York" },
  { code: "37", name: "North Carolina" },
  { code: "38", name: "North Dakota" },
  { code: "39", name: "Ohio" },
  { code: "40", name: "Oklahoma" },
  { code: "41", name: "Oregon" },
  { code: "42", name: "Pennsylvania" },
  { code: "44", name: "Rhode Island" },
  { code: "45", name: "South Carolina" },
  { code: "46", name: "South Dakota" },
  { code: "47", name: "Tennessee" },
  { code: "48", name: "Texas" },
  { code: "49", name: "Utah" },
  { code: "50", name: "Vermont" },
  { code: "51", name: "Virginia" },
  { code: "53", name: "Washington" },
  { code: "54", name: "West Virginia" },
  { code: "55", name: "Wisconsin" },
  { code: "56", name: "Wyoming" },
];

/** USPS abbreviation -> FIPS code, so AI/geocoded "TX" style codes match USGS data. */
export const STATE_ABBR_TO_FIPS: Record<string, string> = {
  AL: "01", AK: "02", AZ: "04", AR: "05", CA: "06", CO: "08", CT: "09", DE: "10",
  DC: "11", FL: "12", GA: "13", HI: "15", ID: "16", IL: "17", IN: "18", IA: "19",
  KS: "20", KY: "21", LA: "22", ME: "23", MD: "24", MA: "25", MI: "26", MN: "27",
  MS: "28", MO: "29", MT: "30", NE: "31", NV: "32", NH: "33", NJ: "34", NM: "35",
  NY: "36", NC: "37", ND: "38", OH: "39", OK: "40", OR: "41", PA: "42", RI: "44",
  SC: "45", SD: "46", TN: "47", TX: "48", UT: "49", VT: "50", VA: "51", WA: "53",
  WV: "54", WI: "55", WY: "56", PR: "72",
};

/** Normalizes any state code (USPS abbr or FIPS) to the FIPS form USGS tables use. */
export const toFipsStateCode = (code: string | null | undefined): string => {
  const c = (code || "").trim().toUpperCase();
  if (!c) return "";
  return STATE_ABBR_TO_FIPS[c] ?? c;
};

export const getStateName = (code: string) => {
  const fips = toFipsStateCode(code);
  return US_STATES.find((s) => s.code === fips)?.name ?? code;
};

