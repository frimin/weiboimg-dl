var request = require('./request')
var async = require('async')

API = 'http://m.weibo.cn/container/getIndex?';

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/55.0.2883.95 Safari/537.36,',
    'Accept': '*/*',
};

function handleDate(curDate, dateStr) {
    if (!/\d{4}/.test(dateStr)) {
        dateStr = curDate.getFullYear().toString() + ' ' + dateStr
    }

    return new Date(dateStr)
}

function handleCard(content, card) {
    if (card['card_type'] == 11)
        return;
    if (card['mblog']['retweeted_status']) //跳过转发内容
        return;
    if (card['mblog']['pics']) {
        var pics = card['mblog']['pics'];
        var ret = [];

        for (var i in pics) {
            if (pics[i]['large']) {
                ret.push([pics[i]['large']['url'], { 
                    time: handleDate(content._date, card['mblog']['created_at']) 
                }]);
            }
        }

        return ret
    }
}

var Content = (function () {
    function Content(userContent, date) {
        this.nickname = userContent['userInfo']['screen_name'];
        this._containerid = null;
        this._page = 0;
        this._unhandleImages = []
        this._done = false
        this._date = date

        var tabs = userContent['tabsInfo']['tabs'];

        for(var i in tabs) {
            if (tabs[i]['title'] == "微博")
                this._containerid = tabs[i]['containerid'];
        }
    }

    Content.prototype.__defineGetter__('done', function() {
        return this._done;
    });

    Content.prototype.__defineGetter__('page', function() {
        return this._page;
    });

    Content.prototype.nextPage = function (callback) {
        setTimeout((page, callback)=> {
            request.http_request({
                host: 'm.weibo.cn',
                path: `/container/getIndex?containerid=${this._containerid}&page=${this._page}`,
                method: 'GET',
                headers: HEADERS
            }, (err, res, body) => {
                var newPage = JSON.parse(body.toString());
                var ok = newPage['ok'] == 1

                if (!ok) { // end of page
                    this._done = true
                    callback(err, this);
                    return;
                }

                if (newPage['cards']) {
                    var pics = [];
                    for(var i in newPage['cards']) {
                        var ret = handleCard(this, newPage['cards'][i]);
                        if (ret) {
                            pics = pics.concat(ret);
                        }
                    }

                    if (pics.length > 0) {
                        this._unhandleImages = this._unhandleImages.concat(pics);
                    }
                }
                callback(err, this);
            })
        }, 0, ++ this._page, callback);
    }

    Content.prototype.popImages = function () {
        var ret = this._unhandleImages;
        this._unhandleImages = [];
        return ret;
    }

    return Content;
}());

function requestWeiboContent(nickname, callback) {
    async.waterfall(
        [
            (callback) => {
                request.http_request({
                    host: 'm.weibo.cn',
                    path: '/n/' + encodeURIComponent(nickname),
                    method: 'GET',
                    headers: HEADERS
                }, (err, res, body) => {
                    callback(err, res.headers['location']);
                });
            },
            (location, callback) => {
                request.http_request({
                    host: 'm.weibo.cn',
                    path: location,
                    method: 'GET',
                    headers: HEADERS
                }, (err, res, body) => {
                    var weibofid = res.headers['set-cookie'].join(' ').match(/\d{16}/);
                    callback(err, weibofid);
                });
            },
            (fid, callback) => {
                request.http_request({
                    host: 'm.weibo.cn',
                    path: '/container/getIndex?containerid=' + fid,
                    method: 'GET',
                    headers: HEADERS
                }, (err, res, body) => {
                    callback(err, { 
                        date: new Date(res.headers['date']),
                        content: body.toString() 
                    });
                });
            }
        ], (err, result) => {
            callback(err, new Content(JSON.parse(result.content), result.date));
        }
    );
}

exports.requestWeiboContent = requestWeiboContent;