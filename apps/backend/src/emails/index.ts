import React from 'react';
import { render } from '@react-email/components';
import { sendEmail } from '@/lib/email';
import { WelcomeEmail, WelcomeEmailProps } from './WelcomeEmail';
import { EmailVerificationEmail, EmailVerificationEmailProps } from './EmailVerificationEmail';
import { OrderConfirmedEmail, OrderConfirmedEmailProps, OrderItemSummary } from './OrderConfirmedEmail';
import { OrderCompletedEmail, OrderCompletedEmailProps, CompletedOrderItem } from './OrderCompletedEmail';

export * from './WelcomeEmail';
export * from './EmailVerificationEmail';
export * from './OrderConfirmedEmail';
export * from './OrderCompletedEmail';

const DEFAULT_APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.CUSTOMER_APP_URL || 'https://laundelle.com';

// ==========================================
// RENDER HELPERS
// ==========================================

export async function renderWelcomeEmail(props: WelcomeEmailProps = {}): Promise<string> {
  const element = React.createElement(WelcomeEmail, {
    appUrl: DEFAULT_APP_URL,
    ...props,
  });
  return await render(element);
}

export async function renderVerificationEmail(props: EmailVerificationEmailProps = {}): Promise<string> {
  const element = React.createElement(EmailVerificationEmail, {
    appUrl: DEFAULT_APP_URL,
    ...props,
  });
  return await render(element);
}

export async function renderOrderConfirmedEmail(props: OrderConfirmedEmailProps = {}): Promise<string> {
  const element = React.createElement(OrderConfirmedEmail, {
    appUrl: DEFAULT_APP_URL,
    ...props,
  });
  return await render(element);
}

export async function renderOrderCompletedEmail(props: OrderCompletedEmailProps = {}): Promise<string> {
  const element = React.createElement(OrderCompletedEmail, {
    appUrl: DEFAULT_APP_URL,
    ...props,
  });
  return await render(element);
}

// ==========================================
// SEND DISPATCHERS
// ==========================================

/**
 * 1. Send Welcome Email with WELCOME20 coupon code
 */
export async function sendWelcomeEmail({
  to,
  customerName = 'Valued Customer',
  couponCode = 'WELCOME20',
  discountPercent = 20,
  appUrl = DEFAULT_APP_URL,
}: {
  to: string;
  customerName?: string;
  couponCode?: string;
  discountPercent?: number;
  appUrl?: string;
}) {
  const html = await renderWelcomeEmail({
    customerName,
    couponCode,
    discountPercent,
    appUrl,
  });

  return await sendEmail({
    to,
    subject: `Welcome to Laundelle — Enjoy ${discountPercent}% Off Your First Order (Code: ${couponCode})`,
    html,
  });
}

/**
 * 2. Send Email Verification Mail with account verification button
 */
export async function sendVerificationEmail({
  to,
  customerName = 'Valued Customer',
  verificationUrl,
  appUrl = DEFAULT_APP_URL,
}: {
  to: string;
  customerName?: string;
  verificationUrl?: string;
  appUrl?: string;
}) {
  const targetUrl = verificationUrl || `${appUrl}/verify-email?email=${encodeURIComponent(to)}`;

  const html = await renderVerificationEmail({
    customerName,
    email: to,
    verificationUrl: targetUrl,
    appUrl,
  });

  return await sendEmail({
    to,
    subject: 'Verify Your Email Address — Laundelle',
    html,
  });
}

export type SendOrderConfirmedEmailParams = {
  to: string;
  customerName?: string;
  order?: any;
  appUrl?: string;
} & Partial<OrderConfirmedEmailProps>;

/**
 * 3. Send Order Confirmed Email with Order Details & Pickup OTP Only
 */
export async function sendOrderConfirmedEmail(params: SendOrderConfirmedEmailParams) {
  const {
    to,
    customerName = 'Valued Customer',
    order,
    appUrl = DEFAULT_APP_URL,
    ...restProps
  } = params;

  const o = order || {};
  const orderId = restProps.orderNumber || restProps.orderId || o.publicId || o.orderNumber || o.id || 'Order';
  const pickupOtp = String(
    restProps.pickupOtp ||
    o.pickup_otp ||
    o.pickup_pin ||
    o.pickupOtp ||
    o.pickupPin ||
    '----'
  );

  const rawItems = restProps.items || o.items || o.orderItems || [];
  const items: OrderItemSummary[] = rawItems.map((it: any) => ({
    name: it.name || it.serviceName || 'Laundry Service',
    quantity: Number(it.quantity || 1),
    price: Number(it.price || 0),
    unit: it.unit || '',
    selectedOption: it.selectedOption || '',
  }));

  const subtotal = restProps.subtotal !== undefined
    ? restProps.subtotal
    : Number(o.subtotal ?? o.total ?? 0);
  const discount = restProps.discount !== undefined
    ? restProps.discount
    : Number(o.discount ?? 0);
  const total = restProps.total !== undefined
    ? restProps.total
    : Number(o.total ?? (o as any).total_price ?? (o as any).amount ?? 0);

  const html = await renderOrderConfirmedEmail({
    customerName,
    orderId,
    orderNumber: orderId,
    pickupOtp,
    pickupDate: restProps.pickupDate || o.collectionDate || o.pickupDate || 'Tomorrow',
    pickupSlot: restProps.pickupSlot || restProps.pickupTimeSlot || o.collectionTimeSlot || o.pickupSlot || o.pickupTime || '10:00 AM - 12:00 PM',
    deliveryDate: restProps.deliveryDate || restProps.deliveryEstimate || o.deliveryDate || 'In 2 Days',
    deliverySlot: restProps.deliverySlot || o.deliveryTimeSlot || o.deliverySlot || o.deliveryTime || '10:00 AM - 12:00 PM',
    pickupAddress: restProps.pickupAddress || o.address || o.addressLabel || 'Registered Address',
    items,
    subtotal,
    discount,
    total,
    paymentMethod: restProps.paymentMethod || o.paymentMethod || 'Online Card',
    appUrl,
  });

  return await sendEmail({
    to,
    subject: `Order Confirmed #${orderId} — Pickup OTP Inside`,
    html,
  });
}

export type SendOrderCompletedEmailParams = {
  to: string;
  customerName?: string;
  order?: any;
  appUrl?: string;
} & Partial<OrderCompletedEmailProps>;

/**
 * 4. Send Order Completed Email with Tax Invoice, Total Bill Breakdown & Order Details
 */
export async function sendOrderCompletedEmail(params: SendOrderCompletedEmailParams) {
  const {
    to,
    customerName = 'Valued Customer',
    order,
    appUrl = DEFAULT_APP_URL,
    ...restProps
  } = params;

  const o = order || {};
  const orderId = restProps.orderNumber || restProps.orderId || o.publicId || o.orderNumber || o.id || 'Order';
  const invoiceNumber = restProps.invoiceNumber || `INV-${String(orderId).replace(/[^a-zA-Z0-9]/g, '')}`;

  const rawItems = restProps.items || o.items || o.orderItems || [];
  const items: CompletedOrderItem[] = rawItems.map((it: any) => ({
    name: it.name || it.serviceName || 'Laundry Service',
    quantity: Number(it.quantity || 1),
    price: Number(it.price || it.unitPrice || 0),
    unitPrice: Number(it.unitPrice || it.price || 0),
    totalPrice: Number(it.totalPrice || (Number(it.price || it.unitPrice || 0) * Number(it.quantity || 1))),
    unit: it.unit || '',
    selectedOption: it.selectedOption || '',
  }));

  const subtotal = restProps.subtotal !== undefined
    ? restProps.subtotal
    : Number(o.subtotal ?? o.total ?? 0);
  const discount = restProps.discount !== undefined
    ? restProps.discount
    : Number(o.discount ?? 0);
  const additionalCharges = restProps.additionalCharges !== undefined
    ? restProps.additionalCharges
    : (o.additionalCharge?.status === 'paid' ? Number(o.additionalCharge.additionalAmount || 0) : 0);
  const additionalChargeReason = restProps.additionalChargeReason || o.additionalCharge?.reason || '';
  const total = restProps.total !== undefined
    ? restProps.total
    : (Number(o.total ?? (o as any).total_price ?? (o as any).amount ?? 0) + Number(additionalCharges || 0));

  const completedDate = restProps.completedDate || restProps.completedAt || (o.delivered_at
    ? new Date(o.delivered_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : 'Today');

  const html = await renderOrderCompletedEmail({
    customerName,
    orderId,
    orderNumber: orderId,
    invoiceNumber,
    completedDate,
    completedAt: completedDate,
    deliveryAddress: restProps.deliveryAddress || o.address || o.addressLabel || 'Registered Address',
    driverName: restProps.driverName || restProps.deliveryCourierName || o.driver?.name || o.driver_name || 'Delivery Courier',
    deliveryCourierName: restProps.deliveryCourierName || restProps.driverName || o.driver?.name || o.driver_name || 'Delivery Courier',
    items,
    subtotal,
    discount,
    additionalCharges,
    additionalChargeReason,
    total,
    paymentMethod: restProps.paymentMethod || o.paymentMethod || 'Online Card',
    appUrl,
  });

  return await sendEmail({
    to,
    subject: `Order Delivered & Completed #${orderId} — Your Invoice & Receipt`,
    html,
  });
}
