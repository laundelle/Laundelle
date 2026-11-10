import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPageLayout } from '../../components/LegalPageLayout';
import { RefreshCw, CheckCircle2, Clock, AlertTriangle, CreditCard, Sparkles, HelpCircle } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Cancellation & Refund Policy | LAUNDELLE',
  description: 'Learn about LAUNDELLE easy cancellation windows, free rescheduling, 100% re-clean satisfaction guarantee, and refund processing procedures.',
  alternates: {
    canonical: '/cancellationandrefund',
  },
};

export default function CancellationAndRefundPage() {
  const sections = [
    {
      id: 'fair-pledge',
      title: 'Our Customer-First Service Pledge',
      content: (
        <>
          <p>
            At <strong>LAUNDELLE</strong>, we believe laundry should simplify your life, not complicate it. We are committed to complete transparency, fairness, and consumer peace of mind.
          </p>
          <p>
            This Cancellation &amp; Refund Policy sets out clear, straightforward rules on how you can cancel or reschedule a booking, our <strong>100% Re-Clean Quality Guarantee</strong>, and the circumstances under which monetary refunds or store credits are issued.
          </p>
        </>
      ),
    },
    {
      id: 'cancellation-windows',
      title: 'Order Cancellation Windows & Fees',
      content: (
        <>
          <p>
            You may cancel any active booking directly through your customer dashboard on the website or by contacting our care team. Applicable cancellation conditions depend on when notice is given:
          </p>
          <div className="space-y-3 pt-2">
            <div className="p-4 bg-emerald-50/70 rounded-2xl border border-emerald-200">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-900 uppercase tracking-wider">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Free Cancellation (More than 2 Hours Notice)</span>
              </div>
              <p className="text-xs text-emerald-950 mt-1 leading-relaxed">
                If you cancel at least <strong>2 hours before</strong> the start of your chosen collection window, there is <strong>zero charge</strong>. Any pre-authorisation hold placed on your card is immediately released in full.
              </p>
            </div>

            <div className="p-4 bg-amber-50/70 rounded-2xl border border-amber-200">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-900 uppercase tracking-wider">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>Late Cancellation (Under 2 Hours Notice)</span>
              </div>
              <p className="text-xs text-amber-950 mt-1 leading-relaxed">
                If you cancel with less than 2 hours notice before your scheduled collection window, a nominal <strong>£4.50 courier dispatch fee</strong> is applied to cover the courier&apos;s allocated transit and fuel logistics. Any remaining balance is released immediately.
              </p>
            </div>

            <div className="p-4 bg-red-50/70 rounded-2xl border border-red-200">
              <div className="flex items-center gap-2 text-xs font-bold text-red-900 uppercase tracking-wider">
                <Clock className="w-4 h-4 text-red-600" />
                <span>Courier Arrived / Missed Handover</span>
              </div>
              <p className="text-xs text-red-950 mt-1 leading-relaxed">
                If our courier arrives at your location during the confirmed slot and cannot gain access or make contact after a mandatory <strong>10-minute waiting and phone contact attempt</strong>, the collection is marked as missed. A <strong>£4.50 re-dispatch fee</strong> applies to reschedule the run.
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
              <h5 className="font-bold text-xs uppercase tracking-wider text-[#002953]">In-Plant Processing Stage</h5>
              <p className="text-xs text-slate-600 mt-1">
                Once garments have arrived at the facility and have commenced the sorting, washing, dry cleaning, or pressing cycles, the order cannot be cancelled as specialized labor and non-recoverable organic detergents have already been engaged.
              </p>
            </div>
          </div>
        </>
      ),
    },
    {
      id: 'rescheduling',
      title: 'Free Rescheduling Policy',
      content: (
        <>
          <p>
            Plans change—we understand. You can easily reschedule your pickup or return delivery window directly from your order dashboard or via WhatsApp support:
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li><strong>Notice:</strong> Rescheduling is completely <strong>free of charge</strong> provided notice is provided at least <strong>2 hours prior</strong> to the scheduled time slot.</li>
            <li><strong>Flexible Windows:</strong> You can select any upcoming available 2-hour window over the subsequent 7 business days.</li>
            <li><strong>Return Delivery Rescheduling:</strong> If you are not going to be home for your clean garment return delivery, please reschedule prior to the courier leaving the plant to avoid a missed delivery re-routing fee.</li>
          </ul>
        </>
      ),
    },
    {
      id: 'quality-reclean',
      title: '100% Quality & Free Re-Clean Guarantee',
      content: (
        <>
          <p>
            We take immense pride in our craftsmanship. If you are not completely satisfied with the cleanliness, pressing, or finish of any garment:
          </p>
          <div className="bg-gradient-to-r from-blue-50 to-cyan-50 p-4 rounded-2xl border border-blue-200 space-y-2">
            <h5 className="font-bold text-[#002953] text-xs flex items-center gap-1.5 uppercase tracking-wider">
              <Sparkles className="w-4 h-4 text-[#01BEFE]" />
              <span>Complimentary 48-Hour Re-Clean</span>
            </h5>
            <p className="text-xs text-slate-700 leading-relaxed">
              Notify us within <strong>24 hours of delivery</strong>, and we will collect the item free of charge and re-process it through our master spotters and pressing technicians at <strong>no cost to you</strong>.
            </p>
          </div>
          <p className="pt-1">
            If following a thorough re-clean the issue remains unresolved due to an inherent service shortcoming (and not a pre-existing fabric defect or unremovable stain logged at intake), we will issue a <strong>full refund</strong> or equivalent account wallet credit for that item.
          </p>
        </>
      ),
    },
    {
      id: 'refund-eligibility',
      title: 'Refund Eligibility & Circumstances',
      content: (
        <>
          <p>Full or partial monetary refunds are promptly granted under the following circumstances:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Verified Garment Loss or Damage:</strong> In the rare instance an item is misplaced or damaged during our custody, compensation is awarded in accordance with TSA valuation guidelines and Section 7 of our Terms.
            </li>
            <li>
              <strong>Overpayment or Scale Discrepancies:</strong> If our digital scales at facility intake determine that your actual laundry weight is lower than your initial estimate, your final bill is reduced automatically and the differential pre-authorisation is released.
            </li>
            <li>
              <strong>Unfulfilled Specialized Services:</strong> If a requested repair, shoe restoration, or delicate treatment cannot be safely performed after expert inspection, that service charge is immediately refunded in full.
            </li>
            <li>
              <strong>Severe Logistics Delays:</strong> If we fail to deliver an urgent Express order within our committed timeframe due to internal fault, the express surcharge is refunded back to standard pricing.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: 'refund-processing',
      title: 'Refund Processing Methods & Timelines',
      content: (
        <>
          <p>
            Once our customer service team approves a refund, it is executed via your original payment channel through Stripe UK:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-2">
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-xs uppercase tracking-wider text-[#002953]">
                <CreditCard className="w-4 h-4 text-[#01BEFE]" />
                <span>Original Card (Stripe)</span>
              </div>
              <p className="text-xs text-slate-600">
                Refunds to Visa, Mastercard, or American Express typically appear on your banking statement within <strong>3 to 5 business days</strong> (some UK banks take up to 7 days).
              </p>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-xs uppercase tracking-wider text-[#002953]">
                <Sparkles className="w-4 h-4 text-[#01BEFE]" />
                <span>Laundelle Wallet Credit (+10% Bonus)</span>
              </div>
              <p className="text-xs text-slate-600">
                Opt for instant digital wallet credit and receive an extra <strong>10% bonus credit</strong> added immediately to your account balance for future bookings.
              </p>
            </div>
          </div>
        </>
      ),
    },
    {
      id: 'claim-procedure',
      title: 'How to Submit a Refund or Service Claim',
      content: (
        <>
          <p>Filing a claim is quick and completely transparent:</p>
          <ol className="list-decimal pl-5 space-y-1.5">
            <li>Open our <Link href="/support" className="text-[#01BEFE] font-bold hover:underline">Customer Support Portal</Link> or email <a href="mailto:care@laundelle.co.uk" className="text-[#01BEFE] font-bold hover:underline">care@laundelle.co.uk</a> within 24 hours of delivery.</li>
            <li>Provide your <strong>Order Number</strong> (e.g. #ORD-10024) and describe the issue in detail.</li>
            <li>Attach clear photos showing the garment, care label, and specific area of concern.</li>
            <li>Our operations manager will review the digital intake inspection logs and issue a formal resolution within <strong>24 business hours</strong>.</li>
          </ol>
        </>
      ),
    },
  ];

  const highlights = [
    {
      title: 'Free Cancellation',
      desc: 'Cancel up to 2 hours prior to scheduled collection window at zero fee or penalty.',
      icon: <CheckCircle2 className="w-5 h-5 text-[#01BEFE]" />,
    },
    {
      title: '100% Re-Clean Guarantee',
      desc: 'Complimentary doorstep collection and re-clean if your garments are not immaculate.',
      icon: <Sparkles className="w-5 h-5 text-[#01BEFE]" />,
    },
    {
      title: 'Fast Stripe Refunds',
      desc: 'Automated 3-5 business day refund turnaround or instant wallet credit with 10% bonus.',
      icon: <CreditCard className="w-5 h-5 text-[#01BEFE]" />,
    },
  ];

  return (
    <LegalPageLayout
      title="Cancellation & Refund"
      badge="Customer Protection"
      lastUpdated="September 2026"
      description="Learn about our customer-friendly cancellation windows, zero-fee rescheduling, 100% re-clean satisfaction guarantee, and refund procedures."
      icon={<RefreshCw className="w-8 h-8" />}
      activePath="/cancellationandrefund"
      sections={sections}
      keyHighlights={highlights}
    />
  );
}
