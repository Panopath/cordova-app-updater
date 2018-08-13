cordova-app-updater
==========
> An easy-to-use, efficient, powerful tool to remote update your cordova app.

## Feature

1. Update any assets (js/css/images/etc.), synchronize your app with its latest version on the server with ease. (Don't have to resubmit it to Apple Store!)
2. Efficient: Only takes less than 150B to check whether an update is available
3. Intelligent: Able to calculate the size of the update, show the download progress, notify when the update is done successfully.
4. Safe: downloads to temp directory first, then merges temp and www. Will not break the app.
5. User-friendly: uses `splashscreen` to hide page reload from users.

## Quick Start

1. Set up `CordovaAppUpdater` and all its dependencies

2. Write some code to use `CordovaAppUpdater` 
	```javascript
	window.CordovaAppUpdater = new CordovaAppUpdater({
		server_url: 'http://114.215.159.185/update/',
		indexHtmlName: 'index.html'
	});
	
	document.addEventListener('deviceready', function () {
			CordovaAppUpdater.switchToUpdatedVersion();
			CordovaAppUpdater.init().then(function(){
				CordovaAppUpdater.check().then(function (data) {
					if (data !== false) {
						CordovaAppUpdater.download().then(function () {
							CordovaAppUpdater.apply();
						})
				});
			});
	```
(Abbreviated version, for a full demo, see [index.js](https://github.com/KevinWang15/cordova-app-updater/blob/master/www/js/index.js))

3. Use `grunt genManifest` to generate `manifest.json` and `manifest.digest.json`

4. Upload the whole `/www` folder to server

5. When you've made modifications to the app, repeat step 3. and 4.

6. The app will check for update and update itself every time it is run.

## More tips

1. In order for `CordovaAppUpdater` to work properly, you should add
	```html
	<meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline' 'unsafe-eval' http: https: data: blob: filesystem: cdvfile: file: gap:;">
	```
	to `index.html`.

2. You should also add 
	```xml
	<access origin="*" />
	<allow-navigation href="*://*/*"/>
	```
	to `config.xml`

3. `CordovaAppUpdater` uses `window.navigator.splashscreen.show();` and  `window.navigator.splashscreen.hide();` to hide page reload from user, in order for this feature to work properly, add
	```xml
	<preference name="AutoHideSplashScreen" value="false" />
	```
	to `config.xml`

4. Put a `.htaccess` in your www folder and configure Apache, so that `Access-Control-Allow-Origin "*"` will be set.

## Dependency

1. [cordova-plugin-file](https://github.com/apache/cordova-plugin-file)
2. [cordova-plugin-file-transfer](https://github.com/apache/cordova-plugin-file-transfer)
3. [cordova-plugin-splashscreen](https://github.com/apache/cordova-plugin-splashscreen)
4. [cordova-plugin-whitelist](https://github.com/apache/cordova-plugin-whitelist)
5. [grunt](https://www.npmjs.com/package/grunt) [crypto](https://www.npmjs.com/package/crypto) [path](https://www.npmjs.com/package/path)
6. [jQuery](https://github.com/jquery/jquery)
7. [bluebird](https://github.com/petkaantonov/bluebird)

## Demo

```bash
git clone https://github.com/KevinWang15/cordova-app-updater.git
cd cordova-app-updater
cordova platform add android
cordova plugin add cordova-plugin-file
cordova plugin add cordova-plugin-file-transfer
cordova plugin add cordova-plugin-splashscreen
cordova plugin add cordova-plugin-whitelist
cordova run android
```

## Methods

### CordovaAppUpdater.switchToUpdatedVersion();

Loads the newest, cached version of the app.

**this function should be called right after `'deviceready'`**

Disable it in dev environment, or you will not be able to the modifications in real-time (You will have to upload changes to the server and update the app to see modifications, you wouldn't want the extra trouble, would you).

### CordovaAppUpdater.init();

**this function should be called after `'deviceready'`**

Loads local manifest, prepares the file system, on first run, it also copies the bundled files to the cached directory.


### CordovaAppUpdater.check();

**this function should be called after `'CordovaAppUpdater.init()'`**

Checks the server-side version for update, calculates list of changed files and the size of the update.


### CordovaAppUpdater.download();

**this function should be called after `'CordovaAppUpdater.check()'`**

Downloads the update to the cached folder, and informs of the progress with `CordovaAppUpdater.onProgress` callback.


### CordovaAppUpdater.apply();

**this function should be called after `'CordovaAppUpdater.download()'`**

Apply the update (reloads the page).

## Callbacks

### CordovaAppUpdater.updateSuccessful()
No parameters, you can use this callback to display a notification to the user.
### CordovaAppUpdater.onProgress(totalDownloaded, totalSize)
After invoking `CordovaAppUpdater.download()`, this callback will inform you of the download progress.

## Rollback

```javascript
delete localStorage['manifest'];
delete localStorage['manifest.digest'];
```

Then restart your app (don't refresh, RESTART!).
(Corrupt update prevention/automatic rollback to be added soon, pull requests appreciated)

## Android optimization

Copy `plugins/cordova-plugin-file/src/android/build-extras.gradle` to `platforms/android`
https://github.com/apache/cordova-plugin-file#slow-recursive-operations-for-android_asset

run `CordovaAppUpdater.switchToUpdatedVersion()` the moment `'deviceReady'` is received

## Caution
Do not put any hidden files/directories (files/directories starting with ```.```) in your ```/www``` directory. It may result in weird FileError (error code 1 - File Not Found).

## iCloud backup
Before uploading to app store for review, you should disable iCloud auto sync.
Modify ```AppDelegate.m```, Find 

	/** If you need to do any extra app-specific initialization, you can do it here
     *  -jm
     **/
     
Add the following code:

	
    NSString* doc = [NSSearchPathForDirectoriesInDomains(NSDocumentDirectory, NSUserDomainMask, YES) objectAtIndex:0];
    NSString* lib = [NSSearchPathForDirectoriesInDomains(NSLibraryDirectory, NSUserDomainMask, YES) objectAtIndex:0];
    
    float version = [[[UIDevice currentDevice] systemVersion] floatValue];
    
    if (version < 5.1)
    {
        u_int8_t b = 1;
        setxattr([doc fileSystemRepresentation], "com.apple.MobileBackup", &b, 1, 0, 0);
        setxattr([lib fileSystemRepresentation], "com.apple.MobileBackup", &b, 1, 0, 0);
    }
    else
    {
        NSError *error = nil;
        
        NSURL* url = [NSURL fileURLWithPath:doc];
        BOOL success=[url setResourceValue: [NSNumber numberWithBool: YES] forKey: NSURLIsExcludedFromBackupKey error: &error];
        if(!success){
            NSLog(@"Error excluding %@ from backup %@", [url lastPathComponent], error);
        }else{
            NSLog(@"successful");
        }
        
        url = [NSURL fileURLWithPath:lib];
        success=[url setResourceValue: [NSNumber numberWithBool: YES] forKey: NSURLIsExcludedFromBackupKey error: &error];
        if(!success){
            NSLog(@"Error excluding %@ from backup %@", [url lastPathComponent], error);
        }else{
            NSLog(@"successful");
        }
    }
    

Also, add

    #include <sys/xattr.h>
