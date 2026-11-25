// Local development entry: serves the API and, when built, the React client.
const path = require('path');
const fs = require('fs');
const express = require('express');
const app = require('./app');
const config = require('./core/config');

const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.listen(config.port, () => {
  console.log(`Fanni API listening on http://localhost:${config.port}`);
});
