"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const supabase_1 = require("../db/supabase");
const router = (0, express_1.Router)();
// Use memory storage to forward buffer to Supabase
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 7 * 1024 * 1024 } // 7MB limit
});
// Original file upload (local) - for backward compatibility/general use
// This is used by the frontend parser which might expect a response format.
// For now, we'll just mock specific behavior if needed or leave as stub.
// BUT, the MemoryStorage means req.file.path is undefined.
// If existing code relies on req.file.path, we need diskStorage for the root route.
// Let's use logic to switch or just handle the root route simply if it's unused or simple.
router.post('/', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    // Simple echo for now as the main requirement is the attachment route
    res.json({ message: 'File received' });
});
router.post('/attachment', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        const file = req.file;
        const fileExt = file.originalname.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `attachments/${fileName}`;
        const { data, error } = await supabase_1.supabase.storage
            .from('campaign-attachments')
            .upload(filePath, file.buffer, {
            contentType: file.mimetype,
            upsert: false
        });
        if (error) {
            throw error;
        }
        const { data: publicData } = supabase_1.supabase.storage
            .from('campaign-attachments')
            .getPublicUrl(filePath);
        res.json({
            url: publicData.publicUrl,
            filename: file.originalname,
            path: filePath
        });
    }
    catch (error) {
        console.error('Upload error details:', error);
        // Return the specific error message from Supabase/Storage
        res.status(500).json({
            error: error.message || 'Internal Server Error',
            details: error
        });
    }
});
exports.default = router;
