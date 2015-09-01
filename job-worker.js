var request = require('request');
var dbWorker = require('./db-worker.js');
//Worker to process jobs
//only including what needs to be exposed to other modules
var jobWorker = {
	startCheckingQueue: function() {
		checkForNewJobs();
	},
	jobQueue: [],
	statusMap: {}
};

function checkForNewJobs() {
	if (jobWorker.jobQueue.length > 0) { //jobs present, start working on jobs
		//Using setImmediate to add to end of node event queue
		//This way it will prioritize incoming POSTs at the expense of the queue growing faster
		setImmediate(function() { processNextJob() });
	} else { //no jobs, keep checking some time later
		setTimeout(function() {checkForNewJobs()}, 1000);
	};
};
function processNextJob() {
	var nextJob = jobWorker.jobQueue.shift();
	requestURL(nextJob);
	jobWorker.statusMap[nextJob.jobId] = "URL Requested";
	checkForNewJobs();
};
/*
Successfully stored job results get removed from status map
Jobs that fail to be stored stay in map with failure status
*/
function requestURL(job) {
	request(job.requestedUrl, function(error, response, body) {
		var jobOutcome, jobResultBody;
		if (!error && response.statusCode == 200) {
			jobOutcome = "success";
			jobResultBody = body;
		} else if (!error) { //Could not retrieve page (paul.com works as an example)
			jobOutcome = "failure";
			jobResultBody = "Requested server responded with error \n"+body;
		} else { //error with request
			jobOutcome = "failure";
			jobResultBody = error.toString();
			console.log(error.toString());
		};
		dbWorker.saveJobResults(job.jobId, jobOutcome, jobResultBody)
		.then(function(result) {
			clearJobFromMap(job.jobId);
		}).fail(function(err) {
			updateJobStatus(job.jobId, "Failed - " + err.message);
		});
	});
}

function clearJobFromMap(jobId) {
	console.log("Job " + jobId + " complete. Removed from status map.")
	delete jobWorker.statusMap[jobId];
};
function updateJobStatus(jobId, status) {
	console.log("Job " + jobId + " failed. " + status + ". Status updated in map.");
	jobWorker.statusMap[jobId] = status;
};

var exports = module.exports = jobWorker;