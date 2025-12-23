"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_1 = require("../db/supabase");
const router = (0, express_1.Router)();
// Get all contact groups
router.get('/groups', async (req, res) => {
    try {
        const { data, error } = await supabase_1.supabase
            .from('contact_groups')
            .select('*')
            .order('created_at', { ascending: false });
        if (error)
            throw error;
        res.json(data);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Create a contact group with contacts
router.post('/groups', async (req, res) => {
    try {
        const { name, contacts } = req.body; // contacts is array of objects
        // 1. Create Group
        const { data: groupData, error: groupError } = await supabase_1.supabase
            .from('contact_groups')
            .insert({ name })
            .select()
            .single();
        if (groupError)
            throw groupError;
        const groupId = groupData.id;
        // 2. Insert Contacts
        if (contacts && contacts.length > 0) {
            const contactsToInsert = contacts.map((contact) => ({
                group_id: groupId,
                email: contact.email || contact.Email, // handle case sensitivity matching
                name: contact.name || contact.Name || '',
                data: contact // store full row data for flexibility
            }));
            const { error: contactsError } = await supabase_1.supabase
                .from('contacts')
                .insert(contactsToInsert);
            if (contactsError)
                throw contactsError;
        }
        res.json({ message: 'Group created successfully', group: groupData });
    }
    catch (error) {
        console.error('Error creating group:', error);
        res.status(500).json({ error: error.message });
    }
});
// Get contacts for a specific group
router.get('/groups/:groupId/contacts', async (req, res) => {
    try {
        const { groupId } = req.params;
        const { data, error } = await supabase_1.supabase
            .from('contacts')
            .select('*')
            .eq('group_id', groupId)
            .order('created_at', { ascending: true });
        if (error)
            throw error;
        res.json(data);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Get Single Group
router.get('/groups/:groupId', async (req, res) => {
    try {
        const { groupId } = req.params;
        const { data, error } = await supabase_1.supabase
            .from('contact_groups')
            .select('*')
            .eq('id', groupId)
            .single();
        if (error)
            throw error;
        res.json(data);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Update Group Name
router.put('/groups/:groupId', async (req, res) => {
    try {
        const { groupId } = req.params;
        const { name } = req.body;
        const { data, error } = await supabase_1.supabase
            .from('contact_groups')
            .update({ name })
            .eq('id', groupId)
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
// Delete Group
router.delete('/groups/:groupId', async (req, res) => {
    try {
        const { groupId } = req.params;
        // Contacts verify cascade delete in DB, otherwise delete manually here
        const { error } = await supabase_1.supabase
            .from('contact_groups')
            .delete()
            .eq('id', groupId);
        if (error)
            throw error;
        res.json({ message: 'Group deleted' });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Add Single Contact to Group
router.post('/groups/:groupId/contacts', async (req, res) => {
    try {
        const { groupId } = req.params;
        const { email, name } = req.body;
        const { data, error } = await supabase_1.supabase
            .from('contacts')
            .insert({
            group_id: groupId,
            email,
            name,
            data: req.body // store all extras
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
// Update Contact
router.put('/contacts/:contactId', async (req, res) => {
    try {
        const { contactId } = req.params;
        const { email, name } = req.body;
        const { data, error } = await supabase_1.supabase
            .from('contacts')
            .update({ email, name, data: req.body })
            .eq('id', contactId)
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
// Delete Contact
router.delete('/contacts/:contactId', async (req, res) => {
    try {
        const { contactId } = req.params;
        const { error } = await supabase_1.supabase
            .from('contacts')
            .delete()
            .eq('id', contactId);
        if (error)
            throw error;
        res.json({ message: 'Contact deleted' });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
exports.default = router;
