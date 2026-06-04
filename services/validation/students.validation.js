const Joi = require("joi");

// Define the schema for the student data
const addStudentSchema = Joi.object({
  imageBase64: Joi.string().allow(null, ""),
  city: Joi.string().allow(null, ""),
  country: Joi.string().allow(null, ""),
  address: Joi.string().allow(null, ""),
  gender: Joi.string().allow(null, ""),
  studentDescription: Joi.string().allow(null, ""),
  studentDisability: Joi.string().allow(null, ""),
  otherAssistance: Joi.string().allow(null, ""),
  shareRide: Joi.boolean().default(false),
  paymentMethod: Joi.string().allow(null, ""),
  isInvited: Joi.boolean().default(false),
  note: Joi.string().allow(null, ""),
  birthDate: Joi.string().allow(null, ""),
  disabilityCondition: Joi.string().allow(null, ""),
  fatherName: Joi.string().allow(null, ""),
  fatherPhoneNumber: Joi.string().allow(null, ""),
  fatherEmailAddress: Joi.string().allow(null, ""),
  fatherEmail: Joi.string().allow(null, ""),
  motherName: Joi.string().allow(null, ""),
  motherPhoneNumber: Joi.string().allow(null, ""),
  motherEmailAddress: Joi.string().allow(null, ""),
  motherEmail: Joi.string().allow(null, ""),
  studentEmail: Joi.string().allow(null, ""),
  disabilityCondition: Joi.string().allow(null, ""),
  studentPhoneNumber: Joi.string().allow(null, ""),
  age: Joi.number().integer().min(0).required(),
  grade: Joi.string().required(),
  schoolName: Joi.string().required(),
  studentName: Joi.string().required(),
});

module.exports = addStudentSchema;
