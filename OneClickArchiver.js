/**
 * Derived from Evad37's [1] version of Technical 13's version [2] of Equazcion's OneClickArchiver [3]
 * [1] < https://en.wikipedia.org/wiki/User:Evad37/OneClickArchiver.js >
 * [2] < https://en.wikipedia.org/wiki/User:Technical_13/Scripts/OneClickArchiver.js >
 * [3] < https://en.wikipedia.org/wiki/User:Equazcion/OneClickArchiver.js >
 */
// <nowiki>

// configuration and i18n
const ui_strings = {};
ui_strings['en'] = {
    archive_link_text: 'Archive',
    archive_to_text: 'Archive to:',

    oca_status_enabled: 'OCA is enabled.',
    oca_status_disabled_category: 'OCA is disabled: page is in category <a href="/wiki/Category:$1" target="_blank">$1</a>.',
    oca_status_disabled_nottalk: 'OCA is disabled: this does not appear to be a talkpage (consider adding __NEWSECTIONLINK__ or [[Category:Non-talk pages that are automatically signed]]).',
    oca_status_using_template: 'OCA is using configuration from template',
    oca_status_no_config: 'OCA is enabled on this page; however, OCA could not find any existing archiving configuration.',

    oca_loading_init: 'OCA is loading.',
    oca_loading_looking_for_config: 'OCA is looking for configuration.',
    oca_loading_looking_for_archive: 'OCA is looking for the next valid archive page.',
    oca_loading_adding_archive_links: 'OCA is adding archive links.',

    oca_status_heading: 'OneClickArchiver status',

    oca_info_button_name: 'OCA info',
    oca_info_button_description: 'Information about how OneClickArchiver is behaving on this page',

    archivethis_retrieving_content: 'Retrieving section content.',
    archivethis_content_retrieved: 'Section content retrieved.',
    archivethis_dnau_message: 'This section has been marked "Do Not Archive Until" $1, so archiving was aborted.',
    archivethis_dnau_see_docs: 'Please see <a href="/wiki/User:Elli/OneClickArchiver" title="User:Elli/OneClickArchiver" target="_blank">the documentation</a> for details.',
    archivethis_dnau_aborted: 'OneClickArchiver aborted!',
    archivethis_writing_existing_page: 'Writing to existing archive page <a href="/wiki/$1" target="_blank">$1</a>.',
    archivethis_writing_new_page: 'Writing to new archive page <a class="new" href="/wiki/$1" target="_blank">$1</a>.',
    archivethis_es_archived_using: 'archived using [[User:Elli/OneClickArchiver|OneClickArchiver]]',
    archivethis_es_to: 'to',
    archivethis_successfully_added: 'Successfully added to archive. Removing from source page.',
    archivethis_success: 'Successfully removed from source page. Updating archive config if needed...',

}
const ui_lang = window.OCAUILang ?? 'en'; // default to English
const ui_str = ui_strings[ui_lang];
if (!ui_str){alert("You are trying to use OCA with a language that does not exist! Script will not work.")} // fallback to avoid confusion if someone typo'd their language name

const no_manual_archiving_categories = ['Pages that should not be manually archived'];
const automatically_signed_nontalk_categories = ['Non-talk pages that are automatically signed']

var linkSize;
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

function parseTemplateParams(inputTemplateString, dontStripWhitespace) {
    const params = parseTemplateParamsRaw(inputTemplateString);

    // strip whitespace
    const result = {};
    params.forEach(param => {
        const eqIndex = param.indexOf('=');
        if (eqIndex !== -1) {
            const key = param.substring(0, eqIndex).trim();
            const valueBase = param.substring(eqIndex + 1);
            const value = dontStripWhitespace ? valueBase.replace(/^[\r\n]+|[\r\n]+$/g, '') : valueBase.trim();
            if (key) {
                result[key] = value;
            }
        }
    });

    return result;
}

function updateTemplateParamInPage(pageText, templateName, targetKey, newValue){
    const [fullMatch, prefix, content, suffix] = findTemplateInPageRaw(pageText, templateName);
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
        updatedParams.push(`${targetKey} = ${newValue}\n`);
    }

    // rebuild template and substitute it in
    const updatedTemplate = prefix + updatedParams.join('|') + suffix;
    return pageText.replace(fullMatch, updatedTemplate);
}

mw.loader.using(['mediawiki.util', 'mediawiki.api'], async function() {

var OCATagIfAvailable;
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

var OCAStatus, OCALoading;
function determinePageArchivability(){
    const categories = config.wgCategories;

    OCAStatus = ui_str.oca_status_enabled;

    for (const categoryName of no_manual_archiving_categories) {
        if (categories.includes(categoryName)){// manual archiving disabled
            OCAStatus = ui_str.oca_status_disabled_category.replaceAll('$1', noManualArchivingCategoryName);
            return false;
        }
    }

    for (const categoryName of automatically_signed_nontalk_categories) {
        if (categories.includes(categoryName)) return true;
    }

    if (document.querySelector( '#ca-addsection' )) return true; // only present on talkpages
    OCAStatus = ui_str.oca_status_disabled_nottalk;
    return false // fallback
}

async function doesTagExist(tagName) {
    try {
        const response = await new mw.Api().get({
            action: 'query',
            list: 'tags',
            tgprop: 'active|source',
            tgcontinue: tagName,
            tglimit: 1
        });

        const tags = response.query?.tags;

        if (tags && tags.length > 0 && tags[0].name === tagName) {
            const targetTag = tags[0];
            
            return targetTag.active !== undefined && targetTag.source.includes('manual');
        }
        
        return false;
    } catch (error) {
        return false;
    }
}

async function archiveThis(sectionNumber, archiveName, currentArchiveName, sectionName, archiveConfig) {
    document.body.insertAdjacentHTML(
        'beforeend', 
        '<div class="overlay" style="background-color: #000000; opacity: 0.4; position: fixed; top: 0px; left: 0px; width: 100%; height: 100%; z-index: 500;"></div>'
    );

    document.body.insertAdjacentHTML(
        'afterbegin', 
        '<div class="arcProg" style="font-weight: bold; box-shadow: 7px 7px 5px #000000; font-size: 0.9em; line-height: 1.5em; z-index: 501; opacity: 1; position: fixed; width: 50%; left: 25%; top: 30%; background: #F7F7F7; border: #222222 ridge 1px; padding: 20px;"></div>'
    );

    const arcProg = document.querySelector('.arcProg');

    function printMessage(message, color){
        if (!color){color = "black"}
        arcProg.insertAdjacentHTML('beforeend',`<div style="color: ${color}">${message}</div>`);
    }

    const pageid = config.wgArticleId;

    const api = new mw.Api();
    printMessage(ui_str.archivethis_retrieving_content)
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
    printMessage(ui_str.archivethis_content_retrieved, "green");

    var dnau = sectionContent.match( /<!-- \[\[User:DoNotArchiveUntil\]\] ([\d]{2}):([\d]{2}),? ([\d]{1,2}) (January|February|March|April|May|June|July|August|September|October|November|December) ([\d]{4}) \(UTC\) -->/ );
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
        document.querySelectorAll('.arcProg, .overlay').forEach(element => element.remove());
        const dnauAbortMsg = document.createElement('p');
        dnauAbortMsg.innerHTML = `${ui_str.archivethis_dnau_message.replaceAll('$1', dnau)}<br /><br /><span style="font-size: larger;">${ui_str.archivethis_dnau_see_docs}</span>`;
        mw.notify( dnauAbortMsg, { title: ui_str.archivethis_dnau_aborted, tag: 'OCAdnau', autoHide: false } );
        return;
    }

    if ( archiveName == currentArchiveName ) {
        sectionContent = '\n\n{{Clear}}\n' + sectionContent;
        printMessage(ui_str.archivethis_writing_existing_page.replaceAll('$1', archiveName));
    } else {
        sectionContent = archiveConfig.archivePageHeader + '\n\n' + sectionContent;
        printMessage(ui_str.archivethis_writing_new_page.replaceAll('$1', archiveName));
    }

    if ( dnau != null ) {
        sectionContent = sectionContent.replace( /<!-- \[\[User:DoNotArchiveUntil\]\] ([\d]{2}):([\d]{2}), ([\d]{1,2}) (January|February|March|April|May|June|July|August|September|October|November|December) ([\d]{4}) \(UTC\) -->/g, '' );
    }

    await api.postWithToken( 'edit', {
        action: 'edit',
        title: archiveName,
        appendtext: sectionContent,
        summary: `/* ${sectionName} */ ${ui_str.archivethis_es_archived_using}`,
        tags: OCATagIfAvailable
    });
    
    printMessage(ui_str.archivethis_successfully_added, "green");
    await new mw.Api().postWithToken( 'edit', {
        action: 'edit',
        section: sectionNumber,
        pageid: pageid,
        text: '',
        summary: `[[User:Elli/OneClickArchiver|OneClickArchived]] "${sectionName}" ${ui_str.archivethis_es_to} [[${archiveName}]]`,
        tags: OCATagIfAvailable
    })
    printMessage(ui_str.archivethis_success, "green");
    await archiveConfig.updateConfigIfNeeded(pageid);
    location.reload();
}

function addArchiveLinks(headerLevel, archiveName, currentArchiveName, archiveConfig){
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
        } else{ return }

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
        archiveButton.title = `${ui_str.archive_to_text} ${archiveName}`
        archiveButton.innerText = ui_str.archive_link_text;

        archiveButton.addEventListener('click', function(e){
            e.preventDefault();
            archiveThis(sectionNumber, archiveName, currentArchiveName, sectionName, archiveConfig);
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

    getArchiveNameToWrite(currentArchiveBytes, currentArchiveSections, counterExtra){ // for getting the archive we are actually going to write to. this requires details from the current archive
        throw new Error("You must implement this method!")
    }

    async updateConfigIfNeeded(){
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

        return inputTemplate.replace(placeholderRegex, (match, key, pad) => {
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
        if (!archiveheader) archiveheader="{{Archive}}"; // default
        super(counter, archiveheader, headerLevel);
        this.pageText = pageText;
        this.templateName = templateName;
        this.parsedCounter = counter; // super makes sure counter is a valid number to avoid "Archive undefined". but we store this separately to know if our template is broken.
        this.archivePythonTemplate = archive;
        this.archiveSizeLimitType = null;
        if (maxarchivesize?.endsWith("T")){
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

    getArchiveNameToWrite(currentArchiveBytes, currentArchiveSections, counterExtra){
        this.toWriteCounter = parseInt(this.counter) + counterExtra;
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

    async updateConfigIfNeeded(pageid){
        const newContent = updateTemplateParamInPage(this.pageText, this.templateName, "counter", this.toWriteCounter);
        if (newContent != this.pageText){
            await new mw.Api().postWithToken( 'edit', {
                action: 'edit',
                section: 0,
                pageid: pageid,
                text: newContent,
                summary: '[[User:Elli/OneClickArchiver|OneClickArchiver]] updating counter.',
                tags: OCATagIfAvailable
            });
        }
    }

}

// look for MiszaBot configuration and parse it if it exists
function parseMiszaBotConfig(pageText){    
    const templateName = "User:MiszaBot/config";
    const content = findTemplateInPage(pageText, templateName);
    if (!content) return;
    const config = parseTemplateParams(content);
    // params we care about:
    // archive - template for archive page name
    // counter - current number for last archive - used for %(counter)d variable
    // maxarchivesize - max size before rolling over to new archive. can either be like 256M/256K/256B or 10T for threads
    // archiveheader - header for new archive pages. defaults to {{Archive}}

    return new archiveBotConfigMisza(config.counter, config.archiveheader, config.archive, config.maxarchivesize, templateName, pageText);
}

//// other Misza-likes
function parseArchiveBasics(pageText){ // https://en.wikipedia.org/wiki/Template:Archive_basics
    const templateName = "Archive basics";
    const content = findTemplateInPage(pageText, templateName);
    if (!content) return;
    const config = parseTemplateParams(content);
    return new archiveBotConfigMisza(config.counter, config.archiveheader, config.archive, config.maxarchivesize, templateName, pageText);
}
function parseHazardBotConfig(pageText){ // https://www.wikidata.org/wiki/User:Hazard-Bot/Archiver
    const templateName = "User:Hazard-Bot/Archiver";
    const content = findTemplateInPage(pageText, templateName);
    if (!content) return;
    const config = parseTemplateParams(content);
    return new archiveBotConfigMisza(config.counter, config.archiveheader, config.archive, config.maxarchivesize, templateName, pageText);
}

//// end other Misza-likes


// this is used for ClueBot III
class archiveBotConfigClueBotIII extends archiveBotConfig{
    _phpDate(format, timestamp) { // this function was vibecoded (implementing this manually would be a profound waste of time).
        const date = timestamp !== undefined 
            ? (timestamp instanceof Date ? timestamp : new Date(timestamp * 1000)) 
            : new Date();

        // Helper to pad numbers (e.g., 2 -> "02")
        const pad = (val, len = 2) => String(val).padStart(len, '0');

        // Helper to get the day of the year (0-365)
        const getDayOfYear = (d) => {
            const start = new Date(d.getFullYear(), 0, 0);
            const diff = d - start;
            const oneDay = 1000 * 60 * 60 * 24;
            return Math.floor(diff / oneDay) - 1;
        };

        // Helper to get ISO-8601 week number
        const getISOWeek = (d) => {
            const target = new Date(d.valueOf());
            const dayNr = (d.getDay() + 6) % 7;
            target.setDate(target.getDate() - dayNr + 3);
            const firstThursday = target.valueOf();
            target.setMonth(0, 1);
            if (target.getDay() !== 4) {
                target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
            }
            return 1 + Math.ceil((firstThursday - target) / (604800000));
        };

        // Helper for Swatch Internet Time (Biel Mean Time: UTC+1)
        const getSwatchTime = (d) => {
            const time = d.getTime();
            const utc1 = time + (d.getTimezoneOffset() * 60000) + 3600000;
            const bmt = new Date(utc1);
            const beats = Math.floor((bmt.getHours() * 3600 + bmt.getMinutes() * 60 + bmt.getSeconds() + bmt.getMilliseconds() / 1000) / 86.4);
            return pad(beats, 3);
        };

        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

        const formatters = {
            // --- Day ---
            d: d => pad(d.getDate()),
            D: d => days[d.getDay()].substring(0, 3),
            j: d => d.getDate(),
            l: d => days[d.getDay()],
            N: d => d.getDay() === 0 ? 7 : d.getDay(),
            S: d => {
                const j = d.getDate();
                if (j % 10 === 1 && j !== 11) return 'st';
                if (j % 10 === 2 && j !== 12) return 'nd';
                if (j % 10 === 3 && j !== 13) return 'rd';
                return 'th';
            },
            w: d => d.getDay(),
            z: d => getDayOfYear(d),

            // --- Week ---
            W: d => pad(getISOWeek(d)),

            // --- Month ---
            F: d => months[d.getMonth()],
            m: d => pad(d.getMonth() + 1),
            M: d => months[d.getMonth()].substring(0, 3),
            n: d => d.getMonth() + 1,
            t: d => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(),

            // --- Year ---
            L: d => (new Date(d.getFullYear(), 1, 29).getMonth() === 1) ? 1 : 0,
            o: d => {
                const target = new Date(d.valueOf());
                target.setDate(target.getDate() - ((d.getDay() + 6) % 7) + 3);
                return target.getFullYear();
            },
            Y: d => d.getFullYear(),
            y: d => String(d.getFullYear()).slice(-2),

            // --- Time ---
            a: d => d.getHours() >= 12 ? 'pm' : 'am',
            A: d => d.getHours() >= 12 ? 'PM' : 'AM',
            B: d => getSwatchTime(d),
            g: d => d.getHours() % 12 || 12,
            G: d => d.getHours(),
            h: d => pad(d.getHours() % 12 || 12),
            H: d => pad(d.getHours()),
            i: d => pad(d.getMinutes()),
            s: d => pad(d.getSeconds()),
            u: d => pad(d.getMilliseconds() * 1000, 6),
            v: d => pad(d.getMilliseconds(), 3),

            // --- Timezone ---
            e: d => {
                try {
                    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
                } catch (e) {
                    return 'UTC';
                }
            },
            I: d => {
                const jan = new Date(d.getFullYear(), 0, 1).getTimezoneOffset();
                const jul = new Date(d.getFullYear(), 6, 1).getTimezoneOffset();
                return d.getTimezoneOffset() < Math.max(jan, jul) ? 1 : 0;
            },
            O: d => {
                const offset = d.getTimezoneOffset();
                const sign = offset > 0 ? '-' : '+';
                const absOffset = Math.abs(offset);
                return sign + pad(Math.floor(absOffset / 60)) + pad(absOffset % 60);
            },
            P: d => {
                const offset = d.getTimezoneOffset();
                const sign = offset > 0 ? '-' : '+';
                const absOffset = Math.abs(offset);
                return sign + pad(Math.floor(absOffset / 60)) + ':' + pad(absOffset % 60);
            },
            p: d => {
                const offset = d.getTimezoneOffset();
                if (offset === 0) return 'Z';
                const sign = offset > 0 ? '-' : '+';
                const absOffset = Math.abs(offset);
                return sign + pad(Math.floor(absOffset / 60)) + ':' + pad(absOffset % 60);
            },
            T: d => {
                // Abbreviation like EST, GMT, etc. (Approximated from string representation)
                const matches = d.toTimeString().match(/\(([^)]+)\)$/);
                return matches ? matches[1] : 'UTC';
            },
            Z: d => -d.getTimezoneOffset() * 60,

            // --- Full Date/Time ---
            c: d => d.toISOString().replace(/\.\d+Z$/, '') + (d.getTimezoneOffset() === 0 ? 'Z' : formatters.P(d)),
            r: d => d.toUTCString(), // Closest standardized RFC 2822
            U: d => Math.floor(d.getTime() / 1000)
        };

        let result = '';
        for (let i = 0; i < format.length; i++) {
            const char = format[i];
            
            // Handle PHP-style character escaping with backslash
            if (char === '\\') {
                if (i + 1 < format.length) {
                    result += format[++i];
                }
                continue;
            }

            if (formatters[char]) {
                result += formatters[char](date);
            } else {
                result += char;
            }
        }

        return result;
    }

    _renderPHPDateString(dateString, counter){
        // first we replace instances of %%i
        const dateStringCountersApplied = dateString.replace('%%i', counter);
        return this._phpDate(dateStringCountersApplied);
    }

    constructor(archiveprefix, format, header, numberstart, headerlevel, maxarchsize, templateName, pageText){
        if (!headerlevel) headerlevel=2; // default
        if (!header) header="{{Archive}}"; // default
        super(numberstart, header, headerlevel);
        this.archiveprefix = archiveprefix;
        this.format = format;
        this.maxarchsize = maxarchsize || Infinity; // default to no limit
        this.templateName = templateName;
        this.pageText = pageText;
    }

    getCurrentArchiveName(){ // for getting the CURRENT archive -- this doesn't require any HTTP request; just string substitution
        const archiveSuffix = this._renderPHPDateString(this.format, parseInt(this.counter));
        return this.archiveprefix + archiveSuffix;
    }

    getArchiveNameToWrite(currentArchiveBytes, currentArchiveSections, counterExtra){ // for getting the archive we are actually going to write to. this requires details from the current archive
        var toWriteCounter = parseInt(this.counter) + counterExtra;
        if (this.format.includes('%%i')){
            if (currentArchiveBytes >= this.maxarchsize){
                toWriteCounter++;
            }
        }
        const archiveSuffix = this._renderPHPDateString(this.format, toWriteCounter);
        return this.archiveprefix + archiveSuffix;
    }

    async updateConfigIfNeeded(pageid){
        return; // ClueBot format has numberstart as a minimum, not necessarily the next page.
    }
}


function parseClueBotIIIConfig(pageText){
    const templateName = "User:ClueBot III/ArchiveThis";
    const content = findTemplateInPage(pageText, templateName);
    if (!content) return;
    const config = parseTemplateParams(content, true);
    // params we care about:
    /// necessary params
    // archiveprefix - page name for archives, excluding the format string
    // format - argument to PHP's date() function and/or "%%i" for numbered
    /// optional params
    // header - text to put at the top of new archives. default "{{Archive}}"
    // numberstart - value for %%i
    // headerlevel - header level of sections. default 2
    // maxarchsize - max size before rolling over to new archive. in bytes only.

    return new archiveBotConfigClueBotIII(config.archiveprefix, config.format, config.header, config.numberstart, config.headerlevel, config.maxarchsize, templateName, pageText)
}

const archiveConfigsToTry = [parseMiszaBotConfig, parseClueBotIIIConfig, parseArchiveBasics, parseHazardBotConfig];

function OCAInfo(){
    const OCAInfoMsg = document.createElement('p');
    OCAInfoMsg.innerHTML = `<b>${OCALoading}</b>${OCAStatus}`;
    mw.notify(OCAInfoMsg, { title: ui_str.oca_status_heading, tag: 'OCAstatus', autoHide: false });
}

async function getPageSizeInfo(pageName, headerLevel){
    const api = new mw.Api();
    const [ pageData, pageParse ] = await Promise.all([
        api.get({ // this is for page byte size
            action: 'query',
            prop: 'revisions',
            rvlimit: 1,
            rvprop: [ 'size', 'content' ],
            titles: pageName,
            list: 'usercontribs',
            uclimit: 1,
            ucprop: 'timestamp',
            ucuser: config.wgRelevantUserName || 'Example',
            rawcontinue: '',
        }),
        api.get({ // this is for number of sections
            action: 'parse',
            page: pageName,
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

    const page = Object.values( pageData?.query?.pages || {} )[0];
    const pageBytes = parseInt( page?.revisions?.[ 0 ]?.size, 10 ) || -1;

    const sections = pageParse?.parse?.tocdata?.sections || [];
    const TOClevel = headerLevel - 1; // TOC level is one below headings generally (i.e. h2 is at the top level)
    const pageSections = sections.filter( s => parseInt(s.tocLevel, 10) === TOClevel ).length;

    return [pageBytes, pageSections];
}

async function loadOCA(){
    OCATagExistsPromise = doesTagExist('OneClickArchiver'); // we don't need to wait for this now

    OCALoading = `${ui_str.oca_loading_init}<br />`;
    if (mw.config.get( 'wgNamespaceNumber' ) > 0){ // don't waste space on pages in mainspace
		const OCAInfoButton = mw.util.addPortletLink(
			'p-cactions',
			'#archiverLink',
			ui_str.oca_info_button_name,
			'pt-OCA',
            ui_str.oca_info_button_description,
			null
		);
        OCAInfoButton.addEventListener('click', function(e){
            e.preventDefault();
            OCAInfo();
        });
    }

    if (!determinePageArchivability()){
        OCALoading = "";
        return;
    }

    var pageid = config.wgArticleId;
    const pageSection0 = await new mw.Api().get( {
        action: 'query',
        prop: [ 'revisions', 'info' ],
        rvsection: 0,
        rvprop: 'content',
        pageids: pageid,
        indexpageids: 1,
        rawcontinue: ''
    })
    
    const content0 = pageSection0.query.pages[ pageid ].revisions[ 0 ][ '*' ];

    OCALoading = `${ui_str.oca_loading_looking_for_config}<br />\n`;
    var archiveConfig;
    for (const configLoader of archiveConfigsToTry){
        archiveConfig = configLoader(content0);
        if (archiveConfig){
            const templateQualifiedName = archiveConfig.templateName.includes(":") ? archiveConfig.templateName : "Template:" + archiveConfig.templateName;
            OCAStatus = OCAStatus + `\n${ui_str.oca_status_using_template} {{<a href="/wiki/${templateQualifiedName}">${archiveConfig.templateName}</a>}}.`;
            break;
        }
    }
    if (!archiveConfig){ // no valid config
        OCAStatus = ui_str.oca_status_no_config;
        OCALoading = "";
        return;
    }

    const initialArchiveName = archiveConfig.getCurrentArchiveName();

    OCALoading = `${ui_str.oca_loading_looking_for_archive}<br />\n`;
    // we can't rely on the counter being the actual archive number
    // for one, it could just be absent or inaccurate
    // also, ClueBot style bots don't use it in the same way
    // they only use it for the first page to try, and *don't* increment it automatically
    var archiveNameLast;
    var archiveNameCurrent = initialArchiveName;
    var counterExtra = 0;
    while (archiveNameLast !== archiveNameCurrent){
        archiveNameLast = archiveNameCurrent;
        const [ currentArchiveBytes, currentArchiveSections ] = await getPageSizeInfo(archiveNameLast, archiveConfig.headerLevel);
        archiveNameCurrent = archiveConfig.getArchiveNameToWrite(currentArchiveBytes, currentArchiveSections, counterExtra);
        counterExtra++;
    }

    const archivePageToWrite = archiveNameCurrent;

    // make sure we know whether we can use a tag before we add the archive links
    if (await OCATagExistsPromise){
        OCATagIfAvailable = 'OneClickArchiver';
    }

    OCALoading = `${ui_str.oca_loading_adding_archive_links}<br />\n`;
    addArchiveLinks(archiveConfig.headerLevel, archivePageToWrite, initialArchiveName, archiveConfig);
    OCALoading = "";
}


if (document.readyState !== 'loading') {
    loadOCA();
} else {
    document.addEventListener('DOMContentLoaded', async () => {
        loadOCA();
    });
}

});
// </nowiki>
