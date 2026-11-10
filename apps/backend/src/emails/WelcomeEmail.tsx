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
  Img,
} from '@react-email/components';

export interface WelcomeEmailProps {
  customerName?: string;
  appUrl?: string;
  couponCode?: string;
  discountPercent?: number;
}

export const WelcomeEmail: React.FC<WelcomeEmailProps> = ({
  customerName = 'Valued Customer',
  appUrl = 'https://laundelle.co.uk',
  couponCode = 'WELCOME20',
  discountPercent = 20,
}) => {
  const cleanAppUrl = (appUrl || 'https://laundelle.co.uk').replace(/\/$/, '');

  return (
    <Html lang="en">
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{`Welcome to Laundelle — Enjoy ${discountPercent}% Off Your First Order`}</title>
      </Head>
      <Preview>{`Welcome to Laundelle! Your account is verified. Use code ${couponCode} for ${discountPercent}% off your first luxury laundry order.`}</Preview>
      <Body style={mainStyle}>
        <Container style={containerStyle}>
          {/* Top Brand Header */}
          <Section style={headerSectionStyle}>
            <table width="100%" cellPadding="0" cellSpacing="0" border={0} role="presentation">
              <tr>
                <td align="center">
                  <Text style={headerEyebrowStyle}>LUXURY LAUNDRY & DRY CLEANING</Text>
                  {/* Hosted crisp brand logo */}
                  <Img
                    src="https://res.cloudinary.com/b2st53lu/image/upload/w_360,c_scale/laundelle/branding/laundelle-logo.png"
                    alt="LAUNDELLE"
                    width={180}
                    height={36}
                    style={logoImgStyle}
                  />
                  <Text style={taglineStyle}>Artisan Care • Doorstep Collection • 24–48h Delivery</Text>
                </td>
              </tr>
            </table>
          </Section>

          {/* Cyan Glow Accent Stripe */}
          <div style={accentBarCyanStyle} />

          {/* Main Card */}
          <Section style={cardSectionStyle}>
            {/* Welcome Pill Badge */}
            <table width="100%" cellPadding="0" cellSpacing="0" border={0} role="presentation" style={{ marginBottom: '16px' }}>
              <tr>
                <td align="center">
                  <span style={badgePillStyle}>
                    ✨ ACCOUNT VERIFIED & ACTIVATED
                  </span>
                </td>
              </tr>
            </table>

            {/* Greeting Heading */}
            <Heading as="h1" style={greetingHeadingStyle}>
              Welcome to Effortless Garment Care, {customerName}! 🌿
            </Heading>

            <Text style={paragraphStyle}>
              We are delighted to welcome you to <strong>Laundelle</strong>. Your account has been successfully verified and is now ready for seamless booking.
            </Text>

            <Text style={paragraphStyle}>
              Say goodbye to laundry day headaches, endless ironing, and trips to the dry cleaner. From daily wash & fold to hand-finished shirts, duvets, and delicate couture care, our master garment specialists handle your clothes with uncompromising precision and eco-friendly enzymes.
            </Text>

            {/* Exclusive Promo Voucher Card (Matching Website Coupon Component) */}
            <Section style={voucherWrapperStyle}>
              <table width="100%" cellPadding="0" cellSpacing="0" border={0} role="presentation">
                <tr>
                  <td align="center" style={voucherContentTdStyle}>
                    <span style={voucherBadgeStyle}>
                      EXCLUSIVE NEW CUSTOMER GIFT
                    </span>
                    <Heading as="h2" style={voucherDiscountHeadingStyle}>
                      GET {discountPercent}% OFF YOUR FIRST ORDER
                    </Heading>
                    <Text style={voucherSubtextStyle}>
                      Apply your welcome voucher code at checkout to enjoy {discountPercent}% savings:
                    </Text>

                    {/* Voucher Code Box */}
                    <div style={couponCodeBoxStyle}>
                      <span style={couponCodeTextStyle}>{couponCode}</span>
                    </div>

                    <Text style={voucherTermsStyle}>
                      ✓ Valid on all services • Free Doorstep Collection & Delivery Across London
                    </Text>
                  </td>
                </tr>
              </table>
            </Section>

            {/* Call to Action Button */}
            <Section style={ctaSectionStyle}>
              <table width="100%" cellPadding="0" cellSpacing="0" border={0} role="presentation">
                <tr>
                  <td align="center">
                    <Link href={`${cleanAppUrl}/services`} style={primaryButtonStyle}>
                      Book Your First Collection & Save {discountPercent}% &rarr;
                    </Link>
                  </td>
                </tr>
              </table>
            </Section>

            <Hr style={dividerStyle} />

            {/* 3 Simple Steps matching website */}
            <Section style={stepsSectionStyle}>
              <Text style={stepsTitleStyle}>
                HOW LAUNDELLE WORKS IN 3 SIMPLE STEPS
              </Text>

              <table width="100%" cellPadding="0" cellSpacing="0" border={0} role="presentation" style={stepsTableStyle}>
                <tr>
                  <td style={stepTdStyle} width="33%">
                    <div style={stepCircleStyle}>1</div>
                    <Text style={stepHeadingStyle}>Schedule Online</Text>
                    <Text style={stepDescStyle}>Book in 60s. Pick your preferred 2-hour pickup & return slots.</Text>
                  </td>
                  <td style={stepTdStyle} width="33%">
                    <div style={stepCircleStyle}>2</div>
                    <Text style={stepHeadingStyle}>Doorstep Pickup</Text>
                    <Text style={stepDescStyle}>Hand your bag to our polite, verified fleet driver at your door.</Text>
                  </td>
                  <td style={stepTdStyle} width="33%">
                    <div style={stepCircleStyle}>3</div>
                    <Text style={stepHeadingStyle}>Pristine Return</Text>
                    <Text style={stepDescStyle}>Crisp, fresh, hung or folded clothes delivered in 24–48 hours.</Text>
                  </td>
                </tr>
              </table>
            </Section>

            <Hr style={dividerStyle} />

            {/* Service Highlights Cards */}
            <table width="100%" cellPadding="0" cellSpacing="0" border={0} role="presentation" style={{ marginTop: '8px' }}>
              <tr>
                <td style={featureTdStyle} width="50%">
                  <div style={featureIconStyle}>🌱</div>
                  <Text style={featureTitleStyle}>Eco-Friendly Laundry</Text>
                  <Text style={featureDescStyle}>Hypoallergenic, plant-based detergents gentle on sensitive skin and fabrics.</Text>
                </td>
                <td style={featureTdStyle} width="50%">
                  <div style={featureIconStyle}>⚡</div>
                  <Text style={featureTitleStyle}>Live GPS Tracking</Text>
                  <Text style={featureDescStyle}>Real-time courier updates, PIN security, and instant order tracking.</Text>
                </td>
              </tr>
            </table>
          </Section>

          {/* Footer matching website */}
          <Section style={footerSectionStyle}>
            <Text style={footerBrandStyle}>LAUNDELLE TECHNOLOGIES</Text>
            <Text style={footerTextStyle}>
              London, United Kingdom • Luxury Laundry & Garment Care Delivered
            </Text>
            <Text style={footerContactStyle}>
              Questions? Our concierge support team is here to assist 7 days a week.<br />
              Email us at{' '}
              <Link href="mailto:support@laundelle.co.uk" style={footerLinkStyle}>
                support@laundelle.co.uk
              </Link>{' '}
              or visit{' '}
              <Link href={cleanAppUrl} style={footerLinkStyle}>
                laundelle.co.uk
              </Link>
            </Text>
            <Text style={copyrightStyle}>
              &copy; {new Date().getFullYear()} Laundelle Technologies Ltd. All rights reserved.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

// ==========================================
// STYLES (MATCHING LAUNDELLE WEBSITE DESIGN)
// ==========================================

const mainStyle: React.CSSProperties = {
  backgroundColor: '#f8fafc',
  fontFamily: 'Manrope, "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  margin: '0',
  padding: '32px 12px',
};

const containerStyle: React.CSSProperties = {
  maxWidth: '600px',
  margin: '0 auto',
  backgroundColor: '#ffffff',
  borderRadius: '24px',
  overflow: 'hidden',
  boxShadow: '0 12px 36px rgba(0, 41, 83, 0.08), 0 2px 6px rgba(0, 41, 83, 0.04)',
  border: '1px solid #e2e8f0',
};

const headerSectionStyle: React.CSSProperties = {
  backgroundColor: '#002953', // Laundelle Deep Navy
  padding: '36px 24px 28px 24px',
  textAlign: 'center',
};

const headerEyebrowStyle: React.CSSProperties = {
  color: '#01BEFE', // Laundelle Cyan
  fontSize: '11px',
  fontWeight: 800,
  letterSpacing: '2.5px',
  margin: '0 0 10px 0',
  textTransform: 'uppercase',
};

const logoImgStyle: React.CSSProperties = {
  display: 'block',
  margin: '0 auto 10px auto',
  maxWidth: '180px',
  height: 'auto',
  filter: 'brightness(0) invert(1)',
};

const taglineStyle: React.CSSProperties = {
  color: '#CAF0F8', // Laundelle Ice Cyan
  fontSize: '12px',
  fontWeight: 500,
  letterSpacing: '0.4px',
  margin: '0',
};

const accentBarCyanStyle: React.CSSProperties = {
  height: '4px',
  backgroundColor: '#01BEFE', // Laundelle Cyan accent stripe
  width: '100%',
};

const cardSectionStyle: React.CSSProperties = {
  padding: '36px 32px',
  textAlign: 'center',
  backgroundColor: '#ffffff',
};

const badgePillStyle: React.CSSProperties = {
  display: 'inline-block',
  backgroundColor: '#EBF8FF',
  color: '#002953',
  border: '1px solid #BAE6FD',
  borderRadius: '9999px',
  padding: '6px 16px',
  fontSize: '11px',
  fontWeight: 800,
  letterSpacing: '1px',
  textTransform: 'uppercase',
};

const greetingHeadingStyle: React.CSSProperties = {
  color: '#002953',
  fontSize: '24px',
  fontWeight: 900,
  letterSpacing: '-0.5px',
  margin: '16px 0 16px 0',
  lineHeight: '1.3',
  textAlign: 'center',
};

const paragraphStyle: React.CSSProperties = {
  color: '#334155',
  fontSize: '14px',
  lineHeight: '1.65',
  margin: '0 0 16px 0',
  textAlign: 'left',
};

const voucherWrapperStyle: React.CSSProperties = {
  backgroundColor: '#F0F9FF', // Soft ice blue
  border: '2px dashed #01BEFE', // Cyan dashed voucher border
  borderRadius: '18px',
  padding: '24px 20px',
  margin: '28px 0',
};

const voucherContentTdStyle: React.CSSProperties = {
  textAlign: 'center',
};

const voucherBadgeStyle: React.CSSProperties = {
  display: 'inline-block',
  backgroundColor: '#002953',
  color: '#01BEFE',
  fontSize: '10px',
  fontWeight: 800,
  letterSpacing: '1.5px',
  padding: '4px 12px',
  borderRadius: '9999px',
  margin: '0 0 10px 0',
  textTransform: 'uppercase',
};

const voucherDiscountHeadingStyle: React.CSSProperties = {
  color: '#002953',
  fontSize: '20px',
  fontWeight: 900,
  letterSpacing: '0.5px',
  margin: '0 0 8px 0',
};

const voucherSubtextStyle: React.CSSProperties = {
  color: '#475569',
  fontSize: '13px',
  margin: '0 0 16px 0',
};

const couponCodeBoxStyle: React.CSSProperties = {
  display: 'inline-block',
  backgroundColor: '#FFFFFF',
  border: '2px solid #002953',
  borderRadius: '12px',
  padding: '12px 28px',
  margin: '0 0 14px 0',
  boxShadow: '0 4px 12px rgba(0, 41, 83, 0.08)',
};

const couponCodeTextStyle: React.CSSProperties = {
  color: '#002953',
  fontSize: '22px',
  fontWeight: 900,
  letterSpacing: '3px',
  fontFamily: 'monospace, sans-serif',
};

const voucherTermsStyle: React.CSSProperties = {
  color: '#0369A1',
  fontSize: '11px',
  fontWeight: 600,
  margin: '0',
};

const ctaSectionStyle: React.CSSProperties = {
  margin: '28px 0 20px 0',
};

const primaryButtonStyle: React.CSSProperties = {
  display: 'inline-block',
  backgroundColor: '#002953',
  color: '#FFFFFF',
  padding: '16px 36px',
  borderRadius: '12px',
  fontSize: '15px',
  fontWeight: 800,
  textDecoration: 'none',
  border: '2px solid #01BEFE',
  boxShadow: '0 4px 16px rgba(0, 41, 83, 0.25)',
  letterSpacing: '0.3px',
};

const dividerStyle: React.CSSProperties = {
  borderColor: '#E2E8F0',
  borderWidth: '1px',
  borderStyle: 'solid',
  margin: '28px 0',
};

const stepsSectionStyle: React.CSSProperties = {
  margin: '8px 0 24px 0',
  textAlign: 'center',
};

const stepsTitleStyle: React.CSSProperties = {
  color: '#002953',
  fontSize: '11px',
  fontWeight: 800,
  letterSpacing: '1.5px',
  margin: '0 0 18px 0',
  textTransform: 'uppercase',
};

const stepsTableStyle: React.CSSProperties = {
  marginTop: '8px',
};

const stepTdStyle: React.CSSProperties = {
  padding: '10px 8px',
  textAlign: 'center',
  verticalAlign: 'top',
};

const stepCircleStyle: React.CSSProperties = {
  display: 'inline-block',
  width: '32px',
  height: '32px',
  lineHeight: '32px',
  borderRadius: '50%',
  backgroundColor: '#002953',
  color: '#01BEFE',
  fontSize: '14px',
  fontWeight: 900,
  textAlign: 'center',
  marginBottom: '8px',
};

const stepHeadingStyle: React.CSSProperties = {
  color: '#002953',
  fontSize: '13px',
  fontWeight: 800,
  margin: '0 0 4px 0',
};

const stepDescStyle: React.CSSProperties = {
  color: '#64748B',
  fontSize: '11px',
  lineHeight: '1.45',
  margin: '0',
};

const featureTdStyle: React.CSSProperties = {
  backgroundColor: '#F8FAFC',
  border: '1px solid #E2E8F0',
  borderRadius: '12px',
  padding: '14px 16px',
  textAlign: 'left',
  verticalAlign: 'top',
};

const featureIconStyle: React.CSSProperties = {
  fontSize: '18px',
  marginBottom: '6px',
};

const featureTitleStyle: React.CSSProperties = {
  color: '#002953',
  fontSize: '13px',
  fontWeight: 800,
  margin: '0 0 4px 0',
};

const featureDescStyle: React.CSSProperties = {
  color: '#64748B',
  fontSize: '11px',
  lineHeight: '1.45',
  margin: '0',
};

const footerSectionStyle: React.CSSProperties = {
  backgroundColor: '#002953',
  padding: '28px 24px',
  textAlign: 'center',
  borderTop: '1px solid #01BEFE',
};

const footerBrandStyle: React.CSSProperties = {
  color: '#01BEFE',
  fontSize: '11px',
  fontWeight: 800,
  letterSpacing: '2px',
  margin: '0 0 6px 0',
  textTransform: 'uppercase',
};

const footerTextStyle: React.CSSProperties = {
  color: '#CAF0F8',
  fontSize: '12px',
  margin: '0 0 8px 0',
  fontWeight: 500,
};

const footerContactStyle: React.CSSProperties = {
  color: '#94A3B8',
  fontSize: '11px',
  lineHeight: '1.6',
  margin: '0 0 12px 0',
};

const footerLinkStyle: React.CSSProperties = {
  color: '#01BEFE',
  textDecoration: 'underline',
  fontWeight: 600,
};

const copyrightStyle: React.CSSProperties = {
  color: '#64748B',
  fontSize: '11px',
  margin: '0',
};
