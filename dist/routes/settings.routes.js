"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_1 = require("../db/supabase");
const router = (0, express_1.Router)();
// Get settings (singleton)
router.get('/', async (req, res) => {
    try {
        const { data, error } = await supabase_1.supabase
            .from('user_settings')
            .select('*')
            .limit(1)
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
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Update settings
router.put('/', async (req, res) => {
    try {
        const payload = req.body;
        // Check if row exists
        const { data: existing } = await supabase_1.supabase
            .from('user_settings')
            .select('id')
            .limit(1)
            .single();
        let result;
        if (existing) {
            const { data, error } = await supabase_1.supabase
                .from('user_settings')
                .update({ ...payload, updated_at: new Date() })
                .eq('id', existing.id)
                .select()
                .single();
            if (error)
                throw error;
            result = data;
        }
        else {
            const { data, error } = await supabase_1.supabase
                .from('user_settings')
                .insert(payload)
                .select()
                .single();
            if (error)
                throw error;
            result = data;
        }
        res.json(result);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});
exports.default = router;
