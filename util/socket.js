const env = require('../config/env')
const util = require('../util/util')
const db = require('../db/db')
const axios = require('axios')
// socket
var server = require('http').createServer();
var io = require('socket.io')(server);
var serverChatDic = new Map(); // 服务端
var clientChatDic = new Map(); // 客户端
var wechatChatDic = new Map(); // 微信客户端
io.on('connection', function(socket) {
  // 服务端上线
  socket.on('SERVER_ON', function(data) {
    let serverChatEn = data.serverChatEn;
    console.log(`有新的服务端socket连接了，服务端Id：${serverChatEn.serverChatId}`);
    serverChatDic.set(serverChatEn.serverChatId, {
      serverChatEn: serverChatEn,
      socket: socket
    });
  });

  // 服务端下线
  socket.on('SERVER_OFF', function(data) {
    let serverChatEn = data.serverChatEn;
    serverChatDic.delete(serverChatEn.serverChatId);
  });

  // 服务端发送了信息
  socket.on('SERVER_SEND_MSG', function(data) {
    if (clientChatDic.has(data.clientChatId)) {
      clientChatDic.get(data.clientChatId).socket.emit('SERVER_SEND_MSG', { msg: data.msg });
    } else {
      socketFunc.wechat.sendToWechat({openID: data.clientChatId, serverUserId: data.serverChatId, ...data.msg})
    }
  });

  // 客户端事件；'CLIENT_ON'(上线), 'CLIENT_OFF'(离线), 'CLIENT_SEND_MSG'(发送消息)
  ['CLIENT_ON', 'CLIENT_OFF', 'CLIENT_SEND_MSG'].forEach((eventName) => {
    socket.on(eventName, (data) => {
      let clientChatEn = data.clientChatEn;
      let serverChatId = data.serverChatId;
      // 1.通知服务端
      if (serverChatDic.has(serverChatId)) {
        serverChatDic.get(serverChatId).socket.emit(eventName, {
          clientChatEn: clientChatEn,
          msg: data.msg
        });
      } else {
        socket.emit('SERVER_SEND_MSG', {
          msg: {
            content: '未找到客服'
          }
        });
      }

      // 2.对不同的事件特殊处理
      if (eventName === 'CLIENT_ON') {
        // 1)'CLIENT_ON'，通知客户端正确连接
        console.log(`有新的客户端socket连接了，客户端Id：${clientChatEn.clientChatId}`);
        clientChatDic.set(clientChatEn.clientChatId, {
          clientChatEn: clientChatEn,
          socket: socket
        });
        serverChatDic.has(serverChatId) &&
        socket.emit('SERVER_CONNECTED', {
          serverChatEn: serverChatDic.get(serverChatId).serverChatEn
        });
      } else if (eventName === 'CLIENT_OFF') {
        // 2)'CLIENT_OFF'，删除连接
        clientChatDic.delete(clientChatEn.clientChatId);
      }
    });
  });
});
server.listen(3001);

const socketFunc = new function () {
  this.wechat = {
    connect: ({serverUserId, openID, userName, ...data}) => {
      if (serverChatDic.has(serverUserId)) {
        serverChatDic.get(serverUserId).socket.emit('CLIENT_ON', {
          clientChatEn: {
            clientChatId: openID,
            clientChatName: userName
          },
          data
        });
      }
    },
    sendMsg: ({serverUserId, openID, msg}) => {
      if (serverChatDic.has(serverUserId)) {
        serverChatDic.get(serverUserId).socket.emit('CLIENT_SEND_MSG', {
          clientChatEn: {
            clientChatId: openID
          },
          msg
        });
      }
    },
    sendToWechat: ({serverUserId, openID, sessionId, contentType, content}) => {
      if (serverChatDic.has(serverUserId)) {
        const {messageType, message} = this.wechat.unWrapMsg({contentType, content})
        axios.post(`${env.wwxApiAddress}/sendMsg`, {
          sessionId,
          messageType,
          message
        }).then(({data: {errCode, errMsg}}) => {
          if (errCode === 0) {
            let outCon = null
            db.getConnection().then(connection => {
              outCon = connection
              return util.saveMessage({connection, message, messageType, sessionId})
            }).then(({createTime, historyId}) => {
              this.wechat.sendMsg({serverUserId, openID, msg: {contentType, content, createTime, historyId, role: 'server'}})
            }).catch(error => {
              this.wechat.sendError(serverUserId, openID, error.errMsg)
            }).finally(() => {
              if (outCon) {
                outCon.release()
              }
            })
          } else {
            this.wechat.sendError(serverUserId, openID, errMsg)
          }
        }).catch(error => {
          this.wechat.sendError(serverUserId, openID, error.errMsg)
        })
      }
    },
    sendError: (serverUserId, openID, errMsg) => {
      if (serverChatDic.has(serverUserId)) {
        serverChatDic.get(serverUserId).socket.emit('CLIENT_SEND_MSG', {
          clientChatEn: {
            clientChatId: openID
          },
          success: false,
          errMsg: errMsg || '未知错误'
        });
      }
    },
    wrapMsg: ({message, messageType, role = 'client', ...other}) => {
      let contentType = 'text'
      switch (messageType) {
        case 2:
          contentType = 'image'
          break
        case 3:
          contentType = 'sound'
          break
      }
      return Object.assign({
        contentType,
        content: message,
        role
      }, other)
    },
    unWrapMsg: ({content, contentType, ...other}) => {
      let messageType = 1
      switch (contentType) {
        case 'image':
          messageType = 2
          break
        case 'sound':
          messageType = 3
          break
      }
      return Object.assign({
        messageType,
        message: content
      }, other)
    },
    closeWwx: ({sessionId}) => axios.post(`${env.wwxApiAddress}/sendMsg`, {sessionId})
  }
}

module.exports = socketFunc
