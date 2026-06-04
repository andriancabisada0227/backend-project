const express = require('express');
const router = express.Router();
const { verifyToken } = require('../services/token');
const {
  sendMessage,
  getMessages,
  getChatHistory,
  markAsRead,
  deleteMessage,
  getUnreadCount
} = require('../services/chat');

// Chat routes
router.post("/send", verifyToken, sendMessage);
router.get("/history/:userId", verifyToken, getMessages);
router.get("/conversations", verifyToken, getChatHistory);
router.put("/read/:messageId", verifyToken, markAsRead);
router.get("/unread", verifyToken, getUnreadCount);
router.delete("/:messageId", verifyToken, deleteMessage);

module.exports = router; 