
import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.EMAIL_FROM;
const to = process.argv[2];

if (!apiKey || !from || !to) {
    throw new Error(
        "Set RESEND_API_KEY and EMAIL_FROM, and provide a recipient email."
    );
}

const resend = new Resend(apiKey);

const { data, error } = await resend.emails.send({
    from,
    to: [to],
    subject: "LAUNDELLE email setup test",
    html: `
    <div style="font-family:Arial,sans-serif">
      <h2>Welcome to LAUNDELLE</h2>
      <p>Your email delivery integration is working.</p>
      <p>This is a test email from LAUNDELLE.</p>
    </div>
  `,
});

if (error) {
    console.error("Email failed:", error);
    process.exitCode = 1;
} else {
    console.log("Email accepted by Resend:", data.id);
}
