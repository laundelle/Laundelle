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

export interface EmailVerificationEmailProps {
  customerName?: string;
  email?: string;
  userEmail?: string;
  verificationUrl?: string;
  appUrl?: string;
}

export const EmailVerificationEmail: React.FC<EmailVerificationEmailProps> = ({
  customerName = 'Valued Customer',
  email,
  userEmail,
  verificationUrl = 'https://laundelle.co.uk/verify-email?token=example-token',
  appUrl = 'https://laundelle.co.uk',
}) => {
  const displayEmail = email || userEmail || 'customer@example.com';
  const cleanAppUrl = (appUrl || 'https://laundelle.co.uk').replace(/\/$/, '');

  return (
    <Html lang="en">
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Verify Your Email Address — Laundelle</title>
      </Head>
      <Preview>Please verify your email address to activate your Laundelle account and start booking luxury laundry & dry cleaning.</Preview>
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
                  <Text style={taglineStyle}>Artisan Fabric Care • Doorstep Collection • London, UK</Text>
                </td>
              </tr>
            </table>
          </Section>

          {/* Cyan Glow Accent Stripe */}
          <div style={accentBarCyanStyle} />

          {/* Main Card Content */}
          <Section style={cardSectionStyle}>
            {/* Verification Security Badge */}
            <table width="100%" cellPadding="0" cellSpacing="0" border={0} role="presentation" style={{ marginBottom: '16px' }}>
              <tr>
                <td align="center">
                  <span style={badgePillStyle}>
                    🛡️ SECURE ACCOUNT VERIFICATION
                  </span>
                </td>
              </tr>
            </table>

            <Heading as="h1" style={headingStyle}>
              Verify Your Email Address
            </Heading>

            <Text style={greetingStyle}>
              Hello <strong>{customerName}</strong>,
            </Text>

            <Text style={paragraphStyle}>
              Thank you for creating an account with <strong>Laundelle</strong>. To activate your account and access seamless door-to-door laundry, dry cleaning, and garment care across all devices, please confirm your email address.
            </Text>

            {/* Email Address Confirmation Chip */}
            <Section style={emailChipSectionStyle}>
              <table width="100%" cellPadding="0" cellSpacing="0" border={0} role="presentation">
                <tr>
                  <td align="center" style={emailChipTdStyle}>
                    <Text style={emailChipLabelStyle}>ACCOUNT EMAIL TO VERIFY</Text>
                    <Text style={emailChipValueStyle}>{displayEmail}</Text>
                  </td>
                </tr>
              </table>
            </Section>

            {/* Primary Action Button */}
            <Section style={ctaSectionStyle}>
              <table width="100%" cellPadding="0" cellSpacing="0" border={0} role="presentation">
                <tr>
                  <td align="center">
                    <Link href={verificationUrl} style={primaryButtonStyle}>
                      Verify & Activate My Account &rarr;
                    </Link>
                  </td>
                </tr>
              </table>
            </Section>

            {/* Expiry & Security Notice */}
            <Section style={infoNoticeBoxStyle}>
              <table width="100%" cellPadding="0" cellSpacing="0" border={0} role="presentation">
                <tr>
                  <td style={{ textAlign: 'center' }}>
                    <Text style={infoNoticeTextStyle}>
                      ⏱️ <strong>24-Hour Expiration:</strong> This secure verification link is single-use and expires in 24 hours. Once verified, you will receive your welcome gift code.
                    </Text>
                  </td>
                </tr>
              </table>
            </Section>

            <Hr style={dividerStyle} />

            {/* Direct URL Fallback */}
            <Section style={fallbackSectionStyle}>
              <Text style={fallbackNoticeStyle}>
                Having trouble clicking the button? Copy and paste this URL directly into your browser:
              </Text>
              <div style={urlBoxStyle}>
                <Link href={verificationUrl} style={urlTextStyle}>
                  {verificationUrl}
                </Link>
              </div>
            </Section>

            <Hr style={dividerStyle} />

            {/* Why Verify Pillars matching website */}
            <Section style={pillarsSectionStyle}>
              <Text style={pillarsHeadingStyle}>WHAT YOU UNLOCK WITH LAUNDELLE</Text>
              <table width="100%" cellPadding="0" cellSpacing="0" border={0} role="presentation">
                <tr>
                  <td style={pillarTdStyle} width="33%">
                    <div style={pillarIconBoxStyle}>🧺</div>
                    <Text style={pillarTitleStyle}>Artisan Care</Text>
                    <Text style={pillarDescStyle}>Eco-friendly hypoallergenic enzymes & delicate hand inspection.</Text>
                  </td>
                  <td style={pillarTdStyle} width="33%">
                    <div style={pillarIconBoxStyle}>🚚</div>
                    <Text style={pillarTitleStyle}>60s Booking</Text>
                    <Text style={pillarDescStyle}>Doorstep collection with live GPS driver tracking.</Text>
                  </td>
                  <td style={pillarTdStyle} width="33%">
                    <div style={pillarIconBoxStyle}>✨</div>
                    <Text style={pillarTitleStyle}>24–48h Delivery</Text>
                    <Text style={pillarDescStyle}>Returned crisp, fragrant, hung or folded to perfection.</Text>
                  </td>
                </tr>
              </table>
            </Section>

            {/* Security footnote */}
            <Section style={securityFooterSectionStyle}>
              <Text style={securityFooterTextStyle}>
                <strong>Security Notice:</strong> If you did not create a Laundelle account using this email, you can safely ignore this message. No account will be activated without this verification step.
              </Text>
            </Section>
          </Section>

          {/* Footer matching website */}
          <Section style={footerSectionStyle}>
            <Text style={footerBrandStyle}>LAUNDELLE TECHNOLOGIES</Text>
            <Text style={footerTextStyle}>
              London, United Kingdom • Premium Laundry & Dry Cleaning On Demand
            </Text>
            <Text style={footerContactStyle}>
              Need assistance? Email our concierge team at{' '}
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
  filter: 'brightness(0) invert(1)', // White logo matching navy top header
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

const headingStyle: React.CSSProperties = {
  color: '#002953',
  fontSize: '26px',
  fontWeight: 900,
  letterSpacing: '-0.5px',
  margin: '16px 0 16px 0',
  lineHeight: '1.25',
};

const greetingStyle: React.CSSProperties = {
  color: '#002953',
  fontSize: '15px',
  fontWeight: 700,
  margin: '0 0 12px 0',
  textAlign: 'left',
};

const paragraphStyle: React.CSSProperties = {
  color: '#334155',
  fontSize: '14px',
  lineHeight: '1.65',
  margin: '0 0 20px 0',
  textAlign: 'left',
};

const emailChipSectionStyle: React.CSSProperties = {
  backgroundColor: '#F8FAFC',
  border: '1px solid #E2E8F0',
  borderRadius: '14px',
  padding: '14px 16px',
  margin: '0 0 24px 0',
};

const emailChipTdStyle: React.CSSProperties = {
  textAlign: 'center',
};

const emailChipLabelStyle: React.CSSProperties = {
  color: '#64748B',
  fontSize: '10px',
  fontWeight: 800,
  letterSpacing: '1.5px',
  margin: '0 0 4px 0',
  textTransform: 'uppercase',
};

const emailChipValueStyle: React.CSSProperties = {
  color: '#002953',
  fontSize: '16px',
  fontWeight: 800,
  margin: '0',
  fontFamily: 'monospace, sans-serif',
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

const infoNoticeBoxStyle: React.CSSProperties = {
  backgroundColor: '#F0F9FF',
  border: '1px solid #BAE6FD',
  borderRadius: '12px',
  padding: '12px 16px',
  margin: '0 0 24px 0',
};

const infoNoticeTextStyle: React.CSSProperties = {
  color: '#0369A1',
  fontSize: '12px',
  lineHeight: '1.5',
  margin: '0',
};

const dividerStyle: React.CSSProperties = {
  borderColor: '#E2E8F0',
  borderWidth: '1px',
  borderStyle: 'solid',
  margin: '28px 0',
};

const fallbackSectionStyle: React.CSSProperties = {
  textAlign: 'left',
};

const fallbackNoticeStyle: React.CSSProperties = {
  color: '#64748B',
  fontSize: '12px',
  lineHeight: '1.5',
  margin: '0 0 8px 0',
};

const urlBoxStyle: React.CSSProperties = {
  backgroundColor: '#F8FAFC',
  border: '1px solid #E2E8F0',
  borderRadius: '8px',
  padding: '10px 12px',
  wordBreak: 'break-all',
};

const urlTextStyle: React.CSSProperties = {
  color: '#002953',
  fontSize: '11px',
  textDecoration: 'underline',
  fontFamily: 'monospace',
};

const pillarsSectionStyle: React.CSSProperties = {
  margin: '8px 0 24px 0',
  textAlign: 'center',
};

const pillarsHeadingStyle: React.CSSProperties = {
  color: '#002953',
  fontSize: '11px',
  fontWeight: 800,
  letterSpacing: '1.5px',
  margin: '0 0 16px 0',
  textTransform: 'uppercase',
};

const pillarTdStyle: React.CSSProperties = {
  padding: '8px 10px',
  textAlign: 'center',
  verticalAlign: 'top',
};

const pillarIconBoxStyle: React.CSSProperties = {
  fontSize: '22px',
  marginBottom: '6px',
};

const pillarTitleStyle: React.CSSProperties = {
  color: '#002953',
  fontSize: '13px',
  fontWeight: 800,
  margin: '0 0 4px 0',
};

const pillarDescStyle: React.CSSProperties = {
  color: '#64748B',
  fontSize: '11px',
  lineHeight: '1.45',
  margin: '0',
};

const securityFooterSectionStyle: React.CSSProperties = {
  backgroundColor: '#F8FAFC',
  borderRadius: '10px',
  padding: '12px 14px',
  marginTop: '8px',
};

const securityFooterTextStyle: React.CSSProperties = {
  color: '#94A3B8',
  fontSize: '11px',
  lineHeight: '1.5',
  margin: '0',
  textAlign: 'center',
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
