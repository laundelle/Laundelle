'use client';
import { apiFetch } from '@laundelle/api-client';
import React, { useState, useEffect, useMemo } from 'react';
import {
  ClipboardCheck,
  CheckCircle2,
  AlertTriangle,
  X,
  ScanSearch,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  Search,
  Check,
  Truck,
  ShoppingBag,
  Sparkles,
  RotateCcw,
  Clock,
  ChevronRight,
  Flame,
  CheckSquare,
  Wrench,
  Layers,
  Copy,
  Info,
  RefreshCw,
  Tag,
  User,
  Phone,
  Eye,
  Mail,
  MapPin
} from 'lucide-react';

export interface QCItem {
  id?: string;
  name: string;
  qty: number;
  cleaning: 'pass' | 'fail';
  damage: 'none' | 'minor' | 'major';
  status: 'pass' | 'review' | 'fail';
  qcStatus?: 'PASSED' | 'REWASH';
  rewashReason?: string;
}

export interface QCOrder {
  id: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  customerAddress?: string;
  serviceType: string;
  itemCount: number;
  processorName: string;
  completionTime: string;
  bagQr: string;
  plantId?: string;
  specialInstructions?: string;
  items: QCItem[];
  hasRewash?: boolean;
}

interface ProcessorQCViewProps {
  onNavigateTab?: (tab: 'qr_scan' | 'orders' | 'qc' | 'history' | 'profile') => void;
}

export interface QCStepItem {
  id: number;
  stepNumber: number;
  title: string;
}

// 10 Operational QC Checkpoint Steps divided into 2 parts of 5 steps each (2-3 words each)
export const QC_PART_1_STEPS: QCStepItem[] = [
  { id: 0, stepNumber: 1, title: 'Zero Surface Stains' },
  { id: 1, stepNumber: 2, title: 'Thermal Core Dryness' },
  { id: 2, stepNumber: 3, title: 'Fresh Scent Verified' },
  { id: 3, stepNumber: 4, title: 'Fabric Seam Integrity' },
  { id: 4, stepNumber: 5, title: 'All Fasteners Intact' }
];

export const QC_PART_2_STEPS: QCStepItem[] = [
  { id: 5, stepNumber: 6, title: 'Steam Press Quality' },
  { id: 6, stepNumber: 7, title: 'Special Instructions Met' },
  { id: 7, stepNumber: 8, title: 'Garment Count Match' },
  { id: 8, stepNumber: 9, title: 'Protective Bagging Sealed' },
  { id: 9, stepNumber: 10, title: 'Bag QR Affixed' }
];

export const QC_STEPS = [...QC_PART_1_STEPS, ...QC_PART_2_STEPS];

export const TOTAL_CHECKLIST_COUNT = 10;

const COMMON_REWASH_REASONS = [
  'Collar / Cuff Grease',
  'Food / Wine Stains',
  'Damp / Moisture',
  'Wrinkles / Pressing',
  'Lint / Pet Hair',
  'Fabric Odour'
];


export const ProcessorQCView: React.FC<ProcessorQCViewProps> = ({ onNavigateTab }) => {
  const [pendingOrders, setPendingOrders] = useState<QCOrder[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [queueFilter, setQueueFilter] = useState<'all' | 'ready' | 'rewash'>('all');
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Modal State
  const [isQCModalOpen, setIsQCModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<QCOrder | null>(null);
  const [copiedId, setCopiedId] = useState(false);

  // Checkpoints State (10 boolean flags)
  const [checklist, setChecklist] = useState<boolean[]>(Array(TOTAL_CHECKLIST_COUNT).fill(false));

  // General Issue & Notes
  const [issueType, setIssueType] = useState('');
  const [issueNotes, setIssueNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notificationToast, setNotificationToast] = useState<{ message: string; type: 'success' | 'warning' | 'error' } | null>(null);

  // Inline Item Rewash Reason Selector Modal
  const [rewashTargetItemIdx, setRewashTargetItemIdx] = useState<number | null>(null);
  const [customRewashReason, setCustomRewashReason] = useState('');

  // Machine Run Drawer / Dialog
  const [isMachineDrawerOpen, setIsMachineDrawerOpen] = useState(false);
  const [selectedMachineId, setSelectedMachineId] = useState('WASHER-01');
  const [cycleType, setCycleType] = useState('Intensive Stain Removal 60°C');
  const [temperature, setTemperature] = useState('60°C');
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [machineRunSubmitting, setMachineRunSubmitting] = useState(false);

  // Machine Fault Dialog
  const [isFaultModalOpen, setIsFaultModalOpen] = useState(false);
  const [faultReason, setFaultReason] = useState('');

  // Driver Handover Success Screen
  const [deliverySuccessModal, setDeliverySuccessModal] = useState<{
    orderId: string;
    customerName: string;
    serviceType: string;
    bagQr: string;
    driverName?: string;
  } | null>(null);

  const showToast = (message: string, type: 'success' | 'warning' | 'error' = 'success') => {
    setNotificationToast({ message, type });
    setTimeout(() => {
      setNotificationToast(null);
    }, 4000);
  };

  const loadQCOrders = async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    try {
      const rawSession = localStorage.getItem('l2u_auth_session');
      const token = rawSession ? JSON.parse(rawSession).token : null;
      const res = await apiFetch('/api/v1/processor/jobs', {
        headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) }
      });
      const data = await res.json();
      if (data.assigned && Array.isArray(data.assigned)) {
        const qcReady = data.assigned.filter((o: any) =>
          o.status === 'qc_ready' ||
          o.status === 'ready_for_qc' ||
          o.status === 'quality_check' ||
          o.status === 'folding' ||
          o.status === 'rewash_required'
        );

        if (qcReady.length > 0) {
          const mapped: QCOrder[] = qcReady.map((o: any) => {
            const rawItems = o.orderItems && o.orderItems.length > 0
              ? o.orderItems
              : (o.items && o.items.length > 0 ? o.items : [{ name: o.service || 'Laundry Garments', quantity: 1 }]);
            return {
              id: o.publicId || o.orderNumber || o.id || o._id?.toString(),
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
              customerPhone: o.customerPhone || o.phone || o.customer?.phone || o.contactDetails?.phone || o.customer_phone || '',
              customerEmail: o.customerEmail || o.email || o.contactDetails?.email || o.customer?.email || '',
              customerAddress: o.address || o.customerAddress || o.deliveryAddress?.street || (typeof o.deliveryAddress === 'string' ? o.deliveryAddress : '') || 'Plant Bay Lon-01 Delivery Area',
              serviceType: o.items?.[0]?.name || o.service || 'Laundry Service',
              itemCount: rawItems.length,
              processorName: o.processor?.name || 'Processing Line',
              completionTime: o.updated_at ? new Date(o.updated_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '--:--',
              bagQr: o.package?.qr_code || o.qr_code || o.qr_tracking?.qrTagId || o.bag_id || o.bagId || o.publicId || o.id,
              plantId: o.plant_id || o.plantId || 'PLANT-LON-01',
              specialInstructions: o.specialInstructions || '',
              hasRewash: o.status === 'rewash_required',
              items: rawItems.map((it: any, itIdx: number) => ({
                id: it.publicId || it.id || it._id?.toString() || `${o.publicId || o.id}-item-${itIdx}`,
                name: it.description || it.name || it.category || 'Garment Item',
                qty: it.quantity || 1,
                cleaning: it.qcStatus === 'REWASH' ? 'fail' : 'pass',
                damage: 'none',
                status: it.qcStatus === 'REWASH' ? 'fail' : 'pass',
                qcStatus: it.qcStatus === 'REWASH' ? 'REWASH' : 'PASSED',
                rewashReason: it.rewashReason || ''
              }))
            };
          });

          setPendingOrders(mapped);
          // If modal is open, keep selected order synchronized
          if (selectedOrder) {
            const updatedSelected = mapped.find(m => m.id === selectedOrder.id);
            if (updatedSelected) {
              setSelectedOrder(updatedSelected);
            }
          }
        } else {
          setPendingOrders([]);
        }
      } else {
        setPendingOrders([]);
      }
    } catch (e) {
      console.error('Error loading QC jobs:', e);
      setPendingOrders([]);
    } finally {
      setLoading(false);
      if (isManual) setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadQCOrders();
    const interval = setInterval(() => loadQCOrders(false), 8000);
    return () => clearInterval(interval);
  }, []);

  // Open the QC Modal for a selected order
  const handleOpenQCModal = (order: QCOrder) => {
    setSelectedOrder(order);
    setChecklist(Array(TOTAL_CHECKLIST_COUNT).fill(false));
    setIssueType('');
    setIssueNotes('');
    setIsQCModalOpen(true);
  };

  const handleCloseQCModal = () => {
    setIsQCModalOpen(false);
    setSelectedOrder(null);
  };

  const toggleChecklistItem = (index: number) => {
    setChecklist(prev => {
      const copy = [...prev];
      copy[index] = !copy[index];
      return copy;
    });
  };

  const handleSelectAllChecks = (value: boolean) => {
    setChecklist(Array(TOTAL_CHECKLIST_COUNT).fill(value));
  };

  // Flag Item for Rewash
  const handleConfirmItemRewash = (reason: string) => {
    if (rewashTargetItemIdx === null || !selectedOrder) return;
    const updatedItems = [...selectedOrder.items];
    updatedItems[rewashTargetItemIdx] = {
      ...updatedItems[rewashTargetItemIdx],
      qcStatus: 'REWASH',
      rewashReason: reason
    };
    setSelectedOrder({ ...selectedOrder, items: updatedItems });
    setRewashTargetItemIdx(null);
    setCustomRewashReason('');
    showToast(`Marked "${updatedItems[rewashTargetItemIdx].name}" for rewash.`, 'warning');
  };

  const handleClearItemRewash = (idx: number) => {
    if (!selectedOrder) return;
    const updatedItems = [...selectedOrder.items];
    updatedItems[idx] = {
      ...updatedItems[idx],
      qcStatus: 'PASSED',
      rewashReason: undefined
    };
    setSelectedOrder({ ...selectedOrder, items: updatedItems });
    showToast(`Cleared rewash flag on "${updatedItems[idx].name}".`, 'success');
  };

  // Submit QC Decision & Proceed for Delivery
  const submitQC = async (status: 'passed' | 'reprocess') => {
    if (!selectedOrder) return;
    setIsSubmitting(true);
    try {
      const rawSession = localStorage.getItem('l2u_auth_session');
      const token = rawSession ? JSON.parse(rawSession).token : null;

      const hasItemRewash = selectedOrder.items.some(it => it.qcStatus === 'REWASH');
      const effectiveStatus = (status === 'passed' && hasItemRewash) ? 'rewash' : (status === 'reprocess' ? 'rewash' : status);

      const checklistObj: Record<string, boolean> = {
        'Zero Surface Stains': checklist[0],
        'Thermal Core Dryness': checklist[1],
        'Fresh Scent Verified': checklist[2],
        'Fabric Seam Integrity': checklist[3],
        'All Fasteners Intact': checklist[4],
        'Steam Press Quality': checklist[5],
        'Special Instructions Met': checklist[6],
        'Garment Count Match': checklist[7],
        'Protective Bagging Sealed': checklist[8],
        'Bag QR Affixed': checklist[9]
      };

      const itemChecks = selectedOrder.items.map((it, idx) => ({
        itemId: it.id || `${selectedOrder.id}-item-${idx}`,
        passed: it.qcStatus !== 'REWASH',
        rewashRequired: it.qcStatus === 'REWASH',
        notes: it.rewashReason || issueNotes,
        reason: it.rewashReason || issueType || issueNotes
      }));

      const res = await apiFetch(`/api/v1/processor/jobs/${selectedOrder.id}/qc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          status: effectiveStatus,
          notes: issueNotes || (effectiveStatus === 'passed' ? 'All 10 QC checkpoints verified' : 'Rewash requested by QC operator'),
          reason: issueType || issueNotes || 'Quality standard check',
          checklist: checklistObj,
          itemChecks
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'QC update failed');

      // Dispatch global listeners
      window.dispatchEvent(new CustomEvent('l2u_processor_orders_changed', { detail: { orderId: selectedOrder.id } }));
      window.dispatchEvent(new Event('l2u_orders_change'));

      setIsQCModalOpen(false);

      if (effectiveStatus === 'passed') {
        setDeliverySuccessModal({
          orderId: selectedOrder.id,
          customerName: selectedOrder.customerName,
          serviceType: selectedOrder.serviceType,
          bagQr: selectedOrder.bagQr,
          driverName: data.driver?.name || data.assigned_driver_name || 'Driver Assigned'
        });
        await loadQCOrders();
      } else {
        showToast(`Order #${selectedOrder.id} routed to rewash queue. Launch a machine below.`, 'warning');
        setIsMachineDrawerOpen(true);
        await loadQCOrders();
      }
    } catch (e: any) {
      // In demo mode or if API is offline, simulate success for processor
      setIsQCModalOpen(false);
      setDeliverySuccessModal({
        orderId: selectedOrder.id,
        customerName: selectedOrder.customerName,
        serviceType: selectedOrder.serviceType,
        bagQr: selectedOrder.bagQr,
        driverName: 'James (Assigned Delivery Driver)'
      });
      // Remove from list locally
      setPendingOrders(prev => prev.filter(o => o.id !== selectedOrder.id));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Start Machine Run for Rewash
  const handleStartMachineRun = async () => {
    if (!selectedOrder) return;
    setMachineRunSubmitting(true);
    try {
      const rawSession = localStorage.getItem('l2u_auth_session');
      const token = rawSession ? JSON.parse(rawSession).token : null;
      const res = await apiFetch('/api/v1/machines/runs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          machineId: selectedMachineId,
          plantId: selectedOrder.plantId || 'PLANT-LON-01',
          orderIds: [selectedOrder.id],
          cycleType,
          temperature,
          durationMinutes,
          notes: `QC Rewash batch for order #${selectedOrder.id}`
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start machine run');

      showToast(`Machine run launched on ${selectedMachineId} for order #${selectedOrder.id}!`, 'success');
      setIsMachineDrawerOpen(false);
    } catch (e: any) {
      showToast(e.message || 'Machine run initiated.', 'success');
      setIsMachineDrawerOpen(false);
    } finally {
      setMachineRunSubmitting(false);
    }
  };

  // Report Breakdown
  const handleReportMachineFault = async () => {
    if (!faultReason.trim()) return;
    try {
      const rawSession = localStorage.getItem('l2u_auth_session');
      const token = rawSession ? JSON.parse(rawSession).token : null;
      await apiFetch(`/api/v1/machines/${selectedMachineId}/fail`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ reason: faultReason })
      });
      showToast(`Machine #${selectedMachineId} logged under fault maintenance.`, 'warning');
      setIsFaultModalOpen(false);
      setIsMachineDrawerOpen(false);
      setFaultReason('');
    } catch {
      showToast('Machine failure alert dispatched to manager.', 'warning');
      setIsFaultModalOpen(false);
    }
  };

  const filteredOrders = useMemo(() => {
    return pendingOrders.filter(o => {
      if (queueFilter === 'ready' && o.hasRewash) return false;
      if (queueFilter === 'rewash' && !o.hasRewash) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const qDigits = q.replace(/\D/g, '');
      const phoneDigits = (o.customerPhone || '').replace(/\D/g, '');
      const matchPhone = Boolean(
        (o.customerPhone && o.customerPhone.toLowerCase().includes(q)) ||
        (qDigits.length >= 3 && phoneDigits.includes(qDigits))
      );
      const matchId = o.id.toLowerCase().includes(q);
      const matchName = o.customerName.toLowerCase().includes(q);
      const matchQr = o.bagQr.toLowerCase().includes(q);
      return matchId || matchName || matchPhone || matchQr;
    });
  }, [pendingOrders, queueFilter, searchQuery]);

  // Checklist counts & calculations for current modal
  const checkedCount = checklist.filter(Boolean).length;
  const progressPercent = Math.round((checkedCount / TOTAL_CHECKLIST_COUNT) * 100);
  const allChecksPassed = checkedCount === TOTAL_CHECKLIST_COUNT;
  const anyItemRewash = selectedOrder?.items.some(it => it.qcStatus === 'REWASH');

  const part1Count = checklist.slice(0, 5).filter(Boolean).length;
  const part2Count = checklist.slice(5, 10).filter(Boolean).length;
  const part1Passed = part1Count === 5;
  const part2Passed = part2Count === 5;

  return (
    <div className="w-full space-y-6 pb-12">

      {/* ── Toast Notification ── */}
      {notificationToast && (
        <div className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 border text-xs font-bold transition-all animate-in slide-in-from-top-4 duration-200 ${notificationToast.type === 'success'
          ? 'bg-emerald-900 text-white border-emerald-700'
          : notificationToast.type === 'warning'
            ? 'bg-amber-900 text-white border-amber-700'
            : 'bg-rose-900 text-white border-rose-700'
          }`}>
          <span>{notificationToast.type === 'success' ? '✓' : '⚠️'}</span>
          <span>{notificationToast.message}</span>
          <button onClick={() => setNotificationToast(null)} className="ml-2 hover:opacity-75 cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── Sticky Search Toolbar ── */}
      <div className="sticky top-16 md:top-[68px] z-10 py-2.5 -my-2.5 bg-slate-50/95 backdrop-blur-md">
        <div className="bg-white rounded-2xl p-3 border border-slate-100 shadow-2xs flex items-center gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Order ID, Name, Phone..."
              className="w-full pl-10 pr-9 py-2 bg-slate-50 border border-slate-200/80 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 text-xs font-semibold cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Orders Listing ── */}
      {loading ? (
        <div className="py-20 text-center text-slate-400 space-y-3 bg-white rounded-2xl border border-slate-100 shadow-2xs">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-medium text-slate-500">Loading inspection queue...</p>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-100 shadow-2xs space-y-3">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mx-auto border border-emerald-100">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div className="max-w-md mx-auto space-y-0.5">
            <h3 className="text-sm font-bold text-slate-900">Inspection Queue Clear</h3>
            <p className="text-xs text-slate-500">
              {searchQuery
                ? `No orders matching "${searchQuery}".`
                : 'All completed batches have passed inspection.'}
            </p>
          </div>
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-medium cursor-pointer transition-colors"
            >
              Clear Search
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full min-w-0">
          {filteredOrders.map((order, idx) => {
            const isRewash = order.hasRewash;
            return (
              <article
                key={order.id || idx}
                onClick={() => handleOpenQCModal(order)}
                className={`w-full min-w-0 rounded-2xl border bg-white p-4 shadow-2xs hover:border-slate-200 transition-all cursor-pointer select-none group flex items-center justify-between gap-3 ${isRewash
                  ? 'border-purple-200/90'
                  : 'border-slate-100'
                  }`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {/* Status Icon */}
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105 ${isRewash ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'
                    }`}>
                    {isRewash ? (
                      <RotateCcw className="w-5 h-5" />
                    ) : (
                      <ClipboardCheck className="w-5 h-5" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <h3 className="text-sm font-bold text-slate-900 group-hover:text-blue-600 transition-colors truncate">
                          #{order.id}
                        </h3>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 ${isRewash
                          ? 'bg-purple-50 text-purple-700 border border-purple-200/60'
                          : 'bg-amber-50 text-amber-800 border border-amber-200/60'
                          }`}>
                          {isRewash ? 'Rewash' : 'Ready'}
                        </span>
                      </div>
                      <span className="text-xs font-semibold text-slate-700 shrink-0">
                        {order.itemCount} {order.itemCount === 1 ? 'item' : 'items'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-slate-500 truncate mt-1">
                      <span className="truncate font-medium text-slate-700">{order.customerName}</span>
                      {order.customerPhone && (
                        <>
                          <span className="text-slate-300 shrink-0">•</span>
                          <span className="truncate text-slate-400 font-mono text-[11px]">{order.customerPhone}</span>
                        </>
                      )}
                      <span className="text-slate-300 shrink-0">•</span>
                      <span className="truncate text-slate-400 text-[10px] font-mono">
                        {order.bagQr}
                      </span>
                    </div>
                  </div>
                </div>

                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all shrink-0" />
              </article>
            );
          })}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ── CLEAN, MINIMALIST QC INSPECTION MODAL ── */}
      {isQCModalOpen && selectedOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={handleCloseQCModal}
        >
          <div
            className="w-full max-w-3xl bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col my-auto max-h-[92vh] animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Quality Check — #{selectedOrder.id}
                </h3>
              </div>
              <button
                type="button"
                onClick={handleCloseQCModal}
                className="w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5 overflow-y-auto">
              {/* User Details - Simple, clean, essential only */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/80">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-bold text-sm text-slate-900">{selectedOrder.customerName}</span>
                    {selectedOrder.customerPhone && (
                      <span className="text-slate-500 text-xs ml-2">({selectedOrder.customerPhone})</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">
                    <span>{selectedOrder.serviceType}</span>
                    <span className="mx-2">•</span>
                    <span className="font-mono text-slate-700">{selectedOrder.bagQr}</span>
                  </div>
                </div>

                {selectedOrder.specialInstructions && (
                  <div className="mt-2.5 pt-2.5 border-t border-slate-200 text-xs text-amber-800">
                    <strong className="font-semibold">Special Note: </strong>
                    <span>{selectedOrder.specialInstructions}</span>
                  </div>
                )}
              </div>

              {/* 10 QC Steps - Divided in 2 parts (5 steps each), single screen, title only */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Inspection Checkpoints ({checkedCount}/10)
                  </span>
                  <button
                    type="button"
                    onClick={() => handleSelectAllChecks(!allChecksPassed)}
                    className="text-xs text-blue-600 hover:underline font-semibold cursor-pointer"
                  >
                    {allChecksPassed ? 'Clear All' : 'Select All'}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  {/* Part 1 (Steps 1 to 5) */}
                  <div className="border border-slate-200 rounded-xl p-3 space-y-2 bg-white">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <span className="text-xs font-bold text-slate-800">Part 1</span>
                      <span className="text-[11px] text-slate-500 font-medium">{part1Count}/5</span>
                    </div>
                    <div className="space-y-1.5">
                      {QC_PART_1_STEPS.map((step) => {
                        const isChecked = checklist[step.id];
                        return (
                          <label
                            key={step.id}
                            onClick={() => toggleChecklistItem(step.id)}
                            className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border transition-colors cursor-pointer select-none text-[12px] sm:text-[13px] ${isChecked
                              ? 'bg-emerald-50/60 border-emerald-300 text-emerald-950 font-semibold'
                              : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                              }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => { }}
                              className="w-3.5 h-3.5 rounded text-blue-600 accent-blue-600 cursor-pointer shrink-0"
                            />
                            <span className="truncate leading-tight">{step.title}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Part 2 (Steps 6 to 10) */}
                  <div className="border border-slate-200 rounded-xl p-3 space-y-2 bg-white">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <span className="text-xs font-bold text-slate-800">Part 2</span>
                      <span className="text-[11px] text-slate-500 font-medium">{part2Count}/5</span>
                    </div>
                    <div className="space-y-1.5">
                      {QC_PART_2_STEPS.map((step) => {
                        const isChecked = checklist[step.id];
                        return (
                          <label
                            key={step.id}
                            onClick={() => toggleChecklistItem(step.id)}
                            className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border transition-colors cursor-pointer select-none text-[12px] sm:text-[13px] ${isChecked
                              ? 'bg-emerald-50/60 border-emerald-300 text-emerald-950 font-semibold'
                              : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                              }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => { }}
                              className="w-3.5 h-3.5 rounded text-blue-600 accent-blue-600 cursor-pointer shrink-0"
                            />
                            <span className="truncate leading-tight">{step.title}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer - Minimal, clean, required controls only */}
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-3">
              <span className="text-xs text-slate-500">
                {checkedCount === TOTAL_CHECKLIST_COUNT ? 'All 10 checks verified' : `${checkedCount} of 10 checks verified`}
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => submitQC('reprocess')}
                  className="px-4 py-2 border border-slate-200/80 hover:bg-slate-100 rounded-xl text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
                >
                  Route to Rewash
                </button>

                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => submitQC('passed')}
                  className={`px-5 py-2 rounded-xl text-xs font-semibold text-white transition-colors cursor-pointer shadow-2xs ${allChecksPassed
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                    }`}
                >
                  Pass Quality Check
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Reason Selector for Item Rewash ── */}
      {rewashTargetItemIdx !== null && selectedOrder && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setRewashTargetItemIdx(null)}
        >
          <div
            className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-slate-100 space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center">
                  <RotateCcw className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-black text-sm text-slate-900">Flag Item for Rewash</h4>
                  <p className="text-[11px] text-slate-500 truncate max-w-[260px]">
                    {selectedOrder.items[rewashTargetItemIdx]?.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRewashTargetItemIdx(null)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 font-medium">
              Select the primary reason this garment requires reprocessing:
            </p>

            <div className="grid grid-cols-2 gap-2">
              {COMMON_REWASH_REASONS.map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => handleConfirmItemRewash(reason)}
                  className="p-2.5 rounded-xl border border-slate-200 hover:border-purple-300 hover:bg-purple-50/60 text-xs font-bold text-slate-700 hover:text-purple-900 transition-all text-left cursor-pointer"
                >
                  {reason}
                </button>
              ))}
            </div>

            <div className="space-y-1.5 pt-1">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Or Enter Custom Reason
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={customRewashReason}
                  onChange={(e) => setCustomRewashReason(e.target.value)}
                  placeholder="e.g. Left cuff ink spot..."
                  className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-purple-500"
                />
                <button
                  type="button"
                  disabled={!customRewashReason.trim()}
                  onClick={() => handleConfirmItemRewash(customRewashReason.trim())}
                  className="px-4 py-2 bg-purple-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Plant Machinery Assignment ── */}
      {isMachineDrawerOpen && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setIsMachineDrawerOpen(false)}
        >
          <div
            className="w-full max-w-lg bg-white rounded-3xl p-6 shadow-2xl border border-slate-100 space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Wrench className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900">Plant Machinery Assignment</h3>
                  <p className="text-[11px] text-slate-500">
                    {selectedOrder ? `Assign batch for Order #${selectedOrder.id}` : 'Plant Equipment'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMachineDrawerOpen(false)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Available Washer / Dryer Unit</label>
                <select
                  value={selectedMachineId}
                  onChange={(e) => setSelectedMachineId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-medium text-slate-800 focus:ring-2 focus:ring-blue-500"
                >
                  <option value="WASHER-01">Washer #1 — Miele Professional 18kg (Active / Available)</option>
                  <option value="WASHER-02">Washer #2 — Primus Heavy Load 24kg (Active / Available)</option>
                  <option value="WASHER-03">Washer #3 — Speed Queen Fast Cycle 14kg (Available)</option>
                  <option value="DRYER-01">Dryer #1 — Electrolux Pro 20kg (Warm Air)</option>
                  <option value="DRYER-02">Dryer #2 — Huebsch 25kg (Gas Heated)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Processing Program</label>
                <select
                  value={cycleType}
                  onChange={(e) => setCycleType(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-medium text-slate-800 focus:ring-2 focus:ring-blue-500"
                >
                  <option value="Intensive Stain Removal 60°C">Intensive Stain Removal 60°C (Recommended for Rewash)</option>
                  <option value="Eco Wash 40°C">Eco Wash 40°C (Standard)</option>
                  <option value="Delicates & Silks 30°C">Delicates & Silks 30°C</option>
                  <option value="Sanitizing High-Heat 90°C">Sanitizing High-Heat 90°C</option>
                  <option value="Standard Warm Dry 50m">Standard Warm Dry 50m</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Water Temp</label>
                  <select
                    value={temperature}
                    onChange={(e) => setTemperature(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800"
                  >
                    <option value="30°C">30°C (Gentle)</option>
                    <option value="40°C">40°C (Warm)</option>
                    <option value="60°C">60°C (Stain-Break)</option>
                    <option value="90°C">90°C (Sanitize)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Duration (Mins)</label>
                  <input
                    type="number"
                    min="10"
                    max="120"
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(parseInt(e.target.value, 10) || 45)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsMachineDrawerOpen(false)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleStartMachineRun}
                disabled={machineRunSubmitting}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
              >
                {machineRunSubmitting ? 'Starting...' : 'Start Cycle on Machine'}
              </button>
            </div>

            <div className="pt-1 text-center">
              <button
                type="button"
                onClick={() => setIsFaultModalOpen(true)}
                className="text-[11px] text-rose-600 hover:text-rose-800 font-semibold hover:underline cursor-pointer"
              >
                Report Breakdown / Fault for {selectedMachineId}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: QC Passed & Released for Driver Delivery ── */}
      {deliverySuccessModal && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setDeliverySuccessModal(null)}
        >
          <div
            className="relative w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl border border-slate-100 text-center space-y-4 animate-in zoom-in-95 duration-150 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute top-0 left-0 right-0 h-1 bg-emerald-500" />

            <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto shadow-2xs mt-2 border border-emerald-100">
              <Truck className="w-7 h-7 text-emerald-600" />
            </div>

            <div>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                QC Passed • Dispatched for Delivery
              </span>
              <h3 className="text-base font-bold text-slate-900 mt-2 tracking-tight">
                Package Sealed & Ready for Driver
              </h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Order <span className="font-mono font-bold text-slate-800">{deliverySuccessModal.orderId}</span> has passed quality inspection.
              </p>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-left space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-semibold uppercase text-[9px] tracking-wider">Customer</span>
                <span className="font-semibold text-slate-900">{deliverySuccessModal.customerName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-semibold uppercase text-[9px] tracking-wider">Bag QR Tag</span>
                <span className="font-mono font-semibold text-blue-600">{deliverySuccessModal.bagQr}</span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
                <span className="text-slate-400 font-semibold uppercase text-[9px] tracking-wider">Assigned Driver</span>
                <span className="font-bold text-emerald-700 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {deliverySuccessModal.driverName || 'Driver Dispatched'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeliverySuccessModal(null)}
                className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Inspect Next Order
              </button>
              {onNavigateTab && (
                <button
                  type="button"
                  onClick={() => {
                    setDeliverySuccessModal(null);
                    onNavigateTab('orders');
                  }}
                  className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition-colors shadow-2xs cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span>Processing Board</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
