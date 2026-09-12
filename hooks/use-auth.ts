import { useCallback, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import { firebaseConfigured, getFirebase } from '@/lib/firebase';

export type AuthStatus = 'loading' | 'signed-out' | 'signed-in' | 'disabled';

/** Firebase's own codes are not shown to farm staff; these are. */
function readable(error: unknown) {
  const code = (error as { code?: string })?.code ?? '';
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password')
    return 'That email and password do not match an account.';
  if (code === 'auth/user-not-found')
    return 'No account uses that email address.';
  if (code === 'auth/email-already-in-use')
    return 'An account already uses that email. Sign in instead.';
  if (code === 'auth/weak-password')
    return 'Choose a password of at least six characters.';
  if (code === 'auth/invalid-email') return 'Enter a valid email address.';
  if (code === 'auth/too-many-requests')
    return 'Too many attempts. Wait a few minutes and try again.';
  if (code === 'auth/network-request-failed')
    return 'No connection. Check the network and try again.';
  return error instanceof Error ? error.message : 'Sign in failed.';
}

export function useAuth() {
  const [status, setStatus] = useState<AuthStatus>(
    firebaseConfigured ? 'loading' : 'disabled',
  );
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (!firebaseConfigured) return;
    return onAuthStateChanged(getFirebase().auth, (next) => {
      setUser(next);
      setStatus(next ? 'signed-in' : 'signed-out');
    });
  }, []);

  const run = useCallback(async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      return '';
    } catch (e) {
      return readable(e);
    }
  }, []);

  return {
    status,
    user,
    enabled: firebaseConfigured,
    signIn: (email: string, password: string) =>
      run(() =>
        signInWithEmailAndPassword(getFirebase().auth, email, password),
      ),
    signUp: (email: string, password: string) =>
      run(() =>
        createUserWithEmailAndPassword(getFirebase().auth, email, password),
      ),
    resetPassword: (email: string) =>
      run(() => sendPasswordResetEmail(getFirebase().auth, email)),
    signOutUser: () => run(() => signOut(getFirebase().auth)),
  };
}
