// Supabase projects can configure email OTPs from six to ten digits.
export const EMAIL_OTP_PATTERN = "[0-9]{6,10}";

export function emailVerificationToken(value: string): string {
  const token = value.replace(/\s/g, "");
  if (!new RegExp(`^${EMAIL_OTP_PATTERN}$`).test(token)) {
    throw new Error("Enter the complete verification code from your email (6–10 digits).");
  }
  return token;
}
