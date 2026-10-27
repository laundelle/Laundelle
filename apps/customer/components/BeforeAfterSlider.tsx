import React, { useState, useRef, useCallback, useEffect } from 'react';
import Image from 'next/image';
import {
  ArrowLeftRight,
  ArrowRight,
  Shirt,
  Sparkles,
  FlaskConical,
  ShieldCheck,
  Leaf,
  Droplets
} from 'lucide-react';
import { LAUNDELLE_IMAGES, getOptimizedImageUrl } from '@laundelle/config';

export interface BeforeAfterItem {
  id: string;
  title: string;
  category: string;
  subtitle: string;
  description: string;
  treatment: string;
  beforeImage?: string;
  afterImage?: string;
  imageUrl?: string;
  fallbackUrl?: string;
  iconType: 'shirt' | 'sneaker' | 'silk';
  targetServiceName?: string;
}

const DEFAULT_CASES: BeforeAfterItem[] = [
  {
    id: 'shirt',
    title: 'Formal Cotton Shirt',
    category: 'Stains Lift & Steam Press',
    subtitle: 'Defeats Tea, Coffee Stains',
    description: '100% stain lift and, crisp Indian cotton finish, bright optic white.',
    treatment: 'Eco-Enzyme Spotting + Steam Management',
    beforeImage: getOptimizedImageUrl(LAUNDELLE_IMAGES.galleryShirtBefore, { width: 900, quality: 'auto', format: 'auto' }),
    afterImage: getOptimizedImageUrl(LAUNDELLE_IMAGES.galleryShirtAfter, { width: 900, quality: 'auto', format: 'auto' }),
    imageUrl: getOptimizedImageUrl(LAUNDELLE_IMAGES.galleryShirtAfter, { width: 900, quality: 'auto', format: 'auto' }),
    fallbackUrl: 'https://images.unsplash.com/photo-1598033129183-c4f50c736f10?auto=format&fit=crop&w=1200&q=85',
    iconType: 'shirt',
    targetServiceName: 'Wash + Dry + Fold',
  },
  {
    id: 'sneakers',
    title: 'Designer Sneakers',
    category: 'Footwear Revival',
    subtitle: 'Defeats Street Grime & Oxidation',
    description: 'Ultrasonic sole clean, color brilliance revived, hydrophobic shield.',
    treatment: 'Ultrasonic Rush + Micro-Plush Treatment',
    beforeImage: getOptimizedImageUrl(LAUNDELLE_IMAGES.gallerySneakersBefore, { width: 900, quality: 'auto', format: 'auto' }),
    afterImage: getOptimizedImageUrl(LAUNDELLE_IMAGES.gallerySneakersAfter, { width: 900, quality: 'auto', format: 'auto' }),
    imageUrl: getOptimizedImageUrl(LAUNDELLE_IMAGES.gallerySneakersAfter, { width: 900, quality: 'auto', format: 'auto' }),
    fallbackUrl: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=85',
    iconType: 'sneaker',
    targetServiceName: 'Sneaker & Shoe Deep Clean',
  },
  {
    id: 'silk',
    title: 'Delicate Silk Wear',
    category: 'Organic Dry Clean',
    subtitle: 'Defeats Lipid & Sweat Rings',
    description: 'Silky tactile hand-feel, zero fiber bleed, fragrant hypoallergenic finish.',
    treatment: 'Hydrocarbon Wash + Hand Finish',
    beforeImage: getOptimizedImageUrl(LAUNDELLE_IMAGES.gallerySilkBefore, { width: 900, quality: 'auto', format: 'auto' }),
    afterImage: getOptimizedImageUrl(LAUNDELLE_IMAGES.gallerySilkAfter, { width: 900, quality: 'auto', format: 'auto' }),
    imageUrl: getOptimizedImageUrl(LAUNDELLE_IMAGES.gallerySilkAfter, { width: 900, quality: 'auto', format: 'auto' }),
    fallbackUrl: 'https://images.unsplash.com/photo-1539533018447-63fcce2678e3?auto=format&fit=crop&w=1200&q=85',
    iconType: 'silk',
    targetServiceName: 'Silk & Delicates Care',
  },
];

// Clean Sneaker Outline Icon matching reference image
const SneakerIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M3.5 14.5L7 9h4l3 2 4.5.5c1.4.2 2.5 1.4 2.5 2.8V17a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-1.5c0-.4.2-.7.5-1z" />
    <path d="M7 9v4" />
    <path d="M10 10v3" />
    <path d="M13 11v2" />
    <path d="M3 17h18" />
  </svg>
);

interface BeforeAfterCardProps {
  item: BeforeAfterItem;
  onBookPickup?: () => void;
  onBookService?: (serviceName: string) => void;
  className?: string;
}

// Individual Card with moveable before/after split slider
const BeforeAfterCard: React.FC<BeforeAfterCardProps> = ({ item, onBookPickup, onBookService, className = '' }) => {
  const [sliderPosition, setSliderPosition] = useState<number>(50);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback((clientX: number) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percentage = Math.max(5, Math.min(95, (x / rect.width) * 100));
    setSliderPosition(percentage);
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    updatePosition(e.clientX);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    setIsDragging(true);
    if (e.touches.length > 0) {
      updatePosition(e.touches[0].clientX);
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      updatePosition(e.clientX);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging || e.touches.length === 0) return;
      if (e.cancelable) {
        e.preventDefault();
      }
      e.stopPropagation();
      updatePosition(e.touches[0].clientX);
    };

    const handleEnd = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleEnd);
      window.addEventListener('touchmove', handleTouchMove, { passive: false });
      window.addEventListener('touchend', handleEnd);
      window.addEventListener('touchcancel', handleEnd);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleEnd);
      window.removeEventListener('touchcancel', handleEnd);
    };
  }, [isDragging, updatePosition]);

  const afterSrc = item.afterImage || item.imageUrl || item.fallbackUrl || '';
  const beforeSrc = item.beforeImage || item.imageUrl || item.fallbackUrl || '';

  return (
    <div
      className={`w-full flex flex-col justify-between bg-white rounded-[28px] sm:rounded-[32px] p-5 sm:p-6 pb-6 border border-blue-100/80 shadow-[0_12px_35px_rgba(0,102,245,0.06)] hover:shadow-[0_18px_45px_rgba(0,102,245,0.11)] transition-all duration-300 ${className}`}
    >
      {/* Top Header Row: Category Badge + Move Slider Pill */}
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="px-3 py-1 rounded-full bg-[#eef6ff] text-[#0066f5] text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider">
            {item.category}
          </span>
          <div className="px-2.5 py-1 rounded-full border border-blue-200/90 bg-white text-[#0066f5] text-[10px] sm:text-[11px] font-bold flex items-center gap-1.5 shadow-2xs select-none">
            <ArrowLeftRight className="w-3 h-3 text-[#0066f5]" />
            <span>Move slider</span>
          </div>
        </div>

        {/* Card Title */}
        <h3 className="text-lg sm:text-xl font-black text-[#0a192f] tracking-tight mt-3 mb-4">
          {item.title}
        </h3>

        {/* Moveable Image Comparison Window: 2 Images (Right = Full Color, Left = Grayscale) */}
        <div
          ref={cardRef}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          className="relative w-full h-[270px] sm:h-[300px] rounded-2xl overflow-hidden select-none cursor-ew-resize group touch-none border border-slate-100 shadow-inner bg-slate-100"
        >
          {/* RIGHT SIDE (BASE LAYER) -> AFTER: FULL VIBRANT COLOUR */}
          <div className="absolute inset-0 w-full h-full">
            <Image
              src={afterSrc}
              alt={`${item.title} - After (Colour)`}
              fill
              loading="lazy"
              sizes="(max-width: 768px) 100vw, 33vw"
              className="object-cover object-center pointer-events-none brightness-105 saturate-110"
              draggable={false}
            />
          </div>

          {/* LEFT SIDE (CLIPPED LAYER) -> BEFORE: GRAYSCALE */}
          <div
            className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none"
            style={{
              clipPath: `polygon(0 0, ${sliderPosition}% 0, ${sliderPosition}% 100%, 0 100%)`,
            }}
          >
            <Image
              src={beforeSrc}
              alt={`${item.title} - Before (Grayscale)`}
              fill
              loading="lazy"
              sizes="(max-width: 768px) 100vw, 33vw"
              className="object-cover object-center pointer-events-none filter contrast-125 brightness-85"
              draggable={false}
            />
            {/* Subtle multiply tint to accentuate stain depth */}
            <div className="absolute inset-0 bg-black/10 pointer-events-none" />
          </div>

          {/* Bottom Left BEFORE Tag */}
          <span className="absolute bottom-3 left-3 z-10 text-[10px] font-extrabold uppercase tracking-wider text-white bg-black/75 backdrop-blur-xs px-2.5 py-1 rounded-md pointer-events-none select-none shadow-sm">
            BEFORE
          </span>

          {/* Bottom Right AFTER Tag */}
          <span className="absolute bottom-3 right-3 z-10 text-[10px] font-extrabold uppercase tracking-wider text-white bg-[#0066f5] px-2.5 py-1 rounded-md pointer-events-none select-none shadow-sm">
            AFTER
          </span>

          {/* Moveable Divider Line & Handle Knob */}
          <div
            className="absolute top-0 bottom-0 z-20 pointer-events-none flex items-center justify-center -translate-x-1/2"
            style={{ left: `${sliderPosition}%` }}
          >
            {/* White Vertical Line */}
            <div className="w-[2px] h-full bg-white shadow-[0_0_8px_rgba(0,0,0,0.4)]" />

            {/* Circular Handle Knob with Arrow */}
            <div className="absolute top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white text-[#0066f5] shadow-xl flex items-center justify-center border border-blue-200 pointer-events-auto cursor-grab active:cursor-grabbing hover:scale-108 transition-transform">
              <ArrowLeftRight className="w-3.5 h-3.5 text-[#0066f5] stroke-[2.4]" />
            </div>
          </div>
        </div>

        {/* Feature Row Below Image */}
        <div className="mt-4 sm:mt-5 flex items-start gap-3.5">
          {/* Circular Icon Container */}
          <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-[#eff6ff] text-[#0066f5] flex items-center justify-center shrink-0 border border-blue-100/90 shadow-2xs mt-0.5">
            {item.iconType === 'shirt' && <Shirt className="w-5 h-5 text-[#0066f5] stroke-[1.8]" />}
            {item.iconType === 'sneaker' && <SneakerIcon className="w-5 h-5 text-[#0066f5]" />}
            {item.iconType === 'silk' && <Droplets className="w-5 h-5 text-[#0066f5] stroke-[1.8]" />}
          </div>

          {/* Title and Description */}
          <div className="min-w-0">
            <h4 className="text-sm font-extrabold text-[#0a192f] leading-snug">
              {item.subtitle}
            </h4>
            <p className="text-xs text-gray-500 font-medium leading-relaxed mt-1">
              {item.description}
            </p>
          </div>
        </div>
      </div>

      {/* Bottom Action Row: Treatment Technique + Book Button */}
      <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
        <span className="text-[11px] text-gray-400 font-medium truncate max-w-[62%]">
          {item.treatment}
        </span>
        <button
          type="button"
          onClick={() => {
            if (onBookService && item.targetServiceName) {
              onBookService(item.targetServiceName);
            } else if (onBookPickup) {
              onBookPickup();
            }
          }}
          className="bg-[#0066f5] hover:bg-[#0052cc] active:scale-95 text-white px-5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm hover:shadow-md cursor-pointer flex items-center gap-1.5 shrink-0"
        >
          <span>Book</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

interface BeforeAfterSliderProps {
  onBookPickup?: () => void;
  onBookService?: (serviceName: string) => void;
  items?: BeforeAfterItem[];
}

export const BeforeAfterSlider: React.FC<BeforeAfterSliderProps> = ({
  onBookPickup,
  onBookService,
  items = DEFAULT_CASES,
}) => {
  const displayItems = items.slice(0, 3);

  return (
    <section className="w-full bg-gradient-to-b from-[#f3f8fe] via-[#f7fbfe] to-[#edf5ff] py-12 sm:py-16 px-4 sm:px-8 md:px-12 lg:px-16 overflow-hidden relative border-y border-blue-100/60">
      {/* Soft Ambient Light Glows */}
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-blue-200/25 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-sky-200/20 rounded-full blur-3xl pointer-events-none" />

      {/* Header Info Section */}
      <div className="w-full max-w-7xl mx-auto mb-8 sm:mb-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          {/* Left Column: Eyebrow, Headline & Subtitle */}
          <div className="max-w-2xl">
            {/* Top Eyebrow with Dash */}
            <div className="flex items-center gap-2 mb-2">
              <span className="w-6 h-0.5 bg-[#0066f5] rounded-full inline-block" />
              <span className="text-xs font-black uppercase tracking-[0.18em] text-[#0066f5]">
                Interactive Garment Transformation
              </span>
            </div>

            {/* Main Title */}
            <h2 className="text-3xl sm:text-4xl lg:text-[46px] font-black text-[#0a192f] tracking-tight leading-[1.12]">
              Before &amp; After <span className="text-[#0066f5]">Clean Gallery</span>
            </h2>

            {/* Subtitle */}
            <p className="text-sm sm:text-base text-gray-500 font-medium leading-relaxed mt-3">
              Drag the interactive slider on any card to compare stained and dull fabrics against our spotlessly revived finish.
            </p>
          </div>

          {/* Right Column: Decorative 'Same Clothes Brighter Days' Badge */}
          <div className="hidden md:flex items-center gap-3.5 select-none shrink-0 self-end md:self-center">
            {/* Light Blue Circle with T-shirt and Sparkles */}
            <div className="relative w-16 h-16 rounded-full bg-[#dbeafe]/80 border border-blue-200/60 flex items-center justify-center shadow-xs">
              <Shirt className="w-8 h-8 text-[#0066f5] fill-[#bfdbfe]/60 stroke-[1.8]" />
              <Sparkles className="w-4 h-4 text-[#0066f5] absolute -top-1 -right-0.5 animate-pulse" />
            </div>

            {/* Playful Handwritten Slogan */}
            <div className="flex flex-col -rotate-3 text-[#0066f5]">
              <span className="font-serif italic font-extrabold text-base leading-tight">
                Same Clothes
              </span>
              <span className="font-serif italic font-extrabold text-base leading-tight">
                Brighter Days
              </span>
              <svg className="w-20 h-3 text-[#0066f5] -mt-0.5" viewBox="0 0 70 10" fill="none">
                <path
                  d="M2 3C22 9 48 9 68 3"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* 3 Transformation Cards Grid */}
      <div className="w-full max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {displayItems.map((item) => (
            <BeforeAfterCard
              key={item.id}
              item={item}
              onBookPickup={onBookPickup}
              onBookService={onBookService}
            />
          ))}
        </div>
      </div>
    </section>
  );
};
