import { Router } from 'express';
import { supabase } from '../db/supabase';

const router = Router();

// Get all contact groups
router.get('/groups', async (req, res) => {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({ error: 'User not authenticated' });
        }

        const { data, error } = await supabase
            .from('contact_groups')
            .select('*')
            .eq('user_id', req.user.id)
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json(data);
    } catch (error: any) {
        console.error('Error fetching contact groups:', error);
        res.status(500).json({ error: error.message });
    }
});

// Create a contact group with contacts
router.post('/groups', async (req, res) => {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({ error: 'User not authenticated' });
        }

        const { name, contacts } = req.body; // contacts is array of objects

        // 1. Create Group
        const { data: groupData, error: groupError } = await supabase
            .from('contact_groups')
            .insert({
                name,
                user_id: req.user.id
            })
            .select()
            .single();

        if (groupError) throw groupError;

        const groupId = groupData.id;

        // 2. Insert Contacts
        if (contacts && contacts.length > 0) {
            const contactsToInsert = contacts.map((contact: any) => ({
                group_id: groupId,
                email: contact.email || contact.Email, // handle case sensitivity matching
                name: contact.name || contact.Name || '',
                data: contact // store full row data for flexibility
            }));

            const { error: contactsError } = await supabase
                .from('contacts')
                .insert(contactsToInsert);

            if (contactsError) throw contactsError;
        }

        res.json({ message: 'Group created successfully', group: groupData });
    } catch (error: any) {
        console.error('Error creating group:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get contacts for a specific group
router.get('/groups/:groupId/contacts', async (req, res) => {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({ error: 'User not authenticated' });
        }

        const { groupId } = req.params;

        // Verify group belongs to user
        const { data: group, error: groupError } = await supabase
            .from('contact_groups')
            .select('id')
            .eq('id', groupId)
            .eq('user_id', req.user.id)
            .single();

        if (groupError || !group) {
            return res.status(404).json({ error: 'Group not found or access denied' });
        }

        const { data, error } = await supabase
            .from('contacts')
            .select('*')
            .eq('group_id', groupId)
            .order('created_at', { ascending: true });

        if (error) throw error;
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});


// Get Single Group
router.get('/groups/:groupId', async (req, res) => {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({ error: 'User not authenticated' });
        }

        const { groupId } = req.params;
        const { data, error } = await supabase
            .from('contact_groups')
            .select('*')
            .eq('id', groupId)
            .eq('user_id', req.user.id)
            .single();

        if (error) throw error;
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Update Group Name
router.put('/groups/:groupId', async (req, res) => {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({ error: 'User not authenticated' });
        }

        const { groupId } = req.params;
        const { name } = req.body;

        const { data, error } = await supabase
            .from('contact_groups')
            .update({ name })
            .eq('id', groupId)
            .eq('user_id', req.user.id)
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Delete Group
router.delete('/groups/:groupId', async (req, res) => {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({ error: 'User not authenticated' });
        }

        const { groupId } = req.params;

        // Contacts verify cascade delete in DB, otherwise delete manually here
        const { error } = await supabase
            .from('contact_groups')
            .delete()
            .eq('id', groupId)
            .eq('user_id', req.user.id);

        if (error) throw error;
        res.json({ message: 'Group deleted' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Add Single Contact to Group
router.post('/groups/:groupId/contacts', async (req, res) => {
    try {
        const { groupId } = req.params;
        const { email, name } = req.body;

        // Verify group ownership
        if (!req.user || !req.user.id) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        const { error: groupError } = await supabase.from('contact_groups').select('id').eq('id', groupId).eq('user_id', req.user.id).single();
        if (groupError) return res.status(404).json({ error: 'Group not found' });

        const { data, error } = await supabase
            .from('contacts')
            .insert({
                group_id: groupId,
                email,
                name,
                data: req.body // store all extras
            })
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Update Contact
router.put('/contacts/:contactId', async (req, res) => {
    try {
        const { contactId } = req.params;
        const { email, name } = req.body;

        if (!req.user || !req.user.id) {
            return res.status(401).json({ error: 'User not authenticated' });
        }

        // Verify ownership via Group
        // 1. Get contact's group_id
        const { data: contact, error: fetchError } = await supabase.from('contacts').select('group_id').eq('id', contactId).single();
        if (fetchError || !contact) return res.status(404).json({ error: 'Contact not found' });

        // 2. Check if group belongs to user
        const { data: group, error: groupError } = await supabase.from('contact_groups').select('id').eq('id', contact.group_id).eq('user_id', req.user.id).single();
        if (groupError || !group) return res.status(403).json({ error: 'Access denied' });

        const { data, error } = await supabase
            .from('contacts')
            .update({ email, name, data: req.body })
            .eq('id', contactId)
            .select()
            .single();

        if (error) throw error;
        res.json(data);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Delete Contact
router.delete('/contacts/:contactId', async (req, res) => {
    try {
        const { contactId } = req.params;

        if (!req.user || !req.user.id) {
            return res.status(401).json({ error: 'User not authenticated' });
        }

        // Verify ownership
        const { data: contact, error: fetchError } = await supabase.from('contacts').select('group_id').eq('id', contactId).single();
        if (fetchError || !contact) return res.status(404).json({ error: 'Contact not found' });

        const { data: group, error: groupError } = await supabase.from('contact_groups').select('id').eq('id', contact.group_id).eq('user_id', req.user.id).single();
        if (groupError || !group) return res.status(403).json({ error: 'Access denied' });

        const { error } = await supabase
            .from('contacts')
            .delete()
            .eq('id', contactId);

        if (error) throw error;
        res.json({ message: 'Contact deleted' });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
