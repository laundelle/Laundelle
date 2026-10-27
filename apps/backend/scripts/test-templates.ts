import {
    renderWelcomeEmail,
    renderVerificationEmail,
    renderOrderConfirmedEmail,
    renderOrderCompletedEmail,
} from "../src/emails";

async function main() {
    console.log("Rendering 1: Welcome Email...");
    const welcomeHtml = await renderWelcomeEmail({
        customerName: "Alex Morgan",
        couponCode: "WELCOME20",
        discountPercent: 20,
    });
    console.log("✓ Welcome Email rendered, length:", welcomeHtml.length);

    console.log("Rendering 2: Email Verification Email...");
    const verifyHtml = await renderVerificationEmail({
        customerName: "Alex Morgan",
        verificationUrl: "https://laundelle.com/auth/verify?token=sample-test-token-12345",
        userEmail: "alex@example.com",
    });
    console.log("✓ Email Verification Email rendered, length:", verifyHtml.length);

    console.log("Rendering 3: Order Confirmed Email...");
    const confirmedHtml = await renderOrderConfirmedEmail({
        orderNumber: "LD-89421",
        customerName: "Alex Morgan",
        pickupOtp: "7824",
        pickupDate: "Tomorrow, Oct 26",
        pickupTimeSlot: "10:00 AM - 12:00 PM",
        pickupAddress: "Apartment 4B, 12 Kensington High St, London W8 4PT",
        deliveryEstimate: "Tuesday, Oct 28",
        items: [
            { name: "Executive Shirt (Wash & Press)", quantity: 5, price: "£17.50" },
            { name: "2-Piece Wool Suit (Dry Clean)", quantity: 2, price: "£29.00" },
            { name: "Silk Blouse (Delicate Clean)", quantity: 1, price: "£11.00" },
        ],
        totalAmount: "£57.50",
    });
    console.log("✓ Order Confirmed Email rendered, length:", confirmedHtml.length);

    console.log("Rendering 4: Order Completed Email...");
    const completedHtml = await renderOrderCompletedEmail({
        orderNumber: "LD-89421",
        invoiceNumber: "INV-2026-89421",
        customerName: "Alex Morgan",
        completedAt: "25 Oct 2026, 04:30 PM",
        deliveryAddress: "Apartment 4B, 12 Kensington High St, London W8 4PT",
        deliveryCourierName: "Marcus Vance (Laundelle Fleet)",
        items: [
            { name: "Executive Shirt (Wash & Press)", quantity: 5, unitPrice: "£3.50", totalPrice: "£17.50" },
            { name: "2-Piece Wool Suit (Dry Clean)", quantity: 2, unitPrice: "£14.50", totalPrice: "£29.00" },
            { name: "Silk Blouse (Delicate Clean)", quantity: 1, unitPrice: "£11.00", totalPrice: "£11.00" },
        ],
        subtotal: "£57.50",
        discount: "-£11.50",
        deliveryFee: "£0.00 (Free)",
        taxAmount: "£9.20",
        totalAmount: "£46.00",
        paymentMethod: "Visa ending in •••• 4242 (Paid)",
    });
    console.log("✓ Order Completed Email rendered, length:", completedHtml.length);

    console.log("\nAll 4 email templates rendered successfully with React Email!");
}

main().catch((err) => {
    console.error("Failed to render templates:", err);
    process.exit(1);
});
