const jwt = require("jsonwebtoken");

function checkAuth(req, res, next) {
  const authToken = req.cookies.authToken;
  const refreshToken = req.cookies.refreshToken;
  // console.log(`Check Auth Token Middleware called`,authToken,refreshToken);

  if (!authToken || !refreshToken) {
    return res.status(401).json({
      message: `Authintication failed to authToken or refreshToken provided`,
      ok: false,
    });
  }

  jwt.verify(authToken, process.env.JWT_SECRET_KEY, (err, decoded) => {
    if (err) {
      jwt.verify(
        refreshToken,
        process.env.REFRESH_TOKEN_SECRET,
        (refreshErr, refreshDecoded) => {
          if (refreshErr) {
            return res.status(401).json({
              message: `Authentication failed both tokens are invalid`,
              ok: false,
            });
          } else {
            const newAuthToken = jwt.sign(
              { userId: refreshDecoded.userId },
              process.env.JWT_SECRET_KEY,
              { expiresIn: "10m" }
            );

            const newRefreshToken = jwt.sign(
              { userId: refreshDecoded.userId },
              process.env.REFRESH_TOKEN_SECRET,
              { expiresIn: "10d" }
            );

            res.cookie("authToken", newAuthToken, {
              sameSite: 'none',
              httpOnly: true,
              secure: true,
            });
            res.cookie("refreshToken", newRefreshToken, {
              sameSite: 'none',
              httpOnly: true,
              secure: true,
            });

            req.userId = refreshDecoded.userId;
            req.ok = true;
            req.message = "Authentication successful";
            next();
          }
        }
      );
    } else {
      req.userId = decoded.userId;
      req.ok = true;
      req.message = "Authentication successful";
      next();
    }
  });
}

module.exports = checkAuth;
