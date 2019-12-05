const db = require('../db/db');
const jwt = require('jwt-simple');
const env = require('../config/env');

const util = new function () {
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
  this.tokenChecker = (req, res, next) => {
    const {token} = req.headers
    if (!token) {
      res.json({
        success: false,
        data: null,
        loginError: true,
        errMsg: '缺少token，请重新登录'
      })
      return
    }
    const {userId, expire} = this.decodeToken(token)
    if (expire < new Date().getTime()) {
      res.json({
        success: false,
        data: null,
        loginError: true,
        errMsg: 'token已过期，请重新登录'
      })
      return
    }
    let outCon = null
    db.getConnection().then(connection => {
      outCon = connection
      return db.execute(connection, `select user_id, token, expire_time from t_user_token where user_id = ? 
        and token = ? and del_flag = 0 and expire_time > current_time()`, [userId, token])
    }).then(({results, fields}) => {
      const tokenList = util.transferFromList(results, fields)
      if (tokenList.length > 0) {
        next()
      } else {
        res.json({
          success: false,
          data: null,
          loginError: true,
          errMsg: '无法识别token，请重新登录'
        })
      }
    }).catch(error => {
      error.status = 200
      next(error)
    }).finally(() => {
      if (outCon) {
        outCon.release()
      }
    })
  }
}

module.exports = util
