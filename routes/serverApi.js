var express = require('express');
var router = express.Router();
const util = require('../util/util');
const db = require('../db/db');
const {wechat} = require('../util/socket')

router.use(util.tokenChecker)
/* GET home page. */
router.post('/refreshToken', function(req, res, next) {
  let outCon = null
  const {token: oldToken} = req.headers
  const {serverUserId, channelId} = util.decodeToken(oldToken)
  db.getConnection().then(connection => {
    outCon = connection
    const {token, expireDate} = util.encodeToken({serverUserId, channelId})
    req.session.token = token
    res.append('token', token)
    res.json(util.getSuccessData({token}))
    return db.execute(connection, `insert into t_user_token (server_user_id, token, login_time, expire_time) values (?, ?, sysdate(), ?) 
      on duplicate key update token = ?, expire_time = ?, update_time = sysdate(), row_version = row_version + 1 `, [serverUserId, token, expireDate, token, expireDate])
  }).catch(error => {
    error.status = 200
    next(error)
  }).finally(() => {
    if (outCon) {
      outCon.release()
    }
  })
});

router.get('/getClientList', function(req, res, next) {
  let outCon = null
  const {token} = req.headers
  const {serverUserId} = util.decodeToken(token)
  const sessionList = []
  const historyList = []
  db.getConnection().then(connection => {
    outCon = connection
    return db.execute(connection, 'select session_id, open_id, start_time, end_time from t_chat_session' +
      ' where server_user_id = ? and del_flag = 0 order by session_id desc limit 10', [serverUserId])
  }).then(({connection, results, fields}) => {
    util.getLatestSession(util.transferFromList(results, fields)).forEach(session => sessionList.push(session))
    if (sessionList.length > 0) {
      const searchHistoryStatement = `select history_id, session_id, message, message_type, type, create_time from t_chat_history where session_id in
        ${util.getListSql({length: sessionList.length})} and del_flag = 0`
      return db.execute(connection, searchHistoryStatement, sessionList.map(item => item.sessionId))
    } else {
      return Promise.resolve({connection, results: [], fields: []})
    }
  }).then(({connection, results, fields}) => {
    historyList.push(...util.combineMessage(util.transferFromList(results, fields)))
    // res.json(util.getSuccessData(util.groupToArr(historyList, 'sessionId', 'historyList')))
    if (sessionList.length > 0) {
      return db.execute(connection, `select open_id, user_name, avatar, phone_num, user_status from t_client_info where open_id in
        ${util.getListSql({length: sessionList.length})} and del_flag = 0`, sessionList.map(session => session.openId))
    } else {
      return Promise.resolve({connection, results: [], fields: []})
    }
  }).then(({results, fields}) => {
    const clientList = util.transferFromList(results, fields)
    const data = sessionList.map(session => {
      const client = clientList.find(client => client.openId === session.openId)
      return {
        clientChatEn: {
          clientChatId: client.openId,
          clientChatName: client.userName,
          avatar: client.avatar,
          phoneNum: client.phoneNum,
          userStatus: client.userStatus
        },
        sessionId: session.sessionId,
        startTime: session.startTime,
        endTime: session.endTime,
        msgList: historyList.filter(history => history.sessionId === session.sessionId).map(wechat.wrapMsg)
      }
    })
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

router.post('/searchHistory', function(req, res, next) {
  const {token} = req.headers
  const {userId} = util.decodeToken(token)
  const {openId = null, keyWord} = req.body
  if (!keyWord) {
    res.json(util.getFailureData('搜索的关键字为空'))
    return
  }
  let outCon = null
  db.getConnection().then(connection => {
    outCon = connection
    const statement = `select history_id, session_id, message, media, type from t_chat_history where server_user_id = ? and
      ${openId ? 'open_id = ? and' : ''} message like ? and del_flag = 0`
    const params = openId ? [userId, openId] : [userId]
    return db.execute(connection, statement, [...params, `%${keyWord}%`])
  }).then(({connection, results, fields}) => {
    const sessionIdList = util.transferFromList(results, fields).map(item => item.sessionId)
    const statement = `select history_id, session_id, message, media, type from t_chat_history where session_id in 
      ${util.getListSql({length: sessionIdList.length})} and ${openId ? 'open_id = ? and' : ''} message like ? and del_flag = 0`
    const params = openId ? [...sessionIdList, openId] : sessionIdList
    return db.execute(connection, statement, [...params, `%${keyWord}%`])
  }).then(({results, fields}) => {
    const historyList = util.transferFromList(results, fields)
    res.json(util.getSuccessData(util.groupToArr(historyList, 'sessionId', 'historyList')))
  }).catch(error => {
    error.status = 200
    next(error)
  }).finally(() => {
    if (outCon) {
      outCon.release()
    }
  })
});

router.post('/close', function (req, res, next) {
  let outCon = null
  const {sessionId} = req.body
  wechat.closeWwx({sessionId}).then(() => db.getConnection()).then(connection => {
    outCon = connection
    return db.execute(connection, 'update t_chat_session set end_time = sysdate(), row_version = row_version + 1 ' +
      'where session_id = ? and session_id = 0', [sessionId])
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
