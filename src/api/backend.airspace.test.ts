import { fetchAirspacesAlong } from './backend';

test('an airspace answer from an older backend, without frequencies, reads as none', async () => {
  const old = [{ id: 'a', name: 'X', type: 'CTR', icaoClass: 'D', activation: null, lower: { ft: 0, datum: 'GND', label: 'GND' },
    upper: { ft: 1500, datum: 'MSL', label: '1,500 ft MSL' }, polygon: [[16, 59], [17, 59], [17, 60], [16, 59]] }];
  const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify(old) });
  (global as unknown as { fetch: unknown }).fetch = fetchMock;
  const list = await fetchAirspacesAlong([{ lat: 59, lon: 16 }, { lat: 60, lon: 17 }]);
  expect(list[0].frequencies).toEqual([]);
  expect(String(fetchMock.mock.calls[0][0])).toContain('v=2');
});
