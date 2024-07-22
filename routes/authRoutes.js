const express = require("express");
const User = require("../models/userModel");
const Verification = require("../models/verificationModel");
const router = express.Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const nodemailer = require("nodemailer");
const responseFunction = require("../utils/responseFunction.js");
const fs = require("fs");
const errorHandler = require("../middlewares/errorMiddleware");
const authTokenHandler = require("../middlewares/checkAuthToken");
const dotenv = require("dotenv");

const crypto = require("crypto");
const AWS = require("aws-sdk");


dotenv.config();

async function mailer(recieveremail, code) {
  let transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    requireTLS: true,
    auth: {
      user: process.env.EMAIL,
      pass: process.env.PASSWORD,
    },
  });

  let info = await transporter.sendMail({
    from: "Team BitS",
    to: recieveremail,
    subject: "OTP for verification",
    text: "Your OTP is " + code,
    html: "<b>Your OTP is " + code + "</b>",
  });
}

// Configure AWS SDK
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

const s3 = new AWS.S3();

const uploadToS3 = async (file) => {
  const params = {
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: `${Date.now()}_${file.originalname}`,
    Body: file.data,
    ContentType: file.mimetype
  };
  return s3.upload(params).promise();
};

const getPresignedUrl = (key) => {
  const params = {
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: key,
    Expires: 60 * 60 // 1 hour
  };
  return s3.getSignedUrl('getObject', params);
};

// const upload = multer({ storage: storage });

// const fileUploadFunction = (req, res, next) => {
//   upload.single("clientfile")(req, res, (err) => {
//     if (err) {
//       console.log(err)
//       return responseFunction(res, 400, "File upload failed", null, false);
//     }
//     next();
//   });
// };

const sendEmail = async (options) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL,
      pass: process.env.PASSWORD,
    },
  });

  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: options.to,
    subject: options.subject,
    html: options.text,
  };

  await transporter.sendMail(mailOptions);
};

router.post("/forgotpassword", async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    const token = crypto.randomBytes(20).toString("hex");

    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour

    await user.save();

    const resetUrl = `${process.env.FRONTEND_URL}/resetpassword?token=${token}`;

    const message = `
      <h1>Password Reset Request</h1>
      <p>You requested to reset your password. Please use the following link to reset your password:</p>
      <a href=${resetUrl} clicktracking=off>${resetUrl}</a>
    `;

    await sendEmail({
      to: user.email,
      subject: "Password Reset Request",
      text: message,
    });

    res.status(200).json({ message: "Email sent." });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

router.put("/resetpassword/:token", async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ message: 'Password is required' });
  }

  try {
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    await user.save();

    res.status(200).json({ message: "Password reset successful." });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/test", (req, res) => {
  res.send("Auth routes are working !");
  // mailer("aritra.maji2001@gmail.com",12345);
});

router.post("/register", async (req, res) => {
  try {
    const { name, email, password, otp } = req.body;
    let user = await User.findOne({ email: email });
    let verificationQueue = await Verification.findOne({ email: email });
    if (user) {
      return responseFunction(res, 400, "User already exists", null, false);
    }

    if (!verificationQueue) {
      return responseFunction(res, 400, "Please send OTP first", null, false);
    }

    const isMatch = await bcrypt.compare(otp, verificationQueue.code);
    if (!isMatch) {
      return responseFunction(res, 400, "Invalid OTP", null, false);
    }

    // Upload profile picture to S3
    const file = req.files.clientfile;
    const uploadResult = await uploadToS3(file);

    // Generate pre-signed URL for accessing the file
    const presignedUrl = getPresignedUrl(uploadResult.Key);

    user = new User({
      name: name,
      email: email,
      password: password,
      profilePic: uploadResult.Key, // Store the S3 file key
    });

    await user.save();
    await Verification.deleteOne({ email: email });
    return responseFunction(res, 200, "Registered successfully", { profilePicUrl: presignedUrl }, true);
  } catch (error) {
    console.log(error);
    return responseFunction(res, 500, "Internal Server Error", null, false);
  }
});

router.post("/sendotp", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return responseFunction(res, 400, "Email is required", null, false);
  }

  try {
    await Verification.deleteOne({ email: email });
    const code = Math.floor(100000 + Math.random() * 900000);
    await mailer(email, code);

    const newVerification = new Verification({
      email,
      code: await bcrypt.hash(code.toString(), 10), // Ensure the code is hashed for security
    });

    await newVerification.save();
    return responseFunction(res, 200, "OTP sent successfully", null, true);
  } catch (error) {
    console.error("Error sending OTP:", error);
    return responseFunction(res, 500, "Internal server error", null, false);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return responseFunction(res, 400, "Invalid credentials", null, false);
    }
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return responseFunction(res, 400, "Invalid credentials", null, false);
    }
    const authToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET_KEY,
      {
        expiresIn: "10m",
      }
    );
    const refreshToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_REFRESH_SECRET_KEY,
      { expiresIn: "50m" }
    );
    res.cookie("authToken", authToken, {
      sameSite: 'none',
      httpOnly: true,
      secure: true,
    });
    res.cookie("refreshToken", refreshToken, {
      sameSite: 'none',
      httpOnly: true,
      secure: true,
    });
    return responseFunction(
      res,
      200,
      "Logged in successfully",
      {
        authToken,
        refreshToken,
      },
      true
    );
  } catch (error) {
    next(error);
  }
});

router.post("/checklogin", authTokenHandler, async (req, res, next) => {
  res.json({
    ok: req.ok,
    message: req.message,
    userId: req.userId,
  });
});

router.post("/logout", authTokenHandler, async (req, res, next) => {
  res.clearCookie("authToken");
  res.clearCookie("refreshToken");

  res.json({
    ok: true,
    message: "Logged out successfully",
  });
});

router.get("/getuser", authTokenHandler, async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return responseFunction(res, 400, "User not found", null, false);
    return responseFunction(res, 200, "User found", user, true);
  } catch (error) {
    next(err);
  }
});

router.use(errorHandler);

module.exports = router;
