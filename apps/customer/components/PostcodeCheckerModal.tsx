import React, { useState } from 'react';
import { MapPin, CheckCircle2, AlertCircle, Sparkles, X, ArrowRight, Bell, ShieldCheck } from 'lucide-react';
import { checkPostcodeSectorActive, joinWaitingList } from '@laundelle/api-client';

interface PostcodeCheckerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBookNow: (postcode: string) => void;
}

export const PostcodeCheckerModal: React.FC<PostcodeCheckerModalProps> = ({
  isOpen,
  onClose,
  onBookNow,
}) => {
  const [postcode, setPostcode] = useState('');
  const [checkedStatus, setCheckedStatus] = useState<'idle' | 'available' | 'unavailable'>('idle');
  const [showWaitingListForm, setShowWaitingListForm] = useState(false);
  const [waitingListSuccess, setWaitingListSuccess] = useState(false);
  const [checking, setChecking] = useState(false);

  // Form fields for waiting list
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneCountryCode, setPhoneCountryCode] = useState('+44');
  const [phone, setPhone] = useState('');
  const [requestedService, setRequestedService] = useState('Everyday Wash & Fold');
  const [launchConsent, setLaunchConsent] = useState(true);

  if (!isOpen) return null;

  const handleCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPostcode = postcode.trim().toUpperCase().replace(/\s+/g, '');
    if (!cleanPostcode) return;

    setChecking(true);
    try {
      const isServiceable = await checkPostcodeSectorActive(cleanPostcode);
      if (isServiceable) {
        setCheckedStatus('available');
        setShowWaitingListForm(false);
      } else {
        setCheckedStatus('unavailable');
        setShowWaitingListForm(true);
      }
    } catch (err) {
      console.error('Error checking postcode availability:', err);
      setCheckedStatus('unavailable');
      setShowWaitingListForm(true);
    } finally {
      setChecking(false);
    }
  };

  const handleWaitingListSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !email) return;

    setChecking(true);
    try {
      const fullPhone = phone.trim() ? `${phoneCountryCode} ${phone.trim().replace(/^0/, '')}`.trim() : '';
      const res = await joinWaitingList({
        full_name: fullName,
        email,
        phone: fullPhone,
        postcode: postcode.trim().toUpperCase(),
        requested_service_id: requestedService,
        launch_notification_consent: launchConsent,
      });

      if (res.success) {
        setWaitingListSuccess(true);
      } else {
        alert(res.error || 'Failed to submit postcode waiting list request.');
      }
    } catch (err: any) {
      alert(err.message || 'An error occurred during submission.');
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto animate-in fade-in">
      <div className="bg-white rounded-3xl w-full max-w-lg max-h-[85vh] sm:max-h-[90vh] overflow-hidden shadow-2xl transition-all border border-gray-100 flex flex-col my-auto">
        {/* Header */}
        <div className="bg-[#002953] text-white p-5 sm:p-6 relative shrink-0">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 text-white/80 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 text-xs font-bold text-[#01BEFE] uppercase tracking-wider mb-1">
            <MapPin className="w-4 h-4" />
            <span>Service Coverage Area</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-heading font-extrabold">Check Postcode Availability</h2>
          <p className="text-xs text-white/80 mt-1">
            Enter your postal code to check instant 30-min pickup slots in your neighbourhood.
          </p>
        </div>

        <div className="p-5 sm:p-6 space-y-6 overflow-y-auto flex-1 min-h-0">
          {/* Postcode Search Form */}
          {!waitingListSuccess && (
            <form onSubmit={handleCheck} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                  Enter Your Postcode / Area Code
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <MapPin className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={postcode}
                      onChange={(e) => {
                        setPostcode(e.target.value);
                        if (checkedStatus !== 'idle') setCheckedStatus('idle');
                      }}
                      placeholder="e.g. SW1A 1AA, W1, EC1, 500001"
                      className="w-full pl-10 pr-4 py-3 bg-[#01BEFE]/15/20 border border-gray-200 rounded-xl text-sm font-semibold text-gray-900 placeholder:text-gray-400 focus:outline-hidden focus:border-[#002953] uppercase"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={checking}
                    className="bg-[#002953] hover:bg-[#002953] text-white px-5 py-3 rounded-xl text-xs font-bold transition-all shadow-sm active:scale-97 cursor-pointer shrink-0 disabled:opacity-50"
                  >
                    Check Availability
                  </button>
                </div>
              </div>

            </form>
          )}

          {/* AVAILABLE STATE */}
          {checkedStatus === 'available' && (
            <div className="p-5 bg-[#01BEFE]/15 border border-[#01BEFE] rounded-2xl space-y-4 animate-in fade-in">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-[#002953] shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-base font-heading font-bold text-[#002953]">
                    Great News! Doorstep Laundry is Available in {postcode.toUpperCase()}
                  </h3>
                  <p className="text-xs text-gray-600 mt-1">
                    Free doorstep collection & next-day delivery slots are active right now in your area.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
                <div className="bg-white p-2.5 rounded-xl text-center">
                  <span className="text-gray-500 block">Next Available Pickup</span>
                  <span className="font-bold text-[#002953]">Today, in 45 mins</span>
                </div>
                <div className="bg-white p-2.5 rounded-xl text-center">
                  <span className="text-gray-500 block">Express Turnaround</span>
                  <span className="font-bold text-[#002953]">Same-Day & 24h</span>
                </div>
              </div>

              <button
                onClick={() => {
                  onClose();
                  onBookNow(postcode.trim().toUpperCase());
                }}
                className="w-full bg-[#002953] hover:bg-[#002953] text-white py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all cursor-pointer"
              >
                <span>Book Your Laundry Now</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* UNAVAILABLE STATE + WAITING LIST FORM */}
          {checkedStatus === 'unavailable' && showWaitingListForm && !waitingListSuccess && (
            <div className="space-y-4 animate-in fade-in">
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-bold text-amber-900">
                    There is no plant in the area ({postcode.toUpperCase()})
                  </h4>
                  <p className="text-xs text-amber-800 mt-0.5">
                    There is no plant in the area currently operating. Join our VIP waiting list to get notified the day our plant and couriers launch in your neighbourhood, plus receive £10 off your first booking.
                  </p>
                </div>
              </div>

              {/* Waiting List Form */}
              <form onSubmit={handleWaitingListSubmit} className="space-y-3 pt-1">
                <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                  Join VIP Area Launch Waiting List
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-600 mb-1">Full Name *</label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Jane Doe"
                      className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium focus:outline-hidden focus:border-[#002953]"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-gray-600 mb-1">Email Address *</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="jane@example.com"
                      className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium focus:outline-hidden focus:border-[#002953]"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-600 mb-1">Phone Number</label>
                    <div className="flex gap-1.5">
                      <select
                        value={phoneCountryCode}
                        onChange={(e) => setPhoneCountryCode(e.target.value)}
                        className="w-20 px-1.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-[#002953] focus:outline-hidden focus:border-[#002953] cursor-pointer shrink-0"
                      >
                        <option value="+44">UK (+44)</option>
                        <option value="+1">US (+1)</option>
                        <option value="+91">IN (+91)</option>
                        <option value="+971">AE (+971)</option>
                        <option value="+61">AU (+61)</option>
                        <option value="+33">FR (+33)</option>
                        <option value="+49">DE (+49)</option>
                        <option value="+353">IE (+353)</option>
                      </select>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="7700 900000"
                        className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium focus:outline-hidden focus:border-[#002953]"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-gray-600 mb-1">Primary Laundry Service</label>
                    <select
                      value={requestedService}
                      onChange={(e) => setRequestedService(e.target.value)}
                      className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium focus:outline-hidden focus:border-[#002953]"
                    >
                      <option value="Wash + Dry + Fold">Wash + Dry + Fold</option>
                      <option value="Wash + Steam Iron">Wash + Steam Iron</option>
                      <option value="Ironing / Pressing">Ironing / Pressing</option>
                      <option value="Duvets & Bulky Bedding">Duvets & Bulky Bedding</option>
                      <option value="Suits & Dry Cleaning">Suits & Dry Cleaning</option>
                      <option value="Recurring Weekly Laundry">Recurring Weekly Laundry</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="launchConsent"
                    checked={launchConsent}
                    onChange={(e) => setLaunchConsent(e.target.checked)}
                    className="w-4 h-4 accent-[#002953] rounded cursor-pointer"
                  />
                  <label htmlFor="launchConsent" className="text-[11px] text-gray-600 cursor-pointer">
                    Send me a notification and £10 welcome credit when Laundelle launches in my area.
                  </label>
                </div>

                <button
                  type="submit"
                  className="w-full bg-[#002953] hover:bg-[#002953] text-white py-3 rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer mt-2"
                >
                  Join Waiting List
                </button>
              </form>
            </div>
          )}

          {/* WAITING LIST SUCCESS */}
          {waitingListSuccess && (
            <div className="p-6 bg-[#01BEFE]/15 rounded-2xl text-center space-y-3 animate-in zoom-in-95">
              <div className="w-12 h-12 rounded-full bg-[#002953] text-white flex items-center justify-center mx-auto shadow-md">
                <Bell className="w-6 h-6" />
              </div>
              <h3 className="text-base font-heading font-extrabold text-[#002953]">
                You are on the VIP Waiting List!
              </h3>
              <p className="text-xs text-gray-600 max-w-sm mx-auto">
                Thank you, <strong>{fullName}</strong>. We've logged your interest for <strong>{postcode.toUpperCase()}</strong>. We will notify you via <strong>{email}</strong> the moment our courier routes open in your sector!
              </p>
              <button
                onClick={onClose}
                className="bg-[#002953] text-white px-6 py-2.5 rounded-xl text-xs font-bold hover:bg-[#002953] transition-all cursor-pointer"
              >
                Done
              </button>
            </div>
          )}

          {/* Trust Guarantees */}
          <div className="border-t border-gray-100 pt-4 flex items-center justify-between text-[11px] text-gray-500">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-[#002953]" />
              Eco-Friendly Hubs
            </span>
            <span className="flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-[#002953]" />
              Fast Doorstep Pickup
            </span>
            <span>24/7 Support</span>
          </div>
        </div>
      </div>
    </div>
  );
};
