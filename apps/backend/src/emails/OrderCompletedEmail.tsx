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

export interface CompletedOrderItem {
  name: string;
  quantity?: number | string;
  price?: number | string;
  unitPrice?: number | string;
  totalPrice?: number | string;
  unit?: string;
  selectedOption?: string;
}

export interface OrderCompletedEmailProps {
  customerName?: string;
  orderId?: string;
  orderNumber?: string;
  invoiceNumber?: string;
  completedDate?: string;
  completedAt?: string;
  deliveryAddress?: string;
  driverName?: string;
  deliveryCourierName?: string;
  items?: CompletedOrderItem[];
  subtotal?: number | string;
  discount?: number | string;
  additionalCharges?: number | string;
  additionalChargeReason?: string;
  deliveryFee?: number | string;
  taxAmount?: number | string;
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

export const OrderCompletedEmail: React.FC<OrderCompletedEmailProps> = ({
  customerName = 'Valued Customer',
  orderId,
  orderNumber,
  invoiceNumber,
  completedDate,
  completedAt,
  deliveryAddress = 'Flat 4B, 22 Kensington High St, London W8 4PT',
  driverName,
  deliveryCourierName,
  items = [
    { name: 'Wash & Fold Laundry Bag', quantity: 1, price: 18.0, unit: 'bag' },
    { name: 'Business Shirt (Ironed)', quantity: 3, price: 3.5, unit: 'pc' },
    { name: 'Silk Blouse (Delicate Dry Clean)', quantity: 1, price: 12.0, unit: 'pc' },
  ],
  subtotal: rawSubtotal,
  discount: rawDiscount,
  additionalCharges: rawCharges,
  additionalChargeReason = '',
  total: rawTotal,
  totalAmount: rawTotalAmount,
  paymentMethod = 'Online Card (Stripe)',
  appUrl = 'https://laundelle.com',
}) => {
  const displayOrderId = orderNumber || orderId || 'ORD-89412';
  const displayInvoiceNumber = invoiceNumber || `INV-${displayOrderId.replace(/^ORD-|^LD-/, '')}`;
  const displayDate = completedAt || completedDate || 'Today';
  const displayDriver = deliveryCourierName || driverName || 'Laundelle Dedicated Courier';

  const subtotalNum = toNum(rawSubtotal, 40.5);
  const discountNum = toNum(rawDiscount, 0);
  const chargesNum = toNum(rawCharges, 0);
  const totalNum = toNum(rawTotalAmount || rawTotal, subtotalNum - discountNum + chargesNum);

  return (
    <Html lang="en">
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{`Order Completed #${displayOrderId} — Your Official Invoice & Receipt`}</title>
      </Head>
      <Preview>{`Your laundry order #${displayOrderId} has been safely delivered. View your official invoice and receipt inside.`}</Preview>
      <Body style={mainStyle}>
        <Container style={containerStyle}>
          {/* Header */}
          <Section style={headerSectionStyle}>
            <table width="100%" cellPadding="0" cellSpacing="0" border={0} role="presentation">
              <tr>
                <td align="center">
                  <Text style={brandSubtitleStyle}>TAX INVOICE & DELIVERY RECEIPT</Text>
                  <Heading as="h1" style={brandTitleStyle}>LAUNDELLE</Heading>
                  <Text style={taglineStyle}>Luxury Laundry & Dry Cleaning</Text>
                </td>
              </tr>
            </table>
          </Section>

          {/* Main Card */}
          <Section style={cardSectionStyle}>
            {/* Delivered Badge */}
            <div style={{ textAlign: 'center', margin: '0 0 16px 0' }}>
              <span style={statusBadgeStyle}>
                🎉 DELIVERED & COMPLETED
              </span>
            </div>

            <Heading as="h2" style={headingStyle}>
              Your Laundry Has Been Delivered!
            </Heading>

            <Text style={paragraphStyle}>
              Hello <strong>{customerName}</strong>, your fresh, crisp garments have been successfully delivered to your doorstep. We hope you love the clean scents, pristine folding, and delicate care!
            </Text>

            {/* Delivery Details Card */}
            <Section style={deliveryCardStyle}>
              <table width="100%" cellPadding="0" cellSpacing="0" border={0} role="presentation">
                <tr>
                  <td width="33%" style={deliveryMetaTdStyle}>
                    <Text style={deliveryMetaLabelStyle}>DELIVERED TO</Text>
                    <Text style={deliveryMetaValueStyle}>{deliveryAddress}</Text>
                  </td>
                  <td width="33%" style={deliveryMetaTdStyle}>
                    <Text style={deliveryMetaLabelStyle}>DELIVERED AT</Text>
                    <Text style={deliveryMetaValueStyle}>{displayDate}</Text>
                  </td>
                  <td width="33%" style={deliveryMetaTdStyle}>
                    <Text style={deliveryMetaLabelStyle}>COURIER</Text>
                    <Text style={deliveryMetaValueStyle}>{displayDriver} (Verified)</Text>
                  </td>
                </tr>
              </table>
            </Section>

            {/* Official Invoice Box */}
            <Section style={invoiceWrapperStyle}>
              {/* Invoice Meta Bar */}
              <table width="100%" cellPadding="0" cellSpacing="0" border={0} role="presentation" style={invoiceHeaderTableStyle}>
                <tr>
                  <td align="left">
                    <Text style={invoiceTitleStyle}>TAX INVOICE / RECEIPT</Text>
                    <Text style={invoiceSubheadStyle}>Invoice #: <strong>{displayInvoiceNumber}</strong> • Order #{displayOrderId}</Text>
                  </td>
                  <td align="right">
                    <span style={paidBadgeStyle}>✓ PAID IN FULL</span>
                  </td>
                </tr>
              </table>

              {/* Items Breakdown Table */}
              <table width="100%" cellPadding="0" cellSpacing="0" border={0} role="presentation" style={itemsTableStyle}>
                <thead>
                  <tr style={tableHeaderRowStyle}>
                    <th align="left" style={thStyle}>Item Description</th>
                    <th align="center" style={thStyle}>Qty</th>
                    <th align="right" style={thStyle}>Rate</th>
                    <th align="right" style={thStyle}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, idx) => {
                    const itemQty = toNum(it.quantity, 1);
                    const itemPrice = toNum(it.unitPrice !== undefined ? it.unitPrice : it.price, 0);
                    const itemTotal = it.totalPrice !== undefined ? toNum(it.totalPrice, itemPrice * itemQty) : itemPrice * itemQty;
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
                        <td align="center" style={tdStyle}>{itemQty} {it.unit || ''}</td>
                        <td align="right" style={tdSubStyle}>£{itemPrice.toFixed(2)}</td>
                        <td align="right" style={tdPriceStyle}>
                          £{itemTotal.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Total Bill Calculation Breakdown */}
              <table width="100%" cellPadding="0" cellSpacing="0" border={0} role="presentation" style={summaryTableStyle}>
                <tr>
                  <td align="left" style={summaryLabelStyle}>Subtotal</td>
                  <td align="right" style={summaryValueStyle}>£{subtotalNum.toFixed(2)}</td>
                </tr>
                {discountNum > 0 && (
                  <tr>
                    <td align="left" style={summaryDiscountLabelStyle}>Coupon Discount</td>
                    <td align="right" style={summaryDiscountValueStyle}>-£{discountNum.toFixed(2)}</td>
                  </tr>
                )}
                {chargesNum > 0 && (
                  <tr>
                    <td align="left" style={summaryChargeLabelStyle}>
                      Additional Intake Weight {additionalChargeReason ? `(${additionalChargeReason})` : ''}
                    </td>
                    <td align="right" style={summaryChargeValueStyle}>+£{chargesNum.toFixed(2)}</td>
                  </tr>
                )}
                <tr>
                  <td align="left" style={summaryLabelStyle}>Collection & Delivery</td>
                  <td align="right" style={{ ...summaryValueStyle, color: '#16a34a', fontWeight: 700 }}>FREE</td>
                </tr>
                <tr>
                  <td align="left" style={summaryLabelStyle}>VAT Included (20%)</td>
                  <td align="right" style={summaryValueStyle}>£{(totalNum * 0.2).toFixed(2)}</td>
                </tr>
                <tr style={{ borderTop: '2px solid #0d2259' }}>
                  <td align="left" style={grandTotalLabelStyle}>
                    TOTAL BILL PAID ({paymentMethod})
                  </td>
                  <td align="right" style={grandTotalValueStyle}>
                    £{totalNum.toFixed(2)}
                  </td>
                </tr>
              </table>
            </Section>

            {/* Rate Order Experience Section */}
            <Section style={ratingCardStyle}>
              <table width="100%" cellPadding="0" cellSpacing="0" border={0} role="presentation">
                <tr>
                  <td align="center">
                    <Text style={ratingCardHeaderStyle}>⭐ HOW WAS YOUR EXPERIENCE?</Text>
                    <Heading as="h3" style={ratingCardTitleStyle}>
                      Rate Your Clean & Leave Feedback
                    </Heading>
                    <Text style={ratingCardSubtextStyle}>
                      Your feedback directly helps our cleaning artisans and drivers improve every day.
                    </Text>

                    <div style={starsRowStyle}>
                      <span style={starIconStyle}>★</span>
                      <span style={starIconStyle}>★</span>
                      <span style={starIconStyle}>★</span>
                      <span style={starIconStyle}>★</span>
                      <span style={starIconStyle}>★</span>
                    </div>

                    <Link href={`${appUrl}/orders?id=${displayOrderId}&rate=true`} style={ratingButtonStyle}>
                      Submit 1–5 Star Rating & Feedback &rarr;
                    </Link>
                  </td>
                </tr>
              </table>
            </Section>

            {/* View Full Invoice / Reorder CTA */}
            <Section style={ctaSectionStyle}>
              <table width="100%" cellPadding="0" cellSpacing="0" border={0} role="presentation">
                <tr>
                  <td align="center">
                    <Link href={`${appUrl}/orders`} style={secondaryButtonStyle}>
                      View Online Invoice in Laundelle App
                    </Link>
                  </td>
                </tr>
              </table>
            </Section>

            <Hr style={dividerStyle} />

            <Text style={receiptNoteStyle}>
              🧾 <strong>Tax Invoice Note:</strong> This document serves as your official receipt for tax and business reimbursement purposes. Laundelle Technologies Ltd (VAT Reg #GB449102841).
            </Text>
          </Section>

          {/* Footer */}
          <Section style={footerSectionStyle}>
            <Text style={footerTextStyle}>
              Have questions about your bill or delivery? We're available 7 days a week at <Link href="mailto:support@laundelle.com" style={footerLinkStyle}>support@laundelle.com</Link>.
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

// Inline Styles for cross-client Outlook & Gmail compatibility
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
  borderBottom: '4px solid #f59e0b',
};

const brandSubtitleStyle: React.CSSProperties = {
  color: '#fde68a',
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

const deliveryCardStyle: React.CSSProperties = {
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: '16px',
  padding: '16px',
  margin: '20px 0',
};

const deliveryMetaTdStyle: React.CSSProperties = {
  padding: '4px 8px',
  verticalAlign: 'top',
};

const deliveryMetaLabelStyle: React.CSSProperties = {
  color: '#0284c7',
  fontSize: '10px',
  fontWeight: 800,
  letterSpacing: '1px',
  margin: '0 0 4px 0',
};

const deliveryMetaValueStyle: React.CSSProperties = {
  color: '#0f172a',
  fontSize: '12px',
  fontWeight: 700,
  lineHeight: '1.4',
  margin: '0',
};

const invoiceWrapperStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  border: '2px solid #0d2259',
  borderRadius: '16px',
  padding: '20px 16px',
  margin: '24px 0',
  boxShadow: '0 2px 10px rgba(13, 34, 89, 0.06)',
};

const invoiceHeaderTableStyle: React.CSSProperties = {
  borderBottom: '2px solid #f1f5f9',
  paddingBottom: '12px',
  marginBottom: '16px',
};

const invoiceTitleStyle: React.CSSProperties = {
  color: '#0d2259',
  fontSize: '14px',
  fontWeight: 900,
  letterSpacing: '1.5px',
  margin: '0 0 2px 0',
};

const invoiceSubheadStyle: React.CSSProperties = {
  color: '#64748b',
  fontSize: '11px',
  margin: '0',
};

const paidBadgeStyle: React.CSSProperties = {
  display: 'inline-block',
  backgroundColor: '#16a34a',
  color: '#ffffff',
  padding: '6px 14px',
  borderRadius: '8px',
  fontSize: '11px',
  fontWeight: 800,
  letterSpacing: '1px',
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
  padding: '8px',
  fontSize: '11px',
  color: '#64748b',
  textTransform: 'uppercase',
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

const tdSubStyle: React.CSSProperties = {
  padding: '10px 8px',
  fontSize: '12px',
  color: '#64748b',
};

const tdPriceStyle: React.CSSProperties = {
  padding: '10px 8px',
  fontSize: '13px',
  color: '#0f172a',
  fontWeight: 700,
};

const summaryTableStyle: React.CSSProperties = {
  width: '100%',
  marginTop: '14px',
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

const summaryChargeLabelStyle: React.CSSProperties = {
  padding: '4px 8px',
  fontSize: '12px',
  color: '#b91c1c',
  fontWeight: 600,
};

const summaryChargeValueStyle: React.CSSProperties = {
  padding: '4px 8px',
  fontSize: '12px',
  color: '#b91c1c',
  fontWeight: 700,
};

const grandTotalLabelStyle: React.CSSProperties = {
  padding: '12px 8px 4px 8px',
  fontSize: '13px',
  fontWeight: 900,
  color: '#0d2259',
  letterSpacing: '0.5px',
};

const grandTotalValueStyle: React.CSSProperties = {
  padding: '12px 8px 4px 8px',
  fontSize: '20px',
  fontWeight: 900,
  color: '#0d2259',
};

const ratingCardStyle: React.CSSProperties = {
  backgroundColor: '#fffbeb',
  border: '1px solid #fde68a',
  borderRadius: '16px',
  padding: '24px 16px',
  margin: '24px 0',
  textAlign: 'center',
};

const ratingCardHeaderStyle: React.CSSProperties = {
  color: '#b45309',
  fontSize: '11px',
  fontWeight: 800,
  letterSpacing: '1.5px',
  margin: '0 0 6px 0',
};

const ratingCardTitleStyle: React.CSSProperties = {
  color: '#78350f',
  fontSize: '18px',
  fontWeight: 800,
  margin: '0 0 6px 0',
};

const ratingCardSubtextStyle: React.CSSProperties = {
  color: '#92400e',
  fontSize: '12px',
  margin: '0 0 12px 0',
};

const starsRowStyle: React.CSSProperties = {
  margin: '0 0 16px 0',
};

const starIconStyle: React.CSSProperties = {
  color: '#f59e0b',
  fontSize: '28px',
  padding: '0 4px',
};

const ratingButtonStyle: React.CSSProperties = {
  display: 'inline-block',
  backgroundColor: '#d97706',
  color: '#ffffff',
  fontSize: '14px',
  fontWeight: 700,
  textDecoration: 'none',
  padding: '12px 24px',
  borderRadius: '12px',
  boxShadow: '0 2px 8px rgba(217, 119, 6, 0.25)',
};

const ctaSectionStyle: React.CSSProperties = {
  margin: '16px 0',
};

const secondaryButtonStyle: React.CSSProperties = {
  display: 'inline-block',
  backgroundColor: '#f8fafc',
  color: '#0f172a',
  border: '1px solid #cbd5e1',
  fontSize: '13px',
  fontWeight: 600,
  textDecoration: 'none',
  padding: '10px 20px',
  borderRadius: '10px',
};

const dividerStyle: React.CSSProperties = {
  borderColor: '#e2e8f0',
  margin: '24px 0 16px 0',
};

const receiptNoteStyle: React.CSSProperties = {
  color: '#64748b',
  fontSize: '11px',
  lineHeight: '1.5',
  margin: '0',
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

export default OrderCompletedEmail;
