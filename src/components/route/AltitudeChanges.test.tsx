import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import AltitudeChanges from './AltitudeChanges';

it('lists the changes, edits and removes them, and warns about one too soon to reach', () => {
  const onChange = jest.fn();
  const holds = [{ fromNm: 9, toNm: 41, ft: 2000, note: 'Under STOCKHOLM TMA' }, { fromNm: 60, toNm: 80, ft: 6500 }];
  render(<AltitudeChanges holds={holds} onChange={onChange} cruiseFt={4500} totalNm={120} missed={[{ fromNm: 60, toNm: 80, ft: 6500 }]}/>);
  expect(screen.getByText('Under STOCKHOLM TMA')).toBeInTheDocument();
  expect(screen.getByText(/Can't be at 6,500 ft by 60 NM/)).toBeInTheDocument();
  expect(screen.getAllByText(/Can't be at/)).toHaveLength(1);

  fireEvent.change(screen.getByLabelText('Change 1 altitude'), { target: { value: '1500' } });
  expect(onChange).toHaveBeenLastCalledWith([{ ...holds[0], ft: 1500 }, holds[1]]);
  fireEvent.click(screen.getByRole('button', { name: 'Remove change 2' }));
  expect(onChange).toHaveBeenLastCalledWith([holds[0]]);
  fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
  expect(onChange).toHaveBeenLastCalledWith([]);
});

it('adds one in the middle third, 1,000 ft below the cruise', () => {
  const onChange = jest.fn();
  render(<AltitudeChanges holds={[]} onChange={onChange} cruiseFt={4500} totalNm={120} missed={[]}/>);
  expect(screen.getByText(/All of it at 4,500 ft/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  expect(onChange).toHaveBeenCalledWith([{ fromNm: 40, toNm: 80, ft: 3500 }]);
});
