var express = require('express');
var router = express.Router();
const util = require('../util/util');
const db = require('../db/db');
const {wechat} = require('../util/socket')
const xlsx = require('node-xlsx')
const urlencode = require('urlencode');

router.use(util.tokenChecker)

router.get('/getUserInfoByToken', function (req, res, next) {
  let outCon = null
  const {token} = req.headers
  const {serverUserId} = util.decodeToken(token)
  db.getConnection().then(connection => {
    outCon = connection
    return db.execute(connection, 'select server_user_id, server_user_name from t_user where server_user_id = ? and del_flag = 0', [serverUserId])
  }).then(({results, fields}) => {
    res.json(util.getSuccessData(util.transferFromList(results, fields)))
  }).catch(error => {
    error.status = 200
    next(error)
  }).finally(() => {
    if (outCon) {
      outCon.release()
    }
  })
})
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
    let promiseArray = []
    if (sessionList.length > 0) {
      promiseArray.push(db.execute(connection, `select open_id, user_name, avatar, phone_num, user_status from t_client_info where open_id in
        ${util.getListSql({length: sessionList.length})} and del_flag = 0`, sessionList.map(session => session.openId)),
        db.execute(connection, 'select server_user_id, server_user_name, channel_id from t_user where server_user_id = ? and del_flag = 0', [serverUserId]))
    } else {
      promiseArray.push(Promise.resolve({connection, results: [], fields: []}), Promise.resolve({connection, results: [], fields: []}))
    }
    return Promise.all(promiseArray)
  }).then(([{results, fields}, {results: serverResults, fields: serverFields}]) => {
    const clientList = util.transferFromList(results, fields)
    const [server] = util.transferFromList(serverResults, serverFields)
    const data = sessionList.map(session => {
      const client = clientList.find(client => client.openId === session.openId)
      return {
        clientChatEn: {
          clientChatId: client.openId,
          clientChatName: client.userName,
          ...client
        },
        sessionId: session.sessionId,
        startTime: session.startTime,
        endTime: session.endTime,
        msgList: historyList.filter(history => history.sessionId === session.sessionId).map(wechat.wrapMsg)
      }
    })
    res.json(util.getSuccessData({sessionList: data, server}))
  }).catch(error => {
    error.status = 200
    next(error)
  }).finally(() => {
    if (outCon) {
      outCon.release()
    }
  })
});

router.post('/moreMsg', function (req, res, next) {
  const {openId, sessionId} = req.body
  let outCon = null
  db.getConnection().then(connection => {
    outCon = connection
    return db.execute(connection, 'select session_id, server_user_id from t_chat_session where open_id = ? and session_id < ? and message_count > 0 and del_flag = 0' +
      ' order by session_id desc limit 1', [openId, sessionId])
  }).then(({connection, results, fields}) => {
    const [session = {}] = util.transferFromList(results, fields)
    if (!session.sessionId) {
      throw new Error('没有更多记录了')
    }
    return Promise.all([db.execute(connection, 'select history_id, session_id, message, message_type, type, create_time' +
      ' from t_chat_history where session_id = ? and del_flag = 0', [session.sessionId]),
      db.execute(connection, 'select open_id, user_name, avatar, phone_num, user_status from t_client_info where open_id = ? and del_flag = 0', [openId]),
      db.execute(connection, 'select server_user_id, server_user_name from t_user where server_user_id = ? and del_flag = 0', [session.serverUserId]),
      Promise.resolve(session)
    ])
  }).then(([{results: historyList, fields: historyFields}, {results: clientList, fields: clientFields}, {results: serverList, fields: serverFields}, session]) => {
    if (historyList.length === 0) {
      throw new Error('没有更多记录了')
    }
    if (clientList.length === 0) {
      throw new Error('客户不存在或已被清空')
    }
    if (serverList.length === 0) {
      throw new Error('之前服务的客服不存在或已被清空')
    }
    const histories = util.transferFromList(historyList, historyFields)
    const [client] = util.transferFromList(clientList, clientFields)
    const [server] = util.transferFromList(serverList, serverFields)
    const data = {
      clientChatEn: {
        clientChatId: client.openId,
        clientChatName: client.userName,
        ...client
      },
      ...server,
      sessionId: session.sessionId,
      startTime: session.startTime,
      endTime: session.endTime,
      msgList: histories.filter(history => history.sessionId === session.sessionId).map(wechat.wrapMsg)
    }
    res.json(util.getSuccessData(data))
  }).catch(error => {
    error.status = 200
    next(error)
  }).finally(() => {
    if (outCon) {
      outCon.release()
    }
  })
})

router.post('/searchHistory', function(req, res, next) {
  const {token} = req.headers
  const {serverUserId} = util.decodeToken(token)
  const {openId = '0', keyword} = req.body
  if (!keyword) {
    res.json(util.getFailureData('搜索的关键字为空'))
    return
  }
  const keywords = keyword.split(' ')
  if (0 === keywords.length) {
    res.json(util.getFailureData('搜索的关键字为空'))
    return
  }
  let outCon = null
  const sessionList = []
  db.getConnection().then(connection => {
    outCon = connection
    const statement = `select session_id, open_id from t_chat_session where server_user_id = ? and
      ${openId !== '0' ? 'open_id = ? and' : ''} del_flag = 0`
    const params = openId !== '0' ? [serverUserId, openId] : [serverUserId]
    return db.execute(connection, statement, params)
  }).then(({connection, results, fields}) => {
    sessionList.push(...util.transferFromList(results, fields))
    if (sessionList.length === 0) {
      return Promise.all([{connection, results: [], fields: []}, {connection, results: [], fields: []}])
    }
    return Promise.all([
      db.execute(connection, `select history_id, session_id, message, message_type, type, create_time from t_chat_history where session_id in ${util.getListSql({length: sessionList.length})} 
        and message_type = 1 and ${util.getListSql({length: keywords.length, fillStr: 'message like ?', separator: ' or '})} 
        and del_flag = 0`,
        [...sessionList.map(session => session.sessionId), ...keywords.map(word => `%${word}%`)]),
      db.execute(connection, `select open_id, user_name, phone_num from t_client_info where open_id in ${util.getListSql({length: sessionList.length})} and del_flag = 0`,
        sessionList.map(session => session.openId))
    ])
  }).then(([{results: historyResults, fields: historyFields}, {results: clientResults, fields: clientFields}]) => {
    const historyList = util.transferFromList(historyResults, historyFields)
    historyList.forEach(history => {
      history.displayTime = util.dateFormat(history.createTime, 'yyyy/MM/dd hh:mm:ss')
      history.messageList = util.splitByWords(history.message, keywords)
    })
    const clientMap = util.groupToObj(util.transferFromList(clientResults, clientFields), 'openId')
    const sessionMap = util.groupToObj(sessionList, session => session.sessionId.toString())
    res.json(util.getSuccessData(historyList.map(history => {
      const [session] = sessionMap[history.sessionId.toString()]
      const [client] = clientMap[session.openId]
      return {history, client}
    })))
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
      'where session_id = ? and del_flag = 0', [sessionId])
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

router.get('/download/:type/:channelId/:openId', function (req, res, next) {
  let outCon = null
  const {openId, channelId, type} = req.params
  const {token} = req.headers
  const {serverUserId} = util.decodeToken(token)
  db.getConnection().then(connection => {
    outCon = connection
    // 0：当前客服与客户的会话，1：所有客服与客户的会话
    const params = [openId]
    let statement = 'select session_id, server_user_id from t_chat_session where open_id = ? '
    if (type === 1) {
      statement += ' and server_user_id = ? '
      params.push(serverUserId)
    }
    statement += ' and del_flag = 0'
    return db.execute(connection, statement, params)
  }).then(({connection, results, fields}) => {
    const sessionList = util.transferFromList(results, fields)
    const sessionIdList = sessionList.map(session => session.sessionId)
    const serverUserIdList = sessionList.map(session => session.serverUserId).distinct()
    return Promise.all([
      db.execute(connection, `select session_id, message, message_type, type, create_time from t_chat_history where session_id in
        ${util.getListSql({length: sessionIdList.length})} and del_flag = 0`, sessionIdList),
      db.execute(connection, `select server_user_id, server_user_name from t_user where channel_id = ? and server_user_id in
        ${util.getListSql({length: serverUserIdList.length})} and del_flag = 0`, [channelId, ...serverUserIdList]),
      db.execute(connection, 'select user_name from t_client_info where channel_id = ? and open_id = ? and del_flag = 0', [channelId, openId]),
      Promise.resolve(sessionList)
    ])
  }).then(([{results: historyResults, fields: historyFields}, {results: userResults, fields: userFields}, {results: clientResults, fields: clientFields}, sessionList]) => {
    const historyList = util.combineMessage(util.transferFromList(historyResults, historyFields))
    const userMap = util.groupToObj(util.transferFromList(userResults, userFields), user => user.serverUserId.toString())
    const sessionMap = util.groupToObj(sessionList, session => session.sessionId.toString())
    const [clientInfo] = util.transferFromList(clientResults, clientFields)
    const data = [['时间', '发送者', '内容'], ...historyList.map(history => {
      const session = sessionMap[history.sessionId.toString()][0]
      const user = userMap[session.serverUserId.toString()][0]
      const sendName = history.type === 0 ? clientInfo.userName : user.serverUserName
      const content = history.messageType === 3 ? '语音' : history.message
      return [util.dateFormat(history.createTime, 'yyyy年MM月dd日hh:mm:ss'), sendName, content]
    })]
    const options = {'!cols': [{ wch: 25 }, { wch: 10 }, { wch: 255 }]}
    const buffer = xlsx.build([{name: "sheet1", data}], options)
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=utf-8',
      filename: urlencode(`${clientInfo.userName}.xlsx`),
      'Content-Length': buffer.length
    });
    res.status(200).send(buffer);
  }).catch(error => {
    error.status = 200
    next(error)
  }).finally(() => {
    if (outCon) {
      outCon.release()
    }
  })
})

router.get('/getSession/:sessionId', function (req, res, next) {
  let outCon = null
  const {sessionId} = req.params
  db.getConnection().then(connection => {
    outCon = connection
    return Promise.all([
      db.execute(connection, 'select history_id, session_id, message, message_type, type, create_time from t_chat_history ' +
        'where session_id = ? and del_flag = 0', [sessionId]),
      db.execute(connection, 'select session_id, start_time, end_time from t_chat_session where session_id = ? and del_flag = 0',
        [sessionId])
    ])
  }).then(([{results: historyResults, fields: historyFields}, {results: sessionResults, fields: sessionFields}]) => {
    const historyList = util.transferFromList(historyResults, historyFields)
    const [session] = util.transferFromList(sessionResults, sessionFields)
    session.msgList = util.combineMessage(historyList).map(wechat.wrapMsg)
    res.json(util.getSuccessData(session))
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
