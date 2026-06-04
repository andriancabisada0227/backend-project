const Joi = require("joi");

// Define the schema for the student data
const addDriverSchema = Joi.object({
  acceptDisabled: Joi.boolean().required(),
  address: Joi.string().required(),
  approvedStatus: Joi.string().required(), // Allowing empty string
  city: Joi.string().required(),
  country: Joi.string().required(),
  description: Joi.string().required(),
  maxPassenger: Joi.number().integer().required(),
  driverName: Joi.string().required(),
  plateNumber: Joi.string().required(), // Example of a simple plate number pattern
  role: Joi.string().required(), // Assuming 'Caregiver' is a fixed role
  vehicleName: Joi.string().required(),
  experience: Joi.number().required(),
  licenseNumber: Joi.string().default(""),
  insuranceId: Joi.string().default(""),
  age: Joi.number().default(20),
  zipCode: Joi.string().default(""),
  taxiCode: Joi.string().required(),
  vehicleYear: Joi.number()
    .integer()
    .min(1900)

    .max(new Date().getFullYear() + 20)
    .required(), // Vehicle year from 1900 to current year + 1
});

const addDriverLocationSchema = Joi.object({
  location: Joi.object({
    latitude: Joi.number().integer().required(),
    longitude: Joi.number().integer().required(),
    city: Joi.string().required(),
    state: Joi.string().required(),
    country: Joi.string().required(),
  }).required(),
});

module.exports = { addDriverSchema, addDriverLocationSchema };
