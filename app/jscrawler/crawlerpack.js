const request = require('superagent')
const webInformation = require('./webInformation')
const MongoClient = require('mongodb').MongoClient
const logger = require('./log')
const events = require('events')
let longTimeDBClient = null
let sitemapLinks = []
let currentLinks = []
let counter = 0
let emitter = new events.EventEmitter()
const LISTEN_TITLE = 'one_turn_done'
/**
 * 如果我已经爬了200个站点
 * 那睡一下防止被403
 */
emitter.addListener('one_turn_done',function () {
    logger.debug('新队列开始sitemapLinks:',sitemapLinks.length)
    if(counter>=200) {
        counter = 0
        logger.debug('Rest')
        setTimeout(()=>{
            logger.debug('休息结束')
            excuteList().then((values) => {
                emitter.emit('one_turn_done')
            })},600000)

    }else {
        logger.debug('不休息')
        excuteList().then((values) => {
            emitter.emit('one_turn_done')
        })
    }
})
/**
 *取三百个
 */
function exchangeLinks() {
    currentLinks = []
    //每次最多取300个
    for(let i = 0 ; i < 300; i++){
        if(sitemapLinks.length>0) {
            let shift = sitemapLinks.shift()
            currentLinks.push(new webInformation(shift.domain, shift.url))
        }
    }
    //console.log('currentLinks:',currentLinks,'sitemapLinks:',sitemapLinks)
}
// sitemapLinks = [1,2,3]
// exchangeLinks()
// console.log(sitemapLinks,currentLinks)
/**
 * 当webInformation的队列装载完毕时用来筛选
 * 可接受的链接：1、同域名；2、不是当前页面的#
 * 3、爬过的页面不接受
 * 这一次改版将函数封装成了一个可以放入promise的
 * 函数
 * 这些合法的链接最后会放入sitemapLinks这个
 * 数组当中去
 * @param oldLinks
 * 老地址链接，来自webInformation.href
 * @param domain
 *
 * @param url
 */
function pushAcceptableLink(element,domain,url) {
    return (resolve,reject)=>{
        let regIsFullName = /^http(s)?:\/\/(.*?)\//
        let regIsLink = /^#/
        //logger.debug('oldLinks:',oldLinks.length)
        //oldLinks.forEach(function (element,i) {
            let currentUrl
            let currentDomain
            if(regIsLink.test(element)){
                //do nothing
                //resolve('illegal')
            }else {
                //
                if (element.match(regIsFullName) !== null) {
                    let m = element.match(regIsFullName)[0]
                    currentDomain = element.substr(0,m.length-1)
                    currentUrl = element.substr(element.match(regIsFullName)[0].length, element.length)
                } else {
                    currentDomain = domain
                    currentUrl = element
                }
                //let whichOne = {url: currentUrl, domain: currentDomain};
                //list.push(whichOne)
            }
            //去数据库里寻找是否有相同的队列
            if(currentDomain===domain&&currentUrl!==url&&/^\//.test(currentUrl)){
                longTimeDBClient.find({domain:currentDomain,url:currentUrl})
                    .toArray(function (err,res) {
                        if(res.length===0){
                            sitemapLinks.push({
                                domain: currentDomain,
                                url: currentUrl
                            })
                            longTimeDBClient.insertOne({domain:currentDomain,url:currentUrl},()=>{
                                resolve(currentDomain+currentUrl+':入队成功')
                            })
                        }
                    })

            }else{
                resolve('illegal')
            }
       // })
    }

}

/**
 * 为download函数构建一个私有的空间
 *
 * @param wi
 * Full Name: webInformation
 * @returns {download}
 * download是支持Promise的回调函数,用来下载页面
 * 并且保存到Mongodb当中去
 * @para fivecounter
 * 每次下载链接队列之间设置五秒的时间间隔
 */
let buildTheDownLoadEvn = (wi,fivecounter)=>{
    return function download(resolve,reject) {
        counter++
        setTimeout(()=>{
            request
                .get(wi.getDURL())
                .set('user-agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/66.0.3359.181 Safari/537.36')
                .set('accept','text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8')
                .end(function (err,res) {
                    if(err) {
                        logger.error(wi.getDURL(),err.message)
                        resolve(err)
                    }
                    else {
                        if (res.statusCode === 200&&res.text) {
                            wi.findTheInfo(res.text)
                            let tempLine = []
                            //这里限制了队列的长度，最长20000
                            if(sitemapLinks.length <= 60000&&wi.url.length<=60){
                                wi.href.forEach(function (t) {
                                    tempLine.push(new Promise(pushAcceptableLink(t, wi.domain, wi.url)))
                                })
                                Promise.all(tempLine)
                                    .then(function (data) {
                                        resolve(wi.getDURL())
                                        logger.debug('现在数组的长度：',sitemapLinks.length)
                                        //logger.debug('')
                                    })
                            }

                            else{
                                //如果队列到达上限那么，也要返回
                                resolve(wi.getDURL())
                            }

                            let updatestr ={ $set: {
                                title: wi.title,
                                body: wi.body,
                                encoding: wi.encoding,
                                html: wi.html,
                            }}
                            longTimeDBClient.updateOne(
                                {
                                    domain: wi.domain,
                                    url: wi.url,
                                },
                                updatestr,
                                function (err, _) {
                                if (err) logger.record('error', err.message);
                                else logger.debug('文档插入成功 domain:', wi.domain, ' url:', wi.url,'现在数组的长度：',sitemapLinks.length)
                            })

                            //成功带回成功的链接为了在日志文件中记录

                            //console.log(sitemapLinks)
                        } else {
                            resolve(0)
                            logger.error(wi.getDURL(),'internet error stateCode:' + res.statusCode)
                            //日志里要记录一些信息 DURL和错误代码，错误发生的时间
                        }
                    }
                })
        },5000*fivecounter)

    }
}
//test
let test = ()=>{
    let promise = new Promise(initMongo)
    promise.then((data)=>{
        console.log(data)
        //sitemapLinks.push(new webInformation('https://www.segmentfault.com','/'))
        let p = new Promise(buildTheDownLoadEvn(new webInformation('https://www.segmentfault.com','/'),0))
            .then(function (data) {
                console.log(data)
                console.log(sitemapLinks)
            })
        //download(new webInformation('https://www.segmentfault.com','/'))
    }).catch((data)=>{
        //longTimeDBClient.close()
        console.log(data)
    })
}
//test well
//test()
// function download(wi) {
//     request
//         .get(wi.getDURL())
//         .set('user-agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/66.0.3359.181 Safari/537.36')
//         .set('accept','text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8')
//         .end(function (err,res) {
//             if(res.statusCode==200){
//                 wi.findTheInfo(res.text)
//                 pushAcceptableLink(wi.href,wi.domain,wi.url)
//                 let whichOne = {
//                     domain:wi.domain,
//                     url: wi.url,
//                     title: wi.title,
//                     body: wi.body,
//                     encoding: wi.encoding,
//                     html: wi.html,
//                 }
//                 longTimeDBClient.insertOne(whichOne,function (err,_) {
//                     if (err) logger.record('error',err.message);
//                     else console.log("文档插入成功")
//                 })
//                 //console.log(sitemapLinks)
//             }else {
//                 logger.record('error','internet error stateCode:'+res.statusCode)
//                 //日志里要记录一些信息 DURL和错误代码，错误发生的时间
//             }
//
//         })
// }

/**
 * 用来消费currentLinks，出栈创建一个promise
 * 循环到长度为0
 */
function excuteList(){
    if(sitemapLinks.length===0){
        //如果执行器发现队列为0，那么结束
        //这种情况很少：可能是站点已经爬完或者发生了未知
        //console.log()
        logger.debug('3.可能爬完了,sitemapLinks: 0 currentLinks:',currentLinks.length)
        process.exit(0)
    }
    exchangeLinks()
    let promiseQueue = []
    let fivecounter = 0
    //console.log(currentLinks)
    while(currentLinks.length > 0){
        promiseQueue.push(new Promise(buildTheDownLoadEvn(currentLinks.pop(),fivecounter)))
        fivecounter++
    }
    return Promise.all(promiseQueue)
}
/**
 * 初始化数据库的长链接
 * @param resolve
 * @param reject
 */
function initMongo(resolve,reject) {
    let dburl = 'mongodb://localhost:27017'
    MongoClient.connect(dburl,function (err,db) {
        if(err){
            reject(err.message)
        }else {
            longTimeDBClient = db.db('crawler').collection('segmentfault')
            resolve('welcome mongoDb')
        }
    })
}

/**
 * 全站爬虫入口
 * 这个是单种子模式，并且爬的是限制域名为本站的
 * @param seed
 * 仅能有一个种子
 */
function crawlerStruct(seed) {
    let promise = new Promise(initMongo)
    promise.then((data)=>{
        logger.debug('1.init well',data)
        sitemapLinks.push(new webInformation('https://www.segmentfault.com','/tags'))
        longTimeDBClient.insertOne({domain:'https://www.segmentfault.com',url:'/tags'},()=>{
            excuteList().then((value)=>{
                logger.debug('2.next sitemap',sitemapLinks.length)
                //console.log(value,sitemapLinks)
                emitter.emit('one_turn_done')
            })
        })

        //download(new webInformation('https://www.segmentfault.com','/'))
    }).catch((data)=>{
        if(longTimeDBClient!=null){
            longTimeDBClient.close()
        }
        logger.debug('bad Client',data)
    })
}


crawlerStruct()