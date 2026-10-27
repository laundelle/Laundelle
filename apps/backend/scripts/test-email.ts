import {
    sendWelcomeEmail,
    sendVerificationEmail,
    sendOrderConfirmedEmail,
    sendOrderCompletedEmail,
} from "../src/emails";

async function main() {
    const to = process.argv[2];
    const template = (process.argv[3] || "welcome").toLowerCase();

    if (!to) {
        console.log(`
Usage:
  pnpm exec tsx scripts/test-email.ts <your-email@example.com> [template]

Available templates:
  - welcome    : Welcome email with WELCOME20 coupon (default)
  - verify     : Email verification with social/email verification button
  - confirmed  : Order confirmed with Pickup OTP ONLY
  - completed  : Order completed with Tax Invoice & total bill breakdown
        `);
        process.exit(1);
    }

    console.log(`Sending '${template}' email to ${to} via Resend...`);

    let result;
    if (template === "welcome") {
        result = await sendWelcomeEmail({
            to,
            customerName: "Alex Morgan",
            couponCode: "WELCOME20",
            discountPercent: 20,
        });
    } else if (template === "verify" || template === "verification") {
        result = await sendVerificationEmail({
            to,
            customerName: "Alex Morgan",
            verificationUrl: "https://laundelle.com/verify-email?token=test-resend-token",
        });
    } else if (template === "confirmed" || template === "confirm") {
        result = await sendOrderConfirmedEmail({
            to,
            orderId: "LD-89421",
            customerName: "Alex Morgan",
            pickupOtp: "7824",
            pickupDate: "Tomorrow, Oct 26",
            pickupSlot: "10:00 AM - 12:00 PM",
            pickupAddress: "Apartment 4B, 12 Kensington High St, London W8 4PT",
            deliveryDate: "Tuesday, Oct 28",
            deliverySlot: "10:00 AM - 12:00 PM",
            items: [
                { name: "Executive Shirts (Wash & Press)", quantity: 5, price: 3.5, unit: "pc" },
                { name: "2-Piece Wool Suit (Dry Clean)", quantity: 2, price: 14.5, unit: "set" },
                { name: "Silk Blouse (Delicate Clean)", quantity: 1, price: 11.0, unit: "pc" },
            ],
            subtotal: 57.5,
            discount: 11.5,
            total: 46.0,
            paymentMethod: "Apple Pay (Card ending in 4242)",
        });
    } else if (template === "completed" || template === "complete") {
        result = await sendOrderCompletedEmail({
            to,
            orderId: "LD-89421",
            invoiceNumber: "INV-2026-89421",
            customerName: "Alex Morgan",
            completedDate: "Today, 04:30 PM",
            deliveryAddress: "Apartment 4B, 12 Kensington High St, London W8 4PT",
            driverName: "Marcus Vance",
            items: [
                { name: "Executive Shirts (Wash & Press)", quantity: 5, price: 3.5, unit: "pc" },
                { name: "2-Piece Wool Suit (Dry Clean)", quantity: 2, price: 14.5, unit: "set" },
                { name: "Silk Blouse (Delicate Clean)", quantity: 1, price: 11.0, unit: "pc" },
            ],
            subtotal: 57.5,
            discount: 11.5,
            total: 46.0,
            paymentMethod: "Apple Pay (Card ending in 4242)",
        });
    } else {
        throw new Error(`Unknown template: ${template}. Choose from: welcome, verify, confirmed, completed`);
    }

    console.log(`✅ Success! '${template}' email sent successfully.`);
    console.log("Resend Message ID:", result?.id);
}

main().catch((error) => {
    console.error("❌ Email test failed:", error.message || error);
    process.exitCode = 1;
});
