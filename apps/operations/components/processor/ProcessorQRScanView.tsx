'use client';
import { apiFetch } from '@laundelle/api-client';
import React, { useState, useEffect } from 'react';
import { Scanner } from '@yudiel/react-qr-scanner';
import {
  ArrowRight,
  Search,
  CameraOff,
  Zap,
  ZapOff,
  ShoppingBag,
  Check,
  CheckCircle2,
  X,
  Layers,
  Package,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Loader2,
  HelpCircle,
  Clock,
  Sparkles,
  Phone,
  MapPin,
  Building2,
  QrCode,
  Info,
  ChevronRight,
  AlertOctagon,
  Scale
} from 'lucide-react';
import { ProcessorViewTab } from './ProcessorLayout';

interface ProcessorQRScanViewProps {
  onNavigateTab: (tab: ProcessorViewTab) => void;
  onOrderScanned?: (orderId: string) => void;
}

interface ScannedOrderDetails {
  orderId: string;
  customerName: string;
  customerPhone?: string;
  service: string;
  weight: string;
  address?: string;
  items?: any[];
  plantId?: string;
  plantName?: string;
  bagQr?: string;
  status?: string;
  statusLabel?: string;
  alreadyIntaked?: boolean;
  specialInstructions?: string;
  total?: number;
}

interface ScanErrorDetails {
  type: 'INVALID_QR' | 'NOT_COLLECTED' | 'ALREADY_INTAKED' | 'PLANT_MISMATCH' | 'NOT_FOUND' | 'ERROR';
  title: string;
  message: string;
  scannedCode?: string;
  orderPlant?: string;
  currentPlant?: string;
  currentStatus?: string;
}

interface RecentScanItem {
  id: string;
  orderId: string;
  customerName: string;
  itemCount: number;
  status: 'washing' | 'sorting' | 'qc' | 'received';
  statusLabel: string;
  statusColor: string;
  timeAgo: string;
  image: string;
  service: string;
}

const DEFAULT_RECENT_SCANS: RecentScanItem[] = [];

export const ProcessorQRScanView: React.FC<ProcessorQRScanViewProps> = ({ onNavigateTab, onOrderScanned }) => {
  const [manualCode, setManualCode] = useState('');
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [inputError, setInputError] = useState(false);
  const [showHowToScanModal, setShowHowToScanModal] = useState(false);

  // Active Scanned Order State
  const [scannedOrder, setScannedOrder] = useState<ScannedOrderDetails | null>(null);
  const [scanError, setScanError] = useState<ScanErrorDetails | null>(null);
  const [selectedAction, setSelectedAction] = useState<'washing' | 'sorting' | 'received_at_facility'>('washing');
  const [bagCondition, setBagCondition] = useState('Good');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmedSuccess, setConfirmedSuccess] = useState(false);
  const [isLoadingOrder, setIsLoadingOrder] = useState(false);
  const [recentScans, setRecentScans] = useState<RecentScanItem[]>(DEFAULT_RECENT_SCANS);

  // Toast Notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Current Processor Plant Context
  const [currentProcessorPlant, setCurrentProcessorPlant] = useState<{ id: string; name: string }>({
    id: 'PLANT-LON-01',
    name: 'Preston Plant 1'
  });

  // Load current processor's plant from session or API
  useEffect(() => {
    try {
      const rawSession = localStorage.getItem('l2u_auth_session');
      if (rawSession) {
        const parsed = JSON.parse(rawSession);
        const user = parsed.user;
        if (user?.plantId || user?.plant_id) {
          setCurrentProcessorPlant({
            id: user.plantId || user.plant_id || 'PLANT-LON-01',
            name: user.plantName || user.plant_name || (user.plantId ? `Plant Unit (${user.plantId})` : 'Preston Plant 1')
          });
        }
      }
      const token = rawSession ? JSON.parse(rawSession).token : null;
      if (token) {
        apiFetch('/api/v1/users/me', { headers: { Authorization: `Bearer ${token}` } })
          .then(res => res.json())
          .then(data => {
            const profile = data?.data || data?.user || data;
            if (profile?.plant_id || profile?.plantId) {
              setCurrentProcessorPlant({
                id: profile.plant_id || profile.plantId,
                name: profile.plantName || profile.plant_name || `Plant Unit (${profile.plant_id || profile.plantId})`
              });
            }
          })
          .catch(() => { });
      }
    } catch { }
  }, []);



  /**
   * STEP 1 VALIDATION:
   * Verify if the scanned code is an authentic Laundelle Bag QR code or foreign code.
   */
  const validateLaundelleQr = (raw: string): { isLaundelle: boolean; orderId?: string } => {
    if (!raw || !raw.trim()) {
      return { isLaundelle: false };
    }
    const trimmed = raw.trim();

    // 1. JSON payload check (e.g. { "orderId": "...", "bagQr": "..." })
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object') {
          const candidateId = parsed.orderId || parsed.id || parsed.order_id || parsed.bagQr || parsed.publicId;
          if (candidateId) {
            const cleanId = String(candidateId).replace(/^BAG-/, '').trim();
            return { isLaundelle: true, orderId: cleanId };
          }
          if (parsed.brand?.toLowerCase() === 'laundelle' || parsed.app?.toLowerCase() === 'laundelle') {
            return { isLaundelle: true, orderId: parsed.orderNumber || parsed.orderId || '' };
          }
        }
      } catch {
        // Not valid JSON, continue to string matchers
      }
    }

    // 2. Explicit Laundelle Bag Tag prefixes: BAG-, QR-BAG-, BAG_
    const bagMatch = trimmed.match(/^(?:QR[-_])?BAG[-_]([A-Za-z0-9_-]+)$/i);
    if (bagMatch) {
      return { isLaundelle: true, orderId: bagMatch[1] };
    }

    // 3. Canonical Laundelle Order ID formats: ORD-[...], LD[0-9]+, L2U-[...]
    const ordMatch = trimmed.match(/^(ORD[-_][A-Za-z0-9]{3,20}|LD[0-9]{3,10}|L2U[-_][A-Za-z0-9]{3,20})$/i);
    if (ordMatch) {
      return { isLaundelle: true, orderId: ordMatch[0] };
    }

    // 4. URL containing Laundelle order or bag path
    const urlMatch = trimmed.match(/(?:orders?|jobs?|track|bag)\/(ORD[-_][A-Za-z0-9]+|BAG[-_][A-Za-z0-9]+|LD[0-9]+)/i);
    if (urlMatch) {
      const clean = urlMatch[1].replace(/^BAG-/, '');
      return { isLaundelle: true, orderId: clean };
    }

    // 5. Explicit prefix matching
    const prefixMatch = trimmed.match(/(?:BAG|ORD|LD)[-_][A-Za-z0-9]+/i);
    if (prefixMatch && (trimmed.startsWith('BAG-') || trimmed.startsWith('ORD-') || trimmed.startsWith('LD-'))) {
      return { isLaundelle: true, orderId: prefixMatch[0].replace(/^BAG-/, '') };
    }

    // If it does not match Laundelle formats, it is a DIFFERENT / foreign QR!
    return { isLaundelle: false };
  };

  /**
   * Main scan & lookup orchestrator
   */
  const handleOpenAction = async (rawCode: string) => {
    // Reset any previous modal or error
    setScanError(null);
    setScannedOrder(null);

    // ─── STEP 1: Verify if it is a genuine Laundelle QR code ────────────────
    const validation = validateLaundelleQr(rawCode);
    if (!validation.isLaundelle || !validation.orderId) {
      setInputError(true);
      setTimeout(() => setInputError(false), 1500);
      setScanError({
        type: 'INVALID_QR',
        title: 'Non-Laundelle QR Code Detected',
        message: 'The scanned code is not recognized as an official Laundelle laundry bag tag. Intake cannot proceed with foreign QR codes or barcodes.',
        scannedCode: rawCode.length > 50 ? `${rawCode.substring(0, 50)}...` : rawCode
      });
      return;
    }

    const orderId = validation.orderId;
    setIsLoadingOrder(true);

    try {
      let orderData: any = null;
      let backendPlantMismatch = false;
      let mismatchOrderPlant = '';
      let mismatchProcessorPlant = '';

      const rawSession = localStorage.getItem('l2u_auth_session');
      const token = rawSession ? JSON.parse(rawSession).token : null;
      const res = await apiFetch(`/api/v1/processor/jobs/${encodeURIComponent(orderId)}`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) }
      });

      if (res.ok) {
        const data = await res.json();
        if (data.plantMismatch) {
          backendPlantMismatch = true;
          mismatchOrderPlant = data.orderPlantName || data.orderPlantId || 'Different Plant';
          mismatchProcessorPlant = data.processorPlantName || currentProcessorPlant.name;
        } else if (data.found && data.order) {
          orderData = data.order;
          if (data.processorPlantId) {
            setCurrentProcessorPlant({
              id: data.processorPlantId,
              name: data.processorPlantName || `Plant Unit (${data.processorPlantId})`
            });
          }
        }
      }

      // If backend flagged plant mismatch immediately
      if (backendPlantMismatch) {
        setScanError({
          type: 'PLANT_MISMATCH',
          title: 'Facility Mismatch: Assigned to Another Plant',
          message: `This order is assigned to ${mismatchOrderPlant}. It cannot be intaked or processed at ${mismatchProcessorPlant}.`,
          orderPlant: mismatchOrderPlant,
          currentPlant: mismatchProcessorPlant,
          scannedCode: rawCode
        });
        return;
      }



      // If order does not exist
      if (!orderData) {
        setScanError({
          type: 'NOT_FOUND',
          title: 'Order Not Found',
          message: `No active order found matching #${orderId}. Please verify the tag and try again.`,
          scannedCode: rawCode
        });
        return;
      }

      // ─── STEP 2: Verify Driver Pickup & OTP Verification ──────────────────
      // Rule: If driver hasn't collected the bag, even if processor scans, do NOT proceed!
      const isDriverCollected = orderData.isDriverCollected ?? (
        orderData.status === 'laundry_collected' ||
        Boolean(orderData.pickedUpAt) ||
        Boolean(orderData.pickup_otp_verified_at) ||
        Boolean(orderData.pickup_pin_verified_at) ||
        Boolean(orderData.evidence?.pickupVerifiedAt) ||
        Boolean(orderData.qr_tracking?.collectedAt)
      );

      if (!isDriverCollected) {
        setScanError({
          type: 'NOT_COLLECTED',
          title: 'Driver Pickup Incomplete (OTP Required)',
          message: `Order #${orderData.id || orderId} has not been collected from the customer by a driver yet (Current Status: ${orderData.statusLabel || orderData.status || 'Pending Pickup'}). Bag intake can only proceed after the driver successfully picks up the bag and verifies the customer OTP.`,
          scannedCode: rawCode,
          currentStatus: orderData.statusLabel || orderData.status || 'Pending Pickup'
        });
        return;
      }

      // ─── STEP 3: Verify Order Has Not Already Been Intaked ────────────────
      // Rule: One order cannot be intaked multiple times!
      const postIntakeStatuses = [
        'received_at_facility',
        'washing',
        'sorting',
        'drying',
        'ironing',
        'quality_check',
        'ready_for_qc',
        'qc_ready',
        'ready_for_delivery',
        'out_for_delivery',
        'delivered',
        'completed'
      ];
      const isAlreadyIntaked = orderData.alreadyIntaked ?? (
        Boolean(orderData.receivedAtFacilityAt) ||
        Boolean(orderData.intake?.intakeAt) ||
        postIntakeStatuses.includes(orderData.status)
      );

      if (isAlreadyIntaked) {
        const orderPlantId = orderData.plant_id || orderData.plantId;
        const orderPlantName = orderData.plantName || orderData.plant_name || orderPlantId;
        const rawStatus = orderData.statusLabel || orderData.status || 'In Processing';
        const formattedStatus = rawStatus
          .replace(/_/g, ' ')
          .replace(/\b\w/g, (c: string) => c.toUpperCase());

        showToast(`Order #${orderData.id || orderId} is already in processing.`);

        setScannedOrder({
          orderId: orderData.id || orderId,
          customerName: (orderData.customerName && orderData.customerName !== 'Valued Customer' && orderData.customerName !== 'Customer')
            ? orderData.customerName
            : (orderData.customer_name && orderData.customer_name !== 'Valued Customer' && orderData.customer_name !== 'Customer')
              ? orderData.customer_name
              : (orderData.contactDetails ? `${orderData.contactDetails.firstName || ''} ${orderData.contactDetails.lastName || ''}`.trim() : '')
              || 'Customer',
          customerPhone: orderData.customerPhone || orderData.phone || '',
          service: orderData.service || orderData.serviceType || 'Standard Laundry Service',
          weight: String(orderData.actualWeightKg || orderData.weightKg || orderData.weight || '5.0'),
          address: orderData.address || orderData.deliveryAddress || '',
          items: orderData.items || orderData.orderItems || [],
          plantId: orderPlantId || currentProcessorPlant.id,
          plantName: orderPlantName || currentProcessorPlant.name,
          bagQr: orderData.bagQr || orderData.qr_code || orderData.package?.qr_code || `BAG-${orderData.id || orderId}`,
          status: orderData.status || 'washing',
          statusLabel: formattedStatus,
          alreadyIntaked: true,
          specialInstructions: orderData.specialInstructions || '',
          total: orderData.total || orderData.total_price || 0
        });
        return;
      }

      // ─── STEP 4: Synchronize Plant Assignment ─────────────────────────────
      // Note: Backend has already verified plant matching and manager inheritance authoritatively.
      // We align the scanned order plant details with the verified facility context.
      const orderPlantId = orderData.plant_id || orderData.plantId || currentProcessorPlant.id;
      const orderPlantName = orderData.plantName || orderData.plant_name || currentProcessorPlant.name;

      // ─── STEP 5: All Checks Passed! Open Streamlined Confirmation Modal ──
      setScannedOrder({
        orderId: orderData.id || orderId,
        customerName: (orderData.customerName && orderData.customerName !== 'Valued Customer' && orderData.customerName !== 'Customer')
          ? orderData.customerName
          : (orderData.customer_name && orderData.customer_name !== 'Valued Customer' && orderData.customer_name !== 'Customer')
            ? orderData.customer_name
            : (orderData.contactDetails ? `${orderData.contactDetails.firstName || ''} ${orderData.contactDetails.lastName || ''}`.trim() : '')
            || 'Customer',
        customerPhone: orderData.customerPhone || '',
        service: orderData.service || 'Standard Laundry Service',
        weight: String(orderData.weightKg || orderData.weight || '5.0'),
        address: orderData.address || '',
        items: orderData.items || [],
        plantId: orderPlantId || currentProcessorPlant.id,
        plantName: orderPlantName || currentProcessorPlant.name,
        bagQr: orderData.bagQr || `BAG-${orderData.id || orderId}`,
        status: orderData.status || 'laundry_collected',
        statusLabel: orderData.statusLabel || 'Laundry Collected'
      });
      setSelectedAction('washing');
      setBagCondition('Good');
      setConfirmedSuccess(false);

    } catch (err) {
      console.error('Lookup notice:', err);
      setScanError({
        type: 'ERROR',
        title: 'Communication Error',
        message: 'Could not contact the facility server to verify the parcel. Please check connection and try again.',
        scannedCode: rawCode
      });
    } finally {
      setIsLoadingOrder(false);
    }
  };

  const handleScan = (detectedCodes: any[]) => {
    if (detectedCodes.length > 0) {
      const raw = detectedCodes[0]?.rawValue || '';
      if (raw.trim()) {
        handleOpenAction(raw.trim());
      }
    }
  };

  const handleManualSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = manualCode.trim();
    if (!trimmed) {
      setInputError(true);
      setTimeout(() => setInputError(false), 1200);
      return;
    }
    handleOpenAction(trimmed);
  };

  const toggleFlashlight = async () => {
    const nextState = !isTorchOn;
    setIsTorchOn(nextState);
    try {
      const videoElem = document.querySelector('video');
      const stream = videoElem?.srcObject as MediaStream | null;
      const track = stream?.getVideoTracks()[0];
      if (track && 'applyConstraints' in track) {
        const capabilities = (track.getCapabilities?.() || {}) as any;
        if (capabilities.torch) {
          await (track as any).applyConstraints({
            advanced: [{ torch: nextState }]
          });
        }
      }
    } catch (err) {
      console.log('Torch capability note:', err);
    }
  };

  /**
   * INTAKE CONFIRMATION ACTION:
   * Reassigns order from driver to processor and moves to washing.
   * No scale weight modification controls.
   */
  const handleConfirmIntake = async () => {
    if (!scannedOrder) return;
    setIsSubmitting(true);

    try {
      const rawSession = localStorage.getItem('l2u_auth_session');
      const token = rawSession ? JSON.parse(rawSession).token : null;
      const res = await apiFetch(`/api/v1/processor/jobs/${encodeURIComponent(scannedOrder.orderId)}/intake`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          actualWeightKg: parseFloat(scannedOrder.weight) || 5.0,
          bagCondition,
          restrictedItems: [],
          processingAction: selectedAction
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to intake order for processing.');

      setConfirmedSuccess(true);
      if (onOrderScanned) onOrderScanned(scannedOrder.orderId);

      // Prepend to recent scans list
      const newScanItem: RecentScanItem = {
        id: `rec-${Date.now()}`,
        orderId: scannedOrder.orderId,
        customerName: scannedOrder.customerName,
        itemCount: scannedOrder.items?.length || 5,
        status: selectedAction === 'washing' ? 'washing' : selectedAction === 'sorting' ? 'sorting' : 'received',
        statusLabel: selectedAction === 'washing' ? 'Washing' : selectedAction === 'sorting' ? 'Sorting' : 'Intake Ready',
        statusColor: selectedAction === 'washing' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-purple-50 text-purple-600 border-purple-100',
        timeAgo: 'Just now',
        image: 'https://images.unsplash.com/photo-1582735689369-4fe89db7114c?auto=format&fit=crop&w=300&q=80',
        service: scannedOrder.service
      };
      setRecentScans(prev => [newScanItem, ...prev.filter(i => i.orderId !== scannedOrder.orderId)]);

      // Notify other views
      window.dispatchEvent(new CustomEvent('l2u_processor_orders_changed', { detail: { orderId: scannedOrder.orderId } }));
      window.dispatchEvent(new Event('l2u_orders_change'));

      // Smoothly navigate to Orders tab
      setTimeout(() => {
        setScannedOrder(null);
        setManualCode('');
        setConfirmedSuccess(false);
        onNavigateTab('orders');
      }, 1000);
    } catch (e: any) {
      alert(e.message || 'Error processing scan');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Close modals on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && scannedOrder && !isSubmitting) {
        setScannedOrder(null);
      }
      if (e.key === 'Escape' && scanError) {
        setScanError(null);
      }
      if (e.key === 'Escape' && showHowToScanModal) {
        setShowHowToScanModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [scannedOrder, scanError, isSubmitting, showHowToScanModal]);

  return (
    <div className="w-full min-h-screen pb-16">
      {/* ─── Injected Styles ──────────────────────────────────────────────── */}
      <style dangerouslySetInnerHTML={{
        __html: `
        .scanner-viewport-bg {
          background-image:
            linear-gradient(180deg, rgba(3, 14, 30, 0.25), rgba(3, 14, 30, 0.65)),
            url("https://images.unsplash.com/photo-1582735689369-4fe89db7114c?auto=format&fit=crop&w=1600&q=85");
          background-size: cover;
          background-position: center;
        }

        .recent-card-hover {
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .recent-card-hover:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 30px rgba(15, 45, 100, 0.08);
        }

        .find-btn-hover {
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }

        .find-btn-hover:hover {
          transform: translateY(-1px);
          box-shadow: 0 12px 28px rgba(37, 99, 235, 0.28);
        }

        .find-btn-hover:active {
          transform: translateY(0);
        }
      ` }} />

      {/* ── Toast Notification ── */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 px-4 py-3 rounded-2xl shadow-xl bg-slate-900 text-white border border-slate-700 text-xs font-bold transition-all animate-in slide-in-from-top-4 duration-200 flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full bg-[#48CAE4] animate-pulse" />
          <span>{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="ml-2 hover:opacity-75 cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {/* ─── Camera QR Scanner Window ───────────────────────────────────────── */}
      <div className="relative h-[360px] sm:h-[420px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 shadow-2xs">
        {/* Optical live camera view or paused backdrop */}
        {cameraEnabled ? (
          <div className="absolute inset-0 w-full h-full flex items-center justify-center">
            <Scanner
              onScan={handleScan}
              formats={['qr_code']}
              components={{ finder: false }}
              styles={{
                container: { width: '100%', height: '100%' },
                video: { objectFit: 'cover' }
              }}
            />
          </div>
        ) : (
          <div className="scanner-viewport-bg absolute inset-0 w-full h-full flex flex-col items-center justify-center text-white p-6 text-center">
            <CameraOff className="w-10 h-10 text-slate-400 opacity-60 mb-2" />
            <h4 className="text-sm font-bold">Camera Feed Paused</h4>
            <p className="text-xs text-slate-300 max-w-xs mt-1">
              Resume camera feed or enter the tag ID manually below.
            </p>
            <button
              type="button"
              onClick={() => setCameraEnabled(true)}
              className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-medium transition-all shadow-2xs cursor-pointer"
            >
              Resume Camera
            </button>
          </div>
        )}

        {/* Top Controls */}
        <div className="absolute right-3 top-3 z-20 flex items-center gap-2">
          {cameraEnabled && (
            <button
              type="button"
              onClick={() => setCameraEnabled(false)}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/20 bg-black/40 text-white backdrop-blur-md transition hover:bg-black/60 cursor-pointer shadow-2xs"
              title="Pause Camera"
            >
              <CameraOff className="h-4 w-4" />
            </button>
          )}

          <button
            type="button"
            onClick={toggleFlashlight}
            aria-label="Toggle flashlight"
            className={`flex h-9 w-9 items-center justify-center rounded-xl border transition backdrop-blur-md cursor-pointer shadow-2xs ${isTorchOn
              ? 'bg-amber-400 border-amber-300 text-slate-900'
              : 'border-white/20 bg-black/40 text-white hover:bg-black/60'
              }`}
            title="Toggle Flashlight"
          >
            {isTorchOn ? <Zap className="h-4 w-4 fill-current" /> : <ZapOff className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* ─── OR Divider ────────────────────────────────────────────────────── */}
      <div className="my-6 flex items-center gap-4">
        <div className="h-px flex-1 bg-slate-200/80" />
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          OR
        </div>
        <div className="h-px flex-1 bg-slate-200/80" />
      </div>

      {/* ─── Manual Order ID Search ────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white border border-slate-100 p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 border border-blue-100/60 shadow-2xs">
            <QrCode className="h-5 w-5" />
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-slate-900">
              Manual Intake Entry
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Enter the canonical Order ID or Bag tag number.
            </p>

            <form onSubmit={handleManualSubmit} className="mt-3.5 flex flex-col sm:flex-row gap-2.5">
              <div
                className={`flex h-11 flex-1 items-center overflow-hidden rounded-xl border bg-slate-50 transition focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 focus-within:bg-white ${inputError ? 'border-red-400 ring-2 ring-red-100' : 'border-slate-200/80'
                  }`}
              >
                <div className="flex h-full w-10 items-center justify-center border-r border-slate-200/80 text-sm font-bold text-slate-400">
                  #
                </div>

                <input
                  id="orderId"
                  type="text"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder="e.g. BAG-ORD-10245 or ORD-10245"
                  className="h-full flex-1 bg-transparent px-3 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:outline-hidden"
                />

                {manualCode && (
                  <button
                    type="button"
                    onClick={() => setManualCode('')}
                    className="p-1.5 mr-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <button
                id="findOrderButton"
                type="submit"
                disabled={isLoadingOrder}
                className="flex h-11 px-5 items-center justify-center gap-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white shadow-2xs cursor-pointer active:scale-98 transition-all disabled:opacity-70 shrink-0"
              >
                {isLoadingOrder ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4" />
                    <span>Verify & Intake</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* ─── ERROR MODAL ─────────────────────────────────────────────────── */}
      {scanError && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setScanError(null)}
        >
          <div
            className="relative w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-100 p-6 space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${scanError.type === 'INVALID_QR'
                    ? 'bg-amber-50 text-amber-600'
                    : scanError.type === 'NOT_COLLECTED'
                      ? 'bg-orange-50 text-orange-600'
                      : scanError.type === 'ALREADY_INTAKED'
                        ? 'bg-purple-50 text-purple-600'
                        : scanError.type === 'PLANT_MISMATCH'
                          ? 'bg-rose-50 text-rose-600'
                          : 'bg-rose-50 text-rose-600'
                    }`}
                >
                  {scanError.type === 'PLANT_MISMATCH' ? (
                    <Building2 className="w-5 h-5" />
                  ) : scanError.type === 'ALREADY_INTAKED' ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : (
                    <AlertTriangle className="w-5 h-5" />
                  )}
                </div>

                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {scanError.title}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {scanError.type === 'PLANT_MISMATCH'
                      ? 'Facility Mismatch'
                      : scanError.type === 'ALREADY_INTAKED'
                        ? 'Already Intaked'
                        : 'Intake Notice'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setScanError(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 text-xs text-slate-600 leading-relaxed">
              {scanError.message}
            </div>

            <button
              type="button"
              onClick={() => {
                setScanError(null);
                setManualCode('');
              }}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-xl text-xs transition-colors cursor-pointer"
            >
              Continue Scanning
            </button>
          </div>
        </div>
      )}

      {/* ─── HOW TO SCAN HELP MODAL ────────────────────────────────────────── */}
      {showHowToScanModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setShowHowToScanModal(false)}
        >
          <div
            className="relative w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-100 p-6 space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <HelpCircle className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">How to Scan Bag Tags</h3>
              </div>
              <button
                onClick={() => setShowHowToScanModal(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              {[
                { step: '1', title: 'Locate Bag QR Tag', desc: 'Find the official QR code on the laundry bag.' },
                { step: '2', title: 'Align in Camera Frame', desc: 'Hold the tag within the frame for automatic recognition.' },
                { step: '3', title: 'Verify & Confirm', desc: 'Review garment details and click "Intake Order" to start processing.' },
              ].map((s) => (
                <div key={s.step} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-[10px] shrink-0">
                    {s.step}
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-900 text-xs">{s.title}</h4>
                    <p className="text-slate-500 text-[11px] mt-0.5">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowHowToScanModal(false)}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl text-xs transition-colors shadow-2xs cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* ─── STREAMLINED ORDER INTAKE CONFIRMATION MODAL ───────────────────── */}
      {scannedOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isSubmitting) {
              setScannedOrder(null);
            }
          }}
        >
          <div
            className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-100 p-6 space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100/60 shadow-2xs">
                  <ShoppingBag className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sm text-slate-900">#{scannedOrder.orderId}</span>
                    <span className="font-mono text-[10px] text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200/60">
                      {scannedOrder.bagQr || `BAG-${scannedOrder.orderId}`}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 truncate mt-0.5">{scannedOrder.customerName}</h3>
                </div>
              </div>

              <button
                onClick={() => !isSubmitting && setScannedOrder(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="space-y-3">
              {scannedOrder.alreadyIntaked && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200/60 text-xs text-amber-900 font-medium">
                  This order is already active in processing.
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-[10px] text-slate-400 font-medium uppercase block">Service</span>
                  <span className="font-semibold text-slate-900 mt-0.5 block truncate">{scannedOrder.service}</span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-[10px] text-slate-400 font-medium uppercase block">Weight</span>
                  <span className="font-semibold text-slate-900 mt-0.5 block">{scannedOrder.weight} kg</span>
                </div>
              </div>

              {scannedOrder.specialInstructions && (
                <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl text-xs text-blue-900">
                  <span className="font-semibold">Note: </span>
                  <span>{scannedOrder.specialInstructions}</span>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="pt-2 flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setScannedOrder(null)}
                disabled={isSubmitting}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>

              {scannedOrder.alreadyIntaked ? (
                <button
                  type="button"
                  onClick={() => {
                    setScannedOrder(null);
                    onNavigateTab('orders');
                  }}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs transition-colors shadow-2xs cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <span>View in Orders</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleConfirmIntake}
                  disabled={isSubmitting || confirmedSuccess}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs transition-colors shadow-2xs cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Intaking...</span>
                    </>
                  ) : confirmedSuccess ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Intake Confirmed!</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Confirm Intake</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
