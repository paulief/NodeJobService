var express = require('express');
var cors = require('cors'); //Only needed in test environment to bypass cross-origin restrictions
var bodyParser = require('body-parser');
var shortId = require('shortid');
var request = require('request');
var Q = require('q');
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
		//need to parse/validate URL
		request(job.requestedUrl, function(error, response, body) {
			if (!error && response.statusCode == 200) {
				dbWorker.saveJobResults(job.jobId, "success", body);
			} else if (!error) { //Could not retrieve page

			} else { //error with request

			};
		});
	}
};

var dbWorker = {
	saveJobResults: function(jobId, jobOutcome, jobResultBody) {
		var insertSql = 'INSERT INTO jobs.job_results (job_id, job_outcome, job_result_body) VALUES ($1,$2,$3)';
		pg.connect(pgConnString, function(err, client, done) {
			if (err) {
				console.log(err);
			} else {
				client.query(insertSql, [jobId, jobOutcome, jobResultBody], function(err) {
					done(); //free the db the connection
					if (err) {
						console.log(err);
					} else {
						statusMap[jobId] = "Complete"; //keeping it in for now. will remove
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
				console.log(err);
			} else {
				var query = client.query(selectSql, [jobId], function(err) {
					if (err) {
						console.log(err);
					};
				});
				query.on('row', function(row) { //will only return one row
					results.jobOutcome = row.job_outcome;
					results.jobResultBody = row.job_result_body;
				});
				query.on('end', function() {
					done(); //free the connection
					console.log("query results - " + results);
					deferred.resolve(results);
				});
			};
		});

		return deferred.promise;
	}
}

//Route for taking job requests
app.post('/jobs', function(req, res) {

	var requestedUrl = req.body.url;
	console.log(requestedUrl);
	//validate URL? could be done on client side

	var jobRequest = {
		jobId: shortId.generate(),
		requestedUrl: requestedUrl
	};
	jobQueue.push(jobRequest);
	statusMap[jobRequest.jobId] = "In Progress";
	console.log('Job added to queue. Job ID = ' + jobRequest.jobId);
	res.status(200).send(jobRequest.jobId);
	jobWorker.processNextJob();
});

//route for checking job status and getting results
app.get('/jobs/:jobId', function(req, res) {
	var jobId = req.params.jobId;
	if (statusMap[jobId] === "Complete") { //job complete, retrieve results
		dbWorker.getJobResults(jobId).then(function(jobResults) {
			res.json(jobResults);
			console.log(jobResults);
		});
	} else if (!statusMap[jobId]) { //job doesn't exist

	} else { //send job status
		res.status(200).send({jobStatus: statusMap[jobId]});
	}
});