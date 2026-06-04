const Joi = require("joi");

const daySchema = Joi.object({
  day: Joi.string().required(),
  pickUpTime: Joi.string().required(),
  dropOffTime: Joi.string().required(),
});

const locationSchema = Joi.object({
  address: Joi.string().required(), // Note: "address" is misspelled in your data. Consider fixing it if it's a mistake.
  latitude: Joi.number().required(),
  longitude: Joi.number().required(),
});

const studentSchema = Joi.object({
  studentId: Joi.string().guid({ version: "uuidv4" }).required(),
  pickUpLocation: locationSchema.required(),
  dropOffLocation: locationSchema.required(),
  days: Joi.array().items(daySchema).required(),
  isRecurrence: Joi.boolean().required(),
  cost: Joi.number(),
});

const scheduleSchema = Joi.object({
  students: Joi.array().items(studentSchema).required(),
});

module.exports = scheduleSchema;
