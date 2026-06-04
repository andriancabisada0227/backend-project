const Joi = require("joi");

const createOAuthSchema = Joi.object({
  email: Joi.string().required(),
  provider: Joi.string().required(),
});

module.exports = createOAuthSchema;
