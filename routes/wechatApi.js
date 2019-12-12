var express = require('express');
var router = express.Router();
const util = require('../util/util');
const db = require('../db/db');
const env = require('../config/env');
const error = require('../util/error');
const {wechat} = require('../util/socket');

const {WechatError} = error

const errorHandler = (err, res) => {
  if (err instanceof WechatError) {
    res.json(err)
  } else {
    res.json(new WechatError({errMsg: '发生了未知错误'}))
  }
}

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

router.post('/connect', function(req, res, next) {
  let outCon = null
  let userList = null
  const {openID, channelID, userStatus, userName, avatar, phoneNum} = req.body
  db.getConnection().then(connection => {
      outCon = connection
      return db.execute(connection, 'select u.server_user_id, u.server_user_name from t_user u inner join t_user_token t on (u.server_user_id = t.server_user_id)' +
        ' where u.channel_id = ? and t.del_flag = 0 and u.del_flag = 0 and t.expire_time > sysdate()', [channelID])
    }
  ).then(({connection, results, fields}) => {
    userList = util.transferFromList(results, fields)
    const userIdList = userList.map(data => data.serverUserId)
    if (userIdList.length === 0) {
      throw new WechatError({errMsg: '对不起，暂时没有在线客服人员，请稍后重试。', errCode: 101})
    }
    return db.execute(connection, `select session_id, server_user_id, open_id from t_chat_session where server_user_id in ${util.getListSql(userIdList.length)} and
      del_flag = 0 and end_time is not null`, userIdList)
  }).then(({connection, results, fields}) => {
    const sessionList = util.transferFromList(results, fields)
    const availableUsers = userList.filter(user => sessionList.filter(session => session.serverUserId === user.serverUserId).length < env.maxSession)
    if (availableUsers.length === 0) {
      throw new WechatError({errMsg: '对不起，已达到客服服务上限，请稍后重试。', errCode: 102})
    }
    const randomUserId = util.randomArr(availableUsers).serverUserId
    const randomUser = userList.find(user => user.serverUserId === randomUserId)
    return Promise.all([
      db.execute(connection, 'insert into t_chat_session (server_user_id, open_id, start_time) values (?, ?, sysdate())', [randomUserId, openID]),
      Promise.resolve(randomUser),
      db.execute(connection, 'insert into t_client_info (channel_id, open_id, user_name, avatar, phone_num, user_status) values (?, ?, ?, ?, ?, ?)'
        + 'on duplicate key update user_name = ?, avatar = ?, phone_num = ?, user_status = ?, update_time = sysdate(), row_version = row_version + 1',
        [channelID, openID, userName, avatar, phoneNum, userStatus, userName, avatar, phoneNum, userStatus])
    ])
  }).then(([{results: {insertId: sessionId = 0}}, {serverUserId, serverUserName}]) => {
    if (!sessionId) {
      throw new WechatError({errMsg: '对不起，客服会话建立失败，请稍后重试。', errCode: 103})
    }
    wechat.connect({serverUserId, openID, userName, avatar, phoneNum})
    res.json(util.getWechatSuccessData({
      sessionId,
      servicerId: serverUserId,
      servicerName: serverUserName
    }))
  }).catch(error => {
    errorHandler(error, res)
  }).finally(() => {
    if (outCon) {
      outCon.release()
    }
  })
});

module.exports = router;
