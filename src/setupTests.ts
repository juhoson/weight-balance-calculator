// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// jsdom lays nothing out and has no scrolling: a page that scrolls to the top does nothing in tests.
window.scrollTo = (() => undefined) as typeof window.scrollTo;
