/**===========================================================================
 * 
 * 							GENERAL QUERIES
 * 
 * ==========================================================================*/
"use strict";

var mongoose = require('mongoose');
var textSearch = require('mongoose-text-search');

//var fs = require('fs');
var lib_path = require('path');
var utils = require('./utils.js');
var escapere = require('escape-regexp');

//-- Database connection ////////////////////////////////////////////////////////

var db_ip   = 'localhost'; //TODO : set ip of the database
var db_name = 'Aero';

mongoose.set('debug', false);
mongoose.Promise = global.Promise;

var connection = mongoose.createConnection('mongodb://'+db_ip+'/'+db_name 
		, { server: {socketOptions: {socketTimeoutMS: 0, connectionTimeout: 0}} }
);
connection.on('error', console.error.bind(console, 'db connection error:'));
connection.once('open', function callback() {
	console.log('Use Mongodb : ' + db_ip);
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

/** Json properties */
function getJsonProps() {
	return 	{ "Version"		: ""
			, "From tool"	: "Property"
			, "From process": "EMPTY"
			, "Description" : ""
			, "Type" 		: ""
			, "Data Origin" : ""
			, "Status" 		: ""
			, "Study Type" 	: ""
			, "Aircraft" 	: ""
			, "Program" 	: ""
			, "Creation version" : ""
			};
}


/** Skip USER folder */
function bUserSkipped(spath) {
	if (!spath || ! (''+spath).trim()) {return true;}
	var sPath = (""+spath).toUpperCase();
	sPath = sPath.trim();
	if  (sPath.indexOf("/99-USERS/")>0 || sPath.indexOf("/99_USERS/")>0 || sPath.indexOf("/USERS/")>0) {
			return (sPath.indexOf("/TRASH/")>=0);
	}
	return false;
}



/** Get data info */
function getDataInfos(href, docs, l_direction, callback) {

	var jDataInfos = {};
	
	try {	 
		var op = utils.parseHref(href);
		 
		//Path 
		jDataInfos.path = href;
		
		//LABEL
		jDataInfos.label = op.label; 
		
		//VERSION
		jDataInfos.version = op.version;
		
 		//All others versions
		var spath = op.filepath; //utils.escapeRegExp(op.filepath); 

		//- PROPERTIES (metadata)
		jDataInfos.metadata = getJsonProps();

		//- CHILDREN
		jDataInfos.children = [];
		
		//- PARENTS 
		jDataInfos.parent = [];
		
		if (docs) {
			//Get properties
			for (var x=0; x<docs.properties.length; x++) {
				var p = docs.properties[x];
				jDataInfos.metadata[p.name] = p.value;
			}
			//Get parent/child
			for (var k=0; k<docs.links.length; k++) {
				var lnk = docs.links[k];	
				var lpath = lnk.href;
				if ( !bUserSkipped(lpath)) {		
					if (lnk.is_child && (l_direction==="both" || l_direction==="child")) {
						jDataInfos.children.push(lpath);
					}
					if (!lnk.is_child && (l_direction==="both" || l_direction==="parent")) {
						jDataInfos.parent.push(lpath);
					}
				}
			} 
		}
		
		jDataInfos.versions = [];  	
		DataModel.find({'href': new RegExp('^'+spath+'\\?ver=?', "i")}, {version: 1, _id: 0}, function(err, jres) { 
			if (err) {
				console.log('getDatasInfos error: ' + JSON.stringify(err, null, 4) ); 
				jDataInfos.versions.push("1");
			} 
			else { 
				for (var i = 0; i< jres.length; i++) {
					jDataInfos.versions.push(jres[i].version);
				}   
			}
			if (callback) {
				callback(jDataInfos);
			}
		});
		 
	} catch (ee) {}
	
//	if (callback) {
//		callback(jDataInfos);
//	}
//	return jDataInfos;
}

/** Get Properties (metadata) for db */
function getProperties(href, callback) {
	var jMetadata = getJsonProps();
	DataModel.findOne({'href' : href}, function(err, docs) {
		if (!err && docs) {
			var props = docs._doc;
			for (var x=0; x<props.properties.length; x++) {
				var p = props.properties[x];
				
				if (!p.value && p.name === "From process") {
					p.value = "NONAME";
				}
				jMetadata[p.name] = p.value;
			}
		}
		else {			
			//Failed to get metadata : Order by Extension
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
 * Read ancestors (Parent/Child) cascade
 */
function getLinks(iLevel, lnkName, jData, jResults, isChild, callback) {
	//End cascade
	if (iLevel === 0) {
		callback();
		return;
	}
	
	// Read data from db 
	function getLinkInfos(lvl, jLinks) {
		if (!jLinks || jLinks.length===0) {
			if (callback) {
				callback();
			}
		}
		else {
			//Remove first element
			var path = jLinks.splice(0, 1)[0];
			//console.log("Path " + path);
			if (bUserSkipped(path)) { 
				getLinkInfos(lvl, jLinks);			
			}
			else {
				
				DataModel.findOne({href: path}, function(err, docs) {
					var il = lvl - 1;
					var json = {};
					if (err) {
						console.log('find '+ path + ' error: ' + JSON.stringify(err, null, 4) );
						docs = null;
					} 
					else {
						json = docs._doc;
					}
		
					//Get informations for this path of this level
					getDataInfos(path,json, isChild, function(jDataInfo) {
		
						if (jDataInfo) {
							jResults.push(jDataInfo);
						}
		
						//Recusrsive read ancestor
						getLinks(il, lnkName, jDataInfo, jResults, isChild, function() {
							getLinkInfos(il, jLinks);
						});
					});
				});	
				
			}//end else buserSkip
		} //end else jlink
	} //end function

	//Get list of link
	if (jData[lnkName]) {
		var o = jData[lnkName].slice();
		if (o) {
			getLinkInfos(iLevel, o);
		}
	} 
	else if (callback) {
		callback();
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

/** Save data */
exports.insertFile = function (req, res) {
	var json = req.param.jdata;
	var data = new DataModel(json);
	data.save(function(err) {
		if (err) {
			console.log("ERROR saving: " + err);
		}
		else {
			console.log(data.id + " Saved Successfully");
		}
	});
};

/** Load data with properties */
exports.getDatas = function(req, res) {
	var path 	= req.params.filepath;
	var iLevel 	= Number(req.params.level);	
	
	console.log("-> Call getDatas " + path + " :" + iLevel); //JSON.stringify(req.params, null, 4) );

	//Callback
	var sendResult = function(jData) {
		//Get all others versions
		//jData.versions = jData.versions; 
		jData.metaByVersion = {}; 
		
		var nbVers = jData.versions.length; 
//
		var jResults = []; 
		function endCall() {
			console.log("sendDatas : " + jResults.length );
			res.send({ data : jResults });
		}
		
		//Get metadata per versions
		var o = utils.parseHref(path);
		var getMetadata = function(idx) {
			if (idx<=0) {
				jResults.push(jData);
				
				mongoose.set('debug', true);
				getLinks(iLevel, "parent", jData, jResults, "false", function() {
					console.log("End get parent ...");
					
					if (jData.children.length>0) {
						getLinks(iLevel, "children", jData, jResults, "true", endCall);
					}
					else {
						endCall();
					}
				}); 
				return; 
			}
			
			var sVer = (""+jData.versions[idx]); 	
			if (sVer !== jData.version) {		
				var sPathVers = o.filepath + "?ver=" + sVer;
				getProperties(sPathVers, function(jMeta) {
					jMeta.Version = sVer;
					jData.metaByVersion[sVer] = jMeta;
					getMetadata(--idx); 
				}); 
			}
			else {
				getMetadata(--idx);
			}
		};   
	    getMetadata(--nbVers);
		 
	};
	
	DataModel.findOne({href: path}, function(err, docs) {
		if (err) {
			console.log('getDatas error: ' + JSON.stringify(err, null, 4) );
			res.res.status(500).send(err.data);
		} 
		else {
			/// Get data informations ///
			console.log('getDatas Ok: ' + JSON.stringify(docs, null, 4) );
			getDataInfos(path, docs, "both", sendResult);
		}
    });//end findOne	
}; //end getDatas

/** Get TREE nodes */
exports.getTreeNodes = function(request, response) {

		//Root Path
		var sPathUri = request.params.path;
		if (!sPathUri) {
			response.status(500).send({responseText : "No search 'root path' parameter was given"});
		}
 
		//Check if get folder only (ex: for study root)
		var bfoldOnly = false;
		var sFolderOnly = request.params.folder;
		if (sFolderOnly && sFolderOnly==="true") {
			bfoldOnly = true;
		}
		
		var rLevel = 0; //root level
		var sLevel = request.params.rootLevel;	
		if (sLevel) {
			rLevel = Number(sLevel);
		}
		
		//Get all active files
		DataModel.find({isActive : true}, {href:1, filepath:1, _id: 0}) //get href and filepath only
				 .sort({ href: 1 }) //sort by href asc
				 .exec(function(err, docs) {
						 
			var results = []; 
			var all_nodes = {};
			
			for (var i=0; i<docs.length; i++) {
				var o = docs[i];
				
				//Get folders
				var dir = lib_path.dirname(o.href);
				var tb = dir.split("/");
				var fold = "";
				
				//Start to 1 because tb[0] is empty
				for (var j=1; j<tb.length; j++) {

					//Skip root < rootlevel (ex: Projects)
					if ((j-1) < rLevel) {
						continue;
					}
					
					//Parent folder
					var p_fold = fold;
					
					//Current folder
					var foldername = tb[j];
					fold += "/" + foldername;
					
					//If new folder
					if ( !(fold in all_nodes) ) {
						var node = { "text"  : foldername
									, "href" : fold
									, "tags" : "0"
									, "nodes": []
									};
						all_nodes[fold] = node;

						//Node must push to its parent
						if (p_fold) {
							var p_node = all_nodes[p_fold];
							p_node.nodes.push(node);
						}
						
						//Add first dir after projects to root node
						if ((j-1) === rLevel) {
							results.push(node);
						}
					}
				}

				//Append file to last dir node, if not fold only
				if (!bfoldOnly) {		
					var fpath = utils.parseHref(o.href);
					//the file node
					var fnode = { "text"  : fpath.label
								 , "href" : o.filepath
								 , "tags" : "1"    //(isFile ? "1" : "0") ??
								 //, "nodes": [{}] //no children for file
					}; 
					var pNode = all_nodes[dir];
					pNode.nodes.push(fnode);
				}
			}

			/// Send results roots
			response.send(results);
		});
}; //end gerTreeInfo
 
