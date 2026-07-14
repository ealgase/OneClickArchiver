const http = require('http');
const fs = require('fs');

http.createServer((req, res) => {
  if (req.url === '/OneClickArchiver.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript' });
    fs.createReadStream('./OneClickArchiver.js').pipe(res);
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
}).listen(8080);