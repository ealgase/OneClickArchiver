/**
 * Derived from Evad37's [1] version of Technical 13's version [2] of Equazcion's OneClickArchiver [3]
 * [1] < https://en.wikipedia.org/wiki/User:Evad37/OneClickArchiver.js >
 * [2] < https://en.wikipedia.org/wiki/User:Technical_13/Scripts/OneClickArchiver.js >
 * [3] < https://en.wikipedia.org/wiki/User:Equazcion/OneClickArchiver.js >
 */
// <nowiki>
mw.loader.using(['mediawiki.util', 'mediawiki.api'], function() {

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

if (!window.OCALinkSize){
	linkSize = 0.6;
} else{
	linkSize = window.OCALinkSize;
}

function swapInDates(inputString, thisMonthNum, thisYear){
	/*
	year, month, month02d, monthname, and monthnameshort are commonly supported by bots
	quarter is supported by Hazard-Bot
	Hazard-Bot also supports isoyear, week, and isoweek, but I found no evidence of use of any of these on Wikidata, so have not implemented (since I have no page to test these with).
	*/
	thisMonthFullName = config.wgMonthNames[ thisMonthNum ];
	monthNamesShort = [ "", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec" ];
	thisMonthShortName = monthNamesShort[ thisMonthNum ];
	thisQuarter = Math.ceil(thisMonthNum/4);
	return inputString
		.replace( /\| *archive *= */, '' )
		.replace( /\%\(year\)d/g, thisYear )
		.replace( /\%\(month\)d/g, thisMonthNum )
		.replace( /\%\(month\)02d/g, thisMonthNum.toString().padStart(2, '0') ) // Month with padding so it's always two digits. Probably fine to hard code this instead of adding generic support for padding, since it's not like this comes up often, right?
		.replace( /\%\(monthname\)s/g, thisMonthFullName )
		.replace( /\%\(monthnameshort\)s/g, thisMonthShortName )
		.replace( /\%\(quarter\)s/g, thisQuarter );
}

function determinePageArchivability(){
    const categories = config.wgCategories;
    const noManualArchivingCategoryName = 'Pages that should not be manually archived';
    const nonTalkSignedCategoryName = 'Non-talk pages that are automatically signed';

    if (categories.includes(noManualArchivingCategoryName)) return false; // manual archiving disabled
    if (categories.includes(nonTalkSignedCategoryName)) return true; // category for talk-like pages
    if (Boolean(document.querySelector( '#ca-addsection' ))) return true; // only present on talkpages
    return false // fallback
}

$( document ).ready( function () {
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
		} ).done( function ( response0 ) {
			var thisMonthNum, thisYear, archiveNum;
			
			var content0 = response0.query.pages[ pageid ].revisions[ 0 ][ '*' ];

			thisMonthNum = new Date().getMonth() + 1; // This returns something 0-11, but we want 1-12.
			thisYear = new Date().getFullYear();
 
			/* archiveme */// Find out if there is already an {{Archive me}} request, and if it is between 1-2 months old
			if ( config.wgNamespaceNumber === 3 ) {
				var nowOcto = parseInt( ( ( thisYear * 12 ) + thisMonthNum ), 10 );
				var archiveme = content0.match( /\{\{Archive ?me(\| *date *= *(January|February|March|April|May|June|July|August|September|October|November|December) ([\d]{4}))?\}\}/i );
				if ( archiveme === null || archiveme === undefined ) {
					errorLog.errorCount++;
					errorLog.archiveme = '{{Archiveme}} not found.';
				} else {
					/* Archive me found - how old is it? */
					var archivemeMonth = archiveme[ 2 ];
					var archivemeMonthNum = 0;
					if ( typeof archivemeMonth === 'number' ) {
						archivemeMonthNum = parseInt( archivemeMonth, 10 );
					} else {
						for ( var i in config.wgMonthNames ) {
							if ( archivemeMonth === config.wgMonthNames[ i ] ) {
								archivemeMonthNum = parseInt( i, 10 );
							} else if ( archivemeMonth === monthNamesShort[ i ] ) {
								archivemeMonthNum = parseInt( i, 10 );
							}
						}
					}
					var archivemeYear = parseInt( archiveme[ 3 ], 10 );
					var archivemeOcto = parseInt( ( ( archivemeYear * 12 ) + archivemeMonthNum ), 10 );
					var archivemeSafe = parseInt( ( nowOcto - 2 ), 10 );
					archiveme = archiveme[ 0 ];
				}
			}
 
			/* counter */// Get the counter value
			var counterRegEx = new RegExp( '\\| *counter *= *(\\d+)' );
			var counter = counterRegEx.exec( content0 );
			if ( counter === null || counter === undefined ) {
				counter = 1;
				errorLog.errorCount++;
				errorLog.counter = counter;
			} else {
				counter = counter[ 1 ];
				archiveNum = counter;
			}
 
			/* archiveName */// Get the archiveName value
			var archiveNameRegEx = /\| *archive *= *(.*\%\((counter|year|month|monthname|monthnameshort)\)d.*) *(-->)?/;
			var archiveName = archiveNameRegEx.exec( content0 );
			var rootBase = config.wgPageName
					.replace( /\/.*/g, '' )// Chop off the subpages
					.replace( /_/g, ' ' );// Replace underscores with spaces
			if ( archiveName === null || archiveName === undefined ) {
				archiveName = rootBase + '/Archive ' + counter;
				errorLog.errorCount++;
				errorLog.archiveName = archiveName;
			} else { 
				archiveName = swapInDates(archiveName[ 1 ], thisMonthNum, thisYear).replace( /\%\(counter\)d/g, archiveNum );
				var archiveBase = archiveName
					.replace( /\/.*/, '' )// Chop off the subpages
					.replace( /_/g, ' ' );// Replace underscores with spaces
				var archiveSub = archiveName
					.replace( /_/g, ' ' )// Replace underscores with spaces
					.replace( archiveBase, '' );// Chop off the base pagename
				if ( archiveBase != rootBase ) {
					errorLog.errorCount++;
					errorLog.archiveName = 'Archive name mismatch:<br /><br />Found: ' + archiveName;
					errorLog.archiveName += '<br />Expected: ' + rootBase.replace( '_', ' ' ) + archiveSub + '<br /><br />';
				}
			}
 
			/* archivepagesize */// Get the size of the destination archive from the API
			new mw.Api().get( {
				action: 'query',
				prop: 'revisions',rvlimit: 1,
				rvprop: [ 'size', 'content' ],
				titles: archiveName,
				list: 'usercontribs',
				uclimit: 1,
				ucprop: 'timestamp',
				ucuser: ( ( config.wgRelevantUserName ) ?
					config.wgRelevantUserName : 'Example' ),
				rawcontinue: '',
			} ).done( function ( archivePageData ) {
				var archivePageSize = 0;
				if ( archivePageData.query.pages[ -1 ] === undefined ) {
					for ( var a in archivePageData.query.pages ) {
						archivePageSize = parseInt( archivePageData.query.pages[ a ].revisions[ 0 ].size, 10 );
						archiveName = archivePageData.query.pages[ a ].title;
					}
				} else {
					archivePageSize = -1;
					archiveName = archivePageData.query.pages[ archivePageSize ].title;
					errorLog.errorCount++;
					errorLog.archivePageSize = -1;
					errorLog.archiveName = '<a class="new" href="' +
						mw.util.getUrl( archiveName, { action: 'edit', redlink: '1' } ) +
						'" title="' + archiveName + '">' + archiveName + '</a>';
				}
 
				/* maxarchivesize */// Get the defined max archive size from template
				var maxArchiveSizeRegEx = new RegExp( '\\| *maxarchivesize *= *(\\d+K?)' );
				var maxArchiveSize = maxArchiveSizeRegEx.exec( content0 );
				if ( maxArchiveSize === null || maxArchiveSize[ 1 ] === undefined ) {
					maxArchiveSize = parseInt( 153600, 10 );
					errorLog.errorCount++;
					errorLog.maxArchiveSize = maxArchiveSize;
				} else if ( maxArchiveSize[ 1 ].slice( -1 ) === "K" && $.isNumeric( maxArchiveSize[ 1 ].slice( 0, maxArchiveSize[ 1 ].length-1 ) ) ) {
					maxArchiveSize = parseInt( maxArchiveSize[ 1 ].slice( 0, maxArchiveSize[ 1 ].length - 1 ), 10 ) * 1024;
				} else if ( $.isNumeric( maxArchiveSize[ 1 ].slice() ) ) {
					maxArchiveSize = parseInt( maxArchiveSize[ 1 ].slice(), 10 );
				}
 
				/* pslimit */// If maxArchiveSize is defined, and archivePageSize >= maxArchiveSize increment counter and redfine page name.
				if ( !errorLog.maxArchiveSize && archivePageSize >= maxArchiveSize ) {
					counter++;
					archiveName = archiveNameRegEx.exec( content0 );
					archiveName = swapInDates(archiveName[ 1 ], thisMonthNum, thisYear).replace( /\%\(counter\)d/g, counter );
					var oldCounter = counterRegEx.exec( content0 );
					var newCounter = '|counter=1';
					if ( oldCounter !== null && oldCounter !== undefined ) {
						newCounter = oldCounter[ 0 ].replace( oldCounter[ 1 ], counter );
						oldCounter = oldCounter[ 0 ];
					} else {
						errorLog.errorCount++;
						errorLog.newCounter = newCounter;
					}
				}
 
				/* archiveheader */// Get the defined archive header to place on archive page if it doesn't exist
				var archiveHeaderRegEx = new RegExp( '\\| *archiveheader *= *(\{\{[^\r\n]*\}\})' );
				var archiveHeader = archiveHeaderRegEx.exec( content0 );
				if ( archiveHeader === null || archiveHeader === undefined ) {
					archiveHeader = "{{Aan}}";
					errorLog.errorCount++;
					errorLog.archiveHeader = archiveHeader;
				} else {
					archiveHeader = archiveHeader[ 1 ];
				}
 
				/* headerlevel */// Get the headerlevel value or default to '2'
				var headerLevelRegEx = new RegExp( '\\| *headerlevel *= *(\\d+)' );
				var headerLevel = headerLevelRegEx.exec( content0 );
				if ( headerLevel === null || headerLevel === undefined ) {
					headerLevel = 2;
					errorLog.errorCount++;
					errorLog.headerLevel = headerLevel;
				} else {
					headerLevel = parseInt( headerLevel[ 1 ] );
				}
 
				/* debug */// Table to report the values found.
				if ( config.debug === true ) {
					var OCAreport = '<table style="width: 100%;" border="1"><tr><th style="font-variant: small-caps; font-size: 20px;">config</th><th style="font-variant: small-caps; font-size: 20px;">value</th></tr>';
					OCAreport += '<tr><td>Counter</td><td style="text-align: center;';
					if ( errorLog.counter ) { OCAreport += ' background-color: #FFEEEE;">' + errorLog.counter; }
						else { OCAreport += '">' + counter; }
					OCAreport += '</td></tr><tr><td colspan="2" style="text-align: center;">Archive name</td></tr><tr><td colspan="2" style="text-align: center;';
					if ( errorLog.archiveName ) { OCAreport += ' background-color: #FFEEEE;">' + errorLog.archiveName; }
						else { OCAreport += '">' + archiveName; }
					OCAreport += '</td></tr><tr><td>Header Level</td><td style="text-align: center;';
					if ( errorLog.headerLevel ) { OCAreport += ' background-color: #FFEEEE;">' + errorLog.headerLevel; }
						else { OCAreport += '">' + headerLevel; }
					OCAreport +=  '</td></tr><tr><td>Archive header</td><td style="text-align: center;';
					if ( errorLog.archiveHeader ) { OCAreport += ' background-color: #FFEEEE;">' + errorLog.archiveHeader; }
						else { OCAreport += '">' + archiveHeader; }
					OCAreport +=  '</td></tr><tr><td>Max<br />archive size</td><td style="text-align: center;';
					if ( errorLog.maxArchiveSize ) { OCAreport += ' background-color: #FFEEEE;">' + errorLog.maxArchiveSize; }
						else { OCAreport += '">' + maxArchiveSize; }
					OCAreport +=  '</td></tr><tr><td>Current<br />archive size</td><td style="text-align: center;';
					if ( errorLog.archivePageSize ) { OCAreport += ' background-color: #FFEEEE;">' + archivePageSize; }
						else if ( archivePageSize >= maxArchiveSize ) { OCAreport += ' background-color: #FFEEEE;">' + archivePageSize; }
						else { OCAreport += '">' + archivePageSize; }
					if ( !errorLog.archiveme && archiveme !== undefined ) {
						OCAreport +=  '</td></tr><tr><td colspan="2" style="text-align: center;';
						if ( ( nowOcto - archivemeOcto ) <= 1 ) { OCAreport += '">Asked to archive '; }
						if ( ( nowOcto - archivemeOcto ) === 0 ) { OCAreport += 'this month'; }
						else if ( ( nowOcto - archivemeOcto ) === 1 ) { OCAreport += 'last month'; }
						else { OCAreport += ' background-color: #FFEEEE;">Asked to archive ' + ( nowOcto - archivemeOcto ) + ' months ago'; }
					}
					if ( errorLog.archiveme || archiveme !== undefined ) { OCAreport +=  '</td></tr><tr><td colspan="2" style="text-align: center;'; }
						if ( errorLog.archiveme ) { OCAreport +=  ' background-color: #FFEEEE;">' + errorLog.archiveme; }
						else if ( archiveme !== undefined ) { OCAreport += '">' + archiveme; }
					OCAreport +=  '</td></tr><tr><td colspan="2" style="font-size: larger; text-align: center;"><a href="/wiki/User:Elli/OneClickArchiver" title="User:Elli/OneClickArchiver">Documentation</a></td></tr></table>';
					mw.notify( $( OCAreport ), { title: 'OneClickArchiver report!', tag: 'OCA', autoHide: false } );
				}
 
				var OCAerror = '<p>The following errors detected:<br />';
				if ( errorLog.counter ) { OCAerror += '<b style="font-size: larger; color: #FF0000;">&bull;</b>&nbsp;Unable to find <b>|counter=</b><br />&nbsp; &nbsp; &nbsp;Default value: <b>1</b><br />'; }
				if ( errorLog.archiveName && errorLog.archiveName.search( 'defaulted to' ) !== -1 ) { OCAerror += '<b style="font-size: larger; color: #FF0000;">&bull;</b>&nbsp;Unable to find <b>|archive=</b><br />&nbsp; &nbsp; &nbsp;Default value: <b>' + archiveName + '</b><br />'; }
				if ( errorLog.archiveName && errorLog.archiveName.search( 'mismatch' ) !== -1 ) { OCAerror += '<b style="font-size: larger; color: #FF0000;">&bull;</b>&nbsp;Archive name mismatch detected.<br />'; }
				if ( errorLog.headerLevel ) { OCAerror += '&nbsp; Unable to find <b>|headerlevel=</b><br />&nbsp; &nbsp; &nbsp;Default value: <b>2</b><br />'; }
				if ( errorLog.archiveHeader ) { OCAerror += '&nbsp; Unable to find <b>|archiveheader=</b><br />&nbsp; &nbsp; &nbsp;Default value: <b>"{{Aan}}"</b><br />'; }
				if ( errorLog.maxArchiveSize ) { OCAerror += '&nbsp; Unable to find <b>|maxarchivesize=</b><br />&nbsp; &nbsp; &nbsp;Default value: <b>153600</b><br />'; }
				if ( errorLog.counter || errorLog.archiveName ) { OCAerror += '<br /><b style="font-size: larger; color: #FF0000;">&bull;</b>&nbsp;Causing the script to abort.<br />'; }
				OCAerror += '<br /><span style="font-size: larger;">Please, see <a href="/wiki/User:Elli/OneClickArchiver" title="User:Elli/OneClickArchiver">the documentation</a> for details.</span></p>';
				var archiverReport = mw.util.addPortletLink(
					'p-cactions',
					'#archiverNoLink',
					'|Archive',
					'pt-OCA-report',
					'Report for why there are no |Archive links on this page',
					null,
					null
				);
				$( archiverReport ).click( function ( e ) {
					e.preventDefault();
					mw.notify( $( OCAerror ), { title: 'OneClickArchiver errors!', tag: 'OCAerr', autoHide: false } );
				} );
 
				if ( config.wgNamespaceNumber === 3 && ( errorLog.counter || errorLog.archiveName ) &&
				config.debug === true && errorLog.archiveme )  {
					if ( confirm( 'Click [OK] to post {{Archiveme|{{SUBST:DATE}}}} to the top of the page and abort or\n\t[Cancel] to attempt running with default values.' ) === true ) {
						new mw.Api().postWithToken( 'edit', {
							action: 'edit',
							section: 0,
							pageid: pageid,
							text: '{{Archiveme|{{SUBST:DATE}}}}\n' + content0,
							summary: '{{[[Template:Archiveme|Archiveme]]}} posted with [[User:Elli/OneClickArchiver|OneClickArchiver]].'
						} ).done( function () {
							alert( 'Request for user to set up archiving posted.' );
							location.reload();
						} );
					}
				} else if ( config.wgNamespaceNumber === 3 && archivemeOcto >= archivemeSafe ) {
 
					/* Archive me request was made, give the user a chance to comply */
 
				} else if ( config.wgNamespaceNumber === 3 && ( errorLog.counter || errorLog.archiveName ) && config.debug === true && confirm( '{{Archiveme}} found on the top of the page:\n\n\t Click [OK] abort or\n\t[Cancel] to attempt running with default values.' ) === true ) {
 
					/* User aborted script */
 
				} else {
//					$( 'h' + headerLevel + ' span.mw-headline' ).each( function() {
					$( 'div.mw-heading' + headerLevel + ' h'+headerLevel ).each( function() {
						var sectionName = $( this ).text();
						var editSectionUrl = $( this ).parent().find('.mw-editsection a').not('.mw-editsection-visualeditor').first().attr( 'href' );
						var sectionReg = /&section=(.*)/;
						var sectionRaw = sectionReg.exec( editSectionUrl );
						if ( sectionRaw != null && sectionRaw[ 1 ].indexOf( 'T' ) < 0 ) {
							var sectionNumber = parseInt( sectionRaw[ 1 ] );
//							if ( $( this ).parent().prop( 'tagName' ) === 'H' + headerLevel ) {
 
//								$( this ).parent( 'h' + headerLevel ).append(
								$( this ).parent( 'div.mw-heading' ).append(
									' <div style="font-size: ' + linkSize + 'em; font-weight: bold; float: right;"> | <a id="' + sectionNumber +
									'" href="#archiverLink" class="archiverLink">' + 'Archive' + '</a></div>'
								);
//								$(this).parent('h' + headerLevel).find('a.archiverLink').attr('title', 'Archive to: "'+archiveName+'"');
								$(this).parent('div.mw-heading').find('a.archiverLink').attr('title', 'Archive to: "'+archiveName+'"');
//								$( this ).parent( 'h' + headerLevel ).find( 'a.archiverLink' ).click( function() {
								$( this ).parent( 'div.mw-heading' ).find( 'a.archiverLink' ).click( function() {
 
									var mHeaders = '<span style="color: #444444;">Retrieving headers...</span>';
									var mSection = 'retrieving section content...';
									var mPosting = '<span style="color: #004400">Content retrieved,</span> performing edits...';
									var mPosted = '<span style="color: #008800">Archive appended...</span>';
									var mCleared = '<span style="color: #008800">Section cleared...</span>';
									var mReloading = '<span style="color: #000088">All done! </span><a href="#archiverLink" onClick="javascript:location.reload();" title="Reload page">Reloading</a>...';
 
									$( 'body' ).append( '<div class="overlay" style="background-color: #000000; opacity: 0.4; position: fixed; top: 0px; left: 0px; width: 100%; height: 100%; z-index: 500;"></div>' );					
 
									$( 'body' ).prepend( '<div class="arcProg" style="font-weight: bold; box-shadow: 7px 7px 5px #000000; font-size: 0.9em; line-height: 1.5em; z-index: 501; opacity: 1; position: fixed; width: 50%; left: 25%; top: 30%; background: #F7F7F7; border: #222222 ridge 1px; padding: 20px;"></div>' );
 
									$( '.arcProg' ).append( '<div>' + mHeaders + '</div>' );
 
									$( '.arcProg' ).append( '<div>' + 'Archive name <span style="font-weight: normal; color: #003366;">' + archiveName + '</span> <span style="color: darkgreen;">found</span>, ' + mSection + ' (' + archivePageSize + 'b)</div>' );
									new mw.Api().get( {
										action: 'query',
										pageids: pageid,
										rvsection: sectionNumber,
										prop: [ 'revisions', 'info' ],
										rvprop: 'content',
										indexpageids: 1,
										rawcontinue: ''
									} ).done( function ( responseSection ) {
										var sectionContent = responseSection.query.pages[ pageid ].revisions[ 0 ][ '*' ];
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
										} else {
											var archiveAction = 'adding section';
											if ( archivePageSize <= 0 || ( archivePageSize >= maxArchiveSize && !errorLog.maxArchiveSize ) ) {
												sectionContent = archiveHeader + '\n\n' + sectionContent;
												archiveAction = 'creating';
												mPosted = '<span style="color: #008800">Archive created...</span>';
											} else {
												sectionContent = '\n\n{{Clear}}\n' + sectionContent;
											}
 
											if ( dnau != null ) {
												sectionContent = sectionContent.replace( /<!-- \[\[User:DoNotArchiveUntil\]\] ([\d]{2}):([\d]{2}), ([\d]{1,2}) (January|February|March|April|May|June|July|August|September|October|November|December) ([\d]{4}) \(UTC\) -->/g, '' );
											}
 
											new mw.Api().postWithToken( 'edit', {
												action: 'edit',
												title: archiveName,
												appendtext: sectionContent,
												summary: '/* '+sectionName+' */ archived using [[User:Elli/OneClickArchiver|OneClickArchiver]])'
											} ).done( function () {
												$( '.arcProg' ).append( '<div class="archiverPosted">' + mPosted + '</div>' );
												new mw.Api().postWithToken( 'edit', {
													action: 'edit',
													section: sectionNumber,
													pageid: pageid,
													text: '',
													summary: '[[User:Elli/OneClickArchiver|OneClickArchived]] "' + sectionName + '" to [[' + archiveName + ']]'
												} ).done( function () {
													$( '.arcProg' ).append( '<div class="archiverCleared">' + mCleared + '</div>' );
													if ( archivePageSize >= maxArchiveSize && !errorLog.maxArchiveSize ) {
														var mUpdated = '<span style="color: #008800">Counter updated...</span>';
														new mw.Api().postWithToken( 'edit', {
															action: 'edit',
															section: 0,
															pageid: pageid,
															text: content0.replace( oldCounter, newCounter ),
															summary: '[[User:Elli/OneClickArchiver|OneClickArchiver]] updating counter.'
														} ).done( function () {
															$( '.arcProg' ).append( '<div class="archiverPosted">' + mUpdated + '</div>' );
															$( '.arcProg' ).append( '<div>' + mReloading + '</div>' );
															location.reload();
														} );
													} else {
														$( '.arcProg' ).append( '<div>' + mReloading + '</div>' );
														location.reload();
													}
												} );
											} );
										}
									} );
								} );
//							}
						}
					} );
				}
			} );
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
