'use client';

import React, { useState } from 'react';
import {
  Copy,
  Check,
  Phone,
  Sparkles,
  Weight,
  Tag,
  CheckCircle2,
  Circle,
  ArrowRight,
  Filter,
  AlertCircle,
  Clock,
  Layers,
} from 'lucide-react';
import { MobileProcessorOrder, PROCESSING_STAGES } from './types';

interface ProcessorMobileOrdersScreenProps {
  orders?: MobileProcessorOrder[];
  onAdvanceStage?: (orderId: string, nextStageName: string) => void;
}

const DEFAULT_ORDERS: MobileProcessorOrder[] = [
  {
    id: 'ORD-YTYBJT6Q3ABAG-FJ26A2EY',
    displayId: 'ORD-YTYBJT6Q3ABAG-FJ26A2EY',
    customerName: 'Master Charlie',
    customerPhone: '+44664356',
    serviceType: 'Wash + Steam Iron',
    weightKg: 5,
    itemCount: 1,
    currentStageIndex: 2, // 0: Intake, 1: Sorting, 2: Washing Cycle
    statusLabel: 'Washing',
    scannedAt: '10:45 AM',
    totalAmount: 24.5,
  },
];

export const ProcessorMobileOrdersScreen: React.FC<ProcessorMobileOrdersScreenProps> = ({
  orders: initialOrders = DEFAULT_ORDERS,
  onAdvanceStage,
}) => {
  const [orders, setOrders] = useState<MobileProcessorOrder[]>(initialOrders);
  const [filter, setFilter] = useState<string>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmOrder, setConfirmOrder] = useState<{
    order: MobileProcessorOrder;
    nextStageName: string;
    nextIndex: number;
  } | null>(null);
  const [expandedTracker, setExpandedTracker] = useState<Record<string, boolean>>({
    'ORD-YTYBJT6Q3ABAG-FJ26A2EY': true,
  });

  const handleCopyId = (id: string) => {
    navigator.clipboard?.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handlePromptAdvance = (order: MobileProcessorOrder) => {
    const nextIdx = order.currentStageIndex + 1;
    if (nextIdx < PROCESSING_STAGES.length) {
      setConfirmOrder({
        order,
        nextStageName: PROCESSING_STAGES[nextIdx].name,
        nextIndex: nextIdx,
      });
    }
  };

  const handleConfirmAdvance = () => {
    if (!confirmOrder) return;
    const { order, nextIndex, nextStageName } = confirmOrder;

    setOrders((prev) =>
      prev.map((o) =>
        o.id === order.id
          ? {
              ...o,
              currentStageIndex: nextIndex,
              statusLabel: PROCESSING_STAGES[nextIndex].shortName,
            }
          : o
      )
    );

    if (onAdvanceStage) {
      onAdvanceStage(order.id, nextStageName);
    }
    setConfirmOrder(null);
  };

  const filteredOrders = orders.filter((o) => {
    if (filter === 'all') return true;
    if (filter === 'washing') return o.currentStageIndex === 2;
    if (filter === 'drying') return o.currentStageIndex === 3;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* 1. Page Summary & Quick Filter */}
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-[#111827]">Active Orders</span>
          <span className="px-2 py-0.5 rounded-full bg-[#03045E]/10 text-[#03045E] text-[11px] font-bold">
            {orders.length} in queue
          </span>
        </div>

        {/* Compact Filter Tabs */}
        <div className="flex items-center gap-1 bg-white border border-[#E2E8F0] p-0.5 rounded-xl text-[11px] font-semibold text-[#64748B]">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-2 py-1 rounded-lg transition-colors cursor-pointer ${
              filter === 'all' ? 'bg-[#03045E] text-white' : 'hover:text-[#111827]'
            }`}
          >
            All ({orders.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('washing')}
            className={`px-2 py-1 rounded-lg transition-colors cursor-pointer ${
              filter === 'washing' ? 'bg-[#03045E] text-white' : 'hover:text-[#111827]'
            }`}
          >
            Washing
          </button>
        </div>
      </div>

      {/* 2. Order Cards List */}
      <div className="space-y-4">
        {filteredOrders.map((order) => {
          const currentStage = PROCESSING_STAGES[order.currentStageIndex];
          const nextStage = PROCESSING_STAGES[order.currentStageIndex + 1];
          const isExpanded = !!expandedTracker[order.id];

          return (
            <div
              key={order.id}
              className="rounded-[18px] bg-white border border-[#E2E8F0] p-4 shadow-[0_2px_12px_rgba(3,4,94,0.04)] space-y-3.5 relative overflow-hidden transition-all"
            >
              {/* Top Section: ID & Status Badge */}
              <div className="flex items-start justify-between gap-2 border-b border-[#F1F5F9] pb-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs font-bold text-[#111827] tracking-tight">
                      {order.displayId}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyId(order.id)}
                      title="Copy Order ID"
                      className="p-1 rounded-md text-[#64748B] hover:text-[#03045E] hover:bg-slate-100 transition-colors cursor-pointer"
                    >
                      {copiedId === order.id ? (
                        <Check className="w-3.5 h-3.5 text-[#16A34A]" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-[#64748B]">
                    <Clock className="w-3 h-3 text-[#00B4D8]" />
                    <span>Intake at {order.scannedAt || '10:45 AM'}</span>
                  </div>
                </div>

                {/* Status Badge */}
                <span className="px-2.5 py-1 rounded-full bg-[#00B4D8]/10 text-[#023E8A] border border-[#00B4D8]/20 text-xs font-bold tracking-wide uppercase shrink-0">
                  {order.statusLabel}
                </span>
              </div>

              {/* Customer Section */}
              <div className="flex items-center justify-between rounded-[12px] bg-[#F7F9FC] p-2.5 border border-[#E2E8F0]">
                <div>
                  <p className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">
                    Customer
                  </p>
                  <p className="text-sm font-bold text-[#111827]">{order.customerName}</p>
                </div>
                <a
                  href={`tel:${order.customerPhone}`}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-[#E2E8F0] text-[#023E8A] hover:bg-[#00B4D8]/10 text-xs font-semibold shadow-2xs transition-colors"
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>{order.customerPhone}</span>
                </a>
              </div>

              {/* Service Details (3 Compact Information Items) */}
              <div className="grid grid-cols-3 gap-2">
                <div className="p-2 rounded-[12px] bg-[#F7F9FC] border border-[#E2E8F0] flex flex-col items-center justify-center text-center">
                  <Sparkles className="w-4 h-4 text-[#00B4D8] mb-1" />
                  <span className="text-[11px] font-bold text-[#111827] leading-tight line-clamp-1">
                    {order.serviceType}
                  </span>
                  <span className="text-[9px] text-[#64748B]">Service</span>
                </div>

                <div className="p-2 rounded-[12px] bg-[#F7F9FC] border border-[#E2E8F0] flex flex-col items-center justify-center text-center">
                  <Weight className="w-4 h-4 text-[#023E8A] mb-1" />
                  <span className="text-[11px] font-bold text-[#111827]">
                    {order.weightKg} kg
                  </span>
                  <span className="text-[9px] text-[#64748B]">Batch Weight</span>
                </div>

                <div className="p-2 rounded-[12px] bg-[#F7F9FC] border border-[#E2E8F0] flex flex-col items-center justify-center text-center">
                  <Tag className="w-4 h-4 text-[#023E8A] mb-1" />
                  <span className="text-[11px] font-bold text-[#111827]">
                    {order.itemCount} {order.itemCount === 1 ? 'item' : 'items'}
                  </span>
                  <span className="text-[9px] text-[#64748B]">Quantity</span>
                </div>
              </div>

              {/* Processing Progress Tracker (Mobile-Optimized Vertical Stepper) */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold text-[#111827] uppercase tracking-wider">
                      Processing Journey
                    </span>
                    <span className="text-[11px] font-semibold text-[#023E8A]">
                      ({order.currentStageIndex + 1}/{PROCESSING_STAGES.length})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedTracker((prev) => ({
                        ...prev,
                        [order.id]: !prev[order.id],
                      }))
                    }
                    className="text-[11px] font-semibold text-[#023E8A] hover:underline cursor-pointer"
                  >
                    {isExpanded ? 'Collapse' : 'View All 8 Steps'}
                  </button>
                </div>

                {/* Current Stage Indicator Banner */}
                <div className="p-2.5 rounded-[12px] bg-[#00B4D8]/10 border border-[#00B4D8]/20 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#023E8A] animate-ping" />
                    <div>
                      <p className="text-[10px] text-[#023E8A] font-semibold uppercase tracking-wider">
                        Current Stage
                      </p>
                      <p className="text-xs font-bold text-[#03045E]">
                        Step {currentStage.id}: {currentStage.name}
                      </p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-md bg-white text-[#023E8A] text-[10px] font-extrabold border border-[#00B4D8]/30">
                    IN PROGRESS
                  </span>
                </div>

                {/* 8-Step Stepper Details (Collapsible for Clean Mobile Ergonomics) */}
                {isExpanded && (
                  <div className="p-3 rounded-[14px] bg-[#F7F9FC] border border-[#E2E8F0] space-y-2 mt-2 animate-in fade-in duration-150">
                    {PROCESSING_STAGES.map((stage, idx) => {
                      const isCompleted = idx < order.currentStageIndex;
                      const isCurrent = idx === order.currentStageIndex;
                      const isUpcoming = idx > order.currentStageIndex;

                      return (
                        <div key={stage.id} className="relative flex items-center gap-3">
                          {/* Connector Line */}
                          {idx < PROCESSING_STAGES.length - 1 && (
                            <div
                              className={`absolute left-[11px] top-5 w-[2px] h-4 z-0 ${
                                isCompleted ? 'bg-[#16A34A]' : 'bg-[#E2E8F0]'
                              }`}
                            />
                          )}

                          {/* Node Icon */}
                          <div className="relative z-10 shrink-0">
                            {isCompleted ? (
                              <div className="w-6 h-6 rounded-full bg-[#16A34A] text-white flex items-center justify-center">
                                <Check className="w-3.5 h-3.5 stroke-[2.8]" />
                              </div>
                            ) : isCurrent ? (
                              <div className="w-6 h-6 rounded-full bg-[#023E8A] text-white flex items-center justify-center ring-4 ring-[#00B4D8]/30">
                                <span className="w-2 h-2 rounded-full bg-white" />
                              </div>
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-white border border-[#CBD5E1] text-[#94A3B8] flex items-center justify-center text-[10px] font-bold">
                                {stage.id}
                              </div>
                            )}
                          </div>

                          {/* Stage Name & Status */}
                          <div className="flex-1 flex items-center justify-between min-w-0">
                            <span
                              className={`text-xs ${
                                isCurrent
                                  ? 'font-bold text-[#03045E]'
                                  : isCompleted
                                  ? 'font-medium text-[#111827]'
                                  : 'text-[#94A3B8]'
                              }`}
                            >
                              {stage.name}
                            </span>
                            <span
                              className={`text-[10px] ${
                                isCurrent
                                  ? 'font-bold text-[#023E8A]'
                                  : isCompleted
                                  ? 'text-[#16A34A] font-medium'
                                  : 'text-[#CBD5E1]'
                              }`}
                            >
                              {isCurrent ? 'Active Now' : isCompleted ? 'Completed' : 'Pending'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Primary Action Button (Minimum 48px Height) */}
              <div className="pt-1">
                {nextStage ? (
                  <button
                    type="button"
                    onClick={() => handlePromptAdvance(order)}
                    className="w-full h-12 rounded-[14px] bg-[#03045E] hover:bg-[#023E8A] text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-[0_4px_14px_rgba(3,4,94,0.18)] transition-all active:scale-[0.98] cursor-pointer"
                  >
                    <span>
                      {order.currentStageIndex === 2 ? 'Move to Dryer →' : `Advance to ${nextStage.name} →`}
                    </span>
                  </button>
                ) : (
                  <div className="w-full h-12 rounded-[14px] bg-[#16A34A]/10 text-[#16A34A] border border-[#16A34A]/20 font-bold text-xs flex items-center justify-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Processing Complete • Ready for Delivery</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Confirmation Modal Interaction */}
      {confirmOrder && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-3 animate-in fade-in duration-150"
        >
          <div className="w-full max-w-[360px] bg-white rounded-[20px] p-5 shadow-2xl border border-[#E2E8F0] space-y-4 animate-in slide-in-from-bottom-4 duration-200">
            <div className="w-12 h-12 rounded-2xl bg-[#00B4D8]/10 text-[#023E8A] mx-auto flex items-center justify-center">
              <Layers className="w-6 h-6 stroke-[2.2]" />
            </div>

            <div className="text-center space-y-1">
              <h4 className="text-base font-bold text-[#111827]">
                Advance Processing Stage?
              </h4>
              <p className="text-xs text-[#64748B]">
                Move order <span className="font-mono font-semibold text-[#03045E]">{confirmOrder.order.id.slice(0, 16)}...</span> to:
              </p>
              <div className="p-2 rounded-xl bg-[#00B4D8]/10 text-[#03045E] font-bold text-sm border border-[#00B4D8]/20 mt-1">
                {confirmOrder.nextStageName}
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={handleConfirmAdvance}
                className="w-full h-12 rounded-[14px] bg-[#03045E] hover:bg-[#023E8A] text-white font-semibold text-sm shadow-sm transition-all active:scale-[0.98] cursor-pointer"
              >
                Confirm &amp; Move Stage
              </button>
              <button
                type="button"
                onClick={() => setConfirmOrder(null)}
                className="w-full h-11 rounded-[14px] border border-[#E2E8F0] bg-white text-[#64748B] hover:bg-slate-50 font-semibold text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

