/** SERVER */
var express = require('express');
var cors    = require('cors');
var api     = require('./modules/data-queries.js');

var app = express();
app.use(cors());
app.use(function(req, res, next) {
	res.header("Access-Control-Allow-Origin", "*");
	res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
	next();
});

console.log('Server starting..');
//app.use(express.static(__dirname + '/modules'));
app.use(express.static(__dirname + '/../AeroClients'));
app.use(express.static(__dirname + '/../AeroDatas'));

//Authentication
app.get('/api/authenticate', api.connectUser);
//Get data info
app.get('/getDatas/:level/:filepath', api.getDatas);
app.get('/getEntry/:path/:lnkdir', api.getEntryInfo);
app.get('/getListFiles/:path', api.getListFiles);
app.get('/removeFiles/:path', api.removeFiles);
app.get('/getTreeDatas/:path/:folder/:level', api.getTreeDatas);

app.set('port', process.env.PORT || 81);
app.listen(app.get('port'));
console.log('Server started at : ' + app.get('port'));