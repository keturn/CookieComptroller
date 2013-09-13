/* Cookie Comptroller, an add-on to Cookie Clicker.
 *
 * The Comptroller presents reports on the Cookie Clicker economy.
 *
 * Written by Kevin Turner. Not supported or endorsed by Orteli.
 
 * TODO:
 *  - inspect Cookie Clicker version for possible compatibilty mismatches
 *  - report on handmade cookies during frenzy activity
 *  - report historical CPS, with expected vs realized
 *  - rework display of ideal investment (for Lucky! multiplier cookies)
 *  - make userscript-compatible
 *  - streamline upgrade cost/benefit calculator
 *  - replace obsolete unit of time "minutes" with more contemporary "loops of Ylvis' The Fox"
 *
 * Anti-Goals:
 *  - Duplication of item tables. As cool as it would be to calculate the effects of all the
 *    upgrades, I don't want to have item tables or multipliers that get out-of-sync with the game.
 *  - New game mechanics or items.
 */

var _Comptroller = function _Comptroller(Game) {
    var ViewModel = function ViewModel () {};

    // in minutes
    var timeToRepayUpgrade = function timeToRepayUpgrade(cost, multiplier) {
        var gainedCPS = Game.cookiesPs * multiplier;
        return cost / gainedCPS / 60;
    }

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
    }


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
        };
        return minsPer.toPrecision(3) + " minutes per " + prefix + "cookie"
    };

    return {
        ViewModel: ViewModel,
        timeToRepayUpgrade: timeToRepayUpgrade,
        timePerCookie: timePerCookie,
        enoughDigits: enoughDigits,
        metricPrefixed: metricPrefixed
    };
};
Comptroller = _Comptroller(Game);

/* Reconfigure Cookie Clicker to run at 4 frames per second.
 *
 * Feature request here:
 * http://forum.dashnet.org/discussion/208/low-fps-mode
 */
var lowFPS = function (Game) {
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


var defineServices = function defineServices () {
    var module = angular.module("cookieComptroller", []);
    
    /* Make the stock Cookie Clicker game injectable into Angular objects. */
    module.factory("CookieClicker", function ($rootScope) { 
        var origDraw = Game.Draw;
        // monkeypatch the game's Draw function so that Angular data gets updated.
        if (Game._ccompOrigDraw) { 
            console.warn("Game.Draw already hooked?");
        } else {
            Game._ccompOrigDraw = origDraw;
            Game.Draw = function () {
                origDraw.apply(Game, arguments);
                $rootScope.$apply();
            }
            console.debug("Game.Draw hook installed.")
        }
        return Game; // this is the global Cookie Clicker "Game" instance. 
    });
    
    /* Filters. */
    module.filter("metricPrefixed", function () { return Comptroller.metricPrefixed;} );
};

var ComptrollerController = function ComptrollerController($scope, CookieClicker) {
    $scope.Game = CookieClicker;
    $scope.timePerCookie = function () { return Comptroller.timePerCookie(CookieClicker.cookiesPs); }
    $scope.cookiesToMinutes = function (cookies) { return cookies / CookieClicker.cookiesPs / 60; }

    $scope.storeObjects = function () { return CookieClicker.ObjectsById };
    $scope.storeUpgrades = function () { return CookieClicker.UpgradesInStore };
    $scope.enoughDigits = Comptroller.enoughDigits;
    $scope.timeToRepayUpgrade = Comptroller.timeToRepayUpgrade;
    
    $scope.investmentSize = function () { return CookieClicker.cookiesPs * 60 * 20 * 10; };
    
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
    }
};

var bootstrap = function bootstrap() {
    angular.bootstrap(document.getElementById("comptroller"), ["cookieComptroller"]);
};

var angularLoaded = function () {
    defineServices(); bootstrap();
};

/* Load a script by adding a <script> tag to the document. */
var loadScript = function (url, callback) {
  var script = document.createElement("script");
  script.setAttribute("src", url);
  script.addEventListener('load', callback, false);
  document.body.appendChild(script);
}

var loadAngular = function (callback) {
    loadScript("https://ajax.googleapis.com/ajax/libs/angularjs/1.0.8/angular.js", callback);
};

/* Execute some code by adding a new <script> tag with it. */
function execute(functionOrCode) {
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
    CSS:   ("#comptroller {\n" +
      "position: absolute; z-index: 500; bottom: 40px; \n" +
      "color: white;" +
      "background-color:  rgba(0,0,0,0.85);\n" +
      "border: thick black outset;\n" +
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
  "}\n\n" +
  "#comptroller .pctInput {\n" +
      "width: 4em;" +
  "}\n\n"),
    HTML: (
      "<div ng-controller='ComptrollerController'>\n" +
      /* frenzy? */
      "<p ng-show='Game.frenzy'>&#xa1;&#xa1;FRENZY!! " + 
      "{{ Game.frenzyPower * 100 }}% for {{ (Game.frenzy / Game.fps).toFixed(1) }} seconds.</p>\n" +
      "<p ng-show='Game.clickFrenzy'>&#x2606;&#x2605;&#x2606; CLICK FRENZY!! &#x2606;&#x2605;&#x2606; " + 
      "{{ Game.computedMouseCps | metricPrefixed }}cookies per click for {{ (Game.clickFrenzy / Game.fps).toFixed(1) }} seconds.</p>\n" +
      /* total cookies and rates */
      "<p>{{ Game.cookies | metricPrefixed:enoughDigits(Game.cookies, Game.cookiesPs):true }}cookies " + 
      "(investment {{ (Game.cookies > investmentSize()) && '+' || '' }}{{ Game.cookies - investmentSize() | metricPrefixed }}cookies) at<br />\n" + 
      "{{ Game.cookiesPs | metricPrefixed }}cookies per second, {{ Game.cookiesPs * 60 | metricPrefixed }}cookies per minute, or <br \>\n" + 
      "{{ timePerCookie() }}.</p>\n" +
      /* store */
      "<table class='comptrollerStore'>\n" +
      "<tr><th>Name</th><th>Price<br />(C)</th><th>Price<br />(min)</th>" + 
      "<th>Incremental<br />Value %</th><th>Time to Repay<br/>(min)</th></tr>\n" +
      "<tbody>\n" +
      "    <tr ng-repeat='obj in storeObjects()'>" + 
      "    <td style='text-align: left'>{{ obj.name }}</th>" + 
      "    <td style='text-align: right'>{{ obj.price | number:0 }}</th>" + 
      "    <td style='text-align: right'>{{ cookiesToMinutes(obj.price) | number:1 }}</th>" + 
      "    <td style='text-align: right'>{{ store.incrementalValue(obj) * 100 | number }}%</th>" + 
      "    <td style='text-align: right'>{{ store.minutesToRepay(obj) | number:1 }}</th>" + 
      "</tr>\n" +
      "<tr ng-repeat='obj in storeUpgrades()'>" +
      "    <td style='text-align: left' ng-click='$parent.selectedUpgrade = obj'>{{ obj.name }}</th>" + 
      "    <td style='text-align: right'>{{ obj.basePrice | number:0 }}</th>" + 
      "    <td style='text-align: right'>{{ cookiesToMinutes(obj.basePrice) | number:1 }}</th>" + 
      "    <td style='text-align: right'>{{ store.upgradeValue(obj) * 100 || '?' | number }}%</th>" + 
      "    <td style='text-align: right'>{{ timeToRepayUpgrade(obj.basePrice, store.upgradeValue(obj)) | number:1 }}</th>" + 
      "</tr>\n" +
      "</tbody>\n" +
      "<tbody><tr>" +
      "    <td><select ng-model='selectedUpgrade' ng-options='u.name for u in storeUpgrades()'></select></th>" +
      "    <td style='text-align: right'>{{ selectedUpgrade.basePrice | number:0 }}</th>" + 
      "    <td style='text-align: right'>{{ cookiesToMinutes(selectedUpgrade.basePrice) | number:1 }}</th>" + 
      "    <td style='text-align: right'><input type='number' class='pctInput' ng-model='upgradePercent'>%</th>" + 
      "    <td style='text-align: right'>{{ timeToRepayUpgrade(selectedUpgrade.basePrice, upgradePercent / 100) | number:1 }}</td></th>" + 
      "</tr>\n<tr>" +
      "    <td colspan='5' class='description' ng-bind-html-unsafe='selectedUpgrade.desc'></td>\n" +
      "</tr></tbody>" +
      "</table>\n" +
      "</div>\n")
};

var addComptrollerToDOM = function () {
  var style = document.createElement("style");
  style.setAttribute('type', 'text/css');
  style.textContent = ComptrollerAssets.CSS;
  document.head.appendChild(style);

  var div = document.createElement("div");
  div.id = "comptroller";
  document.body.appendChild(div);
  div.innerHTML = ComptrollerAssets.HTML;
}


var boot = function () {
    lowFPS(Game);
    addComptrollerToDOM();
    loadAngular(angularLoaded);
};

boot();