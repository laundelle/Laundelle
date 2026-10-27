import { getDb } from '../lib/mongodb';
import { ObjectId } from 'mongodb';
import { generateStaffId, buildEntityLookupQuery } from '@laundelle/ids';
import { normalizeRole, Auth0Role, hasPermission } from '@laundelle/auth';
import { Auth0Service } from './Auth0Service';
import { AuditService } from './AuditService';
import { SessionService } from './SessionService';
import {
    ApiError,
    BadRequestError,
    ForbiddenError,
    NotFoundError,
    AuthenticatedContext,
    assertPlantIsolation
} from '@/lib/api';
import { extractOutwardCode, isPostcodeInServiceArea } from '@laundelle/utils';

export interface ProvisionStaffInput {
    email: string;
    name: string;
    phone?: string;
    assigned_postcodes?: string[];
    assignedSectors?: string[];
    plantId?: string | null;
    plantManagerId?: string | null;
    vehicle_type?: string;
    vehicleType?: string;
    vehicle_reg?: string;
    vehicleReg?: string;
    license_number?: string;
    licenseNum?: string;
    emergency_contact?: any;
    emergencyName?: string;
    emergencyPhone?: string;
    resultUrl?: string;
}

export interface UpdateStaffInput {
    name?: string;
    full_name?: string;
    phone?: string;
    vehicle_type?: string;
    vehicleType?: string;
    vehicle_reg?: string;
    vehicleReg?: string;
    vehicle?: string;
    license_number?: string;
    licenseNum?: string;
    emergency_contact?: any;
    emergencyName?: string;
    emergencyPhone?: string;
    assigned_postcodes?: string[];
    assignedSectors?: string[];
    plantId?: string | null;
    plant_id?: string | null;
    manager_id?: string | null;
    plantManagerId?: string | null;
    role?: string;
    availability?: 'available' | 'busy' | 'offline' | 'off-duty';
    is_active?: boolean;
}

export interface UpdateStatusInput {
    status?: 'active' | 'suspended' | 'inactive';
    is_active?: boolean;
    reason?: string;
}

export class StaffProvisioningService {

    public static async resolvePlantPostcodes(db: any, plantId: string | null): Promise<string[]> {
        if (!plantId) return [];
        const plant = await db.collection('plants').findOne(
            buildEntityLookupQuery(plantId, 'plant', (id) => ObjectId.isValid(id) ? new ObjectId(id) : null) as any
        );
        if (!plant) return [];
        if (Array.isArray(plant.service_pincodes)) {
            return plant.service_pincodes;
        }
        if (typeof plant.service_pincodes === 'string') {
            return plant.service_pincodes
                .split(',')
                .map((p: string) => p.trim().toUpperCase())
                .filter(Boolean);
        }
        return [];
    }

    /**
     * Resolves inherited postcodes for subordinate staff.
     * Prioritizes the manager's assigned plant, then falls back to direct manager postcodes.
     */
    public static async resolveManagerPostcodes(db: any, managerId: string | null, plantId: string | null): Promise<string[]> {
        const authorized = new Set<string>();

        if (plantId) {
            const plantCodes = await this.resolvePlantPostcodes(db, plantId);
            if (plantCodes && plantCodes.length > 0) {
                plantCodes.forEach(p => authorized.add((extractOutwardCode(p) || p).trim().toUpperCase()));
            }
        }

        if (managerId) {
            const manager = await db.collection('users').findOne(
                buildEntityLookupQuery(managerId, 'user', (id) => ObjectId.isValid(id) ? new ObjectId(id) : null) as any
            );
            if (manager) {
                const mPlantId = manager.plant_id || manager.plantId;
                if (mPlantId && mPlantId !== plantId) {
                    const plantCodes = await this.resolvePlantPostcodes(db, mPlantId);
                    if (plantCodes && plantCodes.length > 0) {
                        plantCodes.forEach(p => authorized.add((extractOutwardCode(p) || p).trim().toUpperCase()));
                    }
                }
                const mKeys = [managerId, String(manager._id), manager.publicId].filter(Boolean);
                const plant = await db.collection('plants').findOne({
                    $or: [
                        { manager_id: { $in: mKeys } },
                        { manager_public_id: { $in: mKeys } }
                    ]
                } as any);
                if (plant) {
                    const plantCodes = await this.resolvePlantPostcodes(db, String(plant._id));
                    if (plantCodes && plantCodes.length > 0) {
                        plantCodes.forEach(p => authorized.add((extractOutwardCode(p) || p).trim().toUpperCase()));
                    }
                }
                if (Array.isArray(manager.assigned_postcodes) && manager.assigned_postcodes.length > 0) {
                    manager.assigned_postcodes.forEach((p: string) => authorized.add((extractOutwardCode(p) || p).trim().toUpperCase()));
                }
                if (Array.isArray(manager.assignedSectors) && manager.assignedSectors.length > 0) {
                    manager.assignedSectors.forEach((p: string) => authorized.add((extractOutwardCode(p) || p).trim().toUpperCase()));
                }
            }
        }
        return Array.from(authorized);
    }

    /**
     * Provisions a new Plant Manager.
     * Permission required: managers:create (Super Admin only).
     */
    public static async provisionManager(
        actorContext: AuthenticatedContext,
        input: ProvisionStaffInput
    ) {
        const actorRole = normalizeRole(actorContext.dbUser.role);
        if (actorRole !== 'super_admin') {
            throw new ForbiddenError('Only Super Admins are authorized to provision Plant Managers.');
        }

        const rawName = input.name || (input as any).full_name || (input as any).fullName;
        if (!input.email || !rawName) {
            throw new BadRequestError('Name and email are required to provision a Manager.');
        }

        const name = String(rawName).trim();
        const email = input.email.toLowerCase().trim();
        const db = await getDb();

        // 1. Check duplicate email in MongoDB
        const existing = await db.collection('users').findOne({ email });
        if (existing) {
            throw new BadRequestError(`A user with email "${email}" already exists in Laundelle.`);
        }

        // 2. Validate plant if provided
        let targetPlantId: string | null = input.plantId || (input as any).plant_id || null;
        let resolvedPlantDoc: any = null;
        if (targetPlantId) {
            resolvedPlantDoc = await db.collection('plants').findOne(buildEntityLookupQuery(targetPlantId, 'plant') as any);
            if (!resolvedPlantDoc) {
                throw new BadRequestError(`Plant with ID "${targetPlantId}" not found.`);
            }
            targetPlantId = resolvedPlantDoc.publicId || resolvedPlantDoc.id || String(resolvedPlantDoc._id);
        }

        const internalDbId = new ObjectId().toHexString();
        const staffPublicId = generateStaffId();
        const now = new Date().toISOString();
        const actorId = String(actorContext.dbUser._id || actorContext.token.sub);

        // 3. Auth0 Provisioning Transaction with automatic compensation rollback
        const provisionResult = await Auth0Service.provisionStaffUserWithRollback(
            {
                email,
                name: name,
                role: 'plant_manager',
                phone: input.phone,
                resultUrl: input.resultUrl,
                appMetadata: {
                    laundelleId: staffPublicId,
                    laundelleDbId: internalDbId,
                    role: 'plant_manager'
                }
            },
            async (auth0User) => {
                // If the target plant already has another manager assigned, unlink previous manager
                if (targetPlantId) {
                    const plant = await db.collection('plants').findOne({ _id: targetPlantId as any });
                    if (plant && plant.manager_id) {
                        await db.collection('users').updateOne(
                            { _id: plant.manager_id as any },
                            { $set: { plant_id: null, plantId: null } }
                        );
                    }
                    await db.collection('plants').updateOne(
                        { _id: targetPlantId as any },
                        { $set: { manager_id: internalDbId } }
                    );
                }

                const newManagerDoc: any = {
                    _id: internalDbId,
                    id: staffPublicId,
                    staffId: staffPublicId,
                    publicId: staffPublicId,
                    auth0UserId: auth0User.id,
                    email,
                    name: name,
                    full_name: name,
                    phone: input.phone || '',
                    role: 'manager',
                    plantId: targetPlantId,
                    plant_id: targetPlantId,
                    plantManagerId: null,
                    manager_id: null,
                    status: 'active',
                    is_active: true,
                    created_at: now,
                    created_by: actorId
                };

                await db.collection('users').insertOne(newManagerDoc);
                return newManagerDoc;
            }
        );

        await AuditService.recordEvent({
            actorId,
            actorRole: 'super_admin',
            action: 'staff_provisioned',
            entityType: 'staff',
            entityId: internalDbId,
            reason: `Manager provisioned in Auth0 and MongoDB for plant ${targetPlantId || 'unassigned'}`
        }).catch(() => {});

        return {
            success: true,
            user: provisionResult.mongoUser,
            ticketUrl: provisionResult.ticketUrl,
            staffId: staffPublicId,
            publicId: staffPublicId
        };
    }

    /**
     * Provisions a new Driver.
     * Permission required: drivers:create.
     * Super Admin can assign any plant/manager.
     * Plant Manager is strictly isolated to own plant and own manager ID.
     */
    public static async provisionDriver(
        actorContext: AuthenticatedContext,
        input: ProvisionStaffInput
    ) {
        return this.provisionSubordinateStaff(actorContext, 'driver', input);
    }

    /**
     * Provisions a new Processor.
     * Permission required: processors:create.
     * Super Admin can assign any plant/manager.
     * Plant Manager is strictly isolated to own plant and own manager ID.
     */
    public static async provisionProcessor(
        actorContext: AuthenticatedContext,
        input: ProvisionStaffInput
    ) {
        return this.provisionSubordinateStaff(actorContext, 'processor', input);
    }

    /**
     * Shared logic for provisioning drivers or processors.
     */
    private static async provisionSubordinateStaff(
        actorContext: AuthenticatedContext,
        targetRole: 'driver' | 'processor',
        input: ProvisionStaffInput
    ) {
        const rawName = input.name || (input as any).full_name || (input as any).fullName;
        if (!input.email || !rawName) {
            throw new BadRequestError(`Name and email are required to provision a ${targetRole}.`);
        }

        const name = String(rawName).trim();
        const email = input.email.toLowerCase().trim();
        const db = await getDb();

        // 1. Check duplicate email in MongoDB
        const existing = await db.collection('users').findOne({ email });
        if (existing) {
            throw new BadRequestError(`A user with email "${email}" already exists in Laundelle.`);
        }

        const actorRole = normalizeRole(actorContext.dbUser.role);
        let resolvedPlantId: string | null = null;
        let resolvedManagerId: string | null = null;

        if (actorRole === 'plant_manager') {
            // STRICT PLANT ISOLATION:
            // Manager CANNOT choose another plant or manager. Force to manager's plant & ID.
            resolvedPlantId = actorContext.dbUser.plant_id || actorContext.dbUser.plantId || null;
            resolvedManagerId = String(actorContext.dbUser._id);

            if (!resolvedPlantId) {
                // Try resolving from plants collection where manager_id matches, or fallback to any active plant
                let plant = await db.collection('plants').findOne({ manager_id: resolvedManagerId });
                if (!plant) {
                    plant = await db.collection('plants').findOne({ status: { $ne: 'inactive' } });
                }
                if (!plant) {
                    const defaultPlant = {
                        _id: 'plant_preston_central' as any,
                        id: 'plant_preston_central',
                        name: 'Preston Central Processing Plant',
                        code: 'PST-01',
                        address: 'Unit 4, Laundelle Industrial Estate, Preston PR1 1AA',
                        service_pincodes: ['PR1', 'PR2', 'PR3', 'PR4', 'PR5'],
                        manager_id: resolvedManagerId,
                        status: 'active',
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    };
                    await db.collection('plants').insertOne(defaultPlant);
                    plant = defaultPlant;
                }

                if (plant) {
                    resolvedPlantId = String(plant._id || plant.id);
                    await db.collection('users').updateOne(
                        { _id: actorContext.dbUser._id } as any,
                        { $set: { plant_id: resolvedPlantId, plantId: resolvedPlantId } }
                    );
                    actorContext.dbUser.plant_id = resolvedPlantId;
                    actorContext.dbUser.plantId = resolvedPlantId;
                } else {
                    throw new ForbiddenError('Access denied: Plant Manager is not linked to an operational plant.');
                }
            }
        } else if (actorRole === 'super_admin') {
            // Super Admin may specify plant and/or manager
            resolvedPlantId = input.plantId || (input as any).plant_id || null;
            resolvedManagerId = input.plantManagerId || (input as any).manager_id || (input as any).plant_manager_id || null;

            if (resolvedManagerId && !resolvedPlantId) {
                const manager = await db.collection('users').findOne(buildEntityLookupQuery(resolvedManagerId, 'user') as any);
                if (manager) {
                    resolvedPlantId = manager.plant_id || manager.plantId || null;
                }
                if (!resolvedPlantId) {
                    const plant = await db.collection('plants').findOne({
                        $or: [
                            { manager_id: resolvedManagerId },
                            { manager_id: manager?.publicId }
                        ]
                    });
                    if (plant) resolvedPlantId = plant.publicId || plant.id || String(plant._id);
                }
            }
        } else {
            throw new ForbiddenError(`Role "${actorRole}" is not authorized to provision staff members.`);
        }

        // Validate plant existence if plant is assigned
        if (resolvedPlantId) {
            const plantExists = await db.collection('plants').findOne(buildEntityLookupQuery(resolvedPlantId, 'plant') as any);
            if (!plantExists) {
                throw new BadRequestError(`Plant with ID "${resolvedPlantId}" does not exist.`);
            }
            resolvedPlantId = plantExists.publicId || plantExists.id || String(plantExists._id);
        }

        // Postcodes are inherited from the assigned plant or manager, or validated if specified by manager
        const inheritedPostcodes = await this.resolveManagerPostcodes(db, resolvedManagerId, resolvedPlantId);
        let assignedStaffPostcodes = inheritedPostcodes;

        const rawRequested = input.assigned_postcodes || input.assignedSectors;
        if (rawRequested && (Array.isArray(rawRequested) ? rawRequested.length > 0 : String(rawRequested).trim().length > 0)) {
            const requestedList = (Array.isArray(rawRequested) ? rawRequested : String(rawRequested).split(','))
                .map((p: string) => (extractOutwardCode(String(p).trim()) || String(p).trim().toUpperCase()))
                .filter(Boolean);
            const normalizedRequested = Array.from(new Set(requestedList));

            if (inheritedPostcodes.length > 0) {
                const authorizedSet = new Set(inheritedPostcodes.map((p: string) => (extractOutwardCode(p) || p).trim().toUpperCase()));
                const unauthorized = normalizedRequested.filter(p => !authorizedSet.has(p));
                if (unauthorized.length > 0) {
                    throw new BadRequestError(
                        `Unauthorized postcode assignment: Postcode(s) [${unauthorized.join(', ')}] are outside the plant manager's authorized service area [${Array.from(authorizedSet).join(', ')}]. Only pincodes under this plant manager can be assigned.`
                    );
                }
            }
            assignedStaffPostcodes = normalizedRequested;
        }

        const internalDbId = new ObjectId().toHexString();
        const staffPublicId = generateStaffId();
        const now = new Date().toISOString();
        const actorId = String(actorContext.dbUser._id || actorContext.token.sub);

        const vehicleType = input.vehicle_type || input.vehicleType || '';
        const vehicleReg = input.vehicle_reg || input.vehicleReg || '';
        const vehicleSummary = vehicleReg ? `${vehicleType || 'Vehicle'} - ${vehicleReg}` : '';

        const emergencyContact = input.emergency_contact || (
            (input.emergencyName || input.emergencyPhone)
                ? { name: input.emergencyName || '', phone: input.emergencyPhone || '' }
                : null
        );

        const auth0Role: Auth0Role = targetRole === 'driver' ? 'driver' : 'processor';

        // Auth0 Provisioning Transaction with automatic compensation rollback
        const provisionResult = await Auth0Service.provisionStaffUserWithRollback(
            {
                email,
                name: name,
                role: auth0Role,
                phone: input.phone,
                resultUrl: input.resultUrl,
                appMetadata: {
                    laundelleId: staffPublicId,
                    laundelleDbId: internalDbId,
                    role: targetRole,
                    plantId: resolvedPlantId
                }
            },
            async (auth0User) => {
                const newStaffDoc: any = {
                    _id: internalDbId,
                    id: staffPublicId,
                    staffId: staffPublicId,
                    publicId: staffPublicId,
                    auth0UserId: auth0User.id,
                    email,
                    name: name,
                    full_name: name,
                    phone: input.phone || '',
                    role: targetRole,
                    plantId: resolvedPlantId,
                    plant_id: resolvedPlantId,
                    plantManagerId: resolvedManagerId,
                    manager_id: resolvedManagerId,
                    vehicle_type: vehicleType,
                    vehicle_reg: vehicleReg,
                    license_number: input.license_number || input.licenseNum || '',
                    emergency_contact: emergencyContact,
                    vehicle: vehicleSummary,
                    assigned_postcodes: assignedStaffPostcodes,
                    assignedSectors: assignedStaffPostcodes,
                    status: 'active',
                    is_active: true,
                    created_at: now,
                    created_by: actorId
                };

                await db.collection('users').insertOne(newStaffDoc);
                return newStaffDoc;
            }
        );

        await AuditService.recordEvent({
            actorId,
            actorRole: actorRole || 'system',
            action: `${targetRole}_provisioned`,
            entityType: 'staff',
            entityId: internalDbId,
            reason: `${targetRole} provisioned in Auth0 and MongoDB for plant ${resolvedPlantId || 'none'}`
        }).catch(() => {});

        return {
            success: true,
            user: provisionResult.mongoUser,
            ticketUrl: provisionResult.ticketUrl,
            staffId: staffPublicId,
            publicId: staffPublicId
        };
    }

    /**
     * Lists Plant Managers.
     * Permission: managers:read (Super Admin only).
     */
    public static async listManagers(actorContext: AuthenticatedContext) {
        const actorRole = normalizeRole(actorContext.dbUser.role);
        if (actorRole !== 'super_admin') {
            throw new ForbiddenError('Access denied: Only Super Admins can list managers.');
        }

        const db = await getDb();
        const managers = await db.collection('users')
            .find(
                { role: { $in: ['manager', 'plant_manager'] } },
                { projection: { password: 0, password_hash: 0, password_salt: 0, iterations: 0 } }
            )
            .sort({ created_at: -1 })
            .toArray();

        return { managers, staff: managers };
    }

    /**
     * Lists Drivers with plant isolation enforcement.
     * Permission: drivers:read.
     */
    public static async listDrivers(actorContext: AuthenticatedContext, queryPlantId?: string) {
        const actorRole = normalizeRole(actorContext.dbUser.role);
        const db = await getDb();
        const query: any = { role: 'driver' };

        if (actorRole === 'plant_manager') {
            const managerPlantId = actorContext.dbUser.plant_id || actorContext.dbUser.plantId;
            query.$or = [
                { plant_id: managerPlantId },
                { plantId: managerPlantId },
                { manager_id: String(actorContext.dbUser._id) },
                { plantManagerId: String(actorContext.dbUser._id) }
            ];
        } else if (actorRole === 'super_admin') {
            if (queryPlantId) {
                query.$or = [{ plant_id: queryPlantId }, { plantId: queryPlantId }];
            }
        } else {
            throw new ForbiddenError('Access denied: Unauthorized to list drivers.');
        }

        const drivers = await db.collection('users')
            .find(query, { projection: { password: 0, password_hash: 0, password_salt: 0, iterations: 0 } })
            .sort({ created_at: -1 })
            .toArray();

        return { drivers, staff: drivers };
    }

    /**
     * Lists Processors with plant isolation enforcement.
     * Permission: processors:read.
     */
    public static async listProcessors(actorContext: AuthenticatedContext, queryPlantId?: string) {
        const actorRole = normalizeRole(actorContext.dbUser.role);
        const db = await getDb();
        const query: any = { role: 'processor' };

        if (actorRole === 'plant_manager') {
            const managerPlantId = actorContext.dbUser.plant_id || actorContext.dbUser.plantId;
            query.$or = [
                { plant_id: managerPlantId },
                { plantId: managerPlantId },
                { manager_id: String(actorContext.dbUser._id) },
                { plantManagerId: String(actorContext.dbUser._id) }
            ];
        } else if (actorRole === 'super_admin') {
            if (queryPlantId) {
                query.$or = [{ plant_id: queryPlantId }, { plantId: queryPlantId }];
            }
        } else {
            throw new ForbiddenError('Access denied: Unauthorized to list processors.');
        }

        const processors = await db.collection('users')
            .find(query, { projection: { password: 0, password_hash: 0, password_salt: 0, iterations: 0 } })
            .sort({ created_at: -1 })
            .toArray();

        return { processors, staff: processors };
    }

    /**
     * Updates an existing staff member.
     * Strictly disallows passwords.
     * Enforces plant isolation: Plant Managers can only edit drivers/processors at their own facility.
     */
    public static async updateUser(
        actorContext: AuthenticatedContext,
        targetUserId: string,
        input: UpdateStaffInput
    ) {
        const db = await getDb();
        const targetUser = await db.collection('users').findOne({
            $or: [
                { _id: targetUserId as any },
                { id: targetUserId },
                { publicId: targetUserId },
                { staffId: targetUserId }
            ]
        });

        if (!targetUser) {
            throw new NotFoundError(`Staff member with ID "${targetUserId}" not found.`);
        }

        const actorRole = normalizeRole(actorContext.dbUser.role);

        // Enforce plant isolation & role permissions
        if (actorRole === 'plant_manager') {
            if (!['driver', 'processor'].includes(targetUser.role)) {
                throw new ForbiddenError('Plant Managers can only edit drivers and processors.');
            }
            assertPlantIsolation(actorContext.dbUser, null, targetUser);

            if (input.role && input.role !== targetUser.role) {
                throw new ForbiddenError('Plant Managers cannot change staff roles.');
            }
        } else if (actorRole !== 'super_admin') {
            throw new ForbiddenError('Access denied: You do not have permission to update staff members.');
        }

        const now = new Date().toISOString();
        const updateFields: any = { updated_at: now };

        // Name harmonization
        const nameVal = input.name || input.full_name;
        if (nameVal !== undefined) {
            updateFields.name = nameVal;
            updateFields.full_name = nameVal;
        }

        if (input.phone !== undefined) updateFields.phone = input.phone;

        // Active status and availability
        if (input.availability !== undefined) {
            updateFields.availability = input.availability;
        }
        if (input.is_active !== undefined) {
            updateFields.is_active = Boolean(input.is_active);
            if (updateFields.availability === undefined) {
                updateFields.availability = input.is_active ? 'available' : 'offline';
            }
        }

        // Vehicle info
        const vehicleType = input.vehicle_type || input.vehicleType;
        if (vehicleType !== undefined) updateFields.vehicle_type = vehicleType;
        const vehicleReg = input.vehicle_reg || input.vehicleReg;
        if (vehicleReg !== undefined) updateFields.vehicle_reg = vehicleReg;
        if (input.vehicle !== undefined) updateFields.vehicle = input.vehicle;
        const licenseNum = input.license_number || input.licenseNum;
        if (licenseNum !== undefined) updateFields.license_number = licenseNum;

        // Emergency contact
        if (input.emergency_contact !== undefined) {
            updateFields.emergency_contact = input.emergency_contact;
        } else if (input.emergencyName !== undefined || input.emergencyPhone !== undefined) {
            updateFields.emergency_contact = {
                name: input.emergencyName || '',
                phone: input.emergencyPhone || ''
            };
        }

        // Postcodes
        if (input.assigned_postcodes !== undefined || input.assignedSectors !== undefined) {
            const rawPostcodes: string[] = Array.isArray(input.assigned_postcodes)
                ? input.assigned_postcodes
                : Array.isArray(input.assignedSectors)
                ? input.assignedSectors
                : typeof (input as any).assigned_postcodes === 'string'
                ? (input as any).assigned_postcodes.split(',')
                : typeof (input as any).assignedSectors === 'string'
                ? (input as any).assignedSectors.split(',')
                : [];

            const normalizedPostcodes = Array.from(new Set(
                rawPostcodes
                    .map((p: string) => (extractOutwardCode(String(p).trim()) || String(p).trim().toUpperCase()))
                    .filter(Boolean)
            ));

            if (actorRole === 'super_admin') {
                updateFields.assigned_postcodes = normalizedPostcodes;
                updateFields.assignedSectors = normalizedPostcodes;

                // Cascade to subordinate staff if updating a manager
                if (['manager', 'plant_manager'].includes(targetUser.role)) {
                    const mKeys = [String(targetUser._id), targetUser.publicId, targetUser.id, targetUser.staffId].filter(Boolean);
                    await db.collection('users').updateMany(
                        {
                            $or: [
                                { manager_id: { $in: mKeys } },
                                { plantManagerId: { $in: mKeys } }
                            ],
                            role: { $in: ['driver', 'processor'] }
                        },
                        { $set: { assigned_postcodes: normalizedPostcodes, assignedSectors: normalizedPostcodes } }
                    ).catch(() => {});
                }
            } else if (actorRole === 'plant_manager' || actorRole === 'manager') {
                // Plant Managers can allocate postcodes to their drivers or processors
                if (!['driver', 'processor'].includes(targetUser.role)) {
                    throw new ForbiddenError('Plant Managers can only allocate postcodes to Drivers and Processors.');
                }

                // Resolve manager authorized postcodes
                const managerPlantId = actorContext.dbUser.plant_id || actorContext.dbUser.plantId;
                const authorizedPostcodes = await this.resolveManagerPostcodes(db, String(actorContext.dbUser._id), managerPlantId);
                const authorizedSet = new Set(authorizedPostcodes.map((p: string) => (extractOutwardCode(p) || p).trim().toUpperCase()));

                // Strict validation: every requested postcode must be authorized
                const unauthorized = normalizedPostcodes.filter(p => !authorizedSet.has(p));
                if (unauthorized.length > 0) {
                    throw new BadRequestError(
                        `Unauthorized postcode assignment: Postcode(s) [${unauthorized.join(', ')}] are outside your authorized service area [${Array.from(authorizedSet).join(', ')}].`
                    );
                }

                updateFields.assigned_postcodes = normalizedPostcodes;
                updateFields.assignedSectors = normalizedPostcodes;

                // Safe reassignment: if postcodes were removed from an active driver, unassign any uncollected orders in removed postcodes
                if (targetUser.role === 'driver') {
                    const previousPostcodes: string[] = targetUser.assigned_postcodes || targetUser.assignedSectors || [];
                    const removedPostcodes = previousPostcodes.filter(p => !normalizedPostcodes.includes(p));
                    if (removedPostcodes.length > 0) {
                        const driverKeys = [String(targetUser._id), targetUser.id, targetUser.publicId].filter(Boolean);
                        const activeOrders = await db.collection('orders').find({
                            assigned_driver_id: { $in: driverKeys },
                            status: { $in: ['collection_scheduled', 'driver_assigned', 'booking_confirmed'] }
                        }).toArray();

                        for (const order of activeOrders) {
                            const orderPostcode = order.postcode || order.address?.postcode || order.address || '';
                            if (isPostcodeInServiceArea(orderPostcode, removedPostcodes) && !isPostcodeInServiceArea(orderPostcode, normalizedPostcodes)) {
                                await db.collection('orders').updateOne(
                                    { _id: order._id },
                                    {
                                        $set: {
                                            assigned_driver_id: null,
                                            driver: null,
                                            status: 'collection_scheduled',
                                            statusLabel: 'Collection Scheduled',
                                            updated_at: now
                                        },
                                        $push: {
                                            timeline_events: {
                                                event: 'driver_unassigned_due_to_postcode_reallocation',
                                                label: 'Driver unassigned due to manager postcode reallocation',
                                                actor: 'manager',
                                                actorId: String(actorContext.dbUser._id),
                                                timestamp: now
                                            }
                                        } as any
                                    }
                                );
                            }
                        }
                    }
                }
            }
        }

        // Super admin manager assignment for subordinate staff
        const newManagerId = input.manager_id || (input as any).plantManagerId;
        if (actorRole === 'super_admin' && newManagerId !== undefined) {
            updateFields.manager_id = newManagerId || null;
            updateFields.plantManagerId = newManagerId || null;
            if (newManagerId) {
                const manager = await db.collection('users').findOne(
                    buildEntityLookupQuery(newManagerId, 'user', (id) => ObjectId.isValid(id) ? new ObjectId(id) : null) as any
                );
                if (manager) {
                    const inheritedPlantId = manager.plant_id || manager.plantId || null;
                    if (inheritedPlantId && !updateFields.plant_id) {
                        updateFields.plant_id = inheritedPlantId;
                        updateFields.plantId = inheritedPlantId;
                    }
                    const inheritedPostcodes = await this.resolveManagerPostcodes(db, newManagerId, inheritedPlantId);
                    if (inheritedPostcodes.length > 0 && updateFields.assigned_postcodes === undefined) {
                        updateFields.assigned_postcodes = inheritedPostcodes;
                        updateFields.assignedSectors = inheritedPostcodes;
                    }
                }
            }
        }

        // Super admin plant assignment
        const newPlantId = input.plantId || input.plant_id;
        if (actorRole === 'super_admin' && newPlantId !== undefined) {
            updateFields.plantId = newPlantId || null;
            updateFields.plant_id = newPlantId || null;

            // If updating a plant manager, synchronize with the plants collection
            if (['manager', 'plant_manager'].includes(targetUser.role)) {
                const targetUserIdStr = String(targetUser._id);
                const targetUserPubId = targetUser.publicId || targetUserIdStr;
                const managerName = nameVal || targetUser.full_name || targetUser.name || targetUser.email;

                if (newPlantId) {
                    const plant = await db.collection('plants').findOne(buildEntityLookupQuery(newPlantId, 'plant') as any);
                    if (plant) {
                        // Clear this manager from any other plants
                        await db.collection('plants').updateMany(
                            {
                                $or: [
                                    { manager_id: targetUserIdStr },
                                    { manager_id: targetUserPubId },
                                    { manager_id: newPlantId }
                                ],
                                _id: { $ne: plant._id } as any
                            },
                            { $set: { manager_id: null, manager_name: null } }
                        );
                        // Assign manager to this plant
                        await db.collection('plants').updateOne(
                            { _id: plant._id },
                            {
                                $set: {
                                    manager_id: targetUserIdStr,
                                    manager_public_id: targetUserPubId,
                                    manager_name: managerName
                                }
                            }
                        );
                        updateFields.assigned_plant = plant.name;
                        const plantPincodes = await this.resolvePlantPostcodes(db, String(plant._id));
                        if (plantPincodes.length > 0) {
                            updateFields.assigned_postcodes = plantPincodes;
                            updateFields.assignedSectors = plantPincodes;
                            const mKeys = [targetUserIdStr, targetUserPubId].filter(Boolean);
                            await db.collection('users').updateMany(
                                {
                                    $or: [
                                        { manager_id: { $in: mKeys } },
                                        { plantManagerId: { $in: mKeys } },
                                        { plant_id: String(plant._id) },
                                        { plantId: String(plant._id) }
                                    ],
                                    role: { $in: ['driver', 'processor'] }
                                },
                                { $set: { assigned_postcodes: plantPincodes, assignedSectors: plantPincodes } }
                            ).catch(() => {});
                        }
                    }
                } else {
                    // Unassign manager from all plants
                    await db.collection('plants').updateMany(
                        {
                            $or: [
                                { manager_id: targetUserIdStr },
                                { manager_id: targetUserPubId }
                            ]
                        },
                        { $set: { manager_id: null, manager_name: null } }
                    );
                    updateFields.assigned_plant = null;
                }
            }
        }

        // Apply MongoDB update
        await db.collection('users').updateOne(
            { _id: targetUser._id },
            { $set: updateFields }
        );

        // If driver was set to active/online, trigger auto-assignment of queued orders
        if (targetUser.role === 'driver' && updateFields.is_active === true) {
            try {
                const { DriverService } = await import('./DriverService');
                await DriverService.assignQueuedOrdersToDriver(String(targetUser._id));
            } catch (err: any) {
                console.warn(`[StaffProvisioningService] Error assigning queued orders to driver: ${err.message}`);
            }
        }

        // If processor was set to available, trigger auto-assignment of waiting orders
        if (targetUser.role === 'processor' && updateFields.availability === 'available') {
            try {
                const { ProcessorService } = await import('./ProcessorService');
                await ProcessorService.updateAvailability(String(targetUser._id), 'available');
            } catch (err: any) {
                console.warn(`[StaffProvisioningService] Error updating processor availability: ${err.message}`);
            }
        }

        // Sync name to Auth0 if auth0UserId exists
        if (targetUser.auth0UserId && nameVal) {
            await Auth0Service.updateUser(targetUser.auth0UserId, { name: nameVal }).catch((err) => {
                console.warn(`[StaffProvisioningService] Auth0 profile sync warning: ${err.message}`);
            });
        }

        await AuditService.recordEvent({
            actorId: String(actorContext.dbUser._id || actorContext.token.sub),
            actorRole: actorRole || 'system',
            action: 'staff_updated',
            entityType: 'staff',
            entityId: String(targetUser._id),
            reason: 'Staff details updated'
        }).catch(() => {});

        return { success: true };
    }

    /**
     * Updates staff status (active / suspended / inactive).
     * Synchronizes blocking/unblocking with Auth0.
     * Prevents suspending drivers with active orders in flight.
     */
    public static async updateUserStatus(
        actorContext: AuthenticatedContext,
        targetUserId: string,
        input: UpdateStatusInput
    ) {
        const db = await getDb();
        const targetUser = await db.collection('users').findOne({
            $or: [
                { _id: targetUserId as any },
                { id: targetUserId },
                { publicId: targetUserId },
                { staffId: targetUserId }
            ]
        });

        if (!targetUser) {
            throw new NotFoundError(`Staff member with ID "${targetUserId}" not found.`);
        }

        const actorRole = normalizeRole(actorContext.dbUser.role);

        // Enforce plant isolation
        if (actorRole === 'plant_manager') {
            if (!['driver', 'processor'].includes(targetUser.role)) {
                throw new ForbiddenError('Plant Managers can only change the status of drivers and processors.');
            }
            assertPlantIsolation(actorContext.dbUser, null, targetUser);
        } else if (actorRole !== 'super_admin') {
            throw new ForbiddenError('Access denied: Unauthorized to change staff status.');
        }

        // Determine new status and active boolean
        let isActive = true;
        let newStatus = 'active';

        if (input.is_active !== undefined) {
            isActive = Boolean(input.is_active);
            newStatus = isActive ? 'active' : 'suspended';
        } else if (input.status !== undefined) {
            newStatus = input.status.toLowerCase().trim();
            isActive = newStatus === 'active';
        }

        // Business rule: Cannot suspend driver with active assigned orders
        if (!isActive && targetUser.role === 'driver') {
            const activeOrders = await db.collection('orders').countDocuments({
                assigned_driver_id: { $in: [String(targetUser._id), targetUser.id, targetUser.staffId].filter(Boolean) },
                status: { $nin: ['delivered', 'cancelled', 'order_placed', 'pending_payment'] }
            });
            if (activeOrders > 0) {
                throw new BadRequestError(
                    `Cannot suspend driver with ${activeOrders} active assigned order(s). Please reassign their orders first.`
                );
            }
        }

        const now = new Date().toISOString();

        // 1. Immediately update MongoDB document to prevent privileged endpoint access
        await db.collection('users').updateOne(
            { _id: targetUser._id },
            {
                $set: {
                    status: newStatus,
                    is_active: isActive,
                    updated_at: now
                }
            }
        );

        // 2. Immediately await revocation of all active server-side sessions
        if (!isActive) {
            try {
                const targetDbId = String(targetUser._id);
                const publicId = targetUser.id || targetUser.staffId || targetUser.publicId;
                await SessionService.revokeAllUserSessions(targetDbId);
                if (publicId && publicId !== targetDbId) {
                    await SessionService.revokeAllUserSessions(publicId);
                }
                if (targetUser.auth0UserId) {
                    await SessionService.revokeAllUserSessions(targetUser.auth0UserId);
                }
            } catch (revokeErr: any) {
                console.error('[StaffProvisioningService] Warning: Failed to revoke sessions during deactivation:', revokeErr.message);
            }
        }

        // 3. Sync blocking/unblocking with Auth0 (with safe partial-failure tolerance)
        if (targetUser.auth0UserId) {
            try {
                if (!isActive) {
                    await Auth0Service.blockUser(targetUser.auth0UserId);
                } else {
                    await Auth0Service.unblockUser(targetUser.auth0UserId);
                }
            } catch (auth0Err: any) {
                console.warn(`[StaffProvisioningService] Auth0 sync warning for ${targetUser.auth0UserId}:`, auth0Err.message);
            }
        }

        await AuditService.recordEvent({
            actorId: String(actorContext.dbUser._id || actorContext.token.sub),
            actorRole: actorRole || 'system',
            action: isActive ? 'staff_activated' : 'staff_suspended',
            entityType: 'staff',
            entityId: String(targetUser._id),
            reason: input.reason || `Status set to ${newStatus}`
        }).catch(() => {});

        return {
            success: true,
            status: newStatus,
            is_active: isActive
        };
    }

    /**
     * Deletes a staff member from MongoDB and permanently deletes their Auth0 user account.
     * Prevents deleting staff with active orders in flight.
     * Cleans up plant associations and records audit trails.
     */
    public static async deleteStaff(
        actorContext: AuthenticatedContext,
        targetUserId: string
    ) {
        const db = await getDb();
        const queries: any[] = [
            { _id: targetUserId as any },
            { id: targetUserId },
            { publicId: targetUserId },
            { staffId: targetUserId }
        ];
        if (ObjectId.isValid(targetUserId)) {
            queries.push({ _id: new ObjectId(targetUserId) });
        }

        const targetUser = await db.collection('users').findOne({ $or: queries });

        if (!targetUser) {
            throw new NotFoundError(`Staff member with ID "${targetUserId}" not found.`);
        }

        const actorRole = normalizeRole(actorContext.dbUser.role);

        // Enforce plant isolation and role permissions
        if (actorRole === 'plant_manager') {
            if (!['driver', 'processor'].includes(targetUser.role)) {
                throw new ForbiddenError('Plant Managers can only delete drivers and processors under their facility.');
            }
            assertPlantIsolation(actorContext.dbUser, null, targetUser);
        } else if (actorRole !== 'super_admin') {
            throw new ForbiddenError('Access denied: You do not have permission to delete staff members.');
        }

        // Prevent deleting oneself
        if (String(targetUser._id) === String(actorContext.dbUser._id)) {
            throw new BadRequestError('You cannot delete your own account.');
        }

        // Check for active orders if driver
        if (targetUser.role === 'driver') {
            const activeOrders = await db.collection('orders').countDocuments({
                assigned_driver_id: { $in: [String(targetUser._id), targetUser.id, targetUser.staffId, targetUser.publicId].filter(Boolean) },
                status: { $nin: ['delivered', 'cancelled', 'order_placed', 'pending_payment'] }
            });
            if (activeOrders > 0) {
                throw new BadRequestError(`Cannot delete driver with ${activeOrders} active assigned order(s). Please reassign their orders first.`);
            }
        }

        // If manager, unlink from plants and subordinate staff
        if (['manager', 'plant_manager'].includes(targetUser.role)) {
            const mKeys = [String(targetUser._id), targetUser.publicId, targetUser.id, targetUser.staffId].filter(Boolean);
            await db.collection('plants').updateMany(
                {
                    $or: [
                        { manager_id: { $in: mKeys } },
                        { manager_public_id: { $in: mKeys } }
                    ]
                },
                { $set: { manager_id: null, manager_public_id: null, manager_name: null } }
            );

            await db.collection('users').updateMany(
                {
                    $or: [
                        { manager_id: { $in: mKeys } },
                        { plantManagerId: { $in: mKeys } }
                    ]
                },
                { $set: { manager_id: null, plantManagerId: null } }
            );
        }

        // 1. Delete user from Auth0 if Auth0 identity exists
        const auth0Id = targetUser.auth0UserId || targetUser.auth0_sub;
        if (auth0Id) {
            try {
                await Auth0Service.deleteUser(auth0Id);
            } catch (auth0Err: any) {
                console.warn(`[StaffProvisioningService] Auth0 deletion warning for ${auth0Id}: ${auth0Err.message}`);
            }
        }

        // 2. Delete user from MongoDB
        await db.collection('users').deleteOne({ _id: targetUser._id });

        // 3. Record in audit trail
        await AuditService.recordEvent({
            actorId: String(actorContext.dbUser._id || actorContext.token.sub),
            actorRole: actorRole || 'system',
            action: 'staff_deleted',
            entityType: 'staff',
            entityId: String(targetUser._id),
            reason: `Staff member ${targetUser.full_name || targetUser.name || targetUser.email} deleted from MongoDB and Auth0`,
            metadata: {
                email: targetUser.email,
                role: targetUser.role,
                auth0UserId: auth0Id || null
            }
        }).catch(() => {});

        return {
            success: true,
            deletedId: String(targetUser._id),
            message: `Staff member "${targetUser.full_name || targetUser.email}" was successfully deleted from MongoDB and Auth0.`
        };
    }
}

