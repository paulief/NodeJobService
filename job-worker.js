var request = require('request');
var dbWorker = require('./db-worker.js');
//Worker to process jobs
var jobWorker = {
	processNextJob: function() {
		var nextJob = this.jobQueue.shift();
		this.requestURL(nextJob);
		this.statusMap[nextJob.jobId] = "In Progress";
	},
	/*
	Successfully stored job results get removed from status map
	Jobs that fail to be stored stay in map with failure status
	*/
	requestURL: function(job) {
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
	},
	jobQueue: [],
	statusMap: {}
};

function clearJobFromMap(jobId) {
	console.log("Job " + jobId + " complete. Removed from status map.")
	delete jobWorker.statusMap[jobId];
};
function updateJobStatus(jobId, status) {
	console.log("Job " + jobId + " failed. " + status + ". Status updated in map.");
	jobWorker.statusMap[jobId] = status;
};

var exports = module.exports = jobWorker;