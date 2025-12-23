import { Router } from 'express';
import { supabase } from '../db/supabase';

const router = Router();

// Get all blacklisted emails
router.get('/', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('blacklist')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Add email to blacklist
router.post('/', async (req, res) => {
    try {
        const { email, reason } = req.body;
        if (!email) throw new Error('Email is required');

        const { data, error } = await supabase
            .from('blacklist')
            .insert({ email, reason })
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
router.delete('/:email', async (req, res) => {
    try {
        const { email } = req.params;
        const { error } = await supabase
            .from('blacklist')
            .delete()
            .eq('email', email);

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

        // 1. Find email from email_logs
        const { data: log, error: logError } = await supabase
            .from('email_logs')
            .select('recipient_email')
            .eq('tracking_id', trackingId)
            .single();

        if (logError || !log) throw new Error('Invalid unsubscribe link');

        // 2. Add to blacklist
        const { error: blacklistError } = await supabase
            .from('blacklist')
            .insert({
                email: log.recipient_email,
                reason: 'User Unsubscribed'
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
