var express = require('express');
var router = express.Router();
const util = require('../util/util');
const db = require('../db/db');

// router.use(util.loginChecker)
/* GET home page. */
router.get('/getIMServerList', function(req, res, next) {
  let outCon = null
  db.getConnection().then(connection => {
      outCon = connection
      return db.execute(connection, 'select user_id, user_pass, user_name, settings from t_user where del_flag = 0', [])
    }
  ).then(({connection, results, fields}) => {
    const data = util.transferFromList(results, fields).map(row => ({
      serverChatId: `${row.userId}`,
      serverChatName: row.userName,
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
