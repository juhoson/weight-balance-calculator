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

const columns = (container: HTMLElement) => container.querySelectorAll('rect[fill="transparent"]');

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
