"use strict";

var option = {
    //first time require nslookup password to add client ip in allow list
    //you can update this for security
    //or empty for all ip
    password: "cenfun.com",

    logPath: "./log/",
    hostsPath: "./etc/hosts",

    dns1: "223.5.5.5",
    dns2: "8.8.8.8"

};

module.exports = option;
