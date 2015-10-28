// IMPORTANT! Only call CordovaAppUpdater after 'deviceready'
var DeviceReadyDefer = Promise.defer();
var CordovaAppUpdaterInit;

document.addEventListener('deviceready', function () {
    console.log('Device ready');

    var DEV_ENVIRONMENT = false;

    // Don't call CordovaAppUpdater.switchToUpdatedVersion in dev environment,
    // for it will create a cached version of your app,
    // preventing you to see the modifications you make to the app.
    // (unless you manually remove localStorage['manifest'] and localStorage['manifest.digest'])

    if (typeof cordova != 'undefined' && !DEV_ENVIRONMENT) {
        CordovaAppUpdater.switchToUpdatedVersion();
    }

    DeviceReadyDefer.resolve();

    //CordovaAppUpdater.init() may take several seconds on the first run as it copies the files in your app bundle to another directory whick is read/write
    //Returns a promise
    CordovaAppUpdaterInit = CordovaAppUpdater.init();
});

function checkForUpdate() {
    // Only after device is ready and cordova app updater has initiated, do you call CordovaAppUpdater.check()
    Promise.all([DeviceReadyDefer.promise, CordovaAppUpdaterInit]).then(function () {
        CordovaAppUpdater.check().then(function (data) {
            //Result of availability of an update
            //data==false, (when there's no update) or
            //data=={changedFiles: changedFiles, totalSize: totalSize}
            if (data !== false) {
                console.log(data);
                CordovaAppUpdater.onProgress = function (totalDownloaded, totalSize) {
                    console.log('Progress', totalDownloaded, totalSize);
                };
                if (confirm('New update available, ' + (data.totalSize / 1024).toFixed(2) + ' kBs of download, update now?')) {
                    CordovaAppUpdater.download().then(function () {
                        CordovaAppUpdater.apply();
                    })
                }
            } else {
                alert('No Update Available');
            }
        });
    });
}