const Joi = require("joi");

const createParentSchema = Joi.object({
  parentName: Joi.string()
    .regex(/^[a-zA-Z\s\d]+$/)
    .required(),
  address: Joi.string().required(),
  city: Joi.string().required(),
  country: Joi.string().required(),
  emergencyPersonName: Joi.string().required(),
  age: Joi.number().default(20),
  userId: Joi.string().default(""),
  emergencyPhoneNumber: Joi.string().optional(), // Validates an international phone number format
  zipcode: Joi.string().required(),
  state: Joi.string().required(),

});

module.exports = { createParentSchema };
