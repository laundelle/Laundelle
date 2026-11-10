import { apiFetch } from '@laundelle/api-client';
import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { LAUNDELLE_IMAGES, getOptimizedImageUrl } from '@laundelle/config';
import {
  Sparkles,
  Paperclip,
  Mic,
  MicOff,
  SendHorizontal,
  CalendarCheck2,
  Package,
  Star,
  Headphones,
  CheckCircle2,
  User,
  ArrowRight,
  X
} from 'lucide-react';
import { ServiceItem } from '@laundelle/types';

interface AIAssistantViewProps {
  onOpenSchedulePickup: () => void;
  services?: ServiceItem[];
}

interface ChatMessage {
  id: string;
  sender: 'bot' | 'user';
  text?: string;
  isInitialGreeting?: boolean;
  isInitialServiceResponse?: boolean;
  richContent?: React.ReactNode;
  time: string;
  status?: 'sent' | 'delivered' | 'read';
}

// Crisp Clothes Hanger Icon matching reference screenshot
const HangerIcon: React.FC<{ className?: string }> = ({ className = "w-5 h-5 text-[#01BEFE]" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 3a2.5 2.5 0 0 1 2.5 2.5c0 1.1-.7 2.1-1.8 2.4L3.8 14.8A2 2 0 0 0 5.4 18h13.2a2 2 0 0 0 1.6-3.2L12.7 7.9" />
  </svg>
);

export const AIAssistantView: React.FC<AIAssistantViewProps> = ({
  onOpenSchedulePickup,
  services: _services,
}) => {
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [attachedFileName, setAttachedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initial message: only greeting and quick questions shown at first
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-greeting',
      sender: 'bot',
      isInitialGreeting: true,
      time: '10:24 AM',
    },
  ]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const quickQuestions = [
    {
      id: 'q1',
      text: 'What services do you offer?',
      icon: <HangerIcon className="w-5 h-5 text-[#01BEFE] shrink-0" />,
    },
    {
      id: 'q2',
      text: 'How do I book a service?',
      icon: <CalendarCheck2 className="w-5 h-5 text-[#01BEFE] shrink-0" />,
    },
    {
      id: 'q3',
      text: 'Where is my order?',
      icon: <Package className="w-5 h-5 text-[#01BEFE] shrink-0" />,
    },
    {
      id: 'q4',
      text: 'What are your prices?',
      icon: (
        <span className="w-5 h-5 rounded-full bg-[#01BEFE] text-white flex items-center justify-center text-[11px] font-bold shrink-0">
          %
        </span>
      ),
    },
    {
      id: 'q5',
      text: 'Do you have any offers?',
      icon: <Star className="w-5 h-5 text-[#01BEFE] fill-[#01BEFE] shrink-0" />,
    },
    {
      id: 'q6',
      text: 'I need customer support',
      icon: <Headphones className="w-5 h-5 text-[#01BEFE] shrink-0" />,
    },
  ];

  const handleSendMessage = async (userText: string) => {
    if (!userText.trim() && !attachedFileName) return;

    const currentFormattedTime = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: 'numeric',
      hour12: true,
    }).format(new Date());

    const messageText = userText.trim();
    const newMsgId = 'user-' + Date.now();

    const userMessage: ChatMessage = {
      id: newMsgId,
      sender: 'user',
      text: attachedFileName ? `${messageText} [Attached: ${attachedFileName}]` : messageText,
      time: currentFormattedTime,
      status: 'read',
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText('');
    setAttachedFileName(null);
    setIsTyping(true);

    // Provide tailored answers for predefined prompts or call Gemini
    const lower = messageText.toLowerCase();

    try {
      if (lower.includes('what services') || lower.includes('service do you offer')) {
        setTimeout(() => {
          setIsTyping(false);
          setMessages((prev) => [
            ...prev,
            {
              id: 'bot-' + Date.now(),
              sender: 'bot',
              isInitialServiceResponse: true,
              time: currentFormattedTime,
            },
          ]);
        }, 700);
        return;
      }

      if (lower.includes('how do i book') || lower.includes('book a service')) {
        setTimeout(() => {
          setIsTyping(false);
          setMessages((prev) => [
            ...prev,
            {
              id: 'bot-' + Date.now(),
              sender: 'bot',
              time: currentFormattedTime,
              richContent: (
                <div className="space-y-3">
                  <p className="font-medium">Booking with Laundelle is simple in 3 easy steps:</p>
                  <div className="space-y-2 text-[13.5px]">
                    <div className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-[#01BEFE] text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
                      <span><strong>Select your service</strong> & choose Wash & Fold, Dry Cleaning, or Ironing.</span>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-[#01BEFE] text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
                      <span><strong>Pick a collection slot</strong> that fits your schedule. Our drivers come straight to your doorstep.</span>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-[#01BEFE] text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
                      <span><strong>Receive fresh, crisp clothes</strong> delivered back in under 24 hours.</span>
                    </div>
                  </div>
                  <div className="pt-2">
                    <button
                      onClick={onOpenSchedulePickup}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#01BEFE] text-white text-xs font-semibold hover:bg-[#00a6e0] transition shadow-xs cursor-pointer"
                    >
                      <span>Schedule a Pickup Now</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ),
            },
          ]);
        }, 700);
        return;
      }

      if (lower.includes('where is my order') || lower.includes('track')) {
        setTimeout(() => {
          setIsTyping(false);
          setMessages((prev) => [
            ...prev,
            {
              id: 'bot-' + Date.now(),
              sender: 'bot',
              time: currentFormattedTime,
              richContent: (
                <div className="space-y-2">
                  <p>You can track live order updates directly in your <strong>Orders</strong> tab.</p>
                  <p className="text-gray-600 text-[13.5px]">
                    Our driver tracking provides real-time GPS collection, wash cycle progress, and delivery window notifications.
                  </p>
                  <p className="text-xs text-blue-600 font-medium">💡 Need assistance with a specific order number? Enter your order ID here!</p>
                </div>
              ),
            },
          ]);
        }, 700);
        return;
      }

      if (lower.includes('price') || lower.includes('pricing') || lower.includes('cost')) {
        setTimeout(() => {
          setIsTyping(false);
          setMessages((prev) => [
            ...prev,
            {
              id: 'bot-' + Date.now(),
              sender: 'bot',
              time: currentFormattedTime,
              richContent: (
                <div className="space-y-2.5">
                  <p className="font-semibold text-gray-900">Here are our transparent starting prices:</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[13px]">
                    <div className="p-2.5 bg-white rounded-xl border border-blue-100">
                      <span className="font-bold text-gray-900 block">Wash & Fold</span>
                      <span className="text-blue-600 font-semibold">From £3.50 / kg</span>
                    </div>
                    <div className="p-2.5 bg-white rounded-xl border border-blue-100">
                      <span className="font-bold text-gray-900 block">Dry Cleaning</span>
                      <span className="text-blue-600 font-semibold">Shirts £2.80 | Suits £12.50</span>
                    </div>
                    <div className="p-2.5 bg-white rounded-xl border border-blue-100">
                      <span className="font-bold text-gray-900 block">Steam Ironing</span>
                      <span className="text-blue-600 font-semibold">From £1.75 / item</span>
                    </div>
                    <div className="p-2.5 bg-white rounded-xl border border-blue-100">
                      <span className="font-bold text-gray-900 block">Duvets & Bulky</span>
                      <span className="text-blue-600 font-semibold">From £16.00</span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">Free collection and delivery on all orders over £25!</p>
                </div>
              ),
            },
          ]);
        }, 700);
        return;
      }

      if (lower.includes('offer') || lower.includes('discount') || lower.includes('promo')) {
        setTimeout(() => {
          setIsTyping(false);
          setMessages((prev) => [
            ...prev,
            {
              id: 'bot-' + Date.now(),
              sender: 'bot',
              time: currentFormattedTime,
              richContent: (
                <div className="space-y-2">
                  <p className="font-semibold text-gray-900">🎉 Today's Exclusive Offers:</p>
                  <div className="p-3 bg-white rounded-xl border border-blue-200 shadow-2xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#01BEFE] tracking-wider text-xs bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">FIRSTWASH20</span>
                      <span className="text-xs font-semibold text-green-600">Save 20%</span>
                    </div>
                    <p className="text-xs text-gray-600">20% off your very first laundry or dry cleaning order.</p>
                  </div>
                </div>
              ),
            },
          ]);
        }, 700);
        return;
      }

      if (lower.includes('customer support') || lower.includes('support') || lower.includes('help')) {
        setTimeout(() => {
          setIsTyping(false);
          setMessages((prev) => [
            ...prev,
            {
              id: 'bot-' + Date.now(),
              sender: 'bot',
              time: currentFormattedTime,
              richContent: (
                <div className="space-y-2 text-[13.5px]">
                  <p className="font-medium text-gray-900">Our customer care team is here 7 days a week:</p>
                  <ul className="space-y-1 text-gray-600 text-xs">
                    <li>📞 Phone: <strong>+44 800 123 4567</strong> (8am - 8pm)</li>
                    <li>💬 WhatsApp: Instant 24/7 priority chat</li>
                    <li>📧 Email: <strong>care@laundelle.com</strong></li>
                  </ul>
                  <p className="text-xs text-gray-500 pt-1">You can also visit the Support tab for ticket status.</p>
                </div>
              ),
            },
          ]);
        }, 700);
        return;
      }

      // Default: Call backend Gemini API with rich fallback
      const response = await apiFetch('/api/gemini/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: messageText, queryType: 'ask' }),
      });

      const data = await response.json();
      setIsTyping(false);

      const replyText =
        (data.success && data.response) ||
        data.fallbackResponse ||
        "I'm here to help you with all your laundry, dry cleaning, and garment care needs! Would you like to book a service or learn more about our options?";

      setMessages((prev) => [
        ...prev,
        {
          id: 'bot-' + Date.now(),
          sender: 'bot',
          text: replyText,
          time: currentFormattedTime,
        },
      ]);
    } catch (err) {
      console.error('Chat error:', err);
      setIsTyping(false);
      setMessages((prev) => [
        ...prev,
        {
          id: 'bot-' + Date.now(),
          sender: 'bot',
          text: "I'm here to make laundry effortless! Let me know if you'd like to schedule a pickup or ask about fabric care.",
          time: currentFormattedTime,
        },
      ]);
    }
  };

  const handleMicClick = () => {
    if (isListening) {
      setIsListening(false);
      return;
    }

    if (typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      try {
        const SpeechRecognition =
          (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.lang = 'en-US';
        recognition.continuous = false;
        recognition.interimResults = false;

        recognition.onstart = () => setIsListening(true);
        recognition.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          setInputText(transcript);
          setIsListening(false);
        };
        recognition.onerror = () => setIsListening(false);
        recognition.onend = () => setIsListening(false);
        recognition.start();
      } catch (e) {
        setIsListening(false);
        setInputText('What services do you offer?');
      }
    } else {
      // Fallback if browser doesn't support Web Speech API
      setInputText('What services do you offer?');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setAttachedFileName(e.target.files[0].name);
    }
  };

  return (
    <div className="w-full h-[calc(100dvh-140px)] sm:h-[calc(100dvh-148px)] lg:h-[calc(100vh-80px)] overflow-hidden bg-white p-0 flex justify-center">
      {/* Full Screen White Container - No borders, no outer margins, no border-radius */}
      <div className="w-full max-w-full h-full bg-white border-0 rounded-none px-3 py-2 sm:px-8 sm:py-4 lg:px-12 lg:py-5 shadow-none flex flex-col overflow-hidden relative">
        {/* Top Centered Session Date Badge */}
        <div className="shrink-0 flex justify-center mb-1.5 sm:mb-4">
          <div className="inline-flex items-center gap-1 px-2.5 py-0.5 sm:px-4 sm:py-1.5 rounded-full bg-[#f8fafc] border border-[#e2e8f0] text-[#4b5563] text-[10px] sm:text-xs font-medium shadow-2xs">
            <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#01BEFE]" />
            <span>Today</span>
          </div>
        </div>

        {/* Conversation Stream - Scrolls vertically (centered on large PC screens) */}
        <div className="flex-1 min-h-0 space-y-2.5 sm:space-y-6 overflow-y-auto pr-0.5 sm:pr-2.5 custom-scrollbar w-full max-w-5xl mx-auto">
          {/* 1. First Bot Greeting Bubble */}
          <div className="flex items-start gap-2 sm:gap-3.5 max-w-full sm:max-w-3xl">
            {/* Laundellee Avatar: increased size for clear visibility */}
            <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-full overflow-hidden shrink-0 border border-white/90 shadow-xs relative bg-[#e6f8ff] flex items-center justify-center">
              <Image
                src={getOptimizedImageUrl(LAUNDELLE_IMAGES.aiGirlFace, { width: 120, quality: 'auto', format: 'auto' })}
                alt="Laundellee"
                fill
                sizes="48px"
                className="object-cover object-center scale-125"
              />
            </div>

            {/* Bubble Content - fits content, max 700px */}
            <div className="space-y-2 sm:space-y-4 w-fit max-w-[90%] sm:max-w-[700px]">
              <div className="bg-[#f8fafc] text-[#1e293b] rounded-xl sm:rounded-[18px] rounded-tl-xs px-2.5 py-2 sm:px-5 sm:py-4 shadow-2xs space-y-1 sm:space-y-2 leading-relaxed text-[11px] sm:text-[14.5px] min-h-[40px] sm:min-h-[60px] w-fit">
                <p className="font-normal">Hi there! 👋</p>
                <p className="font-bold text-gray-900 text-[12px] sm:text-[15px]">I'm Laundellee, your AI Assistant.</p>
                <p className="text-gray-700 text-[11px] sm:text-[14px]">
                  I'm here to help you with bookings, service details, pricing, orders, offers and anything related to laundry.
                </p>
                <p className="font-bold text-gray-900 pt-0.5 text-[11px] sm:text-[14px]">
                  How can I help you today? 💙
                </p>
              </div>

              {/* Quick Questions Section */}
              <div className="pt-0.5">
                <p className="text-[10px] sm:text-[13px] text-gray-500 font-normal mb-1.5 sm:mb-3">
                  Here are some quick things you can ask:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 sm:gap-3">
                  {quickQuestions.map((q) => (
                    <button
                      key={q.id}
                      onClick={() => handleSendMessage(q.text)}
                      className="bg-white border border-[#dbeafe] hover:border-[#01BEFE]/60 hover:shadow-xs rounded-lg sm:rounded-2xl px-2.5 py-1.5 sm:px-4 sm:py-3.5 flex items-center gap-2 sm:gap-3 text-left text-[11px] sm:text-[13.5px] font-normal text-gray-800 transition-all cursor-pointer group"
                    >
                      <span className="scale-80 sm:scale-100 origin-left shrink-0">{q.icon}</span>
                      <span className="leading-snug group-hover:text-[#01BEFE] transition-colors">{q.text}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Dynamic Follow-up Messages */}
          {messages.slice(1).map((msg) => {
            const isUser = msg.sender === 'user';

            if (isUser) {
              return (
                <div key={msg.id} className="flex flex-col items-end gap-0.5 sm:gap-1 pt-1 sm:pt-2">
                  <div className="flex items-center gap-1.5 sm:gap-3 justify-end max-w-full">
                    {/* User bubble: smaller font and padding on mobile */}
                    <div className="bg-[#01BEFE] text-white px-2.5 py-1.5 sm:px-[18px] sm:py-[14px] rounded-xl sm:rounded-[18px] rounded-br-xs text-[11px] sm:text-[14.5px] font-normal shadow-2xs w-fit max-w-[85%] sm:max-w-[550px] lg:max-w-[600px] leading-relaxed">
                      {msg.text}
                    </div>
                    {/* User Avatar */}
                    <div className="w-6 h-6 sm:w-10 sm:h-10 rounded-full bg-[#dbeafe] text-[#64748b] flex items-center justify-center shrink-0 border border-blue-100">
                      <User className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-gray-500" />
                    </div>
                  </div>
                  {/* Timestamp with double checkmark */}
                  <div className="flex items-center gap-1 text-[9px] sm:text-[11px] text-gray-400 pr-8 sm:pr-12">
                    <span>{msg.time}</span>
                    <span className="text-[#01BEFE] font-bold text-[10px] sm:text-xs tracking-tighter">✓✓</span>
                  </div>
                </div>
              );
            }

            // Laundellee Response: Avatar increased size for clear visibility
            return (
              <div key={msg.id} className="flex items-start gap-2 sm:gap-3.5 max-w-full pt-1">
                {/* Laundellee Avatar: increased size for clear visibility */}
                <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-full overflow-hidden shrink-0 border border-white/90 shadow-xs relative bg-[#e6f8ff] flex items-center justify-center">
                  <Image
                    src={getOptimizedImageUrl(LAUNDELLE_IMAGES.aiGirlFace, { width: 120, quality: 'auto', format: 'auto' })}
                    alt="Laundellee"
                    fill
                    sizes="48px"
                    className="object-cover object-center scale-125"
                  />
                </div>

                <div className="space-y-0.5 sm:space-y-1 w-fit max-w-[90%] sm:max-w-[650px] lg:max-w-[700px]">
                  <div className="bg-[#f8fafc] text-[#1e293b] rounded-xl sm:rounded-[18px] rounded-tl-xs px-2.5 py-2 sm:px-5 sm:py-4 shadow-2xs space-y-1.5 sm:space-y-2.5 leading-relaxed text-[11px] sm:text-[14.5px] min-h-[38px] sm:min-h-[60px] w-fit inline-block">
                    {msg.isInitialServiceResponse ? (
                      <>
                        <p className="text-gray-800 font-medium">We offer a wide range of laundry and fabric care services:</p>
                        <div className="space-y-1 sm:space-y-2 pt-0.5 text-[10.5px] sm:text-[14px]">
                          <div className="flex items-start gap-1.5 sm:gap-2.5">
                            <CheckCircle2 className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-[#01BEFE] fill-[#01BEFE]/15 shrink-0 mt-0.5" />
                            <span><strong>Wash & Fold</strong> – Everyday laundry, fresh and clean</span>
                          </div>
                          <div className="flex items-start gap-1.5 sm:gap-2.5">
                            <CheckCircle2 className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-[#01BEFE] fill-[#01BEFE]/15 shrink-0 mt-0.5" />
                            <span><strong>Dry Cleaning</strong> – For your delicate and premium clothes</span>
                          </div>
                          <div className="flex items-start gap-1.5 sm:gap-2.5">
                            <CheckCircle2 className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-[#01BEFE] fill-[#01BEFE]/15 shrink-0 mt-0.5" />
                            <span><strong>Steam Ironing</strong> – Crisp, neat and ready to wear</span>
                          </div>
                          <div className="flex items-start gap-1.5 sm:gap-2.5">
                            <CheckCircle2 className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-[#01BEFE] fill-[#01BEFE]/15 shrink-0 mt-0.5" />
                            <span><strong>Special Care</strong> – Sarees, leather, bedding, curtains and more</span>
                          </div>
                        </div>
                        <p className="text-gray-800 pt-1 font-normal">
                          Would you like to book a service or know more about any specific service? 💙
                        </p>
                      </>
                    ) : msg.richContent ? (
                      msg.richContent
                    ) : (
                      <p className="whitespace-pre-line text-gray-800">{msg.text}</p>
                    )}
                  </div>
                  {/* Timestamp below bubble */}
                  <div className="text-[9px] sm:text-[11px] text-gray-400 pl-1">
                    {msg.time}
                  </div>
                </div>
              </div>
            );
          })}

          {/* Typing Indicator */}
          {isTyping && (
            <div className="flex items-start gap-2 sm:gap-3.5 max-w-md pt-1">
              <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-full overflow-hidden shrink-0 border border-white/90 shadow-xs relative bg-[#e6f8ff] flex items-center justify-center">
                <Image
                  src={getOptimizedImageUrl(LAUNDELLE_IMAGES.aiGirlFace, { width: 120, quality: 'auto', format: 'auto' })}
                  alt="Laundellee"
                  fill
                  sizes="48px"
                  className="object-cover object-center scale-125"
                />
              </div>
              <div className="bg-[#f8fafc] rounded-xl sm:rounded-[18px] rounded-tl-xs px-2.5 py-1.5 sm:px-4 sm:py-3 shadow-2xs flex items-center gap-1 text-[10px] sm:text-xs text-gray-500">
                <span className="w-1 h-1 sm:w-2 sm:h-2 rounded-full bg-[#01BEFE] animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1 h-1 sm:w-2 sm:h-2 rounded-full bg-[#01BEFE] animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1 h-1 sm:w-2 sm:h-2 rounded-full bg-[#01BEFE] animate-bounce" style={{ animationDelay: '300ms' }} />
                <span className="pl-0.5 text-gray-500 text-[10px] sm:text-xs">Laundellee is typing...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Attachment Pill Preview if any */}
        {attachedFileName && (
          <div className="shrink-0 mt-1.5 sm:mt-3 flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg sm:rounded-xl px-2 py-1 sm:px-3 sm:py-1.5 text-[10px] sm:text-xs text-blue-700 w-full max-w-5xl mx-auto">
            <span className="flex items-center gap-1 truncate">
              <Paperclip className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span>Attached: <strong>{attachedFileName}</strong></span>
            </span>
            <button
              onClick={() => setAttachedFileName(null)}
              className="p-0.5 hover:text-blue-900 cursor-pointer"
            >
              <X className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            </button>
          </div>
        )}

        {/* Bottom Chat Input Bar matching reference */}
        <div className="shrink-0 mt-1.5 sm:mt-4 pt-1 w-full max-w-5xl mx-auto">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage(inputText);
            }}
            className="w-full bg-white border border-gray-200/90 rounded-xl sm:rounded-full px-2.5 py-1 sm:px-5 sm:py-2.5 shadow-2xs flex items-center gap-1.5 sm:gap-3 transition-all focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100"
          >
            {/* Hidden File Input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
            />

            {/* Paperclip Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-1 sm:p-1.5 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer rounded-full hover:bg-gray-100"
              title="Attach garment image or care tag"
            >
              <Paperclip className="w-3.5 h-3.5 sm:w-5 sm:h-5 transform -rotate-45" />
            </button>

            {/* Main Text Input */}
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Type your message here..."
              className="flex-1 bg-transparent border-none outline-hidden text-[11.5px] sm:text-[14.5px] text-gray-800 placeholder-gray-400 py-0.5 sm:py-1"
            />

            {/* Microphone Button */}
            <button
              type="button"
              onClick={handleMicClick}
              className={`p-1 sm:p-1.5 transition-colors cursor-pointer rounded-full ${isListening
                  ? 'text-red-500 bg-red-50 animate-pulse'
                  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                }`}
              title={isListening ? 'Listening...' : 'Voice input'}
            >
              {isListening ? <MicOff className="w-3.5 h-3.5 sm:w-5 sm:h-5" /> : <Mic className="w-3.5 h-3.5 sm:w-5 sm:h-5" />}
            </button>

            {/* Circular Blue Send Button */}
            <button
              type="submit"
              disabled={!inputText.trim() && !attachedFileName}
              className={`w-7 h-7 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all shadow-xs cursor-pointer ${inputText.trim() || attachedFileName
                  ? 'bg-[#01BEFE] hover:bg-[#00a6e0] text-white hover:scale-105 active:scale-95'
                  : 'bg-[#01BEFE] text-white hover:bg-[#00a6e0]'
                }`}
              title="Send message"
            >
              <SendHorizontal className="w-3 h-3 sm:w-5 sm:h-5 text-white ml-0.5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
