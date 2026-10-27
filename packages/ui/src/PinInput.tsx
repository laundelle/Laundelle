'use client';

import React, { useRef, useEffect } from 'react';

export interface PinInputProps {
  length?: number; // 6 for pickup, 4 for delivery/drop
  value: string;
  onChange: (pin: string) => void;
  error?: boolean | string | null;
  disabled?: boolean;
  autoFocus?: boolean;
  onEnterPress?: () => void;
  className?: string;
  idPrefix?: string;
}

export const PinInput: React.FC<PinInputProps> = ({
  length = 6,
  value,
  onChange,
  error,
  disabled = false,
  autoFocus = true,
  onEnterPress,
  className = '',
  idPrefix = 'pin-digit',
}) => {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Array of digits matching specified length
  const digits = Array.from({ length }, (_, i) => value[i] || '');

  useEffect(() => {
    if (autoFocus && !disabled) {
      // Find first empty index or the last filled index
      const targetIndex = Math.min(value.length, length - 1);
      const timer = setTimeout(() => {
        inputRefs.current[targetIndex]?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [autoFocus, length]); // run on mount or length switch

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    if (disabled) return;
    const rawVal = e.target.value.replace(/\D/g, '');

    if (!rawVal) {
      // Clear this index
      const chars = value.split('');
      chars[index] = '';
      const updated = chars.join('').slice(0, length);
      onChange(updated);
      return;
    }

    // Grab the newest character (handles user typing while existing digit is selected/present)
    const newChar = rawVal.slice(-1);

    // Build the updated pin
    const chars = Array.from({ length }, (_, i) => value[i] || ' ');
    chars[index] = newChar;
    // Trim trailing empty placeholders to keep clean string
    const updated = chars.join('').slice(0, length).trimEnd();
    onChange(updated);

    // Move to next box if available
    if (index < length - 1) {
      inputRefs.current[index + 1]?.focus();
      inputRefs.current[index + 1]?.select();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (disabled) return;

    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        // Current box is empty, jump back to previous box and clear it
        e.preventDefault();
        const chars = Array.from({ length }, (_, i) => value[i] || '');
        chars[index - 1] = '';
        const updated = chars.join('').trimEnd();
        onChange(updated);
        inputRefs.current[index - 1]?.focus();
      } else if (digits[index]) {
        // Current box has a digit, clear it and remain
        e.preventDefault();
        const chars = Array.from({ length }, (_, i) => value[i] || '');
        chars[index] = '';
        const updated = chars.join('').trimEnd();
        onChange(updated);
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      inputRefs.current[index - 1]?.focus();
      inputRefs.current[index - 1]?.select();
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      e.preventDefault();
      inputRefs.current[index + 1]?.focus();
      inputRefs.current[index + 1]?.select();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (onEnterPress) {
        onEnterPress();
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pasted) return;

    onChange(pasted);

    // Focus on the next empty box or the last box
    const nextIndex = Math.min(pasted.length, length - 1);
    setTimeout(() => {
      inputRefs.current[nextIndex]?.focus();
      inputRefs.current[nextIndex]?.select();
    }, 20);
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select();
  };

  const isComplete = value.replace(/\D/g, '').length === length;

  return (
    <div className={`flex flex-col items-center justify-center w-full ${className}`}>
      <div
        className={`flex w-full items-center justify-center gap-2 sm:gap-3 ${length === 4 ? 'max-w-[280px]' : 'max-w-[340px]'
          }`}
      >
        {digits.map((digit, idx) => {
          const isFilled = Boolean(digit);

          return (
            <input
              key={`${idPrefix}-${idx}`}
              ref={(el) => {
                inputRefs.current[idx] = el;
              }}
              id={`${idPrefix}-${idx}`}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete={idx === 0 ? 'one-time-code' : 'off'}
              maxLength={2}
              value={digit}
              disabled={disabled}
              onChange={(e) => handleChange(e, idx)}
              onKeyDown={(e) => handleKeyDown(e, idx)}
              onPaste={handlePaste}
              onFocus={handleFocus}
              aria-label={`Digit ${idx + 1} of ${length}`}
              aria-invalid={error ? true : undefined}
              className={`
          box-border shrink-0
          text-center font-mono font-semibold
          outline-none
          transition-[border-color,background-color,box-shadow]
          duration-150 ease-out
          selection:bg-[#0077B6]/15
          ${length === 4
                  ? 'h-14 w-12 sm:h-15 sm:w-14 text-2xl rounded-xl'
                  : 'h-12 w-10 sm:h-14 sm:w-12 text-xl sm:text-2xl rounded-lg sm:rounded-xl'
                }
          ${error
                  ? 'border border-red-400 bg-red-50 text-red-700 focus:border-red-500 focus:ring-4 focus:ring-red-500/10'
                  : isFilled
                    ? 'border border-[#0077B6]/50 bg-[#F0F9FF] text-[#03045E] focus:border-[#0077B6] focus:bg-white focus:ring-4 focus:ring-[#0077B6]/10'
                    : 'border border-slate-200 bg-white text-[#03045E] hover:border-slate-300 focus:border-[#0077B6] focus:ring-4 focus:ring-[#0077B6]/10'
                }
          disabled:cursor-not-allowed disabled:opacity-50
        `}
            />
          );
        })}
      </div>

      {/* Helper indicator when all digits are entered */}
      {isComplete && !error && (
        <p className="text-[11px] text-emerald-600 font-semibold mt-2.5 flex items-center gap-1 animate-in fade-in duration-150">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          All {length} digits entered. Click Confirm below to proceed.
        </p>
      )}
    </div>
  );
};
