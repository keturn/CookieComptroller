/* Cookie Comptroller, an add-on to Cookie Clicker.
 *
 * The Comptroller presents reports on the Cookie Clicker economy.
 *
 * Written by Kevin Turner. Not supported or endorsed by Orteli.
 *
 * Usage notes:
 *  - Access the comptroller from the button to the right of the news ticker.
 *  - loading this script drops you down to 4 FPS. *This is intentional,* but
 *    it's a matter of preference, not a requirement of Comptroller. It should be
 *    optional. For now you may comment out the lowFPS() call in the boot function
 *    near the end of this file.
 *
 * KNOWN BUGS:
 *  - Upgrades are over-valued.
 *  - The X in the upper-right does not close the Comptroller. (Click on the 
 *    Comptroller button again, or any of the other menu buttons.)
 *
 * TODO:
 *  - inspect Cookie Clicker version for possible compatibility mismatches
 *  - report on handmade cookies during frenzy activity
 *  - report historical CPS, with expected vs realized
 *  - rework display of principal investment (for Lucky! multiplier cookies)
 *  - show theoretical return on investment from golden cookies
 *  - make userscript-compatible
 *  - document and streamline upgrade cost/benefit calculator
 *  - calculator: add option to express upgrade as percentage of a single item
 *  - add to shop: time (or date) of "total time to break even"
 *  - replace obsolete unit of time "minutes" with more contemporary "loops of Ylvis' The Fox"
 *  - report on how much income comes from each source
 *  - report on total spent on each source
 *
 * Anti-Goals:
 *  - Duplication of item tables. As cool as it would be to calculate the effects of all the
 *    upgrades, I don't want to have item tables or multipliers that get out-of-sync with the game.
 *  - New game mechanics or items.
 */
/*global Game, angular, console */

var _Comptroller = function _Comptroller(Game) {
    "use strict";

    // in minutes
    // FIXME: Check math for how multipliers combine. I fear we're over-estimating in the case
    // where there's already a global multiplier.
    var timeToRepayUpgrade = function timeToRepayUpgrade(cost, multiplier) {
        var gainedCPS = Game.cookiesPs * multiplier;
        return cost / gainedCPS / 60;
    };

    var _prefixes = ['', 'kilo', 'mega', 'giga', 'tera', 'peta', 'exa', 'zetta', 'yotta'];


    /* Given n1 and n2, how many decimal places does n1 need such that, when 
     * expressed in engineering notation, its final digit is the same scale as 
     * the leading digit in n2?
     *
     * For example,   /  /
     * enoughDigits(12345678, 
     *                 54321) = 2
     * because the '4' in 12.34e6 lines up with the leading digit in '54321.'
     *
     * The motivating factor here is to display large values in sufficient detail to still see
     * them tick up with cookies per second.
     */
    var enoughDigits = function enoughDigits(n1, n2) {
        var rootDigit, n1digits, n2digits;
        n1digits = Math.ceil(Math.log(n1) / Math.LN10);
        n2digits = Math.ceil(Math.log(n2) / Math.LN10);
        if (n2digits >= n1digits) {
            return 0;
        }
        rootDigit = Math.floor((n1digits - 1) / 3) * 3 + 1;
        return rootDigit - n2digits;
    };


    /* Display a number with its metric prefix. e.g. 12345678 = "12.3 mega"
     *
     * precision: defaults to 4
     * fixed: if true, number will be formatted with Number.toFixed, 
     * else it defaults to Number.toPrecision 
     */
    var metricPrefixed = function prefixed(n, precision, fixed) {
        var scaled, scaledStr, prefixIndex = Math.floor(Math.log(Math.abs(n)) / (Math.LN10 * 3));
        prefixIndex = Math.min(prefixIndex, _prefixes.length - 1);
        scaled = n / (Math.pow(1000, prefixIndex));

        if (precision === undefined) {
            precision = 4;
        }
        scaledStr = fixed ? scaled.toFixed(precision) : scaled.toPrecision(precision);
        return scaledStr + " " + _prefixes[prefixIndex];
    };

    /* How many minutes does it take to make a zillion cookies?
     * Where "a zillion" is the lowest power of 1000 such that the answer is greater than 1.
     *
     * e.g. 10 cookies per second = 600 cookies per minute = 1.67 minutes per kilocookie.
     */
    var timePerCookie = function timePerCookie(cookiesPs) {
        var secondsPerCookie = 1 / cookiesPs;
        var minsPer = secondsPerCookie / 60;
        var prefix = '', prefixes = ['kilo', 'mega', 'giga', 'tera', 'peta', 'exa', 'zetta', 'yotta'];
        while (minsPer < 1 && prefixes.length) {
            minsPer = minsPer * 1000;
            prefix = prefixes.shift();
        }
        return minsPer.toPrecision(3) + " minutes per " + prefix + "cookie";
    };

    // stuff that happens before the Angular app is loaded.
    var Foundation = {
        COMPTROLLER_BUTTON_ID: "comptrollerButton",
        addComptrollerButton: function () {
            var button, menubar, beforeThis;
            button = document.createElement("div");
            button.id = Foundation.COMPTROLLER_BUTTON_ID;
            button.classList.add("button");
            button.innerHTML = "Comp&shy;troller";
            beforeThis = document.getElementById("logButton");
            menubar = beforeThis.parentNode;
            menubar.insertBefore(button, beforeThis);

            button.onclick = Foundation.toggleComptroller;
            return button;
        },
        toggleComptroller: function toggleComptroller() {
            // Game.ShowMenu doesn't know what comptroller is, but at least with the current 
            // implementation (1.035) it'll clear the menu area and keep track of the fact that
            // comptroller is using it.
            Game.ShowMenu("comptroller");
        },
        addComptroller: function addComptroller() {
            var rootElement;
            rootElement = Foundation.addToDOM();
            angular.bootstrap(rootElement, ["cookieComptroller"]);
            return rootElement;
        },
        installPrereqs: function installPrereqs(callback) {
            Foundation.loadCSS();
            loadAngular(function () {
                defineServices();
                callback();
            });
        },
        loadCSS: function loadCSS() {
            var style = document.createElement("style");
            style.id = "comptrollerStyle";
            style.setAttribute('type', 'text/css');
            style.textContent = ComptrollerAssets.CSS;
            document.head.appendChild(style);
            return style;
        },
        addToDOM: function addToDOM() {
            // Adding it to the menu div would be the sensible thing to do, but
            // the menu contents get continually reset by the mainloop. So we place
            // it before the menu instead.
            var sibling = document.getElementById("menu");
            var div = document.createElement("div");
            div.id = "comptroller";
            sibling.parentNode.insertBefore(div, sibling);
            div.innerHTML = ComptrollerAssets.HTML;
            return div;
        },
        boot: function boot() {
            Foundation.installPrereqs(Foundation.addComptroller);
            Foundation.addComptrollerButton();
        }
    };

    return {
        timeToRepayUpgrade: timeToRepayUpgrade,
        timePerCookie: timePerCookie,
        enoughDigits: enoughDigits,
        metricPrefixed: metricPrefixed,
        Foundation: Foundation
    };
};
var Comptroller = _Comptroller(Game);

/* Reconfigure Cookie Clicker to run at 4 frames per second.
 *
 * Feature request here:
 * http://forum.dashnet.org/discussion/208/low-fps-mode
 */
var lowFPS = function (Game) {
    "use strict";
    var origFPS = Game.fps, newFPS = 4;
    var ratio = newFPS / origFPS;
    // FIXME: Resetting FPS mid-game may distort various counters, including including research
    // and pledges.
    Game.fps = newFPS;

    Game.baseResearchTime = Math.round(Game.baseResearchTime * ratio);
    Game.goldenCookie.delay = Math.round(Game.goldenCookie.delay * ratio);
    Game.frenzy = Math.round(Game.frenzy.delay * ratio);
    Game.clickFrenzy = Math.round(Game.clickFrenzy * ratio);
    console.info("FPS lowered.");
};


var defineServices = function defineServices() {
    "use strict";
    var module = angular.module("cookieComptroller", []);

    /* Make the stock Cookie Clicker game injectable into Angular objects. */
    module.factory("CookieClicker", function ($rootScope) {
        var origDraw = Game.Draw;
        // monkeypatch the game's Draw function so that Angular data gets updated.
        if (Game._ccompOrigDraw) {
            console.warn("Game.Draw already hooked?");
        } else {
            /*** MAINLOOP HOOK ***/
            Game._ccompOrigDraw = origDraw;
            Game.Draw = function DrawWithCookieComptroller() {
                origDraw.apply(Game, arguments);
                $rootScope.$apply();
            };
            console.debug("Game.Draw hook installed.");
        }
        return Game; // this is the global Cookie Clicker "Game" instance. 
    });

    /* Filters. */
    module.filter("metricPrefixed", function () { return Comptroller.metricPrefixed;});
};

var ComptrollerController = function ComptrollerController($scope, CookieClicker) {
    "use strict";
    $scope.Game = CookieClicker;
    $scope.timePerCookie = function () { return Comptroller.timePerCookie(CookieClicker.cookiesPs); };
    $scope.cookiesToMinutes = function (cookies) { return cookies / CookieClicker.cookiesPs / 60; };

    $scope.storeObjects = function () { return CookieClicker.ObjectsById; };
    $scope.storeUpgrades = function () { return CookieClicker.UpgradesInStore; };
    $scope.enoughDigits = Comptroller.enoughDigits;
    $scope.timeToRepayUpgrade = Comptroller.timeToRepayUpgrade;

    $scope.investmentSize = function () { return CookieClicker.cookiesPs * 60 * 20 * 10; };

    $scope.comptrollerVisible = function () { return CookieClicker.onMenu === "comptroller"; };

    $scope.store = {
        incrementalValue: function (obj) {
            return obj.storedCps * CookieClicker.globalCpsMult / CookieClicker.cookiesPs;
        },
        upgradeValue: function (upgrade) {
            /* Cookie flavours have data on their modifiers. Many others don't. */
            if (upgrade.type === 'cookie' && upgrade.power) {
                return upgrade.power / 100;
            } else {
                return undefined;
            }
        },
        minutesToRepay: function (obj) {
            return obj.price / (obj.storedCps * CookieClicker.globalCpsMult) / 60;
        }
    };
};


/* Load a script by adding a <script> tag to the document. */
var loadScript = function (url, callback) {
    "use strict";
    var script = document.createElement("script");
    script.setAttribute("src", url);
    script.addEventListener('load', callback, false);
    document.body.appendChild(script);
};

var loadAngular = function (callback) {
    "use strict";
    loadScript("https://ajax.googleapis.com/ajax/libs/angularjs/1.0.8/angular.js", callback);
};

/* Execute some code by adding a new <script> tag with it. */
function execute(functionOrCode) {
    "use strict";
    var code, e;
    if (typeof functionOrCode === "function") {
        code = "(" + functionOrCode + ")();";
    } else {
        code = functionOrCode;
    }

    e = document.createElement("script");
    e.textContent = code;

    document.body.appendChild(e);

    return e;
}

/* This is not a great way to store and edit CSS and HTML! But Chrome userscripts don't 
 * provide a way to bundle other assets besides the javascript. */
var ComptrollerAssets = {
    CSS: ("#comptroller {\n" +
        "color: white;" +
        "/* menu container, even when empty, will transparently hover over our content, so we have to one-up it. */\n" +
        "z-index:1000001; position:absolute; left:16px; right:0px; top:112px;\n" +
        "}\n\n" +
        "#comptroller b {\n" + // screw you, reset stylesheets
        "font-weight: bolder;" +
        "}\n\n" +
        ".comptrollerStore {\n" +
        "border-collapse: separate; border-spacing: 1px;" +
        "}\n\n" +
        ".comptrollerStore td, th {\n" +
        "    padding: 1px 1ex;" +
        "}\n" +
        ".comptrollerStore td {\n" +
        "background-color: #000A24;" +
        "}\n\n" +
        ".comptrollerStore tr:nth-of-type(odd) td {\n" +
        "background-color: #101A3C;" +
        "}\n\n" +
        ".comptrollerStore th {\n" +
        "font-weight: bolder;" +
        "background-color: #240A24;" +
        "vertical-align: bottom;" +
        "}\n\n" +
        "#comptroller .pctInput {\n" +
        "width: 4em;" +
        "}\n\n" +
        /* this is very much mirroring the styles of the game's logButton */
        "#comptrollerButton {\n" +
        "top: 0; right: -16px;" +
        "font-size: 80%;" +
        "padding: 14px 16px 10px 0px;" +
        "}\n\n" +
        "#comptrollerButton:hover{right:-8px;}" +
        "}\n\n"),
    HTML: (
        "<div ng-controller='ComptrollerController' ng-show='comptrollerVisible()'>\n" +
            /* frenzy? */
            "<p ng-show='Game.frenzy'>&#xa1;&#xa1;FRENZY!! " +
            "{{ Game.frenzyPower * 100 }}% for {{ (Game.frenzy / Game.fps).toFixed(1) }} seconds.</p>\n" +
            "<p ng-show='Game.clickFrenzy'>&#x2606;&#x2605;&#x2606; CLICK FRENZY!! &#x2606;&#x2605;&#x2606; " +
            "{{ Game.computedMouseCps | metricPrefixed }}cookies per click for {{ (Game.clickFrenzy / Game.fps).toFixed(1) }} seconds.</p>\n" +
            /* total cookies and rates */
            "<p>{{ Game.cookies | metricPrefixed:enoughDigits(Game.cookies, Game.cookiesPs):true }}cookies " +
            "(investment {{ (Game.cookies > investmentSize()) && '+' || '' }}{{ Game.cookies - investmentSize() | metricPrefixed }}cookies) at<br />\n" +
            "{{ Game.cookiesPs | metricPrefixed }}cookies per second, {{ Game.cookiesPs * 60 | metricPrefixed }}cookies per minute, or <br />\n" +
            "{{ timePerCookie() }}.</p>\n" +
            /* store */
            "<table class='comptrollerStore'>\n" +
            /* headers */
            "<tr><th>Price<br />(C)</th><th>Name</th><th>Price<br />(min)</th>" +
            "<th>Incremental<br />Value %</th><th>Time to Repay<br/>(min)</th></tr>\n" +
            /* objects */
            "<tbody>\n" +
            "    <tr ng-repeat='obj in storeObjects()'>" +
            "    <td style='text-align: right'>{{ obj.price | number:0 }}</td>" +
            "    <td style='text-align: left'>{{ obj.name }}</td>" +
            "    <td style='text-align: right'>{{ cookiesToMinutes(obj.price) | number:1 }}</td>" +
            "    <td style='text-align: right'>{{ store.incrementalValue(obj) * 100 | number }}%</td>" +
            "    <td style='text-align: right'>{{ store.minutesToRepay(obj) | number:1 }}</td>" +
            "</tr>\n" +
            /* upgrades */
            "<tr ng-repeat='obj in storeUpgrades()' ng-click='$parent.selectedUpgrade = obj'>" +
            "    <td style='text-align: right'>{{ obj.basePrice | number:0 }}</td>" +
            "    <td style='text-align: left'>{{ obj.name }}</td>" +
            "    <td style='text-align: right'>{{ cookiesToMinutes(obj.basePrice) | number:1 }}</td>" +
            "    <td style='text-align: right'>{{ store.upgradeValue(obj) * 100 || '?' | number }}%</td>" +
            "    <td style='text-align: right'>{{ timeToRepayUpgrade(obj.basePrice, store.upgradeValue(obj)) | number:1 }}</td>" +
            "</tr>\n" +
            "</tbody>\n" +
            /* calculator */
            "<tbody><tr>" +
        "    <td style='text-align: right'>{{ selectedUpgrade.basePrice | number:0 }}</td>" +
        "    <td>{{ selectedUpgrade.name }}</td>" +
        "    <td style='text-align: right'>{{ cookiesToMinutes(selectedUpgrade.basePrice) | number:1 }}</td>" +
        "    <td style='text-align: right'><input type='number' class='pctInput' ng-model='upgradePercent'>%</td>" +
        "    <td style='text-align: right'>{{ timeToRepayUpgrade(selectedUpgrade.basePrice, upgradePercent / 100) | number:1 }}</td>" +
        "</tr>\n<tr>" +
        "    <td colspan='5' class='description' ng-bind-html-unsafe='selectedUpgrade.desc'></td>\n" +
        "</tr></tbody>" +
        "</table>\n" +
        "</div>\n")
};

var boot = function () {
    "use strict";
    lowFPS(Game);
    Comptroller.Foundation.boot();
};

boot();
