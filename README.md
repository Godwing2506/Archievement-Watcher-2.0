**⚠️ NB: The cache server was shutdown over a year ago.<br />
You need a Steam Web API key for the app to be able to fetch data from Steam.<br />
You can acquire one [by filling out this form](https://steamcommunity.com/dev/apikey).<br />
Enter your key in `Settings > Advanced`.**

<hr />

A sexy achievement file parser with real-time notification, automatic screenshot and playtime tracking.<br />
View every achievement earned on your PC whether it's coming from Steam, a Steam emulator, and more.<br />
To see the full list of what this app can import please see the [**Wiki/Compatibility**](https://github.com/xan105/Achievement-Watcher/wiki/Compatibility).

<table >
<tr>
<td align="left"><img src="https://github.com/xan105/Achievement-Watcher/raw/1.x/screenshot/home.png" width="400px"></td>
<td align="left"><img src="https://github.com/xan105/Achievement-Watcher/raw/1.x/screenshot/ach_view.png" width="400px"></td>
</tr>
</table>

The original idea behind this app was that some steam emulators generate a text file where your unlocked achievements are stored. 
But they aren't very friendly to know which is which, here is an example :
```ini
[NEW_ACHIEVEMENT_1_1]
Achieved=1
CurProgress=0
MaxProgress=0
UnlockTime=0000000000
[SteamAchievements]
00000=NEW_ACHIEVEMENT_1_1
Count=1
```
So which achievement is NEW_ACHIEVEMENT_1_1 ? You'll have to ask the steam API or look online in a site like the steamdb to find out.
So let's just do that automagically :)

Notification on achievement unlocking
==========================================

Not as sexy as a directX Overlay but it's the next best thing.<br />
Display a notification when you unlock an achievement via<br />
- [Toast notification](https://github.com/xan105/Achievement-Watcher/wiki/Toast-notification) (Windows 8 / 10)
- [Websocket](https://github.com/xan105/Achievement-Watcher/wiki/Websocket-Notification-'API') (Usage example: Twitch overlay) 
- [GNTP (Growl)](https://github.com/xan105/Achievement-Watcher/wiki/GNTP-(Growl-Notification-Transport-Protocol)) (Recommended for Windows 7)

⚠️ **Please verify your system settings for this to work properly**. [More info](https://github.com/xan105/Achievement-Watcher/wiki/Toast-notification#windows-settings)<br />
You can test notification in Settings > Debug to make sure your system is correctly configured or seems to be.<br />
There is a lot of things to check so make sure to have a look at the [wiki](https://github.com/xan105/Achievement-Watcher/wiki/Notification-%22Not-Working%22) before asking for help.

<p align="center">
  <img src="https://github.com/xan105/Achievement-Watcher/raw/1.x/screenshot/live.gif">
</p>

📸 If you have enabled the *souvenir* option(s) then a screenshot and/or video will be taken when you unlock an achievement.<br />

Adding a Steam AppID manually
=============================

Use **Add AppID** above the game list to add a Steam game that the automatic scanners did not find. The AppID is saved in `cfg/manual-appids.json` and included in backups. A manually added game shows its achievement list; unlocked progress still depends on an available local or Steam achievement source.

Automatic backups
=================

In **Settings > Backup**, select a folder that is already synchronized by OneDrive, Dropbox, Google Drive, or another cloud provider, then enable automatic backups. Achievement Watcher creates an initial backup immediately and creates another after its managed settings and local achievement data change. It keeps the 10 most recent automatic backup files in that folder; the provider's own app is responsible for syncing them.

Automatic backups include the app's settings, local Steam/Uplay caches, and tracked playtime. They do not include original achievement files in game or emulator folders, external screenshots/videos, or logs. Restore a backup manually from **Settings > Backup**. Backup ZIP files are not encrypted as a whole, so protect access to the selected cloud account. The displayed success status confirms that a backup was saved locally, not that the provider has uploaded it.

📖 Wiki and troubleshoot
========================

There is a lot to say about this app. So for more info, configuration, troubleshoot, common issues etc ...<br />
Please kindly see the [Wiki](https://github.com/xan105/Achievement-Watcher/wiki), thank you.

Translation Help
================

I do my best to translate everything for every supported language by Steam, but it's rather difficult and I don't speak that much languages.<br />
Fluent in another language ? Any help to add/modify/improve would be greatly appreciated.

More details [here](https://github.com/xan105/achievement-watcher/tree/1.x/app/locale)

How to build
============

### Prequisites:

You will need **Node.js 20.x** (LTS) in x64 with NPM installed (used by app, watchdog and updater).<br/>
**Inno Setup 7 or 6** unicode with preprocessor and [Inno Download Plugin](https://mitrichsoftware.wordpress.com/inno-setup-tools/inno-download-plugin/) (building the setup)<br/>

For Node.js you globally need asar and json :<br/>
```
npm install -g asar json
```

There will be some native_module to compile so you'll need :<br/>
VS2017 / C++ build tools, Python ~2.7~ 3.x (node-gyp), and the Windows SDK **10.0.17134.0** (1803 Redstone 4)

### Build:

Install `node_modules` folders with `npm install.cmd`<br/>
or do it yourself with `npm ci` in `/app`, `/service/updater` and `/service/watchdog`.<br/>
Use `buildme.cmd` in the root folder to build.

### Notes: 

+ Most of the native code is now shipped as prebuilt binaries. If you want to compile them yourself I invit you to check out their corresponding repo.<br/>
NB: Golang cgo requires a gcc compiler installed and set in PATH (recommended : http://tdm-gcc.tdragon.net/download).

+ `buildme.cmd` searches for `ISCC.exe` in standard Inno Setup 7, 6, and 5 installation paths, then in `PATH`.

+ If NPM gives you trouble, inspect the error and rerun `npm ci` in the affected package. Keep its `package-lock.json` unless you have a specific reason to regenerate it.

Legal
=====

⚠️ **Software provided here is purely for informational purposes and does not provide nor encourage illegal access to copyrighted material.**<br />

Software provided here is to be use at your own risk. This is provided as is without any express or implied warranty.<br />
In no event or circumstances will the authors or company be held liable for any damage to yourself or your computer that may arise from the installation or use of the free software aswell as his documentation that is provided on this website.<br />
And for anything that may occur as a result of your use, or inability to use the materials provided via this website.<br />

Software provided here is not affiliated nor associated with any cracking scene groups.<br />

Software provided here is not affiliated nor associated with Steam, © Valve Corporation, Uplay, © Ubisoft and data from theirs API is provided as is without any express or implied warranty.<br />

Other trademarks, copyright are the property of their respective owners. No copyright or trademark infringement is intended by using third-party resources. Except where otherwise specified, the contents of this project is subject to copyright.<br />
