import React, { useState } from 'react';
import { FileText, Download, Printer, X, CheckCircle2 } from 'lucide-react';
import { Order } from '@laundelle/types';

interface InvoiceReceiptModalProps {
  isOpen: boolean;
  order: Order | null;
  onClose: () => void;
}

export const InvoiceReceiptModal: React.FC<InvoiceReceiptModalProps> = ({
  isOpen,
  order,
  onClose
}) => {
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  if (!isOpen || !order) return null;

  const handleDownload = () => {
    setDownloadSuccess(true);
    setTimeout(() => {
      setDownloadSuccess(false);
    }, 2500);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto animate-in fade-in">
      <div className="bg-white rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl transition-all border border-gray-100 flex flex-col max-h-[85vh] sm:max-h-[90vh] my-auto">
        {/* Header */}
        <div className="bg-[#002953] text-white p-5 sm:p-6 relative flex items-center justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-[#01BEFE] uppercase tracking-wider mb-0.5">
              <FileText className="w-4 h-4" />
              <span>Official Tax Invoice</span>
            </div>
            <h2 className="text-xl font-heading font-extrabold">Invoice #{order.publicId || order.orderNumber || order.id}</h2>
          </div>

          <button
            onClick={onClose}
            className="text-white/80 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Invoice Printable Document Body */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 min-h-0 space-y-6 text-xs text-gray-700 font-sans">
          {/* Top metadata */}
          <div className="flex justify-between items-start border-b border-gray-100 pb-4">
            <div>
              <strong className="text-sm font-heading font-black block tracking-wider uppercase">
                <span className="text-[#002953]">LAUN</span><span className="text-[#01BEFE]">DELLE</span> Ltd.
              </strong>
              <p className="text-[11px] text-gray-500">14 Buckingham Gate, London SW1E 6LB</p>
              <p className="text-[11px] text-gray-500">VAT Registration: GB 982 4410 88</p>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-gray-400 block">Invoice Date</span>
              <p className="font-bold text-gray-900">{new Date(order.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
              <span className="inline-block mt-1 bg-[#01BEFE]/15 text-[#002953] text-[10px] font-bold px-2 py-0.5 rounded">
                PAID IN FULL
              </span>
            </div>
          </div>

          {/* Customer and Pickup Details */}
          <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-2xl">
            <div>
              <span className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Billed To</span>
              <strong className="text-gray-900 block">{order.addressLabel} Client</strong>
              <p className="text-gray-600 text-[11px] mt-0.5">{order.address}</p>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-gray-400 block mb-1">Service Timeline</span>
              <p className="text-gray-600">Collection: <strong>{order.pickupDate}</strong></p>
              <p className="text-gray-600">Delivery: <strong>{order.deliveryDate}</strong></p>
              <p className="text-gray-600">Payment: <strong>{order.paymentMethod}</strong></p>
            </div>
          </div>

          {/* Itemized Table */}
          <div className="border border-gray-100 rounded-2xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-600 font-bold border-b border-gray-100">
                <tr>
                  <th className="p-3">Description</th>
                  <th className="p-3 text-center">Qty</th>
                  <th className="p-3 text-right">Unit Rate</th>
                  <th className="p-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {order.items.map((it) => (
                  <tr key={it.id}>
                    <td className="p-3">
                      <strong className="text-gray-900 block">{it.name}</strong>
                      <span className="text-[10px] text-gray-500">
                        {it.customisation?.detergent} • {it.customisation?.fragrance}
                      </span>
                    </td>
                    <td className="p-3 text-center font-medium">{it.quantity} {it.unit}</td>
                    <td className="p-3 text-right">£{it.price.toFixed(2)}</td>
                    <td className="p-3 text-right font-bold text-gray-900">£{(it.price * it.quantity).toFixed(2)}</td>
                  </tr>
                ))}

                {order.additionsTotal && order.additionsTotal > 0 ? (
                  <tr>
                    <td className="p-3 text-gray-600" colSpan={3}>Care Add-ons & Targeted Treatments</td>
                    <td className="p-3 text-right font-bold text-gray-900">+£{order.additionsTotal.toFixed(2)}</td>
                  </tr>
                ) : null}

                {order.expressFee > 0 && (
                  <tr>
                    <td className="p-3 text-gray-600" colSpan={3}>Express Same-Day Turnaround</td>
                    <td className="p-3 text-right font-bold text-gray-900">+£{order.expressFee.toFixed(2)}</td>
                  </tr>
                )}

                <tr>
                  <td className="p-3 text-gray-600" colSpan={3}>Doorstep Collection & Delivery Courier</td>
                  <td className="p-3 text-right font-bold text-[#01BEFE]">FREE</td>
                </tr>

                {order.discount > 0 && (
                  <tr className="text-[#01BEFE] font-bold">
                    <td className="p-3" colSpan={3}>Discount ({order.promoCodeApplied || 'Voucher'})</td>
                    <td className="p-3 text-right">-£{order.discount.toFixed(2)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Subtotal & Total calculations */}
          <div className="border-t border-gray-100 pt-3 space-y-1 text-right text-xs">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal:</span>
              <span>£{Number(order.subtotal || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>VAT / Tax (5% included):</span>
              <span>£{Number(order.tax || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-base font-extrabold text-gray-900 pt-2 border-t border-gray-100">
              <span>Total Paid:</span>
              <span className="text-[#002953]">£{Number(order.total ?? (order as any).total_price ?? (order as any).amount ?? 0).toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-gray-50 p-4 border-t border-gray-100 flex items-center justify-between gap-3">
          <button
            onClick={handlePrint}
            className="px-4 py-2.5 bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Invoice</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="px-5 py-2.5 bg-[#002953] hover:bg-[#002953] text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-sm cursor-pointer"
            >
              {downloadSuccess ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#01BEFE]" />
                  <span>Invoice Downloaded!</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>Download PDF</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
