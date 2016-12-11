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
    fetchAndCacheLearnedWaniKaniItemsThen(callback, apiKey, "kanji", "Kanji", "WKLearnedKanji",
        function(kanji) {
            return { character   : kanji.character,
                     srs         : getSrs(kanji),
                     srs_numeric : getSrsNumeric(kanji)
            };
        });
}

function fetchAndCacheLearnedVocabThen(apiKey, callback) {
    displayVocabLoadingMessage();
    fetchAndCacheLearnedWaniKaniItemsThen(callback, apiKey, "vocabulary", "Vocab", "WKLearnedVocab",
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
    return "";
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
            WKSHData[type] = requestData.map(mappingFunction);

            GM_setValue(storageKey, JSON.stringify(WKSHData[type]));
            callback();
        })
        .fail(function() {
            Log("Request to WaniKani API failed. Catastrophic failure ermagerd D:", ERROR);
        });
}

function getVerbInflections(verb) {
    if (isSuru(verb)) {
        return Log("Suru inflections not defined", WARNING);
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
    var endings = ['ない','ます','ません','た','なかった','ました','て','なくて','られる',
                    'られない','れる','れない', 'させる','させない','させられる','させられない', 'ろ'];
	return endings.map(function(v) { return stem + v; });
}

function getGodanInflections(verb) {
    var masuStem = godanPlainToMasuStem(verb.character);
    var potentialStem = godanPlainToESoundStem(verb.character);
    var aSoundStem = godanPlainToASoundStem(verb.character);
    return [ getGodanNegative(verb), masuStem + "ます", masuStem + "ません", getGodanTa(verb),
             getGodanNegativePast(verb), masuStem + "ました", getGodanTe(verb), getGodanNegativeTe(verb),
             potentialStem + "る", potentialStem + "ない", aSoundStem + "れる", aSoundStem + "れない",
             aSoundStem + "せる", aSoundStem + "せない", aSoundStem + "せられる", aSoundStem + "せられない",
             potentialStem, verb.character + "な"];
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
    var ending = verb.character.slice(0, -1);
    var te = ending == 'ぐ' || ending == 'ぶ' ? "で" : "て";
    return godanPlainToTeStem(verb.character) + te;
}

function getGodanNegativeTe(verb) {
    return godanPlainToASoundStem(verb.character) + "なくて";
}

function godanPlainToTeStem(plainForm) {
    var toTePrefix = {"う":"っ", "つ":"っ", "く":"い", "ぐ":"い",
                     "ぶ":"ん", "む":"ん", "ぬ":"ん", "る":"っ", "す":"し"};
    return plainForm.slice(0, -1) + toTePrefix[plainForm[plainForm.length -1]];
}

function godanPlainToMasuStem(plainForm) {
    var toISound = { "う":"い", "つ":"ち", "く":"き", "ぐ":"ぎ",
                     "ぶ":"び", "む":"み", "ぬ":"に", "る":"り", "す":"し"};
    return plainForm.slice(0, -1) + toISound[plainForm[plainForm.length -1]];
}

function godanPlainToASoundStem(plainForm) {
    var toASound = { "う":"わ", "つ":"た", "く":"か", "ぐ":"が",
                     "ぶ":"ば", "む":"ま", "ぬ":"な", "る":"ら", "す":"さ"};
    return plainForm.slice(0, -1) + toASound[plainForm[plainForm.length - 1]];
}

function godanPlainToESoundStem(plainForm) {
    var toESound = { "う":"え", "つ":"て", "く":"け", "ぐ":"げ",
                     "ぶ":"べ", "む":"め", "ぬ":"ね", "る":"れ", "す":"せ"};
    return plainForm.slice(0, -1) + toESound[plainForm[plainForm.length - 1]];
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

/******************************************************************************
 * **************************** Main ******************************************
 * ***************************************************************************/

function loadWaniKaniLearnedItemsThen(callback) {
    //TODO need to make some sort of checking to ensure cache is up to date.
    // Maybe should always update if on wanikani!

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

function tagKnownVocab() {
    //TODO - verb and adjective conjugations
    var knownVoabRegexString = WKSHData.Vocab.map(function(x) { return "(" + x.character + ")";}).join("|");
    var vocabRegex = new RegExp(knownVocabRegexString, 'g');
    // TODO - I think it makes sense to tag vocab first and then kanji
}
function tagKnownKanji() {
    var stringOfKnownKanji = WKSHData.Kanji.map(function(k) { return k.character; }).join('');
    // Doing it this way may screw with some more complex web apps. Might be safer to do it by traversing the DOM
    // Also interferes with RES
    var kanjiRegex = new RegExp('[' + stringOfKnownKanji + '](?![^<>]*>)', 'g');
    var taggedHTML = document.body.innerHTML.replace(kanjiRegex, '<wksh class="known-kanji">$&</wksh>');
    document.body.innerHTML = taggedHTML;
}

function setTagClassesToSRSLevel() {
    var taggedKanji = document.getElementsByTagName("wksh");
    var matchesKanji = function(k) { return k.character == this; };

    for (var i = 0; i < taggedKanji.length; i++) {
        character = taggedKanji[i].innerHTML;
        taggedKanji[i].className += " " + WKSHData.Kanji.find(matchesKanji, character).srs;
    }
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

