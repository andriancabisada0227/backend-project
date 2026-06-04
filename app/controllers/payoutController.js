const stripe = require("stripe")(process.env.stripeKey); 
const driverRepo = require('../repository/driverRepository');


const driverPayout = async (req, res) => {
    try {
        const { driverId, amount } = req.body;
        
        // Convert amount to cents for Stripe
        const amountInCents = Math.round(amount * 100);
        const driver = await driverRepo.getDriverByUserId(driverId)
        const stripeAccount = await stripe.accounts.retrieve(driver.stripeAccountId);
        const transfer = await stripe.transfers.create({
            amount: amountInCents,
            currency: 'usd',
            destination: stripeAccount.id,
        });   
        res.status(200).json({
            message: 'Payout created successfully',
            // payout: payout
            transfer: transfer
        });
    } catch (error) {
        res.status(400).json({
            message: 'Payout creation failed',
            error: error.message
        });
    }
}

module.exports = {
    driverPayout
}
