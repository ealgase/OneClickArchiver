## OneClickArchiver
This is a [userscript](https://en.wikipedia.org/wiki/Wikipedia:User_scripts) designed to simplify archiving sections on talkpages on English Wikipedia. When enabled, it adds an "Archive" link to each section; if you click this link, the section will be archived.

You need to have archiving configuration set up for the script to be enabled. The following are currently supported:
1. {{[User:MiszaBot/config](https://en.wikipedia.org/wiki/User:MiszaBot/config)}}
2. {{[User:ClueBot III/Archive This](https://en.wikipedia.org/wiki/User:ClueBot_III/ArchiveThis)}}
3. {{[Archive basics](https://en.wikipedia.org/wiki/Template:Archive_basics)}}
4. {{[User:Hazard-Bot/Archiver](https://www.wikidata.org/wiki/User:Hazard-Bot/Archiver)}}

If multiple templates are present, the first one in this list is used (i.e. MiszaBot config is preferred over ClueBot III).

### Installation
See [https://en.wikipedia.org/wiki/User:Elli/OneClickArchiver](the documentation page on English Wikipedia).

If you want to install on a different wiki, add the following to your `common.js`:
```javascript
mw.loader.load('//en.wikipedia.org/w/index.php?title=User:Elli/OneClickArchiver.js&action=raw&ctype=text/javascript');
```

### History
This script was originally written by Equazcion in 2013 (https://en.wikipedia.org/wiki/User:Equazcion/OneClickArchiver.js). It was then forked and expanded by Technical 13 in 2014/2015 (https://en.wikipedia.org/wiki/User:Technical_13/Scripts/OneClickArchiver.js). Then, it was forked and updated by Evad37 in 2017 (https://en.wikipedia.org/wiki/User:Evad37/OneClickArchiver.js). This script was forked from Evan37's version in 2024.

MediaWiki changes broke old versions of the script. In addition, old versions of the script relied heavily on regexes to try to determine archive location, and would archive posts to a default location when it couldn't read the archiving configuration (often leading to confusion). These issues have, for the most part, been fixed in this script.

### Development
Clone this repository and run `node dev-server.js`. Then add the following to your `common.js`:
```javascript
mw.loader.load( "http://localhost:8080/OneClickArchiver.js" );
```
Make sure you've removed your regular import of the script. When you save changes you've made to the script locally, reloading the page will load the newest script version. I suggest doing development on [Test Wikipedia](https://test.wikipedia.org) to avoid making many pointless edits on a project people actually care about (which would require a moderate amount of cleanup).

### License
The original script (and its forks) are licensed under the **Creative Commons Attribution-ShareAlike 4.0 License** (as it was posted to Wikipedia). My contributions to this script are additionally licensed under CC0.