
try {
    const Stripe = require('stripe');
    const stripe = new Stripe('', { apiVersion: '2024-12-18.acacia' });
    console.log("Stripe initialized successfully with empty string");
} catch (e) {
    console.error("Stripe initialization failed:", e.message);
}
