const express = require("express");
const bodyParser = require("body-parser");
const WebSocket = require("ws");
const http = require("http");
const { EventEmitter } = require('events'); // Import EventEmitter
const jwt = require('jsonwebtoken');
const app = express();
const url = require("url");
app.use(bodyParser.json({ limit: "10mb" }));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
let clients = {};
const eventEmitter = new EventEmitter(); // Create an instance of EventEmitter

wss.on("connection", function connection(ws, req) {
  const location = new url.URL(req.url, `http://${req.headers.host}`);
  const params = location.searchParams;
  
  const UserId = params.get("UserId");
  const scheduleId = params.get("ScheduleId");
  const role = params.get("Role");
  if(!scheduleId || !role) {
    ws.close(4000, 'Schedule ID and Role are required');
    return;
  }
  if(role === "parent" && UserId == null) {
    ws.close(4000, 'Parent ID is required');
    return;
  }

  if(role === "taxiCompany") {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      ws.close(4000, 'Bearer token is required for taxi company');
      return;
    }

    const token = authHeader.split(' ')[1];
    try {
      // Verify the JWT token
      const decoded = jwt.verify(token, process.env.jwtSecretToken);
      const companyId = decoded.id; // Assuming companyId is included in the token

      clients[companyId] = {
        ws: ws,
        scheduleID: scheduleId,
        role: role,
      };
      console.log("Taxi company successfully connected");
    } catch (err) {
      ws.close(4001, 'Invalid token');
      return;
    }
  }
  console.log("successfully connected");
  if (role === "parent") {
    clients[UserId] = {
      ws: ws,
      scheduleID: scheduleId,
      role: role,
    };
    console.log("successfully added");
  }

  ws.on("message", function incoming(message) {
    try {
      const data = JSON.parse(message);
      // Emit event for handling location updates
      eventEmitter.emit("locationUpdate", data, role, scheduleId);
    } catch (err) {
      console.error("Malformed tracking message ignored:", err.message);
    }
  });

  ws.on("close", function () {
    // Remove the client from the clients object on disconnect
    Object.keys(clients).forEach((id) => {
      if (clients[id].ws === ws) {
        delete clients[id];
        //console.log(`Client ${id} disconnected`);
      }
    });
  });
});

// Add listener to handle location updates
eventEmitter.on("locationUpdate", (data, role, scheduleId) => {
  // Handle location updates
  const clientsToUpdate = Object.values(clients).filter((client) => {
    return client.role !== role && client.scheduleID === scheduleId;
  });

  // Send updates to filtered clients
  clientsToUpdate.forEach((client) => {
    if (client.ws && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(data));
    }
  });
});

module.exports = server;
