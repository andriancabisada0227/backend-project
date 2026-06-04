const express = require('express');
const router = express.Router();
const { verifyToken } = require('../services/token');
const { isTokenInvalidated } = require('../services/middleware/tokenInvalidated');

const {
    registerForPushNotifications,
    unregisterForPushNotifications,
  } = require("../services/pushnotification");

const {
    getAllChatsByUserId,
    allChatRooms,
    chatRoomsDetails,
    deleteAllChatsByUserId,
    deleteChatByChatId,
    deleteSelectedChatsByUserId,
  } = require("../services/chatREST");
  
  const {
    addWhiteList,
    removeWhiteList,
    checkWhiteList,
  } = require("../services/whiteList");

  const {
    sendHelpAndSupport,
    contactUs,
    faq,
  } = require("../services/helpSupport");

  const {
    addServiceArea,
    getAllServiceAreas,
    getServiceAreaById,
    updateServiceArea,
    deleteServiceArea
  } = require("../services/serviceAreas");

//push notification
router.post("/registerForPushNotifications",verifyToken,registerForPushNotifications);
router.post("/unregisterForPushNotifications",verifyToken,unregisterForPushNotifications);

//chat REST
router.get("/chat/getall", verifyToken, getAllChatsByUserId);
router.get("/chat/all/rooms", verifyToken, allChatRooms);
router.get("/chat/details/:id", verifyToken, chatRoomsDetails);
router.delete("/chat/delete/selected", verifyToken, deleteSelectedChatsByUserId);

//whiteList
router.post("/white/list/add", verifyToken, addWhiteList);
router.post("/white/list/remove", verifyToken, removeWhiteList);
router.get("/white/list/check", verifyToken, checkWhiteList);

//help and support
router.post("/sendHelpAndSupport", verifyToken, sendHelpAndSupport);
router.post("/web/contactUs", cors(), contactUs);
router.post("/web/faq", cors(), faq);

// Service Areas routes
router.get("/service-areas", cors(),verifyToken, getAllServiceAreas);
router.get("/service-areas/:id", cors(),verifyToken, getServiceAreaById);
router.post("/service-areas", cors(),verifyToken, addServiceArea);
router.put("/service-areas/:id", cors(),verifyToken, updateServiceArea);
router.delete("/service-areas/:id", cors(),verifyToken, deleteServiceArea);

module.exports = router; 