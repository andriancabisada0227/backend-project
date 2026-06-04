const Joi = require("joi");

const createEmailSchema = Joi.object({
  email: Joi.string().required(),
  password: Joi.string().required(),
  phoneNumber: Joi.string().required(),
  TaxiCode: Joi.string().required(),
});

const loginSchema = Joi.object({
  email: Joi.string(),
  phoneNumber: Joi.string(),
  password: Joi.string().required(),
});

module.exports = { createEmailSchema, loginSchema };
