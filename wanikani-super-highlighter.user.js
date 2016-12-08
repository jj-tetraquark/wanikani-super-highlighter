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

function loadWaniKaniLearnedItemsThen(callback) {
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
        Log("Please go to wanikani.com to update kanji cache");
    }

}

function hostIsWaniKani() {
    return window.location.hostname.includes("wanikani");
}

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

/******************************************************************************
 * ********************Fetching and caching WaniKani data**********************
 * ***************************************************************************/

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
    fetchAndCacheLearnedWaniKaniItemsThen(callback, apiKey, "kanji", "Kanji", "WKLearnedKanji",
        function(kanji) {
            return { character   : kanji.character,
                     srs         : getSrs(kanji),
                     srs_numeric : getSrsNumeric(kanji)
            };
        });
}

function fetchAndCacheLearnedVocabThen(apiKey, callback) {
    fetchAndCacheLearnedWaniKaniItemsThen(callback, apiKey, "vocabulary", "Vocab", "WKLearnedVocab",
        function(vocab) {
            return { character   : vocab.character,
                     meaning     : getMeaning(vocab),
                     kana        : vocab.kana.split(", "),
                     srs         : getSrs(vocab),
                     srs_numeric : getSrsNumeric(vocab)
            };
        });
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


function displayKanjiLoadingMessage() {
    Log("Retrieving kanji data...");
}

function displayVocabLoadingMessage() {
    Log("Retrieving vocabulary data...");
}


/******************************************************************************
 * *****************END - Fetching and caching WaniKani data*******************
 * ***************************************************************************/


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

if (typeof running == 'undefined') running = false;
function main() {
    if (!running) { // stop this from being called multiple times
        running = true;
        maybeWaitToSetBreakpointsThen(function() {
            loadWaniKaniLearnedItemsThen(function() {
                Log("Data items { KanjiData: " + WKSHData.Kanji.length +
                                 "; VocabData: " + WKSHData.Vocab.length + "}");
                Log("done!");
            });
        });
    }
}

if (document.readyState === 'complete') {
    main();
}
else {
    window.addEventListener("load", main, false);
}
// ==/UserScript==

