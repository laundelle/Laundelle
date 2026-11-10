import crypto from 'crypto';

/**
 * Derives the cryptographic secret for HMAC hashing and AES encryption.
 * In production, fails securely if ORDER_PIN_SECRET is not configured.
 */
export function getOrderPinSecret(): string {
  const secret = process.env.ORDER_PIN_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: ORDER_PIN_SECRET environment variable is not set. Order PIN operations cannot run securely.');
    }
    return process.env.JWT_SECRET || 'dev-laundelle-order-pin-key-do-not-use-in-production';
  }
  return secret;
}

/**
 * Derive a 32-byte key for AES-256-GCM.
 */
function getEncryptionKey(): Buffer {
  return crypto.createHash('sha256').update(getOrderPinSecret()).digest();
}

/**
 * Generate a cryptographically secure random numeric PIN (4-6 digits).
 */
export function generateSecureNumericPin(length: number = 6): string {
  if (length === 4) {
    return crypto.randomInt(1000, 10000).toString();
  }
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Generate a cryptographically random salt (16 bytes hex).
 */
export function generatePinSalt(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Compute an HMAC-SHA256 hash bound to orderId, customerId, salt, and PIN.
 * This prevents rainbow table and cross-order substitution attacks.
 */
export function hashOrderPin(pin: string, salt: string, orderId: string, customerId: string): string {
  const context = `${orderId}:${customerId}:${salt}:${pin.trim()}`;
  return crypto.createHmac('sha256', getEncryptionKey()).update(context).digest('hex');
}

/**
 * Encrypt the PIN using AES-256-GCM so it is stored encrypted in MongoDB,
 * and can ONLY be decrypted in-memory for the authenticated customer.
 */
export function encryptOrderPin(pin: string, orderId: string, customerId: string): string {
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  
  // Bind orderId and customerId as Additional Authenticated Data (AAD)
  cipher.setAAD(Buffer.from(`${orderId}:${customerId}`, 'utf8'));
  
  let encrypted = cipher.update(pin.trim(), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag().toString('hex');
  
  // Format: iv:authTag:ciphertext
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypt the encrypted PIN payload in-memory.
 * Validates integrity via GCM auth tag and AAD matching orderId and customerId.
 */
export function decryptOrderPin(encryptedPayload: string, orderId: string, customerId: string): string | null {
  try {
    if (!encryptedPayload) return null;
    const parts = encryptedPayload.split(':');
    if (parts.length !== 3) return null;

    const [ivHex, authTagHex, cipherHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), iv);
    decipher.setAuthTag(authTag);
    decipher.setAAD(Buffer.from(`${orderId}:${customerId}`, 'utf8'));

    let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (err) {
    // If decryption or auth tag validation fails (tampered payload or incorrect customer/order context)
    return null;
  }
}

/**
 * Validate submitted PIN attempt with constant-time comparison, attempt counting, and lockout.
 */
export function verifyOrderPinAttempt(
  submittedPin: string,
  expectedHash: string | null | undefined,
  salt: string | null | undefined,
  orderId: string,
  customerId: string,
  expiresAt?: string | null,
  attempts: number = 0,
  maxAttempts: number = 5,
  isLocked: boolean = false
): { valid: boolean; error?: string } {
  if (isLocked || attempts >= maxAttempts) {
    return {
      valid: false,
      error: 'Security Lockout: Too many incorrect PIN attempts. This order PIN is permanently locked. Please contact dispatch support.'
    };
  }

  if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
    return {
      valid: false,
      error: 'Verification PIN has expired. Please request dispatch support to regenerate.'
    };
  }

  if (!expectedHash || !salt) {
    return {
      valid: false,
      error: 'No active PIN found or PIN has already been verified and consumed.'
    };
  }

  if (!submittedPin || typeof submittedPin !== 'string') {
    return {
      valid: false,
      error: 'A valid numeric PIN is required.'
    };
  }

  // Compute hash of the submitted PIN with the order's salt and context
  const submittedHash = hashOrderPin(submittedPin, salt, orderId, customerId);

  // Constant-time comparison to prevent timing attacks
  const submittedBuf = Buffer.from(submittedHash, 'utf8');
  const expectedBuf = Buffer.from(expectedHash, 'utf8');

  const matches = submittedBuf.length === expectedBuf.length && crypto.timingSafeEqual(submittedBuf, expectedBuf);

  if (!matches) {
    const remaining = maxAttempts - (attempts + 1);
    return {
      valid: false,
      error: remaining > 0
        ? `Incorrect PIN. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining before lockout.`
        : 'Incorrect PIN. Attempt limit reached. Order verification PIN is now locked.'
    };
  }

  return { valid: true };
}
