import { Router } from 'express';
import { supabase } from '../db/supabase';
import { encrypt, decrypt } from '../utils/encryption';

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

        // Decrypt password if it exists
        if (settings.smtp_pass) {
            settings.smtp_pass = decrypt(settings.smtp_pass);
        }

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
        // Unique Alias Check for shared-ses
        if (payload.provider === 'shared-ses' && payload.from_email) {
            // 1. Enforce Domain
            if (!payload.from_email.endsWith('@vasteris.com')) {
                return res.status(400).json({ error: 'System Default provider requires a @vasteris.com email alias.' });
            }

            // 2. Reserved Names Check
            const alias = payload.from_email.split('@')[0].toLowerCase();
            const reserved = ['notification', 'admin', 'support', 'info', 'marketing', 'sales', 'billing'];
            if (reserved.includes(alias)) {
                return res.status(400).json({ error: `The alias '${alias}' is reserved. Please choose a company-specific name.` });
            }

            // 3. Uniqueness Check in DB
            const { count } = await supabase
                .from('user_settings')
                .select('id', { count: 'exact', head: true })
                .eq('from_email', payload.from_email)
                .neq('id', req.user.id); // Don't count self

            if (count && count > 0) {
                return res.status(409).json({ error: `The address '${payload.from_email}' is already taken. Please choose another.` });
            }
        }

        const { data, error } = await supabase
            .from('user_settings')
            .upsert({
                id: req.user.id,
                ...payload,
                smtp_pass: payload.smtp_pass ? encrypt(payload.smtp_pass) : payload.smtp_pass,
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
