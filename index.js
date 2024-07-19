const express = require("express");
// const http = require("http");
const { Server } = require("socket.io");
const { createServer } = require("node:http");
const PORT = process.env.PORT || 8000;

const cors = require("cors");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const authRoutes = require("./routes/authRoutes");
const fileShareRoutes = require("./routes/fileShareRoutes");
const dotenv = require("dotenv");
const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

dotenv.config();

require("./db");
require("./models/userModel");
require("./models/verificationModel");

const app = express();
const server = createServer(app);

// const io = new Server(server, {
//   cors: {
//     origin: "http://localhost:3000",
//   },
// });

const allowOrigins = [process.env.FRONTEND_URL];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

app.use(bodyParser.json());
// app.use(cookieParser());

app.use(cookieParser({
  httpOnly: true,
  secure: true,
  sameSite: 'none',
  maxAge: 1000 * 60 * 60 * 24 * 7,
  signed: true
}));

app.use("/public", express.static("public"));

app.use("/auth", authRoutes);
app.use("/file", fileShareRoutes);

app.get("/", (req, res) => {
  res.send("API is running....");
});

// io.on("connection", (socket) => {
//   console.log("New Connection", socket.id);
//   socket.on("joinself", (data) => {
//     console.log("Joined self", data);
//     socket.join(data);
//   });

//   socket.on("uploaded", (data) => {
//     let sender = data.from;
//     let receiver = data.to;
//     // console.log(reciever);

//     socket.to(receiver).emit("notify", {
//       from: sender,
//       message: "NEW FILE RECEIVED",
//     });
//   });
//   socket.on("disconnect", () => {
//     console.log("Disconnected", socket.id);
//   });
// });

server.listen(PORT, () => {
  console.log(`Server started`, PORT);
});
