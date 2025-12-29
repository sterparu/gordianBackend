import { Router } from 'express';
import { supabase } from '../db/supabase';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();

// Get all blacklisted emails
router.get('/', requireAuth, async (req, res) => {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({ error: 'User not authenticated' });
        }

        const { data, error } = await supabase
            .from('blacklist')
            .select('*')
            .eq('user_id', req.user.id)
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Add email to blacklist
router.post('/', requireAuth, async (req, res) => {
    try {
        const { email, reason } = req.body;
        if (!email) throw new Error('Email is required');

        if (!req.user || !req.user.id) {
            return res.status(401).json({ error: 'User not authenticated' });
        }

        const { data, error } = await supabase
            .from('blacklist')
            .insert({
                email,
                reason,
                user_id: req.user.id
            })
            .select()
            .single();

        if (error) {
            if (error.code === '23505') { // Unique violation
                return res.status(409).json({ error: 'Email is already blacklisted' });
            }
            throw error;
        }
        res.status(201).json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Remove email from blacklist
router.delete('/:email', requireAuth, async (req, res) => {
    try {
        const { email } = req.params;
        if (!req.user || !req.user.id) {
            return res.status(401).json({ error: 'User not authenticated' });
        }

        const { error } = await supabase
            .from('blacklist')
            .delete()
            .eq('email', email)
            .eq('user_id', req.user.id);

        if (error) throw error;
        res.json({ message: 'Email removed from blacklist' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Public Unsubscribe Endpoint (via Tracking ID)
router.post('/unsubscribe', async (req, res) => {
    try {
        const { trackingId } = req.body;
        if (!trackingId) throw new Error('Tracking ID is required');

        // 1. Find email from email_logs AND associated User (via Campaign)
        const { data: log, error: logError } = await supabase
            .from('email_logs')
            .select(`
                recipient_email,
                campaigns (
                    user_id
                )
            `)
            .eq('tracking_id', trackingId)
            .single();

        if (logError || !log) throw new Error('Invalid unsubscribe link');

        // Extract user_id from the joined campaign
        // Supabase returns an array or object depending on relation one-to-one/many
        // campaign_id is FK, so it should be a single object
        const campaign = Array.isArray(log.campaigns) ? log.campaigns[0] : log.campaigns;
        const userId = campaign?.user_id;

        if (!userId) {
            console.error('Unsubscribe loop: Could not find user_id for trackingId', trackingId);
            // Fallback: If no user found, we can't blacklist for a specific user. 
            // Maybe just log it or fail? 
            throw new Error('Could not identify user account for this email.');
        }

        // 2. Add to blacklist with CORRECT user_id
        const { error: blacklistError } = await supabase
            .from('blacklist')
            .insert({
                email: log.recipient_email,
                reason: 'User Unsubscribed',
                user_id: userId
            });

        // Ignore duplicate (already unsubscribed)
        if (blacklistError && blacklistError.code !== '23505') throw blacklistError;

        res.json({ message: 'Unsubscribed successfully', email: log.recipient_email });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

// Public Resubscribe Endpoint (via Tracking ID)
router.post('/resubscribe', async (req, res) => {
    try {
        const { trackingId } = req.body;
        if (!trackingId) throw new Error('Tracking ID is required');

        // 1. Find email
        const { data: log, error: logError } = await supabase
            .from('email_logs')
            .select('recipient_email')
            .eq('tracking_id', trackingId)
            .single();

        if (logError || !log) throw new Error('Invalid link');

        // 2. Remove from blacklist
        const { error: deleteError } = await supabase
            .from('blacklist')
            .delete()
            .eq('email', log.recipient_email);

        if (deleteError) throw deleteError;

        res.json({ message: 'Resubscribed successfully' });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
});

export default router;
