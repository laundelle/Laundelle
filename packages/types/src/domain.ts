export type ActiveTab =
  | 'home'
  | 'services'
  | 'orders'
  | 'support'
  | 'notifications'
  | 'account'
  | 'assistant'
  | 'admin';

export interface ServiceItem {
  id: string;
  name: string;
  category: 'wash_fold' | 'dry_cleaning' | 'ironing' | 'bedding' | 'shoes' | 'express';
  categoryLabel: string;
  description: string;
  price: number;
  unit: string; // e.g. "per kg", "per piece", "per pair", "per bag"
  turnaround: string; // e.g. "24 Hours", "Same Day", "48 Hours"
  image: string;
  popular?: boolean;
  minQuantity?: number;
  washOptions?: string[];
  enabled?: boolean;
}

export interface ServiceCustomisation {
  detergent: 'Standard' | 'Premium Eco-Enzyme';
  softener: 'Standard' | 'Premium Silk Touch';
  fragrance: 'No Fragrance / Hypoallergenic' | 'Fresh Linen' | 'Floral Breeze';
  foldingPreference: 'Standard Flat Fold' | 'Hanger Preferred';
  stainTreatment: boolean;
  expressSpeed: 'Standard 48h' | 'Express 24h';
  specialInstructions?: string;
}

export interface CartItem {
  id: string;
  serviceId: string;
  name: string;
  price: number;
  unit: string;
  quantity: number; // kg or item count or bags
  bagsCount?: number;
  customisation?: ServiceCustomisation;
  specialInstructions?: string;
  selectedOption?: string;
  image?: string;
}

export type OrderStatus =
  | 'booking_confirmed'
  | 'order_confirmed'
  | 'collection_scheduled'
  | 'laundry_collected'
  | 'received_at_facility'
  | 'washing'
  | 'in_wash'
  | 'drying'
  | 'folding_steaming'
  | 'sorting'
  | 'ironing'
  | 'folding'
  | 'quality_check'
  | 'in_processing'
  | 'ready_for_delivery'
  | 'out_for_delivery'
  | 'delivered'
  | 'completed'
  | 'cancelled'
  | 'pickup_scheduled'
  | 'picked_up'
  | 'in_cleaning'
  | 'driver_assigned'
  | 'pickup_in_progress'
  | 'in_transit_to_plant'
  | 'awaiting_customer_approval'
  | 'additional_charge_rejected'
  | 'delivery_driver_assigned'
  | 'delivery_driver_accepted'
  | 'package_collected_for_delivery'
  | 'pending_payment'
  | 'payment_failed'
  | 'pickup_failed'
  | 'delivery_attempted'
  | 'delivery_failed'
  | 'rewash_required';

export type PickupInstructionType = 'IN_PERSON' | 'OUTSIDE' | 'RECEPTION_PORTER';
export type DeliveryInstructionType = 'IN_PERSON' | 'LEAVE_AT_DOOR' | 'RECEPTION_PORTER';

export interface OrderItem {
  id: string;
  orderId: string;
  category: string;
  description: string;
  color?: string;
  brand?: string;
  material?: string;
  serviceType: string;
  quantity: number;
  conditionAtIntake?: string;
  conditionNotes?: string;
  damagePhotos?: string[];
  specialInstructions?: string;
  processingRequirements?: string;
  currentStage: string;
  qcStatus: 'pending' | 'pass' | 'fail' | 'rewash' | 'PENDING' | 'PASSED' | 'REWASH' | 'PASS' | 'FAIL';
  rewashRequired: boolean;
  createdAt: string;
  updatedAt: string;
}

export type PickupFailureReason =
  | 'customer_unavailable'
  | 'customer_cancelled_at_door'
  | 'wrong_address'
  | 'access_blocked'
  | 'unsafe_location'
  | 'driver_delay'
  | 'customer_refused'
  | 'other';

export interface PickupAttemptRecord {
  id: string;
  publicId?: string;
  orderId: string;
  driverId: string;
  driverName?: string;
  attemptTimestamp: string;
  success: boolean;
  reason?: PickupFailureReason;
  notes?: string;
  photoUrl?: string;
  location?: { lat: number; lng: number };
  pieceCount?: number;
  bagQr?: string;
  instructionUsed?: PickupInstructionType;
  createdAt: string;
}

export type DeliveryFailureReason =
  | 'customer_unavailable'
  | 'access_blocked'
  | 'wrong_address'
  | 'unsafe_location'
  | 'reception_unavailable'
  | 'customer_refused'
  | 'driver_delay'
  | 'other';

export interface DeliveryAttemptRecord {
  id: string;
  publicId?: string;
  orderId: string;
  driverId: string;
  driverName?: string;
  attemptTimestamp: string;
  success: boolean;
  reason?: DeliveryFailureReason;
  notes?: string;
  photoUrl?: string;
  location?: { lat: number; lng: number };
  instructionUsed?: DeliveryInstructionType;
  verificationMethod?: 'PIN' | 'PHOTO' | 'RECEPTION_SIGNATURE';
  recipientName?: string;
  createdAt: string;
}

export type CodReconciliationStatus = 'COLLECTED' | 'PARTIALLY_COLLECTED' | 'FAILED' | 'RECONCILED' | 'DISCREPANCY';

export interface CodCollectionRecord {
  id: string;
  publicId?: string;
  codRecordId?: string;
  orderId: string;
  orderNumber?: string;
  amountExpected: number;
  amountCollected: number;
  discrepancyAmount: number;
  paymentMethod: string;
  driverId: string;
  driverName?: string;
  collectedAt: string;
  receiptReference?: string;
  notes?: string;
  reconciliationStatus: CodReconciliationStatus;
  reconciledBy?: string;
  reconciledAt?: string;
  idempotencyKey?: string;
  createdAt: string;
}

export type EvidenceType =
  | 'pickup_photo'
  | 'delivery_photo'
  | 'intake_photo'
  | 'scale_photo'
  | 'damage_photo'
  | 'qc_photo'
  | 'signature'
  | 'incident_attachment';

export interface EvidenceRecord {
  id: string;
  publicId?: string;
  evidenceId?: string;
  fileId: string;
  orderId: string;
  type: EvidenceType;
  uploadedBy: string;
  uploadedByRole: string;
  uploadedAt: string;
  mimeType: string;
  size: number;
  storageKey?: string;
  url: string;
  checksum?: string;
  retentionUntil?: string;
  createdAt: string;
}

export type SlaStatus = 'ON_TIME' | 'AT_RISK' | 'BREACHED' | 'COMPLETED_ON_TIME' | 'COMPLETED_LATE';

export interface OrderSla {
  status: SlaStatus;
  turnaroundType: 'standard_48h' | 'express_24h';
  deadlineAt: string;
  warningAt: string; // 4 hours before deadline
  timeRemainingMinutes: number;
  isAtRisk: boolean;
  isBreached: boolean;
  breachedAt?: string;
  breachReason?: string;
  responsibleStage?: string;
  calculatedAt: string;
}

export type OperationalExceptionType =
  | 'pickup_failed'
  | 'delivery_failed'
  | 'additional_charge_pending'
  | 'additional_charge_rejected'
  | 'qc_rewash'
  | 'missing_garment'
  | 'damaged_garment'
  | 'SLA_at_risk'
  | 'SLA_breached'
  | 'payment_failed'
  | 'QR_mismatch'
  | 'PIN_locked'
  | 'machine_failure'
  | 'customer_complaint'
  | 'COD_discrepancy';

export type OperationalExceptionPriority = 'low' | 'medium' | 'high' | 'urgent' | 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type OperationalExceptionStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'ESCALATED' | 'CANCELLED';

export interface OperationalException {
  id: string;
  publicId?: string;
  orderId: string;
  orderNumber?: string;
  type: OperationalExceptionType;
  priority: OperationalExceptionPriority;
  status: OperationalExceptionStatus;
  createdAt: string;
  assignedTo?: string;
  assignedToName?: string;
  plantId?: string;
  description: string;
  evidence?: {
    photoUrls?: string[];
    notes?: string;
    [key: string]: any;
  };
  resolution?: {
    action: string;
    notes: string;
    resolvedBy: string;
    resolvedByName?: string;
    resolvedAt: string;
  };
  updatedAt: string;
}

export type MachineRunStatus =
  | 'AVAILABLE'
  | 'RUNNING'
  | 'COMPLETED'
  | 'MAINTENANCE'
  | 'OUT_OF_SERVICE'
  | 'SCHEDULED'
  | 'INTERRUPTED'
  | 'FAILED'
  | 'CANCELLED';

export type MachineType = 'WASHER' | 'DRYER' | 'PRESS' | 'IRONING' | 'OTHER' | 'Washer' | 'Dryer' | 'Steam Press' | 'Automatic Folder';
export type MachineStatus = 'AVAILABLE' | 'RUNNING' | 'MAINTENANCE' | 'OUT_OF_SERVICE' | 'FAULT' | 'available' | 'running' | 'maintenance' | 'fault';

export interface Machine {
  id: string;
  publicId?: string;
  plantId: string;
  machineCode: string;
  type: MachineType;
  machineType?: string;
  name?: string;
  capacityKg: number;
  status: MachineStatus;
  manufacturer?: string;
  model?: string;
  maintenanceStatus?: string;
  lastMaintenanceAt?: string;
  nextMaintenanceAt?: string;
  downtimeStartedAt?: string;
  downtimeEndedAt?: string;
  totalDowntimeMinutes?: number;
  currentOrderId?: string | null;
  currentRunId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  updated_at?: string;
}

export interface MachineRun {
  id: string;
  publicId?: string;
  runId: string;
  machineId: string;
  machineCode?: string;
  plantId: string;
  orderIds: string[];
  orderItemIds?: string[];
  processorId: string;
  processorName?: string;
  machineType: 'Washer' | 'Dryer' | 'Steam Press' | 'Automatic Folder' | string;
  cycleType: string;
  temperature?: string;
  durationMinutes?: number;
  startedAt: string;
  expectedEndAt: string;
  actualEndAt?: string;
  status: MachineRunStatus;
  notes?: string;
  interruptionReason?: string;
  transferredToRunId?: string;
  transferredFromRunId?: string;
  createdAt: string;
  updatedAt?: string;
}

// ---------------------------------------------------------------------------
// P1: Notification Types
// ---------------------------------------------------------------------------
export type NotificationChannel = 'in_app' | 'push' | 'email' | 'sms' | 'whatsapp';
export type NotificationStatus = 'PENDING' | 'PROCESSING' | 'SENT' | 'DELIVERED' | 'FAILED' | 'CANCELLED';

export interface NotificationRecord {
  id: string;
  publicId?: string;
  notificationId?: string;
  userId: string;
  orderId?: string;
  type: string;
  channel: NotificationChannel;
  title: string;
  body: string;
  status: NotificationStatus;
  provider?: string;
  providerMessageId?: string;
  attemptCount: number;
  maxAttempts?: number;
  scheduledAt?: string;
  sentAt?: string;
  deliveredAt?: string;
  failedAt?: string;
  failureReason?: string;
  idempotencyKey?: string;
  metadata?: any;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationTemplate {
  id: string;
  eventType: string;
  channel: NotificationChannel;
  subject?: string;
  body: string;
  variables: string[];
  enabled: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface UserNotificationPreferences {
  inApp: boolean;
  push: boolean;
  email: boolean;
  sms: boolean;
  whatsapp: boolean;
  marketingEmails: boolean;
  orderUpdates: boolean;
}

// ---------------------------------------------------------------------------
// P1: GDPR & Data Retention Types
// ---------------------------------------------------------------------------
export type RetentionDataType =
  | 'customer_data'
  | 'operational_photos'
  | 'gps_records'
  | 'delivery_evidence'
  | 'pickup_evidence'
  | 'support_attachments'
  | 'notification_logs'
  | 'audit_logs'
  | 'payment_records'
  | 'machine_records';

export type RetentionDeletionStrategy = 'HARD_DELETE' | 'ANONYMIZE_REDACT' | 'ARCHIVE_COLD';

export interface DataRetentionPolicy {
  dataType: RetentionDataType;
  retentionPeriodDays: number;
  legalBasis: string;
  deletionStrategy: RetentionDeletionStrategy;
  enabled: boolean;
  description?: string;
}

export type PrivacyRequestType = 'DELETION' | 'EXPORT' | 'CORRECTION' | 'ACCESS';
export type PrivacyRequestStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'REJECTED';

export interface PrivacyRequest {
  id: string;
  publicId?: string;
  requestId?: string;
  userId: string;
  userEmail?: string;
  requestType: PrivacyRequestType;
  status: PrivacyRequestStatus;
  requestedAt: string;
  completedAt?: string;
  reason?: string;
  rejectionReason?: string;
  exportUrl?: string;
  details?: any;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// P1: Secure File Storage Types
// ---------------------------------------------------------------------------
export type FileType =
  | 'pickup_photo'
  | 'delivery_photo'
  | 'intake_photo'
  | 'scale_photo'
  | 'damage_photo'
  | 'qc_photo'
  | 'incident_attachment'
  | 'signature'
  | 'customer_attachment';

export interface FileRecord {
  id?: string;
  publicId?: string;
  evidenceId?: string;
  fileId: string;
  orderId?: string;
  entityType?: 'order' | 'incident' | 'machine' | 'user' | string;
  entityId?: string;
  fileType: FileType;
  storageKey: string;
  url?: string;
  mimeType: string;
  size: number;
  checksum: string;
  checksumSha256?: string;
  uploadedBy: string;
  uploadedByRole?: string;
  uploadedAt: string;
  retentionUntil?: string;
  status: 'ACTIVE' | 'ARCHIVED' | 'PURGED';
  metadata?: any;
}

// ---------------------------------------------------------------------------
// P1: Audit Chaining & Integrity
// ---------------------------------------------------------------------------
export interface AuditEventRecord {
  eventId: string;
  actorId: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: any;
  after?: any;
  reason?: string;
  ipAddress?: string;
  userAgent?: string;
  timestamp: string;
  previousHash: string;
  currentHash: string;
  metadata?: any;
}

// ---------------------------------------------------------------------------
// P1: Multi-Stage Plant Capacity
// ---------------------------------------------------------------------------
export type PlantStage =
  | 'intake'
  | 'washing'
  | 'drying'
  | 'ironing'
  | 'folding'
  | 'qc'
  | 'packaging'
  | 'delivery';

export interface PlantStageCapacity {
  stage: PlantStage;
  stageLabel: string;
  currentLoadKg: number;
  maxCapacityKg: number;
  utilizationPercent: number;
  bottleneck: boolean;
  activeItemsCount: number;
}

export interface PlantStaffCapacity {
  drivers: {
    total: number;
    available: number;
    busy: number;
    offline: number;
  };
  processors: {
    total: number;
    available: number;
    busy: number;
    offline: number;
  };
}

export interface PlantCapacityReport {
  plantId: string;
  plantName: string;
  calculatedAt: string;
  overallUtilizationPercent: number;
  currentBottleneck: PlantStage;
  bottleneckStage?: PlantStage;
  bottleneckDescription: string;
  stages: Record<PlantStage, PlantStageCapacity>;
  staff: PlantStaffCapacity;
  expressOrdersToday: number;
  expressCapacityLimit: number;
  expressAvailable: boolean;
  alerts: Array<{
    severity: 'warning' | 'critical';
    message: string;
    stage?: PlantStage;
  }>;
}

// ---------------------------------------------------------------------------
// P1: Subscription Lifecycle Types
// ---------------------------------------------------------------------------
export type SubscriptionStatus =
  | 'TRIAL'
  | 'ACTIVE'
  | 'PAUSED'
  | 'PAST_DUE'
  | 'CANCELLED'
  | 'EXPIRED';

export type SubscriptionPlanId = 'bronze_starter' | 'silver_essential' | 'gold_premium';

export interface SubscriptionPlan {
  id: SubscriptionPlanId;
  name: string;
  priceMonthly: number;
  allowanceKgPerMonth: number;
  allowanceBagsPerMonth: number;
  overageRatePerKg: number;
  turnaroundHours: number;
  features: string[];
}

export interface UserSubscription {
  id: string;
  publicId?: string;
  subscriptionId?: string;
  customerId: string;
  customerEmail?: string;
  planId: SubscriptionPlanId;
  planName: string;
  status: SubscriptionStatus;
  billingCycle: 'monthly' | 'yearly';
  priceMonthly: number;
  allowanceKgPerMonth: number;
  allowanceBagsPerMonth: number;
  usedKgCurrentPeriod: number;
  usedBagsCurrentPeriod: number;
  overageRatePerKg: number;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  nextBillingAt: string;
  nextPickupDate?: string;
  pickupDayOfWeek?: string;
  pickupSlot?: string;
  pickupAddressId?: string;
  stripeSubscriptionId?: string;
  stripeCustomerId?: string;
  cancelAtPeriodEnd?: boolean;
  cancellationReason?: string;
  pausedAt?: string;
  resumedAt?: string;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderTimeline {
  status: OrderStatus;
  label: string;
  time?: string;
  completed: boolean;
  current?: boolean;
}

export interface AdditionalCharge {
  id: string;
  originalAmount: number;
  updatedAmount: number;
  additionalAmount: number;
  reason: string;
  status: 'pending' | 'accepted' | 'rejected' | 'paid';
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionAction?: string;
}

export interface OrderCustomerRating {
  rating?: number | null; // 1 to 5 stars
  feedback?: string;
  createdAt?: string;
  customerName?: string;
}

export interface Order {
  id: string;
  publicId?: string;
  orderNumber?: string;
  userId?: string;
  user_id?: string;
  createdAt: string;
  status: OrderStatus;
  statusLabel: string;
  items: CartItem[];
  itemCount: number;
  weightKg?: number;
  bagsCount?: number;
  customisation?: ServiceCustomisation;
  subtotal: number;
  additionsTotal?: number;
  discount: number;
  tax: number;
  collectionFee: number;
  deliveryFee: number;
  expressFee: number;
  total: number;
  pickupDate: string;
  pickupSlot?: string;
  pickupTime?: string;
  deliveryDate: string;
  deliverySlot?: string;
  deliveryTime?: string;
  address: string;
  addressLabel: string;
  postcode?: string;
  pickup_otp?: string;
  delivery_otp?: string;
  pickup_pin?: string;
  delivery_pin?: string;
  pickup_pin_hash?: string | null;
  pickup_pin_salt?: string | null;
  pickup_pin_enc?: string | null;
  pickup_pin_attempts?: number;
  pickup_pin_locked?: boolean;
  pickup_pin_expires_at?: string | null;
  pickup_pin_verified_at?: string | null;
  delivery_pin_hash?: string | null;
  delivery_pin_salt?: string | null;
  delivery_pin_enc?: string | null;
  delivery_pin_attempts?: number;
  delivery_pin_locked?: boolean;
  delivery_pin_expires_at?: string | null;
  delivery_pin_verified_at?: string | null;
  delivered_at?: string;
  ready_for_delivery_at?: string;
  coordinates?: { lat: number; lng: number; accuracy?: number };
  collectionInstructions?: string;
  pickupInstruction?: string;
  deliveryInstruction?: string;
  driverTip?: number;
  serviceFee?: number;
  smallOrderFee?: number;
  contactDetails?: {
    accountType?: 'individual' | 'company';
    firstName?: string;
    lastName?: string;
    companyName?: string;
    phone?: string;
    email?: string;
  };
  paymentMethod: string;
  paymentStatus: 'Paid' | 'Pending' | 'Failed' | 'Cash on Delivery';
  isPaid?: boolean;
  declaredItemCount?: number;
  promoCodeApplied?: string;
  couponCode?: string;
  coupon_code?: string;
  additionalCharge?: AdditionalCharge;
  driver?: {
    name: string;
    phone: string;
    vehicle: string;
    rating: number;
    avatar: string;
    currentLocation?: { lat: number; lng: number };
    estimatedArrival?: string;
  };
  timeline?: OrderTimeline[];
  timeline_events?: Array<{
    event: string;
    label?: string;
    actor?: string;
    actorId?: string;
    timestamp?: string;
    [key: string]: any;
  }>;
  intake?: {
    intakeByStaffId?: string;
    intakeAt?: string;
    photoUrls?: string[];
    bagCondition?: string;
    restrictedItems?: string[];
  };
  package?: {
    package_id?: string;
    qr_code?: string;
    attached_at?: string;
    status?: string;
  };
  qc?: {
    passed?: boolean;
    checkedByStaffId?: string;
    checkedAt?: string;
    notes?: string;
  };
  qr_tracking?: {
    qrTagId?: string;
    collectedAt?: string;
    collectedByDriverId?: string;
    dispatchedAt?: string;
    dispatchedByDriverId?: string;
    deliveredAt?: string;
    deliveredByDriverId?: string;
    [key: string]: any;
  };
  stripePaymentIntentId?: string;
  transactionId?: string;
  pickupInstructionType?: PickupInstructionType;
  deliveryInstructionType?: DeliveryInstructionType;
  sla?: OrderSla;
  orderItems?: OrderItem[];
  bookedAt?: string;
  pickupDueAt?: string;
  pickedUpAt?: string;
  receivedAtFacilityAt?: string;
  processingStartedAt?: string;
  qcStartedAt?: string;
  readyForDeliveryAt?: string;
  deliveryDueAt?: string;
  completedAt?: string;
  codRecord?: CodCollectionRecord;
  pickupAttemptsCount?: number;
  deliveryAttemptsCount?: number;
  rating?: number;
  ratingFeedback?: string;
  ratingSubmittedAt?: string;
  customerRating?: OrderCustomerRating;
}

export interface UserAddress {
  id: string;
  label: string; // Home, Office, Apartment, etc.
  flatNo: string;
  street: string;
  landmark?: string;
  city: string;
  pincode: string; // or postcode
  instructions?: string;
  isDefault: boolean;
  latitude?: number;
  longitude?: number;
  coordinates?: {
    lat: number;
    lng: number;
    accuracy?: number;
  };
}

export interface UserPreferences {
  detergent: 'Standard' | 'Premium Eco-Enzyme';
  softener: 'Standard' | 'Premium Silk Touch';
  fragrance: 'No Fragrance / Hypoallergenic' | 'Fresh Linen' | 'Floral Breeze';
  starchedShirts: 'No Starch' | 'Medium Starch' | 'Heavy Starch';
  foldingPreference: 'Standard Flat Fold' | 'Hanger Preferred';
  smsNotifications: boolean;
  emailReceipts: boolean;
  whatsappUpdates: boolean;
  marketingEmails: boolean;
}

export interface RecurringSchedule {
  id: string;
  serviceName?: string;
  serviceType?: string;
  frequency: 'Weekly' | 'Bi-Weekly' | 'Monthly';
  dayOfWeek: string;
  timeSlot: string;
  addressId: string;
  active?: boolean;
  isActive?: boolean;
  nextScheduledDate?: string;
  nextPickupDate?: string;
}

export interface UserProfile {
  name: string;
  email: string;
  phone: string;
  avatar: string;
  walletBalance: number;
  rewardPoints: number;
  addresses: UserAddress[];
  preferences: UserPreferences;
  recurringSchedules?: RecurringSchedule[];
  activeSubscription?: {
    id: string;
    planName: 'Basic' | 'Standard' | 'Premium';
    frequency: 'Weekly' | 'Bi-Weekly' | 'Monthly';
    pricePerMonth: number;
    nextPickup: string;
    status: 'active' | 'paused' | 'cancelled';
  };
}

export interface CustomerNotification {
  id: string;
  title: string;
  message: string;
  timestamp?: string;
  date?: string;
  category?: 'order_status' | 'billing' | 'promotion' | 'reminder' | string;
  read: boolean;
  type?: 'booking' | 'collection' | 'processing' | 'delivery' | 'charge' | 'promo' | string;
  orderId?: string;
  actionTab?: ActiveTab;
}

export interface SupportTicket {
  id: string;
  orderId?: string;
  issueType: 'Missing item' | 'Damaged item' | 'Laundry issue' | 'Collection issue' | 'Delivery issue' | 'Payment issue' | 'Other';
  description: string;
  photos?: string[];
  status: 'Open' | 'In Review' | 'Resolved';
  createdAt: string;
}

export interface WaitingListEntry {
  fullName: string;
  email: string;
  phone: string;
  postcode: string;
  requestedService: string;
  launchConsent: boolean;
  submittedAt: string;
}

// ---------------------------------------------------------------------------
// P2: Vehicle Fleet Management Types
// ---------------------------------------------------------------------------
export type VehicleType = 'VAN' | 'ELECTRIC_VAN' | 'CARGO_BIKE' | 'TRUCK';
export type VehicleStatus = 'ACTIVE' | 'MAINTENANCE' | 'OUT_OF_SERVICE' | 'RETIRED';
export type DocumentType = 'INSURANCE' | 'MOT' | 'ROAD_TAX' | 'SERVICE_DUE' | 'TACHO' | 'OTHER';
export type DocumentStatus = 'VALID' | 'WARNING' | 'URGENT' | 'EXPIRED_BLOCKED';

export interface VehicleDocument {
  id: string;
  type: DocumentType;
  documentNumber?: string;
  expiryDate: string; // ISO date YYYY-MM-DD
  fileUrl?: string;
  verifiedBy?: string;
  verifiedAt?: string;
  status: DocumentStatus;
  daysUntilExpiry: number;
  notes?: string;
}

export interface Vehicle {
  id: string;
  registrationNumber: string;
  make: string;
  model: string;
  year: number;
  type: VehicleType;
  status: VehicleStatus;
  plantId: string;
  plantName?: string;
  capacityKg: number;
  capacityBags: number;
  currentDriverId?: string;
  currentDriverName?: string;
  documents: VehicleDocument[];
  currentMileageKm?: number;
  nextServiceDueKm?: number;
  nextServiceDueDate?: string;
  fuelType?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VehicleAssignment {
  id: string;
  publicId?: string;
  vehicleId: string;
  registrationNumber: string;
  driverId: string;
  driverName: string;
  plantId: string;
  assignedAt: string;
  unassignedAt?: string;
  assignedBy: string;
  unassignedBy?: string;
  reason?: string;
  mileageStartKm?: number;
  mileageEndKm?: number;
  status: 'ACTIVE' | 'COMPLETED';
}

export interface VehicleMaintenanceRecord {
  id: string;
  publicId?: string;
  vehicleId: string;
  registrationNumber: string;
  plantId: string;
  serviceType: 'ROUTINE' | 'REPAIR' | 'INSPECTION' | 'TYRES' | 'EMERGENCY';
  description: string;
  cost: number;
  performedBy: string;
  performedDate: string;
  mileageKm?: number;
  invoiceUrl?: string;
  partsReplaced?: string[];
  nextScheduledDate?: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// P2: Consumables & Inventory Management Types
// ---------------------------------------------------------------------------
export type InventoryCategory =
  | 'DETERGENT'
  | 'SOFTENER'
  | 'STAIN_REMOVER'
  | 'PACKAGING'
  | 'HANGER'
  | 'BAG'
  | 'TAG'
  | 'SAFETY_PPE'
  | 'SPARE_PART'
  | 'OTHER';

export type InventoryUnit = 'LITRES' | 'KILOGRAMS' | 'UNITS' | 'ROLLS' | 'BOXES' | 'PACKS';

export type InventoryTransactionType =
  | 'PURCHASE'
  | 'CONSUMPTION'
  | 'ADJUSTMENT'
  | 'WASTE'
  | 'RETURN'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT';

export interface InventoryItem {
  id: string;
  publicId?: string;
  plantId: string;
  plantName?: string;
  name: string;
  sku: string;
  category: InventoryCategory;
  unit: InventoryUnit;
  quantityOnHand: number;
  minimumThreshold: number;
  reorderQuantity: number;
  unitCost: number;
  supplierName?: string;
  supplierContact?: string;
  locationShelf?: string;
  lastRestockedAt?: string;
  lastAuditAt?: string;
  isLowStock?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryTransaction {
  id: string;
  publicId?: string;
  itemId: string;
  itemName: string;
  plantId: string;
  type: InventoryTransactionType;
  quantity: number; // positive for addition, negative for deduction
  previousBalance: number;
  newBalance: number;
  unitCost?: number;
  referenceId?: string;
  referenceType?: 'ORDER' | 'BATCH' | 'TRANSFER' | 'PURCHASE_ORDER' | 'MANUAL_AUDIT';
  notes?: string;
  performedBy: string;
  performedAt: string;
}

export type InventoryTransferStatus =
  | 'REQUESTED'
  | 'APPROVED'
  | 'DISPATCHED'
  | 'RECEIVED'
  | 'REJECTED'
  | 'CANCELLED';

export interface InventoryTransfer {
  id: string;
  publicId?: string;
  sourcePlantId: string;
  sourcePlantName: string;
  destinationPlantId: string;
  destinationPlantName: string;
  itemId: string;
  itemName: string;
  quantity: number;
  unit: InventoryUnit;
  status: InventoryTransferStatus;
  requestedBy: string;
  requestedAt: string;
  approvedBy?: string;
  approvedAt?: string;
  dispatchedBy?: string;
  dispatchedAt?: string;
  receivedBy?: string;
  receivedAt?: string;
  notes?: string;
  trackingNotes?: string;
}

// ---------------------------------------------------------------------------
// P2: Advanced Operational Analytics Types
// ---------------------------------------------------------------------------
export interface StageDurationMetric {
  stage: PlantStage;
  averageMinutes: number;
  p95Minutes: number;
  sampleCount: number;
  bottleneckFlag: boolean;
}

export interface QualityAnalyticsReport {
  totalInspected: number;
  passCount: number;
  failCount: number;
  passRate: number; // 0 - 100
  rewashCount: number;
  rewashRate: number; // 0 - 100
  topDefectReasons: Array<{ reason: string; count: number }>;
}

export interface DriverAnalyticsReport {
  driverId: string;
  driverName: string;
  completedDeliveries: number;
  completedCollections: number;
  totalStops: number;
  onTimePercentage: number;
  totalDistanceKm: number;
  averageDurationMins: number;
  activeVehicleReg?: string;
}

export interface MachineUtilizationReport {
  machineId: string;
  machineName: string;
  type: string;
  totalRuntimeMinutes: number;
  totalCycles: number;
  capacityKg: number;
  utilizationPercentage: number;
}

export interface RevenueAnalyticsReport {
  grossRevenue: number;
  refundsDeductions: number;
  promotionalDiscounts: number;
  netRevenue: number;
  orderCount: number;
  averageOrderValue: number;
  recurringSubscriptionRevenue: number;
}

export interface OperationalAnalyticsReport {
  dateRange: { start: string; end: string };
  plantId?: string;
  orderStats: {
    totalCreated: number;
    totalCompleted: number;
    totalCancelled: number;
    completionRate: number;
    onTimeDeliveryRate: number;
  };
  stageDurations: StageDurationMetric[];
  empiricalBottleneck: PlantStage;
  quality: QualityAnalyticsReport;
  drivers: DriverAnalyticsReport[];
  machines: MachineUtilizationReport[];
  revenue: RevenueAnalyticsReport;
}

// ---------------------------------------------------------------------------
// P2: Offline Resilience & Sync Types
// ---------------------------------------------------------------------------
export interface RegisteredDevice {
  deviceId: string;
  userId: string;
  userRole: string;
  appVersion: string;
  platform: 'ANDROID' | 'IOS' | 'WEB_PWA';
  lastSyncAt: string;
  status: 'ACTIVE' | 'DE-REGISTERED';
  fcmToken?: string;
}

export interface OfflineOperation {
  operationId: string;
  clientTimestamp: string;
  deviceId?: string;
  userId?: string;
  role?: string;
  action: 'COLLECT_ORDER' | 'DELIVER_ORDER' | 'PROCESS_STAGE' | 'VERIFY_PIN' | 'LOG_EXCEPTION' | 'QC_INSPECT';
  entityId: string;
  payload: Record<string, any>;
  syncStatus?: 'PENDING' | 'APPLIED' | 'CONFLICT' | 'REJECTED';
  failureReason?: string;
  conflictDetails?: any;
  appliedAt?: string;
}

export interface OfflineSyncRequest {
  deviceId: string;
  operations: OfflineOperation[];
  lastSyncSequence?: number;
}

export interface OfflineSyncResponse {
  success: boolean;
  appliedOperations: string[];
  conflicts: Array<{
    operationId: string;
    reason: string;
    entityId: string;
    serverState: any;
  }>;
  rejectedOperations: Array<{
    operationId: string;
    reason: string;
  }>;
  serverTimestamp: string;
}

export interface OfflinePinVoucher {
  orderId: string;
  deviceId: string;
  pinHash: string; // HMAC-SHA256 of orderId + pin + secret
  expiresAt: string;
  salt: string;
}

// ---------------------------------------------------------------------------
// P2: Alert Center & System Health Types
// ---------------------------------------------------------------------------
export interface SystemProbeResult {
  name: string;
  status: 'UP' | 'SLOW' | 'DOWN';
  latencyMs: number;
  details?: Record<string, any>;
}

export interface SystemHealthReport {
  overallStatus: 'HEALTHY' | 'DEGRADED' | 'CRITICAL';
  timestamp: string;
  probes: SystemProbeResult[];
  syncBacklogCount: number;
  activeAlertCount: number;
}

export interface UnifiedAlert {
  id: string;
  publicId?: string;
  plantId?: string;
  type:
    | 'VEHICLE_EXPIRY'
    | 'INVENTORY_LOW'
    | 'MACHINE_FAULT'
    | 'OFFLINE_CONFLICT'
    | 'CAPACITY_CRITICAL'
    | 'SLA_BREACH'
    | 'NOTIFICATION_DEAD_LETTER';
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  message: string;
  entityId?: string;
  entityType?: string;
  createdAt: string;
  resolved: boolean;
  resolvedAt?: string;
  resolvedBy?: string;
}

// ---------------------------------------------------------------------------
// P2: Operational Search & Entity History Types
// ---------------------------------------------------------------------------
export interface OperationalSearchResult {
  id: string;
  entityType:
    | 'ORDER'
    | 'CUSTOMER'
    | 'DRIVER'
    | 'VEHICLE'
    | 'PLANT'
    | 'MACHINE'
    | 'INVENTORY'
    | 'SUBSCRIPTION'
    | 'TRANSFER'
    | 'DISPUTE';
  title: string;
  subtitle: string;
  status?: string;
  plantId?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface UniversalHistoryEvent {
  id: string;
  entityId: string;
  entityType: string;
  timestamp: string;
  action: string;
  performedBy: {
    id: string;
    name: string;
    role: string;
  };
  summary: string;
  details?: Record<string, any>;
}

export interface Customer360Profile {
  customer: {
    id: string;
    name: string;
    email: string;
    phone: string;
    createdAt?: string;
  };
  subscription?: UserSubscription | null;
  orders: any[];
  disputes: any[];
  totalSpend: number;
  totalOrders: number;
  activeOrdersCount: number;
  deliveryAddresses: any[];
}

