const Joi = require("joi");

const createOTPSchema = Joi.object({
  phoneNumber: Joi.string().required(),
});

module.exports = createOTPSchema;
