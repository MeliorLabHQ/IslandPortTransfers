import Stripe from 'stripe';
import { storage } from './storage';

export type StripeEnvironment = 'sandbox' | 'live';

async function resolveEnvironment(): Promise<StripeEnvironment> {
  try {
    const setting = await storage.getSetting('stripe_environment');
    if (setting?.value === 'live' || setting?.value === 'sandbox') {
      return setting.value as StripeEnvironment;
    }
  } catch {
    // fall through to default
  }
  // Default: live in production deployment, sandbox everywhere else
  return process.env.REPLIT_DEPLOYMENT === '1' ? 'live' : 'sandbox';
}

function getKeysForEnvironment(env: StripeEnvironment) {
  if (env === 'live') {
    const secretKey = process.env.STRIPE_LIVE_SECRET_KEY;
    const publishableKey = process.env.STRIPE_LIVE_PUBLISHABLE_KEY;
    if (!secretKey || !publishableKey) {
      throw new Error('STRIPE_LIVE_SECRET_KEY and STRIPE_LIVE_PUBLISHABLE_KEY must be set');
    }
    return { secretKey, publishableKey };
  } else {
    const secretKey = process.env.STRIPE_SANDBOX_SECRET_KEY;
    const publishableKey = process.env.STRIPE_SANDBOX_PUBLISHABLE_KEY;
    if (!secretKey || !publishableKey) {
      throw new Error('STRIPE_SANDBOX_SECRET_KEY and STRIPE_SANDBOX_PUBLISHABLE_KEY must be set');
    }
    return { secretKey, publishableKey };
  }
}

export async function getUncachableStripeClient(): Promise<Stripe> {
  const env = await resolveEnvironment();
  const { secretKey } = getKeysForEnvironment(env);
  return new Stripe(secretKey, {
    apiVersion: '2025-11-17.clover' as any,
  });
}

export async function getStripePublishableKey(): Promise<string> {
  const env = await resolveEnvironment();
  const { publishableKey } = getKeysForEnvironment(env);
  return publishableKey;
}

export async function getStripeSecretKey(): Promise<string> {
  const env = await resolveEnvironment();
  const { secretKey } = getKeysForEnvironment(env);
  return secretKey;
}

export async function getCurrentStripeEnvironment(): Promise<StripeEnvironment> {
  return resolveEnvironment();
}

let stripeSync: any = null;
let stripeSyncEnv: StripeEnvironment | null = null;

export async function getStripeSync() {
  const env = await resolveEnvironment();
  // Re-initialize if environment changed
  if (!stripeSync || stripeSyncEnv !== env) {
    const { StripeSync } = await import('stripe-replit-sync');
    const { secretKey } = getKeysForEnvironment(env);
    stripeSync = new StripeSync({
      poolConfig: {
        connectionString: process.env.DATABASE_URL!,
        max: 2,
      },
      stripeSecretKey: secretKey,
    });
    stripeSyncEnv = env;
  }
  return stripeSync;
}
