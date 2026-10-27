import React from 'react';
import {
  Html,
  Head,
  Preview,
  Body,
  Container,
  Section,
  Row,
  Column,
  Heading,
  Text,
  Link,
  Hr,
} from '@react-email/components';

export interface WelcomeEmailProps {
  customerName?: string;
  appUrl?: string;
  couponCode?: string;
  discountPercent?: number;
}

export const WelcomeEmail: React.FC<WelcomeEmailProps> = ({
  customerName = 'Valued Customer',
  appUrl = 'https://laundelle.com',
  couponCode = 'WELCOME20',
  discountPercent = 20,
}) => {
  return (
    <Html lang="en">
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Welcome to Laundelle — Enjoy 20% Off Your First Order</title>
      </Head>
      <Preview>{`Welcome to Laundelle! Use code ${couponCode} for ${discountPercent}% off your first luxury laundry collection.`}</Preview>
      <Body style={mainStyle}>
        <Container style={containerStyle}>
          {/* Top Header & Brand Banner */}
          <Section style={headerSectionStyle}>
            <table width="100%" cellPadding="0" cellSpacing="0" border={0} role="presentation">
              <tr>
                <td align="center">
                  <Text style={brandSubtitleStyle}>LUXURY LAUNDRY & DRY CLEANING</Text>
                  <Heading as="h1" style={brandTitleStyle}>LAUNDELLE</Heading>
                  <Text style={taglineStyle}>Artisan Care • Doorstep Collection • 24–48h Delivery</Text>
                </td>
              </tr>
            </table>
          </Section>

          {/* Main Card */}
          <Section style={cardSectionStyle}>
            {/* Greeting */}
            <Heading as="h2" style={greetingHeadingStyle}>
              Welcome to Effortless Garment Care, {customerName}! ✨
            </Heading>

            <Text style={paragraphStyle}>
              We are delighted to welcome you to <strong>Laundelle</strong>. Say goodbye to laundry day headaches, endless ironing piles, and trips to the dry cleaners.
            </Text>

            <Text style={paragraphStyle}>
              From daily wash & fold to hand-finished business shirts and delicate couture care, our master garment specialists handle your clothes with uncompromising precision and eco-friendly enzymes.
            </Text>

            {/* Exclusive Promo Voucher Card */}
            <Section style={voucherWrapperStyle}>
              <table width="100%" cellPadding="0" cellSpacing="0" border={0} role="presentation">
                <tr>
                  <td align="center" style={voucherContentTdStyle}>
                    <Text style={voucherBadgeStyle}>EXCLUSIVE NEW CUSTOMER OFFER</Text>
                    <Heading as="h3" style={voucherDiscountHeadingStyle}>
                      GET {discountPercent}% OFF YOUR FIRST ORDER
                    </Heading>
                    <Text style={voucherSubtextStyle}>
                      Use coupon code below at checkout to redeem your 20% discount:
                    </Text>

                    {/* Voucher Code Box */}
                    <div style={couponCodeBoxStyle}>
                      <span style={couponCodeTextStyle}>{couponCode}</span>
                    </div>

                    <Text style={voucherTermsStyle}>
                      ✓ Valid on all services • Free Collection & Delivery Included
                    </Text>
                  </td>
                </tr>
              </table>
            </Section>

            {/* 3 Simple Steps */}
            <Section style={stepsSectionStyle}>
              <Heading as="h4" style={stepsTitleStyle}>
                How Laundelle Works In 3 Simple Steps:
              </Heading>

              <table width="100%" cellPadding="0" cellSpacing="0" border={0} role="presentation" style={stepsTableStyle}>
                <tr>
                  <td style={stepTdStyle} width="33%">
                    <div style={stepCircleStyle}>1</div>
                    <Text style={stepHeadingStyle}>Schedule Online</Text>
                    <Text style={stepDescStyle}>Book in 60s. Pick your 2-hour collection & delivery slots.</Text>
                  </td>
                  <td style={stepTdStyle} width="33%">
                    <div style={stepCircleStyle}>2</div>
                    <Text style={stepHeadingStyle}>Doorstep Pickup</Text>
                    <Text style={stepDescStyle}>Hand over your bag to our verified GPS-tracked courier.</Text>
                  </td>
                  <td style={stepTdStyle} width="33%">
                    <div style={stepCircleStyle}>3</div>
                    <Text style={stepHeadingStyle}>Fresh Delivery</Text>
                    <Text style={stepDescStyle}>Crisp, freshly scented & folded garments returned to your door.</Text>
                  </td>
                </tr>
              </table>
            </Section>

            {/* Call to Action Button */}
            <Section style={ctaSectionStyle}>
              <table width="100%" cellPadding="0" cellSpacing="0" border={0} role="presentation">
                <tr>
                  <td align="center">
                    <Link href={`${appUrl}/services`} style={primaryButtonStyle}>
                      Book Your First Collection & Save {discountPercent}% &rarr;
                    </Link>
                  </td>
                </tr>
              </table>
            </Section>

            <Hr style={dividerStyle} />

            {/* Service Highlights */}
            <table width="100%" cellPadding="0" cellSpacing="0" border={0} role="presentation" style={{ marginTop: '16px' }}>
              <tr>
                <td style={featureTdStyle}>
                  <Text style={featureTitleStyle}>🌱 Eco-Friendly Washing</Text>
                  <Text style={featureDescStyle}>Hypoallergenic, plant-based detergents gentle on sensitive skin and fabrics.</Text>
                </td>
                <td style={featureTdStyle}>
                  <Text style={featureTitleStyle}>⚡ 24h & 48h Turnaround</Text>
                  <Text style={featureDescStyle}>Standard next-day delivery and express 24h options available across London.</Text>
                </td>
              </tr>
            </table>
          </Section>

          {/* Footer */}
          <Section style={footerSectionStyle}>
            <Text style={footerTextStyle}>
              Questions? Our concierge support team is here to assist 7 days a week.<br />
              Email us at <Link href="mailto:support@laundelle.com" style={footerLinkStyle}>support@laundelle.com</Link> or visit <Link href={appUrl} style={footerLinkStyle}>laundelle.com</Link>.
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

// Inline Styles for bulletproof Gmail / Outlook cross-client support
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
  padding: '36px 24px',
  textAlign: 'center',
  borderBottom: '4px solid #f59e0b',
};

const brandSubtitleStyle: React.CSSProperties = {
  color: '#93c5fd',
  fontSize: '11px',
  fontWeight: 800,
  letterSpacing: '2.5px',
  margin: '0 0 6px 0',
  textTransform: 'uppercase',
};

const brandTitleStyle: React.CSSProperties = {
  color: '#ffffff',
  fontSize: '32px',
  fontWeight: 900,
  letterSpacing: '4px',
  margin: '0 0 8px 0',
};

const taglineStyle: React.CSSProperties = {
  color: '#cbd5e1',
  fontSize: '12px',
  fontWeight: 500,
  letterSpacing: '0.5px',
  margin: '0',
};

const cardSectionStyle: React.CSSProperties = {
  padding: '32px 28px',
};

const greetingHeadingStyle: React.CSSProperties = {
  color: '#0f172a',
  fontSize: '22px',
  fontWeight: 800,
  margin: '0 0 16px 0',
  lineHeight: '1.3',
};

const paragraphStyle: React.CSSProperties = {
  color: '#334155',
  fontSize: '14px',
  lineHeight: '1.6',
  margin: '0 0 14px 0',
};

const voucherWrapperStyle: React.CSSProperties = {
  backgroundColor: '#fffbeb',
  border: '2px dashed #f59e0b',
  borderRadius: '16px',
  padding: '24px 16px',
  margin: '24px 0',
};

const voucherContentTdStyle: React.CSSProperties = {
  textAlign: 'center',
};

const voucherBadgeStyle: React.CSSProperties = {
  color: '#b45309',
  fontSize: '11px',
  fontWeight: 800,
  letterSpacing: '1.5px',
  margin: '0 0 8px 0',
};

const voucherDiscountHeadingStyle: React.CSSProperties = {
  color: '#78350f',
  fontSize: '20px',
  fontWeight: 900,
  margin: '0 0 8px 0',
  letterSpacing: '0.5px',
};

const voucherSubtextStyle: React.CSSProperties = {
  color: '#92400e',
  fontSize: '13px',
  margin: '0 0 14px 0',
};

const couponCodeBoxStyle: React.CSSProperties = {
  display: 'inline-block',
  backgroundColor: '#ffffff',
  border: '2px solid #d97706',
  borderRadius: '10px',
  padding: '10px 24px',
  boxShadow: '0 2px 6px rgba(217, 119, 6, 0.15)',
};

const couponCodeTextStyle: React.CSSProperties = {
  color: '#b45309',
  fontSize: '22px',
  fontWeight: 900,
  letterSpacing: '3px',
  fontFamily: 'monospace, "Courier New", Courier',
};

const voucherTermsStyle: React.CSSProperties = {
  color: '#a16207',
  fontSize: '11px',
  fontWeight: 600,
  margin: '12px 0 0 0',
};

const stepsSectionStyle: React.CSSProperties = {
  margin: '28px 0 20px 0',
};

const stepsTitleStyle: React.CSSProperties = {
  color: '#0f172a',
  fontSize: '15px',
  fontWeight: 800,
  margin: '0 0 16px 0',
  textAlign: 'center',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

const stepsTableStyle: React.CSSProperties = {
  width: '100%',
};

const stepTdStyle: React.CSSProperties = {
  padding: '8px',
  textAlign: 'center',
  verticalAlign: 'top',
};

const stepCircleStyle: React.CSSProperties = {
  width: '32px',
  height: '32px',
  lineHeight: '32px',
  borderRadius: '50%',
  backgroundColor: '#0d2259',
  color: '#ffffff',
  fontWeight: 800,
  fontSize: '14px',
  margin: '0 auto 8px auto',
  textAlign: 'center',
};

const stepHeadingStyle: React.CSSProperties = {
  color: '#0f172a',
  fontSize: '13px',
  fontWeight: 700,
  margin: '0 0 4px 0',
};

const stepDescStyle: React.CSSProperties = {
  color: '#64748b',
  fontSize: '11px',
  lineHeight: '1.4',
  margin: '0',
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

const featureTdStyle: React.CSSProperties = {
  padding: '8px 12px',
  verticalAlign: 'top',
  width: '50%',
};

const featureTitleStyle: React.CSSProperties = {
  color: '#0f172a',
  fontSize: '13px',
  fontWeight: 700,
  margin: '0 0 4px 0',
};

const featureDescStyle: React.CSSProperties = {
  color: '#64748b',
  fontSize: '11px',
  lineHeight: '1.4',
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
  margin: '0 0 12px 0',
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

export default WelcomeEmail;
