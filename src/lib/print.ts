/**
 * Printing the page (with its print styles): the browser's print() on the web; in the apps, whose web
 * views ignore print(), the system's print dialog for the web view (WebPrint, a plugin of the app's
 * own: ios/App/App/AppDelegate.swift, android/.../WebPrintPlugin.java). It prints or saves a PDF.
 */
import { registerPlugin } from '@capacitor/core';
import { isNative, nativePlatform } from './native';

const WebPrint = registerPlugin<{ print(options: { name: string }): Promise<{ completed?: boolean }> }>('WebPrint');

/** Prints the page; resolves when the print dialog has closed in the apps, at once (or after the dialog) on the web. */
export async function printPage(name: string): Promise<void> {
  if (!isNative()) {
    window.print();
    return;
  }
  await WebPrint.print({ name });
}

/**
 * True when printPage resolves only once the print dialog has closed (the iOS app): callers can tidy
 * up then. Elsewhere the printing may still be going on after it resolves.
 */
export const printWaits = (): boolean => nativePlatform() === 'ios';
