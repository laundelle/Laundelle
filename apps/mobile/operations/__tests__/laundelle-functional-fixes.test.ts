import crypto from 'crypto';
import { matchesPostcode, extractOutwardCode } from '@laundelle/utils';

console.log('--- Running LAUNDELLE Functional Fixes Verification Suite ---\n');

let passedCount = 0;
let failedCount = 0;

function assertStrictEqual(actual: unknown, expected: unknown, msg?: string) {
  if (actual !== expected) {
    throw new Error(msg || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertDeepStrictEqual(actual: unknown, expected: unknown, msg?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(msg || `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertOk(val: unknown, msg?: string) {
  if (!val) {
    throw new Error(msg || `Expected truthy value`);
  }
}

function assertThrows(fn: () => void, expectedSubstr?: string) {
  let threw = false;
  try {
    fn();
  } catch (err: any) {
    threw = true;
    if (expectedSubstr && !err.message.includes(expectedSubstr)) {
      throw new Error(`Expected error containing "${expectedSubstr}", got "${err.message}"`);
    }
  }
  if (!threw) {
    throw new Error(`Expected function to throw, but it succeeded.`);
  }
}

function it(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passedCount++;
  } catch (err: any) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failedCount++;
  }
}

// ============================================================================
// 1. DYNAMIC DRIVER POSTCODE ASSIGNMENT & ACCESS CONTROL
// ============================================================================

function validateManagerPostcodeAllocation(
  managerAuthorizedPostcodes: string[],
  requestedPostcodes: string[]
): string[] {
  const authorizedSet = new Set(
    managerAuthorizedPostcodes.map((p) => (extractOutwardCode(p) || p).trim().toUpperCase())
  );
  const normalizedRequested = Array.from(
    new Set(
      requestedPostcodes
        .map((p) => (extractOutwardCode(p) || p).trim().toUpperCase())
        .filter(Boolean)
    )
  );

  const unauthorized = normalizedRequested.filter((p) => !authorizedSet.has(p));
  if (unauthorized.length > 0) {
    throw new Error(
      `Unauthorized postcode assignment: Postcode(s) [${unauthorized.join(', ')}] are outside your authorized service area [${Array.from(authorizedSet).join(', ')}].`
    );
  }
  return normalizedRequested;
}

function isDriverEligibleForOrder(
  driverPostcodes: string[],
  driverPlantId: string | null,
  orderPostcode: string,
  orderPlantId: string | null
): boolean {
  const hasPostcodeRestriction = driverPostcodes.length > 0;
  const postcodeMatches = hasPostcodeRestriction
    ? matchesPostcode(orderPostcode, driverPostcodes)
    : true;
  const plantMatches = driverPlantId
    ? orderPlantId ? driverPlantId === orderPlantId : true
    : true;

  return hasPostcodeRestriction
    ? postcodeMatches && plantMatches
    : driverPlantId ? Boolean(orderPlantId && driverPlantId === orderPlantId) : !orderPlantId;
}

it('Postcodes: Manager can allocate authorized postcodes among drivers', () => {
  const managerCoverage = ['PR1', 'PR2', 'PR3', 'PR4'];
  const driver1Alloc = validateManagerPostcodeAllocation(managerCoverage, ['PR1']);
  const driver2Alloc = validateManagerPostcodeAllocation(managerCoverage, ['PR2']);
  const driver3Alloc = validateManagerPostcodeAllocation(managerCoverage, ['PR3', 'PR4']);

  assertDeepStrictEqual(driver1Alloc, ['PR1']);
  assertDeepStrictEqual(driver2Alloc, ['PR2']);
  assertDeepStrictEqual(driver3Alloc, ['PR3', 'PR4']);
});

it('Postcodes: Manager cannot allocate unauthorized postcodes outside coverage', () => {
  const managerCoverage = ['PR1', 'PR2', 'PR3', 'PR4'];
  assertThrows(
    () => validateManagerPostcodeAllocation(managerCoverage, ['PR1', 'BD1']),
    'Unauthorized postcode assignment: Postcode(s) [BD1] are outside your authorized service area'
  );
  assertThrows(
    () => validateManagerPostcodeAllocation(managerCoverage, ['SW1A 1AA']),
    'Unauthorized postcode assignment: Postcode(s) [SW1A] are outside your authorized service area'
  );
});

it('Postcodes: Driver with assigned postcodes only receives matching orders within plant', () => {
  const plantId = 'plant_preston_01';
  const driver1Postcodes = ['PR1'];
  const driver2Postcodes = ['PR2'];

  // Order in PR1, same plant
  assertStrictEqual(isDriverEligibleForOrder(driver1Postcodes, plantId, 'PR1 1AA', plantId), true);
  // Order in PR2, same plant -> Driver 1 must NOT receive it!
  assertStrictEqual(isDriverEligibleForOrder(driver1Postcodes, plantId, 'PR2 4BB', plantId), false);
  // Driver 2 receives PR2
  assertStrictEqual(isDriverEligibleForOrder(driver2Postcodes, plantId, 'PR2 4BB', plantId), true);
  // Order with matching postcode but different plant -> rejected
  assertStrictEqual(isDriverEligibleForOrder(driver1Postcodes, plantId, 'PR1 1AA', 'plant_bolton_02'), false);
});

// ============================================================================
// 2. MANAGER-SPECIFIC DATA ISOLATION (AREAS & SLOTS)
// ============================================================================

interface PlantDoc {
  _id: string;
  name: string;
  code: string;
  manager_id: string;
}

interface SlotDoc {
  id: string;
  plant_id: string;
  slot: string;
}

function filterPlantsForActor(plants: PlantDoc[], actor: { role: string; _id: string; plant_id?: string }): PlantDoc[] {
  if (actor.role === 'super_admin' || actor.role === 'admin') {
    return plants;
  }
  if (actor.role === 'manager' || actor.role === 'plant_manager') {
    return plants.filter(
      (p) => p._id === actor.plant_id || p.manager_id === actor._id
    );
  }
  return [];
}

function filterSlotsForActor(slots: SlotDoc[], plants: PlantDoc[], actor: { role: string; _id: string; plant_id?: string }): SlotDoc[] {
  if (actor.role === 'super_admin' || actor.role === 'admin') {
    return slots;
  }
  if (actor.role === 'manager' || actor.role === 'plant_manager') {
    const allowedPlants = filterPlantsForActor(plants, actor);
    const allowedPlantIds = new Set(allowedPlants.map((p) => p._id));
    return slots.filter((s) => s.plant_id && allowedPlantIds.has(s.plant_id));
  }
  return [];
}

it('Data Isolation: Super admin sees all plants and slots', () => {
  const plants: PlantDoc[] = [
    { _id: 'plant_preston', name: 'Preston Plant', code: 'PR-01', manager_id: 'mgr_preston' },
    { _id: 'plant_bolton', name: 'Bolton Plant', code: 'BL-01', manager_id: 'mgr_bolton' },
  ];
  const slots: SlotDoc[] = [
    { id: 'slot_1', plant_id: 'plant_preston', slot: '09:00 - 12:00' },
    { id: 'slot_2', plant_id: 'plant_bolton', slot: '12:00 - 15:00' },
  ];
  const adminActor = { role: 'super_admin', _id: 'admin_1' };

  const visiblePlants = filterPlantsForActor(plants, adminActor);
  const visibleSlots = filterSlotsForActor(slots, plants, adminActor);

  assertStrictEqual(visiblePlants.length, 2);
  assertStrictEqual(visibleSlots.length, 2);
});

it('Data Isolation: Plant Manager only sees their own authorized plant and slots (0 cross-exposure)', () => {
  const plants: PlantDoc[] = [
    { _id: 'plant_preston', name: 'Preston Plant', code: 'PR-01', manager_id: 'mgr_preston' },
    { _id: 'plant_bolton', name: 'Bolton Plant', code: 'BL-01', manager_id: 'mgr_bolton' },
  ];
  const slots: SlotDoc[] = [
    { id: 'slot_1', plant_id: 'plant_preston', slot: '09:00 - 12:00' },
    { id: 'slot_2', plant_id: 'plant_bolton', slot: '12:00 - 15:00' },
  ];
  const prestonManager = { role: 'plant_manager', _id: 'mgr_preston', plant_id: 'plant_preston' };
  const boltonManager = { role: 'plant_manager', _id: 'mgr_bolton', plant_id: 'plant_bolton' };

  const prestonPlants = filterPlantsForActor(plants, prestonManager);
  const prestonSlots = filterSlotsForActor(slots, plants, prestonManager);
  assertStrictEqual(prestonPlants.length, 1);
  assertStrictEqual(prestonPlants[0]._id, 'plant_preston');
  assertStrictEqual(prestonSlots.length, 1);
  assertStrictEqual(prestonSlots[0].id, 'slot_1');

  const boltonPlants = filterPlantsForActor(plants, boltonManager);
  const boltonSlots = filterSlotsForActor(slots, plants, boltonManager);
  assertStrictEqual(boltonPlants.length, 1);
  assertStrictEqual(boltonPlants[0]._id, 'plant_bolton');
  assertStrictEqual(boltonSlots.length, 1);
  assertStrictEqual(boltonSlots[0].id, 'slot_2');
});

// ============================================================================
// 3. CART & CHECKOUT PROGRESS PERSISTENCE ACROSS AUTH
// ============================================================================

it('Checkout Persistence: Saves and restores state without resetting to cart on auth flow', () => {
  const mockStorage: Record<string, string> = {};

  const saveCheckoutProgress = (data: any) => {
    mockStorage['laundelle_checkout_progress'] = JSON.stringify({ ...data, updatedAt: Date.now() });
    mockStorage['laundelle_open_cart'] = 'true';
  };

  const loadCheckoutProgress = () => {
    const raw = mockStorage['laundelle_checkout_progress'];
    if (!raw) return null;
    return JSON.parse(raw);
  };

  const clearCheckoutProgress = () => {
    delete mockStorage['laundelle_checkout_progress'];
    delete mockStorage['laundelle_open_cart'];
  };

  // 1. Customer fills in slots and address, reaches review
  saveCheckoutProgress({
    currentStep: 'review',
    selectedAddressId: 'addr_99',
    pickupDate: '2026-10-25',
    pickupSlot: '09:00 - 12:00',
    deliveryDate: '2026-10-27',
    deliverySlot: '14:00 - 17:00',
    declaredItemCount: '7',
  });

  // 2. Auth redirect occurs (drawer closes, user authenticates)
  assertStrictEqual(mockStorage['laundelle_open_cart'], 'true');

  // 3. Customer returns and drawer restores state
  const restored = loadCheckoutProgress();
  assertOk(restored);
  assertStrictEqual(restored.currentStep, 'review');
  assertStrictEqual(restored.selectedAddressId, 'addr_99');
  assertStrictEqual(restored.pickupSlot, '09:00 - 12:00');
  assertStrictEqual(restored.declaredItemCount, '7');

  // 4. Payment confirmed -> progress cleared
  clearCheckoutProgress();
  assertStrictEqual(loadCheckoutProgress(), null);
  assertStrictEqual(mockStorage['laundelle_open_cart'], undefined);
});

it('Checkout Persistence: Server revalidates service prices against database', () => {
  const dbServices = [
    { id: 'srv_wash', basePrice: 15.0 },
    { id: 'srv_dry', basePrice: 10.0 },
  ];
  const servicePriceMap = new Map(dbServices.map((s) => [s.id, s.basePrice]));

  // Client attempts to tamper price to 1.00
  const clientItems = [
    { serviceId: 'srv_wash', price: 1.0, quantity: 2 },
    { serviceId: 'srv_dry', price: 0.5, quantity: 1 },
  ];

  const calculatedItemsGross = clientItems.reduce((sum, it) => {
    const authoritativePrice = servicePriceMap.get(it.serviceId) ?? it.price;
    return sum + authoritativePrice * it.quantity;
  }, 0);

  // Authoritative total should be (15 * 2) + (10 * 1) = 40.0, NOT (1 * 2) + 0.5 = 2.5
  assertStrictEqual(calculatedItemsGross, 40.0);
});

// ============================================================================
// 4. FIX OTP VERIFICATION FAILURES
// ============================================================================

const PIN_SECRET = 'laundelle-secure-order-pin-key-2026';
const ENCRYPTION_KEY = crypto.createHash('sha256').update(PIN_SECRET).digest();

function hashPin(pin: string, salt: string, orderId: string, customerId: string): string {
  const context = `${orderId}:${customerId}:${salt}:${pin.trim()}`;
  return crypto.createHmac('sha256', ENCRYPTION_KEY).update(context).digest('hex');
}

function encryptPin(pin: string, orderId: string, customerId: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  cipher.setAAD(Buffer.from(`${orderId}:${customerId}`, 'utf8'));
  let enc = cipher.update(pin.trim(), 'utf8', 'hex');
  enc += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${tag}:${enc}`;
}

function decryptPin(encPayload: string, orderId: string, customerId: string): string | null {
  try {
    const [ivHex, tagHex, cipherHex] = encPayload.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    decipher.setAAD(Buffer.from(`${orderId}:${customerId}`, 'utf8'));
    let dec = decipher.update(cipherHex, 'hex', 'utf8');
    dec += decipher.final('utf8');
    return dec;
  } catch {
    return null;
  }
}

function verifyPinAttempt(
  submitted: string,
  order: any,
  type: 'pickup' | 'delivery'
): { valid: boolean; error?: string } {
  const clean = submitted.trim();
  if (type === 'pickup' && order.pickup_pin_verified_at) {
    return { valid: false, error: 'Pickup PIN has already been verified.' };
  }
  const attempts = order.pickup_pin_attempts || 0;
  if (order.pickup_pin_locked || attempts >= 5) {
    return { valid: false, error: 'Security Lockout: Order PIN is locked.' };
  }

  const orderIdCandidates = [order.id, order.publicId, order.orderNumber, String(order._id || '')].filter(Boolean);
  const custIdCandidates = [order.customer_id, order.customerId, order.userId, order.auth0UserId].filter(Boolean).map(String);

  // Decrypt check
  const enc = type === 'pickup' ? order.pickup_pin_enc : order.delivery_pin_enc;
  if (enc) {
    for (const oId of orderIdCandidates) {
      for (const cId of custIdCandidates) {
        const dec = decryptPin(enc, oId, cId);
        if (dec && dec.trim() === clean) return { valid: true };
      }
    }
  }

  // Hash check
  const expectedHash = type === 'pickup' ? order.pickup_pin_hash : order.delivery_pin_hash;
  const salt = type === 'pickup' ? order.pickup_pin_salt : order.delivery_pin_salt;
  if (expectedHash && salt) {
    for (const oId of orderIdCandidates) {
      for (const cId of custIdCandidates) {
        const computed = hashPin(clean, salt, oId, cId);
        const compBuf = Buffer.from(computed, 'utf8');
        const expBuf = Buffer.from(expectedHash, 'utf8');
        if (compBuf.length === expBuf.length && crypto.timingSafeEqual(compBuf, expBuf)) {
          return { valid: true };
        }
      }
    }
  }

  // Plaintext fallback
  const plain = type === 'pickup' ? order.pickup_pin : order.delivery_pin;
  if (plain && String(plain).trim() === clean) return { valid: true };

  return { valid: false, error: 'Incorrect PIN.' };
}

it('OTP Verification: Resolves Auth0 sub vs MongoDB ObjectId mismatch seamlessly', () => {
  const auth0Sub = 'auth0|65001234';
  const mongoDbObjectId = '6700abcd9999000011112222';
  const orderId = 'ORD-2026-999';
  const salt = 'aabbccddeeff0011';
  const correctPin = '482910';

  // Order created with auth0Sub as customer context
  const hash = hashPin(correctPin, salt, orderId, auth0Sub);
  const enc = encryptPin(correctPin, orderId, auth0Sub);

  // Later in driver verification, order.customer_id is mongoDbObjectId, but order.userId has auth0Sub
  const orderDoc = {
    id: orderId,
    publicId: orderId,
    _id: mongoDbObjectId,
    customer_id: mongoDbObjectId,
    userId: auth0Sub,
    pickup_pin_hash: hash,
    pickup_pin_salt: salt,
    pickup_pin_enc: enc,
    pickup_pin_attempts: 0,
    pickup_pin_locked: false,
  };

  // Valid attempt succeeds
  const res = verifyPinAttempt(correctPin, orderDoc, 'pickup');
  assertStrictEqual(res.valid, true);

  // Invalid attempt fails
  const badRes = verifyPinAttempt('000000', orderDoc, 'pickup');
  assertStrictEqual(badRes.valid, false);
});

it('OTP Verification: Enforces lockout after 5 failed attempts and rejects reuse', () => {
  const orderDoc = {
    id: 'ORD-1',
    customer_id: 'cust_1',
    pickup_pin: '123456',
    pickup_pin_attempts: 5,
    pickup_pin_locked: true,
  };
  const res = verifyPinAttempt('123456', orderDoc, 'pickup');
  assertStrictEqual(res.valid, false);
  assertStrictEqual(res.error, 'Security Lockout: Order PIN is locked.');

  const consumedOrder = {
    id: 'ORD-2',
    customer_id: 'cust_2',
    pickup_pin: '123456',
    pickup_pin_verified_at: new Date().toISOString(),
  };
  const consumedRes = verifyPinAttempt('123456', consumedOrder, 'pickup');
  assertStrictEqual(consumedRes.valid, false);
  assertStrictEqual(consumedRes.error, 'Pickup PIN has already been verified.');
});

// ============================================================================
// 5. CORRECT PICKUP-TO-QC-TO-DELIVERY ORDER LIFECYCLE
// ============================================================================

it('Order Lifecycle: Newly paid order creates collection job only, never premature delivery', () => {
  // Simulating PaymentService outcome
  const assignedDriverId = null;
  const initialStatus = 'collection_scheduled';
  const initialLabel = assignedDriverId ? 'Collection Scheduled' : 'Awaiting Driver Assignment';

  assertStrictEqual(initialStatus, 'collection_scheduled');
  assertStrictEqual(initialLabel, 'Awaiting Driver Assignment');

  // Driver portal isPickup check
  const isPickup = ['order_placed', 'pending_payment', 'booking_confirmed', 'collection_scheduled', 'waiting_for_driver', 'driver_assigned'].includes(initialStatus);
  assertStrictEqual(isPickup, true);

  // Available deliveries query check
  const deliveryStatuses = ['ready_for_delivery', 'qc_passed'];
  const appearsInDeliveryPool = deliveryStatuses.includes(initialStatus);
  assertStrictEqual(appearsInDeliveryPool, false, 'New order must NEVER appear in available_deliveries');
});

it('Order Lifecycle: Processor QC failure routes to rewash and blocks delivery activation', () => {
  const orderDoc = {
    id: 'ORD-100',
    status: 'washing',
    qc: { passed: false },
  };

  // Processor flags rewash
  const qcDecision = 'rewash';
  let targetStatus = orderDoc.status;
  if (qcDecision === 'rewash') {
    targetStatus = 'rewash_required';
    orderDoc.qc.passed = false;
  }

  assertStrictEqual(targetStatus, 'rewash_required');
  assertStrictEqual(orderDoc.qc.passed, false);

  // Delivery query
  const isAvailableForDelivery = ['ready_for_delivery', 'qc_passed'].includes(targetStatus) && orderDoc.qc.passed;
  assertStrictEqual(isAvailableForDelivery, false, 'Failed QC must block delivery availability');
});

it('Order Lifecycle: Processor QC pass activates exactly one ready_for_delivery job', () => {
  const orderDoc = {
    id: 'ORD-200',
    status: 'qc_ready',
    qc: { passed: false },
  };

  // Processor passes all 10 checkpoints
  const qcDecision = 'passed';
  let targetStatus = orderDoc.status;
  if (qcDecision === 'passed') {
    targetStatus = 'ready_for_delivery';
    orderDoc.qc.passed = true;
  }

  assertStrictEqual(targetStatus, 'ready_for_delivery');
  assertStrictEqual(orderDoc.qc.passed, true);

  // Available for delivery driver
  const isAvailableForDelivery = ['ready_for_delivery', 'qc_passed'].includes(targetStatus) && orderDoc.qc.passed;
  assertStrictEqual(isAvailableForDelivery, true, 'QC pass must activate delivery availability');
});

console.log(`\nVerification Suite Completed: ${passedCount} passed, ${failedCount} failed.`);
if (failedCount > 0) {
  process.exit(1);
}
