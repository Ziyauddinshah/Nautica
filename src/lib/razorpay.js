/** @file Browser hosted checkout; capture evidence and all merchant secrets remain on the server. */
import { request, ApiError } from './api.js';
let loading;
function loadCheckout() {
  if (window.Razorpay) return Promise.resolve();
  if (!loading)
    loading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = resolve;
      script.onerror = () => {
        script.remove();
        loading = null;
        reject(new Error('Unable to open payment checkout. Please try again.'));
      };
      document.head.append(script);
    });
  return loading;
}
export async function payRazorpay(payload, language, onOrder = () => {}) {
  try {
    await loadCheckout();
  } catch (error) {
    error.checkoutNotStarted = true;
    throw error;
  }
  let order;
  try {
    order = await request('/api/payments/order', { method: 'POST', body: payload });
  } catch (error) {
    // Only an explicit pre-checkout seat conflict is safe to send back to the map.
    // Network/server failures may have created an attempt and must enter recovery.
    error.seatConflict = error.status === 409 && Array.isArray(error.data?.bookedSeats);
    throw error;
  }
  onOrder(order);
  return new Promise((resolve, reject) => {
    const checkout = new window.Razorpay({
      key: order.keyId,
      amount: order.amount,
      currency: 'INR',
      order_id: order.orderId,
      timeout: Math.max(1, Math.floor((order.expires - (order.serverNow ?? Date.now())) / 1000)),
      name: 'Nautica',
      description: 'Boat seat reservation',
      prefill: { name: payload.name, email: payload.email, contact: payload.phone },
      config: { display: { language: language === 'hi' ? 'hi' : 'en' } },
      modal: {
        ondismiss: () =>
          reject(
            new ApiError(
              'Checkout closed. Check your booking history before starting another payment.',
              409,
            ),
          ),
      },
      handler: async (result) => {
        try {
          const response = await request('/api/payments/verify', {
            method: 'POST',
            body: {
              attemptId: order.attemptId,
              orderId: result.razorpay_order_id,
              paymentId: result.razorpay_payment_id,
              signature: result.razorpay_signature,
            },
          });
          resolve(response.booking);
        } catch (error) {
          reject(error);
        }
      },
    });
    checkout.open();
  });
}
