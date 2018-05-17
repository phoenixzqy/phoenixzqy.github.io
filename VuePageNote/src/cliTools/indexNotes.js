const path = require("path");
const fs = require('fs');
const notePath = path.resolve(__dirname, "../../public/notes");
const outputPath = path.resolve(__dirname, "../../database/noteStructure.json");
const appRoot = path.resolve(__dirname, "../../../");

// List all files [as directory tree] in Node.js recursively in a synchronous fashion
var walkSync = function(dir) {
    var files = fs.readdirSync(dir);
    var fileList = [];
    var subDirList = {};
    files.forEach(function(file) {
        var target = fs.statSync(dir + '/' + file);
        if (target.isDirectory()) {
            subDirList[file] = walkSync(dir + '/' + file);
        }
        else { 
            switch(path.extname(file)) {
                case '.md' :
                    fileList.push({
                        file_name: file,
                        updated_at: target.mtime,
                        created_at: target.ctime,
                        size: target.size,
                        path: `${dir.replace(appRoot, '')}/${file}`
                    }); 
                    break;
                case '.json':
                //TODO: config.json?
                default:
            }
        }
    });
    return {
        files: fileList,
        directories: subDirList
    };
};


// write to database
fs.writeFile(outputPath, JSON.stringify(walkSync(notePath)), function(err) {
    if(err) {
        return console.log(err);
    }
    console.log("[Index Notes] Your note structure is created!\n");
});