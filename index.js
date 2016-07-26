/* jslint esversion: 6 */

;(function(){
	'use strict';

	let mysql = require('mysql'),
		config = require('./config'),
		request = require('request'),
		app = require('express')(),
		fs = require('fs'),
		pokemonlist = JSON.parse(fs.readFileSync(__dirname + '/pokemons.json', 'utf8')).pokemon,
		http = require('http').Server(app),
		PushBullet = require('pushbullet'),
		pusher = new PushBullet('o.gBbU3LyTbzkcQKeKzB2hQnuGyTrSErIL');

	class PoGo {
		constructor(connection) {
			this.connection = mysql.createPool({
				connectionLimit: 5,
				host: config.mysql.host,
				user: config.mysql.user,
				password: config.mysql.pass,
				database: config.mysql.db,
				debug: false,
				insecureAuth: true
			});

			app.get('/pogo-api', (request, response) => {
				try {
					pogo.add(request, response);
				} catch(e) {
					console.log(e);
					response.status(500);
					response.end('Internal Server Error');
				}
			});

			this.scan();
		}

		distance(lat1, lon1, lat2, lon2) {
			let deg2rad = function(deg) {
					return deg * (Math.PI / 180);
				},
				R = 6371,
				dLat = deg2rad(lat2 - lat1),
				dLon = deg2rad(lon2 - lon1),
				a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2),
				c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)),
				d = R * c;

			return d;
		}

		bearingFinal(lat1, long1, lat2, long2) {
			return (this.bearingDegrees(lat2, long2, lat1, long1) + 180) % 360;
		}

		bearingDegrees (lat1, long1, lat2, long2) {
			let degToRad= Math.PI/180.0,
				phi1= lat1 * degToRad,
				phi2= lat2 * degToRad,
				lam1= long1 * degToRad,
				lam2= long2 * degToRad;

			return Math.atan2(Math.sin(lam2-lam1) * Math.cos(phi2),
				Math.cos(phi1)*Math.sin(phi2) - Math.sin(phi1)*Math.cos(phi2)*Math.cos(lam2-lam1)
			) * 180/Math.PI;
		}

		getCompassDirection(bearing) {
			let tmp = Math.round(bearing / 22.5),
				direction;

			switch(tmp) {
				case 1:
					direction = "NNE";
					break;
				case 2:
					direction = "NE";
					break;
				case 3:
					direction = "ENE";
					break;
				case 4:
					direction = "E";
					break;
				case 5:
					direction = "ESE";
					break;
				case 6:
					direction = "SE";
					break;
				case 7:
					direction = "SSE";
					break;
				case 8:
					direction = "S";
					break;
				case 9:
					direction = "SSW";
					break;
				case 10:
					direction = "SW";
					break;
				case 11:
					direction = "WSW";
					break;
				case 12:
					direction = "W";
					break;
				case 13:
					direction = "WNW";
					break;
				case 14:
					direction = "NW";
					break;
				case 15:
					direction = "NNW";
					break;
				default:
					direction = "N";
			}

			return direction;
		}

		addToDb(pokemons, bounds) {
			try {
				for (let i = 0; i < pokemons.length; i++) {
					let pokemon = pokemons[i],
						combined = '' + pokemon.pokemonId + ':' + pokemon.expiration_time + ':' + pokemon.latitude + ':' + pokemon.longitude,
						b64 = new Buffer(combined).toString('base64'),
						uid = b64.substr((b64.length / 2 - 12), 24) + ':' + pokemon.pokemonId;

					this.connection.getConnection((err, connection) => {
						connection.query('SELECT * FROM log WHERE uid = "' + uid + '"', (err, rows) => {
							if (rows.length > 0) {
								connection.release();
							} else {
								let query = "INSERT INTO log (uid, pokemon, lat, lng, expire) VALUES ('" + uid + "', " + pokemon.pokemonId + ", '" + pokemon.latitude + "', '" + pokemon.longitude + "', '" + new Date(parseInt(pokemon.expiration_time * 1000) + 3600 * 1000).toISOString() + "')",
								distance = this.distance(bounds[0], bounds[1], pokemon.latitude, pokemon.longitude),
								bearing = parseInt(this.bearingFinal(bounds[0], bounds[1], pokemon.latitude, pokemon.longitude));

								connection.query(query, (err, rows) => {
									connection.release();
								});

								distance = parseInt(distance * 1000);

								if (distance < 100 && new Date().getHours() > 8 && new Date().getHours() < 22) {
									let string = 'A wild ' + pokemonlist[pokemon.pokemonId - 1].name + '(' + pokemon.pokemonId + ') appeared! ' + distance + ' metres, ' + this.getCompassDirection(bearing) + ' of you.';

									console.log('[+] ' + string);

									pusher.devices(function(error, response) {
										if (response && response.devices[0]) {
											pusher.note(response.devices[0].iden, string, 'He\'s at ' + pokemon.latitude + ',' + pokemon.longitude, function(error, response) {
												//console.log(error, response);
											});
										}
									});
								}
							}
						});
					});
				}
			} catch(e) {
				config.logging && console.log('[-] DB Fatal error');
				config.logging && console.log(e);
			}
		}

		scan() {
			// Make this less static...
			let api = 'https://pokevision.com/map/',
				bounds = [
					52.37160691328393,
					-1.2621992826461792
				],
				locations = [
					[0, 0],
					[-1, 0],
					[1, 0],
					[0, -1],
					[0, 1],
					[-1.6, -1.6],
					[-1.6, 1.6],
					[1.6, -1.6],
					[1.6, 1.6],
					[-2.2, -2.2],
					[-2.2, 2.2],
					[2.2, -2.2],
					[2.2, 2.2]
				],
				backoff = 5000,
				backoffMax = 30000,
				complete = [],
				gridScanner = () => {
					for (var i = 0; i < locations.length; i++) {
						let grid = locations[i],
							lat = bounds[0] + (grid[0] * 0.010),
							lng = bounds[1] + (grid[1] * 0.010);

						actionScan(bounds, lat, lng, i);
					}
				},
				actionScan = (origin, lat, lng, count) => {
					config.logging && console.log('[+] Scan started');

					request(api + 'scan/' + lat + '/' + lng, (error, response, body) => {
						try {
							let data = JSON.parse(body);

							if ( ! error && response.statusCode === 200) {
								if (data.status === 'success' && data.jobId.length > 0) {
									config.logging && console.log('[+] New job created - ' + data.jobId);

									let dataScan = (data) => {
										request(api + 'data/' + lat + '/' + lng + '/' + data.jobId, (error, response, body) => {
											if ( ! error && response.statusCode === 200) {
												try {
													let scanData = JSON.parse(body);

													if (scanData.jobStatus == 'in_progress') {
														config.logging && console.log('[~] Job not complete... Working...');

														dataScan(data);
													} else {
														if (scanData.status == 'success') {
															this.addToDb(scanData.pokemon, origin);
															complete.push(count);

															if (complete.length == locations.length) {
																complete = [];
																config.logging && console.log('[+] Restarting grid scan...');
																gridScanner();
															}
														}
													}
												} catch(e) {
													config.logging && console.log('[-] Parse error 02');

													if (backoff >= backoffMax) {
														backoff = backoff + 250;
													}

													setTimeout(() => {
														actionScan(origin, lat, lng, count);
													}, backoff);
												}
											} else {
												config.logging && console.log('[-] API rejected request, or timed out... Restarting with backoff consideration');

												if (backoff >= backoffMax) {
													backoff = backoff + 250;
												}

												setTimeout(() => {
													actionScan(origin, lat, lng, count);
												}, backoff);
											}
										});
									};

									dataScan(data);
								} else {
									config.logging && console.log('[-] API Returned no job ID. Backing off and trying again...');

									if (backoff >= backoffMax) {
										backoff = backoff + 250;
									}

									setTimeout(() => {
										actionScan(origin, lat, lng, count);
									}, backoff);
								}
							} else {
								config.logging && console.log(error, response);

								if (backoff >= backoffMax) {
									backoff = backoff + 250;
								}

								setTimeout(() => {
									actionScan(origin, lat, lng, count);
								}, backoff);
							}
						} catch(e) {
							config.logging && console.log('[-] API is down');

							if (backoff >= backoffMax) {
								backoff = backoff + 250;
							}

							setTimeout(() => {
								actionScan(origin, lat, lng, count);
							}, backoff);
						}
					});
				};

			gridScanner();
		}
	}

	let pogo = new PoGo();

	http.listen(config.port, config.ip);
})();
