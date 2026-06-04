const { dynamoClient } = require("../../config/aws");
const {
  PutCommand,
  GetCommand,
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} = require("@aws-sdk/lib-dynamodb");

const dynamoDocumentClient = DynamoDBDocumentClient.from(dynamoClient);

const updateStudentDetails = async (user, command) => {
  //console.log(JSON.stringify(user, null, 2));
  //console.log(user.Item.students);
  
  if (command === "get") {
    if (user.Item.students.length === 0) return user;
    for (const element of user.Item.students) {
      //console.log(element.studentId);
      const studentParams = {
        TableName: "studentsTable",
        Key: {
          id: element.studentId,
        },
      };

      try {
        const studentGetCommand = new GetCommand(studentParams);
        const studentUser = await dynamoDocumentClient.send(studentGetCommand);
        //console.log(studentUser.Item);

        const studentToAdd = {
          photoURL: studentUser.Item.imageUrl ?? "",
          age: studentUser.Item.age,
          name: studentUser.Item.studentName,
          school: studentUser.Item.schoolName,
          grade: studentUser.Item.grade,
        };
        element.studentDetails = studentToAdd;
      } catch (error) {
        console.error("Error fetching student data:", error);
      }
    }
    return user.Item;
  }

  if (command === "scan") {
    //console.log(user);
    //if (user.students === undefined || user.students.length === 0) return user;
    for (const item of user) {
      if (item.students && item.students.length > 0) {
        for (const student of item.students) {
          const studentParams = {
            TableName: "studentsTable",
            Key: {
              id: student.studentId,
            },
          };

          try {
            const studentGetCommand = new GetCommand(studentParams);
            const studentUser = await dynamoDocumentClient.send(
              studentGetCommand
            );
            //console.log(studentUser);
            if (studentUser.Item) {
              const studentToAdd = {
                imageUrl: studentUser.Item.imageUrl ?? "",
                age: studentUser.Item.age,
                name: studentUser.Item.studentName,
                school: studentUser.Item.schoolName,
                grade: studentUser.Item.grade,
              };
              student.studentDetails = studentToAdd;
            }
          } catch (error) {
            console.error("Error fetching student data:", error);
          }
        }
      }
    }
    return user;
  }
};

module.exports = updateStudentDetails;
