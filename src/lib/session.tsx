import type { Session } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { Backend } from './backend';
import { readJson, removeJson, writeJson } from './kv';
import { cancelAllTripNotifications } from './notifications';
import { liveBackend } from './live-backend';
import { previewBackend, resetPreview } from './preview-backend';
import { supabase } from './supabase';

type Mode = 'live' | 'preview';

type SessionContextValue = {
  ready: boolean;
  signedIn: boolean;
  mode: Mode | null;
  backend: Backend;
  provider: string | null;
  /** Signed-in user id, or 'preview'. */
  userId: string | null;
  /** Account email (may be an Apple private-relay address). */
  email: string | null;
  onboarded: boolean;
  pendingInvite: string | null;
  signInWithApple(): Promise<void>;
  signInWithGoogle(): Promise<void>;
  /** Email + password for pre-created accounts (e.g. App Review); public sign-up stays off. */
  signInWithEmail(email: string, password: string): Promise<void>;
  startPreview(): void;
  signOut(): Promise<void>;
  deleteAccount(): Promise<void>;
  completeOnboarding(): void;
  setPendingInvite(token: string | null): void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

type LocalState = { onboarded: boolean; pendingInvite: string | null };
const LOCAL_KEY = 'app-state';

export class CancelledError extends Error {}

function isCancel(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: string }).code === 'ERR_REQUEST_CANCELED';
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!supabase);
  const [preview, setPreview] = useState(false);
  const [local, setLocal] = useState<LocalState>(() =>
    readJson<LocalState>(LOCAL_KEY, { onboarded: false, pendingInvite: null }),
  );

  const updateLocal = useCallback((patch: Partial<LocalState>) => {
    setLocal((prev) => {
      if (Object.entries(patch).every(([k, v]) => prev[k as keyof LocalState] === v)) return prev;
      const next = { ...prev, ...patch };
      writeJson(LOCAL_KEY, next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const signInWithApple = useCallback(async () => {
    if (!supabase) throw new Error('Sign-in is not configured for this build.');
    const rawNonce = Crypto.randomUUID() + Crypto.randomUUID();
    const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
    let credential: AppleAuthentication.AppleAuthenticationCredential;
    try {
      credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });
    } catch (error) {
      if (isCancel(error)) throw new CancelledError();
      throw error;
    }
    if (!credential.identityToken) throw new Error('Apple did not return a sign-in token.');
    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
      nonce: rawNonce,
    });
    if (error) throw error;

    // Apple shares the name only on the very first authorization. Profiles use the first name.
    const name = (credential.fullName?.givenName ?? '').trim();
    if (name) {
      const current = await liveBackend.getProfile().catch(() => null);
      if (current && !current.displayName) await liveBackend.updateProfile({ displayName: name }).catch(() => undefined);
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) throw new Error('Sign-in is not configured for this build.');
    const redirectTo = Linking.createURL('auth-callback');
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error || !data.url) throw error ?? new Error('Google sign-in is unavailable.');
    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success') throw new CancelledError();
    const { queryParams } = Linking.parse(result.url);
    const code = typeof queryParams?.code === 'string' ? queryParams.code : null;
    if (!code) throw new Error('Google sign-in was not completed.');
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;
  }, []);

  const completeOnboarding = useCallback(() => updateLocal({ onboarded: true }), [updateLocal]);
  const setPendingInvite = useCallback((token: string | null) => updateLocal({ pendingInvite: token }), [updateLocal]);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error('Sign-in is not configured for this build.');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
  }, []);

  const startPreview = useCallback(() => {
    resetPreview();
    setPreview(true);
  }, []);

  const clearDeviceData = useCallback(() => {
    removeJson('upload-queue');
    updateLocal({ pendingInvite: null });
  }, [updateLocal]);

  const signOut = useCallback(async () => {
    if (preview) {
      setPreview(false);
      return;
    }
    await cancelAllTripNotifications();
    await supabase?.auth.signOut({ scope: 'local' });
  }, [preview]);

  const deleteAccount = useCallback(async () => {
    if (preview) {
      setPreview(false);
      return;
    }
    if (!supabase) return;
    let appleAuthorizationCode: string | undefined;
    if (session?.user.app_metadata.provider === 'apple') {
      // A fresh authorization code lets the server revoke the Apple token.
      try {
        const credential = await AppleAuthentication.signInAsync({ requestedScopes: [] });
        appleAuthorizationCode = credential.authorizationCode ?? undefined;
      } catch (error) {
        if (isCancel(error)) throw new CancelledError();
        throw error;
      }
    }
    const { error } = await supabase.functions.invoke('delete-account', {
      body: { appleAuthorizationCode },
    });
    if (error) throw new Error('delete_failed');
    clearDeviceData();
    await cancelAllTripNotifications();
    await supabase.auth.signOut({ scope: 'local' });
  }, [preview, session, clearDeviceData]);

  const value = useMemo<SessionContextValue>(() => {
    const mode: Mode | null = preview ? 'preview' : session ? 'live' : null;
    return {
      ready,
      signedIn: mode !== null,
      mode,
      backend: mode === 'live' ? liveBackend : previewBackend,
      provider: session?.user.app_metadata.provider ?? null,
      userId: preview ? 'preview' : session?.user.id ?? null,
      email: preview ? null : session?.user.email ?? null,
      onboarded: local.onboarded,
      pendingInvite: local.pendingInvite,
      signInWithApple,
      signInWithGoogle,
      signInWithEmail,
      startPreview,
      signOut,
      deleteAccount,
      completeOnboarding,
      setPendingInvite,
    };
  }, [ready, preview, session, local, signInWithApple, signInWithGoogle, signInWithEmail, startPreview, signOut, deleteAccount, completeOnboarding, setPendingInvite]);

  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession() {
  const ctx = use(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
