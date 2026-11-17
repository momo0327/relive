// Runs on EAS after installing dependencies (eas-build-post-install): fails the
// build if the expo-camera patch (exact zoom + lens info for 0.5x/1x/tele) was
// not applied, instead of silently shipping a camera without zoom.
import { readFileSync } from 'node:fs';

const file = 'node_modules/expo-camera/ios/Current/CameraSessionManager.swift';
const source = readFileSync(file, 'utf8');
if (!source.includes('Relive: values of 1 or more are an exact zoom factor')) {
  console.error(`patches/expo-camera patch is NOT applied (${file}). Run "npx patch-package" and check the patch matches.`);
  process.exit(1);
}
console.log('expo-camera patch applied.');
