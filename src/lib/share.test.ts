import { saveFile, standaloneHtml } from './share';
import { isNative } from './native';
import { downloadText } from './kml';

jest.mock('./native', () => ({ isNative: jest.fn() }));
jest.mock('./kml', () => ({ downloadText: jest.fn() }));
const mockWriteFile = jest.fn();
const mockShare = jest.fn();
jest.mock('@capacitor/filesystem', () => ({
  Filesystem: { writeFile: (...a: unknown[]) => mockWriteFile(...a) }, Directory: { Cache: 'CACHE' }, Encoding: { UTF8: 'utf8' },
}), { virtual: true });
jest.mock('@capacitor/share', () => ({ Share: { share: (...a: unknown[]) => mockShare(...a) } }), { virtual: true });

it('downloads in the browser', async () => {
  (isNative as jest.Mock).mockReturnValue(false);
  await saveFile('a.kml', 'x', 'text/plain');
  expect(downloadText).toHaveBeenCalledWith('a.kml', 'x', 'text/plain');
});

it('in the app: written to the cache and offered on the mockShare sheet; cancelling is fine', async () => {
  (isNative as jest.Mock).mockReturnValue(true);
  mockWriteFile.mockResolvedValue({ uri: 'file:///cache/a.kml' });
  mockShare.mockRejectedValueOnce(new Error('Share canceled'));
  await saveFile('a.kml', '<kml/>', 'application/vnd.google-earth.kml+xml');
  expect(mockWriteFile).toHaveBeenCalledWith({ path: 'a.kml', data: '<kml/>', directory: 'CACHE', encoding: 'utf8' });
  expect(mockShare).toHaveBeenCalledWith({ title: 'a.kml', files: ['file:///cache/a.kml'] });
  mockShare.mockRejectedValueOnce(new Error('No app'));
  await expect(saveFile('a.kml', '<kml/>', 'x')).rejects.toThrow('No app');
});

it('a page of its own, escaped title', () => {
  const el = document.createElement('article');
  el.textContent = 'Times';
  const html = standaloneHtml('A & B', el);
  expect(html).toMatch(/^<!doctype html>/);
  expect(html).toContain('<title>A &amp; B</title>');
  expect(html).toContain('<article>Times</article>');
});
