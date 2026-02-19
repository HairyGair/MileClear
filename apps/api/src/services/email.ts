// Email service using Resend (free tier: 3,000 emails/month)

export async function sendVerificationEmail(
  _email: string,
  _code: string
): Promise<void> {
  // TODO: integrate with Resend
}

export async function sendPasswordResetEmail(
  _email: string,
  _resetToken: string
): Promise<void> {
  // TODO: integrate with Resend
}

export async function sendWaitlistConfirmation(
  _email: string
): Promise<void> {
  // TODO: integrate with Resend
}
