const express = require('express');
const weddingApp = require('./server/app').app;

const app = express();
app.use(weddingApp);

module.exports = app;
