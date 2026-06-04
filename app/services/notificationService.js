const admin = require("firebase-admin");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();

class NotificationService {
    async sendNotification(deviceToken, title, message) {
        console.log("sending notification", deviceToken, title, message);
        if(deviceToken){
            try {
                const notification = await admin.messaging().send({
                    token: deviceToken,
                    notification: {
                        title: title,
                        body: message
                    }
                });
                console.log("Notification sent successfully:", notification);
                return notification;
            } catch (error) {
                console.error("Failed to send notification:", error);
                return null;
            }
        }
        console.log("No device token provided, notification not sent");
        return null;
    }
}

module.exports = new NotificationService();
