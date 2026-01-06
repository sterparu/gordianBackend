import crypto from 'crypto';

// Key must be 256 bits (32 characters)
// In production, this MUST came from process.env.ENCRYPTION_KEY
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'vasteris_secure_email_system_key'; // 32 chars exactly
const IV_LENGTH = 16; // For AES, this is always 16

if (process.env.NODE_ENV === 'production' && !process.env.ENCRYPTION_KEY) {
    console.warn('WARNING: ENCRYPTION_KEY is missing in production. Using insecure default.');
}

export function encrypt(text: string): string {
    if (!text) return text;
    try {
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
        let encrypted = cipher.update(text);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        return iv.toString('hex') + ':' + encrypted.toString('hex');
    } catch (error) {
        console.error('Encryption failed:', error);
        return text; // Fallback to plain if fail? Or throw? Better return plain to avoid data loss during transitions? 
        // Actually, mixing plain and encrypted in DB is tricky. 
        // Let's assume we return text if error to be safe, but log it.
    }
}

export function decrypt(text: string): string {
    if (!text) return text;
    try {
        const textParts = text.split(':');
        if (textParts.length !== 2) return text; // Not encrypted format

        const iv = Buffer.from(textParts[0], 'hex');
        const encryptedText = Buffer.from(textParts[1], 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (error) {
        // If decryption fails (e.g. key changed or text wasn't encrypted), return original text
        // This is crucial for backward compatibility with existing plain passwords in DB!
        return text;
    }
}
