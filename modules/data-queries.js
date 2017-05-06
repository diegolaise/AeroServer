//===========================================================================
// 
//							GENERAL DATA QUERIES
// 
//==========================================================================*/
"use strict";

var mongoose = require('mongoose');
var textSearch = require('mongoose-text-search');

var fs = require('fs');
var lib_path = require('path');
var escapere = require('escape-regexp');
var mime =  require('mime');

var utils = require('./utils.js');
var tree = require('./tree-info.js');


//-- Database connection ////////////////////////////////////////////////////////

var db_ip   = 'localhost'; //TODO : set ip of the database
var db_name = 'Aero';
var db_port =  8000;
//var db_port =  27017;

mongoose.set('debug', false);
mongoose.Promise = global.Promise;

var connection = mongoose.createConnection('mongodb://'+db_ip+':'+db_port+'/'+db_name 
		, { server: {socketOptions: {socketTimeoutMS: 0, connectionTimeout: 0}} }
);
connection.on('error', console.error.bind(console, 'db connection error:'));
connection.once('open', function callback() {
	console.log('Use Mongodb : ' + db_ip + ":" + db_port);
    console.log('Connection to the database: OK');
});

// Destroy the connection when the app is closed
process.on('SIGINT', function () {
    mongoose.connection.close(function () {
        console.log('Mongoose default connection disconnected through app termination');
        process.exit(0);
    });
});

//-- Database SCHEMAS ////////////////////////////////////////////////////////////

/** User */
var userSchema = new mongoose.Schema(
	{
	    "firstname" : String,
	    "lastname"  : String,
	    "email"     : String,
	    "userid"    : String,
	    "password"  : String,
	    "role"      : String
	}	
);
userSchema.index({ userid : 'userid' });
var UserModel = connection.model('Users', userSchema, 'Users');

/** Projects */ //{type: String, index: true}
var dataSchema = new mongoose.Schema(
	{  'href'		: String  
	 , 'mimeType'	: String
	 , 'owner'		: String
	 , 'creation_date': Date
	 , 'version'	: Number
	 , 'isActive'	: Boolean
	 , 'filepath' 	: String    
	 , 'comment'	: String
	 , 'properties' : Array
	 , 'links' 		: Array
	}	
);
dataSchema.index({ href : 'href' });
var DataModel = connection.model('Projects', dataSchema, 'Projects');
//db.getCollection('Datas').createIndex({ "links.href" : 1});

//-- INIT DATABASE //////////////////////////////////////////////

var _Datas = [];
var _ID = 0;
var _TimeId;

function saveData(djson) {
	if (djson) {
		//djson.id = ++_ID;
		_Datas.push(djson);
		
		if (! _TimeId) {
			saveData();
		}
	}	
	else if (_Datas.length>0) {
		var json = _Datas.shift();
		
		var data = new DataModel(json);
		data.save(function(err) {
			if (err) {
				console.log("ERROR saving: " + err);
			}
			else {
				console.log( (++_ID) + " Saved Successfully");
				_TimeId = setTimeout(function(){saveData();}, 6000);
			}
		});
	}
	else {console.log("__Stop save__" +_ID);}
}
//Remove field __v : update({}, {$unset: {__v:1}} , {multi: true});
/// Insert datas
//utils.createDocuments(__dirname + '/../../AeroDatas/Projects', saveData);

// INTERNAL FUNCTION //////////////////////////////////////////////

/** Get data info */
function getDataInfos(href, json, l_direction, callback) {

	var jDataInfos = {};
	
	try {	 
		var op = utils.parseHref(href);
		 
		//Path 
		jDataInfos.path = href;
		
		//LABEL
		jDataInfos.label = op.label; 
		
		//VERSION
		jDataInfos.version = op.version;
		
		//FILE path for opening
		jDataInfos.filepath = json.filepath;
		jDataInfos.mimeType = jDataInfos.mimeType;
				
 		//All others versions
		var spath = op.filepath; //utils.escapeRegExp(op.filepath); 
		
		//- PROPERTIES (metadata)
		jDataInfos.metadata = {}; 

		//- CHILDREN
		jDataInfos.children = [];
		
		//- PARENTS 
		jDataInfos.parent = [];
		
		if (json) {
			//Get properties
			for (var x=0; x<json.properties.length; x++) {
				var p = json.properties[x];
				if ( ! jDataInfos.metadata[p.name] ){
					jDataInfos.metadata[p.name] = p.value;
				}
			}
			
			//Get parent/child
			for (var k=0; k<json.links.length; k++) {
				var lnk = json.links[k];	
				var lpath = lnk.href;
				
				if ( !utils.skipPath(lpath) ) {		
					if (lnk.is_child && (l_direction==="both" || l_direction==="child" || l_direction==="children")) {
						jDataInfos.children.push(lpath);
					}
					if (!lnk.is_child && (l_direction==="both" || l_direction==="parent")) {
						jDataInfos.parent.push(lpath);
					}
				}
			} 
		}
		
		//Read all versions
		jDataInfos.versions = [];  	
		DataModel.find({'href': new RegExp('^'+spath+'\\?ver=?', "i")}, {version: 1, _id: 0}, function(err, jres) { 
			if (err) {
				console.log(' getDatasInfos error: ' + JSON.stringify(err, null, 4) ); 
				jDataInfos.versions.push("1"+op.version);
			} 
			else { 
				for (var i = 0; i< jres.length; i++) {
					jDataInfos.versions.push(jres[i].version);
				}   
				jDataInfos.versions.sort();
			}
			if (callback) {
				callback(jDataInfos);
			}
		});
		 
	} catch (ee) {
		console.log("ERROR getDataInfos: " + ee);
		if (callback) {
			callback(jDataInfos);
		}
	}
}

/** Get Properties (metadata) for db */
function getProperties(href, callback) {
	var jMetadata = {};
	
	DataModel.findOne({'href' : href}, function(err, docs) {
		if (!err && docs) {
			var props = docs._doc;
			for (var x=0; x<props.properties.length; x++) {
				var p = props.properties[x];
				
				if (!p.value && p.name === "From process") {
					p.value = "NONAME";
				}
				//Ne pas ecraser les valeurs en cas de doublons
				if ( !jMetadata.hasOwnProperty(p.name) || !jMetadata[p.name]) {
					jMetadata[p.name] = p.value;
				} 
			}
		}
		if (! (jMetadata.Type)) {		
			//Failed to get metadata Type : Order by Extension
			var o = utils.parseHref(href);
	
			var fname = o.label;
			var i = fname.lastIndexOf(".");
			if (i>0) {
				var ext = fname.substring(i+1);
				jMetadata.Type = ext;
			}
		}		
		callback(jMetadata);
	}); 
}

/**
 * Read links (Parent/Child)
 */
function readLinks(lnk_direction, jData, jResults, callback) {

	// Read data from db 
	var nextLinkInfos = function (tabLinks, endLinkHandler) {
		
 		if (!tabLinks || tabLinks.length===0) {
 			console.log(" End read link " + lnk_direction);
			if (endLinkHandler) {
				endLinkHandler();
			}
		}
		else {
			//Remove first element
			var path = tabLinks.shift();
			console.log(" Read link " + lnk_direction + ": " + path);
			
			if (utils.skipPath(path)) { 
				nextLinkInfos(tabLinks, endLinkHandler);			
			}
			else {
				//Read info
				DataModel.findOne({href: path}, function(err, docs) {
					
					var json = {};
					if (err) {
						console.log('readLinks '+ path + ' error: ' + JSON.stringify(err, null, 4) );
					} 
					else if (docs) {
						json = docs._doc;
					}
		
					//Get informations for this path of this level
					getDataInfos(path, json, lnk_direction, function(jDataInfo) {	
						if (jDataInfo) {
							jResults.push(jDataInfo);
						}
						//Read next
						nextLinkInfos(tabLinks, endLinkHandler);
					});
				});	
				
			}//end else buserSkip
		} //end else jlink
	}; //end function

	//Get list of link
	if (jData[lnk_direction]) {
		//clone array
		var tab = jData[lnk_direction].slice();
		nextLinkInfos(tab, callback); 
	} 
	else if (callback) {
		callback();
	}
	else {
		return {};
	}
}

//API ////////////////////////////////////////////////////////////////////////

/** Connect user (login) */
exports.connectUser = function (req, res) {
	console.log('-> Connect : ' + req.query );
	UserModel.findOne( {userid: req.query.userid, password: req.query.password}
			, function(err, docs) {
				if (err) {
					console.log('connectUser error: ' + JSON.stringify(err, null, 4) );
					res.status(500).send(err.data);
				} 
				else {
					//console.log('connectUser : ok'); // + JSON.stringify(docs, null, 4) );
					res.send(docs);
				}
	        });
};
 
/** Save data to database Project collection */
exports.insertFile = function (req, res) {
	var json = req.param.jdata;
	var data = new DataModel(json);
	data.save(function(err) {
		if (err) {
			console.log("ERROR saving: " + err);
			req.send({success: false, error: err});
		}
		else {
			console.log(data.id + " Saved Successfully");
			req.send({success: true});
		}
	});
};

/** Load data with properties */
exports.getDatas = function(req, res) {
	var path 	= req.params.filepath;
	console.log("\nCall getDatas: " + path); 
	
	//Get metadata per versions
	var o = utils.parseHref(path);
	var filepath = o.filepath;
	var jResults = []; 
	
	//
	// Send response callback
	// 
	function sendResponse() { 
		res.send({ data : jResults });
	}
	
	//--
	// Callback when end getDataInfos
	//--
	var dataInfoDone = function(jData) {
		
		//Get all others versions
		jData.metaByVersion = {}; 
 
		// Read Properties of each version (for metadataByVersion)
		var tabVersion = jData.versions.slice(); 
		
		//--
		// Read Properties of each version (for metadataByVersion)
		//-- 
		function nextProperties() { 
			//Read current version
			var curVersion = ("" + tabVersion.shift());
			
			//--
			//End get properties for versions
			//--
			var endGetProperties = function(jMeta) { 
				
				jData.metaByVersion[curVersion] = jMeta;
				
				if (tabVersion.length>0) {
					nextProperties();
				}
				else {
					//Append result
					jResults.push(jData);
					
					//Continue ... read Links
					//mongoose.set('debug', true);
					readLinks("parent", jData, jResults, function() {
						//console.log("End get parent ..."); 
						if (jData.children.length>0) { 
							readLinks("children", jData, jResults, sendResponse);
						}
						else {
							sendResponse();
						}
					});
				} 
			}; //endGetProperties
			
			if (curVersion !== jData.version) {
				getProperties(filepath+"?ver="+curVersion, endGetProperties); 
			}
			else {
				endGetProperties(jData.metadata);
			}
		} //End nextProperties
		
		//-- Call next property
		nextProperties();
		
	}; //end dataInfoDone
	
	//--
	// Get the data from db
	//--
	DataModel.findOne({href: path}, {_id: 0}, function(err, json) {
		if (err) {
			console.log(' getDatas error: ' + JSON.stringify(err, null, 4) );
			res.status(500).send(err.data);
		} 
		else {
			/// Get data informations
			//console.log('getDatas Ok: ' + JSON.stringify(json, null, 4) );
			getDataInfos(path, json, "both", dataInfoDone);
		}
    });//end findOne
	
}; //end getDatas

/** Get Entry Node Information */
exports.getEntryInfo = function(request, response) {
	
	var p = request.params.path;
	var tdata = [];
	if (utils.isArray(p)) {
		tdata  = p;
	}
	else if (p.indexOf(",")<0){
		tdata.push(p);
	}
	else {
		tdata = p.split(",");
	}
	
	var l_direction = request.params.lnkdir; 
	if (!l_direction || utils.isEmpty(l_direction)) {
		l_direction = "both";
	}
	
	var jResults = [];  
 
	//-
	//	Read data from db
	//-
	function readData(path) {
		//Callback function
		var nextData = function(json) { 
			if (json) {
				jResults.push(json);
			} 
			if ( tdata.length === 0) {
				//end Request
				response.send({"data": jResults});
			}
			else { 
				//Next data 
				var sPath = tdata.shift();
				readData(sPath);
			}
		};

		if (utils.skipPath(path)) { 
			nextData();
		}
		else {
			DataModel.findOne({href: path}, function(err, docs) {
				if (err) {
					console.log('getEntryInfo error: ' + JSON.stringify(err, null, 4) );
					//response.status(500).send(err.data);
					nextData();
				} 
				else { 
					getDataInfos(path, docs, l_direction, nextData);
				}
			});//end findOne
		}
	}
	
	//Launch
	var sPath = tdata.shift();
	readData(sPath);
	
}; //end getEntryInfo

///--- TREE HANDLER //////////////////////////////////////////////////////

/** Get TREE nodes */
exports.getTreeDatas = function(request, response) {

	//Root Path
	var path = request.params.path;
	var sPathUri = path;
	if (!sPathUri) {
		response.status(500).send({responseText : "No search 'root path' parameter was given"});
	}

	//Check if get folder only (ex: for study root)
	var bfoldOnly = false;
	var sFolderOnly = request.params.folder;
	if (sFolderOnly && sFolderOnly==="true") {
		bfoldOnly = true;
	}

	var rLevel = 1; //root level
	var sLevel = request.params.level;	
	if (sLevel) {
		rLevel = Number(sLevel);
	}
	
	if (! sPathUri.endsWith("/")) {
		sPathUri += "/";
	}
	else {
		path = path.substring(0, path.length -1);
	}

	//Get all active files
	DataModel.find({isActive : true, href: new RegExp('^'+sPathUri+'*', "i") }, {href:1, filepath:1, _id: 0})
	.sort({ href: 1 }) //sort by href asc
	.exec(function(err, docs) {
		if (err) {
			response.status(500).send(err.data);
		}
		else {
			/// Send results roots
			var results = tree.parseNode(docs, path, bfoldOnly, rLevel); 
			//console.log("Tree: " + JSON.stringify(results, null, 4));
			response.send({ data: results });
		}
	});
}; //end getTreeNodes

///--- FS FILE HANDLER //////////////////////////////////////////////////////

/** Get fs list files of directory */
exports.getListFiles = function(request, response) {
	var folder = request.params.path;
	var dir = lib_path.normalize(__dirname + '/../../AeroDatas/' + folder);
	
	try {
		if (fs.statSync(dir)) { // or fs.existsSync 
			
			// Read the directory
			fs.readdir(dir, function (err, list) {
				var tabf = [];
				for (var i=0; i<list.length; i++) {
					var file = list[i];
					var fpath = lib_path.normalize(dir + lib_path.sep + file);
					var stats = fs.statSync(fpath);
					// If the file is a directory
					if (stats && stats.isFile()) {
						tabf.push(file);
					}
				}
				
				response.send({data: tabf});
			});
		}  
	} catch (err) {
		response.send({data:[]});
	} //end try 
};

/** Remove fs files */
exports.removeFiles = function(request, response) {
	var p= request.params.path;
	
	var tpath  = [];
	if (utils.isArray(p)) {
		tpath  = p;
	}
	else if (p.indexOf(",")<0){
		tpath.push(p);
	}
	else {
		tpath = p.split(",");
	}
	
	var success = true;
	
	function removeFile() {
		if (tpath.length === 0) {
			response.send(success);
		}
		else {
			var file = tpath.shift();
			var filePath = lib_path.normalize(__dirname + '/../../AeroDatas/' + file);
			
			try {
				if (fs.statSync(filePath)) {  
					fs.unlinkSync(filePath);
				}  
			} catch (err) {
				success = false;
			} //end try 
			removeFile();
		}
	}
	removeFile();
};

exports.getFile = function(req, response) {
	var path = req.params.path;
	
	var fname= lib_path.basename(path);
	var mimeType = mime.lookup(fname);
 
	var filePath = lib_path.normalize(__dirname + '/../../AeroDatas/' + path);
	fs.readFile(filePath, function(error, content) {
		if (error) {
			response.writeHead(500);
			response.end();
		}
		else {
			response.writeHead(200, {'Content-Type': mimeType});
			response.end(content, 'utf-8');
		}
	});
};

 
