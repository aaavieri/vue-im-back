var express = require('express');
var router = express.Router();
const util = require('../util/util');
const db = require('../db/db');
const env = require('../config/env');
const {WechatError} = require('../util/error');
const {wechat} = require('../util/socket');

const errorHandler = (err, res) => {
  if (err instanceof WechatError) {
    res.json(err)
  } else {
    res.json(new WechatError({errMsg: '发生了未知错误'}))
  }
}

// router.use(util.loginChecker)
/* GET home page. */
// router.get('/getIMServerList', function(req, res, next) {
//   let outCon = null
//   db.getConnection().then(connection => {
//       outCon = connection
//       return db.execute(connection, 'select user_id, user_pass, user_name, settings from t_user where del_flag = 0', [])
//     }
//   ).then(({connection, results, fields}) => {
//     const data = util.transferFromList(results, fields).map(row => ({
//       serverChatId: `${row.userId}`,
//       serverChatName: row.userName,
//       avatarUrl: ''
//     }))
//     res.json(util.getSuccessData({code: 0, data}))
//     return connection
//   }).then(connection => connection.release()).catch(error => {
//     if (outCon) {
//       outCon.release()
//     }
//     error.status = 200
//     next(error)
//   })
// });

router.post('/connect', function(req, res, next) {
  let outCon = null
  let userList = null
  const {openID, channelID, userStatus, userName, avatar, phoneNum} = req.body
  db.getConnection().then(connection => {
    outCon = connection
    return db.execute(connection, 'select session_id, server_user_id from t_chat_session where open_id = ? and end_time is null and del_flag = 0 order by session_id desc limit 1', [openID])
  }).then(({connection, results: sessionResults, fields: sessionFields}) => {
    if (sessionResults.length > 0) {
      const [oldSession] = util.transferFromList(sessionResults, sessionFields)
      return db.execute(connection, 'select u.server_user_id, u.server_user_name from t_user u inner join t_user_token t on (u.server_user_id = t.server_user_id)' +
        ' where u.server_user_id = ? and u.channel_id = ? and t.del_flag = 0 and u.del_flag = 0 and t.expire_time > sysdate()',
        [oldSession.serverUserId, channelID]).then(({results, fields}) => {
        if (results.length === 0) {
          throw new WechatError({errMsg: '对不起，暂时没有在线客服人员，请稍后重试。', errCode: 101})
        }
        const [oldUser] = util.transferFromList(results, fields)
        wechat.connect({...oldSession, startTime: new Date(), openID, userName, avatar, phoneNum, userStatus})
        res.json(util.getWechatSuccessData({
          sessionId: oldSession.sessionId,
          servicerId: oldUser.serverUserId,
          servicerName: oldUser.serverUserName
        }))
      })
    } else {
      return db.execute(connection, 'select u.server_user_id, u.server_user_name from t_user u inner join t_user_token t on (u.server_user_id = t.server_user_id)' +
        ' where u.channel_id = ? and t.del_flag = 0 and u.del_flag = 0 and t.expire_time > sysdate()', [channelID]).then(({connection, results, fields}) => {
        userList = util.transferFromList(results, fields)
        const userIdList = userList.map(data => data.serverUserId)
        if (userIdList.length === 0) {
          throw new WechatError({errMsg: '对不起，暂时没有在线客服人员，请稍后重试。', errCode: 101})
        }
        return db.execute(connection, `select session_id, server_user_id, open_id from t_chat_session where server_user_id in
          ${util.getListSql({length: userIdList.length})} and del_flag = 0 and end_time is not null`, userIdList)
      }).then(({connection, results, fields}) => {
        const sessionList = util.transferFromList(results, fields)
        const availableUsers = userList.filter(user => sessionList.filter(session => session.serverUserId === user.serverUserId).length < env.maxSession)
        if (availableUsers.length === 0) {
          throw new WechatError({errMsg: '对不起，已达到客服服务上限，请稍后重试。', errCode: 102})
        }
        const randomUserId = util.randomArr(availableUsers).serverUserId
        const randomUser = userList.find(user => user.serverUserId === randomUserId)
        const startTime = new Date()
        return Promise.all([
          db.execute(connection, 'insert into t_chat_session (server_user_id, open_id, start_time) values (?, ?, ?)', [randomUserId, openID, startTime]),
          Promise.resolve({randomUser, startTime}),
          db.execute(connection, 'insert into t_client_info (channel_id, open_id, user_name, avatar, phone_num, user_status) values (?, ?, ?, ?, ?, ?)'
            + 'on duplicate key update user_name = ?, avatar = ?, phone_num = ?, user_status = ?, update_time = sysdate(), row_version = row_version + 1',
            [channelID, openID, userName, avatar, phoneNum, userStatus, userName, avatar, phoneNum, userStatus])
        ])
      }).then(([{results: {insertId: sessionId = 0}}, {randomUser: {serverUserId, serverUserName}, startTime}]) => {
        if (!sessionId) {
          throw new WechatError({errMsg: '对不起，客服会话建立失败，请稍后重试。', errCode: 103})
        }
        wechat.connect({sessionId, serverUserId, startTime, openID, userName, avatar, phoneNum, userStatus})
        res.json(util.getWechatSuccessData({
          sessionId,
          servicerId: serverUserId,
          servicerName: serverUserName
        }))
      })
    }
  }).catch(error => {
    errorHandler(error, res)
  }).finally(() => {
    if (outCon) {
      outCon.release()
    }
  })
});

router.post('/sendMsg', function (req, res, next) {
  let outCon = null
  const {sessionId, message, messageType = 1} = req.body
  if (!message || !messageType) {
    return res.json(new WechatError({errMsg: '对不起，消息内容不合法。', errCode: 201}))
  }
  let session = null
  db.getTransaction().then(connection => {
    outCon = connection
    return db.execute(connection, 'select server_user_id, open_id from t_chat_session where session_id = ? and del_flag = 0' +
      ' and end_time is null', [sessionId])
  }).then(({connection, results, fields}) => {
    const sessionList = util.transferFromList(results, fields)
    if (sessionList.length === 0) {
      throw new WechatError({errMsg: '对不起，会话不存在或者已过期', errCode: 202})
    }
    session = sessionList[0]
    return util.saveMessage({connection, message, messageType, sessionId, type: 0})
  }).then(({createTime, historyId}) => {
    wechat.sendMsg({serverUserId: session.serverUserId, openID: session.openId, msg: wechat.wrapMsg({sessionId, messageType, message, createTime, historyId})})
    outCon.commit({}, () => {
      outCon.release()
    })
    res.json(util.getWechatSuccessData({}))
  }).catch(error => {
    if (outCon) {
      outCon.rollback({}, () => {
        outCon.release()
      })
    }
    errorHandler(error, res)
  })
})

router.post('/appraise', function (req, res, next) {
  const {sessionId, rank} = req.body
  if (!rank || rank > 3) {
      return res.json(new WechatError({errMsg: '没有评分或评分超出范围', errCode: 601}))
  }
  let outCon = null
  db.getConnection().then(connection => {
    outCon = connection
    return db.execute(connection, 'select end_time, rank from t_chat_session where session_id = ? and del_flag = 0')
  }).then(({connection, results, fields}) => {
    const sessionList = util.transferFromList(results, fields)
    if (sessionList.length === 0) {
      throw new WechatError({errMsg: '找不到评分的客服会话', errCode: 602})
    }
    const [{endTime, rank: originalRank}] = sessionList
    if (endTime) {
      throw new WechatError({errMsg: '该会话尚未结束，暂时不能进行评价', errCode: 603})
    }
    if (originalRank) {
      throw new WechatError({errMsg: '您已评价过该会话，不能重复评价', errCode: 604})
    }
    return db.execute(connection, 'update t_chat_session set rank = ? where session_id = ? and del_flag = 0', [rank, sessionId])
  }).then(({results: {changedRows = 0}}) => {
    res.json(util.getWechatSuccessData({changedRows}))
  }).catch(error => {
    errorHandler(error, res)
  }).finally(() => {
    if (outCon) {
      outCon.release()
    }
  })
})

module.exports = router;
