import React from 'react';
import type { Metadata } from 'next';
import { LegalPageLayout } from '../../components/LegalPageLayout';
import { ShieldCheck, Lock, Database, Eye, UserCheck, KeyRound } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Privacy Policy | LAUNDELLE',
  description: 'Understand how LAUNDELLE safeguards your personal data, order records, delivery details, and payment security under UK GDPR.',
  alternates: {
    canonical: '/privacypolicy',
  },
};

export default function PrivacyPolicyPage() {
  const sections = [
    {
      id: 'commitment',
      title: 'Our Commitment to Data Privacy',
      content: (
        <>
          <p>
            At <strong>LAUNDELLE</strong> (operated by <strong>Laundelle Garment Care Ltd</strong>), your trust is our highest priority. We respect your fundamental right to privacy and are committed to safeguarding all personal data you entrust to us.
          </p>
          <p>
            This Privacy Policy explains how we collect, store, process, transfer, and protect your information when you access our customer web platform, schedule doorstep collections, interact with our customer care desk, or utilize our AI Laundry Care Guide. We operate in full compliance with the <strong>UK General Data Protection Regulation (UK GDPR)</strong> and the <strong>Data Protection Act 2018 (DPA 2018)</strong>.
          </p>
        </>
      ),
    },
    {
      id: 'data-we-collect',
      title: 'Information We Collect About You',
      content: (
        <>
          <p>We collect only the minimum data necessary to deliver exceptional, reliable garment care and doorstep logistics:</p>
          <div className="space-y-3 pt-1">
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
              <h5 className="font-bold text-xs uppercase tracking-wider text-[#002953]">1. Identity &amp; Contact Data</h5>
              <p className="text-xs text-slate-600 mt-1">
                Your full name, mobile telephone number, email address, and authentication credentials. Used for booking confirmations, OTP verification, and status alerts.
              </p>
            </div>
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
              <h5 className="font-bold text-xs uppercase tracking-wider text-[#002953]">2. Doorstep Delivery &amp; Postcode Data</h5>
              <p className="text-xs text-slate-600 mt-1">
                Your collection and delivery addresses, building entrance codes, concierge instructions, floor numbers, and geolocation coordinates required for courier navigation.
              </p>
            </div>
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
              <h5 className="font-bold text-xs uppercase tracking-wider text-[#002953]">3. Payment &amp; Transaction Details</h5>
              <p className="text-xs text-slate-600 mt-1">
                All card transactions are processed directly by our PCI-DSS Level 1 certified partner <strong>Stripe</strong>. We do not store raw card numbers, CVVs, or bank credentials on our servers. We store only anonymized payment tokens, card brand, last 4 digits, and billing timestamps.
              </p>
            </div>
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
              <h5 className="font-bold text-xs uppercase tracking-wider text-[#002953]">4. Laundry Preferences &amp; Garment Notes</h5>
              <p className="text-xs text-slate-600 mt-1">
                Hypoallergenic detergent choices, fabric softener preferences, shirt starch levels, folding instructions, and itemized garment intake logs.
              </p>
            </div>
          </div>
        </>
      ),
    },
    {
      id: 'how-we-use-data',
      title: 'How We Use Your Personal Information',
      content: (
        <>
          <p>We process your data strictly under recognized legal bases under Article 6 of the UK GDPR:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Performance of a Contract:</strong> To dispatch couriers to your address, safely clean your garments according to manufacturer specifications, generate invoices, and return clothes within the requested window.
            </li>
            <li>
              <strong>Legitimate Business Interests:</strong> Optimizing courier delivery routes, quality assurance, fraud prevention, driver dispatch balancing, and platform uptime monitoring.
            </li>
            <li>
              <strong>Legal Compliance:</strong> Retaining financial transaction records to comply with statutory UK HMRC accounting and tax obligations.
            </li>
            <li>
              <strong>Consent:</strong> Sending optional promotional offers or seasonal garment care guides (you may opt out at any time via your account settings or one-click unsubscribe links).
            </li>
          </ul>
        </>
      ),
    },
    {
      id: 'third-party-sharing',
      title: 'Third-Party Disclosures & Data Processors',
      content: (
        <>
          <p>
            <strong>We do not sell, rent, or trade your personal data to any third-party advertisers or brokers under any circumstance.</strong>
          </p>
          <p>We share information solely with vetted data processors who adhere to strict data processing agreements:</p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li><strong>Logistics Couriers:</strong> Assigned drivers receive your delivery name, address, collection instructions, and contact number solely for active order fulfilment.</li>
            <li><strong>Stripe UK:</strong> Encrypted payment gateway handling card validation, pre-authorisations, and refunds under PCI-DSS certification.</li>
            <li><strong>Twilio / WhatsApp Business:</strong> Dispatch of real-time SMS and WhatsApp driver ETA notifications and OTP security codes.</li>
            <li><strong>MongoDB Atlas:</strong> Highly secure, SOC2-certified cloud database infrastructure with end-to-end encryption at rest (AES-256) and in transit (TLS 1.3).</li>
          </ul>
        </>
      ),
    },
    {
      id: 'data-retention',
      title: 'Data Retention & Storage Security',
      content: (
        <>
          <p>
            We retain your account details and order history for as long as your customer profile remains active, enabling easy re-ordering and historical digital receipts.
          </p>
          <p>
            In accordance with UK statutory financial regulations, transaction and invoice records are preserved for <strong>6 years</strong> following the financial year end to satisfy HMRC accounting compliance. Inactive guest sessions and transient temporary files are automatically pruned after 90 days.
          </p>
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 mt-2 space-y-1">
            <h5 className="font-bold text-[#002953] text-xs">Technical Security Measures:</h5>
            <p className="text-xs text-slate-600">
              We employ HTTPS/TLS 1.3 encryption across all network transfers, role-based access control (RBAC) restricting staff permissions, bcrypt password hashing, and continuous vulnerability scanning.
            </p>
          </div>
        </>
      ),
    },
    {
      id: 'your-rights',
      title: 'Your UK GDPR Statutory Rights',
      content: (
        <>
          <p>Under the UK Data Protection Act and UK GDPR, you hold comprehensive rights regarding your personal data:</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-2">
            <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100">
              <span className="font-bold text-[#002953] block text-xs">Right to Access (SAR)</span>
              <span className="text-[11px] text-slate-600">Request a full digital copy of all personal records we hold about you.</span>
            </div>
            <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100">
              <span className="font-bold text-[#002953] block text-xs">Right to Erasure</span>
              <span className="text-[11px] text-slate-600">Request deletion of your profile and data (&quot;Right to be Forgotten&quot;).</span>
            </div>
            <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100">
              <span className="font-bold text-[#002953] block text-xs">Right to Rectification</span>
              <span className="text-[11px] text-slate-600">Correct inaccurate or outdated contact, address, or payment details.</span>
            </div>
            <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100">
              <span className="font-bold text-[#002953] block text-xs">Right to Data Portability</span>
              <span className="text-[11px] text-slate-600">Receive your data in a structured, machine-readable JSON/CSV format.</span>
            </div>
          </div>
          <p>
            To exercise any of these rights, email our Data Protection Officer at <a href="mailto:privacy@laundelle.co.uk" className="text-[#01BEFE] font-bold hover:underline">privacy@laundelle.co.uk</a>. We respond to all verified statutory requests within <strong>30 calendar days</strong> at zero administrative charge.
          </p>
        </>
      ),
    },
    {
      id: 'contact-dpo',
      title: 'Data Protection Officer Contact & Supervisory Authority',
      content: (
        <>
          <p>
            If you have questions, concerns, or requests regarding this Privacy Policy or our data management practices, please contact our designated team:
          </p>
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 text-xs text-slate-700 space-y-1">
            <p><strong>Laundelle Garment Care Ltd — Data Protection Office</strong></p>
            <p>123 Clean Street, Ocean City, London, UK - 500001</p>
            <p>Email: <a href="mailto:privacy@laundelle.co.uk" className="text-[#01BEFE] hover:underline font-bold">privacy@laundelle.co.uk</a> | Phone: +44 20 1234 5678</p>
          </div>
          <p className="pt-2 text-xs text-slate-500">
            You also retain the statutory right to lodge a complaint with the UK supervisory authority: Information Commissioner&apos;s Office (ICO) at <a href="https://ico.org.uk" target="_blank" rel="noopener noreferrer" className="text-[#01BEFE] hover:underline font-semibold">ico.org.uk</a>.
          </p>
        </>
      ),
    },
  ];

  const highlights = [
    {
      title: 'UK GDPR & DPA 2018 Compliant',
      desc: 'Rigorous data protection framework with full user rights and immediate compliance verification.',
      icon: <ShieldCheck className="w-5 h-5 text-[#01BEFE]" />,
    },
    {
      title: 'Zero Card Storage on Servers',
      desc: 'Direct tokenized billing through Stripe PCI-DSS Level 1 infrastructure protects your financial data.',
      icon: <Lock className="w-5 h-5 text-[#01BEFE]" />,
    },
    {
      title: 'Never Sold or Monetized',
      desc: 'Your personal information is used strictly to collect, clean, and deliver your laundry.',
      icon: <UserCheck className="w-5 h-5 text-[#01BEFE]" />,
    },
  ];

  return (
    <LegalPageLayout
      title="Privacy Policy"
      badge="Data Protection"
      lastUpdated="September 2026"
      description="This policy outlines how Laundelle Garment Care Ltd collects, processes, and protects your personal data, delivery addresses, and payment details under UK GDPR."
      icon={<Lock className="w-8 h-8" />}
      activePath="/privacypolicy"
      sections={sections}
      keyHighlights={highlights}
    />
  );
}
