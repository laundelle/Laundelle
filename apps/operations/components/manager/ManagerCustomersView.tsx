import React, { useState, useEffect } from 'react';
import { Search, Phone, Mail, AlertTriangle, RefreshCw, X, Eye, MapPin, Calendar, ShoppingBag, Users, ShieldAlert } from 'lucide-react';
import { CustomerCRM, CustomerFlag, CustomerNote } from '@laundelle/types';
import { dbFetchManagerCustomers, dbAdminAddCustomerFlag, dbAdminAddCustomerNote } from '@laundelle/api-client';

export const ManagerCustomersView: React.FC = () => {
  const [customers, setCustomers] = useState<CustomerCRM[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerCRM | null>(null);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  // Modals & form state
  const [flagModalOpen, setFlagModalOpen] = useState(false);
  const [flagType, setFlagType] = useState<'Chargeback' | 'Fraud Concern' | 'Repeated No-Show' | 'Abusive Behavior' | 'Risk Review'>('Risk Review');
  const [flagReason, setFlagReason] = useState('');
  const [flags, setFlags] = useState<CustomerFlag[]>([]);

  const [notes, setNotes] = useState<CustomerNote[]>([]);
  const [newNote, setNewNote] = useState('');
  const [savingAction, setSavingAction] = useState(false);

  const loadCustomerData = async () => {
    setLoading(true);
    try {
      const data = await dbFetchManagerCustomers(searchTerm, statusFilter);
      setCustomers(data.customers || []);
      setFlags(data.flags || []);
      setNotes(data.notes || []);
      if (data.customers && data.customers.length > 0) {
        setSelectedCustomer(prev => {
          if (!prev) return null;
          const found = data.customers.find((c: any) => c.id === prev.id || c.publicId === prev.publicId);
          return found || null;
        });
      } else {
        setSelectedCustomer(null);
      }
    } catch (e) {
      console.error('Failed to load manager customer data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomerData();
  }, [searchTerm, statusFilter]);

  const handleAddFlag = async () => {
    if (!selectedCustomer || !flagReason.trim()) return;
    setSavingAction(true);
    try {
      const res = await dbAdminAddCustomerFlag({
        customerId: selectedCustomer.id || selectedCustomer.publicId,
        customerName: selectedCustomer.fullName,
        flagType,
        reason: flagReason.trim(),
        severity: 'high'
      });
      if (res.success && res.flag) {
        setFlags([res.flag, ...flags]);
        setFlagReason('');
        setFlagModalOpen(false);
      }
    } finally {
      setSavingAction(false);
    }
  };

  const handleAddNote = async () => {
    if (!selectedCustomer || !newNote.trim()) return;
    setSavingAction(true);
    try {
      const custId = selectedCustomer.id || selectedCustomer.publicId;
      const res = await dbAdminAddCustomerNote(custId, newNote.trim());
      if (res.success && res.note) {
        setNotes([res.note, ...notes]);
        setNewNote('');
      }
    } finally {
      setSavingAction(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'vip':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-100 text-purple-700 border border-purple-200">VIP</span>;
      case 'high_value':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-100 text-blue-700 border border-blue-200">High Value</span>;
      case 'regular':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-700 border border-emerald-200">Regular</span>;
      case 'blocked':
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-100 text-rose-700 border border-rose-200">Blocked</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">New Client</span>;
    }
  };

  return (
    <div className="w-full space-y-4 md:space-y-6 p-4 sm:p-8 pb-20 md:pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-blue-600 text-white px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider">
              Facility CRM
            </span>
            <span className="text-xs text-slate-500 font-medium">Plant-Scoped Customers Only</span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight mt-1">
            Plant Customers
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Directory of verified clients served by your facility's operational network.
          </p>
        </div>

        <button
          onClick={loadCustomerData}
          disabled={loading}
          className="bg-white hover:bg-slate-50 text-slate-700 px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 border border-slate-200/80 shadow-2xs transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-600' : 'text-slate-400'}`} />
          <span>Refresh List</span>
        </button>
      </div>

      {/* Filters Bar */}
      <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full sm:w-auto flex-1">
          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by name, email, phone, postcode..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 bg-slate-50 border border-slate-200/70 rounded-xl text-xs font-medium focus:bg-white focus:border-blue-500 focus:outline-hidden"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full sm:w-auto px-3 py-2 bg-slate-50 border border-slate-200/70 rounded-xl text-xs font-medium text-slate-700 focus:bg-white focus:border-blue-500 focus:outline-hidden cursor-pointer"
          >
            <option value="all">All Customer Tiers</option>
            <option value="vip">VIP Only</option>
            <option value="high_value">High Value Only</option>
            <option value="regular">Regular Only</option>
            <option value="new">New Clients Only</option>
            <option value="blocked">Blocked</option>
          </select>
        </div>

        <div className="text-xs text-slate-500 font-medium self-end sm:self-auto shrink-0">
          Showing <span className="text-slate-900 font-bold">{customers.length}</span> plant clients
        </div>
      </div>

      {/* Customers Table */}
      {loading ? (
        <div className="text-center py-20 text-xs text-slate-400 font-medium space-y-2">
          <RefreshCw className="w-6 h-6 text-blue-600 animate-spin mx-auto" />
          <p>Loading plant customers...</p>
        </div>
      ) : customers.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-100 shadow-xs space-y-2">
          <Users className="w-10 h-10 text-slate-300 mx-auto" />
          <h3 className="text-sm font-bold text-slate-800">No Customers Found</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {searchTerm || statusFilter !== 'all'
              ? 'No customers match the current search filters.'
              : 'No orders have been routed through this facility yet.'}
          </p>
        </div>
      ) : (
        <div className="w-full bg-white rounded-2xl shadow-xs border border-slate-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Contact Info</th>
                  <th className="py-3 px-4">Delivery Postcode / Area</th>
                  <th className="py-3 px-4 text-center">Orders</th>
                  <th className="py-3 px-4 text-right">Lifetime Spend</th>
                  <th className="py-3 px-4 text-center">Tier Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {customers.map((cust) => (
                  <tr key={cust.id || cust.publicId} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <img
                          src={cust.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(cust.fullName || 'Customer')}&background=03045E&color=CAF0F8`}
                          alt={cust.fullName}
                          className="w-8 h-8 rounded-full border border-slate-200 shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 truncate">{cust.fullName || 'Valued Customer'}</p>
                          <p className="text-[10px] font-mono text-slate-400">{cust.publicId || cust.id}</p>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-slate-600">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5 truncate">
                          <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate">{cust.email || 'No email'}</span>
                        </div>
                        {cust.phone && (
                          <div className="flex items-center gap-1.5 text-slate-500">
                            <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>{cust.phone}</span>
                          </div>
                        )}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-slate-700">
                      <div className="flex items-start gap-1.5 max-w-[220px]">
                        <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                        <span className="truncate">{cust.address || cust.postcode || 'N/A'}</span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-center font-bold text-slate-800">
                      {cust.totalOrders || 0}
                    </td>

                    <td className="py-3.5 px-4 text-right font-bold text-slate-900 font-mono">
                      £{Number(cust.lifetimeSpend || 0).toFixed(2)}
                    </td>

                    <td className="py-3.5 px-4 text-center">
                      {getStatusBadge(cust.status)}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => {
                          setSelectedCustomer(cust);
                          setIsCustomerModalOpen(true);
                        }}
                        className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 ml-auto cursor-pointer transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Customer Profile & Order History Modal */}
      {isCustomerModalOpen && selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white w-full max-w-2xl rounded-3xl p-6 shadow-2xl space-y-5 relative max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3.5">
                <img
                  src={selectedCustomer.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(selectedCustomer.fullName || 'Customer')}&background=03045E&color=CAF0F8`}
                  alt={selectedCustomer.fullName}
                  className="w-12 h-12 rounded-full border border-slate-200"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-slate-900 text-lg leading-tight">
                      {selectedCustomer.fullName}
                    </h3>
                    {getStatusBadge(selectedCustomer.status)}
                  </div>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">{selectedCustomer.publicId || selectedCustomer.id}</p>
                </div>
              </div>

              <button
                onClick={() => setIsCustomerModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                <p className="text-[10px] uppercase font-bold text-slate-400">Total Plant Orders</p>
                <p className="text-lg font-black text-slate-900 mt-0.5">{selectedCustomer.totalOrders}</p>
              </div>
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                <p className="text-[10px] uppercase font-bold text-slate-400">Lifetime Spend</p>
                <p className="text-lg font-black text-slate-900 mt-0.5 font-mono">£{Number(selectedCustomer.lifetimeSpend || 0).toFixed(2)}</p>
              </div>
              <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                <p className="text-[10px] uppercase font-bold text-slate-400">Average Order</p>
                <p className="text-lg font-black text-slate-900 mt-0.5 font-mono">£{Number(selectedCustomer.averageOrderValue || 0).toFixed(2)}</p>
              </div>
            </div>

            {/* Contact Details */}
            <div className="bg-slate-50/70 p-4 rounded-2xl border border-slate-100 space-y-2 text-xs">
              <h4 className="font-bold text-slate-800 uppercase text-[10px] tracking-wider text-slate-400">Contact & Address</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-700">
                <p><span className="text-slate-400 font-medium">Email:</span> {selectedCustomer.email || 'N/A'}</p>
                <p><span className="text-slate-400 font-medium">Phone:</span> {selectedCustomer.phone || 'N/A'}</p>
                <p className="sm:col-span-2"><span className="text-slate-400 font-medium">Address:</span> {selectedCustomer.address || selectedCustomer.postcode || 'N/A'}</p>
              </div>
            </div>

            {/* Recent Orders List */}
            <div className="space-y-2">
              <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider text-slate-400">Recent Plant Orders</h4>
              {(selectedCustomer.recentOrders || []).length === 0 ? (
                <p className="text-xs text-slate-400 italic">No previous orders recorded.</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {(selectedCustomer.recentOrders || []).map((ord: any) => (
                    <div key={ord.id} className="p-3 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between text-xs">
                      <div>
                        <span className="font-mono font-bold text-blue-600">#{ord.orderNumber || ord.id}</span>
                        <p className="text-[11px] text-slate-500 mt-0.5">{ord.service || 'Laundry Service'}</p>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-slate-900 font-mono">£{Number(ord.total || 0).toFixed(2)}</span>
                        <p className="text-[10px] text-slate-400 mt-0.5 capitalize">{ord.status?.replace(/_/g, ' ')}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Notes Section */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider text-slate-400">Internal Operational Notes</h4>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Add a customer note..."
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={handleAddNote}
                  disabled={savingAction || !newNote.trim()}
                  className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold disabled:opacity-50 cursor-pointer"
                >
                  Save Note
                </button>
              </div>
              <div className="space-y-1.5 max-h-36 overflow-y-auto">
                {notes.filter(n => n.customerId === (selectedCustomer.id || selectedCustomer.publicId)).map((n: any, idx: number) => (
                  <div key={idx} className="p-2.5 bg-slate-50 border border-slate-100 rounded-lg text-xs text-slate-700">
                    <p className="text-slate-800">{n.note}</p>
                    <span className="text-[10px] text-slate-400 mt-0.5 block">{n.authorName} &bull; {n.createdAt}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
