import { z } from 'zod';

// Auth Validations
export const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const registerSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().optional(),
});

export const otpVerifySchema = z.object({
  phone: z.string().min(10, 'Valid phone number required'),
  code: z.string().length(6, 'Verification code must be 6 digits'),
});

const UK_POSTCODE_OR_DISTRICT_REGEX = /^(([A-Z]{1,2}[0-9][A-Z0-9]?)\s*([0-9][A-Z]{2})|([A-Z]{1,2}[0-9][A-Z0-9]?)|GIR\s*(0AA)?)$/i;

// Address Validations
export const addressSchema = z.object({
  id: z.string().optional(),
  label: z.string().default('Home'),
  flat: z.string().optional(),
  street: z.string().min(3, 'Street address is required'),
  city: z.string().min(2, 'City is required'),
  postcode: z.string().refine(
    (val) => UK_POSTCODE_OR_DISTRICT_REGEX.test((val || '').trim()),
    { message: 'Please enter a valid UK postcode (e.g. PR1 4UD, SW1A 1AA)' }
  ),
  notes: z.string().optional(),
  isDefault: z.boolean().optional(),
});

// Order Creation Validation
export const createOrderSchema = z.object({
  items: z.array(z.object({
    serviceId: z.string(),
    name: z.string(),
    price: z.number(),
    unit: z.string(),
    quantity: z.number().positive(),
    selectedOption: z.string().optional(),
    specialInstructions: z.string().optional(),
  })).min(1, 'Order must contain at least one item'),
  address: z.string().min(3, 'Collection address is required'),
  pickupDate: z.string().min(1, 'Pickup date is required'),
  pickupSlot: z.string().min(1, 'Pickup slot is required'),
  deliveryDate: z.string().optional(),
  deliverySlot: z.string().optional(),
  paymentMethod: z.string().default('Pay Online (Stripe)'),
  total: z.number().nonnegative(),
  notes: z.string().optional(),
});

// Driver Actions
export const driverPickupSchema = z.object({
  orderId: z.string(),
  pin: z.string().length(6, 'PIN must be 6 digits'),
  bagQr: z.string().min(1, 'Bag QR code is required'),
  notes: z.string().optional(),
});

export const driverDeliverySchema = z.object({
  orderId: z.string(),
  pin: z.string().min(4, 'PIN must be at least 4 digits').max(6, 'PIN must be at most 6 digits'),
  signature: z.string().optional(),
  photoEvidence: z.string().optional(),
});

// Processor Actions
export const processorStageSchema = z.object({
  orderId: z.string(),
  stage: z.enum(['sorting', 'washing', 'drying', 'ironing', 'folding', 'quality_check', 'ready_for_delivery']),
  machineId: z.string().optional(),
  notes: z.string().optional(),
});

export const processorQcSchema = z.object({
  orderId: z.string(),
  passed: z.boolean(),
  notes: z.string().optional(),
  rewashReason: z.string().optional(),
});

// Manager Actions
export const managerAssignSchema = z.object({
  orderId: z.string(),
  assigneeId: z.string().nullable(),
  role: z.enum(['driver', 'processor']),
});

export const managerIncidentSchema = z.object({
  orderId: z.string().optional(),
  type: z.string(),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  description: z.string().min(5),
});

// Staff Provisioning (Auth0 M2M + MongoDB - No passwords)
export const createManagerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  phone: z.string().optional(),
  plant: z.string().min(1, 'Plant is required').optional(),
  plant_id: z.string().optional(),
  assigned_postcodes: z.array(z.string()).optional(),
});

export const createDriverSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  phone: z.string().min(5, 'Phone number is required'),
  vehicle: z.string().optional(),
  vehicle_type: z.string().optional(),
  vehicle_reg: z.string().optional(),
  license_number: z.string().optional(),
  emergency_contact: z.object({
    name: z.string(),
    phone: z.string(),
  }).optional(),
  manager_id: z.string().optional(),
  plant_id: z.string().optional(),
});

export const createProcessorSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  phone: z.string().optional(),
  shift: z.string().optional(),
  skills: z.array(z.string()).optional(),
  station: z.string().optional(),
  manager_id: z.string().optional(),
  plant_id: z.string().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type AddressInput = z.infer<typeof addressSchema>;
export type CreateManagerValidationInput = z.infer<typeof createManagerSchema>;
export type CreateDriverValidationInput = z.infer<typeof createDriverSchema>;
export type CreateProcessorValidationInput = z.infer<typeof createProcessorSchema>;

export * from './scheduleValidation';
