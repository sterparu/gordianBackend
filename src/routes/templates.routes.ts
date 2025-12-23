import { Router } from 'express';
import { supabase } from '../db/supabase';

const router = Router();

// Get all templates
router.get('/', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('email_templates')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Create template
router.post('/', async (req, res) => {
    try {
        const { name, subject, body } = req.body;
        const { data, error } = await supabase
            .from('email_templates')
            .insert({ name, subject, body })
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Update template
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, subject, body } = req.body;
        const { data, error } = await supabase
            .from('email_templates')
            .update({ name, subject, body })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Delete template
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase
            .from('email_templates')
            .delete()
            .eq('id', id);

        if (error) throw error;
        res.json({ message: 'Template deleted' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
