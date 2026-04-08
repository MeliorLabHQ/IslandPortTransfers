import { Resend } from 'resend';

export async function getUncachableResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;

  if (!apiKey) {
    throw new Error('RESEND_API_KEY environment variable is not set');
  }

  return {
    client: new Resend(apiKey),
    fromEmail: fromEmail || 'noreply@resend.dev',
  };
}
