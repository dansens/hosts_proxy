"use strict";

var fs = require('fs');
var dgram = require('dgram');

var Log = require('log');
var logFile;

var zero = function(v) {
    v = v + "";
    if (v.length < 2) {
        v = "0" + v;
    }
    return v;
};

var addlog = function() {

    //console.log.apply(null, arguments);

    if (!logFile) {
        var date = new Date();

        var time = zero(date.getMonth() + 1) + zero(date.getDate()) + "_" + zero(date.getHours()) + zero(date.getMinutes());
        var filename = './log/info_' + time + '.log';

        logFile = new Log('info', fs.createWriteStream(filename));
    }

    logFile.info.apply(logFile, arguments);

};

var packet = require('native-dns-packet');

var getHosts = function() {
    var fileData = fs.readFileSync("./etc/hosts", "utf-8");
    if (!fileData) {
        return {};
    }

    var trim = function(str) {
        str = str + "";
        return str.replace(/(^\s*)|(\s*$)/, "");
    };

    var lineList = fileData.split(/\n+/);

    if (!lineList || !lineList.length) {
        return {};
    }

    var filterHosts = function(lineList) {
        var hosts = {};
        var reg = /[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\s+.+/;

        for (var i = 0, l = lineList.length; i < l; i++) {
            var item = trim(lineList[i]);
            if (item && item.indexOf("#") === -1 && reg.test(item)) {
                var arr = item.split(/\s+/);
                if (arr[0] && arr[1]) {
                    hosts[arr[1]] = arr[0];
                }
            }
        }
        return hosts;
    };

    var hosts = filterHosts(lineList);

    return hosts;

};

var hosts = getHosts();

var createAnswer = function(query, answer) {
    query.header.qr = 1;
    query.header.rd = 1;
    query.header.ra = 1;
    query.answer.push({
        name: query.question[0].name,
        type: 1,
        class: 1,
        ttl: 30,
        address: answer
    });

    var buf = new Buffer(4096);
    var wrt = packet.write(buf, query);
    var res = buf.slice(0, wrt);

    return res;
};

var NSQuery = function(message, rinfo, nameserver, onMessage) {
    //console.log("Query from server:", nameserver);

    var sock = dgram.createSocket('udp4');

    sock.on('error', function(err) {
        addlog('Socket Error:' + err);
    });
    sock.on('message', onMessage);

    sock.send(message, 0, message.length, 53, nameserver);

    return sock;
};

var server = dgram.createSocket('udp4');
server.on('error', function(err) {
    addlog('Server Error: ' + err);
});

server.on("listening", function() {
    console.log("Server listening " + server.address().address);
});

server.on('message', function(message, rinfo) {

    var query = packet.parse(message);

    var question = query.question[0];

    var name = question.name;
    var type = question.type;

    if (type === 1) {
        addlog(name);
        var ip = hosts[name];
        if (ip) {
            //console.log('Found from hosts: ', name, ip);

            var res = createAnswer(query, ip);
            server.send(res, 0, res.length, rinfo.port, rinfo.address);

            return;
        }
    }

    var onResponse = function(response) {
        //var res = packet.parse(response);
        //console.log(res.answer);
        server.send(response, 0, response.length, rinfo.port, rinfo.address);
    };

    var fallback = setTimeout(function() {

        var sock_bak = new NSQuery(message, rinfo, '8.8.8.8', function(response) {
            onResponse(response);
            sock_bak.close();
        });

    }, 350);

    var sock = new NSQuery(message, rinfo, '223.5.5.5', function(response) {
        clearTimeout(fallback);
        onResponse(response);
        sock.close();
    });


});

server.bind(53, "127.0.0.1");
