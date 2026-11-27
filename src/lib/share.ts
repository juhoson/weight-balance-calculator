import { isNative } from './native';
import { downloadText } from './kml';

/**
 * Hands the pilot a file: in the browser, a download; in the app (where a web download goes
 * nowhere), the file is written to the app's cache and offered on the share sheet (Files, Mail,
 * AirDrop, Google Earth…). Cancelling the share sheet isn't an error.
 */
export async function saveFile(fileName: string, text: string, mime: string): Promise<void> {
  if (!isNative()) {
    downloadText(fileName, text, mime);
    return;
  }
  const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
  const { uri } = await Filesystem.writeFile({ path: fileName, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
  try {
    await Share.share({ title: fileName, files: [uri] });
  } catch (e) {
    if (!/cancel/i.test(e instanceof Error ? e.message : String(e))) throw e;
  }
}

/**
 * A page of the app as a file of its own (its styles inlined), for sharing where printing isn't
 * possible (the apps' web views can't print): opened from the share sheet it prints or saves as PDF.
 */
export function standaloneHtml(title: string, body: HTMLElement): string {
  const css = Array.from(document.styleSheets).map(sheet => {
    try {
      return Array.from(sheet.cssRules).map(r => r.cssText).join('\n');
    } catch {
      return ''; // another origin's sheet
    }
  }).join('\n');
  const esc = title.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
    + `<title>${esc}</title><style>${css}</style></head><body class="bg-white text-neutral-900">${body.outerHTML}</body></html>`;
}
