/**
 *  Cordova App Uploader (version 0.2)
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
  var tempDirectoryName = '_cordova_app_updater_temp';

  var local = {
    Manifest: {},
    ManifestDigest: {}
  }, remote = {
    Manifest: {},
    ManifestDigest: {}
  };
  var fs = null;

  if (config.server_url.substring(config.server_url.length - 1) != '/')
    config.server_url += '/';

  function joinPath() {
    var ret = "";
    for (var i in arguments) {
      if (typeof arguments[i] == "string") {
        if (i != 0 && arguments[i].substring(0, 1) == '/')
          arguments[i] = arguments[i].substring(1);
        if (arguments[i].substring(arguments[i].length - 1) == '/')
          arguments[i] = arguments[i].substring(0, arguments[i].length - 1);
      }
      ret += (arguments[i] + "/");
    }
    return ret.substring(0, ret.length - 1);
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
    console.log('deleteFileIfExists', parent, fileName);
    parent.getFile(fileName, {create: false}, function (fileEntry) {
      fileEntry.remove(function () {
        deferred.resolve();
      }, function (err) {
        console.log('CordovaAppLoader:', err);
        deferred.reject(err);
      });
    }, function () {
      deferred.resolve();
    });
    return deferred.promise;
  }

  function clearTempDirectory() {
    //Sets tempDirectory to an empty directory
    var deferred = Promise.defer();
    (function () {
      var deferred = Promise.defer();
      getDirectoryEntry(joinPath(fs.root.nativeURL, tempDirectoryName)).then(
      function (TempDirectory) {
        TempDirectory.removeRecursively(function () {
          deferred.resolve();
        },
        function (err) {
          deferred.reject(err);
        })
      },
      function () {
        deferred.resolve();
      });
      return deferred.promise;
    })().then(
    function () {
      fs.root.getDirectory(tempDirectoryName, {create: true}, function () {
        deferred.resolve()
      }, function (err) {
        deferred.reject(err);
      });
    },
    function (err) {
      deferred.reject(err)
    });

    return deferred.promise;
  }

  function downloadToTempDirectory(file) {
    var deferred = Promise.defer();
    var fileTransfer = new FileTransfer();
    console.log('CordovaAppLoader:', "downloading", file.filename);
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
    };
    fileTransfer.download(joinPath(config.server_url, file.filename), joinPath(fs.root.nativeURL, tempDirectoryName, file.filename),
    function (data) {
      deferred.resolve(data);
    }, function (err) {
      console.log('CordovaAppLoader:', err);
      deferred.reject(err);
    }, true);
    return deferred.promise;
  }

  function getDirectoryEntry(filename) {
    var deferred = Promise.defer();
    resolveLocalFileSystemURL(filename, function (entry) {
      deferred.resolve(entry);
    }, function () {
      console.log('resolveLocalFileSystemURL Failed', filename);
      deferred.reject();
    });
    return deferred.promise;
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

  function ensureDirectoryInDataWWW(folders) {
    folders = folders.split('/').filter(function (folder) {
      return folder && folder.length > 0 && folder !== '.' && folder !== '..';
    });
    var currentDir = 'www';
    var tasks = [];
    for (var i in folders) {
      var folder = folders[i];
      currentDir = joinPath(currentDir, folder);
      tasks.push((function (dir) {
        return function () {
          var deferred = Promise.defer();
          fs.root.getDirectory(dir, {create: true}, function () {
            deferred.resolve();
          }, function (err) {
            console.log(err, dir);
            deferred.reject(err);
          });
          return deferred.promise;
        }
      })(currentDir));
    }
    return tasks.reduce(function (prevTaskPromise, task) {
      return prevTaskPromise.then(task);
    }, Promise.resolve());
  }

  function copyBundleFilesToDateDirectory() {
    var deferred = Promise.defer();
    console.log('CordovaAppLoader:', 'First run, copying bundled files');

    //delete www in dataDirectory if it exists
    (function () {
      var deferred = Promise.defer();
      getDirectoryEntry(joinPath(fs.root.nativeURL, 'www')).then(
      function (dir) {
        //Found previous www/
        console.log('CordovaAppLoader:', 'Previous www/ found, removing..');
        dir.removeRecursively(function () {
          console.log('CordovaAppLoader:', 'Done removing previous www/');
          deferred.resolve();
        }, function (err) {
          deferred.reject(err);
        });
      },
      function () {
        //No previous www/
        deferred.resolve();
      });
      return deferred.promise;
    })()
    .then(
    //copy www in the bundle (applicationDirectory) to dataDirectory
    function () {
      getDirectoryEntry(joinPath(cordova.file.applicationDirectory, 'www')).then(function (applicationDirectoryEntry) {
        getDirectoryEntry(fs.root.nativeURL).then(function (dataDirectoryEntry) {
          applicationDirectoryEntry.copyTo(dataDirectoryEntry, 'www', function () {
            console.log('CordovaAppLoader:', 'Copying finished');
            deferred.resolve();
          }, function (err) {
            deferred.reject(err);
          })
        }, function (err) {
          deferred.reject(err);
        });
      });
    });
    return deferred.promise;
  }

  var exports = {
    init: function () {
      var firstRun;
      var fsDeferred = Promise.defer();

      var time = +new Date();
      window.requestFileSystem = window.requestFileSystem || window.webkitRequestFileSystem;
      window.requestFileSystem(window.PERSISTENT, 20 * 1024 * 1024, function (_fs) {
        fs = _fs;
        fsDeferred.resolve();
      }, function (err) {
        throw err;
      });

      if (!localStorage['manifest'] || !localStorage['manifest.digest']) {
        delete localStorage['manifest'];
        delete localStorage['manifest.digest'];
        firstRun = true;
      }

      //load manifest
      var ManifestDeferred = function () {
        if (!localStorage['manifest']) {
          return loadResource("manifest.json").then(function (data) {
            local.Manifest = data;
          });
        } else {
          local.Manifest = JSON.parse(localStorage['manifest']);
          return Promise.resolve();
        }
      }();

      //load manifest.digest
      var ManifestDigestDeferred = function () {
        if (!localStorage['manifest.digest']) {
          return loadResource("manifest.digest.json").then(function (data) {
            local.ManifestDigest = data;
          });
        } else {
          local.ManifestDigest = JSON.parse(localStorage['manifest.digest']);
          return Promise.resolve();
        }
      }();
      return Promise.all([
        ManifestDeferred,
        ManifestDigestDeferred,

        (function () {
          var deferred = Promise.defer();
          fsDeferred.promise.then(function () {
            if (firstRun)
              copyBundleFilesToDateDirectory().then(function () {
                Promise.all([ManifestDeferred, ManifestDigestDeferred]).then(function () {
                  localStorage['manifest'] = JSON.stringify(local.Manifest);
                  localStorage['manifest.digest'] = JSON.stringify(local.ManifestDigest);
                  deferred.resolve();
                });
              }, function () {
                deferred.reject();
              });
            else {
              deferred.resolve();
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
          changedFiles = [];
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
            deferred.resolve({
              changedFiles: changedFiles,
              totalSize: totalSize,
              lastUpdateTime: new Date(remote.ManifestDigest.time)
            });
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
      if (updateAvailable === null)
        throw('Call CordovaAppUpdater.check() first');
      if (updateAvailable === false)
        throw('No update is available');

      var deferred = Promise.defer();

      localStorage['updateStage'] = -1;

      clearTempDirectory().then(function () {
        totalDownloaded = 0;
        Promise.all(changedFiles.map(function (file) {
          return downloadToTempDirectory(file);
        })).then(function () {
          console.log('CordovaAppLoader:', 'Update downloaded');
          delete localStorage['updateStage'];
          updateDownloaded = true;
        }).then(function (data) {
          deferred.resolve(data);
        }, function (data) {
          deferred.reject(data);
        });
      });
      return deferred.promise;
    },

    apply: function () {

      if (!updateDownloaded)
        throw('Call CordovaAppUpdater.download() first');

      getDirectoryEntry(joinPath(fs.root.nativeURL, tempDirectoryName)).then(
      function (TempDirectory) {
        getDirectoryEntry(joinPath(fs.root.nativeURL, 'www')).then(
        function (wwwDirectory) {
          //Merges two temp directory and www directory.
          for (var fileIndex in changedFiles) {
            var file = changedFiles[fileIndex];
            (function (fileName) {
              TempDirectory.getFile(fileName, {create: false}, function (fileEntry) {
                deleteFileIfExists(wwwDirectory, fileName).then(function () {
                  ensureDirectoryInDataWWW(fileName.substring(0, fileName.lastIndexOf('/'))).then(function () {
                    fileEntry.moveTo(wwwDirectory, fileName, function () {
                    }, function (err) {
                      throw err;
                    });
                  });
                });
              }, function (err) {
                throw err;
              })
            })(file.filename);

          }
          window.TempDirectory = TempDirectory;
        },
        function (err) {
          throw err;
        });
      },
      function (err) {
        throw err;
      });

      localStorage['manifest'] = JSON.stringify(remote.Manifest);
      localStorage['manifest.digest'] = JSON.stringify(remote.ManifestDigest);

      localStorage['updateStage'] = 1;

      showSplashScreen();

      var jumpUrl = joinPath(fs.root.nativeURL, 'www', config.indexHtmlName);
      var locationHref = location.href;
      locationHref = locationHref.substring(0, locationHref.lastIndexOf("#"));
      console.log('CordovaAppLoader:', 'jumpUrl=', jumpUrl, 'location.href=', locationHref);
      if (locationHref == jumpUrl) {
        location.reload();
      } else {
        location.href = jumpUrl;
      }
    },

    switchToUpdatedVersion: function () {
      console.log('CordovaAppLoader:', 'switchToUpdatedVersion called');
      //Handle update progress

      if (localStorage['updateStage'] == -1) {
        //Failed download
        console.log('CordovaAppLoader:', 'updateStage==-1, previous download has failed');
        clearTempDirectory();
        delete localStorage['updateStage'];
        //return;
      }

      if (localStorage['updateStage'] == 1) {
        console.log('CordovaAppLoader:', 'updateStage==1, reloading page');
        localStorage['updateStage'] = 2;
        //Reload the page to force css reload
        location.reload();
        return;
      }

      if (localStorage['updateStage'] == 2) {
        console.log('CordovaAppLoader:', 'updateStage==2, update successful');
        delete localStorage['updateStage'];
        if (typeof exports.updateSuccessful == "function") {
          exports.updateSuccessful();
        }
      }

      //If Already updated/ has a copied version, jump to the copied version in dataWWWDirectory
      if (!!localStorage['manifest']) {
        window.requestFileSystem = window.requestFileSystem || window.webkitRequestFileSystem;
        window.requestFileSystem(window.PERSISTENT, 20 * 1024 * 1024, function (fs) {
          var jumpUrl = joinPath(fs.root.nativeURL, 'www', config.indexHtmlName);
          var locationHref = location.href;
          if (locationHref.indexOf("#") != -1)
            locationHref = locationHref.substring(0, locationHref.lastIndexOf("#"));
          console.log('CordovaAppLoader:', 'jumpUrl=', jumpUrl, 'location.href=', locationHref);

          if (locationHref != jumpUrl) {
            location.href = jumpUrl;
          } else {
            setTimeout(function () {
              console.warn("You are running a cached version of the app. (By CordovaAppUpdater)\nWhen in dev environment, comment CordovaAppUpdater.switchToUpdatedVersion(); to see modifications.");
            }, 5000);
            hideSplashScreen();
          }
        }, function (err) {
          throw err;
        });
      } else {
        hideSplashScreen();
      }
    }
  };
  return exports;
});
