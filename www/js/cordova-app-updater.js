/**
 *  Cordova App Uploader (version 0.1)
 *
 *    https://github.com/KevinWang15/cordova-app-updater
 *
 *    created by KevinWang on October 29 2015
 *
 *    Cordova App Uploader is an easy-to-use, efficient,
 *    powerful tool to remote update your cordova app.
 *
 *    You are welcome to contribute to this project!
 *
 */

var CordovaAppUpdater =
(function (config) {

  //TODO: prevent corrupt update, rollback mechanism ** important
  //TODO: if download is interrupted, should rollback to previous version ** important
  //TODO: reduce dependencies

  var Promise = window.Promise;
  var changedFiles = [];
  var totalSize = 0;
  var totalDownloaded = 0;
  var updateAvailable = null, updateDownloaded = false;
  var applicationDirectoryEntry, dataDirectoryEntry, dataWWWDirectoryEntry;

  var local = {
    Manifest: {},
    ManifestDigest: {}
  }, remote = {
    Manifest: {},
    ManifestDigest: {}
  };
  var fs;

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
        console.log('CordovaAppLoader:', err);
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
      console.log('CordovaAppLoader:', "downloading", file.filename);

      var fileTransfer = new FileTransfer();
      var last_loaded = 0;

      fileTransfer.onprogress = function (ProgressEvent) {
        if (ProgressEvent.loaded <= last_loaded)
          return;
        var increment = (ProgressEvent.loaded - last_loaded) / ProgressEvent.total * file.filesize;
        last_loaded = ProgressEvent.loaded;
        totalDownloaded += increment;
        if (typeof exports.onProgress == "function") {
          exports.onProgress(totalDownloaded, totalSize);
        }
      }
      fileTransfer.download(joinPath(config.server_url, file.filename), joinPath(dataWWWDirectoryEntry.nativeURL, file.filename), function (data) {
        deferred.resolve(data);
      }, function (err) {
        console.log('CordovaAppLoader:', err);
        deferred.reject(err);
      }, true);
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
      }),
      resolveLocalFSURL(cordova.file.dataDirectory).then(function (data) {
        dataDirectoryEntry = data;
      })
    ]);
  }

  function hideSplashScreen() {
    console.log('CordovaAppLoader:', 'hiding splash screen')
    if (typeof navigator.splashscreen != 'undefined') {
      navigator.splashscreen.hide();
    }
  }

  function showSplashScreen() {
    console.log('CordovaAppLoader:', 'showing splash screen')
    if (typeof navigator.splashscreen != 'undefined') {
      navigator.splashscreen.show();
    }
  }

  function copyBundleFilesToDateDirectory() {
    var deferred = Promise.defer();
    console.log('CordovaAppLoader:', 'First run, copying bundled files');
    //delete www in dataDirectory if it exists
    (function () {
      var deferred = Promise.defer();
      dataDirectoryEntry.getDirectory('www', {create: false}, function (dir) {
        console.log('CordovaAppLoader:', 'Previous www/ found, removing..');
        dir.removeRecursively(function () {
          console.log('CordovaAppLoader:', 'Done removing previous www/');
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
          console.log('CordovaAppLoader:', 'Copying finished');
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
      var time = +new Date();

      fs = CordovaPromiseFS({
        persistent: true,
        storageSize: 20 * 1024 * 1024,
        concurrency: 10,
        Promise: Promise
      });

      if (!localStorage['manifest'] || !localStorage['manifest.digest']) {
        delete localStorage['manifest'];
        delete localStorage['manifest.digest'];
        firstRun = true;
      }

      return Promise.all([
        //load manifest
        function () {
          if (!localStorage['manifest']) {
            return loadResource("manifest.json").then(function (data) {
              local.Manifest = data;
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

                localStorage['manifest'] = JSON.stringify(local.Manifest);
                localStorage['manifest.digest'] = JSON.stringify(local.ManifestDigest);

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
      ]).then(function () {
        console.log('CordovaAppLoader:', 'Init took ', +new Date() - time, 'ms');
      });
    },

    check: function () {
      var deferred = Promise.defer();
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
            console.log('CordovaAppLoader:', 'New update available', {
              changedFiles: changedFiles,
              totalSize: totalSize,
              lastUpdateTime: new Date(remote.ManifestDigest.time)
            });
            deferred.resolve({changedFiles: changedFiles, totalSize: totalSize, lastUpdateTime: new Date(remote.ManifestDigest.time)});
          });
        } else {
          console.log('CordovaAppLoader:', 'checked, no update available');
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
        console.log('CordovaAppLoader:', 'Update downloaded');
        updateDownloaded = true;
      });
    },

    apply: function (applyOnNextLaunch) {
      if (!updateDownloaded)
        throw('Call CordovaAppUpdater.download() first');

      localStorage['manifest'] = JSON.stringify(remote.Manifest);
      localStorage['manifest.digest'] = JSON.stringify(remote.ManifestDigest);
      if (applyOnNextLaunch) {
        console.log('CordovaAppLoader:', 'Will apply changes on next launch.');
      } else {
        //Save update stage to localStorage.
        localStorage['updateStage'] = 1 ;
        showSplashScreen();

        var jumpUrl = joinPath(dataWWWDirectoryEntry.nativeURL, config.indexHtmlName);
        var locationHref = location.href;
        locationHref = locationHref.substring(0, locationHref.lastIndexOf("#"))
        console.log('CordovaAppLoader:', 'jumpUrl=', jumpUrl, 'location.href=', locationHref);
        if (locationHref == jumpUrl) {
          location.reload();
        } else {
          location.href = jumpUrl;
        }
      }
    },

    switchToUpdatedVersion: function () {
      console.log('CordovaAppLoader:', 'switchToUpdatedVersion called');
      //Handle update progress
      if(localStorage['updateStage'] == 1){
        console.log('CordovaAppLoader:', 'updateStage==1, reloading page');
        localStorage['updateStage'] = 2;
        //Reload the page to force css reload
        location.reload();
        return;
      }

      if(localStorage['updateStage'] == 2){
        console.log('CordovaAppLoader:', 'updateStage==2, update successful');
        delete localStorage['updateStage'];
        if (typeof exports.updateSuccessful == "function") {
          exports.updateSuccessful();
        }
      }

      //If Already updated/ has a copied version, jump to the copied version in dataWWWDirectory
      if (!!localStorage['manifest']) {
        var jumpUrl = joinPath(joinPath(cordova.file.dataDirectory, 'www'), config.indexHtmlName);
        var locationHref = location.href;
        locationHref = locationHref.substring(0, locationHref.lastIndexOf("#"))
        console.log('CordovaAppLoader:', 'jumpUrl=', jumpUrl, 'location.href=', locationHref);

        if (locationHref != jumpUrl) {
          location.href = jumpUrl;
        } else {
          setTimeout(function () {
            console.warn("You are running a cached version of the app. (By CordovaAppUpdater)\nWhen in dev environment, comment CordovaAppUpdater.switchToUpdatedVersion(); to see modifications.");
          }, 5000);
          hideSplashScreen();
        }
      } else {
        hideSplashScreen();
      }
    }
  };

  return exports;
});
