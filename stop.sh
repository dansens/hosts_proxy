ps -ef|grep "node hosts_proxy.js"|grep -v grep|cut -c 9-15|xargs kill -9