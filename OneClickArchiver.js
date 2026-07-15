/**
 * Derived from Evad37's [1] version of Technical 13's version [2] of Equazcion's OneClickArchiver [3]
 * [1] < https://en.wikipedia.org/wiki/User:Evad37/OneClickArchiver.js >
 * [2] < https://en.wikipedia.org/wiki/User:Technical_13/Scripts/OneClickArchiver.js >
 * [3] < https://en.wikipedia.org/wiki/User:Equazcion/OneClickArchiver.js >
 */
// <nowiki>

// configuration and i18n
i18n_archive_link_text = 'Archive';
i18n_archive_to_text = 'Archive to:';

if (!window.OCALinkSize){
	linkSize = 0.6;
} else{
	linkSize = window.OCALinkSize;
}

// utility functions
// these are all purely functional
function findTemplateInPageRaw(pageText, templateName){
    const escapedName = templateName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    // parsing a CFL with a regex is nasty, but you gotta do what you gotta do
    const templateRegex = new RegExp(
        `(\\{\\{\\s*${escapedName}\\s*\\|)((?:[^{}]|\\{\\{(?:[^{}]|\\{\\{[^{}]*\\}\\})*\\}\\})*)(\\}\\})`, 
        'i'
    );

    const match = pageText.match(templateRegex);
    
    if (!match) {
        return null; // couldn't parse
    }

    return match;
}

function findTemplateInPage(pageText, templateName){
    const match = findTemplateInPageRaw(pageText, templateName);
    if (!match) return null;
    return match[2];
}

function parseTemplateParamsRaw(inputTemplateString) {
    const params = [];
    let currentParam = '';
    let braceDepth = 0;

    // this is also much uglier because it handles nesting. oh well
    for (let i = 0; i < inputTemplateString.length; i++) {
        const char = inputTemplateString[i];
        
        if (char === '{' && inputTemplateString[i + 1] === '{') {
            braceDepth++;
            currentParam += '{{';
            i++; // skip next brace
        } else if (char === '}' && inputTemplateString[i + 1] === '}') {
            braceDepth--;
            currentParam += '}}';
            i++; // skip next brace
        } else if (char === '|' && braceDepth === 0) {
            params.push(currentParam);
            currentParam = '';
        } else {
            currentParam += char;
        }
    }
    if (currentParam) {
        params.push(currentParam);
    }
    return params; // these still have whitespace
}

function parseTemplateParams(inputTemplateString) {
    const params = parseTemplateParamsRaw(inputTemplateString);

    // strip whitespace
    const result = {};
    params.forEach(param => {
        const eqIndex = param.indexOf('=');
        if (eqIndex !== -1) {
            const key = param.substring(0, eqIndex).trim();
            const value = param.substring(eqIndex + 1).trim();
            if (key) {
                result[key] = value;
            }
        }
    });

    return result;
}

function updateTemplateParamInPage(pageText, templateName, targetKey, newValue){
    const [fullMatch, prefix, content, suffix] = findTemplateInPageRaw(pageText, templateName);
    console.log(pageText);
    console.log(templateName);
    console.log(findTemplateInPageRaw(pageText, templateName));
    const params = parseTemplateParamsRaw(content);
    let keyFound = false;
    const updatedParams = params.map(param => {
        const eqIndex = param.indexOf('=');
        if (eqIndex !== -1) {
            const key = param.substring(0, eqIndex).trim();
            if (key === targetKey) {
                keyFound = true;
                // preserve spacing around = sign
                const beforeEq = param.substring(0, eqIndex);
                const afterEq = param.substring(eqIndex + 1);
                const spaceMatch = afterEq.match(/^(\s*)/);
                const leadingSpaces = spaceMatch ? spaceMatch[1] : '';
                
                // preserve newlines and whitespace
                const trailingSpaceMatch = afterEq.match(/(\s*)$/);
                const trailingSpaces = trailingSpaceMatch ? trailingSpaceMatch[1] : '';
                
                return `${beforeEq}=${leadingSpaces}${newValue}${trailingSpaces}`;
            }
        }
        return param;
    });

    // if we didn't find the key, we append it
    if (!keyFound) {
        let indentation = '\n| ';
        if (params.length > 0) {
            const lastIndex = updatedParams.length - 1;
            const lastParam = updatedParams[lastIndex];
            
            updatedParams[lastIndex] = lastParam.trimEnd();

        }
        updatedParams.push(`${indentation}${targetKey} = ${newValue}\n`);
    }

    // rebuild template and substitute it in
    const updatedTemplate = prefix + updatedParams.join('|') + suffix;
    return pageText.replace(fullMatch, updatedTemplate);
}

mw.loader.using(['mediawiki.util', 'mediawiki.api'], async function() {

var config = mw.config.get([
	'debug',
	'wgAction',
	'wgArticleId',
	'wgCategories',
	'wgMonthNames',

	'wgNamespaceNumber',
	'wgPageName',
	'wgRelevantUserName'
]);


function determinePageArchivability(){
    const categories = config.wgCategories;
    const noManualArchivingCategoryName = 'Pages that should not be manually archived';
    const nonTalkSignedCategoryName = 'Non-talk pages that are automatically signed';

    if (categories.includes(noManualArchivingCategoryName)) return false; // manual archiving disabled
    if (categories.includes(nonTalkSignedCategoryName)) return true; // category for talk-like pages
    if (Boolean(document.querySelector( '#ca-addsection' ))) return true; // only present on talkpages
    return false // fallback
}

async function archiveThis(sectionNumber, archiveName, archivePageSize, sectionName, archiveConfig) {
    const mSection = 'retrieving section content...';
    const mPosting = '<span style="color: #004400">Content retrieved,</span> performing edits...';
    const mPosted = '<span style="color: #008800">Archive appended...</span>';
    const mCleared = '<span style="color: #008800">Section cleared...</span>';
    const mReloading = '<span style="color: #000088">All done! </span><a href="#archiverLink" onClick="javascript:location.reload();" title="Reload page">Reloading</a>...';

    document.body.insertAdjacentHTML(
        'beforeend', 
        '<div class="overlay" style="background-color: #000000; opacity: 0.4; position: fixed; top: 0px; left: 0px; width: 100%; height: 100%; z-index: 500;"></div>'
    );

    document.body.insertAdjacentHTML(
        'afterbegin', 
        '<div class="arcProg" style="font-weight: bold; box-shadow: 7px 7px 5px #000000; font-size: 0.9em; line-height: 1.5em; z-index: 501; opacity: 1; position: fixed; width: 50%; left: 25%; top: 30%; background: #F7F7F7; border: #222222 ridge 1px; padding: 20px;"></div>'
    );

    const arcProg = document.querySelector('.arcProg');

    arcProg.insertAdjacentHTML(
        'beforeend', 
        `<div>Archive name <span style="font-weight: normal; color: #003366;">${archiveName}</span> <span style="color: darkgreen;">found</span>, ${mSection} (${archivePageSize}b)</div>`
    );

    const pageid = config.wgArticleId;

    const api = new mw.Api();
    const sectionResponse = await api.get({
        action: 'query',
        pageids: pageid,
        rvsection: sectionNumber,
        prop: [ 'revisions', 'info' ],
        rvprop: 'content',
        indexpageids: 1,
        rawcontinue: ''
    });

    var sectionContent = sectionResponse.query.pages[ pageid ].revisions[ 0 ][ '*' ];
    $( '.arcProg' ).append( '<div>' + mPosting + '</div>' );

    var dnau = sectionContent.match( /<!-- \[\[User:DoNotArchiveUntil\]\] ([\d]{2}):([\d]{2}), ([\d]{1,2}) (January|February|March|April|May|June|July|August|September|October|November|December) ([\d]{4}) \(UTC\) -->/ );
    var dnauDate;
    if ( dnau === null || dnau === undefined ) {
        dnauDate = Date.now();
        dnau = null;
    } else {
        dnau = dnau[ 1 ] + ':' + dnau[ 2 ] + ' ' + dnau[ 3 ] + ' ' + dnau[ 4 ] + ' ' + dnau[ 5 ];
        dnauDate = new Date( dnau );
        dnauDate = dnauDate.valueOf();
    }

    if ( dnauDate > Date.now() ) {
        $( '.arcProg' ).remove();
        $( '.overlay' ).remove();
        var dnauAbortMsg = '<p>This section has been marked \"Do Not Archive Until\" ' + dnau + ', so archiving was aborted.<br /><br /><span style="font-size: larger;">Please, see <a href="/wiki/User:Elli/OneClickArchiver" title="User:Elli/OneClickArchiver">the documentation</a> for details.</span></p>';
        mw.notify( $( dnauAbortMsg ), { title: 'OneClickArchiver aborted!', tag: 'OCAdnau', autoHide: false } );
        return;
    }

    if ( archivePageSize <= 0  ) {
        sectionContent = archiveHeader + '\n\n' + sectionContent;
        mPosted = '<span style="color: #008800">Archive created...</span>';
    } else {
        sectionContent = '\n\n{{Clear}}\n' + sectionContent;
    }

    if ( dnau != null ) {
        sectionContent = sectionContent.replace( /<!-- \[\[User:DoNotArchiveUntil\]\] ([\d]{2}):([\d]{2}), ([\d]{1,2}) (January|February|March|April|May|June|July|August|September|October|November|December) ([\d]{4}) \(UTC\) -->/g, '' );
    }

    await api.postWithToken( 'edit', {
        action: 'edit',
        title: archiveName,
        appendtext: sectionContent,
        summary: '/* '+sectionName+' */ archived using [[User:Elli/OneClickArchiver|OneClickArchiver]])'
    });
    
    $( '.arcProg' ).append( '<div class="archiverPosted">' + mPosted + '</div>' );
    new mw.Api().postWithToken( 'edit', {
        action: 'edit',
        section: sectionNumber,
        pageid: pageid,
        text: '',
        summary: '[[User:Elli/OneClickArchiver|OneClickArchived]] "' + sectionName + '" to [[' + archiveName + ']]'
    } ).done( function () {
        arcProg.insertAdjacentHTML(
            'beforeend', 
            `<div>Updating archive config if needed...</div>`
        );
        archiveConfig.updateConfigIfNeeded(pageid);
        location.reload();
    } );
}

function addArchiveLinks(headerLevel, archiveName, archivePageSize, archiveConfig){
    document.querySelectorAll('div.mw-heading' + headerLevel).forEach(function(sectionHeadingDiv) {
        const sectionHeadingElement = sectionHeadingDiv.querySelector('h' + headerLevel);

        const sectionName = sectionHeadingElement.textContent;

        // get the section number
        const editSectionURL = sectionHeadingDiv.querySelector('.mw-editsection a:not(.mw-editsection-visualeditor)').getAttribute('href'); // we don't want the visualeditor link, if it's there

        const urlParams = new URLSearchParams(editSectionURL);
        const section = urlParams.get('section');

        var sectionNumber = 0;
        if (section && !section.includes('T')) { // we don't want transcluded sections
            sectionNumber = parseInt(section, 10);
        } else{ return };

        // build our button
        const archiveButtonWrapper = document.createElement('div');
        archiveButtonWrapper.style.fontSize = linkSize + 'em';
        archiveButtonWrapper.style.fontWeight = 'bold';
        archiveButtonWrapper.style.float = 'right';
        archiveButtonWrapper.innerHTML = ` | `;

        const archiveButton = document.createElement('a');
        archiveButton.href = '#archiverLink';
        archiveButton.class = 'archiverLink';
        archiveButton.id = sectionNumber;
        archiveButton.title = `${i18n_archive_to_text} ${archiveName}`
        archiveButton.innerText = i18n_archive_link_text;

        archiveButton.addEventListener('click', function(e){
            e.preventDefault();
            archiveThis(sectionNumber, archiveName, archivePageSize, sectionName, archiveConfig);
        })

        archiveButtonWrapper.append(archiveButton);
        sectionHeadingDiv.append(archiveButtonWrapper);
    });
}

// this is an abstract class -- need to implement details for each type of bot config
class archiveBotConfig{
    constructor(counter, archivePageHeader, headerLevel){
        this.counter = counter;
        if (!counter) this.counter = 1;
        this.archivePageHeader = archivePageHeader;
        this.headerLevel = headerLevel;
    }

    getCurrentArchiveName(){ // for getting the CURRENT archive -- this doesn't require any HTTP request; just string substitution
        throw new Error("You must implement this method!")
    }

    getArchiveNameToWrite(currentArchiveBytes, currentArchiveSections){ // for getting the archive we are actually going to write to. this requires details from the current archive
        throw new Error("You must implement this method!")
    }

    updateConfigIfNeeded(){
        throw new Error("You must implement this method!")
    }
}

// this is used for Misza-compatible bots (e.g. Hazard-Bot on Wikidata)
class archiveBotConfigMisza extends archiveBotConfig{
    // utility function for properly parsing strings like 100B, 100K, 100M, etc.
    _parseToBytes(sizeString){
        if (typeof sizeString !== 'string') return null; // not a string? (this shouldn't be possible)
        const cleanStr = sizeString.trim().toUpperCase();
        const match = cleanStr.match(/^(\d+(?:\.\d+)?)\s*([KMGTPB]?)$/);
        if (!match) return null; // couldn't parse
        const value = parseFloat(match[1]);
        const unit = match[2];
        const multipliers = {
            '': 1,
            'B': 1,
            'K': 1e3,
            'M': 1e6,
            'G': 1e9, // hopefully we won't need anything bigger than this
        };
        return value * (multipliers[unit] || 1);
    }

    _applyPythonTemplateSubstitutions(inputTemplate, counter){
        const now = new Date();
        const thisMonthNum = now.getMonth() + 1; // This returns something 0-11, but we want 1-12.
        const thisYear = now.getFullYear();

        /*
        year, month, month02d, monthname, and monthnameshort are commonly supported by bots
        quarter is supported by Hazard-Bot
        Hazard-Bot also supports isoyear, week, and isoweek, but I found no evidence of use of any of these on Wikidata, so have not implemented (since I have no page to test these with).
        */
        const thisMonthFullName = config.wgMonthNames[ thisMonthNum ];
        const monthNamesShort = [ "", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec" ];
        const thisMonthShortName = monthNamesShort[ thisMonthNum ];
        const thisQuarter = Math.ceil(thisMonthNum/4);

        const values = {
            year: thisYear,
            month: thisMonthNum,
            monthname: thisMonthFullName,
            monthnameshort: thisMonthShortName,
            quarter: thisQuarter,
            counter: counter
        };

        // will capture anything that looks like a Python variable placeholder
        const placeholderRegex = /%\((\w+)\)(0?\d+)?([ds])/g;

        return inputTemplate.replace(placeholderRegex, (match, key, pad, type) => {
            // if we don't have something for this placeholder, skip
            if (!(key in values)) return match;

            let val = String(values[key]);

            // handling for padding
            if (pad) {
                const padChar = pad.startsWith('0') ? '0' : ' ';
                const padLength = parseInt(pad, 10);
                val = val.padStart(padLength, padChar);
            }

            return val;
        });

    }

    constructor(counter, archiveheader, archive, maxarchivesize, templateName, pageText){
        const headerLevel = 2; // MiszaBot doesn't support custom headerlevels
        super(counter, archiveheader, headerLevel);
        this.pageText = pageText;
        this.templateName = templateName;
        this.parsedCounter = counter; // super makes sure counter is a valid number to avoid "Archive undefined". but we store this separately to know if our template is broken.
        this.archivePythonTemplate = archive;
        this.archiveSizeLimitType = null;
        if (maxarchivesize.endsWith("T")){
            this.archiveSizeThreadLimit = parseInt(maxarchivesize.slice(0, -1));
            if (this.archiveSizeThreadLimit) this.archiveSizeLimitType = "threads"; // if we fail to parse then we keep the null value
        } else {
            this.archiveSizeByteLimit = this._parseToBytes(maxarchivesize);
            if (this.archiveSizeByteLimit) this.archiveSizeLimitType = "bytes"; // if we fail to parse then we keep the null value
        }
    }

    getCurrentArchiveName(){
        return this._applyPythonTemplateSubstitutions(this.archivePythonTemplate, this.counter);
    }

    getArchiveNameToWrite(currentArchiveBytes, currentArchiveSections){
        this.toWriteCounter = this.counter;
        if (this.archiveSizeLimitType === "threads" ){
            if (currentArchiveSections >= this.archiveSizeThreadLimit){
                this.toWriteCounter++;
            }
        } else if (this.archiveSizeLimitType === "bytes") {
            if (currentArchiveBytes >= this.archiveSizeByteLimit){
                this.toWriteCounter++;
            }
        }
        return this._applyPythonTemplateSubstitutions(this.archivePythonTemplate, this.toWriteCounter);
    }

    updateConfigIfNeeded(pageid){
        const newContent = updateTemplateParamInPage(this.pageText, this.templateName, "counter", this.toWriteCounter);
        if (newContent != this.pageText){
            new mw.Api().postWithToken( 'edit', {
                action: 'edit',
                section: 0,
                pageid: pageid,
                text: newContent,
                summary: '[[User:Elli/OneClickArchiver|OneClickArchiver]] updating counter.'
            });
        }
    }

}

// look for MiszaBot configuration and parse it if it exists
function parseMiszaBotConfig(pageText){    

    const templateName = "User:MiszaBot/config";
    const content = findTemplateInPage(pageText, templateName);
    const config = parseTemplateParams(content);
    // params we care about:
    // archive - template for archive page name
    // counter - current number for last archive - used for %(counter)d variable
    // maxarchivesize - max size before rolling over to new archive. can either be like 256M/256K/256B or 10T for threads
    // archiveheader - header for new archive pages. defaults to {{Archive}}

    return new archiveBotConfigMisza(config.counter, config.archiveheader, config.archive, config.maxarchivesize, templateName, pageText);
}


$( document ).ready( async function () {
	if ( determinePageArchivability() ) {
		var OCAstate = mw.user.options.get( 'userjs-OCA-enabled', 'true' );
		var pageid = config.wgArticleId;
		var errorLog = { errorCount: 0 };
		new mw.Api().get( {
			action: 'query',
			prop: [ 'revisions', 'info' ],
			rvsection: 0,
			rvprop: 'content',
			pageids: pageid,
			indexpageids: 1,
			rawcontinue: ''
		} ).done( async function ( response0 ) {
			var archiveNum;
			
			const content0 = response0.query.pages[ pageid ].revisions[ 0 ][ '*' ];

            const archiveConfig = parseMiszaBotConfig(content0);

            const currentArchiveName = archiveConfig.getCurrentArchiveName();

            const api = new mw.Api();
            const [ currentArchivePageData, currentArchivePageParse ] = await Promise.all([
                api.get({ // this is for page byte size
                    action: 'query',
                    prop: 'revisions',
                    rvlimit: 1,
                    rvprop: [ 'size', 'content' ],
                    titles: currentArchiveName,
                    list: 'usercontribs',
                    uclimit: 1,
                    ucprop: 'timestamp',
                    ucuser: config.wgRelevantUserName || 'Example',
                    rawcontinue: '',
                }),
                api.get({ // this is for number of sections
                    action: 'parse',
                    page: currentArchiveName,
                    prop: 'tocdata',
                }).catch( error => {
                    // catch if page doesn't exist
                    if ( error === 'missingtitle' ) {
                        return { parse: { tocdata: { sections: [] } } };
                    }
                    // otherwise, it's a real error
                    throw error;
                })
            ]);

            const page = Object.values( currentArchivePageData?.query?.pages || {} )[0];
            const currentArchiveBytes = parseInt( page?.revisions?.[ 0 ]?.size, 10 ) || -1;

            const sections = currentArchivePageParse?.parse?.tocdata?.sections || [];
            const TOClevel = archiveConfig.headerLevel - 1; // TOC level is one below headings generally (i.e. h2 is at the top level)
            const currentArchiveSections = sections.filter( s => parseInt(s.tocLevel, 10) === TOClevel ).length;

            const archivePageToWrite = archiveConfig.getArchiveNameToWrite(currentArchiveBytes, currentArchiveSections);

            addArchiveLinks(archiveConfig.headerLevel, archivePageToWrite, currentArchiveBytes, archiveConfig);

		} );

		var linkTextD = '1CA is on', linkDescD = 'Disable OneClickArchiver';
		var linkTextE = '1CA is off', linkDescE = 'Enable OneClickArchiver';
		var linkText = linkTextD, linkDesc = linkDescD;
		if ( OCAstate === 'false' ) {
			linkText = linkTextE; linkDesc = linkDescE;
			$( 'div.archiverDiv, li#pt-OCA-report' ).css( 'display', 'none' );
		}
		var archiverToggle = mw.util.addPortletLink(
			'p-cactions',
			'#archiverLink',
			linkText,
			'pt-OCA',
			linkDesc,
			'o',
			null
		);
		$( archiverToggle ).click( function ( e ) {
			e.preventDefault();
			/* Toggle the archiveLinks */
			$( 'div.archiverDiv' ).css( 'display', function ( _i, val ) {
				return val === 'none' ? '' : 'none';
			});
			/* Toggle the toggle link */
			$( 'li#pt-OCA a' ).html( function ( _i, val ) {
				return val === linkTextD ? linkTextE : linkTextD;
			});
			/* Toggle the toggle description */
			$( 'li#pt-OCA a' ).attr( 'title', function ( _i, val ) {
				return val === linkDescD ? linkDescE : linkDescD;
			});
			/* Toggle the error report link */
			if ( ( errorLog.counter || errorLog.archiveName ) ) {
				$( 'li#pt-OCA-report' ).css( 'display', function ( _i, val ) {
					return val === 'none' ? '' : 'none';
				});
			}
			/* Toggle default state */
			new mw.Api().postWithToken( 'options', {
				action: 'options',
				optionname: 'userjs-OCA-enabled',
				optionvalue: OCAstate === 'true' ? 'false' : 'true'
			} ).done( function() {
				var resultMsg = 'OneClickArchiver is now ' + ( OCAstate === 'true' ? 'disabled' : 'enabled' ) + ' by default.';
				mw.notify(resultMsg);
				OCAstate = OCAstate === 'true' ? 'false' : 'true';
			} );
		} );
	}
} );

});
// </nowiki>
