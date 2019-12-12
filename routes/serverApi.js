var express = require('express');
var router = express.Router();
const util = require('../util/util');
const db = require('../db/db');

router.use(util.tokenChecker)
/* GET home page. */
router.post('/refreshToken', function(req, res, next) {
  let outCon = null
  const {token: oldToken} = req.headers
  const {userId, channelId} = util.decodeToken(oldToken)
  db.getConnection().then(connection => {
    outCon = connection
    const {token, expireDate} = util.encodeToken({userId, channelId})
    req.session.token = token
    res.append('token', token)
    res.json(util.getSuccessData({token}))
    return db.execute(connection, `insert into t_user_token (server_user_id, token, login_time, expire_time) values (?, ?, sysdate(), ?) 
      on duplicate key update token = ?, expire_time = ?, update_time = sysdate(), row_version = row_version + 1 `, [userId, token, expireDate, token, expireDate])
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
  const {userId} = util.decodeToken(token)
  db.getConnection().then(connection => {
    outCon = connection
    return db.execute(connection, 'select session_id, open_id, start_time, end_time from t_chat_session' +
      ' where user_id = ? and del_flag = 0 order by session_id desc limit 10', [userId])
  }).then(({connection, results, fields}) => {
    const sessionIdList = util.transferFromList(results, fields).map(item => item.sessionId)
    if (sessionIdList.length > 0) {
      const searchHistoryStatement = `select history_id, session_id, message, media, type from t_chat_history where session_id in
        ${util.getListSql({length: sessionIdList.length})} and del_flag = 0`
      return db.execute(connection, searchHistoryStatement, sessionIdList)
    } else {
      return Promise.resolve({connection, results: [], fields: []})
    }
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

module.exports = router;
