import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPageLayout } from '../../components/LegalPageLayout';
import { FileText, ShieldCheck, Scale, AlertCircle, CheckCircle2, Clock } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Terms & Conditions | LAUNDELLE',
  description: 'Terms and Conditions of service for LAUNDELLE garment care, laundry, dry cleaning, and doorstep delivery platform.',
  alternates: {
    canonical: '/termsandconditions',
  },
};

export default function TermsAndConditionsPage() {
  const sections = [
    {
      id: 'introduction',
      title: 'Introduction & Operating Agreement',
      content: (
        <>
          <p>
            Welcome to <strong>LAUNDELLE</strong> (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;), operated by <strong>Laundelle Garment Care Ltd</strong> (incorporated in England and Wales). These Terms and Conditions (&quot;Terms&quot;) govern your access to and use of our mobile-responsive web platform, mobile applications, and on-demand laundry, dry cleaning, garment repair, and collection/delivery services (collectively, the &quot;Services&quot;).
          </p>
          <p>
            By booking a collection, placing an order, registering an account, or otherwise using our Services, you confirm that you have read, understood, and agreed to be legally bound by these Terms and our related policies, including our <Link href="/privacypolicy" className="text-[#01BEFE] font-bold hover:underline">Privacy Policy</Link> and <Link href="/cancellationandrefund" className="text-[#01BEFE] font-bold hover:underline">Cancellation &amp; Refund Policy</Link>.
          </p>
          <div className="bg-blue-50/70 rounded-2xl p-4 border border-blue-100 flex items-start gap-3 mt-2">
            <AlertCircle className="w-5 h-5 text-[#01BEFE] shrink-0 mt-0.5" />
            <p className="text-xs text-[#002953]">
              If you do not accept these Terms in their entirety, you must immediately cease using the platform and refrain from booking collections.
            </p>
          </div>
        </>
      ),
    },
    {
      id: 'eligibility-account',
      title: 'Account Registration & User Obligations',
      content: (
        <>
          <p>
            To use certain features of the Service—such as scheduling doorstep collection, saving laundry preferences, tracking active orders, and managing digital payments—you may be required to register a customer account.
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li><strong>Age Requirement:</strong> You must be at least 18 years of age to book orders and enter into binding agreements.</li>
            <li><strong>Accurate Details:</strong> You agree to provide accurate, current, and complete information, including your full legal name, active telephone number, email address, and precise collection/delivery address within our serviceable UK postcodes.</li>
            <li><strong>Credential Security:</strong> You are responsible for maintaining the confidentiality of your login credentials and one-time passcodes (OTP). Any activity conducted through your authenticated session is deemed to have been authorized by you.</li>
            <li><strong>Account Safeguarding:</strong> You must immediately notify our support team at <a href="mailto:care@laundelle.co.uk" className="text-[#01BEFE] font-semibold hover:underline">care@laundelle.co.uk</a> if you suspect any unauthorized access to your account.</li>
          </ul>
        </>
      ),
    },
    {
      id: 'collection-delivery',
      title: 'Collection, Transit & Doorstep Delivery',
      content: (
        <>
          <p>
            Our logistics couriers operate scheduled collection and delivery slots across approved service postcodes.
          </p>
          <div className="space-y-2">
            <h4 className="font-bold text-[#002953]">1. Scheduled Windows &amp; Access</h4>
            <p>
              When placing an order, you select a designated collection time window. You must ensure that you or an authorized representative (or designated secure concierge/porch) is available to hand over garments during this window. If access codes, flat buzzers, or concierge keys are required, they must be specified in the booking notes.
            </p>
          </div>
          <div className="space-y-2 pt-2">
            <h4 className="font-bold text-[#002953]">2. Verification &amp; Bag Handover</h4>
            <p>
              For security, our couriers utilize digital pickup manifests. Garments are placed into secure, moisture-resistant, uniquely tagged Laundelle laundry hampers or protective garment carriers. An automated SMS/WhatsApp handover confirmation is issued upon driver scan.
            </p>
          </div>
          <div className="space-y-2 pt-2">
            <h4 className="font-bold text-[#002953]">3. Turnaround Times</h4>
            <p>
              Standard orders are cleaned and returned within <strong>48 hours</strong>. Express Same-Day and 24-Hour turnaround services are available for select postcodes and service categories at published surcharge rates. While we make every commercially reasonable effort to adhere to selected slots, times may occasionally be influenced by traffic, severe weather, or transport disruptions.
            </p>
          </div>
        </>
      ),
    },
    {
      id: 'inspection-care',
      title: 'Garment Inspection, Weigh-in & Care Labels',
      content: (
        <>
          <p>
            Upon arrival at our specialized cleaning facilities, your garments undergo an intensive <strong>9-point digital intake inspection</strong>:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-2">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="font-bold text-[#002953] block text-xs">⚖️ Digital Weigh-In</span>
              <span className="text-[11px] text-slate-600">Wash &amp; Fold bags are weighed on certified digital scales before sorting to verify net weight.</span>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="font-bold text-[#002953] block text-xs">🔍 Wear &amp; Tear Audit</span>
              <span className="text-[11px] text-slate-600">Existing stains, rips, missing buttons, or fabric thinning are photographed and logged.</span>
            </div>
          </div>
          <p>
            <strong>Manufacturer Care Labels:</strong> We adhere rigorously to manufacturer care labels (BS EN ISO 3758). If a garment lacks a care label, has contradictory instructions, or is marked &quot;Do Not Wash / Do Not Dry Clean,&quot; we will contact you for consent before proceeding. Cleaning of such items is conducted entirely at the customer&apos;s own risk.
          </p>
          <p>
            <strong>Stain Removal:</strong> While our master dry cleaners utilize advanced eco-friendly stain removal technology, complete removal of certain stubborn compounds (including oxidized oil, dried ink, bleach marks, synthetic dye transfer, or acid stains) cannot be guaranteed without risking damage to the fabric fiber or dye integrity.
          </p>
        </>
      ),
    },
    {
      id: 'customer-responsibilities',
      title: 'Customer Responsibilities & Pocket Clearing',
      content: (
        <>
          <div className="bg-amber-50 rounded-2xl p-4 border border-amber-200 text-amber-950 space-y-2">
            <h4 className="font-bold flex items-center gap-1.5 text-xs text-amber-900 uppercase tracking-wider">
              <AlertCircle className="w-4 h-4 text-amber-700" />
              <span>Mandatory Pocket Inspection</span>
            </h4>
            <p className="text-xs text-amber-900 leading-relaxed">
              You must thoroughly inspect all pockets, cuffs, and linings before handing garments to our couriers. <strong>Remove all pens, coins, money, bank cards, lipstick, keys, jewellery, electronics, scissors, pins, and loose fasteners.</strong>
            </p>
          </div>
          <p>
            Laundelle accepts no liability whatsoever for cash, jewellery, keys, or personal valuables left in pockets. Furthermore, if a foreign item left in your pockets (such as a ballpoint pen, ink cartridge, lipstick, chewing gum, or chemical sanitizer) causes damage, staining, or discoloration to your garments or to the garments of others during machine washing, you may be held liable for repair or replacement costs.
          </p>
        </>
      ),
    },
    {
      id: 'pricing-billing',
      title: 'Pricing, Invoicing & Stripe Payment Processing',
      content: (
        <>
          <p>
            All prices published on our platform are in <strong>British Pounds Sterling (£ / GBP)</strong> and include applicable Value Added Tax (VAT).
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li><strong>Minimum Order Value:</strong> A minimum order threshold of £20.00 applies to doorstep collections to cover courier transit logistics. Orders below this threshold will be billed at the minimum order value.</li>
            <li><strong>Itemized Adjustments:</strong> For bulk laundry bags or un-itemized drop-offs, our intake facility team will count and itemize garments. Any discrepancy with your preliminary cart estimate will be automatically adjusted on your digital invoice before processing.</li>
            <li><strong>Payment Authorisation:</strong> Payments are processed via our PCI-DSS Level 1 certified payment partner, <strong>Stripe</strong>. A temporary pre-authorisation hold may be placed on your payment method when placing an order; final capture occurs only after intake weigh-in and processing completion.</li>
            <li><strong>Failed Payments:</strong> If payment capture fails, you agree to settle the outstanding balance before delivery handover. We reserve the right to withhold completed laundry until payment is verified.</li>
          </ul>
        </>
      ),
    },
    {
      id: 'liability-limits',
      title: 'Fair Compensation Guarantee & Liability Limits',
      content: (
        <>
          <p>
            We handle every garment with consummate professional care. In the highly exceptional event that an item is misplaced or irreparably damaged while in our physical custody:
          </p>
          <div className="space-y-2">
            <h4 className="font-bold text-[#002953]">1. Reporting Window</h4>
            <p>
              Any claim regarding missing items, garment damage, or dissatisfaction must be reported to our customer support team within <strong>24 hours of delivery</strong>, accompanied by clear photographic evidence and your order confirmation.
            </p>
          </div>
          <div className="space-y-2 pt-2">
            <h4 className="font-bold text-[#002953]">2. Compensation Calculation</h4>
            <p>
              In accordance with Textile Services Association (TSA) guidelines, compensation for lost or damaged garments is calculated based on the item&apos;s fair depreciated market value (taking into account age, condition, and expected lifespan), capped at a maximum of <strong>10 times the cleaning charge</strong> for that specific item, up to an aggregate cap of <strong>£250.00 per order</strong>, unless an extended protection tier has been purchased in advance.
            </p>
          </div>
          <div className="space-y-2 pt-2">
            <h4 className="font-bold text-[#002953]">3. Exclusions from Liability</h4>
            <p>
              Laundelle is not liable for normal wear and tear, color fading from prior sun exposure, defective manufacturer dyes, disintegration of aged adhesive interlinings, damage resulting from hidden defects, or loss of detached embellishments (such as decorative beads, rhinestones, sequins, or delicate mother-of-pearl buttons).
            </p>
          </div>
        </>
      ),
    },
    {
      id: 'governing-law',
      title: 'Governing Law & Jurisdiction',
      content: (
        <>
          <p>
            These Terms, their subject matter, and their formation (and any non-contractual disputes or claims) are governed by and construed in accordance with the <strong>laws of England and Wales</strong>.
          </p>
          <p>
            Both parties irrevocably agree that the courts of England and Wales shall have exclusive jurisdiction to settle any dispute, controversy, or claim arising out of or in connection with these Terms or the provision of our Services.
          </p>
          <p className="pt-2 text-xs text-slate-500">
            Laundelle Garment Care Ltd &bull; Registered Office: 123 Clean Street, London, UK &bull; Company Reg: 14598210 &bull; VAT Reg: GB 412 8890 12
          </p>
        </>
      ),
    },
  ];

  const highlights = [
    {
      title: 'Consumer Rights Act Compliant',
      desc: 'Clear, fair terms under UK consumer protection laws & Textile Services Association standards.',
      icon: <Scale className="w-5 h-5 text-[#01BEFE]" />,
    },
    {
      title: 'Fair Compensation Pledge',
      desc: 'Dedicated digital claim resolution within 24 business hours for damaged or misplaced items.',
      icon: <ShieldCheck className="w-5 h-5 text-[#01BEFE]" />,
    },
    {
      title: 'Secure Stripe Payments',
      desc: '256-bit encrypted card billing; no raw credit or debit card data is ever stored on our servers.',
      icon: <CheckCircle2 className="w-5 h-5 text-[#01BEFE]" />,
    },
  ];

  return (
    <LegalPageLayout
      title="Terms & Conditions"
      badge="Legal Contract"
      lastUpdated="September 2026"
      description="These terms establish the legal operating agreement between you and Laundelle Garment Care Ltd for all doorstep laundry, dry cleaning, pressing, and courier services."
      icon={<FileText className="w-8 h-8" />}
      activePath="/termsandconditions"
      sections={sections}
      keyHighlights={highlights}
    />
  );
}
