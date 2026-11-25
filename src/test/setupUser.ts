import { act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/** How long after an action the components' frames (positioning, open/close animations) get, inside act. */
const FRAMES_MS = 50;

/**
 * user-event whose every action, and the frames after it, run inside act: the aircraft picker
 * (Headless UI) and the selects and dialogs (Radix) position and animate themselves on animation
 * frames after a click, which would otherwise update React outside act and warn.
 */
export function setupUser(options?: Parameters<typeof userEvent.setup>[0]): ReturnType<typeof userEvent.setup> {
  const user = userEvent.setup(options);
  const frames = () => new Promise(resolve => setTimeout(resolve, FRAMES_MS));
  return new Proxy(user, {
    get(target, key: keyof typeof user) {
      const value = target[key];
      if (typeof value !== 'function') return value;
      return async (...args: unknown[]) => {
        let result: unknown;
        await act(async () => {
          result = await (value as (...a: unknown[]) => Promise<unknown>).apply(target, args);
          await frames();
        });
        return result;
      };
    },
  });
}
