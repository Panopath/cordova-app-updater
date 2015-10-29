window.CordovaAppUpdater =
(function () {
  // You are welcome to contribute to this project!

  //TODO: prevent corrupt/endless update, rollback mechanism ** important
  //TODO: reduce dependencies

  //TODO: BUG: possible bug - removal of files more than once? (trivial)
  //TODO: android traversal optimization

  var Promise = window.Promise;
  var changedFiles = [];
  var totalSize = 0;
  var totalDownloaded = 0;
  var updateAvailable = null, updateDownloaded = false;
  //TODO: keep either dataDirectoryEntry or dataWWWDirectoryEntry
  var applicationDirectoryEntry, dataDirectoryEntry, dataWWWDirectoryEntry;
  var config =
  {
    server_url: 'http://114.215.159.185/update/',
    indexHtmlName: 'index.html'
  };
  var local = {
    Manifest: {},
    ManifestDigest: {}
  }, remote = {
    Manifest: {},
    ManifestDigest: {}
  };
  var fs, fileTransfer;

  if (config.server_url.substring(config.server_url.length - 1) != '/')
    config.server_url += '/';

  function joinPath(A, B, isDirectory) {
    //Join two parts of a path together
    if (A.substring(A.length - 1) == "/") A = A.substring(0, A.length - 1);
    if (B.substring(B.length - 1) == "/") B = B.substring(0, B.length - 1);
    if (B.substring(0, 1) == "/") B = B.substring(1);
    return A + "/" + B + (isDirectory ? '/' : "");
  }

  function loadResource(url) {
    var deferred = Promise.defer();
    $.ajax({
      dataType: 'json',
      url: url,
      cache: false,
      success: function (data) {
        deferred.resolve(data);
      },
      timeout: function (data) {
        deferred.reject(data);
      }
    });
    return deferred.promise;
  }

  function deleteFileIfExists(parent, fileName) {
    var deferred = Promise.defer();
    parent.getFile(fileName, {create: false}, function (fileEntry) {
      fileEntry.remove(function () {
        deferred.resolve();
      }, function (err) {
        console.log(err);
        deferred.resolve();
        //deferred.reject(err);
      });
    }, function () {
      deferred.resolve();
    });
    return deferred.promise;
  }

  function downloadToDataWWWDirectory(file) {
    var deferred = Promise.defer();
    deleteFileIfExists(dataWWWDirectoryEntry, file.filename).then(function () {
      console.log("downloading", file.filename);
      fileTransfer.download(joinPath(config.server_url, file.filename), joinPath(dataWWWDirectoryEntry.nativeURL, file.filename), function (data) {
        totalDownloaded += file.filesize;

        if (typeof exports.onProgress == "function") {
          exports.onProgress(totalDownloaded, totalSize);
        }

        console.log(totalDownloaded, totalSize);
        deferred.resolve(data);
      }, function (err) {
        console.log(err);
        deferred.reject(err);
      });
    });
    return deferred.promise;
  }

  function resolveLocalFSURL(filename) {
    var deferred = Promise.defer();
    resolveLocalFileSystemURL(filename, function (entry) {
      deferred.resolve(entry);
    });
    return deferred.promise;
  }

  function getDirectoryEntries() {
    if (!!applicationDirectoryEntry && !!dataDirectoryEntry)
      return Promise.resolve();

    return Promise.all([
      resolveLocalFSURL(joinPath(cordova.file.applicationDirectory, 'www', true)).then(function (data) {
        applicationDirectoryEntry = data;
        //console.log('applicationDirectory URI: ' + JSON.stringify(applicationDirectoryEntry));
      }),
      resolveLocalFSURL(cordova.file.dataDirectory).then(function (data) {
        dataDirectoryEntry = data;
        //console.log('dataDirectory URI: ' + JSON.stringify(dataDirectoryEntry));
      })
    ]);
  }

  function hideSplashScreen() {
    if (typeof navigator.splashscreen != 'undefined') {
      navigator.splashscreen.hide();
    }
  }

  function showSplashScreen() {
    if (typeof navigator.splashscreen != 'undefined') {
      navigator.splashscreen.show();
    }
  }

  function copyBundleFilesToDateDirectory() {
    var deferred = Promise.defer();
    console.log('First run, copying bundled files');
    //console.log(applicationDirectoryEntry);
    //console.log(dataDirectoryEntry);

    //delete www in dataDirectory if it exists
    (function () {
      var deferred = Promise.defer();
      dataDirectoryEntry.getDirectory('www', {create: false}, function (dir) {
        console.log('Previous www/ found, removing..');
        dir.removeRecursively(function () {
          console.log('Done removing previous www/');
          deferred.resolve();
        }, function (err) {
          deferred.reject(err);
        });
      }, function () {
        deferred.resolve();
      });
      return deferred.promise;
    })().then(function () {
        //copy www in the bundle (applicationDirectory) to dataDirectory
        applicationDirectoryEntry.copyTo(dataDirectoryEntry, 'www', function (entry) {
          dataWWWDirectoryEntry = entry;
          deferred.resolve();
        }, function (err) {
          deferred.reject(err);
        })
      }, function (err) {
        deferred.reject(err);
      });
    return deferred.promise;
  }


  function getDataWWWDirectoryEntry() {
    var deferred = Promise.defer();
    dataDirectoryEntry.getDirectory('www', {create: false}, function (wwwDir) {
      dataWWWDirectoryEntry = wwwDir;
      deferred.resolve();
    }, function (err) {
      deferred.reject(err);
    });
    return deferred.promise;
  }

  var exports = {
    init: function () {
      var firstRun;
      fs = CordovaPromiseFS({
        persistent: true,
        storageSize: 20 * 1024 * 1024,
        concurrency: 10,
        Promise: Promise
      });

      fileTransfer = new FileTransfer();

      if (!localStorage['manifest']) {
        firstRun = true;
      }

      return Promise.all([
        //load manifest
        function () {
          if (!localStorage['manifest']) {
            return loadResource("manifest.json").then(function (data) {
              local.Manifest = data;
              localStorage['manifest'] = JSON.stringify(data);
            });
          } else {
            local.Manifest = JSON.parse(localStorage['manifest']);
            return Promise.resolve();
          }
        }(),

        //load manifest.digest
        function () {
          if (!localStorage['manifest.digest']) {
            return loadResource("manifest.digest.json").then(function (data) {
              local.ManifestDigest = data;
              localStorage['manifest.digest'] = JSON.stringify(data);
            });
          } else {
            local.ManifestDigest = JSON.parse(localStorage['manifest.digest']);
            return Promise.resolve();
          }
        }(),

        //prepares file system
        (function () {
          //TODO: if copying is interrupted (app crashed/closed by user), delete manifest.digest and manifest in localStorage so that copyBundleFilesToDateDirectory will run again.
          var deferred = Promise.defer();
          getDirectoryEntries().then(function () {
            if (firstRun)
              copyBundleFilesToDateDirectory().then(function () {
                deferred.resolve();
              }, function () {
                deferred.reject();
              });
            else {
              getDataWWWDirectoryEntry().then(function () {
                deferred.resolve();
              }, function () {
                deferred.reject();
              });
            }
          });
          return deferred.promise;
        })()
      ]);
    },
    check: function () {
      //console.log(applicationDirectoryEntry, dataDirectoryEntry, dataWWWDirectoryEntry);
      var deferred = Promise.defer();
      //Load digest of manifest first to check whether an update is available
      loadResource(joinPath(config.server_url, "manifest.digest.json")).then(function (data) {
        remote.ManifestDigest = data;
      }).then(function () {
        if (local.ManifestDigest.version != remote.ManifestDigest.version) {
          updateAvailable = true;
          //If an update is available, load manifest.json, to see how many files have changed and require to be downloaded
          loadResource(joinPath(config.server_url, "manifest.json")).then(function (data) {
            remote.Manifest = data;
          }).then(function () {
            totalSize = 0;
            for (var key in remote.Manifest) {
              if (!local.Manifest[key] || local.Manifest[key].version != remote.Manifest[key].version) {
                totalSize += remote.Manifest[key].filesize;
                changedFiles.push(remote.Manifest[key]);
              }
            }
            deferred.resolve({changedFiles: changedFiles, totalSize: totalSize, lastUpdateTime: new Date(remote.ManifestDigest.time)});
          });
        } else {
          deferred.resolve(false);
          updateAvailable = false;
        }
      });
      return deferred.promise;
    },

    download: function () {
      totalDownloaded = 0;
      if (updateAvailable === null)
        throw('Call CordovaAppUpdater.check() first');
      if (updateAvailable === false)
        throw('No update is available');
      return Promise.all(changedFiles.map(function (file) {
        return downloadToDataWWWDirectory(file);
      })).then(function () {
        updateDownloaded = true;
      });
    },

    apply: function (applyOnNextLaunch) {
      if (!updateDownloaded)
        throw('Call CordovaAppUpdater.download() first');

      localStorage['manifest'] = JSON.stringify(remote.Manifest);
      localStorage['manifest.digest'] = JSON.stringify(remote.ManifestDigest);
      if (applyOnNextLaunch) {
        console.log('Will apply changes on next launch.');
      } else {
        //Save update stage to localStorage.
        localStorage['updateStage'] = 1 ;
        showSplashScreen();
        location.href = joinPath(dataWWWDirectoryEntry.nativeURL, config.indexHtmlName);
      }
    },

    switchToUpdatedVersion: function () {

      //Handle update progress
      if(localStorage['updateStage'] == 1){
        localStorage['updateStage'] = 2;
        //Reload the page to force css reload
        location.reload();
        return;
      }

      if(localStorage['updateStage'] == 2){
        delete localStorage['updateStage'];
        if (typeof exports.updateSuccessful == "function") {
          exports.updateSuccessful();
        }
      }

      //If Already updated/ has a copied version, jump to the copied version in dataWWWDirectory
      if (!!localStorage['manifest']) {
        var jumpUrl = joinPath(joinPath(cordova.file.dataDirectory, 'www'), config.indexHtmlName);
        if (location.href != jumpUrl) {
          location.href = jumpUrl;
        } else {
          console.warn("You are running a cached version of the app. (By CordovaAppUpdater)\nWhen in dev environment, comment CordovaAppUpdater.switchToUpdatedVersion(); to see modifications.");
          hideSplashScreen();
        }
      } else {
        hideSplashScreen();
      }
    }
  };

  return exports;
})();
