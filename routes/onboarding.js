const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.stripeKey);

// Handle expired sessions
router.get('/refresh', async (req, res) => {
  try {
    // Get the driver's ID from session/token
    const driverId = req.header("UserId");
    
    // Create a new account link
    const accountLink = await stripe.accountLinks.create({
      account: req.query.account_id, // Stripe will provide this
      refresh_url: 'http://localhost:3000/onboarding/refresh',
      return_url: 'http://localhost:3000/onboarding/complete',
      type: 'account_onboarding',
    });

    // Redirect to the new onboarding URL
    res.redirect(accountLink.url);
  } catch (error) {
    console.error('Refresh Error:', error);
    res.redirect('/onboarding-error'); // Redirect to an error page
  }
});

// Handle successful onboarding
router.get('/complete', async (req, res) => {
  try {
    // Get the driver's ID from session/token
    const driverId = req.header("UserId");
    
    // You might want to:
    // 1. Update the driver's status in your database
    // 2. Send a confirmation email
    // 3. Redirect to a success page in your app

    res.redirect('/onboarding-success'); // Redirect to a success page
  } catch (error) {
    console.error('Complete Error:', error);
    res.redirect('/onboarding-error'); // Redirect to an error page
  }
});

module.exports = router;