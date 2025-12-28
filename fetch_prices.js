
const Stripe = require('stripe');
const stripe = new Stripe('sk_test_51SjMCCHK4vBfWFJa2mEv0Cj6hpEJIGZ8j287pTKYv7LEQtTczUsZLHyh5hh0lsIlCkCF8DfQehkcVTmPdVveTnQO00v10D2DBs');

async function getPrices() {
    try {
        const prod1 = 'prod_TgjiMHleu6LlOZ'; // Gold (20)
        const prod2 = 'prod_Tgjh9xs13DAuFx'; // Pro (5)

        console.log('Fetching prices...');

        const prices1 = await stripe.prices.list({ product: prod1 });
        const prices2 = await stripe.prices.list({ product: prod2 });

        console.log('--- Gold (20 Euro) ---');
        prices1.data.forEach(p => console.log(`Price ID: ${p.id} - ${p.unit_amount} ${p.currency}`));

        console.log('--- Pro (5 Euro) ---');
        prices2.data.forEach(p => console.log(`Price ID: ${p.id} - ${p.unit_amount} ${p.currency}`));

    } catch (error) {
        console.error(error);
    }
}

getPrices();
