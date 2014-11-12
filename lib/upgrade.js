(function(Upgrade) {

	var User = module.parent.parent.require('./user'),
		db = module.parent.parent.require('./database'),

		winston = module.parent.parent.require('winston');

	Upgrade.doUpgrade = function(oldVersion, newVersion, callback) {
		callback();

		function done() {
			winston.info('[' + pjson.name + '] Upgraded from ' + oldVersion + ' to ' + newVersion);
			callback();
		}

		function error() {
			winston.info('[' + pjson.name + '] No upgrade performed, old version was ' + oldVersion + ' and new version is ' + newVersion);
			callback();
		}
	};

})(module.exports);