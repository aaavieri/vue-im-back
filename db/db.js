const mysql =  require('mysql');
const dbParams = require('../config/dbConnection')
const appLog = require('../logger/appLogger')
const pool =  mysql.createPool(dbParams);

const getConnection = () => new Promise((resolve, reject) => {
  pool.getConnection((error, connection) => {
    if (error) {
      appLog.error(error)
      if (connection) connection.release()
      return reject(error)
    }
    resolve(connection)
  })
})

const getTransaction = () => getConnection()
  .then(connection => new Promise((resolve, reject) => {
    connection.beginTransaction(error => {
      if (error) {
        appLog.error(error)
        if (connection) connection.release()
        return reject(error)
      }
      resolve(connection)
    })
  }))

const execute = (connection, statement, params) => new Promise((resolve, reject) => {
  appLog.debug(statement)
  appLog.debug(params)
  connection.query(statement, params, (error, results, fields) => {
    if (error) {
      appLog.error(error)
      if (connection) connection.release()
      return reject(error)
    }
    resolve({connection, results, fields})
  })
})

module.exports = {
  getConnection,
  getTransaction,
  execute
}


