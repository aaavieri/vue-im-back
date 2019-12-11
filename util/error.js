const error = {
  WechatError: function ({errMsg, errCode = 9, data = null}) {
    this.errMsg = errMsg
    this.errCode = errCode
    this.data = data
  }
}

module.exports = error