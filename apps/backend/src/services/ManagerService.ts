import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import crypto from 'crypto';
import { hashPassword } from '@/lib/auth';
import { NotificationService } from './NotificationService';
import { AuditService } from './AuditService';
import { generateStaffId, buildEntityLookupQuery } from '@laundelle/ids';
import { assertCanPerformOverride, normalizeRole } from '@/lib/permissions';
import {
    generateSecureNumericPin,
    generatePinSalt,
    hashOrderPin,
    encryptOrderPin
} from '@/lib/orderPin';
import { StaffProvisioningService } from './StaffProvisioningService';
import { OrderCustomerEnrichmentService } from './OrderCustomerEnrichmentService';
import { buildPostcodeDistrictRegex, buildAddressDistrictRegex } from '@laundelle/utils';
import { BadRequestError } from '@/lib/api';
import { SlaService } from './SlaService';

export class ManagerService {
    static async resolveManagerAndPlant(db: any, managerId: string) {
        // 1. Resolve User
        let user: any = null;
        if (managerId) {
            const managerLookup = buildEntityLookupQuery(managerId, 'user', (id) => ObjectId.isValid(id) ? new ObjectId(id) : null);
            user = await db.collection('users').findOne(managerLookup as any);
            if (!user && ObjectId.isValid(managerId)) {
                user = await db.collection('users').findOne({ _id: new ObjectId(managerId) } as any);
            }
            if (!user) {
                user = await db.collection('users').findOne({
                    $or: [
                        { _id: managerId },
                        { id: managerId },
                        { publicId: managerId },
                        { staffId: managerId },
                        { auth0UserId: managerId },
                        { auth0_sub: managerId },
                        { email: managerId }
                    ]
                } as any);
            }
        }

        // 2. Resolve Plant from user's plant fields
        let plant: any = null;
        const userPlantKeys: any[] = [];
        if (user) {
            const candidateKeys = [
                user.plant_id,
                user.plantId,
                user.assigned_plant,
                user.assignedPlant,
                user.plant_name,
                user.plantName,
                user.plant_code,
                user.plantCode,
                typeof user.plant === 'string' ? user.plant : (user.plant?.id || user.plant?._id || user.plant?.name)
            ].filter(Boolean);

            for (const key of candidateKeys) {
                userPlantKeys.push(key);
                userPlantKeys.push(String(key));
                if (ObjectId.isValid(key)) {
                    userPlantKeys.push(new ObjectId(key));
                }
            }
        }

        if (userPlantKeys.length > 0) {
            plant = await db.collection('plants').findOne({
                $or: [
                    { _id: { $in: userPlantKeys } },
                    { publicId: { $in: userPlantKeys } },
                    { plantId: { $in: userPlantKeys } },
                    { id: { $in: userPlantKeys } },
                    { code: { $in: userPlantKeys } },
                    { name: { $in: userPlantKeys } }
                ]
            } as any);
        }

        // 3. Resolve Plant from manager fields in plants collection
        if (!plant) {
            const managerIdentStrings: string[] = [
                managerId,
                user ? String(user._id) : null,
                user?.publicId,
                user?.staffId,
                user?.id,
                user?.auth0UserId,
                user?.auth0_sub,
                user?.email
            ].filter(Boolean) as string[];

            const managerIdentObjectIds = managerIdentStrings
                .filter(id => ObjectId.isValid(id))
                .map(id => new ObjectId(id));

            plant = await db.collection('plants').findOne({
                $or: [
                    { manager_id: { $in: [...managerIdentStrings, ...managerIdentObjectIds] } },
                    { managerId: { $in: [...managerIdentStrings, ...managerIdentObjectIds] } },
                    { manager_public_id: { $in: managerIdentStrings } },
                    { managerPublicId: { $in: managerIdentStrings } },
                    { plant_manager_id: { $in: [...managerIdentStrings, ...managerIdentObjectIds] } },
                    { plantManagerId: { $in: [...managerIdentStrings, ...managerIdentObjectIds] } },
                    ...(user?.email ? [
                        { manager_email: user.email },
                        { managerEmail: user.email }
                    ] : []),
                    ...(user?.full_name ? [
                        { manager_name: user.full_name },
                        { managerName: user.full_name }
                    ] : []),
                    ...(user?.name ? [
                        { manager_name: user.name },
                        { managerName: user.name }
                    ] : [])
                ]
            } as any);
        }

        // 4. Fallback: Any active plant in system
        if (!plant) {
            plant = await db.collection('plants').findOne({
                status: { $in: ['active', 'ACTIVE', 'ACTIVE_OPERATIONAL', 'operational', 'open'] }
            } as any);
        }
        if (!plant) {
            plant = await db.collection('plants').findOne({ status: { $ne: 'inactive' } } as any);
        }
        if (!plant) {
            plant = await db.collection('plants').findOne({} as any);
        }

        // 5. Ensure synchronization between user and plant
        let plantId = plant ? String(plant._id) : (user?.plant_id || user?.plantId || null);
        if (plant && user) {
            const updates: any = {};
            if (!user.plant_id || !user.plantId) {
                updates.plant_id = String(plant._id);
                updates.plantId = String(plant._id);
            }
            if (!user.assigned_plant) {
                updates.assigned_plant = plant.name;
                updates.assignedPlant = plant.name;
            }
            if (Object.keys(updates).length > 0) {
                await db.collection('users').updateOne(
                    { _id: user._id } as any,
                    { $set: updates }
                ).catch(() => {});
            }

            if (!plant.manager_id || plant.manager_id === '') {
                await db.collection('plants').updateOne(
                    { _id: plant._id },
                    {
                        $set: {
                            manager_id: String(user._id),
                            manager_public_id: user.publicId || String(user._id),
                            manager_name: user.full_name || user.name
                        }
                    }
                ).catch(() => {});
            }
        }

        return { user, plant, plantId };
    }

    private static async getManagerPlantId(managerId: string) {
        const db = await getDb();
        const { plant, plantId } = await this.resolveManagerAndPlant(db, managerId);
        if (plant) return String(plant._id);
        if (plantId) return String(plantId);
        throw new Error('Access denied: Manager has no assigned plant.');
    }

    static async buildPlantQueryContext(db: any, managerId: string) {
        const { user, plant, plantId } = await this.resolveManagerAndPlant(db, managerId);
        const userNormRole = normalizeRole(user?.role);

        // Collect all identifier representations for the plant
        const plantKeys = new Set<string>();
        const plantObjectIds: ObjectId[] = [];
        if (plant) {
            if (plant._id) {
                plantKeys.add(String(plant._id));
                if (ObjectId.isValid(plant._id)) plantObjectIds.push(new ObjectId(plant._id));
            }
            if (plant.publicId) plantKeys.add(String(plant.publicId));
            if (plant.id) plantKeys.add(String(plant.id));
            if (plant.code) plantKeys.add(String(plant.code));
            if (plant.name) plantKeys.add(String(plant.name));
        }
        if (plantId) {
            plantKeys.add(String(plantId));
            if (ObjectId.isValid(plantId)) plantObjectIds.push(new ObjectId(plantId));
        }

        const managerKeys = [
            managerId,
            user ? String(user._id) : null,
            user?.publicId,
            user?.staffId,
            user?.email
        ].filter(Boolean) as string[];

        // Find all staff (drivers, processors) belonging to this plant or managed by this manager
        const staffFilter: any[] = [];
        if (plantKeys.size > 0) {
            const pKeys = Array.from(plantKeys);
            staffFilter.push({ plant_id: { $in: pKeys } });
            staffFilter.push({ plantId: { $in: pKeys } });
            staffFilter.push({ assigned_plant: { $in: pKeys } });
            staffFilter.push({ plant: { $in: pKeys } });
            staffFilter.push({ plant_code: { $in: pKeys } });
        }
        if (plantObjectIds.length > 0) {
            staffFilter.push({ plant_id: { $in: plantObjectIds } });
            staffFilter.push({ plantId: { $in: plantObjectIds } });
            staffFilter.push({ plant: { $in: plantObjectIds } });
        }
        if (managerKeys.length > 0) {
            staffFilter.push({ manager_id: { $in: managerKeys } });
            staffFilter.push({ managerId: { $in: managerKeys } });
            staffFilter.push({ plantManagerId: { $in: managerKeys } });
            staffFilter.push({ plant_manager_id: { $in: managerKeys } });
            staffFilter.push({ created_by: { $in: managerKeys } });
        }

        const plantStaff = staffFilter.length > 0
            ? await db.collection('users').find({
                $or: staffFilter,
                role: { $in: ['driver', 'processor'] }
            }).toArray()
            : [];

        const staffIds = new Set<string>();
        const staffObjectIds: ObjectId[] = [];
        const servicePincodes: string[] = [];
        const staffNames: string[] = [];

        if (plant?.service_pincodes && Array.isArray(plant.service_pincodes)) {
            servicePincodes.push(...plant.service_pincodes);
        } else if (typeof plant?.service_pincodes === 'string') {
            servicePincodes.push(...plant.service_pincodes.split(',').map((p: string) => p.trim()).filter(Boolean));
        }
        if (user?.assigned_postcodes && Array.isArray(user.assigned_postcodes)) {
            servicePincodes.push(...user.assigned_postcodes);
        }
        if (user?.assignedSectors && Array.isArray(user.assignedSectors)) {
            servicePincodes.push(...user.assignedSectors);
        }

        for (const s of plantStaff) {
            if (s._id) {
                staffIds.add(String(s._id));
                if (ObjectId.isValid(s._id)) staffObjectIds.push(new ObjectId(s._id));
            }
            if (s.id) staffIds.add(String(s.id));
            if (s.publicId) staffIds.add(String(s.publicId));
            if (s.staffId) staffIds.add(String(s.staffId));
            if (s.full_name) staffNames.push(s.full_name);
            if (s.name) staffNames.push(s.name);
            if (s.assigned_postcodes && Array.isArray(s.assigned_postcodes)) {
                servicePincodes.push(...s.assigned_postcodes);
            }
            if (s.assignedSectors && Array.isArray(s.assignedSectors)) {
                servicePincodes.push(...s.assignedSectors);
            }
        }

        const plantOrConditions: any[] = [];

        // 1. Direct plant assignment on orders
        if (plantKeys.size > 0) {
            const keysArray = Array.from(plantKeys);
            plantOrConditions.push({ plant_id: { $in: keysArray } });
            plantOrConditions.push({ plantId: { $in: keysArray } });
            plantOrConditions.push({ plant_code: { $in: keysArray } });
            plantOrConditions.push({ assigned_plant: { $in: keysArray } });
            plantOrConditions.push({ plant: { $in: keysArray } });
        }
        if (plantObjectIds.length > 0) {
            plantOrConditions.push({ plant_id: { $in: plantObjectIds } });
            plantOrConditions.push({ plantId: { $in: plantObjectIds } });
            plantOrConditions.push({ plant: { $in: plantObjectIds } });
        }

        // 2. Direct manager assignment
        if (managerKeys.length > 0) {
            plantOrConditions.push({ manager_id: { $in: managerKeys } });
            plantOrConditions.push({ managerId: { $in: managerKeys } });
            plantOrConditions.push({ plantManagerId: { $in: managerKeys } });
            plantOrConditions.push({ plant_manager_id: { $in: managerKeys } });
        }

        // 3. Inherited orders from assigned drivers and processors of this plant
        if (staffIds.size > 0) {
            const staffIdsArray = Array.from(staffIds);
            plantOrConditions.push({ assigned_driver_id: { $in: staffIdsArray } });
            plantOrConditions.push({ driver_id: { $in: staffIdsArray } });
            plantOrConditions.push({ 'driver.id': { $in: staffIdsArray } });
            plantOrConditions.push({ 'driver._id': { $in: staffIdsArray } });
            plantOrConditions.push({ 'driver.driverId': { $in: staffIdsArray } });
            plantOrConditions.push({ assigned_processor_id: { $in: staffIdsArray } });
            plantOrConditions.push({ processor_id: { $in: staffIdsArray } });
            plantOrConditions.push({ 'processor.id': { $in: staffIdsArray } });
            plantOrConditions.push({ 'processor._id': { $in: staffIdsArray } });
            plantOrConditions.push({ 'processor.processorId': { $in: staffIdsArray } });
        }
        if (staffObjectIds.length > 0) {
            plantOrConditions.push({ assigned_driver_id: { $in: staffObjectIds } });
            plantOrConditions.push({ driver_id: { $in: staffObjectIds } });
            plantOrConditions.push({ assigned_processor_id: { $in: staffObjectIds } });
            plantOrConditions.push({ processor_id: { $in: staffObjectIds } });
        }
        if (staffNames.length > 0) {
            plantOrConditions.push({ 'driver.name': { $in: staffNames } });
            plantOrConditions.push({ 'processor.name': { $in: staffNames } });
        }

        // 4. Area / Postcode coverage match (unassigned orders in plant's coverage)
        const uniquePostcodes = Array.from(new Set(servicePincodes.map(p => p.trim().toUpperCase()))).filter(Boolean);
        if (uniquePostcodes.length > 0) {
            const pincodeRegexes = uniquePostcodes.map((pc: string) => buildPostcodeDistrictRegex(pc));
            const addressRegexes = uniquePostcodes.map((pc: string) => buildAddressDistrictRegex(pc));
            plantOrConditions.push({
                $and: [
                    {
                        $or: [
                            { plant_id: null },
                            { plant_id: { $exists: false } },
                            { plant_id: '' },
                            { plantId: null },
                            { plantId: { $exists: false } },
                            { plantId: '' }
                        ]
                    },
                    {
                        $or: [
                            { postcode: { $in: pincodeRegexes } },
                            ...addressRegexes.map((r: RegExp) => ({ address: r }))
                        ]
                    }
                ]
            });
        }

        const isSuperAdminNoPlant = userNormRole === 'super_admin' && !user?.plant_id && !user?.plantId;

        return {
            user,
            plant,
            plantId,
            plantStaff,
            plantOrConditions,
            isSuperAdminNoPlant
        };
    }

    static async getDashboardMetrics(managerId: string, dateFilter: string = 'Today', startDate?: string, endDate?: string) {
        const db = await getDb();
        const { user, plant, plantId, plantStaff, plantOrConditions, isSuperAdminNoPlant } = await this.buildPlantQueryContext(db, managerId);
        const manager = user;

        const baseQuery: any = {
            status: { $ne: 'pending_payment' }
        };
        if (plantOrConditions.length > 0 && !isSuperAdminNoPlant) {
            baseQuery.$or = plantOrConditions;
        }

        const orders = await db.collection('orders').find(baseQuery).toArray();
        const staff = plantStaff.length > 0 ? plantStaff : await db.collection('users').find({
            $or: [
                { plant_id: plantId },
                { manager_id: managerId },
                { plantManagerId: managerId }
            ],
            is_active: true,
            role: { $in: ['driver', 'processor'] }
        }).toArray();

        // Consistent Today Boundaries (Business Day)
        const now = new Date();
        const startOfToday = new Date(now);
        startOfToday.setHours(0, 0, 0, 0);
        const endOfToday = new Date(now);
        endOfToday.setHours(23, 59, 59, 999);

        // Calculate Date Range Bounds for Reporting Period
        let rangeStart = new Date(startOfToday);
        let rangeEnd = new Date(endOfToday);
        let isFilteredRange = true;
        let reportingPeriodDays = 7;

        const normalizedFilter = dateFilter?.toLowerCase() || 'today';

        if (normalizedFilter === 'today') {
            rangeStart = new Date(startOfToday);
            rangeEnd = new Date(endOfToday);
            reportingPeriodDays = 7; // For charts, show 7-day trend ending today
        } else if (normalizedFilter === 'yesterday') {
            rangeStart = new Date(startOfToday);
            rangeStart.setDate(rangeStart.getDate() - 1);
            rangeEnd = new Date(endOfToday);
            rangeEnd.setDate(rangeEnd.getDate() - 1);
            reportingPeriodDays = 7;
        } else if (normalizedFilter === 'this week' || normalizedFilter === 'this_week' || normalizedFilter === '7_days' || normalizedFilter === '7 days') {
            const dayOfWeek = startOfToday.getDay();
            const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
            rangeStart = new Date(startOfToday);
            rangeStart.setDate(rangeStart.getDate() - diffToMonday);
            rangeEnd = new Date(endOfToday);
            reportingPeriodDays = 7;
        } else if (normalizedFilter === 'this month' || normalizedFilter === 'this_month' || normalizedFilter === '30_days' || normalizedFilter === '30 days') {
            rangeStart = new Date(startOfToday.getFullYear(), startOfToday.getMonth(), 1, 0, 0, 0, 0);
            rangeEnd = new Date(endOfToday);
            reportingPeriodDays = 30;
        } else if (normalizedFilter === 'custom' || normalizedFilter === 'custom range') {
            if (startDate) {
                rangeStart = new Date(startDate);
                rangeStart.setHours(0, 0, 0, 0);
            } else {
                rangeStart = new Date(startOfToday);
                rangeStart.setDate(rangeStart.getDate() - 7);
            }
            if (endDate) {
                rangeEnd = new Date(endDate);
                rangeEnd.setHours(23, 59, 59, 999);
            } else {
                rangeEnd = new Date(endOfToday);
            }
            const diffDays = Math.max(1, Math.round((rangeEnd.getTime() - rangeStart.getTime()) / (24 * 60 * 60 * 1000)));
            reportingPeriodDays = Math.min(60, diffDays);
        } else {
            // 'All Time'
            isFilteredRange = false;
            reportingPeriodDays = 30;
        }

        // --- ROW 1: DAILY OPERATIONS OVERVIEW ---

        // 1. Today's Orders: Count orders received or assigned to the plant during current business day
        const getOrderCreationOrAssignmentDate = (o: any) => {
            const d = o.createdAt || o.created_at || o.date;
            if (d) return new Date(d);
            if (o._id && ObjectId.isValid(o._id)) return new ObjectId(o._id).getTimestamp();
            return new Date(0);
        };

        const todayOrders = orders.filter((o: any) => {
            const orderDate = getOrderCreationOrAssignmentDate(o);
            const isAssignedToday = o.assigned_at ? (new Date(o.assigned_at) >= startOfToday && new Date(o.assigned_at) <= endOfToday) : false;
            return (orderDate >= startOfToday && orderDate <= endOfToday) || isAssignedToday;
        }).length;

        // 2. Active Orders: Count orders currently in active, nonterminal workflow stages
        const TERMINAL_STATUSES = new Set(['delivered', 'completed', 'cancelled', 'refunded', 'returned', 'pending_payment']);
        const activeOrdersList = orders.filter((o: any) => !TERMINAL_STATUSES.has((o.status || '').toLowerCase()));
        const activeOrders = activeOrdersList.length;

        // 3. Completed Today: Count orders that reached the plant-completion milestone during current business day
        const isCompletedAtMilestoneToday = (o: any) => {
            if (o.ready_for_delivery_at) {
                const d = new Date(o.ready_for_delivery_at);
                if (d >= startOfToday && d <= endOfToday) return true;
            }
            if (o.readyForDeliveryAt) {
                const d = new Date(o.readyForDeliveryAt);
                if (d >= startOfToday && d <= endOfToday) return true;
            }
            if (o.delivered_at) {
                const d = new Date(o.delivered_at);
                if (d >= startOfToday && d <= endOfToday) return true;
            }
            if (o.deliveredAt) {
                const d = new Date(o.deliveredAt);
                if (d >= startOfToday && d <= endOfToday) return true;
            }
            if (o.completedAt) {
                const d = new Date(o.completedAt);
                if (d >= startOfToday && d <= endOfToday) return true;
            }
            if (Array.isArray(o.timeline_events)) {
                const hasMilestoneToday = o.timeline_events.some((te: any) => {
                    if (['quality_check_passed', 'qc_passed', 'ready_for_delivery', 'order_delivered', 'delivered', 'completed'].includes(te.event)) {
                        const t = new Date(te.timestamp || te.createdAt);
                        return t >= startOfToday && t <= endOfToday;
                    }
                    return false;
                });
                if (hasMilestoneToday) return true;
            }
            const st = (o.status || '').toLowerCase();
            if (['ready_for_delivery', 'out_for_delivery', 'delivered', 'completed'].includes(st)) {
                const ut = new Date(o.updated_at || o.updatedAt || o.createdAt);
                if (ut >= startOfToday && ut <= endOfToday) return true;
            }
            return false;
        };
        const completedToday = orders.filter(isCompletedAtMilestoneToday).length;

        // 4. Delayed Orders: Count active orders that have exceeded their applicable deadline
        const delayedOrdersList = activeOrdersList.filter((o: any) => {
            try {
                const sla = SlaService.calculateOrderSla(o);
                if (sla.isBreached || sla.status === 'BREACHED') return true;
                if (sla.deadlineAt && now.getTime() > new Date(sla.deadlineAt).getTime()) return true;
            } catch {
                if (o.sla?.isBreached || o.sla?.status === 'BREACHED') return true;
                if (o.deadline && now.getTime() > new Date(o.deadline).getTime()) return true;
            }
            return false;
        });
        const delayedOrders = delayedOrdersList.length;

        // --- ROW 2: PLANT PERFORMANCE AND RESOURCES ---

        // 5. On-Time Completion Rate: (Eligible orders completed on time / Total eligible orders due in reporting period) * 100
        // Exclude orders whose deadlines have not yet passed.
        let eligibleOrdersDueCount = 0;
        let completedOnTimeCount = 0;

        orders.forEach((o: any) => {
            try {
                const sla = SlaService.calculateOrderSla(o);
                if (!sla?.deadlineAt) return;
                const deadline = new Date(sla.deadlineAt);

                // Exclude orders whose deadlines have not yet passed
                if (deadline.getTime() <= now.getTime()) {
                    const isDueInReportingPeriod = !isFilteredRange || (deadline >= rangeStart && deadline <= rangeEnd);
                    if (isDueInReportingPeriod) {
                        eligibleOrdersDueCount++;

                        const st = (o.status || '').toLowerCase();
                        const isCompletedMilestone = ['ready_for_delivery', 'out_for_delivery', 'delivered', 'completed'].includes(st);
                        if (isCompletedMilestone) {
                            const completionTime = new Date(
                                o.ready_for_delivery_at ||
                                o.readyForDeliveryAt ||
                                o.delivered_at ||
                                o.deliveredAt ||
                                o.completedAt ||
                                o.updated_at ||
                                o.updatedAt ||
                                o.createdAt
                            );
                            if (completionTime.getTime() <= deadline.getTime()) {
                                completedOnTimeCount++;
                            }
                        }
                    }
                }
            } catch {
                // Ignore parsing errors for individual corrupt orders
            }
        });

        const onTimeCompletionRate = eligibleOrdersDueCount > 0
            ? Number(((completedOnTimeCount / eligibleOrdersDueCount) * 100).toFixed(1))
            : null;

        // 6. Ready for Dispatch: Quality-approved, processed orders awaiting driver pickup or handover (prevent double-counting)
        const readyForDispatchIds = new Set<string>();
        orders.forEach((o: any) => {
            const st = (o.status || '').toLowerCase();
            // Awaiting pickup: marked ready_for_delivery or qc_passed, not yet out_for_delivery or delivered
            if (st === 'ready_for_delivery' || (st === 'qc_passed' && !['out_for_delivery', 'delivered', 'completed'].includes(st))) {
                readyForDispatchIds.add(String(o._id || o.id));
            }
        });
        const readyForDispatch = readyForDispatchIds.size;

        // 7. Staff on Duty: Confirmed on duty against scheduled/assigned for current shift
        let totalDrivers = 0;
        let availableDrivers = 0;
        let busyDrivers = 0;
        let offlineDrivers = 0;

        let totalProcessors = 0;
        let availableProcessors = 0;
        let processingProcessors = 0;
        let offlineProcessors = 0;

        let onDutyStaffCount = 0;
        const totalStaffCount = staff.length;

        staff.forEach((s: any) => {
            const avail = (s.availability || s.status || '').toLowerCase();
            const isOnDuty = ['available', 'busy', 'processing', 'on-duty', 'on_duty'].includes(avail);
            if (isOnDuty) onDutyStaffCount++;

            if (s.role === 'driver') {
                totalDrivers++;
                if (avail === 'available') availableDrivers++;
                else if (avail === 'busy') busyDrivers++;
                else offlineDrivers++;
            } else if (s.role === 'processor') {
                totalProcessors++;
                if (avail === 'available') availableProcessors++;
                else if (avail === 'processing' || avail === 'busy') processingProcessors++;
                else offlineProcessors++;
            }
        });

        const staffOnDuty = {
            onDuty: onDutyStaffCount,
            scheduled: totalStaffCount,
            assigned: totalStaffCount,
            label: 'Confirmed on duty vs assigned staff'
        };

        // 8. Quality Pass Rate: (Orders passing first inspection / Orders receiving first inspection) * 100
        // Exclude orders that have not yet received their first inspection.
        let firstInspectionTotal = 0;
        let firstInspectionPassed = 0;

        orders.forEach((o: any) => {
            const hasInspection = !!(
                o.qc?.checkedAt ||
                o.qcStatus ||
                o.qc?.passed !== undefined ||
                (Array.isArray(o.timeline_events) && o.timeline_events.some((e: any) =>
                    ['quality_check_passed', 'qc_failed', 'qc_passed'].includes(e.event)
                )) ||
                ['ready_for_delivery', 'out_for_delivery', 'delivered', 'completed', 'rewash_required'].includes((o.status || '').toLowerCase())
            );

            if (hasInspection) {
                const inspectionDate = new Date(
                    o.qc?.checkedAt ||
                    o.ready_for_delivery_at ||
                    o.readyForDeliveryAt ||
                    o.updated_at ||
                    o.updatedAt ||
                    o.createdAt
                );

                const inPeriod = !isFilteredRange || (inspectionDate >= rangeStart && inspectionDate <= rangeEnd);
                if (inPeriod) {
                    firstInspectionTotal++;
                    const hadDefect = !!(
                        o.rewashRequired ||
                        o.qc?.passed === false ||
                        (o.qcStatus && o.qcStatus !== 'PASSED') ||
                        o.qc?.rewash_reason ||
                        (Array.isArray(o.timeline_events) && o.timeline_events.some((e: any) =>
                            e.event === 'qc_failed' || e.event === 'rewash_required' || (e.label && e.label.toLowerCase().includes('rewash'))
                        ))
                    );
                    if (!hadDefect) {
                        firstInspectionPassed++;
                    }
                }
            }
        });

        const qualityPassRate = firstInspectionTotal > 0
            ? Number(((firstInspectionPassed / firstInspectionTotal) * 100).toFixed(1))
            : null;

        // Legacy Pipeline Counts
        let periodOrders = 0;
        let pendingPickup = 0;
        let atPlant = 0;
        let processing = 0;
        let outForDelivery = 0;

        orders.forEach((o: any) => {
            const orderDate = getOrderCreationOrAssignmentDate(o);
            const inRange = !isFilteredRange || (orderDate >= rangeStart && orderDate <= rangeEnd);
            if (inRange) periodOrders++;

            const st = (o.status || '').toLowerCase();
            if (['collection_scheduled', 'collection_pending', 'waiting_for_driver', 'order_placed', 'booking_confirmed', 'driver_assigned'].includes(st)) {
                pendingPickup++;
            } else if (['received_at_facility', 'intake_completed', 'sorting'].includes(st)) {
                atPlant++;
            } else if (['washing', 'drying', 'ironing', 'folding_steaming', 'ready_for_qc', 'qc_ready', 'rewash_required'].includes(st)) {
                processing++;
            } else if (st === 'out_for_delivery') {
                outForDelivery++;
            }
        });

        // --- ROW 3: ANALYTICS CHARTS ---
        // Chart 1: Order Processing Overview (Received, Processed, Completed)
        // Chart 2: Plant Performance Trends (Daily On-Time Completion Rate & Quality Pass Rate)
        const daysToGenerate = reportingPeriodDays;
        const chartDaysList: Date[] = [];
        const chartEnd = isFilteredRange && normalizedFilter !== 'today' && normalizedFilter !== 'yesterday'
            ? new Date(rangeEnd)
            : new Date(startOfToday);

        for (let i = daysToGenerate - 1; i >= 0; i--) {
            const d = new Date(chartEnd);
            d.setDate(d.getDate() - i);
            chartDaysList.push(d);
        }

        const orderProcessingOverview = chartDaysList.map((dayDate) => {
            const dayStart = new Date(dayDate);
            dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(dayDate);
            dayEnd.setHours(23, 59, 59, 999);

            const dayLabel = dayDate.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
            const dateStr = dayDate.toISOString().split('T')[0];

            let receivedCount = 0;
            let processedCount = 0;
            let completedCount = 0;

            orders.forEach((o: any) => {
                const orderDate = getOrderCreationOrAssignmentDate(o);
                const assignedDate = o.assigned_at ? new Date(o.assigned_at) : null;
                if ((orderDate >= dayStart && orderDate <= dayEnd) || (assignedDate && assignedDate >= dayStart && assignedDate <= dayEnd)) {
                    receivedCount++;
                }

                const isProcessedOnDay = (Array.isArray(o.timeline_events) && o.timeline_events.some((e: any) => {
                    const et = new Date(e.timestamp || e.createdAt);
                    return et >= dayStart && et <= dayEnd && [
                        'sorting', 'washing', 'drying', 'ironing', 'folding_steaming',
                        'quality_check_passed', 'qc_passed', 'ready_for_delivery'
                    ].includes(e.event);
                })) ||
                (o.processingStartedAt && new Date(o.processingStartedAt) >= dayStart && new Date(o.processingStartedAt) <= dayEnd) ||
                (['washing', 'drying', 'ironing', 'folding_steaming', 'ready_for_qc', 'qc_ready', 'ready_for_delivery', 'out_for_delivery', 'delivered'].includes((o.status || '').toLowerCase()) &&
                new Date(o.updated_at || o.updatedAt || o.createdAt) >= dayStart && new Date(o.updated_at || o.updatedAt || o.createdAt) <= dayEnd);

                if (isProcessedOnDay) {
                    processedCount++;
                }

                const isCompletedOnDay = (o.ready_for_delivery_at && new Date(o.ready_for_delivery_at) >= dayStart && new Date(o.ready_for_delivery_at) <= dayEnd) ||
                (o.readyForDeliveryAt && new Date(o.readyForDeliveryAt) >= dayStart && new Date(o.readyForDeliveryAt) <= dayEnd) ||
                (o.delivered_at && new Date(o.delivered_at) >= dayStart && new Date(o.delivered_at) <= dayEnd) ||
                (o.deliveredAt && new Date(o.deliveredAt) >= dayStart && new Date(o.deliveredAt) <= dayEnd) ||
                (Array.isArray(o.timeline_events) && o.timeline_events.some((te: any) =>
                    ['quality_check_passed', 'qc_passed', 'ready_for_delivery', 'order_delivered', 'delivered', 'completed'].includes(te.event) &&
                    new Date(te.timestamp || te.createdAt) >= dayStart && new Date(te.timestamp || te.createdAt) <= dayEnd
                )) ||
                (['ready_for_delivery', 'out_for_delivery', 'delivered', 'completed'].includes((o.status || '').toLowerCase()) &&
                new Date(o.updated_at || o.updatedAt || o.createdAt) >= dayStart && new Date(o.updated_at || o.updatedAt || o.createdAt) <= dayEnd);

                if (isCompletedOnDay) {
                    completedCount++;
                }
            });

            return {
                date: dateStr,
                label: dayLabel,
                received: receivedCount,
                processed: processedCount,
                completed: completedCount
            };
        });

        const plantPerformanceTrends = chartDaysList.map((dayDate) => {
            const dayStart = new Date(dayDate);
            dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(dayDate);
            dayEnd.setHours(23, 59, 59, 999);

            const dayLabel = dayDate.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
            const dateStr = dayDate.toISOString().split('T')[0];

            let dayDueCount = 0;
            let dayOnTimeCount = 0;

            let dayInspectedCount = 0;
            let dayFirstPassCount = 0;

            orders.forEach((o: any) => {
                // On-Time metric for day
                try {
                    const sla = SlaService.calculateOrderSla(o);
                    if (sla?.deadlineAt) {
                        const deadline = new Date(sla.deadlineAt);
                        if (deadline >= dayStart && deadline <= dayEnd && deadline.getTime() <= now.getTime()) {
                            dayDueCount++;
                            const st = (o.status || '').toLowerCase();
                            if (['ready_for_delivery', 'out_for_delivery', 'delivered', 'completed'].includes(st)) {
                                const completionTime = new Date(
                                    o.ready_for_delivery_at ||
                                    o.readyForDeliveryAt ||
                                    o.delivered_at ||
                                    o.deliveredAt ||
                                    o.completedAt ||
                                    o.updated_at ||
                                    o.updatedAt ||
                                    o.createdAt
                                );
                                if (completionTime.getTime() <= deadline.getTime()) {
                                    dayOnTimeCount++;
                                }
                            }
                        }
                    }
                } catch {
                    // Ignore parsing error
                }

                // Quality metric for day
                const hasInspection = !!(
                    o.qc?.checkedAt ||
                    o.qcStatus ||
                    o.qc?.passed !== undefined ||
                    (Array.isArray(o.timeline_events) && o.timeline_events.some((e: any) =>
                        ['quality_check_passed', 'qc_failed', 'qc_passed'].includes(e.event)
                    )) ||
                    ['ready_for_delivery', 'out_for_delivery', 'delivered', 'completed', 'rewash_required'].includes((o.status || '').toLowerCase())
                );

                if (hasInspection) {
                    const inspectionDate = new Date(
                        o.qc?.checkedAt ||
                        o.ready_for_delivery_at ||
                        o.readyForDeliveryAt ||
                        o.updated_at ||
                        o.updatedAt ||
                        o.createdAt
                    );

                    if (inspectionDate >= dayStart && inspectionDate <= dayEnd) {
                        dayInspectedCount++;
                        const hadDefect = !!(
                            o.rewashRequired ||
                            o.qc?.passed === false ||
                            (o.qcStatus && o.qcStatus !== 'PASSED') ||
                            o.qc?.rewash_reason ||
                            (Array.isArray(o.timeline_events) && o.timeline_events.some((e: any) =>
                                e.event === 'qc_failed' || e.event === 'rewash_required' || (e.label && e.label.toLowerCase().includes('rewash'))
                            ))
                        );
                        if (!hadDefect) {
                            dayFirstPassCount++;
                        }
                    }
                }
            });

            return {
                date: dateStr,
                label: dayLabel,
                onTimeRate: dayDueCount > 0 ? Number(((dayOnTimeCount / dayDueCount) * 100).toFixed(1)) : null,
                qualityPassRate: dayInspectedCount > 0 ? Number(((dayFirstPassCount / dayInspectedCount) * 100).toFixed(1)) : null,
                dueCount: dayDueCount,
                inspectedCount: dayInspectedCount
            };
        });

        return {
            plantId: plant ? String(plant._id) : String(plantId),
            plantName: plant ? plant.name : 'Operations Facility',
            plantCode: plant ? plant.code : 'PLT-01',
            managerName: manager?.full_name || manager?.name || 'Plant Manager',
            managerStatus: manager?.is_active ? 'Active' : 'Suspended',
            dateFilter,
            periodOrders,
            stats: {
                // Row 1: Daily Operations Overview
                todayOrders,
                activeOrders,
                completedToday,
                delayedOrders,

                // Row 2: Plant Performance and Resources
                onTimeCompletionRate,
                readyForDispatch,
                staffOnDuty,
                qualityPassRate,

                // Legacy & Hero Pipeline Stats
                periodOrders,
                pendingPickup,
                pendingIntake: atPlant,
                atPlant,
                processing,
                inProcessing: processing,
                readyForDelivery: readyForDispatch,
                readyDelivery: readyForDispatch,
                outForDelivery,
                completed: completedToday
            },
            analytics: {
                reportingPeriod: dateFilter,
                orderProcessingOverview,
                plantPerformanceTrends
            },
            staff: {
                list: staff.map((s: any) => ({
                    id: s._id,
                    name: s.full_name,
                    role: s.role,
                    availability: s.availability || s.status
                })),
                drivers: {
                    total: totalDrivers,
                    available: availableDrivers,
                    busy: busyDrivers,
                    offline: offlineDrivers
                },
                processors: {
                    total: totalProcessors,
                    available: availableProcessors,
                    processing: processingProcessors,
                    offline: offlineProcessors
                }
            }
        };
    }

    static async getOrders(
        managerId: string,
        limit: number = 100,
        page: number = 1,
        status?: string,
        dateFilter?: string,
        startDate?: string,
        endDate?: string
    ) {
        const db = await getDb();
        const { user, plant, plantId, plantStaff, plantOrConditions, isSuperAdminNoPlant } = await this.buildPlantQueryContext(db, managerId);

        const DATE_KEYWORDS = ['today', 'yesterday', 'this week', 'this_week', 'this month', 'this_month', 'all time', 'all_time', 'custom', 'custom range'];
        let effectiveDateFilter = dateFilter;
        let effectiveStatus = status;

        if (effectiveStatus && DATE_KEYWORDS.includes(effectiveStatus.toLowerCase())) {
            if (!effectiveDateFilter) {
                effectiveDateFilter = effectiveStatus;
            }
            effectiveStatus = undefined;
        }

        const queryConditions: any[] = [
            (plantOrConditions.length > 0 && !isSuperAdminNoPlant) ? { $or: plantOrConditions } : {},
            { status: { $ne: 'pending_payment' } }
        ];

        if (effectiveStatus && effectiveStatus !== 'all' && !DATE_KEYWORDS.includes(effectiveStatus.toLowerCase())) {
            queryConditions.push({ status: effectiveStatus });
        }

        const normalizedFilter = effectiveDateFilter?.toLowerCase() || '';
        if (normalizedFilter && normalizedFilter !== 'all' && normalizedFilter !== 'all time' && normalizedFilter !== 'all_time') {
            const rangeStart = new Date();
            const rangeEnd = new Date();
            let isFiltered = true;

            if (normalizedFilter === 'today') {
                rangeStart.setHours(0, 0, 0, 0);
                rangeEnd.setHours(23, 59, 59, 999);
            } else if (normalizedFilter === 'yesterday') {
                rangeStart.setDate(rangeStart.getDate() - 1);
                rangeStart.setHours(0, 0, 0, 0);
                rangeEnd.setDate(rangeEnd.getDate() - 1);
                rangeEnd.setHours(23, 59, 59, 999);
            } else if (normalizedFilter === 'this week' || normalizedFilter === 'this_week') {
                const dayOfWeek = rangeStart.getDay();
                const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
                rangeStart.setDate(rangeStart.getDate() - diffToMonday);
                rangeStart.setHours(0, 0, 0, 0);
                rangeEnd.setHours(23, 59, 59, 999);
            } else if (normalizedFilter === 'this month' || normalizedFilter === 'this_month') {
                rangeStart.setDate(1);
                rangeStart.setHours(0, 0, 0, 0);
                rangeEnd.setHours(23, 59, 59, 999);
            } else if (normalizedFilter === 'custom' || normalizedFilter === 'custom range') {
                if (startDate) {
                    const parsedStart = new Date(startDate);
                    if (!isNaN(parsedStart.getTime())) {
                        rangeStart.setTime(parsedStart.getTime());
                        rangeStart.setHours(0, 0, 0, 0);
                    }
                }
                if (endDate) {
                    const parsedEnd = new Date(endDate);
                    if (!isNaN(parsedEnd.getTime())) {
                        rangeEnd.setTime(parsedEnd.getTime());
                        rangeEnd.setHours(23, 59, 59, 999);
                    }
                }
            } else {
                isFiltered = false;
            }

            if (isFiltered) {
                const startIso = rangeStart.toISOString();
                const endIso = rangeEnd.toISOString();
                queryConditions.push({
                    $or: [
                        { createdAt: { $gte: startIso, $lte: endIso } },
                        { created_at: { $gte: startIso, $lte: endIso } },
                        { createdAt: { $gte: rangeStart, $lte: rangeEnd } },
                        { created_at: { $gte: rangeStart, $lte: rangeEnd } }
                    ]
                });
            }
        }

        const query: any = {
            $and: queryConditions.filter(cond => Object.keys(cond).length > 0)
        };

        const orders = await db.collection('orders')
            .find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .toArray();
        const total = await db.collection('orders').countDocuments(query);

        // Fetch driver metadata if any order has assigned_driver_id but missing driver object
        const missingDriverIds = Array.from(new Set(
            orders
                .filter((o: any) => o.assigned_driver_id && !o.driver)
                .map((o: any) => o.assigned_driver_id)
        ));

        let driverMap = new Map<string, any>();
        if (missingDriverIds.length > 0) {
            const driverObjectIds = missingDriverIds.filter((id: any) => ObjectId.isValid(id)).map((id: any) => new ObjectId(id));
            const drivers = await db.collection('users')
                .find({
                    $or: [
                        { _id: { $in: missingDriverIds } },
                        ...(driverObjectIds.length > 0 ? [{ _id: { $in: driverObjectIds } }] : []),
                        { publicId: { $in: missingDriverIds } },
                        { id: { $in: missingDriverIds } }
                    ]
                })
                .toArray();
            drivers.forEach((d: any) => {
                driverMap.set(String(d._id), d);
                if (d.publicId) driverMap.set(String(d.publicId), d);
                if (d.id) driverMap.set(String(d.id), d);
            });
        }

        // Fetch processor metadata if any order has assigned_processor_id but missing processor object
        const missingProcessorIds = Array.from(new Set(
            orders
                .filter((o: any) => (o.assigned_processor_id || o.processor_id) && !o.processor)
                .map((o: any) => o.assigned_processor_id || o.processor_id)
        ));

        let processorMap = new Map<string, any>();
        if (missingProcessorIds.length > 0) {
            const procObjectIds = missingProcessorIds.filter((id: any) => ObjectId.isValid(id)).map((id: any) => new ObjectId(id));
            const processors = await db.collection('users')
                .find({
                    $or: [
                        { _id: { $in: missingProcessorIds } },
                        ...(procObjectIds.length > 0 ? [{ _id: { $in: procObjectIds } }] : []),
                        { publicId: { $in: missingProcessorIds } },
                        { id: { $in: missingProcessorIds } }
                    ]
                })
                .toArray();
            processors.forEach((p: any) => {
                processorMap.set(String(p._id), p);
                if (p.publicId) processorMap.set(String(p.publicId), p);
                if (p.id) processorMap.set(String(p.id), p);
            });
        }

        // Enrich customer information
        await OrderCustomerEnrichmentService.enrichOrders(orders, db);

        // Normalize fields for UI compatibility
        orders.forEach((o: any) => {
            o.id = o.id || o.publicId || String(o._id);
            o._id = String(o._id);
            if (o.address && typeof o.address === 'object') {
                const parts = [o.address.line1, o.address.line2, o.address.city, o.address.postcode].filter(Boolean);
                o.address = parts.join(', ');
            } else if (!o.address) {
                o.address = o.postcode || 'N/A';
            }
            if (o.total !== undefined && o.total !== null) {
                o.total = Number(o.total) || 0;
            } else {
                o.total = 0;
            }
            if (!o.statusLabel && o.status) {
                o.statusLabel = o.status
                    .replace(/_/g, ' ')
                    .replace(/\b\w/g, (l: string) => l.toUpperCase());
            }
            if (!o.paymentStatus) {
                o.paymentStatus = o.payment_status || 'Paid';
            }
            const drvKey = String(o.assigned_driver_id || o.driver_id || '');
            if (!o.driver && drvKey && driverMap.has(drvKey)) {
                const d = driverMap.get(drvKey);
                o.driver = {
                    id: String(d._id),
                    name: d.full_name || d.name,
                    phone: d.phone,
                    vehicle: d.vehicle || 'Logistics Van'
                };
            }
            const procKey = String(o.assigned_processor_id || o.processor_id || '');
            if (!o.processor && procKey && processorMap.has(procKey)) {
                const p = processorMap.get(procKey);
                o.processor = {
                    id: String(p._id),
                    name: p.full_name || p.name,
                    phone: p.phone,
                    station: p.station || 'Processing Facility'
                };
            }
        });

        return { orders, total };
    }

    static async assignDriver(managerId: string, orderId: string, driverId?: string | null) {
        const db = await getDb();
        const plantId = await this.getManagerPlantId(managerId);
        const now = new Date().toISOString();

        const order = await db.collection('orders').findOne(buildEntityLookupQuery(orderId, 'order'));
        if (!order) throw new Error('Order not found.');
        const orderPlant = order.plant_id || order.plantId;
        if (orderPlant && orderPlant !== plantId) {
            throw new Error('Access denied: Order belongs to a different plant.');
        }

        // Handle Unassign Driver
        if (!driverId) {
            const revertStatus = ['ready_for_delivery', 'out_for_delivery'].includes(order.status)
                ? 'ready_for_delivery'
                : 'waiting_for_driver';
            const revertLabel = revertStatus === 'ready_for_delivery' ? 'Ready for Delivery' : 'Waiting for Driver';

            await db.collection('orders').updateOne(
                { _id: order._id },
                {
                    $set: {
                        assigned_driver_id: null,
                        driver: null,
                        status: revertStatus,
                        statusLabel: revertLabel,
                        updated_at: now
                    },
                    $push: {
                        timeline_events: {
                            event: 'driver_unassigned',
                            label: 'Driver Unassigned by Manager',
                            actor: 'manager',
                            actorId: managerId,
                            timestamp: now
                        }
                    } as any
                }
            );
            return { success: true, message: 'Driver unassigned successfully.' };
        }

        const driverLookup = buildEntityLookupQuery(driverId, 'user');
        const driver = await db.collection('users').findOne({ ...driverLookup, role: 'driver', is_active: true } as any);
        if (!driver) throw new Error('Valid, active driver in your plant not found.');

        // Preserve delivery vs collection status
        let newStatus = 'collection_scheduled';
        let newStatusLabel = 'Collection Scheduled';
        if (['ready_for_delivery', 'out_for_delivery'].includes(order.status)) {
            newStatus = 'out_for_delivery';
            newStatusLabel = 'Out for Delivery';
        }

        const driverCanonicalId = driver.publicId || driver.staffId || String(driver._id);

        await db.collection('orders').updateOne(
            { _id: order._id },
            {
                $set: { 
                    assigned_driver_id: driverCanonicalId, 
                    plant_id: plantId,
                    driver: {
                        id: driverCanonicalId,
                        name: driver.full_name,
                        phone: driver.phone,
                        vehicle: driver.vehicle || 'Logistics Van'
                    },
                    status: newStatus, 
                    statusLabel: newStatusLabel, 
                    updated_at: now 
                },
                $push: {
                    timeline_events: {
                        event: 'driver_assigned',
                        label: `Assigned to Driver ${driver.full_name}`,
                        actor: 'manager',
                        actorId: managerId,
                        driverId: driverCanonicalId,
                        timestamp: now
                    }
                } as any
            }
        );
        return { success: true };
    }

    static async assignProcessor(managerId: string, orderId: string, processorId?: string | null) {
        const db = await getDb();
        const plantId = await this.getManagerPlantId(managerId);
        const now = new Date().toISOString();

        const order = await db.collection('orders').findOne(buildEntityLookupQuery(orderId, 'order'));
        if (!order) throw new Error('Order not found.');
        const orderPlant = order.plant_id || order.plantId;
        if (orderPlant && orderPlant !== plantId) {
            throw new Error('Access denied: Order belongs to a different plant.');
        }

        // Handle Unassign Processor
        if (!processorId) {
            await db.collection('orders').updateOne(
                { _id: order._id },
                {
                    $set: {
                        assigned_processor_id: null,
                        updated_at: now
                    },
                    $push: {
                        timeline_events: {
                            event: 'processor_unassigned',
                            label: 'Processor Unassigned by Manager',
                            actor: 'manager',
                            actorId: managerId,
                            timestamp: now
                        }
                    } as any
                }
            );
            return { success: true, message: 'Processor unassigned successfully.' };
        }

        const processorLookup = buildEntityLookupQuery(processorId, 'user');
        const processor = await db.collection('users').findOne({ ...processorLookup, role: 'processor', is_active: true } as any);
        if (!processor) throw new Error('Valid, active processor in your plant not found.');

        const processorCanonicalId = processor.publicId || processor.staffId || String(processor._id);

        // Keep current status if already in progress, else set to received_at_facility
        const processingStages = ['washing', 'drying', 'folding_steaming', 'ready_for_qc', 'ready_for_delivery'];
        const updateFields: any = {
            assigned_processor_id: processorCanonicalId,
            plant_id: plantId,
            updated_at: now
        };
        if (!processingStages.includes(order.status)) {
            updateFields.status = 'received_at_facility';
            updateFields.statusLabel = 'Received at Facility';
        }

        await db.collection('orders').updateOne(
            { _id: order._id },
            {
                $set: updateFields,
                $push: {
                    timeline_events: {
                        event: 'processor_assigned',
                        label: `Assigned to Processor ${processor.full_name}`,
                        actor: 'manager',
                        actorId: managerId,
                        processorId,
                        timestamp: now
                    }
                } as any
            }
        );
        return { success: true };
    }

    static async reassignBatchOrders(managerId: string, orderIds: string[], targetId: string | null, type: 'driver' | 'processor') {
        const results = [];
        for (const orderId of orderIds) {
            try {
                if (type === 'driver') {
                    await this.assignDriver(managerId, orderId, targetId);
                } else {
                    await this.assignProcessor(managerId, orderId, targetId);
                }
                results.push({ orderId, success: true });
            } catch (err: any) {
                results.push({ orderId, success: false, error: err.message });
            }
        }
        return { success: true, results };
    }

    static async managerDirectOrderOverride(
        managerId: string,
        orderId: string,
        action: any,
        data?: any,
        callerRole?: string
    ) {
        return await this.managerExecuteOverride(managerId, orderId, action, data, callerRole);
    }

    static async managerExecuteOverride(
        managerId: string,
        orderId: string,
        action: string,
        data?: any,
        callerRole?: string
    ) {
        const db = await getDb();
        const manager = await db.collection('users').findOne(buildEntityLookupQuery(managerId, 'user') as any);
        const managerName = manager?.full_name || manager?.name || 'Plant Manager';
        const effectiveRole = (callerRole || manager?.role || 'plant_manager').toLowerCase().trim();
        const normRole = normalizeRole(effectiveRole);

        // Enforce strict Role-Based Access Control
        assertCanPerformOverride(effectiveRole, action);

        const plantId = await this.getManagerPlantId(managerId);
        const now = new Date().toISOString();

        const order = await db.collection('orders').findOne(buildEntityLookupQuery(orderId, 'order'));
        if (!order) throw new Error('Order not found.');

        const isOrderCompleted = order.status === 'delivered' || order.status === 'completed' || Boolean(order.is_delivered);
        if (isOrderCompleted) {
            throw new BadRequestError('Cannot execute override: This order is already completed and delivered.');
        }

        // Enforce Multi-Plant Isolation for plant managers
        if (normRole === 'plant_manager') {
            if (!plantId) {
                throw new Error('Access denied: Manager has no assigned plant.');
            }
            if (order.plant_id && order.plant_id !== plantId) {
                throw new Error('Access denied: Order belongs to a different plant.');
            }
        }

        const reason = (data?.reason || data?.notes || '').trim();
        const requiresReasonActions = [
            'force_pickup_otp',
            'force_delivery_pin',
            'rollback_pickup',
            'rollback_delivery',
            'put_on_hold',
            'cancel_order',
            'mark_customer_unavailable',
            'return_to_plant'
        ];
        if (requiresReasonActions.includes(action) && !reason) {
            throw new Error(`A valid reason is strictly mandatory for manager override: ${action}`);
        }

        let updateSet: any = { updated_at: now };
        let unsetSet: any = {};
        let timelineEvent: any = null;
        let auditActionName = action;

        // 1. ORDER CONTROL
        if (action === 'rollback_pickup') {
            const hasDriver = Boolean(order.assigned_driver_id);
            const targetStatus = hasDriver ? 'collection_scheduled' : 'waiting_for_driver';
            const targetLabel = hasDriver ? 'Collection Scheduled' : 'Waiting for Driver';

            updateSet.status = targetStatus;
            updateSet.statusLabel = targetLabel;
            unsetSet.actual_weight = '';
            unsetSet.pickup_pin_verified_at = '';
            unsetSet.is_collected = '';
            if (order.qr_tracking) {
                updateSet['qr_tracking.collectedAt'] = null;
            }

            timelineEvent = {
                event: 'manager_rollback_pickup',
                label: 'Pickup Reverted to Awaiting Collection by Manager',
                actor: 'manager',
                actorId: managerId,
                actorName: managerName,
                reason,
                authorizedBy: 'Plant Manager',
                timestamp: now
            };
        } else if (action === 'rollback_delivery') {
            const hasDriver = Boolean(order.assigned_driver_id);
            const targetStatus = hasDriver ? 'out_for_delivery' : 'ready_for_delivery';
            const targetLabel = hasDriver ? 'Out for Delivery' : 'Ready for Delivery';

            updateSet.status = targetStatus;
            updateSet.statusLabel = targetLabel;
            unsetSet.deliveredAt = '';
            unsetSet.delivered_at = '';
            unsetSet.is_delivered = '';
            unsetSet.delivery_pin_verified_at = '';

            timelineEvent = {
                event: 'manager_rollback_delivery',
                label: 'Delivery Reverted to Out for Delivery by Manager',
                actor: 'manager',
                actorId: managerId,
                actorName: managerName,
                reason,
                authorizedBy: 'Plant Manager',
                timestamp: now
            };
        } else if (action === 'cancel_order') {
            updateSet.status = 'cancelled';
            updateSet.statusLabel = 'Cancelled';
            updateSet.cancel_reason = reason;

            timelineEvent = {
                event: 'manager_cancel_override',
                label: `Order Cancelled by Manager: ${reason}`,
                actor: 'manager',
                actorId: managerId,
                actorName: managerName,
                reason,
                timestamp: now
            };
        } else if (action === 'reopen_order') {
            const targetStatus = order.assigned_driver_id ? 'collection_scheduled' : 'waiting_for_driver';
            updateSet.status = targetStatus;
            updateSet.statusLabel = targetStatus === 'collection_scheduled' ? 'Collection Scheduled' : 'Waiting for Driver';

            timelineEvent = {
                event: 'manager_reopen_override',
                label: 'Order Reopened & Returned to Active Queue by Manager',
                actor: 'manager',
                actorId: managerId,
                actorName: managerName,
                reason: reason || 'Manager reopened operational workflow',
                timestamp: now
            };
        } else if (action === 'reschedule_slot') {
            if (data?.pickupDate) updateSet.pickupDate = data.pickupDate;
            if (data?.pickupSlot) {
                updateSet.pickupSlot = data.pickupSlot;
                updateSet.pickup_slot = data.pickupSlot;
            }
            if (data?.deliveryDate) updateSet.deliveryDate = data.deliveryDate;
            if (data?.deliverySlot) {
                updateSet.deliverySlot = data.deliverySlot;
                updateSet.delivery_slot = data.deliverySlot;
            }

            timelineEvent = {
                event: 'manager_reschedule_slot',
                label: 'Pickup/Delivery Time Window Rescheduled by Manager',
                actor: 'manager',
                actorId: managerId,
                actorName: managerName,
                details: {
                    pickupDate: updateSet.pickupDate || order.pickupDate,
                    pickupSlot: updateSet.pickupSlot || order.pickupSlot,
                    deliveryDate: updateSet.deliveryDate || order.deliveryDate,
                    deliverySlot: updateSet.deliverySlot || order.deliverySlot
                },
                reason: reason || 'Customer requested alternative schedule window',
                timestamp: now
            };
        } else if (action === 'edit_order_details') {
            if (data?.address) updateSet.address = data.address.trim();
            if (data?.addressLine1) updateSet.addressLine1 = data.addressLine1.trim();
            if (data?.addressLine2) updateSet.addressLine2 = data.addressLine2.trim();
            if (data?.postcode) updateSet.postcode = data.postcode.trim().toUpperCase();
            if (data?.phone) {
                updateSet.phone = data.phone.trim();
                updateSet.customer_phone = data.phone.trim();
            }
            if (data?.specialInstructions !== undefined) {
                updateSet.specialInstructions = data.specialInstructions;
            }

            timelineEvent = {
                event: 'manager_edit_order_details',
                label: 'Delivery Address & Contact Details Updated by Manager',
                actor: 'manager',
                actorId: managerId,
                actorName: managerName,
                notes: reason || 'Address/Contact updated per customer request',
                timestamp: now
            };
        } else if (action === 'edit_order_items') {
            if (Array.isArray(data?.items)) {
                updateSet.items = data.items;
                updateSet.bagCount = data.bagCount || data.items.length;
                updateSet.itemCount = data.items.reduce((s: number, i: any) => s + (Number(i.quantity) || 1), 0);
            }

            timelineEvent = {
                event: 'manager_edit_items',
                label: `Order Items & Bags Updated by Manager (${updateSet.itemCount || order.itemCount} items)`,
                actor: 'manager',
                actorId: managerId,
                actorName: managerName,
                notes: reason || 'Garment inventory adjusted',
                timestamp: now
            };
        }

        // 2. PICKUP CONTROL
        else if (action === 'force_pickup_otp' || action === 'confirm_pickup') {
            updateSet.status = 'received_at_facility';
            updateSet.statusLabel = 'Received at Facility';
            updateSet.actual_weight = data?.actualWeightKg || order.actual_weight || 5;
            updateSet.pickup_pin_verified_at = now;
            updateSet.pickup_verified_by_override = true;
            updateSet.override_reason = reason;

            timelineEvent = {
                event: 'manager_forced_pickup_override',
                label: 'Pickup Confirmed by Manager Override (Manual OTP Bypass)',
                actor: 'manager',
                actorId: managerId,
                actorName: managerName,
                reason,
                authorizedBy: 'Plant Manager',
                timestamp: now
            };
        } else if (action === 'mark_customer_unavailable') {
            updateSet.status = 'collection_pending';
            updateSet.statusLabel = 'Customer Unavailable • Reschedule Required';
            updateSet.customer_unavailable_at = now;
            updateSet.customer_unavailable_notes = reason;

            timelineEvent = {
                event: 'manager_customer_unavailable',
                label: 'Customer Unavailable at Scheduled Time (Flagged by Manager)',
                actor: 'manager',
                actorId: managerId,
                actorName: managerName,
                reason,
                timestamp: now
            };
        } else if (action === 'resend_pickup_otp' || action === 'generate_new_otp') {
            const newPin = generateSecureNumericPin(6);
            const pickupPinSalt = generatePinSalt();
            const customerId = String(order.customer_id || order.customerId || order.userId || '');
            const pickupPinHash = hashOrderPin(newPin, pickupPinSalt, order.id, customerId);
            const pickupPinEnc = encryptOrderPin(newPin, order.id, customerId);

            updateSet.pickup_pin = newPin;
            updateSet.pickup_otp = newPin;
            updateSet.otp_code = newPin;
            updateSet.pickup_pin_salt = pickupPinSalt;
            updateSet.pickup_pin_hash = pickupPinHash;
            updateSet.pickup_pin_enc = pickupPinEnc;
            updateSet.pickup_pin_attempts = 0;
            updateSet.pickup_otp_attempts = 0;
            updateSet.pickup_pin_locked = false;
            updateSet.pickup_pin_expires_at = null;
            updateSet.pickup_pin_generated_at = now;
            unsetSet.pickup_pin_verified_at = '';
            unsetSet.pickup_otp_verified_at = '';

            timelineEvent = {
                event: 'manager_regenerated_otp',
                label: 'Fresh Pickup OTP Generated & Sent to Customer App',
                actor: 'manager',
                actorId: managerId,
                actorName: managerName,
                timestamp: now
            };

            const notifTarget = order.customer_id || order.userId || order.customer?.id;
            if (notifTarget) {
                await NotificationService.createNotification({
                    userId: String(notifTarget),
                    title: '🔑 New Pickup PIN Generated',
                    message: `Your driver collection PIN is ${newPin}. Please share this with the driver upon arrival.`,
                    type: 'pickup_otp',
                    orderId: order.id
                }).catch(() => {});
            }
        }

        // 3. DELIVERY CONTROL
        else if (action === 'resend_delivery_otp' || action === 'generate_new_delivery_otp') {
            const newPin = generateSecureNumericPin(4);
            const deliveryPinSalt = generatePinSalt();
            const customerId = String(order.customer_id || order.customerId || order.userId || '');
            const deliveryPinHash = hashOrderPin(newPin, deliveryPinSalt, order.id, customerId);
            const deliveryPinEnc = encryptOrderPin(newPin, order.id, customerId);

            updateSet.delivery_pin = newPin;
            updateSet.delivery_otp = newPin;
            updateSet.delivery_pin_salt = deliveryPinSalt;
            updateSet.delivery_pin_hash = deliveryPinHash;
            updateSet.delivery_pin_enc = deliveryPinEnc;
            updateSet.delivery_pin_attempts = 0;
            updateSet.delivery_otp_attempts = 0;
            updateSet.delivery_pin_locked = false;
            updateSet.delivery_pin_expires_at = null;
            updateSet.delivery_pin_generated_at = now;
            unsetSet.delivery_pin_verified_at = '';
            unsetSet.delivery_otp_verified_at = '';

            timelineEvent = {
                event: 'manager_regenerated_delivery_otp',
                label: 'Fresh Delivery PIN Generated & Sent to Customer App',
                actor: 'manager',
                actorId: managerId,
                actorName: managerName,
                timestamp: now
            };

            const notifTarget = order.customer_id || order.userId || order.customer?.id;
            if (notifTarget) {
                await NotificationService.createNotification({
                    userId: String(notifTarget),
                    title: '🔑 New Delivery PIN Generated',
                    message: `Your doorstep delivery verification PIN is ${newPin}. Please share this 4-digit PIN with the driver upon handover.`,
                    type: 'delivery_otp',
                    orderId: order.id
                }).catch(() => {});
            }
        }
        else if (action === 'force_delivery_pin' || action === 'confirm_delivery') {
            updateSet.status = 'delivered';
            updateSet.statusLabel = 'Delivered';
            updateSet.deliveredAt = now;
            updateSet.delivered_at = now;
            updateSet.is_delivered = true;
            updateSet.delivery_pin_verified_at = now;
            updateSet.delivery_verified_by_override = true;

            timelineEvent = {
                event: 'manager_forced_delivery_override',
                label: 'Delivery Confirmed by Manager Override (Manual PIN Bypass)',
                actor: 'manager',
                actorId: managerId,
                actorName: managerName,
                reason,
                authorizedBy: 'Plant Manager',
                timestamp: now
            };
        } else if (action === 'return_to_plant') {
            updateSet.status = 'ready_for_delivery';
            updateSet.statusLabel = 'Returned to Plant (Safe Storage)';
            updateSet.returned_to_plant_at = now;
            updateSet.assigned_driver_id = null;
            updateSet.driver = null;

            timelineEvent = {
                event: 'manager_return_to_plant',
                label: 'Order Returned to Plant Storage (Delivery Aborted)',
                actor: 'manager',
                actorId: managerId,
                actorName: managerName,
                reason,
                authorizedBy: 'Plant Manager',
                timestamp: now
            };
        } else if (action === 'put_on_hold') {
            updateSet.status = 'on_hold';
            updateSet.statusLabel = 'On Hold (Manager Review)';
            updateSet.on_hold_at = now;
            updateSet.hold_reason = reason;

            timelineEvent = {
                event: 'manager_put_on_hold',
                label: `Order Placed on Hold: ${reason}`,
                actor: 'manager',
                actorId: managerId,
                actorName: managerName,
                reason,
                authorizedBy: 'Plant Manager',
                timestamp: now
            };
        }

        // 4. WORKFLOW STAGES (PRESERVED)
        else if (action === 'advance_stage') {
            const nextStage = data?.nextStage;
            const validStages: Record<string, string> = {
                washing: 'Washing Cycle',
                drying: 'Drying Cycle',
                folding_steaming: 'Folding & Steaming',
                ready_for_qc: 'Quality Inspection Ready',
                ready_for_delivery: 'Ready for Delivery'
            };
            if (!nextStage || !validStages[nextStage]) {
                throw new Error(`Invalid processing stage: ${nextStage}`);
            }
            updateSet.status = nextStage;
            updateSet.statusLabel = validStages[nextStage];
            timelineEvent = {
                event: 'manager_stage_advance_override',
                label: `Advanced to ${validStages[nextStage]} by Manager`,
                actor: 'manager',
                actorId: managerId,
                actorName: managerName,
                stage: nextStage,
                timestamp: now
            };
        } else if (action === 'flag_rewash') {
            updateSet.status = 'washing';
            updateSet.statusLabel = 'Rewashing Cycle';
            timelineEvent = {
                event: 'manager_rewash_override',
                label: 'Rewash Cycle Triggered by Manager',
                actor: 'manager',
                actorId: managerId,
                actorName: managerName,
                reason: reason || 'Quality standard not met',
                timestamp: now
            };
        } else if (action === 'unassign_driver') {
            return await this.assignDriver(managerId, orderId, null);
        } else if (action === 'unassign_processor') {
            return await this.assignProcessor(managerId, orderId, null);
        } else {
            throw new Error(`Unsupported override action: ${action}`);
        }

        const mongoUpdate: any = { $set: updateSet };
        if (Object.keys(unsetSet).length > 0) {
            mongoUpdate.$unset = unsetSet;
        }
        if (timelineEvent) {
            mongoUpdate.$push = { timeline_events: timelineEvent };
        }

        await db.collection('orders').updateOne({ _id: order._id }, mongoUpdate);

        // Record tamper-evident audit log
        // Record tamper-evident audit log
        await AuditService.recordOrderEvent({
            orderId,
            action: `order_override_${auditActionName}`,
            actorId: managerId,
            actorRole: effectiveRole,
            before: {
                status: order.status,
                statusLabel: order.statusLabel,
                assigned_driver_id: order.assigned_driver_id,
                pickupSlot: order.pickupSlot,
                deliverySlot: order.deliverySlot,
                address: order.address
            },
            after: updateSet,
            reason: reason || 'Manager operational override'
        });

        return {
            success: true,
            status: updateSet.status || order.status,
            statusLabel: updateSet.statusLabel || order.statusLabel,
            message: `Action ${action} completed successfully.`
        };
    }

    static async reassignAllDriverOrders(managerId: string, sourceDriverId: string, targetDriverId: string | null) {
        const db = await getDb();
        const plantId = await this.getManagerPlantId(managerId);
        const now = new Date().toISOString();

        const manager = await db.collection('users').findOne(buildEntityLookupQuery(managerId, 'user') as any);
        const managerName = manager?.full_name || manager?.name || 'Plant Manager';

        const sourceDriver = await db.collection('users').findOne({
            ...buildEntityLookupQuery(sourceDriverId, 'user'),
            role: 'driver'
        } as any);
        if (!sourceDriver) throw new Error('Source driver not found.');

        let targetDriver: any = null;
        if (targetDriverId) {
            targetDriver = await db.collection('users').findOne({
                ...buildEntityLookupQuery(targetDriverId, 'user'),
                role: 'driver',
                is_active: true
            } as any);
            if (!targetDriver) throw new Error('Target driver not found or is inactive.');
        }

        const activeOrders = await db.collection('orders').find({
            plant_id: plantId,
            assigned_driver_id: sourceDriverId,
            status: { $nin: ['delivered', 'cancelled'] }
        }).toArray();

        if (activeOrders.length === 0) {
            return { success: true, count: 0, message: 'No active orders to reassign for this driver.' };
        }

        const orderIds = activeOrders.map((o: any) => o.id);
        const results = [];

        for (const order of activeOrders) {
            try {
                if (targetDriver) {
                    await this.assignDriver(managerId, order.id, targetDriverId);
                } else {
                    await this.assignDriver(managerId, order.id, null);
                }
                results.push({ orderId: order.id, success: true });
            } catch (err: any) {
                results.push({ orderId: order.id, success: false, error: err.message });
            }
        }

        // Audit Log for bulk transfer
        await AuditService.recordEvent({
            entityType: 'driver',
            entityId: sourceDriverId,
            action: 'manager_bulk_reassign_all_orders',
            actorId: managerId,
            actorRole: 'manager',
            reason: `Reassigned ${activeOrders.length} orders from driver ${sourceDriver.full_name}`,
            metadata: {
                sourceDriverId,
                sourceDriverName: sourceDriver.full_name,
                targetDriverId: targetDriverId || null,
                targetDriverName: targetDriver ? targetDriver.full_name : 'Unassigned Pool',
                orderCount: activeOrders.length,
                orderIds
            }
        });

        return {
            success: true,
            count: activeOrders.length,
            targetDriverName: targetDriver ? targetDriver.full_name : 'Unassigned Pool',
            results
        };
    }

    static async getOrderAuditLogs(managerId: string, orderId: string) {
        const db = await getDb();
        const plantId = await this.getManagerPlantId(managerId);

        const order = await db.collection('orders').findOne(buildEntityLookupQuery(orderId, 'order'));
        if (!order) throw new Error('Order not found.');
        const orderPlant = order.plant_id || order.plantId;
        if (orderPlant && orderPlant !== plantId) {
            throw new Error('Access denied: Order belongs to a different plant.');
        }

        const logsResult = await AuditService.getLogs({ entityId: orderId }, 100, 1);
        return { logs: logsResult.items };
    }

    static async getStaff(managerId: string, returnAllIfAdmin = false, plantFilterId?: string) {
        const db = await getDb();

        if (returnAllIfAdmin) {
            const query: any = { role: { $in: ['driver', 'processor'] } };
            if (plantFilterId) {
                query.$or = [
                    { plant_id: plantFilterId },
                    { plantId: plantFilterId }
                ];
            }
            const staff = await db.collection('users')
                .find(query, { projection: { password: 0 } })
                .sort({ created_at: -1 })
                .toArray();
            return { staff };
        }

        let plantId: string | null = null;
        try {
            plantId = await this.getManagerPlantId(managerId);
        } catch {
            plantId = null;
        }

        const manager = await db.collection('users').findOne(
            buildEntityLookupQuery(managerId, 'user', (id) => ObjectId.isValid(id) ? new ObjectId(id) : null) as any
        );

        const managerKeys = [
            managerId,
            manager ? String(manager._id) : null,
            manager?.publicId,
            manager?.id,
            manager?.staffId,
            manager?.auth0UserId,
            manager?.email
        ].filter(Boolean);

        let plantDoc: any = null;
        const candidatePlantId = plantId || manager?.plant_id || manager?.plantId;
        if (candidatePlantId) {
            plantDoc = await db.collection('plants').findOne(
                buildEntityLookupQuery(candidatePlantId, 'plant', (id) => ObjectId.isValid(id) ? new ObjectId(id) : null) as any
            );
        }
        if (!plantDoc && manager) {
            plantDoc = await db.collection('plants').findOne({
                $or: [
                    { manager_id: { $in: managerKeys } },
                    { manager_public_id: { $in: managerKeys } },
                    { manager_email: manager.email }
                ]
            } as any);
        }

        const plantKeys = [
            plantId,
            candidatePlantId,
            plantDoc ? String(plantDoc._id) : null,
            plantDoc?.publicId,
            plantDoc?.id,
            plantDoc?.code,
            manager?.plant_id,
            manager?.plantId
        ].filter(Boolean);

        const query = {
            $or: [
                { plant_id: { $in: plantKeys } },
                { plantId: { $in: plantKeys } },
                { manager_id: { $in: managerKeys } },
                { plantManagerId: { $in: managerKeys } }
            ],
            role: { $in: ['driver', 'processor'] }
        };

        const staff = await db.collection('users')
            .find(query, { projection: { password: 0 } })
            .sort({ created_at: -1 })
            .toArray();

        // Auto-heal postcodes if manager/plant has postcodes but subordinate staff has none
        const managerPostcodes: string[] = Array.isArray(plantDoc?.service_pincodes)
            ? plantDoc.service_pincodes
            : (typeof plantDoc?.service_pincodes === 'string'
                ? plantDoc.service_pincodes.split(',').map((p: string) => p.trim().toUpperCase()).filter(Boolean)
                : (Array.isArray(manager?.assigned_postcodes) ? manager.assigned_postcodes : (Array.isArray(manager?.assignedSectors) ? manager.assignedSectors : [])));

        if (managerPostcodes.length > 0 && staff.length > 0) {
            const needHealing = staff.filter((s: any) => s.assigned_postcodes === undefined && s.assignedSectors === undefined);
            if (needHealing.length > 0) {
                const healingIds = needHealing.map((s: any) => s._id);
                await db.collection('users').updateMany(
                    { _id: { $in: healingIds } },
                    { $set: { assigned_postcodes: managerPostcodes, assignedSectors: managerPostcodes } }
                ).catch(() => {});
                for (const s of staff) {
                    if (s.assigned_postcodes === undefined && s.assignedSectors === undefined) {
                        s.assigned_postcodes = managerPostcodes;
                        s.assignedSectors = managerPostcodes;
                    }
                }
            }
        }

        return { staff, plantPincodes: managerPostcodes };
    }

    // ─── Helper: Sync all driver/processor postcodes from manager's plant ───────
    static async syncAllStaffPostcodes(managerId: string): Promise<void> {
        const db = await getDb();
        const manager = await db.collection('users').findOne(
            buildEntityLookupQuery(managerId, 'user', (id) => ObjectId.isValid(id) ? new ObjectId(id) : null) as any
        );
        if (!manager) return;

        const managerKeys = [
            managerId,
            String(manager._id),
            manager.publicId,
            manager.id,
            manager.staffId,
            manager.email
        ].filter(Boolean);

        let plant: any = null;
        const managerPlantId = manager.plant_id || manager.plantId;
        if (managerPlantId) {
            plant = await db.collection('plants').findOne(
                buildEntityLookupQuery(managerPlantId, 'plant', (id) => ObjectId.isValid(id) ? new ObjectId(id) : null) as any
            );
        }
        if (!plant) {
            plant = await db.collection('plants').findOne({
                $or: [
                    { manager_id: { $in: managerKeys } },
                    { manager_public_id: { $in: managerKeys } },
                    { manager_email: manager.email }
                ]
            } as any);
        }

        const pincodes: string[] = Array.isArray(plant?.service_pincodes)
            ? plant.service_pincodes
            : (typeof plant?.service_pincodes === 'string'
                ? plant.service_pincodes.split(',').map((p: string) => p.trim().toUpperCase()).filter(Boolean)
                : (Array.isArray(manager.assigned_postcodes) ? manager.assigned_postcodes : []));

        if (!pincodes || pincodes.length === 0) return;

        const plantKeys = [
            plant ? String(plant._id) : null,
            plant?.publicId,
            plant?.id,
            plant?.code,
            manager.plant_id,
            manager.plantId
        ].filter(Boolean);

        await db.collection('users').updateMany(
            {
                $or: [
                    { manager_id: { $in: managerKeys } },
                    { plantManagerId: { $in: managerKeys } },
                    { plant_id: { $in: plantKeys } },
                    { plantId: { $in: plantKeys } },
                    { _id: manager._id }
                ],
                role: { $in: ['driver', 'processor', 'manager', 'plant_manager'] }
            },
            { $set: { assigned_postcodes: pincodes, assignedSectors: pincodes } }
        );
    }

    static async createStaffMember(managerId: string, staffData: any) {
        const db = await getDb();
        const managerUser = await db.collection('users').findOne(buildEntityLookupQuery(managerId, 'user') as any);
        if (!managerUser) throw new Error('Plant Manager profile not found.');

        const actorContext: any = {
            token: { sub: managerId, role: 'plant_manager', email: managerUser.email },
            dbUser: managerUser
        };

        const targetRole = (staffData.role || '').toLowerCase();
        if (targetRole === 'driver') {
            return StaffProvisioningService.provisionDriver(actorContext, staffData);
        } else if (targetRole === 'processor') {
            return StaffProvisioningService.provisionProcessor(actorContext, staffData);
        } else {
            throw new Error('Plant Managers can only create Drivers or Processors.');
        }
    }

    static async updateStaffMember(managerId: string, staffId: string, staffData: any) {
        const db = await getDb();
        const managerUser = await db.collection('users').findOne(buildEntityLookupQuery(managerId, 'user') as any);
        if (!managerUser) throw new Error('Plant Manager profile not found.');

        const actorContext: any = {
            token: { sub: managerId, role: 'plant_manager', email: managerUser.email },
            dbUser: managerUser
        };

        return StaffProvisioningService.updateUser(actorContext, staffId, staffData);
    }

    static async getCustomers(
        managerId: string,
        search?: string,
        status?: string,
        limit: number = 50,
        page: number = 1
    ) {
        const db = await getDb();
        const { plant, plantOrConditions, isSuperAdminNoPlant } = await this.buildPlantQueryContext(db, managerId);

        const safeLimit = Math.max(1, Math.min(100, Number(limit) || 50));
        const safePage = Math.max(1, Number(page) || 1);

        // Fetch orders strictly belonging to this plant
        const orderQuery: any = {
            status: { $ne: 'pending_payment' }
        };
        if (plantOrConditions.length > 0 && !isSuperAdminNoPlant) {
            orderQuery.$or = plantOrConditions;
        }

        const orders = await db.collection('orders')
            .find(orderQuery)
            .sort({ createdAt: -1 })
            .toArray();

        await OrderCustomerEnrichmentService.enrichOrders(orders, db);

        // Fetch flags and notes
        const flags = await db.collection('customer_flags').find({}).toArray();
        const notes = await db.collection('customer_notes').find({}).toArray();
        const incidents = await db.collection('incidents').find({}).toArray();

        const customerList: any[] = [];
        const unlinkedGroups = new Map<string, any[]>();

        for (const ord of orders) {
            const key = (ord.customerEmail || ord.customer_email || ord.contactDetails?.email || ord.email || ord.customerName || ord.customer_name || ord.id || '').toLowerCase().trim();
            if (!key) continue;
            if (!unlinkedGroups.has(key)) unlinkedGroups.set(key, []);
            unlinkedGroups.get(key)!.push(ord);
        }

        unlinkedGroups.forEach((groupOrders, groupKey) => {
            const first = groupOrders[0];
            const derivedId = String(first.customerId || first.customer_id || first.userId || first.user_id || `cust_${groupKey.replace(/[^a-z0-9]/g, '')}`);
            const publicId = `CUST-${derivedId.slice(-6).toUpperCase()}`;
            const email = (first.customerEmail || first.customer_email || first.contactDetails?.email || first.email || '').trim();
            const phone = first.customerPhone || first.customer_phone || first.contactDetails?.phone || first.phone || '';
            const fullName = first.customerName || first.customer_name || (first.contactDetails ? `${first.contactDetails.firstName || ''} ${first.contactDetails.lastName || ''}`.trim() : '') || 'Customer';
            const postcode = first.postcode || '';
            const fullAddress = (typeof first.address === 'string' ? first.address : (first.address?.line1 ? `${first.address?.line1}, ${first.address?.city || ''} ${first.address?.postcode || ''}`.trim() : (first.contactDetails?.address ? `${first.contactDetails.address}, ${first.postcode || ''}`.trim() : ''))) || postcode;
            const recentOrders = groupOrders.slice(0, 5).map(o => ({
                id: String(o.id || o.publicId || o._id),
                orderNumber: o.orderNumber || o.publicId || o.id,
                status: o.status,
                total: Number(o.total || o.total_price || 0),
                date: o.createdAt || o.created_at || o.bookedAt,
                service: o.items?.[0]?.name || o.service || 'Laundry Service'
            }));

            const totalOrders = groupOrders.length;
            const lifetimeSpend = groupOrders.reduce((sum: number, o: any) => sum + Number(o.total || o.total_price || 0), 0);
            const averageOrderValue = totalOrders > 0 ? lifetimeSpend / totalOrders : 0;
            const repeatRate = totalOrders > 1 ? Math.min(100, Math.round(((totalOrders - 1) / totalOrders) * 100)) : 0;
            const lastOrderDate = groupOrders[0]?.createdAt || groupOrders[0]?.created_at || groupOrders[0]?.bookedAt || '';

            let customerStatus = 'new';
            if (lifetimeSpend > 250) customerStatus = 'high_value';
            else if (totalOrders >= 4) customerStatus = 'vip';
            else if (totalOrders >= 2) customerStatus = 'regular';

            const groupFlags = flags.filter(f => f.customerId === derivedId || f.customerId === publicId);
            const groupNotes = notes.filter(n => n.customerId === derivedId || n.customerId === publicId);
            const groupIncidents = incidents.filter(inc => inc.customerId === derivedId || inc.customerId === publicId || (email && inc.customerEmail?.toLowerCase() === email.toLowerCase()));

            customerList.push({
                id: derivedId,
                publicId,
                customerId: publicId,
                fullName,
                email,
                phone,
                postcode,
                address: fullAddress,
                status: customerStatus,
                lifetimeSpend,
                totalOrders,
                repeatRate,
                averageOrderValue,
                lastOrderDate,
                preferredService: groupOrders[0]?.items?.[0]?.name || groupOrders[0]?.service || 'Wash & Fold',
                preferredDetergent: 'Standard',
                preferredSoftener: 'Standard',
                avatarUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=03045E&color=CAF0F8&size=128`,
                flagsCount: groupFlags.length,
                internalNotesCount: groupNotes.length,
                incidentsCount: groupIncidents.length,
                createdAt: groupOrders[groupOrders.length - 1]?.createdAt || new Date().toISOString(),
                recentOrders,
                plantName: plant ? plant.name : undefined
            });
        });

        // Search filtering
        let filtered = customerList;
        if (search && search.trim()) {
            const q = search.toLowerCase().trim();
            filtered = filtered.filter(c =>
                (c.fullName && c.fullName.toLowerCase().includes(q)) ||
                (c.email && c.email.toLowerCase().includes(q)) ||
                (c.phone && c.phone.includes(q)) ||
                (c.postcode && c.postcode.toLowerCase().includes(q)) ||
                (c.id && c.id.toLowerCase().includes(q)) ||
                (c.publicId && c.publicId.toLowerCase().includes(q))
            );
        }

        // Status filtering
        if (status && status !== 'all') {
            filtered = filtered.filter(c => c.status === status);
        }

        // Sort by total orders and lifetime spend descending
        filtered.sort((a, b) => (b.totalOrders - a.totalOrders) || (b.lifetimeSpend - a.lifetimeSpend));

        const total = filtered.length;
        const paginated = filtered.slice((safePage - 1) * safeLimit, safePage * safeLimit);

        return {
            customers: paginated,
            total,
            flags,
            notes
        };
    }
}
