import { Platform, Share } from 'react-native';

export type ShareOutcome = 'shared' | 'copied' | 'failed';

export async function shareLink(url: string, title: string): Promise<ShareOutcome> {
  if (Platform.OS === 'web') {
    const nav = (globalThis as { navigator?: Navigator }).navigator;
    if (nav?.share) {
      try {
        await nav.share({ title, url });
        return 'shared';
      } catch {
        // user dismissed or unsupported payload; fall through to clipboard
      }
    }
    if (nav?.clipboard) {
      await nav.clipboard.writeText(url);
      return 'copied';
    }
    return 'failed';
  }
  await Share.share(Platform.OS === 'ios' ? { url, message: title } : { message: `${title}\n${url}` });
  return 'shared';
}
