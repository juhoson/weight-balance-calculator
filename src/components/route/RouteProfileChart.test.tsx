import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import RouteProfileChart from './RouteProfileChart';
import { planRoute } from '../../lib/enroute';
import type { EnrouteSegment } from '../../types/route';

beforeAll(() => {
  global.ResizeObserver = class {
    observe() { /* no-op */ }
    unobserve() { /* no-op */ }
    disconnect() { /* no-op */ }
  } as unknown as typeof ResizeObserver;
});

const hours = ['2026-11-23T10:00:00Z', '2026-11-23T11:00:00Z', '2026-11-23T12:00:00Z'];
const segment = (k: number): EnrouteSegment => ({
  leg: 0, startNm: k * 25, distanceNm: 25, trueCourseDeg: 270, lat: 59.5, lon: 16.5, groundFt: 100,
  windDirTrue: [270, 270, 270], windKt: [20, 20, 20], tempC: [-2, -4, -6],
  cloudBaseFt: [4000, 4000, 4000], freezingLevelFt: [1500, 1500, 1500],
  layers: [[{ heightFt: 4500, cloudCover: 80 }], [{ heightFt: 4500, cloudCover: 80 }], []],
});

function legs() {
  const plan = planRoute([{ from: 'ESSX', to: 'ESGG', distanceNm: 50, trueCourseDeg: 270 }],
    { available: true, altitudeFt: 3000, times: hours, segments: [segment(0), segment(1)] }, 100, new Date('2026-11-23T10:00:00Z'));
  if (!plan.ok) throw new Error('no plan');
  return plan.legs;
}

const columns = (container: HTMLElement) => container.querySelectorAll('rect[data-segment]');

it('a tap opens a segment\'s details and another tap on it closes them', () => {
  const { container } = render(<RouteProfileChart legs={legs()} altitudeFt={3000}/>);
  fireEvent.pointerUp(columns(container)[1]);
  expect(screen.getByRole('dialog', { name: 'Segment details' })).toHaveTextContent('25–50 NM');
  fireEvent.pointerUp(columns(container)[1]);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('closes from its own button, a tap on it, Escape or a tap elsewhere', () => {
  const { container } = render(<div><p>Elsewhere</p><RouteProfileChart legs={legs()} altitudeFt={3000}/></div>);
  const open = () => fireEvent.pointerUp(columns(container)[0]);

  open();
  fireEvent.click(screen.getByRole('button', { name: 'Close segment details' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

  open();
  fireEvent.pointerUp(screen.getByRole('dialog'));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

  open();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

  open();
  fireEvent.pointerDown(screen.getByText('Elsewhere'));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('places the details away from the cruise line', () => {
  const { container, rerender } = render(<RouteProfileChart legs={legs()} altitudeFt={9500}/>);
  fireEvent.pointerUp(columns(container)[0]);
  expect(screen.getByRole('dialog').style.bottom).not.toBe(''); // high cruise: details at the bottom
  rerender(<RouteProfileChart legs={legs()} altitudeFt={2000}/>);
  expect(screen.getByRole('dialog').style.top).not.toBe(''); // low cruise: at the top
});

it('a tap on an airspace box shows its limits and frequency, and the wind strip still shows the weather', () => {
  const tma = {
    airspace: {
      id: 't', name: 'STOCKHOLM TMA', type: 'TMA', icaoClass: 'C', activation: null, polygon: [],
      lower: { ft: 2500, datum: 'MSL' as const, label: '2,500 ft MSL' }, upper: { ft: 9500, datum: 'STD' as const, label: 'FL95' },
      frequencies: [{ value: '132.480', name: 'SWEDEN CONTROL', kind: 'CENTER' as const, primary: true, source: null }],
    },
    fromNm: 10, toNm: 40, status: 'inside' as const, minFt: 3000, maxFt: 3000, floorFt: 2500, ceilingFt: 9500,
  };
  const { container } = render(<RouteProfileChart legs={legs()} altitudeFt={3000} airspaces={[tma]}/>);
  fireEvent.pointerUp(screen.getByRole('button', { name: 'Airspace STOCKHOLM TMA' }));
  const dialog = screen.getByRole('dialog', { name: 'Airspace details' });
  expect(dialog).toHaveTextContent('STOCKHOLM TMA');
  expect(dialog).toHaveTextContent('2,500 ft MSL – FL95');
  expect(dialog).toHaveTextContent('10–40 NM along the route. You are in it.');
  expect(dialog).toHaveTextContent('132.480 SWEDEN CONTROL');
  fireEvent.click(screen.getByRole('button', { name: 'Close airspace details' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

  fireEvent.pointerUp(columns(container)[0]);
  expect(screen.getByRole('dialog', { name: 'Segment details' })).toHaveTextContent('0–25 NM');
});

it('a tapped airspace offers going under or over it, which sets the cruise altitude', () => {
  const tma = {
    airspace: {
      id: 't', name: 'STOCKHOLM TMA', type: 'TMA', icaoClass: 'C', activation: null, polygon: [],
      lower: { ft: 2500, datum: 'MSL' as const, label: '2,500 ft MSL' }, upper: { ft: 9500, datum: 'STD' as const, label: 'FL95' },
      frequencies: [],
    },
    fromNm: 10, toNm: 40, status: 'inside' as const, minFt: 3000, maxFt: 3000, floorFt: 2500, ceilingFt: 9500,
  };
  const onPick = jest.fn();
  const avoid = {
    altitudeFt: 3000, onPick,
    optionsFor: () => [
      { side: 'under' as const, ft: 2000, why: 'At least 500 ft below its floor (2,500 ft MSL).', stillInside: false, alsoEnters: [] },
      { side: 'over' as const, ft: 11500, why: 'At least 500 ft above its top (FL95).', stillInside: false, alsoEnters: ['STOCKHOLM CTA'] },
    ],
  };
  render(<RouteProfileChart legs={legs()} altitudeFt={3000} airspaces={[tma]} avoid={avoid}/>);
  fireEvent.pointerUp(screen.getByRole('button', { name: 'Airspace STOCKHOLM TMA' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('Enters STOCKHOLM CTA instead.');
  fireEvent.pointerUp(screen.getByRole('button', { name: /Go under: 2,000 ft/ })); // a tap in the details doesn't close them first
  fireEvent.click(screen.getByRole('button', { name: /Go under: 2,000 ft/ }));
  expect(onPick).toHaveBeenCalledWith(2000);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('"only here" holds the altitude just where the route crosses the tapped airspace', () => {
  const tma = {
    airspace: {
      id: 't', name: 'STOCKHOLM TMA', type: 'TMA', icaoClass: 'C', activation: null, polygon: [],
      lower: { ft: 2500, datum: 'MSL' as const, label: '2,500 ft MSL' }, upper: { ft: 9500, datum: 'STD' as const, label: 'FL95' },
      frequencies: [],
    },
    fromNm: 10, toNm: 40, status: 'inside' as const, minFt: 3000, maxFt: 3000, floorFt: 2500, ceilingFt: 9500,
  };
  const onHold = jest.fn();
  const avoid = {
    altitudeFt: 3000, onPick: jest.fn(), onHold,
    optionsFor: () => [
      { side: 'under' as const, ft: 2000, why: '', stillInside: false, alsoEnters: [] },
      { side: 'over' as const, ft: null, why: 'Its top (FL195) is too high to go over.', stillInside: false, alsoEnters: [] },
    ],
  };
  render(<RouteProfileChart legs={legs()} altitudeFt={3000} airspaces={[tma]} avoid={avoid}/>);
  fireEvent.pointerUp(screen.getByRole('button', { name: 'Airspace STOCKHOLM TMA' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('Only here (9–41 NM):');
  expect(screen.queryByRole('button', { name: /over at/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /under at 2,000 ft/ }));
  expect(onHold).toHaveBeenCalledWith({ fromNm: 9, toNm: 41, ft: 2000, note: 'Under STOCKHOLM TMA' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

describe('altitude per leg', () => {
  const at = (ft: number) => {
    const plan = planRoute([{ from: 'ESSX', to: 'ESGG', distanceNm: 50, trueCourseDeg: 270 }],
      { available: true, altitudeFt: ft, times: hours, segments: [segment(0), segment(1)] }, 100, new Date('2026-11-23T10:00:00Z'));
    if (!plan.ok) throw new Error('no plan');
    return plan.legs;
  };

  it('steps with the arrow keys and drags in 500 ft steps', () => {
    const onLeg = jest.fn();
    render(<RouteProfileChart legs={at(3000)} altitudeFt={3000} onLegAltitude={onLeg}/>);
    const handle = screen.getByRole('slider', { name: 'Altitude on ESSX → ESGG' });
    expect(handle).toHaveAttribute('aria-valuenow', '3000');
    fireEvent.keyDown(handle, { key: 'ArrowUp' });
    expect(onLeg).toHaveBeenLastCalledWith(0, 3500);
    fireEvent.keyDown(handle, { key: 'PageDown' });
    expect(onLeg).toHaveBeenLastCalledWith(0, 2000);

    // The chart runs 0-6,000 ft over 176 px from y = 30: 4,000 ft is at y ≈ 89.
    // jsdom's pointer events carry no position: mouse events under the pointer names do.
    const pointer = (type: string, clientY: number) => fireEvent(handle, new MouseEvent(type, { bubbles: true, clientY }));
    pointer('pointerdown', 150);
    pointer('pointermove', 90);
    expect(handle).toHaveAttribute('aria-valuenow', '4000');
    pointer('pointerup', 90);
    expect(onLeg).toHaveBeenLastCalledWith(0, 4000);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); // a drag doesn't open the segment details
  });

  it('says when a leg is not at a VFR cruising level for its course', () => {
    render(<RouteProfileChart legs={at(5500)} altitudeFt={5500} onLegAltitude={jest.fn()}/>);
    // Westbound more than 3,000 ft above the ground: even thousands + 500.
    expect(screen.getByRole('slider', { name: 'Altitude on ESSX → ESGG' }))
      .toHaveAttribute('aria-valuetext', '5,500 ft, not a VFR cruising level for this course');
  });

  it('has no handles without somewhere to send the change', () => {
    render(<RouteProfileChart legs={at(3000)} altitudeFt={3000}/>);
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });
});

it('hovering shows the weather only over the wind strip, and moving down onto the chart hides it again', () => {
  const { container } = render(<RouteProfileChart legs={legs()} altitudeFt={3000} onLegAltitude={jest.fn()}/>);
  const strip = container.querySelectorAll('rect[data-wind-strip]')[0];
  // jsdom's pointer events have no pointerType: give them the mouse's.
  const enter = (el: Element) => {
    const e = new MouseEvent('pointerover', { bubbles: true });
    Object.defineProperty(e, 'pointerType', { value: 'mouse' });
    fireEvent(el, e);
  };
  enter(columns(container)[0]);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  enter(strip);
  expect(screen.getByRole('dialog', { name: 'Segment details' })).toBeInTheDocument();
  enter(columns(container)[0]);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('draws the cloud a METAR reports at its station, and the path on down from circuit height to the field', () => {
  const profile = { topFt: 3000, reachesCruise: true, tocNm: 5, todNm: 40, path: [{ nm: 0, ft: 100 }, { nm: 5, ft: 3000 }, { nm: 40, ft: 3000 }, { nm: 48, ft: 1100 }] };
  const { container } = render(<RouteProfileChart legs={legs()} altitudeFt={3000}
    profile={profile as unknown as Parameters<typeof RouteProfileChart>[0]['profile']} arrivalFt={100}
    reported={[{ nm: 0, station: 'ESSX', elevationFt: 100, clouds: [{ cover: 'OVC', baseFt: 500, type: null }] }]}/>);
  expect(screen.getByText('OVC005 ESSX')).toBeInTheDocument();
  expect(screen.getByText('Cloud reported (METAR)')).toBeInTheDocument();
  // Circuit height to the runway: a dashed line on to the end of the route at the field's elevation.
  expect(container.querySelector('path[stroke-dasharray="4 3"]')).not.toBeNull();
});
