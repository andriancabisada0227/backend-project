const Joi = require("joi");

const bookingDetailsSchema = Joi.object({
  driverId: Joi.string().guid({ version: "uuidv4" }).required(),
  totalStudent: Joi.number().integer().min(1).required(),
  scheduleId: Joi.string().guid({ version: "uuidv4" }).required(),
  paymentMethodId: Joi.string().required(),
});

const confirmBookingSchema = Joi.object({});
module.exports = bookingDetailsSchema;
