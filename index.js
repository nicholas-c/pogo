;(function(){
	'use strict';

	var mysql = require('mysql'),
		config = require('./config'),
		app = require('express')(),
		http = require('http').Server(app);

	class Profiles {
		constructor() {
			this.connection = mysql.createPool({
				connectionLimit	: 10,
				host			: config.mysql.rugbyAsterisk.db,
				user			: config.mysql.rugbyAsterisk.user,
				password		: config.mysql.rugbyAsterisk.password,
				database 		: config.mysql.rugbyAsterisk.database,
				debug			: false,
				insecureAuth 	: true
			});

			app.get('/profiles*', function(request, response) {
				try {
					profiles.fetchProfiles(request.url.split('/')[2], request, response);
				} catch(e) {
					response.status(500);
					response.end('Internal Server Error');
				}
			});

			app.get('/logs', function(request, response) {
				try {
					profiles.logs(request, response);
				} catch(e) {
					response.status(500);
					response.end('Internal Server Error');
				}
			});
		}

		fetch(team, request, response) {
			let connection = this.connection,
			    query = "SELECT u.name, u.extension, pp.email, pp.forename, pp.surname, pp.nick_name, pp.team, pp.position, pp.group FROM users AS u LEFT JOIN proppages_profiles AS pp on u.extension = pp.extension WHERE `name` NOT LIKE 'ext%' AND `name` NOT LIKE 'Rugby%' AND `name` NOT LIKE '%PC%' AND `name` NOT LIKE 'Intercom' AND `name` NOT LIKE 'Phone Setup' AND `name` NOT LIKE '%mobile%' AND `name` NOT LIKE '%room%' AND `name` NOT LIKE '%NodeJS%'";

			if(team != 'all') {
				query += ' AND team LIKE ' + team;
			}

			connection.getConnection(function (err, connection) {
				connection.query(query, function (err, rows) {
					connection.release();

					if(err) {
						response.status(500);
						response.end('Internal Server Error');
					}

					try {
						response.status(200);
						response.json(rows);
					} catch(e) {
						response.status(500);
						response.end('Internal Server Error');
					}
				});
			});
		}

		logs(request, response) {
			console.log('foo');
		}
	}

	let profiles = new Profiles();

	http.listen(9090, config.ip);
})();
