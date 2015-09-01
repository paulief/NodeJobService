var express = require('express');
var cors = require('cors'); //Only needed in test environment to bypass cross-origin restrictions
var bodyParser = require('body-parser');
var shortId = require('shortid');
var validator = require('validator');
var jobWorker = require('./job-worker.js');
var dbWorker = require('./db-worker.js');

//Set up Express
var app = express();
//app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

var server = app.listen(3030, function () {
  var host = server.address().address;
  var port = server.address().port;

  console.log('JobService app listening at http://%s:%s', host, port);
});

jobWorker.startCheckingQueue();

//Route for taking job requests
app.post('/jobs', function(req, res) {
	var requestedUrl = req.body.url;
	if (!validator.isURL(requestedUrl)) { //valid URL check
		res.status(403).send({error: "Bad URL", message: "Please provide a valid URL"});
	} else {
		requestedUrl = checkForProtocol(requestedUrl);
		var jobRequest = {
			jobId: shortId.generate(),
			requestedUrl: requestedUrl
		};
		jobWorker.jobQueue.push(jobRequest);
		jobWorker.statusMap[jobRequest.jobId] = "In Queue";
		console.log('Job added to queue. Job ID = ' + jobRequest.jobId);
		res.status(200).send(jobRequest.jobId);
	};
});
function checkForProtocol(url) {
	if (!/^(?:f|ht)tps?\:\/\//.test(url)) {
		url = 'http://' + url;
		return url;
	} else {
		return url;
	};
};

//route for checking job status and getting results
app.get('/jobs/:jobId', function(req, res) {
	var jobId = req.params.jobId;
	if (!jobWorker.statusMap[jobId]) { //job complete or doesn't exist
		dbWorker.getJobResults(jobId)
		.then(function(jobResults) {
			res.json(jobResults);
		}).fail(function(err) {
			res.json(err);
		});
	} else { //send job status
		res.status(200).send({jobStatus: jobWorker.statusMap[jobId]});
	}
});