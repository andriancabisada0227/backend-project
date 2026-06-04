const Joi = require("joi");

const addTaxi = Joi.object({
  taxiCompanyName: Joi.string().required(),
  taxiCity: Joi.string().required(),
  taxiState: Joi.string().required(),
  bgColor: Joi.string(),
  textColor: Joi.string(),
  primaryColor: Joi.string(),
  secondaryColor: Joi.string(),
  taxiLogo: Joi.string(),
  taxiName: Joi.string(),
  taxiCode: Joi.string().required(),
  zipCode: Joi.array().required(),
});

const editTaxi = Joi.object({
  taxiCompanyName: Joi.string(),
  taxiCity: Joi.string(),
  taxiState: Joi.string(),
  bgColor: Joi.string(),
  textColor: Joi.string(),
  primaryColor: Joi.string(),
  secondaryColor: Joi.string(),
  taxiLogo: Joi.string(),
  taxiName: Joi.string(),
  taxiCode: Joi.string(),
  zipCode: Joi.array().required(),
});

module.exports = {
  addTaxi,
  editTaxi,
};
