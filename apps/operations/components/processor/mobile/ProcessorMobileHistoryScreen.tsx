'use client';

import React, { useState, useMemo } from 'react';
import {
  Search,
  Copy,
  Check,
  Star,
  PackageCheck,
  CheckCircle2,
  AlertCircle,
  X,
  Phone,
  Sparkles,
  Weight,
  Layers,
  MapPin,
  Clock,
} from 'lucide-react';
import { MobileCompletedJob } from './types';

interface ProcessorMobileHistoryScreenProps {
  initialJobs?: MobileCompletedJob[];
}

const SAMPLE_COMPLETED_JOBS: MobileCompletedJob[] = [
  {
    id: 'ORD-B82K9L4Q7D1AA-Z18E4',
    displayId: 'ORD-B82K9L4Q',
    customerName: 'Eleanor Vance',
    serviceType: 'Dry Cleaning & Press',
    itemCount: 4,
    completedAt: 'Today, 14:32',
    rating: 5.0,
    totalAmount: 38.5,
  },
  {
    id: 'ORD-C55P1M9X2K3BB-Y29F7',
    displayId: 'ORD-C55P1M9X',
    customerName: 'David H. Miller',
    serviceType: 'Wash + Steam Iron',
    itemCount: 1,
    completedAt: 'Today, 11:15',
    rating: 5.0,
    totalAmount: 22.0,
  },
  {
    id: 'ORD-A14F8R7T5N6CC-W33D2',
    displayId: 'ORD-A14F8R7T',
    customerName: 'Sarah Jenkins',
    serviceType: 'Express Wash & Fold',
    itemCount: 2,
    completedAt: 'Yesterday, 16:45',
    rating: 4.9,
    totalAmount: 29.0,
  },
];

export const ProcessorMobileHistoryScreen: React.FC<ProcessorMobileHistoryScreenProps> = ({
  initialJobs = SAMPLE_COMPLETED_JOBS,
}) => {
  const [jobs, setJobs] = useState<MobileCompletedJob[]>(initialJobs);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedService, setSelectedService] = useState<string>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<MobileCompletedJob | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  const handleCopyId = (id: string) => {
    navigator.clipboard?.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleToggleSampleData = () => {
    if (jobs.length === 0) {
      setJobs(SAMPLE_COMPLETED_JOBS);
    } else {
      setJobs([]);
    }
  };

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      const matchesSearch =
        !searchQuery.trim() ||
        job.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        job.displayId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        job.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        job.serviceType.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesService =
        selectedService === 'all' ||
        job.serviceType.toLowerCase().includes(selectedService.toLowerCase());

      return matchesSearch && matchesService;
    });
  }, [jobs, searchQuery, selectedService]);

  return (
    <div className="space-y-3.5">
      {/* 1. Summary Bar */}
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <div>
          <span className="text-xs font-bold text-[#111827]">Completed Orders</span>
          <p className="text-[10px] text-[#64748B]">
            {jobs.length} completed {jobs.length === 1 ? 'job' : 'jobs'}
          </p>
        </div>

        {/* Quick Demo Toggle Pill */}
        <button
          type="button"
          onClick={handleToggleSampleData}
          className="px-2.5 py-1 rounded-xl bg-white border border-[#E2E8F0] text-[10px] font-semibold text-[#023E8A] hover:bg-[#00B4D8]/10 transition-colors shadow-2xs cursor-pointer"
        >
          {jobs.length === 0 ? 'Load Sample Data' : 'Test Empty State'}
        </button>
      </div>

      {/* 2. Search & Service Filters */}
      <div className="space-y-2">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#64748B]">
            <Search className="w-3.5 h-3.5" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search order ID or customer"
            className="w-full h-10 pl-8 pr-3 rounded-[12px] bg-white border border-[#E2E8F0] text-xs font-medium text-[#111827] placeholder:text-[#64748B]/70 focus:outline-none focus:border-[#023E8A] focus:ring-2 focus:ring-[#023E8A]/10 shadow-[0_1px_4px_rgba(0,0,0,0.02)] transition-all"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 text-[10px] font-semibold text-[#64748B] no-scrollbar">
          <button
            type="button"
            onClick={() => setSelectedService('all')}
            className={`px-2.5 py-1 rounded-lg border transition-colors cursor-pointer shrink-0 ${
              selectedService === 'all'
                ? 'bg-[#03045E] text-white border-[#03045E]'
                : 'bg-white border-[#E2E8F0] hover:text-[#111827]'
            }`}
          >
            All Services
          </button>
          <button
            type="button"
            onClick={() => setSelectedService('wash')}
            className={`px-2.5 py-1 rounded-lg border transition-colors cursor-pointer shrink-0 ${
              selectedService === 'wash'
                ? 'bg-[#03045E] text-white border-[#03045E]'
                : 'bg-white border-[#E2E8F0] hover:text-[#111827]'
            }`}
          >
            Wash &amp; Iron
          </button>
          <button
            type="button"
            onClick={() => setSelectedService('dry cleaning')}
            className={`px-2.5 py-1 rounded-lg border transition-colors cursor-pointer shrink-0 ${
              selectedService === 'dry cleaning'
                ? 'bg-[#03045E] text-white border-[#03045E]'
                : 'bg-white border-[#E2E8F0] hover:text-[#111827]'
            }`}
          >
            Dry Cleaning
          </button>
        </div>
      </div>

      {/* 3. Small-Text 3-Columned Table (Order ID, Name, Price) */}
      {isLoading ? (
        <div className="py-12 flex flex-col items-center justify-center space-y-2">
          <div className="w-8 h-8 rounded-full border-2 border-[#023E8A] border-t-transparent animate-spin" />
          <span className="text-xs font-semibold text-[#64748B]">Loading history records...</span>
        </div>
      ) : hasError ? (
        <div className="rounded-[16px] bg-rose-50 border border-rose-200 p-5 text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-rose-600 mx-auto" />
          <div className="space-y-0.5">
            <h4 className="text-sm font-bold text-[#111827]">Failed to Load Completed Jobs</h4>
            <p className="text-xs text-rose-700">Check hub network connection or retry.</p>
          </div>
          <button
            type="button"
            onClick={() => setHasError(false)}
            className="px-4 py-2 rounded-xl bg-white border border-rose-200 text-xs font-bold text-rose-700 hover:bg-rose-100 transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      ) : jobs.length === 0 ? (
        /* Minimal Clean Empty State */
        <div className="rounded-[18px] bg-white border border-[#E2E8F0] p-8 text-center space-y-3 shadow-[0_2px_8px_rgba(3,4,94,0.03)] my-2">
          <div className="w-14 h-14 rounded-2xl bg-[#03045E]/5 text-[#64748B] mx-auto flex items-center justify-center border border-[#E2E8F0]">
            <PackageCheck className="w-7 h-7 stroke-[1.8] text-[#023E8A]" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-[#111827]">No completed jobs yet</h3>
            <p className="text-xs text-[#64748B] max-w-[260px] mx-auto leading-relaxed">
              Completed orders will appear here once processing is finished.
            </p>
          </div>
          <div className="pt-2">
            <button
              type="button"
              onClick={handleToggleSampleData}
              className="px-3.5 py-1.5 rounded-xl bg-[#03045E] hover:bg-[#023E8A] text-white text-xs font-semibold transition-all shadow-xs cursor-pointer active:scale-98"
            >
              Load Sample Jobs
            </button>
          </div>
        </div>
      ) : filteredJobs.length === 0 ? (
        /* No Search Results */
        <div className="rounded-[16px] bg-white border border-[#E2E8F0] p-6 text-center space-y-2">
          <p className="text-xs font-semibold text-[#111827]">
            No completed jobs match &quot;{searchQuery}&quot;
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setSelectedService('all');
            }}
            className="text-xs font-bold text-[#023E8A] hover:underline cursor-pointer"
          >
            Clear Search
          </button>
        </div>
      ) : (
        /* 3-Column Table with Small Text */
        <div className="rounded-[16px] bg-white border border-[#E2E8F0] shadow-[0_2px_8px_rgba(3,4,94,0.03)] overflow-hidden">
          <table className="w-full text-left border-collapse table-fixed">
            <thead>
              <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
                <th className="py-2.5 px-3 w-[40%]">Order ID</th>
                <th className="py-2.5 px-2 w-[35%]">Name</th>
                <th className="py-2.5 px-3 w-[25%] text-right">Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {filteredJobs.map((job) => (
                <tr
                  key={job.id}
                  onClick={() => setSelectedOrder(job)}
                  title="Click to view full order details"
                  className="hover:bg-[#F8FAFC] active:bg-[#00B4D8]/10 cursor-pointer transition-colors"
                >
                  {/* Column 1: Order ID */}
                  <td className="py-2.5 px-3">
                    <span className="font-mono text-[11px] font-bold text-[#111827] block truncate">
                      {job.displayId}
                    </span>
                  </td>

                  {/* Column 2: Name */}
                  <td className="py-2.5 px-2">
                    <span className="text-[11px] font-semibold text-[#111827] block truncate">
                      {job.customerName}
                    </span>
                  </td>

                  {/* Column 3: Price */}
                  <td className="py-2.5 px-3 text-right">
                    <span className="text-[11px] font-extrabold text-[#03045E] block whitespace-nowrap">
                      £{job.totalAmount.toFixed(2)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Subtext info */}
          <div className="p-2 bg-[#F8FAFC] border-t border-[#E2E8F0] text-center">
            <span className="text-[10px] text-[#64748B] font-medium">
              Tap any order row to inspect full details
            </span>
          </div>
        </div>
      )}

      {/* 4. Order Details Modal */}
      {selectedOrder && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-3 animate-in fade-in duration-150"
          onClick={() => setSelectedOrder(null)}
        >
          <div
            className="w-full max-w-[360px] bg-white rounded-[20px] p-5 shadow-2xl border border-[#E2E8F0] space-y-4 animate-in slide-in-from-bottom-4 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[#F1F5F9] pb-3">
              <div className="space-y-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#16A34A] bg-[#16A34A]/10 px-2 py-0.5 rounded-full inline-block">
                  Completed &amp; Passed QC
                </span>
                <h3 className="text-sm font-bold text-[#111827]">Order Details</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-[#64748B] flex items-center justify-center transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Order ID & Price Highlight Banner */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0]">
              <div className="space-y-0.5">
                <span className="text-[10px] text-[#64748B] font-semibold uppercase tracking-wider">
                  Order ID
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-xs font-bold text-[#111827]">
                    {selectedOrder.displayId}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyId(selectedOrder.id)}
                    title="Copy full Order ID"
                    className="p-1 rounded text-[#64748B] hover:text-[#03045E] cursor-pointer"
                  >
                    {copiedId === selectedOrder.id ? (
                      <Check className="w-3.5 h-3.5 text-[#16A34A]" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[10px] text-[#64748B] font-semibold uppercase tracking-wider block">
                  Total Price
                </span>
                <span className="text-base font-extrabold text-[#03045E]">
                  £{selectedOrder.totalAmount.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Extra Details Grid */}
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between py-1.5 border-b border-[#F1F5F9]">
                <span className="text-[#64748B] font-medium">Customer Name</span>
                <span className="font-bold text-[#111827]">{selectedOrder.customerName}</span>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-[#F1F5F9]">
                <span className="text-[#64748B] font-medium">Service Type</span>
                <span className="font-semibold text-[#023E8A]">{selectedOrder.serviceType}</span>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-[#F1F5F9]">
                <span className="text-[#64748B] font-medium">Items Count</span>
                <span className="font-bold text-[#111827]">
                  {selectedOrder.itemCount} {selectedOrder.itemCount === 1 ? 'piece' : 'pieces'}
                </span>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-[#F1F5F9]">
                <span className="text-[#64748B] font-medium">Completed At</span>
                <span className="font-medium text-[#111827]">{selectedOrder.completedAt}</span>
              </div>

              <div className="flex items-center justify-between py-1.5 border-b border-[#F1F5F9]">
                <span className="text-[#64748B] font-medium">Customer Rating</span>
                <div className="flex items-center gap-1 font-bold text-[#16A34A]">
                  <Star className="w-3.5 h-3.5 fill-[#F59E0B] text-[#F59E0B]" />
                  <span>{selectedOrder.rating.toFixed(1)} / 5.0</span>
                </div>
              </div>

              <div className="flex items-center justify-between py-1.5">
                <span className="text-[#64748B] font-medium">Facility</span>
                <span className="font-medium text-[#111827]">Preston Central Hub</span>
              </div>
            </div>

            {/* Close Button */}
            <button
              type="button"
              onClick={() => setSelectedOrder(null)}
              className="w-full h-11 rounded-[14px] bg-[#03045E] hover:bg-[#023E8A] text-white font-semibold text-xs shadow-sm transition-all active:scale-[0.98] cursor-pointer"
            >
              Close Details
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

