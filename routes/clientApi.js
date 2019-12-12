var express = require('express');
var router = express.Router();
const util = require('../util/util');
const db = require('../db/db');
const env = require('../config/env');

// router.use(util.loginChecker)
/* GET home page. */
router.get('/getIMServerList', function(req, res, next) {
  let outCon = null
  db.getConnection().then(connection => {
      outCon = connection
      return db.execute(connection, 'select server_user_id, server_user_pass, server_user_name, settings from t_user where del_flag = 0', [])
    }
  ).then(({connection, results, fields}) => {
    const data = util.transferFromList(results, fields).map(row => ({
      serverChatId: row.serverUserId,
      serverChatName: row.serverUserName,
      avatarUrl: ''
    }))
    res.json(util.getSuccessData({code: 0, data}))
    return connection
  }).then(connection => connection.release()).catch(error => {
    if (outCon) {
      outCon.release()
    }
    error.status = 200
    next(error)
  })
});

module.exports = router;
