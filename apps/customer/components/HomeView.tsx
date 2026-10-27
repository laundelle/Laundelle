import React, { useState, useEffect } from 'react';
import {
  Leaf,
  Truck,
  ShieldCheck,
  ArrowRight,
  Users,
  Clock,
  UserCheck,
  ShoppingBag,
  MapPin,
  Smile,
  Star,
  Copy,
  Check,
  CheckCircle2,
  XCircle,
  X,
  Search,
  Sparkles,
  Loader2,
  Calendar,
  Send,
  AlertCircle,
  Tag
} from 'lucide-react';
import { ActiveTab, ServiceItem } from '@laundelle/types';
import dynamic from 'next/dynamic';

const BeforeAfterSlider = dynamic(
  () => import('./BeforeAfterSlider').then((mod) => mod.BeforeAfterSlider),
  { ssr: true }
);
const AppDownloadBanner = dynamic(
  () => import('./AppDownloadBanner').then((mod) => mod.AppDownloadBanner),
  { ssr: true }
);
import { checkPostcodeCoverage, joinWaitingList, dbFetchActiveDistricts } from '@laundelle/api-client';
import { ScrollReveal } from '@laundelle/ui';
import Image from 'next/image';
import { LAUNDELLE_IMAGES, LAUNDELLE_SERVICE_IMAGES, getOptimizedImageUrl } from '@laundelle/config';

interface HomeViewProps {
  onNavigate: (tab: ActiveTab) => void;
  onSelectService: (service: ServiceItem) => void;
  onOpenSchedulePickup: () => void;
  onBookService?: (serviceName: string) => void;
  services: ServiceItem[];
}

export const HomeView: React.FC<HomeViewProps> = ({
  onNavigate,
  onSelectService,
  onOpenSchedulePickup,
  onBookService,
  services,
}) => {
  const [copiedCoupon, setCopiedCoupon] = useState(false);

  // FAQ Accordion State
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const handleCopyCoupon = () => {
    navigator.clipboard.writeText('WELCOME20');
    setCopiedCoupon(true);
    setTimeout(() => setCopiedCoupon(false), 2500);
  };

  // Postcode Checker State
  const [postcodeQuery, setPostcodeQuery] = useState('');
  const [postcodeStatus, setPostcodeStatus] = useState<'idle' | 'checking' | 'available' | 'unavailable'>('idle');
  const [postcodeResult, setPostcodeResult] = useState<{
    location: string | null;
    city?: string | null;
    district?: string | null;
    services?: any[];
  } | null>(null);
  const [resultModalOpen, setResultModalOpen] = useState(false);
  const [waitlistEmail, setWaitlistEmail] = useState('');
  const [waitlistSubmitted, setWaitlistSubmitted] = useState(false);
  const [waitlistSubmitting, setWaitlistSubmitting] = useState(false);
  const [activeDistricts, setActiveDistricts] = useState<string[]>([]);

  useEffect(() => {
    dbFetchActiveDistricts().then(districts => {
      if (Array.isArray(districts) && districts.length > 0) {
        setActiveDistricts(districts);
      }
    });
  }, []);

  const handleCheckPostcode = async (codeToCheck?: string) => {
    const code = (codeToCheck !== undefined ? codeToCheck : postcodeQuery).trim();
    if (!code) return;
    if (codeToCheck !== undefined) setPostcodeQuery(codeToCheck);
    setPostcodeStatus('checking');
    setWaitlistSubmitted(false);
    try {
      const res = await checkPostcodeCoverage(code);
      setPostcodeResult(res);
      setPostcodeStatus(res.isServiceable ? 'available' : 'unavailable');
      setResultModalOpen(true);
    } catch {
      setPostcodeStatus('unavailable');
      setResultModalOpen(true);
    }
  };

  const handleJoinWaitlist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!waitlistEmail.trim() || !postcodeQuery.trim()) return;
    setWaitlistSubmitting(true);
    try {
      await joinWaitingList({
        full_name: 'Resident',
        email: waitlistEmail.trim(),
        postcode: postcodeQuery.trim(),
        launch_notification_consent: true,
      });
      setWaitlistSubmitted(true);
    } catch {
      setWaitlistSubmitted(true);
    } finally {
      setWaitlistSubmitting(false);
    }
  };

  const faqs = [
    {
      q: 'How does Laundelle doorstep collection & delivery work?',
      a: 'Simply choose your preferred date and 2-hour time slot online. Our uniformed driver arrives with sealed bags at your doorstep, collects your items, and delivers them back fresh, fragrant, and neatly folded or hung within 24 to 48 hours.',
    },
    {
      q: 'Are my clothes washed separately from other customers?',
      a: 'Absolutely 100%! We strictly follow an Individual Batch Washing protocol. Your clothes are tagged with barcoded QR IDs and washed exclusively in dedicated sanitized commercial drums. We NEVER mix garments from different households.',
    },
    {
      q: 'What detergents and cleaning solvents do you use?',
      a: 'We use premium dermatologically-tested, hypoallergenic organic enzyme detergents and gentle hydrocarbon dry cleaning solvents. They are 100% free of harsh chlorine, zero chemical fumes, and safe for babies and sensitive skin.',
    },
    {
      q: 'What is your turnaround time for express deliveries?',
      a: 'Our standard turnaround is 24 to 48 hours. If you need your clothes urgently, we offer Same-Day / 12-Hour Express Service for orders scheduled before 10:00 AM.',
    },
    {
      q: 'Is there a minimum order amount for free doorstep collection?',
      a: 'Doorstep collection & delivery is 100% FREE for all orders above £20.00! For smaller orders below £20.00, a nominal door-convenience charge of £3.50 applies.',
    },
  ];

  return (
    <div className="w-full overflow-hidden">
      {/* =========================================
          HERO SECTION - LAUNDELLE BESPOKE HERO
      ========================================= */}
      <section className="relative isolate min-h-[660px] md:min-h-[700px] lg:min-h-[740px] overflow-hidden bg-[radial-gradient(circle_at_47%_48%,#fff_0,#f9fbff_38%,#eef2f8_100%)]">
        {/* Hero Text */}
        <div className="relative z-[5] w-full md:w-[60%] lg:w-[58%] px-0 pb-16 sm:pb-20 lg:pb-24 pl-6 sm:pl-10 lg:pl-[60px] pt-6 sm:pt-9 lg:pt-11 max-md:w-full max-md:px-[25px]">
          {/* Badge */}
          <div className="inline-flex items-center gap-2.5 rounded-[24px] bg-[#e9f1ff] px-[16px] py-[7px] text-[12px] sm:text-[13px] lg:text-[14px] font-medium tracking-[0.3px] text-[#0751c7] shadow-2xs">
            <span className="text-[16px] sm:text-[18px] leading-none">✧</span>
            <span>PREMIUM LAUNDRY &amp; GARMENT CARE</span>
          </div>

          {/* Heading */}
          <h1 className="mt-[16px] sm:mt-[18px] max-w-[650px] font-serif text-[42px] sm:text-[54px] md:text-[60px] lg:text-[68px] xl:text-[74px] font-bold leading-[1.04] tracking-[-1.5px] sm:tracking-[-2.5px] text-navy">
            Laundry,<br />
            <span className="text-[#3778df]">beautifully</span><br />
            taken care of.
          </h1>

          {/* Decorative Line */}
          <div className="my-[18px] sm:my-[22px] mt-[20px] sm:mt-[24px] h-[3px] w-[72px] bg-[linear-gradient(90deg,#1d5fd0_0_68%,#9cbdf4_68%)] rounded-full"></div>

          {/* Description */}
          <p className="max-w-[580px] text-[15px] sm:text-[17px] lg:text-[19px] leading-[1.55] text-[#465469]">
            Professional laundry, dry cleaning, and garment care—
            picked up from your doorstep and returned fresh.
          </p>

          {/* Unified Action Buttons & Feature Strip Component */}
          <div className="mt-[20px] sm:mt-[30px] max-w-[620px] w-full space-y-3 sm:space-y-4">
            {/* 1st Row: Always 2 Columns (Side-by-Side on PC & Mobile) */}
            <div className="grid grid-cols-2 gap-2.5 sm:gap-4">
              {/* Column 1: Schedule a Pickup */}
              <button
                onClick={onOpenSchedulePickup}
                className="group flex h-[46px] xs:h-[52px] sm:h-[64px] lg:h-[68px] w-full items-center justify-center gap-1.5 sm:gap-[12px] rounded-[6px] sm:rounded-[7px] bg-[#0b3489] px-2 sm:px-[22px] text-[12px] xs:text-[13px] sm:text-[17px] font-semibold text-white shadow-[0_6px_18px_rgba(11,52,137,0.13)] transition hover:bg-[#082b78] cursor-pointer hover:-translate-y-0.5 active:translate-y-0"
              >
                <Truck className="w-3.5 h-3.5 xs:w-4 xs:h-4 sm:w-[22px] sm:h-[22px] text-white shrink-0 group-hover:scale-105 transition-transform" />
                <span className="truncate">Schedule a Pickup</span>
              </button>

              {/* Column 2: Explore Services */}
              <button
                onClick={() => onNavigate('services')}
                className="group flex h-[46px] xs:h-[52px] sm:h-[64px] lg:h-[68px] w-full items-center justify-center gap-1.5 sm:gap-[12px] rounded-[6px] sm:rounded-[7px] border-[1.5px] border-[#2d65c9] bg-white px-2 sm:px-[22px] text-[12px] xs:text-[13px] sm:text-[17px] font-semibold text-[#092e7c] transition hover:bg-[#f5f8ff] cursor-pointer hover:-translate-y-0.5 active:translate-y-0"
              >
                <span className="truncate">Explore Services</span>
                <ArrowRight className="w-3.5 h-3.5 xs:w-4 xs:h-4 sm:w-5 sm:h-5 text-[#092e7c] shrink-0 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>

            {/* 2nd Row: Always 4 Columns (Side-by-Side on PC & Mobile) */}
            <div className="w-full rounded-[10px] sm:rounded-[12px] bg-white/95 backdrop-blur-md px-1.5 xs:px-2.5 sm:px-5 lg:px-6 py-2 sm:py-3.5 shadow-[0_10px_35px_rgba(26,48,88,0.11)] border border-gray-100/90 grid grid-cols-4 items-center">
              {/* Premium Quality Care */}
              <div className="flex flex-col sm:flex-row items-center text-center sm:text-left gap-1 sm:gap-3 border-r border-[#d7dce4] px-1 sm:px-3">
                <ShieldCheck className="w-4 h-4 xs:w-5 xs:h-5 sm:w-[28px] sm:h-[28px] text-[#0954c7] shrink-0" strokeWidth={2.2} />
                <span className="text-[8px] xs:text-[9.5px] sm:text-[13px] lg:text-[14px] leading-[1.1] sm:leading-[1.25] font-medium text-navy">
                  Premium<br className="hidden sm:inline" /> Quality Care
                </span>
              </div>

              {/* On-Time Delivery */}
              <div className="flex flex-col sm:flex-row items-center text-center sm:text-left gap-1 sm:gap-3 border-r border-[#d7dce4] px-1 sm:px-3">
                <Clock className="w-4 h-4 xs:w-5 xs:h-5 sm:w-[26px] sm:h-[26px] text-[#0954c7] shrink-0" strokeWidth={2.2} />
                <span className="text-[8px] xs:text-[9.5px] sm:text-[13px] lg:text-[14px] leading-[1.1] sm:leading-[1.25] font-medium text-navy">
                  On-Time<br className="hidden sm:inline" /> Delivery
                </span>
              </div>

              {/* Free Pickup */}
              <div className="flex flex-col sm:flex-row items-center text-center sm:text-left gap-1 sm:gap-3 border-r border-[#d7dce4] px-1 sm:px-3">
                <Truck className="w-4 h-4 xs:w-5 xs:h-5 sm:w-[28px] sm:h-[28px] text-[#0954c7] shrink-0" strokeWidth={2.2} />
                <span className="text-[8px] xs:text-[9.5px] sm:text-[13px] lg:text-[14px] leading-[1.1] sm:leading-[1.25] font-medium text-navy">
                  Free<br className="hidden sm:inline" /> Pickup
                </span>
              </div>

              {/* Eco-Friendly Process */}
              <div className="flex flex-col sm:flex-row items-center text-center sm:text-left gap-1 sm:gap-3 px-1 sm:px-3">
                <Leaf className="w-4 h-4 xs:w-5 xs:h-5 sm:w-[26px] sm:h-[26px] text-[#0954c7] shrink-0" strokeWidth={2.2} />
                <span className="text-[8px] xs:text-[9.5px] sm:text-[13px] lg:text-[14px] leading-[1.1] sm:leading-[1.25] font-medium text-navy">
                  Eco-Friendly<br className="hidden sm:inline" /> Process
                </span>
              </div>
            </div>

            {/* Mobile Hero Image Showcase (Visible only on mobile/tablet screens) */}
            <div className="block md:hidden mt-4 w-full rounded-2xl overflow-hidden shadow-md border border-gray-100 relative h-[210px] xs:h-[250px] sm:h-[300px]">
              <Image
                src={getOptimizedImageUrl(LAUNDELLE_IMAGES.heroRight, { width: 750, quality: 'auto', format: 'auto' })}
                alt={LAUNDELLE_IMAGES.heroRight.alt}
                fill
                priority
                unoptimized
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover object-top"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Desktop Hero Image (Visible on md and larger screens) with Left 10% Opacity Fade Effect */}
        <div
          className="hidden md:block absolute right-0 top-0 z-[2] h-full w-[58%] lg:w-[61%] overflow-hidden pointer-events-none"
          style={{
            maskImage: 'linear-gradient(to right, rgba(0,0,0,0) 0%, rgba(0,0,0,0.18) 10%, rgba(0,0,0,0.85) 25%, rgba(0,0,0,1) 40%)',
            WebkitMaskImage: 'linear-gradient(to right, rgba(0,0,0,0) 0%, rgba(0,0,0,0.18) 10%, rgba(0,0,0,0.85) 25%, rgba(0,0,0,1) 40%)',
          }}
        >
          <Image
            src={getOptimizedImageUrl(LAUNDELLE_IMAGES.heroRight, { width: 1200, quality: 'auto', format: 'auto' })}
            alt={LAUNDELLE_IMAGES.heroRight.alt}
            fill
            priority
            unoptimized
            sizes="(max-width: 1024px) 58vw, 61vw"
            className="object-cover object-center pointer-events-none"
          />
          {/* Linear fade overlay reinforcing lower opacity on left 10% */}
          <div className="absolute inset-0 bg-gradient-to-r from-[#f9fbff] via-[#f9fbff]/60 via-10% to-transparent pointer-events-none" />
        </div>

        {/* Bottom Waves */}
        <div className="pointer-events-none absolute -bottom-[1px] left-[-5%] z-[8] h-[115px] w-[110%]">
          <div className="absolute -bottom-[55px] left-0 h-[105px] w-full rotate-[-1deg] rounded-[50%_50%_0_0] bg-[#d9e8ff]"></div>
          <div className="absolute -bottom-[72px] left-0 h-[105px] w-full rotate-[2deg] rounded-[50%_50%_0_0] bg-[#9fc2f6] opacity-90"></div>
        </div>
      </section>

      {/* =========================================================================
          POSTCODE AVAILABILITY CHECKER SECTION (RESPONSIVE IMAGE & NESTED BUTTON)
      ========================================================================= */}
      <ScrollReveal yOffset={32} className="w-full">
        <section className="relative w-full min-h-screen md:h-screen flex flex-col justify-center items-center bg-gradient-to-r from-[#eef5ff] via-[#f7faff] to-[#e4f0ff] py-12 sm:py-16 overflow-hidden">
          {/* Subtle ambient light shapes */}
          <div className="absolute -top-32 -left-32 w-96 h-96 bg-blue-200/40 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-blue-300/30 rounded-full blur-3xl pointer-events-none" />

          {/* Desktop & Tablet Background Image (Covers whole section on big screens, hidden on mobile) */}
          <div className="hidden md:block absolute inset-0 z-0 pointer-events-none select-none">
            <Image
              src="/Postcode-Checker-Image.png"
              alt="Postcode Checker Background"
              fill
              priority
              sizes="100vw"
              className="object-cover object-center w-full h-full"
            />
          </div>

          <div className="relative z-10 w-full px-4 sm:px-8 md:px-12 lg:px-16 max-w-7xl mx-auto my-auto">
            <div className="flex flex-col md:flex-row items-center justify-between gap-8 lg:gap-12 xl:gap-16">
              {/* Left Column: Heading, Subtitle, Mobile Image, Input Bar, Chips */}
              <div className="w-full md:w-7/12 lg:w-3/5 text-center md:text-left flex flex-col items-center md:items-start">
                {/* Blue Accent Pill */}
                <div className="w-14 h-2 bg-[#0066f5] rounded-full mb-4 sm:mb-5" />

                {/* Headline */}
                <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-[54px] font-black text-[#0a192f] tracking-tight leading-[1.15]">
                  Check Postcode & <br /><span className="text-[#0066f5]">Service Availability</span>
                </h2>

                {/* Subtitle */}
                <p className="text-sm sm:text-base md:text-lg text-gray-500 font-medium max-w-xl leading-relaxed mt-3 sm:mt-4">
                  Check if Laundelle delivers to your doorstep and explore all available laundry and dry cleaning services in your neighborhood.
                </p>

                {/* Mobile Phone Only: 3D Delivery Driver Illustration ABOVE the Input Box */}
                <div className="block md:hidden my-6 w-full max-w-[320px] sm:max-w-[380px] mx-auto">
                  <Image
                    src={getOptimizedImageUrl(LAUNDELLE_IMAGES.postcodeDriver)}
                    alt={LAUNDELLE_IMAGES.postcodeDriver.alt}
                    width={380}
                    height={380}
                    loading="lazy"
                    className="w-full h-auto object-contain select-none pointer-events-none drop-shadow-md"
                  />
                </div>

                {/* Search Input Bar (White Rounded-Full Pill) with Check Button INSIDE on the Right Side */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleCheckPostcode();
                  }}
                  className="mt-4 sm:mt-6 md:mt-8 w-full max-w-xl"
                >
                  <div className="flex flex-row items-center p-1.5 sm:p-2 bg-white rounded-full border border-gray-200/90 shadow-[0_12px_35px_rgba(0,0,0,0.07)] w-full transition-all focus-within:ring-2 focus-within:ring-[#0066f5]/30 focus-within:border-[#0066f5]">
                    <MapPin className="w-5 h-5 sm:w-6 sm:h-6 text-gray-400 shrink-0 ml-2.5 sm:ml-4 stroke-[1.8]" />
                    <input
                      type="text"
                      value={postcodeQuery}
                      onChange={(e) => {
                        setPostcodeQuery(e.target.value.toUpperCase());
                        if (postcodeStatus !== 'idle') setPostcodeStatus('idle');
                      }}
                      placeholder="ENTER YOUR POSTCODE"
                      className="flex-1 min-w-0 px-2.5 sm:px-3.5 h-11 sm:h-13 bg-transparent text-xs sm:text-sm md:text-base font-bold text-[#0a192f] placeholder:text-gray-400 placeholder:font-semibold tracking-wider uppercase focus:outline-none"
                    />

                    {/* Button nested INSIDE the input box on the right side */}
                    <button
                      type="submit"
                      disabled={postcodeStatus === 'checking' || !postcodeQuery.trim()}
                      className="shrink-0 h-10 sm:h-12 md:h-13 px-3.5 sm:px-6 md:px-8 bg-[#0066f5] hover:bg-[#0052cc] text-white font-bold text-xs sm:text-sm md:text-base rounded-full shadow-md hover:shadow-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 sm:gap-2 active:scale-98 disabled:opacity-60"
                    >
                      {postcodeStatus === 'checking' ? (
                        <>
                          <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                          <span className="hidden xs:inline">Checking...</span>
                        </>
                      ) : (
                        <>
                          <Search className="w-4 h-4 sm:w-5 sm:h-5 stroke-[2.5]" />
                          <span className="hidden xs:inline sm:inline">Check Availability</span>
                          <span className="xs:hidden">Check</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>

                {/* Dynamically Loaded Supported Areas */}
                {activeDistricts.length > 0 && (
                  <div className="mt-5 sm:mt-6 flex items-center gap-2 flex-wrap text-xs sm:text-sm justify-center md:justify-start">
                    <span className="font-semibold text-gray-500">Active Coverage Areas:</span>
                    {activeDistricts.slice(0, 6).map((district) => (
                      <button
                        key={district}
                        type="button"
                        onClick={() => handleCheckPostcode(district)}
                        className="px-3.5 sm:px-4 py-1.5 rounded-full bg-[#eaf2ff] hover:bg-[#d8e7ff] text-[#0066f5] font-bold text-xs sm:text-sm transition-colors cursor-pointer active:scale-95"
                      >
                        {district}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Right Column Spacer: Reserves visual balance on big screens so the background driver illustration is clear */}
              <div className="hidden md:flex md:w-5/12 lg:w-2/5 justify-center items-center pl-2 lg:pl-6 pointer-events-none" />
            </div>
          </div>
        </section>
      </ScrollReveal>

      {/* =========================================================================
          POSTCODE CHECK AVAILABILITY RESULTS MODAL
      ========================================================================= */}
      {resultModalOpen && (
        <div
          className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in-50 duration-200"
          onClick={() => setResultModalOpen(false)}
        >
          <div
            className="relative w-full max-w-2xl max-h-[85vh] sm:max-h-[90vh] overflow-y-auto bg-white rounded-3xl shadow-2xl border border-gray-100 p-6 sm:p-8 my-auto animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setResultModalOpen(false)}
              className="absolute top-5 right-5 w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-navy flex items-center justify-center transition-colors cursor-pointer z-10"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>

            {postcodeStatus === 'available' ? (
              /* AVAILABLE RESULT MODAL CONTENT */
              <div className="space-y-6 text-left">
                <div className="flex items-start gap-4 pr-8">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-md">
                    <CheckCircle2 className="w-8 h-8 stroke-[2.5]" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-md bg-emerald-600 text-white text-[11px] font-extrabold uppercase tracking-wider">
                        Available in your area
                      </span>
                      <span className="text-xs text-emerald-800 font-bold">
                        {postcodeResult?.location || postcodeQuery}
                      </span>
                    </div>
                    <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mt-1">
                      Great news! We service <span className="font-mono text-emerald-700">{postcodeQuery}</span>
                    </h3>
                    <p className="text-xs sm:text-sm text-gray-500 mt-1">
                      Doorstep collection & delivery is active in your area with guaranteed 24 to 48 hours turnaround.
                    </p>
                  </div>
                </div>

                {/* Services Grid */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-t border-gray-100 pt-4">
                    <h4 className="text-xs sm:text-sm font-extrabold text-[#03045E] uppercase tracking-wider flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-[#0077B6]" />
                      <span>Services Available for {postcodeQuery}</span>
                    </h4>
                    <button
                      type="button"
                      onClick={() => {
                        setResultModalOpen(false);
                        onNavigate('services');
                      }}
                      className="text-xs font-bold text-[#0077B6] hover:underline"
                    >
                      View full price list →
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-64 overflow-y-auto pr-1">
                    {(postcodeResult?.services && postcodeResult.services.length > 0
                      ? postcodeResult.services
                      : services
                    ).slice(0, 6).map((svc: any) => (
                      <div
                        key={svc.id}
                        onClick={() => {
                          const fullService = services.find((s) => s.id === svc.id) || svc;
                          setResultModalOpen(false);
                          onSelectService(fullService);
                        }}
                        className="group bg-white rounded-2xl p-3 border border-gray-100 hover:border-blue-200 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
                      >
                        <div className="space-y-1.5">
                          <div className="w-full h-20 rounded-xl bg-blue-50/50 overflow-hidden relative">
                            <Image
                              src={
                                svc.image && svc.image.startsWith('http')
                                  ? svc.image
                                  : getOptimizedImageUrl(
                                    LAUNDELLE_SERVICE_IMAGES[svc.name] || LAUNDELLE_SERVICE_IMAGES['Wash + Dry + Fold']
                                  )
                              }
                              alt={svc.name}
                              fill
                              sizes="160px"
                              loading="lazy"
                              className="object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          </div>
                          <div>
                            <h5 className="text-xs font-bold text-[#03045E] line-clamp-1 group-hover:text-[#0077B6] transition-colors">
                              {svc.name}
                            </h5>
                            <p className="text-[11px] font-bold text-[#0077B6] mt-0.5">
                              from £{(svc.price || svc.basePrice || 0).toFixed(2)}
                            </p>
                          </div>
                        </div>
                        <div className="mt-2 pt-1.5 border-t border-gray-50 flex items-center justify-between text-[10px] font-semibold text-gray-500 group-hover:text-[#03045E]">
                          <span>Select</span>
                          <ArrowRight className="w-3 h-3 text-[#0077B6]" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Modal Footer Actions */}
                <div className="pt-3 flex items-center justify-end gap-3 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setResultModalOpen(false)}
                    className="px-5 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 transition-all cursor-pointer"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setResultModalOpen(false);
                      onOpenSchedulePickup();
                    }}
                    className="px-6 py-3 bg-[#0066f5] hover:bg-[#0052cc] text-white font-bold text-xs sm:text-sm rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer active:scale-98"
                  >
                    <Calendar className="w-4 h-4" />
                    <span>Book Collection Now</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              /* UNAVAILABLE RESULT MODAL CONTENT */
              <div className="space-y-6 text-center pt-2">
                <div className="w-16 h-16 rounded-2xl bg-amber-500 text-white flex items-center justify-center mx-auto shadow-md">
                  <XCircle className="w-9 h-9 stroke-[2.5]" />
                </div>

                <div className="space-y-1.5">
                  <div className="inline-block px-3 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-extrabold uppercase tracking-wider">
                    Not Yet Available
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold text-gray-900">
                    We don't service <span className="font-mono text-amber-700">{postcodeQuery}</span> yet
                  </h3>
                  <p className="text-xs sm:text-sm text-gray-600 max-w-md mx-auto leading-relaxed">
                    We're expanding rapidly across the UK! Join our priority waiting list and get an exclusive <span className="font-bold text-amber-900">£10 voucher</span> when we launch in your area.
                  </p>
                </div>

                {waitlistSubmitted ? (
                  <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm font-bold flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <span>You're on the list! We'll email you the moment your postcode goes live.</span>
                  </div>
                ) : (
                  <form onSubmit={handleJoinWaitlist} className="flex flex-col sm:flex-row gap-2.5 max-w-md mx-auto">
                    <input
                      type="email"
                      required
                      value={waitlistEmail}
                      onChange={(e) => setWaitlistEmail(e.target.value)}
                      placeholder="Enter your email address"
                      className="h-12 px-4 rounded-xl border border-amber-300 bg-white text-xs sm:text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500 flex-1"
                    />
                    <button
                      type="submit"
                      disabled={waitlistSubmitting}
                      className="h-12 px-6 bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm font-bold rounded-xl shadow-md transition-all cursor-pointer flex items-center justify-center gap-2 shrink-0 active:scale-98 disabled:opacity-50"
                    >
                      {waitlistSubmitting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          <span>Notify Me</span>
                        </>
                      )}
                    </button>
                  </form>
                )}

                <div className="pt-2 border-t border-gray-100 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setResultModalOpen(false)}
                    className="px-6 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {/* =========================================
          OUR POPULAR SERVICES SECTION
      ========================================= */}
      <ScrollReveal yOffset={28} className="w-full">
        <section className="relative w-full bg-white py-12 sm:py-16">
          {/* Content Wrapper */}
          <div className="relative z-10 w-full px-6 sm:px-12 md:px-20 lg:px-28">
            <div className="text-center space-y-2 mb-8 sm:mb-10">
              <span className="text-xs font-bold uppercase tracking-widest text-[#0077B6] block">
                Tailored with care for every fabric
              </span>
              <h2 className="text-3xl sm:text-4xl font-heading font-extrabold text-[#03045E]">
                Our Popular Laundry & Care Services
              </h2>
            </div>
          </div>

          <div className="flex md:grid md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8 overflow-x-auto md:overflow-x-visible scrollbar-none pb-4 pt-1 px-6 sm:px-12 md:px-20 lg:px-28">
            {services.slice(0, 6).map((service, idx) => (
              <ScrollReveal
                key={service.id}
                yOffset={24}
                delay={(idx % 3) * 0.05}
                className="w-[280px] sm:w-[320px] md:w-auto shrink-0 mx-1 md:mx-0 h-full"
              >
                <article
                  className="w-full group bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col hover:-translate-y-1.5 border border-gray-100/80 h-full justify-between"
                >
                  <div className="h-48 sm:h-52 lg:h-44 xl:h-48 overflow-hidden relative shrink-0">
                    <Image
                      src={service.image}
                      alt={service.name}
                      fill
                      loading="lazy"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                      className="object-cover group-hover:scale-108 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent opacity-70" />
                    {service.popular && (
                      <span className="absolute top-3 left-3 bg-[#03045E] text-[#CAF0F8] text-[10px] font-extrabold px-3 py-0.5 rounded-full uppercase tracking-wider shadow-md">
                        Popular
                      </span>
                    )}
                    <span className="absolute bottom-3 left-3 text-[10px] font-bold text-white bg-black/50 backdrop-blur-xs px-2.5 py-1 rounded-lg">
                      {service.categoryLabel}
                    </span>
                    <span className="absolute bottom-3 right-3 text-[10px] font-semibold text-white/90 bg-black/40 backdrop-blur-xs px-2 py-0.5 rounded-md">
                      {service.turnaround}
                    </span>
                  </div>

                  <div className="px-6 py-5 sm:px-8 sm:py-6 lg:px-6 lg:py-5 flex-1 flex flex-col justify-between text-left space-y-4">
                    <div>
                      <h3 className="text-sm sm:text-base font-extrabold text-gray-900 line-clamp-1 group-hover:text-[#03045E] transition-colors">
                        {service.name}
                      </h3>
                      <p className="text-xs text-gray-500 mt-1.5 line-clamp-2 min-h-[34px] leading-relaxed">
                        {service.description}
                      </p>
                    </div>

                    <div className="pt-3 flex items-center justify-between border-t border-gray-100">
                      <div>
                        <span className="text-sm sm:text-base font-extrabold text-[#03045E]">£{service.price.toFixed(2)}</span>
                        <span className="text-xs text-gray-400 font-normal ml-0.5">/{service.unit.replace('per ', '')}</span>
                      </div>
                      <button
                        onClick={() => onSelectService(service)}
                        className="inline-flex items-center gap-1.5 bg-[#CAF0F8] hover:bg-[#03045E] text-[#03045E] hover:text-white px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs hover:shadow-sm active:scale-95"
                      >
                        <span>Book</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </article>
              </ScrollReveal>
            ))}
          </div>

          <div className="text-center mt-8 sm:mt-10">
            <button
              onClick={() => onNavigate('services')}
              className="inline-flex items-center gap-2 bg-[#03045E] hover:bg-[#023E8A] text-white px-7 py-3.5 rounded-2xl text-xs sm:text-sm font-bold transition-all shadow-md cursor-pointer hover:shadow-lg"
            >
              <span>View All Laundry & Dry Clean Categories</span>
              <ArrowRight className="w-4 h-4 text-[#48CAE4]" />
            </button>
          </div>
        </section>
      </ScrollReveal>

      <ScrollReveal yOffset={28} className="w-full">
        <BeforeAfterSlider
          onBookPickup={onOpenSchedulePickup}
          onBookService={onBookService}
        />
      </ScrollReveal>

      {/* Full-Width White Promotional Hero Section */}
      <ScrollReveal yOffset={28} className="w-full">
        <section className="w-full bg-white text-gray-900 flex items-center justify-center relative overflow-hidden py-12 sm:py-16">
          {/* Subtle decorative background ambient glows for white theme */}
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-50/40 rounded-full blur-3xl pointer-events-none -z-0" />
          <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-sky-50/30 rounded-full blur-3xl pointer-events-none -z-0" />

          <div className="w-full max-w-7xl mx-auto px-6 sm:px-10 md:px-14 lg:px-16 relative z-10 py-4">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">

              {/* Left Content Column */}
              <div className="lg:col-span-7 space-y-6 sm:space-y-8 text-center lg:text-left">

                {/* Limited Time Offer Pill */}
                <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-blue-50/90 border border-blue-200/80 text-[#0077B6] shadow-xs">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#0077B6] opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#0077B6]" />
                  </span>
                  <Tag className="w-3.5 h-3.5 text-[#0077B6]" />
                  <span className="text-xs sm:text-sm font-extrabold uppercase tracking-widest text-[#03045E]">
                    LIMITED TIME OFFER
                  </span>
                </div>

                {/* Main Headline */}
                <div className="space-y-3">
                  <h2 className="text-4xl sm:text-5xl md:text-6xl xl:text-7xl font-heading font-black text-[#03045E] tracking-tight leading-[1.08]">
                    Flat{' '}
                    <span className="bg-gradient-to-r from-[#0077B6] via-[#0096C7] to-[#00B4D8] bg-clip-text text-transparent underline decoration-[#90E0EF]/60 decoration-wavy decoration-2 underline-offset-8">
                      20% OFF
                    </span>{' '}
                    Your First Laundry Order
                  </h2>
                  <p className="text-base sm:text-lg md:text-xl text-gray-600 leading-relaxed font-normal max-w-2xl mx-auto lg:mx-0">
                    Use promo code below at checkout. Includes free doorstep pickup and premium organic wash.
                  </p>
                </div>

                {/* Promo Code Box (Voucher Ticket Style) */}
                <div className="max-w-xl mx-auto lg:mx-0">
                  <div className="p-4 sm:p-5 rounded-2xl bg-[#F8FAFC] border-2 border-dashed border-[#0096C7]/40 hover:border-[#0077B6] transition-all">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                      <div className="flex items-center gap-3 text-left w-full sm:w-auto">
                        <div className="w-11 h-11 rounded-xl bg-[#03045E] text-white flex items-center justify-center shrink-0 shadow-md">
                          <Sparkles className="w-5 h-5 text-[#48CAE4]" />
                        </div>
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 block">
                            Checkout Promo Code
                          </span>
                          <span className="text-2xl sm:text-3xl font-mono font-black text-[#03045E] tracking-widest">
                            WELCOME20
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={handleCopyCoupon}
                        className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer shadow-sm active:scale-95 ${copiedCoupon
                          ? 'bg-emerald-600 text-white'
                          : 'bg-[#03045E] hover:bg-[#0077B6] text-white'
                          }`}
                      >
                        {copiedCoupon ? (
                          <>
                            <Check className="w-4 h-4 text-white" />
                            <span>Copied to Clipboard!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" />
                            <span>Copy Promo Code</span>
                          </>
                        )}
                      </button>
                    </div>

                    {copiedCoupon && (
                      <div className="mt-3 pt-3 border-t border-gray-200/60 flex items-center justify-center sm:justify-start gap-2 text-xs font-semibold text-emerald-700">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Coupon code copied! Paste at checkout to get 20% off.</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Call to Action Button */}
                <div className="pt-2 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
                  <button
                    onClick={onOpenSchedulePickup}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-3 bg-[#03045E] hover:bg-[#023E8A] text-white px-9 py-4 rounded-2xl text-sm sm:text-base font-extrabold shadow-xl shadow-[#03045E]/25 hover:shadow-2xl hover:scale-[1.02] active:scale-98 transition-all cursor-pointer group"
                  >
                    <span>Claim 20% Discount Now</span>
                    <ArrowRight className="w-4 h-4 text-[#48CAE4] group-hover:translate-x-1 transition-transform" />
                  </button>
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium">
                    <Clock className="w-3.5 h-3.5 text-gray-400" />
                    <span>Book in 60s • Pickup as early as today</span>
                  </div>
                </div>

              </div>

              {/* Right Visual Column (Luxury Showcase on White) */}
              <div className="lg:col-span-5 relative flex items-center justify-center">

                {/* Decorative clean circular accent ring */}
                <div className="absolute w-[320px] sm:w-[420px] lg:w-[460px] h-[320px] sm:h-[420px] lg:h-[460px] rounded-full border border-gray-200/80 -z-0 pointer-events-none" />
                <div className="absolute w-[360px] sm:w-[470px] lg:w-[510px] h-[360px] sm:h-[470px] lg:h-[510px] rounded-full border border-dashed border-[#0096C7]/20 -z-0 pointer-events-none" />

                {/* Main Image Card */}
                <div className="relative z-10 w-full max-w-[420px] rounded-3xl overflow-hidden shadow-2xl border-4 border-white ring-1 ring-gray-100 bg-white group">
                  <div className="w-full h-[360px] sm:h-[440px] relative overflow-hidden">
                    <Image
                      src="https://images.unsplash.com/photo-1545173168-9f1947eebb7f?auto=format&fit=crop&w=1000&q=80"
                      alt="Freshly Laundered Luxury Garments"
                      fill
                      loading="lazy"
                      sizes="(max-width: 768px) 100vw, 420px"
                      className="object-cover group-hover:scale-105 transition-transform duration-700"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />

                    {/* Subtle bottom tag in image */}
                    <div className="absolute bottom-4 left-4 right-4 text-white">
                      <span className="text-[10px] font-extrabold uppercase tracking-widest bg-white/20 backdrop-blur-md px-3 py-1 rounded-full border border-white/30">
                        Signature Care
                      </span>
                      <p className="text-xs font-semibold text-white/95 mt-1.5 drop-shadow-sm">
                        Crisp, odor-free, wrinkle-free garments ready to wear
                      </p>
                    </div>
                  </div>
                </div>

                {/* Floating Discount Badge */}
                <div className="absolute -top-4 -left-2 sm:-top-6 sm:-left-6 z-20 w-24 h-24 sm:w-28 sm:h-28 rounded-3xl bg-[#03045E] text-white flex flex-col items-center justify-center text-center shadow-2xl p-2.5 -rotate-6 hover:rotate-0 transition-transform duration-300 border-2 border-white">
                  <span className="text-2xl sm:text-3xl font-black font-heading leading-none">
                    20%
                  </span>
                  <span className="text-[10px] sm:text-xs font-extrabold uppercase tracking-widest text-[#48CAE4] mt-0.5">
                    OFF
                  </span>
                  <span className="text-[8px] sm:text-[9px] uppercase tracking-wider text-gray-300 font-semibold mt-0.5">
                    First Order
                  </span>
                </div>

                {/* Floating Trust Card Bottom Right */}
                <div className="absolute -bottom-5 -right-2 sm:-bottom-6 sm:-right-4 z-20 bg-white rounded-2xl p-3.5 sm:p-4 shadow-xl border border-gray-100 flex items-center gap-3 max-w-[240px]">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center shrink-0 shadow-xs">
                    <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs font-extrabold text-gray-900">4.9 / 5.0</span>
                      <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-1 rounded">Top Rated</span>
                    </div>
                    <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">
                      Trusted by 10,000+ local homes
                    </p>
                  </div>
                </div>

                {/* Floating Free Pickup Chip Top Right */}
                <div className="hidden sm:flex absolute top-12 -right-4 z-20 bg-white/95 backdrop-blur-md rounded-2xl py-2 px-3.5 shadow-lg border border-gray-100 items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[11px] font-bold text-gray-800">Free Doorstep Pickup</span>
                </div>

              </div>

            </div>
          </div>
        </section>
      </ScrollReveal>

      <ScrollReveal yOffset={24} className="w-full">
        <section className="w-full bg-white py-8 sm:py-12 px-4 sm:px-8 md:px-12 lg:px-16 flex justify-center">
          <AppDownloadBanner />
        </section>
      </ScrollReveal>

      <ScrollReveal yOffset={28} className="w-full">
        <section className="w-full bg-[#f8fafc] py-12 sm:py-16 px-6 sm:px-12 md:px-20 lg:px-28">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
            <div className="space-y-6">
              <div>
                <span className="text-xs font-bold uppercase tracking-widest text-[#03045E] block">
                  The Smarter Way to Clean
                </span>
                <h2 className="text-3xl sm:text-4xl font-heading font-extrabold text-[#03045E]">
                  Why 10,000+ Households Choose <span className="text-[#03045E]">LAUN</span><span className="text-[#00B4D8]">DELLE</span>
                </h2>
              </div>

              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-[#CAF0F8] text-[#03045E] flex items-center justify-center shrink-0 shadow-xs">
                    <Users className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-gray-900">Highest Rated in Your City</h4>
                    <p className="text-xs text-gray-500 leading-relaxed mt-0.5">
                      Over 10,000 satisfied families trust us with their everyday laundry and luxury festive wardrobes.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-[#CAF0F8] text-[#03045E] flex items-center justify-center shrink-0 shadow-xs">
                    <Clock className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-gray-900">Guaranteed 24-48h Delivery</h4>
                    <p className="text-xs text-gray-500 leading-relaxed mt-0.5">
                      Live driver tracking and precise delivery slots so your clothes are never delayed.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-[#CAF0F8] text-[#03045E] flex items-center justify-center shrink-0 shadow-xs">
                    <UserCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-gray-900">Certified Textile Specialists</h4>
                    <p className="text-xs text-gray-500 leading-relaxed mt-0.5">
                      Each garment is inspected for fabric care symbols, buttons, and stains before washing.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-[#CAF0F8] text-[#03045E] flex items-center justify-center shrink-0 shadow-xs">
                    <Leaf className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-gray-900">100% Eco-Friendly Detergents</h4>
                    <p className="text-xs text-gray-500 leading-relaxed mt-0.5">
                      Biodegradable enzymes and softeners that leave clothes soft and skin irritation-free.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-5">
              <div className="p-7 rounded-3xl bg-white shadow-sm flex flex-col justify-between gap-4">
                <div className="w-12 h-12 rounded-2xl bg-[#CAF0F8] text-[#03045E] flex items-center justify-center">
                  <Users className="w-6 h-6 text-[#03045E]" />
                </div>
                <div>
                  <strong className="text-3xl sm:text-4xl font-heading font-extrabold text-[#03045E] block">10,000+</strong>
                  <p className="text-xs text-gray-500 font-medium mt-1">Happy Active Customers</p>
                </div>
              </div>

              <div className="p-7 rounded-3xl bg-white shadow-sm flex flex-col justify-between gap-4">
                <div className="w-12 h-12 rounded-2xl bg-[#CAF0F8] text-[#03045E] flex items-center justify-center">
                  <ShoppingBag className="w-6 h-6 text-[#03045E]" />
                </div>
                <div>
                  <strong className="text-3xl sm:text-4xl font-heading font-extrabold text-[#03045E] block">50,000+</strong>
                  <p className="text-xs text-gray-500 font-medium mt-1">Garments Cleaned</p>
                </div>
              </div>

              <div className="p-7 rounded-3xl bg-white shadow-sm flex flex-col justify-between gap-4">
                <div className="w-12 h-12 rounded-2xl bg-[#CAF0F8] text-[#03045E] flex items-center justify-center">
                  <MapPin className="w-6 h-6 text-[#03045E]" />
                </div>
                <div>
                  <strong className="text-3xl sm:text-4xl font-heading font-extrabold text-[#03045E] block">25+</strong>
                  <p className="text-xs text-gray-500 font-medium mt-1">City Hub Locations</p>
                </div>
              </div>

              <div className="p-7 rounded-3xl bg-white shadow-sm flex flex-col justify-between gap-4">
                <div className="w-12 h-12 rounded-2xl bg-[#CAF0F8] text-[#03045E] flex items-center justify-center">
                  <Smile className="w-6 h-6 text-[#03045E]" />
                </div>
                <div>
                  <strong className="text-3xl sm:text-4xl font-heading font-extrabold text-[#03045E] block">99.4%</strong>
                  <p className="text-xs text-gray-500 font-medium mt-1">Satisfaction Rate</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </ScrollReveal>

      <ScrollReveal yOffset={28} className="w-full">
        <section className="w-full bg-white py-12 sm:py-16 px-6 sm:px-12 md:px-20 lg:px-28">
          <style>{`
          @keyframes sweepOne {
            0% { transform: translateX(0) scaleY(1); }
            50% { transform: translateX(-25%) scaleY(1.1); }
            100% { transform: translateX(-50%) scaleY(1); }
          }
          @keyframes sweepTwo {
            0% { transform: translateX(-50%) scaleY(1); }
            50% { transform: translateX(-25%) scaleY(0.9); }
            100% { transform: translateX(0) scaleY(1); }
          }
          .sweep-wave-1 {
            animation: sweepOne 15s infinite linear;
            width: 200%;
          }
          .sweep-wave-2 {
            animation: sweepTwo 12s infinite linear;
            width: 200%;
          }
        `}</style>

          <div className="w-full relative isolate bg-gradient-to-br from-[#0B176F] via-[#050A5C] to-[#020530] rounded-[40px] p-6 sm:p-10 lg:p-14 shadow-2xl overflow-hidden space-y-8 border border-white/10">

            {/* Animated Wave Background */}
            <div className="absolute bottom-0 left-0 w-full overflow-hidden h-[120px] sm:h-[180px] z-0 pointer-events-none">
              <svg className="sweep-wave-1 absolute bottom-0 h-full fill-[#12C8F4]/20" viewBox="0 0 1200 120" preserveAspectRatio="none">
                <path d="M0,0 C150,100 350,0 600,50 C850,100 1050,0 1200,50 L1200,120 L0,120 Z M1200,50 C1350,100 1550,0 1800,50 C2050,100 2250,0 2400,50 L2400,120 L1200,120 Z" />
              </svg>
              <svg className="sweep-wave-2 absolute bottom-0 h-[80%] fill-[#6ED8FF]/20" viewBox="0 0 1200 120" preserveAspectRatio="none">
                <path d="M0,50 C150,0 350,100 600,50 C850,0 1050,100 1200,50 L1200,120 L0,120 Z M1200,50 C1350,0 1550,100 1800,50 C2050,0 2250,100 2400,50 L2400,120 L1200,120 Z" />
              </svg>
            </div>

            <div className="relative z-10 text-center space-y-2">
              <span className="text-xs font-bold uppercase tracking-widest text-[#6ED8FF] block">
                The Quality Difference
              </span>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-heading font-extrabold text-white">
                Why Switch to <span className="text-white">LAUN</span><span className="text-[#48CAE4]">DELLE</span>?
              </h2>
              <p className="text-sm text-blue-100/70 max-w-2xl mx-auto pt-2">
                Don't compromise on your fabrics. See how our premium doorstep service compares to local dhobis and traditional laundromats.
              </p>
            </div>

            <div className="relative z-10 overflow-x-auto rounded-2xl border border-white/10 bg-black/20 backdrop-blur-md shadow-2xl">
              <table className="w-full text-xs sm:text-sm text-left min-w-full sm:min-w-[700px]">
                <thead>
                  <tr className="text-white uppercase tracking-wider text-[10px] sm:text-[11px] bg-white/5">
                    <th className="py-4 px-3 sm:py-5 sm:px-6 font-bold">Feature / Guarantee</th>
                    <th className="py-4 px-3 sm:py-5 sm:px-6 text-white/50 font-semibold text-center sm:text-left leading-tight">
                      <span className="hidden sm:inline">Traditional Local Dhobi</span>
                      <span className="sm:hidden text-[9px]">Dhobi</span>
                    </th>
                    <th className="py-4 px-3 sm:py-5 sm:px-6 text-white/50 font-semibold text-center sm:text-left leading-tight">
                      <span className="hidden sm:inline">Self-Service Laundromat</span>
                      <span className="sm:hidden text-[9px]">DIY</span>
                    </th>
                    <th className="py-4 px-3 sm:py-5 sm:px-6 bg-[#12C8F4]/20 text-[#6ED8FF] font-extrabold text-center sm:text-left leading-tight">
                      <span className="hidden sm:inline">Laundelle Doorstep</span>
                      <span className="sm:hidden text-[10px]">Laundelle</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-white/80">
                  <tr className="hover:bg-white/5 transition-colors text-[10px] sm:text-sm">
                    <td className="py-3 px-3 sm:py-4 sm:px-6 font-bold text-white pr-2">Doorstep Pickup & Delivery</td>
                    <td className="py-3 px-3 sm:py-4 sm:px-6 text-white/40 text-center sm:text-left">
                      <span className="hidden sm:inline">Unreliable timings</span>
                      <XCircle className="w-5 h-5 text-red-400/80 sm:hidden mx-auto" />
                    </td>
                    <td className="py-3 px-3 sm:py-4 sm:px-6 text-white/40 text-center sm:text-left">
                      <span className="hidden sm:inline">You must carry loads yourself</span>
                      <XCircle className="w-5 h-5 text-red-400/80 sm:hidden mx-auto" />
                    </td>
                    <td className="py-3 px-3 sm:py-4 sm:px-6 bg-[#12C8F4]/10 font-bold text-[#6ED8FF] text-center sm:text-left">
                      <span className="hidden sm:inline-flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-[#12C8F4]" /> Free 30-min slots
                      </span>
                      <CheckCircle2 className="w-5 h-5 text-[#12C8F4] sm:hidden mx-auto" />
                    </td>
                  </tr>
                  <tr className="hover:bg-white/5 transition-colors text-[10px] sm:text-sm">
                    <td className="py-3 px-3 sm:py-4 sm:px-6 font-bold text-white pr-2">Hygiene & Wash Drums</td>
                    <td className="py-3 px-3 sm:py-4 sm:px-6 text-red-400 sm:font-medium text-center sm:text-left">
                      <span className="hidden sm:inline">Mixed with unknown clothes</span>
                      <XCircle className="w-5 h-5 text-red-400/80 sm:hidden mx-auto" />
                    </td>
                    <td className="py-3 px-3 sm:py-4 sm:px-6 text-white/40 text-center sm:text-left">
                      <span className="hidden sm:inline">Shared unsterilized washers</span>
                      <XCircle className="w-5 h-5 text-red-400/80 sm:hidden mx-auto" />
                    </td>
                    <td className="py-3 px-3 sm:py-4 sm:px-6 bg-[#12C8F4]/10 font-bold text-[#6ED8FF] text-center sm:text-left">
                      <span className="hidden sm:inline-flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-[#12C8F4]" /> 100% Dedicated Wash
                      </span>
                      <CheckCircle2 className="w-5 h-5 text-[#12C8F4] sm:hidden mx-auto" />
                    </td>
                  </tr>
                  <tr className="hover:bg-white/5 transition-colors text-[10px] sm:text-sm">
                    <td className="py-3 px-3 sm:py-4 sm:px-6 font-bold text-white pr-2">Detergents & Smell</td>
                    <td className="py-3 px-3 sm:py-4 sm:px-6 text-white/40 text-center sm:text-left">
                      <span className="hidden sm:inline">Harsh caustic powders</span>
                      <XCircle className="w-5 h-5 text-red-400/80 sm:hidden mx-auto" />
                    </td>
                    <td className="py-3 px-3 sm:py-4 sm:px-6 text-white/40 text-center sm:text-left">
                      <span className="hidden sm:inline">Standard generic soaps</span>
                      <XCircle className="w-5 h-5 text-red-400/80 sm:hidden mx-auto" />
                    </td>
                    <td className="py-3 px-3 sm:py-4 sm:px-6 bg-[#12C8F4]/10 font-bold text-[#6ED8FF] text-center sm:text-left">
                      <span className="hidden sm:inline-flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-[#12C8F4]" /> Organic Enzyme, zero smell
                      </span>
                      <CheckCircle2 className="w-5 h-5 text-[#12C8F4] sm:hidden mx-auto" />
                    </td>
                  </tr>
                  <tr className="hover:bg-white/5 transition-colors text-[10px] sm:text-sm">
                    <td className="py-3 px-3 sm:py-4 sm:px-6 font-bold text-white pr-2">Ironing & Pressing Standard</td>
                    <td className="py-3 px-3 sm:py-4 sm:px-6 text-red-400 sm:font-medium text-center sm:text-left">
                      <span className="hidden sm:inline">Heavy coal iron (burn risk)</span>
                      <XCircle className="w-5 h-5 text-red-400/80 sm:hidden mx-auto" />
                    </td>
                    <td className="py-3 px-3 sm:py-4 sm:px-6 text-white/40 text-center sm:text-left">
                      <span className="hidden sm:inline">Unironed or wrinkled</span>
                      <XCircle className="w-5 h-5 text-red-400/80 sm:hidden mx-auto" />
                    </td>
                    <td className="py-3 px-3 sm:py-4 sm:px-6 bg-[#12C8F4]/10 font-bold text-[#6ED8FF] text-center sm:text-left">
                      <span className="hidden sm:inline-flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-[#12C8F4]" /> Italian Vacuum Steam
                      </span>
                      <CheckCircle2 className="w-5 h-5 text-[#12C8F4] sm:hidden mx-auto" />
                    </td>
                  </tr>
                  <tr className="hover:bg-white/5 transition-colors text-[10px] sm:text-sm">
                    <td className="py-3 px-3 sm:py-4 sm:px-6 font-bold text-white pr-2">Live Status & Tracking</td>
                    <td className="py-3 px-3 sm:py-4 sm:px-6 text-white/40 text-center sm:text-left">
                      <span className="hidden sm:inline">No tracking available</span>
                      <XCircle className="w-5 h-5 text-red-400/80 sm:hidden mx-auto" />
                    </td>
                    <td className="py-3 px-3 sm:py-4 sm:px-6 text-white/40 text-center sm:text-left">
                      <span className="hidden sm:inline">N/A</span>
                      <XCircle className="w-5 h-5 text-red-400/80 sm:hidden mx-auto" />
                    </td>
                    <td className="py-3 px-3 sm:py-4 sm:px-6 bg-[#12C8F4]/10 font-bold text-[#6ED8FF] text-center sm:text-left">
                      <span className="hidden sm:inline-flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-[#12C8F4]" /> Real-Time App Tracking
                      </span>
                      <CheckCircle2 className="w-5 h-5 text-[#12C8F4] sm:hidden mx-auto" />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </ScrollReveal>

      {/* =========================================
          TESTIMONIALS - FULL WIDTH
      ========================================= */}
      <ScrollReveal yOffset={28} className="w-full">
        <section className="w-full bg-[#f8fafc] py-12 sm:py-16 px-6 sm:px-12 md:px-20 lg:px-28">
          <div className="text-center space-y-2 mb-10">
            <span className="text-xs font-bold uppercase tracking-widest text-[#0077B6] block">
              Real Experiences, Real Trust
            </span>
            <h2 className="text-3xl sm:text-4xl font-heading font-extrabold text-[#03045E]">
              What Our Customers Say
            </h2>
            <p className="text-xs sm:text-sm text-gray-500">Real stories from our everyday happy users</p>
          </div>

          <div className="flex md:grid md:grid-cols-3 gap-5 sm:gap-6 overflow-x-auto md:overflow-x-visible snap-x snap-mandatory scrollbar-none pb-4 pt-1 px-1 sm:px-0">
            {[
              {
                stars: 5,
                quote: '"Excellent service! My formal shirts and trousers are always crisp, fragrant, and vacuum folded. Doorstep pickup in my apartment complex has freed up my entire Sunday."',
                emoji: '👩‍💻',
                bg: 'bg-pink-100',
                name: 'Priya Sharma',
                role: 'Software Engineer • 24 Orders'
              },
              {
                stars: 5,
                quote: '"Very professional dry cleaning! They completely removed a tough stubborn coffee stain from my tailored blazer without touching the suit lining. Highly recommended."',
                emoji: '👨‍💼',
                bg: 'bg-blue-100',
                name: 'Arjun Mehta',
                role: 'Corporate Consultant • 18 Orders'
              },
              {
                stars: 5,
                quote: '"Best shoe cleaning and sneaker care in town! My white running shoes look brand new again with spotless midsoles. Transparent pricing and lovely customer support."',
                emoji: '👩‍🎨',
                bg: 'bg-purple-100',
                name: 'Neha Reddy',
                role: 'Design Director • 31 Orders'
              }
            ].map((item, i) => (
              <ScrollReveal
                key={i}
                yOffset={24}
                delay={i * 0.08}
                className="w-[86vw] xs:w-[82vw] sm:w-[360px] md:w-auto shrink-0 snap-center h-full"
              >
                <article className="p-6 sm:p-7 rounded-3xl bg-white shadow-sm space-y-4 flex flex-col justify-between hover:shadow-xl transition-shadow border border-gray-100/80 h-full">
                  <div className="space-y-3">
                    <div className="flex text-amber-400 text-xs gap-0.5">
                      {[...Array(item.stars)].map((_, idx) => (
                        <Star key={idx} className="w-4 h-4 fill-amber-400 text-amber-400" />
                      ))}
                    </div>
                    <p className="text-xs sm:text-sm text-[#4c5a52] leading-relaxed italic">
                      {item.quote}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 pt-3">
                    <div className={`w-11 h-11 rounded-full ${item.bg} flex items-center justify-center text-xl sm:text-2xl shadow-xs shrink-0 select-none`}>
                      {item.emoji}
                    </div>
                    <div>
                      <strong className="text-xs font-bold text-gray-900 block">{item.name}</strong>
                      <p className="text-[11px] text-gray-400 font-medium">{item.role}</p>
                    </div>
                  </div>
                </article>
              </ScrollReveal>
            ))}
          </div>

          {/* Mobile Horizontal Scroll Hint */}
          <div className="flex md:hidden items-center justify-center gap-1.5 mt-2 text-gray-400 text-[11px] font-medium">
            <span>Swipe horizontally to read more reviews</span>
            <span>→</span>
          </div>
        </section>
      </ScrollReveal>

      {/* =========================================
          FAQ ACCORDION SECTION - FULL WIDTH
      ========================================= */}
      <ScrollReveal yOffset={28} className="w-full">
        <section className="w-full bg-white py-12 sm:py-16 px-6 sm:px-12 md:px-20 lg:px-28">
          <div className="max-w-4xl mx-auto space-y-8">
            <div className="text-center space-y-2">
              <span className="text-xs font-bold uppercase tracking-widest text-[#0077B6] block">
                Frequently Asked Questions
              </span>
              <h2 className="text-3xl sm:text-4xl font-heading font-extrabold text-[#03045E]">
                Frequently Asked Questions
              </h2>
            </div>

            <div className="space-y-3">
              {faqs.map((faq, idx) => (
                <div
                  key={idx}
                  className="bg-white rounded-2xl overflow-hidden shadow-xs transition-all"
                >
                  <button
                    onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                    className="w-full p-5 text-left flex items-center justify-between gap-4 font-bold text-xs sm:text-sm text-gray-800 hover:text-[#03045E] cursor-pointer"
                  >
                    <span>{faq.q}</span>
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-transform ${openFaq === idx ? 'bg-[#03045E] text-white rotate-45' : 'bg-gray-100 text-gray-600'}`}>
                      +
                    </span>
                  </button>

                  {openFaq === idx && (
                    <div className="px-5 pb-5 text-xs sm:text-sm text-gray-600 leading-relaxed pt-1 animate-in fade-in">
                      {faq.a}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      </ScrollReveal>
    </div>
  );
};
