/** Default landing route after sign-in (all users share the same workspace). */
export const DEFAULT_HOME = '/catastrophe';

export function isSignedIn(session) {
  return Boolean(session?.email);
}
