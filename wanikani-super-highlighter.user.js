// ==UserScript==
// @name        Wanikani Super Highlighter
// @namespace   wksuperhighlighter
// @description Highlights words on webpages based on your WK level
// @version     0.1
// @author      Jonny Dark
// @license     GNU GPL v3.0
// @include     *
// @include     http://www.wanikani.com/
// @include     https://www.wanikani.com/
// @include     http://www.wanikani.com/dashboard
// @include     https://www.wanikani.com/dashboard
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       GM_deleteValue
// @noframes


// CONSTANTS
var RADICAL   = 0;
var KANJI     = 1;
var VOCAB     = 2;

var UNDEFINED = -1;
var MEANING   = 0;
var READING   = 1;

var DEBUG   = 7;
var WARNING = 8;
var ERROR   = 9;

var LITEBLUE = "#00a0f1";
var PINK     = "#f100a0";
var PURPLE   = "#a000f1";

// Globals....ewww
var WKSHLoggingEnabled = Boolean(GM_getValue("WKSHLoggingEnabled"));
var waitForBreakpoints = Boolean(GM_getValue("WKSHwaitForBreakpoint"));

WKSHData = { Kanji: [], Vocab: [] };

var godanExceptions = "嘲る焦る脂ぎる熱る弄るいびる煎る炒る熬る入る要るうねる彫る選る陥る落ち入る阿る還る帰る孵る返る反る限る翔る陰る呪る齧る噛る軋る轢る切る剪る斬る霧る抉る愚痴る覆るくねる縊る蹴る抉る遮る湿気る茂る湿る喋る知る捩る滑るせびる競る謗る譏る誹るそべる滾る猛る駄弁る魂消る契る散る抓る照るどじるとちる迸る詰る滑る握る躙る滑る捩じる捻じる練る錬る煉る粘る罵るのめる入る走る侍る捻るびびる翻る耽る臥せる減る謙る穿る火照る熱る迸る参る交じる混じる雑じる見縊る漲る毟る滅入る減る捩る野次る弥次るよぎる捩る蘇る甦る";

function Log(logdata, level) {
    level = (typeof level == "undefined") ? DEBUG : level;
    if (!WKSHLoggingEnabled && level < WARNING) return;
    if (!console) return;

    var logmethod = console.log.bind(console);
    if (typeof level !== "undefined" && level !== DEBUG) {
        logmethod = (level == WARNING ? console.warn.bind(console) :
                     level == ERROR ? console.error.bind(console) :
                     logmethod);
    }

    logmethod("WKSuperHighlighter: " + logdata);
    if (typeof logdata != "string") {
        logmethod(logdata);
    }
}

SHEnableLogging = function() {
    WKSHLoggingEnabled = true;
    GM_setValue("WKSHLoggingEnabled", true);
};

SHDisableLogging = function() {
    WKSHLoggingEnabled = false;
    GM_deleteValue("WKSHLoggingEnabled");
};

SHEnableBreakpoints = function() {
    waitForBreakpoints = true;
    GM_setValue("WKSHwaitForBreakpoint", true);
};

SHDisableBreakpoints = function() {
    waitForBreakpoints = false;
    GM_setValue("WKSHwaitForBreakpoint", false);
};

clearWKSHCache = function() {
    GM_deleteValue("WKLearnedKanji");
    GM_deleteValue("WKLearnedVocab");
};




/******************************************************************************
 * ********************Fetching and caching WaniKani data**********************
 * ***************************************************************************/

function successfullyLoadedCachedLearnedItems() {
    return maybeLoadWaniKaniDataFromCache("WKLearnedKanji", "Kanji") &&
            maybeLoadWaniKaniDataFromCache("WKLearnedVocab", "Vocab");
}

function maybeLoadWaniKaniDataFromCache(storageKey, type) {
    var rawSHData = GM_getValue(storageKey);
    if (rawSHData !== undefined) {
        try {
            WKSHData[type] = JSON.parse(rawSHData);
            if (WKSHData[type].length > 0) {
                return true;
            }
            Log("No learned " + type + " in cache...", DEBUG);
        }
        catch(e) {
            Log("Could not parse cached" + type + " data...", WARNING);
        }
        Log("No learned " + type + " in cache...", DEBUG);
    }
    return false;
}

// This should probably only work on the WaniKani page
function getApiKeyThen(callback) {
    if (!window.location.hostname.includes("wanikani")) {
        Log("Not on wanikani.com, cannot fetch api key", ERROR);
        return;
    }

    // First check if the API key is in local storage.
    var api_key = localStorage.getItem('apiKey');
    if (typeof api_key === 'string' && api_key.length !== 32) {
        return callback(api_key);
    }

    // We don't have the API key.  Fetch it from the /account page.
    Log('Fetching api_key');
    $.get('/account')
        .done(function(page) {
            if (typeof page !== 'string') {
                Log("Could not parse account page response", ERROR);
            }

            // Extract the API key.
            api_key = $(page).find('#api-button').parent().find('input').attr('value');
            if (typeof api_key == 'string' && api_key.length == 32) {
                // Store the updated user info.
                localStorage.setItem('apiKey', api_key);
                return callback(api_key);
            }
        })
        .fail(function(j, textStatus, errorThrown) {
            Log("Request to account page failed: " + textStatus + " " + errorThrown, ERROR);
        });
}

function fetchAndCacheAllLearnedWaniKaniItemsThen(apiKey, callback) {
    var responses = 0;
    var callbackOnSecondResponse = function() {
       if (++responses == 2) {
           return callback();
       }
    };

    fetchAndCacheLearnedKanjiThen(apiKey, callbackOnSecondResponse);
    fetchAndCacheLearnedVocabThen(apiKey, callbackOnSecondResponse);
}

function fetchAndCacheLearnedKanjiThen(apiKey, callback) {
    displayKanjiLoadingMessage();
    fetchAndCacheWaniKaniItemsThen(callback, apiKey, "kanji", "Kanji", "WKLearnedKanji", 1, 60,
        function(kanji) {
            return { character   : kanji.character,
                     srs         : getSrs(kanji),
                     srs_numeric : getSrsNumeric(kanji)
            };
        });
}

function fetchAndCacheLearnedVocabThen(apiKey, callback) {
    displayVocabLoadingMessage();
    fetchAndCacheWaniKaniItemsThen(callback, apiKey, "vocabulary", "Vocab", "WKLearnedVocab", 1, 60,
        function(vocab) {
            return { character   : vocab.character,
                     inflections : getInflections(vocab),
                     meaning     : getMeaning(vocab),
                     kana        : vocab.kana.split(", "),
                     srs         : getSrs(vocab),
                     srs_numeric : getSrsNumeric(vocab)
            };
        });
}

function getInflections(item) {
    if (isAVerb(item)) {
        return getVerbInflections(item);
    }
    return [];
}

function isAVerb(item) {
    return item.meaning.startsWith('to ');
}

function getMeaning(item) {
    var usyn = item.user_specific ? item.user_specific.user_synonyms : null;
    var meaning = item.meaning.split(', ');
    return usyn !== null ? meaning.concat(usyn) : meaning;
}

function getSrs(item) {
    return item.user_specific? item.user_specific.srs : "new";
}

function getSrsNumeric(item) {
    return item.user_specific? item.user_specific.srs_numeric : 0;
}

function fetchAndCacheLearnedWaniKaniItemsThen(callback, apiKey, requestedResource, type, storageKey, mappingFunction) {
    $.ajax({url:"https://www.wanikani.com/api/user/" + apiKey + "/" + requestedResource, dataType:"json"})
        .done(function(response) {
            // vocabulary for some reason has everything in a child called general, kanji and radicals do not
            var requestData = response.requested_information.general ?
                                response.requested_information.general : response.requested_information;
            // Sort by length (largest first) here so longer words are matched in the regex later
            WKSHData[type] = requestData.map(mappingFunction).sort(byDecreasingWordLength);

            GM_setValue(storageKey, JSON.stringify(WKSHData[type]));
            callback();
        })
        .fail(function() {
            Log("Request to WaniKani API failed. Catastrophic failure ermagerd D:", ERROR);
        });
}

function fetchAndCacheWaniKaniItemsThen(callback, apiKey, requestedResource, type, storageKey,
                                                    fromLevel, requestedToLevel, mappingFunction) {
    var MAX_STEP = 9;

    // Large requests to the api can fail with 503 errors, best to request in steps
    var toLevel = (requestedToLevel > fromLevel + MAX_STEP) ? fromLevel + MAX_STEP : requestedToLevel;
    var levels = range(fromLevel, toLevel).join(',');
    Log('Fetching ' + type + ' from level ' + fromLevel + ' to ' + toLevel);

    $.ajax({url:"https://www.wanikani.com/api/user/" + apiKey + "/" + requestedResource + '/' + levels, dataType:"json"})
        .done(function(response) {
            // vocabulary for some reason has everything in a child called general, kanji and radicals do not
            var requestData = response.requested_information.general ?
                                response.requested_information.general : response.requested_information;

            WKSHData[type] = WKSHData[type].concat(requestData.map(mappingFunction));

            if (toLevel < requestedToLevel) {
                return fetchAndCacheWaniKaniItemsThen(callback, apiKey, requestedResource, type, storageKey,
                                                      toLevel + 1, requestedToLevel, mappingFunction);
            }

            // All done
            // Sort by length (largest first) here so longer words are matched in the regex later
            WKSHData[type].sort(byDecreasingWordLength);

            GM_setValue(storageKey, JSON.stringify(WKSHData[type]));
            return callback();
        })
        .fail(function() {
            Log("Request to WaniKani API failed. Retrying...", ERROR);
            return fetchAndCacheWaniKaniItemsThen(callback, apiKey, requestedResource, type, storageKey,
                                                            fromLevel, requestedToLevel, mappingFunction);
        });
}

function getVerbInflections(verb) {
    if (isSuru(verb)) {
        Log("Suru inflections not defined", WARNING);
        return [];
    } else if (verb.character === "来る") {
        return getKuruInflections(verb);
    }
    else if (isIchidan(verb)) {
		return getIchidanInflections(verb);
	}
    else {
        return getGodanInflections(verb);
    }
}

function isSuru(verb) {
    return verb.character.endsWith("する");
}

function isIchidan(verb) {
    if (!verb.character.endsWith('る')) return false;
    var eandisounds = "えけげめへべせぜねれてでいきぎみひびしじにりちぢ";
    var kana = verb.kana;
    if (!eandisounds.includes(kana[kana.length - 2])) return false;
	if (godanExceptions.indexOf(verb.character) !== -1) return false;

	return true;
}

function getKuruInflections(verb) {
    return getIchidanInflections(verb);
}

function getIchidanInflections(verb) {
	var stem = verb.character.slice(0, -1);
    var endings = ['る', 'ない','ます','ません','た','なかった','ました', 'ませんでした',
                    'て','なくて','られる','られない','れる','れない', 'させる',
                    'させない','させられる','させられない', 'ろ'].sort(byDecreasingWordLength);
	return endings;
}

function getGodanInflections(verb) {
    var plainEnding = verb.character[verb.character.length -1];
    var masuStem = godanPlainToMasuStem(verb.character);
    var potentialStem = godanPlainToESoundStem(verb.character);
    var aSoundStem = godanPlainToASoundStem(verb.character);
    return [ plainEnding, getGodanNegative(verb), masuStem + "ます", masuStem + "ません", getGodanTa(verb),
             getGodanNegativePast(verb), masuStem + "ました", masuStem + 'ませんでした', getGodanTe(verb),
             getGodanNegativeTe(verb), potentialStem + "る", potentialStem + "ない", aSoundStem + "れる",
             aSoundStem + "れない", aSoundStem + "せる", aSoundStem + "せない", aSoundStem + "せられる",
             aSoundStem + "せられない", potentialStem, verb.character + "な"];
}

function getGodanNegative(verb) {
    return godanPlainToASoundStem(verb.character) + "ない";
}

function getGodanNegativePast(verb) {
    return getGodanNegative(verb).slice(0, -1) + "かった";
}

function getGodanTa(verb) {
    var ending = verb.character.slice(0, -1);
    var ta = ending == 'ぐ' || ending == 'ぶ' ? "だ" : "た";
    return godanPlainToTeStem(verb.character) + ta;
}

function getGodanTe(verb) {
    var ending = verb.character[verb.character.length -1];
    var te = ending == 'ぐ' || ending == 'ぶ' ? "で" : "て";
    return godanPlainToTeStem(verb.character) + te;
}

function getGodanNegativeTe(verb) {
    return godanPlainToASoundStem(verb.character) + "なくて";
}

function godanPlainToTeStem(plainForm) {
    var toTePrefix = {"う":"っ", "つ":"っ", "く":"い", "ぐ":"い",
                     "ぶ":"ん", "む":"ん", "ぬ":"ん", "る":"っ", "す":"し"};
    return  toTePrefix[plainForm[plainForm.length -1]];
}

function godanPlainToMasuStem(plainForm) {
    var toISound = { "う":"い", "つ":"ち", "く":"き", "ぐ":"ぎ",
                     "ぶ":"び", "む":"み", "ぬ":"に", "る":"り", "す":"し"};
    return  toISound[plainForm[plainForm.length -1]];
}

function godanPlainToASoundStem(plainForm) {
    var toASound = { "う":"わ", "つ":"た", "く":"か", "ぐ":"が",
                     "ぶ":"ば", "む":"ま", "ぬ":"な", "る":"ら", "す":"さ"};
    return  toASound[plainForm[plainForm.length - 1]];
}

function godanPlainToESoundStem(plainForm) {
    var toESound = { "う":"え", "つ":"て", "く":"け", "ぐ":"げ",
                     "ぶ":"べ", "む":"め", "ぬ":"ね", "る":"れ", "す":"せ"};
    return  toESound[plainForm[plainForm.length - 1]];
}

/******************************************************************************
 * *********************** Display to User Messages ***************************
 * ***************************************************************************/


function displayKanjiLoadingMessage() {
    Log("Retrieving kanji data...");
}

function displayVocabLoadingMessage() {
    Log("Retrieving vocabulary data...");
}

function tellUserToGoToWaniKani() {
    Log("Please go to wanikani.com to update kanji cache");
}

/******************************************************************************
 * ********************* Tagging vocab and kanji ******************************
 * ***************************************************************************/
//
//TODO -  this is a little ineffeicient, build the regex at get time
function getVocabRegex(item) {
    var infl = '';
    var stem = item.character;
    if (item.inflections.length > 0) {
        infl =  '(' + item.inflections.join('|') + ')';
        stem =  stem.slice(0, -1);
    }
    return '(' + stem + infl + ')';
}


function applyTag(node, match, tagName) {
    var tag = document.createElement(tagName);
    node.splitText(match.index+match[0].length);
    tag.appendChild(node.splitText(match.index));
    node.parentNode.insertBefore(tag, node.nextSibling);
}

function tagMatches(element, pattern, tag) {
    for (var childi = element.childNodes.length; childi-- > 0;) {
        var child = element.childNodes[childi];
        if (child.nodeType == 1) {
            tagMatches(child, pattern, tag);
        }
        else if (child.nodeType == 3) {
            var matches = [];
            var match;
            // will return null when no more matches
            while (match = pattern.exec(child.data)) { // jshint ignore:line
                matches.push(match);
            }
            for (var i = matches.length; i-- > 0;) {
                applyTag(child, matches[i], tag);
            }
        }
    }
}

function tagKnownVocab() {
    //TODO - adjective conjugations
    var start = performance.now();

    var knownVocabRegexString = WKSHData.Vocab.map(getVocabRegex).join("|");
    var vocabRegex = new RegExp(knownVocabRegexString, 'g');
    tagMatches(document.body, vocabRegex, 'wkshv');

    Log('replace time: ' + (performance.now() - start));
}

function tagKnownKanji() {
    var stringOfKnownKanji = WKSHData.Kanji.map(function(k) { return k.character; }).join('');
    var kanjiRegex = new RegExp('[' + stringOfKnownKanji + ']', 'g');
    tagMatches(document.body, kanjiRegex, 'wkshk');
}

function setTagClassesToSRSLevel() {
    setKanjiTagClassesToSRSLevel();
    setVocabTagClassesToSRSLevel();
}

function setKanjiTagClassesToSRSLevel() {
    var taggedKanji = document.getElementsByTagName("wkshk");
    var matchesKanji = function(k) { return k.character == this; };

    for (var i = 0; i < taggedKanji.length; i++) {
        character = taggedKanji[i].innerHTML;
        taggedKanji[i].className += " " + WKSHData.Kanji.find(matchesKanji, character).srs;
    }
}

function setVocabTagClassesToSRSLevel() {
    var taggedVocab = document.getElementsByTagName("wkshv");

    if(taggedVocab.length === 0) return;

    var matchesVocab = function(v) {
        var allForms = v.character;
        if (v.inflections.length > 0) {
            var stem = v.character.slice(0, -1);
            allForms = stem + v.inflections.join(stem);
        }
        var tempDiv = document.createElement('div');
        tempDiv.innerHTML = this;

        return allForms.includes(tempDiv.innerText);
    };

    for (var i = 0; i < taggedVocab.length; i++) {
        extract = taggedVocab[i].innerHTML;
        taggedVocab[i].className += " " + WKSHData.Vocab.find(matchesVocab, extract).srs;
    }
}

/******************************************************************************
 * *********************** Misc Helper methods ******************************
 * ***************************************************************************/

function pageContainsJapanese() {
    var japaneseRegex = /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf]/g;
    return japaneseRegex.exec(document.body.innerText) !== null;
}

function hostIsWaniKani() {
    return window.location.hostname.includes("wanikani");
}

function maybeWaitToSetBreakpointsThen(callback) {
    if (waitForBreakpoints) {
        waiting = setInterval(function() {
            if (waitForBreakpoints) {
                Log("Waiting for breakpoints", WARNING);
            }
            else {
                clearInterval(waiting);
                callback();
            }
        }, 3000);
    }
    else {
        callback();
    }
}

// for sorting arrays of words
function byDecreasingWordLength(a,b) {
    return b.length - a.length;
}

function range(from, to) {
    return Array.from(Array(to + 1).keys()).slice(from);
}

/******************************************************************************
 * **************************** Main ******************************************
 * ***************************************************************************/

function loadWaniKaniLearnedItemsThen(callback) {
    //TODO need to make some sort of checking to ensure cache is up to date.
    // Maybe should always update if on wanikani!
    //TODO - if we make this a chrome extension we can do cross-site requests
    // Though we can also do this with GM_xmlHttpRequest

    // try and load from cache
    if (successfullyLoadedCachedLearnedItems()) {
        callback();
    }
    else if(hostIsWaniKani()) {
        getApiKeyThen(function(api_key) {
            fetchAndCacheAllLearnedWaniKaniItemsThen(api_key, callback);
        });
    }
    else {
        tellUserToGoToWaniKani();
    }
}

// TODO - could possible programattically fetch all styles using document.styleSheets
// and dynamically generate appropriate styles depending on the page...
function addStyles() {
    var styles = document.createElement("style");
    document.head.appendChild(styles);
}



if (typeof running == 'undefined') running = false;
function main() {

    if (!pageContainsJapanese()) return;
    if (running) return; // stop this from being called multiple times

    running = true;
    maybeWaitToSetBreakpointsThen(function() {
        loadWaniKaniLearnedItemsThen(function() {
            Log("Data items { KanjiData: " + WKSHData.Kanji.length +
                             "; VocabData: " + WKSHData.Vocab.length + "}");
            tagKnownVocab();
            tagKnownKanji();
            setTagClassesToSRSLevel();
            Log("done!");
        });
    });

}

if (document.readyState === 'complete') {
    main();
}
else {
    window.addEventListener("load", main, false);
}
// ==/UserScript==

