'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { ActiveTab, CartItem, ServiceItem, Order, UserProfile, CustomerNotification } from '@laundelle/types';
import { LAUNDELLE_IMAGES, getOptimizedImageUrl } from '@laundelle/config';
import { User } from 'lucide-react';

import dynamic from 'next/dynamic';

import { Navbar } from '../components/Navbar';
import { MobileNav } from '../components/MobileNav';
import { HomeView } from '../components/HomeView';
import { Footer } from '../components/Footer';

// Code-split secondary views (only loaded on navigation)
const ServicesView = dynamic(() => import('../components/ServicesView').then((m) => m.ServicesView), {
  loading: () => <div className="min-h-[400px] flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" /></div>,
});
const OrdersView = dynamic(() => import('../components/OrdersView').then((m) => m.OrdersView), {
  loading: () => <div className="min-h-[400px] flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" /></div>,
});
const SupportView = dynamic(() => import('../components/SupportView').then((m) => m.SupportView));
const NotificationsView = dynamic(() => import('../components/NotificationsView').then((m) => m.NotificationsView));
const AccountView = dynamic(() => import('../components/AccountView').then((m) => m.AccountView));
const AIAssistantView = dynamic(() => import('../components/AIAssistantView').then((m) => m.AIAssistantView));

// Code-split modals and drawers (only loaded when triggered)
const CartDrawer = dynamic(() => import('../components/CartDrawer').then((m) => m.CartDrawer));
const SchedulePickupModal = dynamic(() => import('../components/SchedulePickupModal').then((m) => m.SchedulePickupModal));
const PostcodeCheckerModal = dynamic(() => import('../components/PostcodeCheckerModal').then((m) => m.PostcodeCheckerModal));
const CustomerAuthModal = dynamic(() => import('../components/CustomerAuthModal').then((m) => m.CustomerAuthModal));
const CompleteProfileModal = dynamic(() => import('../components/CompleteProfileModal').then((m) => m.CompleteProfileModal));
const InvoiceReceiptModal = dynamic(() => import('../components/InvoiceReceiptModal').then((m) => m.InvoiceReceiptModal));
const OrderPlacedAnimationModal = dynamic(() => import('../components/OrderPlacedAnimationModal').then((m) => m.OrderPlacedAnimationModal));
const RescheduleCancelModal = dynamic(() => import('../components/RescheduleCancelModal').then((m) => m.RescheduleCancelModal));
const AdditionalChargeModal = dynamic(() => import('../components/AdditionalChargeModal').then((m) => m.AdditionalChargeModal));
const ServiceCustomizeModal = dynamic(() => import('../components/ServiceCustomizeModal').then((m) => m.ServiceCustomizeModal));
const PaymentStatus = dynamic(() => import('../components/payment/PaymentStatus').then((m) => m.PaymentStatus));
import { useAuth0 } from '@auth0/auth0-react';
import { parseCurrentRoute, navigateToRoute, AuthSession, UserRole } from '@laundelle/utils';
import {
  getStoredSession,
  dbFetchProfile,
  dbUpdateProfile,
  dbUpdatePreferences,
  dbCreateAddress,
  dbUpdateAddress,
  dbDeleteAddress,
  dbFetchOrders,
  dbFetchNotifications,
  clearSession,
  dbFetchServices,
  dbCancelOrder,
  dbAuth0Sync,
  dbFetchSession,
  setCsrfToken,
  getAuthToken,
  apiFetch,
  authHeaders
} from '@laundelle/api-client';

export default function App({ initialTab }: { initialTab?: string }) {
  // Auth0 Hook at component root
  const {
    isAuthenticated: isAuth0Authenticated,
    user: auth0User,
    isLoading: isAuth0Loading,
    error: auth0Error,
    loginWithRedirect,
    logout: auth0Logout,
    getAccessTokenSilently,
    getIdTokenClaims,
  } = useAuth0();

  const [activeTab, setActiveTab] = useState<ActiveTab>((initialTab as ActiveTab) || 'home');

  // Sync initial tab from URL on client mount without causing SSR mismatch
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.has('payment')) {
        setActiveTab('orders');
        return;
      }
      const p = window.location.pathname.replace(/^\//, '');
      if (p === 'orders') setActiveTab('orders');
      else if (p === 'services') setActiveTab('services');
      else if (p === 'support') setActiveTab('support');
      else if (p === 'notifications') setActiveTab('notifications');
      else if (p === 'account') setActiveTab('account');
      else if (p === 'ai') setActiveTab('assistant');
    }
  }, []);


  // Listen for custom tab navigation events (e.g. from post-Auth0 redirect)
  React.useEffect(() => {
    const handleNavigateTab = (e: any) => {
      if (e.detail && ['home', 'services', 'orders', 'support', 'notifications', 'account', 'assistant'].includes(e.detail)) {
        setActiveTab(e.detail as ActiveTab);
      }
    };
    window.addEventListener('l2u_navigate_tab', handleNavigateTab);
    return () => window.removeEventListener('l2u_navigate_tab', handleNavigateTab);
  }, []);

  // Display toast if Auth0 returns an error query parameter or auth fails
  React.useEffect(() => {
    if (auth0Error) {
      console.error('[Auth0 Error]', auth0Error);
      showToast(`Auth0 Error: ${auth0Error.message || 'Authentication failed'}`);
    }
  }, [auth0Error]);




  const [services, setServices] = useState<ServiceItem[]>([]);

  // Fetch Services from Database
  React.useEffect(() => {
    dbFetchServices().then(data => {
      setServices(data || []);
    });
  }, []);
  const [orders, setOrders] = useState<Order[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [notifications, setNotifications] = useState<CustomerNotification[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const isCartRestored = React.useRef(false);

  // Restore cart from localStorage safely on client mount to prevent SSR hydration mismatch
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem('laundelle_user_cart');
      if (saved) {
        setCart(JSON.parse(saved));
      }
    } catch (e) {
      console.error('Failed to restore cart from localStorage:', e);
    } finally {
      isCartRestored.current = true;
    }
  }, []);

  // Sync cart to localStorage whenever it changes (only after initial restore)
  React.useEffect(() => {
    if (!isCartRestored.current) return;
    try {
      if (cart.length > 0) {
        localStorage.setItem('laundelle_user_cart', JSON.stringify(cart));
      } else {
        localStorage.removeItem('laundelle_user_cart');
      }
    } catch (e) {
      console.error('Failed to sync cart to localStorage:', e);
    }
  }, [cart]);

  // Navigation & Preselection Context
  const [selectedTrackingOrderId, setSelectedTrackingOrderId] = useState<string | null>(null);

  // Modals & Drawers
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [postcodeModalOpen, setPostcodeModalOpen] = useState(false);
  const [activeInvoiceOrder, setActiveInvoiceOrder] = useState<Order | null>(null);
  const [rescheduleCancelOrder, setRescheduleCancelOrder] = useState<Order | null>(null);
  const [rescheduleCancelMode, setRescheduleCancelMode] = useState<'reschedule' | 'cancel' | 'reschedule_pickup' | 'reschedule_delivery'>('reschedule');
  const [activeChargeOrder, setActiveChargeOrder] = useState<Order | null>(null);
  const [serviceToCustomize, setServiceToCustomize] = useState<ServiceItem | null>(null);
  const [targetServiceQuery, setTargetServiceQuery] = useState<string | null>(null);
  const [paymentResult, setPaymentResult] = useState<{
    status: 'processing' | 'success' | 'failed';
    orderId?: string;
    amount?: number | string;
    currency?: string;
    error?: string;
  } | null>(null);
  const [placedOrderForModal, setPlacedOrderForModal] = useState<Order | null>(null);

  // Toast banner
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  const unreadNotificationsCount = notifications.filter(n => !n.read).length;

  const handleNavigate = (tab: ActiveTab) => {
    setActiveTab(tab);
    setTargetServiceQuery(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Sync URL pathname with activeTab
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    // Critical: Do NOT rewrite URL if Auth0 callback parameters or Stripe callback parameters are present!
    // Overriding the URL while Auth0 is parsing code/state or error parameters wipes them and breaks authentication.
    if (
      isAuth0Loading ||
      window.location.search.includes('code=') ||
      window.location.search.includes('state=') ||
      window.location.search.includes('error=') ||
      window.location.search.includes('payment=')
    ) {
      return;
    }

    let path = '/home';
    if (activeTab === 'services') path = '/services';
    else if (activeTab === 'orders') path = '/orders';
    else if (activeTab === 'support') path = '/support';
    else if (activeTab === 'notifications') path = '/notifications';
    else if (activeTab === 'account') path = '/account';
    else if (activeTab === 'assistant') path = '/ai';

    if (window.location.pathname !== path) {
      window.history.pushState(null, '', path);
    }
  }, [activeTab]);

  // Direct Book Now navigation with service pre-selected
  const handleStartBookingWithService = (serviceIdOrName?: string) => {
    setActiveTab('services');
    if (serviceIdOrName) {
      setTargetServiceQuery(serviceIdOrName);
    } else {
      setTargetServiceQuery(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Cart operations (Guests can freely add items without sign-in prompt)
  const handleAddToCart = (
    service: ServiceItem,
    quantity: number,
    selectedOption?: string,
    specialInstructions?: string
  ) => {
    const existingIndex = cart.findIndex(
      (i) => i.serviceId === service.id && i.selectedOption === selectedOption
    );

    if (existingIndex > -1) {
      const updated = [...cart];
      updated[existingIndex].quantity += quantity;
      setCart(updated);
    } else {
      const newItem: CartItem = {
        id: `cart-${Date.now()}`,
        serviceId: service.id,
        name: service.name,
        price: service.price,
        unit: service.unit,
        quantity,
        selectedOption,
        specialInstructions,
        image: service.image,
      };
      setCart([...cart, newItem]);
    }

    showToast(`Added ${service.name} to cart!`);
  };

  const handleUpdateCartQuantity = (id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.id === id) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const handleRemoveCartItem = (id: string) => {
    setCart((prev) => prev.filter((item) => item.id !== id));
  };

  const handleClearCart = () => {
    setCart([]);
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('laundelle_user_cart');
      } catch { }
    }
  };

  const handleOrderPlaced = (newOrder: Order) => {
    // Clear cart upon successful order placement
    handleClearCart();


    setOrders((prev) => [newOrder, ...prev]);
    setSelectedTrackingOrderId(newOrder.id);

    // Add booking confirmed notification
    const newNotif: CustomerNotification = {
      id: `notif-${Date.now()}`,
      title: '✅ Booking Confirmed',
      message: `Your collection #${newOrder.id} is scheduled for ${newOrder.pickupDate}. Driver will arrive in your slot.`,
      date: 'Just now',
      category: 'order_status',
      read: false,
      orderId: newOrder.id,
      actionTab: 'orders',
    };
    setNotifications((prev) => [newNotif, ...prev]);

    // Show PaymentStatus success UI with confetti
    setPaymentResult({
      status: 'success',
      orderId: newOrder.publicId || newOrder.orderNumber || newOrder.id,
      amount: newOrder.total ?? (newOrder as any).total_price ?? (newOrder as any).amount,
      currency: '£',
    });

    // Navigate to Orders tab (tracking is now integrated there)
    setActiveTab('orders');
    showToast(`✅ Collection #${newOrder.id} scheduled successfully!`);
  };

  const handleReOrder = (pastOrder: Order) => {
    setCart([...pastOrder.items]);
    setCartDrawerOpen(true);
    showToast(`Loaded ${pastOrder.items.length} items from #${pastOrder.id} into cart.`);
  };

  const handleOrderCancelled = async (orderId: string, reason: string = 'Customer requested cancellation') => {
    setOrders(orders.map(o => o.id === orderId ? { ...o, status: 'cancelled' as const, statusLabel: 'Cancelled', cancelReason: reason } : o));
    showToast(`Order #${orderId} has been cancelled.`);
    await dbCancelOrder(authSession.user?.id || 'guest', orderId, reason);
  };

  const handleOrderRescheduled = (orderId: string, newDate: string, newTime: string, mode?: string) => {
    if (mode === 'reschedule_delivery') {
      setOrders(orders.map(o => o.id === orderId ? { ...o, deliveryDate: newDate, deliverySlot: newTime, deliveryTime: newTime } : o));
      showToast(`Delivery for Order #${orderId} rescheduled to ${newDate} (${newTime}).`);
    } else {
      setOrders(orders.map(o => o.id === orderId ? { ...o, pickupDate: newDate, pickupSlot: newTime, pickupTime: newTime } : o));
      showToast(`Pickup for Order #${orderId} rescheduled to ${newDate} (${newTime}).`);
    }
  };

  // Auth Session State
  const [authSession, setAuthSession] = useState<AuthSession>({
    role: null,
    user: null,
    isAuthenticated: false,
  });

  const bffCheckedRef = React.useRef(false);
  const dataFetchedForUserRef = React.useRef<string | null>(null);

  const updateAuthSessionIfChanged = React.useCallback((newSession: AuthSession) => {
    setAuthSession((prev) => {
      if (
        prev.isAuthenticated === newSession.isAuthenticated &&
        prev.role === newSession.role &&
        prev.user?.id === newSession.user?.id &&
        prev.user?.name === newSession.user?.name &&
        prev.user?.email === newSession.user?.email
      ) {
        return prev;
      }
      return newSession;
    });
  }, []);

  // Initialize session via secure BFF cookie endpoint on mount
  React.useEffect(() => {
    if (bffCheckedRef.current) return;
    if (isAuth0Loading) return;
    if (isAuth0Authenticated) {
      bffCheckedRef.current = true;
      return;
    }

    bffCheckedRef.current = true;
    dbFetchSession().then((sess) => {
      if (sess.isAuthenticated && sess.user) {
        if (sess.csrfToken) {
          setCsrfToken(sess.csrfToken);
        }
        updateAuthSessionIfChanged({
          role: 'customer',
          user: {
            id: sess.user.id,
            name: sess.user.name,
            email: sess.user.email,
            role: 'customer',
            roleLabel: 'Customer Account',
          },
          isAuthenticated: true,
        });
      } else if (!getAuthToken()) {
        const stored = getStoredSession();
        if (stored && !stored.token) {
          clearSession();
          updateAuthSessionIfChanged({ role: null, user: null, isAuthenticated: false });
        }
      }
    }).catch(() => { });
  }, [isAuth0Loading, isAuth0Authenticated, updateAuthSessionIfChanged]);

  const handleOpenCustomerAuth = (_screenHint?: 'signup') => {
    try {
      if (typeof window !== 'undefined' && cartDrawerOpen) {
        localStorage.setItem('laundelle_open_cart', 'true');
      }
    } catch { }
    setCustomerAuthOpen(true);
  };

  const handleDirectAuth0Login = (connection?: string, screenHint?: 'signup') => {
    try {
      if (typeof window !== 'undefined' && cartDrawerOpen) {
        localStorage.setItem('laundelle_open_cart', 'true');
      }
    } catch { }
    const authParams: any = {};
    if (connection) authParams.connection = connection;
    if (screenHint) authParams.screen_hint = screenHint;
    loginWithRedirect({
      appState: {
        returnTo: typeof window !== 'undefined' && window.location.pathname !== '/' ? window.location.pathname : '/home',
        tab: activeTab,
      },
      authorizationParams: authParams,
    }).catch(() => {
      loginWithRedirect({
        appState: {
          returnTo: typeof window !== 'undefined' && window.location.pathname !== '/' ? window.location.pathname : '/home',
          tab: activeTab,
        },
      });
    });
  };

  // Sync Auth0 authenticated user into backend and app session
  React.useEffect(() => {
    let isCancelled = false;

    const syncAuth0 = async () => {
      if (!isAuth0Loading && isAuth0Authenticated && auth0User) {
        const email = auth0User.email || '';
        const name = auth0User.name || auth0User.nickname || email.split('@')[0] || 'Customer';
        const sub = auth0User.sub || '';
        const picture = auth0User.picture;

        try {
          const nowSec = Math.floor(Date.now() / 1000);
          let idClaims = await getIdTokenClaims().catch(() => undefined);

          // If the cached ID token claims are missing or expired (with 60s buffer),
          // refresh silently to fetch renewed tokens from Auth0.
          if (!idClaims?.__raw || !idClaims.exp || idClaims.exp <= nowSec + 60) {
            try {
              await getAccessTokenSilently({ cacheMode: 'off' });
              idClaims = await getIdTokenClaims().catch(() => undefined);
            } catch (silentErr) {
              console.warn('[AppClient] Silent token refresh attempt:', silentErr);
            }
          }

          let accessToken = idClaims?.__raw || (await getAccessTokenSilently().catch(() => undefined));
          let syncResult = await dbAuth0Sync({ email, name, sub, picture, portal: 'customer' }, accessToken);
          if (isCancelled) return;

          // If backend rejected token as expired or invalid, try a force refresh recovery once
          if (syncResult.error && (syncResult.error.toLowerCase().includes('expired') || syncResult.error.toLowerCase().includes('invalid'))) {
            try {
              await getAccessTokenSilently({ cacheMode: 'off' });
              const freshClaims = await getIdTokenClaims().catch(() => undefined);
              if (freshClaims?.__raw && freshClaims.exp && freshClaims.exp > nowSec + 60) {
                syncResult = await dbAuth0Sync({ email, name, sub, picture, portal: 'customer' }, freshClaims.__raw);
              }
            } catch {
              // Forced refresh failed
            }
          }

          if (isCancelled) return;

          if (syncResult.error) {
            console.warn('[AppClient] Customer authentication synchronization warning:', syncResult.error);
            clearSession();
            setAuthSession({ role: null, user: null, isAuthenticated: false });

            // If token has expired and cannot be renewed, purge stale Auth0 local tokens so the user is not stuck
            if (syncResult.error.toLowerCase().includes('expired') || syncResult.error.toLowerCase().includes('invalid')) {
              try {
                if (typeof window !== 'undefined') {
                  Object.keys(localStorage).forEach(k => {
                    if (k.startsWith('@@auth0spajs@@')) localStorage.removeItem(k);
                  });
                }
                auth0Logout?.({ logoutParams: { returnTo: typeof window !== 'undefined' ? window.location.origin : undefined } });
              } catch { }
              showToast('ℹ️ Your session has expired. Please sign in again.');
            } else {
              showToast(`⚠️ ${syncResult.error}`);
            }
            return;
          }

          if (syncResult.user && syncResult.token) {
            const returnedRole = syncResult.user.role || 'customer';
            if (['driver', 'processor', 'manager', 'plant_manager'].includes(returnedRole)) {
              console.warn('[AppClient] Received operational staff role in Customer Portal:', returnedRole);
              clearSession();
              updateAuthSessionIfChanged({ role: null, user: null, isAuthenticated: false });
              showToast('⚠️ Operational staff accounts cannot be used in the Customer Portal.');
              return;
            }

            if (syncResult.csrfToken) {
              setCsrfToken(syncResult.csrfToken);
            }

            updateAuthSessionIfChanged({
              role: 'customer',
              user: {
                id: syncResult.user.id,
                name: syncResult.user.name || name,
                email: syncResult.user.email || email,
                role: 'customer',
                roleLabel: 'Customer Account',
              },
              isAuthenticated: true,
            });

            // Prompt user for Username & Mobile Number if missing (e.g. after Google OAuth signup)
            if (syncResult.needsProfileCompletion || !syncResult.user?.phone) {
              setCompleteProfileModalOpen(true);
            }
          }
        } catch (err) {
          console.error('[AppClient] Failed to sync Auth0 session with backend:', err);
        }

        // Restore cart drawer if user was checking out before login redirect
        try {
          if (typeof window !== 'undefined') {
            const shouldOpenCart = localStorage.getItem('laundelle_open_cart') === 'true';
            if (shouldOpenCart) {
              localStorage.removeItem('laundelle_open_cart');
              setCartDrawerOpen(true);
            }
          }
        } catch { }
      } else if (!isAuth0Loading && !isAuth0Authenticated) {
        // If Auth0 finished loading and user is not authenticated with Auth0,
        // verify whether any stored session actually has a valid backend session cookie/token
        const stored = getStoredSession();
        if (stored) {
          const sess = await dbFetchSession();
          if (!sess.isAuthenticated && !stored.token) {
            clearSession();
            updateAuthSessionIfChanged({ role: null, user: null, isAuthenticated: false });
          }
        }
      }
    };

    syncAuth0();

    return () => {
      isCancelled = true;
    };
  }, [isAuth0Loading, isAuth0Authenticated, auth0User, updateAuthSessionIfChanged]);

  // Restore MongoDB auth session from localStorage on mount
  React.useEffect(() => {
    const restoreSession = () => {
      const stored = getStoredSession();
      if (stored?.user && (stored.token || stored.isAuthenticated)) {
        const uRole = stored.user.role || 'customer';
        // In the Customer portal, operational staff roles are not allowed.
        // If an operational session leaked from cross-app development, purge it.
        if (['driver', 'processor', 'manager', 'plant_manager'].includes(uRole)) {
          console.warn('[AppClient] Operational staff session detected in Customer Portal. Purging to prevent portal glitching.');
          clearSession();
          updateAuthSessionIfChanged({ role: null, user: null, isAuthenticated: false });
          return;
        }

        const isAdmin = uRole === 'admin' || uRole === 'super_admin';
        updateAuthSessionIfChanged({
          role: isAdmin ? 'admin' : 'customer',
          user: {
            id: stored.user.id,
            name: stored.user.name || stored.user.email?.split('@')[0] || 'User',
            email: stored.user.email || '',
            role: uRole,
            roleLabel: isAdmin ? 'Administrator' : 'Customer Account',
          },
          isAuthenticated: true,
        });
      } else {
        updateAuthSessionIfChanged({ role: null, user: null, isAuthenticated: false });
      }
    };

    restoreSession();

    // React to login/logout events dispatched by db.ts helpers
    window.addEventListener('l2u_auth_change', restoreSession);
    return () => window.removeEventListener('l2u_auth_change', restoreSession);
  }, [updateAuthSessionIfChanged]);

  // Fetch MongoDB user data: Profile, Orders, Notifications
  React.useEffect(() => {
    const syncData = async () => {
      if (!authSession.isAuthenticated || !authSession.user?.id) {
        dataFetchedForUserRef.current = null;
        setProfile({
          name: '',
          email: '',
          phone: '',
          avatar: '',
          walletBalance: 0,
          rewardPoints: 0,
          addresses: [],
          preferences: {
            detergent: 'Premium Eco-Enzyme',
            softener: 'Premium Silk Touch',
            fragrance: 'Fresh Linen',
            starchedShirts: 'No Starch',
            foldingPreference: 'Standard Flat Fold',
            smsNotifications: true,
            emailReceipts: true,
            whatsappUpdates: true,
            marketingEmails: false
          }
        });
        setOrders([]);
        setNotifications([]);
        return;
      }

      // If Auth0 is still initializing, delay API calls until authentication state is resolved
      if (isAuth0Loading) return;

      // Prevent redundant duplicate data fetches for the same authenticated user
      if (dataFetchedForUserRef.current === authSession.user.id) {
        return;
      }
      dataFetchedForUserRef.current = authSession.user.id;

      try {
        const userId = authSession.user.id;
        const [p, o, n] = await Promise.all([
          dbFetchProfile(userId),
          dbFetchOrders(userId),
          dbFetchNotifications(userId),
        ]);

        // If a 401 occurred and cleared session, update authSession accordingly
        const currentSession = getStoredSession();
        if (!currentSession || !currentSession.isAuthenticated) {
          setAuthSession({ role: null, user: null, isAuthenticated: false });
          return;
        }

        setProfile(p);
        setOrders(o || []);
        setNotifications(n || []);

        // Prompt user to complete profile if mobile number is missing in MongoDB
        if (p && (!p.phone || p.phone.trim() === '')) {
          setCompleteProfileModalOpen(true);
        }
      } catch (e) {
        console.error('[AppClient] Failed to load user data from MongoDB:', e);
      }
    };
    syncData();
  }, [authSession.isAuthenticated, authSession.role, authSession.user?.id, isAuth0Loading]);

  // Handle Stripe Payment Redirect Query Parameters
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const payment = params.get('payment');
    const orderId = params.get('orderId');

    const sessionId = params.get('session_id') || params.get('stripe_session_id');

    // SECURITY: Only 'verify' is the valid payment return signal.
    //   - 'verify' = set by our Stripe success_url: triggers backend verification (correct).
    //   - 'success' = old/legacy value, now REJECTED to prevent accidental re-introduction
    //     of a flow that might bypass webhook verification in future code changes.
    // NEVER treat 'payment=success' as confirmation of payment.
    if (payment === 'verify') {

      // Immediately clean up sensitive query params from URL bar
      const cleanPath = window.location.pathname === '/' ? '/orders' : window.location.pathname;
      window.history.replaceState({}, document.title, cleanPath);

      if (!sessionId) {
        showToast('⚠️ Payment returned without session verification ID.');
        setPaymentResult({
          status: 'failed',
          orderId: orderId || undefined,
          error: 'No Stripe session verification ID was found.',
        });
        return;
      }

      showToast('🔄 Verifying payment confirmation with webhook...');
      setPaymentResult({
        status: 'processing',
        orderId: orderId || undefined,
        error: 'Stripe received your payment details. Verifying webhook order confirmation...',
      });

      // Polls /api/stripe/confirm-session until an order created by the webhook appears.
      // A browser redirect must never create or refund an order by itself.
      const pollConfirmSession = async (attempt = 1): Promise<void> => {
        const MAX_ATTEMPTS = 5;
        const POLL_DELAY_MS = 2000; // 2 seconds between polls
        const isFinalAttempt = attempt >= MAX_ATTEMPTS;

        try {
          const res = await apiFetch('/api/stripe/confirm-session', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...authHeaders(),
            },
            body: JSON.stringify({
              sessionId
            }),
          });
          const data = await res.json();

          if (res.ok && data.confirmed && data.order) {
            // ✅ Webhook ran, order found in DB, payment confirmed
            setCart([]);
            try { 
              localStorage.removeItem('laundelle_user_cart'); 
              localStorage.removeItem('laundelle_checkout_progress'); 
              localStorage.removeItem('laundelle_open_cart'); 
            } catch { }
            const confirmedId = data.order.publicId || data.order.orderNumber || data.order.id || orderId;
            const confirmedTotal = data.order.total ?? (data.order as any).total_price ?? (data.order as any).amount;
            showToast(`💳 Payment confirmed! Order #${confirmedId} is placed.`);
            setPlacedOrderForModal(data.order);
            setActiveTab('orders');
            setSelectedTrackingOrderId(data.order.id || data.order.publicId);
            setPaymentResult({ status: 'success', orderId: confirmedId, amount: confirmedTotal, currency: '£' });
            dbFetchOrders(authSession.user?.id).then((freshOrders) => {
              if (freshOrders && freshOrders.length > 0) setOrders(freshOrders);
            });
            return;
          }

          if ((res.status === 202 || (res.status === 401 && attempt < 3)) && !isFinalAttempt) {
            // ⏳ Stripe received payment but order verification is still hydrating / processing — poll again
            showToast(`⏳ Verifying payment confirmation... (attempt ${attempt}/${MAX_ATTEMPTS})`);
            setPaymentResult({
              status: 'processing',
              orderId: orderId || undefined,
              error: `Stripe received your payment. Verifying order confirmation... (attempt ${attempt}/${MAX_ATTEMPTS})`,
            });
            await new Promise(resolve => setTimeout(resolve, POLL_DELAY_MS));
            return pollConfirmSession(attempt + 1);
          }

          // ❌ Webhook did not confirm the payment after retries or payment was rejected.
          console.warn('[Payment Webhook Verification Failed]', data.error, data.status);
          showToast(`❌ Payment Rejected: ${data.error || 'Webhook did not confirm payment'}`);
          setPaymentResult({
            status: 'failed',
            orderId: orderId || undefined,
            error: data.error || 'Stripe has not confirmed this order through the payment webhook. No order has been placed; please contact support before trying another payment.',
          });
        } catch (err: any) {
          console.error('[Payment Verification Network Error]', err);
          showToast('⚠️ Could not verify payment with server. Please check your connection.');
          setPaymentResult({
            status: 'failed',
            orderId: orderId || undefined,
            error: 'Network connection issue while verifying with payment gateway.',
          });
        }
      };

      pollConfirmSession();
    } else if (payment === 'cancel') {
      const checkoutId = params.get('checkoutId');
      const cleanPath = window.location.pathname === '/' ? '/orders' : window.location.pathname;
      window.history.replaceState({}, document.title, cleanPath);

      // Notify backend to mark the order as payment_failed in orders collection
      apiFetch('/api/stripe/cancel-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ sessionId, orderId, checkoutId, reason: 'Payment was cancelled or card was declined.' }),
      }).then(() => {
        dbFetchOrders(authSession.user?.id).then((freshOrders) => {
          if (freshOrders && freshOrders.length > 0) setOrders(freshOrders);
        });
      }).catch((e) => console.error('[AppClient] Failed to register cancelled session:', e));

      showToast('❌ Payment was cancelled or card was declined.');
      setActiveTab('orders');
      setPaymentResult({
        status: 'failed',
        orderId: orderId || undefined,
        error: 'Payment was cancelled or your card was declined. Your order has been marked as Payment Failed. You can retry payment anytime from your orders.',
      });
    }
  }, []);

  // Customer Auth Modal State
  const [customerAuthOpen, setCustomerAuthOpen] = useState(false);
  const [completeProfileModalOpen, setCompleteProfileModalOpen] = useState(false);

  // Hash Router URL State
  const [currentRoute, setCurrentRoute] = useState(parseCurrentRoute());

  React.useEffect(() => {
    const handleHashChange = () => {
      setCurrentRoute(parseCurrentRoute());
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleNavigateRoleLogin = (role: 'admin' | 'manager' | 'driver' | 'processor') => {
    navigateToRoute(role, 'login');
  };

  const handleCustomerLoginSuccess = (email: string, name: string, userId?: string) => {
    setAuthSession({
      role: 'customer',
      user: { id: userId || `cust-${Date.now()}`, name, email, roleLabel: 'Customer' },
      isAuthenticated: true,
    });
    showToast(`Welcome back, ${name}!`);

    // Resume checkout if user was checking out before login
    try {
      if (typeof window !== 'undefined') {
        const shouldOpenCart = localStorage.getItem('laundelle_open_cart') === 'true' || Boolean(localStorage.getItem('laundelle_checkout_progress'));
        if (shouldOpenCart) {
          localStorage.removeItem('laundelle_open_cart');
          setCartDrawerOpen(true);
        }
      }
    } catch {}
  };



  return (
    <div className="min-h-screen bg-[#f8fafc] text-gray-900 font-sans flex flex-col antialiased selection:bg-[#CAF0F8] selection:text-[#03045E]">

      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-[#03045E] text-white px-5 py-3 rounded-2xl shadow-xl border border-[#00B4D8]/30 flex items-center gap-2 text-xs font-bold animate-in fade-in slide-in-from-top duration-300">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Sticky Header Navbar */}
      <Navbar
        activeTab={activeTab}
        onNavigate={handleNavigate}
        cartCount={cart.length}
        unreadNotificationsCount={unreadNotificationsCount}
        onOpenCart={() => setCartDrawerOpen(true)}
        onOpenPostcodeModal={() => setPostcodeModalOpen(true)}
        onOpenCustomerAuth={() => handleOpenCustomerAuth()}
        onNavigateRoleLogin={handleNavigateRoleLogin}
        customerUser={authSession.role === 'customer' ? authSession.user : null}
        onOpenSchedulePickup={() => handleStartBookingWithService()}
      />

      {/* Dynamic View Page Routing */}
      <main className="flex-1">
        {activeTab === 'home' && (
          <HomeView
            onNavigate={handleNavigate}
            onSelectService={(service) => {
              setServiceToCustomize(service);
            }}
            onOpenSchedulePickup={() => handleStartBookingWithService()}
            onBookService={(serviceName) => handleStartBookingWithService(serviceName)}
            services={services}
          />
        )}


        {activeTab === 'services' && (
          <ServicesView
            services={services}
            onAddToCart={(service, qty, opt, inst) => {
              handleAddToCart(service, qty, opt, inst);
            }}
            onOpenCart={() => setCartDrawerOpen(true)}
            onCustomizeService={(service) => setServiceToCustomize(service)}
            onNavigate={handleNavigate}
            targetServiceQuery={targetServiceQuery}
            onClearTargetService={() => setTargetServiceQuery(null)}
          />
        )}

        {activeTab === 'orders' && (
          authSession.isAuthenticated && authSession.role === 'customer' ? (
            <OrdersView
              orders={orders}
              onOpenBookNow={() => handleStartBookingWithService()}
              onOpenInvoice={setActiveInvoiceOrder}
              onOpenRescheduleCancel={(order, mode) => {
                setRescheduleCancelOrder(order);
                setRescheduleCancelMode(mode);
              }}
              onOpenAdditionalCharge={setActiveChargeOrder}
              onRepeatOrder={handleReOrder}
              selectedOrderId={selectedTrackingOrderId}
            />
          ) : (
            <div className="w-full max-w-4xl mx-auto py-12 px-4 sm:px-6">
              <div className="bg-white rounded-3xl p-6 sm:p-10 lg:p-12 shadow-sm border border-slate-200 relative overflow-hidden">
                <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-center">
                  {/* Left Column: Avatar & Brand Hero */}
                  <div className="flex flex-col items-center justify-center text-center">
                    <div className="relative w-64 h-64 sm:w-72 sm:h-72 md:w-80 md:h-80 flex items-center justify-center">
                      <Image
                        src={getOptimizedImageUrl(LAUNDELLE_IMAGES.customerAuthHero, { width: 640, quality: 'auto', format: 'auto' })}
                        alt="Laundelle Customer"
                        fill
                        sizes="(max-width: 768px) 288px, 320px"
                        loading="lazy"
                        className="relative z-10 object-contain rounded-full drop-shadow-md"
                      />
                    </div>
                  </div>

                  {/* Right Column: Log in or create an account */}
                  <div className="flex flex-col justify-center space-y-4">
                    <div className="space-y-1">
                      <h2 className="text-2xl sm:text-3xl font-heading font-black text-slate-900 tracking-tight">
                        Log in or create an account
                      </h2>
                      <p className="text-xs text-slate-500">
                        Sign in to track live orders, download receipts, and view courier arrival times.
                      </p>
                    </div>

                    <div className="space-y-3 pt-2">
                      {/* 1. Continue with Google */}
                      <button
                        type="button"
                        onClick={() => handleDirectAuth0Login('google-oauth2')}
                        className="w-full h-12 sm:h-13 bg-white hover:bg-slate-50 border border-slate-300 hover:border-slate-400 rounded-xl px-5 flex items-center justify-start gap-3.5 text-sm font-semibold text-slate-800 shadow-2xs transition-all cursor-pointer active:scale-99"
                      >
                        <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                          <path
                            fill="#4285F4"
                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                          />
                          <path
                            fill="#34A853"
                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                          />
                          <path
                            fill="#FBBC05"
                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                          />
                          <path
                            fill="#EA4335"
                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                          />
                        </svg>
                        <span>Continue with Google</span>
                      </button>

                      {/* 2. Continue with Apple */}
                      <button
                        type="button"
                        onClick={() => handleDirectAuth0Login('apple')}
                        className="w-full h-12 sm:h-13 bg-white hover:bg-slate-50 border border-slate-300 hover:border-slate-400 rounded-xl px-5 flex items-center justify-start gap-3.5 text-sm font-semibold text-slate-800 shadow-2xs transition-all cursor-pointer active:scale-99"
                      >
                        <svg className="w-5 h-5 shrink-0 fill-current text-black" viewBox="0 0 24 24">
                          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.62-.75 1.04-1.8 0.92-2.85-.9.04-2 .6-2.65 1.35-.58.67-1.09 1.74-.95 2.77.99.08 2.05-.51 2.68-1.27z" />
                        </svg>
                        <span>Continue with Apple</span>
                      </button>

                      {/* 3. Continue with Facebook */}
                      <button
                        type="button"
                        onClick={() => handleDirectAuth0Login('facebook')}
                        className="w-full h-12 sm:h-13 bg-white hover:bg-slate-50 border border-slate-300 hover:border-slate-400 rounded-xl px-5 flex items-center justify-start gap-3.5 text-sm font-semibold text-slate-800 shadow-2xs transition-all cursor-pointer active:scale-99"
                      >
                        <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                          <path
                            fill="#1877F2"
                            d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"
                          />
                        </svg>
                        <span>Continue with Facebook</span>
                      </button>

                      {/* 4. Continue with Email */}
                      <button
                        type="button"
                        onClick={() => handleDirectAuth0Login()}
                        className="w-full h-12 sm:h-13 bg-white hover:bg-slate-50 border border-slate-300 hover:border-slate-400 rounded-xl px-5 flex items-center justify-start gap-3.5 text-sm font-semibold text-slate-800 shadow-2xs transition-all cursor-pointer active:scale-99"
                      >
                        <svg className="w-5 h-5 text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        <span>Continue with Email</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Decorative Wave structure inside the box */}
                <svg
                  className="absolute bottom-0 left-0 w-full h-24 sm:h-32 pointer-events-none z-0"
                  viewBox="0 0 1440 200"
                  preserveAspectRatio="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <path
                    fill="#2563eb"
                    d="M0,70 C180,170 360,10 540,70
                       S900,170 1080,70
                       S1260,10 1440,70
                       L1440,200 L0,200 Z"
                  />
                </svg>
              </div>
            </div>
          )
        )}

        {activeTab === 'support' && (
          <SupportView
            orders={orders}
            onNavigate={handleNavigate}
          />
        )}

        {activeTab === 'notifications' && (
          <NotificationsView
            notifications={notifications}
            onMarkAsRead={(id) => setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))}
            onMarkAllAsRead={() => setNotifications(prev => prev.map(n => ({ ...n, read: true })))}
            onClearAll={() => setNotifications([])}
            onNavigate={handleNavigate}
          />
        )}

        {activeTab === 'account' && (
          authSession.isAuthenticated && authSession.role === 'customer' && profile ? (
            <AccountView
              profile={profile}
              onUpdateProfile={async (updated) => {
                const currentProfile = profile;
                setProfile(updated);
                if (authSession.user?.id) {
                  try {
                    const userId = authSession.user.id;
                    // Sync personal details
                    await dbUpdateProfile(userId, updated.name, updated.phone);
                    // Sync preferences
                    await dbUpdatePreferences(userId, updated.preferences);

                    // Sync address modifications
                    const currentAddrs = currentProfile?.addresses || [];
                    const newAddrs = updated.addresses;

                    for (const oldA of currentAddrs) {
                      if (!newAddrs.some(n => n.id === oldA.id)) {
                        await dbDeleteAddress(userId, oldA.id);
                      }
                    }

                    for (const newA of newAddrs) {
                      const matchingOld = currentAddrs.find(o => o.id === newA.id);
                      if (!matchingOld) {
                        await dbCreateAddress(userId, newA);
                      } else if (JSON.stringify(matchingOld) !== JSON.stringify(newA)) {
                        await dbUpdateAddress(userId, newA);
                      }
                    }
                  } catch (e) {
                    console.error('[AppClient] Failed to sync profile changes to MongoDB:', e);
                  }
                }
                showToast('Profile updated!');
              }}
              onNavigate={handleNavigate}
            />
          ) : (
            <div className="w-full max-w-4xl mx-auto py-12 px-4 sm:px-6">
              <div className="bg-white rounded-3xl p-6 sm:p-10 lg:p-12 shadow-sm border border-slate-200 relative overflow-hidden">
                <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-center">
                  {/* Left Column: Avatar & Brand Hero */}
                  <div className="flex flex-col items-center justify-center text-center">
                    <div className="relative w-64 h-64 sm:w-72 sm:h-72 md:w-80 md:h-80 flex items-center justify-center">
                      <Image
                        src={getOptimizedImageUrl(LAUNDELLE_IMAGES.customerAuthHero, { width: 640, quality: 'auto', format: 'auto' })}
                        alt="Laundelle Customer"
                        fill
                        sizes="(max-width: 768px) 288px, 320px"
                        loading="lazy"
                        className="relative z-10 object-contain rounded-full drop-shadow-md"
                      />
                    </div>
                  </div>

                  {/* Right Column: Log in or create an account */}
                  <div className="flex flex-col justify-center space-y-4">
                    <div className="space-y-1">
                      <h2 className="text-2xl sm:text-3xl font-heading font-black text-slate-900 tracking-tight">
                        Log in or create an account
                      </h2>
                      <p className="text-xs text-slate-500">
                        Choose your preferred method to access your account.
                      </p>
                    </div>

                    <div className="space-y-3 pt-2">
                      {/* 1. Continue with Google */}
                      <button
                        type="button"
                        onClick={() => handleDirectAuth0Login('google-oauth2')}
                        className="w-full h-12 sm:h-13 bg-white hover:bg-slate-50 border border-slate-300 hover:border-slate-400 rounded-xl px-5 flex items-center justify-start gap-3.5 text-sm font-semibold text-slate-800 shadow-2xs transition-all cursor-pointer active:scale-99"
                      >
                        <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                          <path
                            fill="#4285F4"
                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                          />
                          <path
                            fill="#34A853"
                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                          />
                          <path
                            fill="#FBBC05"
                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                          />
                          <path
                            fill="#EA4335"
                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                          />
                        </svg>
                        <span>Continue with Google</span>
                      </button>

                      {/* 2. Continue with Apple */}
                      <button
                        type="button"
                        onClick={() => handleDirectAuth0Login('apple')}
                        className="w-full h-12 sm:h-13 bg-white hover:bg-slate-50 border border-slate-300 hover:border-slate-400 rounded-xl px-5 flex items-center justify-start gap-3.5 text-sm font-semibold text-slate-800 shadow-2xs transition-all cursor-pointer active:scale-99"
                      >
                        <svg className="w-5 h-5 shrink-0 fill-current text-black" viewBox="0 0 24 24">
                          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.62-.75 1.04-1.8 0.92-2.85-.9.04-2 .6-2.65 1.35-.58.67-1.09 1.74-.95 2.77.99.08 2.05-.51 2.68-1.27z" />
                        </svg>
                        <span>Continue with Apple</span>
                      </button>

                      {/* 3. Continue with Facebook */}
                      <button
                        type="button"
                        onClick={() => handleDirectAuth0Login('facebook')}
                        className="w-full h-12 sm:h-13 bg-white hover:bg-slate-50 border border-slate-300 hover:border-slate-400 rounded-xl px-5 flex items-center justify-start gap-3.5 text-sm font-semibold text-slate-800 shadow-2xs transition-all cursor-pointer active:scale-99"
                      >
                        <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                          <path
                            fill="#1877F2"
                            d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"
                          />
                        </svg>
                        <span>Continue with Facebook</span>
                      </button>

                      {/* 4. Continue with Email */}
                      <button
                        type="button"
                        onClick={() => handleDirectAuth0Login()}
                        className="w-full h-12 sm:h-13 bg-white hover:bg-slate-50 border border-slate-300 hover:border-slate-400 rounded-xl px-5 flex items-center justify-start gap-3.5 text-sm font-semibold text-slate-800 shadow-2xs transition-all cursor-pointer active:scale-99"
                      >
                        <svg className="w-5 h-5 text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        <span>Continue with Email</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Decorative Wave structure inside the box */}
                <svg
                  className="absolute bottom-0 left-0 w-full h-24 sm:h-32 pointer-events-none z-0"
                  viewBox="0 0 1440 200"
                  preserveAspectRatio="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <path
                    fill="#2563eb"
                    d="M0,70 C180,170 360,10 540,70
                       S900,170 1080,70
                       S1260,10 1440,70
                       L1440,200 L0,200 Z"
                  />
                </svg>
              </div>
            </div>
          )
        )}

        {activeTab === 'assistant' && (
          <AIAssistantView
            onOpenSchedulePickup={() => handleStartBookingWithService()}
            services={services}
          />
        )}
      </main>

      {/* Footer */}
      {['home', 'services', 'support'].includes(activeTab) && (
        <Footer onNavigate={handleNavigate} onNavigateRoleLogin={handleNavigateRoleLogin} />
      )}

      {/* Mobile Fixed Bottom Navigation Bar */}
      <MobileNav
        activeTab={activeTab}
        onNavigate={handleNavigate}
        cartCount={cart.length}
        isLoggedIn={authSession.isAuthenticated && authSession.role === 'customer'}
      />

      {/* Slide-over Cart Drawer */}
      <CartDrawer
        isOpen={cartDrawerOpen}
        onClose={() => setCartDrawerOpen(false)}
        cart={cart}
        onUpdateQuantity={handleUpdateCartQuantity}
        onRemoveItem={handleRemoveCartItem}
        onClearCart={handleClearCart}
        addresses={profile?.addresses || []}
        onOrderPlaced={handleOrderPlaced}
        onPaymentFailed={(errorMessage) => {
          setCartDrawerOpen(false);
          setPaymentResult({
            status: 'failed',
            error: errorMessage,
          });
        }}
        isLoggedIn={authSession.isAuthenticated && authSession.role === 'customer'}
        onRequireLogin={() => handleOpenCustomerAuth()}
        onAddressAdded={(newAddr) => {
          setProfile((prev) => {
            if (!prev) return prev;
            const exists = prev.addresses.some((a) => a.id === newAddr.id);
            let nextAddrs = exists
              ? prev.addresses.map((a) => (a.id === newAddr.id ? newAddr : a))
              : [...prev.addresses, newAddr];
            if (newAddr.isDefault) {
              nextAddrs = nextAddrs.map((a) => (a.id === newAddr.id ? a : { ...a, isDefault: false }));
            }
            return { ...prev, addresses: nextAddrs };
          });
        }}
      />

      {/* Quick Schedule Pickup Modal */}
      <SchedulePickupModal
        isOpen={scheduleModalOpen}
        onClose={() => setScheduleModalOpen(false)}
        addresses={profile?.addresses || []}
        services={services}
        onAddToCartAndOpen={(service, qty) => {
          handleAddToCart(service, qty);
          setCartDrawerOpen(true);
        }}
      />

      <PostcodeCheckerModal
        isOpen={postcodeModalOpen}
        onClose={() => setPostcodeModalOpen(false)}
        onBookNow={() => {
          setPostcodeModalOpen(false);
          handleStartBookingWithService();
        }}
      />

      {/* Customer Login & Registration Modal */}
      <CustomerAuthModal
        isOpen={customerAuthOpen}
        onClose={() => setCustomerAuthOpen(false)}
        onLoginSuccess={handleCustomerLoginSuccess}
        onNavigateRoleLogin={handleNavigateRoleLogin}
      />

      {/* Complete Profile Modal for capturing Username and Mobile Number */}
      <CompleteProfileModal
        isOpen={completeProfileModalOpen}
        userId={authSession.user?.id || getStoredSession()?.user?.id || ''}
        initialUsername={profile?.name || authSession.user?.name || auth0User?.name || ''}
        initialPhone={profile?.phone || ''}
        onSuccess={(updatedName, updatedPhone) => {
          setCompleteProfileModalOpen(false);
          if (profile) {
            setProfile({
              ...profile,
              name: updatedName,
              phone: updatedPhone,
            });
          }
          if (authSession.user) {
            setAuthSession((prev) => ({
              ...prev,
              user: prev.user ? { ...prev.user, name: updatedName } : null,
            }));
          }
          showToast('✅ Profile saved to database successfully!');
          try {
            const shouldOpenCart = localStorage.getItem('laundelle_open_cart') === 'true';
            if (shouldOpenCart) {
              localStorage.removeItem('laundelle_open_cart');
              setCartDrawerOpen(true);
            }
          } catch { }
        }}
        onClose={() => setCompleteProfileModalOpen(false)}
      />

      {/* Invoice Modal */}
      <InvoiceReceiptModal
        isOpen={!!activeInvoiceOrder}
        order={activeInvoiceOrder}
        onClose={() => setActiveInvoiceOrder(null)}
      />

      {/* Order Placed Success Celebration Modal with Pickup OTP */}
      <OrderPlacedAnimationModal
        isOpen={Boolean(placedOrderForModal)}
        order={placedOrderForModal}
        onClose={() => setPlacedOrderForModal(null)}
        onTrackOrder={(orderId) => {
          setPlacedOrderForModal(null);
          setActiveTab('orders');
          setSelectedTrackingOrderId(orderId);
        }}
        onCancelOrder={(orderId, reason) => {
          handleOrderCancelled(orderId, reason);
          setPlacedOrderForModal(null);
        }}
      />

      {/* Reschedule/Cancel Modal */}
      <RescheduleCancelModal
        isOpen={!!rescheduleCancelOrder}
        order={rescheduleCancelOrder}
        mode={rescheduleCancelMode}
        onClose={() => setRescheduleCancelOrder(null)}
        onConfirmReschedule={(orderId, date, slot, mode) => {
          handleOrderRescheduled(orderId, date, slot, mode);
          setRescheduleCancelOrder(null);
        }}
        onConfirmCancel={(orderId, reason) => {
          handleOrderCancelled(orderId, reason);
          setRescheduleCancelOrder(null);
        }}
      />

      {/* Additional Charge Modal */}
      {activeChargeOrder && activeChargeOrder.additionalCharge && (
        <AdditionalChargeModal
          isOpen={!!activeChargeOrder}
          orderId={activeChargeOrder.id}
          charge={activeChargeOrder.additionalCharge}
          onClose={() => setActiveChargeOrder(null)}
          onAccept={(orderId) => {
            setOrders(orders.map(o => {
              if (o.id === orderId && o.additionalCharge) {
                return {
                  ...o,
                  total: o.total + o.additionalCharge.additionalAmount,
                  additionalCharge: {
                    ...o.additionalCharge,
                    status: 'accepted'
                  }
                };
              }
              return o;
            }));
            showToast('Additional charge accepted.');
            setActiveChargeOrder(null);
          }}
          onReject={(orderId) => {
            setOrders(orders.map(o => {
              if (o.id === orderId && o.additionalCharge) {
                return {
                  ...o,
                  additionalCharge: {
                    ...o.additionalCharge,
                    status: 'rejected'
                  }
                };
              }
              return o;
            }));
            showToast('Additional charge rejected and sent for manual review.');
            setActiveChargeOrder(null);
          }}
        />
      )}

      {serviceToCustomize && (
        <ServiceCustomizeModal
          service={serviceToCustomize}
          onClose={() => setServiceToCustomize(null)}
          onAddToCart={(service, qty, opt, inst) => {
            handleAddToCart(service, qty, opt, inst);
          }}
        />
      )}

      {/* Reusable Payment Status UI (Success with Confetti or Failed with Retry) */}
      {paymentResult && (
        <div className="fixed inset-0 z-[130] bg-[#f8fafc]/95 backdrop-blur-md overflow-y-auto flex items-center justify-center animate-in fade-in duration-300">
          <PaymentStatus
            status={paymentResult.status}
            orderId={paymentResult.orderId}
            amount={paymentResult.amount}
            currency={paymentResult.currency || '£'}
            errorMessage={paymentResult.error}
            onViewOrder={() => {
              if (paymentResult.orderId) {
                setSelectedTrackingOrderId(paymentResult.orderId);
              }
              setActiveTab('orders');
              setPaymentResult(null);
            }}
            onBack={() => {
              setActiveTab('orders');
              setPaymentResult(null);
            }}
            onRetryPayment={() => {
              setPaymentResult(null);
              setCartDrawerOpen(true);
            }}
            onContactSupport={() => {
              setActiveTab('support');
              setPaymentResult(null);
            }}
          />
        </div>
      )}
    </div>
  );
}
