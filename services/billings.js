const { dynamoClient } = require("../config/aws");
const PDFDocument = require("pdfkit");
const {
  PutCommand,
  GetCommand,
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");

const dynamoDocumentClient = DynamoDBDocumentClient.from(dynamoClient);
const { sendInvoice } = require("../mailer");
const { chargeParent } = require("../services/pushnotification");
const cron = require("node-cron");
const { InvoicePayment } = require("./webhook");
const { paymentSheet } = require("../services/payments");

const parseAmount = (amount) => {
  // Handle undefined, null, or empty string
  if (!amount && amount !== 0) return 0;
  // Convert to number and handle any invalid formats
  const parsed = Number(amount);
  // Ensure we return a number with 2 decimal places
  return isNaN(parsed) ? 0 : Math.round(parsed * 100) / 100;
};

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

// Consolidate common DynamoDB scan operations into a reusable function
const scanTable = async (tableName, filterExp, attrNames, attrValues) => {
  const params = {
    TableName: tableName,
    FilterExpression: filterExp,
    ExpressionAttributeValues: attrValues
  };
  
  // Only add ExpressionAttributeNames if they exist
  if (Object.keys(attrNames || {}).length > 0) {
    params.ExpressionAttributeNames = attrNames;
  }

  const result = await dynamoDocumentClient.send(new ScanCommand(params));
  return result.Items || [];
};

const parentBilling = async () => {
  try {
    console.log("parent billing called")
    const params = {
      TableName: "paymentsTable",
      FilterExpression: "#amountToPay <> :amountToPay",
      ExpressionAttributeNames: {
        "#amountToPay": "amountToPay",
      },
      ExpressionAttributeValues: {
        ":amountToPay": 0,
      },
    };

    const scanCommand = new ScanCommand(params);
    const userData = await dynamoDocumentClient.send(scanCommand);
    if (userData.Items.length !== 0) {
      console.log("start")
      //get email, parent name,  start date and end date
      for (let item of userData.Items) {
        const params = {
          TableName: "signupTable",
          Key: {
            id: item.parentUserId,
          },
        };

        const getCommand = new GetCommand(params);
        const resultData = await dynamoDocumentClient.send(getCommand);
        if (resultData.Item !== undefined) {
          const parent = await getParentData(resultData.Item.id);
          const parentName = parent.Items[0]?.parentName ?? "";
          console.log("parent name",parentName)

          const pdfParams = {
            TableName: "invoiceHistory",
            FilterExpression:
              "#parentUserId = :parentUserId and createdDate between :startDate and :endDate and (attribute_not_exists(#status) or #status <> :success)",
            ExpressionAttributeNames: {
              "#parentUserId": "parentUserId",
              "#status": "status"
            },
            ExpressionAttributeValues: {
              ":parentUserId": item.parentUserId,
              ":startDate": item.inclusiveDate[0],
              ":endDate": item.inclusiveDate[item.inclusiveDate.length - 1],
              ":success": "success"
            },
          };

          const pdfCommand = new ScanCommand(pdfParams);
          const pdfDataResult = await dynamoDocumentClient.send(pdfCommand);

          if (pdfDataResult.Items.length !== 0) {
            pdfDataResult.Items.sort(
              (a, b) => new Date(a.createdDate) - new Date(b.createdDate)
            );
            const doc = new PDFDocument();
            
            // Create chunks array to store PDF data
            const chunks = [];
            
            // Pipe the PDF content to the chunks array
            doc.on('data', (chunk) => {
              chunks.push(chunk);
            });

            // Create a promise to handle PDF generation completion
            const pdfBufferPromise = new Promise((resolve) => {
              doc.on('end', () => {
                const pdfBuffer = Buffer.concat(chunks);
                resolve(pdfBuffer);
              });
            });

            // Set document metadata
            doc.info.Title = 'SchoolRyde Invoice';
            doc.info.Author = 'SchoolRyde';

            // Add logo and header
            doc.fontSize(20)
               .text('SchoolRyde', { align: 'center' })
               .fontSize(16)
               .text('Ride Service Invoice', { align: 'center' })
               .moveDown();

            // Add invoice details
            doc.fontSize(10)
               .text(`Invoice Date: ${new Date().toLocaleDateString()}`)
               .text(`Invoice Period: ${item.inclusiveDate[0]} to ${item.inclusiveDate[item.inclusiveDate.length - 1]}`)
               .text(`Parent Name: ${parentName}`)
               .moveDown();

            // Add table header
            const yPos = doc.y;
            doc.fontSize(10)
               .text('Ride', 50, yPos, { width: 50 })
               .text('Date', 100, yPos, { width: 80 })
               .text('Driver', 180, yPos, { width: 150 })
               .text('Distance', 330, yPos, { width: 80 })
               .text('Amount', 410, yPos, { width: 100 })
               .moveDown();

            // Add separator line
            doc.moveTo(50, doc.y)
               .lineTo(550, doc.y)
               .stroke()
               .moveDown();

            // Add invoice items
            let totalAmount = 0;
            for (const [index, invoice] of pdfDataResult.Items.entries()) {
              const driverData = await getDriverData(invoice.driverUserId);
              const yPosition = doc.y;
              
              // Ensure amount is valid before processing
              const amountToPay = parseAmount(invoice.amountToPay);
              if (isNaN(amountToPay)) {
                console.warn(`Invalid amount for invoice ${index}:`, invoice.amountToPay);
                continue;
              }
              
              // Add invoice to PDF
              doc.fontSize(10)
                 .text(`#${index + 1}`, 50, yPosition, { width: 50 })
                 .text(invoice.createdDate.slice(0, 10), 100, yPosition, { width: 80 })
                 .text(driverData.Items[0].driverName, 180, yPosition, { width: 150 })
                 .text(`${parseAmount(invoice.rideDistance)} miles`, 330, yPosition, { width: 80 })
                 .text(`$${amountToPay.toFixed(2)}`, 410, yPosition, { width: 100 });
              
              totalAmount += amountToPay;

              // Process payment
              console.log("make payment called", invoice);
              await makePayment(item.parentUserId, amountToPay, parent.Items[0].customerId, invoice.scheduleId, invoice.driverUserId);

              // Update invoice status
              const updateParams = {
                TableName: "invoiceHistory",
                Key: {
                  id: invoice.id // Assuming there's an id field, adjust if different
                },
                UpdateExpression: "set #status = :status",
                ExpressionAttributeNames: {
                  "#status": "status"
                },
                ExpressionAttributeValues: {
                  ":status": "success"
                }
              };
              await dynamoDocumentClient.send(new UpdateCommand(updateParams));

              doc.moveDown();
            }
            // Add total section
            doc.moveTo(50, doc.y)
               .lineTo(550, doc.y)
               .stroke()
               .moveDown();

               doc.fontSize(10)
               .text('Total Amount:', 330, doc.y, { width: 80 })
               .text(`$${totalAmount.toFixed(2)}`, 410, doc.y, { width: 100 })
               .moveDown(2);
            // Add footer
            doc.fontSize(8)
               .text('Thank you for choosing SchoolRyde!', { align: 'center' })
               .text('For any questions, please contact support@schoolryde.com', { align: 'center' });
            console.log("end create pdf")
            // End the document and wait for buffer
            doc.end();
            const pdfBuffer = await pdfBufferPromise;
            // Send email with PDF attachment
            await sendInvoice(
              resultData.Item.email,
              parentName,
              item.inclusiveDate[0],
              item.inclusiveDate[item.inclusiveDate.length - 1],
              item.amountToPay,
              pdfBuffer.toString('base64')  // Convert buffer to base64 string
            );

            
            //push notification
            const pushNotificationParams = {
              TableName: "pushNotificationTable",
              FilterExpression: "#userId = :userId",
              ExpressionAttributeNames: {
                "#userId": "userId",
              },
              ExpressionAttributeValues: {
                ":userId": resultData.Item.id,
              },
            };

            const command = new ScanCommand(pushNotificationParams);
            const userResult = await dynamoDocumentClient.send(command);
            if (userResult.Items.length !== 0) {
              await chargeParent(
                userResult.Items[0].deviceToken,
                item.inclusiveDate[0],
                item.inclusiveDate[item.inclusiveDate.length - 1],
                item.amountToPay
              );
            }

            // here will be call a webhook also
            console.log("webhook called")
            try {
              await InvoicePayment({
                body: {
                  paymentId: item.id
                }
              }, {
                status: () => ({
                  json: () => ({}) // Mock response object
                })
              });
            } catch (webhookError) {
              console.error('Webhook notification error:', webhookError);
            }

            console.log(`Email sent successfully ${parentName}`);
          }
        }
      }
    }
    console.log("parent billing ended")
  } catch (error) {
    console.log(error);
  }
};

const schoolBilling = async (req, res) => {};

// cron every friday at 11:59 pm
const start = () => {
  cron.schedule("59 23 * * 5", async () => {
    await parentBilling();
  });
};

// for testing
// const start = () => {
//   console.log("parent billing started")
//   cron.schedule("*/30 * * * * *", async () => {
//     await parentBilling();
//   });
// };

const makePayment = async (userId, amount, customerId, scheduleId, driverUserId) => {
  // Mock request and response objects
  const req = {
    header: () => userId,
    body: {
      amount: amount,
      customerId: customerId,
      scheduleId: scheduleId,
      driverUserId: driverUserId
    }
  };

  console.log("make payment called",req, userId, customerId, scheduleId, driverUserId)
  const res = {
    status: function(statusCode) {  
      this.statusCode = statusCode;
      return this;
    },
    json: function(data) {
      return data;
    }
  };

  const pay = await paymentSheet(req, res);
  console.log("pay", pay)
  return pay;
};

module.exports = { start };
