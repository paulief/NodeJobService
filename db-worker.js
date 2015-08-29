var Q = require('q');
//DB SETUP
var dbConfig = require('config').get('Jobs.dbConfig');
var pg = require('pg');
var pgConnString = 'postgres://'+dbConfig.username+':'+dbConfig.password+'@'+dbConfig.host+':'+dbConfig.port+'/'+dbConfig.dbName;
var dbWorker = {
	saveJobResults: function(jobId, jobOutcome, jobResultBody) {
		var insertSql = 'INSERT INTO jobs.job_results (job_id, job_outcome, job_result_body) VALUES ($1,$2,$3)';
		var deferred = Q.defer();
		pg.connect(pgConnString, function(err, client, done) {
			if (err) {
				console.log(err.message);
				deferred.reject({error:"Connection failed", message: "Could not connect to DB"});
			} else {
				client.query(insertSql, [jobId, jobOutcome, jobResultBody], function(err) {
					done(); //free the db the connection
					if (err) {
						console.log(err.message);
						deferred.reject({error: "Storage failed", message: "Could not store results in DB"});
					} else { //job saved successfully
						console.log("Job " + jobId + " added to database");
						deferred.resolve("Job Completed");
					};
				});
			};

		});
		return deferred.promise;
	},
	getJobResults: function(jobId) {
		var selectSql = 'SELECT job_outcome, job_result_body FROM jobs.job_results WHERE job_id = $1';
		var results = {};
		var deferred = Q.defer();
		pg.connect(pgConnString, function(err, client, done) {
			if (err) {
				console.log(err.message);
				deferred.reject({error:"Connection failed", message: "Could not connect to DB"});
			} else {
				var query = client.query(selectSql, [jobId], function(err) {
					if (err) {
						console.log(err.message);
						deferred.reject({error: "Retrieval failed", message: "Could not get results from DB"});
					};
				});
				query.on('row', function(row) { //will only return one row
					results.jobOutcome = row.job_outcome;
					results.jobResultBody = row.job_result_body;
				});
				query.on('end', function() {
					done(); //free the connection
					if (!results.jobOutcome) { //no rows returned
						deferred.reject({error: "Job doesn't exist", message: "Job could not be found, check ID"})
					} else {
						deferred.resolve(results);
					};
				});
			};
		});

		return deferred.promise;
	}
};

var exports = module.exports = dbWorker;