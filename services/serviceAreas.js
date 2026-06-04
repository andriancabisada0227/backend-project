const AWS = require("aws-sdk");
const { v4: uuidv4 } = require("uuid");

const dynamoDB = new AWS.DynamoDB.DocumentClient();
const TABLE_NAME = "service_areas";

// Create service area
const addServiceArea = async (req, res) => {
  try {
    const { zipCode } = req.body;
    
    if (!zipCode || !Array.isArray(zipCode) || zipCode.length === 0) {
      return res.status(400).json({
        success: false,
        message: "zipCode array is required"
      });
    }

    // Create array of service area items
    const serviceAreas = zipCode.map(code => ({
      id: uuidv4(),
      postalCode: code,
      createdAt: new Date().toISOString()
    }));

    // Use batch write to insert multiple items
    const batchWriteParams = {
      RequestItems: {
        [TABLE_NAME]: serviceAreas.map(area => ({
          PutRequest: {
            Item: area
          }
        }))
      }
    };

    await dynamoDB.batchWrite(batchWriteParams).promise();

    return res.status(201).json({
      success: true,
      data: serviceAreas
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get all service areas
const getAllServiceAreas = async (req, res) => {
  try {
    const result = await dynamoDB.scan({
      TableName: 'service_areas'
    }).promise();

    return res.status(200).json({
      success: true,
      data: result.Items
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get service area by ID
const getServiceAreaById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await dynamoDB.get({
      TableName: 'service_areas',
      Key: { id }
    }).promise();

    if (!result.Item) {
      return res.status(404).json({
        success: false,
        message: "Service area not found"
      });
    }

    return res.status(200).json({
      success: true,
      data: result.Item
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Update service area
const updateServiceArea = async (req, res) => {
  try {
    const { id } = req.params;
    const { zipCode } = req.body;
    const postalCode = zipCode
    const result = await dynamoDB.update({
      TableName: 'service_areas',
      Key: { id },
      UpdateExpression: "set postalCode = :postalCode",
      ExpressionAttributeValues: {
        ":postalCode": postalCode
      },
      ReturnValues: "ALL_NEW"
    }).promise();

    return res.status(200).json({
      success: true,
      data: result.Attributes
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Delete service area
const deleteServiceArea = async (req, res) => {
  try {
    const { id } = req.params;

    await dynamoDB.delete({
      TableName: 'service_areas',
      Key: { id }
    }).promise();

    return res.status(200).json({
      success: true,
      message: "Service area deleted successfully"
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

module.exports = {
  addServiceArea,
  getAllServiceAreas,
  getServiceAreaById,
  updateServiceArea,
  deleteServiceArea
}; 