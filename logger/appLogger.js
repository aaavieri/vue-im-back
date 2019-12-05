var winston = require('winston')
require('winston-daily-rotate-file')
var config = require("../config/logger")
var fs = require('fs')

const dir = config.logFileDir;

if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
}

const logger = new winston.Logger({
    level: 'info',
    transports: [
        new (winston.transports.Console)({
            colorize: true,
        }),
        new winston.transports.DailyRotateFile({
            filename: config.logFileName,
            dirname: config.logFileDir,
            maxsize: 20971520, //20MB
            maxFiles: 25,
            datePattern: '.yyyy-MM-dd'
        })
    ]
});

module.exports = logger;