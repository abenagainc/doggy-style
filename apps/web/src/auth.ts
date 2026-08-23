import { AppError } from "@doggy-style/domain";
import { supabase } from "./supabase.js";

export async function signUp(input: { email: string; password: string; displayName?: string; termsVersion: string; privacyNoticeVersion: string; locale: string; termsHash: string; privacyNoticeHash: string }) {
  if (!input.termsVersion || !input.privacyNoticeVersion) throw new AppError("VALIDATION_ERROR", "Please accept the current Terms and Privacy Notice.");
  const { data, error } = await supabase.auth.signUp({ email: input.email, password: input.password, options: { data: { ...(input.displayName ? { displayName: input.displayName } : {}), signupConsent: { termsVersion: input.termsVersion, privacyNoticeVersion: input.privacyNoticeVersion, locale: input.locale, termsHash: input.termsHash, privacyNoticeHash: input.privacyNoticeHash } } } });
  if (error || !data.user) throw new AppError("VALIDATION_ERROR", "We could not create your account.");
}
export async function login(email: string, password: string) { const { error } = await supabase.auth.signInWithPassword({ email, password }); if (error) throw new AppError("UNAUTHORIZED", "Email or password is incorrect."); }
export async function logout() { const { error } = await supabase.auth.signOut(); if (error) throw new AppError("UNAVAILABLE", "Could not sign out. Please try again."); }
export async function recoverPassword(email: string, redirectTo: string) { const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo }); if (error) throw new AppError("UNAVAILABLE", "Could not send the recovery email. Please try again."); }
