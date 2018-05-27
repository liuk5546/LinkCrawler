var log4js = require('log4js')
log4js.configure({
    appenders:{cheese:{type:'file',filename:'../log/'+new Date()+'.log'},out:{type:'stdout'}},
    categories:{default:{appenders:['cheese','out'],level:'error'}}
})

const logger = log4js.getLogger('cheese')
//logger.level = 'debug'
//logger.debug("Time:",new Date())
logger.record = function (level,msg) {
    this.level = level;
    logger.error(msg)
}
logger.level = 'debug'
//logger.record("debug","数据库错误")
//logger.record('debug','hello')
module.exports = logger