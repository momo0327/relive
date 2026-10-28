/**
 * Public runtime configuration. Only values that are safe to ship inside the
 * app binary belong here; the Supabase service/secret key never does.
 */
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

export const config = {
  supabaseUrl,
  supabaseKey,
  /** True when the app can talk to a real backend. */
  hasBackend: supabaseUrl.startsWith('https://') && supabaseKey.length > 0,
  /** Optional https origin with universal links configured, e.g. https://relive.app */
  inviteBaseUrl: (process.env.EXPO_PUBLIC_INVITE_BASE_URL ?? '').replace(/\/$/, ''),
  privacyPolicyUrl: process.env.EXPO_PUBLIC_PRIVACY_URL ?? '',
  termsUrl: process.env.EXPO_PUBLIC_TERMS_URL ?? '',
  supportEmail: process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? '',
  /** Help & safety page (contact, reporting, FAQ). Falls back to the support email. */
  helpUrl: process.env.EXPO_PUBLIC_HELP_URL ?? '',
  googleEnabled: process.env.EXPO_PUBLIC_GOOGLE_SIGN_IN !== 'off',
  /** Shows the discreet "Sign in with email" link (for the App Review account). */
  emailSignIn: process.env.EXPO_PUBLIC_EMAIL_SIGN_IN === 'on',
} as const;

export const limits = {
  maxVideoSeconds: 30,
  maxUploadBytes: 50 * 1024 * 1024,
  maxPhotoEdge: 3072,
  photoQuality: 0.85,
  pickerSelectionLimit: 20,
  signedUrlSeconds: 600,
} as const;
