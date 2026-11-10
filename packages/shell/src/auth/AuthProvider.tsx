import type { Session, SupabaseClient } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type { SupabaseConfig } from '../config/env';
import { createSupabaseClient } from './supabase';

export type SignUpResult = { needsEmailConfirmation: boolean };

export type AuthContextValue = {
  /** False until the stored session has been read. */
  ready: boolean;
  /** False when the app has no Supabase keys in its env. */
  configured: boolean;
  session: Session | null;
  client: SupabaseClient | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export class BackendNotConfiguredError extends Error {
  constructor() {
    super('Accounts are not set up for this build yet. Add the Supabase keys to .env.');
    this.name = 'BackendNotConfiguredError';
  }
}

export function AuthProvider({
  supabase,
  children,
}: {
  supabase: SupabaseConfig | null;
  children: ReactNode;
}) {
  const client = useMemo(() => (supabase ? createSupabaseClient(supabase) : null), [supabase]);
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!client);

  useEffect(() => {
    if (!client) return;
    let active = true;
    client.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setReady(true);
    });
    const { data } = client.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [client]);

  const requireClient = useCallback(() => {
    if (!client) throw new BackendNotConfiguredError();
    return client;
  }, [client]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { error } = await requireClient().auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
    },
    [requireClient],
  );

  const signUp = useCallback(
    async (email: string, password: string) => {
      const { data, error } = await requireClient().auth.signUp({ email: email.trim(), password });
      if (error) throw error;
      return { needsEmailConfirmation: !data.session };
    },
    [requireClient],
  );

  const signOut = useCallback(async () => {
    const { error } = await requireClient().auth.signOut();
    if (error) throw error;
  }, [requireClient]);

  const deleteAccount = useCallback(async () => {
    const c = requireClient();
    // Deleting a user needs the service role key, so it runs in the
    // `delete-account` edge function (apps/template/supabase/functions).
    const { error } = await c.functions.invoke('delete-account', { method: 'POST' });
    if (error) throw error;
    await c.auth.signOut({ scope: 'local' });
  }, [requireClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      configured: Boolean(client),
      session,
      client,
      signIn,
      signUp,
      signOut,
      deleteAccount,
    }),
    [ready, client, session, signIn, signUp, signOut, deleteAccount],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>.');
  return value;
}
