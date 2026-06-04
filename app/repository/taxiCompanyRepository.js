const {
    GetCommand,
    DynamoDBDocumentClient,
    ScanCommand,
    PutCommand,
    UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");

const { dynamoClient } = require("../../config/aws");
const dynamoDocumentClient = DynamoDBDocumentClient.from(dynamoClient);
const uuid = require('uuid');
const TABLE_NAME = "taxiTable";

const findByEmail = async (email) => {
    try {
        const params = {
            TableName: TABLE_NAME,
            FilterExpression: "email = :email",
            ExpressionAttributeValues: {
                ":email": email
            }
        };

        const { Items } = await dynamoDocumentClient.send(new ScanCommand(params));
        return Items && Items.length > 0 ? Items[0] : null;
    } catch (error) {
        console.error("Error finding company by email:", error);
        throw error;
    }
};

const create = async (companyData) => {
    try {
        const params = {
            TableName: TABLE_NAME,
            Item: {
                id: uuid.v4(), // Primary key
                ...companyData,
            }
        };

        await dynamoDocumentClient.send(new PutCommand(params));
        return params.Item;
    } catch (error) {
        console.error("Error creating company:", error);
        throw error;
    }
};

const findById = async (id) => {
    try {
        const params = {
            TableName: TABLE_NAME,
            Key: { id: id }
        };

        const { Item } = await dynamoDocumentClient.send(new GetCommand(params));
        return Item;
    } catch (error) {
        console.error("Error finding company by id:", error);
        throw error;
    }
};

const findByTaxiCode = async (taxiCode) => {
    try {
        const params = {
            TableName: TABLE_NAME,
            FilterExpression: "taxiCode = :taxiCode",
            ExpressionAttributeValues: {
                ":taxiCode": taxiCode
            }
        };

        const { Items } = await dynamoDocumentClient.send(new ScanCommand(params));
        return Items && Items.length > 0 ? Items[0] : null;
    } catch (error) {
        console.error("Error finding company by taxi code:", error);
        throw error;
    }
};

const update = async (id, updateData) => {
    try {
        // Build dynamic update expression
        const updateFields = Object.keys(updateData);
        const UpdateExpression = 'set ' + updateFields.map(field => {
            // Handle array fields differently (like zipCode)
            if (Array.isArray(updateData[field])) {
                return `#${field} = :${field}`;
            }
            return `#${field} = :${field}`;
        }).join(', ');
        
        // Build dynamic attribute names and values
        const ExpressionAttributeNames = {};
        const ExpressionAttributeValues = {};
        updateFields.forEach(field => {
            ExpressionAttributeNames[`#${field}`] = field;
            ExpressionAttributeValues[`:${field}`] = updateData[field];
        });

        const params = {
            TableName: TABLE_NAME,
            Key: {  
                id: id
            },
            UpdateExpression,
            ExpressionAttributeNames,
            ExpressionAttributeValues,
            ReturnValues: "ALL_NEW"
        };

        const { Attributes } = await dynamoDocumentClient.send(new UpdateCommand(params));
        return Attributes;
    } catch (error) {
        console.error("Error updating company:", error);
        throw error;
    }
};

const getTaxiCompanyByZipCode = async (zipCode) => {
    try {
        console.log("zipCode", zipCode);
        const params = {
            TableName: TABLE_NAME,
            FilterExpression: "contains(zipCode, :zipCode)",
            ExpressionAttributeValues: {
                ":zipCode": zipCode
            }
        };

        const { Items } = await dynamoDocumentClient.send(new ScanCommand(params));
        return Items && Items.length > 0 ? Items[0] : null;
    } catch (error) {
        console.error("Error getting taxi company by zip code:", error);
        throw error;
    }
};

module.exports = {
    findByEmail,
    create,
    findByTaxiCode,
    update,
    getTaxiCompanyByZipCode,
    findById
}; 