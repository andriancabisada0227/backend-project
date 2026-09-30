const express = require('express');
const router = express.Router();
const { verifyToken } = require('../services/token');
const {
  getAllChatsByUserId,
  allChatRooms,
  chatRoomsDetails,
  deleteAllChatsByUserId,
  deleteChatByChatId,
  deleteSelectedChatsByUserId,
} = require('../services/chatREST');

// Chat REST routes
router.get("/chat/getall", verifyToken, getAllChatsByUserId);
router.get("/chat/all/rooms", verifyToken, allChatRooms);
router.get("/chat/details/:id", verifyToken, chatRoomsDetails);
router.delete("/chat/delete/selected", verifyToken, deleteSelectedChatsByUserId);

module.exports = router; 