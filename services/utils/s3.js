const { v4: uuidv4 } = require("uuid");
require("dotenv").config();

const s3Data = async (imageBase64) => {
  // Determine the content type and decode the image
  let contentType = "image/jpeg"; // Default content type
  let imageBuffer = Buffer.from(imageBase64, "base64");
  if (imageBase64.startsWith("data:image/png;base64,")) {
    contentType = "image/png";
    // Remove the PNG data URL prefix before converting to Buffer
    imageBuffer = Buffer.from(
      imageBase64.replace("data:image/png;base64,", ""),
      "base64"
    );
  } else if (imageBase64.startsWith("data:image/jpeg;base64,")) {
    contentType = "image/jpeg";
    imageBuffer = Buffer.from(
      imageBase64.replace("data:image/jpeg;base64,", ""),
      "base64"
    );
  } else if (imageBase64.startsWith("data:image/jpg;base64,")) {
    contentType = "image/jpg";
    imageBuffer = Buffer.from(
      imageBase64.replace("data:image/jpg;base64,", ""),
      "base64"
    );
  } else return false;

  // Generate a unique key for the image in S3 based on content type
  const imageKey = `${uuidv4()}.${contentType.split("/")[1]}`; // 'jpg' or 'png'

  // Upload the image to an S3 bucket
  const s3Params = {
    Bucket: process.env.s3BucketName, // Replace with your S3 bucket name
    Key: imageKey,
    Body: imageBuffer,
    ContentType: contentType, // This is now dynamic
  };

  return { s3Params, imageKey };
};

module.exports = s3Data;
