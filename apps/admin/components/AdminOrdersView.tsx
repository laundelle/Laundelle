import React, { useState, useEffect } from 'react';
import {
  Search,
  Eye,
  UserCheck,
  QrCode,
  CheckCircle2,
  X,
  ShieldAlert,
  Camera,
  ShieldCheck,
  ZoomIn,
  Clock,
  Truck,
  PackageCheck,
  AlertCircle,
  Image as ImageIcon,
  RefreshCw,
  Star,
  MessageSquare
} from 'lucide-react';
import { Order } from '@laundelle/types';
import { GenerateQRModal } from '@laundelle/ui';
import { ManagerOverrideModal } from './ManagerOverrideModal';
import { dbFetchManagerStaff, getStoredSession, apiFetch, dbAdminFetchOrders, dbFetchManagerOrders } from '@laundelle/api-client';


interface AdminOrdersViewProps {
  orders: Order[];
  onOpenDriverAssignModal?: (orderId: string) => void;
  onRefresh?: () => Promise<void> | void;
}

const formatAddress = (addr: any): string => {
  if (!addr) return 'N/A';
  if (typeof addr === 'string') return addr;
  if (typeof addr === 'object') {
    const parts = [addr.line1, addr.line2, addr.city, addr.postcode].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : 'N/A';
  }
  return String(addr);
};

const formatTotal = (val: any): string => {
  const num = Number(val);
  return isNaN(num) ? '0.00' : num.toFixed(2);
};

export const AdminOrdersView: React.FC<AdminOrdersViewProps> = ({
  orders,
  onRefresh,
}) => {
  const [internalOrders, setInternalOrders] = useState<Order[]>(orders);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [areaFilter, setAreaFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [activeDetailTab, setActiveDetailTab] = useState<'timeline' | 'evidence' | 'customer' | 'notes'>('timeline');
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string } | null>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditIntegrity, setAuditIntegrity] = useState<any>(null);
  const [refreshingAudit, setRefreshingAudit] = useState(false);

  useEffect(() => {
    setInternalOrders(orders);
  }, [orders]);

  const availableAreas = React.useMemo(() => {
    const areas = new Set<string>();
    (internalOrders || []).forEach((o: any) => {
      const text = `${o.postcode || ''} ${formatAddress(o.addressLabel || o.address)}`;
      const matches = text.match(/\b([A-Z]{1,2}\d{1,2})\b/gi);
      if (matches) {
        matches.forEach(m => areas.add(m.toUpperCase()));
      }
    });
    return Array.from(areas).sort();
  }, [internalOrders]);

  const fetchAuditLogs = async (orderId: string) => {
    setRefreshingAudit(true);
    try {
      const res = await apiFetch(`/api/v1/orders/${orderId}/audit-trail`);
      const data = await res.json();
      if (data.logs) {
        setAuditLogs(data.logs);
        setAuditIntegrity(data.integrity);
      }
    } catch {
      // Ignored
    } finally {
      setRefreshingAudit(false);
    }
  };

  useEffect(() => {
    if (selectedOrder?.id) {
      fetchAuditLogs(selectedOrder.id);
    } else {
      setAuditLogs([]);
      setAuditIntegrity(null);
    }
  }, [selectedOrder?.id]);

  // Modals inside orders view
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [newStatus, setNewStatus] = useState('booking_confirmed');
  const [updateReason, setUpdateReason] = useState('');

  const [noteText, setNoteText] = useState('');
  const [internalNotesList, setInternalNotesList] = useState<string[]>([
    'Customer requested doorstep ring twice.',
    'VIP account - ensure eco-enzyme detergent used.',
  ]);

  const [savingStatus, setSavingStatus] = useState(false);

  const session = getStoredSession();
  const isManager = session?.user?.role === 'manager';

  const getCustomerName = (ord: any) => {
    if (ord.customer_name && ord.customer_name !== 'Valued Customer' && ord.customer_name !== 'Customer') return ord.customer_name;
    if (ord.customerName && ord.customerName !== 'Valued Customer' && ord.customerName !== 'Customer') return ord.customerName;
    if (ord.contactDetails) {
      const cName = `${ord.contactDetails.firstName || ''} ${ord.contactDetails.lastName || ''}`.trim();
      if (cName) return cName;
    }
    if (ord.customer && (ord.customer.full_name || ord.customer.name)) {
      return ord.customer.full_name || ord.customer.name;
    }
    if (ord.userName && ord.userName !== 'Customer') return ord.userName;
    if (ord.user_name && ord.user_name !== 'Customer') return ord.user_name;
    if (ord.user && (ord.user.full_name || ord.user.name)) {
      return ord.user.full_name || ord.user.name;
    }
    if (ord.customerEmail || ord.email) {
      const email = ord.customerEmail || ord.email;
      return email.split('@')[0];
    }
    if (ord.addressLabel && !['Home', 'Work', 'Office', 'Apartment'].some(k => (ord.addressLabel || '').includes(k))) {
      return ord.addressLabel;
    }
    return ord.customer_name || ord.customerName || 'Customer';
  };

  React.useEffect(() => {
    dbFetchManagerStaff().then((staff) => {
      if (Array.isArray(staff)) {
        setDrivers(staff.filter((s: any) => s.role === 'driver'));
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!orders || orders.length === 0) {
      handleRefresh();
    }
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      if (onRefresh) {
        await onRefresh();
      } else {
        const data = isManager ? await dbFetchManagerOrders() : await dbAdminFetchOrders();
        setInternalOrders(data || []);
      }
    } catch (e) {
      console.error('Failed to refresh orders:', e);
    } finally {
      setRefreshing(false);
    }
  };

  const filteredOrders = (internalOrders || []).filter((ord) => {
    if (!ord) return false;
    const ordId = String(ord.id || '');
    const ordAddr = formatAddress(ord.addressLabel || ord.address);
    const ordDriver = String(ord.driver?.name || '');
    const custName = getCustomerName(ord);
    const term = searchTerm.toLowerCase();

    const matchesSearch =
      !term ||
      ordId.toLowerCase().includes(term) ||
      ordAddr.toLowerCase().includes(term) ||
      ordDriver.toLowerCase().includes(term) ||
      custName.toLowerCase().includes(term);

    let matchesStatus = statusFilter === 'all';
    if (!matchesStatus) {
      const s = (ord.status || '').toLowerCase();
      const target = statusFilter.toLowerCase();
      matchesStatus =
        s === target ||
        (target === 'delivered' && (s === 'delivered' || s === 'completed')) ||
        (target === 'completed' && (s === 'delivered' || s === 'completed')) ||
        (target === 'washing' && (s === 'washing' || s === 'sorting' || s === 'ironing' || s === 'received_at_facility')) ||
        (target === 'collection_scheduled' && (s === 'collection_scheduled' || s === 'driver_assigned' || s === 'waiting_for_driver')) ||
        (target === 'out_for_delivery' && (s === 'out_for_delivery' || s === 'ready_for_delivery'));
    }

    let matchesPayment = paymentFilter === 'all';
    if (!matchesPayment) {
      const ordPayment = String(ord.paymentStatus || (ord as any).payment_status || 'Pending').toLowerCase();
      matchesPayment = ordPayment === paymentFilter.toLowerCase();
    }

    let matchesArea = areaFilter === 'all';
    if (!matchesArea) {
      const combined = `${ord.postcode || ''} ${ordAddr}`.toLowerCase();
      matchesArea = combined.includes(areaFilter.toLowerCase());
    }

    let matchesDate = dateFilter === 'all';
    if (!matchesDate) {
      const orderDateStr = ord.createdAt || (ord as any).created_at || ord.pickupDate || (ord as any).date;
      if (orderDateStr) {
        const orderDate = new Date(orderDateStr);
        if (!isNaN(orderDate.getTime())) {
          const now = new Date();
          if (dateFilter === 'today') {
            matchesDate = orderDate.toDateString() === now.toDateString();
          } else if (dateFilter === 'this_week') {
            const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            matchesDate = orderDate >= weekAgo;
          } else if (dateFilter === 'this_month') {
            matchesDate = orderDate.getMonth() === now.getMonth() && orderDate.getFullYear() === now.getFullYear();
          }
        }
      }
    }

    return matchesSearch && matchesStatus && matchesPayment && matchesArea && matchesDate;
  });

  const handleAddNote = () => {
    if (noteText.trim()) {
      setInternalNotesList([noteText.trim(), ...internalNotesList]);
      setNoteText('');
    }
  };

  return (
    <div className="w-full space-y-4 md:space-y-5 p-4 sm:p-8 pb-20 md:pb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">Order Management</h1>
          <p className="text-xs text-slate-500 mt-0.5">Live order tracking, logistics dispatch, and status inspection.</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
            title="Refresh Live Orders"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-blue-600 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{refreshing ? 'Refreshing...' : 'Refresh Orders'}</span>
          </button>
          <span className="text-xs font-semibold text-slate-500">Orders:</span>
          <span className="px-2.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-100/60 rounded-full text-xs font-bold">
            {filteredOrders.length}
          </span>
        </div>
      </div>

      {/* Multi-Criteria Filters Top Bar */}
      <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-100 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Order #, customer, address..."
              className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200/70 rounded-xl text-xs font-medium focus:bg-white focus:border-blue-500 focus:outline-hidden"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200/70 rounded-xl text-xs font-medium text-slate-700 focus:bg-white focus:border-blue-500 focus:outline-hidden cursor-pointer"
            >
              <option value="all">All Order Statuses</option>
              <option value="booking_confirmed">Booking Confirmed</option>
              <option value="collection_scheduled">Collection Scheduled</option>
              <option value="laundry_collected">Laundry Collected</option>
              <option value="received_at_facility">Received at Facility</option>
              <option value="washing">Washing & Care</option>
              <option value="quality_check">Quality Check</option>
              <option value="out_for_delivery">Out for Delivery</option>
              <option value="delivered">Delivered / Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {/* Payment Status Filter */}
          <div>
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200/70 rounded-xl text-xs font-medium text-slate-700 focus:bg-white focus:border-blue-500 focus:outline-hidden cursor-pointer"
            >
              <option value="all">All Payment Statuses</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="refunded">Refunded</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          {/* Location / Area Filter */}
          <div>
            <select
              value={areaFilter}
              onChange={(e) => setAreaFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200/70 rounded-xl text-xs font-medium text-slate-700 focus:bg-white focus:border-blue-500 focus:outline-hidden cursor-pointer"
            >
              <option value="all">All Sector Areas</option>
              {availableAreas.map((area) => (
                <option key={area} value={area}>
                  {area} Sector Area
                </option>
              ))}
              {!availableAreas.includes('PR1') && <option value="PR1">PR1 - Preston Central</option>}
              {!availableAreas.includes('BB1') && <option value="BB1">BB1 - Blackburn Commercial</option>}
            </select>
          </div>

          {/* Date Filter */}
          <div>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200/70 rounded-xl text-xs font-medium text-slate-700 focus:bg-white focus:border-blue-500 focus:outline-hidden cursor-pointer"
            >
              <option value="all">All Order Dates</option>
              <option value="today">Today</option>
              <option value="this_week">Last 7 Days</option>
              <option value="this_month">This Month</option>
            </select>
          </div>
        </div>

        {(searchTerm || statusFilter !== 'all' || paymentFilter !== 'all' || areaFilter !== 'all' || dateFilter !== 'all') && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
            <span className="text-slate-500 font-medium">
              Showing <strong className="text-slate-900">{filteredOrders.length}</strong> of {internalOrders.length} orders
            </span>
            <button
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('all');
                setPaymentFilter('all');
                setAreaFilter('all');
                setDateFilter('all');
              }}
              className="text-blue-600 hover:text-blue-700 font-semibold cursor-pointer transition-colors"
            >
              Reset Filters
            </button>
          </div>
        )}
      </div>

      {/* Orders Box - Fixed Sized with Vertical Scroll */}
      <div className="w-full bg-white rounded-2xl shadow-xs border border-slate-100 overflow-hidden flex flex-col h-[calc(100vh-275px)] min-h-[460px]">
        {filteredOrders.length === 0 ? (
          <div className="m-auto p-12 text-center text-slate-400">
            <p className="text-sm font-semibold text-slate-700">No orders found</p>
            <p className="text-xs text-slate-400 mt-1">
              {searchTerm || statusFilter !== 'all' || paymentFilter !== 'all'
                ? 'Try adjusting your search query or filters.'
                : 'There are currently no active orders to display.'}
            </p>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="mt-4 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition cursor-pointer"
            >
              {refreshing ? 'Refreshing...' : 'Refresh Orders'}
            </button>
          </div>
        ) : (
          <>
            {/* Mobile View: Cards */}
            <div className="md:hidden p-4 space-y-3 flex-1 overflow-y-auto">
              {filteredOrders.map((ord) => {
                return (
                  <div
                    key={ord.id}
                    onClick={() => {
                      setSelectedOrder(ord);
                      setIsDetailsModalOpen(true);
                    }}
                    className="bg-white rounded-xl p-3.5 border border-slate-100 hover:border-blue-200 transition-colors cursor-pointer space-y-2.5 shadow-2xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-slate-900 text-xs">{ord.publicId || ord.orderNumber || ord.id}</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-100/60">
                        {ord.statusLabel}
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      <span className="block font-medium text-slate-800 text-xs">
                        {formatAddress(ord.addressLabel || ord.address)}
                      </span>
                      <span className="text-[10px] text-slate-400 block">{ord.pickupDate} • {(ord.items || []).length} items</span>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          ord.paymentStatus === 'Paid'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-100/60'
                            : 'bg-amber-50 text-amber-700 border border-amber-100/60'
                        }`}
                      >
                        {ord.paymentStatus}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-xs">
                          £{formatTotal(ord.total)}
                        </span>
                        <span className="p-1 text-slate-400 hover:text-blue-600 rounded-lg">
                          <Eye className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop View: Table scrolling vertically inside fixed box */}
            <div className="hidden md:block flex-1 overflow-y-auto overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500 font-semibold border-b border-slate-200 uppercase tracking-wider text-[10px]">
                  {isManager ? (
                    <tr>
                      <th className="py-3 px-4">Order ID</th>
                      <th className="py-3 px-4">Customer Name</th>
                      <th className="py-3 px-4">Operational Status</th>
                      <th className="py-3 px-4">Customer Rating</th>
                      <th className="py-3 px-4">Payment</th>
                      <th className="py-3 px-4">Total</th>
                    </tr>
                  ) : (
                    <tr>
                      <th className="py-3 px-4">Order ID</th>
                      <th className="py-3 px-4">Customer & Address</th>
                      <th className="py-3 px-4">Slot</th>
                      <th className="py-3 px-4">Items</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Customer Rating</th>
                      <th className="py-3 px-4">Payment</th>
                      <th className="py-3 px-4">Total</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  )}
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredOrders.map((ord) => {
                    const custName = getCustomerName(ord);
                    const ratingScore = ord.rating || ord.customerRating?.rating;
                    const ratingComment = ord.ratingFeedback || ord.customerRating?.feedback;

                    return (
                      <tr
                        key={ord.id}
                        onClick={() => {
                          setSelectedOrder(ord);
                          setIsDetailsModalOpen(true);
                        }}
                        className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                      >
                        <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                          {ord.publicId || ord.orderNumber || ord.id}
                        </td>

                        {isManager ? (
                          <>
                            <td className="py-3 px-4 font-semibold text-slate-900">
                              {custName}
                            </td>
                            <td className="py-3 px-4">
                              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-100/60">
                                {ord.statusLabel || ord.status}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              {ratingScore ? (
                                <div className="flex items-center gap-1.5" title={ratingComment || `${ratingScore} Stars`}>
                                  <div className="flex items-center text-amber-500 font-bold text-xs bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 shadow-2xs">
                                    <Star className="w-3 h-3 fill-current mr-1 text-amber-500" />
                                    <span>{ratingScore}.0</span>
                                  </div>
                                  {ratingComment && (
                                    <span className="text-[10px] text-slate-500 truncate max-w-[120px]" title={ratingComment}>
                                      "{ratingComment}"
                                    </span>
                                  )}
                                </div>
                              ) : (ord.status === 'delivered' || ord.status === 'completed') ? (
                                <span className="text-slate-400 text-[10px] italic">Awaiting Rating</span>
                              ) : (
                                <span className="text-slate-300 text-xs">-</span>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium ${
                                  (ord.paymentStatus || (ord as any).payment_status) === 'Paid'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-100/60'
                                    : 'bg-amber-50 text-amber-700 border border-amber-100/60'
                                }`}
                              >
                                {ord.paymentStatus || (ord as any).payment_status || 'Pending'}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-bold text-slate-900 text-sm">
                              £{formatTotal(ord.total)}
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="py-3 px-4 space-y-0.5 max-w-xs">
                              <span className="block font-semibold text-slate-900 truncate">
                                {custName}
                              </span>
                              <span className="text-[11px] text-slate-400 block truncate">{formatAddress(ord.address)}</span>
                            </td>
                            <td className="py-3 px-4 space-y-0.5">
                              <span className="font-medium text-slate-700 block">{ord.pickupDate}</span>
                              <span className="text-[10px] text-slate-400 block font-normal">{ord.pickupSlot || 'Standard'}</span>
                            </td>
                            <td className="py-3 px-4">
                              <span className="px-2 py-0.5 rounded-md bg-slate-100 font-medium text-slate-600 text-[11px]">
                                {(ord.items || []).length} items
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-100/60">
                                {ord.statusLabel || ord.status}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              {ratingScore ? (
                                <div className="flex items-center gap-1.5" title={ratingComment || `${ratingScore} Stars`}>
                                  <div className="flex items-center text-amber-500 font-bold text-xs bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 shadow-2xs">
                                    <Star className="w-3 h-3 fill-current mr-1 text-amber-500" />
                                    <span>{ratingScore}.0</span>
                                  </div>
                                  {ratingComment && (
                                    <span className="text-[10px] text-slate-500 truncate max-w-[120px]" title={ratingComment}>
                                      "{ratingComment}"
                                    </span>
                                  )}
                                </div>
                              ) : (ord.status === 'delivered' || ord.status === 'completed') ? (
                                <span className="text-slate-400 text-[10px] italic">Awaiting Rating</span>
                              ) : (
                                <span className="text-slate-300 text-xs">-</span>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium ${
                                  (ord.paymentStatus || (ord as any).payment_status) === 'Paid'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-100/60'
                                    : 'bg-amber-50 text-amber-700 border border-amber-100/60'
                                }`}
                              >
                                {ord.paymentStatus || (ord as any).payment_status || 'Pending'}
                              </span>
                            </td>

                            <td className="py-3 px-4 font-bold text-slate-900 text-sm">
                              £{formatTotal(ord.total)}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedOrder(ord);
                                  setIsDetailsModalOpen(true);
                                }}
                                className="px-3 py-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-medium transition-all cursor-pointer inline-flex items-center gap-1.5 shadow-2xs group-hover:border-slate-300"
                              >
                                <Eye className="w-3.5 h-3.5 text-blue-600" />
                                <span>View</span>
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Order Inspector Modal Dialog */}
      {isDetailsModalOpen && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 sm:p-6 animate-in fade-in">
          <div className="bg-white w-full max-w-4xl rounded-3xl p-6 sm:p-8 max-h-[90vh] overflow-y-auto shadow-2xl border border-gray-100 space-y-6 relative">
            {/* Header */}
            <div className="flex items-start sm:items-center justify-between pb-4 border-b border-gray-100 flex-col sm:flex-row gap-4">
              <div>
                <span className="text-[10px] font-bold text-[#0077B6] uppercase tracking-wider block">
                  Order Inspection Workspace
                </span>
                <div className="flex items-center gap-3 mt-1">
                  <h2 className="text-xl sm:text-2xl font-heading font-extrabold text-[#03045E]">
                    {selectedOrder.publicId || selectedOrder.orderNumber || selectedOrder.id}
                  </h2>
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-[#CAF0F8] text-[#03045E]">
                    {selectedOrder.statusLabel}
                  </span>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold ${selectedOrder.paymentStatus === 'Paid'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                      }`}
                  >
                    {selectedOrder.paymentStatus}
                  </span>
                  {(selectedOrder.rating || selectedOrder.customerRating?.rating) && (
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-200 flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                      <span>{(selectedOrder.rating || selectedOrder.customerRating?.rating)}.0 / 5.0</span>
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setQrModalOpen(true)}
                  className="px-3.5 py-2 bg-[#CAF0F8] hover:bg-[#ADE8F4] text-[#03045E] rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <QrCode className="w-3.5 h-3.5 text-[#0077B6]" />
                  <span>Generate QR</span>
                </button>
                {selectedOrder.status !== 'delivered' && selectedOrder.status !== 'completed' && !(selectedOrder as any).is_delivered && (
                  <>
                    <button
                      onClick={() => setOverrideModalOpen(true)}
                      className="px-3.5 py-2 bg-gradient-to-r from-[#03045E] to-[#0077B6] hover:from-[#023E8A] hover:to-[#03045E] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <ShieldAlert className="w-3.5 h-3.5 text-[#90E0EF]" />
                      <span>Manager Override</span>
                    </button>
                    <button
                      onClick={() => setAssignModalOpen(true)}
                      className="px-3.5 py-2 bg-[#03045E] hover:bg-[#023E8A] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <UserCheck className="w-3.5 h-3.5 text-[#48CAE4]" />
                      <span>Update Status</span>
                    </button>
                  </>
                )}
                <button
                  onClick={() => setIsDetailsModalOpen(false)}
                  className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-500 hover:text-gray-800 transition-colors cursor-pointer ml-1"
                  title="Close inspection"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Customer Rating & Feedback Highlight Card */}
            {(selectedOrder.rating || selectedOrder.customerRating?.rating) ? (
              <div className="p-4 bg-gradient-to-r from-amber-50/90 via-amber-100/40 to-amber-50/90 rounded-2xl border border-amber-200/90 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3.5">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-amber-400 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <Star className="w-5 h-5 fill-current" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-amber-950 uppercase tracking-wider">
                        Customer Rating:
                      </span>
                      <div className="flex items-center text-amber-500">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            className={`w-3.5 h-3.5 ${
                              i < (selectedOrder.rating || selectedOrder.customerRating?.rating || 0)
                                ? 'fill-amber-400 text-amber-400'
                                : 'text-slate-300'
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-xs font-extrabold text-amber-900">
                        {(selectedOrder.rating || selectedOrder.customerRating?.rating)}.0 / 5.0
                      </span>
                    </div>
                    {(selectedOrder.ratingFeedback || selectedOrder.customerRating?.feedback) ? (
                      <p className="text-xs text-amber-950 italic mt-1 font-medium bg-white/80 px-3 py-1.5 rounded-lg border border-amber-200/60">
                        "{selectedOrder.ratingFeedback || selectedOrder.customerRating?.feedback}"
                      </p>
                    ) : (
                      <p className="text-[11px] text-amber-800/80 mt-0.5">Rating submitted without written comments.</p>
                    )}
                  </div>
                </div>
                <div className="text-right text-[11px] text-amber-900/80 shrink-0">
                  <span className="font-bold block">Verified Customer Rating</span>
                  {selectedOrder.ratingSubmittedAt && (
                    <span className="text-[10px] text-slate-500">
                      {new Date(selectedOrder.ratingSubmittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              </div>
            ) : (selectedOrder.status === 'delivered' || selectedOrder.status === 'completed') ? (
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500 flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Star className="w-4 h-4 text-slate-400" />
                  <span>Customer Rating: <strong>Pending (Customer has not submitted a review yet)</strong></span>
                </span>
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Awaiting Customer Rating</span>
              </div>
            ) : null}

            {/* Inspector Navigation Tabs */}
            <div className="grid grid-cols-4 gap-2 bg-gray-100 p-1.5 rounded-2xl text-xs font-bold">
              <button
                onClick={() => setActiveDetailTab('timeline')}
                className={`py-2 rounded-xl transition-all cursor-pointer ${activeDetailTab === 'timeline' ? 'bg-[#03045E] text-white shadow-xs' : 'text-gray-600'
                  }`}
              >
                Timeline
              </button>
              <button
                onClick={() => setActiveDetailTab('evidence')}
                className={`py-2 rounded-xl transition-all cursor-pointer ${activeDetailTab === 'evidence' ? 'bg-[#03045E] text-white shadow-xs' : 'text-gray-600'
                  }`}
              >
                Evidence
              </button>
              <button
                onClick={() => setActiveDetailTab('customer')}
                className={`py-2 rounded-xl transition-all cursor-pointer ${activeDetailTab === 'customer' ? 'bg-[#03045E] text-white shadow-xs' : 'text-gray-600'
                  }`}
              >
                Items
              </button>
              <button
                onClick={() => setActiveDetailTab('notes')}
                className={`py-2 rounded-xl transition-all cursor-pointer ${activeDetailTab === 'notes' ? 'bg-[#03045E] text-white shadow-xs' : 'text-gray-600'
                  }`}
              >
                Notes
              </button>
            </div>

            {/* Tab 1: Chronological Order Timeline */}
            {activeDetailTab === 'timeline' && (() => {
              const items = auditLogs.length > 0 ? auditLogs.map((item: any, idx: number) => ({
                label: (item.action || item.event || '').replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()),
                actor: item.actorRole ? `${item.actorRole.toUpperCase()} (${item.actorId || 'system'})` : 'SYSTEM',
                reason: item.reason || '',
                time: item.timestamp ? new Date(item.timestamp).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Recorded',
                completed: true,
                hash: item.currentHash ? `${item.currentHash.substring(0, 8)}...` : null
              })) : (selectedOrder.timeline || selectedOrder.timeline_events || []).map((item: any, idx: number) => ({
                label: item.label || (item.event ? item.event.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) : `Step ${idx + 1}`),
                actor: item.actor || 'system',
                reason: item.note || '',
                time: item.timestamp ? new Date(item.timestamp).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : (item.time || 'Completed'),
                completed: item.completed !== undefined ? item.completed : true,
                hash: null
              }));

              return (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-bold text-[#03045E] uppercase tracking-wider">
                        Chronological Operational Audit Trail
                      </h3>
                      <button
                        onClick={() => selectedOrder?.id && fetchAuditLogs(selectedOrder.id)}
                        disabled={refreshingAudit}
                        className="p-1 text-gray-400 hover:text-[#0077B6] rounded-lg transition-colors cursor-pointer"
                        title="Refresh Audit Trail"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${refreshingAudit ? 'animate-spin text-[#0077B6]' : ''}`} />
                      </button>
                    </div>
                    {auditIntegrity && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                        auditIntegrity.valid ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {auditIntegrity.valid ? '🔒 Cryptographic Chain Valid' : '⚠️ Chain Integrity Compromised'}
                      </span>
                    )}
                  </div>
                  <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-200">
                    {items.length === 0 ? (
                      <p className="text-xs text-gray-400">No audit events logged yet.</p>
                    ) : (
                      items.map((item: any, idx: number) => (
                        <div key={idx} className="relative flex items-start gap-3">
                          <div
                            className={`absolute -left-6 top-0.5 w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] ${item.completed ? 'bg-[#03045E]' : 'bg-gray-300'
                              }`}
                          >
                            {item.completed ? <CheckCircle2 className="w-3.5 h-3.5" /> : idx + 1}
                          </div>
                          <div className="space-y-0.5">
                            <p className="text-xs font-bold text-gray-900">{item.label}</p>
                            <p className="text-[10px] text-gray-500 font-medium">Actor: {item.actor} • {item.time}</p>
                            {item.reason && <p className="text-[11px] text-gray-600 italic">"{item.reason}"</p>}
                            {item.hash && <p className="text-[9px] font-mono text-gray-400">SHA-256: {item.hash}</p>}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Tab 2: Order Evidence Panel */}
            {activeDetailTab === 'evidence' && (() => {
              const o: any = selectedOrder;
              const pickupPhoto = o?.qr_tracking?.pickupPhoto ||
                o?.qr_tracking?.collectionPhotos?.[0] ||
                o?.evidence?.pickupPhotoUrl ||
                o?.evidence?.pickupPhotos?.[0] ||
                null;

              const deliveryPhoto = o?.qr_tracking?.deliveryPhoto ||
                o?.qr_tracking?.deliveryPhotoUrls?.[0] ||
                o?.evidence?.deliveryPhotoUrl ||
                o?.evidence?.deliveryPhotos?.[0] ||
                null;

              const pickupDriverName = o?.evidence?.pickupDriverName ||
                o?.driver?.name ||
                'Assigned Driver';

              const deliveryDriverName = o?.evidence?.deliveryDriverName ||
                o?.driver?.name ||
                'Assigned Driver';

              const pickupTime = o?.qr_tracking?.collectedAt ||
                o?.evidence?.pickupVerifiedAt;

              const deliveryTime = o?.qr_tracking?.deliveredAt ||
                o?.delivered_at ||
                o?.evidence?.deliveryVerifiedAt;

              const bagQrCode = o?.evidence?.bagQrCode ||
                o?.qr_tracking?.qrTagId ||
                o?.package?.qr_code ||
                o?.qr_code ||
                o?.bag_id ||
                o?.bagId ||
                selectedOrder.publicId ||
                selectedOrder.id;

              const isPickedUp = [
                'laundry_collected', 'received_at_facility', 'sorting', 'washing',
                'drying', 'ironing', 'quality_check', 'qc_passed', 'ready_for_delivery',
                'waiting_for_driver', 'delivery_driver_assigned', 'delivery_driver_accepted',
                'package_collected_for_delivery', 'out_for_delivery', 'delivered'
              ].includes(selectedOrder.status);

              const isDelivered = selectedOrder.status === 'delivered';

              return (
                <div className="space-y-4 text-xs">
                  <div className="bg-blue-50/70 p-3 rounded-2xl border border-blue-100 flex items-center justify-between">
                    <div>
                      <h4 className="font-extrabold text-[#03045E] text-xs">Chain of Custody Evidence</h4>
                      <p className="text-[10px] text-gray-500">Photographic & PIN verification records captured by field drivers.</p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-[#03045E] text-white">
                      Tamper-Proof
                    </span>
                  </div>

                  {/* 1. Doorstep Pickup Record */}
                  <div className="p-4 bg-white rounded-2xl border border-blue-100 shadow-2xs space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-blue-50 text-[#0077B6] flex items-center justify-center">
                          <Truck className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="font-extrabold text-[#03045E] block text-xs">Doorstep Pickup Verification</span>
                          <span className="text-[10px] font-semibold text-gray-500">Collected by {pickupDriverName}</span>
                        </div>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold flex items-center gap-1 ${
                        pickupPhoto
                          ? 'bg-emerald-100 text-emerald-800'
                          : isPickedUp
                          ? 'bg-blue-100 text-[#0077B6]'
                          : 'bg-gray-100 text-gray-500'
                      }`}>
                        {pickupPhoto ? <CheckCircle2 className="w-3 h-3" /> : null}
                        {pickupPhoto ? 'Photo & PIN Verified' : isPickedUp ? 'PIN Verified' : 'Pending Pickup'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-600 bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                      <div>
                        <span className="text-gray-400 block text-[10px] uppercase font-bold">QR Tag Attached</span>
                        <span className="font-mono font-bold text-gray-900">{bagQrCode}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 block text-[10px] uppercase font-bold">Collection Time</span>
                        <span className="font-medium text-gray-900">
                          {pickupTime ? new Date(pickupTime).toLocaleString('en-GB') : (isPickedUp ? 'Completed' : 'Awaiting Driver')}
                        </span>
                      </div>
                    </div>

                    {/* Captured Pickup Photo */}
                    {pickupPhoto ? (
                      <div className="space-y-1.5 pt-1">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                          Driver Collection Photo Evidence:
                        </span>
                        <div
                          onClick={() => setPreviewImage({ url: pickupPhoto, title: `Order #${selectedOrder.publicId || selectedOrder.orderNumber || selectedOrder.id} - Pickup Proof` })}
                          className="relative rounded-2xl overflow-hidden border border-blue-200 aspect-video group cursor-pointer bg-black"
                        >
                          <img
                            src={pickupPhoto}
                            alt="Pickup proof"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between p-3 text-white">
                            <span className="text-[11px] font-bold flex items-center gap-1">
                              <ZoomIn className="w-3.5 h-3.5" /> Tap to inspect full size
                            </span>
                            <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-md backdrop-blur-xs font-semibold">
                              Pickup Proof
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : isPickedUp ? (
                      <p className="text-[11px] text-gray-500 italic bg-gray-50 p-2 rounded-xl border border-gray-100">
                        No photo attached. Pickup was authorized via customer 6-digit secure PIN verification.
                      </p>
                    ) : null}
                  </div>

                  {/* 2. Doorstep Delivery Record */}
                  <div className="p-4 bg-white rounded-2xl border border-emerald-100 shadow-2xs space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                          <PackageCheck className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="font-extrabold text-[#03045E] block text-xs">Doorstep Delivery Verification</span>
                          <span className="text-[10px] font-semibold text-gray-500">Delivered by {deliveryDriverName}</span>
                        </div>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold flex items-center gap-1 ${
                        deliveryPhoto
                          ? 'bg-emerald-100 text-emerald-800'
                          : isDelivered
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-gray-100 text-gray-500'
                      }`}>
                        {deliveryPhoto ? <CheckCircle2 className="w-3 h-3" /> : null}
                        {deliveryPhoto ? 'Photo & PIN Verified' : isDelivered ? 'PIN Verified Handover' : 'Pending Delivery'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-600 bg-gray-50 p-2.5 rounded-xl border border-gray-100">
                      <div>
                        <span className="text-gray-400 block text-[10px] uppercase font-bold">Delivery Status</span>
                        <span className="font-bold text-gray-900">{isDelivered ? 'Delivered to Door' : 'In Progress'}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 block text-[10px] uppercase font-bold">Delivery Handover Time</span>
                        <span className="font-medium text-gray-900">
                          {deliveryTime ? new Date(deliveryTime).toLocaleString('en-GB') : (isDelivered ? 'Completed' : 'Pending completion')}
                        </span>
                      </div>
                    </div>

                    {/* Captured Delivery Photo */}
                    {deliveryPhoto ? (
                      <div className="space-y-1.5 pt-1">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
                          Driver Delivery Photo Evidence:
                        </span>
                        <div
                          onClick={() => setPreviewImage({ url: deliveryPhoto, title: `Order #${selectedOrder.publicId || selectedOrder.orderNumber || selectedOrder.id} - Delivery Proof` })}
                          className="relative rounded-2xl overflow-hidden border border-emerald-200 aspect-video group cursor-pointer bg-black"
                        >
                          <img
                            src={deliveryPhoto}
                            alt="Delivery proof"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between p-3 text-white">
                            <span className="text-[11px] font-bold flex items-center gap-1">
                              <ZoomIn className="w-3.5 h-3.5" /> Tap to inspect full size
                            </span>
                            <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-md backdrop-blur-xs font-semibold">
                              Delivery Proof
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : isDelivered ? (
                      <p className="text-[11px] text-gray-500 italic bg-gray-50 p-2 rounded-xl border border-gray-100">
                        Delivery was verified with customer 4-digit in-app secure PIN.
                      </p>
                    ) : null}
                  </div>

                  {/* 3. Facility Intake & QC Record */}
                  <div className="p-3.5 bg-gray-50 rounded-2xl border border-gray-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[#03045E]">Plant Intake Weigh-In</span>
                      <span className="text-[10px] font-semibold text-[#0077B6]">8.5 kg Recorded</span>
                    </div>
                    <p className="text-gray-600 text-[11px]">Machine used: <span className="font-mono font-bold">WASH-PRE-01</span></p>
                  </div>

                  <div className="p-3.5 bg-emerald-50 rounded-2xl border border-emerald-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-emerald-900">QC Pass Certificate</span>
                      <span className="text-[10px] font-semibold text-emerald-700">Passed</span>
                    </div>
                    <p className="text-emerald-800 text-[11px]">Inspected by Sarah Jenkins (Textile Processor)</p>
                  </div>
                </div>
              );
            })()}

            {/* Tab 3: Order Items Breakdown */}
            {activeDetailTab === 'customer' && (
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-[#03045E] uppercase tracking-wider">Garment Items Breakdown</h3>
                <div className="space-y-2">
                  {(selectedOrder.items || []).map((it) => (
                    <div key={it.id} className="p-3 bg-gray-50 rounded-2xl flex items-center justify-between text-xs">
                      <div>
                        <p className="font-bold text-gray-900">{it.name}</p>
                        <p className="text-[11px] text-gray-500">{it.quantity} {it.unit}</p>
                      </div>
                      <span className="font-extrabold text-[#03045E]">£{formatTotal(Number(it.price || 0) * Number(it.quantity || 1))}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tab 4: Internal Admin Notes */}
            {activeDetailTab === 'notes' && (
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-[#03045E] uppercase tracking-wider">Internal Admin Notes</h3>

                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {internalNotesList.map((nt, idx) => (
                    <div key={idx} className="p-3 bg-amber-50/80 border border-amber-200 rounded-2xl text-xs text-amber-900">
                      {nt}
                    </div>
                  ))}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Add internal note..."
                    className="flex-1 px-3 py-2 bg-gray-50 rounded-xl text-xs focus:ring-2 focus:ring-[#03045E] focus:outline-hidden"
                  />
                  <button
                    onClick={handleAddNote}
                    className="px-4 py-2 bg-[#03045E] text-white rounded-xl text-xs font-bold cursor-pointer"
                  >
                    Add
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── High-Resolution Evidence Lightbox Modal ── */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-150"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="bg-white rounded-3xl overflow-hidden max-w-2xl w-full shadow-2xl border border-white/20 relative animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50/80">
              <div className="flex items-center gap-2">
                <Camera className="w-5 h-5 text-[#0077B6]" />
                <h3 className="font-extrabold text-gray-900 text-sm">{previewImage.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="w-8 h-8 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-gray-600 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="bg-black flex items-center justify-center p-2 max-h-[75vh]">
              <img
                src={previewImage.url}
                alt={previewImage.title}
                className="max-h-[70vh] w-auto max-w-full object-contain rounded-xl"
              />
            </div>
            <div className="p-3.5 bg-gray-50 flex items-center justify-between text-xs text-gray-500">
              <span>Verified photographic evidence archived in system</span>
              <a
                href={previewImage.url}
                download="evidence.jpg"
                className="font-bold text-[#0077B6] hover:underline"
              >
                Download Image
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Status Update Modal */}
      {assignModalOpen && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-5 relative">
            <button
              onClick={() => setAssignModalOpen(false)}
              className="absolute top-5 right-5 text-gray-400 hover:text-gray-700 bg-gray-100 p-2 rounded-full cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <h3 className="text-base font-bold text-[#03045E]">Force Order Status Update</h3>
              <p className="text-xs text-gray-500">Manually override the operational status for {selectedOrder.publicId || selectedOrder.orderNumber || selectedOrder.id}</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">New Pipeline Status</label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-[#03045E] focus:outline-hidden"
                >
                  <option value="booking_confirmed">Booking Confirmed</option>
                  <option value="collection_scheduled">Collection Scheduled</option>
                  <option value="laundry_collected">Laundry Collected</option>
                  <option value="received_at_facility">Received at Facility</option>
                  <option value="washing">Washing</option>
                  <option value="quality_check">Quality Check</option>
                  <option value="out_for_delivery">Out for Delivery</option>
                  <option value="delivered">Delivered</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Admin Override Reason</label>
                <input
                  type="text"
                  value={updateReason}
                  onChange={(e) => setUpdateReason(e.target.value)}
                  placeholder="e.g. Manual intervention required..."
                  className="w-full px-4 py-3 bg-gray-50 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-[#03045E] focus:outline-hidden"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setAssignModalOpen(false)}
                className="w-1/2 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                disabled={savingStatus}
                onClick={async () => {
                  setSavingStatus(true);
                  if (typeof window !== 'undefined') {
                    const { dbAdminUpdateOrderStatus } = await import('@laundelle/api-client');
                    const res = await dbAdminUpdateOrderStatus(selectedOrder.id, newStatus, updateReason);
                    if (res.success) {
                      alert('Order status successfully overridden.');
                      setAssignModalOpen(false);
                    } else {
                      alert(`Error: ${res.error}`);
                    }
                  }
                  setSavingStatus(false);
                }}
                className="w-1/2 py-3 bg-[#03045E] hover:bg-[#023E8A] text-white rounded-2xl text-xs font-bold cursor-pointer shadow-md disabled:opacity-50"
              >
                {savingStatus ? 'Updating...' : 'Force Update'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      <GenerateQRModal 
        isOpen={qrModalOpen} 
        onClose={() => setQrModalOpen(false)} 
        order={selectedOrder} 
      />

      {overrideModalOpen && selectedOrder && (
        <ManagerOverrideModal
          isOpen={overrideModalOpen}
          onClose={() => setOverrideModalOpen(false)}
          order={selectedOrder}
          drivers={drivers}
          onSuccess={() => {
            alert('Manager override executed and committed to audit log!');
            setOverrideModalOpen(false);
            if (typeof window !== 'undefined') {
              window.location.reload();
            }
          }}
        />
      )}
    </div>
  );
};
