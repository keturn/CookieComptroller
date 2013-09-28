/* Cookie Comptroller, an add-on to Cookie Clicker.
 *
 * The Comptroller presents reports on the Cookie Clicker economy.
 *
 * Written by Kevin Turner. Not supported or endorsed by Orteil.
 *
 * Find source and report issues at https://github.com/keturn/CookieComptroller
 *
 * Usage notes:
 *  - Access the comptroller from the button to the right of the news ticker.
 *
 * KNOWN BUGS:
 *  - Plenty of division-by-zero when you have zero CPS.
 *  - The X in the upper-right does not close the Comptroller. (Click on the 
 *    Comptroller button again, or any of the other menu buttons.)
 *
 * TODO:
 *  Shop:
 *  - have upgrade calculator show its work
 *  - heuristically determine all the building-doubler upgrades
 *  - time (or date) of "total time to buy & break even"
 *  - indicate which items are affordable (after principal)
 *  - show fewer digits when all prices are very large
 *  - show how many Heavenly Chips this run is worth, time to next chip
 *  - offer suggestions of when to end it all for the prestige gain
 *  Golden Cookies:
 *  - report on handmade cookies during frenzy activity
 *  - rework display of principal investment (for Lucky! multiplier cookies)
 *  - show theoretical return on investment from golden cookies
 *  Reports:
 *  - show more income detail with % from base, upgrades, flavours, kittens
 *  - include upgrades on spending chart
 *  - report historical CPS, with expected vs realized
 *  General:
 *  - inspect Cookie Clicker version for possible compatibility mismatches
 *  - replace obsolete unit of time "minutes" with more contemporary "loops of Ylvis' The Fox"
 *
 * Anti-Goals:
 *  - New game mechanics or items.
 *  - Auto-clicking.
 *  - Duplication of item tables. As cool as it would be to calculate the effects of all the
 *    upgrades, I don't want to have item tables or multipliers that get out-of-sync with the game.
 *    If you want an add-on that's really smart about upgrades, seek out Cookie Monster. It's great!
 *
 * Compatibility notes:
 *  - As of Cookie Clicker 0.2.20130927, Cookie Monster and Cookie Comptroller
 *    may be loaded at teh same time, but there is one very significant issue:
 *    it makes Golden Cookies spawn *under* the Comptroller UI if you have it
 *    open at the time. You have to close it (or switch to another menu) to
 *    click on the cookie.
 */
// ==UserScript==
// @name Cookie Comptroller
// @description Reports on your Cookie Clicker accounting.
// @match http://orteil.dashnet.org/cookieclicker/
// @match http://orteil.dashnet.org/cookieclicker/#*
// @version 0.2.20130927
// @namespace http://keturn.net/
// @downloadURL https://userscripts.org/scripts/source/177907.user.js
// ==/UserScript==

/*global angular */


var _Comptroller = function _Comptroller(Game) {
    "use strict";

    /* As much as possible, I try to determine relevant factors direct from the game objects, but there are a
     * few that we've specified manually. These could potentially get out of sync.
     * Last verified for Cookie Clicker version 1.036. */
    var CCConstants = {
        // From Game.goldenCookie.click
        GOLDEN_MULTIPLY_FACTOR: 0.1,
        GOLDEN_MULTIPLY_CAP: 60 * 20,
        GOLDEN_FRENZY_FACTOR: 7,
        // From Game.CalculateGains
        milkUpgrades: {
            'Kitten helpers': 0.05,
            'Kitten workers': 0.1,
            'Kitten engineers': 0.2,
            'Kitten overseers': 0.3
        },
        malus: {
            'Elder Covenant': 0.95
        },
        UPDATE_ON_ELEMENT: 'cookies'
    };

    var WIKI = 'https://github.com/keturn/CookieComptroller/wiki/';

    var DEBUG = false;

    /* String formatting functions. Purely functional with no game logic or advanced object types. */
    var FormatUtils = (function () {
        var _prefixes = ['', 'kilo', 'mega', 'giga', 'tera', 'peta', 'exa', 'zetta', 'yotta'];

        return {
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
            enoughDigits: function enoughDigits(n1, n2) {
                var rootDigit, n1digits, n2digits;
                n1digits = Math.ceil(Math.log(n1) / Math.LN10);
                n2digits = Math.ceil(Math.log(n2) / Math.LN10);
                if (n2digits >= n1digits) {
                    return 0;
                }
                rootDigit = Math.floor((n1digits - 1) / 3) * 3 + 1;
                return rootDigit - n2digits;
            },


            /* Display a number with its metric prefix. e.g. 12345678 = "12.3 mega"
             *
             * precision: defaults to 4
             * fixed: if true, number will be formatted with Number.toFixed,
             * else it defaults to Number.toPrecision
             */
            metricPrefixed: function metricPrefixed(n, precision, fixed) {
                var scaled, scaledStr,
                    prefixIndex = Math.floor(Math.log(Math.abs(n)) / (Math.LN10 * 3));
                prefixIndex = Math.min(prefixIndex, _prefixes.length - 1);
                scaled = n / (Math.pow(1000, prefixIndex));

                if (precision === undefined) {
                    precision = 4;
                }
                scaledStr = fixed ? scaled.toFixed(precision) : scaled.toPrecision(precision);
                return scaledStr + " " + _prefixes[prefixIndex];
            },


            /* How many minutes does it take to make a zillion cookies?
             * Where "a zillion" is the lowest power of 1000 such that the
             * answer is greater than 1.
             *
             * e.g. 10 cookies per second = 600 cookies per minute
             *         = 1.67 minutes per kilocookie.
             */
            timePerCookie: function timePerCookie(cookiesPs) {
                var secondsPerCookie = 1 / cookiesPs;
                var minsPer = secondsPerCookie / 60;
                var prefix = '', prefixes = ['kilo', 'mega', 'giga', 'tera', 'peta', 'exa', 'zetta', 'yotta'];
                while (minsPer < 1 && prefixes.length) {
                    minsPer = minsPer * 1000;
                    prefix = prefixes.shift();
                }
                return minsPer.toPrecision(3) + " minutes per " + prefix + "cookie";
            },
            /**
             * A string to represent a duration with only one or two
             * significant digits.
             * @param {number} seconds
             * @returns {string}
             */
            lowPrecisionTime: function lowPrecisionTime(seconds) {
                var text;
                if (seconds < 10) {
                    text = "less than 10 seconds";
                } else if (seconds < 100) {
                    // round to the nearest 5 to reflect limited precision
                    text = (Math.round(seconds / 5) * 5).toString() + ' seconds';
                } else if (seconds < 60 * 90) {
                    text = (Math.round(seconds / 60 / 5) * 5).toString() + ' minutes';
                } else if (seconds < 3600 * 40) {
                    text = Math.round(seconds / 3600).toString() + ' hours';
                } else if (seconds < 3600 * 24 * 20) {
                    text = Math.round(seconds / (3600 * 24)).toString() + ' days';
                } else {
                    text = Math.round(seconds / (3600 * 24 * 7)).toString() + ' weeks';
                }
                return text;
            }
        };
    })();

    /* This is not a great way to store and edit CSS and HTML! But Chrome
     * userscripts don't provide a way to bundle other assets besides the
     * javascript. */
    var ComptrollerAssets = {
        CSS: ("@import url(http://fonts.googleapis.com/css?family=Roboto:400,700&subset=latin,latin-ext);\n" +
            "\n" +
            "#comptroller {\n" +
            "    color: white;" +
            "    /* menu container, even when empty, will transparently hover over our content, so we have to one-up it. */\n" +
            "    z-index:1000001; position:absolute; left:16px; right:0px; top:112px;\n" +
            "    margin: 1em;\n" +
            "}\n\n" +
            "#comptroller p + p {\n" +
            "    margin-bottom: 1em;" +
            "}" +
            "#comptroller table {\n" +
            "    font-family: 'Roboto', 'Open Sans', sans-serif;" +
            "}\n" +
            "#comptroller b {\n" + // screw you, reset stylesheets
            "    font-weight: bolder;" +
            "}\n\n" +
            ".comptrollerNav {\n" +
            "    float: right;\n" +
            "}\n\n" +
            "#comptroller .helpLink {\n" +
            "    font-family: Kavoon, Georgia, serif;\n" +
            "    font-size: larger;\n" +
            "    float: right;" +
            "    margin: 1em;" +
            "}\n\n" +
            ".comptrollerPane {\n" +
            "    overflow-x: auto;" +
            "}\n" +
            ".comptrollerStore {\n" +
            "    border-collapse: separate; border-spacing: 1px;" +
            "}\n\n" +
            ".comptrollerStore td, th {\n" +
            "    padding: 1px 1ex;" +
            "}\n" +
            ".comptrollerStore td {\n" +
            "    color: #EAEAEA;" +
            "    background-color: #000A24;" +
            "}\n\n" +
            ".comptrollerStore tr:nth-of-type(odd) td {\n" +
            "    background-color: #101A3C;" +
            "}\n\n" +
            ".comptrollerStore th {\n" +
            "    background-color: #240A24;" +
            "    vertical-align: bottom;" +
            "}\n\n" +
            "#comptroller .pctInput {\n" +
            "    width: 4em;" +
            "}\n\n" +
            "#comptroller .priceCookie {\n" +
            "    vertical-align: bottom;" +
            "}\n\n" +
            ".comptrollerIncomeTable {" +
            "    color: black;" +
            "    background-color: #F0F0F0;" +
            "    border-collapse: collapse;" +
            "    width: 96%;" +
            "    margin: 2%;" +
            "}\n" +
            ".comptrollerIncomeTable th { font-size: larger; }\n" +
            ".comptrollerIncomeTable th, .comptrollerIncomeTable td { " +
            "    padding: 0.5ex 1ex;" +
            "    border-bottom: thin dashed #ccc;" +
            "    vertical-align: middle;" +
            "}\n" +
            ".comptrollerIncomeTable .nameCol {" +
            "    width: -webkit-min-content;" +
            "    width: -moz-min-content;" +
            "    text-align: center;" +
            "    font-family: Kavoon, Georgia, Serif;" +
            "}\n" +
            ".comptrollerIncomeTable .expenseCol {" +
            "    text-align: right;" +
            "}\n" +
            ".comptrollerIncomeTable .expenseBar {" +
            "    position: absolute;" +
            "    right: 0;" +
            "    z-index: 0;" +
            "    width: 100%;" +
            "}\n" +
            ".comptrollerIncomeTable .incomeBar {" +
            "    position: absolute;" +
            "    left: 0;" +
            "    z-index: 0;" +
            "    width: 100%;" +
            "}\n" +
            ".comptrollerIncomeTable span.buildingBar, .comptrollerIncomeTable span.upgradeBar {" +
            "    display: inline-block;" +
            "    box-sizing: border-box;" +
            "    -moz-box-sizing: border-box;" +
            "}\n" +
            ".comptrollerIncomeTable .buildingBar {" +
            "    background: hsla(185, 80%, 70%, 1);" +
            "    border: thin outset hsla(185, 80%, 70%, 1);" +
            "}\n" +
            ".comptrollerIncomeTable .expenseBar .rightSegment {" +
            "    border-left-width: 0;" +
            "}\n" +
            ".comptrollerIncomeTable .incomeBar .rightSegment {" +
            "    border-left-width: 0;" +
            "}\n" +
            ".comptrollerIncomeTable .upgradeBar {" +
            "    background: hsla(120, 80%, 70%, 1);" +
            "    border: thin outset hsla(120, 80%, 70%, 1);" +
            "}\n" +

            ".comptrollerIncomeTable .expenseLabel, .comptrollerIncomeTable .incomeLabel {" +
            "    position: relative;" +
            "    z-index: 1;" +
            "}\n" +
            ".comptrollerIncomeTable .pct {" +
            "    width: 8ex;" +
            "    display: inline-block;" +
            "    text-align: right;" +
            "}\n" +
            ".comptrollerIncomeTable .cellContainer { position: relative; }\n" +
            ".comptrollerDebug table tr {\n" +
            "    border: thin solid #888;" +
            "}\n" +
            ".comptrollerDebug table td {\n" +
            "    padding-left: 1ex;" +
            "}\n" +
            /* from tooltip.description */
            "#comptroller .description q {\n" +
            "    display:block; position:relative; text-align:right; " +
            "    margin-top:8px; font-style:italic; opacity:0.7;" +
            "}\n" +
            /* this is very much mirroring the styles of the game's logButton */
            "#comptrollerButton {\n" +
            "    top: 0; right: -16px;" +
            "    font-size: 80%;" +
            "    padding: 14px 16px 10px 0px;" +
            "}\n\n" +
            "#comptrollerButton:hover{right:-8px;}" +
            "}\n\n" +
            "/*# sourceURL=comptroller.css */"),
        HTML: ("<div ng-controller='ComptrollerController' ng-show='comptrollerVisible()'>\n" +
            "<div class='comptrollerNav'>" +
            "<select ng-model='pane' ng-options='pane for pane in panes'></select></div> " +
            /* frenzy? */
            "<p ng-show='Game.frenzy'>&#xa1;&#xa1;FRENZY!! " +
            "{{ Game.frenzyPower * 100 }}% for {{ (Game.frenzy / Game.fps).toFixed(1) }} seconds.</p>\n" +
            "<p ng-show='Game.clickFrenzy'>&#x2606;&#x2605;&#x2606; CLICK FRENZY!! &#x2606;&#x2605;&#x2606; " +
            "{{ Game.computedMouseCps | metricPrefixed }}cookies per click for {{ (Game.clickFrenzy / Game.fps).toFixed(1) }} seconds.</p>\n" +
            /* total cookies and rates */
            "<p>{{ Game.cookies | metricPrefixed:enoughDigits(Game.cookies, Game.cookiesPs):true }}cookies " +
            "(principal {{ (Game.cookies > principalSize()) && '+' || '' }}{{ Game.cookies - principalSize() | metricPrefixed }}cookies) at<br />\n" +
            "{{ Game.cookiesPs | metricPrefixed }}cookies per second, {{ Game.cookiesPs * 60 | metricPrefixed }}cookies per minute, or <br />\n" +
            "{{ timePerCookie() }}.</p>\n" +
            "<p>At current prices it will take roughly {{ timeToAccel() }} to " +
            "buy 15% more CPS.</p>" +
            "<div ng-switch='pane' class='comptrollerPane'>" +
            /* store */
            "<table ng-switch-when='purchasing' class='comptrollerStore'>\n" +
            /* headers */
            "<tr><th>Price (<img src='img/money.png' class='priceCookie' alt='cookies' />)</th>" +
            "<th>Name</th><th>Price<br />(min)</th>" +
            "<th>Incremental<br />Value %</th><th>Time to Repay<br/>(min)</th></tr>\n" +
            /* objects */
            "<tbody>\n" +
            "    <tr ng-repeat='obj in storeObjects()' ng-click='setSelected(obj)'>" +
            "    <td style='text-align: right'>{{ obj.price | number:0 }}</td>" +
            "    <td style='text-align: left' ng-bind-html-unsafe='obj.name'></td>" +
            "    <td style='text-align: right'>{{ cookiesToMinutes(obj.price) | number:1 }}</td>" +
            "    <td style='text-align: right'>{{ store.incrementalValue(obj) * 100 | number }}%</td>" +
            "    <td style='text-align: right'>{{ store.minutesToRepay(obj) | number:1 }}</td>" +
            "</tr>\n" +
            /* upgrades */
            "<tr ng-repeat='obj in storeUpgrades()' ng-click='setSelected(obj)'>" +
            "    <td style='text-align: right'>{{ obj.basePrice | number:0 }}</td>" +
            "    <td style='text-align: left' ng-bind-html-unsafe='obj.name'></td>" +
            "    <td style='text-align: right'>{{ cookiesToMinutes(obj.basePrice) | number:1 }}</td>" +
            "    <td style='text-align: right'>{{ store.upgradeValue(obj) }}</td>" +
            "    <td style='text-align: right'>{{ store.timeToRepayUpgrade(obj) | number:1 }}</td>" +
            "</tr>\n" +
            "</tbody>\n" +
            // having a tough time with ng-switch around tbody children, so
            // we abuse ng-repeat here to get a kludgy version of ng-if.
            "<tbody ng-repeat='kludge in showCalculator(\"upgrade\")' ng-controller='UpgradeCalculatorController''>\n" +
            "<tr><th colspan='5'>Upgrade Calculator</th></tr>\n" +
            "<tr>\n" +
            "    <td style='text-align: right'>{{ selected.basePrice | number:0 }}</td>" +
            "    <td ng-bind-html-unsafe='selected.name'></td>" +
            "    <td style='text-align: right'>{{ cookiesToMinutes(selected.basePrice) | number:1 }}</td>" +
            "    <td colspan='2' rowspan='2'></td></tr>\n" +
            "<tr><td colspan='3' class='description' ng-bind-html-unsafe='selected.desc'></td></tr>\n" +
            "<tr><td colspan='3'>Modifies: " +
            "    <select ng-model='selectedUpgradeDomain' ng-options='obj.name for obj in storeObjects()'>\n" +
            "        <option value=''>*global*</option>\n" +
            "    </select><br />\n" +
            "Multiplier Add: +<input type='number' ng-model='selectedUpgradeAdd' class='pctInput' required />%</td>" +
            "<td style='text-align: right'>{{ calculator.selectedIncValue() * 100 | number }}%</td>" +
            "<td style='text-align: right'>{{ calculator.selectedTTR() | number:1 }}</td>" +
            "</tr>\n" +
            "</tbody>\n" +
            "<tbody ng-repeat='kludge in showCalculator(\"building\")' ng-controller='BuildingCalculatorController''>\n" +
            "<tr><th colspan='5'>Building Calculator</th></tr>\n" +
            "<tr>\n" +
            "    <td style='text-align: right'>{{ totalCost() | number:0 }}</td>" +
            "    <td>{{ sayHowMany() }}</td>" +
            "    <td style='text-align: right'>{{ cookiesToMinutes(totalCost()) | number:1 }}</td>" +
            "    <td style='text-align: right'>{{ totalIncrementalValue() * 100 | number }}%</td>" +
            "    <td style='text-align: right'>{{ minutesToRepay() | number:1 }}</td></tr>\n" +
            "<tr><td colspan='3'>" +
            "Target amount: " +
            "<input type='number' min='{{selected.amount+1}}' ng-model='targetAmount' required>" +
            "<br />Currently Owned: {{selected.amount}}</td><td colspan='2' style='text-align: right'><small>(not counting achievements)</small></td></tr>" +
            "</tbody>\n" +
            "<tr><th colspan='5' ng-hide='calculatorMode'>click a row to show the calculator</th></tr>\n" +
            "</ng-switch>\n</table>\n" +
            /* Income and Expense report */
            "<div ng-switch-when='income' class='comptrollerIncome'>" +
            "<table class='comptrollerIncomeTable' ng-controller='IncomeController'>" +
            "<colgroup>" +
            "    <col class='expenseCol'/>" +
            "    <col class='nameCol'/>" +
            "    <col class='incomeCol'/>" +
            "</colgroup>\n" +
            "<tr><th>Spent</th><th>Name</th>" +
            "<th>Income (<abbr title='Cookies per Second'>CPS</abbr>)</th></tr>" +
            "<tbody>\n" +
            /* oh geez absolute positioning within table cells is buckets of fun. */
            "<tr ng-repeat='obj in storeObjects()' ng-show='obj.amount'>" +
            "  <td class='expenseCol'><div class='cellContainer'>" +
            "    <div class='expenseBar'>" +
            "        <span class='upgradeBar' ng-style='{width: pctSpentOnBuildingUpgrades(obj) * 100 + \"%\"}'>&nbsp;</span>" +
            // it's important there is no whitespace between these spans
            "<!-- --><span class='buildingBar rightSegment' ng-style='{width: pctSpentOn(obj) * 100 + \"%\"}'>&nbsp;</span>" +
            "    </div>" +
            "    <div class='expenseLabel'>" +
            "      <span class='spend'>{{ spentOnCombined(obj) | number:0 }}</span>" +
            "      <span class='pct'>{{ pctSpentOnCombined(obj) * 100 | number }}%</span>" +
            "  </div></div></td>" +
            "  <td class='nameCol' ng-bind-html-unsafe='obj.name'></td>" +
            "  <td class='incomeCol'><div class='cellContainer'>" +
            "    <div class='incomeBar'>" +
            "        <span class='buildingBar' ng-style='{width: baseIncomePct(obj) * 100 + \"%\"}'>&nbsp;</span>" +
            "<!-- --><span class='upgradeBar rightSegment' ng-style='{width: upgradeIncomePct(obj) * 100 + \"%\"}'>&nbsp;</span>" +
            "</div>" +
            "    <div class='incomeLabel'>" +
            "      <span class='pct'>{{ incomePct(obj) * 100| number }}%</span>" +
            "      <span class='income'>{{ income(obj) | number:0 }}</span>" +
            "    </div>" +
            "  </td>" +
            "</tr>\n" +
            "</tbody></table>\n" +
            "<!-- end div.comptrollerIncome --></div>\n" +
            "<div ng-switch-when='debug' class='comptrollerDebug' ng-controller='DebugController'>" +
            "<p>DEBUGGIN</p>" +
            "<table>\n" +
            "<tr ng-repeat='(upID, upgrade) in ups.upgrades'>" +
            "    <td>{{ upID }}</td>" +
            "    <td><span ng-bind-html-unsafe='upgrade.name'></span><br />" +
            "        {{ ups.upgradeIdToBuilding[upID].name || '!!!!!!!!' }}</td>" +
            "    <td ng-bind-html-unsafe='upgrade.desc' class='description'></td>" +
            "</tr>\n" +
            "</table>\n" +
            "<hr />\n" +
            "<table>\n" +
            "<tr ng-repeat='(bldID, building) in bldgs.buildings'>" +
            "<th>{{ building.name }}</th>\n" +
            "<td><ul>\n" +
            "    <li ng-repeat='upgrade in ups.byBuildingId[bldID]'>" +
            "    <span ng-bind-html-unsafe='upgrade.name'></span></li>\n" +
            "</ul></td>" +
            "</tr>\n" +
            "<tr>" +
            "<th>Kittens</th>\n" +
            "<td><ul>\n" +
            "    <li ng-repeat='upgrade in ups.kittenUpgrades'>" +
            "    <span ng-bind-html-unsafe='upgrade.name'></span></li>\n" +
            "</ul></td>" +
            "</tr>\n" +
            "<th>Global Production</th>\n" +
            "<td><ul>\n" +
            "    <li ng-repeat='upgrade in ups.globalUpgrades'>" +
            "    <span ng-bind-html-unsafe='upgrade.name'></span></li>\n" +
            "</ul></td>" +
            "</tr>\n" +
            "</table>\n" +
            "<hr />\n" +
            "<table>\n" +
            "<tr ng-repeat='(bldID, building) in bldgs.buildings'>" +
            "<td>{{ bldID }}</td>" +
            "<td>{{ building.name }}</td>" +
            "<td>{{ bldgs.buildingCPS[bldID] }}</td>" +
            "<td>{{ building.storedCps }}</td>" +
            "</tr>\n" +
            "</table>" +
            "<!-- end DebugController --></div>\n" +
            "<!-- end div.comptrollerPane --></div>\n" +
            "<p class='helpLink'><a target='_blank' rel='help' href='{{ helpURL() }}'>Help?</a></p>\n" +
            "<!-- end ComptrollerController --></div>\n" +
            "<!-- end of div#comptroller --></div>\n")
    };

    // stuff that happens before the Angular app is loaded.
    var Foundation = {
        COMPTROLLER_BUTTON_ID: "comptrollerButton",
        COMPTROLLER_MENU: "comptroller",
        rootElement: null,
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
        // event handler for the comptroller menu button
        toggleComptroller: function toggleComptroller() {
            // Game.ShowMenu doesn't know what comptroller is, but at least with
            // the current implementation (1.036) it'll clear the menu area and
            // keep track of the fact that comptroller is using it.
            Game.ShowMenu(Foundation.COMPTROLLER_MENU);
        },
        addComptroller: function addComptroller() {
            var rootElement;
            rootElement = Foundation.addToDOM();
            // Most Angular applications use the entire DOM. But since we don't control the entire DOM,
            // we want to minimize the chances of conflicting with our host, so we're just bootstrapping
            // angular on this single container and we'll have all our UI inside that.
            angular.bootstrap(rootElement, ["cookieComptroller"]);
            return rootElement;
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
            Foundation.loadCSS();
            defineServices();
            Foundation.rootElement = Foundation.addComptroller();
            Foundation.addComptrollerButton();
        }
    };


    /**
     * Make the stock Cookie Clicker Game object injectable into Angular
     * objects, and hook in to its mainloop so Angular can find updated data.
     * @param $rootScope {Scope}
     * @returns {CookieClickerService}
     * @constructor
     */
    var CookieClickerService = function CookieClickerService($rootScope) {
        var thisService = this;

        /* The goal is to get angular watchers updated when game data changes,
         * preferably in sync with the game's draw cycle. Ideally we'd have a
         * way to hook into the game's mainloop and run when Game.Draw does.
         * Earlier versions monkey-patched a call to us into Game.Draw, but
         * that made things too brittle when integrating with other add-ons
         * (i.e. Cookie Monster).
         */

        this.onChange = function onChange() { $rootScope.$apply(); };
        this.observer = new MutationObserver(this.onChange);
        this.observer.observe(
            document.getElementById(CCConstants.UPDATE_ON_ELEMENT),
            {childList: true}
        );

        // I think I'm getting *closer* to a proper separation of concerns here,
        // but I fear that this service definition is still in poor form.

        this.Game = Game;
        this.cookiesToMinutes = function (cookies) {
            return cookies / Game.cookiesPs / 60;
        };
        this.storeObjects = function () { return Game.ObjectsById; };
        this.storeUpgrades = function () { return Game.UpgradesInStore; };
        this.cpsWithoutFrenzy = function () {
            return (Game.frenzy > 0 ?
                Game.cookiesPs / Game.frenzyPower :
                Game.cookiesPs);
        };
        /**
         * How much should you keep in the bank for maximum return from
         * Lucky multiplier cookies?
         * @returns {number}
         */
        this.principalSize = function () {
            var cps = thisService.cpsWithoutFrenzy(), principal;

            principal = (cps * CCConstants.GOLDEN_MULTIPLY_CAP /
                CCConstants.GOLDEN_MULTIPLY_FACTOR);
            // With "Get Lucky" you have significant chance to overlap your
            // frenzy CPS with a Lucky multiplier cookie, so you want the
            // principal to be high enough to take advantage of that.
            if (Game.Has('Get lucky')) {
                principal *= CCConstants.GOLDEN_FRENZY_FACTOR;
            }
            return principal;
        };
        /**
         * Global CPS multiplier regardless of any frenzy effects.
         * @returns {number}
         */
        this.globalMultNoFrenzy = function globalMultNoFrenzy () {
            if (Game.frenzy > 0) {
                return Game.globalCpsMult / Game.frenzyPower;
            } else {
                return Game.globalCpsMult;
            }
        };
        /**
         * Global CPS multiplier before any Frenzy or Kitten/Milk bonuses.
         * @returns {number}
         */
        this.globalUpgradesMult = function globalUpgradesMult () {
            // This is working backwards from Game.CalculateGame.
            //   globalCpsMult is the product of four things:
            //   a) the product of all kitten-milk related upgrades
            //   b) the Elder Covenant
            //   c) frenzy
            //   d) the sum (not product) of all other upgrades and
            //      heavenly chips
            // Last verified for Cookie Clicker version 1.036.
            var mult = 1;
            angular.forEach(CCConstants.milkUpgrades, function (factor, name) {
                if (Game.Has(name)) {
                    mult *= (1 + Game.milkProgress * factor);
                }
            });
            angular.forEach(CCConstants.malus, function (factor, name) {
                if (Game.Has(name)) {
                    mult *= factor;
                }
            });
            return thisService.globalMultNoFrenzy() / mult;
        };

        /**
         * @param building {Game.Object}
         * @param have {number} The number of buildings you already have.
         * @param target {number} The total number of buildings you want.
         * @returns {number} The total cost to buy all the buildings.
         */
        this.costForBuildings = function costForBuildings(building, have, target) {
            // From Game.Object.buy, the price of a single building is
            // base * priceIncrease^amount
            // Wolfram Alpha helped with the sums.
            return (building.basePrice *
                (Math.pow(Game.priceIncrease, target) -
                    Math.pow(Game.priceIncrease, have)) /
                (Game.priceIncrease - 1));
        };

        /* UI */
        this.onMenu = function () { return Game.onMenu; };

        return this;
    };

    /**
     *
     * @param CookieClicker {CookieClickerService}
     * @returns {UpgradesService}
     * @constructor
     */
    var UpgradesService = function UpgradesService(CookieClicker) {
        var buildings, finders, upgrades, thisService = this;
        buildings = CookieClicker.Game.ObjectsById;
        upgrades = CookieClicker.Game.UpgradesById;
        this.upgrades = upgrades;
        this.kittens = {name: 'MEOW'};
        this.globalUpgrade = {name: 'NOM'};
        finders = buildings.map(function (building) {
            var re = new RegExp(
                '\\b(' + building.single + '|' + building.plural + ')\\b',
                'i');
            var finder = function finder(desc) {
                var index = desc.search(re);
                return (index !== -1) ? index : null;
            };
            finder.building = building;
            return finder;
        });
        this.buildingForUpgrade = function buildingForUpgrade(upgrade) {
            var building, descMatches;
            if (upgrade.type === 'cookie') {
                building = thisService.globalUpgrade;
            } else if (CCConstants.milkUpgrades[upgrade.name]) {
                building = thisService.kittens;
            } else {
                // have buildings look for themselves in the description
                descMatches = finders.map(function (finder) {
                    return [finder(upgrade.desc), finder.building];
                });
                // keep only those that matched
                descMatches = descMatches.filter(function (match) {
                    return (match[0] !== null);
                });
                // sort by how early in the text the building appeared
                descMatches.sort(function (a, b) { return a[0] - b[0]; });
                if (descMatches.length) {
                    // pick the first one
                    building = descMatches[0][1];
                } else if (upgrade.desc.indexOf('Cookie production multiplier') !== -1) {
                    // catches upgrades from research results
                    building = thisService.globalUpgrade;
                } else if (upgrade.desc.indexOf('[Repeatable]') !== -1) {
                    // doesn't really upgrade anything (elder pledge)
                    building = null;
                }
            }
            return building;
        };
        this.upgradeIdToBuilding = upgrades.map(this.buildingForUpgrade);

        this.byBuildingId = buildings.map(function () { return []; });
        this.kittenUpgrades = [];
        this.globalUpgrades = [];
        this.upgradeIdToBuilding.forEach(function (building, upgradeID) {
            var upgrade = upgrades[upgradeID];
            if (building === thisService.kittens) {
                thisService.kittenUpgrades.push(upgrade);
            } else if (building === thisService.globalUpgrade) {
                thisService.globalUpgrades.push(upgrade);
            } else if (building) {
                // I would like ES6 Map collections already please.
                thisService.byBuildingId[building.id].push(upgrade);
            }
        });

        // if we wanted to cache this, we could watch the Game.upgradesOwned
        // counter.
        this.ownedUpgradesForBuilding = function ownedUpgradesForBuilding(building) {
            var ups = thisService.byBuildingId[building.id];
            ups = ups.filter(function (upgrade) { return upgrade.bought; });
            return ups;
        };

        return this;
    };

    var BuildingsService = function BuildingsService(CookieClicker) {
        var getOriginalCPS = function getOriginalCPS(building) {
            var cps, baseCpsCalled, origComputeCps;

            if (typeof(building.cps) === 'number') {
                // there are some indications in the source that the cps
                // property was a plain number once, but this isn't currently
                // true.
                cps = building.cps;
            } else {
                // IT FEELS SO DIRTY. I started a feature thinking that the
                // base CPS was a property of Game.Object, but no, it's
                // hardcoded in. But we have ways. All the cps() methods call
                // Game.ComputeCps, so we'll monkey-patch that, and grab the
                // base parameter. Technically, we could do this to get
                // multiplier values too, but leaving things monkey-patched
                // has proven to be risky for integration with other add-ons.

                baseCpsCalled = [];
                origComputeCps = Game.ComputeCps;
                //noinspection JSUnusedLocalSymbols,JSHint
                Game.ComputeCps = function ComputeCpsSpy(base, add, mult, bonus) {
                    baseCpsCalled.push(base);
                };
                try {
                   building.cps();
                } finally {
                    Game.ComputeCps = origComputeCps;
                }
                if (baseCpsCalled.length !== 1) {
                    // our hacks failed to determine the value. We should maybe
                    // fail louder here so someone reports that this no longer
                    // works.
                    return NaN;
                }

                cps = baseCpsCalled[0];
            }
            return cps;
        };
        this.buildings = CookieClicker.Game.ObjectsById;
        this.buildingCPS = this.buildings.map(getOriginalCPS);
        return this;
    };


    /**
     *
     * @param $scope
     * @param CookieClicker {CookieClickerService}
     * @param numberFilter {function}
     * @constructor
     */
    var ComptrollerController = function ComptrollerController(
            $scope, CookieClicker, numberFilter) {
        $scope.panes = ["purchasing", "income"];
        if (DEBUG) {
            $scope.panes.push("debug");
        }
        $scope.pane = $scope.panes[0];
        var helpLinks = {
                "purchasing": WIKI + "Help:Purchasing",
                "income": WIKI + "Help:Income"
        };
        // The organization here is still rather confused. Which things go
        // on the model, which things go on the scope? How much direct access
        // to the model should the view have? Should we ever allow the view
        // to access the original Game object, or should we always have it go
        // through our Service wrapped around it, to provide a single place
        // to handle any API changes?

        $scope.Game = CookieClicker.Game;
        $scope.timePerCookie = function () {
            return FormatUtils.timePerCookie(CookieClicker.Game.cookiesPs);
        };
        $scope.cookiesToMinutes = CookieClicker.cookiesToMinutes;

        $scope.storeObjects = CookieClicker.storeObjects;
        $scope.storeUpgrades = CookieClicker.storeUpgrades;
        $scope.enoughDigits = FormatUtils.enoughDigits;

        $scope.principalSize = CookieClicker.principalSize;
        $scope.comptrollerVisible = function () {
            return CookieClicker.onMenu() === "comptroller";
        };

        $scope.selected = undefined;
        $scope.calculatorMode = null;

        $scope.helpURL = function () {
            return helpLinks[$scope.pane];
        };

        /**
         * How long will it take to buy our way to a 15% CPS increase?
         * (Picking 15% because it is the growth rate for prices, and it
         * is much smaller than, say, doubling time, which means errors in
         * our imprecise calculations will have less room to compound.)
         * @returns {string}
         */
        $scope.timeToAccel = function timeToAccel() {
            var cps, deltaBaseCPS, growthSize=0.15, lowestCost=Infinity,
                seconds, text;
            cps = CookieClicker.cpsWithoutFrenzy();
            // How much more base CPS do we need to reach that target?
            deltaBaseCPS = (cps * growthSize /
                CookieClicker.globalMultNoFrenzy());

            // How long will that take?
            // The approach below is relatively simple-minded: It calculates
            // the cost to buy that much CPS with each building type, and picks
            // the cheapest.
            // It doesn't consider buying a mix of buildings, but that should
            // hurt the accuracy only a small amount, since smaller buildings
            // will contribute an order of magnitude less CPS.
            // A bigger flaw is that it does not consider upgrades.  If the
            // player has been buying balanced buildings and upgrades, our
            // answer should still be in the right ballpark, but an overlooked
            // upgrade could make our estimate too pessimistic.
            angular.forEach(CookieClicker.storeObjects(), function (building) {
                var buildings = deltaBaseCPS / building.storedCps;
                var cost = CookieClicker.costForBuildings(
                    building, building.amount, building.amount + buildings);
                lowestCost = Math.min(lowestCost, cost);
            });
            seconds = lowestCost / cps;
            text = FormatUtils.lowPrecisionTime(seconds);
            return text;
        };

        $scope.setSelected = function setSelected(obj) {
            $scope.selected = obj;
            if (obj instanceof CookieClicker.Game.Object) {
                $scope.calculatorMode = "building";
            } else if (obj instanceof CookieClicker.Game.Upgrade) {
                $scope.calculatorMode = "upgrade";
            } else {
                $scope.calculatorMode = null;
            }
        };

        // returning an array with 0 or 1 elements lets us use ng-repeat as
        // a conditional. kludgy; re-evaluate when upgrading to angular 1.2.
        $scope.showCalculator = function showCalculator (kind) {
            return (kind === $scope.calculatorMode) ? ['yes'] : [];
        };

        //noinspection JSUnusedGlobalSymbols
        $scope.store = {
            // buildings
            incrementalValue: function (obj) {
                return (obj.storedCps * CookieClicker.Game.globalCpsMult /
                    CookieClicker.Game.cookiesPs);
            },
            minutesToRepay: function (obj) {
                return obj.price / (obj.storedCps * CookieClicker.Game.globalCpsMult) / 60;
            },
            // upgrades
            _upgradeValue: function (upgrade) {
                /* Cookie flavours have data on their modifiers. Many others don't. */
                if (upgrade.type === 'cookie' && upgrade.power) {
                    var multiplierAdd = upgrade.power / 100;
                    return multiplierAdd / CookieClicker.globalUpgradesMult();
                } else if (CCConstants.milkUpgrades[upgrade.name]) {
                    return (CCConstants.milkUpgrades[upgrade.name] *
                        CookieClicker.Game.milkProgress);
                }
                return undefined;
            },
            upgradeValue: function (upgrade) {
                // Is this the sort of thing we ought to write a directive for?
                var increase = $scope.store._upgradeValue(upgrade);
                if (increase) {
                    return numberFilter(increase * 100) + '%';
                } else {
                    return "calc?";
                }
            },
            // in minutes
            timeToRepayUpgrade: function timeToRepayUpgrade(upgrade) {
                var multiplier = $scope.store._upgradeValue(upgrade);
                var gainedCPS = CookieClicker.Game.cookiesPs * multiplier;
                return upgrade.basePrice / gainedCPS / 60;
            }
        };
    };


    /**
     * Controller for the semi-manual Upgrade Calculator.
     * @param $scope
     * @param CookieClicker
     * @constructor
     */
    var UpgradeCalculatorController = function ($scope, CookieClicker) {
        $scope.selectedUpgradeDomain = null;
        $scope.selectedUpgradeAdd = 100;

        //noinspection UnnecessaryLocalVariableJS,JSUnusedGlobalSymbols
        var calculator = {
            currentCPS: function (domain) {
                var cps;
                if (!domain) { // global
                    cps = CookieClicker.Game.cookiesPs;
                } else {
                    cps = domain.storedTotalCps;
                }
                return cps;
            },
            multiplier: function (domain, add) {
                var mult;
                if (!domain) { // global
                    // additions to the global multiplier stack additively, they do
                    // not compound. So adding a 2x multiplier to an existing 4x is
                    // a +50% upgrade, not +100%.
                    // Actually, it turns out it's more complicated than that:
                    // flavoured cookies, bingo-research products, and heavenly chips
                    // are additive, but kitten workers do compound.
                    mult = add / CookieClicker.globalUpgradesMult();
                } else {
                    // Doublers for objects *do* compound, although the variety of
                    // modifiers (addition to base CPS and post-multiplier bonus)
                    // means there are details not expressed in this single number.
                    mult = add;
                }
                return mult;
            },
            cpsGain: function cpsGain(domain, add) {
                var cps = calculator.currentCPS(domain),
                    multi = calculator.multiplier(domain, add);
                return cps * multi;
            },
            incrementalValue: function incrementalValue(domain, add) {
                return calculator.cpsGain(domain, add) / CookieClicker.Game.cookiesPs;
            },
            // in minutes
            timeToRepay: function (upgrade, domain, add) {
                var cpsGain = calculator.cpsGain(domain, add);
                return (upgrade.basePrice / cpsGain / 60);
            },
            selectedIncValue: function () {
                if ($scope.selected && $scope.selectedUpgradeAdd) {
                    return calculator.incrementalValue($scope.selectedUpgradeDomain,
                        $scope.selectedUpgradeAdd / 100);
                } else {
                    return undefined;
                }
            },
            selectedTTR: function () {
                if ($scope.selected && $scope.selectedUpgradeAdd) {
                    return calculator.timeToRepay($scope.selected,
                        $scope.selectedUpgradeDomain,
                        $scope.selectedUpgradeAdd / 100);
                } else {
                    return undefined;
                }
            }
        };

        $scope.calculator = calculator;
    };

    var BuildingCalculatorController = function ($scope, CookieClicker) {
        $scope.targetAmount = 100;
        $scope.howMany = function howMany() {
            return Math.max(0, $scope.targetAmount - $scope.selected.amount);
        };
        $scope.sayHowMany = function sayHowMany() {
            return ($scope.howMany().toString() + ' ' +
                ($scope.howMany() === 1 ? $scope.selected.single :
                $scope.selected.plural));
        };
        $scope.totalCost = function totalCost() {
            return CookieClicker.costForBuildings(
                $scope.selected, $scope.selected.amount, $scope.targetAmount);
        };
        $scope.totalIncrementalValue = function () {
            return ($scope.store.incrementalValue($scope.selected) *
                $scope.howMany());
        };
        $scope.minutesToRepay = function () {
            return ($scope.totalCost() /
                ($scope.selected.storedCps * CookieClicker.Game.globalCpsMult) / 60);
        };
    };

    var IncomeController = function IncomeController($scope, CookieClicker,
        Buildings, Upgrades) {
        var totalSpent = function totalSpent() {
            return CookieClicker.Game.cookiesEarned - CookieClicker.Game.cookies;
        };
        var totalBuildingSpent = function totalBuildingSpent() {
            // I am trying not to prematurely optimize, but this probably gets
            // called about 40 times per digest and it doesn't change nearly
            // that frequently. We'll see if it shows up as a hot spot.
            var building, buildingSpent = 0;
            for (var i = 0; i < CookieClicker.Game.ObjectsN; i++) {
                building = CookieClicker.Game.ObjectsById[i];
                buildingSpent += $scope.spentOnCombined(building);
            }
            return buildingSpent;
        };
        /**
         * @param building {Game.Object}
         * @returns {number}
         */
        $scope.spentOn = function spentOn(building) {
            return CookieClicker.costForBuildings(building, 0, building.amount);
        };
        $scope.spentOnBuildingUpgrades = function spentOnBuildingUpgrades(building) {
            var spent = 0,
                upgrades = Upgrades.ownedUpgradesForBuilding(building);
            for (var i = 0; i < upgrades.length; i++) {
                spent += upgrades[i].basePrice;
            }
            return spent;
        };
        $scope.spentOnCombined = function spentOnCombined(building) {
            return ($scope.spentOn(building) +
                $scope.spentOnBuildingUpgrades(building));
        };
        $scope.pctSpentOn = function pctSpentOn(building) {
            return $scope.spentOn(building) / totalBuildingSpent();
        };
        $scope.pctSpentOnBuildingUpgrades = function pctSpentOn(building) {
            return $scope.spentOnBuildingUpgrades(building) / totalBuildingSpent();
        };
        $scope.pctSpentOnCombined = function pctSpentOn(building) {
            return $scope.spentOnCombined(building) / totalBuildingSpent();
        };
        /**
         * @param building {Game.Object}
         * @returns {number}
         */
        $scope.incomePct = function incomePct(building) {
            return $scope.income(building) / CookieClicker.Game.cookiesPs;
        };
        $scope.baseIncomePct = function baseIncomePct(building) {
            var fromBase, ratio;
            fromBase = Buildings.buildingCPS[building.id];
            ratio = fromBase / building.storedCps;
            // storedCps doesn't include the global multiplier, but the income
            // total does, so this is not quite right. I think in the end we
            // want a third bar segment for the income from global multipliers.
            return $scope.incomePct(building) * ratio;
        };
        $scope.upgradeIncomePct = function upgradeIncomePct(building) {
            return $scope.incomePct(building) - $scope.baseIncomePct(building);
        };
        $scope.income = function income(building) {
            return building.storedTotalCps * CookieClicker.Game.globalCpsMult;
        };
        $scope.spentOnOther = function spentOnOther() {
            return totalSpent() - totalBuildingSpent();
        };
        $scope.pctSpentOnOther = function pctSpentOnOther() {
            return $scope.spentOnOther() / totalSpent();
        };
    };


    var DebugController = function DebugController($scope, CookieClicker,
        Upgrades, Buildings) {
        $scope.ups = Upgrades;
        $scope.bldgs = Buildings;
    };


    var defineServices = function defineServices() {
        var module = angular.module("cookieComptroller", []);

        /* Services. */
        module.service("CookieClicker", CookieClickerService);
        module.service("Upgrades", UpgradesService);
        module.service("Buildings", BuildingsService);

        /* Controllers. */
        module.controller("ComptrollerController", ComptrollerController);
        module.controller("UpgradeCalculatorController", UpgradeCalculatorController);
        module.controller("BuildingCalculatorController", BuildingCalculatorController);
        module.controller("IncomeController", IncomeController);
        if (DEBUG) {
            module.controller("DebugController", DebugController);
        }

        /* Filters. */
        module.filter("metricPrefixed", function () { return FormatUtils.metricPrefixed;});

        return module;
    };


    return {
        Constants: CCConstants,
        Foundation: Foundation,
        FormatUtils: FormatUtils
    };
};

/* Reconfigure Cookie Clicker to run at 4 frames per second.
 *
 * Feature request here:
 * http://forum.dashnet.org/discussion/208/low-fps-mode
 */
var lowFPS = function (Game) {
    "use strict";
    var origFPS = Game.fps, newFPS = 4;
    var ratio = newFPS / origFPS;
    // FIXME: Resetting FPS mid-game may distort various counters, including
    // research and pledges.
    Game.fps = newFPS;

    Game.baseResearchTime = Math.round(Game.baseResearchTime * ratio);
    Game.goldenCookie.delay = Math.round(Game.goldenCookie.delay * ratio);
    Game.frenzy = Math.round(Game.frenzy.delay * ratio);
    Game.clickFrenzy = Math.round(Game.clickFrenzy * ratio);
    // console.info("FPS lowered.");
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

var bootLoader = function bootLoader() {
    "use strict";
    var bl = {
        waitForGameReady: function waitForGameReady(callback) {
            var testReady;
            if (window.Game && window.Game.ready) {
                callback(window.Game);
                return null;
            } else {
                testReady = function testReady() {
                    if (window.Game && window.Game.ready) {
                        clearInterval(testReady._intervalID);
                        callback(window.Game);
                    }
                };
                testReady._intervalID = setInterval(testReady, 50);
                return testReady._intervalID;
            }
        },
        onReady: function onReady(Game) {
            if (window.location.hash.match(/lowFPS/)) {
                lowFPS(Game);
            }
            window.Comptroller = _Comptroller(Game);
            return window.Comptroller.Foundation.boot();
        },
        boot: function boot() {
            bl.waitForGameReady(bl.onReady);
        }
    };
    return bl;
};


var extension_boot = function extension_boot () {
    "use strict";
    var header = '/* Cookie Comptroller is an add-on, not hosted or supported ' +
        'by Orteil. See https://github.com/keturn/CookieComptroller for ' +
        'details. */\n';
    loadAngular(function () {
        execute(header +
            'lowFPS = (' + lowFPS.toString() + ');\n' +
            '_Comptroller = (' + _Comptroller.toString() + ');\n' +
            '(' + bootLoader.toString() + ')().boot();\n' +
            // this doesn't point to a real thing, but makes it so that this
            // inserted script is debuggable in chrome's inspector.
            '//@ sourceURL=comptroller-extension.js\n');
    });
};


var isIsolatedExtension = function isIsolatedExtension() {
    "use strict";
    //noinspection JSUnresolvedVariable
    return window.chrome && window.chrome.extension;
};


// greasemonkey script will get invoked on the main Cookie Clicker
// document, but also on other sub-documents (e.g. ads) loaded within it.
var isCookieClickerDocument = function isCookieClickerDocument() {
    "use strict";
    return window.document.title.match(/Cookie Clicker/);
};


if (isCookieClickerDocument()) {
    if (isIsolatedExtension()) {
        extension_boot();
    } else {
        loadAngular(bootLoader().boot);
    }
}
