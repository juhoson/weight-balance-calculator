import React from 'react';

interface HudProps {
  speedKt: number | null;
  altFt: number | null;
  vsFpm: number | null;
  trackDeg: number | null;
  /** From the turn rate (GPS): right positive. */
  bankDeg: number;
  /** Flight path angle from the climb rate: up positive. */
  pathDeg: number;
  /** The aircraft is at the centre of the map (following it): draw the horizon around it. */
  centred: boolean;
  /** Where the aircraft is, as a share of the height from the top (track-up puts it low). */
  atY?: number;
}

const pad3 = (n: number) => String(Math.round(((n % 360) + 360) % 360)).padStart(3, '0');
const TAPE_W = 58, TAPE_H = 210;
/** Tapes start this far either side of the centre, px. */
const TAPE_GAP = 92;
const KT_PX = 3; // 70 kt shown
const FT_PX = 0.4; // 525 ft shown
const DEG_PX = 6; // pitch ladder
const BANK_R = 78;
const BANK_TICKS = [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60];

/** White text with a dark edge, readable over any map (lines get a shadow from the whole drawing). */
const INK = 'fill-white';
const halo = { paintOrder: 'stroke' as const, stroke: 'rgba(2,6,23,.85)', strokeWidth: 3 };

/** A vertical tape: the value in the box in the middle, the scale moving past it. */
const Tape: React.FC<{
  x: number; value: number | null; pxPer: number; step: number; labelEvery: number; side: 'left' | 'right'; title: string; format?: (n: number) => string;
}> = ({ x, value, pxPer, step, labelEvery, side, title, format = n => String(n) }) => {
  const v = value ?? 0;
  const half = TAPE_H / 2 / pxPer;
  const first = Math.ceil((v - half) / step) * step;
  const ticks: number[] = [];
  for (let t = first; t <= v + half; t += step) ticks.push(t);
  const clip = `hud-${side}`;
  const inner = side === 'left' ? x + TAPE_W : x; // the edge towards the centre
  const box = side === 'left'
    ? `M${x},-13 H${x + TAPE_W - 6} L${x + TAPE_W},0 L${x + TAPE_W - 6},13 H${x} Z`
    : `M${x + TAPE_W},-13 H${x + 6} L${x},0 L${x + 6},13 H${x + TAPE_W} Z`;
  return (
    <g>
      <defs><clipPath id={clip}><rect x={x} y={-TAPE_H / 2} width={TAPE_W} height={TAPE_H}/></clipPath></defs>
      <rect x={x} y={-TAPE_H / 2} width={TAPE_W} height={TAPE_H} rx={4} fill="rgba(2,6,23,.28)"/>
      <g clipPath={`url(#${clip})`}>
        {ticks.map(t => {
          const ty = (v - t) * pxPer;
          const major = t % labelEvery === 0;
          const dir = side === 'left' ? -1 : 1;
          return (
            <g key={t}>
              <line x1={inner} x2={inner + dir * (major ? 10 : 5)} y1={ty} y2={ty} className="stroke-white" strokeWidth={1.5}/>
              {major && t >= 0 && (
                <text x={inner + dir * 14} y={ty} dy="0.35em" textAnchor={side === 'left' ? 'end' : 'start'}
                  className={`${INK} text-[12px] font-semibold tabular-nums`} style={halo}>{format(t)}</text>
              )}
            </g>
          );
        })}
      </g>
      <path d={box} fill="rgba(2,6,23,.9)" className="stroke-white" strokeWidth={1.5}/>
      <text x={side === 'left' ? x + TAPE_W - 10 : x + 10} y={0} dy="0.36em" textAnchor={side === 'left' ? 'end' : 'start'}
        className="fill-white text-[16px] font-bold tabular-nums">{value == null ? '---' : format(Math.round(value))}</text>
      <text x={x + TAPE_W / 2} y={-TAPE_H / 2 - 6} textAnchor="middle" className={`${INK} text-[10px] font-semibold`} style={halo}>{title}</text>
    </g>
  );
};

/**
 * Garmin-style speed and altitude tapes either side of the aircraft, with a bank scale and horizon
 * around it, all see-through so the map stays readable. Everything comes from the GPS: ground speed,
 * GPS altitude, and a bank and flight path worked out from the turn and the climb (no gyro).
 */
const Hud: React.FC<HudProps> = ({ speedKt, altFt, vsFpm, trackDeg, bankDeg, pathDeg, centred, atY = 0.5 }) => {
  const w = 2 * (TAPE_GAP + TAPE_W) + 4, h = TAPE_H + 60;
  const vs = vsFpm ?? 0;
  // The climb bar beside the altitude tape: ±1,000 ft/min to its ends.
  const vsPx = Math.max(-1, Math.min(1, vs / 1000)) * (TAPE_H / 2 - 10);
  const pitchPx = Math.max(-40, Math.min(40, pathDeg * DEG_PX));
  return (
    <div className="pointer-events-none absolute inset-0 z-[900]" aria-hidden="true" data-testid="hud">
      <svg width={w} height={h} viewBox={`${-w / 2} ${-h / 2} ${w} ${h}`} className="absolute left-1/2 overflow-visible"
        style={{ top: `${atY * 100}%`, transform: 'translate(-50%, -50%)', filter: 'drop-shadow(0 0 1.5px rgba(2,6,23,.9))' }}>
        {centred && (
          <g>
            {/* Bank scale: fixed ticks along an arc, the pointer turning with the bank. */}
            <path d={`M${-BANK_R * Math.sin(Math.PI / 3)},${-BANK_R * Math.cos(Math.PI / 3)} A${BANK_R},${BANK_R} 0 0 1 ${BANK_R * Math.sin(Math.PI / 3)},${-BANK_R * Math.cos(Math.PI / 3)}`}
              fill="none" className="stroke-white" strokeWidth={1.5}/>
            {BANK_TICKS.map(t => {
              const r = (t * Math.PI) / 180, long = t % 30 === 0;
              return (
                <line key={t} x1={BANK_R * Math.sin(r)} y1={-BANK_R * Math.cos(r)} x2={(BANK_R + (long ? 10 : 6)) * Math.sin(r)} y2={-(BANK_R + (long ? 10 : 6)) * Math.cos(r)}
                  className="stroke-white" strokeWidth={t === 0 ? 2.5 : 1.5}/>
              );
            })}
            <g transform={`rotate(${-bankDeg})`}>
              <path d={`M0,${-BANK_R + 2} l-6,10 h12 z`} className={Math.abs(bankDeg) > 35 ? 'fill-amber-400' : 'fill-white'} stroke="rgba(2,6,23,.85)" strokeWidth={1}/>
              {/* Horizon and pitch ladder, moved by the flight path, with a gap round the aircraft. */}
              <g transform={`translate(0,${pitchPx})`}>
                <path d={`M${-TAPE_GAP + 6},0 H-26 M26,0 H${TAPE_GAP - 6}`} fill="none" className="stroke-white" strokeWidth={2} strokeOpacity={0.9}/>
                {[-10, -5, 5, 10].map(d => (
                  <g key={d} transform={`translate(0,${-d * DEG_PX})`}>
                    <path d={`M${d % 10 ? -12 : -22},0 H${d % 10 ? 12 : 22}`} className="stroke-white" strokeWidth={1.2}
                      strokeDasharray={d < 0 ? '4 3' : undefined} strokeOpacity={0.75}/>
                  </g>
                ))}
              </g>
            </g>
            {/* The aircraft's own reference: wings either side of the map's symbol. */}
            <path d="M-58,0 H-30 l0,6 M58,0 H30 l0,6" fill="none" className="stroke-amber-400" strokeWidth={4} strokeLinecap="round"/>
            {Math.abs(bankDeg) >= 3 && (
              <text x={0} y={-BANK_R - 16} textAnchor="middle" className={`${INK} text-[11px] font-semibold tabular-nums`} style={halo}>
                {Math.round(Math.abs(bankDeg))}° {bankDeg > 0 ? 'R' : 'L'}
              </text>
            )}
          </g>
        )}

        <Tape x={-TAPE_GAP - TAPE_W} value={speedKt} pxPer={KT_PX} step={5} labelEvery={10} side="left" title="GS kt"/>
        <Tape x={TAPE_GAP} value={altFt} pxPer={FT_PX} step={20} labelEvery={100} side="right" title="GPS ALT ft"
          format={n => n.toLocaleString('en')}/>

        {/* Climb rate: a bar beside the altitude tape, and the number under it. */}
        <g transform={`translate(${TAPE_GAP + TAPE_W + 4},0)`}>
          <rect x={0} y={-TAPE_H / 2} width={6} height={TAPE_H} rx={3} fill="rgba(2,6,23,.28)"/>
          <rect x={0} y={Math.min(0, -vsPx)} width={6} height={Math.abs(vsPx)} rx={2} className={vs < -800 ? 'fill-amber-400' : 'fill-fuchsia-400'}/>
        </g>
        <text x={TAPE_GAP + TAPE_W / 2} y={TAPE_H / 2 + 16} textAnchor="middle" className={`${INK} text-[11px] font-semibold tabular-nums`} style={halo}>
          {vsFpm == null ? 'VS ---' : `${vs >= 0 ? '+' : '−'}${Math.abs(Math.round(vs / 10) * 10).toLocaleString('en')} fpm`}
        </text>
        <text x={-TAPE_GAP - TAPE_W / 2} y={TAPE_H / 2 + 16} textAnchor="middle" className={`${INK} text-[11px] font-semibold tabular-nums`} style={halo}>
          TRK {trackDeg == null ? '---' : `${pad3(trackDeg)}°`}
        </text>
      </svg>
    </div>
  );
};

export default Hud;
