import { Router } from 'express';
import { supabase } from '../db/supabase';

const router = Router();

// Get settings (authenticated user)
router.get('/', async (req, res) => {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({ error: 'User not authenticated' });
        }

        const { data, error } = await supabase
            .from('user_settings')
            .select('*')
            .eq('id', req.user.id)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 is "The result contains 0 rows"
            throw error;
        }

        // If no settings exist, return default structure (frontend handles nulls)
        const settings = data || {
            provider: 'shared-ses',
            from_email: 'notification@vasteris.com',
            from_name: 'ToolMail User'
        };

        res.json(settings);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Update settings
router.put('/', async (req, res) => {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({ error: 'User not authenticated' });
        }

        const payload = req.body;

        // Settings are guaranteed to exist via trigger usually, but strict check is good
        // Actually, upsert is best here
        const { data, error } = await supabase
            .from('user_settings')
            .upsert({
                id: req.user.id,
                ...payload,
                updated_at: new Date()
            })
            .select()
            .single();

        if (error) throw error;
        res.json(data);


    } catch (error: any) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

export default router;
