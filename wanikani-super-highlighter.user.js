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
var WKSHLoggingEnabled = (GM_getValue("WKSHLoggingEnabled") == "true");
waitForBreakPoints = false;

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

window.SHEnableLogging = function() {
    WKSHLoggingEnabled = true;
    GM_setValue("WKSHLoggingEnabled", true);
};

window.SHDisableLogging = function() {
    WKSHLoggingEnabled = false;
    GM_deleteValue("WKSHLoggingEnabled");
};

loadWaniKaniDataToGMStorage = function() {
    getApiKeyThen(function(api_key) {
        apiKey = api_key; //global
        loadWaniKaniDataThen(function() { Log("done!"); });
    });
};

// This should probably only work on the WaniKani page
function getApiKeyThen(callback) {

    // First check if the API key is in local storage.
    if (!window.location.hostname.includes("wanikani")) {
        Log("Not on wanikani.com, cannot fetch api key");
        callback("");
    }

    var api_key = localStorage.getItem('apiKey');
    if (typeof api_key !== 'string' || api_key.length !== 32) {

        // We don't have the API key.  Fetch it from the /account page.
        Log('Fetching api_key');
        $.get('/account')
            .done(function(page) {
                if (typeof page !== 'string') return callback(null);

                // Extract the API key.
                api_key = $(page).find('#api-button').parent().find('input').attr('value');
                if (typeof api_key == 'string' && api_key.length == 32) {
                    // Store the updated user info.
                    localStorage.setItem('apiKey', api_key);
                }
            });
    }
    return callback(api_key);
}


function displayLoadingMessage(english) {
   Log(english);
}

function displayKanjiLoadingMessage() {
    displayLoadingMessage("Retrieving kanji data...");
}

function displayVocabLoadingMessage() {
    displayLoadingMessage("Retrieving vocabulary data...");
}


function getMeaning(item) {
    var usyn = item.user_specific ? item.user_specific.user_synonyms : null;
    var meaning = item.meaning.split(', ');
    return usyn !== null ? meaning.concat(usyn) : meaning;
}

function fetchAndCacheLearnedKanjiThen(callback) {
    fetchAndCacheLearnedItemsThen(callback, "kanji", "Kanji", "WKLearnedKanji",
        function(kanji) {
            return { character   : kanji.character,
                     srs         : kanji.user_specific.srs,
                     srs_numeric : kanji.user_specific.srs_numeric
            };
        });
}

function fetchAndCacheBurnedVocabThen(callback) {
    fetchAndCacheLearnedItemsThen(callback, "vocabulary", "Vocab", "WKLearnedVocab",
        function(vocab) {
            return { character   : vocab.character,
                     meaning     : getMeaning(vocab),
                     kana        : vocab.kana.split(", "),
                     srs         : vocab.user_specific.srs,
                     srs_numeric : vocab.user_specific.srs_numeric
            };
        });
}

function fetchAndCacheLearnedItemsThen(callback, requestedResource, type, storageKey, mapFunction) {
    $.ajax({url:"https://www.wanikani.com/api/user/" + apiKey + "/" + requestedResource, dataType:"json"})
        .done(function(response) {
            // vocabulary for some reason has everything in a child called general, kanji and radicals do not
            var requestData = response.requested_information.general ?
                                response.requested_information.general : response.requested_information;
            WKSHData[type] = learnedItems.map(mapFunction);

            GM_setValue(storageKey, JSON.stringify(WKSHData[type]));
            callback();
        })
        .fail(function() {
            Log("Request to WaniKani API failed. Catastrophic failure ermagerd D:", ERROR);
        });
}

function maybeGetLearnedItemsThen(callback, storageKey, type, fetchFunction) {
    var rawSHData = GM_getValue(storageKey);
    if (rawSHData !== null) {
        try {
            WKSHData[type] = JSON.parse(rawSHData);
            if (WKSHData[type].length > 0) {
                return callback();
            }
            Log("No learned " + type + " in cache. Refectching...", WARNING);
        }
        catch(e) {
            Log("Could not parse cached" + type + " data. Refetching...", WARNING);
        }
    }
    return fetchFunction(callback);
}


function maybeGetLearnedKanjiThen(callback) {
    displayKanjiLoadingMessage();
    maybeGetLearnedItemsThen(callback, "WKLearnedKanji", "Kanji", fetchAndCacheLearnedKanjiThen);
}

function maybeGetLearnedVocabThen(callback) {
    displayVocabLoadingMessage();
    maybeGetLearnedItemsThen(callback, "WKLearnedVocab", "Vocab", fetchAndCacheBurnedVocabThen);
}

function loadWaniKaniDataThen(callback) {
    Log("Getting WaniKana data");

    maybeGetLearnedKanjiThen(function() {
        maybeGetLearnedVocabThen(function() {

            Log("Data items { KanjiData: " + WKSHData.Kanji.length +
                             "; VocabData: " + WKSHData.Vocab.length + "}");
            callback();
        });
    });
}

function main() {

    waiting = setInterval(function() {
        if (waitForBreakPoints) {
            Log("Waiting for breakpoints", WARNING);
        }
        else {
            clearInterval(waiting);
            loadWaniKaniDataToGMStorage();
        }
    }, 3000);
}

if (document.readyState === 'complete') {
    main();
}
else {
    window.addEventListener("load", main, false);
}
// ==/UserScript==

