import { Router } from 'express';
import Stripe from 'stripe';
import { supabase } from '../db/supabase';
import express from 'express';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();
// Initialize Stripe
const stripeKey = process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder';
if (!process.env.STRIPE_SECRET_KEY) {
    console.warn('⚠️ STRIPE_SECRET_KEY is missing. Payments will not work.');
}

const stripe = new Stripe(stripeKey, {
    apiVersion: '2025-12-15.clover',
});

// Webhook Secret
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Checkout Session (Create Payment Link)
router.post('/checkout', requireAuth, async (req, res) => {
    try {
        const { priceId, userId, successUrl, cancelUrl } = req.body;

        if (!priceId || !userId) {
            return res.status(400).json({ error: 'Missing priceId or userId' });
        }

        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            payment_method_types: ['card'],
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            success_url: successUrl,
            cancel_url: cancelUrl,
            metadata: {
                userId: userId
            }
        });

        res.json({ url: session.url });
    } catch (error: any) {
        console.error('Stripe Checkout Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Create Customer Portal Session
router.post('/portal', requireAuth, async (req, res) => {
    try {
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({ error: 'Missing userId' });
        }

        // 1. Get stripe_customer_id from DB
        const { data: user, error } = await supabase.from('user_settings')
            .select('stripe_customer_id')
            .eq('id', userId)
            .single();

        if (error || !user?.stripe_customer_id) {
            return res.status(404).json({ error: 'No Stripe customer found for this user.' });
        }

        // 2. Create Portal Session
        const session = await stripe.billingPortal.sessions.create({
            customer: user.stripe_customer_id,
            return_url: req.body.returnUrl || 'http://localhost:5173/billing', // Default to billing page
        });

        res.json({ url: session.url });
    } catch (error: any) {
        console.error('Stripe Portal Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Webhook Handler
// Note: This route expects RAW body. Middleware in server.ts must skip JSON parsing for this path.
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const signature = req.headers['stripe-signature'];

    let event: Stripe.Event;

    try {
        if (!process.env.STRIPE_WEBHOOK_SECRET) {
            throw new Error('STRIPE_WEBHOOK_SECRET is not defined');
        }
        // Verify signature
        event = stripe.webhooks.constructEvent(
            req.body,
            signature as string,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err: any) {
        console.error(`Webhook signature verification failed.`, err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle Event
    try {
        switch (event.type) {
            case 'checkout.session.completed':
                const session = event.data.object as Stripe.Checkout.Session;
                await handleCheckoutCompleted(session);
                break;
            case 'invoice.payment_succeeded':
                // Handle renewal logic here if needed (Stripe recurring)
                const invoice = event.data.object as Stripe.Invoice;
                // Typically check if billing_reason is subscription_cycle
                if (invoice.billing_reason === 'subscription_cycle') {
                    await handleSubscriptionRenewal(invoice);
                }
                break;
            case 'invoice.payment_failed':
                const failedInvoice = event.data.object as Stripe.Invoice;
                console.warn(`Payment failed for invoice: ${failedInvoice.id}, User: ${failedInvoice.customer_email}`);
                // Ideally, notify user via email here
                break;
            case 'customer.subscription.updated':
                const updatedSubscription = event.data.object as Stripe.Subscription;
                await handleSubscriptionUpdated(updatedSubscription);
                break;
            case 'customer.subscription.deleted':
                const subscription = event.data.object as Stripe.Subscription;
                await handleSubscriptionCancellation(subscription);
                break;
            default:
                console.log(`Unhandled event type ${event.type}`);
        }
        res.json({ received: true });
    } catch (err: any) {
        console.error(`Webhook processing failed: ${err.message}`);
        res.status(500).send(`Webhook Error: ${err.message}`);
    }
});

// Helper: Handle new subscription
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
    const userId = session.metadata?.userId;
    const customerId = session.customer as string;
    const subscriptionId = session.subscription as string;

    if (!userId) {
        console.error('No userId in session metadata');
        return;
    }

    // Determine plan details based on Amount or Price ID looks convoluted if dynamic.
    // For simplicity, we can fetch subscription details or infer from price.
    // Let's assume we map price amount to limits for now, or just give "Pro" status.
    // Better: Fetch Line Items or Subscription to know the plan.
    // For MVP: We will assume specific amounts correspond to tiers, OR pass plan in metadata.
    // But metadata on price is better. 
    // Let's just grant a standard specific limit for now or infer.
    // Pro ($29) -> 10,000 credits.
    // Business ($99) -> 100,000 credits.

    // Retrieve full subscription object to be sure/correct
    // const sub = await stripe.subscriptions.retrieve(subscriptionId);

    // Check amount total (in cents)
    const amount = session.amount_total; // e.g. 500 or 2000
    let tier = 'free';
    let limit = 100;

    if (amount === 500) { // 5 Euro
        tier = 'pro';
        limit = 10000;
    } else if (amount === 2000) { // 20 Euro
        tier = 'business';
        limit = 100000;
    }

    console.log(`Upgrading User ${userId} to ${tier} (Limit: ${limit})`);

    // Update DB
    const { error } = await supabase.from('user_settings')
        .update({
            stripe_customer_id: customerId,
            subscription_id: subscriptionId,
            plan_tier: tier,
            monthly_limit: limit,
            remaining_credits: limit, // Reset/Top-up immediately on purchase
            last_renewed: new Date()
        })
        .eq('id', userId);

    if (error) console.error('Failed to update user settings:', error);
}

async function handleSubscriptionRenewal(invoice: Stripe.Invoice) {
    const customerId = invoice.customer as string;

    // Find user
    const { data: user, error: userError } = await supabase.from('user_settings')
        .select('*')
        .eq('stripe_customer_id', customerId)
        .single();

    if (userError || !user) {
        console.error("User not found for renewal", customerId);
        return;
    }

    // Reset credits based on tier
    const limit = user.monthly_limit;

    await supabase.from('user_settings')
        .update({
            remaining_credits: limit,
            last_renewed: new Date()
        })
        .eq('id', user.id);

    console.log(`Renewed credits for user ${user.id}`);
}

async function handleSubscriptionCancellation(subscription: Stripe.Subscription) {
    const customerId = subscription.customer as string;
    console.log(`Processing cancellation for customer: ${customerId}`);

    // Find user
    const { data: user, error: userError } = await supabase.from('user_settings')
        .select('id')
        .eq('stripe_customer_id', customerId)
        .single();

    if (userError || !user) {
        console.error("User not found for cancellation", customerId);
        return;
    }

    // Downgrade to Free
    const { error } = await supabase.from('user_settings')
        .update({
            plan_tier: 'free',
            monthly_limit: 100,
            remaining_credits: 100, // Reset to free limit
            subscription_id: null // Clear subscription ID as it's dead
        })
        .eq('id', user.id);

    if (error) {
        console.error("Failed to downgrade user:", error);
    } else {
        console.log(`Downgraded user ${user.id} to free plan.`);
    }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
    const customerId = subscription.customer as string;
    console.log(`Processing subscription update for customer: ${customerId}`);

    // Find user
    const { data: user, error: userError } = await supabase.from('user_settings')
        .select('id')
        .eq('stripe_customer_id', customerId)
        .single();

    if (userError || !user) {
        console.error("User not found for subscription update", customerId);
        return;
    }

    // Determine new plan
    const priceAmount = subscription.items.data[0]?.price.unit_amount;
    let tier = 'free';
    let limit = 100;

    if (priceAmount === 500) { // 5 Euro
        tier = 'pro';
        limit = 10000;
    } else if (priceAmount === 2000) { // 20 Euro
        tier = 'business';
        limit = 100000;
    }

    // Update DB
    const { error } = await supabase.from('user_settings')
        .update({
            plan_tier: tier,
            monthly_limit: limit,
            // optional: remaining_credits could be reset or prorated. 
            // For now, let's reset to full limit to avoid confusion on upgrade.
            remaining_credits: limit,
            subscription_id: subscription.id
        })
        .eq('id', user.id);

    if (error) {
        console.error("Failed to update user plan:", error);
    } else {
        console.log(`Updated user ${user.id} to ${tier} plan.`);
    }
}

export default router;
