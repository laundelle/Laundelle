import React, { useState } from 'react';
import { 
  Bell, CheckCircle2, Clock, Truck, Sparkles, AlertTriangle, 
  Tag, Trash2, ArrowRight 
} from 'lucide-react';
import { CustomerNotification, ActiveTab } from '@laundelle/types';

interface NotificationsViewProps {
  notifications: CustomerNotification[];
  onMarkAsRead: (id: string) => void;
  onMarkAllAsRead: () => void;
  onClearAll: () => void;
  onNavigate: (tab: ActiveTab) => void;
}

export const NotificationsView: React.FC<NotificationsViewProps> = ({
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onClearAll,
  onNavigate
}) => {
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [isPrefModalOpen, setIsPrefModalOpen] = useState(false);
  const [prefs, setPrefs] = useState({
    smsNotifications: true,
    emailReceipts: true,
    whatsappUpdates: true,
    marketingEmails: false
  });

  const filteredList = notifications.filter(n => filter === 'all' ? true : !n.read);
  const unreadCount = notifications.filter(n => !n.read).length;

  const getIconForType = (type: CustomerNotification['type']) => {
    switch (type) {
      case 'delivery':
        return <Truck className="w-5 h-5 text-[#01BEFE]" />;
      case 'charge':
        return <AlertTriangle className="w-5 h-5 text-amber-600" />;
      case 'collection':
        return <Clock className="w-5 h-5 text-[#002953]" />;
      case 'processing':
        return <Sparkles className="w-5 h-5 text-[#01BEFE]" />;
      case 'promo':
        return <Tag className="w-5 h-5 text-purple-600" />;
      default:
        return <CheckCircle2 className="w-5 h-5 text-[#002953]" />;
    }
  };

  return (
    <div className="w-full min-h-screen bg-[#f8fafc] py-8 sm:py-12 px-6 sm:px-12 md:px-20 lg:px-28 space-y-8">
      {/* Header */}
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-[#01BEFE] block">
            Customer Updates & Alerts
          </span>
          <h1 className="text-2xl sm:text-4xl font-heading font-extrabold text-[#002953]">
            Notification Centre
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Real-time status alerts for collections, wash progress, and deliveries.
          </p>
        </div>

        {/* Filter & Batch Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="bg-white p-1 rounded-xl border border-gray-200 flex items-center">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                filter === 'all' ? 'bg-[#002953] text-white shadow-xs' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              All ({notifications.length})
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                filter === 'unread' ? 'bg-[#002953] text-white shadow-xs' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Unread ({unreadCount})
            </button>
          </div>

          {unreadCount > 0 && (
            <button
              onClick={onMarkAllAsRead}
              className="px-3.5 py-2 bg-[#01BEFE]/15 hover:bg-[#01BEFE] text-[#002953] rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              Mark all read
            </button>
          )}

          {notifications.length > 0 && (
            <button
              onClick={onClearAll}
              className="p-2 text-gray-400 hover:text-red-600 rounded-xl transition-colors cursor-pointer"
              title="Clear all"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={() => setIsPrefModalOpen(true)}
            className="px-3.5 py-2 bg-white hover:bg-gray-50 border border-gray-200 text-[#002953] rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
          >
            <span>Preferences</span>
          </button>
        </div>
      </div>

      {/* Notification Preferences Modal */}
      {isPrefModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-extrabold text-[#002953]">Notification Preferences</h3>
                <p className="text-xs text-gray-500">Configure your automated alert channels</p>
              </div>
              <button
                onClick={() => setIsPrefModalOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-xl cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-3.5 bg-gray-50 rounded-2xl">
                <div>
                  <span className="text-xs font-bold text-gray-900 block">SMS Notifications</span>
                  <span className="text-[11px] text-gray-500">Delivery driver approaching & PIN codes</span>
                </div>
                <input
                  type="checkbox"
                  checked={prefs.smsNotifications}
                  onChange={(e) => setPrefs({ ...prefs, smsNotifications: e.target.checked })}
                  className="w-4 h-4 rounded text-[#002953] focus:ring-[#002953]"
                />
              </div>

              <div className="flex items-center justify-between p-3.5 bg-gray-50 rounded-2xl">
                <div>
                  <span className="text-xs font-bold text-gray-900 block">Email Invoices & Receipts</span>
                  <span className="text-[11px] text-gray-500">Monthly billing and VAT statements</span>
                </div>
                <input
                  type="checkbox"
                  checked={prefs.emailReceipts}
                  onChange={(e) => setPrefs({ ...prefs, emailReceipts: e.target.checked })}
                  className="w-4 h-4 rounded text-[#002953] focus:ring-[#002953]"
                />
              </div>

              <div className="flex items-center justify-between p-3.5 bg-gray-50 rounded-2xl">
                <div>
                  <span className="text-xs font-bold text-gray-900 block">WhatsApp Updates</span>
                  <span className="text-[11px] text-gray-500">Live order milestones & photos</span>
                </div>
                <input
                  type="checkbox"
                  checked={prefs.whatsappUpdates}
                  onChange={(e) => setPrefs({ ...prefs, whatsappUpdates: e.target.checked })}
                  className="w-4 h-4 rounded text-[#002953] focus:ring-[#002953]"
                />
              </div>

              <div className="flex items-center justify-between p-3.5 bg-gray-50 rounded-2xl">
                <div>
                  <span className="text-xs font-bold text-gray-900 block">Marketing & Seasonal Promos</span>
                  <span className="text-[11px] text-gray-500">Exclusive customer vouchers</span>
                </div>
                <input
                  type="checkbox"
                  checked={prefs.marketingEmails}
                  onChange={(e) => setPrefs({ ...prefs, marketingEmails: e.target.checked })}
                  className="w-4 h-4 rounded text-[#002953] focus:ring-[#002953]"
                />
              </div>

              {/* Mandatory Notice */}
              <div className="p-3.5 bg-amber-50 rounded-2xl border border-amber-200/60 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-800 leading-relaxed font-medium">
                  <strong>Mandatory Transactional Alerts:</strong> Collection confirmations, payment receipts, surcharge approvals, and security alerts cannot be disabled under operational safety policies.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsPrefModalOpen(false)}
                className="flex-1 py-3 bg-[#002953] hover:bg-[#002953] text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Save Preferences
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notifications List */}
      <div className="max-w-4xl mx-auto space-y-3">
        {filteredList.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 text-center border border-gray-100 space-y-3">
            <Bell className="w-12 h-12 text-gray-300 mx-auto" />
            <h3 className="font-heading font-bold text-base text-gray-800">No Notifications</h3>
            <p className="text-xs text-gray-500">You are all caught up on your laundry updates!</p>
          </div>
        ) : (
          filteredList.map((notif) => (
            <div
              key={notif.id}
              onClick={() => {
                onMarkAsRead(notif.id);
                if (notif.actionTab) onNavigate(notif.actionTab);
              }}
              className={`p-5 rounded-2xl border transition-all cursor-pointer flex items-start justify-between gap-4 ${
                !notif.read
                  ? 'bg-white border-[#002953]/30 shadow-xs ring-1 ring-[#002953]/5 hover:border-[#002953]'
                  : 'bg-white/80 border-gray-100 hover:border-gray-200'
              }`}
            >
              <div className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-2xl bg-gray-50 flex items-center justify-center shrink-0 mt-0.5">
                  {getIconForType(notif.type)}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-heading font-bold text-xs sm:text-sm text-gray-900">{notif.title}</h4>
                    {!notif.read && (
                      <span className="w-2 h-2 rounded-full bg-[#002953]" />
                    )}
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed max-w-2xl">{notif.message}</p>
                  <span className="text-[10px] text-gray-400 font-medium block pt-1">{notif.timestamp}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {notif.actionTab && (
                  <span className="text-xs font-bold text-[#002953] flex items-center gap-1 hover:underline">
                    <span>View</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
