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
  verificationUrl = 'https://laundelle.com/verify-email?token=example-token',
  appUrl = 'https://laundelle.com',
}) => {
  const displayEmail = email || userEmail || 'customer@example.com';
  return (
    <Html lang="en">
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Verify Your Email Address — Laundelle</title>
      </Head>
      <Preview>Please verify your email address to activate your Laundelle account across Google, Apple, Facebook, and Gmail.</Preview>
      <Body style={mainStyle}>
        <Container style={containerStyle}>
          {/* Header */}
          <Section style={headerSectionStyle}>
            <table width="100%" cellPadding="0" cellSpacing="0" border={0} role="presentation">
              <tr>
                <td align="center">
                  <Text style={brandSubtitleStyle}>ACCOUNT SECURITY & VERIFICATION</Text>
                  <Heading as="h1" style={brandTitleStyle}>LAUNDELLE</Heading>
                  <Text style={taglineStyle}>Luxury Laundry & Dry Cleaning</Text>
                </td>
              </tr>
            </table>
          </Section>

          {/* Main Card */}
          <Section style={cardSectionStyle}>
            {/* Shield Icon Badge */}
            <div style={shieldContainerStyle}>
              <div style={shieldCircleStyle}>
                🛡️
              </div>
            </div>

            <Heading as="h2" style={headingStyle}>
              Verify Your Account
            </Heading>

            <Text style={paragraphStyle}>
              Hello <strong>{customerName}</strong>,
            </Text>

            <Text style={paragraphStyle}>
              Thank you for registering with Laundelle. Please confirm that <strong>{email}</strong> belongs to you by clicking the verification button below.
            </Text>

            {/* Provider Support Banner */}
            <Section style={providerBannerStyle}>
              <table width="100%" cellPadding="0" cellSpacing="0" border={0} role="presentation">
                <tr>
                  <td align="center">
                    <Text style={providerHeadingStyle}>
                      UNIVERSAL ACCOUNT VERIFICATION
                    </Text>
                    <Text style={providerDescStyle}>
                      Verifying enables secure one-tap access across all linked sign-in methods:
                    </Text>
                    <table cellPadding="0" cellSpacing="0" border={0} role="presentation" style={{ margin: '8px auto' }}>
                      <tr>
                        <td style={providerPillTdStyle}>
                          <span style={providerPillStyle}>🔴 Google / Gmail</span>
                        </td>
                        <td style={providerPillTdStyle}>
                          <span style={providerPillStyle}>🍏 Apple ID</span>
                        </td>
                        <td style={providerPillTdStyle}>
                          <span style={providerPillStyle}>🔵 Facebook</span>
                        </td>
                        <td style={providerPillTdStyle}>
                          <span style={providerPillStyle}>✉️ Email Login</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </Section>

            {/* Verification Button */}
            <Section style={ctaSectionStyle}>
              <table width="100%" cellPadding="0" cellSpacing="0" border={0} role="presentation">
                <tr>
                  <td align="center">
                    <Link href={verificationUrl} style={primaryButtonStyle}>
                      ✓ Verify & Activate My Account
                    </Link>
                  </td>
                </tr>
              </table>
            </Section>

            <Text style={expiryTextStyle}>
              ⏱️ <strong>Note:</strong> This verification button is valid for 24 hours.
            </Text>

            <Hr style={dividerStyle} />

            {/* Fallback URL section */}
            <Section style={fallbackSectionStyle}>
              <Text style={fallbackNoticeStyle}>
                Button not working? Copy and paste this direct verification URL into your browser:
              </Text>
              <div style={urlBoxStyle}>
                <Link href={verificationUrl} style={urlTextStyle}>
                  {verificationUrl}
                </Link>
              </div>
            </Section>

            <Section style={securityNoticeStyle}>
              <Text style={securityTextStyle}>
                <strong>Security Reminder:</strong> If you did not create an account on Laundelle, you can safely ignore this email. No account will be activated without this verification step.
              </Text>
            </Section>
          </Section>

          {/* Footer */}
          <Section style={footerSectionStyle}>
            <Text style={footerTextStyle}>
              Need assistance? Contact our concierge at <Link href="mailto:support@laundelle.com" style={footerLinkStyle}>support@laundelle.com</Link>.
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
  borderBottom: '4px solid #0284c7',
};

const brandSubtitleStyle: React.CSSProperties = {
  color: '#38bdf8',
  fontSize: '11px',
  fontWeight: 800,
  letterSpacing: '2.5px',
  margin: '0 0 6px 0',
  textTransform: 'uppercase',
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
  padding: '36px 32px',
  textAlign: 'center',
};

const shieldContainerStyle: React.CSSProperties = {
  textAlign: 'center',
  margin: '0 0 16px 0',
};

const shieldCircleStyle: React.CSSProperties = {
  display: 'inline-block',
  width: '56px',
  height: '56px',
  lineHeight: '56px',
  borderRadius: '50%',
  backgroundColor: '#e0f2fe',
  fontSize: '28px',
  textAlign: 'center',
};

const headingStyle: React.CSSProperties = {
  color: '#0f172a',
  fontSize: '24px',
  fontWeight: 800,
  margin: '0 0 16px 0',
};

const paragraphStyle: React.CSSProperties = {
  color: '#334155',
  fontSize: '14px',
  lineHeight: '1.6',
  margin: '0 0 12px 0',
  textAlign: 'left',
};

const providerBannerStyle: React.CSSProperties = {
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: '16px',
  padding: '16px 12px',
  margin: '20px 0',
  textAlign: 'center',
};

const providerHeadingStyle: React.CSSProperties = {
  color: '#0f172a',
  fontSize: '11px',
  fontWeight: 800,
  letterSpacing: '1px',
  margin: '0 0 4px 0',
};

const providerDescStyle: React.CSSProperties = {
  color: '#64748b',
  fontSize: '11px',
  margin: '0 0 8px 0',
};

const providerPillTdStyle: React.CSSProperties = {
  padding: '4px',
};

const providerPillStyle: React.CSSProperties = {
  display: 'inline-block',
  backgroundColor: '#ffffff',
  border: '1px solid #cbd5e1',
  borderRadius: '12px',
  padding: '4px 10px',
  fontSize: '11px',
  fontWeight: 600,
  color: '#1e293b',
};

const ctaSectionStyle: React.CSSProperties = {
  margin: '28px 0 16px 0',
};

const primaryButtonStyle: React.CSSProperties = {
  display: 'inline-block',
  backgroundColor: '#0284c7',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: 800,
  textDecoration: 'none',
  padding: '16px 36px',
  borderRadius: '14px',
  boxShadow: '0 4px 14px rgba(2, 132, 199, 0.35)',
  textAlign: 'center',
};

const expiryTextStyle: React.CSSProperties = {
  color: '#64748b',
  fontSize: '12px',
  margin: '8px 0 0 0',
};

const dividerStyle: React.CSSProperties = {
  borderColor: '#e2e8f0',
  margin: '24px 0',
};

const fallbackSectionStyle: React.CSSProperties = {
  textAlign: 'left',
  margin: '16px 0',
};

const fallbackNoticeStyle: React.CSSProperties = {
  color: '#64748b',
  fontSize: '11px',
  margin: '0 0 6px 0',
};

const urlBoxStyle: React.CSSProperties = {
  backgroundColor: '#f8fafc',
  border: '1px solid #cbd5e1',
  borderRadius: '8px',
  padding: '8px 12px',
  wordBreak: 'break-all',
};

const urlTextStyle: React.CSSProperties = {
  color: '#0284c7',
  fontSize: '11px',
  textDecoration: 'none',
};

const securityNoticeStyle: React.CSSProperties = {
  backgroundColor: '#fef2f2',
  border: '1px solid #fecaca',
  borderRadius: '12px',
  padding: '12px 14px',
  margin: '20px 0 0 0',
  textAlign: 'left',
};

const securityTextStyle: React.CSSProperties = {
  color: '#991b1b',
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
  color: '#0284c7',
  textDecoration: 'underline',
};

const copyrightStyle: React.CSSProperties = {
  color: '#94a3b8',
  fontSize: '11px',
  margin: '0',
};

export default EmailVerificationEmail;
