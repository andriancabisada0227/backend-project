const { dynamoClient } = require("../config/aws");
const { PutCommand, GetCommand, DynamoDBDocumentClient, ScanCommand, DeleteCommand } = require("@aws-sdk/lib-dynamodb");
const { checkDriver, checkParent } = require("./utils/userIdChecking");
const { v4: uuidv4 } = require("uuid");
const axios = require('axios');
const { createWebhookEntry, updateWebhookStatus, checkWebhook, scanTable } = require("../app/repository/webhookRepository");
const parentRepository = require("../app/repository/parentsRepository");
const taxiCompanyRepository = require("../app/repository/taxiCompanyRepository");
const dynamoDocumentClient = DynamoDBDocumentClient.from(dynamoClient);
exports.dynamoDocumentClient = dynamoDocumentClient;



// Simplified helper functions
const getParentData = async (userId) => {
  const items = await scanTable(
    "parentsTable", 
    "#uid = :userId",
    { "#uid": "userId" },
    { ":userId": userId }
  );
  if (!items.length) throw new Error('Parent details not found');
  return { Items: items };
};

const getTaxiKey = async (taxiCode) => ({
  Items: await scanTable(
    "taxiTable",
    "taxiCode = :taxiCode",
    null,
    { ":taxiCode": taxiCode }
  )
});

const getDriverData = async (userId) => {
  if (!userId) {
    throw new Error('Driver ID is required');
  }
  
  return {
    Items: await scanTable(
      "driversTable",
      "userId = :userId",
      null,
      { ":userId": userId }
    )
  };
};

const getDriverDataById = async (id) => {
  if (!id) {
    throw new Error('Driver ID is required');
  }
  
  return {
    Items: await scanTable(
      "driversTable",
      "id = :id",
      null,
      { ":id": id }
    )
  };
};


// Simplified webhook processing
const processWebhook = async (webhookUrl, payload, webhookId) => {
  try {
    await axios.post(webhookUrl, payload);
    await updateWebhookStatus(webhookId, 'COMPLETED', {
      response: {
        success: true,
        message: 'Webhook processed successfully',
        payload,
      }
    });
    return {
      status: 201,
      data: {
        success: true,
        webhookId,
        message: 'Webhook processed successfully',
        payload
      }
    };
  } catch (axiosError) {
    await updateWebhookStatus(webhookId, 'FAILED', { 
      error: `Failed to send webhook: ${axiosError.message}`
    });
    return {
      status: 500,
      data: {
        success: false,
        webhookId,
        error: 'Failed to send webhook',
        message: axiosError.message
      }
    };
  }
};

// Main Webhook Functions
const WebhookNotifyDriver = async (req, res) => {
  try {
    const { userid } = req.body;
    const webhookId = await createWebhookEntry('VERIFICATION_STATUS_DRIVER', req.body);
    // Validate driver
    const isDriver = await checkDriver(userid);
    if (isDriver) {
      await updateWebhookStatus(webhookId, 'FAILED', { error: 'User is not a driver' });
      return res.status(400).json({ success: false, error: "User is not a driver", webhookId });
    }

    const driverData = await getDriverData(userid);
    const webhook = await checkWebhook(driverData.Items[0].taxiCode);
    if(!webhook){
      await updateWebhookStatus(webhookId, 'FAILED', { error: 'Webhook not found' });
      return res.status(400).json({ success: false, error: 'Webhook not found', webhookId });
    }
    const webhookUrl = webhook.Items[0].url;
    const payload = {
      event: 'VERIFICATION_STATUS_DRIVER',
      ...driverData.Items[0],
    }
    
    const result = await processWebhook(webhookUrl, payload, webhookId);
    return res.status(result.status).json(result.data);
    
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to process webhook',
      message: error?.errorInfo?.message || error.message || 'Failed to process webhook'
    });
  }
};

const Booking = async (req, res) => {
  try {
    const webhookId = await createWebhookEntry('BOOKING_REQUEST', req.body);

    // Get booking details
    const booking = await dynamoDocumentClient.send(new GetCommand({
      TableName: "bookingsTable",
      Key: { id: req.body.bookingId }
    }));

    if (!booking.Item) {
      await updateWebhookStatus(webhookId, 'FAILED', { error: 'Booking not found' });
      return res.status(404).json({ success: false, error: 'Booking not found', webhookId });
    }
    const parentData = await parentRepository.getParentByUserId(booking.Item.userId);
    if(!parentData){
      await updateWebhookStatus(webhookId, 'FAILED', { error: 'Parent not found' });
      return res.status(404).json({ success: false, error: 'Parent not found', webhookId });
    }

    if(!parentData.zipcode){
      await updateWebhookStatus(webhookId, 'FAILED', { error: 'Parent zipcode not found' });
      return res.status(404).json({ success: false, error: 'Parent zipcode not found', webhookId });
    }

    const taxiCompany = await taxiCompanyRepository.getTaxiCompanyByZipCode(parentData.zipcode);
    if(!taxiCompany){
      await updateWebhookStatus(webhookId, 'FAILED', { error: 'Taxi company not found' });
      return res.status(404).json({ success: false, error: 'Taxi company not found', webhookId });
    }


    // const driverData = await getDriverDataById(booking.Item.driverId);
    // if (!driverData.Items || driverData.Items.length === 0 || !driverData.Items[0].taxiCode) {
    //   await updateWebhookStatus(webhookId, 'FAILED', { error: 'Driver not found' });
    //   return res.status(400).json({ success: false, error: 'Driver not found', webhookId });
    // }

    const webhook = await checkWebhook(taxiCompany.taxiCode);
    if(!webhook){
      await updateWebhookStatus(webhookId, 'FAILED', { error: 'Webhook not found' });
      return res.status(400).json({ success: false, error: 'Webhook not found', webhookId });
    }

    const webhookUrl = webhook.Items[0].url;
    const payload = {
     event: 'BOOKING_REQUEST',
     bookingId: booking.Item.id,
     driverId: booking.Item.driverId ?? null,
     parentId: booking.Item.userId,
     scheduleId: booking.Item.scheduleId
    }
    const result = await processWebhook(webhookUrl, payload, webhookId);
    return res.status(result.status).json(result.data);
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to process webhook',
      message: error?.errorInfo?.message || error.message || 'Failed to process webhook'
    });
  }
};

const BookingUpdate = async (req, res) => {
  try {
    const webhookId = await createWebhookEntry('BOOKING_UPDATE', req.body);
    // Get booking details
    const booking = await dynamoDocumentClient.send(new GetCommand({
      TableName: "bookingsTable",
      Key: { id: req.body.bookingId }
    }));

    if (!booking.Item) {
      await updateWebhookStatus(webhookId, 'FAILED', { error: 'Booking not found' });
      return res.status(404).json({ success: false, error: 'Booking not found', webhookId });
    }
    const driverData = await getDriverDataById(booking.Item.driverId);
    if (!driverData.Items || driverData.Items.length === 0 || !driverData.Items[0].taxiCode) {
      await updateWebhookStatus(webhookId, 'FAILED', { error: 'Driver not found' });
      return res.status(400).json({ success: false, error: 'Driver not found', webhookId });
    }
    const webhook = await checkWebhook(driverData.Items[0].taxiCode);
    if(!webhook){
      await updateWebhookStatus(webhookId, 'FAILED', { error: 'Webhook not found' });
      return res.status(400).json({ success: false, error: 'Webhook not found', webhookId });
    }

    const webhookUrl = webhook.Items[0].url;
    const payload = {
      event: 'BOOKING_UPDATE',
      booking: booking.Item
    }
    const result = await processWebhook(webhookUrl, payload, webhookId);
    return res.status(result.status).json(result.data);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to process webhook',
      message: error?.errorInfo?.message || error.message || 'Failed to process webhook'
    });
  }
}

const BookingDelete = async (req, res) => {
  try {
    const webhookId = await createWebhookEntry('BOOKING_DELETE', req.body);
    // Get booking details
    const booking = await dynamoDocumentClient.send(new GetCommand({
      TableName: "bookingsTable",
      Key: { id: req.body.bookingId }
    }));

    if (!booking.Item) {
      await updateWebhookStatus(webhookId, 'FAILED', { error: 'Booking not found' });
      return res.status(404).json({ success: false, error: 'Booking not found', webhookId });
    }
    const driverData = await getDriverDataById(booking.Item.driverId);
    if (!driverData.Items || driverData.Items.length === 0 || !driverData.Items[0].taxiCode) {
      await updateWebhookStatus(webhookId, 'FAILED', { error: 'Driver not found' });
      return res.status(400).json({ success: false, error: 'Driver not found', webhookId });
    }
    const webhook = await checkWebhook(driverData.Items[0].taxiCode);
    if(!webhook){
      await updateWebhookStatus(webhookId, 'FAILED', { error: 'Webhook not found' });
      return res.status(400).json({ success: false, error: 'Webhook not found', webhookId });
    }

    const webhookUrl = webhook.Items[0].url;
    const payload = {
      event: 'BOOKING_DELETE',
      booking: booking.Item,    
    }
    const result = await processWebhook(webhookUrl, payload, webhookId);
    return res.status(result.status).json(result.data);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Failed to process webhook',
      message: error?.errorInfo?.message || error.message || 'Failed to process webhook'
    });
  }
}

// Simplified versions of other webhooks
const CancelScheduleParent = async (req, res) => {
  try {
    const webhookId = await createWebhookEntry('CANCEL_SCHEDULE_PARENT', req.body);
    if (!req.body.scheduleId) {
      await updateWebhookStatus(webhookId, 'FAILED', { error: 'Schedule ID is required' });
      return res.status(400).json({ success: false, error: 'Schedule ID is required', webhookId });
    }
    // Get schedule details
    const schedule = await dynamoDocumentClient.send(new ScanCommand({
      TableName: "schedulesTable",
      FilterExpression: "id = :scheduleId",
      ExpressionAttributeValues: {
        ":scheduleId": req.body.scheduleId
      }
    }));

    if (!schedule.Items || schedule.Items.length === 0) {
      await updateWebhookStatus(webhookId, 'FAILED', { error: 'Schedule not found' });
      return res.status(404).json({ success: false, error: 'Schedule not found', webhookId });
    }
    const scheduleItem = schedule.Items[0];
    // Get booking details
    const booking = await dynamoDocumentClient.send(new ScanCommand({  
      TableName: "bookingsTable",
      FilterExpression: "scheduleId = :scheduleId",
      ExpressionAttributeValues: {
        ":scheduleId": scheduleItem.id
      }
    }));
    if (!booking.Items || booking.Items.length === 0) {
      await updateWebhookStatus(webhookId, 'FAILED', { error: 'Booking not found' });
      return res.status(404).json({ success: false, error: 'Booking not found', webhookId });
    }
    const driverData = await getDriverDataById(booking.Items[0].driverId);
    if (!driverData.Items || driverData.Items.length === 0 || !driverData.Items[0].taxiCode) {
      await updateWebhookStatus(webhookId, 'FAILED', { error: 'Driver not found' });
      return res.status(400).json({ success: false, error: 'Driver not found', webhookId });
    }
    const webhook = await checkWebhook(driverData.Items[0].taxiCode);
    if(!webhook){
      await updateWebhookStatus(webhookId, 'FAILED', { error: 'Webhook not found' });
      return res.status(400).json({ success: false, error: 'Webhook not found', webhookId });
    }

    const webhookUrl = webhook.Items[0].url;
    const payload = {
     event: 'CANCEL_REQUEST_PARENT',
     scheduleItem
    }

    const result = await processWebhook(webhookUrl, payload, webhookId);
    return res.status(result.status).json(result.data);
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to process webhook',
      message: error?.errorInfo?.message || error.message || 'Failed to process webhook'
    });
  }
};

const InvoicePayment = async (req, res) => {
  try {
    const webhookId = await createWebhookEntry('INVOICE_PAYMENT', req.body);
    
    // Validate paymentId exists in request body
    if (!req.body.paymentId) {
      await updateWebhookStatus(webhookId, 'FAILED', { error: 'Payment ID is required' });
      return res.status(400).json({ success: false, error: 'Payment ID is required', webhookId });
    }

    // Get payment details
    const payment = await dynamoDocumentClient.send(new ScanCommand({
      TableName: "paymentsTable",
      FilterExpression: "id = :paymentId",
      ExpressionAttributeValues: {
        ":paymentId": req.body.paymentId
      }
    }));

    if (!payment.Items || payment.Items.length === 0) {
      await updateWebhookStatus(webhookId, 'FAILED', { error: 'Payment not found' });
      return res.status(404).json({ success: false, error: 'Payment not found', webhookId });
    }

    const paymentItem = payment.Items[0];
    const userIsParent = await checkParent(paymentItem.driverUserId);
    if (!userIsParent) {
      await updateWebhookStatus(webhookId, 'FAILED', { error: 'User is not a driver' });
      return res.status(400).json({ success: false, error: "User is not a driver", webhookId });
    }

    if (!paymentItem.driverUserId) {
      await updateWebhookStatus(webhookId, 'FAILED', { error: 'Driver ID is missing in payment data' });
      return res.status(400).json({ success: false, error: 'Driver ID is missing in payment data', webhookId });
    }
    
    const driverData = await getDriverData(paymentItem.driverUserId);
    if (!driverData.Items || driverData.Items.length === 0 || !driverData.Items[0].taxiCode) {
      await updateWebhookStatus(webhookId, 'FAILED', { error: 'Driver not found or missing taxi code' });
      return res.status(400).json({ success: false, error: 'Driver not found or missing taxi code', webhookId });
    }

    const webhook = await checkWebhook(driverData.Items[0].taxiCode);
    if(!webhook){
      await updateWebhookStatus(webhookId, 'FAILED', { error: 'Webhook not found' });
      return res.status(400).json({ success: false, error: 'Webhook not found', webhookId });
    }

    const webhookUrl = webhook.Items[0].url;
    const payload = {
     event: 'PAYMENT_INVOICE',
     paymentItem
    }

    const result = await processWebhook(webhookUrl, payload, webhookId);
    return res.status(result.status).json(result.data);

  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to process webhook',
      message: error?.errorInfo?.message || error.message || 'Failed to process webhook'
    });
  }
};

const WebhookEndpoints = async (req, res) => {
  try {
    const { url, taxiCode, taxiApiKey } = req.body;

    if (!url || !taxiCode || !taxiApiKey) {
      return res.status(400).json({ 
        success: false, 
        message: 'Webhook URL, taxiCode and taxiApiKey are required' 
      });
    }

    // Validate taxi code and API key
    const params = {
      TableName: "taxiTable",
      FilterExpression: "#taxiCode = :taxiCode AND #taxiApiKey = :taxiApiKey",
      ExpressionAttributeNames: {
        "#taxiCode": "taxiCode",
        "#taxiApiKey": "taxiApiKey"
      },
      ExpressionAttributeValues: {
        ":taxiCode": taxiCode,
        ":taxiApiKey": taxiApiKey
      },
    };
    
    const scanCommand = new ScanCommand(params);
    const taxi = await dynamoDocumentClient.send(scanCommand);
    if (taxi.Items.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: "Invalid taxi code or API key" 
      });
    }

    // Check for existing webhook for this userId
    const existingWebhook = await dynamoDocumentClient.send(new ScanCommand({
      TableName: "webhooks_list",
      FilterExpression: "taxiApiKey = :taxiApiKey",
      ExpressionAttributeValues: {
        ":taxiApiKey": taxiApiKey
      }
    }));



    if (existingWebhook.Items?.length > 0) {
      return res.status(200).json({
        success: true,
        message: 'Webhook already exists for this user',
        data: existingWebhook.Items[0]
      });
    }

    // Check for existing webhook for this userId
    const checkTaxiCode = await dynamoDocumentClient.send(new ScanCommand({
      TableName: "webhooks_list",
      FilterExpression: "taxiCode = :taxiCode",
      ExpressionAttributeValues: {
        ":taxiCode": taxiCode
      }
    }));

    if(checkTaxiCode.Items?.length > 0){
      // Delete existing webhook entry
      await dynamoDocumentClient.send(new DeleteCommand({
        TableName: "webhooks_list",
        Key: {
          id: checkTaxiCode.Items[0].id
        }
      }));
    }   
     
    const taxiItem = taxi.Items[0];

    const webhookId = uuidv4();
    const webhookData = {
      id: webhookId,
      url,
      taxiCode: taxiItem.taxiCode,
      taxiApiKey: taxiApiKey,
      created_at: new Date().toISOString()
    };

    await dynamoDocumentClient.send(new PutCommand({
      TableName: "webhooks_list",
      Item: webhookData
    }));

    return res.status(201).json({
      success: true,
      message: 'Webhook endpoint registered successfully',
      data: webhookData
    });

  } catch (error) {
    console.error('Error registering webhook:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to register webhook endpoint',
      message: error?.message || 'Failed to register webhook endpoint'
    });
  }
};

const updateSchedule = async (req, res) => {
  try {
    const webhookId = await createWebhookEntry('UPDATE_SCHEDULE', req.body);
    const schedule = await dynamoDocumentClient.send(new ScanCommand({
      TableName: "schedulesTable",
      FilterExpression: "id = :scheduleId",
      ExpressionAttributeValues: {
        ":scheduleId": req.body.scheduleId
      }
    }));

    if (!schedule.Items || schedule.Items.length === 0) {
      await updateWebhookStatus(webhookId, 'FAILED', { error: 'Schedule not found' });
      return res.status(404).json({ success: false, error: 'Schedule not found', webhookId });
    }
    const scheduleItem = schedule.Items[0];
    const parentData = await parentRepository.getParentByUserId(scheduleItem.userId);
    if(!parentData){
      await updateWebhookStatus(webhookId, 'FAILED', { error: 'Parent not found' });
      return res.status(404).json({ success: false, error: 'Parent not found', webhookId });
    }

    const taxiCompany = await taxiCompanyRepository.getTaxiCompanyByZipCode(parentData.zipcode);
    if(!taxiCompany){
      await updateWebhookStatus(webhookId, 'FAILED', { error: 'Taxi company not found' });
      return res.status(404).json({ success: false, error: 'Taxi company not found', webhookId });
    }

    const webhook = await checkWebhook(taxiCompany.taxiCode);
    if(!webhook){
      await updateWebhookStatus(webhookId, 'FAILED', { error: 'Webhook not found' });
      return res.status(400).json({ success: false, error: 'Webhook not found', webhookId });
    }

    const webhookUrl = webhook.Items[0].url;
    const payload = {
     event: 'UPDATE_SCHEDULE',
     scheduleItem
    }
    const result = await processWebhook(webhookUrl, payload, webhookId);
    return res.status(result.status).json(result.data);


  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to process webhook',
      message: error?.errorInfo?.message || error.message || 'Failed to process webhook'
    });
  }
}

const deleteSchedule = async (req, res) => {
  try {
    const webhookId = await createWebhookEntry('DELETE_SCHEDULE', req.body);
    const schedule = await dynamoDocumentClient.send(new ScanCommand({
      TableName: "schedulesTable",
      FilterExpression: "id = :scheduleId",
      ExpressionAttributeValues: {
        ":scheduleId": req.body.scheduleId
      }
    }));

    if (!schedule.Items || schedule.Items.length === 0) {
      await updateWebhookStatus(webhookId, 'FAILED', { error: 'Schedule not found' });
      return res.status(404).json({ success: false, error: 'Schedule not found', webhookId });
    }
    const scheduleItem = schedule.Items[0]; 
    const parentData = await parentRepository.getParentByUserId(scheduleItem.userId);
    if(!parentData){
      await updateWebhookStatus(webhookId, 'FAILED', { error: 'Parent not found' });
      return res.status(404).json({ success: false, error: 'Parent not found', webhookId });
    }
    const taxiCompany = await taxiCompanyRepository.getTaxiCompanyByZipCode(parentData.zipcode);
    if(!taxiCompany){
      await updateWebhookStatus(webhookId, 'FAILED', { error: 'Taxi company not found' });
      return res.status(404).json({ success: false, error: 'Taxi company not found', webhookId });
    }

    const webhook = await checkWebhook(taxiCompany.taxiCode);
    if(!webhook){
      await updateWebhookStatus(webhookId, 'FAILED', { error: 'Webhook not found' });
      return res.status(400).json({ success: false, error: 'Webhook not found', webhookId });
    }
    const data = {
      ...scheduleItem,
      students: req.body.students
    }
    const webhookUrl = webhook.Items[0].url;
    const payload = {
     event: 'DELETE_SCHEDULE',
     data
    }
    const result = await processWebhook(webhookUrl, payload, webhookId);
    return res.status(result.status).json(result.data);
    
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to process webhook',
      message: error?.errorInfo?.message || error.message || 'Failed to process webhook'
    });
  }
}
module.exports = {
  WebhookNotifyDriver,
  Booking,
  CancelScheduleParent,
  InvoicePayment,
  getParentData,
  getTaxiKey,
  getDriverData,
  WebhookEndpoints,
  BookingUpdate,
  BookingDelete,
  updateSchedule,
  deleteSchedule
}; 