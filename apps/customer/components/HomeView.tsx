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
          HERO SECTION - POSTCODE AVAILABILITY CHECKER
      ========================================= */}
      <section className="relative isolate min-h-[660px] md:min-h-[700px] lg:min-h-[740px] overflow-hidden bg-[radial-gradient(circle_at_47%_48%,#fff_0,#f9fbff_38%,#eef2f8_100%)]">
        {/* Hero Text */}
        <div className="relative z-[5] w-full md:w-[60%] lg:w-[58%] px-0 pb-16 sm:pb-20 lg:pb-24 pl-6 sm:pl-10 lg:pl-[60px] pt-6 sm:pt-9 lg:pt-11 max-md:w-full max-md:px-[25px]">

          {/* Heading */}
          <h1 className="mt-[16px] sm:mt-[18px] max-w-[650px] font-serif text-[34px] sm:text-[46px] md:text-[52px] lg:text-[60px] font-semibold leading-[1.1] tracking-tight text-[#002953]">
            Check If We Collect From Your Doorstep
          </h1>

          {/* Decorative Line */}
          <div className="my-[18px] sm:my-[22px] mt-[20px] sm:mt-[24px] h-[3px] w-[72px] bg-[linear-gradient(90deg,#01BEFE_0_68%,#9cbdf4_68%)] rounded-full"></div>

          {/* Description */}
          <p className="max-w-[580px] font-sans font-normal text-base sm:text-[17px] lg:text-[18px] leading-[1.6] text-gray-600">
            Enter your UK postcode to verify instant availability for free doorstep collection, contactless handling, and 24–48h garment return.
          </p>

          {/* Postcode Availability Form & Quick Badges Component */}
          <div className="mt-[20px] sm:mt-[28px] max-w-[600px] w-full space-y-3.5 sm:space-y-4">
            {/* Postcode Input & Check Availability Button */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleCheckPostcode();
              }}
              className="flex flex-col sm:flex-row items-center gap-2.5 sm:gap-3 bg-white/95 backdrop-blur-md p-2 rounded-[12px] sm:rounded-[14px] border border-gray-200/90 shadow-[0_8px_30px_rgba(26,48,88,0.08)]"
            >
              <div className="relative flex-1 w-full">
                <MapPin className="w-5 h-5 text-[#01BEFE] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={postcodeQuery}
                  onChange={(e) => {
                    setPostcodeQuery(e.target.value.toUpperCase());
                    if (postcodeStatus !== 'idle') setPostcodeStatus('idle');
                  }}
                  placeholder="e.g. PR1 2AB or M1"
                  maxLength={10}
                  className="w-full pl-11 pr-3 py-3 bg-slate-50 focus:bg-white border border-slate-200 rounded-[10px] font-mono font-medium text-base text-[#002953] uppercase placeholder:font-sans placeholder:normal-case placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:border-[#01BEFE] focus:ring-2 focus:ring-[#01BEFE]/20 transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={postcodeStatus === 'checking' || !postcodeQuery.trim()}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-[#01BEFE] hover:bg-[#00a6e0] disabled:opacity-50 text-white font-sans font-semibold text-[15px] sm:text-[16px] px-6 py-3 rounded-[10px] shadow-[0_4px_14px_rgba(1,190,254,0.35)] transition cursor-pointer active:scale-98 shrink-0 hover:-translate-y-0.5"
              >
                {postcodeStatus === 'checking' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Checking...</span>
                  </>
                ) : (
                  <>
                    <span>Check Availability</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {/* Popular Serviced Areas Chips */}
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-[12px] sm:text-[13px] font-sans text-slate-500 pt-0.5">
              <span className="font-semibold text-slate-700">Popular serviced areas:</span>
              {['PR1', 'PR2', 'M1', 'M4', 'BD1', 'L1', 'NW1'].map((district) => (
                <button
                  key={district}
                  type="button"
                  onClick={() => handleCheckPostcode(district)}
                  className="px-2.5 py-1 rounded-[6px] bg-white hover:bg-[#01BEFE]/15 hover:text-[#002953] text-[#002953] font-mono font-medium text-[12px] sm:text-[13px] border border-slate-200 transition-colors cursor-pointer shadow-2xs"
                >
                  {district}
                </button>
              ))}
            </div>

            {/* Micro Trust Indicators Strip */}
            <div className="w-full rounded-[10px] sm:rounded-[12px] bg-white/95 backdrop-blur-md px-3 sm:px-5 py-3 shadow-[0_10px_35px_rgba(26,48,88,0.07)] border border-gray-100/90 grid grid-cols-3 items-center divide-x divide-[#d7dce4]">
              <div className="flex flex-col sm:flex-row items-center justify-center text-center sm:text-left gap-1 sm:gap-2 px-1 sm:px-2">
                <Truck className="w-4 h-4 sm:w-5 sm:h-5 text-[#01BEFE] shrink-0" strokeWidth={2.2} />
                <span className="text-[10px] xs:text-[11px] sm:text-[13px] font-medium text-[#002953] leading-tight">
                  Fast Doorstep Pickup
                </span>
              </div>
              <div className="flex flex-col sm:flex-row items-center justify-center text-center sm:text-left gap-1 sm:gap-2 px-1 sm:px-2">
                <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-[#01BEFE] shrink-0" strokeWidth={2.2} />
                <span className="text-[10px] xs:text-[11px] sm:text-[13px] font-medium text-[#002953] leading-tight">
                  24–48h Return
                </span>
              </div>
              <div className="flex flex-col sm:flex-row items-center justify-center text-center sm:text-left gap-1 sm:gap-2 px-1 sm:px-2">
                <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5 text-[#01BEFE] shrink-0" strokeWidth={2.2} />
                <span className="text-[10px] xs:text-[11px] sm:text-[13px] font-medium text-[#002953] leading-tight">
                  100% Sanitized Garment Care
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
                    <h4 className="text-xs sm:text-sm font-extrabold text-[#002953] uppercase tracking-wider flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-[#01BEFE]" />
                      <span>Services Available for {postcodeQuery}</span>
                    </h4>
                    <button
                      type="button"
                      onClick={() => {
                        setResultModalOpen(false);
                        onNavigate('services');
                      }}
                      className="text-xs font-bold text-[#01BEFE] hover:underline"
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
                            <h5 className="text-xs font-bold text-[#002953] line-clamp-1 group-hover:text-[#01BEFE] transition-colors">
                              {svc.name}
                            </h5>
                            <p className="text-[11px] font-bold text-[#01BEFE] mt-0.5">
                              from £{(svc.price || svc.basePrice || 0).toFixed(2)}
                            </p>
                          </div>
                        </div>
                        <div className="mt-2 pt-1.5 border-t border-gray-50 flex items-center justify-between text-[10px] font-semibold text-gray-500 group-hover:text-[#002953]">
                          <span>Select</span>
                          <ArrowRight className="w-3 h-3 text-[#01BEFE]" />
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
                    className="px-6 py-3 bg-[#01BEFE] hover:bg-[#01BEFE] text-white font-bold text-xs sm:text-sm rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer active:scale-98"
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
              <span className="text-xs font-bold uppercase tracking-widest text-[#01BEFE] block">
                Tailored with care for every fabric
              </span>
              <h2 className="text-3xl sm:text-4xl lg:text-[44px] font-serif font-semibold text-[#002953] tracking-tight">
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
                      <span className="absolute top-3 left-3 bg-[#002953] text-[#01BEFE] text-[10px] font-extrabold px-3 py-0.5 rounded-full uppercase tracking-wider shadow-md">
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
                      <h3 className="text-lg sm:text-xl font-sans font-semibold text-[#002953] line-clamp-1 group-hover:text-[#01BEFE] transition-colors">
                        {service.name}
                      </h3>
                      <p className="text-xs text-gray-500 mt-1.5 line-clamp-2 min-h-[34px] leading-relaxed">
                        {service.description}
                      </p>
                    </div>

                    <div className="pt-3 flex items-center justify-between border-t border-gray-100">
                      <div>
                        <span className="text-sm sm:text-base font-extrabold text-[#002953]">£{service.price.toFixed(2)}</span>
                        <span className="text-xs text-gray-400 font-normal ml-0.5">/{service.unit.replace('per ', '')}</span>
                      </div>
                      <button
                        onClick={() => onSelectService(service)}
                        className="inline-flex items-center gap-1.5 bg-[#01BEFE] hover:bg-[#00a6e0] text-white px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-2xs hover:shadow-sm active:scale-95"
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
              className="inline-flex items-center gap-2 bg-[#01BEFE] hover:bg-[#00a6e0] text-white px-7 py-3.5 rounded-2xl text-xs sm:text-sm font-bold transition-all shadow-md cursor-pointer hover:shadow-lg"
            >
              <span>View All Laundry & Dry Clean Categories</span>
              <ArrowRight className="w-4 h-4 text-white" />
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
                <span className="text-xs font-bold uppercase tracking-widest text-[#002953] block">
                  The Smarter Way to Clean
                </span>
                <h2 className="text-3xl sm:text-4xl lg:text-[44px] font-serif font-semibold text-[#002953] tracking-tight">
                  Why 10,000+ Households Choose <span className="text-[#002953]">LAUN</span><span className="text-[#01BEFE]">DELLE</span>
                </h2>
              </div>

              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-[#01BEFE]/15 text-[#002953] flex items-center justify-center shrink-0 shadow-xs">
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
                  <div className="w-12 h-12 rounded-2xl bg-[#01BEFE]/15 text-[#002953] flex items-center justify-center shrink-0 shadow-xs">
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
                  <div className="w-12 h-12 rounded-2xl bg-[#01BEFE]/15 text-[#002953] flex items-center justify-center shrink-0 shadow-xs">
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
                  <div className="w-12 h-12 rounded-2xl bg-[#01BEFE]/15 text-[#002953] flex items-center justify-center shrink-0 shadow-xs">
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
                <div className="w-12 h-12 rounded-2xl bg-[#01BEFE]/15 text-[#002953] flex items-center justify-center">
                  <Users className="w-6 h-6 text-[#002953]" />
                </div>
                <div>
                  <strong className="text-3xl sm:text-4xl font-heading font-extrabold text-[#002953] block">10,000+</strong>
                  <p className="text-xs text-gray-500 font-medium mt-1">Happy Active Customers</p>
                </div>
              </div>

              <div className="p-7 rounded-3xl bg-white shadow-sm flex flex-col justify-between gap-4">
                <div className="w-12 h-12 rounded-2xl bg-[#01BEFE]/15 text-[#002953] flex items-center justify-center">
                  <ShoppingBag className="w-6 h-6 text-[#002953]" />
                </div>
                <div>
                  <strong className="text-3xl sm:text-4xl font-heading font-extrabold text-[#002953] block">50,000+</strong>
                  <p className="text-xs text-gray-500 font-medium mt-1">Garments Cleaned</p>
                </div>
              </div>

              <div className="p-7 rounded-3xl bg-white shadow-sm flex flex-col justify-between gap-4">
                <div className="w-12 h-12 rounded-2xl bg-[#01BEFE]/15 text-[#002953] flex items-center justify-center">
                  <MapPin className="w-6 h-6 text-[#002953]" />
                </div>
                <div>
                  <strong className="text-3xl sm:text-4xl font-heading font-extrabold text-[#002953] block">25+</strong>
                  <p className="text-xs text-gray-500 font-medium mt-1">City Hub Locations</p>
                </div>
              </div>

              <div className="p-7 rounded-3xl bg-white shadow-sm flex flex-col justify-between gap-4">
                <div className="w-12 h-12 rounded-2xl bg-[#01BEFE]/15 text-[#002953] flex items-center justify-center">
                  <Smile className="w-6 h-6 text-[#002953]" />
                </div>
                <div>
                  <strong className="text-3xl sm:text-4xl font-heading font-extrabold text-[#002953] block">99.4%</strong>
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

          <div className="w-full relative isolate bg-gradient-to-br from-[#002953] via-[#002953] to-[#002953] rounded-[40px] p-6 sm:p-10 lg:p-14 shadow-2xl overflow-hidden space-y-8 border border-white/10">

            {/* Animated Wave Background */}
            <div className="absolute bottom-0 left-0 w-full overflow-hidden h-[120px] sm:h-[180px] z-0 pointer-events-none">
              <svg className="sweep-wave-1 absolute bottom-0 h-full fill-[#01BEFE]/20" viewBox="0 0 1200 120" preserveAspectRatio="none">
                <path d="M0,0 C150,100 350,0 600,50 C850,100 1050,0 1200,50 L1200,120 L0,120 Z M1200,50 C1350,100 1550,0 1800,50 C2050,100 2250,0 2400,50 L2400,120 L1200,120 Z" />
              </svg>
              <svg className="sweep-wave-2 absolute bottom-0 h-[80%] fill-[#01BEFE]/20" viewBox="0 0 1200 120" preserveAspectRatio="none">
                <path d="M0,50 C150,0 350,100 600,50 C850,0 1050,100 1200,50 L1200,120 L0,120 Z M1200,50 C1350,0 1550,100 1800,50 C2050,0 2250,100 2400,50 L2400,120 L1200,120 Z" />
              </svg>
            </div>

            <div className="relative z-10 text-center space-y-2">
              <span className="text-xs font-bold uppercase tracking-widest text-[#01BEFE] block">
                The Quality Difference
              </span>
              <h2 className="text-3xl sm:text-4xl lg:text-[44px] font-serif font-semibold text-white tracking-tight">
                Why Switch to <span className="text-white">LAUN</span><span className="text-[#01BEFE]">DELLE</span>?
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
                    <th className="py-4 px-3 sm:py-5 sm:px-6 bg-[#01BEFE]/20 text-[#01BEFE] font-extrabold text-center sm:text-left leading-tight">
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
                    <td className="py-3 px-3 sm:py-4 sm:px-6 bg-[#01BEFE]/10 font-bold text-[#01BEFE] text-center sm:text-left">
                      <span className="hidden sm:inline-flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-[#01BEFE]" /> Free 30-min slots
                      </span>
                      <CheckCircle2 className="w-5 h-5 text-[#01BEFE] sm:hidden mx-auto" />
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
                    <td className="py-3 px-3 sm:py-4 sm:px-6 bg-[#01BEFE]/10 font-bold text-[#01BEFE] text-center sm:text-left">
                      <span className="hidden sm:inline-flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-[#01BEFE]" /> 100% Dedicated Wash
                      </span>
                      <CheckCircle2 className="w-5 h-5 text-[#01BEFE] sm:hidden mx-auto" />
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
                    <td className="py-3 px-3 sm:py-4 sm:px-6 bg-[#01BEFE]/10 font-bold text-[#01BEFE] text-center sm:text-left">
                      <span className="hidden sm:inline-flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-[#01BEFE]" /> Organic Enzyme, zero smell
                      </span>
                      <CheckCircle2 className="w-5 h-5 text-[#01BEFE] sm:hidden mx-auto" />
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
                    <td className="py-3 px-3 sm:py-4 sm:px-6 bg-[#01BEFE]/10 font-bold text-[#01BEFE] text-center sm:text-left">
                      <span className="hidden sm:inline-flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-[#01BEFE]" /> Italian Vacuum Steam
                      </span>
                      <CheckCircle2 className="w-5 h-5 text-[#01BEFE] sm:hidden mx-auto" />
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
                    <td className="py-3 px-3 sm:py-4 sm:px-6 bg-[#01BEFE]/10 font-bold text-[#01BEFE] text-center sm:text-left">
                      <span className="hidden sm:inline-flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-[#01BEFE]" /> Real-Time App Tracking
                      </span>
                      <CheckCircle2 className="w-5 h-5 text-[#01BEFE] sm:hidden mx-auto" />
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
            <span className="text-xs font-bold uppercase tracking-widest text-[#01BEFE] block">
              Real Experiences, Real Trust
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-[44px] font-serif font-semibold text-[#002953] tracking-tight">
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
              <span className="text-xs font-bold uppercase tracking-widest text-[#01BEFE] block">
                Frequently Asked Questions
              </span>
              <h2 className="text-3xl sm:text-4xl lg:text-[44px] font-serif font-semibold text-[#002953] tracking-tight">
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
                    className="w-full p-5 text-left flex items-center justify-between gap-4 font-bold text-xs sm:text-sm text-gray-800 hover:text-[#002953] cursor-pointer"
                  >
                    <span>{faq.q}</span>
                    <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-transform ${openFaq === idx ? 'bg-[#002953] text-white rotate-45' : 'bg-gray-100 text-gray-600'}`}>
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
