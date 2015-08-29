var express = require('express');
var cors = require('cors'); //Only needed in test environment to bypass cross-origin restrictions
var bodyParser = require('body-parser');
var shortId = require('shortid');
var request = require('request');
var Q = require('q');
var validUrl = require('valid-url');
//DB SETUP
var dbConfig = require('config').get('Jobs.dbConfig');
var pg = require('pg');
var pgConnString = 'postgres://'+dbConfig.username+':'+dbConfig.password+'@'+dbConfig.host+':'+dbConfig.port+'/'+dbConfig.dbName;
console.log(pgConnString);

//Set up Express
var app = express();
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

var server = app.listen(3030, function () {
  var host = server.address().address;
  var port = server.address().port;

  console.log('JobService app listening at http://%s:%s', host, port);
});

//Using simple array for queue
var jobQueue = [];
//map of job IDs and statuses since jobs are removed from queue as they are processed
var statusMap = {};

//Worker to process jobs 
//(only need one? since node is single thread. could run one node for incoming jobs and one for processing)
var jobWorker = {
	processNextJob: function() {
		var nextJob = jobQueue.shift();
		this.requestURL(nextJob);
		statusMap[nextJob.jobId] = "In Progress";
	},
	requestURL: function(job) {
		request(job.requestedUrl, function(error, response, body) {
			if (!error && response.statusCode == 200) {
				dbWorker.saveJobResults(job.jobId, "success", body);
			} else if (!error) { //Could not retrieve page
				dbWorker.saveJobResults(job.jobId, "failure", "Requested server responded with error \n"+body);
			} else { //error with request
				dbWorker.saveJobResults(job.jobId, "failure", error);
			};
		});
	}
};

var dbWorker = {
	saveJobResults: function(jobId, jobOutcome, jobResultBody) {
		var insertSql = 'INSERT INTO jobs.job_results (job_id, job_outcome, job_result_body) VALUES ($1,$2,$3)';
		pg.connect(pgConnString, function(err, client, done) {
			if (err) {
				console.log(err.message);
				statusMap[jobId] = "Error connecting to database";
			} else {
				client.query(insertSql, [jobId, jobOutcome, jobResultBody], function(err) {
					done(); //free the db the connection
					if (err) {
						console.log(err.message);
						statusMap[jobId] = "Error storing results in database";
					} else { //job saved successfully
						delete statusMap[jobId]; //remove from statusMap so it doesn't grow endlessly
						console.log('Job ' + jobId + ' added to database');
					};
				});
			};

		});
	},
	getJobResults: function(jobId) {
		var selectSql = 'SELECT job_outcome, job_result_body FROM jobs.job_results WHERE job_id = $1';
		var results = {};
		var deferred = Q.defer();
		pg.connect(pgConnString, function(err, client, done) {
			if (err) {
				console.log(err.message);
				deferred.reject({error:"Connection failed", message: err.message})
			} else {
				var query = client.query(selectSql, [jobId], function(err) {
					if (err) {
						console.log(err.message);
						deferred.reject({error: "Retrieval failed", message: err.message});
					};
				});
				query.on('row', function(row) { //will only return one row
					console.log("found row");
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

//Route for taking job requests
app.post('/jobs', function(req, res) {
	var requestedUrl = req.body.url;
	if (!validUrl.isUri(requestedUrl)) { //valud URL check
		res.status(403).send({error: "Bad URL", message: "Please provide a valid URL"});
	} else {
		var jobRequest = {
			jobId: shortId.generate(),
			requestedUrl: requestedUrl
		};
		jobQueue.push(jobRequest);
		statusMap[jobRequest.jobId] = "In Progress";
		console.log('Job added to queue. Job ID = ' + jobRequest.jobId);
		res.status(200).send(jobRequest.jobId);
		jobWorker.processNextJob();
	}
});

//route for checking job status and getting results
app.get('/jobs/:jobId', function(req, res) {
	var jobId = req.params.jobId;
	if (!statusMap[jobId]) { //job complete or doesn't exist
		dbWorker.getJobResults(jobId)
		.then(function(jobResults) {
			res.json(jobResults);
		}).fail(function(err) {
			res.json(err);
		});
	} else { //send job status
		res.status(200).send({jobStatus: statusMap[jobId]});
	}
});