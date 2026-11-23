// Photos shown for the selected aircraft. A specific aircraft uses its own photo when there is one,
// otherwise the photo of its model. Model photos are from Wikimedia Commons under free licences and
// must be shown with their credit.

// Under the app's base path: /images on its own domain, /weight-balance/images under songer.se.
const BASE = `${process.env.PUBLIC_URL ?? ''}/images`;

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
  AA5B: {
    src: `${BASE}/models/AA-5B.jpg`,
    credit: {
      author: 'HawkeyeUK', license: 'CC BY-SA 2.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Grumman_AA-5B_Tiger_%E2%80%98G-BGPH%E2%80%99.jpg',
    },
  },
  AT01: {
    src: `${BASE}/models/AT01.jpg`,
    credit: {
      author: 'Huhu Uet', license: 'CC BY 3.0', licenseUrl: 'https://creativecommons.org/licenses/by/3.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Aquila_A-210_AT01_(D-EAIN)_05.jpg',
    },
  },
  C152: {
    src: `${BASE}/models/C152.jpg`,
    credit: {
      author: 'Alan Wilson from Peterborough, Cambs, UK', license: 'CC BY-SA 2.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Cessna_152_%E2%80%98G-OWOW%E2%80%99_%E2%80%9CDusty%E2%80%9D_(51368627689).jpg',
    },
  },
  C172RG: {
    src: `${BASE}/models/C172RG.jpg`,
    credit: {
      author: 'Alec Wilson from Hampton-in-Arden, United Kingdom', license: 'CC BY-SA 2.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:G-BILU_(51475062437).jpg',
    },
  },
  C172S: {
    src: `${BASE}/models/C172S.jpg`,
    credit: {
      author: 'Huhu Uet', license: 'CC BY 3.0', licenseUrl: 'https://creativecommons.org/licenses/by/3.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Cessna_172S_Skyhawk_SP_(D-EDDH)_01.jpg',
    },
  },
  C182T: {
    src: `${BASE}/models/C182T.jpg`,
    credit: {
      author: 'Bene Riobó', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:SE-LXU_Cessna_182T_Skylane_BMA.jpg',
    },
  },
  DA20C1: {
    src: `${BASE}/models/DA20-C1.jpg`,
    credit: {
      author: 'André Gerwing', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Diamond_DA20-C1_(c-n_C0177,_D-EKLI)_2026-07-04_Andre_Gerwing_Collection_ID_030367.jpg',
    },
  },
  NG5: {
    src: `${BASE}/models/NG5.jpg`,
    credit: {
      author: 'Rob Hodgkins', license: 'CC BY-SA 2.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:G-XGAB_Bristell_NG5_Speed_Wing_Old_Warden_17-08-2024_(54285300867).jpg',
    },
  },
  P92JS: {
    src: `${BASE}/models/P92-JS.jpg`,
    credit: {
      author: 'Huhu Uet', license: 'CC BY 3.0', licenseUrl: 'https://creativecommons.org/licenses/by/3.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Tecnam_P92_Echo_(D-MTPC)_05.jpg',
    },
  },
  PA28236: {
    src: `${BASE}/models/PA-28-236.jpg`,
    credit: {
      author: 'Alan Wilson', license: 'CC BY-SA 2.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Piper_PA28-236_G-LEAM_(6710699951).jpg',
    },
  },
  PA28R201: {
    src: `${BASE}/models/PA-28R-201.jpg`,
    credit: {
      author: 'Aeroprints.com', license: 'CC BY-SA 3.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:G-BZKL_Piper_PA-28R-201_Arrow_III_(9709647230).jpg',
    },
  },
  PA38112: {
    src: `${BASE}/models/PA-38-112.jpg`,
    credit: {
      author: 'Alan Wilson', license: 'CC BY-SA 2.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Piper_PA38-112_Tomahawk_%27G-BOMZ%27_(12307306456).jpg',
    },
  },
  R182: {
    src: `${BASE}/models/R182.jpg`,
    credit: {
      author: 'Alan Wilson from Peterborough, Cambs, UK', license: 'CC BY-SA 2.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Cessna_R.182_Skylane_RG_%E2%80%98G-BYEM%E2%80%99_(53665129311).jpg',
    },
  },
  SR20: {
    src: `${BASE}/models/SR20.jpg`,
    credit: {
      author: 'Steve Lynes from Sandshurst, United Kingdom', license: 'CC BY 2.0', licenseUrl: 'https://creativecommons.org/licenses/by/2.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:EGLK_-_Cirrus_SR20_GTS_-_F-HCGA_(29620196158).jpg',
    },
  },
  SR22: {
    src: `${BASE}/models/SR22.jpg`,
    credit: {
      author: 'Alan Wilson from Stilton, Peterborough, Cambs, UK', license: 'CC BY-SA 2.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Cirrus_SR22_%E2%80%98G-MAKS%E2%80%99_(36431775765).jpg',
    },
  },
  SW121: {
    src: `${BASE}/models/SW121.jpg`,
    credit: {
      author: 'Abc10', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Nummela_Airfield_OH-U669.jpg',
    },
  },
  TB10: {
    src: `${BASE}/models/TB10.jpg`,
    credit: {
      author: 'Alec BHX/KKC', license: 'CC BY-SA 2.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:G-BHDE_-_2.jpg',
    },
  },
  TB20: {
    src: `${BASE}/models/TB20.jpg`,
    credit: {
      author: 'Ad Meskens', license: 'CC BY-SA 3.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Keiheuvel_Socata_TB-20_Trinidad.JPG',
    },
  },
  DR400180: {
    src: `${BASE}/models/DR400-180.jpg`,
    credit: {
      author: 'Cjp24', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Robin_DR400-180_R%C3%A9gent,_F-GTPH.jpg',
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
