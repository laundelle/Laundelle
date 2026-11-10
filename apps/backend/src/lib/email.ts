import { Resend } from "resend";
import fs from 'fs';
import path from 'path';

let resendInstance: Resend | null = null;

/**
 * Loads development environment variables from local .env files if not already set.
 * In production, strictly relies on deployment-injected environment secrets without overriding.
 */
function loadLocalEnvIfNeeded(): void {
    if (process.env.RESEND_API_KEY) return;
    if (process.env.NODE_ENV === 'production') return;

    const envFiles = [
        path.resolve(process.cwd(), '.env'),
        path.resolve(process.cwd(), 'apps/backend/.env'),
        path.resolve(__dirname, '../../.env')
    ];

    for (const filePath of envFiles) {
        if (fs.existsSync(filePath)) {
            try {
                const content = fs.readFileSync(filePath, 'utf8');
                for (const line of content.split('\n')) {
                    const trimmed = line.trim();
                    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
                        const idx = trimmed.indexOf('=');
                        const key = trimmed.substring(0, idx).trim();
                        const val = trimmed.substring(idx + 1).trim().replace(/^["']|["']$/g, '');
                        if (!process.env[key]) {
                            process.env[key] = val;
                        }
                    }
                }
            } catch {}
        }
    }
}

export function getResendClient(): { resend: Resend; from: string } {
    loadLocalEnvIfNeeded();
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM || "LAUNDELLE <notifications@laundelle.co.uk>";

    if (!apiKey) {
        throw new Error("RESEND_API_KEY is not configured in environment variables");
    }

    if (!resendInstance) {
        resendInstance = new Resend(apiKey);
    }

    return { resend: resendInstance, from };
}

export type SendEmailInput = {
    to: string;
    subject: string;
    html: string;
    from?: string;
};

export async function sendEmail({
    to,
    subject,
    html,
    from: customFrom,
}: SendEmailInput) {
    const { resend, from: defaultFrom } = getResendClient();

    const { data, error } = await resend.emails.send({
        from: customFrom || defaultFrom,
        to: [to],
        subject,
        html,
    });

    if (error) {
        console.error("Resend email failed:", error.message);
        throw new Error(`Unable to send email: ${error.message}`);
    }

    return data;
}
