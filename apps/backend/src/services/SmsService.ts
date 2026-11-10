import twilio from 'twilio';

export interface SendSmsParams {
  to: string;
  body: string;
  from?: string;
  idempotencyKey?: string;
}

export interface SmsResult {
  success: boolean;
  status: 'SENT' | 'FAILED' | 'PENDING' | 'BLOCKED';
  messageId?: string;
  error?: string;
}

export class SmsService {
  /**
   * Normalizes incoming phone numbers into E.164 format.
   * Special handling for UK phone numbers (07xxx -> +447xxx).
   */
  static normalizePhoneNumber(rawPhone: string | undefined | null): string | null {
    if (!rawPhone || typeof rawPhone !== 'string') return null;
    let cleaned = rawPhone.trim().replace(/[\s\-\(\)\.]/g, '');

    // UK domestic mobile prefix: 07... -> +447...
    if (cleaned.startsWith('07') && cleaned.length === 11) {
      return `+44${cleaned.substring(1)}`;
    }

    // UK international without plus: 447... -> +447...
    if (cleaned.startsWith('447') && cleaned.length === 12) {
      return `+${cleaned}`;
    }

    // Generic international format with plus
    if (cleaned.startsWith('+') && cleaned.length >= 10 && cleaned.length <= 16) {
      return cleaned;
    }

    return null;
  }

  /**
   * Checks whether Twilio credentials are configured in the current environment.
   */
  static isConfigured(): boolean {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) return false;
    if (accountSid.startsWith('AC_YOUR') || authToken.startsWith('your_')) return false;
    return true;
  }

  /**
   * Dispatches an SMS message using Twilio with phone validation and graceful error handling.
   */
  static async sendSms(params: SendSmsParams): Promise<SmsResult> {
    const { to, body } = params;

    const normalizedTo = this.normalizePhoneNumber(to);
    if (!normalizedTo) {
      return {
        success: false,
        status: 'FAILED',
        error: `Invalid phone number format: "${to}". Must be a valid E.164 or UK domestic mobile number.`
      };
    }

    // In development, testing, or explicit mock mode, log and report cleanly without hitting external network
    const isTestEnv = process.env.NODE_ENV === 'test' || process.env.MOCK_SMS === 'true';
    if (isTestEnv) {
      console.log(`[SmsService MOCK] Sending SMS to ${normalizedTo}: ${body}`);
      return {
        success: true,
        status: 'SENT',
        messageId: `mock_twilio_${Date.now()}`
      };
    }

    // Check credentials
    if (!this.isConfigured()) {
      console.warn('[SmsService] Twilio credentials (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN) are not configured.');
      return {
        success: false,
        status: 'BLOCKED',
        error: 'Twilio SMS provider is not configured. External credentials required.'
      };
    }

    try {
      const accountSid = process.env.TWILIO_ACCOUNT_SID!;
      const authToken = process.env.TWILIO_AUTH_TOKEN!;
      const fromNumber = params.from || process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_FROM_NUMBER;
      const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

      const client = twilio(accountSid, authToken);

      const messageOptions: any = {
        to: normalizedTo,
        body
      };

      if (messagingServiceSid) {
        messageOptions.messagingServiceSid = messagingServiceSid;
      } else if (fromNumber) {
        messageOptions.from = fromNumber;
      } else {
        // Fallback default alphanumeric sender ID for UK if allowed
        messageOptions.from = 'LAUNDELLE';
      }

      const res = await client.messages.create(messageOptions);

      return {
        success: true,
        status: 'SENT',
        messageId: res.sid
      };
    } catch (err: any) {
      console.error('[SmsService] Twilio delivery error:', err.message);
      return {
        success: false,
        status: 'FAILED',
        error: err.message || 'Twilio SMS dispatch failed'
      };
    }
  }
}

