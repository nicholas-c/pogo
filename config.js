'use strict';

var config = {}

// Write to log files?
config.logging = false;

config.serverPath = __dirname;

// Access log locations
config.logs = {};
	config.logs.server = config.serverPath + '/logs/server.log';
	config.logs.access = config.serverPath + '/logs/access.log';

// MySQL config
config.mysql = {};
	config.mysql.host = 'db';
	config.mysql.user = 'root';
	config.mysql.password = 'edenarcor77&',
	config.mysql.database = 'orangepages';

//IP
config.ip = '192.168.6.95';

// Ports
config.port = 9090;

// Export the module and pass through config
module.exports = config;
