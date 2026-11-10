import React from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export interface ToastProps {
  message: string | null;
  type?: 'success' | 'error' | 'info';
  onClose?: () => void;
}

export const Toast: React.FC<ToastProps> = ({
  message,
  type = 'info',
  onClose,
}) => {
  if (!message) return null;

  const bgStyles = {
    success: 'bg-[#002953] text-white border-[#01BEFE]',
    error: 'bg-rose-700 text-white border-rose-800',
    info: 'bg-gray-900 text-white border-gray-800',
  }[type];

  const Icon = {
    success: CheckCircle2,
    error: AlertCircle,
    info: Info,
  }[type];

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-slide-up max-w-md">
      <div
        className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl border ${bgStyles}`}
      >
        <Icon className="w-5 h-5 flex-shrink-0" />
        <span className="text-sm font-medium pr-2">{message}</span>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
