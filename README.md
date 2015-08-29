# NodeJobService
Simple node.js API to accept jobs and provide job status and results

This API accepts POSTs with a URL that the user requests. It queues a job to retrieve that URL, and responds with a job ID. The user can then retrieve the job status/results by sending a GET request with the job ID. If the job is complete, they will receive the HTML of the requested URL.

The node server stores job results in a Postgres database hosted in AWS. An example config file for configuring the DB connection is included (to use your own, create a config directory and create default.json there). The server is currently running at http://54.69.152.172:3030 and should be responding to requests there.

The API endpoints are documented below:

**Creating a New Job**
* **URL**

  /jobs
* **Method**

  POST
  
* **Data Params**

  `url=[string]`
  
* **Success Response:**

  * **Code:** 200 <br />
    **Content:** `job ID`
    
* **Error Response:**

  * **Code:** 403 BAD REQUEST <br />
    **Content:** `{error: "Bad URL", message: "Please provide a valid URL"}``
    
**Retrieving Job Status/Results**
* **URL**

  /jobs/:jobId
* **Method**

  GET

* **URL Params**

  `jobId=[string]`
  
* **Success Response:**

  **Content:** `{jobOutcome: success | failure, jobResultBody: result body}`
  
* **Error Response:**

  **Content:** `{error: "Job doesn't exist", message: "Job could not be found, check ID"}`
