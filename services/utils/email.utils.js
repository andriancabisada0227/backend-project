const { dynamoClient } = require("../../config/aws");

const {
  PutCommand,
  GetCommand,
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");

const dynamoDocumentClient = DynamoDBDocumentClient.from(dynamoClient);

const generateToken = () => {
  return Math.floor(1000 + Math.random() * 9000);
};

const isValidEmailFormat = async (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const isWeakPassword = (password) => {
  if (!password) return true;

  const hasLowercase = /[a-z]/.test(password);
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

  return !(
    password.length >= 8 &&
    hasLowercase &&
    hasUppercase &&
    hasNumber &&
    hasSpecialChar
  );
};

const emailExists = async (email) => {
  const phoneParams = {
    TableName: "signupTable",
    FilterExpression: "#email = :email",
    ExpressionAttributeNames: {
      "#email": "email",

    },
    ExpressionAttributeValues: {
      ":email": email,

    },
  };
  try {
    const command1 = new ScanCommand(phoneParams);
    const userData1 = await dynamoDocumentClient.send(command1);

    console.log(userData1.Items.length);
    if (userData1.Items && userData1.Items.length > 0 && userData1.Items[0].isVerified === true) return true;
    else return false;
  } catch (error) {
    console.log(error);
    return `${error}`;
  }
};

const phoneNumberExists = async (phoneNumber) => {
  const phoneParams = {
    TableName: "signupTable",
    FilterExpression: "#pn = :phoneNumberVal",
    ExpressionAttributeNames: {
      "#pn": "phoneNumber",

    },
    ExpressionAttributeValues: {
      ":phoneNumberVal": phoneNumber,

    },
  };
  try {
    const command1 = new ScanCommand(phoneParams);
    const userData1 = await dynamoDocumentClient.send(command1);

    console.log(userData1.Items.length);
    if (userData1.Items && userData1.Items.length > 0 && userData1.Items[0].isVerified === true) return true;
    else return false;
  } catch (error) {
    console.log(error);
    return `${error}`;
  }
};
module.exports = {
  isValidEmailFormat,
  generateToken,
  isWeakPassword,
  emailExists,
  phoneNumberExists,
};
