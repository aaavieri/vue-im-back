const express = require('express');
const router = express.Router();
const db = require('../db/db');
const util = require('../util/util');
const {server: {refreshToken: refreshHandler}} = require('../util/socket')

// const moment = require('moment');

/* GET users listing. */
router.post('/login', (req, res, next) => {
  const {userAccount, password} = req.body
  let outCon = null
  let data = null
  db.getConnection().then(connection => {
    outCon = connection
    return db.execute(connection, 'select server_user_id, server_user_account, channel_id, server_user_pass, server_user_name, settings from t_user' +
      ' where server_user_id = ? and del_flag = 0', [userAccount])
  }).then(({connection, results, fields}) => {
    const [userInfo = {}] = util.transferFromList(results, fields)
    if (userInfo.serverUserPass !== password) {
      throw new Error('不存在用户或密码错误')
    }
    const {token, expireDate} = util.encodeToken({serverUserId: userInfo.serverUserId, channelId: userInfo.channelId})
    delete userInfo.serverUserPass
    data = {userInfo, token}
    Object.assign(req.session, data)
    res.append('token', token)
    return db.execute(connection, `insert into t_user_token (server_user_id, token, login_time, expire_time) values (?, ?, sysdate(), ?) 
      on duplicate key update token = ?, login_time = sysdate(), expire_time = ?, update_time = sysdate(), del_flag = 0, row_version = row_version + 1 `,
      [userInfo.serverUserId, token, expireDate, token, expireDate])
  }).then(() => {
    res.json(util.getSuccessData(data))
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

router.use((req, res, next) => {
  const {token} = req.headers
  util.tokenChecker({
    data: {serverChatToken: token},
    nextHandler: () => next(),
    refreshHandler,
    errorHandler: ({error}) => {
      error.status = 200
      next(error)
    }
  })
})
router.post('/logout', (req, res, next) => {
  delete req.session.userInfo
  const {serverUserId} = req.body
  let outCon = null
  db.getConnection().then((connection) => {
    outCon = connection
    return db.execute(connection, 'update t_user_token del_flag = 1, row_version = row_version + 1 where server_user_id = ? and del_flag = 0',
      [serverUserId])
  }).then(() => {
    res.json(util.getSuccessData({}))
  }).catch(error => {
    error.status = 200
    next(error)
  }).finally(() => {
    if (outCon) {
      outCon.release()
    }
  })
})

module.exports = router;
