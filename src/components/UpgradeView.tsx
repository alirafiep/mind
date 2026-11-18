import React, { useState } from 'react';
import { Check, CreditCard, Crown, Loader2, ShieldCheck, Smartphone } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import type { BillingCycle } from '../types/app';

const FREE_FEATURES = [
  'Unlimited multilingual AI text chat (Auto-detect, English, Malayalam, Manglish, Arabic, Hindi, Spanish)',
  'ChatGPT-style history, search, rename, edit & regenerate',
  'Web Search grounding with clickable source links',
  'Basic AI image generation (15 free images/day, resets daily)',
  'Personal Library with folders, documents & saved answers',
  'Voice input, Read Aloud & Voice Conversation mode',
];

const PRO_FEATURES = [
  'Everything in FREE membership',
  'AI Video Generator (Text-to-Video & Image-to-Video, 1080p export)',
  'Advanced 2K High-Resolution Image Studio (Nano Banana 2.1)',
  'Higher usage limits (150 images/day & 40 videos/month)',
  'Priority AI processing queue & faster generation',
  'Full commercial rights on generated media assets',
];

export function UpgradeView() {
  const {
    isPro,
    subscription,
    stripeEnabled,
    setSubscription,
    setActiveView,
    notify,
  } = useApp();

  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [showCheckout, setShowCheckout] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'upi'>('card');

  const [cardHolder, setCardHolder] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [upiId, setUpiId] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const priceLabel = billingCycle === 'monthly' ? '$19 / month' : '$180 / year';

  const handleStartUpgrade = async () => {

    if (stripeEnabled) {
      setProcessing(true);
      setError(null);
      try {
        const res = await api.checkoutPro({ plan: billingCycle, paymentMethod: 'stripe' });
        if (res.mode === 'stripe' && res.checkoutUrl) {
          window.location.href = res.checkoutUrl;
          return;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to start Stripe checkout.');
      } finally {
        setProcessing(false);
      }
    }

    setShowCheckout(true);
  };

  const handleConfirmCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    setProcessing(true);
    setError(null);
    try {
      const res = await api.checkoutPro({
        plan: billingCycle,
        paymentMethod,
        cardHolder,
        cardNumber,
        expiry,
        cvc,
        upiId,
      });
      if (res.subscription) {
        setSubscription(res.subscription);
      }
      setShowCheckout(false);
      notify('Welcome to MindMaster PRO! Video Studio is now unlocked.', 'success');
      setActiveView('videos');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment processing failed.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto px-4 sm:px-8 py-8 custom-scrollbar">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="text-center space-y-3">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white text-balance">
            Upgrade to MindMaster PRO
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xl mx-auto">
            Unlock AI Video Generation, 2K Ultra HD Image Creation, and higher daily capacity with instant activation.
          </p>

          {/* Billing Cycle Toggle */}
          <div className="inline-flex items-center p-1 rounded-xl bg-slate-200/80 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 mt-3">
            <button
              type="button"
              onClick={() => setBillingCycle('monthly')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                billingCycle === 'monthly'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Monthly ($19/mo)
            </button>
            <button
              type="button"
              onClick={() => setBillingCycle('yearly')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                billingCycle === 'yearly'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Yearly ($180/yr · Save 21%)
            </button>
          </div>
        </div>

        {/* Plans Comparison */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* FREE PLAN */}
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 flex flex-col justify-between">
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">FREE</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Essential AI chat, image creation &amp; personal library
                </p>
              </div>
              <div className="text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                $0
                <span className="text-xs font-sans font-normal text-slate-500"> / forever</span>
              </div>
              <ul className="space-y-2.5 pt-2">
                {FREE_FEATURES.map((feat) => (
                  <li
                    key={feat}
                    className="flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed"
                  >
                    <Check className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="pt-6">
              <div className="w-full py-2.5 text-center rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-500 dark:text-slate-400">
                {isPro ? 'Included in your account' : 'Current Plan'}
              </div>
            </div>
          </div>

          {/* PRO PLAN */}
          <div className="rounded-2xl bg-white dark:bg-slate-900 border-2 border-indigo-500 p-6 flex flex-col justify-between shadow-lg shadow-indigo-500/5">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Crown className="w-5 h-5 text-amber-500" />
                    <span>PRO Membership</span>
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Full video studio, 2K imaging &amp; priority power
                  </p>
                </div>
              </div>

              <div className="text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {billingCycle === 'monthly' ? '$19' : '$15'}
                <span className="text-xs font-sans font-normal text-slate-500">
                  {' '}
                  / month {billingCycle === 'yearly' ? '(billed $180 yearly)' : ''}
                </span>
              </div>

              <ul className="space-y-2.5 pt-2">
                {PRO_FEATURES.map((feat) => (
                  <li
                    key={feat}
                    className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-200 leading-relaxed"
                  >
                    <Check className="w-4 h-4 text-indigo-500 dark:text-sky-400 shrink-0 mt-0.5" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="pt-6">
              {isPro ? (
                <div className="w-full py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-semibold text-center">
                  Active PRO Plan ({subscription.plan})
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleStartUpgrade()}
                  disabled={processing}
                  className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors cursor-pointer"
                >
                  Upgrade to PRO · {priceLabel}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Secure Payment Gateway Panel */}
        {showCheckout && !isPro && (
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 animate-fadeIn">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-500" />
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Complete PRO Subscription Checkout
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Plan: {billingCycle === 'monthly' ? 'PRO Monthly ($19.00)' : 'PRO Yearly ($180.00)'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCheckout(false)}
                className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                Cancel
              </button>
            </div>

            <div className="flex gap-2 mb-5">
              <button
                type="button"
                onClick={() => setPaymentMethod('card')}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold border cursor-pointer ${
                  paymentMethod === 'card'
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-200'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                <CreditCard className="w-4 h-4" />
                <span>Credit / Debit Card</span>
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('upi')}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold border cursor-pointer ${
                  paymentMethod === 'upi'
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-200'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                <Smartphone className="w-4 h-4" />
                <span>UPI Payment</span>
              </button>
            </div>

            <form onSubmit={handleConfirmCheckout} className="space-y-4 max-w-lg">
              {paymentMethod === 'card' ? (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Cardholder Name
                    </label>
                    <input
                      type="text"
                      required
                      value={cardHolder}
                      onChange={(e) => setCardHolder(e.target.value)}
                      placeholder="Full name on card"
                      className="w-full px-3 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Card Number
                    </label>
                    <input
                      type="text"
                      required
                      inputMode="numeric"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value)}
                      placeholder="4242 4242 4242 4242"
                      className="w-full px-3 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm font-mono text-slate-900 dark:text-white"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Expiry (MM/YY)
                      </label>
                      <input
                        type="text"
                        required
                        value={expiry}
                        onChange={(e) => setExpiry(e.target.value)}
                        placeholder="08/28"
                        className="w-full px-3 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm font-mono text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        CVC
                      </label>
                      <input
                        type="text"
                        required
                        inputMode="numeric"
                        value={cvc}
                        onChange={(e) => setCvc(e.target.value)}
                        placeholder="123"
                        className="w-full px-3 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm font-mono text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    UPI ID
                  </label>
                  <input
                    type="text"
                    required
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value)}
                    placeholder="yourname@okbank"
                    className="w-full px-3 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>
              )}

              {error && (
                <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
              )}

              <button
                type="submit"
                disabled={processing}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
              >
                {processing && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Pay {priceLabel} &amp; Activate PRO</span>
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
