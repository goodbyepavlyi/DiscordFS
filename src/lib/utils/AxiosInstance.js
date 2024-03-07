const axios = require("axios").default;
const axiosRetry = require("axios-retry").default;

const axiosClient = axios.create();
axiosRetry(axiosClient, { retries: 3 });

module.exports = axiosClient;