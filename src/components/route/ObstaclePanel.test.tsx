import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ObstaclePanel from './ObstaclePanel';
import { loadObstacles } from '../../lib/obstacles';

jest.mock('../../lib/obstacles', () => ({ ...jest.requireActual('../../lib/obstacles'), loadObstacles: jest.fn() }));

const route = [{ lat: 60, lon: 15 }, { lat: 60, lon: 15.5 }];

it('warns of an obstacle less than 500 ft below the planned altitude, and lists the others', async () => {
  (loadObstacles as jest.Mock).mockResolvedValue({
    dates: { effective: '2026-11-26', checked: '2026-11-26', source: '' },
    obstacles: [
      { lat: 60.02, lon: 15.25, topFt: 1350, heightFt: 1060, type: 'ANTENNA', name: 'HIGH MAST', lit: true },
      { lat: 59.98, lon: 15.1, topFt: 700, heightFt: 480, type: 'WINDMILL', name: 'TURBINE 4', lit: true },
      { lat: 61, lon: 15.1, topFt: 3000, heightFt: 1000, type: 'ANTENNA', name: 'FAR AWAY', lit: true },
    ],
  });
  render(<ObstaclePanel route={route} path={[{ nm: 0, ft: 1500 }, { nm: 15, ft: 1500 }]} basis="the planned path"/>);
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('1 obstacle less than 500 ft below the planned altitude');
  expect(alert).toHaveTextContent('Mast HIGH MAST: 1,350 ft MSL');
  expect(alert).toHaveTextContent('planned 1,500 ft, 150 ft above it');
  fireEvent.click(screen.getByRole('button', { name: /^Others 1, all at least 500 ft below the planned path/ }));
  expect(screen.getByText(/TURBINE 4/)).toBeInTheDocument();
  expect(screen.queryByText(/FAR AWAY/)).toBeNull();
  expect(screen.getByText(/not complete/)).toBeInTheDocument();
});
