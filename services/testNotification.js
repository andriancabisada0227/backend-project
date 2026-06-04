const admin = require("firebase-admin");

const checkNotification = async (req, res) => {
    try {
        const message = {
            token: req.body.deviceToken,
            notification: req.body.notification
        };
        
        const response = await admin.messaging().send(message);
        console.log("Successfully sent message:", response);
        return res.status(200).json({ 
            success: true, 
            messageId: response 
        });
        
    } catch (error) {
        console.log("Error sending message:", error);
        
        if (
            error.code === "messaging/invalid-registration-token" ||
            error.code === "messaging/registration-token-not-registered"
        ) {
            return res.status(400).json({
                success: false,
                error: "Invalid or expired device token"
            });
        }
        
        return res.status(500).json({
            success: false,
            error: "Failed to send notification"
        });
    }
};

module.exports = {
    checkNotification
  };