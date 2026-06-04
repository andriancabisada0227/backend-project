const Joi = require("joi");

const createCustomerSupportSchema = Joi.object({
  email: Joi.string()
    .email()
    .regex(/@treelinktechnologies\.com$/)
    .required()
    .messages({
      "string.pattern.base": `"email" must be a valid email address and belong to the domain "treelinktechnologies.com"`,
    }),
  password: Joi.string().required(),
});

const loginCustomerSupportSchema = Joi.object({
  email: Joi.string()
    .email()
    .regex(/@treelinktechnologies\.com$/)
    .required()
    .messages({
      "string.pattern.base": `"email" must be a valid email address and belong to the domain "treelinktechnologies.com"`,
    }),
  password: Joi.string().required(),
});

const addDMV_Criminal_RecordsSchema = Joi.object({
  driverEmail: Joi.string().email().required(),
  agentEmail: Joi.string().email().required(),
});

const sendDMV_Criminal_RecordsSchema = Joi.object({
  driverEmail: Joi.string().email().required(),
  description: Joi.string().required(),
  dmvFileBase64: Joi.string().required(),
  criminalFileBase64: Joi.string().required(),
});

const forgotPasswordSchema = Joi.object({
  email: Joi.string()
    .email()
    .regex(/@treelinktechnologies\.com$/)
    .required()
    .messages({
      "string.pattern.base": `"email" must be a valid email address and belong to the domain "treelinktechnologies.com"`,
    }),
});

const updatePasswordSchema = Joi.object({
  password: Joi.string().required(),
});
module.exports = {
  createCustomerSupportSchema,
  loginCustomerSupportSchema,
  addDMV_Criminal_RecordsSchema,
  sendDMV_Criminal_RecordsSchema,
  forgotPasswordSchema,
  updatePasswordSchema,
};
