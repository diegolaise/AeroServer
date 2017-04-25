'use strict';

//libs
var lib_path = require('path');

//modules
var utils    = require('./utils.js');

/**
 * Parse Tree
 */
exports.parseTree = function(docs, rLevel, bfoldOnly, callback) {
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
};