const { dynamoClient } = require("../../config/aws");

const {
  PutCommand,
  GetCommand,
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");

const dynamoDocumentClient = DynamoDBDocumentClient.from(dynamoClient);

const updateParentDetails = async (user, command) => {
  if (command === "get") {

    if (user.reviews.length === 0) return user;
    for (const element of user.reviews) {
      //console.log(element.studentId);
      const parentParams = {
        TableName: "parentsTable",
        FilterExpression: "#userId = :userId",
        ExpressionAttributeNames: {
          "#userId": "userId", // Add this line to map 'email' to '#em'
        },
        ExpressionAttributeValues: {
          ":userId": element.userId, // Add this line to define the value for 'email'
        },
      };

      try {
        const parentScanCommand = new ScanCommand(parentParams);
        const parentUser = await dynamoDocumentClient.send(parentScanCommand);
        //console.log(element);
        //console.log(parentUser.Items[0].parentName);

        element.parentName = parentUser.Items[0]?.parentName ?? "";
        element.imageUrl = parentUser.Items[0]?.imageUrl ?? "";
      } catch (error) {
        console.error("Error fetching student data:", error);
      }
    }
    return user;
  }

  if (command === "scan") {
    for (const item of user) {
      if (item.reviews && item.reviews.length > 0) {
        for (const review of item.reviews) {
          const parentsParams = {
            TableName: "parentsTable",
            FilterExpression: "#userId = :userId",
            ExpressionAttributeNames: {
              "#userId": "userId", // Add this line to map 'email' to '#em'
            },
            ExpressionAttributeValues: {
              ":userId": review.userId ?? "", // Add this line to define the value for 'email'
            },
          };

          try {
            const parentScanCommand = new ScanCommand(parentsParams);
            const parentUser = await dynamoDocumentClient.send(
              parentScanCommand
            );
            //console.log(parentUser.Item, "||", parentUser.Items);
            //console.log(parentUser.Item, parentUser.Items);
            if (parentUser.Items.length > 0) {
              review.imageUrl = parentUser.Items[0].imageUrl || "";
              review.name = parentUser.Items[0].parentName;
            }
          } catch (error) {
            console.log(error);
            return error;
          }
        }
        return user;
      } else {
        const parentsParams = {
          TableName: "parentsTable",
          FilterExpression: "#userId = :userId",
          ExpressionAttributeNames: {
            "#userId": "userId", // Add this line to map 'email' to '#em'
          },
          ExpressionAttributeValues: {
            ":userId": item.userId ?? "", // Add this line to define the value for 'email'
          },
        };

        try {
          const parentScanCommand = new ScanCommand(parentsParams);
          const parentUser = await dynamoDocumentClient.send(parentScanCommand);
          //console.log(review);
          //console.log(parentUser.Item, "||", parentUser.Items);
          if (parentUser.Items[0]) {
            console.log(parentUser.Items);
            item.parentImageUrl = parentUser.Items[0]?.imageUrl || "";
            item.parentName = parentUser.Items[0]?.parentName;
          }
        } catch (error) {
          console.log(error);
          return error;
        }
      }
    }
    return user;
  }
};

module.exports = updateParentDetails;
