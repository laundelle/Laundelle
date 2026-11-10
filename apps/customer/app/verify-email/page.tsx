'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { CheckCircle2, AlertCircle, Loader2, ArrowRight, Home, ShieldCheck } from 'lucide-react';
import { dbVerifyEmail } from '@laundelle/api-client';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const email = searchParams.get('email') || '';
  const token = searchParams.get('token') || '';

  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [verifiedUser, setVerifiedUser] = useState<any>(null);
  const [countdown, setCountdown] = useState<number>(3);

  useEffect(() => {
    let isCancelled = false;

    if (!email || !token) {
      setStatus('error');
      setErrorMessage('Verification link is incomplete. Email and verification token are required.');
      return;
    }

    const performVerification = async () => {
      try {
        const result = await dbVerifyEmail(email, token);
        if (isCancelled) return;

        if (result.error) {
          setStatus('error');
          setErrorMessage(result.error);
        } else if (result.user) {
          setStatus('success');
          setVerifiedUser(result.user);

          // Dispatch event so any listening layout/navbar components update immediately
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('laundelle_auth_changed', { detail: result.user }));
          }
        } else {
          setStatus('error');
          setErrorMessage('Could not verify account. Please try again or log in.');
        }
      } catch (err: any) {
        if (!isCancelled) {
          setStatus('error');
          setErrorMessage(err?.message || 'A network error occurred while verifying your account.');
        }
      }
    };

    performVerification();

    return () => {
      isCancelled = true;
    };
  }, [email, token]);

  // Automatic redirect countdown on success
  useEffect(() => {
    if (status !== 'success') return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          router.push('/home');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [status, router]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between">
      {/* Top Header */}
      <header className="w-full bg-[#002953] py-4 px-6 border-b-2 border-[#01BEFE]/30 shadow-md">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/home" className="flex items-center gap-3">
            <Image
              src="/Laundelle-Logo-top.svg"
              alt="Laundelle Logo"
              width={140}
              height={36}
              className="h-8 w-auto object-contain brightness-0 invert"
              priority
            />
          </Link>
          <div className="flex items-center gap-1.5 text-xs text-[#CAF0F8] font-semibold">
            <ShieldCheck className="w-4 h-4 text-[#01BEFE]" />
            <span>Secure Verification</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="bg-white w-full max-w-lg rounded-3xl p-8 sm:p-10 shadow-xl border border-slate-200 text-center relative overflow-hidden">
          {/* Decorative Top Accent */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#002953] via-[#01BEFE] to-[#002953]" />

          {/* STATE 1: VERIFYING */}
          {status === 'verifying' && (
            <div className="py-6 space-y-5">
              <div className="w-16 h-16 bg-blue-50 text-[#01BEFE] rounded-2xl flex items-center justify-center mx-auto shadow-xs border border-blue-100">
                <Loader2 className="w-8 h-8 animate-spin text-[#01BEFE]" />
              </div>
              <div className="space-y-2">
                <h1 className="text-2xl font-heading font-black text-[#002953]">
                  Verifying Your Account
                </h1>
                <p className="text-sm text-slate-500 max-w-sm mx-auto leading-relaxed">
                  Please wait while we confirm your email address and activate your Laundelle account...
                </p>
              </div>
            </div>
          )}

          {/* STATE 2: SUCCESS */}
          {status === 'success' && (
            <div className="py-4 space-y-6 animate-in fade-in zoom-in-95 duration-200">
              <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-3xl flex items-center justify-center mx-auto shadow-sm border border-emerald-200">
                <CheckCircle2 className="w-11 h-11 text-emerald-600" />
              </div>

              <div className="space-y-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-full border border-emerald-200 mb-1">
                  <span>✓ Email Confirmed</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-heading font-black text-[#002953]">
                  Account Verified!
                </h1>
                <p className="text-sm text-slate-600 max-w-sm mx-auto leading-relaxed">
                  Welcome to Laundelle{verifiedUser?.name ? `, ${verifiedUser.name}` : ''}! Your email <strong>{email}</strong> has been successfully verified.
                </p>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-600 space-y-1">
                <p className="font-semibold text-slate-800">You are now securely logged in.</p>
                <p className="text-slate-500">
                  Redirecting to your dashboard in <strong className="text-[#002953]">{countdown}s</strong>...
                </p>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => router.push('/home')}
                  className="w-full h-12 bg-[#002953] hover:bg-[#003875] text-white rounded-xl font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-99"
                >
                  <span>Continue to Home</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STATE 3: ERROR */}
          {status === 'error' && (
            <div className="py-4 space-y-6 animate-in fade-in zoom-in-95 duration-200">
              <div className="w-20 h-20 bg-rose-50 text-rose-600 rounded-3xl flex items-center justify-center mx-auto shadow-sm border border-rose-200">
                <AlertCircle className="w-11 h-11 text-rose-600" />
              </div>

              <div className="space-y-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-50 text-rose-700 text-xs font-bold rounded-full border border-rose-200 mb-1">
                  <span>Verification Unsuccessful</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-heading font-black text-[#002953]">
                  Verification Failed
                </h1>
                <p className="text-sm text-slate-600 max-w-sm mx-auto leading-relaxed">
                  {errorMessage || 'This verification link may be invalid, expired, or has already been used.'}
                </p>
              </div>

              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-500">
                If your account is already active, you can sign in directly using Google or your email.
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => router.push('/home')}
                  className="flex-1 h-12 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 rounded-xl font-bold text-sm shadow-2xs transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-99"
                >
                  <Home className="w-4 h-4 text-slate-500" />
                  <span>Go to Home</span>
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/home')}
                  className="flex-1 h-12 bg-[#002953] hover:bg-[#003875] text-white rounded-xl font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-99"
                >
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full py-6 px-4 text-center text-xs text-slate-400 border-t border-slate-200">
        <p>&copy; {new Date().getFullYear()} Laundelle Technologies Ltd. All rights reserved.</p>
        <p className="mt-1">London, United Kingdom • support@laundelle.co.uk</p>
      </footer>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-3 border-[#01BEFE] border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-slate-500 font-semibold">Loading verification...</p>
          </div>
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}

