import { Redirect } from 'expo-router';
import { useEffect } from 'react';

import { useSession } from '@/lib/session';

/**
 * Development-only shortcut (l8r://dev-preview or exp://…/--/dev-preview):
 * opens preview mode with onboarding skipped, so simulators can be driven by
 * deep links for layout checks. Does nothing in release builds.
 */
export default function DevPreview() {
  const { signedIn, startPreview, completeOnboarding } = useSession();
  useEffect(() => {
    if (__DEV__ && !signedIn) {
      startPreview();
      completeOnboarding();
    }
  }, [signedIn, startPreview, completeOnboarding]);
  return <Redirect href="/" />;
}
