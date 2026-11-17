import { requireOptionalNativeModule } from 'expo';

/**
 * Joins the clips of one recording (when the camera was flipped mid-recording)
 * into a single video. Native module in modules/relive-video-merge; builds
 * without it can't flip while recording, so the camera keeps that off.
 */
const native = requireOptionalNativeModule<{ merge(uris: string[]): Promise<string> }>('ReliveVideoMerge');

export const canMergeClips = native != null;

export async function mergeClips(uris: string[]): Promise<string> {
  if (uris.length === 1) return uris[0];
  if (!native) throw new Error('Joining clips isn’t available in this version.');
  return native.merge(uris);
}
