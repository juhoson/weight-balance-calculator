// Photos shown for the selected aircraft. A specific aircraft uses its own photo when there is one,
// otherwise the photo of its model. Model photos are from Wikimedia Commons under free licences and
// must be shown with their credit.

const BASE = '/weight-balance/images';

export interface AircraftPhoto {
  src: string;
  /** Required for the Commons photos (CC BY / CC BY-SA); absent for the clubs' own photos. */
  credit?: { author: string; license: string; licenseUrl: string; sourceUrl: string };
}

/** Upper case, letters and digits only - the backend's code_key (PA-28-161 = PA28161). */
export const codeKey = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');

const MODEL_PHOTOS: Record<string, AircraftPhoto> = {
  DA40D: {
    src: `${BASE}/models/DA40D.jpg`,
    credit: {
      author: 'Ad Meskens', license: 'CC BY-SA 3.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Keiheuvel_Diamond_DA40_Diamond_Star.JPG',
    },
  },
  DA40NG: {
    src: `${BASE}/models/DA40NG.jpg`,
    credit: {
      author: 'ZLEA', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Diamond_DA40_NG_Diamond_Star_(N297LA,_cn_40.NC101)_(1-18-2026).jpg',
    },
  },
  PA18150: {
    src: `${BASE}/models/PA18-150.jpg`,
    credit: {
      author: 'Felix König', license: 'CC BY 3.0', licenseUrl: 'https://creativecommons.org/licenses/by/3.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Piper_PA-18_Super_Cub_L%C3%B6chgau_2012.JPG',
    },
  },
  PA28140: {
    src: `${BASE}/models/PA28-140.jpg`,
    credit: {
      author: 'Bidgee', license: 'CC BY-SA 3.0 AU', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/au/deed.en',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Piper_PA-28-140_Cherokee_Cruiser_(VH-PBE)_at_Wagga_Wagga_Airport,_in_Feb_2024.jpg',
    },
  },
  PA28161: {
    src: `${BASE}/models/PA28-161.jpg`,
    credit: {
      author: 'Ad Meskens', license: 'CC BY-SA 3.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Piper_PA-28-161_Warrior_III.jpg',
    },
  },
  PA28181: {
    src: `${BASE}/models/PA28-181.jpg`,
    credit: {
      author: 'Bidgee', license: 'CC BY-SA 3.0 AU', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/au/deed.en',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Piper_PA-28-181_Archer_III_(VH-NRP)_taxiing_at_Wagga_Wagga_Airport.jpg',
    },
  },
  PA32R300: {
    src: `${BASE}/models/PA-32R-300.jpg`,
    credit: {
      author: 'ZLEA', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Piper_PA-32R-300_Cherokee_Lance_(N75267,_cn_32R-7680284)_(2-18-2026).jpg',
    },
  },
  TB9: {
    src: `${BASE}/models/TB9.jpg`,
    credit: {
      author: 'Robbie Klinkenberg', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Socata_TB-9_Tampico_PH-IIS_at_EBOS_in_2018.jpg',
    },
  },
};

/** The clubs' own photos of their aircraft, by registration. */
const REGISTRATION_PHOTOS: Record<string, string> = {
  'SE-MBC': `${BASE}/da40d.jpg`,
  'SE-MIO': `${BASE}/da40ng.jpg`,
  'SE-KMI': `${BASE}/pa28160.jpg`,
  'SE-GCG': `${BASE}/pa18150.jpg`,
  'SE-GVE': `${BASE}/pa28161.jpg`,
  'OH-WOW': `${BASE}/OH-WOW.jpg`,
  'SE-GRZ': `${BASE}/SE-GRZ-Termika.jpg`,
  'SE-GLC': `${BASE}/SE-GLC.jpg`,
  'SE-KML': `${BASE}/se-kml.jpg`,
  'HB-OJI': `${BASE}/hb_oji.jpg`,
  'F-GKVK': `${BASE}/F-GKVK.jpg`,
  'SE-ILO': `${BASE}/SE-ILO.jpg`,
  'SE-KBH': `${BASE}/SE-KBH.jpg`,
};

/** The aircraft's own photo if there is one, else its model's, else none. */
export function photoFor(code: string, registration?: string | null): AircraftPhoto | null {
  const own = registration ? REGISTRATION_PHOTOS[registration.toUpperCase()] : undefined;
  if (own) return { src: own };
  return MODEL_PHOTOS[codeKey(code)] ?? null;
}
