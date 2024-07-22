const express = require("express");
const User = require("../models/userModel");
const Verification = require("../models/verificationModel");
const router = express.Router();
const bcrypt = require("bcrypt");
const fs = require("fs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const multer = require("multer");
const authTokenHandler = require("../middlewares/checkAuthToken");
const errorHandler = require("../middlewares/errorMiddleware");
const responseFunction = require("../utils/responseFunction");
const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const dotenv = require("dotenv");
const { url } = require("inspector");
dotenv.config();

const s3client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

async function mailer(receiveremail, filesenderemail) {
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
    to: receiveremail,
    subject: "new file",
    text: "You recieved a new file from " + filesenderemail,
    html: "<b>You recieved a new file from " + filesenderemail + "</b>",
  });
}

const getObjectURL = async (key) => {
  const command = new GetObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: key,
  });

  const url = await getSignedUrl(s3client, command, { expiresIn: 300 });
  return url;
};

const postObjectUrl = async (key, contentType) => {
  const command = new PutObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });
  const url = await getSignedUrl(s3client, command, { expiresIn: 300 });
  return url;
};

// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, "./public");
//   },
//   filename: (req, file, cb) => {
//     let fileType = file.mimetype.split("/")[1];
//     console.log(req.headers.filename);
//     cb(null, `${Date.now()}.${fileType}`);
//   },
// });

// const upload = multer({ storage: storage });

// const fileUploadFunction = (req, res, next) => {
//   upload.single("clientfile")(req, res, (err) => {
//     if (err) {
//       return responseFunction(res, 400, "file upload failed", null, false);
//     }
//     next();
//   });
// };

router.get("/test", async (req, res) => {
  try {
    // let imgurl = await getObjectURL('Screenshot 2024-06-28 192054.png');
    let imgurl = await getObjectURL("myfile803");
    res.send(`<img src="${imgurl}" alt="S3 Image" />`);

    // let videoUrl = await getObjectURL("8233938-uhd_2160_4096_25fps.mp4");

    // res.send(`<video controls width="600">
    //       <source src="${videoUrl}">
    //       Your browser does not support the video tag.
    //     </video>`);

    // let ToUploadUrl = await postObjectUrl('myfile803','');
    //  return res.json({
    //   url: ToUploadUrl
    //  });
  } catch (error) {
    console.error("Error generating pre-signed URL:", error);
    res.status(500).send("Failed to generate pre-signed URL");
  }
});

router.get(
  "/generatepostobjecturl",
  authTokenHandler,
  async (req, res, next) => {
    try {
      const timeinms = new Date().getTime();
      const signedUrl = await postObjectUrl(timeinms.toString(), "");
      return responseFunction(
        res,
        200,
        "sign url generated",
        {
          signedUrl: signedUrl,
          filekey: timeinms.toString(),
        },
        true
      );
    } catch (error) {
      next(error);
    }
  }
);

router.post("/sharefile", authTokenHandler, async (req, res, next) => {
  try {
    const { receiveremail, filename, filekey, fileType } = req.body;

    let senderuser = await User.findOne({ _id: req.userId });
    let receiveruser = await User.findOne({ email: receiveremail });

    if (!senderuser) {
      return responseFunction(res, 400, "Sender user not found", null, false);
    }

    if (!receiveruser) {
      return responseFunction(
        res,
        400,
        "Receiver email is not registered",
        null,
        false
      );
    }

    senderuser.files.push({
      senderemail: senderuser.email,
      receiveremail: receiveremail,
      fileurl: filekey,
      fileType: fileType,
      filename: filename ? filename : new Date().toLocaleDateString(),
      sharedAt: Date.now(),
    });

    receiveruser.files.push({
      senderemail: senderuser.email,
      receiveremail: receiveremail,
      fileurl: filekey,
      fileType: fileType,
      filename: filename ? filename : new Date().toLocaleDateString(),
      sharedAt: Date.now(),
    });

    await senderuser.save();
    await receiveruser.save();
    await mailer(receiveremail, senderuser.email);

    return responseFunction(res, 200, "File Shared Successfully", null, true);
  } catch (error) {
    next(error);
  }
});
router.get("/getfiles", authTokenHandler, async (req, res, next) => {
  try {
    let user = await User.findOne({ _id: req.userId });
    if (!user) return responseFunction(res, 400, "User not found", null, false);

    return responseFunction(
      res,
      200,
      "files fetched successfully !",
      user.files,
      true
    );
  } catch (error) {
    next(error);
  }
});

router.get("/gets3urlbykey/:key", authTokenHandler, async (req, res, next) => {
  // console.log("first")
  try {
    const { key } = req.params;
    
    const signedUrl = await getObjectURL(key);

    if (!signedUrl) {
      return responseFunction(res, 400, "signed url not found", null, false);
    }
    return responseFunction(
      res,
      200,
      "signed url generated",
      {
        signedUrl: signedUrl,
      },
      true
    );
  } catch (error) {
    next(error);
  }
});

router.use(errorHandler);

module.exports = router;
