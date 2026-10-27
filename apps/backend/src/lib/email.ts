import { Resend } from "resend";

let resendInstance: Resend | null = null;

export function getResendClient(): { resend: Resend; from: string } {
    let apiKey = process.env.RESEND_API_KEY;
    let from = process.env.EMAIL_FROM;

    if (!apiKey) {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const dotenv = require('dotenv');
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const path = require('path');
            dotenv.config();
            dotenv.config({ path: path.resolve(process.cwd(), '.env') });
            dotenv.config({ path: path.resolve(process.cwd(), 'apps/backend/.env') });
            dotenv.config({ path: path.resolve(__dirname, '../../.env') });
            apiKey = process.env.RESEND_API_KEY;
            from = process.env.EMAIL_FROM;
        } catch (_) {}
    }

    from = from || "LAUNDELLE <notifications@laundelle.co.uk>";

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