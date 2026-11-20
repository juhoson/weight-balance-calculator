// Where to read an airport's NOTAMs. No free NOTAM API covers Swedish airports, so we link to the
// official LFV AROWeb bulletins: PDFs per FIR (not per airport), refreshed every 30 minutes.

const AROWEB = 'https://aro.lfv.se/Links/Link/ShowFileList?type=AIS';

export interface NotamSource {
  /** Link text. */
  label: string;
  url: string | null;
  /** Where to look once there. */
  hint: string;
}

const NORDIC_OTHER: Record<string, string> = { EF: 'EFIN FIR', EK: 'EKDK FIR', EN: 'ENOR ENOB FIR' };

export function notamSource(code: string): NotamSource {
  const icao = code.trim().toUpperCase();
  const prefix = icao.slice(0, 2);
  if (prefix === 'ES') {
    return {
      label: 'NOTAMs (LFV AROWeb)',
      url: `${AROWEB}&path=%5Cpibsweden%5C&torlinkName=NOTAM%20Sweden`,
      hint: `Look for ${icao} in the "ESAA FIR VFR 24hr" bulletin (or "IFR 24hr").`,
    };
  }
  if (NORDIC_OTHER[prefix]) {
    return {
      label: 'NOTAMs (LFV AROWeb)',
      url: `${AROWEB}&path=%5Cpibother%5C&torlinkName=NOTAM%20Other`,
      hint: `Look for ${icao} in the "${NORDIC_OTHER[prefix]} 24hr" bulletin.`,
    };
  }
  return { label: 'NOTAMs', url: null, hint: `Check NOTAMs for ${icao} with the national AIS or your briefing provider.` };
}
