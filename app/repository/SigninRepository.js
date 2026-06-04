const { DynamoDBDocumentClient, ScanCommand, PutCommand, GetCommand, DeleteCommand } = require("@aws-sdk/lib-dynamodb");
const { v4: uuidv4 } = require('uuid');
const { dynamoClient } = require("../../config/aws");
const dynamoDocumentClient = DynamoDBDocumentClient.from(dynamoClient);

let tableName = "signupTable";
const createUser = async (userData) => {
    try {
        const user = {
            id: uuidv4(),
            email: userData.email,
            phoneNumber: userData.phoneNumber,
            password: userData.password,
            role: userData.role,
            type: userData.type,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        const params = {
            TableName: tableName,
            Item: user
        };

        await dynamoDocumentClient.send(new PutCommand(params));
        return user;
    } catch (error) {
        console.error("Error creating user:", error);
        throw error;
    }
};

const findByEmail = async (email) => {
    try {
        const params = {
            TableName: tableName,
            FilterExpression: "#email = :email",
            ExpressionAttributeNames: {
                "#email": "email"
            },
            ExpressionAttributeValues: {
                ":email": email
            }
        };

        const scanCommand = new ScanCommand(params);
        const data = await dynamoDocumentClient.send(scanCommand);
        
        return data.Items.length > 0 ? data.Items[0] : null;
    } catch (error) {
        console.error("Error finding user by email:", error);
        throw error;
    }
};

const findById = async (id) => {
    try {
        const params = {
            TableName: tableName,
            Key: {
                id: id
            }
        };

        const command = new GetCommand(params);
        const response = await dynamoDocumentClient.send(command);
        
        return response.Item || null;
    } catch (error) {
        console.error("Error finding user by id:", error);
        throw error;
    }
};

const deleteUser = async (id) => {
    try {
        const params = {
            TableName: tableName,
            Key: {
                id: id
            }
        };

        await dynamoDocumentClient.send(new DeleteCommand(params));
    } catch (error) {
        console.error("Error deleting user:", error);   
        throw error;
    }
};


module.exports = {
    createUser,
    findByEmail,
    findById,
    deleteUser
};
