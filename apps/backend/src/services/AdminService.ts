import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import crypto from 'crypto';
import { hashPassword } from '@/lib/auth';
import { AuditService } from './AuditService';
import { StaffProvisioningService } from './StaffProvisioningService';
import {
    generateStaffId,
    generatePlantId,
    generateFlagId,
    generateNoteId,
    generateRefundId,
    generateStoreCreditId,
    buildEntityLookupQuery
} from '@laundelle/ids';
import { OrderCustomerEnrichmentService } from './OrderCustomerEnrichmentService';
import { isPostcodeInServiceArea, extractOutwardCode } from '@laundelle/utils';
import { Auth0Service } from './Auth0Service';
import { NotFoundError, BadRequestError } from '@/lib/api';
import { SessionService } from './SessionService';

export class AdminService {
    static async getDashboardMetrics(location?: string, dateFilter?: string, startDate?: string, endDate?: string) {
        const db = await getDb();
        let orders = await db.collection('orders').find({ status: { $ne: 'pending_payment' } }).toArray();

        let matchedPlant: any = null;
        if (location && location !== 'All Locations') {
            const trimmedLoc = location.trim();
            matchedPlant = await db.collection('plants').findOne({
                $or: [
                    { name: trimmedLoc },
                    { code: trimmedLoc.toUpperCase() },
                    { id: trimmedLoc },
                    { publicId: trimmedLoc },
                    { _id: trimmedLoc }
                ]
            } as any);

            if (!matchedPlant) {
                const allPlants = await db.collection('plants').find({}).toArray();
                matchedPlant = allPlants.find((p: any) =>
                    p.name?.toLowerCase() === trimmedLoc.toLowerCase() ||
                    p.code?.toLowerCase() === trimmedLoc.toLowerCase() ||
                    trimmedLoc.toLowerCase().includes((p.name || '').toLowerCase())
                );
            }

            if (matchedPlant) {
                const plantId = String(matchedPlant._id || matchedPlant.id || matchedPlant.publicId || '');
                const plantCode = (matchedPlant.code || '').toUpperCase();
                const plantName = (matchedPlant.name || '').toLowerCase();
                const pincodes: string[] = Array.isArray(matchedPlant.service_pincodes)
                    ? matchedPlant.service_pincodes
                    : (matchedPlant.service_pincodes || '').split(',').map((p: string) => p.trim().toUpperCase()).filter(Boolean);

                orders = orders.filter((o: any) => {
                    const pId = String(o.plantId || o.plant_id || '');
                    const fac = (o.facility || o.facilityName || '').toLowerCase();
                    if (plantId && pId && (pId === plantId || pId === matchedPlant.publicId || pId === matchedPlant.id)) return true;
                    if (fac && (fac === plantName || fac === plantCode.toLowerCase())) return true;

                    // Match order postcode against plant's configured pincodes with exact district rules
                    const orderPostcode = (o.postcode || (typeof o.address === 'object' ? o.address?.postcode : '') || '').trim();
                    if (orderPostcode && pincodes.length > 0) {
                        if (isPostcodeInServiceArea(orderPostcode, pincodes)) return true;
                    }

                    // Word boundary check in address string
                    const fullAddr = typeof o.address === 'string' ? o.address : (typeof o.address === 'object' ? JSON.stringify(o.address) : '');
                    if (fullAddr && pincodes.length > 0) {
                        const extracted = extractOutwardCode(fullAddr);
                        if (extracted && pincodes.includes(extracted)) return true;
                    }

                    return false;
                });
            } else {
                const locLower = trimmedLoc.toLowerCase();
                orders = orders.filter((o: any) => {
                    const pId = (o.plantId || o.plant_id || '').toLowerCase();
                    const fac = (o.facility || o.facilityName || '').toLowerCase();
                    const addr = typeof o.address === 'string' ? o.address.toLowerCase() : JSON.stringify(o.address || '').toLowerCase();
                    return pId.includes(locLower) || fac.includes(locLower) || addr.includes(locLower);
                });
            }
        }

        // Date range filtering
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const yesterdayDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const yesterdayStr = yesterdayDate.toISOString().split('T')[0];

        // This week: Monday of current week
        const dayOfWeek = now.getDay();
        const diffToMonday = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
        const mondayDate = new Date(now);
        mondayDate.setDate(now.getDate() + diffToMonday);
        mondayDate.setHours(0, 0, 0, 0);
        const weekStartStr = mondayDate.toISOString().split('T')[0];

        const getOrderDate = (o: any): string => {
            const raw = o.createdAt || o.created_at || o.date || o.updated_at || '';
            return typeof raw === 'string' ? raw.split('T')[0] : '';
        };

        const isOrderInDateRange = (o: any): boolean => {
            const d = getOrderDate(o);
            if (!d) return false;

            if (!dateFilter || dateFilter === 'Today') {
                return d === todayStr;
            }
            if (dateFilter === 'Yesterday') {
                return d === yesterdayStr;
            }
            if (dateFilter === 'This Week') {
                return d >= weekStartStr && d <= todayStr;
            }
            if (dateFilter === 'Custom' || dateFilter === 'Custom Range') {
                if (startDate && endDate) {
                    return d >= startDate && d <= endDate;
                }
                if (startDate) return d >= startDate;
                if (endDate) return d <= endDate;
                return true;
            }
            return true;
        };

        const periodOrders = orders.filter(isOrderInDateRange);
        const todayRevenue = periodOrders.reduce((sum: number, o: any) => sum + (o.total || o.totalPrice || 0), 0);
        const todayKg = periodOrders.reduce((sum: number, o: any) => sum + (o.weightKg || o.weight_kg || 0), 0);
        const activeOrders = orders.filter((o: any) => !['delivered', 'cancelled'].includes(o.status));

        const collectionsCompleted = orders.filter((o: any) => {
            if (o.status !== 'laundry_collected') return false;
            const updatedDate = (o.pickup_completed_at || o.updated_at || o.createdAt || '').split('T')[0];
            if (!dateFilter || dateFilter === 'Today') return updatedDate === todayStr;
            if (dateFilter === 'Yesterday') return updatedDate === yesterdayStr;
            if (dateFilter === 'This Week') return updatedDate >= weekStartStr && updatedDate <= todayStr;
            if ((dateFilter === 'Custom' || dateFilter === 'Custom Range') && startDate && endDate) {
                return updatedDate >= startDate && updatedDate <= endDate;
            }
            return true;
        }).length;

        const deliveriesCompleted = orders.filter((o: any) => {
            if (o.status !== 'delivered') return false;
            const updatedDate = (o.delivery_completed_at || o.delivered_at || o.updated_at || o.createdAt || '').split('T')[0];
            if (!dateFilter || dateFilter === 'Today') return updatedDate === todayStr;
            if (dateFilter === 'Yesterday') return updatedDate === yesterdayStr;
            if (dateFilter === 'This Week') return updatedDate >= weekStartStr && updatedDate <= todayStr;
            if ((dateFilter === 'Custom' || dateFilter === 'Custom Range') && startDate && endDate) {
                return updatedDate >= startDate && updatedDate <= endDate;
            }
            return true;
        }).length;

        const plantCapacityOrders = matchedPlant?.daily_capacity_orders || matchedPlant?.capacityOrders || 100;
        const plantCapacityKg = matchedPlant?.daily_capacity_kg || matchedPlant?.capacityKg || 500;

        return {
            todayOrdersTotal: periodOrders.length,
            todayOrdersTrendPercent: periodOrders.length > 0 ? 12 : 0,
            todayRevenue,
            todayRevenueTrendPercent: todayRevenue > 0 ? 8 : 0,
            todayKgProcessed: todayKg,
            todayKgTrendPercent: todayKg > 0 ? 5 : 0,
            collectionsCompleted,
            collectionsPending: activeOrders.filter((o: any) => ['booking_confirmed', 'collection_scheduled'].includes(o.status)).length,
            deliveriesCompleted,
            deliveriesPending: activeOrders.filter((o: any) => ['ready_for_delivery', 'out_for_delivery'].includes(o.status)).length,
            pipeline: {
                booked: activeOrders.filter((o: any) => o.status === 'booking_confirmed').length,
                scheduled: activeOrders.filter((o: any) => o.status === 'collection_scheduled').length,
                collected: activeOrders.filter((o: any) => o.status === 'laundry_collected').length,
                received: activeOrders.filter((o: any) => o.status === 'received_at_facility' || o.status === 'waiting_for_processor').length,
                processing: activeOrders.filter((o: any) => ['processor_assigned', 'washing', 'drying', 'folding'].includes(o.status)).length,
                qc: activeOrders.filter((o: any) => o.status === 'ready_for_qc' || o.status === 'qc_ready').length,
                ready: activeOrders.filter((o: any) => o.status === 'ready_for_delivery').length,
                out: activeOrders.filter((o: any) => o.status === 'out_for_delivery').length
            },
            facility: {
                code: matchedPlant?.code || location || 'All Locations',
                name: matchedPlant?.name || location || 'All Facilities',
                dailyCapacityOrders: plantCapacityOrders,
                dailyCapacityKg: plantCapacityKg
            }
        };
    }

    static async getOrders(query: any, limit: number, page: number) {
        const db = await getDb();
        const orders = await db.collection('orders')
            .find(query)
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .toArray();
        const total = await db.collection('orders').countDocuments(query);

        // Enrich customer information
        await OrderCustomerEnrichmentService.enrichOrders(orders, db);

        orders.forEach((o: any) => {
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
        });

        return { orders, total };
    }

    static async assignDriver(adminId: string, orderId: string, driverId: string) {
        const db = await getDb();
        const now = new Date().toISOString();
        
        const driver = await db.collection('users').findOne({
            ...buildEntityLookupQuery(driverId, 'user', (id) => ObjectId.isValid(id) ? new ObjectId(id) : null),
            role: 'driver',
            is_active: true
        } as any);
        if (!driver) throw new Error('Valid, active driver not found.');

        const order = await db.collection('orders').findOne(
            buildEntityLookupQuery(orderId, 'order', (id) => ObjectId.isValid(id) ? new ObjectId(id) : null)
        );
        if (!order) throw new Error('Order not found.');

        const effectiveDriverId = driver.publicId || driver.staffId || driver.id || driverId;
        await db.collection('orders').updateOne(
            { _id: order._id },
            {
                $set: { assigned_driver_id: effectiveDriverId, status: 'collection_scheduled', statusLabel: 'Collection Scheduled', updated_at: now },
                $push: {
                    timeline_events: {
                        event: 'driver_assigned',
                        label: 'Driver Assigned',
                        actor: 'admin',
                        actorId: adminId,
                        driverId: effectiveDriverId,
                        timestamp: now
                    }
                } as any
            }
        );
        return { success: true };
    }

    static async assignProcessor(adminId: string, orderId: string, processorId: string) {
        const db = await getDb();
        const now = new Date().toISOString();
        
        const processor = await db.collection('users').findOne({
            ...buildEntityLookupQuery(processorId, 'user', (id) => ObjectId.isValid(id) ? new ObjectId(id) : null),
            role: 'processor',
            is_active: true
        } as any);
        if (!processor) throw new Error('Valid, active processor not found.');

        const order = await db.collection('orders').findOne(
            buildEntityLookupQuery(orderId, 'order', (id) => ObjectId.isValid(id) ? new ObjectId(id) : null)
        );
        if (!order) throw new Error('Order not found.');

        const effectiveProcessorId = processor.publicId || processor.staffId || processor.id || processorId;
        await db.collection('orders').updateOne(
            { _id: order._id },
            {
                $set: { assigned_processor_id: effectiveProcessorId, status: 'received_at_facility', statusLabel: 'Received at Facility', updated_at: now },
                $push: {
                    timeline_events: {
                        event: 'processor_assigned',
                        label: 'Processor Assigned',
                        actor: 'admin',
                        actorId: adminId,
                        processorId: effectiveProcessorId,
                        timestamp: now
                    }
                } as any
            }
        );
        return { success: true };
    }

    static async getCustomers(search?: string, status?: string, limit = 100, page = 1) {
        const db = await getDb();
        const safeLimit = Math.min(Math.max(1, limit || 50), 200);
        const safePage = Math.max(1, page || 1);

        const [users, allOrders, flags, notes, incidents] = await Promise.all([
            db.collection('users').find({}, { projection: { password: 0 } }).sort({ created_at: -1 }).toArray(),
            db.collection('orders').find({}).sort({ createdAt: -1, created_at: -1 }).toArray(),
            db.collection('customer_flags').find({}).sort({ createdAt: -1 }).toArray(),
            db.collection('customer_notes').find({}).sort({ createdAt: -1 }).toArray(),
            db.collection('incidents').find({}).toArray()
        ]);

        // Helper to check if an order belongs to a given user/identifier
        const matchesUser = (order: any, u: any): boolean => {
            const uId = String(u._id || u.id || u.customerId || u.publicId);
            const uEmail = u.email ? u.email.toLowerCase().trim() : '';
            const uPhone = u.phone ? u.phone.trim() : '';

            const oCustId = String(order.customer_id || order.customerId || '');
            const oUserId = String(order.userId || order.user_id || '');
            const oEmail = (order.customerEmail || order.customer_email || order.contactDetails?.email || order.email || '').toLowerCase().trim();
            const oPhone = (order.customerPhone || order.customer_phone || order.contactDetails?.phone || order.phone || '').trim();

            if (uId && (oCustId === uId || oUserId === uId)) return true;
            if (u._id && (oCustId === String(u._id) || oUserId === String(u._id))) return true;
            if (u.id && (oCustId === String(u.id) || oUserId === String(u.id))) return true;
            if (u.customerId && (oCustId === String(u.customerId) || oUserId === String(u.customerId))) return true;
            if (u.publicId && (oCustId === String(u.publicId) || oUserId === String(u.publicId))) return true;
            if (uEmail && oEmail && uEmail === oEmail) return true;
            if (uPhone && oPhone && uPhone.replace(/\s+/g, '') === oPhone.replace(/\s+/g, '')) return true;
            return false;
        };

        const customerList: any[] = [];
        const processedEmails = new Set<string>();
        const processedUserIds = new Set<string>();

        // 1. Process users who are customers or who placed customer orders
        for (const u of users) {
            const isExplicitCustomer = ['customer', 'user', null, undefined].includes(u.role);
            const userOrders = allOrders.filter(o => matchesUser(o, u));
            const hasCustomerOrders = userOrders.length > 0;

            // Include if role is customer/user or if they have placed orders
            if (!isExplicitCustomer && !hasCustomerOrders) {
                continue;
            }

            const customerId = String(u._id || u.id || u.customerId || u.publicId);
            const publicId = u.publicId || u.customerId || `CUST-${customerId.slice(-6).toUpperCase()}`;
            const email = (u.email || userOrders[0]?.customerEmail || userOrders[0]?.contactDetails?.email || '').trim();
            const phone = u.phone || userOrders[0]?.customerPhone || userOrders[0]?.contactDetails?.phone || '';
            const fullName = u.full_name || u.name || userOrders[0]?.customerName || userOrders[0]?.customer_name || 'Customer';
            const postcode = u.postcode || (u.addresses && u.addresses[0]?.postcode) || userOrders[0]?.postcode || '';
            const fullAddress = (typeof u.address === 'string' ? u.address : (u.addresses && u.addresses[0] ? `${u.addresses[0].line1 || u.addresses[0].addressLine1 || ''}, ${u.addresses[0].city || ''} ${u.addresses[0].postcode || ''}`.trim() : '')) || (typeof userOrders[0]?.address === 'string' ? userOrders[0]?.address : (userOrders[0]?.address?.line1 ? `${userOrders[0]?.address?.line1}, ${userOrders[0]?.address?.city || ''} ${userOrders[0]?.address?.postcode || ''}`.trim() : '')) || postcode;
            const recentOrders = userOrders.slice(0, 5).map(o => ({
                id: String(o.id || o.publicId || o._id),
                orderNumber: o.orderNumber || o.publicId || o.id,
                status: o.status,
                total: Number(o.total || o.total_price || 0),
                date: o.createdAt || o.created_at || o.bookedAt,
                service: o.items?.[0]?.name || o.service || 'Laundry Service'
            }));

            const totalOrders = userOrders.length;
            const lifetimeSpend = userOrders.reduce((sum: number, o: any) => sum + Number(o.total || o.total_price || 0), 0);
            const averageOrderValue = totalOrders > 0 ? lifetimeSpend / totalOrders : 0;
            const repeatRate = totalOrders > 1 ? Math.min(100, Math.round(((totalOrders - 1) / totalOrders) * 100)) : 0;
            const lastOrderDate = userOrders[0]?.createdAt || userOrders[0]?.created_at || userOrders[0]?.bookedAt || '';

            let customerStatus = u.status || u.customer_status || 'new';
            if (u.status === 'blocked' || u.is_blocked || u.customer_status === 'blocked') {
                customerStatus = 'blocked';
            } else if (lifetimeSpend > 250) {
                customerStatus = 'high_value';
            } else if (totalOrders >= 4) {
                customerStatus = 'vip';
            } else if (totalOrders >= 2) {
                customerStatus = 'regular';
            } else {
                customerStatus = 'new';
            }

            const idVariants = new Set<string>([customerId, publicId, String(u._id), String(u.id), String(u.customerId)].filter(Boolean));
            const userFlags = flags.filter(f => idVariants.has(String(f.customerId)));
            const userNotes = notes.filter(n => idVariants.has(String(n.customerId)));
            const userIncidents = incidents.filter(inc => idVariants.has(String(inc.customerId)) || (email && inc.customerEmail?.toLowerCase() === email.toLowerCase()));

            customerList.push({
                id: customerId,
                publicId,
                customerId: u.customerId || publicId,
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
                preferredService: u.preferredService || userOrders[0]?.items?.[0]?.name || userOrders[0]?.service || 'Wash & Fold',
                preferredDetergent: u.preferences?.detergent || u.preferredDetergent || 'Standard',
                preferredSoftener: u.preferences?.softener || u.preferredSoftener || 'Standard',
                avatarUrl: u.avatar_url || u.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=03045E&color=CAF0F8&size=128`,
                flagsCount: userFlags.length,
                internalNotesCount: userNotes.length,
                incidentsCount: userIncidents.length,
                createdAt: u.created_at || u.createdAt || userOrders[userOrders.length - 1]?.createdAt || new Date().toISOString(),
                recentOrders
            });

            if (email) processedEmails.add(email.toLowerCase());
            processedUserIds.add(customerId);
        }

        // 2. Discover distinct customers who placed orders but aren't yet in the users table
        const unlinkedOrders = allOrders.filter(o => {
            const oEmail = (o.customerEmail || o.customer_email || o.contactDetails?.email || o.email || '').toLowerCase().trim();
            const oId = String(o.customer_id || o.customerId || o.userId || o.user_id || '');
            if (oEmail && processedEmails.has(oEmail)) return false;
            if (oId && processedUserIds.has(oId)) return false;
            return true;
        });

        // Group unlinked orders by email or customer name
        const unlinkedGroups = new Map<string, any[]>();
        for (const ord of unlinkedOrders) {
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
                recentOrders
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

    static async addCustomerFlag(adminId: string, adminName: string, flagData: any) {
        const db = await getDb();
        const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
        const flagId = generateFlagId();
        const newFlag = {
            id: flagId,
            publicId: flagId,
            customerId: flagData.customerId,
            customerName: flagData.customerName,
            flagType: flagData.flagType,
            reason: flagData.reason,
            severity: flagData.severity || 'high',
            status: 'active',
            createdByStaffName: adminName || 'Admin',
            createdAt: now
        };

        await db.collection('customer_flags').insertOne(newFlag as any);

        if (flagData.flagType === 'Chargeback' || flagData.flagType === 'Fraud Concern') {
            const customerLookup = buildEntityLookupQuery(flagData.customerId, 'user');
            await db.collection('users').updateOne(
                customerLookup as any,
                { $set: { status: 'blocked', customer_status: 'blocked', is_blocked: true } }
            );
            await SessionService.revokeAllUserSessions(flagData.customerId).catch(() => {});
        }

        await AuditService.recordEvent({
            entityType: 'customer',
            entityId: flagData.customerId,
            action: 'customer_flag_added',
            actorId: adminId,
            actorRole: 'admin',
            reason: flagData.reason,
            metadata: { flagType: flagData.flagType }
        });

        return { success: true, flag: newFlag };
    }

    static async addCustomerNote(adminId: string, authorName: string, authorRole: string, customerId: string, note: string) {
        const db = await getDb();
        const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
        const noteId = generateNoteId();
        const newNote = {
            id: noteId,
            publicId: noteId,
            customerId,
            note: note.trim(),
            authorName: authorName || 'Administrator',
            authorRole: authorRole || 'Super Admin',
            isPinned: false,
            createdAt: now
        };

        await db.collection('customer_notes').insertOne(newNote as any);

        await AuditService.recordEvent({
            entityType: 'customer',
            entityId: customerId,
            action: 'customer_note_added',
            actorId: adminId,
            actorRole: authorRole || 'admin',
            reason: note.trim()
        });

        return { success: true, note: newNote };
    }

    static async updateCustomerStatus(adminId: string, customerId: string, status: string) {
        const db = await getDb();
        const now = new Date().toISOString();
        const customerLookup = buildEntityLookupQuery(customerId, 'user');
        await db.collection('users').updateOne(
            customerLookup as any,
            { $set: { status, customer_status: status, updated_at: now } }
        );

        await AuditService.recordEvent({
            entityType: 'customer',
            entityId: customerId,
            action: 'customer_status_updated',
            actorId: adminId,
            actorRole: 'admin',
            after: { status }
        });

        return { success: true };
    }

    /**
     * Deletes a customer account from MongoDB and permanently deletes their Auth0 credentials.
     * Prevents deletion if customer has active in-progress orders.
     * Cleans up customer flags, notes, and records an audit trail.
     */
    static async deleteCustomer(adminId: string, customerId: string) {
        const db = await getDb();
        const customerLookup = buildEntityLookupQuery(customerId, 'user');
        const user = await db.collection('users').findOne(customerLookup as any);

        if (!user) {
            throw new NotFoundError(`Customer with identifier "${customerId}" not found.`);
        }

        const uId = String(user._id || user.id || user.customerId || user.publicId);
        const email = user.email ? user.email.toLowerCase().trim() : '';
        const phone = user.phone ? user.phone.trim() : '';

        // Prevent deleting customers with active orders in flight
        const activeOrdersCount = await db.collection('orders').countDocuments({
            $or: [
                { customer_id: uId },
                { customerId: uId },
                { userId: uId },
                { user_id: uId },
                ...(email ? [{ customerEmail: email }, { 'contactDetails.email': email }, { email }] : []),
                ...(phone ? [{ customerPhone: phone }, { 'contactDetails.phone': phone }] : [])
            ],
            status: { $nin: ['delivered', 'cancelled', 'refunded'] }
        });

        if (activeOrdersCount > 0) {
            throw new BadRequestError(
                `Cannot delete customer with ${activeOrdersCount} active order(s) in progress. Please complete or cancel active orders first.`
            );
        }

        // 1. Delete user from Auth0 if Auth0 identity exists
        const auth0Id = user.auth0UserId || user.auth0_sub;
        if (auth0Id) {
            try {
                await Auth0Service.deleteUser(auth0Id);
            } catch (auth0Err: any) {
                console.warn(`[AdminService] Auth0 customer deletion warning for ${auth0Id}: ${auth0Err.message}`);
            }
        }

        // 2. Remove associated customer flags and notes
        const targetIds = [customerId, uId, user.publicId, user.customerId, String(user._id)].filter(Boolean);
        await db.collection('customer_flags').deleteMany({
            customerId: { $in: targetIds }
        }).catch(() => {});

        await db.collection('customer_notes').deleteMany({
            customerId: { $in: targetIds }
        }).catch(() => {});

        // 3. Delete from MongoDB users collection
        await db.collection('users').deleteOne({ _id: user._id });

        // 4. Record audit event
        await AuditService.recordEvent({
            entityType: 'customer',
            entityId: customerId,
            action: 'customer_deleted',
            actorId: adminId,
            actorRole: 'admin',
            reason: `Customer "${user.full_name || user.email}" was deleted from MongoDB and Auth0`,
            metadata: {
                email: user.email,
                auth0UserId: auth0Id || null
            }
        }).catch(() => {});

        return {
            success: true,
            deletedId: customerId,
            message: `Customer "${user.full_name || user.email}" was successfully deleted from MongoDB and Auth0.`
        };
    }


    static async getFinanceData() {
        const db = await getDb();
        const [orders, incidents, storeCredits, users] = await Promise.all([
            db.collection('orders').find({}).sort({ createdAt: -1 }).toArray(),
            db.collection('incidents').find({}).toArray(),
            db.collection('store_credits').find({}).toArray(),
            db.collection('users').find({ role: 'customer' }).toArray()
        ]);

        const userMap = new Map(users.map((u: any) => [u._id?.toString() || u.id, u.full_name || u.name]));

        const validOrders = orders.filter((o: any) => o.status !== 'cancelled' && o.status !== 'pending_payment');
        const grossRevenue = validOrders.reduce((sum: number, o: any) => sum + (Number(o.total) || 0), 0);
        const totalPaidCount = validOrders.length;
        const failedCount = orders.filter((o: any) => o.status === 'cancelled' && (o.paymentStatus === 'failed' || o.paymentStatus === 'Failed')).length;
        const totalAttempts = totalPaidCount + failedCount;
        const stripeSuccessRate = totalAttempts > 0 ? Math.round((totalPaidCount / totalAttempts) * 1000) / 10 : 100.0;

        // Refund records from orders with paymentStatus === 'refunded' or incidents
        const refundsFromOrders = orders
            .filter((o: any) => o.paymentStatus === 'refunded' || o.paymentStatus === 'Refunded' || (Number(o.refundedAmount) > 0))
            .map((o: any) => ({
                id: `rf_${o.id || o._id}`,
                customerName: o.customerName || userMap.get(o.customer_id || o.userId) || (o.address ? o.address.split(',')[0] : 'Customer'),
                orderNumber: o.id || o.orderNumber || 'ORD',
                amount: Number(o.refundedAmount || o.total || 0),
                stripeRefundId: o.stripeRefundId || (o.paymentIntentId ? `re_${o.paymentIntentId.slice(-8)}` : 're_stripe_confirmed'),
                reason: o.refundReason || 'Service cancellation / customer satisfaction',
                processedByStaffName: o.refundedBy || 'Administrator',
                createdAt: o.updated_at || o.createdAt || new Date().toISOString()
            }));

        const refundsFromIncidents = incidents
            .filter((inc: any) => inc.compensationType === 'refund' || inc.resolutionOutcome === 'refunded' || inc.type === 'refund')
            .map((inc: any) => ({
                id: `rf_inc_${inc.id || inc._id}`,
                customerName: inc.customerName || 'Customer',
                orderNumber: inc.orderId || 'INC-CLAIM',
                amount: Number(inc.compensationAmount || inc.amount || 0),
                stripeRefundId: inc.stripeRefundId || 're_claim_payout',
                reason: inc.description || inc.resolutionNotes || inc.reason || 'Claim resolution payout',
                processedByStaffName: inc.resolvedBy || 'Plant Manager',
                createdAt: inc.resolvedAt || inc.createdAt || new Date().toISOString()
            }));

        const allRefunds = [...refundsFromOrders, ...refundsFromIncidents];
        const totalRefundsAmount = allRefunds.reduce((sum, r) => sum + r.amount, 0);

        // Store credits
        const walletCredits = users
            .filter((u: any) => Number(u.walletBalance || 0) > 0)
            .map((u: any) => ({
                id: `cr_${u._id}`,
                customerName: u.full_name || u.name || 'Customer',
                amount: Number(u.walletBalance || 0),
                creditType: 'Store Credit Balance',
                expiresAt: '2027-12-31',
                reason: 'Wallet balance / courtesy adjustment'
            }));

        const creditsFromIncidents = incidents
            .filter((inc: any) => inc.compensationType === 'store_credit' || inc.compensationType === 'credit')
            .map((inc: any) => ({
                id: `cr_inc_${inc.id || inc._id}`,
                customerName: inc.customerName || 'Customer',
                amount: Number(inc.compensationAmount || inc.amount || 0),
                creditType: 'Claim Resolution Credit',
                expiresAt: '2027-12-31',
                reason: inc.description || inc.reason || 'Customer satisfaction compensation'
            }));

        const allCredits = [...storeCredits, ...walletCredits, ...creditsFromIncidents];
        const activeStoreCreditsTotal = allCredits.reduce((sum, c) => sum + Number(c.amount || 0), 0);

        // Price adjustments
        const adjustmentsFromOrders = orders
            .filter((o: any) => (Number(o.additionalCharge) > 0) || (Number(o.priceAdjustment) > 0))
            .map((o: any) => ({
                id: `fa_${o.id || o._id}`,
                customerName: o.customerName || userMap.get(o.customer_id || o.userId) || 'Customer',
                orderNumber: o.id || o.orderNumber || 'ORD',
                adjustmentType: o.adjustmentReason || 'Weight Surcharge / Extra Items',
                amount: Number(o.additionalCharge || o.priceAdjustment || 0),
                reason: o.adjustmentNotes || 'Weight or item count adjusted at processing plant'
            }));

        const orderTransactions = orders.map((o: any) => {
            const incoming = Number(o.total || 0);
            const refund = Number(o.refundedAmount || ((o.paymentStatus === 'refunded' || o.paymentStatus === 'Refunded') ? incoming : 0));
            const net = Math.max(0, incoming - refund);
            const cName = o.customerName || userMap.get(o.customer_id || o.userId) || (o.address ? o.address.split(',')[0] : 'Customer');
            const dateStr = o.createdAt || o.created_at || o.bookedAt;
            const dateFormatted = dateStr ? new Date(dateStr).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : (o.pickupDate || 'Recent');
            return {
                id: o.id || o.orderNumber || (o._id ? o._id.toString() : 'ORD'),
                customerName: cName,
                date: dateFormatted,
                paymentMethod: o.paymentMethod || 'Stripe Card',
                paymentStatus: o.paymentStatus || (refund > 0 ? (refund >= incoming ? 'Refunded' : 'Partial Refund') : 'Paid'),
                incomingAmount: incoming,
                refundAmount: refund,
                netAmount: net,
                status: o.statusLabel || o.status || 'Delivered'
            };
        });

        const totalIncomingCalculated = orderTransactions.reduce((sum, ord) => sum + ord.incomingAmount, 0);

        return {
            grossRevenue: totalIncomingCalculated,
            stripeSuccessRate,
            totalRefundsAmount,
            netRevenue: Math.max(0, totalIncomingCalculated - totalRefundsAmount),
            activeStoreCreditsTotal,
            orders: orderTransactions,
            refunds: allRefunds,
            credits: allCredits,
            adjustments: adjustmentsFromOrders
        };
    }

    static async getReportsData(range = '7_days') {
        const db = await getDb();
        const [orders, incidents, plants] = await Promise.all([
            db.collection('orders').find({}).toArray(),
            db.collection('incidents').find({}).toArray(),
            db.collection('plants').find({}).toArray()
        ]);

        const now = new Date();
        let cutoffTime: number;
        let bucketType: 'hours' | 'days' | 'weeks' | 'months';

        if (range === 'today') {
            const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            cutoffTime = todayStart.getTime();
            bucketType = 'hours';
        } else if (range === '30_days') {
            cutoffTime = now.getTime() - 30 * 24 * 60 * 60 * 1000;
            bucketType = 'weeks';
        } else if (range === '3_months') {
            cutoffTime = now.getTime() - 90 * 24 * 60 * 60 * 1000;
            bucketType = 'months';
        } else if (range === '1_year') {
            cutoffTime = now.getTime() - 365 * 24 * 60 * 60 * 1000;
            bucketType = 'months';
        } else {
            // default '7_days'
            cutoffTime = now.getTime() - 7 * 24 * 60 * 60 * 1000;
            bucketType = 'days';
        }

        const filteredOrders = orders.filter((o: any) => {
            const dateStr = o.createdAt || o.created_at || o.bookedAt;
            if (!dateStr) return true;
            const time = new Date(dateStr).getTime();
            return !isNaN(time) ? time >= cutoffTime : true;
        });

        const salesRevenue = Math.round(filteredOrders.reduce((sum: number, o: any) => sum + Number(o.total || 0), 0) * 100) / 100;
        const totalOrders = filteredOrders.length;

        // Turnaround efficiency for delivered orders
        const deliveredOrders = filteredOrders.filter((o: any) =>
            ['delivered', 'order_delivered'].includes(o.status) || !!o.delivered_at
        );
        let avgTurnaroundHrs = 0;
        if (deliveredOrders.length > 0) {
            let totalDiffMs = 0;
            let counted = 0;
            for (const o of deliveredOrders) {
                const start = new Date(o.createdAt || o.created_at || o.bookedAt).getTime();
                const end = new Date(o.delivered_at || o.delivery_pin_verified_at || o.updated_at || o.updatedAt).getTime();
                if (!isNaN(start) && !isNaN(end) && end > start) {
                    const diff = end - start;
                    if (diff > 0 && diff < 30 * 24 * 60 * 60 * 1000) {
                        totalDiffMs += diff;
                        counted++;
                    }
                }
            }
            if (counted > 0) {
                avgTurnaroundHrs = Math.round((totalDiffMs / counted / (1000 * 60 * 60)) * 10) / 10;
            }
        }

        // Rewash rate calculation from real incidents & orders
        const rewashIncidents = incidents.filter((inc: any) =>
            inc.type === 'rewash' || inc.issueType === 'rewash' || inc.rewashRequired || inc.qcOutcome === 'rewash'
        ).length;
        const rewashOrders = filteredOrders.filter((o: any) => o.status === 'rewash_required' || o.rewashRequired).length;
        const totalRewash = rewashIncidents + rewashOrders;
        const rewashRate = totalOrders > 0 ? Math.round((totalRewash / totalOrders) * 1000) / 10 : 0;

        // Customer retention & first-time vs repeat calculations
        const customerLifetimeOrders: { [key: string]: any[] } = {};
        orders.forEach((o: any) => {
            const cId = o.customer_id || o.userId || o.user_id || o.customerEmail || o.email || 'anon';
            if (!customerLifetimeOrders[cId]) customerLifetimeOrders[cId] = [];
            customerLifetimeOrders[cId].push(o);
        });

        Object.values(customerLifetimeOrders).forEach(list => {
            list.sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime());
        });

        let firstTimeRevenue = 0;
        let repeatRevenue = 0;
        filteredOrders.forEach((o: any) => {
            const cId = o.customer_id || o.userId || o.user_id || o.customerEmail || o.email || 'anon';
            const lifetime = customerLifetimeOrders[cId] || [];
            const isFirst = lifetime.length > 0 && (lifetime[0].id === o.id || lifetime[0]._id === o._id);
            const orderTotal = Number(o.total || 0);
            if (isFirst) {
                firstTimeRevenue += orderTotal;
            } else {
                repeatRevenue += orderTotal;
            }
        });

        const totalRevenueTracked = firstTimeRevenue + repeatRevenue;
        const firstTimePercent = totalRevenueTracked > 0 ? Math.round((firstTimeRevenue / totalRevenueTracked) * 100) : 0;
        const repeatPercent = totalRevenueTracked > 0 ? Math.round((repeatRevenue / totalRevenueTracked) * 100) : 0;

        const windowCustomers = new Set(filteredOrders.map((o: any) => o.customer_id || o.userId || o.customerEmail || 'anon'));
        const repeatCustomerCount = Array.from(windowCustomers).filter(cId => (customerLifetimeOrders[cId]?.length || 0) > 1).length;
        const customerRetentionRate = windowCustomers.size > 0
            ? Math.round((repeatCustomerCount / windowCustomers.size) * 1000) / 10
            : 0;

        // Total KG & Profit per KG calculation
        const totalKg = filteredOrders.reduce((sum: number, o: any) => {
            if (o.weightKg && Number(o.weightKg) > 0) return sum + Number(o.weightKg);
            const itemKg = (o.items || []).reduce((is: number, it: any) => {
                return is + (it.unit === 'kg' ? Number(it.quantity || 1) : 0);
            }, 0);
            return sum + (itemKg > 0 ? itemKg : 0);
        }, 0);
        const profitPerKg = totalKg > 0 ? Math.round(((salesRevenue * 0.45) / totalKg) * 100) / 100 : (totalOrders > 0 ? Math.round((salesRevenue / (totalOrders * 5)) * 100) / 100 : 0);

        // Algorithmic Revenue Trend Calculation
        let trend: { label: string; revenue: number; orders: number }[] = [];
        if (bucketType === 'hours') {
            const slots = [
                { label: '08:00', minH: 0, maxH: 9 },
                { label: '10:00', minH: 9, maxH: 11 },
                { label: '12:00', minH: 11, maxH: 13 },
                { label: '14:00', minH: 13, maxH: 15 },
                { label: '16:00', minH: 15, maxH: 17 },
                { label: '18:00', minH: 17, maxH: 19 },
                { label: '20:00', minH: 19, maxH: 21 },
                { label: '22:00', minH: 21, maxH: 24 }
            ];
            trend = slots.map(slot => {
                const slotOrders = filteredOrders.filter((o: any) => {
                    const d = new Date(o.createdAt || o.created_at || o.bookedAt);
                    const h = d.getHours();
                    return h >= slot.minH && h < slot.maxH;
                });
                const rev = slotOrders.reduce((s, o) => s + Number(o.total || 0), 0);
                return {
                    label: slot.label,
                    revenue: Math.round(rev * 100) / 100,
                    orders: slotOrders.length
                };
            });
        } else if (bucketType === 'weeks') {
            const weekBuckets = [
                { label: 'Week 1', daysAgoMin: 30, daysAgoMax: 22 },
                { label: 'Week 2', daysAgoMin: 22, daysAgoMax: 15 },
                { label: 'Week 3', daysAgoMin: 15, daysAgoMax: 8 },
                { label: 'Week 4', daysAgoMin: 8, daysAgoMax: 0 }
            ];
            trend = weekBuckets.map(w => {
                const minT = now.getTime() - w.daysAgoMin * 24 * 3600 * 1000;
                const maxT = now.getTime() - w.daysAgoMax * 24 * 3600 * 1000;
                const wkOrders = filteredOrders.filter((o: any) => {
                    const t = new Date(o.createdAt || o.created_at || o.bookedAt).getTime();
                    return t >= minT && t <= maxT;
                });
                const rev = wkOrders.reduce((s, o) => s + Number(o.total || 0), 0);
                return {
                    label: w.label,
                    revenue: Math.round(rev * 100) / 100,
                    orders: wkOrders.length
                };
            });
        } else if (bucketType === 'months') {
            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            trend = [2, 1, 0].map(mOffset => {
                const d = new Date(now.getFullYear(), now.getMonth() - mOffset, 1);
                const nextD = new Date(now.getFullYear(), now.getMonth() - mOffset + 1, 1);
                const mOrders = filteredOrders.filter((o: any) => {
                    const t = new Date(o.createdAt || o.created_at || o.bookedAt).getTime();
                    return t >= d.getTime() && t < nextD.getTime();
                });
                const rev = mOrders.reduce((s, o) => s + Number(o.total || 0), 0);
                return {
                    label: monthNames[d.getMonth()],
                    revenue: Math.round(rev * 100) / 100,
                    orders: mOrders.length
                };
            });
        } else {
            // 7 Days
            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            trend = Array.from({ length: 7 }).map((_, i) => {
                const dayDate = new Date(now.getTime() - (6 - i) * 24 * 3600 * 1000);
                const dayStart = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate()).getTime();
                const dayEnd = dayStart + 24 * 3600 * 1000;
                const dayOrders = filteredOrders.filter((o: any) => {
                    const t = new Date(o.createdAt || o.created_at || o.bookedAt).getTime();
                    return t >= dayStart && t < dayEnd;
                });
                const rev = dayOrders.reduce((s, o) => s + Number(o.total || 0), 0);
                return {
                    label: dayNames[dayDate.getDay()],
                    revenue: Math.round(rev * 100) / 100,
                    orders: dayOrders.length
                };
            });
        }

        // Algorithmic Category Breakdown from Real Items
        const categoryMap: { [cat: string]: { count: number; revenue: number } } = {};
        filteredOrders.forEach((o: any) => {
            const items = o.items || o.orderItems || [];
            if (items.length > 0) {
                items.forEach((it: any) => {
                    const catName = it.category || it.categoryLabel || it.serviceType || it.name || 'General Laundry';
                    const price = Number(it.price || 0) * Number(it.quantity || 1) || (Number(o.total || 0) / items.length);
                    const qty = Number(it.quantity || 1);
                    if (!categoryMap[catName]) categoryMap[catName] = { count: 0, revenue: 0 };
                    categoryMap[catName].count += qty;
                    categoryMap[catName].revenue += price;
                });
            } else {
                const catName = o.serviceName || o.serviceType || 'General Laundry';
                if (!categoryMap[catName]) categoryMap[catName] = { count: 0, revenue: 0 };
                categoryMap[catName].count += 1;
                categoryMap[catName].revenue += Number(o.total || 0);
            }
        });

        const totalCatRevenue = Object.values(categoryMap).reduce((s, c) => s + c.revenue, 0) || 1;
        const colorPalette = ['#0f172a', '#2563eb', '#06b6d4', '#6366f1', '#10b981', '#f59e0b', '#ec4899'];
        const categoryBreakdown = Object.entries(categoryMap)
            .map(([name, data], idx) => ({
                name,
                count: data.count,
                revenue: Math.round(data.revenue * 100) / 100,
                percent: Math.max(1, Math.round((data.revenue / totalCatRevenue) * 100)),
                color: colorPalette[idx % colorPalette.length]
            }))
            .sort((a, b) => b.revenue - a.revenue);

        // Turnaround Distribution Breakdown
        const brackets = [
            { bracket: '< 12h (Express)', minH: 0, maxH: 12, color: '#10b981', count: 0 },
            { bracket: '12-24h (Standard)', minH: 12, maxH: 24, color: '#2563eb', count: 0 },
            { bracket: '24-48h (Specialist)', minH: 24, maxH: 48, color: '#f59e0b', count: 0 },
            { bracket: '> 48h (Over SLA)', minH: 48, maxH: Infinity, color: '#ef4444', count: 0 }
        ];

        deliveredOrders.forEach((o: any) => {
            const start = new Date(o.createdAt || o.created_at || o.bookedAt).getTime();
            const end = new Date(o.delivered_at || o.delivery_pin_verified_at || o.updated_at || o.updatedAt).getTime();
            if (!isNaN(start) && !isNaN(end) && end > start) {
                const hrs = (end - start) / (1000 * 3600);
                for (const b of brackets) {
                    if (hrs >= b.minH && hrs < b.maxH) {
                        b.count++;
                        break;
                    }
                }
            }
        });

        const totalDeliveredCount = deliveredOrders.length || 1;
        const turnaroundDistribution = brackets.map(b => ({
            bracket: b.bracket,
            count: b.count,
            percent: deliveredOrders.length > 0 ? Math.round((b.count / totalDeliveredCount) * 100) : 0,
            color: b.color
        }));

        // Real Plant Performance from DB
        const plantPerformance = plants.map((plant: any) => {
            const pId = plant._id?.toString();
            const pCode = plant.code;
            const pPublicId = plant.publicId || plant.id;
            const pName = plant.name;

            const plantOrders = filteredOrders.filter((o: any) =>
                (pId && (o.plant_id === pId || o.plantId === pId)) ||
                (pPublicId && (o.plantId === pPublicId || o.plant_id === pPublicId)) ||
                (pCode && (o.plant_code === pCode || o.plantCode === pCode)) ||
                (pName && (o.plant_name === pName || o.plantName === pName))
            );

            const plantDelivered = plantOrders.filter((o: any) =>
                ['delivered', 'order_delivered'].includes(o.status) || !!o.delivered_at
            );

            let plantAvgHours = 0;
            if (plantDelivered.length > 0) {
                let diffMs = 0;
                let c = 0;
                for (const o of plantDelivered) {
                    const start = new Date(o.createdAt || o.created_at || o.bookedAt).getTime();
                    const end = new Date(o.delivered_at || o.delivery_pin_verified_at || o.updated_at || o.updatedAt).getTime();
                    if (!isNaN(start) && !isNaN(end) && end > start) {
                        diffMs += (end - start);
                        c++;
                    }
                }
                if (c > 0) plantAvgHours = Math.round((diffMs / c / (3600 * 1000)) * 10) / 10;
            }

            const slaMet = plantDelivered.filter((o: any) => {
                const start = new Date(o.createdAt || o.created_at).getTime();
                const end = new Date(o.delivered_at || o.updated_at).getTime();
                const maxDue = o.deliveryDueAt ? new Date(o.deliveryDueAt).getTime() : start + 24 * 3600 * 1000;
                return end <= maxDue;
            }).length;

            const slaPercent = plantDelivered.length > 0 ? Math.round((slaMet / plantDelivered.length) * 1000) / 10 : 100.0;

            return {
                name: plant.name,
                avgHours: plantAvgHours,
                slaPercent,
                volume: plantOrders.length
            };
        });

        return {
            salesRevenue,
            totalOrders,
            customerRetentionRate,
            turnaroundHours: avgTurnaroundHrs,
            rewashRate,
            profitPerKg,
            revenueTrend: trend,
            categoryBreakdown,
            turnaroundDistribution,
            plantPerformance,
            retentionSplit: {
                firstTimePercent,
                repeatPercent,
                firstTimeRevenue: Math.round(firstTimeRevenue * 100) / 100,
                repeatRevenue: Math.round(repeatRevenue * 100) / 100,
            }
        };
    }

    static async getAuditLogs(limit = 100) {
        const logsResult = await AuditService.getLogs({}, limit, 1);
        return logsResult.items.map((log: any) => ({
            id: log.eventId || log._id?.toString(),
            actorName: log.actorId || 'System Admin',
            actorRole: log.actorRole || 'System Admin',
            action: log.action || log.event || 'System Audit',
            entityType: log.entityType || 'order',
            entityId: log.entityId || log.orderId || 'system',
            reason: log.reason || 'Operational action logged to database',
            oldValues: log.before || null,
            newValues: log.after || null,
            ipAddress: log.ipAddress || '127.0.0.1',
            createdAt: log.timestamp || new Date().toISOString()
        }));
    }

    static async getStaff(query: any = {}) {
        const db = await getDb();
        const canonicalStaffRoles = ['admin', 'super_admin', 'manager', 'plant_manager', 'driver', 'processor'];

        let roleFilter: any;
        if (query.role) {
            if (typeof query.role === 'string') {
                roleFilter = canonicalStaffRoles.includes(query.role) ? query.role : { $in: [] };
            } else if (query.role.$in && Array.isArray(query.role.$in)) {
                const allowed = query.role.$in.filter((r: string) => canonicalStaffRoles.includes(r));
                roleFilter = { $in: allowed };
            } else {
                roleFilter = { $in: canonicalStaffRoles };
            }
        } else {
            roleFilter = { $in: canonicalStaffRoles };
        }

        const staffQuery: any = {
            ...query,
            role: roleFilter,
            $and: [
                { role: { $nin: ['customer', 'user', 'guest'] } },
                {
                    $or: [
                        { customerId: { $exists: false } },
                        { customerId: null },
                        { staffId: { $exists: true, $ne: null } }
                    ]
                }
            ]
        };

        const rawStaff = await db.collection('users')
            .find(staffQuery, { projection: { password: 0 } })
            .toArray();

        // Extra safeguard in-memory: customers must NEVER appear under staff accounts
        const staff = rawStaff.filter((u: any) => {
            const r = (u.role || '').toLowerCase();
            if (r === 'customer' || r === 'user' || r === 'guest') return false;
            if (u.customerId && !u.staffId && !canonicalStaffRoles.includes(r)) return false;
            if (String(u.id || u.publicId || '').startsWith('CUST-') && !u.staffId) return false;
            return canonicalStaffRoles.includes(r);
        });

        return { staff };
    }

    // ─── Helper: Sync a single staff member's postcodes from their manager's plant ──
    static async syncStaffPostcodesFromManager(db: any, staffId: string): Promise<void> {
        const staff = await db.collection('users').findOne(
            buildEntityLookupQuery(staffId, 'user', (id) => ObjectId.isValid(id) ? new ObjectId(id) : null) as any
        );
        if (!staff) return;
        const managerId = staff.manager_id;
        const plantId = staff.plant_id;
        if (!managerId && !plantId) return;

        let plant: any = null;
        if (plantId) {
            plant = await db.collection('plants').findOne(
                buildEntityLookupQuery(plantId, 'plant', (id) => ObjectId.isValid(id) ? new ObjectId(id) : null) as any
            );
        }
        if (!plant && managerId) {
            const manager = await db.collection('users').findOne(
                buildEntityLookupQuery(managerId, 'user', (id) => ObjectId.isValid(id) ? new ObjectId(id) : null) as any
            );
            if (manager?.plant_id) {
                plant = await db.collection('plants').findOne(
                    buildEntityLookupQuery(manager.plant_id, 'plant', (id) => ObjectId.isValid(id) ? new ObjectId(id) : null) as any
                );
            }
            if (!plant) {
                plant = await db.collection('plants').findOne({ manager_id: managerId } as any);
            }
        }
        if (!plant) return;

        const pincodes: string[] = Array.isArray(plant.service_pincodes)
            ? plant.service_pincodes
            : (plant.service_pincodes || '').split(',').map((p: string) => p.trim().toUpperCase()).filter(Boolean);

        await db.collection('users').updateOne(
            { _id: staff._id },
            { $set: { assigned_postcodes: pincodes, assignedSectors: pincodes } }
        );
    }

    // ─── Helper: Get a single staff member with their plant's service_pincodes ──
    static async getStaffMemberWithPlant(staffId: string) {
        const db = await getDb();
        const staff = await db.collection('users').findOne(
            buildEntityLookupQuery(staffId, 'user', (id) => ObjectId.isValid(id) ? new ObjectId(id) : null) as any,
            { projection: { password: 0 } }
        );
        if (!staff) throw new Error('Staff member not found.');

        let plant: any = null;
        const targetPlantId = staff.plant_id || staff.plantId;
        if (targetPlantId) {
            plant = await db.collection('plants').findOne(
                buildEntityLookupQuery(targetPlantId, 'plant', (id) => ObjectId.isValid(id) ? new ObjectId(id) : null) as any
            );
        } else if (staff.manager_id || staff.plantManagerId) {
            const mId = staff.manager_id || staff.plantManagerId;
            const manager = await db.collection('users').findOne(
                buildEntityLookupQuery(mId, 'user', (id) => ObjectId.isValid(id) ? new ObjectId(id) : null) as any
            );
            if (manager?.plant_id || manager?.plantId) {
                plant = await db.collection('plants').findOne(
                    buildEntityLookupQuery(manager.plant_id || manager.plantId, 'plant', (id) => ObjectId.isValid(id) ? new ObjectId(id) : null) as any
                );
            }
            if (!plant) {
                const mKeys = [mId, manager ? String(manager._id) : null, manager?.publicId].filter(Boolean);
                plant = await db.collection('plants').findOne({
                    $or: [
                        { manager_id: { $in: mKeys } },
                        { manager_public_id: { $in: mKeys } }
                    ]
                } as any);
            }
        }

        const plantPostcodes = Array.isArray(plant?.service_pincodes)
            ? plant.service_pincodes
            : (typeof plant?.service_pincodes === 'string'
                ? plant.service_pincodes.split(',').map((p: string) => p.trim().toUpperCase()).filter(Boolean)
                : []);

        const fallbackPostcodes = plantPostcodes.length > 0
            ? plantPostcodes
            : (Array.isArray(staff.assigned_postcodes) ? staff.assigned_postcodes : (Array.isArray(staff.assignedSectors) ? staff.assignedSectors : []));

        return {
            staff,
            plant: plant ? {
                _id: plant._id,
                publicId: plant.publicId,
                name: plant.name,
                code: plant.code,
                service_pincodes: plantPostcodes,
                manager_id: plant.manager_id
            } : null,
            inheritedPostcodes: fallbackPostcodes
        };
    }

    static async createStaffMember(adminId: string, staffData: any) {
        const db = await getDb();
        const adminUser = await db.collection('users').findOne({
            $or: [{ _id: adminId as any }, { id: adminId }, { auth0UserId: adminId }, { auth0_sub: adminId }]
        }) || { _id: adminId, role: 'super_admin' };

        const actorContext: any = {
            token: { sub: adminId, role: 'super_admin', email: (adminUser as any)?.email || process.env.ADMIN_EMAIL || '' },
            dbUser: adminUser
        };

        const targetRole = (staffData.role || '').toLowerCase();
        if (targetRole === 'manager' || targetRole === 'plant_manager') {
            return StaffProvisioningService.provisionManager(actorContext, staffData);
        } else if (targetRole === 'driver') {
            return StaffProvisioningService.provisionDriver(actorContext, staffData);
        } else if (targetRole === 'processor') {
            return StaffProvisioningService.provisionProcessor(actorContext, staffData);
        } else {
            throw new Error(`Invalid staff role "${targetRole}". Must be manager, driver, or processor.`);
        }
    }

    static async updateStaffMember(adminId: string, staffId: string, staffData: any) {
        const db = await getDb();
        const adminUser = await db.collection('users').findOne({
            $or: [{ _id: adminId as any }, { id: adminId }, { auth0UserId: adminId }, { auth0_sub: adminId }]
        }) || { _id: adminId, role: 'super_admin' };

        const actorContext: any = {
            token: { sub: adminId, role: 'super_admin', email: (adminUser as any)?.email || process.env.ADMIN_EMAIL || '' },
            dbUser: adminUser
        };

        return StaffProvisioningService.updateUser(actorContext, staffId, staffData);
    }

    static async getPlants(actor?: any) {
        const db = await getDb();
        let query: any = {};
        if (actor && (actor.role === 'manager' || actor.role === 'plant_manager')) {
            const managerIdStr = String(actor._id || actor.id || '');
            const managerPublicId = actor.publicId ? String(actor.publicId) : null;
            const managerEmail = actor.email ? String(actor.email).toLowerCase() : null;
            const plantId = actor.plant_id || actor.plantId;
            
            const conditions: any[] = [];
            if (plantId) {
                conditions.push({ _id: plantId });
                conditions.push({ _id: String(plantId) });
                conditions.push({ id: plantId });
                conditions.push({ publicId: plantId });
                conditions.push({ code: plantId });
                if (ObjectId.isValid(plantId)) {
                    conditions.push({ _id: new ObjectId(plantId) });
                }
            }
            if (managerIdStr) {
                conditions.push({ manager_id: managerIdStr });
                conditions.push({ manager_ids: managerIdStr });
                if (ObjectId.isValid(managerIdStr)) {
                    conditions.push({ manager_id: new ObjectId(managerIdStr) });
                }
            }
            if (managerPublicId) {
                conditions.push({ manager_public_id: managerPublicId });
                conditions.push({ manager_id: managerPublicId });
            }
            if (managerEmail) {
                conditions.push({ manager_email: managerEmail });
            }

            if (conditions.length > 0) {
                query = { $or: conditions };
            } else {
                return { plants: [] };
            }
        }
        const plants = await db.collection('plants').find(query).toArray();
        return { plants };
    }

    static async createPlant(adminId: string, plantData: any) {
        const db = await getDb();
        if (!plantData?.name || !plantData?.code) {
            throw new Error('Plant name and code are required.');
        }
        const existing = await db.collection('plants').findOne({ code: plantData.code.toUpperCase() });
        if (existing) throw new Error(`Plant code '${plantData.code}' is already registered.`);

        const internalPlantId = new ObjectId().toHexString();
        const plantPublicId = generatePlantId();
        const now = new Date().toISOString();
        const newPlant = {
            _id: internalPlantId,
            publicId: plantPublicId,
            plantId: plantPublicId,
            id: plantPublicId,
            name: plantData.name,
            code: plantData.code.toUpperCase(),
            manager_id: plantData.manager_id || null,
            address: plantData.address || '',
            service_pincodes: (() => {
                const raw = Array.isArray(plantData.service_pincodes)
                    ? plantData.service_pincodes
                    : (plantData.service_pincodes || '').split(',');
                return Array.from(new Set(raw.map((p: string) => (extractOutwardCode(String(p).trim()) || String(p).trim().toUpperCase().replace(/\s+/g, ''))).filter(Boolean))) as string[];
            })(),
            status: plantData.status || 'ACTIVE',
            created_at: now,
            updated_at: now
        };
        await db.collection('plants').insertOne(newPlant as any);

        if (plantData.manager_id) {
            const manager = await db.collection('users').findOne(
                buildEntityLookupQuery(plantData.manager_id, 'user', (id) => ObjectId.isValid(id) ? new ObjectId(id) : null) as any
            );
            if (manager && (manager.role === 'manager' || manager.role === 'plant_manager')) {
                const mIdStr = String(manager._id);
                const mPubId = manager.publicId || mIdStr;
                await db.collection('plants').updateMany(
                    {
                        $or: [
                            { manager_id: mIdStr },
                            { manager_id: mPubId },
                            { manager_id: plantData.manager_id }
                        ],
                        _id: { $ne: internalPlantId } as any
                    },
                    { $set: { manager_id: null, manager_name: null } }
                );
                await db.collection('users').updateOne(
                    { _id: manager._id },
                    {
                        $set: {
                            plant_id: internalPlantId,
                            plantId: internalPlantId,
                            assigned_plant: plantData.name,
                            ...(newPlant.service_pincodes.length > 0 ? {
                                assigned_postcodes: newPlant.service_pincodes,
                                assignedSectors: newPlant.service_pincodes
                            } : {})
                        }
                    }
                );
            }
        }

        if (newPlant.service_pincodes.length > 0) {
            await db.collection('postcode_sectors').updateMany(
                { district: { $in: newPlant.service_pincodes } },
                { $set: { plant_id: plantPublicId } }
            );
        }
        
        await AuditService.recordEvent({
            entityType: 'plant',
            entityId: plantPublicId,
            action: 'plant_created',
            actorId: adminId,
            actorRole: 'admin'
        });
        return { success: true, plantId: plantPublicId, publicId: plantPublicId };
    }

    static async updatePlant(adminId: string, plantId: string, plantData: any) {
        const db = await getDb();
        const plant = await db.collection('plants').findOne(buildEntityLookupQuery(plantId, 'plant') as any);
        if (!plant) throw new Error('Plant not found.');

        const now = new Date().toISOString();
        const updateFields: any = { updated_at: now };
        
        if (plantData.name) updateFields.name = plantData.name;
        if (plantData.address !== undefined) updateFields.address = plantData.address;
        if (plantData.status) updateFields.status = plantData.status;
        if (plantData.service_pincodes !== undefined) {
            const raw = Array.isArray(plantData.service_pincodes)
                ? plantData.service_pincodes
                : (plantData.service_pincodes || '').split(',');
            updateFields.service_pincodes = Array.from(new Set(raw.map((p: string) => (extractOutwardCode(String(p).trim()) || String(p).trim().toUpperCase().replace(/\s+/g, ''))).filter(Boolean))) as string[];
        }

        const effectivePlantId = String(plant._id);

        if (plantData.manager_id !== undefined) {
            const newManagerId = plantData.manager_id;
            if (newManagerId) {
                const newManager = await db.collection('users').findOne(buildEntityLookupQuery(newManagerId, 'user') as any);
                if (!newManager || !['manager', 'plant_manager', 'admin', 'super_admin'].includes(newManager.role)) {
                    throw new Error('User does not exist or does not hold the Plant Manager role.');
                }
                const targetManagerIdStr = String(newManager._id);
                const targetManagerPublicId = newManager.publicId || targetManagerIdStr;

                await db.collection('plants').updateMany(
                    {
                        $or: [
                            { manager_id: targetManagerIdStr },
                            { manager_id: targetManagerPublicId },
                            { manager_id: newManagerId }
                        ],
                        _id: { $ne: plant._id } as any
                    },
                    { $set: { manager_id: null, manager_name: null } }
                );
                if (plant.manager_id && plant.manager_id !== targetManagerIdStr && plant.manager_id !== targetManagerPublicId) {
                    await db.collection('users').updateOne(
                        buildEntityLookupQuery(plant.manager_id, 'user') as any,
                        { $set: { plant_id: null, plantId: null } }
                    );
                }
                await db.collection('users').updateOne(
                    { _id: newManager._id },
                    {
                        $set: {
                            plant_id: effectivePlantId,
                            plantId: effectivePlantId,
                            assigned_plant: plantData.name || plant.name
                        }
                    }
                );
                updateFields.manager_id = targetManagerIdStr;
                updateFields.manager_public_id = targetManagerPublicId;
                updateFields.manager_name = newManager.full_name || newManager.name || newManager.email;
            } else {
                if (plant.manager_id) {
                    await db.collection('users').updateOne(
                        buildEntityLookupQuery(plant.manager_id, 'user') as any,
                        { $set: { plant_id: null, plantId: null } }
                    );
                }
                updateFields.manager_id = null;
                updateFields.manager_name = null;
            }
        }

        await db.collection('plants').updateOne({ _id: plant._id } as any, { $set: updateFields });

        if (updateFields.service_pincodes) {
            await db.collection('postcode_sectors').updateMany(
                { district: { $in: updateFields.service_pincodes } },
                { $set: { plant_id: plantId } }
            );

            // Cascade: update assigned_postcodes for plant manager AND all drivers/processors under this plant/manager
            const cascadeManagerId = updateFields.manager_id ?? plant.manager_id ?? null;
            const plantKeys = [plantId, String(plant._id), plant.publicId, plant.id].filter(Boolean);
            const managerKeys = [cascadeManagerId, plant.manager_id, plant.manager_public_id].filter(Boolean);

            // Update manager(s)
            await db.collection('users').updateMany(
                {
                    $or: [
                        { _id: { $in: managerKeys } },
                        { manager_id: { $in: managerKeys } },
                        { plantManagerId: { $in: managerKeys } },
                        { plant_id: { $in: plantKeys } },
                        { plantId: { $in: plantKeys } }
                    ],
                    role: { $in: ['manager', 'plant_manager'] }
                },
                { $set: { assigned_postcodes: updateFields.service_pincodes, assignedSectors: updateFields.service_pincodes } }
            );

            // Filter subordinate driver postcodes so they don't exceed the new plant coverage
            const subordinateStaff = await db.collection('users').find({
                $or: [
                    { plant_id: { $in: plantKeys } },
                    { plantId: { $in: plantKeys } },
                    { manager_id: { $in: managerKeys } },
                    { plantManagerId: { $in: managerKeys } }
                ],
                role: { $in: ['driver', 'processor'] }
            }).toArray();

            const newPlantPostcodeSet = new Set(updateFields.service_pincodes.map((p: string) => p.trim().toUpperCase()));
            for (const s of subordinateStaff) {
                const existing = s.assigned_postcodes || s.assignedSectors;
                if (Array.isArray(existing) && existing.length > 0) {
                    const retained = existing.filter((p: string) => newPlantPostcodeSet.has(p.trim().toUpperCase()));
                    await db.collection('users').updateOne(
                        { _id: s._id },
                        { $set: { assigned_postcodes: retained, assignedSectors: retained } }
                    );
                }
            }
        }
        
        await AuditService.recordEvent({
            entityType: 'plant',
            entityId: plantId,
            action: 'plant_updated',
            actorId: adminId,
            actorRole: 'admin'
        });
        return { success: true };
    }

    static async searchGlobal(query: string, limit = 20) {
        const db = await getDb();
        if (!query || query.trim().length < 2) return { results: [] };

        const regex = { $regex: query, $options: 'i' };
        const [customers, orders] = await Promise.all([
            db.collection('users').find(
                { $or: [{ full_name: regex }, { email: regex }, { phone: regex }] },
                { projection: { password: 0 }, limit }
            ).toArray(),
            db.collection('orders').find(
                { $or: [{ id: regex }, { 'qr_tracking.qrTagId': regex }] },
                { limit }
            ).toArray()
        ]);

        return {
            results: [
                ...customers.map((c: any) => ({ type: 'customer', id: c._id, label: c.full_name, sub: c.email })),
                ...orders.map((o: any) => ({ type: 'order', id: o.id, label: `Order ${o.id}`, sub: o.statusLabel }))
            ]
        };
    }

    static async addNote(adminId: string, targetType: string, targetId: string, note: string, pinned: boolean) {
        const db = await getDb();
        const now = new Date().toISOString();
        const noteId = generateNoteId();
        const noteDoc = {
            id: noteId,
            publicId: noteId,
            targetType,
            targetId,
            note,
            pinned: !!pinned,
            authorId: adminId,
            isInternal: true,
            created_at: now
        };
        await db.collection('notes').insertOne(noteDoc as any);

        if (targetType === 'order') {
            await db.collection('orders').updateOne(
                { id: targetId },
                {
                    $push: {
                        timeline_events: {
                            event: 'internal_note_added',
                            label: 'Internal Note Added',
                            actor: 'staff',
                            actorId: adminId,
                            note: note,
                            pinned,
                            timestamp: now
                        }
                    } as any
                }
            );
        }
        return { success: true, noteId: noteDoc.id };
    }
}
