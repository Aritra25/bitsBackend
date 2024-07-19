function errorHandler(statusCode,err,req,res,next){
    if(res.headersSent)
        return next(err);
    console.log(`Error Middleware Called`);

    res.status(statusCode || 500).json({
        message: err.message || "Internal Server Error",
        ok: false,
        data: null
    })
}
module.exports = errorHandler