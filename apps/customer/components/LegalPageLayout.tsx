'use client';

import React from 'react';
import Link from 'next/link';
import { 
  ShieldCheck, 
  ArrowLeft, 
  Clock, 
  Sparkles, 
  HelpCircle, 
  Phone, 
  Mail, 
  WashingMachine, 
  ChevronRight,
  ExternalLink,
  Printer
} from 'lucide-react';
import { Footer } from './Footer';

interface Section {
  id: string;
  title: string;
  content: React.ReactNode;
}

interface LegalPageLayoutProps {
  title: string;
  badge: string;
  lastUpdated: string;
  description: string;
  icon: React.ReactNode;
  activePath: '/termsandconditions' | '/privacypolicy' | '/cancellationandrefund';
  sections: Section[];
  keyHighlights?: { title: string; desc: string; icon: React.ReactNode }[];
}

export const LegalPageLayout: React.FC<LegalPageLayoutProps> = ({
  title,
  badge,
  lastUpdated,
  description,
  icon,
  activePath,
  sections,
  keyHighlights = [],
}) => {
  const [activeSection, setActiveSection] = React.useState<string>(sections[0]?.id || '');

  React.useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY + 180;
      for (const section of sections) {
        const el = document.getElementById(section.id);
        if (el) {
          const top = el.offsetTop;
          const height = el.offsetHeight;
          if (scrollPosition >= top && scrollPosition < top + height) {
            setActiveSection(section.id);
            break;
          }
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [sections]);

  const handlePrint = () => {
    if (typeof window !== 'undefined') {
      window.print();
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-gray-900 font-sans flex flex-col antialiased selection:bg-[#01BEFE]/15 selection:text-[#002953]">
      {/* Top Sticky Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
          {/* Logo & Back to Home */}
          <div className="flex items-center gap-4 sm:gap-6">
            <Link
              href="/"
              className="group flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold text-slate-600 hover:text-[#002953] hover:bg-slate-100 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5 text-[#01BEFE]" />
              <span className="hidden sm:inline">Back to Home</span>
            </Link>

            <div className="h-5 w-px bg-slate-200 hidden sm:block" />

            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#002953] flex items-center justify-center text-white shadow-xs">
                <WashingMachine className="w-5 h-5 text-[#01BEFE]" />
              </div>
              <div>
                <span className="font-heading font-black text-lg block leading-tight tracking-wider uppercase text-[#002953]">
                  LAUN<span className="text-[#01BEFE]">DELLE</span>
                </span>
                <span className="text-[10px] text-slate-500 font-semibold block uppercase tracking-wider">
                  Garment Care Legal
                </span>
              </div>
            </Link>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={handlePrint}
              className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors cursor-pointer"
              title="Print Policy"
            >
              <Printer className="w-3.5 h-3.5 text-slate-500" />
              <span>Print</span>
            </button>

            <Link
              href="/support"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-xs font-bold text-[#002953] transition-colors"
            >
              <HelpCircle className="w-3.5 h-3.5 text-[#01BEFE]" />
              <span>Support</span>
            </Link>

            <Link
              href="/services"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#002953] hover:bg-[#002953] text-xs font-bold text-white shadow-xs hover:shadow-md transition-all active:scale-95"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#01BEFE]" />
              <span>Book Clean</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Banner */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#002953] via-[#002953] to-[#075985] text-white py-14 sm:py-18 px-4 sm:px-6 lg:px-8 shadow-inner">
        {/* Subtle decorative background circles */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 rounded-full bg-cyan-400/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-10 -mb-20 w-60 h-60 rounded-full bg-blue-500/15 blur-2xl pointer-events-none" />

        <div className="max-w-5xl mx-auto relative z-10 text-center sm:text-left">
          {/* Breadcrumb */}
          <nav className="flex items-center justify-center sm:justify-start gap-2 text-xs font-medium text-blue-100/80 mb-4">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <ChevronRight className="w-3.5 h-3.5 opacity-60" />
            <span>Legal &amp; Compliance</span>
            <ChevronRight className="w-3.5 h-3.5 opacity-60" />
            <span className="text-white font-semibold">{title}</span>
          </nav>

          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
            <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-[#01BEFE] shadow-lg shrink-0">
              {icon}
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
                <span className="px-3 py-0.5 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-[#01BEFE] text-[#002953]">
                  {badge}
                </span>
                <span className="inline-flex items-center gap-1.5 text-xs text-blue-100/80">
                  <Clock className="w-3.5 h-3.5" />
                  Last Updated: {lastUpdated}
                </span>
              </div>

              <h1 className="font-heading font-extrabold text-3xl sm:text-4xl lg:text-5xl text-white tracking-tight">
                {title}
              </h1>

              <p className="text-sm sm:text-base text-[#01BEFE] max-w-3xl leading-relaxed pt-1">
                {description}
              </p>
            </div>
          </div>

          {/* Quick Legal Switcher Tabs */}
          <div className="mt-8 pt-6 border-t border-white/15 flex flex-wrap items-center justify-center sm:justify-start gap-2 sm:gap-3">
            <Link
              href="/termsandconditions"
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activePath === '/termsandconditions'
                  ? 'bg-white text-[#002953] shadow-md scale-102'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              Terms &amp; Conditions
            </Link>
            <Link
              href="/privacypolicy"
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activePath === '/privacypolicy'
                  ? 'bg-white text-[#002953] shadow-md scale-102'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              Privacy Policy
            </Link>
            <Link
              href="/cancellationandrefund"
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activePath === '/cancellationandrefund'
                  ? 'bg-white text-[#002953] shadow-md scale-102'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              Cancellation &amp; Refund
            </Link>
          </div>
        </div>
      </section>

      {/* Key Highlights Cards (if provided) */}
      {keyHighlights.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-6 relative z-20">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {keyHighlights.map((item, idx) => (
              <div
                key={idx}
                className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-md flex items-start gap-3.5 hover:shadow-lg transition-shadow"
              >
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#01BEFE] flex items-center justify-center shrink-0">
                  {item.icon}
                </div>
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#002953]">
                    {item.title}
                  </h4>
                  <p className="text-xs text-slate-600 mt-1 leading-normal">
                    {item.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Main Content & Sticky TOC */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex-1 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
          {/* Table of Contents - Desktop Sticky Sidebar */}
          <aside className="lg:col-span-4 hidden lg:block">
            <div className="sticky top-26 bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm space-y-4">
              <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-[#002953]">
                <ShieldCheck className="w-4 h-4 text-[#01BEFE]" />
                <span>Document Contents</span>
              </div>

              <nav className="space-y-1 max-h-[calc(100vh-240px)] overflow-y-auto pr-1">
                {sections.map((section, idx) => {
                  const isCurrent = activeSection === section.id;
                  return (
                    <a
                      key={section.id}
                      href={`#${section.id}`}
                      className={`block px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                        isCurrent
                          ? 'bg-[#002953] text-white shadow-xs font-bold translate-x-1'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      <span className="opacity-60 mr-1.5">{idx + 1}.</span>
                      {section.title}
                    </a>
                  );
                })}
              </nav>

              {/* Need Help Box */}
              <div className="pt-4 border-t border-slate-100 space-y-3">
                <div className="bg-gradient-to-br from-blue-50 to-cyan-50/50 rounded-2xl p-4 border border-blue-100">
                  <h5 className="text-xs font-bold text-[#002953] flex items-center gap-1.5">
                    <HelpCircle className="w-4 h-4 text-[#01BEFE]" />
                    <span>Have Legal Questions?</span>
                  </h5>
                  <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                    Our compliance &amp; customer care team is available 7 days a week.
                  </p>
                  <div className="mt-3 space-y-1 text-[11px] font-semibold text-[#002953]">
                    <p className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-[#01BEFE]" />
                      <a href="mailto:care@laundelle.co.uk" className="hover:underline">
                        care@laundelle.co.uk
                      </a>
                    </p>
                    <p className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-[#01BEFE]" />
                      <span>+44 20 1234 5678</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </aside>

          {/* Clauses / Content Body */}
          <main className="lg:col-span-8 space-y-8">
            <div className="bg-white rounded-3xl p-6 sm:p-10 border border-slate-200/80 shadow-sm divide-y divide-slate-100 space-y-8">
              {sections.map((section, idx) => (
                <article
                  key={section.id}
                  id={section.id}
                  className={`scroll-mt-28 ${idx > 0 ? 'pt-8' : ''}`}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <span className="flex items-center justify-center w-7 h-7 rounded-lg bg-[#01BEFE]/15 text-[#002953] text-xs font-extrabold">
                      {idx + 1}
                    </span>
                    <h2 className="font-serif font-semibold text-2xl sm:text-3xl text-[#002953]">
                      {section.title}
                    </h2>
                  </div>

                  <div className="prose prose-slate prose-sm max-w-none text-slate-700 leading-relaxed space-y-3.5 text-sm sm:text-base font-sans">
                    {section.content}
                  </div>
                </article>
              ))}
            </div>

            {/* Bottom Contact / Assistance Banner */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="space-y-1 text-center sm:text-left">
                <h3 className="font-sans font-semibold text-lg sm:text-xl text-[#002953]">
                  Need clarification on this policy?
                </h3>
                <p className="text-xs text-slate-600">
                  Speak directly with our dedicated UK operations &amp; customer care desk.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/support"
                  className="px-5 py-2.5 rounded-xl bg-[#002953] hover:bg-[#002953] text-white text-xs font-bold shadow-xs hover:shadow-md transition-all"
                >
                  Visit Support Center
                </Link>
                <a
                  href="mailto:care@laundelle.co.uk"
                  className="px-5 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all flex items-center gap-1.5"
                >
                  <Mail className="w-3.5 h-3.5 text-[#01BEFE]" />
                  <span>Email Care Team</span>
                </a>
              </div>
            </div>
          </main>
        </div>
      </div>

      {/* Footer */}
      <Footer onNavigate={(tab) => {
        window.location.href = tab === 'home' ? '/' : `/${tab === 'assistant' ? 'ai' : tab}`;
      }} />
    </div>
  );
};
