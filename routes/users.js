const express = require('express');
const router = express.Router();
const db = require('../db/db');
const env = require('../config/env');
const util = require('../util/util');
const jwt = require('jwt-simple');
// const moment = require('moment');

/* GET users listing. */
router.post('/login', (req, res, next) => {
  const {userAccount, password} = req.body
  let outCon = null
  db.getConnection().then(connection => {
    outCon = connection
    return db.execute(connection, 'select user_id, user_account, channel_id, user_pass, user_name, settings from t_user where user_id = ? and del_flag = 0', [userAccount])
  }).then(({connection, results, fields}) => {
    const [userInfo = {}] = util.transferFromList(results, fields)
    if (userInfo.userPass !== password) {
      throw new Error('不存在用户或密码错误')
    }
    const {token, expireDate} = util.encodeToken({userId: userInfo.userId, channelId: userInfo.channelId})
    const data = {userInfo, token}
    Object.assign(req.session, data)
    res.append('token', token)
    res.json(util.getSuccessData(data))
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

router.post('/checkLogin', function(req, res) {
  let success = false
  if (req.session.userInfo) {
    success = true
  }
  res.json({
    success: success,
    data: null,
    errMsg: success ? null : '您尚未登录，请前往登录页面登录'
  })
});

module.exports = router;
