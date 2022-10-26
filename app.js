const PORT = process.env.PORT || 4500;

var express = require('express');
var app = express();
var path = require('path');
var server = require('http').Server(app);

// Routing
app.use(express.static(path.join(__dirname, 'public')));

app.get("/", (request, response) => {
  response.sendFile(path.join(__dirname, 'public/index.html'));
});

server.listen(PORT, () => {
  console.log('Server listening at port %d', PORT);
});
