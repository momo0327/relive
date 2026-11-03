import { Asset } from 'expo-asset';

/** Gradient covers bundled with the app; uploaded like a photo when chosen. */
export const COVER_COLORS: { id: string; colors: [string, string]; module: number }[] = [
  { id: 'violet', colors: ['#A78BFA', '#4F46E5'], module: require('@/assets/covers/gradient-1.jpg') },
  { id: 'sunset', colors: ['#EC4899', '#FACC15'], module: require('@/assets/covers/gradient-2.jpg') },
  { id: 'coral', colors: ['#FB923C', '#F43F5E'], module: require('@/assets/covers/gradient-3.jpg') },
  { id: 'lagoon', colors: ['#2DD4BF', '#3B82F6'], module: require('@/assets/covers/gradient-4.jpg') },
  { id: 'forest', colors: ['#84CC16', '#0D9488'], module: require('@/assets/covers/gradient-5.jpg') },
  { id: 'night', colors: ['#0F172A', '#6366F1'], module: require('@/assets/covers/gradient-6.jpg') },
  { id: 'peach', colors: ['#FDBA74', '#DB2777'], module: require('@/assets/covers/gradient-7.jpg') },
  { id: 'slate', colors: ['#94A3B8', '#1E293B'], module: require('@/assets/covers/gradient-8.jpg') },
];

/** Local file for a bundled gradient, ready to upload as a cover. */
export async function coverColorUri(module: number): Promise<string> {
  const asset = Asset.fromModule(module);
  await asset.downloadAsync();
  if (!asset.localUri) throw new Error('cover_unavailable');
  return asset.localUri;
}
