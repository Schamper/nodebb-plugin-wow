(function(WoW) {
	var pjson = require('./package.json'),
		Settings = module.parent.require('./settings'),
		User = module.parent.require('./user'),
		Groups = module.parent.require('./groups'),
		AdminSockets = module.parent.require('./socket.io/admin').plugins,
		PluginSockets = module.parent.require('./socket.io/plugins'),
		UserSockets = module.parent.require('./socket.io/user'),
		db = module.parent.require('./database'),
		utils = module.parent.require('../public/src/utils'),

		async = module.parent.require('async'),
		winston = module.parent.require('winston'),
		api = require('battlenet-api').wow,
		cron = require('cron').CronJob,
		cronJob,

		Upgrade = require('./lib/upgrade');

	var Config = {
		plugin: {
			name: 'WoW Guild Integration',
			id: 'wow',
			version: pjson.version,
			description: pjson.description,
			icon: 'fa-edit',
			route: '/wow'
		},
		defaults: {
			variables: {
				apiKey: '',
				realm: '',
				cronPattern: '0 0 * * *',
				thumbnailBaseUrl: 'http://us.battle.net/static-render/us/'
			},
			toggles: {
				guildMappingEnabled: true
			},
			mappings: {
				guild: '{}'
			},
			version: ''
		},
		sockets: {
			sync: function() {
				Config.global.sync();
			}
		}
	};

	Config.registrationIds = {
		char: Config.plugin.id + '_characterName'
	};

	Config.userFields = [
		'wow_name', 'wow_thumbnail', 'wow_class', 'wow_class_name', 'wow_class_color',
		'wow_achievement_points', 'wow_guild', 'wow_realm'
	];

	Config.classInfo = {
		names: ['None', 'Warrior', 'Paladin', 'Hunter', 'Rogue',
			'Death Knight', 'Shaman', 'Mage', 'Warlock', 'Monk', 'Druid'],
		colors: ['#fff', '#C79C6E', '#F58CBA', '#ABD473', '#FFF569',
			'#FFFFFF', '#C41F3B', '#0070DE', '#69CCF0', '#9482C9', '#00FF96', '#FF7D0A']
	};

	WoW.load = function(app, middleware, controllers, callback) {
		function renderAdmin(req, res, next) {
			Groups.list({ showSystemGroups: false, removeEphemeralGroups: true }, function(err, result) {
				res.render(Config.plugin.id + '/admin', { groups: result });
			});
		}

		app.get('/admin' + Config.plugin.route, middleware.admin.buildHeader, renderAdmin);
		app.get('/api/admin' + Config.plugin.route, renderAdmin);

		AdminSockets[Config.plugin.id] = Config.sockets;
		PluginSockets[Config.plugin.id] = WoW.sockets;

		Config.global = new Settings(Config.plugin.id, Config.plugin.version, Config.defaults, function() {
			startCron();

			var oldVersion = Config.global.get('version');

			if (oldVersion < Config.plugin.version) {
				Config.global.set('version', Config.plugin.version);
				Config.global.persist(function() {
					Upgrade.doUpgrade(oldVersion, Config.plugin.version, function() {
						callback(null, app, middleware, controllers);
					});
				});
			} else {
				callback(null, app, middleware, controllers);
			}
		});
	};

	WoW.addNavigation = function(custom_header, callback) {
		custom_header.plugins.push({
			route: Config.plugin.route,
			icon: Config.plugin.icon,
			name: Config.plugin.name
		});

		callback(null, custom_header);
	};

	WoW.addRegistrationField = function(req, res, data, callback) {
		var realm = Config.global.get('variables.realm'),
			charHTML = '' +
				'<input class="form-control" type="text" name="' + Config.registrationIds.char + '" id="' + Config.registrationIds.char + '" autocorrect="off" autocapitalize="off" />',

			fields = [
				{
					label: 'WoW information',
					html: '<hr><span class="help-block">If you have a WoW character in the ' + realm + ' realm, please enter your character name.</span>',
					styleName: 'wow'
				},
				{
					label: 'WoW Character',
					html: charHTML,
					styleName: Config.registrationIds.char
				}
			];

		data.regFormEntry = data.regFormEntry.concat(fields);

		callback(null, req, res, data);
	};

	WoW.checkRegistration = function(req, res, userData, callback) {
		var charName = userData[Config.registrationIds.char].trim(),
			realm = Config.global.get('variables.realm'),
			apiKey = Config.global.get('variables.apiKey');

		if (charName.length === 0 || realm === '' || apiKey === '') {
			return callback(null, req, res, userData);
		}

		api.character.guild({
			realm: realm,
			name: charName
		}, function(err, characterResult) {
			if (err || !characterResult.name) {
				return callback("Unknown error", req, res, userData);
			}

			if (characterResult.status && characterResult.reason) {
				return callback(characterResult.reason, req, res, userData);
			}

			userData.wow_name = characterResult.name;
			userData.wow_thumbnail = characterResult.thumbnail;
			userData.wow_class = characterResult.class;
			userData.wow_class_name = Config.classInfo.names[characterResult.class];
			userData.wow_class_color = Config.classInfo.colors[characterResult.class];
			userData.wow_achievement_points = characterResult.achievementPoints;
			userData.wow_realm = characterResult.realm;
			if (characterResult.guild) {
				userData.wow_guild = characterResult.guild.name;
			}

			return callback(null, req, res, userData);
		});
	};

	WoW.userCreated = function(userData) {
		if (userData.wow_guild) {
			var slug = utils.slugify(userData.wow_guild),
				mappedGuilds = JSON.parse(Config.global.get('mappings.guild')),
				mappedGuild = Config.global.get('toggles.guildMappingEnabled') &&
					mappedGuilds.hasOwnProperty(slug);

			if (mappedGuild) {
				Groups.join(mappedGuilds[slug].group, userData.uid, function(err, res) {
					if (!err) {
						winston.info('[' + pjson.name + '] Mapped user ' + userData.username + ' to group ' + mappedGuilds[slug].group + '.');
					}
				});
			}
		}

		if (userData.wow_thumbnail) {
			UserSockets.uploadProfileImageFromUrl(
				{ uid: userData.uid },
				Config.global.get('variables.thumbnailBaseUrl') + userData.wow_thumbnail,
				function(err, url) {}
			);
		}
	};

	WoW.addCustomFields = function(fields, callback) {
		callback(null, fields.concat(Config.userFields));
	};

	WoW.modifyUserData = function(users, callback) {
		var uids = [], index = {}, uid;
		for (var i = 0, l = users.length; i < l; i++) {
			uid = users[i].uid;

			// Don't try to grab wow data for guests, or if wow data is already present for this user
			if (uid != undefined && !users[i]['wow_name']) {
				if (uids.indexOf(uid) === -1) {
					uids.push('user:' + uid);
				}

				if (Array.isArray(index[uid])) {
					index[uid].push(i);
				} else {
					index[uid] = [i];
				}
			}
		}

		if (uids.length > 0) {
			// We get data directly from the DB because other we get an infinite loop
			db.getObjectsFields(uids, Config.userFields.concat('uid'), function(err, result) {
				var cur;
				for (var i = 0, l1 = result.length; i < l1; i++) {
					for (var j = 0, l2 = index[result[i].uid].length; j < l2; j++) {
						cur = index[result[i].uid][j];
						Config.userFields.forEach(function(el) {
							users[cur][el] = result[i][el];
						});
					}
				}

				callback(null, users);
			});
		} else {
			callback(null, users);
		}
	};

	var startCron = function() {
		try {
			cronJob = new cron(Config.global.get('variables.cronPattern'), syncUserData, null, true);
		} catch(ex) {
			winston.error('[' + pjson.name + '] Invalid cron pattern!');
		}
	};

	var syncUserData = function(callback) {
		var realm = Config.global.get('variables.realm'),
			apiKey = Config.global.get('variables.apiKey'),
			thumbnailBaseUrl = Config.global.get('variables.thumbnailBaseUrl'),
			count = 0;

		db.getSortedSetRange('users:joindate', 0, -1, function (err, uids) {
			User.getMultipleUserFields(uids, ['uid', 'wow_name'], function (err, users) {
				async.each(users, function(user, cb) {
					if (user.wow_name) {
						api.character.guild({
							realm: realm,
							name: user.wow_name
						}, function(err, result) {
							if (err) {
								return cb(err);
							}

							if (!result.name) {
								return cb(result);
							}

							User.setUserFields(user.uid, {
								wow_achievement_points: result.achievementPoints,
								wow_thumbnail: result.thumbnail
							}, function(err, res) {
								if (err) {
									return cb(err);
								}

								UserSockets.uploadProfileImageFromUrl(
									{ uid: user.uid },
									thumbnailBaseUrl + result.thumbnail,
									function(err, url) {
										count++;
										cb();
									}
								);
							});
						});
					} else {
						cb();
					}
				}, function(err) {
					if (err) {
						winston.error('[' + pjson.name + '] ' + err);
					}
					winston.info('[' + pjson.name + '] Updated ' + count + ' users.');
					callback(err, count);
				});
			});
		});
	};

	WoW.sockets = {
		syncNow: function(socket, data, callback) {
			User.isAdministrator(socket.uid, function(err, isAdmin) {
				if (isAdmin) {
					syncUserData(callback);
				}
			});
		}
	};

})(module.exports);