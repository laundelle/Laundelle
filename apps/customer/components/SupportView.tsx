import React, { useState, useRef } from 'react';
import Image from 'next/image';
import {
  MessageSquare,
  Phone,
  Mail,
  FileText,
  Upload,
  ChevronDown,
  AlertCircle,
  ShieldCheck,
  Clock,
  Send,
  CheckCircle2,
  Headphones,
  X,
  Search,
  Truck,
  Heart,
  Edit3
} from 'lucide-react';
import { LAUNDELLE_IMAGES, getOptimizedImageUrl } from '@laundelle/config';
import { Order, SupportTicket, ActiveTab } from '@laundelle/types';
import { dbCreateSupportTicket, getStoredSession } from '@laundelle/api-client';
import { ScrollReveal } from '@laundelle/ui';

interface SupportViewProps {
  orders: Order[];
  onNavigate: (tab: ActiveTab) => void;
}

export const SupportView: React.FC<SupportViewProps> = ({ orders, onNavigate }) => {
  // FAQ state
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const [faqSearchQuery, setFaqSearchQuery] = useState('');

  // Complaint Form State
  const [selectedOrderId, setSelectedOrderId] = useState<string>(
    orders && orders.length > 0 ? orders[0].id : 'General'
  );
  const [issueType, setIssueType] = useState<string>('Missing item');
  const [description, setDescription] = useState('');
  const [uploadedPhotos, setUploadedPhotos] = useState<string[]>([]);
  const [isSubmittingTicket, setIsSubmittingTicket] = useState(false);
  const [submittedTicket, setSubmittedTicket] = useState<SupportTicket | null>(null);
  const [showValidationWarning, setShowValidationWarning] = useState(false);
  const [showToast, setShowToast] = useState(false);

  // Live Chat Drawer/Modal state
  const [isLiveChatOpen, setIsLiveChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<
    { sender: 'agent' | 'user'; text: string; time: string }[]
  >([
    {
      sender: 'agent',
      text: 'Hello! I am your Laundelle Care specialist. How can I assist with your collection or garments today?',
      time: 'Just now'
    }
  ]);
  const [chatInput, setChatInput] = useState('');

  // Refs for smooth scrolling
  const faqRef = useRef<HTMLElement>(null);
  const submitQueryRef = useRef<HTMLElement>(null);
  const contactRef = useRef<HTMLElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  // Comprehensive FAQ list combining reference FAQ and customer support guidance
  const allFaqs = [
    {
      category: 'Booking & Collection',
      q: 'How does doorstep laundry collection work?',
      a: 'Simply choose your preferred service, select your weight/bags, and pick a convenient 2-hour collection time slot. Our electric courier driver arrives with a sanitized laundry bag to collect your garments right from your doorstep.'
    },
    {
      category: 'Booking & Collection',
      q: 'Do I need to weigh my clothes beforehand?',
      a: 'No. Our team can weigh your laundry when it arrives at our facility using certified precision digital scales.'
    },
    {
      category: 'Garment Care',
      q: 'What kind of detergents and softeners do you use?',
      a: 'We use carefully selected hypoallergenic and eco-friendly laundry products designed to provide effective stain removal while preserving delicate fabrics.'
    },
    {
      category: 'Delivery',
      q: 'How fast will my clothes be returned?',
      a: 'Standard laundry services are normally returned within 24–48 hours according to the delivery slot selected during booking. Express same-day service is also available.'
    },
    {
      category: 'Pricing & Billing',
      q: 'When do I pay, and is there an additional charge for heavy bags?',
      a: 'Payment details and any additional weight charges are shown clearly during the booking process and charged securely once verified at our facility.'
    },
    {
      category: 'Quality Guarantee',
      q: 'What if I am not happy or have a special garment concern?',
      a: 'Contact our care team immediately or submit a query below. Every service is backed by our 100% Satisfaction Guarantee and free re-wash promise within 24 hours.'
    }
  ];

  const filteredFaqs = allFaqs.filter(
    (f) =>
      f.q.toLowerCase().includes(faqSearchQuery.toLowerCase()) ||
      f.a.toLowerCase().includes(faqSearchQuery.toLowerCase()) ||
      f.category.toLowerCase().includes(faqSearchQuery.toLowerCase())
  );

  const issueTypes = [
    'Missing item',
    'Damaged item',
    'Laundry issue',
    'Collection issue',
    'Delivery issue',
    'Payment issue',
    'Other'
  ];

  const scrollToSection = (ref: React.RefObject<HTMLElement | null>) => {
    if (ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handlePhotoUploadSim = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newPhotos: string[] = [];
      Array.from(e.target.files).forEach((file) => {
        newPhotos.push(URL.createObjectURL(file));
      });
      setUploadedPhotos((prev) => [...prev, ...newPhotos]);
    }
  };

  const handleSubmitComplaint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) {
      setShowValidationWarning(true);
      descriptionRef.current?.focus();
      setTimeout(() => setShowValidationWarning(false), 2000);
      return;
    }

    setIsSubmittingTicket(true);
    try {
      const ticket: SupportTicket = {
        id: `CS-${Math.floor(1000 + Math.random() * 9000)}`,
        orderId: selectedOrderId !== 'General' ? selectedOrderId : undefined,
        issueType: issueType as any,
        description,
        photos: uploadedPhotos,
        status: 'In Review',
        createdAt: new Date().toISOString()
      };

      const session = getStoredSession();
      const userId = session?.user?.id || `guest-${Date.now()}`;

      await dbCreateSupportTicket(userId, ticket);

      setSubmittedTicket(ticket);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 4000);
    } catch (err: any) {
      console.error('Error submitting support ticket:', err);
      alert(err.message || 'Failed to submit support ticket.');
    } finally {
      setIsSubmittingTicket(false);
    }
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMsg = { sender: 'user' as const, text: chatInput, time: 'Just now' };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput('');

    setTimeout(() => {
      setChatMessages((prev) => [
        ...prev,
        {
          sender: 'agent',
          text: 'Thank you for contacting Laundelle Care! A specialist has received your message and will assist you immediately.',
          time: 'Just now'
        }
      ]);
    }, 1000);
  };

  return (
    <div className="w-full min-h-screen bg-white text-slate-800 selection:bg-blue-100 selection:text-blue-800">
      {/* ========================================================= */}
      {/* HERO SECTION */}
      {/* ========================================================= */}
      <section
        className="relative overflow-hidden pt-6 pb-24 sm:pt-10 sm:pb-32"
        style={{
          background: `
            radial-gradient(circle at 20% 20%, rgba(45, 145, 235, 0.08), transparent 30%),
            radial-gradient(circle at 85% 20%, rgba(45, 145, 235, 0.10), transparent 30%),
            linear-gradient(135deg, #f8fcff 0%, #edf7ff 55%, #e4f2ff 100%)
          `
        }}
      >
        {/* Decorative Blurred Circles */}
        <div className="pointer-events-none absolute -left-24 top-20 h-64 w-64 rounded-full bg-blue-200/25 blur-3xl" />
        <div className="pointer-events-none absolute right-0 top-0 h-96 w-96 rounded-full bg-blue-300/25 blur-3xl" />

        <div className="relative mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-12">
          <div className="grid items-center gap-8 lg:grid-cols-[1.15fr_0.85fr]">
            {/* LEFT HERO CONTENT */}
            <div className="relative z-10 space-y-5">
              {/* Header Tag */}
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-[#0867c8] shadow-xs">
                  <Headphones className="h-5 w-5" />
                </div>
                <span className="text-xs font-bold uppercase tracking-[0.22em] text-[#0867c8]">
                  Dedicated Customer Care
                </span>
              </div>

              {/* Serif Title */}
              <h1 className="max-w-3xl font-serif text-4xl font-bold leading-[1.08] text-[#092d67] sm:text-5xl lg:text-[56px] tracking-tight">
                How Can We Help <br />
                <span className="text-[#1677d8]">You Today?</span>
              </h1>

              {/* Description */}
              <p className="max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
                Our London care team is available 7 days a week from 07:00 to 22:00 to assist with
                collections, garment queries, and complaints.
              </p>

              <div className="pt-2 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => scrollToSection(submitQueryRef)}
                  className="px-6 py-3 rounded-full bg-[#0867c8] hover:bg-[#0755a8] text-white text-xs sm:text-sm font-bold shadow-md hover:shadow-lg transition-all cursor-pointer flex items-center gap-2"
                >
                  <Edit3 className="w-4 h-4" />
                  <span>Submit an Issue</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsLiveChatOpen(true)}
                  className="px-6 py-3 rounded-full bg-white hover:bg-blue-50 text-[#092d67] border border-blue-200 text-xs sm:text-sm font-bold shadow-xs hover:shadow-md transition-all cursor-pointer flex items-center gap-2"
                >
                  <MessageSquare className="w-4 h-4 text-[#1677d8]" />
                  <span>Start Live Chat</span>
                </button>
              </div>
            </div>

            {/* RIGHT HERO AGENT ILLUSTRATION */}
            <div className="relative min-h-[340px] lg:min-h-[420px] flex items-end justify-center">
              {/* Speech bubble */}
              <div className="absolute left-2 sm:left-6 top-8 z-30 hidden rotate-[-4deg] rounded-3xl bg-white/95 px-6 py-3.5 font-serif text-lg sm:text-xl italic text-[#092d67] shadow-xl border border-white/60 sm:block">
                Here to
                <br />
                <span className="text-[#1677d8] font-bold">Help Always</span>
              </div>

              {/* Support Agent Arch & Photo Container */}
              <div className="relative w-[85%] sm:w-[75%] h-[350px] sm:h-[400px] flex items-end justify-center overflow-hidden rounded-t-[120px] bg-gradient-to-br from-blue-100 to-blue-50 border-t-4 border-l-4 border-r-4 border-white shadow-2xl">
                {/* Secondary Interior Arch */}
                <div className="absolute bottom-0 h-[92%] w-[75%] rounded-t-[150px] bg-blue-200/40" />

                {/* High Quality Care Specialist Photo */}
                <Image
                  src={getOptimizedImageUrl(LAUNDELLE_IMAGES.supportAgent, { width: 800, quality: 'auto', format: 'auto' })}
                  alt="Laundelle customer care specialist"
                  fill
                  sizes="(max-width: 768px) 85vw, 400px"
                  loading="lazy"
                  className="relative z-10 object-cover object-top filter brightness-[1.02]"
                />
              </div>

              {/* Floating Information Badge */}
              <div className="absolute right-0 top-4 z-30 hidden space-y-4 rounded-3xl bg-white/85 p-5 backdrop-blur-md shadow-xl border border-white/80 md:block">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-[#1677d8]">
                    <Truck className="h-5 w-5" />
                  </div>
                  <span className="text-xs font-semibold text-[#092d67] leading-tight">
                    7 Days
                    <br />a Week
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-[#1677d8]">
                    <Clock className="h-5 w-5" />
                  </div>
                  <span className="text-xs font-semibold text-[#092d67]">
                    07:00 – 22:00
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-[#1677d8]">
                    <Heart className="h-4 w-4 fill-current" />
                  </div>
                  <span className="text-xs font-semibold text-[#092d67] leading-tight">
                    London Based
                    <br />
                    Care Team
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ===================================================== */}
          {/* 3 FLOATING ACTION CARDS */}
          {/* ===================================================== */}
          <div className="relative z-20 -mb-28 mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Card 1: FAQ */}
            <ScrollReveal yOffset={24} delay={0} className="h-full">
              <button
                type="button"
                onClick={() => scrollToSection(faqRef)}
                className="w-full group text-left bg-white/90 backdrop-blur-md flex min-h-[145px] items-center gap-5 rounded-3xl border border-white p-6 shadow-[0_10px_40px_rgba(15,76,129,0.08)] transition duration-300 hover:-translate-y-1 hover:shadow-xl cursor-pointer h-full"
              >
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-[#0867c8] group-hover:bg-[#0867c8] group-hover:text-white transition-colors">
                  <FileText className="h-7 w-7" />
                </div>
                <div className="flex-1">
                  <h3 className="font-serif text-lg font-bold leading-tight text-[#092d67]">
                    Frequently
                    <br />
                    Asked Questions
                  </h3>
                  <p className="mt-2 text-xs sm:text-sm text-slate-500">
                    Find quick answers to common queries.
                  </p>
                  <span className="mt-3 flex h-7 w-7 items-center justify-center rounded-full bg-[#0867c8] text-white text-xs shadow-xs group-hover:translate-x-1 transition-transform">
                    →
                  </span>
                </div>
              </button>
            </ScrollReveal>

            {/* Card 2: Submit Complaint */}
            <ScrollReveal yOffset={24} delay={0.08} className="h-full">
              <button
                type="button"
                onClick={() => {
                  scrollToSection(submitQueryRef);
                  setTimeout(() => descriptionRef.current?.focus(), 400);
                }}
                className="w-full group text-left bg-white/90 backdrop-blur-md flex min-h-[145px] items-center gap-5 rounded-3xl border border-white p-6 shadow-[0_10px_40px_rgba(15,76,129,0.08)] transition duration-300 hover:-translate-y-1 hover:shadow-xl cursor-pointer h-full"
              >
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-[#0867c8] group-hover:bg-[#0867c8] group-hover:text-white transition-colors">
                  <Edit3 className="h-7 w-7" />
                </div>
                <div className="flex-1">
                  <h3 className="font-serif text-lg font-bold leading-tight text-[#092d67]">
                    Submit Order
                    <br />
                    Complaint / Query
                  </h3>
                  <p className="mt-2 text-xs sm:text-sm text-slate-500">
                    Let us know and we'll make it right.
                  </p>
                  <span className="mt-3 flex h-7 w-7 items-center justify-center rounded-full border border-blue-500 text-[#0867c8] text-xs font-bold group-hover:translate-x-1 transition-transform">
                    →
                  </span>
                </div>
              </button>
            </ScrollReveal>

            {/* Card 3: Live Support */}
            <ScrollReveal yOffset={24} delay={0.16} className="h-full sm:col-span-2 lg:col-span-1">
              <button
                type="button"
                onClick={() => setIsLiveChatOpen(true)}
                className="w-full group text-left flex min-h-[145px] items-center gap-5 rounded-3xl border-4 border-white bg-gradient-to-br from-[#0867c8] via-[#1677d8] to-[#1976d2] p-6 text-white shadow-[0_10px_40px_rgba(15,76,129,0.08)] transition duration-300 hover:-translate-y-1 hover:shadow-xl cursor-pointer h-full"
              >
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/20">
                  <Headphones className="h-7 w-7 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="font-serif text-lg font-bold leading-tight text-white">
                    Live Support & Contacts
                  </h3>
                  <p className="mt-2 text-xs sm:text-sm text-blue-100">
                    Talk to our friendly care team.
                  </p>
                  <span className="mt-3 flex h-7 w-7 items-center justify-center rounded-full bg-white text-[#0867c8] text-xs font-bold group-hover:translate-x-1 transition-transform">
                    →
                  </span>
                </div>
              </button>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* MAIN CONTENT AREA */}
      {/* ========================================================= */}
      <main className="mx-auto max-w-[1440px] px-5 pb-20 pt-36 sm:px-8 lg:px-12">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_330px]">
          {/* ===================================================== */}
          {/* FAQ SECTION */}
          {/* ===================================================== */}
          <ScrollReveal yOffset={28} className="w-full">
            <section
              ref={faqRef}
              id="faq"
              className="rounded-3xl border border-blue-100 bg-white p-6 sm:p-8 shadow-[0_8px_30px_rgba(15,76,129,0.07)] space-y-6 scroll-mt-24"
            >
              {/* Header with Search */}
              <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center border-b border-gray-100 pb-5">
                <div>
                  <span className="inline-flex rounded-lg bg-blue-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#0867c8]">
                    FAQ
                  </span>
                  <h2 className="mt-2 font-serif text-2xl font-bold text-[#092d67] sm:text-3xl">
                    Frequently Asked Questions
                  </h2>
                  <p className="mt-1 text-xs sm:text-sm text-slate-500">
                    Find quick answers to the most common questions about our services.
                  </p>
                </div>

                {/* Search questions input */}
                <div className="relative w-full md:w-64">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={faqSearchQuery}
                    onChange={(e) => setFaqSearchQuery(e.target.value)}
                    placeholder="Search questions..."
                    className="h-11 w-full rounded-xl border border-blue-100 bg-white pl-10 pr-4 text-xs sm:text-sm text-slate-700 outline-hidden transition focus:border-blue-400 focus:ring-4 focus:ring-blue-100"
                  />
                  {faqSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setFaqSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* FAQ Accordion List */}
              <div className="space-y-3">
                {filteredFaqs.length > 0 ? (
                  filteredFaqs.map((faq, index) => {
                    const isOpen = openFaqIndex === index;
                    return (
                      <div
                        key={index}
                        className="overflow-hidden rounded-xl border border-blue-100 transition-all bg-white"
                      >
                        <button
                          type="button"
                          onClick={() => setOpenFaqIndex(isOpen ? null : index)}
                          className={`w-full flex items-center gap-3 px-4 py-3.5 text-left text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${isOpen ? 'bg-blue-50/80 text-[#0867c8]' : 'text-[#092d67] hover:bg-blue-50/40'
                            }`}
                        >
                          <span
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${isOpen
                              ? 'bg-[#0867c8] text-white'
                              : 'bg-blue-100 text-[#0867c8]'
                              }`}
                          >
                            {index + 1}
                          </span>

                          <span className="flex-1 font-medium">{faq.q}</span>

                          <ChevronDown
                            className={`h-5 w-5 transition-transform duration-200 text-[#0867c8] shrink-0 ${isOpen ? 'rotate-180' : ''
                              }`}
                          />
                        </button>

                        {isOpen && (
                          <div className="flex gap-4 p-4 sm:p-5 bg-white border-t border-blue-50 animate-in fade-in">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[#0867c8]">
                              <Truck className="h-5 w-5" />
                            </div>
                            <div className="space-y-1">
                              <span className="inline-block text-[10px] font-bold uppercase tracking-wider text-[#0867c8] bg-blue-100/60 px-2 py-0.5 rounded-md">
                                {faq.category}
                              </span>
                              <p className="text-xs sm:text-sm leading-relaxed text-slate-600">
                                {faq.a}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-10 text-gray-400 space-y-2">
                    <AlertCircle className="w-8 h-8 mx-auto text-blue-300" />
                    <p className="text-xs">No questions found matching "{faqSearchQuery}"</p>
                    <button
                      type="button"
                      onClick={() => setFaqSearchQuery('')}
                      className="text-xs font-bold text-[#0867c8] hover:underline"
                    >
                      Reset Search
                    </button>
                  </div>
                )}
              </div>
            </section>
          </ScrollReveal>

          {/* ===================================================== */}
          {/* RIGHT SIDEBAR */}
          {/* ===================================================== */}
          <ScrollReveal yOffset={28} delay={0.1} className="w-full">
            <aside ref={contactRef} id="contact" className="space-y-5 scroll-mt-24">
              {/* Immediate Help Card */}
              <div className="overflow-hidden rounded-3xl border border-blue-100 bg-white shadow-[0_8px_30px_rgba(15,76,129,0.07)]">
                <div className="bg-blue-50/80 p-5">
                  <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#0867c8] text-white shadow-md">
                      <Headphones className="h-7 w-7" />
                    </div>
                    <div>
                      <h3 className="font-serif text-lg font-bold text-[#092d67]">
                        Need Immediate Help?
                      </h3>
                      <p className="mt-1 text-xs text-slate-500">
                        Our friendly London care team is here for you.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="divide-y divide-blue-50 text-xs sm:text-sm">
                  {/* Call Us */}
                  <a
                    href="tel:+442012345678"
                    className="flex items-center gap-4 p-4 transition-colors hover:bg-blue-50/60"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[#0867c8]">
                      <Phone className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-[#092d67]">Call Us</p>
                      <p className="font-bold text-[#0867c8]">+44 20 1234 5678</p>
                      <p className="text-[11px] text-slate-500">Mon – Sun, 07:00 – 22:00</p>
                    </div>
                  </a>

                  {/* Email Us */}
                  <a
                    href="mailto:care@laundelle.co.uk"
                    className="flex items-center gap-4 p-4 transition-colors hover:bg-blue-50/60"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[#0867c8]">
                      <Mail className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-[#092d67]">Email Us</p>
                      <p className="font-bold text-[#0867c8]">care@laundelle.co.uk</p>
                      <p className="text-[11px] text-slate-500">We aim to respond within 2 hours</p>
                    </div>
                  </a>

                  {/* Live Chat Action */}
                  <button
                    type="button"
                    onClick={() => setIsLiveChatOpen(true)}
                    className="w-full flex items-center gap-4 p-4 text-left transition-colors hover:bg-blue-50/60 cursor-pointer"
                  >
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[#0867c8]">
                      <MessageSquare className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-[#092d67]">Live Chat</p>
                      <p className="text-xs text-slate-500">Chat with our team in real time</p>
                      <p className="text-[11px] font-semibold text-[#0867c8]">
                        Available 7 days a week
                      </p>
                    </div>
                    <span className="text-xl font-bold text-[#0867c8]">›</span>
                  </button>
                </div>
              </div>

              {/* Satisfaction Guarantee Card */}
              <div className="flex items-center gap-4 rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-5 transition duration-300 hover:-translate-y-1 hover:shadow-lg">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-[#0867c8] shadow-sm border border-blue-100">
                  <ShieldCheck className="h-6 w-6 text-[#0867c8]" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-xs sm:text-sm text-[#092d67]">
                    100% Satisfaction Guarantee
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    Your happiness is our priority. If something isn't right, we'll make it right
                    with a free re-wash.
                  </p>
                </div>
                <span className="text-xl text-[#0867c8]">›</span>
              </div>

              {/* Inspirational Slogan Card */}
              <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-50 to-blue-100/70 p-6 border border-blue-100">
                <div className="relative z-10 space-y-1">
                  <p className="font-serif text-lg italic text-[#0867c8] leading-tight">
                    "Fresh Solutions
                  </p>
                  <p className="font-serif text-lg italic text-[#0867c8] leading-tight font-bold">
                    for a Brighter You."
                  </p>
                  <p className="text-[11px] text-slate-500 pt-1">
                    Trusted by over 10,000+ London households.
                  </p>
                </div>
                <div className="pointer-events-none absolute -bottom-6 -right-2 text-6xl opacity-20">
                  🧺
                </div>
              </div>
            </aside>
          </ScrollReveal>
        </div>

        {/* ========================================================= */}
        {/* SUBMIT QUERY / ORDER ISSUE SECTION */}
        {/* ========================================================= */}
        <ScrollReveal yOffset={28} className="w-full">
          <section
            ref={submitQueryRef}
            id="submit-query"
            className="relative mt-12 overflow-hidden rounded-3xl border border-blue-100 bg-gradient-to-br from-white via-blue-50/40 to-blue-100/60 p-6 sm:p-8 lg:p-10 shadow-[0_8px_30px_rgba(15,76,129,0.07)] scroll-mt-24"
          >
            {/* Decorative background blur */}
            <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-blue-200/25 blur-3xl" />

            <div className="relative z-10">
              {/* Header */}
              <div>
                <span className="inline-flex items-center gap-2 rounded-lg bg-blue-100/70 px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#0867c8]">
                  <FileText className="h-4 w-4" />
                  <span>Submit a Query</span>
                </span>

                <h2 className="mt-3 font-serif text-2xl font-bold text-[#092d67] sm:text-3xl">
                  Submit an Order Issue or Garment Concern
                </h2>

                <p className="mt-1 text-xs sm:text-sm text-slate-500">
                  Every submission is backed by our 100% Satisfaction Guarantee. We review and
                  respond within 2 hours.
                </p>
              </div>

              {!submittedTicket ? (
                /* Complaint Form */
                <form onSubmit={handleSubmitComplaint} className="mt-8 space-y-6">
                  <div className="grid gap-6 lg:grid-cols-[1fr_1.35fr]">
                    {/* Select Order */}
                    <div>
                      <label className="mb-2 block text-xs sm:text-sm font-semibold text-[#092d67]">
                        Select Associated Order
                      </label>
                      <div className="relative">
                        <select
                          value={selectedOrderId}
                          onChange={(e) => setSelectedOrderId(e.target.value)}
                          className="h-12 w-full appearance-none rounded-xl border border-blue-200 bg-white px-4 pr-10 text-xs sm:text-sm text-slate-700 outline-hidden transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 cursor-pointer"
                        >
                          <option value="General">General Query (Not linked to specific order)</option>
                          {orders.map((o) => (
                            <option key={o.id} value={o.id}>
                              Order #{o.id} — {o.items[0]?.name || 'Laundry'} ({o.statusLabel})
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#0867c8]" />
                      </div>
                    </div>

                    {/* Issue Type Selector */}
                    <div>
                      <label className="mb-2 block text-xs sm:text-sm font-semibold text-[#092d67]">
                        Issue Type
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {issueTypes.map((type) => {
                          const isSelected = issueType === type;
                          return (
                            <button
                              key={type}
                              type="button"
                              onClick={() => setIssueType(type)}
                              className={`rounded-lg px-4 py-2.5 text-xs font-medium transition cursor-pointer ${isSelected
                                ? 'border border-blue-400 bg-blue-50 text-[#0867c8] font-bold shadow-2xs'
                                : 'border border-blue-100 bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50/50'
                                }`}
                            >
                              {isSelected ? `● ${type}` : type}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  <div>
                    <label className="mb-2 block text-xs sm:text-sm font-semibold text-[#092d67]">
                      Description of Issue <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <textarea
                        ref={descriptionRef}
                        maxLength={1000}
                        rows={5}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Please provide as much detail as possible about your order, collection or garment concern..."
                        className={`w-full resize-none rounded-xl border bg-white px-4 py-3.5 text-xs sm:text-sm text-slate-700 outline-hidden transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 ${showValidationWarning
                          ? 'border-red-400 ring-4 ring-red-100'
                          : 'border-blue-200'
                          }`}
                      />
                      <span className="absolute bottom-3 right-4 text-[11px] text-slate-400 font-mono">
                        {description.length}/1000
                      </span>
                    </div>
                    {showValidationWarning && (
                      <p className="mt-1 text-xs text-red-600 font-medium animate-pulse">
                        Please enter a description of the issue before submitting.
                      </p>
                    )}
                  </div>

                  {/* Bottom Row: Attach Photos & Submit Button */}
                  <div className="grid items-center gap-6 lg:grid-cols-[1fr_auto]">
                    {/* Photo Upload Box */}
                    <div>
                      <label className="mb-2 block text-xs sm:text-sm font-semibold text-[#092d67]">
                        Attach Photos{' '}
                        <span className="font-normal text-slate-500 text-xs">
                          (Optional but recommended for fabric/stain reviews)
                        </span>
                      </label>

                      <label className="flex min-h-[110px] cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-blue-200 bg-white px-5 text-center transition hover:border-blue-400 hover:bg-blue-50/60 relative">
                        <input
                          type="file"
                          multiple
                          accept="image/png,image/jpeg"
                          className="hidden"
                          onChange={handlePhotoUploadSim}
                        />
                        <div className="py-2">
                          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-[#0867c8]">
                            <Upload className="h-5 w-5" />
                          </div>
                          <p className="mt-2 text-xs sm:text-sm font-medium text-[#092d67]">
                            Click to upload photos
                          </p>
                          <p className="mt-1 text-[11px] text-slate-400">
                            {uploadedPhotos.length > 0
                              ? `${uploadedPhotos.length} photo(s) selected`
                              : 'PNG, JPG up to 10MB'}
                          </p>
                        </div>
                      </label>

                      {/* Previews of attached images */}
                      {uploadedPhotos.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-3">
                          {uploadedPhotos.map((url, idx) => (
                            <div key={idx} className="relative group">
                              <img
                                src={url}
                                alt="Uploaded evidence"
                                className="w-14 h-14 rounded-xl object-cover border border-blue-200 shadow-xs"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setUploadedPhotos((prev) => prev.filter((_, i) => i !== idx))
                                }
                                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px]"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Submit Button */}
                    <div className="lg:pt-6">
                      <button
                        type="submit"
                        disabled={isSubmittingTicket}
                        className="group flex w-full items-center justify-center gap-3 rounded-full bg-gradient-to-r from-blue-600 to-blue-500 px-8 py-4 text-xs sm:text-sm font-semibold text-white shadow-lg shadow-blue-200 transition hover:-translate-y-0.5 hover:from-blue-700 hover:to-blue-600 lg:min-w-[310px] cursor-pointer disabled:opacity-60"
                      >
                        <Send className="h-4 w-4" />
                        <span>
                          {isSubmittingTicket ? 'Submitting...' : 'Submit Complaint to Care Team'}
                        </span>
                        <span className="transition-transform group-hover:translate-x-1">→</span>
                      </button>
                    </div>
                  </div>
                </form>
              ) : (
                /* Success Confirmation Box */
                <div className="mt-8 rounded-2xl bg-white p-8 border border-emerald-200 text-center space-y-4 shadow-sm animate-in zoom-in-95">
                  <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-xs">
                    <CheckCircle2 className="w-8 h-8 stroke-[2.5]" />
                  </div>
                  <div className="space-y-1.5">
                    <span className="text-xs font-bold uppercase tracking-widest text-emerald-700 block">
                      Ticket Raised Successfully
                    </span>
                    <h3 className="text-2xl font-serif font-bold text-[#092d67]">
                      Ticket #{submittedTicket.id}
                    </h3>
                    <p className="text-xs sm:text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
                      Our customer care team has received your report for{' '}
                      <strong className="text-[#092d67]">{submittedTicket.issueType}</strong>. A
                      specialist will review your details and contact you within 2 business hours.
                    </p>
                  </div>

                  <div className="pt-3 flex flex-wrap justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setSubmittedTicket(null);
                        setDescription('');
                        setUploadedPhotos([]);
                      }}
                      className="bg-[#0867c8] hover:bg-[#0755a8] text-white px-6 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs"
                    >
                      Submit Another Query
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate('orders')}
                      className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-6 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer"
                    >
                      View Active Orders
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        </ScrollReveal>
      </main>

      {/* ========================================================= */}
      {/* SUCCESS TOAST */}
      {/* ========================================================= */}
      {showToast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-2xl bg-[#092d67] px-6 py-4 text-xs sm:text-sm font-medium text-white shadow-2xl animate-in slide-in-from-bottom-4 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          <span>Your query has been submitted successfully.</span>
        </div>
      )}

      {/* ========================================================= */}
      {/* INTERACTIVE LIVE CHAT MODAL */}
      {/* ========================================================= */}
      {isLiveChatOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs overflow-y-auto animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[560px] max-h-[85vh] sm:max-h-[90vh] border border-blue-100 my-auto">
            {/* Modal Header */}
            <div className="bg-[#092d67] text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-[#5ca8f5]">
                    <Headphones className="w-5 h-5" />
                  </div>
                  <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-400 rounded-full border-2 border-[#092d67]" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-bold leading-tight">Laundelle Care Team</h4>
                  <span className="text-[11px] text-blue-200">Online • 2-Min Response</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsLiveChatOpen(false)}
                className="text-white/80 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Chat Body Messages */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[#f8fcff]">
              {chatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'
                    }`}
                >
                  <div
                    className={`max-w-[85%] p-3.5 rounded-2xl text-xs sm:text-sm leading-relaxed ${msg.sender === 'user'
                      ? 'bg-[#0867c8] text-white rounded-tr-none shadow-xs'
                      : 'bg-white text-slate-800 border border-blue-100 rounded-tl-none shadow-xs'
                      }`}
                  >
                    {msg.text}
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 px-1">{msg.time}</span>
                </div>
              ))}
            </div>

            {/* Chat Input */}
            <form
              onSubmit={handleSendChat}
              className="p-3 bg-white border-t border-blue-100 flex items-center gap-2"
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask about collection, garments, or orders..."
                className="flex-1 px-4 py-2.5 bg-blue-50/50 border border-blue-100 rounded-xl text-xs sm:text-sm text-slate-800 focus:outline-hidden focus:border-blue-400 focus:bg-white transition"
              />
              <button
                type="submit"
                className="bg-[#0867c8] hover:bg-[#0755a8] text-white p-2.5 rounded-xl transition-colors cursor-pointer"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
