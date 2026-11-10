'use client';
import React, { useState, useEffect, useMemo } from 'react';
import {
  CheckCircle2,
  Clock,
  Package,
  Star,
  Search,
  X,
  Copy,
  Check,
} from 'lucide-react';

import { api } from '@laundelle/api-client';

interface CompletedOrder {
  id: string;
  customerName: string;
  customerPhone?: string;
  serviceType: string;
  itemCount: number;
  completedAt: string;
  bagQr?: string;
  total: number;
  rating?: number;
}

export const ProcessorHistoryView: React.FC = () => {
  const [orders, setOrders] = useState<CompletedOrder[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<CompletedOrder | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyId = (id: string) => {
    navigator.clipboard?.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const fetchCompletedFromBackend = async () => {
    try {
      const data: any = await api.processor.getJobs();
      if (data && data.completed) {
        const mapped: CompletedOrder[] = data.completed.map((o: any) => ({
          id: o.id || o._id?.toString(),
          customerName: (o.customerName && o.customerName !== 'Valued Customer' && o.customerName !== 'Customer')
            ? o.customerName
            : (o.customer_name && o.customer_name !== 'Valued Customer' && o.customer_name !== 'Customer')
              ? o.customer_name
              : (o.contactDetails ? `${o.contactDetails.firstName || ''} ${o.contactDetails.lastName || ''}`.trim() : '')
              || o.customer?.full_name
              || o.customer?.name
              || o.user_name
              || (o.customerEmail ? o.customerEmail.split('@')[0] : '')
              || 'Customer',
          customerPhone: o.customerPhone || o.customer_phone || o.contactDetails?.phone || '',
          serviceType: o.items?.[0]?.name || o.service || 'Laundry Service',
          itemCount: o.items?.length || 1,
          completedAt: o.updated_at ? new Date(o.updated_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : 'Today',
          bagQr: o.package?.qr_code || o.qr_code || o.id,
          total: Number(o.total || o.total_price || 0),
          rating: 5
        }));
        setOrders(mapped);
      }
    } catch { }
  };

  useEffect(() => {
    fetchCompletedFromBackend();
  }, []);

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return orders;
    const q = searchQuery.toLowerCase();
    return orders.filter(o =>
      o.id.toLowerCase().includes(q) ||
      o.customerName.toLowerCase().includes(q) ||
      o.serviceType.toLowerCase().includes(q)
    );
  }, [orders, searchQuery]);

  return (
    <div className="w-full space-y-5">
      {/* Search & Filter Toolbar */}
      <div className="bg-white rounded-2xl p-3 border border-slate-100 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search completed jobs..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200/80 rounded-xl text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-800 placeholder-slate-400"
          />
        </div>
      </div>

      {/* Desktop 7-Column Data Table (Hidden on Mobile) */}
      <div className="hidden sm:block bg-white rounded-2xl border border-slate-100 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-100 text-[11px] font-semibold uppercase text-slate-500 tracking-wider">
                <th className="py-3 px-5">Order ID & QR</th>
                <th className="py-3 px-5">Customer</th>
                <th className="py-3 px-5">Service</th>
                <th className="py-3 px-5">Items</th>
                <th className="py-3 px-5">Completed</th>
                <th className="py-3 px-5">Rating</th>
                <th className="py-3 px-5 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-700">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    No completed jobs found.
                  </td>
                </tr>
              ) : (
                filtered.map(order => (
                  <tr key={order.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3.5 px-5">
                      <span className="font-mono font-bold text-sm text-slate-900 block">{order.id}</span>
                      <span className="font-mono text-[10px] text-slate-400">{order.bagQr || 'QR-SEALED'}</span>
                    </td>
                    <td className="py-3.5 px-5 font-semibold text-slate-900">
                      {order.customerName}
                    </td>
                    <td className="py-3.5 px-5 text-slate-600">
                      {order.serviceType}
                    </td>
                    <td className="py-3.5 px-5">
                      <span className="inline-flex items-center gap-1 font-semibold text-slate-700 bg-slate-50 px-2 py-0.5 rounded border border-slate-200/60 text-[11px]">
                        <Package className="w-3 h-3 text-slate-400" /> {order.itemCount}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 text-slate-500">
                      <span className="inline-flex items-center gap-1 font-mono text-[11px]">
                        <Clock className="w-3 h-3 text-slate-400" /> {order.completedAt}
                      </span>
                    </td>
                    <td className="py-3.5 px-5">
                      {order.rating ? (
                        <div className="flex items-center gap-0.5 text-amber-400">
                          {Array.from({ length: order.rating }).map((_, i) => (
                            <Star key={i} className="w-3 h-3 fill-current" />
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[10px]">Verified</span>
                      )}
                    </td>
                    <td className="py-3.5 px-5 text-right font-bold font-mono text-xs text-slate-900">
                      £{order.total.toFixed(2)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile-Optimized 3-Column Table (Order ID, Name, Price) */}
      <div className="block sm:hidden bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        <table className="w-full text-left border-collapse table-fixed">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <th className="py-2.5 px-3 w-[40%]">Order ID</th>
              <th className="py-2.5 px-2 w-[35%]">Name</th>
              <th className="py-2.5 px-3 w-[25%] text-right">Price</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-10 text-center text-xs text-slate-400">
                  No completed jobs found.
                </td>
              </tr>
            ) : (
              filtered.map(order => (
                <tr
                  key={order.id}
                  onClick={() => setSelectedOrder(order)}
                  title="Click to view order details"
                  className="hover:bg-slate-50 active:bg-blue-50/50 cursor-pointer transition-colors"
                >
                  <td className="py-2.5 px-3">
                    <span className="font-mono text-[11px] font-bold text-slate-900 block truncate">
                      {order.id}
                    </span>
                  </td>
                  <td className="py-2.5 px-2">
                    <span className="text-[11px] font-semibold text-slate-800 block truncate">
                      {order.customerName}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <span className="text-[11px] font-extrabold text-blue-900 block whitespace-nowrap">
                      £{order.total.toFixed(2)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {filtered.length > 0 && (
          <div className="p-2 bg-slate-50/80 border-t border-slate-100 text-center">
            <span className="text-[10px] text-slate-500 font-medium">
              Tap any row to view complete order details
            </span>
          </div>
        )}
      </div>

      {/* Order Details Modal on Mobile */}
      {selectedOrder && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-3 animate-in fade-in duration-150"
          onClick={() => setSelectedOrder(null)}
        >
          <div
            className="w-full max-w-[360px] bg-white rounded-2xl p-5 shadow-2xl border border-slate-100 space-y-4 animate-in slide-in-from-bottom-4 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="space-y-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full inline-block border border-emerald-200">
                  Completed &amp; Passed QC
                </span>
                <h3 className="text-sm font-bold text-slate-900">Order Details</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Order ID & Price Highlight Banner */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
              <div className="space-y-0.5 min-w-0 pr-2">
                <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                  Order ID
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-xs font-bold text-slate-900 truncate">
                    {selectedOrder.id}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyId(selectedOrder.id)}
                    title="Copy full Order ID"
                    className="p-1 rounded text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    {copiedId === selectedOrder.id ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              <div className="text-right shrink-0">
                <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider block">
                  Total Price
                </span>
                <span className="text-base font-extrabold text-[#002953]">
                  £{selectedOrder.total.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Extra Details Grid */}
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Customer Name</span>
                <span className="font-bold text-slate-900">{selectedOrder.customerName}</span>
              </div>

              {selectedOrder.customerPhone && (
                <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-500 font-medium">Phone Number</span>
                  <span className="font-medium text-slate-900">{selectedOrder.customerPhone}</span>
                </div>
              )}

              <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Service Type</span>
                <span className="font-semibold text-blue-700">{selectedOrder.serviceType}</span>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Items Count</span>
                <span className="font-bold text-slate-900">
                  {selectedOrder.itemCount} {selectedOrder.itemCount === 1 ? 'piece' : 'pieces'}
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Completed Time</span>
                <span className="font-medium text-slate-900">{selectedOrder.completedAt}</span>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Customer Rating</span>
                <div className="flex items-center gap-1 font-bold text-emerald-700">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  <span>{selectedOrder.rating || 5}.0 / 5.0</span>
                </div>
              </div>

              <div className="flex items-center justify-between py-1.5">
                <span className="text-slate-500 font-medium">Bag QR Tag</span>
                <span className="font-mono text-slate-700">{selectedOrder.bagQr || 'QR-SEALED'}</span>
              </div>
            </div>

            {/* Close Button */}
            <button
              type="button"
              onClick={() => setSelectedOrder(null)}
              className="w-full h-11 rounded-xl bg-[#002953] hover:bg-[#001f3f] text-white font-semibold text-xs shadow-sm transition-all active:scale-[0.98] cursor-pointer"
            >
              Close Details
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
