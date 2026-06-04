const { dynamoClient } = require("../config/aws");

const {
  PutCommand,
  GetCommand,
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");

const dynamoDocumentClient = DynamoDBDocumentClient.from(dynamoClient);
const { v4: uuidv4 } = require("uuid");
const AWS = require("aws-sdk");
require("dotenv").config();
const { checkUserId } = require("../services/utils/userIdChecking");

const { paymentMade } = require("../services/pushnotification");
const { sendPayment } = require("../mailer");
const PDFDocument = require("pdfkit");
const payoutController = require("../app/controllers/payoutController");
const connectionToken = async (req, res) => {
  const stripe = require("stripe")(process.env.stripeKey); // replace with your Stripe secret key
  if (await checkUserId(req.header("UserId")))
    return res.status(400).json({ success: false, error: `Invalid User Id` });

  try {
    let result = await stripe.terminal.connectionTokens.create();
    return res.status(200).json({ success: true, data: result.secret });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const create_setup_intent = async (req, res) => {
 // replace with your Stripe secret key
  if (await checkUserId(req.header("UserId")))
    return res.status(400).json({ success: false, error: `Invalid User Id` });

  const customer = await stripe.customers.create();

  return res.status(200).json({
    success: true,
    data: { id: customer.id, client_secret: customer.client_secret },
  });
};

const create_setup_intent_key = async (req, res) => {
  const stripe = require("stripe")(process.env.stripeKey); // replace with your Stripe secret key
  const setupIntent = await stripe.setupIntents.create();

  // Send publishable key and SetupIntent details to client
  return res.status(200).json({
    success: true,
    data: {
      publishableKey: process.env.stripePublishKey,
      clientSecret: setupIntent.client_secret,
    },
  });
};

const createEphemeralKeys = async (req, res) => {
  const stripe = require("stripe")(process.env.stripeKey); // replace with your Stripe secret key
  if (await checkUserId(req.header("UserId")))
    return res.status(400).json({ success: false, error: `Invalid User Id` });

  if (req.params.id === undefined || req.params.id === "")
    return res
      .status(400)
      .json({ success: false, error: "Customer Id is required" });

  let key = await stripe.ephemeralKeys.create(
    { customer: req.params.id },
    { apiVersion: "2023-10-16" }
  );

  return res.status(200).json({ success: true, data: key });
};

const attachPaymentMethod = async (req, res) => {
  const stripe = require("stripe")(process.env.stripeKey);

  try {
    if (await checkUserId(req.header("UserId")))
      return res.status(400).json({ success: false, error: `Invalid User Id` });

    if (req.params.id === undefined || req.params.id === "")
      return res.status(400).json({ success: false, error: "Id is required" });

    if (req.body.customerId === undefined)
      return res
        .status(400)
        .json({ success: false, error: "Customer Id is required" });

    const paymentMethod = await stripe.paymentMethods.attach(req.params.id, {
      customer: req.body.customerId,
    });

    // First, get the user's record to find their id
    const getUserParams = {
      TableName: "parentsTable",
      FilterExpression: "userId = :uid",
      ExpressionAttributeValues: {
        ":uid": req.header("UserId")
      }
    };

    const userResult = await dynamoDocumentClient.send(new ScanCommand(getUserParams));
    const userRecord = userResult.Items[0];

    if (!userRecord) {
      throw new Error("User record not found");
    }

    // Update parentsTable with the payment method ID
    const updateParams = {
      TableName: "parentsTable",
      Key: {
        id: userRecord.id  // Using the id as the primary key
      },
      UpdateExpression: "SET paymentMethodId = :pmid",
      ExpressionAttributeValues: {
        ":pmid": paymentMethod.id
      }
    };

    await dynamoDocumentClient.send(new UpdateCommand(updateParams));

    return res.status(200).json({ success: true, data: paymentMethod });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const attachPaymentMethodDriver = async (req, res) => {
  const stripe = require("stripe")(process.env.stripeKey);

  try {
    if (await checkUserId(req.header("UserId")))
      return res.status(400).json({ success: false, error: `Invalid User Id` });

    if (req.params.id === undefined || req.params.id === "")
      return res.status(400).json({ success: false, error: "Id is required" });

    if (req.body.customerId === undefined)
      return res
        .status(400)
        .json({ success: false, error: "Customer Id is required" });

    const paymentMethod = await stripe.paymentMethods.attach(req.params.id, {
      customer: req.body.customerId,
    });

    // First, get the user's record to find their id
    const getUserParams = {
      TableName: "driversTable",
      FilterExpression: "userId = :uid",
      ExpressionAttributeValues: {
        ":uid": req.header("UserId")
      }
    };

    const userResult = await dynamoDocumentClient.send(new ScanCommand(getUserParams));
    const userRecord = userResult.Items[0];

    if (!userRecord) {
      throw new Error("User record not found");
    }

    // Update parentsTable with the payment method ID
    const updateParams = {
      TableName: "driversTable",
      Key: {
        id: userRecord.id  // Using the id as the primary key
      },
      UpdateExpression: "SET paymentMethodId = :pmid",
      ExpressionAttributeValues: {
        ":pmid": paymentMethod.id
      }
    };

    await dynamoDocumentClient.send(new UpdateCommand(updateParams));

    return res.status(200).json({ success: true, data: paymentMethod });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

const paymentSheet = async (req, res) => {
  const stripe = require("stripe")(process.env.stripeKey);
  
  try {
    if (await checkUserId(req.header("UserId")))
      return res.status(400).json({ success: false, error: `Invalid User Id` });

    // Round the amount to 2 decimal places
    const roundedAmount = Number(req.body.amount.toFixed(2));

    if (Math.round(roundedAmount * 100) < 50) {
      return res
        .status(400)
        .json({ success: false, error: "Amount must be at least $0.50 usd" });
    }

    // Get the user's record from parentsTable
    const getUserParams = {
      TableName: "parentsTable",
      FilterExpression: "userId = :uid",
      ExpressionAttributeValues: {
        ":uid": req.header("UserId")
      }
    };

    const userResult = await dynamoDocumentClient.send(new ScanCommand(getUserParams));
    const userRecord = userResult.Items[0];

    if (!userRecord || !userRecord.paymentMethodId) {
      return res.status(400).json({ 
        success: false, 
        error: "No payment method found for this user" 
      });
    }

    // Use the payment method ID from parentsTable
    const defaultPaymentMethod = userRecord.paymentMethodId;

    // Create payment intent without immediate confirmation
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(roundedAmount * 100),
      currency: "usd",
      customer: req.body.customerId ?? "",
      setup_future_usage: "off_session",
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'never'
      },
      capture_method: 'automatic',
      ...(defaultPaymentMethod && { payment_method: defaultPaymentMethod }),
    });

    // If payment method was provided, confirm the payment intent
    if (defaultPaymentMethod) {
      const confirmedIntent = await stripe.paymentIntents.confirm(paymentIntent.id, {
        payment_method: req.body.paymentMethodId
      });
      
      if (confirmedIntent.status === 'requires_action') {
        return res.status(200).json({ 
          success: false, 
          requiresAction: true,
          clientSecret: confirmedIntent.client_secret 
        });
      }

      if (confirmedIntent.status === 'succeeded') {
        // Add payment record to paymentHistoryTable
        const paymentRecord = {
          id: uuidv4(),
          paymentIntentId: confirmedIntent.id,
          userId: req.header("UserId"),
          amount: roundedAmount,
          status: confirmedIntent.status,
          createdAt: new Date().toISOString(),
          customerId: req.body.customerId ?? "",
          paymentMethodId: defaultPaymentMethod,
          scheduleId: req.body.scheduleId,
          driverUserId: req.body.driverUserId
        };

        // Add record to paymentHistoryTable
        await dynamoDocumentClient.send(
          new PutCommand({
            TableName: "paymentHistoryTable",
            Item: paymentRecord
          })
        );

        // Calculate 10% of the rounded payment amount for payout
        const payoutAmount = Number((roundedAmount * 0.10).toFixed(2));

        // Create payout record
        const payoutRecord = {
          id: uuidv4(),
          scheduleId: req.body.scheduleId,
          parentId: req.header("UserId"),
          driverId: req.body.driverUserId,
          amount: payoutAmount,
          status: 'pending', // You might want to track payout status
          createdAt: new Date().toISOString()
        };

        // Add record to payoutTable
        await dynamoDocumentClient.send(
          new PutCommand({
            TableName: "payoutTable",
            Item: payoutRecord
          })
        );
        // send payout to deriver
        let payload
        payload.body = {
          driverId: req.body.driverUserId,
          amount: payoutAmount
        }
        await payoutController.driverPayout(payload);

        return res.status(200).json({ 
          success: true, 
          data: {
            paymentIntent: confirmedIntent.client_secret,
            customer: req.body.customerId ?? "",
            publishableKey: process.env.stripeKey,
            status: confirmedIntent.status
          }
        });
      }
    }

    // If no payment method was provided, return the client secret
    return res.status(200).json({ 
      success: true, 
      data: {
        paymentIntent: paymentIntent.client_secret,
        customer: req.body.customerId ?? "",
        publishableKey: process.env.stripeKey
      }
    });

  } catch (error) {
    console.error('Payment Error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message,
      code: error.code 
    });
  }
};

const getCardsByUserId = async (req, res) => {
  const stripe = require("stripe")(process.env.stripeKey); // replace with your Stripe secret key

  if (await checkUserId(req.header("UserId")))
    return res.status(400).json({ success: false, error: `Invalid User Id` });

  try {
    const paymentMethods = await stripe.paymentMethods.list({
      customer: req.params.id,
      type: "card",
    });

    let simplifiedData = paymentMethods.data.map((pm) => ({
      id: pm.id,
      customer: pm.customer,
      card: pm.card,
    }));

    return res.status(200).json({
      success: true,
      data: simplifiedData,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: `${error}` });
  }
};

//driver app api
const driverPayout = async (req, res) => {
  const stripe = require("stripe")(process.env.stripeKey);

  if (await checkUserId(req.header("UserId")))
    return res.status(400).json({ success: false, error: `Invalid User Id` });
  
  const driverId = req.body.driverId;
  try {
    // Get the driver's record
    const getUserParams = {
      TableName: "driversTable",
      FilterExpression: "userId = :uid",
      ExpressionAttributeValues: {
        ":uid": driverId
      }
    };

    const userResult = await dynamoDocumentClient.send(new ScanCommand(getUserParams));
    const userRecord = userResult.Items[0];

    if (!userRecord || !userRecord.stripeAccountId) {
      // Create a new Connect account if one doesn't exist
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'US',
        capabilities: {
          card_payments: {requested: true},
          transfers: {requested: true}
        },
        business_type: 'individual',
        settings: {
          payouts: {
            schedule: {
              interval: 'manual'
            }
          }
        },
        // Add test bank account for test mode
        external_account: process.env.NODE_ENV === 'development' ? {
          object: 'bank_account',
          country: 'US',
          currency: 'usd',
          routing_number: '110000000',
          account_number: '000123456789'
        } : undefined
      });

      // Update driver record with new Stripe account ID
      await dynamoDocumentClient.send(new UpdateCommand({
        TableName: "driversTable",
        Key: { id: userRecord.id },
        UpdateExpression: "SET stripeAccountId = :sid",
        ExpressionAttributeValues: {
          ":sid": account.id
        }
      }));

      // Create onboarding link with test data prefill
      const accountLink = await stripe.accountLinks.create({
        account: account.id,
        refresh_url: `${process.env.APP_URL}/onboarding/refresh`,
        return_url: `${process.env.APP_URL}/onboarding/complete`,
        type: 'account_onboarding',
        collect: 'eventually_due'  // Only collect what's required
      });

      return res.status(202).json({ 
        success: false, 
        error: "New account created. Please complete onboarding.",
        onboardingUrl: accountLink.url,
        accountId: account.id,
        testMode: process.env.NODE_ENV === 'development'
      });
    }

    try {
      // Check if the account is properly set up
      const account = await stripe.accounts.retrieve(userRecord.stripeAccountId);
      
      if (!account.payouts_enabled || !account.charges_enabled || account.requirements.currently_due.length > 0) {
        // For test mode, provide test document upload link
        const accountLink = await stripe.accountLinks.create({
          account: userRecord.stripeAccountId,
          refresh_url: `${process.env.APP_URL}/onboarding/refresh`,
          return_url: `${process.env.APP_URL}/onboarding/complete`,
          type: 'account_onboarding',
          collect: 'eventually_due'
        });

        return res.status(400).json({ 
          success: false, 
          error: "Account setup incomplete. Please complete all requirements.",
          onboardingUrl: accountLink.url,
          accountId: account.id,
          requirements: account.requirements.currently_due,
          testMode: process.env.NODE_ENV === 'development',
          verificationFields: account.requirements.currently_due,
          accountStatus: {
            chargesEnabled: account.charges_enabled,
            payoutsEnabled: account.payouts_enabled,
            detailsSubmitted: account.details_submitted,
            currentlyDue: account.requirements.currently_due,
            pastDue: account.requirements.past_due,
            eventuallyDue: account.requirements.eventually_due
          }
        });
      }

      // Create the payout
      const payout = await stripe.payouts.create(
        {
          amount: Math.round(req.body.amount * 100),
          currency: "usd",
          method: "standard",
        },
        {
          stripeAccount: userRecord.stripeAccountId,
        }
      );

      return res.status(200).json({ success: true, data: payout });
    } catch (stripeError) {
      console.error('Stripe Error:', stripeError);
      return res.status(400).json({ 
        success: false, 
        error: stripeError.message,
        code: stripeError.code,
        type: stripeError.type
      });
    }
  } catch (error) {
    console.error('Payout Error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message,
      code: error.code 
    });
  }
};

const weeklyInvoice = async () => {};

const handlePaymentReturn = async (req, res) => {
  const stripe = require("stripe")(process.env.stripeKey);
  
  try {
    if (await checkUserId(req.header("UserId")))
      return res.status(400).json({ success: false, error: `Invalid User Id` });

    const { payment_intent } = req.query;

    if (!payment_intent) {
      return res.status(400).json({ 
        success: false, 
        error: "Payment intent ID is required" 
      });
    }

    // Retrieve the payment intent
    const paymentIntent = await stripe.paymentIntents.retrieve(payment_intent);

    if (paymentIntent.status === 'succeeded') {
      return res.status(200).json({ 
        success: true, 
        data: {
          status: paymentIntent.status,
          amount: paymentIntent.amount / 100, // Convert from cents to dollars
          currency: paymentIntent.currency,
          paymentId: paymentIntent.id
        }
      });
    }

    return res.status(400).json({ 
      success: false, 
      error: `Payment not completed. Status: ${paymentIntent.status}` 
    });

  } catch (error) {
    console.error('Payment Return Error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

const deleteStripeAccount = async (req, res) => {
  try {
    const accountId = req.params.id;
    const stripe = require("stripe")(process.env.stripeKey); 
    // Delete the account using Stripe API
    const deleted = await stripe.accounts.del(accountId);

    if (deleted.deleted) {
      return res.status(200).json({
        success: true,
        message: "Stripe account successfully deleted"
      });
    } else {
      throw new Error("Failed to delete Stripe account");
    }
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message || "Error deleting Stripe account"
    });
  }
};

module.exports = {
  getCardsByUserId,
  connectionToken,
  create_setup_intent,
  create_setup_intent_key,
  paymentSheet,
  createEphemeralKeys,
  attachPaymentMethod,
  attachPaymentMethodDriver,
  //drivers app api
  driverPayout,
  handlePaymentReturn,
  deleteStripeAccount
};
