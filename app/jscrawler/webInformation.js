const cheerio = require('cheerio')
// const MongoClient = require('mongodb').MongoClient
//写一个类用来存储title，body及其子节点中的文字信息，以及链接href信息
const logger = require('./log')
var webInformation = function (domain,url) {
    this.domain = domain
    this.url = url
    this.title = ""
    this.body = ""
    this.href = []
    this.html = ""
}
var b = "#asd"
//console.log(regIsLink.test(b))
webInformation.prototype.title = ""
webInformation.prototype.body = ""
webInformation.prototype.href = []
webInformation.prototype.html = ""
/**
 * 将所有的信息分析放到一个webInformation类当中去
 * @param html
 * html原文
 */
webInformation.prototype.findTheInfo = function(html) {
    //装载页面
    this.html = html;
    //分析title
    const $ = cheerio.load(html)
    this.title = $("title").text()
    this.encoding = $('head > meta[http-equiv=content-type]').attr('content')
    //遍历body节点的所有子节点
    readAllNode($,"body",this)
    let hrefs = $('[href]')
    for(let i = 0 ; i < hrefs.length;i++){
        this.href.push($(hrefs[i]).attr('href'))
    }
    logger.debug(this.getDURL(),"got title:",this.title+" and href number:",this.href.length,"done!");
}
function readAllNode($,root,wi) {
    var body;
    //var href;
    var nodes = $(root).children()
    //获得所有子元素的dom对象
    nodes.each(function (i,elem) {
        // href = $(this).attr('href')
        // if(href!=undefined)
        //     wi.href.push(href)

        body = $(this).text()

        if(body!=undefined) {
            //将所有的标点符号过滤掉
            // body = body.split("\n").join(' ')
            // body = body.split(" ").join('')
            // body = body.split("\t").join('')
            // body = body.split(",").join(" ")
            // body = body.split(".").join(" ")
            // body = body.split(":").join(" ")
            wi.body += body
        }

        readAllNode($,this,wi)
    })
}
webInformation.prototype.getDURL = function () {
    return this.domain+this.url;
}
//打包成固定格式的文本为索引做准备
webInformation.prototype.Text = function () {
    return '<title>'+this.title+'</title>'+'\n'+'<body>'+this.body+'</body>'
}
module.exports = webInformation;