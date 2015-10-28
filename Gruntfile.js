module.exports = function (grunt) {
  grunt.initConfig({
    genManifest: {
      options: {
        basePath: 'www'
      },
      //when using full update mode, it's mandatory that you generate hashes for *all* files
      src: [
        '**'
      ]
    }
  });

  grunt.registerMultiTask('genManifest', 'Generate JSON Manifest for Hot Updates', function () {
    var options = this.options({basePath: 'www'});
    var done = this.async();
    var path = require('path');

    function size(filepath) {
      return require('fs').lstatSync(filepath).size;
      // return grunt.file.read(filepath).length;
    }

    this.files.forEach(function (file) {
      var files;

      //manifest format
      var manifestJSON = {};

      // if a basePath is set, expand using the original file pattern
      if (options.basePath) {
        files = grunt.file.expand({cwd: options.basePath}, file.orig.src);
      }

      // add files
      if (files) {
        files.forEach(function (item) {
          var isDir = grunt.file.isDir(path.join(options.basePath, item));
          if (!isDir) {
            var hasher = require('crypto').createHash('sha256');
            var filename = encodeURI(item);
            var key = filename.split("/").join('-');
            if (filename == "manifest.digest.json" || filename == "manifest.json") return;
            manifestJSON[key] = {};
            manifestJSON[key]['filename'] = filename;
            manifestJSON[key]['filesize'] = size(path.join(options.basePath, filename));
            manifestJSON[key]['version'] = hasher.update(grunt.file.read(path.join(options.basePath, item))).digest("hex");
          }
        });
      }


      //write out the JSON to the manifest files
      grunt.file.write(path.join(options.basePath, "manifest.json"), JSON.stringify(manifestJSON, null, 2));
      var hasher = require('crypto').createHash('sha256');
      var manifestDigest = {
        version: hasher.update(grunt.file.read(path.join(options.basePath, "manifest.json"))).digest('hex'),
        time: new Date()
      };
      grunt.file.write(path.join(options.basePath, "manifest.digest.json"), JSON.stringify(manifestDigest, null, 2));
      done();
    });
  }
  )
  ;
}
;