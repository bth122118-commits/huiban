import Stripe from "stripe";

// =====================================================================
// 汇办 Huiban · 服务端 Stripe client（单例）
// 环境变量：STRIPE_SECRET_KEY
// =====================================================================

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  }
  return _stripe;
}
