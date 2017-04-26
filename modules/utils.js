"use strict";

/// IMPORTS ///////////////////////////////////////////////////

var fs = require('fs');
var _path = require('path');
var mime =  require('mime');
var parseString = require('xml2js').parseString;

/// CONSTANTS ///////////////////////////////////////////////////

var bSaveData  = true; //flag if save data
var bWriteXml  = false;
var bWriteJson = false;

/// Internal functions ///////////////////////////////////////////

exports.isArray = function(a) {
    return (!!a) && (a.constructor === Array);
}; 

exports.isObject = function(a) {
    return (!!a) && (a.constructor === Object);
};

exports.isString = function(a) {
    return (!!a) && (a.constructor === String);
};

exports.isEmpty = function(obj) {
	if (!obj) {
		return true;
	}
	if (this.isObject(obj)) {
		return (Object.getOwnPropertyNames(obj).length === 0);
	}
	if (this.isArray(obj)) {
		return (obj.length===0);
	}	
	if (this.isString(obj)) {
		return (obj.trim()==="");
	}
	return false;
};


//if (!String.prototype.trim) {
//	  String.prototype.trim = function () {
//	    return this.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, '');
//	  };
//}
exports.trim = function(spath) {
	if (!spath) {return "";}
	return (''+spath).replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, '');
};
 
/** Skip USER Trash folder */
function skipPath(spath) {
	if (!spath || ! (''+spath).trim()) {
		return true;
	}
	var sPath = (""+spath).toUpperCase();
	sPath = sPath.trim();
	if  (sPath.indexOf("/99-USERS/")>0 || sPath.indexOf("/99_USERS/")>0 || sPath.indexOf("/USERS/")>0) {
		return (sPath.indexOf("/TRASH/")>=0);
	}
	return false;
}
exports.skipPath = skipPath;

/**
 * Write to file
 */
exports.writeToFile = function(targetPath, data, callback) {
	var ok = true;
	var sdata = "";
	
	if (this.isArray(data)) {
		sdata = JSON.stringify(data);
	}
	else if (this.isObject(data)) {
		sdata = JSON.stringify(data, null, 4);
	}
	else {
		sdata = "" + data;
	} 
	
	fs.writeFile(targetPath, sdata, function(err) {
		if (err) {
			console.log(err);
			ok = false;
		} 
		else {
			console.log("> " + targetPath);
		}
		if (callback) {
			callback(ok);
		}
	}); 
};

/** Dive in folders from exported AL datas */
var dive = function(dir, verMax, action, error) {

	// Read the directory
	fs.readdir(dir, function (err, list) {
		// Return the error if something went wrong
		if (err) {return error(err);}			

		var dirName = _path.basename(dir);
		
		if ( !isNaN(dirName) && list.indexOf("meta.xml")>=0) {
			action(dir, list, (Number(dirName)===verMax));
		}
		else {
			 
			var continueDive = function(vers) {
				// For every file in the list
				list.forEach(function (file) {
					// Full path of that file
					var fpath = dir + _path.sep + file;
	
					// Get the file's stats
					fs.stat(fpath, function (err, stat) {
						
						// If the file is a directory
						if (stat && stat.isDirectory()) {
							// Dive into the directory
							dive(fpath, vers, action);
						}
						//else { action(null, path); }
					});
				});
			};
			
			//Get Max version
			if (! dirName.startsWith("_")) {
				continueDive(-1);
			}
			else {	
				
				//Continue only if the file  exists
				var filepath = _path.normalize(dir + "/../../" + dirName.substring(1));
				//console.log("Check " + filepath);
				try {
					if (fs.statSync(filepath)) { // or fs.existsSync 
						//Get max versions
						var myVers = 0;  
						for (var i=0; i<list.length; i++) {
							var fm = list[i];
							if ( ! isNaN(fm) ) { 
								try { 
									var f = Number(fm);
									if (f>myVers) {
										myVers = f;
									}
								}
								catch(e) {} //not number folder
							}
						}

						if (myVers === 0) {
							//No versioning, read the meta.xml
							action(dir, list, true, filepath);
						}
						else {
							continueDive(myVers);
						}
					}  
				} catch (err) {
					console.log(filepath + " NOT exists !");
				} //end try
			} //end if dirName
		} // end if isNaN
	});
};

/** Get mime type */
var getMimeType = function(fname) { 
	if (fname.indexOf(".")<0) {
		return "";
	}
	return mime.lookup(fname);
};

/// Exported functions /////////////////////////////////////////////////////////

/**
 * Create document to insert in mogodb
 */
//exports.createDocuments = function createDocuments(project, saveDataCallback) {
var createDocuments = function(project, saveDataCallback) {

	// /Projects dir
	var projectPath = _path.normalize(project);
	
	//Save json to 
	var targetPath = _path.normalize(projectPath + "/../JSON");
	//console.log("Parsing : " + projectPath);
	
	var getPath = function(filename, _xml) {
		return targetPath  + _xml + _path.sep + filename;
	};
	
	var writeFile = function(filename, json, _xml) {
		fs.writeFile(targetPath  + _xml + _path.sep + filename, JSON.stringify(json, null, 4), function(err) {
			if (err) {
				console.log(err);
			} 
			//else { console.log(targetPath + ' > ' + filename); }
		});
	};

	//Parse version directory
	var parseVersionDir = function(dir, list, bIsActive, dataPath) {
		
		if ( !list || list.indexOf("meta.xml")<0) {
			console.log("No meta.xml in: " + dir);
			return;
		}
		
		var dirPath = _path.normalize(dir);
		var dirName = _path.basename(dirPath); 
		  
		//Version is the current dir
		var version  = 0;
		var jsonName = ""; 
		var sfilepath = dataPath;
		  
		if ( isNaN(dirName) )  { 
			jsonName = dirName;
			if (jsonName.startsWith("_")) { jsonName = jsonName.substring(1); }
			
			if (!sfilepath) {
				var al = _path.dirname(dirPath);
				sfilepath = _path.dirname(al) + _path.sep + jsonName;
			}
			else { 
				sfilepath =  _path.normalize(sfilepath); 
			}
		} 
		else { 
			version = Number(dirName);
			jsonName = _path.basename(_path.dirname(dirPath)) + "_" + version;
			if (jsonName.startsWith("_")) { jsonName = jsonName.substring(1); }
			
			//Get data inside list
			if (!sfilepath) {
				for (var x=0; x<list.length; x++) {
					var f = list[x]; 
					if (f.startsWith("data")) {
						sfilepath = dirPath + _path.sep + f;
						break;
					}
				}
			}
			else { 
				sfilepath =  _path.normalize(sfilepath); 
			}
		} 
		jsonName += ".json";
		
		if (!sfilepath) {
			console.log("No file for : " + dir + " " + list.toString());
		}
		else {
			var k = sfilepath.indexOf("\\Projects\\");
			if (k<0) {
				sfilepath = sfilepath.indexOf("/Projects/");
			}
			if (k>0) {
				sfilepath = sfilepath.substring(k);
			}
		}
		
		// Shema JSON ///////
		var djson = { //id : 0,
				  href      : ""
				, version 	: version 
				, owner   	: "admin"
				, creation_date: new Date()
				, isActive	: (bIsActive ? true : false)
				//, data    : undefined
				, filepath 	: sfilepath
				, mimeType	: getMimeType(_path.basename(sfilepath))
				, comment 	: ""
				, properties: []
				, links 	: []
		};
		///////////
		  
		var metafile = dirPath + _path.sep + "meta.xml";	   
		   
	   //Parse xml & get properties
	   //console.log("Parse xml: " + metafile);
	   fs.readFile(metafile, function(err, data) {
		   
		   parseString(data, function (err, result) {
			   
			   if (err) {
				   console.log("Parse Error : " + err);
			   }
			   else {	
				   if (bWriteXml) { 
					   //this.writeToFile(getPath(jsonName,'_xml'), result); 
					   writeFile(jsonName, result, '_xml');
				   }
				   
				   if (result.meta) {

					   if (result.meta.info && result.meta.info.length>0) {
						   var resMetaInfoZero = result.meta.info[0];
						    
						   if (resMetaInfoZero.sourceControl && resMetaInfoZero.sourceControl.lenght>0) {
							   var s = resMetaInfoZero.sourceControl[0];
							   if (s && s.comment && s.comment.length>0) {
								   djson.comment = s.comment[0];
							   }
						   }
						   
//						   try {
//							   var s = result.meta.info[0].sourceControl[0];
//							   if (s && s.comment) {
//								   djson.comment = result.meta.info[0].sourceControl[0].comment[0];
//							   }
//						   } catch (err) {
//							   //console.log( "No source ctrl: " + metafile + " " + err);
//						   }

						   if (resMetaInfoZero.href && resMetaInfoZero.href.length>0) {
							   var f = result.meta.info[0].href[0];						
							   djson.href = f.substring( f.indexOf("/Projects/") );
						   }
					   }

					   if (result.meta.properties && result.meta.properties.length>0) {
						   var tprop = result.meta.properties[0].property;
						   if (tprop) {
							   for (var i=0; i<tprop.length; i++) {
								   var prop = tprop[i];
								   var obj = { 
										   name  : prop.$.name
										   , type  : (prop.$.ns ? prop.$.ns : "")
										   , value : (prop._ ? prop._ : "")
								   }; 
								   djson.properties.push(obj);
							   }
						   } 
					   }

					   if (result.meta.links && result.meta.links.length>0) {
						   var p = result.meta.links[0];
						   if (p) {
							   var tlinks = result.meta.links[0].link;
							   if (tlinks) {
								   for (var j=0; j<tlinks.length; j++) {
									   var link = tlinks[j];
									   var hr = link.$.href;
									   if (hr) {
										   var olink = { 
												   name  : link.$.name
												   , type  : (link.$.ns ? link.$.ns : "")
												   , value : (link._ ? link._ : "")
												   , href  : hr.substring(hr.indexOf("/Projects/"))
												   , is_child : (link.incoming ? true : false)
										   }; 
										   djson.links.push(olink);
									   }
								   }
							   }
						   }
					   }
					   
				   }//end if result.meta
			   }//end parseString
			   
			    // Save ////
				if (bSaveData) {
					saveDataCallback(djson);
				}
					
				//Clean data a Save json
				if (bWriteJson) {
					if (jsonName.startsWith("_")) { jsonName = jsonName.substring(1); }//remove _
					//writeToFile(getPath(jsonName,''), djson);
					writeFile(jsonName, djson, '');
				}
				
		   }); //end parsefile
	   }); //end readfile

	}; //end parseVersionDir function

	//--
	//
	//--
	fs.readdir(projectPath, function (err, list) {
		// Parcourrir le dossier
		list.forEach(function (file) {
			// Full path of that file
			var fpath = projectPath + _path.sep + file;

			// Get the file's stats
			fs.stat(fpath, function (err, stat) {
				// If the file is a directory
				if (stat && stat.isDirectory()) {
					//var project = file;
					// Dive into the directory 
					dive(fpath, 0, parseVersionDir, function(err) {
						console.log("dive Error: " + err);
					});
				}
			});
		});
	});

};
exports.createDocuments = createDocuments;
///-- End createDocuments ---///

/** Escape special char */
exports.escapeRegExp = function(string) {
    return string.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
};

/**  Split path */
exports.parseHref = function(href) {
	var vers  = "";
	var fpath = href;
	var i = href.indexOf("?ver=");
	if (i>0) { 
		vers   = fpath.substring(i+5);
		fpath  = fpath.substring(0, i);
	}
	var fname = _path.basename(fpath);
	var epath = fpath; //this.escapeRegExp(fpath);
	return {filepath: epath, version: vers, label: fname};
};


/*
 
function treeInfo(sPath, jsResult, iLevel, bFolderOnly) {
	//Skip USER folder
	if (skipPath(sPath)) { return; }
	 
	var cpath = utils.parseHref(sPath);
	var filename  = cpath.label;
	sPath = cpath.filename;
	
	//No doublons
	//if (jsResult.toString().indexOf("" + filename +"")>0) return; 
	
 	var isFile = false;
 	if (filename.indexOf(".")>0 || filename.indexOf("=ver")>0){
 		isFile = true;
 	}
 	else { 
 	     var info = dao.getTreeInfo(cpath, false); 
 	     isFile = (info.getNumFolders() == 0);
 	}
	 
	if (bFolderOnly && isFile) {return;}
	
	var json = { "text"  : filename
				, "href" : sPath
				, "tags" : (isFile ? "1" : "0")
	}; 
	jsResult.put(json); 
	
	if (isFile) {return;} //Skip files for all -> No children to search
	  
	//Add nodes for folder
	var jNodes = [];
	json.nodes = jNodes;
			
	//End of level search 
	if (iLevel===0) {return;}
	 
//	UnifiedSearchRequest uPS = new UnifiedSearchRequest();
//	uPS.setTarget(cpath);  
//	uPS.setDeep(false); //Non Recursive
//	
// 	uPS.setMatchFilenameOrContent(false);
// 	uPS.setFilenamePattern("*"); 
//
//	SearchResult<String> lstRes = dao.searchFiles(uPS); 
//	Collection<String> lstStrRes = lstRes.getResults();
	var lstStrRes = [];
 
	//That means : was already seached but is an empty folder
	//Permet de ne pas lancer une requette pour rien
	if (lstStrRes.length===0) {
		jNodes.push({});
	}
	else {
		var nextLevel = iLevel - 1;
		for (var i=0; i<lstStrRes.length; i++) {  			
			var path = lstStrRes[i];
			if ( path !== sPath && path.indexOf("?ver=")<0) 
			{
				//Don't add rootPath (Folder) don't have version 
				treeInfo(path, jNodes, nextLevel, bFolderOnly); 
			}
		} 
	}
}
 */



