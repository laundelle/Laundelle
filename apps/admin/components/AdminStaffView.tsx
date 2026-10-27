import React, { useState, useEffect } from 'react';
import { Users, Mail, Phone, Plus, X, Lock, RefreshCw, Edit, MapPin, Eye, ShieldCheck, Calendar, Search, Copy, Check, ExternalLink, Trash2, AlertTriangle } from 'lucide-react';
import { dbFetchStaff, dbCreateStaffMember, dbUpdateStaffMember, dbDeleteStaffMember, dbFetchPlants, dbFetchManagers, dbFetchManagerDetails, dbAdminFetchOrders } from '@laundelle/api-client';

export const AdminStaffView: React.FC = () => {
  const [staff, setStaff] = useState<any[]>([]);
  const [plants, setPlants] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [plantFilter, setPlantFilter] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<any | null>(null);
  const [viewingStaff, setViewingStaff] = useState<any | null>(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [invitationModalOpen, setInvitationModalOpen] = useState(false);
  const [createdStaffInvite, setCreatedStaffInvite] = useState<{
    name: string;
    email: string;
    role: string;
    ticketUrl: string;
  } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Deletion confirmation state
  const [deleteConfirmStaff, setDeleteConfirmStaff] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);


  // New admin member form state
  const parsePhone = (raw?: string) => {
    if (!raw) return { code: '+44', num: '' };
    const match = raw.match(/^(\+\d{1,4})\s*(.*)$/);
    if (match) return { code: match[1], num: match[2].trim() };
    return { code: '+44', num: raw.replace(/^\+44/, '').trim() };
  };

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phoneCountryCode, setPhoneCountryCode] = useState('+44');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('manager');
  const [plantId, setPlantId] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [assignedPostcodes, setAssignedPostcodes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Manager-based inheritance (for driver/processor creation)
  const [managers, setManagers] = useState<any[]>([]);
  const [selectedManagerId, setSelectedManagerId] = useState('');
  const [managerPlantPreview, setManagerPlantPreview] = useState<{ plantName: string; postcodes: string[] } | null>(null);
  const [loadingManagerPreview, setLoadingManagerPreview] = useState(false);
  const [selectedDriverPostcodes, setSelectedDriverPostcodes] = useState<string[]>([]);

  // Driver fields
  const [vehicleType, setVehicleType] = useState('Van');
  const [vehicleReg, setVehicleReg] = useState('');
  const [licenseNum, setLicenseNum] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhoneCountryCode, setEmergencyPhoneCountryCode] = useState('+44');
  const [emergencyPhone, setEmergencyPhone] = useState('');


  const loadStaff = async () => {
    setLoading(true);
    const [dbStaff, dbOrders, dbPlants] = await Promise.all([
      dbFetchStaff(),
      dbAdminFetchOrders(),
      dbFetchPlants()
    ]);
    const safePlants = Array.isArray(dbPlants) ? dbPlants : ((dbPlants as any)?.plants || []);
    setPlants(safePlants);
    setOrders(dbOrders || []);

    const roleLabels: Record<string, string> = {
      super_admin: 'Super Admin',
      admin: 'Administrator',
      manager: 'PLANT MANAGER',
      driver: 'DRIVER',
      processor: 'PROCESSOR',
    };

    const validStaffRoles = ['super_admin', 'admin', 'manager', 'plant_manager', 'driver', 'processor'];

    const mapped = (dbStaff || [])
      .filter((u: any) => {
        const r = (u.role || '').toLowerCase();
        if (!r || r === 'customer' || r === 'user' || r === 'guest') return false;
        if (u.customerId && !u.staffId) return false;
        if (String(u.id || u.publicId || '').startsWith('CUST-') && !u.staffId) return false;
        return validStaffRoles.includes(r);
      })
      .map((u: any): any => {
      const uId = String(u._id || u.id || '');
      const uEmail = String(u.email || '').toLowerCase();
      const uEmp = String(u.employee_number || u.employeeNumber || '');
      const directPlantId = u.plant_id || u.plantId || '';
      const matchedPlant = safePlants.find((p: any) =>
        (directPlantId && (String(p._id) === String(directPlantId) || p.code === directPlantId || p.id === directPlantId)) ||
        (p.manager_id && String(p.manager_id) === uId) ||
        (p.manager_public_id && uEmp && String(p.manager_public_id) === uEmp) ||
        (p.manager_email && uEmail && String(p.manager_email).toLowerCase() === uEmail)
      );

      const resolvedPlantId = matchedPlant ? String(matchedPlant._id) : (directPlantId ? String(directPlantId) : '');
      const resolvedPlantName = matchedPlant ? `${matchedPlant.name} (${matchedPlant.code})` : '';

      return {
        id: u._id,
        userId: u._id,
        employeeNumber: u.employee_number || u.employeeNumber || `EMP-${u._id.substring(u._id.length - 4).toUpperCase()}`,
        fullName: u.full_name || u.name || 'Anonymous Staff',
        email: u.email,
        phone: u.phone || '+44 7700 900505',
        role: u.role,
        roleLabel: roleLabels[u.role] || (u.role ? u.role.toUpperCase() : 'Staff'),
        status: u.is_active ? 'active' : 'suspended',
        isActive: u.is_active !== false,
        plantId: resolvedPlantId,
        plantName: resolvedPlantName,
        assigned_postcodes: u.assigned_postcodes || u.assignedSectors || (matchedPlant?.service_pincodes || []),
        vehicle: u.vehicle || '',
        vehicleType: u.vehicle_type || u.vehicleType || 'Van',
        vehicleReg: u.vehicle_reg || u.vehicleReg || '',
        licenseNum: u.license_number || u.licenseNum || '',
        emergencyContact: u.emergency_contact || (u.emergencyName || u.emergencyPhone ? { name: u.emergencyName || '', phone: u.emergencyPhone || '' } : null),
        hireDate: u.created_at ? u.created_at.split('T')[0] : '2025-01-01',
        primaryLocation: matchedPlant ? `${matchedPlant.name} (${matchedPlant.code})` : (u.primaryLocation || 'Preston Operations Hub'),
        avatarUrl: u.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=200',
        activeJobsCount: 0
      };
    });

    setStaff(mapped);
    setLoading(false);
  };

  const loadPlants = async () => {
    const dbPlants = await dbFetchPlants();
    setPlants(dbPlants);
    const dbManagers = await dbFetchManagers();
    setManagers(dbManagers);
  };

  const handleManagerSelect = async (managerId: string) => {
    setSelectedManagerId(managerId);
    setManagerPlantPreview(null);
    setSelectedDriverPostcodes([]);
    if (!managerId) return;
    setLoadingManagerPreview(true);
    try {
      const details = await dbFetchManagerDetails(managerId);
      if (details?.plant) {
        const codes = details.inheritedPostcodes || details.plant.service_pincodes || [];
        setManagerPlantPreview({
          plantName: `${details.plant.name} (${details.plant.code})`,
          postcodes: codes
        });
        setSelectedDriverPostcodes(codes);
      }
    } catch {
      // Preview unavailable — not critical
    } finally {
      setLoadingManagerPreview(false);
    }
  };

  useEffect(() => {
    loadStaff();
    loadPlants();
  }, []);

  const openAddModal = () => {
    setEditingStaff(null);
    setFullName('');
    setEmail('');
    setPhoneCountryCode('+44');
    setPhone('');
    setRole('manager');
    setPlantId('');
    setAssignedPostcodes('');
    setIsActive(true);
    setVehicleType('Van');
    setVehicleReg('');
    setLicenseNum('');
    setEmergencyName('');
    setEmergencyPhoneCountryCode('+44');
    setEmergencyPhone('');
    setSelectedManagerId('');
    setManagerPlantPreview(null);
    setSelectedDriverPostcodes([]);
    setModalOpen(true);
  };

  const openEditModal = (stf: any) => {
    setEditingStaff(stf);
    setFullName(stf.fullName);
    setEmail(stf.email);
    const parsedP = parsePhone(stf.phone);
    setPhoneCountryCode(parsedP.code);
    setPhone(parsedP.num);
    setRole(stf.role);
    const matchedP = plants.find(p => 
      (stf.plantId && (String(p._id) === String(stf.plantId) || p.code === stf.plantId)) ||
      (p.manager_id && String(p.manager_id) === String(stf.id || stf.userId)) ||
      (p.manager_email && stf.email && String(p.manager_email).toLowerCase() === String(stf.email).toLowerCase())
    );
    setPlantId(stf.plantId || (matchedP ? String(matchedP._id) : ''));
    setAssignedPostcodes((stf.assigned_postcodes || []).join(', '));
    setSelectedDriverPostcodes(stf.assigned_postcodes || []);
    setIsActive(stf.isActive);
    setVehicleType(stf.vehicleType || 'Van');
    setVehicleReg(stf.vehicleReg || '');
    setLicenseNum(stf.licenseNum || '');
    setEmergencyName(stf.emergencyContact?.name || '');
    const parsedEP = parsePhone(stf.emergencyContact?.phone);
    setEmergencyPhoneCountryCode(parsedEP.code);
    setEmergencyPhone(parsedEP.num);
    if (['driver', 'processor'].includes(stf.role)) {
      const curManagerId = stf.manager_id || stf.plantManagerId || '';
      setSelectedManagerId(curManagerId);
      if (curManagerId) {
        handleManagerSelect(curManagerId);
      }
    } else {
      setSelectedManagerId('');
      setManagerPlantPreview(null);
    }
    setModalOpen(true);
  };

  const handleDeleteStaff = async (staffMember: any) => {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const res = await dbDeleteStaffMember(staffMember.id || staffMember.userId);
      if (res.success) {
        setDeleteConfirmStaff(null);
        if (detailsModalOpen && viewingStaff?.id === staffMember.id) {
          setDetailsModalOpen(false);
        }
        await loadStaff();
      } else {
        setDeleteError(res.error || 'Failed to delete staff member.');
      }
    } catch (e: any) {
      setDeleteError(e.message || 'An unexpected error occurred while deleting staff.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCreateOrUpdateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    if (role === 'driver') {
      if (!vehicleReg.trim()) {
        alert('Vehicle Registration Number is required for delivery drivers.');
        setSubmitting(false);
        return;
      }
      if (!editingStaff && !selectedManagerId) {
        alert('Please select a Plant Manager for this driver.');
        setSubmitting(false);
        return;
      }
      if (!editingStaff && managerPlantPreview && managerPlantPreview.postcodes.length > 0 && selectedDriverPostcodes.length === 0) {
        alert("Please assign at least one pincode for this driver from the manager's plant.");
        setSubmitting(false);
        return;
      }
    }

    if (role === 'processor') {
      if (!editingStaff && !selectedManagerId) {
        alert('Please select a Plant Manager for this processor. Postcodes will be auto-inherited from their plant.');
        setSubmitting(false);
        return;
      }
    }

    if (role === 'manager' && !plantId) {
      // manager requires a plant — OK to leave empty (warning only)
    }

    const fullPhone = phone.trim() ? `${phoneCountryCode} ${phone.trim().replace(/^0/, '')}`.trim() : '';
    const staffData: any = {
      name: fullName,
      full_name: fullName,
      email,
      phone: fullPhone,
      role,
      is_active: isActive,
    };

    if (['driver', 'processor'].includes(role)) {
      // For driver/processor: send manager_id; backend resolves plant + postcodes
      if (selectedManagerId) {
        staffData.manager_id = selectedManagerId;
        staffData.plantManagerId = selectedManagerId;
      }
      // Driver-specific
      if (role === 'driver') {
        staffData.vehicle_type = vehicleType;
        staffData.vehicle_reg = vehicleReg.trim().toUpperCase();
        staffData.license_number = licenseNum.trim();
        const fullEmergPhone = emergencyPhone.trim() ? `${emergencyPhoneCountryCode} ${emergencyPhone.trim().replace(/^0/, '')}`.trim() : '';
        staffData.emergency_contact = { name: emergencyName.trim(), phone: fullEmergPhone };
        staffData.vehicle = `${vehicleType} - ${vehicleReg.trim().toUpperCase()}`;
        if (selectedDriverPostcodes.length > 0) {
          staffData.assigned_postcodes = selectedDriverPostcodes;
          staffData.assignedSectors = selectedDriverPostcodes;
        }
      }
    } else if (role === 'manager') {
      staffData.plant_id = plantId || null;
      staffData.plantId = plantId || null;
    }
    // admin/super_admin: no plant or postcode fields

    let res;
    if (editingStaff) {
      res = await dbUpdateStaffMember(editingStaff.id, staffData);
    } else {
      res = await dbCreateStaffMember(staffData);
    }
    setSubmitting(false);

    if (res.success) {
      setModalOpen(false);
      loadStaff();
      loadPlants();

      if (!editingStaff && res.ticketUrl) {
        setCreatedStaffInvite({
          name: fullName,
          email,
          role,
          ticketUrl: res.ticketUrl,
        });
        setCopiedLink(false);
        setInvitationModalOpen(true);
      } else {
        alert(
          editingStaff
            ? '✓ Staff member updated successfully!'
            : '✓ User created successfully. An onboarding invitation has been generated.'
        );
      }
    } else {
      const displayError = typeof res.error === 'string' && !res.error.includes('{')
        ? res.error
        : 'Failed to save staff member. Please verify input details and try again.';
      alert(`Error saving staff member: ${displayError}`);
    }
  };

  const filteredStaff = staff.filter(s => {
    const sRole = (s.role || '').toLowerCase();
    const matchesRole =
      roleFilter === 'all' ||
      sRole === roleFilter ||
      (roleFilter === 'manager' && (sRole === 'manager' || sRole === 'plant_manager')) ||
      (roleFilter === 'admin' && (sRole === 'admin' || sRole === 'super_admin')) ||
      (roleFilter === 'driver' && sRole === 'driver') ||
      (roleFilter === 'processor' && sRole === 'processor');

    const isActuallyActive = s.isActive !== false && s.status !== 'suspended' && s.status !== 'inactive';
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && isActuallyActive) ||
      (statusFilter === 'suspended' && !isActuallyActive);

    const matchesPlant =
      plantFilter === 'all' ||
      String(s.plantId) === String(plantFilter) ||
      (s.plant && String(s.plant._id || s.plant.id) === String(plantFilter)) ||
      plants.some(p => String(p._id) === String(plantFilter) && (String(p._id) === String(s.plantId) || p.code === s.plantId || p.id === s.plantId));

    const q = searchQuery.toLowerCase().trim();
    const pcList = Array.isArray(s.assigned_postcodes) ? s.assigned_postcodes.join(' ').toLowerCase() : '';
    const matchesQuery = !q || (
      (s.fullName || '').toLowerCase().includes(q) ||
      (s.email || '').toLowerCase().includes(q) ||
      (s.phone || '').includes(q) ||
      (s.employeeNumber || '').toLowerCase().includes(q) ||
      (s.vehicle || '').toLowerCase().includes(q) ||
      (s.roleLabel || '').toLowerCase().includes(q) ||
      (s.plantName || '').toLowerCase().includes(q) ||
      pcList.includes(q)
    );

    return matchesRole && matchesStatus && matchesPlant && matchesQuery;
  });

  const getPlantName = (pId: string, staffMember?: any) => {
    if (staffMember?.plantName) return staffMember.plantName;
    if (pId) {
      const found = plants.find(p => String(p._id) === String(pId) || p.code === pId || p.id === pId);
      if (found) return `${found.name} (${found.code})`;
    }
    if (staffMember) {
      const uId = String(staffMember.id || staffMember.userId || '');
      const uEmail = String(staffMember.email || '').toLowerCase();
      const uEmp = String(staffMember.employeeNumber || '');
      const found = plants.find(p =>
        (p.manager_id && String(p.manager_id) === uId) ||
        (p.manager_public_id && uEmp && String(p.manager_public_id) === uEmp) ||
        (p.manager_email && uEmail && String(p.manager_email).toLowerCase() === uEmail)
      );
      if (found) return `${found.name} (${found.code})`;
    }
    return pId || 'Unassigned';
  };

  return (
    <div className="w-full space-y-4 md:space-y-5 p-4 sm:p-8 pb-20 md:pb-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">Staff Accounts</h1>
          <p className="text-xs text-slate-500 mt-0.5">Manage plant managers, drivers, processors, and staff permissions.</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { loadStaff(); loadPlants(); }}
            disabled={loading}
            className="px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
            title="Refresh Staff & Plant Managers"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-blue-600 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh Staff</span>
          </button>
          <button
            onClick={openAddModal}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-2xs cursor-pointer transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Staff</span>
          </button>
        </div>
      </div>

      {/* Role Filter Tabs */}
      <div className="bg-slate-100/70 p-1 rounded-xl flex items-center gap-1 overflow-x-auto w-fit">
        {[
          { id: 'all', label: 'All Staff' },
          { id: 'manager', label: 'Plant Managers' },
          { id: 'driver', label: 'Drivers' },
          { id: 'processor', label: 'Processors' },
          { id: 'admin', label: 'Administrators' },
        ].map((r) => (
          <button
            key={r.id}
            onClick={() => setRoleFilter(r.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
              roleFilter === r.id ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Search & Extra Filters Bar */}
      <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-100 flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full md:w-auto flex-1">
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by name, email, EMP #..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 bg-slate-50 border border-slate-200/70 rounded-xl text-xs font-medium focus:bg-white focus:border-blue-500 focus:outline-hidden"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full sm:w-auto px-3 py-2 bg-slate-50 border border-slate-200/70 rounded-xl text-xs font-medium text-slate-700 focus:bg-white focus:border-blue-500 focus:outline-hidden cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="suspended">Suspended Only</option>
          </select>

          <select
            value={plantFilter}
            onChange={(e) => setPlantFilter(e.target.value)}
            className="w-full sm:w-auto px-3 py-2 bg-slate-50 border border-slate-200/70 rounded-xl text-xs font-medium text-slate-700 focus:bg-white focus:border-blue-500 focus:outline-hidden cursor-pointer"
          >
            <option value="all">All Facilities</option>
            {plants.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name} ({p.code})
              </option>
            ))}
          </select>

          {(searchQuery || roleFilter !== 'all' || statusFilter !== 'all' || plantFilter !== 'all') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setRoleFilter('all');
                setStatusFilter('all');
                setPlantFilter('all');
              }}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer whitespace-nowrap"
            >
              Reset Filters
            </button>
          )}
        </div>

        <div className="text-xs text-slate-500 font-medium self-end md:self-auto">
          Showing <span className="text-slate-900 font-bold">{filteredStaff.length}</span> staff members
        </div>
      </div>

      {loading ? (
        <div className="text-center py-16 text-xs text-slate-400 font-medium space-y-2">
          <RefreshCw className="w-5 h-5 text-blue-600 animate-spin mx-auto" />
          <p>Syncing staff records...</p>
        </div>
      ) : (
        /* Staff Box - Fixed Sized with Vertical Scroll */
        <div className="w-full bg-white rounded-2xl shadow-xs border border-slate-100 overflow-hidden flex flex-col h-[calc(100vh-270px)] min-h-[460px]">
          <div className="flex-1 overflow-y-auto overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Staff Member</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Operational Assignment</th>
                  <th className="py-3 px-4">Contact Details</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStaff.map((stf) => (
                  <tr
                    key={stf.id}
                    onClick={() => {
                      setViewingStaff(stf);
                      setDetailsModalOpen(true);
                    }}
                    className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                  >
                    <td className="py-3 px-4 flex items-center gap-3">
                      <img
                        src={stf.avatarUrl}
                        alt={stf.fullName}
                        className="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0"
                      />
                      <div>
                        <h4 className="font-semibold text-xs text-slate-900 group-hover:text-blue-600 transition-colors">
                          {stf.fullName}
                        </h4>
                        <span className="text-[10px] font-medium text-slate-400 font-mono block">
                          {stf.employeeNumber}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wider uppercase ${
                          stf.role === 'manager' || stf.role === 'plant_manager'
                            ? 'bg-amber-50 text-amber-700 border border-amber-100/60'
                            : stf.role === 'driver'
                            ? 'bg-blue-50 text-blue-700 border border-blue-100/60'
                            : stf.role === 'processor'
                            ? 'bg-purple-50 text-purple-700 border border-purple-100/60'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {stf.roleLabel}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {stf.role === 'manager' || stf.role === 'plant_manager' || stf.role === 'processor' ? (
                        <div className="flex items-center gap-1.5 text-xs text-slate-700">
                          <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span className="font-medium">{getPlantName(stf.plantId, stf)}</span>
                        </div>
                      ) : stf.role === 'driver' && stf.assigned_postcodes?.length > 0 ? (
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {stf.assigned_postcodes.map((pc: string) => (
                            <span
                              key={pc}
                              className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-medium font-mono"
                            >
                              {pc}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-400 font-medium">Headquarters Hub</span>
                      )}
                    </td>
                    <td className="py-3 px-4 space-y-0.5 text-xs">
                      <p className="flex items-center gap-1.5 font-medium text-slate-600">
                        <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{stf.email}</span>
                      </p>
                      <p className="flex items-center gap-1.5 font-medium text-slate-600">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{stf.phone}</span>
                      </p>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          stf.isActive
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-100/60'
                            : 'bg-red-50 text-red-700 border border-red-100/60'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            stf.isActive ? 'bg-emerald-500' : 'bg-red-500'
                          }`}
                        />
                        {stf.isActive ? 'active' : 'suspended'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setViewingStaff(stf);
                            setDetailsModalOpen(true);
                          }}
                          className="px-3 py-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-medium transition-all cursor-pointer inline-flex items-center gap-1 shadow-2xs group-hover:border-slate-300"
                        >
                          <Eye className="w-3.5 h-3.5 text-blue-600" />
                          <span>View</span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditModal(stf);
                          }}
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all cursor-pointer"
                          title="Edit Staff Member"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteError(null);
                            setDeleteConfirmStaff(stf);
                          }}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all cursor-pointer"
                          title="Delete Staff Member from MongoDB & Auth0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Staff Details Modal */}
      {detailsModalOpen && viewingStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 sm:p-6 animate-in fade-in">
          <div className="bg-white w-full max-w-xl rounded-3xl p-6 sm:p-8 shadow-2xl border border-gray-100 space-y-6 relative">
            <div className="flex items-start justify-between pb-4 border-b border-gray-100">
              <div className="flex items-center gap-4">
                <img
                  src={viewingStaff.avatarUrl}
                  alt={viewingStaff.fullName}
                  className="w-16 h-16 rounded-2xl object-cover border-2 border-[#00B4D8] shadow-sm shrink-0"
                />
                <div>
                  <div className="flex items-center gap-2.5">
                    <h3 className="text-xl font-heading font-extrabold text-[#03045E]">
                      {viewingStaff.fullName}
                    </h3>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                        viewingStaff.isActive
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-red-50 text-red-600 border border-red-200'
                      }`}
                    >
                      {viewingStaff.isActive ? 'Active' : 'Suspended'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 font-mono font-bold mt-0.5">
                    ID: {viewingStaff.employeeNumber}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    await loadStaff();
                    setStaff(prev => {
                      const updated = prev.find(s => s.id === viewingStaff.id);
                      if (updated) setViewingStaff(updated);
                      return prev;
                    });
                  }}
                  disabled={loading}
                  className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-500 hover:text-[#0077B6] transition-colors cursor-pointer"
                  title="Refresh Staff Record"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#0077B6]' : ''}`} />
                </button>
                <button
                  onClick={() => setDetailsModalOpen(false)}
                  className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-500 hover:text-gray-800 transition-colors cursor-pointer"
                  title="Close Modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-100 space-y-1">
                <span className="text-[10px] font-bold text-gray-400 uppercase block">Role & Permissions</span>
                <span className="font-extrabold text-[#03045E] text-sm block">{viewingStaff.roleLabel}</span>
              </div>
              <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-100 space-y-1">
                <span className="text-[10px] font-bold text-gray-400 uppercase block">Hire / Record Date</span>
                <span className="font-extrabold text-gray-800 text-sm block">{viewingStaff.hireDate || '2025-01-01'}</span>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100 space-y-2">
                <span className="text-[10px] font-bold text-[#0077B6] uppercase tracking-wider block">Operational Assignment</span>
                {viewingStaff.role === 'manager' || viewingStaff.role === 'plant_manager' ? (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-[#E63946] shrink-0" />
                    <div>
                      <p className="font-bold text-[#03045E]">{getPlantName(viewingStaff.plantId)}</p>
                      <p className="text-[11px] text-gray-500">Assigned Operational Laundry Facility</p>
                    </div>
                  </div>
                ) : viewingStaff.role === 'processor' ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-[#E63946] shrink-0" />
                      <div>
                        <p className="font-bold text-[#03045E]">{getPlantName(viewingStaff.plantId)}</p>
                        <p className="text-[11px] text-gray-500">Assigned Plant Facility</p>
                      </div>
                    </div>
                  </div>

                ) : viewingStaff.role === 'driver' ? (
                  <div className="space-y-2.5">
                    {/* Vehicle & License Info */}
                    <div className="p-3 bg-white rounded-xl border border-blue-200 space-y-1.5">
                      <span className="text-[10px] font-bold text-gray-400 uppercase block">Vehicle Information</span>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-gray-700">Type & Reg:</span>
                        <span className="font-extrabold text-[#03045E] font-mono">
                          {viewingStaff.vehicle || `${viewingStaff.vehicleType || 'Vehicle'} - ${viewingStaff.vehicleReg || 'Unregistered'}`}
                        </span>
                      </div>
                      {viewingStaff.licenseNum && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-gray-700">License:</span>
                          <span className="font-extrabold text-gray-900 font-mono">{viewingStaff.licenseNum}</span>
                        </div>
                      )}
                    </div>

                    {/* Emergency Contact */}
                    {viewingStaff.emergencyContact?.name && (
                      <div className="p-3 bg-white rounded-xl border border-blue-200 text-xs">
                        <span className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Emergency Contact</span>
                        <p className="font-bold text-gray-800">{viewingStaff.emergencyContact.name}</p>
                        {viewingStaff.emergencyContact.phone && (
                          <p className="font-mono text-gray-600 mt-0.5">{viewingStaff.emergencyContact.phone}</p>
                        )}
                      </div>
                    )}

                    <div>
                      <p className="font-bold text-[#03045E] mb-1.5">Assigned Delivery Postcodes:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(viewingStaff.assigned_postcodes || []).length > 0 ? (
                          viewingStaff.assigned_postcodes.map((pc: string) => (
                            <span key={pc} className="px-2.5 py-1 bg-white font-mono font-bold text-[#0077B6] rounded-lg border border-blue-200 text-xs">
                              {pc}
                            </span>
                          ))
                        ) : (
                          <span className="text-gray-400 italic">No postcodes assigned</span>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="font-bold text-[#03045E]">Central Administrative Operations</p>
                )}
              </div>

              <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-2.5">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Contact Information</span>
                <p className="flex items-center gap-2 font-medium text-gray-800">
                  <Mail className="w-4 h-4 text-[#0077B6] shrink-0" />
                  <a href={`mailto:${viewingStaff.email}`} className="hover:underline">{viewingStaff.email}</a>
                </p>
                <p className="flex items-center gap-2 font-medium text-gray-800">
                  <Phone className="w-4 h-4 text-[#0077B6] shrink-0" />
                  <a href={`tel:${viewingStaff.phone}`} className="hover:underline">{viewingStaff.phone}</a>
                </p>
              </div>

              {/* Specific Role Details / Drilldown Section */}
              {(viewingStaff.role === 'manager' || viewingStaff.role === 'plant_manager') && (
                <div className="space-y-2 pt-2 border-t border-gray-100">
                  <h4 className="font-heading font-extrabold text-[#03045E] text-xs uppercase tracking-wider">
                    Staff Managed Under Facility ({staff.filter(s => String(s.plantId) === String(viewingStaff.plantId) && String(s.id) !== String(viewingStaff.id)).length})
                  </h4>
                  {staff.filter(s => String(s.plantId) === String(viewingStaff.plantId) && String(s.id) !== String(viewingStaff.id)).length === 0 ? (
                    <p className="text-xs text-gray-400 italic p-3 bg-gray-50 rounded-xl border border-gray-100">No personnel currently assigned under this manager's facility.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {staff.filter(s => String(s.plantId) === String(viewingStaff.plantId) && String(s.id) !== String(viewingStaff.id)).map(s => (
                        <div key={s.id} className="p-2.5 bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full ${s.role === 'driver' ? 'bg-[#0077B6]' : 'bg-purple-600'}`} />
                            <div>
                              <span className="font-bold text-gray-900 block">{s.fullName}</span>
                              <span className="text-[10px] text-gray-400">{s.phone} • {s.email}</span>
                            </div>
                          </div>
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-indigo-50 text-[#03045E] border border-indigo-100">
                            {s.role}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {viewingStaff.role === 'driver' && (
                <div className="space-y-2 pt-2 border-t border-gray-100">
                  <h4 className="font-heading font-extrabold text-[#03045E] text-xs uppercase tracking-wider">
                    Orders Served by {viewingStaff.fullName} ({orders.filter(o => String(o.assigned_driver_id || o.driver_id || o.driver?.id) === String(viewingStaff.id) || o.driver?.name?.toLowerCase() === viewingStaff.fullName?.toLowerCase()).length})
                  </h4>
                  {orders.filter(o => String(o.assigned_driver_id || o.driver_id || o.driver?.id) === String(viewingStaff.id) || o.driver?.name?.toLowerCase() === viewingStaff.fullName?.toLowerCase()).length === 0 ? (
                    <p className="text-xs text-gray-400 italic p-3 bg-gray-50 rounded-xl border border-gray-100">No orders served by this driver yet.</p>
                  ) : (
                    <div className="max-h-52 overflow-y-auto border border-gray-200 rounded-xl">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-gray-50 text-gray-500 font-bold uppercase text-[9px]">
                          <tr>
                            <th className="py-2.5 px-3">Order ID</th>
                            <th className="py-2.5 px-3">Customer</th>
                            <th className="py-2.5 px-3">Status</th>
                            <th className="py-2.5 px-3 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {orders.filter(o => String(o.assigned_driver_id || o.driver_id || o.driver?.id) === String(viewingStaff.id) || o.driver?.name?.toLowerCase() === viewingStaff.fullName?.toLowerCase()).map(ord => (
                            <tr key={ord.id} className="hover:bg-gray-50">
                              <td className="py-2 px-3 font-mono font-bold text-[#03045E]">{ord.id}</td>
                              <td className="py-2 px-3 font-bold text-gray-900">{ord.customer_name || ord.customerName || ord.customer?.full_name || 'Customer'}</td>
                              <td className="py-2 px-3">
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-[#CAF0F8] text-[#03045E]">
                                  {ord.statusLabel || ord.status}
                                </span>
                              </td>
                              <td className="py-2 px-3 font-extrabold text-gray-900 text-right">£{ord.total?.toFixed ? ord.total.toFixed(2) : ord.total || '0.00'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {viewingStaff.role === 'processor' && (
                <div className="space-y-2 pt-2 border-t border-gray-100">
                  <h4 className="font-heading font-extrabold text-[#03045E] text-xs uppercase tracking-wider">
                    Orders Processed by {viewingStaff.fullName} ({orders.filter(o => String(o.assigned_processor_id || o.processor_id || o.processor?.id) === String(viewingStaff.id) || o.processor?.name?.toLowerCase() === viewingStaff.fullName?.toLowerCase()).length})
                  </h4>
                  {orders.filter(o => String(o.assigned_processor_id || o.processor_id || o.processor?.id) === String(viewingStaff.id) || o.processor?.name?.toLowerCase() === viewingStaff.fullName?.toLowerCase()).length === 0 ? (
                    <p className="text-xs text-gray-400 italic p-3 bg-gray-50 rounded-xl border border-gray-100">No orders processed by this operator yet.</p>
                  ) : (
                    <div className="max-h-52 overflow-y-auto border border-gray-200 rounded-xl">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-gray-50 text-gray-500 font-bold uppercase text-[9px]">
                          <tr>
                            <th className="py-2.5 px-3">Order ID</th>
                            <th className="py-2.5 px-3">Customer</th>
                            <th className="py-2.5 px-3">Stage</th>
                            <th className="py-2.5 px-3 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {orders.filter(o => String(o.assigned_processor_id || o.processor_id || o.processor?.id) === String(viewingStaff.id) || o.processor?.name?.toLowerCase() === viewingStaff.fullName?.toLowerCase()).map(ord => (
                            <tr key={ord.id} className="hover:bg-gray-50">
                              <td className="py-2 px-3 font-mono font-bold text-[#03045E]">{ord.id}</td>
                              <td className="py-2 px-3 font-bold text-gray-900">{ord.customer_name || ord.customerName || ord.customer?.full_name || 'Customer'}</td>
                              <td className="py-2 px-3">
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-purple-100 text-purple-900 uppercase">
                                  {ord.status || 'Processing'}
                                </span>
                              </td>
                              <td className="py-2 px-3 font-extrabold text-gray-900 text-right">£{ord.total?.toFixed ? ord.total.toFixed(2) : ord.total || '0.00'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>


            <div className="flex items-center justify-between gap-2.5 pt-2 border-t border-gray-100">
              <button
                onClick={() => {
                  setDeleteError(null);
                  setDeleteConfirmStaff(viewingStaff);
                }}
                className="px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Staff Member</span>
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDetailsModalOpen(false)}
                  className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    const target = viewingStaff;
                    setDetailsModalOpen(false);
                    openEditModal(target);
                  }}
                  className="px-5 py-2.5 bg-[#03045E] hover:bg-[#023E8A] text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
                >
                  <Edit className="w-3.5 h-3.5 text-[#48CAE4]" />
                  <span>Edit Staff Member</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Staff Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <form onSubmit={handleCreateOrUpdateStaff} className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4 relative">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-bold text-[#03045E] flex items-center gap-2">
                <Users className="w-5 h-5 text-[#00B4D8]" />
                <span>{editingStaff ? 'Edit Staff Member' : 'Add Staff Member'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 hover:bg-gray-100 rounded-full transition-colors cursor-pointer"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="w-full px-4 py-2.5 bg-gray-50 border rounded-xl font-semibold focus:ring-2 focus:ring-[#03045E] focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. john@laundelle.co.uk"
                  className="w-full px-4 py-2.5 bg-gray-50 border rounded-xl font-semibold focus:ring-2 focus:ring-[#03045E] focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Phone Number</label>
                <div className="flex gap-2">
                  <select
                    value={phoneCountryCode}
                    onChange={(e) => setPhoneCountryCode(e.target.value)}
                    className="w-24 px-2 py-2.5 bg-gray-50 border rounded-xl text-xs font-bold text-[#03045E] focus:ring-2 focus:ring-[#03045E] focus:outline-hidden cursor-pointer shrink-0"
                  >
                    <option value="+44">UK (+44)</option>
                    <option value="+1">US (+1)</option>
                    <option value="+91">IN (+91)</option>
                    <option value="+971">AE (+971)</option>
                    <option value="+61">AU (+61)</option>
                    <option value="+33">FR (+33)</option>
                    <option value="+49">DE (+49)</option>
                    <option value="+353">IE (+353)</option>
                  </select>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="7700 900505"
                    className="w-full px-4 py-2.5 bg-gray-50 border rounded-xl font-semibold focus:ring-2 focus:ring-[#03045E] focus:outline-hidden"
                  />
                </div>
              </div>

              {!editingStaff && (
                <div className="bg-blue-50/80 border border-blue-200/80 rounded-xl p-3 text-xs text-blue-900 flex items-start gap-2.5">
                  <Mail className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Password Setup via Auth0</p>
                    <p className="text-blue-700 mt-0.5 leading-relaxed">
                      An invitation email will be sent to the new user so they can set their password.
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Role</label>
                  <select
                    value={role}
                    onChange={(e) => {
                      setRole(e.target.value);
                      if (!['manager', 'driver', 'processor'].includes(e.target.value)) setPlantId('');
                    }}
                    className="w-full p-2.5 bg-gray-50 border rounded-xl font-semibold focus:ring-2 focus:ring-[#03045E] focus:outline-hidden cursor-pointer"
                  >
                    <option value="manager">Plant Manager</option>
                    <option value="driver">Driver</option>
                    <option value="processor">Processor</option>
                    <option value="admin">Administrator</option>
                    <option value="super_admin">Super Admin</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-gray-700 mb-1">Status</label>
                  <select
                    value={isActive ? 'active' : 'suspended'}
                    onChange={(e) => setIsActive(e.target.value === 'active')}
                    className="w-full p-2.5 bg-gray-50 border rounded-xl font-semibold focus:ring-2 focus:ring-[#03045E] focus:outline-hidden cursor-pointer"
                  >
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
              </div>

              {/* Plant Assignment — only for Manager role */}
              {(role === 'manager' || role === 'plant_manager') && (
                <div>
                  <label className="block font-bold text-gray-700 mb-1">
                    Assign Plant Location
                  </label>
                  <select
                    value={plantId}
                    onChange={(e) => setPlantId(e.target.value)}
                    className="w-full p-2.5 bg-gray-50 border rounded-xl font-semibold focus:ring-2 focus:ring-[#E63946] focus:outline-hidden cursor-pointer"
                  >
                    <option value="">-- Select Plant --</option>
                    {plants.map(p => (
                      <option key={p._id} value={p._id}>
                        {p.name} ({p.code})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Manager Selection — for Driver/Processor (postcodes auto-inherited) */}
              {['driver', 'processor'].includes(role) && (
                <div>
                  <label className="block font-bold text-gray-700 mb-1">
                    Select Plant Manager {!editingStaff && <span className="text-red-500">*</span>}
                  </label>
                  <select
                    value={selectedManagerId}
                    onChange={(e) => handleManagerSelect(e.target.value)}
                    required={!editingStaff}
                    className="w-full p-2.5 bg-gray-50 border rounded-xl font-semibold focus:ring-2 focus:ring-[#03045E] focus:outline-hidden cursor-pointer"
                  >
                    <option value="">-- Select Manager --</option>
                    {managers.map(m => (
                      <option key={m._id} value={m._id}>
                        {m.full_name || m.name} ({m.email})
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-gray-400 mt-1 font-medium">
                    Plant and postcodes are automatically inherited from the selected manager.
                  </p>

                  {/* Plant + Postcode Preview */}
                  {loadingManagerPreview && (
                    <div className="mt-2 p-3 bg-blue-50 rounded-xl border border-blue-100 text-xs text-[#0077B6] font-semibold animate-pulse">
                      Loading postcode preview...
                    </div>
                  )}
                  {managerPlantPreview && !loadingManagerPreview && (
                    <div className="mt-2 p-3.5 bg-blue-50/70 rounded-xl border border-blue-200/80 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-wider text-[#0077B6]">
                            Manager's Plant: {managerPlantPreview.plantName}
                          </p>
                          <p className="text-[10px] text-blue-700 font-medium">
                            {role === 'driver' ? 'Assign Driver Pincodes (Only pincodes under this manager)' : 'Inherited Plant Postcodes'}
                          </p>
                        </div>
                        {role === 'driver' && managerPlantPreview.postcodes.length > 0 && (
                          <div className="flex items-center gap-1.5 text-[10px] font-bold">
                            <button
                              type="button"
                              onClick={() => setSelectedDriverPostcodes([...managerPlantPreview.postcodes])}
                              className="text-[#0077B6] hover:underline cursor-pointer"
                            >
                              All
                            </button>
                            <span className="text-gray-300">|</span>
                            <button
                              type="button"
                              onClick={() => setSelectedDriverPostcodes([])}
                              className="text-gray-500 hover:underline cursor-pointer"
                            >
                              Clear
                            </button>
                          </div>
                        )}
                      </div>

                      {role === 'driver' ? (
                        <div>
                          {managerPlantPreview.postcodes.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {managerPlantPreview.postcodes.map((pc: string) => {
                                const isSelected = selectedDriverPostcodes.includes(pc);
                                return (
                                  <button
                                    key={pc}
                                    type="button"
                                    onClick={() => {
                                      if (isSelected) {
                                        setSelectedDriverPostcodes(selectedDriverPostcodes.filter(p => p !== pc));
                                      } else {
                                        setSelectedDriverPostcodes([...selectedDriverPostcodes, pc]);
                                      }
                                    }}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer border flex items-center gap-1.5 ${
                                      isSelected
                                        ? 'bg-[#0077B6] text-white border-[#0077B6] shadow-2xs'
                                        : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                                    }`}
                                  >
                                    <span>{pc}</span>
                                    {isSelected ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3 opacity-40" />}
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <span className="text-[10px] text-amber-700 italic bg-amber-50 p-2 rounded-lg border border-amber-200">
                              No postcodes configured for this manager's plant.
                            </span>
                          )}
                          {selectedDriverPostcodes.length > 0 && (
                            <p className="text-[10px] font-bold text-emerald-700 pt-1.5">
                              ✓ {selectedDriverPostcodes.length} pincode(s) selected: {selectedDriverPostcodes.join(', ')}
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {managerPlantPreview.postcodes.length > 0 ? (
                            managerPlantPreview.postcodes.map((pc: string) => (
                              <span
                                key={pc}
                                className="px-2 py-0.5 bg-white rounded-md border border-blue-200 text-[10px] font-mono font-bold text-[#0077B6]"
                              >
                                {pc}
                              </span>
                            ))
                          ) : (
                            <span className="text-[10px] text-gray-400 italic">No postcodes configured for this plant</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* When editing driver/processor: show read-only inherited postcodes */}
              {['driver', 'processor'].includes(role) && editingStaff && (
                <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100 space-y-1.5">
                  <p className="text-[10px] font-black uppercase tracking-wider text-[#0077B6]">
                    Inherited Postcodes (read-only)
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {(editingStaff.assigned_postcodes || []).length > 0 ? (
                      editingStaff.assigned_postcodes.map((pc: string) => (
                        <span
                          key={pc}
                          className="px-2 py-0.5 bg-white rounded-md border border-blue-200 text-[10px] font-mono font-bold text-[#0077B6]"
                        >
                          {pc}
                        </span>
                      ))
                    ) : (
                      <span className="text-[10px] text-gray-400 italic">Postcodes auto-synced from manager's plant</span>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-400 font-medium">
                    Postcodes are managed by the plant's service area — not editable here.
                  </p>
                </div>
              )}

              {/* Driver Specific Fields */}
              {role === 'driver' && (
                <div className="p-3 bg-blue-50/50 rounded-2xl border border-blue-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black uppercase tracking-wider text-[#0077B6]">Driver & Vehicle Details</span>
                    <span className="text-[10px] text-gray-400 font-bold">Registration Required</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block font-bold text-gray-700 mb-1 text-[11px]">Vehicle Type</label>
                      <select
                        value={vehicleType}
                        onChange={(e) => setVehicleType(e.target.value)}
                        className="w-full p-2 bg-white border rounded-xl font-semibold text-xs focus:ring-2 focus:ring-[#03045E] focus:outline-hidden"
                      >
                        <option value="Van">Van (Long Wheelbase)</option>
                        <option value="Car">Car</option>
                        <option value="Motorbike">Motorbike</option>
                        <option value="Bicycle">Cargo Bicycle</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-bold text-gray-700 mb-1 text-[11px]">
                        Vehicle Reg <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={vehicleReg}
                        onChange={(e) => setVehicleReg(e.target.value)}
                        placeholder="e.g. LN71 WXY"
                        className="w-full px-3 py-2 bg-white border rounded-xl font-mono uppercase font-bold text-xs focus:ring-2 focus:ring-[#03045E] focus:outline-hidden"
                      >
                      </input>
                    </div>
                  </div>

                  <div>
                    <label className="block font-bold text-gray-700 mb-1 text-[11px]">Driver License Number</label>
                    <input
                      type="text"
                      value={licenseNum}
                      onChange={(e) => setLicenseNum(e.target.value)}
                      placeholder="e.g. UK-DRV-99201"
                      className="w-full px-3 py-2 bg-white border rounded-xl font-mono text-xs focus:ring-2 focus:ring-[#03045E] focus:outline-hidden"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block font-bold text-gray-700 mb-1 text-[11px]">Emergency Contact Name</label>
                      <input
                        type="text"
                        value={emergencyName}
                        onChange={(e) => setEmergencyName(e.target.value)}
                        placeholder="e.g. Jane Doe"
                        className="w-full px-3 py-2 bg-white border rounded-xl text-xs focus:ring-2 focus:ring-[#03045E] focus:outline-hidden"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-gray-700 mb-1 text-[11px]">Emergency Phone</label>
                      <div className="flex gap-1.5">
                        <select
                          value={emergencyPhoneCountryCode}
                          onChange={(e) => setEmergencyPhoneCountryCode(e.target.value)}
                          className="w-20 px-1.5 py-2 bg-white border rounded-xl text-[11px] font-bold text-[#03045E] focus:ring-2 focus:ring-[#03045E] focus:outline-hidden cursor-pointer shrink-0"
                        >
                          <option value="+44">+44</option>
                          <option value="+1">+1</option>
                          <option value="+91">+91</option>
                          <option value="+971">+971</option>
                          <option value="+61">+61</option>
                          <option value="+33">+33</option>
                          <option value="+49">+49</option>
                          <option value="+353">+353</option>
                        </select>
                        <input
                          type="tel"
                          value={emergencyPhone}
                          onChange={(e) => setEmergencyPhone(e.target.value)}
                          placeholder="7700 900111"
                          className="w-full px-3 py-2 bg-white border rounded-xl text-xs focus:ring-2 focus:ring-[#03045E] focus:outline-hidden"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}


            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="w-1/2 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-xs font-bold cursor-pointer hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="w-1/2 py-2.5 bg-[#03045E] hover:bg-[#023E8A] text-white rounded-xl text-xs font-black cursor-pointer shadow-md disabled:opacity-50 transition-colors"
              >
                {submitting ? (editingStaff ? 'Saving...' : 'Creating user...') : editingStaff ? 'Save Changes' : 'Create Staff'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Onboarding Invitation Modal */}
      {invitationModalOpen && createdStaffInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 space-y-5 animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-[#03045E]">Staff Account Created!</h3>
                  <p className="text-xs text-gray-500 font-medium">
                    Auth0 onboarding invitation ready for {createdStaffInvite.name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInvitationModalOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Member Summary Card */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-gray-500 font-bold">Email Address:</span>
                <span className="font-extrabold text-[#03045E] font-mono">{createdStaffInvite.email}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500 font-bold">Role:</span>
                <span className="font-extrabold uppercase px-2.5 py-0.5 rounded-full text-[10px] bg-blue-100 text-[#0077B6]">
                  {createdStaffInvite.role.replace('_', ' ')}
                </span>
              </div>
            </div>

            {/* Instructions */}
            <div className="text-xs text-gray-600 space-y-1.5 leading-relaxed bg-blue-50/60 border border-blue-100 rounded-2xl p-3.5">
              <p className="font-bold text-[#03045E]">How to onboard this staff member:</p>
              <p className="text-[11px] text-gray-600">
                Copy the secure invitation link below and share it with the manager via email, WhatsApp, or Slack. When opened, it allows them to set their password and activate their account (valid for 5 days).
              </p>
            </div>

            {/* Link Box */}
            <div className="space-y-2">
              <label className="text-[11px] font-black uppercase tracking-wider text-gray-500 block">
                Secure Invitation Link
              </label>
              <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-2xl p-2.5">
                <input
                  type="text"
                  readOnly
                  value={createdStaffInvite.ticketUrl}
                  className="w-full bg-transparent text-xs text-gray-700 font-mono focus:outline-hidden select-all"
                />
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(createdStaffInvite.ticketUrl);
                      setCopiedLink(true);
                      setTimeout(() => setCopiedLink(false), 2500);
                    } catch {
                      prompt('Copy invitation link:', createdStaffInvite.ticketUrl);
                    }
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 shrink-0 transition-all cursor-pointer shadow-xs ${
                    copiedLink
                      ? 'bg-emerald-600 text-white'
                      : 'bg-[#03045E] hover:bg-[#0077B6] text-white active:scale-95'
                  }`}
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Link</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-2">
              <a
                href={createdStaffInvite.ticketUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-bold text-[#0077B6] hover:text-[#03045E] flex items-center gap-1 hover:underline"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Test Link in New Tab</span>
              </a>
              <button
                type="button"
                onClick={() => setInvitationModalOpen(false)}
                className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold cursor-pointer transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmStaff && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl border border-red-100 space-y-4 relative">
            <div className="w-12 h-12 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-base font-bold text-slate-900">
                Delete Staff Member?
              </h3>
              <p className="text-xs text-slate-500">
                Are you sure you want to delete <span className="font-bold text-slate-800">{deleteConfirmStaff.fullName}</span> ({deleteConfirmStaff.email})?
              </p>
            </div>

            <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200/70 text-xs text-amber-900 space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>Permanent Synchronization Notice</span>
              </div>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                This action will delete the staff record from <strong>MongoDB</strong> and permanently revoke/delete their login user in <strong>Auth0</strong>.
              </p>
            </div>

            {deleteError && (
              <div className="p-3 bg-red-50 rounded-2xl border border-red-200 text-xs text-red-700 font-semibold">
                {deleteError}
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => {
                  setDeleteConfirmStaff(null);
                  setDeleteError(null);
                }}
                className="w-1/2 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => handleDeleteStaff(deleteConfirmStaff)}
                className="w-1/2 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete User</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

