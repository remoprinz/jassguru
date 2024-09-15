const path = require('path');

module.exports = {
  chainWebpack: config => {
    config.plugin('define').tap(args => {
      const env = require('dotenv').config({ path: path.resolve(__dirname, '../.env') }).parsed
      for (let key in env) {
        args[0]['process.env'][key] = JSON.stringify(env[key])
      }
      return args
    })
  }
}