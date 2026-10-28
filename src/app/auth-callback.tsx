import { Redirect } from 'expo-router';

/** Google sign-in returns here; the session is exchanged in session.tsx. */
export default function AuthCallback() {
  return <Redirect href="/" />;
}
