const SCRIPT = 'script[src="https://cloud.umami.is/script.js"]';

function load(websiteId?: string): typeof import('./analytics') {
  const saved = process.env.REACT_APP_UMAMI_WEBSITE_ID;
  if (websiteId === undefined) delete process.env.REACT_APP_UMAMI_WEBSITE_ID;
  else process.env.REACT_APP_UMAMI_WEBSITE_ID = websiteId;
  let mod!: typeof import('./analytics');
  jest.isolateModules(() => { mod = require('./analytics'); });
  if (saved === undefined) delete process.env.REACT_APP_UMAMI_WEBSITE_ID;
  else process.env.REACT_APP_UMAMI_WEBSITE_ID = saved;
  return mod;
}

afterEach(() => {
  document.head.querySelectorAll(SCRIPT).forEach(s => s.remove());
  delete window.umami;
});

test('adds nothing without a website ID', () => {
  load().initAnalytics();
  expect(document.querySelector(SCRIPT)).toBeNull();
});

test('adds the script once, limited to the production domain', () => {
  const { initAnalytics } = load('abc-123');
  initAnalytics();
  initAnalytics();
  const scripts = document.querySelectorAll<HTMLScriptElement>(SCRIPT);
  expect(scripts).toHaveLength(1);
  expect(scripts[0].dataset.websiteId).toBe('abc-123');
  expect(scripts[0].dataset.domains).toBe('www.flightplanningtool.com');
});

test('passes events to Umami, and never throws when it is missing or fails', () => {
  const { track } = load('abc-123');
  expect(() => track('print')).not.toThrow();

  window.umami = { track: jest.fn() };
  track('aircraft', { type: 'PA28', source: 'generic' });
  expect(window.umami.track).toHaveBeenCalledWith('aircraft', { type: 'PA28', source: 'generic' });

  window.umami = { track: () => { throw new Error('blocked'); } };
  expect(() => track('print')).not.toThrow();
});
