import { Router } from 'express';
import Stripe from 'stripe';
import { pool } from '../db/index.js';
import { config } from '../config.js';
import { requireAuth, requireWorkspace } from '../middleware/auth.js';

const router = Router();

function getStripe() {
  return new Stripe(config.STRIPE_SECRET_KEY);
}

router.post('/create-checkout-session', requireAuth, requireWorkspace, async (req, res, next) => {
  try {
    const stripe = getStripe();
    const workspace = req.workspace;

    let subResult = await pool.query(
      'SELECT * FROM subscriptions WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 1',
      [workspace.id]
    );

    let customerId;
    if (subResult.rows.length > 0 && subResult.rows[0].stripe_customer_id) {
      customerId = subResult.rows[0].stripe_customer_id;
    } else {
      const customer = await stripe.customers.create({
        email: req.user.email,
        name: req.user.full_name,
        metadata: { workspace_id: workspace.id },
      });
      customerId = customer.id;
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: config.STRIPE_PRICE_ID, quantity: 1 }],
      success_url: `${config.CLIENT_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${config.CLIENT_URL}/checkout`,
      metadata: { workspace_id: workspace.id },
    });

    res.json({ url: session.url });
  } catch (err) {
    next(err);
  }
});

router.post('/webhook', async (req, res, next) => {
  try {
    const stripe = getStripe();
    const sig = req.headers['stripe-signature'];
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, config.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      return res.status(400).json({ message: `Webhook error: ${err.message}` });
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const workspaceId = session.metadata.workspace_id;
        const existing = await pool.query('SELECT id FROM subscriptions WHERE workspace_id = $1', [workspaceId]);
        if (existing.rows.length > 0) {
          await pool.query(
            `UPDATE subscriptions SET stripe_customer_id = $1, stripe_subscription_id = $2, status = 'active', updated_at = NOW() WHERE workspace_id = $3`,
            [session.customer, session.subscription, workspaceId]
          );
        } else {
          await pool.query(
            `INSERT INTO subscriptions (workspace_id, stripe_customer_id, stripe_subscription_id, status) VALUES ($1, $2, $3, 'active')`,
            [workspaceId, session.customer, session.subscription]
          );
        }
        break;
      }
      case 'invoice.paid': {
        const invoice = event.data.object;
        const sub = await pool.query('SELECT id FROM subscriptions WHERE stripe_subscription_id = $1', [invoice.subscription]);
        if (sub.rows.length > 0 && invoice.period_start !== null && invoice.period_start !== undefined && invoice.period_end !== null && invoice.period_end !== undefined) {
          await pool.query(
            `UPDATE subscriptions SET current_period_start = to_timestamp($1), current_period_end = to_timestamp($2), updated_at = NOW() WHERE stripe_subscription_id = $3`,
            [invoice.period_start, invoice.period_end, invoice.subscription]
          );
        }
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        await pool.query(
          `UPDATE subscriptions SET status = 'past_due', updated_at = NOW() WHERE stripe_subscription_id = $1`,
          [invoice.subscription]
        );
        break;
      }
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        await pool.query(
          `UPDATE subscriptions SET status = $1, updated_at = NOW() WHERE stripe_subscription_id = $2`,
          [subscription.status, subscription.id]
        );
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await pool.query(
          `UPDATE subscriptions SET status = 'canceled', updated_at = NOW() WHERE stripe_subscription_id = $1`,
          [subscription.id]
        );
        break;
      }
    }

    res.json({ received: true });
  } catch (err) {
    next(err);
  }
});

router.get('/status', requireAuth, requireWorkspace, async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT * FROM subscriptions WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 1',
      [req.workspace.id]
    );
    if (result.rows.length === 0) {
      return res.json({ status: 'none' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post('/create-portal-session', requireAuth, requireWorkspace, async (req, res, next) => {
  try {
    const stripe = getStripe();
    const subResult = await pool.query(
      'SELECT stripe_customer_id FROM subscriptions WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 1',
      [req.workspace.id]
    );
    if (subResult.rows.length === 0 || !subResult.rows[0].stripe_customer_id) {
      return res.status(400).json({ message: 'No Stripe customer found' });
    }
    const session = await stripe.billingPortal.sessions.create({
      customer: subResult.rows[0].stripe_customer_id,
      return_url: `${config.CLIENT_URL}/`,
    });
    res.json({ url: session.url });
  } catch (err) {
    next(err);
  }
});

export default router;
