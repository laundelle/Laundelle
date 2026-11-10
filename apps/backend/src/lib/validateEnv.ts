/**
 * Validates critical environment variables at startup/initialization to prevent running
 * with missing secrets, insecure defaults, or placeholder credentials in production.
 */
export function validateProductionEnv(): void {
  // During next build static collection, production runtime secrets may not be available.
  if (
    process.env.NODE_ENV !== 'production' ||
    process.env.NEXT_PHASE === 'phase-production-build' ||
    process.env.npm_lifecycle_event === 'build' ||
    process.env.NEXT_PUBLIC_IS_BUILD_TIME === 'true'
  ) {
    return;
  }

  const requiredVariables = [
    'JWT_SECRET',
    'MONGODB_URI',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'ORDER_PIN_ENCRYPTION_KEY',
    'OFFLINE_VOUCHER_SECRET',
    'FILE_SIGNING_SECRET',
  ];

  const missing: string[] = [];
  for (const key of requiredVariables) {
    if (!process.env[key] || process.env[key]?.trim() === '') {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `[FATAL] Missing required production environment variables: ${missing.join(', ')}. Server cannot start securely.`
    );
  }

  // Disallow obvious placeholder secrets in production
  const insecurePatterns = [
    'whsec_YOUR_STRIPE_WEBHOOK_SIGNING_SECRET',
    'AdminPassword123!',
    'laundry2u26-hs256-production-secret-key-do-not-share-2026',
    'dev-laundelle',
  ];

  for (const [key, value] of Object.entries(process.env)) {
    if (!value) continue;
    for (const pattern of insecurePatterns) {
      if (value.includes(pattern)) {
        throw new Error(
          `[FATAL] Environment variable ${key} contains an insecure default or placeholder value. Must be replaced with an isolated secret in production.`
        );
      }
    }
  }
}

