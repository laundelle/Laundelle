import fs from 'fs';
import path from 'path';

// Load .env
const envPaths = [
    path.resolve(__dirname, '../.env'),
    path.resolve(__dirname, '../../.env'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../.env')
];
for (const p of envPaths) {
    if (fs.existsSync(p)) {
        const envContent = fs.readFileSync(p, 'utf8');
        for (const line of envContent.split('\n')) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
                const idx = trimmed.indexOf('=');
                const key = trimmed.substring(0, idx).trim();
                const val = trimmed.substring(idx + 1).trim().replace(/^["']/, '').replace(/["']$/, '');
                if (!process.env[key]) {
                    process.env[key] = val;
                }
            }
        }
    }
}

import { getDb } from '../src/lib/mongodb';
import { computeOrderJourney } from '../../customer/components/OrdersView';

function assert(condition: boolean, msg: string) {
    if (!condition) {
        console.error(`❌ ASSERTION FAILED: ${msg}`);
        throw new Error(msg);
    }
    console.log(`  ✓ ${msg}`);
}

async function runTestSuite() {
    console.log('===============================================================');
    console.log('🧪 TESTING ALL 7 ORDER LIFECYCLE STAGES ONE BY ONE');
    console.log('===============================================================');

    const db = await getDb();
    const now = new Date().toISOString();

    // -------------------------------------------------------------------------
    // PART 1: TEST COMPUTE ORDER JOURNEY ACROSS ALL 7 STAGES
    // -------------------------------------------------------------------------
    console.log('\n--- PART 1: Testing Frontend Stage Determination (computeOrderJourney) ---');

    // STAGE 1: Booking Confirmed
    console.log('\n[STAGE 1] Testing: Booking Confirmed');
    const orderStage1: any = {
        id: 'ORD-TEST-STAGE-1',
        status: 'booking_confirmed',
        statusLabel: 'Booking Confirmed',
        paymentStatus: 'Paid',
        isPaid: true,
        createdAt: now,
        timeline_events: [
            { event: 'booking_created', timestamp: now },
            { event: 'payment_confirmed', timestamp: now },
            { event: 'booking_confirmed', timestamp: now }
        ]
    };
    const journey1 = computeOrderJourney(orderStage1);
    assert(journey1.currentStage.id === 'booking_confirmed', 'Current Stage must be "booking_confirmed"');
    assert(journey1.currentStage.title === 'Booking Confirmed', 'Current Stage title must be "Booking Confirmed"');
    assert(journey1.stages[0].status === 'in_progress', 'Stage 1 status must be in_progress');
    assert(journey1.stages[1].status === 'upcoming', 'Stage 2 status must be upcoming');
    assert(journey1.completedCount === 0, 'Completed count must be 0');

    // STAGE 2: Order Pickup Completed (en route / pickup scheduled)
    console.log('\n[STAGE 2A] Testing: Driver Assigned / Collection Scheduled (Moving to Pickup)');
    const orderStage2A: any = {
        ...orderStage1,
        status: 'collection_scheduled',
        statusLabel: 'Collection Scheduled',
        timeline_events: [...orderStage1.timeline_events, { event: 'collection_scheduled', timestamp: now }]
    };
    const journey2A = computeOrderJourney(orderStage2A);
    assert(journey2A.stages[0].status === 'completed', 'Stage 1 (Booking Confirmed) is completed');
    assert(journey2A.currentStage.id === 'pickup_completed', 'Current Stage must be "pickup_completed"');
    assert(journey2A.currentStage.title === 'Order Pickup Completed', 'Current Stage title must be "Order Pickup Completed"');
    assert(journey2A.stages[1].status === 'in_progress', 'Stage 2 status must be in_progress');
    assert(journey2A.stages[2].status === 'upcoming', 'Stage 3 status must be upcoming');
    assert(journey2A.completedCount === 1, 'Completed count must be 1');

    // STAGE 2: Pickup OTP Verified
    console.log('\n[STAGE 2B] Testing: Pickup OTP Verified (Laundry Collected)');
    const orderStage2B: any = {
        ...orderStage2A,
        status: 'laundry_collected',
        statusLabel: 'Laundry Collected',
        pickup_pin_verified_at: now,
        timeline_events: [...orderStage2A.timeline_events, { event: 'laundry_collected', timestamp: now }]
    };
    const journey2B = computeOrderJourney(orderStage2B);
    assert(journey2B.stages[0].status === 'completed', 'Stage 1 (Booking Confirmed) is completed');
    assert(journey2B.stages[1].status === 'completed', 'Stage 2 (Order Pickup Completed) is completed');
    assert(journey2B.currentStage.id === 'received_at_plant', 'Current Stage must advance to "received_at_plant"');
    assert(journey2B.stages[2].status === 'in_progress', 'Stage 3 (Received at Plant) is in_progress');
    assert(journey2B.completedCount === 2, 'Completed count must be 2');

    // STAGE 3: Received at Plant
    console.log('\n[STAGE 3] Testing: Received at Plant (Facility Intake Scanned)');
    const orderStage3: any = {
        ...orderStage2B,
        status: 'received_at_facility',
        statusLabel: 'Received at Facility',
        intake: { intakeAt: now, processorId: 'proc-1' },
        timeline_events: [...orderStage2B.timeline_events, { event: 'received_at_facility', timestamp: now }]
    };
    const journey3 = computeOrderJourney(orderStage3);
    assert(journey3.stages[0].status === 'completed', 'Stage 1 is completed');
    assert(journey3.stages[1].status === 'completed', 'Stage 2 is completed');
    assert(journey3.stages[2].status === 'completed', 'Stage 3 (Received at Plant) is completed');
    assert(journey3.currentStage.id === 'washing', 'Current Stage must advance to "washing"');
    assert(journey3.stages[3].status === 'in_progress', 'Stage 4 (Washing) is in_progress');
    assert(journey3.completedCount === 3, 'Completed count must be 3');

    // STAGE 4: Washing
    console.log('\n[STAGE 4] Testing: Washing In Progress');
    const orderStage4: any = {
        ...orderStage3,
        status: 'washing',
        statusLabel: 'Washing',
        timeline_events: [...orderStage3.timeline_events, { event: 'washing_started', timestamp: now }]
    };
    const journey4 = computeOrderJourney(orderStage4);
    assert(journey4.stages[0].status === 'completed', 'Stage 1 is completed');
    assert(journey4.stages[1].status === 'completed', 'Stage 2 is completed');
    assert(journey4.stages[2].status === 'completed', 'Stage 3 is completed');
    assert(journey4.currentStage.id === 'washing', 'Current Stage is "washing"');
    assert(journey4.stages[3].status === 'in_progress', 'Stage 4 (Washing) is in_progress');
    assert(journey4.stages[4].status === 'upcoming', 'Stage 5 (Quality Check) is upcoming');
    assert(journey4.completedCount === 3, 'Completed count must be 3');

    // STAGE 5: Quality Check
    console.log('\n[STAGE 5] Testing: Quality Check (QC Inspection In Progress)');
    const orderStage5: any = {
        ...orderStage4,
        status: 'quality_check',
        statusLabel: 'Quality Check',
        qc: { passed: false },
        timeline_events: [...orderStage4.timeline_events, { event: 'quality_check', timestamp: now }]
    };
    const journey5 = computeOrderJourney(orderStage5);
    assert(journey5.stages[0].status === 'completed', 'Stage 1 is completed');
    assert(journey5.stages[1].status === 'completed', 'Stage 2 is completed');
    assert(journey5.stages[2].status === 'completed', 'Stage 3 is completed');
    assert(journey5.stages[3].status === 'completed', 'Stage 4 (Washing) is completed');
    assert(journey5.currentStage.id === 'quality_check', 'Current Stage must be "quality_check"');
    assert(journey5.stages[4].status === 'in_progress', 'Stage 5 (Quality Check) is in_progress');
    assert(journey5.stages[5].status === 'upcoming', 'Stage 6 (Out for Delivery) is upcoming');
    assert(journey5.completedCount === 4, 'Completed count must be 4');

    // STAGE 6: Out for Delivery
    console.log('\n[STAGE 6] Testing: Out for Delivery (QC Passed & En Route to Doorstep)');
    const orderStage6: any = {
        ...orderStage5,
        status: 'out_for_delivery',
        statusLabel: 'Out for Delivery',
        qc: { passed: true, checkedAt: now },
        ready_for_delivery_at: now,
        timeline_events: [
            ...orderStage5.timeline_events,
            { event: 'quality_check_passed', timestamp: now },
            { event: 'out_for_delivery', timestamp: now }
        ]
    };
    const journey6 = computeOrderJourney(orderStage6);
    assert(journey6.stages[0].status === 'completed', 'Stage 1 is completed');
    assert(journey6.stages[1].status === 'completed', 'Stage 2 is completed');
    assert(journey6.stages[2].status === 'completed', 'Stage 3 is completed');
    assert(journey6.stages[3].status === 'completed', 'Stage 4 is completed');
    assert(journey6.stages[4].status === 'completed', 'Stage 5 (Quality Check) is completed');
    assert(journey6.currentStage.id === 'out_for_delivery', 'Current Stage must be "out_for_delivery"');
    assert(journey6.stages[5].status === 'in_progress', 'Stage 6 (Out for Delivery) is in_progress');
    assert(journey6.stages[6].status === 'upcoming', 'Stage 7 (Delivered at Doorstep) is upcoming');
    assert(journey6.completedCount === 5, 'Completed count must be 5');

    // STAGE 7: Delivered at Doorstep
    console.log('\n[STAGE 7] Testing: Delivered at Doorstep (Delivery PIN Verified)');
    const orderStage7: any = {
        ...orderStage6,
        status: 'delivered',
        statusLabel: 'Delivered',
        delivered_at: now,
        delivery_pin_verified_at: now,
        timeline_events: [
            ...orderStage6.timeline_events,
            { event: 'delivered', timestamp: now },
            { event: 'delivery_pin_verified', timestamp: now }
        ]
    };
    const journey7 = computeOrderJourney(orderStage7);
    assert(journey7.isAllCompleted === true, 'All stages must be marked completed');
    assert(journey7.completedCount === 7, 'Completed count must be 7/7');
    assert(journey7.stages.every((s: any) => s.status === 'completed'), 'All 7 stages must have status "completed"');

    // -------------------------------------------------------------------------
    // PART 2: LIVE END-TO-END WORKFLOW SIMULATION IN DATABASE
    // -------------------------------------------------------------------------
    console.log('\n--- PART 2: Live End-to-End Database Lifecycle Verification ---');

    const testOrderId = `ORD-TEST-${Date.now().toString().slice(-6)}`;
    console.log(`\nSimulating live order ${testOrderId} through all 7 stages in MongoDB...`);

    // 1. Initial creation (Simulating Stripe payment completion)
    const newOrderDoc = {
        id: testOrderId,
        publicId: testOrderId,
        orderNumber: testOrderId,
        status: 'booking_confirmed',
        statusLabel: 'Booking Confirmed',
        payment_status: 'Paid',
        paymentStatus: 'Paid',
        isPaid: true,
        pickup_pin: '123456',
        pickup_otp: '123456',
        delivery_pin: '4321',
        delivery_otp: '4321',
        createdAt: now,
        updated_at: now,
        timeline_events: [
            { event: 'booking_created', label: 'Booking Created', timestamp: now },
            { event: 'payment_confirmed', label: 'Payment Confirmed', timestamp: now },
            { event: 'booking_confirmed', label: 'Booking Confirmed', timestamp: now }
        ]
    };
    await db.collection('orders').insertOne(newOrderDoc);

    // Verify Stage 1 in DB
    let liveOrder = await db.collection('orders').findOne({ id: testOrderId });
    let liveJourney = computeOrderJourney(liveOrder as any);
    assert(liveOrder?.status === 'booking_confirmed', 'Live DB order status is booking_confirmed');
    assert(liveJourney.currentStage.id === 'booking_confirmed', 'Live UI shows Current Stage: Booking Confirmed');
    assert(liveJourney.stages[5].status === 'upcoming', 'Out for Delivery is strictly UPCOMING, NOT in progress!');

    // Advance to Stage 2: Driver Scheduled & Pickup OTP Verified
    console.log('\nTransitioning -> Stage 2 (Pickup Completed)...');
    await db.collection('orders').updateOne(
        { id: testOrderId },
        {
            $set: {
                status: 'laundry_collected',
                statusLabel: 'Laundry Collected',
                pickup_pin_verified_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            },
            $push: {
                timeline_events: { event: 'laundry_collected', label: 'Laundry Collected', timestamp: new Date().toISOString() }
            } as any
        }
    );
    liveOrder = await db.collection('orders').findOne({ id: testOrderId });
    liveJourney = computeOrderJourney(liveOrder as any);
    assert(liveJourney.stages[0].status === 'completed', 'Stage 1 is now completed');
    assert(liveJourney.stages[1].status === 'completed', 'Stage 2 is now completed');
    assert(liveJourney.currentStage.id === 'received_at_plant', 'Order moves to Stage 3 (Received at Plant)');

    // Advance to Stage 3: Plant Intake
    console.log('\nTransitioning -> Stage 3 (Received at Plant)...');
    await db.collection('orders').updateOne(
        { id: testOrderId },
        {
            $set: {
                status: 'received_at_facility',
                statusLabel: 'Received at Facility',
                receivedAtFacilityAt: new Date().toISOString(),
                intake: { intakeAt: new Date().toISOString() },
                updated_at: new Date().toISOString()
            },
            $push: {
                timeline_events: { event: 'facility_intake', label: 'Received at Plant', timestamp: new Date().toISOString() }
            } as any
        }
    );
    liveOrder = await db.collection('orders').findOne({ id: testOrderId });
    liveJourney = computeOrderJourney(liveOrder as any);
    assert(liveJourney.stages[2].status === 'completed', 'Stage 3 is now completed');
    assert(liveJourney.currentStage.id === 'washing', 'Order moves to Stage 4 (Washing)');

    // Advance to Stage 4: Washing
    console.log('\nTransitioning -> Stage 4 (Washing)...');
    await db.collection('orders').updateOne(
        { id: testOrderId },
        {
            $set: {
                status: 'washing',
                statusLabel: 'Washing',
                processingStartedAt: new Date().toISOString(),
                updated_at: new Date().toISOString()
            },
            $push: {
                timeline_events: { event: 'washing', label: 'Washing Started', timestamp: new Date().toISOString() }
            } as any
        }
    );
    liveOrder = await db.collection('orders').findOne({ id: testOrderId });
    liveJourney = computeOrderJourney(liveOrder as any);
    assert(liveJourney.currentStage.id === 'washing', 'Current Stage is Washing');
    assert(liveJourney.stages[3].status === 'in_progress', 'Stage 4 is in_progress');

    // Advance to Stage 5: Quality Check
    console.log('\nTransitioning -> Stage 5 (Quality Check)...');
    await db.collection('orders').updateOne(
        { id: testOrderId },
        {
            $set: {
                status: 'quality_check',
                statusLabel: 'Quality Check',
                qcStartedAt: new Date().toISOString(),
                updated_at: new Date().toISOString()
            },
            $push: {
                timeline_events: { event: 'quality_check', label: 'Quality Check', timestamp: new Date().toISOString() }
            } as any
        }
    );
    liveOrder = await db.collection('orders').findOne({ id: testOrderId });
    liveJourney = computeOrderJourney(liveOrder as any);
    assert(liveJourney.stages[3].status === 'completed', 'Stage 4 (Washing) completed');
    assert(liveJourney.currentStage.id === 'quality_check', 'Current Stage is Quality Check');
    assert(liveJourney.stages[4].status === 'in_progress', 'Stage 5 is in_progress');

    // Advance to Stage 6: Out for Delivery
    console.log('\nTransitioning -> Stage 6 (Out for Delivery)...');
    await db.collection('orders').updateOne(
        { id: testOrderId },
        {
            $set: {
                status: 'out_for_delivery',
                statusLabel: 'Out for Delivery',
                'qc.passed': true,
                'qc.checkedAt': new Date().toISOString(),
                ready_for_delivery_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            },
            $push: {
                timeline_events: { event: 'out_for_delivery', label: 'Out for Delivery', timestamp: new Date().toISOString() }
            } as any
        }
    );
    liveOrder = await db.collection('orders').findOne({ id: testOrderId });
    liveJourney = computeOrderJourney(liveOrder as any);
    assert(liveJourney.stages[4].status === 'completed', 'Stage 5 (Quality Check) completed');
    assert(liveJourney.currentStage.id === 'out_for_delivery', 'Current Stage is Out for Delivery');
    assert(liveJourney.stages[5].status === 'in_progress', 'Stage 6 is in_progress');

    // Advance to Stage 7: Delivered at Doorstep
    console.log('\nTransitioning -> Stage 7 (Delivered at Doorstep)...');
    await db.collection('orders').updateOne(
        { id: testOrderId },
        {
            $set: {
                status: 'delivered',
                statusLabel: 'Completed',
                delivery_pin_verified_at: new Date().toISOString(),
                delivered_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            },
            $push: {
                timeline_events: { event: 'delivered', label: 'Delivered to Doorstep', timestamp: new Date().toISOString() }
            } as any
        }
    );
    liveOrder = await db.collection('orders').findOne({ id: testOrderId });
    liveJourney = computeOrderJourney(liveOrder as any);
    assert(liveJourney.isAllCompleted === true, 'All 7 stages are Completed 🎉');
    assert(liveJourney.completedCount === 7, 'Completed count is 7 of 7');

    // Clean up test order
    await db.collection('orders').deleteOne({ id: testOrderId });
    console.log('\n✓ Cleaned up test order.');

    // -------------------------------------------------------------------------
    // PART 3: VERIFY USER'S ACTUAL ORDER ORD-KT72TFKPQ2
    // -------------------------------------------------------------------------
    console.log('\n--- PART 3: Verifying User Placed Order ORD-KT72TFKPQ2 ---');
    const userOrder = await db.collection('orders').findOne({ id: 'ORD-KT72TFKPQ2' });
    if (userOrder) {
        const userJourney = computeOrderJourney(userOrder as any);
        console.log(`Order ORD-KT72TFKPQ2 Status: "${userOrder.status}" (${userOrder.statusLabel})`);
        console.log(`UI Display Current Stage: "${userJourney.currentStage.title}" (Stage ${userJourney.currentStage.stepNumber} of 7)`);
        assert(userOrder.status === 'booking_confirmed', 'Order ORD-KT72TFKPQ2 status is booking_confirmed');
        assert(userJourney.currentStage.id === 'booking_confirmed', 'Order ORD-KT72TFKPQ2 displays Current Stage: Booking Confirmed');
        assert(userJourney.stages[0].status === 'in_progress', 'Stage 1 status is in_progress');
        assert(userJourney.stages[5].status === 'upcoming', 'Stage 6 (Out for Delivery) is UPCOMING, NOT in progress');
        console.log('✓ Successfully confirmed user order is properly displayed in Booking Confirmed stage!');
    }

    console.log('\n🎉 ALL 7 STAGES TESTED AND VERIFIED SUCCESSFULLY!\n');
}

runTestSuite()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('Fatal error during test suite execution:', err);
        process.exit(1);
    });
