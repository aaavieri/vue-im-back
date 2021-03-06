const db = require('../db/db');
const jwt = require('jwt-simple');
const env = require('../config/env');
const {WechatError} = require('./error')

const util = new function () {
  this.dateFormat = (date, fmt) => {
    if (!date) return ''
    if (typeof date === 'number') date = new Date(date)
    let attributes = {
      "M+": date.getMonth() + 1, //月份
      "d+": date.getDate(), //日
      "h+": date.getHours(), //小时
      "m+": date.getMinutes(), //分
      "s+": date.getSeconds(), //秒
      "S": date.getMilliseconds() //毫秒
    }
    if (/(y+)/.test(fmt)) fmt = fmt.replace(RegExp.$1, (date.getFullYear() + "").substr(4 - RegExp.$1.length))
    for (let attr in attributes)
      if (new RegExp(`(${attr})`).test(fmt)) {
        fmt = fmt.replace(RegExp.$1, (RegExp.$1.length === 1) ? (attributes[attr]) : (("00" + attributes[attr]).substr(("" + attributes[attr]).length)))
      }
    return fmt
  }
  this.transferFromList = (arr, fields) => {
    return (arr || []).map((row) => {
      return this.transferFromRow(row, fields)
      // return row
    })
  }
  this.transferFromRow = (row, fields) => {
    if (!row) {
      return null
    }
    const result = {}
    fields.map((field) => {
      result[this.underLineToHump(field.name)] = row[field.name]
    })
    return result
  }
  this.underLineToHump = (str) => {
    return str.split('_').map((word, index) => {
      if (index === 0) return word
      return word.split('').map((char, charIndex) => {
        return charIndex === 0 ? char.toLocaleUpperCase() : char
      }).join('')
    }).join('')
  }
  this.getSuccessData = data => ({
    success: true,
    data,
    errMsg: null
  })
  this.getFailureData = (errMsg, data) => ({
    success: false,
    data,
    errMsg
  })
  this.getWechatSuccessData = (data) => ({
    errCode : 0,
    data,
    errMsg: null
  })
  this.groupToObj = (list, key) => {
    const map = {}
    const keyExtractor = this.adaptKeyExtractor(key)
    list.forEach(item => {
      const key = keyExtractor(item)
      map[key] = [...(map[key] || []), item]
    })
    return map
  }
  this.groupToArr = (list, key, dataListName = 'dataList', keySetter = (item, value) => item[key] = value) => {
    const arr = []
    const groupObj = this.groupToObj(list, key)
    Object.keys(groupObj).forEach(value => {
      const dataItem = {}
      dataItem[dataListName] = groupObj[value]
      keySetter(dataItem, value)
      arr.push(dataItem)
    })
    return arr
  }
  this.adaptKeyExtractor = (keyExtractor) => {
    if (typeof(keyExtractor) === 'string') {
      return (item) => item[keyExtractor]
    } else {
      return keyExtractor
    }
  }
  this.randomInt = (limit) => Math.floor((Math.random() * limit) + 1)
  this.randomArr = (arr) => arr[Math.floor(Math.random() * arr.length)]
  this.loginChecker = (req, res, next) => {
    if (req.session.userInfo) {
      return next()
    } else {
      res.json({
        success: false,
        loginError: true,
        data: null,
        errMsg: '您尚未登录，微信信息为空'
      })
    }
  }
  this.encodeToken = (payload) => {
    const expireDate = new Date()
    expireDate.setSeconds(expireDate.getSeconds() + env.tokenExpireSeconds)
    const token = jwt.encode(Object.assign({}, payload, {expire: expireDate.getTime()}), env.tokenKey)
    return {token, expireDate}
  }
  this.decodeToken = (token) => jwt.decode(token, env.tokenKey)
  // this.tokenChecker4Http = (req, res, next) => {
  //   const {token} = req.headers
  //   if (!token) {
  //     res.json({
  //       success: false,
  //       data: null,
  //       loginError: true,
  //       errMsg: '缺少token，请重新登录'
  //     })
  //     return
  //   }
  //   const {serverUserId, expire, channelId} = this.decodeToken(token)
  //   const now = new Date().getTime()
  //   if (expire < now) {
  //     res.json({
  //       success: false,
  //       data: null,
  //       loginError: true,
  //       errMsg: 'token已过期，请重新登录'
  //     })
  //     return
  //   }
  //   const needRefreshToken = now + env.tokenRefreshPeriod * 1000 >= expire
  //   let refreshedToken = null
  //   let outCon = null
  //   db.getConnection().then(connection => {
  //     outCon = connection
  //     return db.execute(connection, `select server_user_id, token, expire_time from t_user_token where server_user_id = ?
  //       and token = ? and del_flag = 0 and expire_time > sysdate()`, [serverUserId, token])
  //   }).then(({connection, results, fields}) => {
  //     const tokenList = util.transferFromList(results, fields)
  //     if (tokenList.length === 0) {
  //       throw new Error('无法识别token，请重新登录')
  //     }
  //     if (needRefreshToken) {
  //       const {token: newToken, expireDate} = util.encodeToken({serverUserId, channelId})
  //       refreshedToken = newToken
  //       return db.execute(connection, 'update t_user_token set token = ?, expire_time = ?, update_time = sysdate(), row_version = row_version + 1 ',
  //         [newToken, expireDate])
  //     } else {
  //       return Promise.resolve({})
  //     }
  //   }).then(() => {
  //     if (needRefreshToken) {
  //       server.refreshToken({serverChatId: serverUserId, token: refreshedToken})
  //     }
  //     next()
  //   }).catch(error => {
  //     error.status = 200
  //     next(error)
  //   }).finally(() => {
  //     if (outCon) {
  //       outCon.release()
  //     }
  //   })
  // }
  this.tokenChecker = ({data: {serverChatToken: token},
                                nextHandler = () => {},
                                refreshHandler = () => {},
                                errorHandler = () => {}
                              }) => {
    let {serverUserId = 0, expire, channelId} = this.decodeToken(token)
    return new Promise(((resolve, reject) => {
      if (!token) {
        reject(new WechatError({errCode: 1001, errMsg: '缺少token，请重新登录'}))
      }
      const now = new Date().getTime()
      if (expire < now) {
        reject(new WechatError({errCode: 1002, errMsg: 'token已过期，请重新登录'}))
      }
      const needRefreshToken = now + env.tokenRefreshPeriod * 1000 >= expire
      let outCon = null
      let refreshedToken = null
      return db.getConnection().then(connection => {
        outCon = connection
        return db.execute(connection, `select server_user_id, token, expire_time from t_user_token where server_user_id = ? 
          and token = ? and del_flag = 0 and expire_time > sysdate()`, [serverUserId, token])
      }).then(({connection, results, fields}) => {
        const tokenList = util.transferFromList(results, fields)
        if (tokenList.length === 0) {
          reject(new WechatError({errCode: 1003, errMsg: '无法识别token，请重新登录'}))
        }
        if (needRefreshToken) {
          const {token: newToken, expireDate} = util.encodeToken({serverUserId, channelId})
          refreshedToken = newToken
          return db.execute(connection, 'update t_user_token set token = ?, expire_time = ?, del_flag = 0, update_time = sysdate(), row_version = row_version + 1 ',
            [newToken, expireDate])
        } else {
          return Promise.resolve({})
        }
      }).then(() => {
        if (needRefreshToken) {
          refreshHandler({serverChatId: serverUserId, token: refreshedToken})
        }
        nextHandler()
      }).catch(error => {
        reject(new WechatError({errCode: 1004, errMsg: `未知异常：${error.errMsg || error.message}`}))
      }).finally(() => {
        if (outCon) {
          outCon.release()
        }
      })
    })).catch(error => {
      errorHandler({serverChatId: serverUserId, error})
    })
  }
  this.getListSql = ({length, fillStr = '?', separator = ',', open = '(', close = ')'}) => (
    length === 0 ? '' : `${open}${new Array(length).fill(fillStr).join(separator)}${close}`
  )
  this.cutArray = (array, subLength) => {
    let index = 0;
    let newArr = [];
    while (index < array.length) {
      newArr.push(array.slice(index, index += subLength));
    }
    return newArr;
  }
  this.splitMessage = ({message, ...other}) => (
    this.cutArray(message, env.maxMessageLength).map(item => ({...other, message: item}))
  )
  this.combineMessage = (messageList) => this.groupToArr(messageList,
    message => `${message.sessionId}|${message.messageType}|${message.type}|${message.createTime}|`, 'dataList',
    (item, value) => item.key = value).map(message => (
    message.dataList.reduce((m1, m2) => {
      m1.message += m2.message
      return m1
    })
  ))
  this.getLatestSession = (sessionList) => this.groupToArr(sessionList, 'openId').map(session => (
    session.dataList.reduce((s1) => s1)
  ))
  this.saveMessage = ({connection, ...data}) => {
    const params = []
    const createTime = new Date()
    const insertListStatement = '(?, ?, ?, ?, ?)'
    const messageList = this.splitMessage(data)
    messageList.forEach(({sessionId, message, messageType, type}) => params.push(sessionId, message, messageType, type, createTime))
    return Promise.all([db.execute(connection, `insert into t_chat_history (session_id, message, message_type, type, create_time) values 
        ${util.getListSql({length: messageList.length, fillStr: insertListStatement, open: '', close: ''})}`, params),
      db.execute(connection, 'update t_chat_session set message_count = message_count + 1, row_version = row_version + 1' +
        ' where session_id = ? and del_flag = 0', [data.sessionId])
    ]).then(([{results: {insertId = 0}}]) => ({historyId: insertId, createTime, connection}))
  }
  this.splitByWords = (str, delimiters) => {
    let arr = [{
      isDelimiter: false,
      content: str
    }]
    delimiters.forEach(delimiter => {
      arr = arr.map(item => this.splitByWord(item.content, delimiter)).flat()
    })
    return arr
  }
  this.splitByWord = (str, delimiter) => {
    const arr = []
    let temp = str
    let i = temp.indexOf(delimiter)
    while (i >= 0) {
      arr.push({
        isDelimiter: false,
        content: temp.substring(0, i)
      })
      arr.push({
        isDelimiter: true,
        content: delimiter
      })
      temp = temp.substring(i + delimiter.length)
      i = temp.indexOf(delimiter)
    }
    arr.push({
      isDelimiter: false,
      content: temp
    })
    return arr.filter(item => item.content.length > 0)
  }
}

module.exports = util
