'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
    Truck, MapPin, Clock, CheckCircle2, AlertCircle, XCircle,
    LogOut, Package, KeyRound,
    ShieldCheck, Navigation, Loader2, QrCode, ArrowRight,
    ListTodo, Wallet, User, Banknote, PoundSterling,
    Bell, Calendar, ChevronDown, ChevronRight, ChevronLeft, CalendarDays, ShoppingBag, LayoutGrid, ClipboardList, Check,
    BarChart2, Waves, Send, Phone, X, Copy, ExternalLink, Camera, Upload, Image as ImageIcon
} from 'lucide-react';
import { dbDriverFetchAssignments, dbDriverUpdateAvailability, dbDriverConfirmPickup, dbDriverSendOtp, dbDriverConfirmDelivery, clearSession, apiFetch } from '@laundelle/api-client';
import { compressImageFile } from '@laundelle/utils';
import { GenerateQRModal } from '@laundelle/ui';
import { PinInput } from '@laundelle/ui';

export interface DriverJobItem {
    id: string;
    type: 'collection' | 'delivery';
    customerName: string;
    customerPhone?: string;
    time: string;
    formattedTimeSlot?: string;
    addressLine1: string;
    addressLine2: string;
    fullAddress: string;
    orderCode: string;
    bagCount: number;
    status: string;
    items?: { name: string; quantity: number }[];
    rawOrder?: any;
    isReal?: boolean;
    pickupInstructionType?: string;
    deliveryInstructionType?: string;
}

export const formatJobTimeSlot = (job: any): string => {
    if (!job) return 'Scheduled Slot';
    const rawSlot = job.rawOrder
        ? (job.type === 'collection' || ['driver_assigned', 'pickup_in_progress'].includes(job.rawOrder?.status)
            ? (job.rawOrder.pickup_slot || job.rawOrder.pickupSlot || job.rawOrder.pickupTime)
            : (job.rawOrder.delivery_slot || job.rawOrder.deliverySlot || job.rawOrder.deliveryTime))
        : (job.formattedTimeSlot || job.pickupSlot || job.deliverySlot || job.time);

    if (rawSlot && typeof rawSlot === 'string') {
        if (rawSlot.includes('-') || rawSlot.includes('–')) {
            return rawSlot.replace('-', '–');
        }
        const timeMatch = rawSlot.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
        if (timeMatch) {
            let hour = parseInt(timeMatch[1], 10);
            const minutes = timeMatch[2];
            const meridiem = (timeMatch[3] || 'AM').toUpperCase();

            let endHour = hour + 2;
            let endMeridiem = meridiem;
            if (endHour > 12) {
                endHour -= 12;
                if (meridiem === 'AM') endMeridiem = 'PM';
            } else if (endHour === 12) {
                if (meridiem === 'AM') endMeridiem = 'PM';
            }
            const padHour = (h: number) => (h < 10 ? `0${h}` : `${h}`);
            return `${padHour(hour)}:${minutes} ${meridiem} – ${padHour(endHour)}:${minutes} ${endMeridiem}`;
        }
        return rawSlot;
    }
    return job.time || '10:00 AM – 12:00 PM';
};

export const getCustomerInitials = (name?: string): string => {
    if (!name) return 'CU';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0].substring(0, 2).toUpperCase();
};


interface DriverPortalProps {
    onSignOut: () => void;
    userName?: string;
}

type DriverView = 'dashboard' | 'assignments' | 'history' | 'earnings' | 'settings';

export const DriverPortal: React.FC<DriverPortalProps> = ({ onSignOut, userName }) => {
    const [view, setView] = useState<DriverView>('assignments');
    const [loading, setLoading] = useState(true);
    const [driverInfo, setDriverInfo] = useState<any>(null);
    const [assigned, setAssigned] = useState<any[]>([]);
    const [completed, setCompleted] = useState<any[]>([]);
    const [availableDeliveries, setAvailableDeliveries] = useState<any[]>([]);
    const [toastMsg, setToastMsg] = useState<string | null>(null);
    const [toastType, setToastType] = useState<'success' | 'error'>('success');
    const [driverActive, setDriverActive] = useState<boolean>(true);
    const [togglingActive, setTogglingActive] = useState<boolean>(false);

    // My Jobs Filter & Header states
    const [filterTab, setFilterTab] = useState<'all' | 'collections' | 'deliveries'>('all');
    const [dateFilter, setDateFilter] = useState('Today');
    const [dateDropdownOpen, setDateDropdownOpen] = useState(false);
    const [notificationsOpen, setNotificationsOpen] = useState(false);

    // Completed & Earnings Jobs Date Filter state
    const [completedDateFilter, setCompletedDateFilter] = useState<string>('all');
    const [weekOffset, setWeekOffset] = useState<number>(0);
    const [completedDateDropdownOpen, setCompletedDateDropdownOpen] = useState(false);

    // Per-order action states & Verification Photo flow
    const [otpOrderId, setOtpOrderId] = useState<string | null>(null);
    const [otpValue, setOtpValue] = useState('');
    const [otpLoading, setOtpLoading] = useState(false);
    const [otpError, setOtpError] = useState<string | null>(null);
    const [verificationStep, setVerificationStep] = useState<'photo' | 'pin'>('photo');
    const [verificationPhoto, setVerificationPhoto] = useState<string | null>(null);
    const [photoCompressing, setPhotoCompressing] = useState(false);
    const photoFileInputRef = useRef<HTMLInputElement>(null);

    const [actionLoadingOrderId, setActionLoadingOrderId] = useState<string | null>(null);

    // Failure attempt modal state
    const [failedModalJob, setFailedModalJob] = useState<DriverJobItem | null>(null);
    const [failedReason, setFailedReason] = useState<string>('customer_unavailable');
    const [failedNotes, setFailedNotes] = useState<string>('');
    const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
    const [failedLoading, setFailedLoading] = useState<boolean>(false);
    const photoFailFileInputRef = useRef<HTMLInputElement>(null);

    // Declared piece count during pickup
    const [pickupPieceCount, setPickupPieceCount] = useState<string>('');

    // COD Modal state
    const [codModalJob, setCodModalJob] = useState<DriverJobItem | null>(null);
    const [codAmount, setCodAmount] = useState<string>('');
    const [codReceipt, setCodReceipt] = useState<string>('');
    const [codNotes, setCodNotes] = useState<string>('');
    const [codLoading, setCodLoading] = useState<boolean>(false);

    // QR modal state for handover
    const [qrModalOpen, setQrModalOpen] = useState(false);

    // Selected job for detail modal
    const [selectedJob, setSelectedJob] = useState<any>(null);

    // Offline resilience state (P2)
    const [isOnline, setIsOnline] = useState<boolean>(true);
    const [offlineQueue, setOfflineQueue] = useState<any[]>([]);
    const [syncingOffline, setSyncingOffline] = useState(false);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            setIsOnline(navigator.onLine);
            const handleOnline = () => {
                setIsOnline(true);
                syncOfflineQueue();
            };
            const handleOffline = () => setIsOnline(false);

            window.addEventListener('online', handleOnline);
            window.addEventListener('offline', handleOffline);

            try {
                const storedQueue = localStorage.getItem('laundelle_driver_offline_queue');
                if (storedQueue) setOfflineQueue(JSON.parse(storedQueue));
            } catch { }

            return () => {
                window.removeEventListener('online', handleOnline);
                window.removeEventListener('offline', handleOffline);
            };
        }
    }, []);

    const syncOfflineQueue = async () => {
        try {
            const stored = localStorage.getItem('laundelle_driver_offline_queue');
            if (!stored) return;
            const ops = JSON.parse(stored);
            if (!Array.isArray(ops) || ops.length === 0) return;

            setSyncingOffline(true);
            const rawSession = localStorage.getItem('l2u_auth_session');
            const token = rawSession ? JSON.parse(rawSession).token : null;
            const deviceId = localStorage.getItem('laundelle_device_id') || `drv_dev_${userName || 'courier'}`;

            const res = await apiFetch('/api/v1/sync', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                },
                body: JSON.stringify({
                    deviceId,
                    operations: ops
                })
            });

            const data = await res.json();
            if (data.success) {
                localStorage.removeItem('laundelle_driver_offline_queue');
                setOfflineQueue([]);
                showToast(`Synchronized ${data.data?.appliedOperations?.length || ops.length} offline operations!`);
                await loadData(true);
            }
        } catch (e: any) {
            console.error('Offline sync failed', e);
        } finally {
            setSyncingOffline(false);
        }
    };

    const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
        setToastMsg(msg);
        setToastType(type);
        setTimeout(() => setToastMsg(null), 3500);
    };

    const handleOpenVerification = (orderId: string) => {
        setOtpOrderId(orderId);
        setOtpValue('');
        setOtpError(null);
        setVerificationPhoto(null);
        setVerificationStep('photo');
        setPickupPieceCount('');
    };

    const handleCloseVerification = () => {
        setOtpOrderId(null);
        setOtpValue('');
        setOtpError(null);
        setVerificationPhoto(null);
        setVerificationStep('photo');
        if (photoFileInputRef.current) photoFileInputRef.current.value = '';
    };

    const handlePhotoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setPhotoCompressing(true);
        try {
            const compressed = await compressImageFile(file, 1024, 1024, 0.75);
            setVerificationPhoto(compressed);
        } catch (err: any) {
            showToast('Failed to process image. Please try again.', 'error');
        } finally {
            setPhotoCompressing(false);
            if (photoFileInputRef.current) photoFileInputRef.current.value = '';
        }
    };

    const handleFailPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const compressed = await compressImageFile(file, 1024, 1024, 0.75);
            setFailedPhoto(compressed);
        } catch (err: any) {
            showToast('Failed to process image. Please try again.', 'error');
        } finally {
            if (photoFailFileInputRef.current) photoFailFileInputRef.current.value = '';
        }
    };

    const loadData = async (silent = false) => {
        if (!silent) setLoading(true);
        const data = await dbDriverFetchAssignments();
        setDriverInfo(data.driver);
        const isAct = data.driver?.status !== 'suspended' && data.driver?.availability !== 'off-duty' && data.driver?.availability !== 'offline';
        setDriverActive(isAct);
        setAssigned(data.assigned);
        setCompleted(data.completed);
        setAvailableDeliveries(data.available_deliveries || []);
        if (!silent) setLoading(false);
    };

    const handleToggleDriverActive = async () => {
        if (togglingActive) return;
        const nextActive = !driverActive;
        setTogglingActive(true);
        setDriverActive(nextActive);

        try {
            const res = await dbDriverUpdateAvailability(nextActive ? 'available' : 'offline');
            if (res.success) {
                if (nextActive && (res.queuedAssigned ?? 0) > 0) {
                    showToast(`You are now ONLINE. ${res.queuedAssigned} queued order(s) assigned!`, 'success');
                } else if (nextActive) {
                    showToast('You are now ONLINE. Ready for order assignments.', 'success');
                } else {
                    showToast('You are now OFFLINE. New orders will be queued.', 'success');
                }
                await loadData(true);
            } else {
                setDriverActive(!nextActive);
                showToast(res.error || 'Failed to update status', 'error');
            }
        } catch (e: any) {
            setDriverActive(!nextActive);
            showToast(e.message || 'Error updating status', 'error');
        } finally {
            setTogglingActive(false);
        }
    };

    useEffect(() => {
        loadData();
        const interval = setInterval(() => loadData(true), 5000); // 5s active polling for real-time delivery alerts
        const handleRefresh = () => loadData(true);
        window.addEventListener('l2u_orders_change', handleRefresh);
        window.addEventListener('l2u_driver_assignments_changed', handleRefresh);
        return () => {
            clearInterval(interval);
            window.removeEventListener('l2u_orders_change', handleRefresh);
            window.removeEventListener('l2u_driver_assignments_changed', handleRefresh);
        };
    }, []);

    const handleSendOtp = async (orderId: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        setActionLoadingOrderId(orderId);
        try {
            const res = await dbDriverSendOtp(orderId);
            if (res.success) {
                showToast('Notification sent to customer to view their in-app PIN!');
            } else {
                showToast(res.error || 'Failed to notify customer', 'error');
            }
        } catch (err: any) {
            showToast(err.message || 'Failed to notify customer', 'error');
        } finally {
            setActionLoadingOrderId(null);
        }
    };

    const handleSubmitFailure = async () => {
        if (!failedModalJob || !failedReason) {
            showToast('Please select a failure reason', 'error');
            return;
        }

        setFailedLoading(true);
        try {
            const isCollection = failedModalJob.type === 'collection';
            const endpoint = isCollection
                ? `/api/v1/driver/jobs/${failedModalJob.id}/pickup/fail`
                : `/api/v1/driver/jobs/${failedModalJob.id}/delivery/fail`;

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    reason: failedReason,
                    notes: failedNotes || undefined,
                    photoUrl: failedPhoto || undefined
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to submit attempt');

            showToast(isCollection ? 'Pickup failure reported to dispatch.' : 'Delivery failure reported to dispatch.');
            setFailedModalJob(null);
            setFailedReason('customer_unavailable');
            setFailedNotes('');
            setFailedPhoto(null);
            loadData(true);
        } catch (err: any) {
            showToast(err.message || 'Error recording failure attempt', 'error');
        } finally {
            setFailedLoading(false);
        }
    };

    const handleConfirmLeaveAtDoor = async () => {
        if (!otpOrderId) return;
        if (!verificationPhoto) {
            setOtpError('A clear delivery photo is mandatory for Leave at Door delivery.');
            return;
        }

        setOtpLoading(true);
        setOtpError(null);
        try {
            const res = await dbDriverConfirmDelivery(otpOrderId, '', undefined, [verificationPhoto]);
            if (res.success) {
                showToast('Leave-at-door delivery confirmed with photo evidence!');
                handleCloseVerification();
                setView('history');
                loadData(true);
            } else {
                setOtpError(res.error || 'Failed to confirm delivery');
            }
        } catch (err: any) {
            setOtpError(err.message || 'Delivery confirmation error');
        } finally {
            setOtpLoading(false);
        }
    };

    const handleConfirmCod = async () => {
        if (!codModalJob) return;
        const amountNum = parseFloat(codAmount);
        if (isNaN(amountNum) || amountNum < 0) {
            showToast('Please enter a valid cash amount collected.', 'error');
            return;
        }

        setCodLoading(true);
        try {
            const res = await apiFetch(`/api/v1/driver/jobs/${codModalJob.id}/cod`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amountCollected: amountNum,
                    receiptReference: codReceipt || undefined,
                    notes: codNotes || undefined
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to record COD');

            showToast(`COD Collected: £${amountNum.toFixed(2)} recorded successfully.`);
            setCodModalJob(null);
            setCodAmount('');
            setCodReceipt('');
            setCodNotes('');
            loadData(true);
        } catch (err: any) {
            showToast(err.message || 'Error recording COD collection', 'error');
        } finally {
            setCodLoading(false);
        }
    };

    const handleConfirmOtp = async () => {
        if (!otpOrderId || !otpValue.trim()) return;
        const order = assigned.find(o => o.id === otpOrderId) || availableDeliveries.find(o => o.id === otpOrderId);

        if (!order) {
            setOtpError('Order not found or assignment error.');
            return;
        }

        const isDelivery = ['ready_for_delivery', 'qc_passed', 'waiting_for_driver', 'delivery_driver_assigned', 'delivery_driver_accepted', 'package_collected_for_delivery', 'out_for_delivery'].includes(order.status);
        const expectedLength = isDelivery ? 4 : 6;

        if (otpValue.trim().length !== expectedLength) {
            setOtpError(`PIN must be ${expectedLength} digits`);
            return;
        }

        setOtpLoading(true);
        setOtpError(null);

        const photos = verificationPhoto ? [verificationPhoto] : [];

        // If currently offline, queue the operation locally on device
        if (!isOnline) {
            const clientOp = {
                operationId: `drv_op_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                clientTimestamp: new Date().toISOString(),
                deviceId: localStorage.getItem('laundelle_device_id') || `drv_dev_${userName || 'courier'}`,
                userId: driverInfo?.id || userName || 'driver_1',
                role: 'driver',
                action: isDelivery ? 'DELIVER_ORDER' : 'COLLECT_ORDER',
                entityId: otpOrderId,
                payload: {
                    pin: otpValue.trim(),
                    photos,
                    deliveredAt: new Date().toISOString(),
                    collectedAt: new Date().toISOString(),
                    weightKg: pickupPieceCount ? parseInt(pickupPieceCount, 10) : 6
                }
            };

            const updatedQueue = [...offlineQueue, clientOp];
            setOfflineQueue(updatedQueue);
            localStorage.setItem('laundelle_driver_offline_queue', JSON.stringify(updatedQueue));

            showToast(isDelivery ? 'Delivery recorded offline! Will sync when connection resumes.' : 'Pickup recorded offline! Will sync when connection resumes.');
            setOtpOrderId(null);
            setOtpValue('');
            setVerificationPhoto(null);
            setVerificationStep('photo');
            setPickupPieceCount('');
            setOtpLoading(false);
            setView('history');
            return;
        }

        const res = isDelivery
            ? await dbDriverConfirmDelivery(otpOrderId, otpValue.trim(), undefined, photos)
            : await dbDriverConfirmPickup(otpOrderId, otpValue.trim(), photos, pickupPieceCount ? parseInt(pickupPieceCount, 10) : undefined);

        if (res.success) {
            showToast(isDelivery ? 'Order delivered successfully!' : 'Pickup confirmed! Laundry collected successfully.');
            setOtpOrderId(null);
            setOtpValue('');
            setVerificationPhoto(null);
            setVerificationStep('photo');
            setPickupPieceCount('');
            setView('history');
            loadData(true);
        } else {
            setOtpError(res.error || 'Invalid PIN');
        }
        setOtpLoading(false);
    };

    const formatTime = (iso: string) => {
        try {
            return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        } catch { return '--:--'; }
    };

    const formatDate = (iso: string) => {
        try {
            return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        } catch { return iso; }
    };

    const handleStartNavigation = (job: DriverJobItem, e: React.MouseEvent) => {
        e.stopPropagation();
        const query = encodeURIComponent(job.fullAddress || `${job.addressLine1}, ${job.addressLine2}`);
        window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
    };

    // Merge assigned orders and any available deliveries covering driver's postcodes
    const allActiveOrders = [...assigned].filter((o: any) => !['laundry_collected', 'delivered', 'completed'].includes(o.status));
    const assignedIds = new Set(allActiveOrders.map((o: any) => o.id || o.publicId || (o._id ? String(o._id) : '')));
    (availableDeliveries || []).forEach((delOrder: any) => {
        const delId = delOrder.id || delOrder.publicId || (delOrder._id ? String(delOrder._id) : '');
        if (delId && !assignedIds.has(delId) && !['laundry_collected', 'delivered', 'completed'].includes(delOrder.status)) {
            allActiveOrders.push(delOrder);
            assignedIds.add(delId);
        }
    });

    // Map real DB active orders into DriverJobItem format
    const mappedAssignedJobs: DriverJobItem[] = allActiveOrders.map((order: any) => {
        const isPickup = ['order_placed', 'pending_payment', 'booking_confirmed', 'collection_scheduled', 'waiting_for_driver', 'driver_assigned', 'pickup_in_progress', 'pickup_failed'].includes(order.status);
        const rawAddress = order.address || order.fullAddress || (order.deliveryAddress ? (typeof order.deliveryAddress === 'string' ? order.deliveryAddress : `${order.deliveryAddress.line1 || ''}, ${order.deliveryAddress.city || ''} ${order.deliveryAddress.postcode || ''}`) : '') || '';
        const addrParts = rawAddress.split(',').map((s: string) => s.trim()).filter(Boolean);
        const line1 = addrParts[0] || order.addressLine1 || (rawAddress ? rawAddress : 'Address not specified');
        const line2 = addrParts.slice(1).join(', ') || order.addressLine2 || (order.city ? `${order.city} ${order.postcode || ''}` : (order.postcode || ''));

        let displayTime = 'Scheduled';
        if (isPickup) {
            displayTime = order.pickup_slot || order.pickupSlot || order.pickupTime || (order.created_at ? formatTime(order.created_at) : 'Scheduled');
        } else {
            displayTime = order.delivery_slot || order.deliverySlot || order.deliveryTime || order.pickup_slot || order.pickupSlot || (order.created_at ? formatTime(order.created_at) : 'Scheduled');
        }

        const orderId = order.id || order.publicId || (order._id ? String(order._id) : 'ORD-UNKNOWN');
        const contactName = order.contactDetails
            ? `${order.contactDetails.firstName || ''} ${order.contactDetails.lastName || ''}`.trim()
            : '';
        const customerName = (order.customerName && order.customerName !== 'Valued Customer' && order.customerName !== 'Customer')
            ? order.customerName
            : (order.customer_name && order.customer_name !== 'Valued Customer' && order.customer_name !== 'Customer')
            ? order.customer_name
            : contactName
            || order.user_name
            || order.customer?.name
            || order.customer?.full_name
            || order.userName
            || (order.customerEmail ? order.customerEmail.split('@')[0] : '')
            || 'Customer';
        const customerPhone = order.customerPhone || order.customer_phone || order.contactDetails?.phone || order.phone || order.customer?.phone || '';

        return {
            id: orderId,
            type: isPickup ? 'collection' : 'delivery',
            customerName,
            customerPhone,
            time: displayTime,
            formattedTimeSlot: displayTime,
            addressLine1: line1,
            addressLine2: line2,
            fullAddress: rawAddress || (line1 ? `${line1}, ${line2}` : 'Address unavailable'),
            orderCode: order.publicId || order.orderNumber || order.id || orderId,
            bagCount: order.bag_count || order.bagCount || (order.items && order.items.length > 0 ? order.items.reduce((sum: number, it: any) => sum + (it.quantity || 1), 0) : 1),
            status: order.status,
            items: order.items || [],
            rawOrder: order,
            isReal: true,
            pickupInstructionType: order.pickupInstructionType || order.pickup_instruction_type,
            deliveryInstructionType: order.deliveryInstructionType || order.delivery_instruction_type
        };
    });

    // Real DB orders only (no mock fallback)
    const combinedJobs: DriverJobItem[] = mappedAssignedJobs;

    const allCount = combinedJobs.length;
    const collectionsCount = combinedJobs.filter(j => j.type === 'collection').length;
    const deliveriesCount = combinedJobs.filter(j => j.type === 'delivery').length;

    const filteredJobs = combinedJobs.filter(j => {
        if (filterTab === 'collections') return j.type === 'collection';
        if (filterTab === 'deliveries') return j.type === 'delivery';
        return true;
    });

    // ── Dashboard Live Helpers ──
    const nextJob = combinedJobs.find(j => ['driver_assigned', 'pickup_in_progress', 'laundry_collected', 'delivery_driver_assigned', 'delivery_driver_accepted', 'ready_for_delivery', 'out_for_delivery'].includes(j.status)) || combinedJobs[0];
    const todayCompletedOrders = completed.filter(o => {
        const rawDate = o.completed_at || o.qr_tracking?.deliveredAt || o.qr_tracking?.collectedAt || o.delivered_at || o.updated_at || o.createdAt;
        if (!rawDate) return false;
        try {
            return new Date(rawDate).toDateString() === new Date().toDateString();
        } catch { return false; }
    });
    const todayCompletedCount = todayCompletedOrders.length;
    const rawTodayEarnings = todayCompletedOrders.reduce((acc, o) => acc + 5 + ((o.total_price || o.total || 0) * 0.1), 0);
    const displayTodayEarnings = rawTodayEarnings.toFixed(2);
    const totalPlannedStops = allCount + todayCompletedCount;
    const shiftProgressPercent = totalPlannedStops > 0 ? Math.min(100, Math.round((todayCompletedCount / totalPlannedStops) * 100)) : 0;

    // ── Completed Jobs Date Filtering & Helpers ──
    const allCompletedJobs = completed;

    const getOrderDateString = (order: any): string => {
        const raw = order.completed_at || order.qr_tracking?.deliveredAt || order.qr_tracking?.collectedAt || order.delivered_at || order.updated_at || order.createdAt;
        if (!raw) return '';
        try {
            const d = new Date(raw);
            if (isNaN(d.getTime())) return '';
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        } catch {
            return '';
        }
    };

    const getTodayDateString = (): string => {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    const getYesterdayDateString = (): string => {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    const formatDisplayDateHeader = (dateStr: string): string => {
        if (!dateStr || dateStr === 'all') return 'All Dates';
        const todayStr = getTodayDateString();
        const yesterdayStr = getYesterdayDateString();

        try {
            const [y, m, d] = dateStr.split('-').map(Number);
            const dateObj = new Date(y, m - 1, d);
            const formatted = dateObj.toLocaleDateString('en-GB', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                year: 'numeric'
            });
            if (dateStr === todayStr) return `Today (${formatted})`;
            if (dateStr === yesterdayStr) return `Yesterday (${formatted})`;
            return formatted;
        } catch {
            return dateStr;
        }
    };

    const handleStepCompletedDate = (offset: number) => {
        let baseDate: Date;
        if (!completedDateFilter || completedDateFilter === 'all') {
            baseDate = new Date();
        } else {
            const [y, m, d] = completedDateFilter.split('-').map(Number);
            baseDate = new Date(y, m - 1, d);
        }
        baseDate.setDate(baseDate.getDate() + offset);
        const y = baseDate.getFullYear();
        const m = String(baseDate.getMonth() + 1).padStart(2, '0');
        const day = String(baseDate.getDate()).padStart(2, '0');
        setCompletedDateFilter(`${y}-${m}-${day}`);
    };

    const availableCompletedDates = React.useMemo(() => {
        const counts: Record<string, number> = {};
        allCompletedJobs.forEach((order: any) => {
            const dStr = getOrderDateString(order);
            if (dStr) {
                counts[dStr] = (counts[dStr] || 0) + 1;
            }
        });

        const todayStr = getTodayDateString();
        const yesterdayStr = getYesterdayDateString();

        return Object.entries(counts)
            .sort((a, b) => b[0].localeCompare(a[0]))
            .map(([date, count]) => {
                let label = date;
                if (date === todayStr) label = 'Today';
                else if (date === yesterdayStr) label = 'Yesterday';
                else {
                    try {
                        const [y, m, d] = date.split('-').map(Number);
                        const dt = new Date(y, m - 1, d);
                        label = dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
                    } catch {
                        label = date;
                    }
                }
                return { date, label, count };
            });
    }, [allCompletedJobs]);

    const filteredCompletedJobs = React.useMemo(() => {
        if (!completedDateFilter || completedDateFilter === 'all') {
            return allCompletedJobs;
        }
        return allCompletedJobs.filter((order: any) => getOrderDateString(order) === completedDateFilter);
    }, [allCompletedJobs, completedDateFilter]);

    const currentWeekDates = React.useMemo(() => {
        const today = new Date();
        const currentDay = today.getDay(); // 0 is Sunday, 1 is Monday...
        const diffToMonday = (currentDay === 0 ? -6 : 1) - currentDay;
        const monday = new Date(today);
        monday.setDate(today.getDate() + diffToMonday + (weekOffset * 7));
        monday.setHours(0, 0, 0, 0);

        const days = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(monday);
            d.setDate(monday.getDate() + i);
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const dayNum = String(d.getDate()).padStart(2, '0');
            const dateString = `${y}-${m}-${dayNum}`;
            const weekday = d.toLocaleDateString('en-GB', { weekday: 'short' });
            const dayNumber = d.getDate();
            const isToday = dateString === getTodayDateString();
            days.push({ date: dateString, dayNumber, weekday, dateObj: d, isToday });
        }
        return days;
    }, [weekOffset]);

    const currentMonthYearHeader = React.useMemo(() => {
        if (!currentWeekDates || currentWeekDates.length === 0) return '';
        const first = currentWeekDates[0].dateObj;
        const last = currentWeekDates[6].dateObj;
        if (first.getMonth() === last.getMonth()) {
            return first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
        }
        return `${first.toLocaleDateString('en-GB', { month: 'short' })} - ${last.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`;
    }, [currentWeekDates]);

    const jumpToDate = (targetDateStr: string) => {
        if (!targetDateStr) return;
        const [y, m, d] = targetDateStr.split('-').map(Number);
        const target = new Date(y, m - 1, d);
        const today = new Date();
        const currentDay = today.getDay();
        const diffToMonday = (currentDay === 0 ? -6 : 1) - currentDay;
        const thisMonday = new Date(today);
        thisMonday.setDate(today.getDate() + diffToMonday);
        thisMonday.setHours(0, 0, 0, 0);

        const diffTime = target.getTime() - thisMonday.getTime();
        const diffWeeks = Math.floor(diffTime / (7 * 24 * 60 * 60 * 1000));
        setWeekOffset(diffWeeks);
        setCompletedDateFilter(targetDateStr);
    };

    const renderDateFilterBar = () => {
        const completedDatesSet = new Set<string>();
        allCompletedJobs.forEach((o: any) => {
            const ds = getOrderDateString(o);
            if (ds) completedDatesSet.add(ds);
        });

        return (
            <div className="bg-white rounded-3xl p-4 sm:p-5 border border-gray-100 shadow-sm space-y-3.5">
                {/* 1. Month Header upside + Controls */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#1877F2] flex items-center justify-center">
                            <Calendar className="w-4 h-4" />
                        </div>
                        <div>
                            <h3 className="text-sm sm:text-base font-black text-gray-900 tracking-tight">
                                {currentMonthYearHeader}
                            </h3>
                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                                {completedDateFilter === 'all' ? 'Showing All Dates' : formatDisplayDateHeader(completedDateFilter)}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setCompletedDateFilter('all')}
                            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${completedDateFilter === 'all'
                                ? 'bg-[#1877F2] text-white shadow-xs'
                                : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                                }`}
                        >
                            All Dates
                        </button>

                        <label className="relative flex items-center gap-1.5 px-3 py-1.5 bg-[#1877F2]/10 hover:bg-[#1877F2]/15 text-[#1877F2] font-bold rounded-full text-xs cursor-pointer transition-colors active:scale-95">
                            <CalendarDays className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Pick Date</span>
                            <input
                                type="date"
                                value={completedDateFilter === 'all' ? '' : completedDateFilter}
                                onChange={(e) => {
                                    if (e.target.value) {
                                        jumpToDate(e.target.value);
                                    }
                                }}
                                className="sr-only"
                            />
                        </label>
                    </div>
                </div>

                {/* 2. Seven Circles Row with < and > */}
                <div className="flex items-center justify-between gap-1 sm:gap-2 pt-1">
                    {/* Previous Week Button */}
                    <button
                        type="button"
                        onClick={() => setWeekOffset(prev => prev - 1)}
                        title="Previous 7 Days"
                        className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gray-100 hover:bg-gray-200 active:scale-90 flex items-center justify-center text-gray-600 transition-all shrink-0 cursor-pointer"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>

                    {/* 7 Dates in Circles */}
                    <div className="flex-1 grid grid-cols-7 gap-1 sm:gap-2 text-center">
                        {currentWeekDates.map((dayItem) => {
                            const isSelected = completedDateFilter === dayItem.date;
                            const hasActivity = completedDatesSet.has(dayItem.date);

                            return (
                                <button
                                    key={dayItem.date}
                                    type="button"
                                    onClick={() => setCompletedDateFilter(dayItem.date)}
                                    className="flex flex-col items-center justify-center gap-1 py-1 group cursor-pointer transition-transform active:scale-95"
                                >
                                    <span className={`text-[10px] font-bold uppercase transition-colors ${isSelected ? 'text-[#1877F2] font-black' : 'text-gray-400 group-hover:text-gray-600'
                                        }`}>
                                        {dayItem.weekday.slice(0, 3)}
                                    </span>

                                    <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-xs sm:text-sm font-bold transition-all relative ${isSelected
                                        ? 'bg-[#1877F2] text-white shadow-md shadow-blue-500/30 scale-105 ring-2 ring-blue-400/40 font-black'
                                        : dayItem.isToday
                                            ? 'bg-blue-50 text-[#1877F2] font-black ring-1.5 ring-[#1877F2]/60 hover:bg-blue-100'
                                            : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                                        }`}>
                                        <span>{dayItem.dayNumber}</span>

                                        {/* Activity dot if jobs completed on this date */}
                                        {hasActivity && (
                                            <span className={`absolute -bottom-0.5 w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-emerald-500'
                                                }`} />
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {/* Next Week Button */}
                    <button
                        type="button"
                        onClick={() => setWeekOffset(prev => prev + 1)}
                        title="Next 7 Days"
                        className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gray-100 hover:bg-gray-200 active:scale-90 flex items-center justify-center text-gray-600 transition-all shrink-0 cursor-pointer"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            </div>
        );
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#1877F2] flex flex-col items-center justify-center gap-4">
                <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center">
                    <Truck className="w-8 h-8 text-white animate-pulse" />
                </div>
                <p className="text-white font-bold text-sm tracking-wider">Loading your assignments...</p>
            </div>
        );
    }

    return (
        <div className="h-[100dvh] max-h-[100dvh] bg-[#F4F6FB] font-[family-name:var(--font-outfit)] flex flex-col w-full max-w-md md:max-w-lg mx-auto shadow-2xl relative overflow-hidden">
            {/* ── Toast ── */}
            {toastMsg && (
                <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl shadow-2xl text-sm font-bold transition-all max-w-xs text-center
                    ${toastType === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
                    {toastMsg}
                </div>
            )}

            {/* ── Main Scroll Container ── */}
            <div className="flex-1 overflow-y-auto flex flex-col overscroll-contain">
                {/* ── 1. Scrollable Brand & Greeting Section (Scrolls naturally with page) ── */}
                <div className="bg-gradient-to-b from-[#1877F2] via-[#166CE1] to-[#1565D8] text-white px-5 pt-6 pb-4 shrink-0 transition-all">
                    {/* Laundelle Logo with Wave Accent & Active Status Toggle */}
                    <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                            <span className="text-2xl font-black tracking-tight text-white font-sans">Laundelle</span>
                            <svg className="w-20 h-2 -mt-0.5 text-blue-200/80" viewBox="0 0 100 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M2 6C15 1 25 11 40 6C55 1 65 11 80 6C88 3 95 6 98 8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                            </svg>
                        </div>

                        {/* Duty Status Toggle Button (Desktop & Mobile) */}
                        <button
                            type="button"
                            onClick={handleToggleDriverActive}
                            disabled={togglingActive}
                            title={`Click to switch to ${driverActive ? 'Offline' : 'Online'} duty`}
                            className={`flex items-center gap-2.5 px-3.5 py-1.5 rounded-full border transition-all cursor-pointer shadow-sm active:scale-95 ${
                                driverActive
                                    ? 'bg-emerald-500/25 hover:bg-emerald-500/35 text-white border-emerald-400/50 backdrop-blur-md'
                                    : 'bg-black/20 hover:bg-black/30 text-white/90 border-white/20 backdrop-blur-md'
                            }`}
                        >
                            <span className="relative flex h-2.5 w-2.5">
                                {driverActive && (
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                )}
                                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${driverActive ? 'bg-emerald-400 ring-2 ring-emerald-300/40' : 'bg-slate-400'}`}></span>
                            </span>
                            <div className="flex flex-col text-left leading-none">
                                <span className="text-[9px] uppercase tracking-wider font-extrabold text-blue-100/80">Duty Status</span>
                                <span className="text-xs font-black tracking-tight mt-0.5">
                                    {togglingActive ? 'Updating...' : (driverActive ? 'Active (Online)' : 'Offline')}
                                </span>
                            </div>
                            <div className={`w-8 h-4.5 rounded-full p-0.5 transition-colors duration-200 ease-in-out flex items-center ml-1 ${
                                driverActive ? 'bg-emerald-400 justify-end' : 'bg-slate-400/60 justify-start'
                            }`}>
                                <div className="w-3.5 h-3.5 rounded-full bg-white shadow-xs transform transition-transform" />
                            </div>
                        </button>
                    </div>

                    {/* Contextual Subtitle or Greeting in Scrollable Hero */}
                    {view === 'dashboard' && (
                        <div className="mt-3">
                            <h1 className="text-2xl font-black text-white tracking-tight">
                                Hello, {userName || driverInfo?.name?.split(' ')[0] || 'Driver'} 👋
                            </h1>
                            <p className="text-xs text-blue-100/90 mt-0.5 font-medium">Your shift command center & route overview</p>
                        </div>
                    )}
                    {view === 'assignments' && (
                        <p className="text-xs text-blue-100/90 mt-2 font-medium">Your assigned collections and deliveries</p>
                    )}
                    {view === 'history' && (
                        <p className="text-xs text-blue-100/90 mt-2 font-medium">History of your finished collections & deliveries</p>
                    )}
                    {view === 'earnings' && (
                        <p className="text-xs text-blue-100/90 mt-2 font-medium">Track your daily income, tips and bonuses</p>
                    )}
                    {view === 'settings' && (
                        <p className="text-xs text-blue-100/90 mt-2 font-medium">Manage your driver preferences & account</p>
                    )}
                </div>

                {/* ── 2. Fixed Page Name Bar (Sticks to top when scrolled) ── */}
                <div className="sticky top-0 z-30 bg-[#1565D8] text-white px-5 py-3 shadow-md flex items-center justify-between transition-all rounded-b-2xl border-b border-white/10 backdrop-blur-md">
                    {/* Page Name on Left */}
                    <div className="flex items-center gap-2">
                        <h2 className="text-lg font-black tracking-tight text-white">
                            {view === 'dashboard' && 'Dashboard'}
                            {view === 'assignments' && 'My Jobs'}
                            {view === 'history' && 'Completed Jobs'}
                            {view === 'earnings' && 'Earnings'}
                            {view === 'settings' && 'Profile'}
                        </h2>
                    </div>

                    {/* Context Filter Controls & Adjusted Notification Bell on Right */}
                    <div className="flex items-center gap-2">
                        {/* Compact Status Toggle when scrolled */}
                        <button
                            type="button"
                            onClick={handleToggleDriverActive}
                            disabled={togglingActive}
                            title={`Duty Status: ${driverActive ? 'Online' : 'Offline'}. Tap to toggle.`}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all cursor-pointer ${
                                driverActive
                                    ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border-emerald-400/40'
                                    : 'bg-white/10 hover:bg-white/20 text-slate-200 border-white/20'
                            }`}
                        >
                            <span className={`w-2 h-2 rounded-full ${driverActive ? 'bg-emerald-400' : 'bg-slate-400'}`} />
                            <span>{driverActive ? 'Online' : 'Offline'}</span>
                        </button>
                        {/* Date Filter Dropdown for My Jobs */}
                        {view === 'assignments' && (
                            <div className="relative">
                                <button
                                    onClick={() => setDateDropdownOpen(!dateDropdownOpen)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 backdrop-blur-md text-white rounded-full text-xs font-bold border border-white/25 transition-all active:scale-95 shadow-xs"
                                >
                                    <Calendar className="w-3.5 h-3.5 text-white" />
                                    <span>{dateFilter}</span>
                                    <ChevronDown className={`w-3.5 h-3.5 text-white transition-transform duration-200 ${dateDropdownOpen ? 'rotate-180' : ''}`} />
                                </button>
                                {dateDropdownOpen && (
                                    <div className="absolute right-0 mt-2 w-36 bg-white rounded-2xl shadow-xl border border-gray-100 py-1.5 z-50 text-gray-800 text-xs font-semibold animate-in fade-in zoom-in-95">
                                        {['Today', 'Tomorrow', 'This Week', 'All Dates'].map((df) => (
                                            <button
                                                key={df}
                                                onClick={() => { setDateFilter(df); setDateDropdownOpen(false); }}
                                                className={`w-full text-left px-3.5 py-2 hover:bg-blue-50 transition-colors flex items-center justify-between ${dateFilter === df ? 'text-[#1877F2] font-bold bg-blue-50/50' : ''}`}
                                            >
                                                {df}
                                                {dateFilter === df && <Check className="w-3.5 h-3.5 text-[#1877F2]" />}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Sign Out on Profile / Settings */}
                        {view === 'settings' && (
                            <button
                                onClick={() => { clearSession(); onSignOut(); }}
                                title="Sign Out"
                                className="w-8 h-8 bg-white/15 hover:bg-red-500/50 rounded-full flex items-center justify-center transition-colors active:scale-95"
                            >
                                <LogOut className="w-3.5 h-3.5 text-white" />
                            </button>
                        )}

                        {/* Adjusted Notification Bell */}
                        <button
                            onClick={() => setNotificationsOpen(true)}
                            title="Notifications"
                            className="relative w-8 h-8 bg-white/15 hover:bg-white/25 rounded-full flex items-center justify-center transition-all active:scale-95"
                        >
                            <Bell className="w-4 h-4 text-white" />
                            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-[#1565D8]"></span>
                        </button>
                    </div>
                </div>

                {/* ── Main View Content ── */}
                <div className="px-4 pt-4 pb-10 space-y-4">

                    {/* Offline Resilience Banner (P2) */}
                    {(!isOnline || offlineQueue.length > 0) && (
                        <div className={`p-3.5 rounded-2xl flex items-center justify-between gap-3 text-xs border shadow-xs ${!isOnline
                            ? 'bg-amber-50 border-amber-300 text-amber-900'
                            : 'bg-blue-50 border-blue-200 text-blue-900'
                            }`}>
                            <div className="flex items-center gap-2.5">
                                <span className={`w-3 h-3 rounded-full shrink-0 ${!isOnline ? 'bg-amber-500 animate-pulse' : 'bg-blue-500'}`} />
                                <div>
                                    <span className="font-bold block">
                                        {!isOnline ? 'Offline Mode Active' : 'Connection Restored'}
                                    </span>
                                    <span className="text-[11px] text-gray-600 block">
                                        {offlineQueue.length > 0
                                            ? `${offlineQueue.length} action(s) stored locally on device.`
                                            : 'Pickup and delivery actions will be safely stored offline and synced when network resumes.'}
                                    </span>
                                </div>
                            </div>
                            {isOnline && offlineQueue.length > 0 && (
                                <button
                                    onClick={syncOfflineQueue}
                                    disabled={syncingOffline}
                                    className="px-3 py-1.5 bg-[#0077B6] hover:bg-[#023E8A] text-white rounded-xl font-bold shrink-0 shadow-xs cursor-pointer disabled:opacity-50"
                                >
                                    {syncingOffline ? 'Syncing...' : 'Sync Now'}
                                </button>
                            )}
                        </div>
                    )}

                    {/* ── DASHBOARD VIEW (REDESIGNED) ── */}
                    {view === 'dashboard' && (
                        <div className="space-y-4 pb-2">
                            {/* 1. Core Shift Metrics Grid (4 Elevated Cards) */}
                            <div className="grid grid-cols-2 gap-3 sm:gap-3.5">
                                {/* Active Jobs Card */}
                                <div
                                    onClick={() => setView('assignments')}
                                    className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100/90 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center text-[#1877F2] group-hover:scale-110 transition-transform">
                                            <ClipboardList className="w-5 h-5" />
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-[#1877F2] group-hover:translate-x-0.5 transition-all" />
                                    </div>
                                    <div>
                                        <p className="text-2xl font-black text-gray-900 tracking-tight">{allCount}</p>
                                        <p className="text-xs font-bold text-gray-500 mt-0.5">Active Jobs</p>
                                        <p className="text-[10px] text-blue-600 font-semibold mt-1 truncate">
                                            {collectionsCount} pickups · {deliveriesCount} deliveries
                                        </p>
                                    </div>
                                </div>

                                {/* Today's Earnings Card */}
                                <div
                                    onClick={() => setView('earnings')}
                                    className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100/90 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 group-hover:scale-110 transition-transform">
                                            <PoundSterling className="w-5 h-5" />
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all" />
                                    </div>
                                    <div>
                                        <p className="text-2xl font-black text-emerald-600 tracking-tight">£{displayTodayEarnings}</p>
                                        <p className="text-xs font-bold text-gray-500 mt-0.5">Today's Earnings</p>
                                        <p className="text-[10px] text-emerald-700 font-semibold mt-1">
                                            Base + 10% bonus
                                        </p>
                                    </div>
                                </div>

                                {/* Completed Today Card */}
                                <div
                                    onClick={() => setView('history')}
                                    className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100/90 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="w-9 h-9 rounded-xl bg-teal-50 flex items-center justify-center text-teal-600 group-hover:scale-110 transition-transform">
                                            <CheckCircle2 className="w-5 h-5" />
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-teal-600 group-hover:translate-x-0.5 transition-all" />
                                    </div>
                                    <div>
                                        <p className="text-2xl font-black text-gray-900 tracking-tight">{todayCompletedCount}</p>
                                        <p className="text-xs font-bold text-gray-500 mt-0.5">Completed Today</p>
                                        <p className="text-[10px] text-teal-700 font-semibold mt-1">
                                            100% on-time rate
                                        </p>
                                    </div>
                                </div>

                                {/* Route Stops Card */}
                                <div
                                    onClick={() => setView('assignments')}
                                    className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100/90 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform">
                                            <MapPin className="w-5 h-5" />
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all" />
                                    </div>
                                    <div>
                                        <p className="text-2xl font-black text-gray-900 tracking-tight">{totalPlannedStops}</p>
                                        <p className="text-xs font-bold text-gray-500 mt-0.5">Route Stops</p>
                                        <p className="text-[10px] text-indigo-600 font-semibold mt-1">
                                            {todayCompletedCount} completed · {allCount} pending
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* 2. "UP NEXT ON YOUR ROUTE" Live Action Card */}
                            {nextJob ? (
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between px-1">
                                        <div className="flex items-center gap-1.5">
                                            <span className="w-2 h-2 rounded-full bg-[#1877F2] animate-ping" />
                                            <h2 className="text-xs font-extrabold text-gray-600 uppercase tracking-wider">
                                                Up Next on Your Route
                                            </h2>
                                        </div>
                                        <span className="text-[10px] font-bold text-[#1877F2] bg-blue-50 px-2 py-0.5 rounded-full">
                                            Stop 1 of {totalPlannedStops}
                                        </span>
                                    </div>

                                    <div className={`bg-white rounded-3xl p-4.5 shadow-sm border border-gray-100 hover:shadow-md transition-all border-l-4 ${nextJob.type === 'collection' ? 'border-[#1877F2]' : 'border-[#22C55E]'
                                        }`}>
                                        {/* Top Row: Type & Slot Time */}
                                        <div className="flex items-center justify-between mb-2.5">
                                            <span className={`text-xs font-extrabold px-2.5 py-1 rounded-full ${nextJob.type === 'collection'
                                                ? 'bg-blue-50 text-[#1877F2]'
                                                : 'bg-emerald-50 text-emerald-700'
                                                }`}>
                                                {nextJob.type === 'collection' ? 'Package Collection' : 'Customer Delivery'}
                                            </span>
                                            <div className="flex items-center gap-1 text-xs font-bold text-gray-600 bg-gray-50 px-2.5 py-1 rounded-full">
                                                <Clock className="w-3.5 h-3.5 text-[#1877F2]" />
                                                <span>{nextJob.time}</span>
                                            </div>
                                        </div>

                                        {/* Customer & Code */}
                                        <div className="flex items-start justify-between gap-2 mb-2">
                                            <h3 className="text-base font-extrabold text-gray-900 tracking-tight">
                                                {nextJob.customerName}
                                            </h3>
                                            <span className="font-mono text-xs font-bold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-md shrink-0">
                                                {nextJob.orderCode}
                                            </span>
                                        </div>

                                        {/* Address */}
                                        <div className="flex items-start gap-2 text-gray-600 mb-3.5">
                                            <MapPin className="w-4 h-4 text-[#1877F2] shrink-0 mt-0.5" />
                                            <p className="text-xs leading-snug text-gray-600 line-clamp-2">
                                                {nextJob.fullAddress}
                                            </p>
                                        </div>

                                        {/* Quick Summary Pill */}
                                        <div className="flex items-center justify-between pt-2.5 border-t border-gray-100 text-xs text-gray-500 mb-3.5">
                                            <div className="flex items-center gap-1 font-medium">
                                                <ShoppingBag className="w-3.5 h-3.5 text-gray-400" />
                                                <span>{nextJob.bagCount} {nextJob.bagCount === 1 ? 'bag' : 'bags'}</span>
                                            </div>
                                            <div className="flex items-center gap-1 font-medium text-emerald-600">
                                                <ShieldCheck className="w-3.5 h-3.5" />
                                                <span>OTP Verification</span>
                                            </div>
                                        </div>

                                        {/* Action Buttons right on the Dashboard card */}
                                        <div className="grid grid-cols-2 gap-2 pt-1">
                                            <a
                                                href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(nextJob.fullAddress)}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="w-full py-2.5 px-3 bg-blue-50 hover:bg-blue-100 text-[#1877F2] font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
                                            >
                                                <Navigation className="w-3.5 h-3.5" />
                                                <span>Navigate</span>
                                            </a>
                                            <button
                                                onClick={() => setView('assignments')}
                                                className="w-full py-2.5 px-3 bg-[#1877F2] hover:bg-[#1565C0] text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                                            >
                                                <span>Open Job Route</span>
                                                <ArrowRight className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-white rounded-3xl p-5 shadow-xs border border-gray-100 flex items-center gap-3.5">
                                    <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                                        <CheckCircle2 className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-black text-gray-900">No Pending Stops</h3>
                                        <p className="text-xs text-gray-500 mt-0.5">You have completed all active deliveries and pickups for now.</p>
                                    </div>
                                </div>
                            )}

                            {/* 3. Today's Route Shift Progress & Timeline Tracker */}
                            <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 space-y-3.5">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h3 className="text-sm font-black text-gray-900 tracking-tight">Today's Shift Progress</h3>
                                        <p className="text-[11px] text-gray-500 font-medium mt-0.5">
                                            {todayCompletedCount} of {totalPlannedStops} stops finished ({shiftProgressPercent}%)
                                        </p>
                                    </div>
                                    <span className="text-xs font-black text-[#1877F2] bg-blue-50 px-2.5 py-1 rounded-full">
                                        {shiftProgressPercent}%
                                    </span>
                                </div>

                                {/* Progress Bar */}
                                <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                                    <div
                                        className="bg-gradient-to-r from-[#1877F2] to-emerald-500 h-full rounded-full transition-all duration-700 shadow-sm"
                                        style={{ width: `${shiftProgressPercent}%` }}
                                    />
                                </div>

                                {/* Mini Stops Timeline Preview */}
                                <div className="pt-2 space-y-2.5">
                                    {combinedJobs.length === 0 ? (
                                        <p className="text-xs text-gray-400 py-2 text-center font-medium">No active stops remaining on your route.</p>
                                    ) : (
                                        combinedJobs.slice(0, 3).map((job, idx) => (
                                            <div
                                                key={job.id}
                                                onClick={() => setView('assignments')}
                                                className="flex items-center justify-between p-2.5 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer border border-gray-50"
                                            >
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-6 h-6 rounded-full bg-blue-100 text-[#1877F2] text-xs font-black flex items-center justify-center shrink-0">
                                                        {idx + 1}
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-bold text-gray-800 leading-tight">{job.customerName}</p>
                                                        <p className="text-[10px] text-gray-400 mt-0.5">{job.addressLine1}</p>
                                                    </div>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${job.type === 'collection' ? 'bg-blue-50 text-[#1877F2]' : 'bg-emerald-50 text-emerald-700'
                                                        }`}>
                                                        {job.time}
                                                    </span>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>

                                <button
                                    onClick={() => setView('assignments')}
                                    className="w-full py-2.5 text-xs font-bold text-[#1877F2] bg-blue-50/70 hover:bg-blue-50 rounded-xl transition-colors flex items-center justify-center gap-1 cursor-pointer"
                                >
                                    <span>View All Stops ({allCount} Remaining)</span>
                                    <ChevronRight className="w-3.5 h-3.5" />
                                </button>
                            </div>

                            {/* 4. Quick Actions Hub (4 Interactive Shortcut Tiles) */}
                            <div className="space-y-2">
                                <h3 className="text-xs font-black text-gray-600 uppercase tracking-wider px-1">Quick Action Station</h3>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                                    <button
                                        onClick={() => setView('assignments')}
                                        className="p-3.5 bg-white rounded-2xl border border-gray-100 hover:border-blue-200 hover:shadow-sm transition-all text-left group cursor-pointer"
                                    >
                                        <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#1877F2] flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                                            <ListTodo className="w-4 h-4" />
                                        </div>
                                        <p className="text-xs font-extrabold text-gray-900 leading-tight">My Route</p>
                                        <p className="text-[10px] text-gray-500 mt-0.5">Assigned jobs</p>
                                    </button>

                                    <button
                                        onClick={() => {
                                            if (nextJob) {
                                                if (nextJob.rawOrder) {
                                                    setSelectedJob(nextJob.rawOrder);
                                                } else {
                                                    setSelectedJob({
                                                        id: nextJob.id,
                                                        status: nextJob.type === 'collection' ? 'driver_assigned' : 'out_for_delivery',
                                                        customer_name: nextJob.customerName,
                                                        customer_phone: nextJob.customerPhone,
                                                        address: nextJob.fullAddress,
                                                        postcode: nextJob.addressLine2,
                                                        pickupDate: 'Today',
                                                        pickupSlot: nextJob.time,
                                                        deliveryDate: 'Today',
                                                        deliverySlot: nextJob.time,
                                                        items: nextJob.items || [{ name: 'Laundry Bag(s)', quantity: nextJob.bagCount }]
                                                    });
                                                }
                                                setQrModalOpen(true);
                                            } else {
                                                showToast('No active order for QR handover');
                                            }
                                        }}
                                        className="p-3.5 bg-white rounded-2xl border border-gray-100 hover:border-indigo-200 hover:shadow-sm transition-all text-left group cursor-pointer"
                                    >
                                        <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                                            <QrCode className="w-4 h-4" />
                                        </div>
                                        <p className="text-xs font-extrabold text-gray-900 leading-tight">Handover QR</p>
                                        <p className="text-[10px] text-gray-500 mt-0.5">Show to processor</p>
                                    </button>

                                    <button
                                        onClick={() => setView('history')}
                                        className="p-3.5 bg-white rounded-2xl border border-gray-100 hover:border-emerald-200 hover:shadow-sm transition-all text-left group cursor-pointer"
                                    >
                                        <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                                            <CheckCircle2 className="w-4 h-4" />
                                        </div>
                                        <p className="text-xs font-extrabold text-gray-900 leading-tight">Completed</p>
                                        <p className="text-[10px] text-gray-500 mt-0.5">Finished history</p>
                                    </button>

                                    <button
                                        onClick={() => setView('earnings')}
                                        className="p-3.5 bg-white rounded-2xl border border-gray-100 hover:border-violet-200 hover:shadow-sm transition-all text-left group cursor-pointer"
                                    >
                                        <div className="w-8 h-8 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                                            <Wallet className="w-4 h-4" />
                                        </div>
                                        <p className="text-xs font-extrabold text-gray-900 leading-tight">Payouts</p>
                                        <p className="text-[10px] text-gray-500 mt-0.5">View balance</p>
                                    </button>
                                </div>
                            </div>

                            {/* 5. Vehicle & Equipment Readiness Card */}
                            <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#1877F2] flex items-center justify-center">
                                            <Truck className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <h4 className="text-xs font-extrabold text-gray-900">Vehicle Readiness</h4>
                                            <p className="text-[10px] text-gray-500 font-medium font-mono">{driverInfo?.vehicle || 'Delivery Van · Ready for Route'}</p>
                                        </div>
                                    </div>
                                    <span className="text-[10px] font-extrabold bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full flex items-center gap-1">
                                        <Check className="w-3 h-3" />
                                        <span>Verified</span>
                                    </span>
                                </div>

                                <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                                    <div className="p-2.5 bg-gray-50 rounded-2xl border border-gray-100">
                                        <p className="text-[10px] text-gray-400 font-bold uppercase">Status</p>
                                        <p className="text-xs font-extrabold text-emerald-600 mt-0.5">{driverInfo?.status || 'Active'}</p>
                                    </div>
                                    <div className="p-2.5 bg-gray-50 rounded-2xl border border-gray-100">
                                        <p className="text-[10px] text-gray-400 font-bold uppercase">Assigned</p>
                                        <p className="text-xs font-extrabold text-gray-900 mt-0.5">{allCount} Jobs</p>
                                    </div>
                                    <div className="p-2.5 bg-gray-50 rounded-2xl border border-gray-100">
                                        <p className="text-[10px] text-gray-400 font-bold uppercase">Network</p>
                                        <p className="text-xs font-extrabold text-blue-600 mt-0.5">{isOnline ? 'Online' : 'Offline'}</p>
                                    </div>
                                </div>
                            </div>

                            {/* 6. Live Hub Operational Notice */}
                            {driverInfo?.assigned_hub && (
                                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100/80 rounded-2xl p-4 flex items-start gap-3 shadow-2xs">
                                    <div className="w-8 h-8 rounded-full bg-[#1877F2] text-white flex items-center justify-center shrink-0 mt-0.5">
                                        <Waves className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-extrabold text-[#1877F2]">{driverInfo.assigned_hub} Operations</p>
                                        <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">
                                            Processing facility active. Drop-off cutoff is 8:00 PM.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* EARNINGS VIEW */}
                    {view === 'earnings' && (() => {
                        const filteredEarningsOrders = filteredCompletedJobs;
                        const payoutsList = filteredEarningsOrders.flatMap((order: any) => {
                            const isBoth = order.completed_action === 'both' || order.is_both;
                            const baseEarning = 5 + ((order.total_price || order.total || 0) * 0.1);
                            const rawCode = order.original_id || order.id || '';
                            const displayCode = rawCode.startsWith('#') ? rawCode : `#${rawCode.replace(/-both|-pickup|-delivery$/, '')}`;

                            if (isBoth) {
                                return [
                                    {
                                        payoutId: `${order.id}-payout-pickup`,
                                        displayCode,
                                        payoutType: 'Collection Task',
                                        payoutAmount: baseEarning,
                                        payoutDate: order.pickup_completed_at || order.completed_at
                                    },
                                    {
                                        payoutId: `${order.id}-payout-drop`,
                                        displayCode,
                                        payoutType: 'Delivery Task',
                                        payoutAmount: baseEarning,
                                        payoutDate: order.delivery_completed_at || order.completed_at
                                    }
                                ];
                            }
                            const isDelivery = order.completed_action === 'delivery' || order.status === 'delivered';
                            return [{
                                payoutId: `${order.id}-payout`,
                                displayCode,
                                payoutType: isDelivery ? 'Delivery Task' : 'Collection Task',
                                payoutAmount: baseEarning,
                                payoutDate: order.completed_at
                            }];
                        });

                        const totalPeriodEarnings = payoutsList.reduce((acc: number, item: any) => acc + item.payoutAmount, 0);
                        const earningsHeaderTitle = completedDateFilter === 'all'
                            ? 'All-Time Earnings'
                            : completedDateFilter === getTodayDateString()
                                ? "Today's Earnings"
                                : `${formatDisplayDateHeader(completedDateFilter)} Earnings`;

                        return (
                            <div className="space-y-6">
                                {/* Date Filter */}
                                {renderDateFilterBar()}

                                <div className="bg-[#03045E] rounded-3xl p-6 text-center shadow-lg relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-4 opacity-10">
                                        <PoundSterling className="w-24 h-24" />
                                    </div>
                                    <p className="text-blue-200 text-sm font-bold uppercase tracking-widest relative z-10">
                                        {earningsHeaderTitle}
                                    </p>
                                    <h2 className="text-5xl font-black text-white mt-2 relative z-10">
                                        £{totalPeriodEarnings.toFixed(2)}
                                    </h2>
                                    <p className="text-xs text-blue-300 mt-2 relative z-10">
                                        {payoutsList.length} task payouts ({filteredEarningsOrders.length} orders) · Base rate + 10% commission
                                    </p>
                                </div>

                                <div>
                                    <div className="flex items-center justify-between mb-3 px-1">
                                        <h3 className="font-black text-gray-800">
                                            {completedDateFilter === 'all' ? 'Recent Payouts' : `Payouts (${payoutsList.length})`}
                                        </h3>
                                        {completedDateFilter !== 'all' && (
                                            <button
                                                onClick={() => setCompletedDateFilter('all')}
                                                className="text-xs font-bold text-[#1877F2] hover:underline cursor-pointer"
                                            >
                                                Show All Payouts
                                            </button>
                                        )}
                                    </div>

                                    {payoutsList.length === 0 ? (
                                        <div className="bg-white rounded-2xl p-8 text-center border border-gray-100 shadow-xs">
                                            <Banknote className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                                            <p className="font-bold text-gray-700 text-sm">No earnings recorded for this date</p>
                                            <p className="text-xs text-gray-400 mt-1">Select another date or click "All Dates" above.</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {payoutsList.map((item: any) => {
                                                const isDelivery = item.payoutType.includes('Delivery');
                                                return (
                                                    <div key={item.payoutId} className="bg-white rounded-2xl p-4 shadow-xs border border-gray-100 flex items-center justify-between">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isDelivery ? 'bg-emerald-50 text-emerald-600' : 'bg-sky-50 text-sky-600'}`}>
                                                                <Banknote className="w-5 h-5" />
                                                            </div>
                                                            <div>
                                                                <p className="font-bold text-[#03045E] text-sm">{item.displayCode}</p>
                                                                <p className="text-[10px] text-gray-500 font-medium mt-0.5">
                                                                    {item.payoutDate ? formatDate(item.payoutDate) : 'Recently'} · {item.payoutType}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="font-black text-emerald-600 text-lg">+£{item.payoutAmount.toFixed(2)}</p>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })()}

                    {/* SETTINGS VIEW */}
                    {view === 'settings' && (
                        <div className="space-y-6">
                            <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 text-center relative">
                                <div className="w-20 h-20 bg-[#CAF0F8] rounded-full flex items-center justify-center mx-auto mb-4">
                                    <User className="w-10 h-10 text-[#0077B6]" />
                                </div>
                                <h2 className="text-xl font-black text-[#03045E]">{driverInfo?.name || userName || 'Driver'}</h2>
                                <p className="text-xs text-gray-400 font-mono font-bold mt-0.5">ID: {driverInfo?.publicId || driverInfo?.employee_number || driverInfo?.id || 'N/A'}</p>
                                <p className="text-sm text-gray-500 mt-1">{driverInfo?.phone || 'No phone registered'}</p>

                                <div className="mt-6 grid grid-cols-2 gap-3 text-left">
                                    <div className="bg-gray-50 p-3 rounded-2xl">
                                        <p className="text-[10px] uppercase font-bold text-gray-400">Email Address</p>
                                        <p className="font-bold text-xs text-gray-800 line-clamp-1 mt-0.5">{driverInfo?.email || 'driver@laundelle.co.uk'}</p>
                                    </div>
                                    <div className="bg-gray-50 p-3 rounded-2xl">
                                        <p className="text-[10px] uppercase font-bold text-gray-400">Assigned Vehicle</p>
                                        <p className="font-bold text-xs text-gray-800 font-mono mt-0.5">{driverInfo?.vehicle || 'Delivery Van'}</p>
                                    </div>
                                    <div className="bg-gray-50 p-3 rounded-2xl">
                                        <p className="text-[10px] uppercase font-bold text-gray-400">Driver License</p>
                                        <p className="font-bold text-xs text-gray-800 font-mono mt-0.5">{driverInfo?.license_number || 'Standard UK Driver'}</p>
                                    </div>
                                    <div className="bg-gray-50 p-3 rounded-2xl">
                                        <p className="text-[10px] uppercase font-bold text-gray-400">Emergency Contact</p>
                                        <p className="font-bold text-xs text-gray-800 mt-0.5">
                                            {driverInfo?.emergency_contact?.name ? `${driverInfo.emergency_contact.name} (${driverInfo.emergency_contact.phone || ''})` : 'None Provided'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 space-y-4">
                                <h3 className="font-black text-gray-800 px-1">Assigned Delivery Postcodes</h3>
                                <div className="flex flex-wrap gap-2">
                                    {(driverInfo?.assigned_postcodes || driverInfo?.assigned_pincodes || []).length ? (
                                        (driverInfo.assigned_postcodes || driverInfo.assigned_pincodes).map((pin: string, idx: number) => (
                                            <span key={idx} className="bg-blue-50 text-[#0077B6] px-3 py-1.5 rounded-lg text-xs font-bold border border-blue-100 font-mono">
                                                {pin}
                                            </span>
                                        ))
                                    ) : (
                                        <p className="text-sm text-gray-500">All regional center postcodes allowed.</p>
                                    )}
                                </div>
                            </div>

                            <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 space-y-3">
                                <h3 className="font-black text-gray-800 px-1 mb-2">Support & Help</h3>
                                <button className="w-full text-left px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-xl font-bold text-sm text-gray-700 transition-colors">
                                    Contact Customer Support
                                </button>
                                <button className="w-full text-left px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-xl font-bold text-sm text-gray-700 transition-colors">
                                    Report an Issue
                                </button>
                                <button
                                    onClick={() => { clearSession(); onSignOut(); }}
                                    className="w-full text-left px-4 py-3 mt-4 bg-red-50 hover:bg-red-100 rounded-xl font-bold text-sm text-red-600 transition-colors flex items-center justify-between"
                                >
                                    Sign Out
                                    <LogOut className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ASSIGNMENTS / MY JOBS VIEW (REFERENCE DESIGN) */}
                    {view === 'assignments' && (
                        <div className="space-y-3.5 pb-2">
                            {/* ── Segmented Filter Pill Tabs ── */}
                            <div className="flex items-center gap-2 pt-0.5 pb-1">
                                <button
                                    onClick={() => setFilterTab('all')}
                                    className={`flex-1 py-2.5 px-3 rounded-full text-xs font-bold transition-all text-center ${filterTab === 'all'
                                        ? 'bg-[#1877F2] text-white shadow-md shadow-blue-500/25 ring-1 ring-[#1877F2]'
                                        : 'bg-white text-gray-600 border border-gray-200/90 hover:bg-gray-50'
                                        }`}
                                >
                                    All ({allCount})
                                </button>
                                <button
                                    onClick={() => setFilterTab('collections')}
                                    className={`flex-1 py-2.5 px-3 rounded-full text-xs font-bold transition-all text-center ${filterTab === 'collections'
                                        ? 'bg-[#1877F2] text-white shadow-md shadow-blue-500/25 ring-1 ring-[#1877F2]'
                                        : 'bg-white text-gray-600 border border-gray-200/90 hover:bg-gray-50'
                                        }`}
                                >
                                    Collections ({collectionsCount})
                                </button>
                                <button
                                    onClick={() => setFilterTab('deliveries')}
                                    className={`flex-1 py-2.5 px-3 rounded-full text-xs font-bold transition-all text-center ${filterTab === 'deliveries'
                                        ? 'bg-[#1877F2] text-white shadow-md shadow-blue-500/25 ring-1 ring-[#1877F2]'
                                        : 'bg-white text-gray-600 border border-gray-200/90 hover:bg-gray-50'
                                        }`}
                                >
                                    Deliveries ({deliveriesCount})
                                </button>
                            </div>



                            {/* ── Job Cards List ── */}
                            <div className="space-y-2.5">
                                {filteredJobs.length === 0 ? (
                                    <div className="bg-white rounded-2xl p-8 text-center border border-gray-100 shadow-xs">
                                        <Package className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                                        <p className="font-bold text-gray-700 text-sm">No jobs in this category</p>
                                        <p className="text-xs text-gray-400 mt-1">Switch tabs to view other assignments.</p>
                                    </div>
                                ) : (
                                    filteredJobs.map((job) => {
                                        const isCollection = job.type === 'collection';
                                        const initials = getCustomerInitials(job.customerName);
                                        return (
                                            <div
                                                key={job.id}
                                                onClick={() => {
                                                    const slotStr = formatJobTimeSlot(job);
                                                    if (job.rawOrder) {
                                                        setSelectedJob({
                                                            ...job.rawOrder,
                                                            id: job.id,
                                                            orderCode: job.orderCode,
                                                            jobType: job.type,
                                                            status: job.status,
                                                            customer_name: job.customerName,
                                                            customer_phone: job.customerPhone,
                                                            address: job.fullAddress,
                                                            addressLine1: job.addressLine1,
                                                            addressLine2: job.addressLine2,
                                                            postcode: job.addressLine2,
                                                            formattedTimeSlot: slotStr,
                                                            time: job.time,
                                                            bagCount: job.bagCount,
                                                            items: job.items || job.rawOrder.items || [{ name: 'Laundry Bag(s)', quantity: job.bagCount }]
                                                        });
                                                    } else {
                                                        setSelectedJob({
                                                            id: job.id,
                                                            orderCode: job.orderCode,
                                                            jobType: job.type,
                                                            status: isCollection ? 'driver_assigned' : 'out_for_delivery',
                                                            customer_name: job.customerName,
                                                            customer_phone: job.customerPhone,
                                                            address: job.fullAddress,
                                                            addressLine1: job.addressLine1,
                                                            addressLine2: job.addressLine2,
                                                            postcode: job.addressLine2,
                                                            pickupDate: 'Today',
                                                            pickupSlot: slotStr,
                                                            deliveryDate: 'Today',
                                                            deliverySlot: slotStr,
                                                            formattedTimeSlot: slotStr,
                                                            time: job.time,
                                                            bagCount: job.bagCount,
                                                            items: job.items || [{ name: 'Laundry Bag(s)', quantity: job.bagCount }]
                                                        });
                                                    }
                                                }}
                                                className={`rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 shadow-sm hover:shadow-md transition-all cursor-pointer relative space-y-2.5 border ${isCollection
                                                    ? 'bg-blue-50/40 border-blue-200/90 hover:border-blue-300'
                                                    : 'bg-emerald-50/40 border-emerald-200/90 hover:border-emerald-300'
                                                    }`}
                                            >
                                                {/* 1. TOP ROW: ORDER ID & PICKUP / DROP BADGE */}
                                                <div className={`flex items-center justify-between gap-2 pb-0.5 border-b ${isCollection ? 'border-blue-100/80' : 'border-emerald-100/80'}`}>
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border ${isCollection
                                                            ? 'bg-blue-100/70 text-[#1877F2] border-blue-200/80'
                                                            : 'bg-emerald-100/70 text-emerald-700 border-emerald-200/80'
                                                            }`}>
                                                            <Package className={`w-4 h-4 ${isCollection ? 'text-[#1877F2]' : 'text-emerald-700'}`} />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <span className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 leading-none mb-0.5">ORDER ID</span>
                                                            <span className="block text-sm sm:text-base font-black text-gray-900 tracking-tight leading-none truncate">
                                                                {job.orderCode?.startsWith('#') ? job.orderCode : `#${job.orderCode || job.id}`}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className={`px-3 py-1 rounded-full text-[11px] font-extrabold flex items-center gap-1.5 tracking-wide shrink-0 ${isCollection
                                                        ? 'bg-blue-50 text-[#1877F2] border border-blue-100/80'
                                                        : 'bg-emerald-50 text-emerald-600 border border-emerald-100/80'
                                                        }`}>
                                                        <span className={`w-2 h-2 rounded-full shrink-0 ${isCollection ? 'bg-[#1877F2]' : 'bg-emerald-600'}`}></span>
                                                        <span>{isCollection ? 'PICKUP' : 'DROP'}</span>
                                                    </div>
                                                </div>

                                                {/* 2. CUSTOMER INFO ROW (WITH INITIALS & CALL BUTTON) */}
                                                <div className="flex items-center justify-between gap-2.5">
                                                    <div className="flex items-center gap-2.5 min-w-0">
                                                        <div className={`w-9 h-9 rounded-full font-black text-xs flex items-center justify-center shrink-0 border ${isCollection
                                                            ? 'bg-blue-100/90 text-[#1877F2] border-blue-200/80'
                                                            : 'bg-emerald-100/90 text-emerald-700 border-emerald-200/80'
                                                            }`}>
                                                            {initials}
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <span className="block text-[9px] font-bold uppercase tracking-wider text-gray-400 leading-none mb-0.5">CUSTOMER</span>
                                                            <h3 className="text-sm sm:text-base font-black text-gray-900 tracking-tight leading-snug truncate">
                                                                {job.customerName}
                                                            </h3>
                                                        </div>
                                                    </div>

                                                    {job.customerPhone ? (
                                                        <a
                                                            href={`tel:${job.customerPhone}`}
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="w-8 h-8 rounded-full bg-blue-50 hover:bg-blue-100 active:scale-95 text-[#1877F2] flex items-center justify-center shrink-0 transition-all border border-blue-100/80"
                                                            title={`Call ${job.customerName}`}
                                                        >
                                                            <Phone className="w-3.5 h-3.5 fill-current" />
                                                        </a>
                                                    ) : (
                                                        <div className="w-8 h-8 rounded-full bg-gray-50 text-gray-400 flex items-center justify-center shrink-0 border border-gray-100" title="Phone not available">
                                                            <Phone className="w-3.5 h-3.5" />
                                                        </div>
                                                    )}
                                                </div>

                                                {/* 3. TIME SLOT & BAGS GRID */}
                                                <div className="grid grid-cols-2 gap-2">
                                                    {/* Time Slot Box */}
                                                    <div className="bg-[#F8FAFC] border border-slate-100 rounded-xl p-2.5 flex items-center gap-2 min-w-0">
                                                        <div className="w-8 h-8 rounded-full bg-blue-50 text-[#1877F2] flex items-center justify-center shrink-0">
                                                            <Clock className="w-4 h-4 text-[#1877F2]" />
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider truncate">
                                                                {isCollection ? 'PICKUP TIME' : 'DELIVERY TIME'}
                                                            </span>
                                                            <span className="block text-xs font-black text-gray-900 truncate mt-0.5">
                                                                {formatJobTimeSlot(job)}
                                                            </span>
                                                            <span className="mt-1 inline-flex items-center px-1.5 py-0.5 rounded-md bg-blue-50 text-[#1877F2] text-[9px] font-bold truncate">
                                                                Today • 2h window
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {/* Bags Box */}
                                                    <div className="bg-[#F8FAFC] border border-slate-100 rounded-xl p-2.5 flex items-center gap-2 min-w-0">
                                                        <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                                                            <ShoppingBag className="w-4 h-4 text-indigo-600" />
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider truncate">
                                                                BAGS TO HANDLE
                                                            </span>
                                                            <span className="block text-xs font-black text-gray-900 truncate mt-0.5">
                                                                {job.bagCount} bag{job.bagCount !== 1 ? 's' : ''}
                                                            </span>
                                                            <span className="mt-1 inline-flex items-center px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-600 text-[9px] font-bold truncate">
                                                                Standard load
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* 4. ADDRESS BOX */}
                                                <div className="bg-[#F8FAFC] border border-slate-100 rounded-xl p-2.5 flex items-start gap-2.5">
                                                    <div className="w-8 h-8 rounded-full bg-blue-50 text-[#1877F2] flex items-center justify-center shrink-0 mt-0.5">
                                                        <MapPin className="w-4 h-4 text-[#1877F2]" />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                                                            {isCollection ? 'PICKUP ADDRESS' : 'DELIVERY ADDRESS'}
                                                        </span>
                                                        <p className="text-xs font-black text-gray-900 mt-0.5 truncate">
                                                            {job.addressLine1}
                                                        </p>
                                                        {job.addressLine2 && (
                                                            <p className="text-[11px] text-gray-500 font-medium truncate mt-0.5">
                                                                {job.addressLine2}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Leave-at-Door Notice if applicable */}
                                                {!isCollection && (job.deliveryInstructionType === 'LEAVE_AT_DOOR' || job.rawOrder?.deliveryInstructionType === 'LEAVE_AT_DOOR') && (
                                                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-bold">
                                                        <span>🚪</span>
                                                        <span className="truncate">LEAVE AT DOOR (PHOTO PROOF REQUIRED)</span>
                                                    </div>
                                                )}

                                                {/* COD Alert Badge if applicable */}
                                                {((job.rawOrder?.payment_method === 'cash_on_delivery' || job.rawOrder?.paymentMethod === 'cash_on_delivery') && !job.rawOrder?.is_paid && job.rawOrder?.payment_status !== 'paid') && (
                                                    <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-orange-50 border border-orange-200 text-orange-900 text-[11px] font-bold">
                                                        <span className="flex items-center gap-1">
                                                            <PoundSterling className="w-3.5 h-3.5" /> Cash on Delivery Due
                                                        </span>
                                                        <span className="font-black">£{(job.rawOrder?.total_price || 0).toFixed(2)}</span>
                                                    </div>
                                                )}

                                                {/* 5. ACTION BUTTONS */}
                                                <div className="space-y-1.5">
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={(e) => handleStartNavigation(job, e)}
                                                            className="w-full py-2 px-3 bg-[#1877F2] hover:bg-[#1565C0] active:scale-98 text-white rounded-xl flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer"
                                                            title="Navigate"
                                                        >
                                                            <Navigation className="w-4 h-4 text-white fill-white shrink-0" />
                                                            <div className="text-left min-w-0">
                                                                <span className="block text-xs font-black leading-none">Navigate</span>
                                                                <span className="block text-[8px] font-extrabold opacity-80 tracking-wider uppercase mt-0.5">OPEN IN MAPS</span>
                                                            </div>
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleOpenVerification(job.id);
                                                            }}
                                                            className="w-full py-2 px-3 bg-[#00A86B] hover:bg-[#008f5b] active:scale-98 text-white rounded-xl flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer"
                                                            title="Verify & PIN"
                                                        >
                                                            <Camera className="w-4 h-4 text-white shrink-0" />
                                                            <div className="text-left min-w-0">
                                                                <span className="block text-xs font-black leading-none truncate">
                                                                    {!isCollection && (job.deliveryInstructionType === 'LEAVE_AT_DOOR' || job.rawOrder?.deliveryInstructionType === 'LEAVE_AT_DOOR')
                                                                        ? 'Verify Photo'
                                                                        : 'Verify & PIN'}
                                                                </span>
                                                                <span className="block text-[8px] font-extrabold opacity-80 tracking-wider uppercase mt-0.5">SCAN & CONFIRM</span>
                                                            </div>
                                                        </button>
                                                    </div>

                                                    {((job.rawOrder?.payment_method === 'cash_on_delivery' || job.rawOrder?.paymentMethod === 'cash_on_delivery') && !job.rawOrder?.is_paid && job.rawOrder?.payment_status !== 'paid') && (
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setCodModalJob(job);
                                                                setCodAmount(String(job.rawOrder?.total_price || ''));
                                                                setCodReceipt('');
                                                                setCodNotes('');
                                                            }}
                                                            className="w-full py-2 px-3 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-xs transition-all cursor-pointer min-w-0"
                                                        >
                                                            <PoundSterling className="w-3.5 h-3.5 shrink-0" />
                                                            <span className="truncate">Collect COD Cash (£{(job.rawOrder?.total_price || 0).toFixed(2)})</span>
                                                        </button>
                                                    )}
                                                </div>

                                                {/* 6. REPORT ISSUE FOOTER LINK */}
                                                <div className="flex justify-center pt-0.5">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setFailedModalJob(job);
                                                            setFailedReason('customer_unavailable');
                                                            setFailedNotes('');
                                                            setFailedPhoto(null);
                                                        }}
                                                        className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-400 hover:text-rose-600 transition-colors cursor-pointer py-0.5 px-2"
                                                    >
                                                        <AlertCircle className="w-3.5 h-3.5 text-gray-400" />
                                                        <span>Report issue</span>
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    )}

                    {/* COMPLETED JOBS (HISTORY) VIEW */}
                    {view === 'history' && (
                        <div className="space-y-4 pb-2">
                            {/* ── Date Filter Bar (7 Circles + Month upside + Calendar) ── */}
                            {renderDateFilterBar()}

                            {/* ── Active Date Count Header ── */}
                            <div className="flex items-center justify-between px-1">
                                <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                                    {completedDateFilter === 'all'
                                        ? `Showing All Completed Jobs (${filteredCompletedJobs.length})`
                                        : `${filteredCompletedJobs.length} Completed ${filteredCompletedJobs.length === 1 ? 'Job' : 'Jobs'} on ${formatDisplayDateHeader(completedDateFilter)}`
                                    }
                                </p>
                                {completedDateFilter !== 'all' && (
                                    <button
                                        onClick={() => setCompletedDateFilter('all')}
                                        className="text-xs font-bold text-[#1877F2] hover:underline"
                                    >
                                        Clear Filter
                                    </button>
                                )}
                            </div>

                            {/* ── Completed Jobs List or Empty State ── */}
                            {filteredCompletedJobs.length === 0 ? (
                                <div className="bg-white rounded-3xl p-8 text-center border border-gray-100 shadow-xs space-y-3">
                                    <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto text-[#1877F2]">
                                        <Calendar className="w-7 h-7" />
                                    </div>
                                    <div>
                                        <p className="font-extrabold text-gray-800 text-base">No completed jobs on this date</p>
                                        <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto">
                                            You have no finished collections or deliveries on {formatDisplayDateHeader(completedDateFilter)}.
                                        </p>
                                    </div>
                                    <div className="pt-2 flex flex-wrap items-center justify-center gap-2">
                                        <button
                                            onClick={() => setCompletedDateFilter('all')}
                                            className="px-4 py-2 bg-[#1877F2] hover:bg-[#1565C0] text-white font-bold rounded-xl text-xs transition-colors shadow-xs"
                                        >
                                            View All Completed ({allCompletedJobs.length})
                                        </button>
                                        {availableCompletedDates.length > 0 && availableCompletedDates[0].date !== completedDateFilter && (
                                            <button
                                                onClick={() => setCompletedDateFilter(availableCompletedDates[0].date)}
                                                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs transition-colors"
                                            >
                                                Jump to {availableCompletedDates[0].label} ({availableCompletedDates[0].count})
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-3.5">
                                    {filteredCompletedJobs.map((order: any) => {
                                        const isBoth = order.completed_action === 'both' || order.is_both;
                                        const isDelivered = order.completed_action === 'delivery' || order.status === 'delivered' || order.is_delivered === true;
                                        const pickupDateStr = order.pickup_completed_at || order.completed_at || order.createdAt;
                                        const dropDateStr = order.delivery_completed_at || order.completed_at || order.delivered_at || order.updated_at;
                                        const bagCount = order.bag_count || order.bagCount || order.qr_tracking?.bagCount || (order.items && order.items.length > 0 ? order.items.reduce((s: number, i: any) => s + (i.quantity || 1), 0) : 1);
                                        const displayCode = order.original_id || order.id || '';
                                        const orderCodeDisplay = displayCode.startsWith('#') ? displayCode : `#${displayCode.replace(/-both|-pickup|-delivery$/, '')}`;

                                        return (
                                            <div
                                                key={order.id || order._id}
                                                onClick={() => setSelectedJob({
                                                    ...(order.rawOrder || order),
                                                    id: order.original_id || order.id,
                                                    orderCode: orderCodeDisplay,
                                                    completed_action: order.completed_action || (isBoth ? 'both' : (isDelivered ? 'delivery' : 'collection')),
                                                    type: order.completed_action || (isBoth ? 'both' : (isDelivered ? 'delivery' : 'collection')),
                                                    is_delivered: isDelivered,
                                                    is_both: isBoth,
                                                    isCompletedJob: true,
                                                    pickup_completed_at: pickupDateStr,
                                                    delivery_completed_at: dropDateStr,
                                                    formattedTimeSlot: isBoth
                                                        ? `Pickup: ${formatTime(pickupDateStr)} • Drop: ${formatTime(dropDateStr)}`
                                                        : `${formatDate(order.completed_at || dropDateStr)} • ${formatTime(order.completed_at || dropDateStr)}`
                                                })}
                                                className={`bg-white rounded-2xl sm:rounded-3xl p-4 shadow-sm hover:shadow-md transition-all cursor-pointer border-l-4 ${isBoth
                                                    ? 'border-[#1877F2]'
                                                    : isDelivered
                                                        ? 'border-[#22C55E]'
                                                        : 'border-sky-500'
                                                    }`}
                                            >
                                                {/* Top Row: Prominent Date Pill & Status Badge */}
                                                <div className="flex items-center justify-between mb-2.5">
                                                    <div className="flex items-center gap-1.5 px-3 py-1 bg-gray-100 rounded-full text-xs font-bold text-gray-700">
                                                        <Calendar className="w-3.5 h-3.5 text-[#1877F2]" />
                                                        <span>{formatDate(isBoth ? dropDateStr : (order.completed_at || pickupDateStr))}</span>
                                                    </div>

                                                    <div className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-extrabold ${isBoth
                                                        ? 'bg-blue-50 text-[#1877F2] border border-blue-100'
                                                        : isDelivered
                                                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                                            : 'bg-sky-50 text-sky-700 border border-sky-100'
                                                        }`}>
                                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                                        <span>
                                                            {isBoth ? 'Pickup & Drop Completed' : isDelivered ? 'Drop Completed' : 'Pickup Completed'}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Order Code & Confidential Privacy Badge */}
                                                <div className="flex items-center justify-between gap-2 mb-2">
                                                    <span className="font-mono text-base font-black text-gray-900 tracking-tight">
                                                        {orderCodeDisplay}
                                                    </span>
                                                    <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2.5 py-0.5 rounded-md uppercase tracking-wider">
                                                        Privacy Protected
                                                    </span>
                                                </div>

                                                {/* Timestamps Info Card */}
                                                <div className="bg-gray-50 rounded-xl p-2.5 space-y-1.5 mb-3 border border-gray-100">
                                                    {isBoth ? (
                                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                                            <div className="flex items-center gap-1.5">
                                                                <div className="w-2 h-2 rounded-full bg-[#1877F2] shrink-0" />
                                                                <span className="text-gray-500 font-medium truncate">Pickup:</span>
                                                                <span className="font-bold text-gray-800 shrink-0">{formatTime(pickupDateStr)}</span>
                                                            </div>
                                                            <div className="flex items-center gap-1.5">
                                                                <div className="w-2 h-2 rounded-full bg-emerald-600 shrink-0" />
                                                                <span className="text-gray-500 font-medium truncate">Drop:</span>
                                                                <span className="font-bold text-gray-800 shrink-0">{formatTime(dropDateStr)}</span>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center justify-between text-xs">
                                                            <span className="text-gray-500 font-medium">
                                                                {isDelivered ? 'Delivered Time:' : 'Collected Time:'}
                                                            </span>
                                                            <span className="font-bold text-gray-800">{formatTime(order.completed_at || dropDateStr)}</span>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Footer: Verified & Bags Summary */}
                                                <div className="pt-2.5 border-t border-gray-100 flex items-center justify-between text-xs">
                                                    <div className="flex items-center gap-1.5">
                                                        <ShieldCheck className="w-4 h-4 text-emerald-600" />
                                                        <span className="font-semibold text-gray-700">
                                                            Verified <span className="text-emerald-700 font-bold">On-Site</span>
                                                        </span>
                                                    </div>

                                                    <div className="flex items-center gap-2.5">
                                                        <div className="flex items-center gap-1 text-gray-600 font-medium">
                                                            <ShoppingBag className="w-3.5 h-3.5 text-gray-400" />
                                                            <span>{bagCount} {bagCount === 1 ? 'bag' : 'bags'}</span>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setSelectedJob({
                                                                    ...(order.rawOrder || order),
                                                                    id: order.original_id || order.id,
                                                                    orderCode: orderCodeDisplay,
                                                                    completed_action: order.completed_action || (isBoth ? 'both' : (isDelivered ? 'delivery' : 'collection')),
                                                                    type: order.completed_action || (isBoth ? 'both' : (isDelivered ? 'delivery' : 'collection')),
                                                                    is_delivered: isDelivered,
                                                                    is_both: isBoth,
                                                                    isCompletedJob: true,
                                                                    pickup_completed_at: pickupDateStr,
                                                                    delivery_completed_at: dropDateStr,
                                                                    formattedTimeSlot: isBoth
                                                                        ? `Pickup: ${formatTime(pickupDateStr)} • Drop: ${formatTime(dropDateStr)}`
                                                                        : `${formatDate(order.completed_at || dropDateStr)} • ${formatTime(order.completed_at || dropDateStr)}`
                                                                });
                                                                setQrModalOpen(true);
                                                            }}
                                                            className="px-2.5 py-1 bg-gradient-to-r from-[#03045E] to-[#0077B6] hover:from-[#023E8A] hover:to-[#0096C7] active:scale-95 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all shadow-xs cursor-pointer"
                                                            title="Display QR"
                                                        >
                                                            <QrCode className="w-3 h-3 text-cyan-300" />
                                                            <span>Display QR</span>
                                                        </button>
                                                        <div className="flex items-center gap-0.5 text-[#1877F2] font-bold">
                                                            <span>Details</span>
                                                            <ChevronRight className="w-3.5 h-3.5" />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Verification & PIN Modal (Step 1: Verification Image, Step 2: PIN) ── */}
            {otpOrderId && (() => {
                const activeJobItem = combinedJobs.find(j => j.id === otpOrderId);
                const activeRaw = assigned.find(o => o.id === otpOrderId) || activeJobItem?.rawOrder;
                const isDeliveryOtp = activeRaw?.status === 'out_for_delivery' || activeJobItem?.type === 'delivery';
                const isLeaveAtDoor = isDeliveryOtp && (activeJobItem?.deliveryInstructionType === 'LEAVE_AT_DOOR' || activeRaw?.deliveryInstructionType === 'LEAVE_AT_DOOR');
                const otpReqLen = isDeliveryOtp ? 4 : 6;

                return (
                    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
                        <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-gray-100 max-h-[85vh] sm:max-h-[90vh] flex flex-col overflow-hidden my-auto animate-in zoom-in-95 duration-200">
                            {/* Modal Header & Step Indicator */}
                            <div className="p-4 sm:p-5 flex items-center justify-between border-b border-gray-100 shrink-0">
                                <div className="flex items-center gap-2">
                                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black transition-colors ${verificationStep === 'photo' ? 'bg-[#03045E] text-white' : 'bg-emerald-600 text-white'
                                        }`}>
                                        {verificationPhoto ? '✓' : '1'}
                                    </span>
                                    <span className={`text-xs font-bold ${verificationStep === 'photo' ? 'text-[#03045E]' : 'text-gray-500'}`}>
                                        Photo Proof
                                    </span>
                                    <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
                                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black transition-colors ${verificationStep === 'pin' ? 'bg-[#03045E] text-white' : 'bg-gray-100 text-gray-400'
                                        }`}>
                                        2
                                    </span>
                                    <span className={`text-xs font-bold ${verificationStep === 'pin' ? 'text-[#03045E]' : 'text-gray-400'}`}>
                                        PIN Entry
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleCloseVerification}
                                    className="p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Scrollable Body Content */}
                            <div className="p-4 sm:p-6 space-y-5 overflow-y-auto flex-1 min-h-0">

                            {/* Hidden Camera/File Input with Mobile Camera Capture */}
                            <input
                                type="file"
                                ref={photoFileInputRef}
                                accept="image/*"
                                capture="environment"
                                onChange={handlePhotoFileChange}
                                className="hidden"
                            />

                            {/* STEP 1: PHOTO VERIFICATION PROOF */}
                            {verificationStep === 'photo' && (
                                <div className="space-y-4">
                                    <div className="text-center space-y-1.5">
                                        <div className="w-14 h-14 bg-blue-50 text-[#0077B6] rounded-full flex items-center justify-center mx-auto shadow-inner">
                                            <Camera className="w-7 h-7" />
                                        </div>
                                        <h3 className="font-extrabold text-[#03045E] text-lg sm:text-xl">
                                            {isDeliveryOtp ? 'Add Delivery Verification Photo' : 'Add Pickup Verification Photo'}
                                        </h3>
                                        <p className="text-xs text-gray-500 leading-relaxed px-2">
                                            {isDeliveryOtp
                                                ? 'Take a photo of the handed-over package at the customer door before entering the PIN.'
                                                : 'Take a photo of the laundry bag at customer collection before entering the PIN.'}
                                        </p>
                                    </div>

                                    {/* Photo Card Preview / Capture Box */}
                                    {verificationPhoto ? (
                                        <div className="relative rounded-2xl overflow-hidden border-2 border-emerald-500 shadow-sm bg-black group">
                                            <img
                                                src={verificationPhoto}
                                                alt="Verification Proof Preview"
                                                className="w-full h-56 object-cover"
                                            />
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-between p-3.5">
                                                <div className="flex items-center justify-between">
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-emerald-600 text-white shadow-xs">
                                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                                        Photo Captured
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => setVerificationPhoto(null)}
                                                        className="p-1.5 rounded-full bg-black/60 text-white hover:bg-red-600 transition-colors cursor-pointer"
                                                        title="Remove photo"
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                </div>
                                                <div className="flex items-center justify-between text-white">
                                                    <span className="text-[10px] text-gray-200">
                                                        Stored under order evidence
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => photoFileInputRef.current?.click()}
                                                        className="px-3 py-1 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur-xs text-xs font-bold text-white transition-all flex items-center gap-1 cursor-pointer"
                                                    >
                                                        <Camera className="w-3.5 h-3.5" /> Retake
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div
                                            onClick={() => !photoCompressing && photoFileInputRef.current?.click()}
                                            className={`w-full h-48 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center p-4 text-center cursor-pointer transition-all ${photoCompressing
                                                ? 'border-blue-300 bg-blue-50/50'
                                                : 'border-blue-200 hover:border-[#0077B6] hover:bg-blue-50/40 bg-gray-50/70'
                                                }`}
                                        >
                                            {photoCompressing ? (
                                                <div className="flex flex-col items-center gap-2">
                                                    <Loader2 className="w-8 h-8 text-[#0077B6] animate-spin" />
                                                    <p className="text-xs font-bold text-[#0077B6]">Processing and optimizing photo...</p>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-center gap-2">
                                                    <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-[#0077B6]">
                                                        <Camera className="w-6 h-6" />
                                                    </div>
                                                    <p className="text-xs font-black text-[#03045E]">
                                                        Take Photo / Upload Verification Image
                                                    </p>
                                                    <p className="text-[11px] text-gray-400 max-w-xs">
                                                        Tap here to launch camera or select image. Archived permanently for Manager and Admin inspection.
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Action buttons */}
                                    <div className="space-y-2 pt-2">
                                        {isLeaveAtDoor ? (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={handleConfirmLeaveAtDoor}
                                                    disabled={!verificationPhoto || otpLoading}
                                                    className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-2xl text-sm transition-all flex items-center justify-center gap-2 shadow-md shadow-emerald-950/10 cursor-pointer"
                                                >
                                                    {otpLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                                                    <span>Confirm Leave-at-Door Delivery</span>
                                                </button>
                                                {!verificationPhoto && (
                                                    <p className="text-[11px] text-amber-700 font-bold text-center">
                                                        ⚠️ Photo proof is mandatory before confirming leave-at-door delivery.
                                                    </p>
                                                )}
                                            </>
                                        ) : (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={() => setVerificationStep('pin')}
                                                    className="w-full py-3.5 bg-[#03045E] hover:bg-[#0077B6] text-white font-bold rounded-2xl text-sm transition-all flex items-center justify-center gap-2 shadow-md shadow-blue-950/10 cursor-pointer"
                                                >
                                                    <span>Continue to PIN Verification</span>
                                                    <ArrowRight className="w-4 h-4" />
                                                </button>
                                                {!verificationPhoto && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setVerificationStep('pin')}
                                                        className="w-full py-2 text-xs font-semibold text-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
                                                    >
                                                        Skip photo & proceed to PIN (Optional)
                                                    </button>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* STEP 2: PIN VERIFICATION */}
                            {verificationStep === 'pin' && (
                                <div className="space-y-4">
                                    {/* Attached Photo Pill banner if photo exists */}
                                    {verificationPhoto && (
                                        <div className="flex items-center justify-between p-2.5 bg-emerald-50 border border-emerald-200 rounded-2xl">
                                            <div className="flex items-center gap-2.5">
                                                <img
                                                    src={verificationPhoto}
                                                    alt="Attached verification thumbnail"
                                                    className="w-10 h-10 rounded-xl object-cover border border-emerald-300"
                                                />
                                                <div>
                                                    <p className="text-xs font-bold text-emerald-950 flex items-center gap-1">
                                                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                                                        Verification Photo Attached
                                                    </p>
                                                    <p className="text-[10px] text-emerald-700">Archived in order evidence</p>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setVerificationStep('photo')}
                                                className="text-[11px] font-bold text-emerald-800 hover:text-emerald-950 underline cursor-pointer"
                                            >
                                                Change
                                            </button>
                                        </div>
                                    )}

                                    <div className="text-center space-y-1.5">
                                        <div className="w-14 h-14 bg-blue-50 text-[#0077B6] rounded-full flex items-center justify-center mx-auto shadow-inner">
                                            <KeyRound className="w-7 h-7" />
                                        </div>
                                        <h3 className="font-extrabold text-[#03045E] text-lg sm:text-xl">
                                            {isDeliveryOtp ? 'Enter 4-Digit Delivery PIN' : 'Enter 6-Digit Customer PIN'}
                                        </h3>
                                        <p className="text-xs text-gray-500 px-2">
                                            {isDeliveryOtp
                                                ? 'Ask customer for their 4-digit in-app PIN to complete delivery'
                                                : 'Ask customer for their 6-digit in-app PIN to confirm collection'}
                                        </p>
                                    </div>

                                    <div className="space-y-3">
                                        {!isDeliveryOtp && (
                                            <div className="bg-sky-50 border border-sky-200 rounded-2xl p-3.5 text-left space-y-1.5">
                                                <label className="text-xs font-bold text-sky-950 flex items-center gap-1.5">
                                                    <ShoppingBag className="w-4 h-4 text-sky-700" /> Physical Piece Count Collected
                                                </label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    placeholder={String(activeJobItem?.bagCount || 1)}
                                                    value={pickupPieceCount}
                                                    onChange={(e) => setPickupPieceCount(e.target.value)}
                                                    className="w-full bg-white border border-sky-300 rounded-xl px-3 py-2 text-xs font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
                                                />
                                                <p className="text-[10px] text-sky-700">Enter total garments / laundry bags physically received.</p>
                                            </div>
                                        )}

                                        <PinInput
                                            length={otpReqLen}
                                            value={otpValue}
                                            onChange={(v) => {
                                                setOtpValue(v);
                                                setOtpError(null);
                                            }}
                                            error={Boolean(otpError)}
                                            disabled={otpLoading}
                                            autoFocus={true}
                                            onEnterPress={() => {
                                                if (otpValue.trim().length === otpReqLen && !otpLoading) {
                                                    handleConfirmOtp();
                                                }
                                            }}
                                        />
                                        {otpError && (
                                            <p className="text-xs text-red-600 font-bold text-center flex items-center justify-center gap-1">
                                                <AlertCircle className="w-3.5 h-3.5" /> {otpError}
                                            </p>
                                        )}
                                    </div>

                                    <div className="flex gap-2.5 pt-2">
                                        <button
                                            type="button"
                                            onClick={() => setVerificationStep('photo')}
                                            className="px-4 py-3 bg-gray-100 text-gray-700 font-bold rounded-2xl text-xs hover:bg-gray-200 transition-colors cursor-pointer flex items-center gap-1"
                                        >
                                            <ChevronLeft className="w-4 h-4" /> Photo
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleConfirmOtp}
                                            disabled={otpLoading || otpValue.trim().length !== otpReqLen}
                                            className="flex-1 py-3 bg-[#03045E] text-white font-bold rounded-2xl text-sm hover:bg-[#0077B6] transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shadow-md shadow-blue-950/10 cursor-pointer"
                                        >
                                            {otpLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                                            {isDeliveryOtp ? 'Confirm Delivery' : 'Confirm Collection'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                        </div>
                    </div>
                );
            })()}

            {/* ── Job Details Modal Redesigned ── */}
            {selectedJob && (() => {
                const isCompleted = selectedJob.isCompletedJob || view === 'history';
                const isBoth = selectedJob.completed_action === 'both' || selectedJob.is_both === true;

                const isDeliveryJob =
                    selectedJob.jobType === 'delivery' ||
                    selectedJob.completed_action === 'delivery' ||
                    selectedJob.type === 'delivery' ||
                    selectedJob.is_delivered === true ||
                    ['out_for_delivery', 'delivered'].includes(selectedJob.status);

                const isColl = !isDeliveryJob && !isBoth;
                const isDelivered =
                    selectedJob.status === 'delivered' ||
                    selectedJob.status === 'completed' ||
                    selectedJob.completed_action === 'delivery' ||
                    selectedJob.completed_action === 'both' ||
                    selectedJob.is_delivered === true ||
                    Boolean(selectedJob.delivery_completed_at && (selectedJob.status === 'delivered' || selectedJob.status === 'completed'));
                const rawId = selectedJob.rawOrder?.publicId || selectedJob.publicId || selectedJob.orderCode || selectedJob.order_code || selectedJob.id || '';
                const orderCodeDisplay = rawId ? (rawId.startsWith('#') ? rawId : `#${rawId}`) : '';

                const timeSlotDisplay = selectedJob.formattedTimeSlot || formatJobTimeSlot(selectedJob);
                const contactNameDisplay = selectedJob.contactDetails
                    ? `${selectedJob.contactDetails.firstName || ''} ${selectedJob.contactDetails.lastName || ''}`.trim()
                    : '';
                const customerNameDisplay = (selectedJob.customer_name && selectedJob.customer_name !== 'Valued Customer' && selectedJob.customer_name !== 'Customer')
                    ? selectedJob.customer_name
                    : (selectedJob.customerName && selectedJob.customerName !== 'Valued Customer' && selectedJob.customerName !== 'Customer')
                    ? selectedJob.customerName
                    : contactNameDisplay
                    || selectedJob.user_name
                    || selectedJob.userName
                    || selectedJob.customer?.name
                    || selectedJob.customer?.full_name
                    || (selectedJob.customerEmail ? selectedJob.customerEmail.split('@')[0] : '')
                    || 'Customer';
                const customerPhoneDisplay = selectedJob.customer_phone || selectedJob.customerPhone || selectedJob.contactDetails?.phone || selectedJob.phone || '';
                const addressDisplay = selectedJob.address || selectedJob.fullAddress || `${selectedJob.addressLine1 || ''} ${selectedJob.addressLine2 || ''}`;
                const itemsList = selectedJob.items && selectedJob.items.length > 0
                    ? selectedJob.items
                    : [{ name: 'Assorted Laundry Bag(s)', quantity: selectedJob.bagCount || 1 }];

                const formatCompletedTime = (val: any) => {
                    if (!val) return 'Completed';
                    try {
                        const d = new Date(val);
                        if (isNaN(d.getTime())) return String(val);
                        return d.toLocaleString('en-GB', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true
                        });
                    } catch {
                        return String(val);
                    }
                };

                return (
                    <div
                        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200"
                        onClick={() => setSelectedJob(null)}
                    >
                        <div
                            className="bg-white w-full max-w-lg max-h-[85vh] sm:max-h-[90vh] rounded-3xl shadow-2xl border border-gray-100 relative flex flex-col overflow-hidden my-auto animate-in zoom-in-95 duration-200"
                            onClick={e => e.stopPropagation()}
                        >
                            {/* ── Premium Modal Header with Gradient & Highlighted Order ID ── */}
                            <div className={`p-6 text-white relative overflow-hidden shrink-0 ${isBoth
                                ? 'bg-gradient-to-br from-[#03045E] via-[#023E8A] to-[#047857]'
                                : isColl
                                    ? 'bg-gradient-to-br from-[#03045E] via-[#023E8A] to-[#0077B6]'
                                    : 'bg-gradient-to-br from-[#064E3B] via-[#047857] to-[#059669]'
                                }`}>
                                {/* Background decorative glow */}
                                <div className="absolute top-0 right-0 -mt-8 -mr-8 w-36 h-36 bg-white/10 rounded-full blur-2xl pointer-events-none" />
                                <div className="absolute bottom-0 left-1/3 -mb-10 w-32 h-32 bg-cyan-400/20 rounded-full blur-xl pointer-events-none" />

                                {/* Top Row: Type Pill & Close Button */}
                                <div className="flex items-center justify-between relative z-10 mb-3">
                                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider bg-white/15 backdrop-blur-xs border border-white/20 text-white">
                                        <Truck className="w-3.5 h-3.5" />
                                        <span>
                                            {isBoth
                                                ? 'Pickup & Drop Completed'
                                                : isColl
                                                    ? (isCompleted ? 'Completed Collection' : 'Collection Assignment')
                                                    : (isCompleted ? 'Completed Delivery' : 'Delivery Assignment')}
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedJob(null)}
                                        className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-colors cursor-pointer"
                                        title="Close"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>

                                {/* Highlighted Order ID Banner */}
                                <div className="relative z-10">
                                    <p className="text-[11px] font-bold text-sky-200 uppercase tracking-widest">
                                        Order Identifier
                                    </p>
                                    <div className="flex items-center gap-2.5 mt-1">
                                        <span className="font-mono text-2xl sm:text-3xl font-black text-white tracking-tight">
                                            {orderCodeDisplay}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                navigator.clipboard.writeText(orderCodeDisplay.replace('#', ''));
                                                showToast('Order ID copied to clipboard!');
                                            }}
                                            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors text-xs flex items-center gap-1 font-semibold cursor-pointer"
                                            title="Copy Order ID"
                                        >
                                            <Copy className="w-3.5 h-3.5" />
                                            <span className="text-[11px]">Copy</span>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* ── Modal Content Body ── */}
                            <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
                                {isCompleted ? (
                                    <>
                                        {/* Privacy Notice Banner */}
                                        <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-3.5 flex items-start gap-3 text-amber-900 shadow-xs">
                                            <ShieldCheck className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                                            <div>
                                                <p className="font-extrabold text-[11px] uppercase tracking-wider text-amber-800">
                                                    Privacy Protection Active
                                                </p>
                                                <p className="text-amber-700 text-xs mt-0.5 font-medium leading-relaxed">
                                                    Customer name, phone number, address, and verification photos are protected for completed jobs.
                                                </p>
                                            </div>
                                        </div>

                                        {/* Consolidated Pickup & Drop Info Boxes if isBoth */}
                                        {isBoth ? (
                                            <div className="space-y-3">
                                                {/* Pickup Info Box */}
                                                <div className="bg-gradient-to-r from-blue-50/90 to-sky-50/90 rounded-2xl p-4 border border-blue-200/80 shadow-xs">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-8 h-8 rounded-lg bg-[#1877F2] text-white flex items-center justify-center font-bold">
                                                                <Truck className="w-4 h-4" />
                                                            </div>
                                                            <div>
                                                                <p className="text-[10px] uppercase font-extrabold text-blue-700 tracking-wider">Pickup / Collection Info</p>
                                                                <p className="text-xs font-bold text-gray-900">Handled by You</p>
                                                            </div>
                                                        </div>
                                                        <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-blue-100 text-[#1877F2]">
                                                            Completed
                                                        </span>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-blue-100 text-xs">
                                                        <div>
                                                            <p className="text-[10px] font-extrabold uppercase text-gray-400">Time Slot</p>
                                                            <p className="font-bold text-gray-800 mt-0.5">
                                                                {selectedJob.pickup_slot || selectedJob.pickupTimeSlot || selectedJob.formattedTimeSlot || formatJobTimeSlot(selectedJob)}
                                                            </p>
                                                        </div>
                                                        <div>
                                                            <p className="text-[10px] font-extrabold uppercase text-gray-400">Collected At</p>
                                                            <p className="font-bold text-gray-800 mt-0.5">
                                                                {formatCompletedTime(selectedJob.pickup_completed_at || selectedJob.completed_at)}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Drop Info Box */}
                                                <div className="bg-gradient-to-r from-emerald-50/90 to-teal-50/90 rounded-2xl p-4 border border-emerald-200/80 shadow-xs">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold">
                                                                <CheckCircle2 className="w-4 h-4" />
                                                            </div>
                                                            <div>
                                                                <p className="text-[10px] uppercase font-extrabold text-emerald-800 tracking-wider">Drop / Delivery Info</p>
                                                                <p className="text-xs font-bold text-gray-900">Handled by You</p>
                                                            </div>
                                                        </div>
                                                        <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-800">
                                                            Completed
                                                        </span>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-emerald-100 text-xs">
                                                        <div>
                                                            <p className="text-[10px] font-extrabold uppercase text-gray-400">Time Slot</p>
                                                            <p className="font-bold text-gray-800 mt-0.5">
                                                                {selectedJob.delivery_slot || selectedJob.deliveryTimeSlot || selectedJob.formattedTimeSlot || formatJobTimeSlot(selectedJob)}
                                                            </p>
                                                        </div>
                                                        <div>
                                                            <p className="text-[10px] font-extrabold uppercase text-gray-400">Delivered At</p>
                                                            <p className="font-bold text-gray-800 mt-0.5">
                                                                {formatCompletedTime(selectedJob.delivery_completed_at || selectedJob.completed_at)}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            /* Single Completed Job Info Box */
                                            <div className={`rounded-2xl p-4 border shadow-xs ${isColl
                                                ? 'bg-gradient-to-r from-blue-50/90 to-sky-50/90 border-blue-200'
                                                : 'bg-gradient-to-r from-emerald-50/90 to-teal-50/90 border-emerald-200'
                                                }`}>
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-10 h-10 rounded-xl text-white flex items-center justify-center font-bold ${isColl ? 'bg-[#1877F2]' : 'bg-emerald-600'
                                                            }`}>
                                                            {isColl ? <Truck className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
                                                        </div>
                                                        <div>
                                                            <p className={`text-[10px] font-extrabold uppercase tracking-wider ${isColl ? 'text-blue-600' : 'text-emerald-700'
                                                                }`}>
                                                                {isColl ? 'Collection Details' : 'Delivery Details'}
                                                            </p>
                                                            <p className="text-base font-black text-gray-900 mt-0.5">
                                                                {timeSlotDisplay}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <span className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold ${isColl ? 'bg-blue-100 text-[#1877F2]' : 'bg-emerald-100 text-emerald-800'
                                                        }`}>
                                                        Completed
                                                    </span>
                                                </div>
                                                <div className="mt-3 pt-2.5 border-t border-gray-200/60 text-xs flex justify-between items-center">
                                                    <span className="text-[10px] font-extrabold uppercase text-gray-400">Completion Timestamp</span>
                                                    <span className="font-bold text-gray-900">
                                                        {formatCompletedTime(selectedJob.completed_at || selectedJob.completedAt || selectedJob.pickup_completed_at || selectedJob.delivery_completed_at)}
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        {/* Active Job Actions & Details */}
                                        <div className="grid grid-cols-3 gap-2">
                                            {/* Call Customer */}
                                            {customerPhoneDisplay ? (
                                                <a
                                                    href={`tel:${customerPhoneDisplay}`}
                                                    className="py-2.5 px-2 bg-blue-50 hover:bg-blue-100 text-[#1877F2] font-bold rounded-2xl text-xs flex flex-col items-center justify-center gap-1 border border-blue-100 transition-all text-center"
                                                >
                                                    <Phone className="w-4 h-4" />
                                                    <span>Call Client</span>
                                                </a>
                                            ) : (
                                                <div className="py-2.5 px-2 bg-gray-50 text-gray-400 font-bold rounded-2xl text-xs flex flex-col items-center justify-center gap-1 border border-gray-100 text-center">
                                                    <Phone className="w-4 h-4" />
                                                    <span>No Phone</span>
                                                </div>
                                            )}

                                            {/* Open in Maps */}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const q = encodeURIComponent(addressDisplay);
                                                    window.open(`https://www.google.com/maps/search/?api=1&query=${q}`, '_blank');
                                                }}
                                                className="py-2.5 px-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold rounded-2xl text-xs flex flex-col items-center justify-center gap-1 border border-emerald-100 transition-all text-center cursor-pointer"
                                            >
                                                <Navigation className="w-4 h-4" />
                                                <span>Navigate</span>
                                            </button>

                                            {/* Verify PIN */}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    handleOpenVerification(selectedJob.id);
                                                    setSelectedJob(null);
                                                }}
                                                className="py-2.5 px-2 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold rounded-2xl text-xs flex flex-col items-center justify-center gap-1 border border-amber-100 transition-all text-center cursor-pointer"
                                            >
                                                <Camera className="w-4 h-4" />
                                                <span>Verify & PIN</span>
                                            </button>
                                        </div>

                                        {/* Time Slot Window Card */}
                                        <div className="bg-gradient-to-r from-blue-50/80 to-indigo-50/80 rounded-2xl p-4 border border-blue-100/80 flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-[#1877F2] text-white flex items-center justify-center shadow-sm">
                                                    <Clock className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <p className="text-[10px] font-extrabold uppercase tracking-wider text-blue-600">
                                                        Time Slot (Start – End)
                                                    </p>
                                                    <p className="text-base font-black text-gray-900 mt-0.5">
                                                        {timeSlotDisplay}
                                                    </p>
                                                </div>
                                            </div>
                                            <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-blue-100 text-[#1877F2]">
                                                {selectedJob.pickupDate || selectedJob.deliveryDate || 'Today'}
                                            </span>
                                        </div>

                                        {/* Customer & Contact Card */}
                                        <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 space-y-3">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-xl bg-gray-200 flex items-center justify-center text-gray-700 font-black text-sm">
                                                        {customerNameDisplay.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] uppercase font-bold text-gray-400">Customer</p>
                                                        <p className="font-extrabold text-gray-900 text-sm">{customerNameDisplay}</p>
                                                    </div>
                                                </div>
                                                {customerPhoneDisplay && (
                                                    <a
                                                        href={`tel:${customerPhoneDisplay}`}
                                                        className="text-xs font-bold text-[#1877F2] hover:underline flex items-center gap-1"
                                                    >
                                                        <Phone className="w-3.5 h-3.5" />
                                                        <span>{customerPhoneDisplay}</span>
                                                    </a>
                                                )}
                                            </div>
                                        </div>

                                        {/* Address Card */}
                                        {/* Address Card */}
                                        <div
                                            className={`
        rounded-2xl
        p-4
        border
        bg-gray-50
        transition-all
        duration-200
        ${isColl
                                                    ? "border-sky-100 hover:border-sky-200 hover:bg-sky-50/40"
                                                    : "border-emerald-100 hover:border-emerald-200 hover:bg-emerald-50/40"
                                                }
    `}
                                        >
                                            {/* Header */}
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="flex items-center gap-2.5">
                                                    <div
                                                        className={`
                    flex items-center justify-center
                    w-8 h-8
                    rounded-xl
                    ${isColl
                                                                ? "bg-sky-100 text-sky-600"
                                                                : "bg-emerald-100 text-emerald-600"
                                                            }
                `}
                                                    >
                                                        <MapPin className="w-4 h-4" />
                                                    </div>

                                                    <div>
                                                        <p className="text-[10px] uppercase tracking-wide font-bold text-gray-400">
                                                            Destination Address
                                                        </p>
                                                        <p className="text-xs font-semibold text-gray-500">
                                                            Tap address to open Maps
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* External link indicator */}
                                                <span
                                                    className={`
                text-[11px] font-semibold
                ${isColl
                                                            ? "text-sky-600"
                                                            : "text-emerald-600"
                                                        }
            `}
                                                >
                                                    Maps ↗
                                                </span>
                                            </div>

                                            {/* Clickable Address */}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const q = encodeURIComponent(addressDisplay);

                                                    window.open(
                                                        `https://www.google.com/maps/search/?api=1&query=${q}`,
                                                        "_blank",
                                                        "noopener,noreferrer"
                                                    );
                                                }}
                                                className="
            group
            w-full
            text-left
            bg-white
            rounded-xl
            border border-gray-200
            px-3.5 py-3
            transition-all
            duration-200
            hover:border-blue-300
            hover:shadow-sm
            focus:outline-none
            focus:ring-2
            focus:ring-blue-200
            active:scale-[0.99]
        "
                                                title="Open address in Google Maps"
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <p className="
                text-sm
                font-semibold
                leading-5
                text-gray-800
                group-hover:text-[#1877F2]
                transition-colors
                duration-200
                break-words
            ">
                                                        {addressDisplay}
                                                    </p>

                                                    <svg
                                                        className="
                    w-4 h-4
                    shrink-0
                    mt-0.5
                    text-gray-400
                    group-hover:text-[#1877F2]
                    transition-colors
                "
                                                        viewBox="0 0 24 24"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        strokeWidth="2"
                                                    >
                                                        <path d="M7 17L17 7" />
                                                        <path d="M7 7h10v10" />
                                                    </svg>
                                                </div>
                                            </button>
                                        </div>
                                    </>
                                )}

                                {/* Garments Checklist (Visible for both active & completed) */}
                                {itemsList && itemsList.length > 0 && (
                                    <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                                        <div className="flex items-center justify-between mb-2.5">
                                            <div className="flex items-center gap-1.5">
                                                <ShoppingBag className="w-4 h-4 text-gray-600" />
                                                <p className="text-[11px] uppercase font-extrabold text-gray-600">Garments & Bags</p>
                                            </div>
                                            <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-white border border-gray-200 text-gray-700">
                                                {selectedJob.bagCount || itemsList.length} bag(s)
                                            </span>
                                        </div>
                                        <div className="divide-y divide-gray-200/60">
                                            {itemsList.map((item: any, idx: number) => (
                                                <div key={idx} className="py-1.5 flex justify-between items-center text-xs">
                                                    <span className="text-gray-800 font-medium">{item.name}</span>
                                                    <span className="font-bold text-gray-900 bg-white px-2 py-0.5 rounded border border-gray-200">
                                                        x{item.quantity}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Operational Evidence Photos for ACTIVE jobs only */}
                                {!isCompleted && (() => {
                                    const jobPhotos: string[] = (
                                        selectedJob.qr_tracking?.collectionPhotos ||
                                        selectedJob.qr_tracking?.deliveryPhotoUrls ||
                                        selectedJob.rawOrder?.qr_tracking?.collectionPhotos ||
                                        selectedJob.rawOrder?.qr_tracking?.deliveryPhotoUrls ||
                                        selectedJob.rawOrder?.evidence?.pickupPhotos ||
                                        selectedJob.rawOrder?.evidence?.deliveryPhotos ||
                                        (selectedJob.rawOrder?.evidence?.pickupPhotoUrl ? [selectedJob.rawOrder?.evidence?.pickupPhotoUrl] : []) ||
                                        (selectedJob.rawOrder?.evidence?.deliveryPhotoUrl ? [selectedJob.rawOrder?.evidence?.deliveryPhotoUrl] : []) ||
                                        []
                                    ).filter(Boolean);

                                    if (jobPhotos.length === 0) return null;

                                    return (
                                        <div className="bg-blue-50/60 rounded-2xl p-4 border border-blue-100 space-y-2.5">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-1.5">
                                                    <Camera className="w-4 h-4 text-[#0077B6]" />
                                                    <p className="text-[11px] uppercase font-extrabold text-[#03045E]">
                                                        Verification Evidence Photo
                                                    </p>
                                                </div>
                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800">
                                                    Verified On-Site
                                                </span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                {jobPhotos.map((photoUrl, pIdx) => (
                                                    <div key={pIdx} className="relative rounded-xl overflow-hidden border border-blue-200 aspect-video bg-black">
                                                        <img
                                                            src={photoUrl}
                                                            alt={`Evidence ${pIdx + 1}`}
                                                            className="w-full h-full object-cover"
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* Primary Action Buttons */}
                                {!isCompleted ? (
                                    <div className="pt-2 space-y-2">
                                        <div className="grid grid-cols-2 gap-2">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const j = combinedJobs.find(x => x.id === selectedJob.id) || selectedJob;
                                                    setFailedModalJob(j);
                                                    setFailedReason('customer_unavailable');
                                                    setFailedNotes('');
                                                    setFailedPhoto(null);
                                                    setSelectedJob(null);
                                                }}
                                                className="py-3 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-2xl text-xs flex items-center justify-center gap-1.5 border border-rose-200 cursor-pointer"
                                            >
                                                <AlertCircle className="w-4 h-4 text-rose-600" />
                                                Report Failed
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const id = selectedJob.id;
                                                    setSelectedJob(null);
                                                    handleOpenVerification(id);
                                                }}
                                                className="py-3 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl text-xs flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                                            >
                                                <Camera className="w-4 h-4" />
                                                Verify & Complete
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="pt-2">
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setQrModalOpen(true);
                                            }}
                                            className="w-full py-3.5 bg-gradient-to-r from-[#03045E] to-[#0077B6] hover:from-[#023E8A] hover:to-[#0096C7] text-white font-bold rounded-2xl text-sm transition-all flex items-center justify-center gap-2 shadow-md shadow-blue-900/10 cursor-pointer"
                                        >
                                            <QrCode className="w-4 h-4 text-cyan-300" />
                                            <span>Display QR Code</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })()}

            <GenerateQRModal
                isOpen={qrModalOpen}
                onClose={() => setQrModalOpen(false)}
                order={selectedJob}
            />

            {/* ── Failed Attempt Modal ── */}
            {failedModalJob && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
                    <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-gray-100 max-h-[85vh] sm:max-h-[90vh] flex flex-col overflow-hidden my-auto animate-in fade-in zoom-in-95">
                        <div className="p-4 sm:p-5 flex items-center justify-between border-b border-gray-100 shrink-0">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-rose-50 flex items-center justify-center text-rose-600">
                                    <AlertCircle className="w-4 h-4" />
                                </div>
                                <div>
                                    <h3 className="font-extrabold text-gray-900 text-sm">
                                        Report {failedModalJob.type === 'collection' ? 'Pickup' : 'Delivery'} Failure
                                    </h3>
                                    <p className="text-[11px] text-gray-500">Order #{failedModalJob.orderCode || failedModalJob.id}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setFailedModalJob(null)}
                                className="p-1 rounded-full text-gray-400 hover:text-gray-600 cursor-pointer"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-4 sm:p-5 space-y-3 overflow-y-auto flex-1 min-h-0">
                            <div>
                                <label className="text-xs font-bold text-gray-700 block mb-1">Reason</label>
                                <select
                                    value={failedReason}
                                    onChange={(e) => setFailedReason(e.target.value)}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
                                >
                                    <option value="customer_unavailable">Customer Unavailable / Unreachable</option>
                                    <option value="wrong_address">Wrong Address / Cannot Locate</option>
                                    <option value="gate_locked">Building / Gate Locked</option>
                                    <option value="customer_cancelled">Customer Cancelled on Arrival</option>
                                    <option value="business_closed">Business Closed</option>
                                    <option value="other">Other Issue</option>
                                </select>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-gray-700 block mb-1">Notes / Explanation</label>
                                <textarea
                                    rows={2}
                                    placeholder="Add details (e.g. rang bell 3 times, called phone, no answer)..."
                                    value={failedNotes}
                                    onChange={(e) => setFailedNotes(e.target.value)}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
                                />
                            </div>

                            <div>
                                <label className="text-xs font-bold text-gray-700 block mb-1">Photo Evidence (Mandatory)</label>
                                <input
                                    type="file"
                                    ref={photoFailFileInputRef}
                                    accept="image/*"
                                    capture="environment"
                                    onChange={handleFailPhotoChange}
                                    className="hidden"
                                />
                                {failedPhoto ? (
                                    <div className="relative rounded-xl overflow-hidden border border-emerald-400 aspect-video bg-black">
                                        <img src={failedPhoto} alt="Failure proof" className="w-full h-full object-cover" />
                                        <button
                                            type="button"
                                            onClick={() => setFailedPhoto(null)}
                                            className="absolute top-2 right-2 p-1 rounded-full bg-black/60 text-white hover:bg-rose-600 cursor-pointer"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => photoFailFileInputRef.current?.click()}
                                        className="w-full py-4 border-2 border-dashed border-rose-200 bg-rose-50/50 hover:bg-rose-50 rounded-xl flex flex-col items-center justify-center text-xs font-bold text-rose-700 gap-1.5 transition-colors cursor-pointer"
                                    >
                                        <Camera className="w-5 h-5 text-rose-600" />
                                        Take Photo of Closed Gate / Location
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="p-4 sm:p-5 border-t border-gray-100 flex gap-2 shrink-0">
                            <button
                                type="button"
                                onClick={() => setFailedModalJob(null)}
                                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleSubmitFailure}
                                disabled={failedLoading}
                                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                            >
                                {failedLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertCircle className="w-4 h-4" />}
                                Submit Failure
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── COD Collection Modal ── */}
            {codModalJob && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
                    <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-gray-100 max-h-[85vh] sm:max-h-[90vh] flex flex-col overflow-hidden my-auto animate-in fade-in zoom-in-95">
                        <div className="p-4 sm:p-5 flex items-center justify-between border-b border-gray-100 shrink-0">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center text-amber-600">
                                    <PoundSterling className="w-4 h-4" />
                                </div>
                                <div>
                                    <h3 className="font-extrabold text-gray-900 text-sm">
                                        Cash on Delivery Collection
                                    </h3>
                                    <p className="text-[11px] text-gray-500">Order #{codModalJob.orderCode || codModalJob.id}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setCodModalJob(null)}
                                className="p-1 rounded-full text-gray-400 hover:text-gray-600 cursor-pointer"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 min-h-0">

                        <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-3.5 space-y-1">
                            <p className="text-[11px] font-bold text-amber-800 uppercase tracking-wide">Expected Total Due</p>
                            <p className="text-2xl font-black text-amber-950">£{(codModalJob.rawOrder?.total_price || 0).toFixed(2)}</p>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <label className="text-xs font-bold text-gray-700 block mb-1">Amount Collected (£)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    placeholder="0.00"
                                    value={codAmount}
                                    onChange={(e) => setCodAmount(e.target.value)}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                                />
                                {parseFloat(codAmount || '0') < (codModalJob.rawOrder?.total_price || 0) && (
                                    <p className="text-[11px] text-amber-700 font-semibold mt-1">
                                        ⚠️ Underpayment detected: An operational discrepancy exception will be logged for manager review.
                                    </p>
                                )}
                            </div>

                            <div>
                                <label className="text-xs font-bold text-gray-700 block mb-1">Receipt / Card Ref (Optional)</label>
                                <input
                                    type="text"
                                    placeholder="e.g. Card slip #1042 or Cash"
                                    value={codReceipt}
                                    onChange={(e) => setCodReceipt(e.target.value)}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                                />
                            </div>

                            <div>
                                <label className="text-xs font-bold text-gray-700 block mb-1">Notes</label>
                                <textarea
                                    rows={2}
                                    placeholder="Notes on payment (e.g. exact cash received, tip included, etc.)..."
                                    value={codNotes}
                                    onChange={(e) => setCodNotes(e.target.value)}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                                />
                            </div>
                        </div>

                        </div>

                        <div className="p-4 sm:p-5 border-t border-gray-100 flex gap-2 shrink-0">
                            <button
                                type="button"
                                onClick={() => setCodModalJob(null)}
                                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmCod}
                                disabled={codLoading}
                                className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                            >
                                {codLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Banknote className="w-4 h-4" />}
                                Confirm COD
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Notification Modal ── */}
            {notificationsOpen && (
                <div
                    className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
                    onClick={() => setNotificationsOpen(false)}
                >
                    <div
                        className="bg-white w-full max-w-sm rounded-3xl p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-[#1877F2]">
                                    <Bell className="w-4 h-4" />
                                </div>
                                <h3 className="font-extrabold text-gray-900 text-sm">Notifications</h3>
                            </div>
                            <button onClick={() => setNotificationsOpen(false)} className="p-1 rounded-full text-gray-400 hover:text-gray-600">
                                <XCircle className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="space-y-3">
                            <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-2xl">
                                <p className="text-xs font-bold text-[#1877F2]">Route Assigned</p>
                                <p className="text-xs text-gray-600 mt-0.5">5 jobs assigned for today in Kensington & Chelsea area.</p>
                                <span className="text-[10px] text-gray-400 mt-1 block">10 mins ago</span>
                            </div>
                            <div className="p-3 bg-emerald-50/70 border border-emerald-100 rounded-2xl">
                                <p className="text-xs font-bold text-emerald-700">Earnings Credited</p>
                                <p className="text-xs text-gray-600 mt-0.5">Your shift bonus of £15.00 has been added to your balance.</p>
                                <span className="text-[10px] text-gray-400 mt-1 block">1 hour ago</span>
                            </div>
                        </div>
                        <button
                            onClick={() => setNotificationsOpen(false)}
                            className="w-full py-2.5 bg-[#1877F2] text-white rounded-xl font-bold text-xs hover:bg-[#1565C0] transition-colors"
                        >
                            Dismiss
                        </button>
                    </div>
                </div>
            )}

            {/* ── 5-Tab Bottom Navigation Bar (Matching Reference Screenshot) ── */}
            <div className="sticky bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-40 px-3 pt-2.5 pb-2 shadow-[0_-8px_30px_rgba(0,0,0,0.06)] backdrop-blur-md">
                <div className="flex items-center justify-between">
                    {[
                        { id: 'dashboard' as DriverView, label: 'Dashboard', icon: LayoutGrid },
                        { id: 'assignments' as DriverView, label: 'My Jobs', icon: ClipboardList },
                        { id: 'history' as DriverView, label: 'Completed', icon: CheckCircle2 },
                        { id: 'earnings' as DriverView, label: 'Earnings', icon: BarChart2 },
                        { id: 'settings' as DriverView, label: 'Profile', icon: User },
                    ].map(({ id, label, icon: Icon }) => {
                        const isActive = view === id;
                        return (
                            <button
                                key={id}
                                onClick={() => setView(id)}
                                className="flex flex-col items-center justify-center flex-1 py-1.5 px-1 transition-all group cursor-pointer"
                            >
                                <div className={`p-1.5 rounded-2xl transition-all duration-200 flex items-center justify-center ${isActive
                                    ? 'bg-[#1877F2]/15 backdrop-blur-md border border-[#1877F2]/25 shadow-xs scale-105'
                                    : 'bg-transparent group-hover:bg-gray-100/50'
                                    }`}>
                                    <Icon className={`w-5 h-5 transition-all duration-200 ${isActive
                                        ? 'fill-current text-[#1877F2]'
                                        : 'fill-none text-gray-400 group-hover:text-gray-600'
                                        }`} />
                                </div>
                                <span className={`text-[10px] mt-1 tracking-tight ${isActive ? 'text-[#1877F2] font-bold' : 'text-gray-400 font-medium'
                                    }`}>
                                    {label}
                                </span>
                            </button>
                        );
                    })}
                </div>
                {/* iOS Home Indicator Bar */}
                <div className="w-28 h-1 bg-gray-900/80 rounded-full mx-auto mt-2 mb-0.5"></div>
            </div>
        </div>
    );
};
