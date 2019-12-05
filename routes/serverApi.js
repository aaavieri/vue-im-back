var express = require('express');
var router = express.Router();
const util = require('../util/util');
const db = require('../db/db');

router.use(util.tokenChecker)
/* GET home page. */
router.post('/refreshToken', function(req, res, next) {
  let outCon = null
  const {token: oldToken} = req.headers
  const {userId} = util.decodeToken(oldToken)
  db.getConnection().then(connection => {
    outCon = connection
    const {token, expireDate} = util.encodeToken({userId})
    req.session.token = token
    res.append('token', token)
    res.json(util.getSuccessData({token}))
    return db.execute(connection, `insert into t_user_token (user_id, token, login_time, expire_time) values (?, ?, current_time(), ?) 
      on duplicate key update token = ?, expire_time = ?, update_time = current_time(), row_version = row_version + 1 `, [userId, token, expireDate, token, expireDate])
  }).catch(error => {
    error.status = 200
    next(error)
  }).finally(() => {
    if (outCon) {
      outCon.release()
    }
  })
});

module.exports = router;
