import React from 'react';

export const AppDownloadBanner: React.FC = () => {
  return (
    <div className="w-full max-w-7xl mx-auto overflow-hidden shadow-2xl bg-[#002953] rounded-3xl">
      <style>{`
        /* ========================================
           LAUNDELLE APP DOWNLOAD SECTION
        ======================================== */

        .app-section {
          background:
            radial-gradient(
              circle at 75% 35%,
              rgba(24, 119, 217, 0.20),
              transparent 32%
            ),
            radial-gradient(
              circle at 15% 10%,
              rgba(18, 200, 244, 0.08),
              transparent 28%
            ),
            #002953;
        }

        /* ----------------------------------------
           Animations
        ---------------------------------------- */

        @keyframes floatPhone {
          0%, 100% { transform: translateY(0) rotate(1deg); }
          50% { transform: translateY(-14px) rotate(-1deg); }
        }
        .phone-float { animation: floatPhone 5s ease-in-out infinite; }

        @keyframes dropFloat {
          0%, 100% { transform: translateY(0) scale(1); opacity: .7; }
          50% { transform: translateY(-15px) scale(1.08); opacity: 1; }
        }
        .water-drop { animation: dropFloat 3s ease-in-out infinite; }
        .water-drop:nth-child(2) { animation-delay: .7s; }
        .water-drop:nth-child(3) { animation-delay: 1.4s; }

        @keyframes sparkle {
          0%, 100% { opacity: .2; transform: scale(.7); }
          50% { opacity: 1; transform: scale(1.2); }
        }
        .sparkle { animation: sparkle 2.5s ease-in-out infinite; }
        .sparkle:nth-child(2) { animation-delay: .5s; }
        .sparkle:nth-child(3) { animation-delay: 1s; }

        @keyframes bubble {
          0% { transform: translateY(15px); opacity: 0; }
          30% { opacity: .7; }
          100% { transform: translateY(-70px); opacity: 0; }
        }
        .bubble { animation: bubble 5s ease-in infinite; }
        .bubble:nth-child(2) { animation-delay: 1.2s; }
        .bubble:nth-child(3) { animation-delay: 2.4s; }

        @keyframes waveOne {
          from { transform: translateX(-25px); }
          to { transform: translateX(25px); }
        }
        @keyframes waveTwo {
          from { transform: translateX(25px); }
          to { transform: translateX(-25px); }
        }
        @keyframes waveThree {
          from { transform: translateX(-15px); }
          to { transform: translateX(20px); }
        }
        .wave-one { animation: waveOne 10s ease-in-out infinite alternate; }
        .wave-two { animation: waveTwo 8s ease-in-out infinite alternate; }
        .wave-three { animation: waveThree 7s ease-in-out infinite alternate; }

        @keyframes glow {
          0%, 100% { opacity: .35; transform: scale(1); }
          50% { opacity: .55; transform: scale(1.05); }
        }
        .phone-glow { animation: glow 4s ease-in-out infinite; }

        @keyframes lineMove {
          from { stroke-dashoffset: 0; }
          to { stroke-dashoffset: -300; }
        }
        .moving-line {
          stroke-dasharray: 8 12;
          animation: lineMove 12s linear infinite;
        }

        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
          }
        }
      `}</style>

      <section className="app-section relative isolate min-h-[400px] md:min-h-[680px] overflow-hidden px-4 py-12 sm:px-10 lg:px-16 xl:px-24 w-full">

        {/* Glow behind phone */}
        <div className="phone-glow pointer-events-none absolute right-[5%] top-[20%] h-[200px] w-[200px] md:h-[420px] md:w-[420px] rounded-full bg-[#01BEFE]/20 blur-2xl md:blur-3xl"></div>

        {/* Top-left dot pattern */}
        <div
          className="pointer-events-none absolute left-0 top-0 h-16 w-20 md:h-32 md:w-40 opacity-40"
          style={{
            backgroundImage: 'radial-gradient(#01BEFE 1.5px, transparent 1.5px)',
            backgroundSize: '14px 14px',
            maskImage: 'linear-gradient(to bottom right, black, transparent)',
            WebkitMaskImage: 'linear-gradient(to bottom right, black, transparent)'
          }}
        ></div>

        <div className="relative z-20 mx-auto grid grid-cols-2 items-center gap-4 md:gap-10 lg:grid-cols-[1.05fr_.95fr]">

          {/* LEFT SIDE */}
          <div className="relative z-30 w-full max-w-2xl py-4">
            <div className="mb-2 md:mb-6 flex items-center gap-2 text-[8px] md:text-sm font-bold tracking-[0.18em] text-[#01BEFE]">
              <span className="h-1 w-1 md:h-2 md:w-2 rounded-full bg-[#01BEFE] shadow-[0_0_12px_#01BEFE]"></span>
              LAUNDRY AT YOUR FINGERTIPS
            </div>

            <h2 className="max-w-3xl text-3xl sm:text-5xl lg:text-[60px] font-serif font-semibold leading-[1.05] tracking-tight text-white">
              Download the
              <span className="block mt-1 md:mt-3">
                LAUNDELLE
                <span className="text-[#01BEFE]"> App</span>
              </span>
            </h2>

            <p className="mt-3 md:mt-7 max-w-xl text-xs sm:text-sm lg:text-base font-normal leading-relaxed text-blue-100/90">
              Schedule pickups in 3 taps, track your delivery in real-time,
              and unlock exclusive mobile-only discounts — all from the
              LAUNDELLE app.
            </p>

            {/* APP STORE BUTTONS */}
            <div className="mt-4 md:mt-9 flex flex-col xl:flex-row gap-2 md:gap-3">
              <a href="#" className="group flex h-10 md:h-16 items-center gap-2 md:gap-4 rounded-xl md:rounded-2xl bg-black px-3 md:px-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_15px_40px_rgba(0,0,0,.35)]">
                <svg viewBox="0 0 24 24" fill="none" className="shrink-0 w-4 h-4 md:w-7 md:h-8">
                  <path d="M3.2 2.8L13.7 13.2L3.2 23.6C2.5 23.1 2 22.3 2 21.3V5.1C2 4.1 2.5 3.3 3.2 2.8Z" fill="#00D7FF" />
                  <path d="M17.1 9.9L5 2.8C4.4 2.5 3.8 2.6 3.2 2.8L13.7 13.2L17.1 9.9Z" fill="#4CAF50" />
                  <path d="M13.7 13.2L3.2 23.6C3.8 23.8 4.4 23.9 5 23.6L17.1 16.5L13.7 13.2Z" fill="#FFC107" />
                  <path d="M21.2 12.3L17.1 9.9L13.7 13.2L17.1 16.5L21.2 14.1C22.2 13.6 22.2 12.8 21.2 12.3Z" fill="#FF3D00" />
                </svg>
                <div className="text-left leading-none">
                  <span className="block text-[6px] md:text-[10px] uppercase tracking-wider text-white/70">Get it on</span>
                  <span className="mt-0.5 md:mt-1 block text-xs md:text-lg font-semibold text-white">Google Play</span>
                </div>
              </a>
              <a href="#" className="group flex h-10 md:h-16 items-center gap-2 md:gap-4 rounded-xl md:rounded-2xl bg-black px-3 md:px-6 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_15px_40px_rgba(0,0,0,.35)]">
                <svg viewBox="0 0 24 24" fill="white" className="shrink-0 w-4 h-4 md:w-7 md:h-8">
                  <path d="M18.7 13.1C18.7 10.4 20.9 9.1 21 9C19.8 7.2 17.8 7 17.1 7C15.4 6.8 13.8 8 12.9 8C11.9 8 10.6 7 9.2 7C6.4 7 4 9.4 4 13.1C4 15.4 4.8 17.7 5.9 19.3C6.9 20.8 8 22.5 9.6 22.4C11.1 22.3 11.7 21.4 13.5 21.4C15.3 21.4 15.8 22.4 17.4 22.4C19 22.4 20 20.9 21 19.4C22.1 17.6 22.5 15.9 22.5 15.8C22.4 15.8 18.7 14.3 18.7 13.1ZM16 5.3C16.8 4.3 17.3 2.9 17.2 1.6C16 1.7 14.5 2.5 13.7 3.5C13 4.3 12.4 5.8 12.6 7C13.9 7.1 15.3 6.3 16 5.3Z" />
                </svg>
                <div className="text-left leading-none">
                  <span className="block text-[6px] md:text-[10px] uppercase tracking-wider text-white/70">Download on the</span>
                  <span className="mt-0.5 md:mt-1 block text-xs md:text-lg font-semibold text-white">App Store</span>
                </div>
              </a>
            </div>

            {/* BENEFITS */}
            <div className="mt-6 md:mt-12 grid max-w-2xl grid-cols-1 divide-y divide-white/10 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <div className="flex items-center sm:items-start sm:flex-col lg:flex-row gap-2 md:gap-4 py-2 sm:px-2 md:px-5 sm:py-0 sm:first:pl-0">
                <div className="flex h-6 w-6 md:h-11 md:w-11 shrink-0 items-center justify-center rounded-lg md:rounded-xl border border-[#01BEFE]/30 bg-[#01BEFE]/10">
                  <svg className="h-3 w-3 md:h-6 md:w-6 text-[#01BEFE]" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                    <path d="M3 16V6h11v10" />
                    <path d="M14 10h4l3 3v3h-7" />
                    <circle cx="7" cy="17" r="2" />
                    <circle cx="18" cy="17" r="2" />
                    <path d="M6 12h5" />
                  </svg>
                </div>
                <div>
                  <p className="font-bold text-[8px] md:text-sm text-white">Live Tracking</p>
                  <p className="md:mt-1 text-[7px] md:text-xs leading-[1.2] md:leading-5 text-blue-100/60">Real-time updates</p>
                </div>
              </div>
              <div className="flex items-center sm:items-start sm:flex-col lg:flex-row gap-2 md:gap-4 py-2 sm:px-2 md:px-5 sm:py-0">
                <div className="flex h-6 w-6 md:h-11 md:w-11 shrink-0 items-center justify-center rounded-lg md:rounded-xl border border-[#01BEFE]/30 bg-[#01BEFE]/10">
                  <svg className="h-3 w-3 md:h-6 md:w-6 text-[#01BEFE]" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                    <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" />
                    <path d="M9 12l2 2 4-5" />
                  </svg>
                </div>
                <div>
                  <p className="font-bold text-[8px] md:text-sm text-white">Exclusive Offers</p>
                  <p className="md:mt-1 text-[7px] md:text-xs leading-[1.2] md:leading-5 text-blue-100/60">Only on the app</p>
                </div>
              </div>
              <div className="flex items-center sm:items-start sm:flex-col lg:flex-row gap-2 md:gap-4 py-2 sm:px-2 md:px-5 sm:py-0 sm:last:pr-0">
                <div className="flex h-6 w-6 md:h-11 md:w-11 shrink-0 items-center justify-center rounded-lg md:rounded-xl border border-[#01BEFE]/30 bg-[#01BEFE]/10">
                  <svg className="h-3 w-3 md:h-6 md:w-6 text-[#01BEFE]" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" />
                  </svg>
                </div>
                <div>
                  <p className="font-bold text-[8px] md:text-sm text-white">Quick & Easy</p>
                  <p className="md:mt-1 text-[7px] md:text-xs leading-[1.2] md:leading-5 text-blue-100/60">3-tap bookings</p>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT SIDE — PHONE */}
          <div className="relative flex min-h-[300px] md:min-h-[570px] lg:min-h-[650px] items-center justify-center">
            <div className="absolute h-[160px] w-[160px] md:h-[360px] md:w-[360px] rounded-full bg-[#01BEFE]/20 blur-2xl md:blur-3xl lg:h-[450px] lg:w-[450px]"></div>
            <div className="absolute h-[200px] w-[200px] md:h-[420px] md:w-[420px] rounded-full border border-[#01BEFE]/20 bg-gradient-to-br from-[#002953]/40 to-transparent lg:h-[510px] lg:w-[510px]"></div>

            <div className="absolute right-[2%] top-[10%] md:right-[8%] md:top-[18%] z-10 scale-50 md:scale-100 origin-top-right">
              <svg width="170" height="150" viewBox="0 0 170 150" fill="none">
                <path className="water-drop" d="M74 21C74 21 43 48 43 71C43 89 57 103 74 103C91 103 105 89 105 71C105 48 74 21 74 21Z" fill="url(#dropGradient)" />
                <path className="water-drop" d="M126 6C126 6 108 22 108 36C108 47 116 55 126 55C136 55 144 47 144 36C144 22 126 6 126 6Z" fill="#01BEFE" opacity=".8" />
                <path className="water-drop" d="M30 65C30 65 12 81 12 94C12 104 20 112 30 112C40 112 48 104 48 94C48 81 30 65 30 65Z" fill="#01BEFE" opacity=".7" />
                <defs>
                  <linearGradient id="dropGradient" x1="43" y1="21" x2="105" y2="103" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#01BEFE" />
                    <stop offset="1" stopColor="#01BEFE" />
                  </linearGradient>
                </defs>
              </svg>
            </div>

            <div className="absolute bottom-[10%] left-[2%] md:bottom-[20%] md:left-[8%] z-10 scale-50 md:scale-100 origin-bottom-left">
              <div className="bubble mb-2 md:mb-5 h-1.5 w-1.5 md:h-3 md:w-3 rounded-full border border-[#01BEFE]/70"></div>
              <div className="bubble ml-5 md:ml-10 mb-2 md:mb-5 h-2.5 w-2.5 md:h-5 md:w-5 rounded-full border border-[#01BEFE]/60"></div>
              <div className="bubble ml-1 md:ml-2 h-1 w-1 md:h-2 md:w-2 rounded-full bg-[#01BEFE]"></div>
            </div>

            <div className="absolute inset-0 z-10 pointer-events-none">
              <span className="sparkle absolute right-[18%] top-[20%] text-[10px] md:text-xl text-[#01BEFE]">✦</span>
              <span className="sparkle absolute left-[18%] top-[35%] text-[8px] md:text-sm text-[#01BEFE]">✦</span>
              <span className="sparkle absolute right-[12%] bottom-[28%] text-[10px] md:text-lg text-[#01BEFE]">✦</span>
            </div>

            <div className="phone-float relative z-20 h-[260px] w-[130px] rounded-[24px] border-[3px] p-[3px] md:h-[560px] md:w-[278px] md:rounded-[42px] md:border-[6px] md:p-[7px] border-[#242424] bg-[#111] shadow-[0_20px_50px_rgba(0,0,0,.55)] lg:h-[620px] lg:w-[305px]">
              <div className="pointer-events-none absolute inset-0 rounded-[20px] md:rounded-[37px] ring-1 ring-white/30"></div>
              <div className="relative h-full w-full overflow-hidden rounded-[18px] md:rounded-[32px] bg-white">
                <div className="absolute left-1/2 top-1.5 md:top-3 z-30 h-3 w-12 md:h-7 md:w-24 -translate-x-1/2 rounded-full bg-black"></div>
                <div className="absolute left-0 right-0 top-0 z-20 flex justify-between px-3 md:px-6 pt-2 md:pt-4 text-[5px] md:text-[10px] font-semibold text-gray-800">
                  <span>9:41</span>
                  <div className="flex gap-0.5 md:gap-1">
                    <span>●</span>
                    <span>▮</span>
                    <span>▰</span>
                  </div>
                </div>
                <div className="flex h-full flex-col items-center px-2 md:px-7 pt-10 md:pt-24 text-center">
                  <div className="text-sm md:text-3xl font-black tracking-[-0.06em]">
                    <span className="text-[#01BEFE]">LAUN</span>
                    <span className="text-[#002953]">DELLE</span>
                  </div>
                  <div className="mt-2 md:mt-5 h-0.5 w-6 md:h-1 md:w-12 rounded-full bg-[#01BEFE]"></div>
                  <h3 className="mt-4 md:mt-10 text-sm md:text-3xl font-black leading-tight text-[#002953]">
                    Laundry<br />Made Easy!
                  </h3>
                  <div className="mt-3 md:mt-6 flex h-6 w-6 md:h-12 md:w-12 items-center justify-center rounded-full bg-[#01BEFE]/15">
                    <svg className="h-3 w-3 md:h-7 md:w-7 text-[#01BEFE]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
                      <path d="M12 3C12 3 6 9 6 14a6 6 0 0012 0c0-5-6-11-6-11z" />
                      <path d="M9 15c.3 1.3 1.2 2 2.5 2.4" />
                    </svg>
                  </div>
                  <p className="mt-3 md:mt-6 max-w-[120px] md:max-w-[210px] text-[7px] md:text-sm leading-snug md:leading-6 text-gray-600">
                    Pickup. Clean. Deliver.<br />
                    <strong className="text-[#002953]">On time, Every time.</strong>
                  </p>
                  <button className="mt-auto mb-4 md:mb-10 flex w-[90%] items-center justify-center gap-1 md:gap-3 rounded-full bg-gradient-to-r from-[#01BEFE] to-[#01BEFE] py-1.5 md:py-4 text-[7px] md:text-sm font-bold text-white shadow-lg shadow-[#01BEFE]/30 transition hover:scale-[1.03]">
                    Download Now
                    <svg className="h-3 w-3 md:h-5 md:w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M12 3v12" />
                      <path d="M7 10l5 5 5-5" />
                      <path d="M5 21h14" />
                    </svg>
                  </button>
                </div>
                <svg className="absolute bottom-0 left-0 w-full h-[60px] md:h-[130px]" viewBox="0 0 300 130" preserveAspectRatio="none">
                  <path d="M0 80C45 55 70 105 120 78C165 52 205 105 250 70C270 55 285 62 300 50L300 130L0 130Z" fill="#01BEFE" opacity=".18" />
                  <path d="M0 105C50 70 80 125 130 95C175 68 215 120 260 88C280 74 290 80 300 70L300 130L0 130Z" fill="#01BEFE" opacity=".25" />
                </svg>
              </div>
            </div>

            <div className="absolute bottom-[17%] right-[2%] z-30 hidden lg:block">
              <svg width="150" height="90" viewBox="0 0 150 90" fill="none">
                <path d="M5 76H145" stroke="#01BEFE" strokeWidth="2" strokeLinecap="round" />
                <path d="M25 60V35H91L111 45H130C135 45 139 49 139 54V60H25Z" stroke="#01BEFE" strokeWidth="3" />
                <path d="M96 38L108 46H91V38H96Z" stroke="#01BEFE" strokeWidth="2" />
                <circle cx="48" cy="62" r="9" fill="#002953" stroke="#01BEFE" strokeWidth="3" />
                <circle cx="117" cy="62" r="9" fill="#002953" stroke="#01BEFE" strokeWidth="3" />
                <path className="moving-line" d="M7 48H25" stroke="#01BEFE" strokeWidth="2" strokeLinecap="round" />
                <path className="moving-line" d="M13 55H25" stroke="#01BEFE" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
          </div>
        </div>

        {/* BOTTOM SVG WAVES */}
        <div className="pointer-events-none absolute bottom-0 left-0 z-10 h-[120px] md:h-[270px] w-full overflow-hidden">
          <svg className="absolute bottom-0 h-full w-[110%] -translate-x-[5%]" viewBox="0 0 1440 420" preserveAspectRatio="none">
            <path className="moving-line" d="M0 320C170 260 310 385 500 315C690 245 810 380 1000 305C1180 240 1300 350 1440 280" fill="none" stroke="#01BEFE" strokeWidth="2" opacity=".7" />
            <path className="wave-one" d="M0 275C180 205 300 345 480 280C650 220 720 325 900 265C1080 205 1200 315 1440 215L1440 420L0 420Z" fill="#001a35" opacity=".9" />
            <path className="wave-two" d="M0 315C180 240 320 390 520 305C700 230 820 350 1010 290C1190 230 1300 335 1440 270L1440 420L0 420Z" fill="#002953" />
            <path className="wave-three" d="M0 350C180 280 310 405 510 330C700 255 820 390 1010 320C1200 250 1320 370 1440 300L1440 420L0 420Z" fill="#01BEFE" />
            <path className="wave-one" d="M0 382C170 310 300 430 500 360C680 300 830 410 1020 345C1190 285 1310 395 1440 325L1440 420L0 420Z" fill="#01BEFE" opacity=".85" />
          </svg>
        </div>

        {/* BUBBLES AROUND WAVES */}
        <div className="pointer-events-none absolute bottom-10 md:bottom-20 left-[35%] z-20">
          <div className="bubble absolute h-2 w-2 md:h-3 md:w-3 rounded-full border border-[#01BEFE]/70"></div>
          <div className="bubble absolute left-8 top-2 md:left-16 md:top-5 h-3 w-3 md:h-5 md:w-5 rounded-full border border-[#01BEFE]/60"></div>
          <div className="bubble absolute left-14 top-[-15px] md:left-28 md:top-[-30px] h-1.5 w-1.5 md:h-2 md:w-2 rounded-full bg-[#01BEFE]"></div>
        </div>

      </section>
    </div>
  );
};
