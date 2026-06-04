const axios = require("axios");
const pdf = require("pdf-parse");

const extractPDFText = async (url) => {
  try {
    // Axios GET request to fetch the PDF content
    const response = await axios({
      method: "get",
      url: url,
      responseType: "arraybuffer", // Important to handle PDF binary data
    });

    // Buffer of the PDF content
    const dataBuffer = Buffer.from(response.data);

    // Use pdf-parse to extract text from the PDF Buffer
    const data = await pdf(dataBuffer);
    
    const textJson = {};
    for (let i = 0; i < data.numpages; i++) {
      textJson[`Page_${i + 1}`] = data.text.split(data.metadata._metadata["xap:CreateDate"])[i];
    }

    return textJson;
  } catch (error) {
    console.error("Error during PDF download or text extraction:", error);
  }
};

module.exports = extractPDFText;
