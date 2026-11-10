import React, { useState, useEffect } from 'react';
import {
  Package, Clock, CheckCircle2, Phone, MapPin, Calendar, FileText,
  ChevronRight, ChevronDown, RefreshCw, ShoppingBag, Truck, AlertTriangle, Search,
  Check, Navigation, X, ChevronLeft, Filter,
  Star, Headphones, ShieldCheck, Key, Droplets, QrCode, Building2,
  Sparkles, CheckCheck, XCircle, Shirt, CreditCard
} from 'lucide-react';
import { Order, OrderStatus } from '@laundelle/types';
import { dbCancelOrder, getStoredSession, apiFetch } from '@laundelle/api-client';
import { OrderRatingModal } from './OrderRatingModal';

export interface JourneyStage {
  id: string;
  stepNumber: number;
  title: string;
  shortTitle?: string;
  requirement: string;
  description: string;
  status: 'completed' | 'in_progress' | 'upcoming';
  timestamp: string | null;
  icon: React.ElementType;
  metaBadge?: string;
}

export const formatTimelineDate = (isoString?: string | null) => {
  if (!isoString) return null;
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return null;
  }
};

export const formatCompactTimelineDate = (isoString?: string | null) => {
  if (!isoString) return null;
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleString('en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return null;
  }
};

export const canReschedulePickup = (order: Order): boolean => {
  if (!order) return false;
  const status = order.status || '';
  if (['cancelled', 'delivered', 'completed'].includes(status) || (order as any).isCancelled) {
    return false;
  }

  // Clothes must not have been picked up yet
  const hasMovedPastPickup = [
    'laundry_collected', 'received_at_facility', 'sorting', 'washing', 'in_wash', 'drying',
    'ironing', 'folding', 'quality_check', 'qc_ready', 'ready_for_delivery',
    'delivery_driver_assigned', 'package_collected_for_delivery', 'out_for_delivery',
    'delivered', 'completed'
  ].includes(status) || Boolean(order.pickup_pin_verified_at || (order as any).pickup_otp_verified_at);

  if (hasMovedPastPickup) return false;

  // Pickup can be rescheduled only up to 1 hour before scheduled pickup time
  try {
    const now = new Date();
    if (order.pickupDate) {
      const slotStart = (order.pickupSlot || (order as any).pickupTime || '10:00 AM').split(/[-–]/)[0].trim();
      const dateObj = new Date(order.pickupDate);
      if (!isNaN(dateObj.getTime())) {
        const timeMatch = slotStart.match(/(\d+):?(\d*)\s*(AM|PM)?/i);
        if (timeMatch) {
          let hours = parseInt(timeMatch[1], 10);
          const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
          const meridian = timeMatch[3]?.toUpperCase();
          if (meridian === 'PM' && hours < 12) hours += 12;
          if (meridian === 'AM' && hours === 12) hours = 0;
          dateObj.setHours(hours, minutes, 0, 0);

          const diffMs = dateObj.getTime() - now.getTime();
          // If within 1 hour before pickup time or already passed today
          if (diffMs > 0 && diffMs < 60 * 60 * 1000) return false;
          if (diffMs <= 0 && dateObj.toDateString() === now.toDateString()) return false;
        }
      }
    }
  } catch {}

  return true;
};

export const canRescheduleDelivery = (order: Order): boolean => {
  if (!order) return false;
  const status = order.status || '';
  if (['cancelled', 'delivered', 'completed'].includes(status) || (order as any).isCancelled) {
    return false;
  }

  // Delivery: Can be rescheduled only before the items are out for delivery
  const isOutOrDelivered = [
    'out_for_delivery', 'delivery_in_progress', 'delivered', 'completed'
  ].includes(status) || Boolean(order.delivered_at || order.delivery_pin_verified_at || (order as any).delivery_otp_verified_at);

  return !isOutOrDelivered;
};

export const getActiveCourier = (order: Order) => {
  if (!order) return null;
  const status = order.status || '';

  // 1. If delivered, completed, or cancelled: hide driver contact completely
  if (['delivered', 'completed', 'cancelled'].includes(status) || (order as any).isCancelled) {
    return null;
  }

  // 2. If in plant processing phase (between plant arrival and before delivery driver assignment): hide driver contact completely
  const isPlantOrProcessing = [
    'received_at_facility', 'sorting', 'washing', 'in_wash', 'drying',
    'ironing', 'folding', 'quality_check', 'qc_ready', 'ready_for_delivery', 'waiting_for_driver'
  ].includes(status);

  // Also check if plant intake is already registered
  const hasPlantIntake = Boolean(
    (order as any).intake?.intakeAt ||
    (order as any).package?.attached_at
  );

  if (isPlantOrProcessing || (status === 'laundry_collected' && hasPlantIntake)) {
    return null;
  }

  // 3. Delivery phase: when processing is completed and delivery driver is assigned
  const isDeliveryPhase = [
    'delivery_driver_assigned', 'delivery_driver_accepted', 'package_collected_for_delivery',
    'out_for_delivery', 'delivery_in_progress'
  ].includes(status);

  if (isDeliveryPhase) {
    const deliveryDriver = (order as any).deliveryDriver || order.driver;
    const name = deliveryDriver?.name || (order as any).delivery_driver_name || deliveryDriver?.full_name || 'Delivery Driver';
    const phone = deliveryDriver?.phone || (order as any).delivery_driver_phone;
    const vehicle = deliveryDriver?.vehicle || 'Delivery Vehicle';
    const rating = deliveryDriver?.rating || 4.9;

    return {
      type: 'delivery' as const,
      roleLabel: 'Delivery Driver',
      name,
      phone,
      vehicle,
      rating,
    };
  }

  // 4. Pickup phase: after order placement, once pickup driver is assigned
  const isPickupPhase = [
    'order_placed', 'booking_confirmed', 'collection_scheduled', 'driver_assigned', 'pickup_in_progress'
  ].includes(status);

  if (isPickupPhase) {
    const pickupDriver = (order as any).pickupDriver || order.driver;
    const driverId = (order as any).assigned_driver_id || pickupDriver?.id;
    if (pickupDriver || driverId || (order as any).driver_name) {
      const name = pickupDriver?.name || (order as any).driver_name || 'Pickup Driver';
      const phone = pickupDriver?.phone || (order as any).driver_phone;
      const vehicle = pickupDriver?.vehicle || 'Pickup Vehicle';
      const rating = pickupDriver?.rating || 4.9;

      return {
        type: 'pickup' as const,
        roleLabel: 'Pickup Driver',
        name,
        phone,
        vehicle,
        rating,
      };
    }
  }

  return null;
};

export const computeOrderJourney = (order: Order) => {
  const events = order.timeline_events || [];
  const status = order.status || '';

  const findEventTime = (eventNames: string[]) => {
    const found = events.find((e: any) => eventNames.includes(e.event));
    return found?.timestamp || null;
  };

  // 1. Booking Confirmed: Customer placed order and payment was successfully completed
  const isCancelled = status === 'cancelled' || (order as any).isCancelled === true;
  const isPendingPayment = ['pending_payment', 'payment_failed'].includes(status) || order.paymentStatus === 'Pending' || order.paymentStatus === 'Failed';
  const isPaid = (order.paymentStatus === 'Paid' || order.isPaid === true) && !isPendingPayment && !isCancelled;

  // An order has moved PAST booking confirmation once pickup is scheduled, driver assigned, or further down the pipeline
  const hasMovedPastBooking = isPaid && [
    'collection_scheduled', 'driver_assigned', 'pickup_in_progress',
    'laundry_collected', 'picked_up', 'in_transit_to_plant', 'received_at_facility',
    'sorting', 'washing', 'in_wash', 'drying', 'ironing', 'folding',
    'quality_check', 'qc_ready', 'ready_for_delivery',
    'delivery_driver_assigned', 'package_collected_for_delivery', 'out_for_delivery',
    'delivered', 'completed'
  ].includes(status);

  // Stage 1 is marked completed only once the order advances to collection/driver assignment or beyond AND payment is completed
  const step1Completed = hasMovedPastBooking;
  const step1InProgress = isPaid && !step1Completed && (status === 'booking_confirmed');
  const step1Time = isPaid ? (findEventTime(['booking_confirmed', 'payment_confirmed', 'payment_success', 'order_placed', 'order_created']) || order.createdAt) : null;

  // 2. Order Pickup Completed: Driver picks up the order by verifying the OTP
  const pickupOtpVerified = Boolean(
    order.pickup_pin_verified_at ||
    (order as any).pickup_otp_verified_at ||
    order.qr_tracking?.collectedAt ||
    findEventTime(['laundry_collected', 'pickup_pin_verified_and_collected', 'pickup_completed'])
  );
  const hasMovedPastPickup = [
    'laundry_collected', 'picked_up', 'in_transit_to_plant', 'received_at_facility',
    'sorting', 'washing', 'in_wash', 'drying', 'ironing', 'folding',
    'quality_check', 'qc_ready', 'ready_for_delivery',
    'delivery_driver_assigned', 'package_collected_for_delivery', 'out_for_delivery',
    'delivered', 'completed'
  ].includes(status);

  const step2Completed = step1Completed && (pickupOtpVerified || hasMovedPastPickup);
  const step2InProgress = !step2Completed && [
    'collection_scheduled', 'driver_assigned', 'pickup_in_progress'
  ].includes(status);
  const step2Time = order.pickup_pin_verified_at ||
    (order as any).pickup_otp_verified_at ||
    order.qr_tracking?.collectedAt ||
    findEventTime(['laundry_collected', 'pickup_pin_verified_and_collected', 'pickup_completed']);

  // 3. Received at Plant: Driver submits order to processor and processor takes it by scanning QR
  const plantIntakeDone = Boolean(
    (order as any).intake?.intakeAt ||
    (order as any).package?.attached_at ||
    (order as any).receivedAtFacilityAt ||
    findEventTime(['facility_intake', 'received_at_facility'])
  );
  const hasMovedPastPlant = [
    'sorting', 'washing', 'in_wash', 'drying', 'ironing', 'folding',
    'quality_check', 'qc_ready', 'ready_for_delivery',
    'delivery_driver_assigned', 'package_collected_for_delivery', 'out_for_delivery',
    'delivered', 'completed'
  ].includes(status) || Boolean((order as any).qc?.passed);

  const step3Completed = step2Completed && (plantIntakeDone || hasMovedPastPlant);
  const step3InProgress = !step3Completed && step2Completed && (status === 'laundry_collected' || status === 'in_transit_to_plant' || status === 'received_at_facility');
  const step3Time = (order as any).intake?.intakeAt ||
    (order as any).package?.attached_at ||
    (order as any).receivedAtFacilityAt ||
    findEventTime(['facility_intake', 'received_at_facility']);

  // 4. Washing: Processor starts washing the clothes
  const hasMovedPastWashing = [
    'drying', 'ironing', 'folding', 'quality_check', 'qc_ready', 'ready_for_delivery',
    'delivery_driver_assigned', 'package_collected_for_delivery',
    'out_for_delivery', 'delivered', 'completed'
  ].includes(status) || Boolean((order as any).qc?.passed);

  const step4Completed = step3Completed && hasMovedPastWashing;
  const step4InProgress = !step4Completed && step3Completed && ['washing', 'in_wash', 'sorting'].includes(status);
  const step4Time = findEventTime(['washing', 'in_wash']) || (status === 'washing' || status === 'in_wash' ? step3Time : null);

  // 5. Quality Check: Processor is doing the QC tests or order is under QC test
  const qcPassed = Boolean(
    (order as any).qc?.passed === true ||
    findEventTime(['quality_check_passed', 'qc_passed']) ||
    ['ready_for_delivery', 'delivery_driver_assigned', 'package_collected_for_delivery', 'out_for_delivery', 'delivered', 'completed'].includes(status)
  );

  const step5Completed = step4Completed && qcPassed;
  const step5InProgress = !step5Completed && step4Completed && ['quality_check', 'qc_ready'].includes(status);
  const step5Time = (order as any).qc?.checkedAt || findEventTime(['quality_check_passed', 'qc_passed']);

  // 6. Out for Delivery: All QC are passed and order is ready to deliver
  const hasMovedPastOutForDelivery = ['delivered', 'completed'].includes(status) ||
    Boolean(order.delivery_pin_verified_at || (order as any).delivery_otp_verified_at || (order as any).delivered_at || findEventTime(['delivered', 'delivery_confirmed']));

  const isReadyOrDispatched = [
    'ready_for_delivery', 'delivery_driver_assigned', 'package_collected_for_delivery', 'out_for_delivery'
  ].includes(status);

  const step6Completed = step5Completed && hasMovedPastOutForDelivery;
  const step6InProgress = !step6Completed && step5Completed && (status === 'out_for_delivery' || isReadyOrDispatched);
  const step6Time = findEventTime(['out_for_delivery', 'package_collected_for_delivery']) || (order as any).ready_for_delivery_at;

  // 7. Delivered at Doorstep: Delivery boy delivers order successfully after verifying delivery Pin
  const deliveryPinVerified = Boolean(
    status === 'delivered' ||
    status === 'completed' ||
    order.delivery_pin_verified_at ||
    (order as any).delivery_otp_verified_at ||
    (order as any).delivered_at ||
    findEventTime(['delivered', 'delivery_confirmed', 'delivery_pin_verified'])
  );

  const step7Completed = step6Completed && deliveryPinVerified;
  const step7InProgress = !step7Completed && step6InProgress;
  const step7Time = (order as any).delivered_at ||
    order.delivery_pin_verified_at ||
    (order as any).delivery_otp_verified_at ||
    order.qr_tracking?.deliveredAt ||
    findEventTime(['delivered', 'delivery_confirmed']);

  // Sequential progression:
  // When a stage is marked Completed, automatically mark the next stage as In Progress.
  // Only the single current active stage shows In Progress.
  const step7Done = Boolean(step7Completed);
  const step6Done = step7Done || Boolean(step6Completed);
  const step5Done = step6Done || Boolean(step5Completed);
  const step4Done = step5Done || Boolean(step4Completed);
  const step3Done = step4Done || Boolean(step3Completed);
  const step2Done = step3Done || Boolean(step2Completed);
  const step1Done = Boolean(isPaid && (step2Done || step1Completed));

  const stageDones = [step1Done, step2Done, step3Done, step4Done, step5Done, step6Done, step7Done];
  const activeIndex = stageDones.findIndex(done => !done); // -1 if all are completed

  const getStageStatus = (idx: number): 'completed' | 'in_progress' | 'upcoming' => {
    if (activeIndex === -1 || idx < activeIndex) return 'completed';
    if (idx === activeIndex) return 'in_progress';
    return 'upcoming';
  };

  const isAllCompleted = activeIndex === -1;

  const stages: JourneyStage[] = [
    {
      id: 'booking_confirmed',
      stepNumber: 1,
      title: isCancelled ? 'Order Cancelled' : (!isPaid ? 'Payment Pending' : 'Booking Confirmed'),
      shortTitle: isCancelled ? 'Cancelled' : (!isPaid ? 'Unpaid' : 'Confirmed'),
      requirement: isCancelled
        ? 'This order has been cancelled.'
        : (!isPaid
          ? 'Payment has not been completed. Please complete payment to confirm your booking and generate your pickup PIN.'
          : 'Customer placed order and payment was successfully completed.'),
      description: isCancelled
        ? 'This order has been cancelled.'
        : (!isPaid
          ? 'Payment is pending. Please complete payment so we can dispatch a driver.'
          : 'Customer placed order and payment was successfully completed.'),
      status: isCancelled ? 'upcoming' : (!isPaid ? 'in_progress' : getStageStatus(0)),
      timestamp: step1Time,
      icon: isCancelled ? XCircle : (!isPaid ? Clock : CheckCircle2),
      metaBadge: isPaid ? 'Payment Confirmed' : (isCancelled ? 'Cancelled' : 'Payment Required'),
    },
    {
      id: 'pickup_completed',
      stepNumber: 2,
      title: 'Order Pickup Completed',
      shortTitle: 'Picked Up',
      requirement: 'Driver picks up the order by verifying the OTP.',
      description: step2Done
        ? 'Driver picked up the order by verifying the customer OTP.'
        : getStageStatus(1) === 'in_progress'
          ? 'Driver en route for pickup. Share your secure OTP upon arrival.'
          : 'Driver will arrive in your scheduled slot and verify OTP.',
      status: getStageStatus(1),
      timestamp: step2Time,
      icon: ShieldCheck,
      metaBadge: step2Done ? 'OTP Verified' : undefined,
    },
    {
      id: 'received_at_plant',
      stepNumber: 3,
      title: 'Received at Plant',
      shortTitle: 'At Plant',
      requirement: 'Driver submits the order to processor and processor takes it by scanning QR.',
      description: step3Done
        ? 'Driver submitted order to processor; processor accepted by scanning QR code.'
        : getStageStatus(2) === 'in_progress'
          ? 'Order in transit to plant facility. Processor standing by for QR scan intake.'
          : 'Order will arrive at facility and processor will scan QR tag to register intake.',
      status: getStageStatus(2),
      timestamp: step3Time,
      icon: QrCode,
      metaBadge: step3Done ? 'QR Intake Verified' : undefined,
    },
    {
      id: 'washing',
      stepNumber: 4,
      title: 'Washing',
      shortTitle: 'Washing',
      requirement: 'Processor starts washing the clothes.',
      description: step4Done
        ? 'Processor completed washing and fabric-safe eco-sanitization cycle.'
        : getStageStatus(3) === 'in_progress'
          ? 'Processor has started washing the clothes with eco-friendly sanitization.'
          : 'Garments will enter specialized wash cycle upon intake sorting.',
      status: getStageStatus(3),
      timestamp: step4Time,
      icon: Droplets,
      metaBadge: getStageStatus(3) === 'in_progress' ? 'Washing in Progress' : undefined,
    },
    {
      id: 'quality_check',
      stepNumber: 5,
      title: 'Quality Check',
      shortTitle: 'QC Check',
      requirement: 'Processor is doing the QC tests or order is under QC test.',
      description: step5Done
        ? 'All QC tests passed! Garments inspected for cleanliness and fabric care.'
        : getStageStatus(4) === 'in_progress'
          ? 'Processor is doing QC tests — order is currently under multi-point inspection.'
          : 'Processor will conduct multi-point QC inspection following wash cycle.',
      status: getStageStatus(4),
      timestamp: step5Time,
      icon: CheckCheck,
      metaBadge: step5Done ? 'QC Passed' : getStageStatus(4) === 'in_progress' ? 'Under QC Test' : undefined,
    },
    {
      id: 'out_for_delivery',
      stepNumber: 6,
      title: 'Out for Delivery',
      shortTitle: 'Out for Deliv.',
      requirement: 'All the QC are passed and order is ready to deliver.',
      description: step6Done
        ? 'Out for delivery completed; driver reached doorstep destination.'
        : status === 'out_for_delivery'
          ? 'All QC passed! Courier is currently out for delivery to your doorstep.'
          : getStageStatus(5) === 'in_progress'
            ? 'All QC passed! Order is packaged and assigned for doorstep delivery.'
            : 'Order will be dispatched for delivery once all QC tests are passed.',
      status: getStageStatus(5),
      timestamp: step6Time,
      icon: Truck,
      metaBadge: status === 'out_for_delivery' ? 'On Road' : step6Done ? 'Completed' : undefined,
    },
    {
      id: 'delivered_at_doorstep',
      stepNumber: 7,
      title: 'Delivered at Doorstep',
      shortTitle: 'Delivered',
      requirement: 'Delivery boy delivers the order successfully after verifying the delivery Pin.',
      description: step7Done
        ? 'Delivery boy delivered the order successfully after verifying delivery PIN.'
        : getStageStatus(6) === 'in_progress'
          ? 'Delivery courier is at your doorstep. Please share your delivery PIN.'
          : 'Delivery boy will deliver to your doorstep and verify your delivery PIN.',
      status: getStageStatus(6),
      timestamp: step7Time,
      icon: Package,
      metaBadge: step7Done ? 'PIN Verified' : undefined,
    },
  ];

  const completedCount = stages.filter(s => s.status === 'completed').length;
  const currentStage = stages.find(s => s.status === 'in_progress') || (isAllCompleted ? stages[6] : stages[0]);

  return {
    stages,
    isAllCompleted,
    completedCount,
    currentStage,
    totalStages: 7
  };
};

interface OrdersViewProps {
  orders: Order[];
  onOpenBookNow: () => void;
  onOpenInvoice: (order: Order) => void;
  onOpenRescheduleCancel: (order: Order, mode: 'reschedule' | 'cancel' | 'reschedule_pickup' | 'reschedule_delivery') => void;
  onOpenAdditionalCharge: (order: Order) => void;
  onRepeatOrder: (order: Order) => void;
  selectedOrderId?: string | null;
}

export const OrdersView: React.FC<OrdersViewProps> = ({
  orders,
  onOpenBookNow,
  onOpenInvoice,
  onOpenRescheduleCancel,
  onOpenAdditionalCharge,
  onRepeatOrder,
  selectedOrderId,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOrderIdState, setSelectedOrderIdState] = useState<string | null>(() => selectedOrderId || null);
  const [isTimelineOpen, setIsTimelineOpen] = useState<boolean>(true);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [retryingOrderId, setRetryingOrderId] = useState<string | null>(null);
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
  const [ratingModalOrder, setRatingModalOrder] = useState<Order | null>(null);
  const [ratingModalOpen, setRatingModalOpen] = useState<boolean>(false);

  useEffect(() => {
    setIsTimelineOpen(true);
  }, [selectedOrderIdState]);

  // Prompt ratings modal when customer has an unrated completed order
  useEffect(() => {
    const unratedCompleted = orders.find(
      (o) =>
        (o.status === 'delivered' || o.status === 'completed') &&
        !o.rating &&
        !o.customerRating?.rating &&
        !o.ratingFeedback
    );

    if (unratedCompleted) {
      const dismissed =
        typeof window !== 'undefined'
          ? sessionStorage.getItem(`laundelle_dismissed_rating_${unratedCompleted.id}`)
          : null;

      if (!dismissed && !ratingModalOpen) {
        const timer = setTimeout(() => {
          setRatingModalOrder(unratedCompleted);
          setRatingModalOpen(true);
        }, 1000);
        return () => clearTimeout(timer);
      }
    }
  }, [orders, ratingModalOpen]);

  const selectedOrder = selectedOrderIdState ? orders.find(o => o.id === selectedOrderIdState || (o as any)._id === selectedOrderIdState) || null : null;
  const isSelectedOrderCancelled = Boolean(
    selectedOrder && (
      selectedOrder.status === 'cancelled' ||
      (selectedOrder.status || '').toLowerCase().includes('cancel') ||
      (selectedOrder as any).isCancelled === true
    )
  );
  const selectedJourney = (selectedOrder && !isSelectedOrderCancelled) ? computeOrderJourney(selectedOrder) : null;

  const handleRetryPayment = async (order: Order) => {
    const orderId = order.id || (order as any)._id;
    setRetryingOrderId(orderId);
    try {
      const session = getStoredSession();
      const token = session?.token;
      const storedUserId = session?.user?.id || '';

      const res = await apiFetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          amount: Number(order.total ?? (order as any).total_price ?? (order as any).amount ?? 0),
          customerEmail: (order as any).customerEmail || (order as any).email || session?.user?.email || '',
          userId: order.userId || (order as any).user_id || storedUserId || '',
          orderId: orderId,
          returnUrl: typeof window !== 'undefined' ? window.location.origin : undefined,
          orderPayload: {
            ...order,
            id: orderId,
            userId: order.userId || (order as any).user_id || storedUserId,
            status: 'pending_payment',
            paymentStatus: 'Pending',
          },
          items: order.items || [],
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      alert(data.error || 'Failed to initialize payment checkout.');
    } catch (err: any) {
      console.error('Error retrying payment:', err);
      alert('Network error initializing payment checkout.');
    } finally {
      setRetryingOrderId(null);
    }
  };

  const handleCancelUnpaidOrder = async (order: Order) => {
    const orderId = order.id || (order as any)._id;
    if (!confirm('Are you sure you want to cancel this order?')) return;
    setCancellingOrderId(orderId);
    try {
      const res = await dbCancelOrder('', orderId, 'Cancelled by customer due to uncompleted payment');
      if (res.success) {
        if (selectedOrderIdState === orderId) {
          setSelectedOrderIdState(null);
        }
      } else {
        alert(res.error || 'Failed to cancel order.');
      }
    } catch (err: any) {
      console.error('Error cancelling order:', err);
      alert('Error cancelling order.');
    } finally {
      setCancellingOrderId(null);
    }
  };

  useEffect(() => {
    if (selectedOrderId) {
      setSelectedOrderIdState(selectedOrderId);
      setIsTimelineOpen(true);
    }
  }, [selectedOrderId]);

  // Lock body scroll when full-screen modal is open
  useEffect(() => {
    if (selectedOrder) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [selectedOrder]);

  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  useEffect(() => {
    if (selectedOrder?.id) {
      setLoadingItems(true);
      apiFetch(`/api/v1/orders/${selectedOrder.id}/items`)
        .then(res => res.json())
        .then(data => {
          if (data?.items && Array.isArray(data.items)) {
            setOrderItems(data.items);
          } else {
            setOrderItems([]);
          }
        })
        .catch(() => setOrderItems([]))
        .finally(() => setLoadingItems(false));
    } else {
      setOrderItems([]);
    }
  }, [selectedOrder?.id]);

  const isOrderCompleted = (status: OrderStatus) => status === 'delivered' || status === 'completed';

  // Show all orders directly sorted chronologically: latest placed orders on top
  const sortedOrders = [...orders].sort((a, b) => {
    const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return timeB - timeA;
  });

  const filteredOrders = sortedOrders.filter((o) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const idStr = String(o.publicId || o.orderNumber || o.id || (o as any)._id || '').toLowerCase();
    const statusStr = String(o.statusLabel || o.status || '').toLowerCase();
    const addrStr = String(o.address || '').toLowerCase();
    const itemMatch = (o.items || []).some(i => i.name && i.name.toLowerCase().includes(q));
    return idStr.includes(q) || statusStr.includes(q) || addrStr.includes(q) || itemMatch;
  });

  // Exactly 6 orders per screen with pagination on both Mobile and PCs
  const itemsPerPage = 6;
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / itemsPerPage));
  const paginatedOrders = filteredOrders.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const getStatusBadgeStyle = (status: OrderStatus) => {
    switch (status) {
      case 'delivered':
      case 'completed':
        return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
      case 'cancelled':
      case 'pickup_failed':
      case 'delivery_failed':
      case 'pending_payment':
      case 'payment_failed':
        return 'bg-rose-100 text-rose-800 border border-rose-200 font-bold';
      case 'delivery_attempted':
      case 'additional_charge_rejected':
        return 'bg-amber-100 text-amber-800 border border-amber-200 font-bold';
      case 'rewash_required':
        return 'bg-purple-100 text-purple-800 border border-purple-200 font-bold';
      case 'in_wash':
      case 'in_processing':
      case 'washing':
        return 'bg-[#e8f8eb] text-[#299b45]';
      case 'out_for_delivery':
      case 'driver_assigned':
      case 'collection_scheduled':
        return 'bg-[#f1ebff] text-[#01BEFE]';
      default:
        return 'bg-[#eaf0ff] text-[#01BEFE]';
    }
  };

  type OrderDisplayCategory = 'cancelled' | 'pending' | 'under_process' | 'completed';

  const getOrderDisplayCategory = (order: Order): OrderDisplayCategory => {
    const status = (order.status || '').toLowerCase();
    const paymentStatus = (order.paymentStatus || '').toLowerCase();

    if (status === 'cancelled' || status.includes('cancel') || (order as any).isCancelled === true) {
      return 'cancelled';
    }
    if (status === 'completed' || status === 'delivered') {
      return 'completed';
    }
    if (
      status === 'pending_payment' ||
      status === 'payment_failed' ||
      status === 'pickup_failed' ||
      status === 'delivery_failed' ||
      status === 'awaiting_customer_approval' ||
      status === 'additional_charge_rejected' ||
      status === 'rewash_required' ||
      paymentStatus === 'pending' ||
      paymentStatus === 'failed'
    ) {
      return 'pending';
    }
    return 'under_process';
  };

  const renderCardStatusIcon = (order: Order) => {
    const category = getOrderDisplayCategory(order);
    const iconClass = 'w-5 h-5 sm:w-6 sm:h-6 md:w-6.5 md:h-6.5 lg:w-7 lg:h-7';

    switch (category) {
      case 'cancelled':
        return <X className={`${iconClass} stroke-[2.6]`} />;
      case 'pending':
        return <AlertTriangle className={`${iconClass} stroke-[2.2]`} />;
      case 'under_process':
        return <Truck className={`${iconClass} stroke-[1.8]`} />;
      case 'completed':
        return <Check className={`${iconClass} stroke-[2.8]`} />;
    }
  };

  const getCardIconContainerStyle = (order: Order) => {
    const category = getOrderDisplayCategory(order);
    switch (category) {
      case 'cancelled':
        return 'bg-rose-50 text-rose-600 border border-rose-200/90 shadow-2xs';
      case 'pending':
        return 'bg-amber-50 text-amber-600 border border-amber-200/90 shadow-2xs';
      case 'under_process':
        return 'bg-[#edf3ff] text-[#01BEFE] border border-[#d6e2ff] shadow-2xs';
      case 'completed':
        return 'bg-emerald-50 text-emerald-600 border border-emerald-200/90 shadow-2xs';
    }
  };

  const getCardCategoryBadge = (order: Order) => {
    const category = getOrderDisplayCategory(order);
    switch (category) {
      case 'cancelled':
        return { label: 'Cancelled', style: 'bg-rose-100 text-rose-700 border border-rose-200' };
      case 'pending':
        return { label: 'Pending', style: 'bg-amber-100 text-amber-800 border border-amber-200' };
      case 'under_process':
        return { label: 'Under Process', style: 'bg-blue-100 text-blue-700 border border-blue-200' };
      case 'completed':
        return { label: 'Completed', style: 'bg-emerald-100 text-emerald-800 border border-emerald-200' };
    }
  };

  return (
    <div className="min-h-screen bg-[#f9fbff] md:bg-[#f8fafc] text-[#002953] font-sans pb-16 md:pb-8">
      <style>{`
        .page-container {
          background:
            radial-gradient(circle at 72% 4%, rgba(228, 231, 255, 0.45), transparent 30%),
            linear-gradient(180deg, rgba(255,255,255,.96), rgba(249,251,255,.94));
        }

        .hero-section {
          background:
            radial-gradient(circle at 65% 60%, rgba(215, 222, 255, .7), transparent 28%),
            radial-gradient(circle at 90% 0%, rgba(235, 237, 255, .8), transparent 28%);
        }

        .washing-machine {
          width: 145px;
          height: 190px;
          border-radius: 12px;
          background: linear-gradient(145deg, #ffffff, #eef3ff);
          border: 1px solid #d8e1f8;
          box-shadow: 0 18px 40px rgba(53, 80, 150, .12);
        }

        .machine-top {
          height: 40px;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 0 12px;
          border-bottom: 1px solid #d9e1f4;
        }

        .machine-display {
          width: 31px;
          height: 8px;
          border-radius: 3px;
          background: #d7e2ff;
        }

        .machine-knob {
          width: 20px;
          height: 20px;
          border: 2px solid #abbde7;
          border-radius: 50%;
        }

        .machine-screen {
          width: 38px;
          height: 20px;
          margin-left: auto;
          border-radius: 3px;
          background: #002953;
        }

        .machine-door {
          width: 91px;
          height: 91px;
          margin: 16px auto;
          border-radius: 50%;
          border: 8px solid #dce5fc;
          background: radial-gradient(circle at 35% 30%, #7897d9, #3559a0 42%, #002953 45%, #002953 70%);
          box-shadow: inset 0 0 0 2px rgba(255,255,255,.25), 0 5px 15px rgba(20, 48, 110, .15);
        }

        .laundry-basket {
          position: absolute;
          right: -54px;
          bottom: 3px;
          width: 104px;
          height: 53px;
          border-radius: 8px 8px 13px 13px;
          background: linear-gradient(180deg, #6d8ee0, #3559ae);
          box-shadow: 0 12px 20px rgba(48, 78, 151, .18);
        }

        .basket-handle {
          position: absolute;
          top: -13px;
          left: 14px;
          right: 14px;
          height: 20px;
          border: 6px solid #7c9bea;
          border-bottom: 0;
          border-radius: 10px 10px 0 0;
        }

        .shirt {
          position: absolute;
          left: 19px;
          top: -19px;
          width: 62px;
          height: 42px;
          border-radius: 8px 8px 14px 14px;
          background: #ff8d9f;
          transform: rotate(-4deg);
        }

        .shirt::before,
        .shirt::after {
          content: "";
          position: absolute;
          top: 1px;
          width: 20px;
          height: 19px;
          background: #ff8d9f;
        }

        .shirt::before {
          left: -13px;
          transform: rotate(35deg);
        }

        .shirt::after {
          right: -13px;
          transform: rotate(-35deg);
        }

        .plant {
          position: absolute;
          left: -65px;
          bottom: 4px;
          width: 58px;
          height: 70px;
        }

        .plant-pot {
          position: absolute;
          bottom: 0;
          left: 15px;
          width: 32px;
          height: 31px;
          border-radius: 3px 3px 12px 12px;
          background: linear-gradient(180deg, #ffffff, #dbe7ff);
        }

        .leaf {
          position: absolute;
          bottom: 25px;
          left: 28px;
          width: 12px;
          height: 42px;
          border-radius: 100% 0 100% 0;
          background: linear-gradient(180deg, #79c7b1, #3d91a0);
          transform-origin: bottom;
        }

        .leaf:nth-child(1) {
          transform: rotate(-30deg);
        }

        .leaf:nth-child(2) {
          height: 52px;
          transform: rotate(0deg);
        }

        .leaf:nth-child(3) {
          transform: rotate(31deg);
        }

        .order-card {
          transition: transform .2s ease, box-shadow .2s ease, border-color .2s ease;
        }

        @media (min-width: 768px) {
          .order-card:hover {
            transform: translateY(-2px);
            border-color: #d4dced;
            box-shadow: 0 10px 25px rgba(35,55,120,.08);
          }
        }

        .book-button {
          box-shadow: 0 10px 25px rgba(93, 61, 232, .30);
        }

        @media (max-width: 767px) {
          .washing-machine {
            transform: scale(.78);
            transform-origin: bottom center;
          }
          .plant {
            transform: scale(.78);
            transform-origin: bottom center;
            left: -48px;
          }
          .laundry-basket {
            transform: scale(.78);
            transform-origin: bottom center;
            right: -28px;
          }
        }

        @media (min-width: 1280px) {
          .washing-machine {
            transform: scale(1.12);
            transform-origin: bottom center;
          }
          .plant {
            transform: scale(1.12);
            transform-origin: bottom center;
            left: -74px;
          }
          .laundry-basket {
            transform: scale(1.12);
            transform-origin: bottom center;
            right: -46px;
          }
        }

        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>

      <div className="page-wrapper min-h-screen md:px-5 md:py-5 lg:px-8 lg:py-8 overflow-x-hidden flex flex-col justify-start">
        {/* ======================================================
             PAGE CONTAINER
        ======================================================= */}
        <main className="page-container mx-auto max-w-[1500px] w-full overflow-x-hidden rounded-none border-0 md:rounded-[28px] md:border md:border-[#e2e8f0] md:shadow-soft flex flex-col flex-1">
          {/* Hero Section */}
          <section className="hero-section relative px-4 sm:px-10 md:px-12 lg:px-14 xl:px-16 pb-6 pt-5 sm:pb-8 sm:pt-7 md:pb-9 md:pt-8 lg:pb-11 lg:pt-10 overflow-hidden">
            {/* Decorative Elements (Desktop) */}
            <div className="absolute right-[28%] top-12 hidden h-3 w-3 rounded-full border border-white bg-white/60 md:block pointer-events-none" />
            <div className="absolute right-[25%] top-20 hidden h-4 w-4 rounded-full border border-[#dce4ff] md:block pointer-events-none" />

            <div className="grid items-center gap-4 md:grid-cols-[1fr_1fr] md:gap-8">
              {/* Hero Content */}
              <div>
                <p className="mb-2 text-[12px] font-semibold tracking-[.15em] text-[#01BEFE] md:text-[13px] lg:text-[14px] md:text-[#01BEFE] uppercase">
                  <span className="md:hidden">CUSTOMER PORTAL</span>
                  <span className="hidden md:inline">CUSTOMER LAUNDRY PORTAL</span>
                </p>

                <h1 className="max-w-2xl lg:max-w-none text-[32px] font-serif font-semibold leading-[1.08] tracking-tight text-[#002953] sm:text-[40px] md:text-[46px] lg:text-[52px]">
                  My Orders & Collections
                </h1>

                <p className="mt-2.5 sm:mt-3 md:mt-4 max-w-xl text-[13px] sm:text-[14px] md:text-base lg:text-[17px] font-medium leading-5 sm:leading-6 md:leading-7 lg:leading-8 text-[#536486]">
                  Track live progress, view invoices,
                  <br className="hidden md:block" />
                  {' '}reschedule or repeat past
                  <br className="hidden md:block" />
                  {' '}laundry orders.
                </p>
              </div>

              {/* Hero Illustration & Book Button */}
              <div className="relative flex h-[175px] items-end justify-center md:h-[220px] lg:h-[240px]">
                <div className="relative mb-1 mr-6 md:mb-3 md:mr-8 select-none pointer-events-none">
                  {/* Plant */}
                  <div className="plant">
                    <span className="leaf" />
                    <span className="leaf" />
                    <span className="leaf" />
                    <div className="plant-pot" />
                  </div>

                  {/* Washing Machine */}
                  <div className="washing-machine">
                    <div className="machine-top">
                      <div>
                        <div className="machine-display mb-2" />
                        <div className="machine-display w-6" />
                      </div>
                      <div className="machine-knob" />
                      <div className="machine-screen" />
                    </div>
                    <div className="machine-door" />
                  </div>

                  {/* Basket */}
                  <div className="laundry-basket">
                    <div className="basket-handle" />
                    <div className="shirt" />
                    <div className="absolute bottom-2 left-5 h-5 w-5 rounded bg-[#002953]" />
                    <div className="absolute bottom-2 left-12 h-5 w-5 rounded bg-[#002953]" />
                  </div>
                </div>

                {/* Sparkles */}
                <div className="absolute right-[18%] top-7 text-2xl text-white select-none pointer-events-none">✦</div>
                <div className="absolute right-[12%] top-16 text-3xl text-[#9fb4ef] select-none pointer-events-none">✧</div>

                {/* Desktop Book Button */}
                <button
                  onClick={onOpenBookNow}
                  className="absolute right-0 top-1/2 hidden -translate-y-1/2 items-center gap-3 rounded-2xl bg-[#002953] hover:bg-[#002953] px-7 py-4 text-base font-bold text-white shadow-xl shadow-blue-900/15 transition-all hover:-translate-y-[55%] hover:shadow-2xl lg:flex cursor-pointer"
                >
                  <Calendar className="w-5 h-5 text-sky-300" />
                  <span>Book New Collection</span>
                </button>

                {/* Mobile Book Button */}
                <div className="absolute right-0 top-[-2px] flex flex-col items-center md:right-2 lg:hidden">
                  <button
                    onClick={onOpenBookNow}
                    className="book-button flex h-[66px] w-[66px] items-center justify-center rounded-full bg-gradient-to-br from-[#01BEFE] to-[#01BEFE] text-white cursor-pointer active:scale-95 transition-transform"
                    title="Book New Collection"
                  >
                    <Calendar className="w-6 h-6 stroke-[1.8]" />
                  </button>
                  <div className="mt-1 text-center text-[12px] font-bold leading-tight text-[#002953]">
                    Book New
                    <br />
                    Collection
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Orders Listing & Actions */}
          <section className="w-full max-w-full px-4 sm:px-6 md:px-8 lg:px-12 xl:px-16 py-4 sm:py-5 md:py-7 lg:py-8 flex-1 flex flex-col justify-between overflow-x-hidden">
            {/* Search Bar & Order Counter */}
            <div className="mb-4 sm:mb-5 md:mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 md:gap-4">

              <div className="relative w-full sm:w-80 md:w-96">
                <Search className="absolute left-3.5 sm:left-4 top-1/2 -translate-y-1/2 text-[#8090b2] w-4 h-4 md:w-5 md:h-5 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Search by Order ID or item..."
                  className="h-10 sm:h-11 md:h-12 w-full rounded-xl md:rounded-2xl border border-[#e2e8f0] bg-white pl-10 sm:pl-11 pr-9 text-xs sm:text-sm md:text-[15px] text-[#002953] outline-none placeholder:text-[#8793ae] focus:border-[#8296d0] focus:ring-2 focus:ring-[#01BEFE]/10 shadow-2xs"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setCurrentPage(1);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer p-1"
                  >
                    <X className="w-3.5 h-3.5 md:w-4 md:h-4" />
                  </button>
                )}
              </div>
            </div>
            {/* Orders Grid */}
            {paginatedOrders.length === 0 ? (
              <div className="text-center py-10 md:py-16 bg-white rounded-2xl md:rounded-3xl border border-dashed border-[#e2e8f0] p-6 md:p-10 space-y-3 md:space-y-4 my-auto">
                <div className="w-12 h-12 md:w-16 md:h-16 bg-[#e6f8ff] text-[#002953] rounded-xl md:rounded-2xl flex items-center justify-center mx-auto shadow-xs">
                  <Package className="w-6 h-6 md:w-8 md:h-8 stroke-[1.8]" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm md:text-lg font-bold text-[#002953]">No orders found</h3>
                  <p className="text-xs md:text-sm text-slate-500 max-w-sm mx-auto">
                    {searchQuery ? 'No orders match your search query.' : 'You have not placed any orders yet.'}
                  </p>
                </div>
                <button
                  onClick={onOpenBookNow}
                  className="mt-2 bg-[#002953] hover:bg-[#002953] text-white px-5 md:px-7 py-2.5 md:py-3 rounded-xl md:rounded-2xl text-xs md:text-sm font-bold shadow-sm cursor-pointer transition-all"
                >
                  Book New Collection
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-3.5 md:gap-4 lg:gap-5 xl:gap-6 w-full min-w-0">
                {paginatedOrders.map((order, idx) => {
                  const orderId = order.publicId || order.orderNumber || order.id || (order as any)._id || `order-${idx}`;
                  const itemKey = `${orderId}-${idx}`;
                  const mainItemName = (order.items || [])[0]?.name || 'Standard Laundry Service';
                  const moreItemsCount = (order.items || []).length > 1 ? ` +${(order.items || []).length - 1} more` : '';
                  const category = getOrderDisplayCategory(order);
                  const cardBadge = getCardCategoryBadge(order);

                  return (
                    <article
                      key={itemKey}
                      onClick={() => {
                        setSelectedOrderIdState(orderId);
                      }}
                      className={`order-card w-full min-w-0 rounded-2xl md:rounded-3xl border bg-white p-3.5 sm:p-4 md:p-5 lg:p-5.5 shadow-card hover:shadow-lg transition-all cursor-pointer select-none group box-border flex items-center justify-between gap-3 sm:gap-4 ${category === 'cancelled'
                        ? 'border-rose-200/90 hover:border-rose-300'
                        : 'border-[#e7eaf2] hover:border-[#002953]/40'
                        }`}
                    >
                      <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                        {/* Dynamic Status Icon */}
                        <div className={`flex h-11 w-11 sm:h-12 sm:w-12 md:h-13 md:w-13 lg:h-14 lg:w-14 shrink-0 items-center justify-center rounded-xl md:rounded-2xl ${getCardIconContainerStyle(order)} group-hover:scale-105 transition-transform`}>
                          {renderCardStatusIcon(order)}
                        </div>

                        {/* Content */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                              <h3 className="text-[14px] sm:text-[15px] md:text-base lg:text-[17px] font-bold text-[#002953] group-hover:text-[#002953] transition-colors truncate">
                                #{orderId}
                              </h3>
                              <span className={`text-[9px] sm:text-[10px] md:text-[11px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 ${cardBadge.style}`}>
                                {cardBadge.label}
                              </span>
                            </div>
                            <span className={`text-[14px] sm:text-[15px] md:text-base lg:text-lg xl:text-xl font-extrabold shrink-0 ${category === 'cancelled' ? 'line-through text-slate-400' : 'text-[#002953]'
                              }`}>
                              £{Number(order.total ?? (order as any).total_price ?? (order as any).amount ?? 0).toFixed(2)}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-[13px] md:text-sm text-[#536486] truncate mt-1">
                            <span className="truncate">{mainItemName}{moreItemsCount}</span>
                            {order.createdAt && (
                              <>
                                <span className="text-slate-300 shrink-0">•</span>
                                <span className="text-slate-400 shrink-0 text-[10px] sm:text-[11px] md:text-xs">
                                  {new Date(order.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right side: Actions / Chevron */}
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        {category === 'pending' && (order.status === 'pending_payment' || order.status === 'payment_failed' || (order.paymentStatus || '').toLowerCase() === 'pending' || (order.paymentStatus || '').toLowerCase() === 'failed') && !order.isPaid && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRetryPayment(order);
                            }}
                            disabled={retryingOrderId === orderId}
                            className="px-2.5 py-1 bg-[#002953] hover:bg-[#002953] text-white rounded-lg text-[11px] font-bold transition-all shadow-2xs flex items-center gap-1 cursor-pointer"
                          >
                            <CreditCard className="w-3 h-3" />
                            <span>{retryingOrderId === orderId ? '...' : 'Resume Payment'}</span>
                          </button>
                        )}
                        {category === 'completed' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRatingModalOrder(order);
                              setRatingModalOpen(true);
                            }}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all shadow-2xs flex items-center gap-1 cursor-pointer ${
                              order.rating || order.customerRating?.rating
                                ? 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                            }`}
                          >
                            <Star className={`w-3 h-3 ${order.rating || order.customerRating?.rating ? 'text-amber-500 fill-amber-500' : 'text-emerald-600'}`} />
                            <span>{order.rating || order.customerRating?.rating ? `${order.rating || order.customerRating?.rating} ★` : 'Rate Order'}</span>
                          </button>
                        )}
                        <ChevronRight className="w-4 h-4 md:w-5 md:h-5 text-gray-400 group-hover:text-[#002953] group-hover:translate-x-1 transition-all" />
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {/* Bottom Section: Pagination & Feature Strip */}
            <div className="mt-4 sm:mt-5 md:mt-6 shrink-0">
              {/* Pagination */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 sm:gap-3 py-2.5 sm:py-3 md:py-4 border-t border-slate-100">
                <span className="text-xs sm:text-sm md:text-[15px] text-slate-500 font-medium">
                  Showing{' '}
                  <span className="font-bold text-[#002953]">
                    {filteredOrders.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}
                  </span>{' '}
                  to{' '}
                  <span className="font-bold text-[#002953]">
                    {Math.min(currentPage * itemsPerPage, filteredOrders.length)}
                  </span>{' '}
                  of <span className="font-bold text-[#002953]">{filteredOrders.length}</span> orders
                </span>

                <div className="flex items-center gap-1.5 sm:gap-2">
                  <button
                    type="button"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="flex h-8.5 w-8.5 sm:h-9.5 sm:w-9.5 md:h-10.5 md:w-10.5 items-center justify-center rounded-lg md:rounded-xl border border-[#e2e8f0] bg-white text-[#002953] transition hover:bg-[#f5f7ff] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shadow-xs"
                    title="Previous page"
                  >
                    <ChevronLeft className="w-4 h-4 md:w-5 md:h-5" />
                  </button>

                  {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((pageNum) => (
                    <button
                      key={pageNum}
                      type="button"
                      onClick={() => setCurrentPage(pageNum)}
                      className={`flex h-8.5 w-8.5 sm:h-9.5 sm:w-9.5 md:h-10.5 md:w-10.5 items-center justify-center rounded-lg md:rounded-xl text-xs sm:text-sm md:text-base font-semibold transition-all cursor-pointer ${currentPage === pageNum
                        ? 'bg-[#002953] text-white shadow-xs'
                        : 'border border-[#e2e8f0] bg-white text-[#002953] hover:bg-[#f5f7ff]'
                        }`}
                    >
                      {pageNum}
                    </button>
                  ))}

                  <button
                    type="button"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="flex h-8.5 w-8.5 sm:h-9.5 sm:w-9.5 md:h-10.5 md:w-10.5 items-center justify-center rounded-lg md:rounded-xl border border-[#e2e8f0] bg-white text-[#002953] transition hover:bg-[#f5f7ff] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shadow-xs"
                    title="Next page"
                  >
                    <ChevronRight className="w-4 h-4 md:w-5 md:h-5" />
                  </button>
                </div>
              </div>

              {/* Feature Strip below pagination */}
              <div className="mt-3 sm:mt-4 md:mt-5 overflow-hidden rounded-2xl md:rounded-3xl border border-[#e5e8f5] bg-gradient-to-r from-[#f7f5ff] via-[#f7f9ff] to-[#f5f8ff] shadow-xs">
                <div className="grid grid-cols-2 md:grid-cols-4 divide-y divide-x md:divide-y-0 divide-[#e5e8f5]">
                  {/* Feature 1 */}
                  <div className="flex items-center gap-3 sm:gap-3.5 md:gap-4 px-3.5 py-2.5 sm:px-4 sm:py-3 md:px-5 md:py-4 lg:px-6 lg:py-5">
                    <div className="flex h-9 w-9 sm:h-10 sm:w-10 md:h-11 md:w-11 lg:h-12 lg:w-12 shrink-0 items-center justify-center rounded-full border border-[#d7caff] bg-white text-[#01BEFE] shadow-xs">
                      <Truck className="w-4 h-4 sm:w-5 sm:h-5 md:w-5.5 md:h-5.5 lg:w-6 lg:h-6 stroke-[1.8]" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs sm:text-sm md:text-base lg:text-[17px] font-bold text-[#002953] truncate">Real-time Tracking</h4>
                      <p className="text-[10px] sm:text-[11px] md:text-xs lg:text-[13px] leading-tight md:leading-normal text-[#637194] mt-0.5">
                        Track your order <br className="hidden sm:block" />at every step
                      </p>
                    </div>
                  </div>

                  {/* Feature 2 */}
                  <div className="flex items-center gap-3 sm:gap-3.5 md:gap-4 px-3.5 py-2.5 sm:px-4 sm:py-3 md:px-5 md:py-4 lg:px-6 lg:py-5">
                    <div className="flex h-9 w-9 sm:h-10 sm:w-10 md:h-11 md:w-11 lg:h-12 lg:w-12 shrink-0 items-center justify-center rounded-full border border-[#cbd8ff] bg-white text-[#01BEFE] shadow-xs">
                      <FileText className="w-4 h-4 sm:w-5 sm:h-5 md:w-5.5 md:h-5.5 lg:w-6 lg:h-6 stroke-[1.8]" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs sm:text-sm md:text-base lg:text-[17px] font-bold text-[#002953] truncate">Digital Invoices</h4>
                      <p className="text-[10px] sm:text-[11px] md:text-xs lg:text-[13px] leading-tight md:leading-normal text-[#637194] mt-0.5">
                        View & download <br className="hidden sm:block" />official invoices
                      </p>
                    </div>
                  </div>

                  {/* Feature 3 */}
                  <div className="flex items-center gap-3 sm:gap-3.5 md:gap-4 px-3.5 py-2.5 sm:px-4 sm:py-3 md:px-5 md:py-4 lg:px-6 lg:py-5">
                    <div className="flex h-9 w-9 sm:h-10 sm:w-10 md:h-11 md:w-11 lg:h-12 lg:w-12 shrink-0 items-center justify-center rounded-full border border-[#c9ecd2] bg-white text-[#2aa149] shadow-xs">
                      <Calendar className="w-4 h-4 sm:w-5 sm:h-5 md:w-5.5 md:h-5.5 lg:w-6 lg:h-6 stroke-[1.8]" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs sm:text-sm md:text-base lg:text-[17px] font-bold text-[#002953] truncate">Reschedule Easily</h4>
                      <p className="text-[10px] sm:text-[11px] md:text-xs lg:text-[13px] leading-tight md:leading-normal text-[#637194] mt-0.5">
                        Change your slot <br className="hidden sm:block" />anytime
                      </p>
                    </div>
                  </div>

                  {/* Feature 4 */}
                  <div className="flex items-center gap-3 sm:gap-3.5 md:gap-4 px-3.5 py-2.5 sm:px-4 sm:py-3 md:px-5 md:py-4 lg:px-6 lg:py-5">
                    <div className="flex h-9 w-9 sm:h-10 sm:w-10 md:h-11 md:w-11 lg:h-12 lg:w-12 shrink-0 items-center justify-center rounded-full border border-[#d8cfff] bg-white text-[#01BEFE] shadow-xs">
                      <Headphones className="w-4 h-4 sm:w-5 sm:h-5 md:w-5.5 md:h-5.5 lg:w-6 lg:h-6 stroke-[1.8]" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs sm:text-sm md:text-base lg:text-[17px] font-bold text-[#002953] truncate">Need Help?</h4>
                      <p className="text-[10px] sm:text-[11px] md:text-xs lg:text-[13px] leading-tight md:leading-normal text-[#637194] mt-0.5">
                        Our support team is <br className="hidden sm:block" />here for you
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>

      {/* =========================================================================
          FULL-SCREEN ORDER DETAIL & LIVE JOURNEY MODAL
      ========================================================================= */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-0 md:p-6 overflow-hidden animate-in fade-in duration-200">
          {isSelectedOrderCancelled ? (
            /* =========================================================================
                CANCELLED ORDER MODAL (LIGHT RED, NO TIMELINE, NO AMOUNT PAID)
            ========================================================================= */
            <div className="bg-[#fff5f5] w-full h-[100dvh] md:h-auto md:max-h-[85vh] md:max-w-2xl md:rounded-3xl shadow-2xl flex flex-col overflow-hidden border-0 md:border md:border-rose-200 animate-in zoom-in-95 duration-200">
              {/* Modal Top Bar */}
              <div className="shrink-0 bg-rose-100/70 border-b border-rose-200 px-4 sm:px-6 md:px-8 py-3.5 sm:py-4 flex items-center justify-between shadow-2xs">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0 mr-2">
                  <span className="text-sm sm:text-base md:text-lg font-extrabold text-rose-950 truncate">
                    Order #{selectedOrder.id || (selectedOrder as any)._id}
                  </span>
                  <span className="text-[10px] md:text-xs font-black px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full uppercase tracking-wider bg-rose-600 text-white shrink-0 shadow-2xs">
                    Cancelled
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedOrderIdState(null)}
                  className="p-1.5 sm:p-2 rounded-full hover:bg-rose-200 text-rose-700 hover:text-rose-950 transition-colors cursor-pointer shrink-0"
                  title="Close"
                >
                  <X className="w-5 h-5 md:w-6 md:h-6" />
                </button>
              </div>

              {/* Scrollable Cancelled Content (No Timeline & No Amount Paid) */}
              <div className="flex-1 overflow-y-auto p-6 sm:p-8 md:p-10 space-y-6 text-center">
                {/* Large X Icon in Red Accent Circle */}
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-rose-100 border-4 border-rose-200 text-rose-600 flex items-center justify-center mx-auto shadow-sm">
                  <X className="w-10 h-10 sm:w-12 sm:h-12 stroke-[2.5]" />
                </div>

                <div className="space-y-2">
                  <h3 className="text-xl sm:text-2xl md:text-3xl font-heading font-extrabold text-rose-950">
                    This Order Has Been Cancelled
                  </h3>
                  <p className="text-xs sm:text-sm md:text-base text-rose-800/80 max-w-md mx-auto leading-relaxed">
                    Order #{selectedOrder.id || (selectedOrder as any)._id} was cancelled and is no longer active. No collection or laundry processing will take place.
                  </p>
                </div>

                {/* Cancelled Order Summary Card (Without Timeline & Without Amount Paid) */}
                <div className="bg-white/90 backdrop-blur-xs rounded-2xl p-5 sm:p-6 border border-rose-200 text-left space-y-3 shadow-xs max-w-md mx-auto">
                  <div className="flex items-center justify-between text-xs sm:text-sm py-1 border-b border-rose-100">
                    <span className="text-rose-700/70 font-medium">Order Status</span>
                    <span className="font-extrabold text-rose-700 uppercase tracking-wide">Cancelled</span>
                  </div>

                  {selectedOrder.createdAt && (
                    <div className="flex items-center justify-between text-xs sm:text-sm py-1 border-b border-rose-100">
                      <span className="text-rose-700/70 font-medium">Booking Date</span>
                      <span className="font-semibold text-rose-950">
                        {new Date(selectedOrder.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                  )}

                  {((selectedOrder as any).cancelledReason || (selectedOrder as any).cancellation_reason) && (
                    <div className="flex items-start justify-between text-xs sm:text-sm py-1 border-b border-rose-100 gap-2">
                      <span className="text-rose-700/70 font-medium shrink-0">Reason</span>
                      <span className="font-semibold text-rose-950 text-right">
                        {(selectedOrder as any).cancelledReason || (selectedOrder as any).cancellation_reason}
                      </span>
                    </div>
                  )}

                  {selectedOrder.address && (
                    <div className="flex items-start justify-between text-xs sm:text-sm py-1 gap-2">
                      <span className="text-rose-700/70 font-medium shrink-0">Pickup Address</span>
                      <span className="font-semibold text-rose-950 text-right truncate max-w-[200px] sm:max-w-[240px]">
                        {typeof selectedOrder.address === 'string' ? selectedOrder.address : (selectedOrder.address as any)?.formatted || (selectedOrder.address as any)?.line1}
                      </span>
                    </div>
                  )}
                </div>

                {/* Helpful notice */}
                <div className="p-3.5 sm:p-4 rounded-xl bg-rose-100/60 border border-rose-200 text-rose-800 text-xs text-center max-w-md mx-auto leading-relaxed">
                  If any payment authorization or charge was initiated, it has been cancelled and released back to your original payment method.
                </div>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2 max-w-md mx-auto">
                  <button
                    type="button"
                    onClick={() => setSelectedOrderIdState(null)}
                    className="w-full sm:w-auto px-6 py-3 rounded-xl border border-rose-300 text-rose-800 bg-white hover:bg-rose-50 font-bold text-xs sm:text-sm transition-all cursor-pointer shadow-2xs"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedOrderIdState(null);
                      onOpenBookNow();
                    }}
                    className="w-full sm:w-auto px-6 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs sm:text-sm transition-all shadow-md cursor-pointer active:scale-98"
                  >
                    Book New Collection
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-[#f8fafc] w-full h-[100dvh] md:h-[92vh] max-h-[100dvh] md:max-h-[92vh] md:max-w-4xl lg:max-w-5xl md:rounded-3xl shadow-2xl flex flex-col overflow-hidden border-0 md:border md:border-gray-100 animate-in slide-in-from-bottom duration-300">
              {/* Modal Top Bar */}
              <div className="shrink-0 bg-white border-b border-gray-100 px-4 sm:px-6 md:px-8 py-3.5 sm:py-4 flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0 mr-2">
                  <span className="text-sm sm:text-base md:text-lg font-extrabold text-[#002953] truncate">Order #{selectedOrder.id}</span>
                  <span className={`text-[9px] sm:text-[10px] md:text-xs font-bold px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full uppercase tracking-wider shrink-0 ${getStatusBadgeStyle(selectedOrder.status)}`}>
                    {isOrderCompleted(selectedOrder.status) || selectedJourney?.isAllCompleted
                      ? 'Completed'
                      : (selectedOrder.status === 'pending_payment' || selectedOrder.status === 'payment_failed' || selectedOrder.paymentStatus === 'Failed')
                        ? 'Payment Failed'
                        : selectedOrder.statusLabel}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedOrderIdState(null)}
                  className="p-1.5 sm:p-2 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors cursor-pointer shrink-0"
                  title="Close"
                >
                  <X className="w-5 h-5 md:w-6 md:h-6" />
                </button>
              </div>

              {/* Scrollable Modal Content */}
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6 md:p-8 space-y-5 sm:space-y-6">
                {/* Header & Quick Action Pills */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-gray-100">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <h2 className="text-xl sm:text-2xl md:text-3xl font-serif font-semibold text-[#002953] truncate">Order #{selectedOrder.id}</h2>
                    </div>
                    <p className="text-xs sm:text-sm text-gray-400 mt-0.5">
                      Booked on {new Date(selectedOrder.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      onClick={() => {
                        setIsTimelineOpen(true);
                        setTimeout(() => {
                          const el = document.getElementById('order-timeline-accordion');
                          if (el) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }
                        }, 50);
                      }}
                      className={`px-3 sm:px-4 md:px-4.5 py-1.5 sm:py-2 md:py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer ${isTimelineOpen
                        ? 'bg-[#002953] text-white'
                        : 'bg-white border border-[#e2e8f0] text-[#002953] hover:bg-slate-50'
                        }`}
                    >
                      <Truck className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      <span>Track Live GPS</span>
                    </button>

                    <button
                      onClick={() => onOpenInvoice(selectedOrder)}
                      className="bg-white hover:bg-slate-50 text-gray-800 px-3 sm:px-3.5 md:px-4 py-1.5 sm:py-2 md:py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-colors cursor-pointer border border-[#e2e8f0] shadow-xs"
                    >
                      <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#002953]" />
                      <span>Invoice</span>
                    </button>

                    {(isOrderCompleted(selectedOrder.status) || selectedJourney?.isAllCompleted) && (
                      <button
                        type="button"
                        onClick={() => {
                          setRatingModalOrder(selectedOrder);
                          setRatingModalOpen(true);
                        }}
                        className={`px-3 sm:px-3.5 md:px-4 py-1.5 sm:py-2 md:py-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-colors cursor-pointer border shadow-xs ${
                          selectedOrder.rating || selectedOrder.customerRating?.rating
                            ? 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-200'
                            : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200 animate-pulse'
                        }`}
                      >
                        <Star className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${selectedOrder.rating || selectedOrder.customerRating?.rating ? 'text-amber-500 fill-amber-500' : 'text-emerald-600'}`} />
                        <span>{selectedOrder.rating || selectedOrder.customerRating?.rating ? 'View / Edit Rating' : 'Rate Order'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Customer Rating & Experience Card */}
                {(isOrderCompleted(selectedOrder.status) || selectedJourney?.isAllCompleted) && (
                  <div className="p-4 sm:p-5 bg-gradient-to-r from-amber-50/90 via-amber-100/40 to-amber-50/90 border border-amber-200/80 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
                    <div className="flex items-start gap-3.5 min-w-0">
                      <div className="w-11 h-11 rounded-xl bg-amber-400 text-white flex items-center justify-center shrink-0 shadow-sm">
                        <Star className="w-6 h-6 fill-current drop-shadow-2xs" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-amber-950 uppercase tracking-wider">
                            {selectedOrder.rating || selectedOrder.customerRating?.rating ? 'Your Rating & Feedback' : 'Order Completed'}
                          </span>
                          {(selectedOrder.rating || selectedOrder.customerRating?.rating) && (
                            <div className="flex items-center text-amber-500">
                              {Array.from({ length: 5 }).map((_, i) => (
                                <Star
                                  key={i}
                                  className={`w-3.5 h-3.5 ${
                                    i < (selectedOrder.rating || selectedOrder.customerRating?.rating || 0)
                                      ? 'fill-current text-amber-500'
                                      : 'text-slate-300'
                                  }`}
                                />
                              ))}
                              <span className="text-xs font-extrabold text-amber-900 ml-1.5">
                                {(selectedOrder.rating || selectedOrder.customerRating?.rating)}.0
                              </span>
                            </div>
                          )}
                        </div>
                        {selectedOrder.ratingFeedback || selectedOrder.customerRating?.feedback ? (
                          <p className="text-xs text-amber-900 mt-1 italic font-medium bg-white/70 px-3 py-1.5 rounded-lg border border-amber-200/50">
                            "{selectedOrder.ratingFeedback || selectedOrder.customerRating?.feedback}"
                          </p>
                        ) : (
                          <p className="text-xs text-amber-850 mt-0.5">
                            {selectedOrder.rating || selectedOrder.customerRating?.rating
                              ? 'Thank you for your rating! Your review is visible to our management team.'
                              : 'How did we do? Take a second to leave a 1-5 star rating and feedback.'}
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setRatingModalOrder(selectedOrder);
                        setRatingModalOpen(true);
                      }}
                      className="w-full sm:w-auto px-4 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer shrink-0 active:scale-98 flex items-center justify-center gap-1.5"
                    >
                      <Star className="w-3.5 h-3.5 fill-current" />
                      <span>{selectedOrder.rating || selectedOrder.customerRating?.rating ? 'Edit Rating & Feedback' : 'Give Rating & Feedback'}</span>
                    </button>
                  </div>
                )}

                {/* Unpaid / Failed Payment Alert in Modal */}
                {(selectedOrder.status === 'pending_payment' || selectedOrder.status === 'payment_failed' || selectedOrder.paymentStatus === 'Failed') && (
                  <div className="p-4 sm:p-5 bg-rose-50 border-2 border-rose-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
                    <div className="flex items-start sm:items-center gap-3.5">
                      <div className="w-11 h-11 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-md">
                        <AlertTriangle className="w-6 h-6 stroke-[2.2]" />
                      </div>
                      <div>
                        <span className="text-[11px] font-extrabold uppercase tracking-wider text-rose-900 block">
                          Payment Unsuccessful / Pending
                        </span>
                        <p className="text-xs text-rose-800 mt-0.5">
                          This order will not be processed until payment is completed. Complete the payment now to confirm collection or cancel this order.
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto shrink-0">
                      <button
                        type="button"
                        disabled={retryingOrderId === selectedOrder.id}
                        onClick={() => handleRetryPayment(selectedOrder)}
                        className="flex-1 sm:flex-initial px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-98 flex items-center justify-center gap-1.5"
                      >
                        {retryingOrderId === selectedOrder.id ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <CreditCard className="w-4 h-4" />
                        )}
                        <span>{retryingOrderId === selectedOrder.id ? 'Redirecting...' : 'Complete Payment (Pay Now)'}</span>
                      </button>
                      <button
                        type="button"
                        disabled={cancellingOrderId === selectedOrder.id}
                        onClick={() => handleCancelUnpaidOrder(selectedOrder)}
                        className="flex-1 sm:flex-initial px-4 py-2.5 bg-white border border-rose-300 text-rose-700 hover:bg-rose-100 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-98"
                      >
                        {cancellingOrderId === selectedOrder.id ? 'Cancelling...' : 'Cancel Order'}
                      </button>
                    </div>
                  </div>
                )}
                {/* Failed Attempt Alerts & Rescheduling */}
                {selectedOrder.status === 'pickup_failed' && (
                  <div className="p-4 sm:p-5 bg-rose-50 border border-rose-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
                    <div className="flex items-start sm:items-center gap-3.5">
                      <div className="w-11 h-11 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-md">
                        <AlertTriangle className="w-6 h-6 stroke-[2.2]" />
                      </div>
                      <div>
                        <span className="text-[11px] font-extrabold uppercase tracking-wider text-rose-900 block">
                          Collection Attempt Unsuccessful
                        </span>
                        <p className="text-xs text-rose-800 mt-0.5">
                          Reason: {(selectedOrder as any).lastPickupFailureReason?.replace(/_/g, ' ') || 'Courier was unable to reach you or access property'}.
                        </p>
                      </div>
                    </div>
                    {Boolean(onOpenRescheduleCancel) && (
                      <button
                        type="button"
                        onClick={() => onOpenRescheduleCancel(selectedOrder, 'reschedule')}
                        className="w-full sm:w-auto px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-98 shrink-0 text-center"
                      >
                        Reschedule Pickup Window
                      </button>
                    )}
                  </div>
                )}

                {selectedOrder.status === 'delivery_failed' && (
                  <div className="p-4 sm:p-5 bg-rose-50 border border-rose-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
                    <div className="flex items-start sm:items-center gap-3.5">
                      <div className="w-11 h-11 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-md">
                        <AlertTriangle className="w-6 h-6 stroke-[2.2]" />
                      </div>
                      <div>
                        <span className="text-[11px] font-extrabold uppercase tracking-wider text-rose-900 block">
                          Delivery Attempt Unsuccessful
                        </span>
                        <p className="text-xs text-rose-800 mt-0.5">
                          Reason: {(selectedOrder as any).lastDeliveryFailureReason?.replace(/_/g, ' ') || 'Courier was unable to complete delivery'}.
                        </p>
                      </div>
                    </div>
                    {Boolean(onOpenRescheduleCancel) && (
                      <button
                        type="button"
                        onClick={() => onOpenRescheduleCancel(selectedOrder, 'reschedule')}
                        className="w-full sm:w-auto px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-98 shrink-0 text-center"
                      >
                        Reschedule Delivery Window
                      </button>
                    )}
                  </div>
                )}

                {/* Collection Pickup Security PIN */}
                {Boolean(selectedOrder.pickup_pin || selectedOrder.pickup_otp) &&
                  !['pending_payment', 'payment_failed', 'cancelled'].includes(selectedOrder.status) &&
                  selectedOrder.paymentStatus !== 'Pending' &&
                  selectedOrder.paymentStatus !== 'Failed' &&
                  (selectedOrder.isPaid || selectedOrder.paymentStatus === 'Paid') &&
                  ['booking_confirmed', 'collection_scheduled', 'driver_assigned', 'pickup_in_progress'].includes(selectedOrder.status) && (
                  <div className="p-4 sm:p-5 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/80 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
                    <div className="flex items-start sm:items-center gap-3.5">
                      <div className="w-11 h-11 rounded-xl bg-[#002953] text-white flex items-center justify-center shrink-0 shadow-md">
                        <ShieldCheck className="w-6 h-6 stroke-[2.2]" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#002953]">
                            In-App Collection PIN
                          </span>
                          <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-200/70 text-blue-900 rounded-full">
                            In-App Only • No SMS
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5">
                          Share this 6-digit PIN with your driver when they arrive to collect your bags. Never shared via SMS.
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-center sm:items-end w-full sm:w-auto bg-white sm:bg-transparent p-3 sm:p-0 rounded-xl border sm:border-0 border-blue-100">
                      <span className="text-xs text-slate-400 font-medium mb-1.5">Your 6-digit PIN</span>
                      <div className="flex items-center gap-1.5">
                        {String(selectedOrder.pickup_pin || selectedOrder.pickup_otp || '').split('').map((char, i) => (
                          <span
                            key={i}
                            className="w-8 h-10 sm:w-9 sm:h-11 bg-white border-2 border-blue-300 text-[#002953] font-mono font-black text-xl rounded-xl flex items-center justify-center shadow-xs"
                          >
                            {char}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Leave at Door Delivery Banner */}
                {selectedOrder.deliveryInstructionType === 'LEAVE_AT_DOOR' && ['ready_for_delivery', 'waiting_for_driver', 'delivery_driver_assigned', 'package_collected_for_delivery', 'out_for_delivery', 'delivery_in_progress'].includes(selectedOrder.status) && (
                  <div className="p-4 sm:p-5 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl flex items-center gap-3.5 shadow-sm">
                    <div className="w-11 h-11 rounded-xl bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-md">
                      <Truck className="w-6 h-6 stroke-[2.2]" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-900">
                          Leave-at-Door Delivery Authorized
                        </span>
                        <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-200 text-amber-900 rounded-full">
                          Photo Verified • No PIN Required
                        </span>
                      </div>
                      <p className="text-xs text-amber-800 mt-0.5">
                        Your courier will safely leave your clean items at your doorstep, record mandatory timestamped photographic evidence and GPS proof, and complete delivery.
                      </p>
                    </div>
                  </div>
                )}

                {/* Delivery Security PIN */}
                {selectedOrder.deliveryInstructionType !== 'LEAVE_AT_DOOR' &&
                  Boolean(selectedOrder.delivery_pin || selectedOrder.delivery_otp) &&
                  !['delivered', 'completed', 'cancelled', 'pending_payment', 'payment_failed'].includes(selectedOrder.status) &&
                  selectedOrder.paymentStatus !== 'Pending' &&
                  selectedOrder.paymentStatus !== 'Failed' &&
                  (selectedOrder.isPaid || selectedOrder.paymentStatus === 'Paid') &&
                  !selectedOrder.delivery_pin_verified_at && (
                  <div className="p-4 sm:p-5 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200/80 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
                    <div className="flex items-start sm:items-center gap-3.5">
                      <div className="w-11 h-11 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-md">
                        <Key className="w-6 h-6 stroke-[2.2]" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-900">
                            In-App Delivery PIN
                          </span>
                          <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-200/70 text-emerald-900 rounded-full">
                            In-App Only • No SMS
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5">
                          Share this 4-digit PIN with your driver only after you have safely received your clean items.
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-center sm:items-end w-full sm:w-auto bg-white sm:bg-transparent p-3 sm:p-0 rounded-xl border sm:border-0 border-emerald-100">
                      <span className="text-xs text-slate-400 font-medium mb-1.5">Delivery PIN (4 digits)</span>
                      <div className="flex items-center gap-1.5">
                        {String(selectedOrder.delivery_pin || selectedOrder.delivery_otp || '').split('').map((char, i) => (
                          <span
                            key={i}
                            className="w-8 h-10 sm:w-9 sm:h-11 bg-white border-2 border-emerald-300 text-emerald-700 font-mono font-black text-xl rounded-xl flex items-center justify-center shadow-xs"
                          >
                            {char}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Pending Charge Card (if applicable) */}
                {selectedOrder.additionalCharge && selectedOrder.additionalCharge.status === 'pending' && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                        <AlertTriangle className="w-4 h-4 text-amber-700" />
                        <span>Intake Weigh-in Approval Required</span>
                      </div>
                      <p className="text-xs text-amber-800">
                        {selectedOrder.additionalCharge.reason} (+£{Number(selectedOrder.additionalCharge.additionalAmount || 0).toFixed(2)})
                      </p>
                    </div>
                    <button
                      onClick={() => onOpenAdditionalCharge(selectedOrder)}
                      className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-xs cursor-pointer shrink-0"
                    >
                      Review & Authorize
                    </button>
                  </div>
                )}

                {/* Separated Reschedule Options (Pickup vs. Delivery) */}
                {(() => {
                  const eligiblePickup = canReschedulePickup(selectedOrder);
                  const eligibleDelivery = canRescheduleDelivery(selectedOrder);

                  if (!eligiblePickup && !eligibleDelivery) return null;

                  return (
                    <div className="space-y-2.5">
                      {/* Pickup Reschedule */}
                      {eligiblePickup && (
                        <div className="p-4 bg-white border border-gray-100 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs shadow-xs">
                          <div>
                            <span className="font-bold text-gray-800 block">Need to change your pickup slot?</span>
                            <p className="text-gray-500 text-[11px]">Free changes up to 1 hour before scheduled pickup.</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => onOpenRescheduleCancel(selectedOrder, 'reschedule_pickup')}
                              className="px-3.5 py-1.5 bg-white border border-gray-200 hover:border-[#002953] text-gray-800 rounded-xl font-bold cursor-pointer transition-colors shadow-2xs"
                            >
                              Reschedule Pickup
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Delivery Reschedule */}
                      {eligibleDelivery && (
                        <div className="p-4 bg-white border border-gray-100 rounded-2xl flex flex-wrap items-center justify-between gap-3 text-xs shadow-xs">
                          <div>
                            <span className="font-bold text-gray-800 block">Need to change your delivery slot?</span>
                            <p className="text-gray-500 text-[11px]">Free changes anytime before clothes are out for delivery.</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => onOpenRescheduleCancel(selectedOrder, 'reschedule_delivery')}
                              className="px-3.5 py-1.5 bg-white border border-gray-200 hover:border-[#002953] text-gray-800 rounded-xl font-bold cursor-pointer transition-colors shadow-2xs"
                            >
                              Reschedule Delivery
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Dynamic Driver Contact Card */}
                {(() => {
                  const activeCourier = getActiveCourier(selectedOrder);
                  if (!activeCourier) return null;

                  return (
                    <div className="p-4 bg-[#e6f8ff] border border-[#cbd8ff] rounded-2xl flex items-center justify-between shadow-xs">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#002953] text-white flex items-center justify-center font-bold text-sm shadow-sm">
                          {activeCourier.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-gray-900 block">{activeCourier.name}</span>
                            <span className="px-1.5 py-0.5 bg-blue-100 text-[#002953] text-[9px] font-bold rounded-md">
                              {activeCourier.roleLabel}
                            </span>
                          </div>
                          <span className="text-[11px] text-gray-500">
                            {activeCourier.vehicle} • {activeCourier.rating} ★
                          </span>
                        </div>
                      </div>
                      {activeCourier.phone ? (
                        <a
                          href={`tel:${activeCourier.phone}`}
                          className="px-3 py-2 bg-white hover:bg-gray-50 text-[#002953] rounded-xl shadow-xs transition-colors border border-[#cbd8ff] flex items-center gap-1.5 font-bold text-xs cursor-pointer"
                          title={`Call ${activeCourier.roleLabel}`}
                        >
                          <Phone className="w-3.5 h-3.5 text-[#002953]" />
                          <span>Call Driver</span>
                        </a>
                      ) : (
                        <span className="text-[10px] text-gray-400 font-medium">Assigned</span>
                      )}
                    </div>
                  );
                })()}

                {/* Collection Slot & Delivery Address Logistics Card */}
                <div className="p-4 sm:p-5 bg-white rounded-2xl border border-gray-100 shadow-xs space-y-3">
                  <h3 className="text-xs font-extrabold text-gray-400 uppercase tracking-wider">
                    Collection & Delivery Logistics
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                    {/* Collection Slot info */}
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-[#e6f8ff] text-[#002953] flex items-center justify-center shrink-0">
                        <Calendar className="w-4 h-4 stroke-[1.8]" />
                      </div>
                      <div>
                        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
                          Collection Slot
                        </span>
                        <span className="text-xs font-bold text-gray-900 block mt-0.5">
                          {selectedOrder.pickupDate || 'Scheduled'}
                        </span>
                        <span className="text-xs text-gray-500">
                          {selectedOrder.pickupSlot || '10:00 AM – 12:00 PM'}
                        </span>
                        <span className="inline-block mt-1 text-[10px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                          {selectedOrder.pickupInstructionType === 'OUTSIDE' ? 'Collect Outside' : selectedOrder.pickupInstructionType === 'RECEPTION_PORTER' ? 'Reception/Porter' : 'Collect In Person'}
                        </span>
                      </div>
                    </div>

                    {/* Delivery Slot info */}
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
                        <Truck className="w-4 h-4 stroke-[1.8]" />
                      </div>
                      <div>
                        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
                          Delivery Window
                        </span>
                        <span className="text-xs font-bold text-gray-900 block mt-0.5">
                          {selectedOrder.deliveryDate || 'Scheduled Turnaround'}
                        </span>
                        <span className="text-xs text-gray-500">
                          {selectedOrder.deliverySlot || 'Standard Delivery'}
                        </span>
                        <span className={`inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded ${selectedOrder.deliveryInstructionType === 'LEAVE_AT_DOOR'
                          ? 'text-amber-800 bg-amber-50 border border-amber-200'
                          : 'text-indigo-700 bg-indigo-50'
                          }`}>
                          {selectedOrder.deliveryInstructionType === 'LEAVE_AT_DOOR' ? 'Leave at Door (Photo Proof)' : selectedOrder.deliveryInstructionType === 'RECEPTION_PORTER' ? 'Reception/Porter' : 'Deliver In Person (PIN)'}
                        </span>
                      </div>
                    </div>

                    {/* Address info */}
                    <div className="sm:col-span-2 flex items-start gap-3 pt-1 border-t border-gray-100">
                      <div className="w-9 h-9 rounded-xl bg-[#e6f8ff] text-[#002953] flex items-center justify-center shrink-0">
                        <MapPin className="w-4 h-4 stroke-[1.8]" />
                      </div>
                      <div>
                        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
                          Service Address
                        </span>
                        <span className="text-xs font-semibold text-gray-800 block mt-0.5 leading-snug">
                          {selectedOrder.address}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Order Timeline & Journey Accordion */}
                {selectedJourney && (
                  <div id="order-timeline-accordion" className="bg-white rounded-2xl border border-gray-100 shadow-xs overflow-hidden transition-all">
                    {/* Accordion Header */}
                    <button
                      type="button"
                      onClick={() => setIsTimelineOpen(!isTimelineOpen)}
                      className="w-full p-4 sm:p-5 flex items-center justify-between text-left hover:bg-slate-50/70 transition-colors cursor-pointer gap-3"
                      aria-expanded={isTimelineOpen}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 ${selectedJourney.isAllCompleted
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-[#e6f8ff] text-[#002953]'
                          }`}>
                          {selectedJourney.isAllCompleted ? (
                            <CheckCircle2 className="w-5 h-5 stroke-[2.2]" />
                          ) : (
                            <Navigation className="w-5 h-5 text-[#01BEFE]" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-xs sm:text-sm font-extrabold text-[#002953] uppercase tracking-wider">
                              Order Timeline & Live Status
                            </h3>
                            <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider ${selectedJourney.isAllCompleted
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-blue-100 text-[#002953]'
                              }`}>
                              {selectedJourney.isAllCompleted ? 'Completed 🎉' : `${selectedJourney.completedCount}/7 Stages`}
                            </span>
                          </div>
                          <p className="text-[11px] sm:text-xs text-gray-500 truncate mt-0.5">
                            {selectedJourney.isAllCompleted
                              ? 'All 7 stages from booking confirmation to doorstep delivery completed'
                              : `Current Stage: ${selectedJourney.currentStage.title}`}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] font-bold text-gray-400 hidden sm:inline">
                          {isTimelineOpen ? 'Collapse' : 'Expand Timeline'}
                        </span>
                        <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center bg-gray-50 text-gray-600 transition-transform duration-200 ${isTimelineOpen ? 'rotate-180 bg-blue-50 text-[#002953]' : ''
                          }`}>
                          <ChevronDown className="w-4 h-4" />
                        </div>
                      </div>
                    </button>

                    {/* Accordion Expandable Content */}
                    {isTimelineOpen && (
                      <div className="px-4 pb-5 sm:px-6 sm:pb-6 pt-2 border-t border-gray-100 space-y-5">
                        {/* Celebratory Banner or Active Journey Progress Card */}
                        {selectedJourney.isAllCompleted ? (
                          <div className="p-4 sm:p-5 bg-gradient-to-br from-emerald-500/15 via-teal-500/10 to-emerald-500/5 border-2 border-emerald-500/40 rounded-2xl shadow-sm space-y-3">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-md shrink-0">
                                  <CheckCircle2 className="w-6 h-6" />
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <h4 className="text-sm sm:text-base font-black text-emerald-950">
                                      Order Completed 🎉
                                    </h4>
                                  </div>
                                  <p className="text-xs text-emerald-800 mt-0.5">
                                    All 7 stages from booking confirmation to doorstep delivery have been completed successfully.
                                  </p>
                                </div>
                              </div>
                              <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto bg-white/80 p-2 sm:p-0 sm:bg-transparent rounded-lg sm:rounded-none">
                                <span className="text-[10px] uppercase font-bold text-emerald-700">Finished</span>
                                <span className="text-xs font-bold font-mono text-emerald-900">
                                  {formatTimelineDate(selectedJourney.stages[6].timestamp || selectedOrder.delivered_at) || 'Completed'}
                                </span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="p-4 bg-gradient-to-r from-blue-50/90 to-indigo-50/70 border border-blue-200/80 rounded-2xl space-y-3 shadow-xs">
                            <div className="space-y-1.5 pt-1">
                              <div className="flex justify-between items-center text-xs">
                                <span className="font-extrabold text-[#002953]">
                                  {selectedJourney.currentStage.title}
                                </span>
                                <span className="text-slate-500 font-bold">
                                  {selectedJourney.completedCount} of 7 Completed ({Math.round((selectedJourney.completedCount / 7) * 100)}%)
                                </span>
                              </div>
                              <div className="w-full bg-blue-200/60 rounded-full h-2 overflow-hidden">
                                <div
                                  className="bg-gradient-to-r from-[#002953] to-[#01BEFE] h-2 rounded-full transition-all duration-500"
                                  style={{ width: `${Math.max(12, Math.round((selectedJourney.completedCount / 7) * 100))}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Horizontal Journey Stepper (Responsive & Fitted on Mobile) */}
                        <div className="pt-2 pb-2 w-full">
                          <div className="w-full pb-2 pt-2">
                            <div className="flex items-start w-full justify-between relative">
                              {selectedJourney.stages.map((step, idx) => {
                                const isDone = step.status === 'completed';
                                const isCurrent = step.status === 'in_progress';
                                const isLast = idx === selectedJourney.stages.length - 1;
                                const IconComponent = step.icon;
                                const formattedTime = formatCompactTimelineDate(step.timestamp);

                                return (
                                  <div key={step.id} className="flex-1 flex flex-col items-center text-center relative group px-0.5">
                                    {/* Connecting Line to next step */}
                                    {!isLast && (
                                      <div
                                        className={`absolute top-3 sm:top-4.5 left-[50%] right-[-50%] h-[1.5px] sm:h-[2px] -z-0 transition-colors ${
                                          isDone ? 'bg-emerald-500' : 'bg-slate-200'
                                        }`}
                                      />
                                    )}

                                    {/* Step Icon (Green when completed) */}
                                    <div
                                      className={`relative z-10 w-6 h-6 sm:w-9 sm:h-9 rounded-full border-[1.5px] sm:border-2 flex items-center justify-center transition-all shrink-0 ${
                                        isDone
                                          ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs shadow-emerald-600/30'
                                          : isCurrent
                                            ? 'bg-[#002953] border-[#002953] text-white ring-2 sm:ring-4 ring-blue-100 animate-pulse'
                                            : 'bg-white border-slate-300 text-slate-400'
                                      }`}
                                    >
                                      {isDone ? (
                                        <Check className="w-3 h-3 sm:w-4 sm:h-4 stroke-[3]" />
                                      ) : (
                                        <IconComponent className="w-3 h-3 sm:w-4 sm:h-4 stroke-[2]" />
                                      )}
                                    </div>

                                    {/* Step Title & Time only */}
                                    <div className="mt-1 sm:mt-2 space-y-0.5 w-full">
                                      <h4
                                        className={`text-[9px] sm:text-xs font-bold leading-tight break-words hyphens-auto ${
                                          isDone
                                            ? 'text-gray-900'
                                            : isCurrent
                                              ? 'text-[#002953] font-extrabold'
                                              : 'text-gray-400'
                                        }`}
                                      >
                                        <span className="block sm:hidden">{step.shortTitle || step.title}</span>
                                        <span className="hidden sm:block">{step.title}</span>
                                      </h4>

                                      {formattedTime && (
                                        <p className="text-[8px] sm:text-[11px] text-slate-500 font-medium leading-tight">
                                          {formattedTime}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* In-App Helper Card for OTP verification during pickup if active */}
                          {selectedJourney.stages.find(s => s.id === 'pickup_completed')?.status === 'in_progress' &&
                            (selectedOrder.pickup_pin || selectedOrder.pickup_otp) &&
                            !['pending_payment', 'payment_failed', 'cancelled'].includes(selectedOrder.status) &&
                            (selectedOrder.isPaid || selectedOrder.paymentStatus === 'Paid') && (
                            <div className="mt-4 p-3 bg-white border border-blue-200 rounded-xl flex items-center justify-between shadow-2xs">
                              <div className="flex items-center gap-2">
                                <ShieldCheck className="w-4 h-4 text-[#002953]" />
                                <span className="text-xs font-bold text-[#002953]">Your Pickup PIN:</span>
                              </div>
                              <div className="flex items-center gap-1">
                                {String(selectedOrder.pickup_pin || selectedOrder.pickup_otp || '').split('').map((char, i) => (
                                  <span
                                    key={i}
                                    className="w-6 h-8 sm:w-7 sm:h-9 bg-blue-50 border border-blue-200 text-[#002953] font-mono font-black text-sm sm:text-base rounded-md sm:rounded-lg flex items-center justify-center shadow-2xs"
                                  >
                                    {char}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* In-App Helper Card for Delivery PIN verification if active */}
                          {selectedOrder.deliveryInstructionType !== 'LEAVE_AT_DOOR' &&
                            !['delivered', 'completed', 'cancelled', 'pending_payment', 'payment_failed'].includes(selectedOrder.status) &&
                            (selectedOrder.isPaid || selectedOrder.paymentStatus === 'Paid') &&
                            !selectedOrder.delivery_pin_verified_at &&
                            Boolean(selectedOrder.delivery_pin || selectedOrder.delivery_otp) &&
                            (
                              selectedJourney.stages.find(s => s.id === 'out_for_delivery')?.status === 'in_progress' ||
                              selectedJourney.stages.find(s => s.id === 'delivered_at_doorstep')?.status === 'in_progress' ||
                              ['ready_for_delivery', 'delivery_driver_assigned', 'package_collected_for_delivery', 'out_for_delivery', 'delivery_in_progress'].includes(selectedOrder.status)
                            ) && (
                            <div className="mt-4 p-3 bg-white border border-emerald-200 rounded-xl flex items-center justify-between shadow-2xs">
                              <div className="flex items-center gap-2">
                                <Key className="w-4 h-4 text-emerald-700" />
                                <span className="text-xs font-bold text-emerald-900">Your Delivery PIN:</span>
                              </div>
                              <div className="flex items-center gap-1">
                                {String(selectedOrder.delivery_pin || selectedOrder.delivery_otp || '').split('').map((char, i) => (
                                  <span
                                    key={i}
                                    className="w-6 h-8 sm:w-7 sm:h-9 bg-emerald-50 border border-emerald-200 text-emerald-700 font-mono font-black text-sm sm:text-base rounded-md sm:rounded-lg flex items-center justify-center shadow-2xs"
                                  >
                                    {char}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Items List */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-extrabold text-gray-400 uppercase tracking-wider">Garment Care Items & Inspection</h3>
                    {orderItems.length > 0 && (
                      <span className="text-[11px] font-bold text-[#002953] bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                        {orderItems.length} Garments Tracked
                      </span>
                    )}
                  </div>

                  <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden divide-y divide-gray-100 shadow-xs">
                    {orderItems.length > 0 ? (
                      orderItems.map((item: any, idx: number) => {
                        const isQcPassed = item.qcStatus === 'PASSED' || item.qcStatus === 'pass';
                        const isRewash = item.qcStatus === 'REWASH' || item.qcStatus === 'fail' || item.rewashRequired;
                        return (
                          <div key={idx} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                            <div className="flex items-start sm:items-center gap-3">
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isRewash ? 'bg-purple-50 text-purple-600' : isQcPassed ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-50 text-gray-500'}`}>
                                <Shirt className="w-4 h-4" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-gray-900">{item.description || item.category || 'Garment'}</span>
                                  {item.color && <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{item.color}</span>}
                                  {item.brand && <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{item.brand}</span>}
                                </div>
                                <div className="flex items-center gap-2 text-[11px] text-gray-400 mt-0.5">
                                  <span>Stage: <strong className="text-gray-700 capitalize">{(item.currentStage || 'Processing').replace(/_/g, ' ')}</strong></span>
                                  {item.conditionNotes && (
                                    <span>• Condition: <em className="text-amber-700">{item.conditionNotes}</em></span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${isRewash
                                ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                : isQcPassed
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                  : 'bg-amber-100 text-amber-800 border border-amber-200'
                                }`}>
                                {isRewash ? 'Rewash Required' : isQcPassed ? 'QC Passed' : 'Inspection Pending'}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      (selectedOrder.items || []).map((item, idx) => (
                        <div key={idx} className="p-4 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-gray-500 shrink-0">
                              <Package className="w-4 h-4" />
                            </div>
                            <div>
                              <span className="font-bold text-gray-900 block">{item.name}</span>
                              <span className="text-gray-400 text-[11px]">Qty: {item.quantity || 1} × £{Number(item.price || 0).toFixed(2)}</span>
                            </div>
                          </div>
                          <span className="font-extrabold text-gray-900">
                            £{(Number(item.quantity || 1) * Number(item.price || 0)).toFixed(2)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Pricing Summary */}
                <div className="p-5 bg-white rounded-2xl border border-gray-100 space-y-2.5 text-xs shadow-xs">
                  <div className="flex justify-between text-gray-500">
                    <span>Subtotal</span>
                    <span>£{Number(selectedOrder.total ?? (selectedOrder as any).total_price ?? (selectedOrder as any).amount ?? 0).toFixed(2)}</span>
                  </div>
                  {selectedOrder.additionalCharge && selectedOrder.additionalCharge.status === 'paid' && (
                    <div className="flex justify-between text-amber-800 font-semibold">
                      <span>Additional Intake Weight Charge</span>
                      <span>+£{Number(selectedOrder.additionalCharge.additionalAmount || 0).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-gray-500">
                    <span>Collection & Next-Day Delivery</span>
                    <span className="text-emerald-600 font-bold">FREE</span>
                  </div>
                  <div className="pt-2 border-t border-gray-100 flex justify-between text-sm font-extrabold text-gray-900">
                    <span>Total Paid ({selectedOrder.paymentMethod?.toUpperCase() || 'CARD'})</span>
                    <span className="text-[#002953]">
                      £{((Number(selectedOrder.total ?? (selectedOrder as any).total_price ?? (selectedOrder as any).amount ?? 0)) + (selectedOrder.additionalCharge?.status === 'paid' ? Number(selectedOrder.additionalCharge.additionalAmount || 0) : 0)).toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Action Buttons: Cancel Order & Repeat Order */}
                <div className="pt-2 pb-6 md:pb-2 space-y-2">
                  {Boolean(onOpenRescheduleCancel) && !['washing', 'drying', 'folding_steaming', 'qc_ready', 'ready_for_delivery', 'out_for_delivery', 'delivered', 'cancelled'].includes(selectedOrder.status) && (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenRescheduleCancel(selectedOrder, 'cancel');
                      }}
                      className="w-full py-3 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                    >
                      <XCircle className="w-4 h-4 text-red-600" />
                      <span>Cancel This Order</span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      onRepeatOrder(selectedOrder);
                      setSelectedOrderIdState(null);
                    }}
                    className="w-full py-3.5 bg-gradient-to-r from-[#002953] to-[#1e4ab8] hover:from-[#002953] hover:to-[#15388F] text-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Repeat This Exact Order</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Order Rating Modal */}
      <OrderRatingModal
        isOpen={ratingModalOpen}
        order={ratingModalOrder}
        onClose={() => {
          setRatingModalOpen(false);
          setRatingModalOrder(null);
        }}
        onRatingSubmitted={(orderId, rating, feedback) => {
          if (ratingModalOrder && (ratingModalOrder.id === orderId || (ratingModalOrder as any)._id === orderId)) {
            setRatingModalOrder({
              ...ratingModalOrder,
              rating: rating ?? undefined,
              ratingFeedback: feedback,
              ratingSubmittedAt: new Date().toISOString(),
              customerRating: {
                rating,
                feedback,
                createdAt: new Date().toISOString(),
              },
            });
          }
        }}
      />
    </div>
  );
};
