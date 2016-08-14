"use strict";

var fs = require('fs');
var dgram = require('dgram');
var packet = require('native-dns-packet');
var Log = require('log');

var option = require("./option.js");

//==================================================================================================
var createLogFile = function() {

    var zero = function(v) {
        v = v + "";
        if (v.length < 2) {
            v = "0" + v;
        }
        return v;
    };

    var date = new Date();
    var yy = date.getFullYear().toString().substr(2);
    var mm = zero(date.getMonth() + 1);
    var dd = zero(date.getDate());
    var hh = zero(date.getHours());
    var MM = zero(date.getMinutes());
    var time = yy + mm + dd + "_" + hh + MM;
    var filename = option.logPath + time + '.log';
    var logFile = new Log('info', fs.createWriteStream(filename));
    return logFile;
};

var logFile;
var addlog = function(str) {
    if (!logFile) {
        logFile = createLogFile();
    }
    logFile.info(str + "\r");
};

//==================================================================================================
var getHosts = function() {
    var fileData = fs.readFileSync(option.hostsPath, "utf-8");
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

//==================================================================================================
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

    var wrt;
    try {
        wrt = packet.write(buf, query);
    } catch (e) {
        return null;
    }
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


//==================================================================================================
var allowIpList = {};

var onMessage = function(server, message, rinfo) {

    if (!rinfo || !rinfo.address) {
        return;
    }

    var clientIp = rinfo.address;


    if (!message) {
        return;
    }
    var query;
    try {
        query = packet.parse(message);
    } catch (e) {}

    if (!query) {
        addlog('Error message: ' + clientIp);
        return;
    }

    var question = query.question[0];

    var name = question.name;
    var type = question.type;

    var log = "[" + clientIp + "," + rinfo.family + "," + rinfo.port + "," + rinfo.size + "] ";

    //==================================
    //password
    if (option.password && !allowIpList[clientIp]) {
        if (name === option.password) {
            allowIpList[clientIp] = true;
            console.log("allow " + clientIp);
            addlog(log + " allow");
        }
        return;
    }

    log += "(" + type + ") " + name;

    //==================================
    //from hosts
    if (type === 1) {
        var ip = hosts[name];
        if (ip) {
            //console.log('Found from hosts: ', name, ip);

            var res = createAnswer(query, ip);
            if (res) {
                server.send(res, 0, res.length, rinfo.port, clientIp);
                addlog(log + " " + ip + " from hosts");
                return;
            }

        }

    }

    var fallback = setTimeout(function() {
        var sock_bak = new NSQuery(message, rinfo, option.dns2, function(response) {
            server.send(response, 0, response.length, rinfo.port, clientIp);
            sock_bak.close();

            addlog(log + " " + option.dns2);
        });
    }, 500);

    var sock = new NSQuery(message, rinfo, option.dns1, function(response) {
        clearTimeout(fallback);
        server.send(response, 0, response.length, rinfo.port, clientIp);
        sock.close();

        addlog(log + " " + option.dns1);
    });

};

//==================================================================================================
var server = dgram.createSocket('udp4');
server.on('error', function(err) {
    addlog('Server Error: ' + err);
});
server.on("listening", function() {
    console.log("Server listening " + server.address().address);
});
server.on('message', function(message, rinfo) {
    return onMessage(server, message, rinfo);
});
server.bind(53);
