import { getDb } from '@/lib/mongodb';
import { ObjectId } from 'mongodb';
import { NotFoundError, BadRequestError } from '@/lib/api';
import { generateAddressId } from '@laundelle/ids';

export class UserService {
    
    public static buildUserFilter(userId: string) {
        const queries: any[] = [
            { _id: userId as any },
            { id: userId },
            { customerId: userId },
            { publicId: userId },
            { auth0_sub: userId },
            { auth0UserId: userId }
        ];
        if (typeof userId === 'string' && userId.includes('@')) {
            queries.push({ email: userId.toLowerCase().trim() });
        }
        if (typeof userId === 'string' && ObjectId.isValid(userId)) {
            try {
                queries.push({ _id: new ObjectId(userId) as any });
            } catch {}
        }
        return { $or: queries };
    }

    static async getProfile(userId: string) {
        const db = await getDb();
        const user = await db.collection('users').findOne(this.buildUserFilter(userId));
        
        if (!user) {
            throw new NotFoundError('User not found.');
        }

        let plantName = '';
        let plantId = user.plant_id || user.plantId || null;
        if (plantId) {
            const plant = await db.collection('plants').findOne({
                $or: [
                    { _id: plantId as any },
                    { id: plantId },
                    { publicId: plantId },
                    { code: plantId },
                    ...(ObjectId.isValid(plantId) ? [{ _id: new ObjectId(plantId) }] : [])
                ]
            } as any);
            if (plant) {
                plantName = plant.name;
                plantId = plant.publicId || plant.id || String(plant._id);
            }
        } else if (user.manager_id || user.plantManagerId) {
            const mgrId = user.manager_id || user.plantManagerId;
            const plant = await db.collection('plants').findOne({
                $or: [
                    { manager_id: mgrId },
                    ...(ObjectId.isValid(mgrId) ? [{ manager_id: new ObjectId(mgrId) }] : [])
                ]
            });
            if (plant) {
                plantName = plant.name;
                plantId = plant.publicId || plant.id || String(plant._id);
            }
        }

        // Never expose password or internal secrets
        return {
            id: user._id,
            _id: user._id,
            name: user.full_name,
            fullName: user.full_name,
            email: user.email,
            phone: user.phone || '',
            avatar: user.avatar_url || '',
            employeeNumber: user.employee_number || user.employeeNumber || `EMP-${String(user._id).substring(String(user._id).length - 4).toUpperCase()}`,
            walletBalance: user.wallet_balance || 0,
            rewardPoints: user.reward_points || 0,
            addresses: user.addresses || [],
            preferences: user.preferences || {},
            customerStatus: user.customer_status || 'new',
            activeSubscription: user.activeSubscription || null,
            recurringSchedules: user.recurringSchedules || [],
            role: user.role,
            plant_id: plantId,
            plantId: plantId,
            plantName: plantName || user.plant_name || user.plantName || '',
            plant_name: plantName || user.plant_name || user.plantName || '',
            manager_id: user.manager_id || user.plantManagerId || null,
            plantManagerId: user.plantManagerId || user.manager_id || null,
            vehicle: user.vehicle || '',
            vehicle_type: user.vehicle_type || '',
            vehicle_reg: user.vehicle_reg || '',
            license_number: user.license_number || '',
            emergency_contact: user.emergency_contact || null,
            assigned_postcodes: user.assigned_postcodes || user.assignedSectors || [],
            created_at: user.created_at || null,
        };
    }

    static async updateProfile(userId: string, body: any) {
        const { name, phone } = body;
        const db = await getDb();
        const now = new Date().toISOString();
        
        const updateData: any = { updated_at: now };
        if (name !== undefined) updateData.full_name = name;
        if (phone !== undefined) updateData.phone = phone;

        await db.collection('users').updateOne(
            this.buildUserFilter(userId),
            { $set: updateData }
        );

        return this.getProfile(userId);
    }
    
    static async updatePreferences(userId: string, body: any) {
        const { preferences } = body;
        const db = await getDb();
        const now = new Date().toISOString();

        await db.collection('users').updateOne(
            this.buildUserFilter(userId),
            { 
                $set: { 
                    preferences, 
                    updated_at: now 
                } 
            }
        );

        return { success: true };
    }

    static async addAddress(userId: string, address: any) {
        const db = await getDb();
        if (!address?.street) throw new BadRequestError('Address is required.');
        
        const addrId = address.publicId || address.id || generateAddressId();
        const addr = { ...address, id: addrId, publicId: addrId };
        
        if (addr.isDefault) {
            await db.collection('users').updateOne(this.buildUserFilter(userId), { $set: { 'addresses.$[].isDefault': false } });
        }
        await db.collection('users').updateOne(this.buildUserFilter(userId), { $push: { addresses: addr } } as any);
        return { success: true, address: addr };
    }

    static async updateAddress(userId: string, addressId: string, addressUpdates: any) {
        const db = await getDb();
        const address = { ...addressUpdates, id: addressId };
        
        if (address.isDefault) {
            await db.collection('users').updateOne(this.buildUserFilter(userId), { $set: { 'addresses.$[].isDefault': false } } as any);
        }
        
        const result = await db.collection('users').updateOne(
            { ...this.buildUserFilter(userId), 'addresses.id': addressId },
            { $set: { 'addresses.$': address } } as any
        );

        if (result.matchedCount === 0) {
            throw new NotFoundError('Address not found or you do not have permission.');
        }

        return { success: true };
    }

    static async deleteAddress(userId: string, addressId: string) {
        const db = await getDb();
        const result = await db.collection('users').updateOne(
            this.buildUserFilter(userId),
            { $pull: { addresses: { id: addressId } } } as any
        );
        
        if (result.modifiedCount === 0) {
             throw new NotFoundError('Address not found or you do not have permission.');
        }
        
        return { success: true };
    }
}
