import React from 'react';
import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Heading,
  Text,
  Link,
  Hr,
} from '@react-email/components';

export interface OrderItemSummary {
  name: string;
  quantity?: number | string;
  price?: number | string;
  unit?: string;
  selectedOption?: string;
}

export interface OrderConfirmedEmailProps {
  customerName?: string;
  orderId?: string;
  orderNumber?: string;
  pickupOtp?: string;
  pickupDate?: string;
  pickupSlot?: string;
  pickupTimeSlot?: string;
  deliveryDate?: string;
  deliverySlot?: string;
  deliveryEstimate?: string;
  pickupAddress?: string;
  items?: OrderItemSummary[];
  subtotal?: number | string;
  discount?: number | string;
  total?: number | string;
  totalAmount?: number | string;
  paymentMethod?: string;
  appUrl?: string;
}

const toNum = (val: number | string | undefined, defaultVal = 0): number => {
  if (typeof val === 'number') return isNaN(val) ? defaultVal : val;
  if (!val) return defaultVal;
  const parsed = parseFloat(String(val).replace(/[^0-9.-]+/g, ''));
  return isNaN(parsed) ? defaultVal : parsed;
};

export const OrderConfirmedEmail: React.FC<OrderConfirmedEmailProps> = ({
  customerName = 'Valued Customer',
  orderId,
  orderNumber,
  pickupOtp = '5821',
  pickupDate = 'Tomorrow',
  pickupSlot,
  pickupTimeSlot,
  deliveryDate,
  deliverySlot = '10:00 AM - 12:00 PM',
  deliveryEstimate,
  pickupAddress = 'Flat 4B, 22 Kensington High St, London W8 4PT',
  items = [
    { name: 'Wash & Fold Laundry Bag', quantity: 1, price: 18.0, unit: 'bag' },
    { name: 'Business Shirt (Ironed)', quantity: 3, price: 3.5, unit: 'pc' },
  ],
  subtotal: rawSubtotal,
  discount: rawDiscount,
  total: rawTotal,
  totalAmount: rawTotalAmount,
  paymentMethod = 'Online Card (Stripe)',
  appUrl = 'https://laundelle.com',
}) => {
  const displayOrderId = orderNumber || orderId || 'ORD-89412';
  const displayPickupSlot = pickupTimeSlot || pickupSlot || '10:00 AM - 12:00 PM';
  const displayDeliveryDate = deliveryEstimate || deliveryDate || 'In 2 Days';
  const formattedOtp = pickupOtp ? pickupOtp.split('').join(' ') : '----';

  const subtotalNum = toNum(rawSubtotal, 28.5);
  const discountNum = toNum(rawDiscount, 0);
  const totalNum = toNum(rawTotalAmount || rawTotal, subtotalNum - discountNum);

  return (
    <Html lang="en">
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{`Order Confirmed #${displayOrderId} — Pickup OTP Inside`}</title>
      </Head>
      <Preview>{`Your Laundelle order #${displayOrderId} is confirmed. Your secure Pickup OTP is ${pickupOtp}.`}</Preview>
      <Body style={mainStyle}>
        <Container style={containerStyle}>
          {/* Header */}
          <Section style={headerSectionStyle}>
            <table width="100%" cellPadding="0" cellSpacing="0" border={0} role="presentation">
              <tr>
                <td align="center">
                  <Text style={brandSubtitleStyle}>ORDER CONFIRMATION</Text>
                  <Heading as="h1" style={brandTitleStyle}>LAUNDELLE</Heading>
                  <Text style={taglineStyle}>Luxury Laundry & Dry Cleaning</Text>
                </td>
              </tr>
            </table>
          </Section>

          {/* Main Card */}
          <Section style={cardSectionStyle}>
            {/* Status Pill */}
            <div style={{ textAlign: 'center', margin: '0 0 16px 0' }}>
              <span style={statusBadgeStyle}>
                ✓ BOOKING CONFIRMED & SCHEDULED
              </span>
            </div>

            <Heading as="h2" style={headingStyle}>
              Your Laundry Collection Is Confirmed!
            </Heading>

            <Text style={paragraphStyle}>
              Hi <strong>{customerName}</strong>, thank you for booking with Laundelle. We have reserved your collection slot and assigned our operations team to handle your garments.
            </Text>

            {/* PICKUP OTP ONLY CARD (Crucial Requirement) */}
            <Section style={otpWrapperStyle}>
              <table width="100%" cellPadding="0" cellSpacing="0" border={0} role="presentation">
                <tr>
                  <td align="center">
                    <Text style={otpHeaderStyle}>🔑 YOUR SECURE PICKUP OTP</Text>
                    <Text style={otpInstructionStyle}>
                      Provide this code to your driver when they arrive to collect your laundry:
                    </Text>

                    {/* Bold OTP Code Box */}
                    <div style={otpBoxStyle}>
                      <span style={otpDigitTextStyle}>{formattedOtp}</span>
                    </div>

                    <Text style={otpNoticeStyle}>
                      🔒 <strong>Driver Verification Only:</strong> For your garment safety, our driver must verify this Pickup OTP before taking custody of your laundry bag.
                    </Text>
                  </td>
                </tr>
              </table>
            </Section>

            {/* Collection & Delivery Schedule Table */}
            <Section style={scheduleSectionStyle}>
              <Heading as="h3" style={sectionHeadingStyle}>
                Collection & Delivery Schedule
              </Heading>

              <table width="100%" cellPadding="0" cellSpacing="0" border={0} role="presentation" style={detailsTableStyle}>
                <tr>
                  <td style={scheduleColStyle} width="50%">
                    <div style={scheduleCardStyle}>
                      <Text style={scheduleLabelStyle}>🚚 COLLECTION / PICKUP</Text>
                      <Text style={scheduleValueStyle}>{pickupDate}</Text>
                      <Text style={scheduleSlotStyle}>Slot: {displayPickupSlot}</Text>
                      <Text style={scheduleAddressStyle}>{pickupAddress}</Text>
                    </div>
                  </td>
                  <td style={scheduleColStyle} width="50%">
                    <div style={scheduleCardStyle}>
                      <Text style={scheduleLabelStyle}>✨ ESTIMATED RETURN DELIVERY</Text>
                      <Text style={scheduleValueStyle}>{displayDeliveryDate}</Text>
                      <Text style={scheduleSlotStyle}>Slot: {deliverySlot}</Text>
                      <Text style={scheduleAddressStyle}>{pickupAddress}</Text>
                    </div>
                  </td>
                </tr>
              </table>
            </Section>

            {/* Order Items Breakdown */}
            <Section style={itemsSectionStyle}>
              <Heading as="h3" style={sectionHeadingStyle}>
                Order Details (Order #{displayOrderId})
              </Heading>

              <table width="100%" cellPadding="0" cellSpacing="0" border={0} role="presentation" style={itemsTableStyle}>
                <thead>
                  <tr style={tableHeaderRowStyle}>
                    <th align="left" style={thStyle}>Item / Service</th>
                    <th align="center" style={thStyle}>Qty</th>
                    <th align="right" style={thStyle}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => {
                    const itemQty = toNum(it.quantity, 1);
                    const itemPrice = toNum(it.price, 0);
                    return (
                      <tr key={idx} style={tableRowStyle}>
                        <td align="left" style={tdStyle}>
                          <strong>{it.name}</strong>
                          {it.selectedOption && (
                            <div style={{ color: '#64748b', fontSize: '11px', marginTop: '2px' }}>
                              {it.selectedOption}
                            </div>
                          )}
                        </td>
                        <td align="center" style={tdStyle}>
                          {itemQty} {it.unit || ''}
                        </td>
                        <td align="right" style={tdPriceStyle}>
                          £{(itemPrice * itemQty).toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Price Calculation Box */}
              <table width="100%" cellPadding="0" cellSpacing="0" border={0} role="presentation" style={summaryTableStyle}>
                <tr>
                  <td align="left" style={summaryLabelStyle}>Subtotal</td>
                  <td align="right" style={summaryValueStyle}>£{subtotalNum.toFixed(2)}</td>
                </tr>
                {discountNum > 0 && (
                  <tr>
                    <td align="left" style={summaryDiscountLabelStyle}>Discount Applied</td>
                    <td align="right" style={summaryDiscountValueStyle}>-£{discountNum.toFixed(2)}</td>
                  </tr>
                )}
                <tr>
                  <td align="left" style={summaryLabelStyle}>Collection & Next-Day Delivery</td>
                  <td align="right" style={{ ...summaryValueStyle, color: '#16a34a', fontWeight: 700 }}>FREE</td>
                </tr>
                <tr style={{ borderTop: '2px solid #e2e8f0' }}>
                  <td align="left" style={grandTotalLabelStyle}>
                    Total Paid ({paymentMethod})
                  </td>
                  <td align="right" style={grandTotalValueStyle}>
                    £{totalNum.toFixed(2)}
                  </td>
                </tr>
              </table>
            </Section>

            {/* Live Tracking CTA */}
            <Section style={ctaSectionStyle}>
              <table width="100%" cellPadding="0" cellSpacing="0" border={0} role="presentation">
                <tr>
                  <td align="center">
                    <Link href={`${appUrl}/orders`} style={primaryButtonStyle}>
                      Track Your Order Live on Laundelle &rarr;
                    </Link>
                  </td>
                </tr>
              </table>
            </Section>

            <Hr style={dividerStyle} />

            <Text style={pickupTipsHeadingStyle}>📋 Preparation Checklist for Pickup:</Text>
            <table width="100%" cellPadding="0" cellSpacing="0" border={0} role="presentation">
              <tr>
                <td style={tipTdStyle}>
                  • Empty all pockets (pens, coins, receipts).<br />
                  • Place items in disposable bags or your Laundelle hamper.<br />
                  • Have your <strong>Pickup OTP ({pickupOtp})</strong> ready to share with the driver.
                </td>
              </tr>
            </table>
          </Section>

          {/* Footer */}
          <Section style={footerSectionStyle}>
            <Text style={footerTextStyle}>
              Need to reschedule or update instructions? Manage your order anytime via <Link href={`${appUrl}/orders`} style={footerLinkStyle}>My Orders</Link> or email <Link href="mailto:support@laundelle.com" style={footerLinkStyle}>support@laundelle.com</Link>.
            </Text>
            <Text style={copyrightStyle}>
              &copy; {new Date().getFullYear()} Laundelle Technologies Ltd. All rights reserved.<br />
              London, United Kingdom
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

// Inline Styles for bulletproof Gmail & Outlook support
const mainStyle: React.CSSProperties = {
  backgroundColor: '#f1f5f9',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  margin: '0',
  padding: '24px 0',
};

const containerStyle: React.CSSProperties = {
  maxWidth: '600px',
  margin: '0 auto',
  backgroundColor: '#ffffff',
  borderRadius: '24px',
  overflow: 'hidden',
  boxShadow: '0 4px 20px rgba(15, 23, 42, 0.08)',
  border: '1px solid #e2e8f0',
};

const headerSectionStyle: React.CSSProperties = {
  backgroundColor: '#0d2259',
  padding: '32px 24px',
  textAlign: 'center',
  borderBottom: '4px solid #16a34a',
};

const brandSubtitleStyle: React.CSSProperties = {
  color: '#86efac',
  fontSize: '11px',
  fontWeight: 800,
  letterSpacing: '2px',
  margin: '0 0 6px 0',
};

const brandTitleStyle: React.CSSProperties = {
  color: '#ffffff',
  fontSize: '30px',
  fontWeight: 900,
  letterSpacing: '4px',
  margin: '0 0 6px 0',
};

const taglineStyle: React.CSSProperties = {
  color: '#cbd5e1',
  fontSize: '12px',
  fontWeight: 500,
  margin: '0',
};

const cardSectionStyle: React.CSSProperties = {
  padding: '32px 28px',
};

const statusBadgeStyle: React.CSSProperties = {
  display: 'inline-block',
  backgroundColor: '#ecfdf5',
  color: '#047857',
  border: '1px solid #a7f3d0',
  borderRadius: '20px',
  padding: '6px 16px',
  fontSize: '11px',
  fontWeight: 800,
  letterSpacing: '1px',
};

const headingStyle: React.CSSProperties = {
  color: '#0f172a',
  fontSize: '22px',
  fontWeight: 800,
  textAlign: 'center',
  margin: '0 0 16px 0',
};

const paragraphStyle: React.CSSProperties = {
  color: '#334155',
  fontSize: '14px',
  lineHeight: '1.6',
  margin: '0 0 16px 0',
};

const otpWrapperStyle: React.CSSProperties = {
  backgroundColor: '#f0fdf4',
  border: '2px dashed #16a34a',
  borderRadius: '18px',
  padding: '24px 16px',
  margin: '20px 0 28px 0',
  textAlign: 'center',
};

const otpHeaderStyle: React.CSSProperties = {
  color: '#166534',
  fontSize: '12px',
  fontWeight: 800,
  letterSpacing: '2px',
  margin: '0 0 6px 0',
};

const otpInstructionStyle: React.CSSProperties = {
  color: '#15803d',
  fontSize: '13px',
  margin: '0 0 14px 0',
};

const otpBoxStyle: React.CSSProperties = {
  display: 'inline-block',
  backgroundColor: '#ffffff',
  border: '2px solid #16a34a',
  borderRadius: '12px',
  padding: '12px 32px',
  boxShadow: '0 4px 12px rgba(22, 163, 74, 0.15)',
};

const otpDigitTextStyle: React.CSSProperties = {
  color: '#14532d',
  fontSize: '32px',
  fontWeight: 900,
  letterSpacing: '8px',
  fontFamily: 'monospace, "Courier New", Courier',
};

const otpNoticeStyle: React.CSSProperties = {
  color: '#166534',
  fontSize: '11px',
  lineHeight: '1.5',
  margin: '14px 0 0 0',
  maxWidth: '480px',
};

const scheduleSectionStyle: React.CSSProperties = {
  margin: '24px 0',
};

const sectionHeadingStyle: React.CSSProperties = {
  color: '#0f172a',
  fontSize: '15px',
  fontWeight: 800,
  letterSpacing: '0.5px',
  margin: '0 0 12px 0',
  textTransform: 'uppercase',
};

const detailsTableStyle: React.CSSProperties = {
  width: '100%',
};

const scheduleColStyle: React.CSSProperties = {
  padding: '4px',
  verticalAlign: 'top',
};

const scheduleCardStyle: React.CSSProperties = {
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: '14px',
  padding: '14px 12px',
  height: '100%',
};

const scheduleLabelStyle: React.CSSProperties = {
  color: '#0284c7',
  fontSize: '10px',
  fontWeight: 800,
  letterSpacing: '1px',
  margin: '0 0 4px 0',
};

const scheduleValueStyle: React.CSSProperties = {
  color: '#0f172a',
  fontSize: '14px',
  fontWeight: 800,
  margin: '0 0 4px 0',
};

const scheduleSlotStyle: React.CSSProperties = {
  color: '#475569',
  fontSize: '12px',
  fontWeight: 600,
  margin: '0 0 6px 0',
};

const scheduleAddressStyle: React.CSSProperties = {
  color: '#64748b',
  fontSize: '11px',
  lineHeight: '1.4',
  margin: '0',
};

const itemsSectionStyle: React.CSSProperties = {
  margin: '24px 0',
};

const itemsTableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
};

const tableHeaderRowStyle: React.CSSProperties = {
  backgroundColor: '#f8fafc',
  borderBottom: '1px solid #e2e8f0',
};

const thStyle: React.CSSProperties = {
  padding: '10px 8px',
  fontSize: '11px',
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  fontWeight: 700,
};

const tableRowStyle: React.CSSProperties = {
  borderBottom: '1px solid #f1f5f9',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 8px',
  fontSize: '13px',
  color: '#1e293b',
};

const tdPriceStyle: React.CSSProperties = {
  padding: '10px 8px',
  fontSize: '13px',
  color: '#0f172a',
  fontWeight: 700,
};

const summaryTableStyle: React.CSSProperties = {
  width: '100%',
  marginTop: '12px',
};

const summaryLabelStyle: React.CSSProperties = {
  padding: '4px 8px',
  fontSize: '12px',
  color: '#64748b',
};

const summaryValueStyle: React.CSSProperties = {
  padding: '4px 8px',
  fontSize: '12px',
  color: '#1e293b',
  fontWeight: 600,
};

const summaryDiscountLabelStyle: React.CSSProperties = {
  padding: '4px 8px',
  fontSize: '12px',
  color: '#b45309',
  fontWeight: 600,
};

const summaryDiscountValueStyle: React.CSSProperties = {
  padding: '4px 8px',
  fontSize: '12px',
  color: '#b45309',
  fontWeight: 700,
};

const grandTotalLabelStyle: React.CSSProperties = {
  padding: '10px 8px 4px 8px',
  fontSize: '14px',
  fontWeight: 800,
  color: '#0f172a',
};

const grandTotalValueStyle: React.CSSProperties = {
  padding: '10px 8px 4px 8px',
  fontSize: '18px',
  fontWeight: 900,
  color: '#0d2259',
};

const ctaSectionStyle: React.CSSProperties = {
  margin: '28px 0 16px 0',
};

const primaryButtonStyle: React.CSSProperties = {
  display: 'inline-block',
  backgroundColor: '#0d2259',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 700,
  textDecoration: 'none',
  padding: '14px 28px',
  borderRadius: '12px',
  boxShadow: '0 4px 12px rgba(13, 34, 89, 0.25)',
  textAlign: 'center',
};

const dividerStyle: React.CSSProperties = {
  borderColor: '#e2e8f0',
  margin: '24px 0',
};

const pickupTipsHeadingStyle: React.CSSProperties = {
  color: '#0f172a',
  fontSize: '13px',
  fontWeight: 700,
  margin: '0 0 6px 0',
};

const tipTdStyle: React.CSSProperties = {
  color: '#64748b',
  fontSize: '12px',
  lineHeight: '1.6',
};

const footerSectionStyle: React.CSSProperties = {
  backgroundColor: '#f8fafc',
  padding: '24px 28px',
  textAlign: 'center',
  borderTop: '1px solid #e2e8f0',
};

const footerTextStyle: React.CSSProperties = {
  color: '#64748b',
  fontSize: '12px',
  lineHeight: '1.6',
  margin: '0 0 10px 0',
};

const footerLinkStyle: React.CSSProperties = {
  color: '#0077b6',
  textDecoration: 'underline',
};

const copyrightStyle: React.CSSProperties = {
  color: '#94a3b8',
  fontSize: '11px',
  margin: '0',
};

export default OrderConfirmedEmail;
