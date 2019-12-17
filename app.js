var createError = require('http-errors');
var express = require('express');
var session = require('express-session');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var bodyParser = require("body-parser");
var bodyPaserXml = require("body-parser-xml");
var appLogger = require('./logger/appLogger');
bodyPaserXml(bodyParser)

var wechatApiRouter = require('./routes/wechatApi');
var serverApiRouter = require('./routes/serverApi');
var clientApiRouter = require('./routes/clientApi');
var usersRouter = require('./routes/users');

require('./util/socket');

var app = express();

Promise.prototype.finally = function (callback) {
  let P = this.constructor;
  return this.then(
    value => P.resolve(callback()).then(() => value),
    reason => P.resolve(callback()).then(() => { throw reason })
  );
};

app.use(bodyParser.xml({
  limit: "1MB",   // Reject payload bigger than 1 MB
  xmlParseOptions: {
    normalize: true,     // Trim whitespace inside text nodes
    normalizeTags: true, // Transform tags to lowercase
    explicitArray: false // Only put nodes in array if >1
  },
  verify: function(req, res, buf, encoding) {
    if(buf && buf.length) {
      // Store the raw XML
      req.rawBody = buf.toString(encoding || "utf8");
    }
  }
}));

app.use(bodyParser.json());

app.use(session({
  secret :  'secret', // 对session id 相关的cookie 进行签名
  resave : true,
  saveUninitialized: false, // 是否保存未初始化的会话
  cookie : {
    maxAge : 1000 * 60 * 1000 // 设置 session 的有效时间，单位毫秒
  }
}));

appLogger.stream = {
  write: function (message, encoding) {
    appLogger.info(message)
  }
}

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/users', usersRouter);
app.use('/serverApi', serverApiRouter);
app.use('/clientApi', clientApiRouter);
app.use('/wechatApi', wechatApiRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  appLogger.error(err)
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  let errMsg = ''
  if (typeof err !== 'string') {
    errMsg = err.message
  } else {
    errMsg = err
  }
  res.json({
    success: false,
    data: null,
    errMsg
  })
});

module.exports = app;
