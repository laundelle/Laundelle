import React, { useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { X, Printer, Package, CheckCircle2, Loader2, Building2 } from 'lucide-react';

interface GenerateQRModalProps {
    isOpen: boolean;
    onClose: () => void;
    order: any;
}

export const GenerateQRModal: React.FC<GenerateQRModalProps> = ({ isOpen, onClose, order }) => {
    const printRef = useRef<HTMLDivElement>(null);
    const [confirming, setConfirming] = useState(false);
    const [confirmed, setConfirmed] = useState(false);

    if (!isOpen || !order) return null;

    const orderId = order.id || order._id || order.orderCode || 'ORD-UNKNOWN';
    const customerName = (order.customer_name && order.customer_name !== 'Valued Customer' && order.customer_name !== 'Customer')
        ? order.customer_name
        : (order.customerName && order.customerName !== 'Valued Customer' && order.customerName !== 'Customer')
        ? order.customerName
        : (order.contactDetails ? `${order.contactDetails.firstName || ''} ${order.contactDetails.lastName || ''}`.trim() : '')
        || order.user_name
        || order.customer?.name
        || order.userName
        || 'Customer';
    const serviceName = order.items?.[0]?.name || (order.service ? order.service : 'Laundry Service');

    const handlePrint = () => {
        if (printRef.current) {
            const printContent = printRef.current.innerHTML;
            const originalContent = document.body.innerHTML;

            // Simple print logic for browser
            document.body.innerHTML = printContent;
            window.print();
            document.body.innerHTML = originalContent;
            window.location.reload(); // Quick reset of React state after generic print
        }
    };

    const handleConfirmHandover = async () => {
        setConfirming(true);
        try {
            const rawSession = localStorage.getItem('l2u_auth_session');
            const token = rawSession ? JSON.parse(rawSession).token : null;
            const res = await fetch(`/api/v1/driver/jobs/${orderId}/handover/confirm`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: JSON.stringify({ packageQr: orderId })
            });
            const json = await res.json();
            if (res.ok && json.success) {
                setConfirmed(true);
                window.dispatchEvent(new CustomEvent('l2u_driver_assignments_changed'));
                window.dispatchEvent(new CustomEvent('l2u_orders_change'));
                setTimeout(() => {
                    onClose();
                    setConfirmed(false);
                }, 1500);
            } else {
                alert(json.error || 'Failed to confirm handover');
            }
        } catch (e: any) {
            alert(e.message || 'Handover confirmation error');
        } finally {
            setConfirming(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
            <div className="bg-white w-full max-w-sm max-h-[85vh] sm:max-h-[90vh] rounded-3xl p-5 sm:p-6 shadow-2xl relative space-y-4 animate-in fade-in zoom-in duration-300 overflow-y-auto my-auto">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 p-2 rounded-full cursor-pointer transition-colors"
                >
                    <X className="w-5 h-5" />
                </button>

                <div className="flex items-center gap-3 border-b pb-4">
                    <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center shrink-0">
                        <Package className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="text-base font-black text-slate-900">Order Handover QR</h3>
                        <p className="text-[11px] text-slate-500 font-medium">Scan or confirm handover at facility</p>
                    </div>
                </div>

                <div 
                    ref={printRef}
                    className="flex flex-col items-center justify-center p-6 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200"
                >
                    <QRCodeCanvas 
                        value={orderId} 
                        size={256}
                        bgColor="#ffffff" 
                        fgColor="#000000" 
                        level="M"
                        includeMargin={true}
                    />
                    <div className="mt-4 text-center">
                        <p className="text-sm font-black text-slate-900 tracking-wider">{orderId}</p>
                        <p className="text-xs text-slate-500 font-medium mt-0.5">{customerName}</p>
                        <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-wider">{serviceName}</p>
                    </div>
                </div>

                <div className="space-y-2">
                    <button
                        onClick={handleConfirmHandover}
                        disabled={confirming || confirmed}
                        className={`w-full py-3 rounded-2xl font-black text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md ${
                            confirmed
                                ? 'bg-emerald-600 text-white'
                                : 'bg-[#01BEFE] hover:bg-[#00a6e0] text-white'
                        }`}
                    >
                        {confirming ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : confirmed ? (
                            <CheckCircle2 className="w-4 h-4" />
                        ) : (
                            <Building2 className="w-4 h-4 text-white" />
                        )}
                        <span>{confirmed ? 'Handover Confirmed!' : confirming ? 'Confirming...' : 'Confirm Handover to Plant'}</span>
                    </button>

                    <button
                        onClick={handlePrint}
                        className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 rounded-2xl font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                        <Printer className="w-4 h-4" />
                        <span>Print QR Label</span>
                    </button>
                </div>
            </div>
        </div>
    );
};
