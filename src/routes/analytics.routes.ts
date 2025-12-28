import { Router } from 'express';
import { supabase } from '../db/supabase';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();

// Tracking Pixel Endpoint
router.get('/track/:id', async (req, res) => {
    const { id } = req.params;

    // Return 1x1 Transparent GIF immediately to keep email load fast
    const pixel = Buffer.from(
        'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
        'base64'
    );
    res.writeHead(200, {
        'Content-Type': 'image/gif',
        'Content-Length': pixel.length,
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    });
    res.end(pixel);

    // Record Open Asynchronously
    try {
        if (id) {
            // Only update if not already opened (unique opens) or update last opened?
            // Requirement usually wants unique opens count, but maybe last opened timestamp.
            // Let's update `opened_at` if it's null.

            // First check
            const { data: log } = await supabase
                .from('email_logs')
                .select('opened_at')
                .eq('tracking_id', id)
                .single();

            if (log && !log.opened_at) {
                await supabase
                    .from('email_logs')
                    .update({ opened_at: new Date() })
                    .eq('tracking_id', id);
                console.log(`Tracking: Opened email ${id}`);
            }
        }
    } catch (error) {
        console.error('Tracking Error:', error);
    }
});

// Get All Campaigns (Summary)
router.get('/campaigns', requireAuth, async (req, res) => {
    try {
        // Fetch campaigns with a raw count of opens?
        // Supabase select count is easier if we do a join or separate queries.
        // For simplicity/performance, let's fetch campaigns and then maybe counts.
        // Or generic SQL view. Let's do a simple fetch for now.

        if (!req.user || !req.user.id) {
            return res.status(401).json({ error: 'User not authenticated' });
        }

        const { data: campaigns, error } = await supabase
            .from('campaigns')
            .select('*')
            .eq('user_id', req.user.id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Populate open status? This might be N+1 slow.
        // Better: create a SQL view or just fetch counts efficiently.
        // Let's iterate for now (scale is small < 3000/mo).
        const campaignsWithStats = await Promise.all(campaigns.map(async (c) => {
            const { count: sentCount } = await supabase
                .from('email_logs')
                .select('*', { count: 'exact', head: true })
                .eq('campaign_id', c.id)
                .eq('status', 'sent');

            const { count: openCount } = await supabase
                .from('email_logs')
                .select('*', { count: 'exact', head: true })
                .eq('campaign_id', c.id)
                .not('opened_at', 'is', null);

            // Failed count
            const { count: failedCount } = await supabase
                .from('email_logs')
                .select('*', { count: 'exact', head: true })
                .eq('campaign_id', c.id)
                .eq('status', 'failed');

            return {
                ...c,
                sent: sentCount || 0,
                opened: openCount || 0,
                failed: failedCount || 0
            };
        }));

        res.json(campaignsWithStats);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Get Campaign Details
router.get('/campaigns/:id', requireAuth, async (req, res) => {
    try {
        const { id } = req.params;
        if (!req.user || !req.user.id) {
            return res.status(401).json({ error: 'User not authenticated' });
        }

        const { data: campaign, error } = await supabase
            .from('campaigns')
            .select('*')
            .eq('id', id)
            .eq('user_id', req.user.id)
            .single();

        if (error) throw error;

        const { data: logs } = await supabase
            .from('email_logs')
            .select('*')
            .eq('campaign_id', id)
            .order('created_at', { ascending: true });

        res.json({ campaign, logs });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
