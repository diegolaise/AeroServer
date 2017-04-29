'use strict';

//libs
var lib_path = require('path');

//modules
var utils    = require('./utils.js');

/**
 * Parse Tree
 */
exports.parseTree = function(docs, rootLevel, bfoldOnly, callback) {
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
			if ((j-1) < rootLevel) {
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
				if ((j-1) === rootLevel) {
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
};
 
exports.parseNode = function(docs, rootNodePath, bfoldOnly, ilevel, callback) {
	var results = []; 
	var all_nodes = {};
	
	var rootNode = { "text"  : lib_path.dirname(rootNodePath)
					, "href" : rootNodePath
					, "tags" : "0"
					, "nodes": []
			};
	all_nodes[rootNodePath] = rootNode;
	results.push(rootNode);
	
	var idx = rootNodePath.split("/").length;
	var bFound = false;
	
	for (var i=0; i<docs.length; i++) {
		var data = docs[i];
		if (!data.href.startsWith(rootNodePath)) {
			if (bFound) {
				break;
			}
			else {
				continue;
			}
		}
		bFound = true;
		
		var file = utils.parseHref(data.href);
		
		//Get folders
		var dir = lib_path.dirname(data.href);
		var tb = dir.split("/");
		var max = idx + ilevel;
		
		var curPath = rootNodePath;
		
		//Start to 1 because tb[0] is empty
		for (var j=idx; j<max; j++) {
			if (tb.length<=j) {
				break;
			}
			
			//Parent folder
			var p_fold = curPath;
			
			//Current folder
			var fname = tb[j];
			curPath += "/" + fname;
			
			//If not new folder
			if ( (curPath in all_nodes) ) {
				continue;
			}
			
			var node = { "text"  : fname
						, "href" : curPath 
					   };
			
			//File
			if ( (tb.length-1) === j ) {
				if (bfoldOnly) {
					continue;
				}
				//Add the file node
				node.tags = "1";    //(isFile ? "1" : "0") ?? 
			}
			else { 
				node.tags =  "0";
				node.nodes = []; 
			}
			
			all_nodes[curPath] = node;

			//Node must push to its parent 
			var p_node = all_nodes[p_fold];
			p_node.nodes.push(node); 
		}
	}
};