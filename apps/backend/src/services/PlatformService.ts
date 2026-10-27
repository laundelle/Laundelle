import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { normalizeRole } from '@laundelle/auth';
import { BadRequestError, NotFoundError } from '@/lib/api';
import { AuditService } from '@/services/AuditService';
import {
    extractOutwardCode,
    isPostcodeInServiceArea,
    parseUkPostcode,
    normalizeUkPostcode,
    isValidUkPostcodeOrDistrict
} from '@laundelle/utils';
import { generateServiceId, generateBookingSlotId } from '@laundelle/ids';
export { extractOutwardCode, isPostcodeInServiceArea, parseUkPostcode, normalizeUkPostcode };


// Canonical derivation of district and sector from candidate postcode
export function derivePostcodeSector(postcode: string) {
    const parsed = parseUkPostcode(postcode);
    if (!parsed) return null;
    return {
        district: parsed.outward,
        sector: parsed.inward ? parsed.inward.charAt(0) : ''
    };
}

export class PlatformService {
    // ----------------------------------------------------------------------
    // SERVICES
    // ----------------------------------------------------------------------
    static async getPublicServices() {
        const db = await getDb();
        return db.collection('services').find({ enabled: true }).toArray();
    }

    static async getAdminServices() {
        const db = await getDb();
        return db.collection('services').find({}).toArray(); // assuming we need all for admin. The legacy didn't have adminFetchServices but I'll return public. Wait, let's just return all.
    }

    static async createService(adminId: string, data: any) {
        const db = await getDb();
        const now = new Date().toISOString();

        // Whitelist fields
        const { name, description, price, category, enabled, icon, basePrice, imageUrl, image, pricePerKg, categoryLabel, turnaround } = data;
        if (!name) throw new BadRequestError('Service name is required.');

        const serviceId = generateServiceId();
        const finalImage = imageUrl || image || '';
        const newService = {
            id: serviceId,
            publicId: serviceId,
            serviceId,
            name,
            description: description || '',
            price: price || 0,
            basePrice: basePrice || price || 0,
            pricePerKg: pricePerKg || 0,
            category: category || 'General',
            categoryLabel: categoryLabel || category || 'General',
            turnaround: turnaround || '24-48 Hours',
            enabled: enabled !== false, // default true
            icon: icon || '',
            imageUrl: finalImage,
            image: finalImage,
            created_at: now,
            createdBy: adminId
        };

        await db.collection('services').insertOne(newService);

        await AuditService.recordEvent({
            entityType: 'service',
            entityId: newService.id,
            action: 'service_created',
            actorId: adminId,
            actorRole: 'admin'
        });

        return newService;
    }

    static async updateService(adminId: string, serviceId: string, updates: any) {
        const db = await getDb();
        const now = new Date().toISOString();

        // Whitelist fields
        const safeUpdates: any = { updated_at: now, updatedBy: adminId };
        if (updates.name !== undefined) safeUpdates.name = updates.name;
        if (updates.description !== undefined) safeUpdates.description = updates.description;
        if (updates.price !== undefined) safeUpdates.price = updates.price;
        if (updates.basePrice !== undefined) safeUpdates.basePrice = updates.basePrice;
        if (updates.pricePerKg !== undefined) safeUpdates.pricePerKg = updates.pricePerKg;
        if (updates.category !== undefined) safeUpdates.category = updates.category;
        if (updates.categoryLabel !== undefined) safeUpdates.categoryLabel = updates.categoryLabel;
        if (updates.turnaround !== undefined) safeUpdates.turnaround = updates.turnaround;
        if (updates.enabled !== undefined) safeUpdates.enabled = updates.enabled;
        if (updates.icon !== undefined) safeUpdates.icon = updates.icon;
        if (updates.imageUrl !== undefined || updates.image !== undefined) {
            const finalImg = updates.imageUrl !== undefined ? updates.imageUrl : updates.image;
            safeUpdates.imageUrl = finalImg;
            safeUpdates.image = finalImg;
        }

        const idQuery = {
            $or: [
                { id: serviceId },
                { _id: serviceId },
                { publicId: serviceId },
                { serviceId }
            ]
        };

        const result = await db.collection('services').updateOne(
            idQuery as any,
            { $set: safeUpdates }
        );

        if (result.matchedCount === 0) throw new NotFoundError('Service not found.');

        await AuditService.recordEvent({
            entityType: 'service',
            entityId: serviceId,
            action: 'service_updated',
            actorId: adminId,
            actorRole: 'admin',
            metadata: { updates: safeUpdates }
        });

        return { success: true };
    }

    static async isPlantOperationallyStaffed(plant: any): Promise<boolean> {
        if (!plant) return false;
        const db = await getDb();
        const plantId = plant._id;
        const managerId = plant.manager_id;

        const staffConditions: any[] = [];
        if (plantId) {
            staffConditions.push({ plant_id: plantId });
            staffConditions.push({ plant_id: String(plantId) });
            staffConditions.push({ plantId: String(plantId) });
        }
        if (plant.publicId) {
            staffConditions.push({ plant_id: plant.publicId });
            staffConditions.push({ plantId: plant.publicId });
        }
        if (plant.id) {
            staffConditions.push({ plant_id: plant.id });
            staffConditions.push({ plantId: plant.id });
        }
        if (managerId) {
            staffConditions.push({ manager_id: managerId });
            staffConditions.push({ manager_id: String(managerId) });
            staffConditions.push({ plantManagerId: String(managerId) });
        }
        if (plant.manager_public_id) {
            staffConditions.push({ manager_id: plant.manager_public_id });
            staffConditions.push({ plantManagerId: plant.manager_public_id });
        }
        if (plant.code) {
            staffConditions.push({ plant_code: plant.code });
        }

        if (staffConditions.length === 0) return false;

        const [driverCount, processorCount] = await Promise.all([
            db.collection('users').countDocuments({
                role: 'driver',
                is_active: { $ne: false },
                $or: staffConditions
            }),
            db.collection('users').countDocuments({
                role: 'processor',
                is_active: { $ne: false },
                $or: staffConditions
            })
        ]);

        return driverCount >= 1 && processorCount >= 1;
    }

    // ----------------------------------------------------------------------
    // SLOTS
    // ----------------------------------------------------------------------
    static async getPublicSlots(filter?: { postcode?: string; plant_id?: string }) {
        const db = await getDb();
        const query: any = { isActive: { $ne: false } };

        if (filter?.plant_id) {
            const plant = await db.collection('plants').findOne({
                $or: [
                    { _id: filter.plant_id as any },
                    { _id: String(filter.plant_id) as any },
                    { id: filter.plant_id },
                    { code: filter.plant_id }
                ]
            });
            if (!plant || !await this.isPlantOperationallyStaffed(plant)) {
                return [];
            }

            query.$or = [
                { plant_id: String(filter.plant_id) },
                { plant_id: filter.plant_id as any },
                { plant_code: plant.code }
            ];
            return db.collection('booking_slots').find(query).toArray();
        }

        if (filter?.postcode) {
            // Locate plant for this postcode
            const postcodeCheck = await this.checkPostcode(filter.postcode);
            if (postcodeCheck.isServiceable && postcodeCheck.plantId) {
                const plantSlots = await db.collection('booking_slots').find({
                    isActive: { $ne: false },
                    $or: [
                        { plant_id: String(postcodeCheck.plantId) },
                        { plant_id: postcodeCheck.plantId as any },
                        { plant_code: postcodeCheck.plantCode }
                    ]
                }).toArray();

                return plantSlots;
            }
            return [];
        }

        return [];
    }

    static async getAdminSlots(actorId?: string) {
        const db = await getDb();
        if (actorId) {
            const user = await db.collection('users').findOne({
                $or: [
                    { _id: actorId as any },
                    { _id: String(actorId) },
                    { id: actorId },
                    { publicId: actorId },
                    { auth0UserId: actorId },
                    { auth0_sub: actorId },
                    { email: actorId }
                ]
            });
            const normRole = normalizeRole(user?.role) || user?.role?.toLowerCase();
            if (normRole === 'manager' || normRole === 'plant_manager') {
                const userPlantId = user?.plant_id || (user as any)?.plantId;
                const plant = await db.collection('plants').findOne({
                    $or: [
                        ...(userPlantId ? [
                            { _id: userPlantId as any },
                            { _id: String(userPlantId) },
                            { id: userPlantId },
                            { publicId: userPlantId },
                            { code: userPlantId }
                        ] : []),
                        { manager_id: user?._id as any },
                        { manager_id: String(user?._id) },
                        { manager_id: user?.id },
                        { manager_id: user?.publicId },
                        { manager_email: user?.email }
                    ]
                });

                const plantMatchIds: any[] = [];
                if (userPlantId) {
                    plantMatchIds.push(userPlantId, String(userPlantId));
                }
                if (plant) {
                    if (plant._id) plantMatchIds.push(plant._id, String(plant._id));
                    if (plant.id) plantMatchIds.push(plant.id);
                    if (plant.publicId) plantMatchIds.push(plant.publicId);
                    if (plant.code) plantMatchIds.push(plant.code);
                }

                if (plantMatchIds.length > 0) {
                    const slotQuery: any[] = [
                        { plant_id: { $in: plantMatchIds } }
                    ];
                    if (plant?.code) slotQuery.push({ plant_code: plant.code });
                    return db.collection('booking_slots').find({
                        $or: slotQuery
                    }).toArray();
                } else {
                    return [];
                }
            }
        }
        return db.collection('booking_slots').find({}).toArray();
    }

    static async createSlot(actorId: string, data: any) {
        const db = await getDb();
        const now = new Date().toISOString();

        const user = await db.collection('users').findOne({
            $or: [
                { _id: actorId as any },
                { _id: String(actorId) },
                { id: actorId },
                { publicId: actorId },
                { auth0UserId: actorId },
                { auth0_sub: actorId },
                { email: actorId }
            ]
        });
        let plantId = data.plant_id || user?.plant_id || (user as any)?.plantId || null;
        let plantName = data.plant_name || '';
        let plantCode = data.plant_code || '';

        const normRole = normalizeRole(user?.role) || user?.role?.toLowerCase();
        if (normRole === 'manager' || normRole === 'plant_manager') {
            const userPlantId = user?.plant_id || (user as any)?.plantId;
            const plant = await db.collection('plants').findOne({
                $or: [
                    ...(userPlantId ? [
                        { _id: userPlantId as any },
                        { _id: String(userPlantId) },
                        { id: userPlantId },
                        { publicId: userPlantId },
                        { code: userPlantId }
                    ] : []),
                    { manager_id: user?._id as any },
                    { manager_id: String(user?._id) },
                    { manager_id: user?.id },
                    { manager_id: user?.publicId },
                    { manager_email: user?.email }
                ]
            });
            if (!plant && !userPlantId) {
                throw new BadRequestError('You do not have an assigned plant to create slots for.');
            }
            const allowedPlantIds = [
                ...(userPlantId ? [userPlantId, String(userPlantId)] : []),
                ...(plant ? [plant._id, String(plant._id), plant.id, plant.publicId, plant.code] : [])
            ];
            if (data.plant_id && !allowedPlantIds.includes(data.plant_id) && !allowedPlantIds.includes(String(data.plant_id))) {
                throw new BadRequestError('You can only create slots for your assigned plant.');
            }
            if (plant) {
                plantId = plant._id;
                plantName = plant.name;
                plantCode = plant.code;
            }
        } else if (plantId && (!plantName || !plantCode)) {
            const plant = await db.collection('plants').findOne({
                $or: [
                    { _id: plantId as any },
                    { _id: String(plantId) },
                    { id: plantId },
                    { publicId: plantId },
                    { code: plantId }
                ]
            });
            if (plant) {
                plantName = plant.name;
                plantCode = plant.code;
            }
        }

        const { date, startTime, endTime, capacity, isActive, slotType, daysOfWeek } = data;
        if (!startTime || !endTime) throw new BadRequestError('Start time and end time are required.');

        const slotInterval = data.slot || `${startTime} - ${endTime}`;
        const slotId = generateBookingSlotId();

        const newSlot = {
            id: slotId,
            publicId: slotId,
            slotId,
            slot: slotInterval,
            date: date || null,
            startTime,
            endTime,
            capacity: Number(capacity) || 15,
            maxCapacity: Number(capacity) || 15,
            slotType: slotType || 'both',
            type: slotType || 'both',
            daysOfWeek: Array.isArray(daysOfWeek) ? daysOfWeek : ['all'],
            isActive: isActive !== false,
            plant_id: plantId ? String(plantId) : null,
            plant_name: plantName,
            plant_code: plantCode,
            created_at: now,
            createdBy: actorId,
            createdByName: user?.full_name || user?.name || 'Manager'
        };

        await db.collection('booking_slots').insertOne(newSlot);

        await AuditService.recordEvent({
            entityType: 'slot',
            entityId: newSlot.id,
            action: 'slot_created',
            actorId,
            actorRole: 'staff',
            metadata: { plant_id: newSlot.plant_id }
        });

        return newSlot;
    }

    static async updateSlot(actorId: string, slotId: string, updates: any) {
        const db = await getDb();
        const now = new Date().toISOString();

        // Whitelist fields
        const safeUpdates: any = { updated_at: now, updatedBy: actorId };
        if (updates.date !== undefined) safeUpdates.date = updates.date;
        if (updates.startTime !== undefined) safeUpdates.startTime = updates.startTime;
        if (updates.endTime !== undefined) safeUpdates.endTime = updates.endTime;
        if (updates.startTime && updates.endTime) safeUpdates.slot = `${updates.startTime} - ${updates.endTime}`;
        else if (updates.slot !== undefined) safeUpdates.slot = updates.slot;

        if (updates.capacity !== undefined) {
            safeUpdates.capacity = Number(updates.capacity);
            safeUpdates.maxCapacity = Number(updates.capacity);
        }
        if (updates.maxCapacity !== undefined && safeUpdates.capacity === undefined) {
            safeUpdates.capacity = Number(updates.maxCapacity);
            safeUpdates.maxCapacity = Number(updates.maxCapacity);
        }
        if (updates.isActive !== undefined) safeUpdates.isActive = updates.isActive;
        if (updates.slotType !== undefined) {
            safeUpdates.slotType = updates.slotType;
            safeUpdates.type = updates.slotType;
        }
        if (updates.type !== undefined && safeUpdates.slotType === undefined) {
            safeUpdates.slotType = updates.type;
            safeUpdates.type = updates.type;
        }
        if (updates.plant_id !== undefined) safeUpdates.plant_id = updates.plant_id;
        if (updates.plant_name !== undefined) safeUpdates.plant_name = updates.plant_name;
        if (updates.plant_code !== undefined) safeUpdates.plant_code = updates.plant_code;
        if (updates.daysOfWeek !== undefined) safeUpdates.daysOfWeek = updates.daysOfWeek;

        if (safeUpdates.plant_id && (!safeUpdates.plant_name || !safeUpdates.plant_code)) {
            const plant = await db.collection('plants').findOne({
                $or: [
                    { _id: safeUpdates.plant_id as any },
                    { _id: String(safeUpdates.plant_id) },
                    { id: safeUpdates.plant_id },
                    { publicId: safeUpdates.plant_id },
                    { code: safeUpdates.plant_id }
                ]
            });
            if (plant) {
                if (!safeUpdates.plant_name) safeUpdates.plant_name = plant.name;
                if (!safeUpdates.plant_code) safeUpdates.plant_code = plant.code;
            }
        }

        const userQuery: any[] = [
            { _id: actorId as any },
            { _id: String(actorId) },
            { id: actorId },
            { publicId: actorId },
            { auth0UserId: actorId },
            { auth0_sub: actorId },
            { sub: actorId },
            { email: actorId }
        ];
        if (typeof actorId === 'string' && ObjectId.isValid(actorId) && actorId.length === 24) {
            userQuery.push({ _id: new ObjectId(actorId) });
        }
        const user = await db.collection('users').findOne({ $or: userQuery });

        const queryList: any[] = [
            { id: slotId },
            { publicId: slotId },
            { slotId: slotId },
            { _id: slotId as any },
            { _id: String(slotId) }
        ];
        if (typeof slotId === 'string' && ObjectId.isValid(slotId) && slotId.length === 24) {
            queryList.push({ _id: new ObjectId(slotId) });
        }

        const existingSlot = await db.collection('booking_slots').findOne({ $or: queryList });
        if (!existingSlot) throw new NotFoundError('Slot not found.');

        const normRole = normalizeRole(user?.role) || user?.role?.toLowerCase();
        if (normRole === 'manager' || normRole === 'plant_manager') {
            const userPlantId = user?.plant_id || (user as any)?.plantId;
            const plant = await db.collection('plants').findOne({
                $or: [
                    ...(userPlantId ? [
                        { _id: userPlantId as any },
                        { _id: String(userPlantId) },
                        { id: userPlantId },
                        { publicId: userPlantId },
                        { code: userPlantId }
                    ] : []),
                    { manager_id: user?._id as any },
                    { manager_id: String(user?._id) },
                    { manager_id: user?.id },
                    { manager_id: user?.publicId }
                ]
            });
            const allowedPlantIds = [
                ...(userPlantId ? [userPlantId, String(userPlantId)] : []),
                ...(plant ? [plant._id, String(plant._id), plant.id, plant.publicId, plant.code] : [])
            ];
            if (existingSlot.plant_id && !allowedPlantIds.includes(existingSlot.plant_id) && !allowedPlantIds.includes(String(existingSlot.plant_id))) {
                throw new BadRequestError('You can only update slots for your assigned plant.');
            }
        }

        const result = await db.collection('booking_slots').updateOne(
            { $or: queryList },
            { $set: safeUpdates }
        );

        await AuditService.recordEvent({
            entityType: 'slot',
            entityId: slotId,
            action: 'slot_updated',
            actorId,
            actorRole: 'staff'
        });

        return { success: true };
    }

    static async deleteSlot(actorId: string, slotId: string) {
        const db = await getDb();
        const userQuery: any[] = [
            { _id: actorId as any },
            { _id: String(actorId) },
            { id: actorId },
            { publicId: actorId },
            { auth0UserId: actorId },
            { auth0_sub: actorId },
            { sub: actorId },
            { email: actorId }
        ];
        if (typeof actorId === 'string' && ObjectId.isValid(actorId) && actorId.length === 24) {
            userQuery.push({ _id: new ObjectId(actorId) });
        }
        const user = await db.collection('users').findOne({ $or: userQuery });

        const queryList: any[] = [
            { id: slotId },
            { publicId: slotId },
            { slotId: slotId },
            { _id: slotId as any },
            { _id: String(slotId) }
        ];
        if (typeof slotId === 'string' && ObjectId.isValid(slotId) && slotId.length === 24) {
            queryList.push({ _id: new ObjectId(slotId) });
        }

        const slot = await db.collection('booking_slots').findOne({ $or: queryList });

        if (!slot) throw new NotFoundError('Slot not found.');

        // If manager, check that slot belongs to their plant
        const normRole = normalizeRole(user?.role) || user?.role?.toLowerCase();
        if (normRole === 'manager' || normRole === 'plant_manager') {
            const userPlantId = user?.plant_id || (user as any)?.plantId;
            const plant = await db.collection('plants').findOne({
                $or: [
                    ...(userPlantId ? [
                        { _id: userPlantId as any },
                        { _id: String(userPlantId) },
                        { id: userPlantId },
                        { publicId: userPlantId },
                        { code: userPlantId }
                    ] : []),
                    { manager_id: user?._id as any },
                    { manager_id: String(user?._id) },
                    { manager_id: user?.id },
                    { manager_id: user?.publicId }
                ]
            });
            const allowedPlantIds = [
                ...(userPlantId ? [userPlantId, String(userPlantId)] : []),
                ...(plant ? [plant._id, String(plant._id), plant.id, plant.publicId, plant.code] : [])
            ];
            if (slot.plant_id && !allowedPlantIds.includes(slot.plant_id) && !allowedPlantIds.includes(String(slot.plant_id))) {
                throw new BadRequestError('You can only delete slots for your assigned plant.');
            }
        }

        await db.collection('booking_slots').deleteOne({ $or: queryList });

        await AuditService.recordEvent({
            entityType: 'slot',
            entityId: slotId,
            action: 'slot_deleted',
            actorId,
            actorRole: 'staff'
        });

        return { success: true };
    }

    // ----------------------------------------------------------------------
    // POSTCODES
    // ----------------------------------------------------------------------
    static async checkPostcode(postcode: string) {
        if (!postcode) return { isServiceable: false, location: null, services: [] };

        const parsed = parseUkPostcode(postcode);
        if (!parsed || !parsed.isValidOutward) {
            return {
                isServiceable: false,
                location: null,
                city: null,
                district: null,
                plantId: null,
                plantCode: null,
                plantName: null,
                managerId: null,
                managerName: null,
                services: [],
                message: 'Invalid UK postcode format'
            };
        }

        const db = await getDb();

        // 1. Scan active laundry plants and match against configured service_pincodes (exact district match)
        const activePlants = await db.collection('plants').find({ status: { $in: ['ACTIVE', 'active'] } }).toArray();
        let matchedPlant: any = null;

        for (const plant of activePlants) {
            const pincodes: string[] = Array.isArray(plant.service_pincodes)
                ? plant.service_pincodes
                : (plant.service_pincodes || '')
                    .split(',')
                    .map((p: string) => p.trim().toUpperCase())
                    .filter(Boolean);

            if (pincodes.length === 0) continue;

            // EXACT DISTRICT / SERVICE AREA MATCH (Prevents PR1 from matching PR10, PR11, PR22, PR2A, PR29)
            if (isPostcodeInServiceArea(postcode, pincodes)) {
                matchedPlant = plant;
                break;
            }
        }

        // 2. Also check postcode_sectors collection if not matched on plant yet
        let sectorMatch: any = null;
        if (!matchedPlant) {
            if (parsed.isValidFull && parsed.inward) {
                const sectorDigit = parsed.inward.charAt(0);
                sectorMatch = await db.collection('postcode_sectors').findOne({
                    district: parsed.outward,
                    sector: sectorDigit,
                    is_active: true
                });
            }

            if (!sectorMatch) {
                sectorMatch = await db.collection('postcode_sectors').findOne({
                    district: parsed.outward,
                    is_active: true
                });
            }

            // If sector is mapped to an active plant, link to plant
            if (sectorMatch?.plant_id) {
                matchedPlant = activePlants.find(
                    (p: any) => String(p._id) === String(sectorMatch.plant_id) || p.id === sectorMatch.plant_id
                );
            }
        }

        // Check operational staffing requirement: must have >= 1 driver and >= 1 processor
        let isOperationallyStaffed = false;
        if (matchedPlant) {
            isOperationallyStaffed = await this.isPlantOperationallyStaffed(matchedPlant);
        }

        // Only mark serviceable if an active plant facility covers it AND has required processor + driver
        const isServiceable = !!matchedPlant && isOperationallyStaffed;

        if (!isServiceable) {
            return {
                isServiceable: false,
                location: null,
                city: null,
                district: parsed?.outward || null,
                plantId: null,
                plantCode: null,
                plantName: null,
                managerId: null,
                managerName: null,
                services: [],
                message: 'There is no plant in the area'
            };
        }

        let services: any[] = [];
        if (isServiceable) {
            services = await db.collection('services').find({ enabled: true }).toArray();
        }

        // Lookup manager details if plant is matched
        let managerName: string | null = null;
        if (matchedPlant?.manager_id) {
            const manager = await db.collection('users').findOne({ _id: matchedPlant.manager_id as any });
            if (manager) {
                managerName = manager.full_name || manager.name || null;
            }
        }

        const locationName = `${matchedPlant.name} (${matchedPlant.code})`;

        return {
            isServiceable: true,
            location: locationName,
            city: matchedPlant.address || sectorMatch?.city || null,
            district: matchedPlant.code || sectorMatch?.district || parsed?.outward || null,
            plantId: String(matchedPlant._id),
            plantCode: matchedPlant.code || null,
            plantName: matchedPlant.name || null,
            managerId: matchedPlant.manager_id || null,
            managerName: managerName || null,
            services: services.map((s: any) => ({
                id: s.id,
                name: s.name,
                description: s.description,
                price: s.price,
                basePrice: s.basePrice,
                category: s.category,
                icon: s.icon,
                image: s.image
            }))
        };
    }

    static async getActiveDistricts(): Promise<string[]> {
        const db = await getDb();
        const activePlants = await db.collection('plants').find({ status: { $in: ['ACTIVE', 'active'] } }).toArray();
        const districts = new Set<string>();
        for (const p of activePlants) {
            const isStaffed = await this.isPlantOperationallyStaffed(p);
            if (!isStaffed) continue;

            const pincodes: string[] = Array.isArray(p.service_pincodes)
                ? p.service_pincodes
                : (p.service_pincodes || '').split(',').map((s: string) => s.trim().toUpperCase()).filter(Boolean);

            for (const pin of pincodes) {
                const out = extractOutwardCode(pin);
                if (out) districts.add(out);
            }
        }
        return Array.from(districts).sort();
    }

    static async getAdminPostcodes() {
        const db = await getDb();
        return db.collection('postcode_sectors').find({}).toArray();
    }

    static async updatePostcode(adminId: string, district: string, sector: string, updates: any) {
        if (!district || !sector) throw new BadRequestError('District and sector are required.');
        const db = await getDb();
        const now = new Date().toISOString();

        // Whitelist fields
        const safeUpdates: any = { updated_at: now, updatedBy: adminId };
        if (updates.is_active !== undefined) safeUpdates.is_active = updates.is_active;
        if (updates.location !== undefined) safeUpdates.location = updates.location;
        if (updates.notes !== undefined) safeUpdates.notes = updates.notes;
        
        await db.collection('postcode_sectors').updateOne(
            { district, sector },
            { $set: safeUpdates },
            { upsert: true }
        );

        await AuditService.recordEvent({
            entityType: 'postcode',
            entityId: `${district}_${sector}`,
            action: 'postcode_updated',
            actorId: adminId,
            actorRole: 'admin'
        });

        return { success: true };
    }

    // ----------------------------------------------------------------------
    // WAITLIST
    // ----------------------------------------------------------------------
    static async joinWaitlist(entry: any) {
        if (!entry?.email || !entry?.postcode) {
            throw new BadRequestError('Email and postcode are required.');
        }

        const email = entry.email.toLowerCase().trim();
        const postcode = entry.postcode.toUpperCase().trim();

        const db = await getDb();
        const existing = await db.collection('service_area_waitlist').findOne({ email, postcode });
        
        if (existing) {
            return { success: true, alreadyRegistered: true };
        }

        // Whitelist fields
        const newEntry = {
            email,
            postcode,
            full_name: entry.full_name || '',
            phone: entry.phone || '',
            requested_service_id: entry.requested_service_id || '',
            launch_notification_consent: entry.launch_notification_consent === true,
            status: 'waiting',
            created_at: new Date().toISOString()
        };

        await db.collection('service_area_waitlist').insertOne(newEntry);
        return { success: true, alreadyRegistered: false };
    }

    static async getAdminWaitlist() {
        const db = await getDb();
        return db.collection('service_area_waitlist').find({}).toArray();
    }

    // ----------------------------------------------------------------------
    // POSTCODE DISTRICT SEARCH
    // ----------------------------------------------------------------------
    static async searchPostcodeDistricts(query: string): Promise<string[]> {
        const rawQ = (query || '').trim().toUpperCase();
        if (!rawQ) return [];

        // If input contains a full postcode (e.g. "PR1 1AB" or "CF611ZB"), return its outward code directly
        const extracted = extractOutwardCode(rawQ);
        if (extracted !== rawQ && extracted.length >= 2) {
            return [extracted];
        }

        const cleanQ = rawQ.replace(/\s+/g, '');
        const districts = new Set<string>();

        const promises: Promise<any>[] = [];

        // 1. Exact outcode lookup for cleanQ
        promises.push(
            fetch(`https://api.postcodes.io/outcodes/${encodeURIComponent(cleanQ)}`)
                .then(r => r.ok ? r.json() : null)
                .catch(() => null)
        );

        // 2. Outcode lookup for cleanQ + 0..9
        for (let i = 0; i <= 9; i++) {
            promises.push(
                fetch(`https://api.postcodes.io/outcodes/${encodeURIComponent(cleanQ + i)}`)
                    .then(r => r.ok ? r.json() : null)
                    .catch(() => null)
            );
        }

        // 3. Autocomplete lookup
        promises.push(
            fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(cleanQ)}/autocomplete`)
                .then(r => r.ok ? r.json() : null)
                .catch(() => null)
        );

        // 4. DB postcode_sectors lookup
        try {
            const db = await getDb();
            const dbSectors = await db.collection('postcode_sectors')
                .find({ district: { $regex: `^${cleanQ}`, $options: 'i' } })
                .limit(20)
                .toArray();
            dbSectors.forEach((s: any) => {
                if (s.district) districts.add(s.district.toUpperCase());
            });
        } catch {
            // ignore DB error
        }

        const responses = await Promise.all(promises);

        responses.forEach(res => {
            if (!res) return;
            if (res.result && res.result.outcode) {
                const code = res.result.outcode.toUpperCase();
                if (code.startsWith(cleanQ)) {
                    districts.add(code);
                }
            }
            if (Array.isArray(res.result)) {
                res.result.forEach((fullPc: string) => {
                    const out = extractOutwardCode(fullPc);
                    if (out && out.startsWith(cleanQ)) {
                        districts.add(out);
                    }
                });
            }
        });

        // 5. If cleanQ itself matches valid outward code format regex (e.g. PR1, M1, BD2, CF61)
        if (/^[A-Z]{1,2}[0-9][A-Z0-9]?$/i.test(cleanQ)) {
            districts.add(cleanQ);
        }

        return Array.from(districts).sort((a, b) => {
            if (a === cleanQ) return -1;
            if (b === cleanQ) return 1;
            if (a.length !== b.length) return a.length - b.length;
            return a.localeCompare(b);
        });
    }
}


