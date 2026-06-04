require("dotenv").config();
const AWS = require("aws-sdk");

// Configure the AWS environment
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID_DRIVERS,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY_DRIVERS,
  region: process.env.REGION_DRIVERS,
});

const ses = new AWS.SES();

const sendVerificationEmail = async (to, subject, body, token) => {
  const mailOptions = {
    Source: "aditya@treelinktechnologies.com", // Your SES verified email
    Destination: {
      ToAddresses: [to],
    },
    Message: {
      Subject: {
        Data: `${subject}`,
        Charset: "UTF-8",
      },
      Body: {
        Text: {
          Data: `${body} ${token}`,
          Charset: "UTF-8",
        },
      },
    },
  };

  await ses.sendEmail(mailOptions).promise();
};

const sendInvoice = async (
  to,
  parentName,
  startDate,
  endDate,
  amount,
  pdfBuffer
) => {
  // Create MIME message
  const boundary = `boundary_${Date.now().toString(16)}`;
  const message = createMIMEMessage({
    from: "admin@treelinktechnologies.com",
    to,
    subject: "Invoice from SchoolRyde",
    text: `Hi ${parentName}\n\nPlease find the attached invoice for the rides from ${
      endDate ? `${startDate} to ${endDate}` : startDate
    }. Your card has been charged for the amount ${amount}.`,
    pdfBuffer,
    boundary
  });

  const params = {
    RawMessage: { Data: message },
  };

  await ses.sendRawEmail(params).promise();
};

// Helper function to create MIME message
function createMIMEMessage({ from, to, subject, text, pdfBuffer, boundary }) {
  const mimeMessage = [
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset=UTF-8`,
    ``,
    text,
    ``,
    `--${boundary}`,
    `Content-Type: application/pdf`,
    `Content-Disposition: attachment; filename="Invoice.pdf"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    pdfBuffer,
    ``,
    `--${boundary}--`
  ].join('\r\n');

  return mimeMessage;
}

const sendPayment = async (
  to,
  driverName,
  startDate,
  endDate,
  amount,
  pdfBuffer
) => {
  const mailOptions = {
    Source: "admin@treelinktechnologies.com", // Your SES verified email
    Destination: {
      ToAddresses: [to],
    },
    Message: {
      Subject: {
        Data: `Payment from SchoolRyde`,
        Charset: "UTF-8",
      },
      Body: {
        Text: {
          Data: `Hi ${driverName} \n
          Payment has been made for the rides from ${startDate} to ${endDate}. The amount ${amount} has been deposited to your account. Please find the attached ride details in the attachment.`,
          Charset: "UTF-8",
        },
      },
    },
    attachment: [
      {
        fileName: "Invoice.pdf",
        content: pdfBuffer,
      },
    ],
  };

  await ses.sendEmail(mailOptions).promise();
};
module.exports = { sendVerificationEmail, sendInvoice, sendPayment };
