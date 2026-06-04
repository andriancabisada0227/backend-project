const Joi = require("@hapi/joi");

const addSchoolSchema = Joi.object({
  firstName: Joi.string().required(),
  lastName: Joi.string().required(),
  phoneNumber: Joi.string().required(),
  password: Joi.string().required(),
  schoolName: Joi.string().required(),
  schoolAddress: Joi.string().required(),
  country: Joi.string().required(),
  state: Joi.string().required(),
  city: Joi.string().required(),
  zipCode: Joi.string().required(),
});

const editSchoolSchema = Joi.object({
  firstName: Joi.string().required(),
  lastName: Joi.string().required(),
  phoneNumber: Joi.string().required(),
  password: Joi.string().required(),
  schoolName: Joi.string().required(),
  schoolAddress: Joi.string().required(),
  country: Joi.string().required(),
  state: Joi.string().required(),
  city: Joi.string().required(),
  zipCode: Joi.string().required(),
});

module.exports = { addSchoolSchema, editSchoolSchema };
