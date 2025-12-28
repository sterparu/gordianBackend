"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_1 = require("../db/supabase");
const router = (0, express_1.Router)();
// Get all templates
router.get('/', async (req, res) => {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        const { data, error } = await supabase_1.supabase
            .from('email_templates')
            .select('*')
            .eq('user_id', req.user.id)
            .order('created_at', { ascending: false });
        if (error)
            throw error;
        res.json(data);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Create template
router.post('/', async (req, res) => {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        const { name, subject, body } = req.body;
        const { data, error } = await supabase_1.supabase
            .from('email_templates')
            .insert({
            name,
            subject,
            body,
            user_id: req.user.id
        })
            .select()
            .single();
        if (error)
            throw error;
        res.json(data);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Update template
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, subject, body } = req.body;
        if (!req.user || !req.user.id) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        const { data, error } = await supabase_1.supabase
            .from('email_templates')
            .update({ name, subject, body })
            .eq('id', id)
            .eq('user_id', req.user.id)
            .select()
            .single();
        if (error)
            throw error;
        res.json(data);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Delete template
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (!req.user || !req.user.id) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        const { error } = await supabase_1.supabase
            .from('email_templates')
            .delete()
            .eq('id', id)
            .eq('user_id', req.user.id);
        if (error)
            throw error;
        res.json({ message: 'Template deleted' });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
exports.default = router;
