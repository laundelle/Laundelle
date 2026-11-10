'use client';

import React, { useState } from 'react';
import { User, Phone, CheckCircle2, ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';
import { dbUpdateProfile } from '@laundelle/api-client';

interface CompleteProfileModalProps {
  isOpen: boolean;
  userId: string;
  initialUsername?: string;
  initialPhone?: string;
  onSuccess: (updatedName: string, updatedPhone: string) => void;
  onClose?: () => void;
}

export const CompleteProfileModal: React.FC<CompleteProfileModalProps> = ({
  isOpen,
  userId,
  initialUsername = '',
  initialPhone = '',
  onSuccess,
  onClose,
}) => {
  const [username, setUsername] = useState(initialUsername);
  const [countryCode, setCountryCode] = useState('+44');
  const [phoneDigits, setPhoneDigits] = useState(() => {
    if (!initialPhone) return '';
    // Strip common country code prefixes if present
    return initialPhone.replace(/^\+?[0-9]{1,4}/, '').trim();
  });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync if initial props change
  React.useEffect(() => {
    if (initialUsername && !username) {
      setUsername(initialUsername);
    }
  }, [initialUsername]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = username.trim();
    const cleanedDigits = phoneDigits.replace(/[^0-9]/g, '');

    if (!trimmedName || trimmedName.length < 2) {
      setError('Please enter a valid username (minimum 2 characters).');
      return;
    }

    if (!cleanedDigits || cleanedDigits.length < 7) {
      setError('Please enter a valid mobile number (minimum 7 digits).');
      return;
    }

    const fullPhoneNumber = `${countryCode}${cleanedDigits}`;
    setIsSubmitting(true);

    try {
      await dbUpdateProfile(userId, trimmedName, fullPhoneNumber);
      onSuccess(trimmedName, fullPhoneNumber);
    } catch (err: any) {
      setError(err?.message || 'Failed to update profile. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-md rounded-3xl p-6 sm:p-8 shadow-2xl relative my-auto border border-slate-200">
        {onClose && (
          <button
            onClick={onClose}
            className="absolute top-5 right-5 text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 p-2 rounded-full cursor-pointer transition-colors"
            title="Close"
            type="button"
          >
            <span className="text-xs font-bold leading-none">✕</span>
          </button>
        )}

        {/* Header Branding */}
        <div className="text-center space-y-1.5 pb-2">
          <div className="w-12 h-12 bg-blue-50 text-[#01BEFE] rounded-2xl flex items-center justify-center mx-auto mb-2 font-black text-xl border border-blue-100 shadow-xs">
            <CheckCircle2 className="w-6 h-6 text-[#01BEFE]" />
          </div>
          <h2 className="text-2xl font-heading font-extrabold text-slate-900">
            Complete Your Profile
          </h2>
          <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
            Please confirm your username and mobile phone number for delivery driver coordination and OTP updates.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-2.5 text-xs text-red-700 animate-in fade-in duration-150">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
            <span className="font-semibold">{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Username Input */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Username / Full Name <span className="text-red-500">*</span>
            </label>
            <div className="relative flex items-center">
              <div className="absolute left-3.5 text-slate-400 pointer-events-none">
                <User className="w-4 h-4" />
              </div>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. John Doe"
                className="w-full h-11 pl-10 pr-3.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#01BEFE] focus:ring-2 focus:ring-[#01BEFE]/10 transition-all"
              />
            </div>
          </div>

          {/* Mobile Number with Country Code Dropdown */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Mobile Number <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center">
              <select
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                className="h-11 px-2.5 bg-slate-50 border border-r-0 border-slate-200 rounded-l-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#01BEFE] cursor-pointer shrink-0"
              >
                <option value="+44">🇬🇧 +44 (UK)</option>
                <option value="+1">🇺🇸 +1 (US)</option>
                <option value="+91">🇮🇳 +91 (IN)</option>
                <option value="+971">🇦🇪 +971 (AE)</option>
                <option value="+61">🇦🇺 +61 (AU)</option>
                <option value="+33">🇫🇷 +33 (FR)</option>
                <option value="+49">🇩🇪 +49 (DE)</option>
                <option value="+353">🇮🇪 +353 (IE)</option>
              </select>
              <div className="relative flex-1">
                <div className="absolute left-3 top-3.5 text-slate-400 pointer-events-none">
                  <Phone className="w-4 h-4" />
                </div>
                <input
                  type="tel"
                  required
                  value={phoneDigits}
                  onChange={(e) => setPhoneDigits(e.target.value)}
                  placeholder="7700 900000"
                  className="w-full h-11 pl-9 pr-3.5 rounded-r-xl border border-slate-200 bg-white text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#01BEFE] focus:ring-2 focus:ring-[#01BEFE]/10 transition-all"
                />
              </div>
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              Your courier will use this number for contactless delivery calls and pickup OTP verification.
            </p>
          </div>

          {/* Submit Action */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-11 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer active:scale-98 disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Saving Profile...</span>
                </>
              ) : (
                <span>Save & Continue</span>
              )}
            </button>
          </div>
        </form>

        <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400 font-medium pt-3 mt-4 border-t border-slate-100">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>Encrypted and saved securely to Laundelle</span>
        </div>
      </div>
    </div>
  );
};
