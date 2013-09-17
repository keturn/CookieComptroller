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
 *  - inspect Cookie Clicker version for possible compatibility mismatches
 *  - report on handmade cookies during frenzy activity
 *  - report historical CPS, with expected vs realized
 *  - rework display of principal investment (for Lucky! multiplier cookies)
 *  - show theoretical return on investment from golden cookies
 *  - document and streamline upgrade cost/benefit calculator
 *  - autocompute kitten value
 *  - add to shop: time (or date) of "total time to break even"
 *  - replace obsolete unit of time "minutes" with more contemporary "loops of Ylvis' The Fox"
 *  - report on how much income comes from each source
 *  - report on total spent on each source
 *  - show how many Heavenly Chips this run is worth, time to next chip
 *  - offer suggestions of when to end it all for the prestige gain
 *  - calculate total cost of buying up to a specified number of buildings
 *
 * Anti-Goals:
 *  - New game mechanics or items.
 *  - Auto-clicking.
 *  - Duplication of item tables. As cool as it would be to calculate the effects of all the
 *    upgrades, I don't want to have item tables or multipliers that get out-of-sync with the game.
 *    If you want an add-on that's really smart about upgrades, seek out Cookie Monster. It's great!
 *
 * Compatibility notes:
 *  - As of Cookie Monster 1.036.03, you can no longer load Cookie Monster after
 *    Cookie Comptroller. Loading Cookie Monster _before_ Cookie Comptroller
 *    probably still works. There is one very significant issue though: it makes
 *    Golden Cookies spawn *under* the Comptroller UI if you have it open at the
 *    time. You have to close it (or switch to another menu) to click on the
 *    cookie.
 */
// ==UserScript==
// @name Cookie Comptroller
// @description Reports on your Cookie Clicker accounting.
// @match http://orteil.dashnet.org/cookieclicker/
// @version 0.1.20130917.1
// @namespace http://keturn.net/
// @downloadURL https://raw.github.com/keturn/CookieComptroller/master/comptroller.user.js
// ==/UserScript==

/*global Game, angular, console */



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
        milkUpgrades: {
            'Kitten helpers': 0.05,
            'Kitten workers': 0.1,
            'Kitten engineers': 0.2,
            'Kitten overseers': 0.3
        },
        malus: {
            'Elder Covenant': 0.95
        }
    };

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
                var scaled, scaledStr, prefixIndex = Math.floor(Math.log(Math.abs(n)) / (Math.LN10 * 3));
                prefixIndex = Math.min(prefixIndex, _prefixes.length - 1);
                scaled = n / (Math.pow(1000, prefixIndex));

                if (precision === undefined) {
                    precision = 4;
                }
                scaledStr = fixed ? scaled.toFixed(precision) : scaled.toPrecision(precision);
                return scaledStr + " " + _prefixes[prefixIndex];
            },


            /* How many minutes does it take to make a zillion cookies?
             * Where "a zillion" is the lowest power of 1000 such that the answer is greater than 1.
             *
             * e.g. 10 cookies per second = 600 cookies per minute = 1.67 minutes per kilocookie.
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
            }
        };
    })();

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
            "#comptroller .description q {\n" +
            "    display:block; position:relative; text-align:right; " +
            "    margin-top:8px; font-style:italic; opacity:0.7;" +
            "}\n" +
            /* this is very much mirroring the styles of the game's logButton */
            "#comptrollerButton {\n" +
            "top: 0; right: -16px;" +
            "font-size: 80%;" +
            "padding: 14px 16px 10px 0px;" +
            "}\n\n" +
            "#comptrollerButton:hover{right:-8px;}" +
            "}\n\n"),
        HTML: ("<div ng-controller='ComptrollerController' ng-show='comptrollerVisible()'>\n" +
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
            /* store */
            "<table class='comptrollerStore'>\n" +
            /* headers */
            "<tr><th>Price (<img src='img/money.png' alt='cookies' />)</th>" +
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
            "    <td style='text-align: right'>{{ store.upgradeValue(obj) * 100 || '?' | number }}%</td>" +
            "    <td style='text-align: right'>{{ store.timeToRepayUpgrade(obj) | number:1 }}</td>" +
            "</tr>\n" +
            "</tbody>\n" +
            // having a tough time with ng-switch around tbody children, so
            // we abuse ng-repeat here to get a kludgy version of ng-if.
            "<tbody ng-repeat='kludge in showCalculator(\"upgrade\")' ng-controller='UpgradeCalculatorController''>\n" +
            "<tr><th colspan='5'>Upgrade Calculator</th></tr>\n" +
            "<tr>\n" +
            "    <td style='text-align: right'>{{ selected.basePrice | number:0 }}</td>" +
            "    <td>{{ selected.name }}</td>" +
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
            "</div>\n")
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
            Foundation.addComptroller();
            Foundation.addComptrollerButton();
        }
    };


    /* Make the stock Cookie Clicker Game object injectable into Angular objects, and hook in to its mainloop so
     * Angular can find updated data. */
    var CookieClickerService = function CookieClickerService ($rootScope) {
        var thisService = this, origDraw = Game.Draw;

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
            // console.debug("Game.Draw hook installed.");
        }

        // I think I'm getting *closer* to a proper seperation of concerns here, but I fear that this service 
        // definition is still in poor form.

        this.Game = Game;
        this.cookiesToMinutes = function (cookies) {
            return cookies / Game.cookiesPs / 60;
        };
        this.storeObjects = function () { return Game.ObjectsById; };
        this.storeUpgrades = function () { return Game.UpgradesInStore; };
        this.principalSize = function () {
            var cps = Game.cookiesPs, principal;

            if (Game.frenzy > 0) {
                cps = cps / Game.frenzyPower;
            }

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
        this.globalMultNoFrenzy = function globalMultNoFrenzy () {
            if (Game.frenzy > 0) {
                return Game.globalCpsMult / Game.frenzyPower;
            } else {
                return Game.globalCpsMult;
            }
        };
        this.globalUpgradesMult = function globalUpgradesMult () {
            // This is reversing some things from Game.CalculateGame.
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

        /* UI */
        this.onMenu = function () { return Game.onMenu; };

        return this;
    };


    var ComptrollerController = function ComptrollerController($scope, CookieClicker) {
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

        $scope.setSelected = function setSelected (obj) {
            $scope.selected = obj;
            if (obj instanceof CookieClicker.Game.Object) {
                $scope.calculatorMode = "building";
            } else if (obj instanceof CookieClicker.Game.Upgrade) {
                $scope.calculatorMode = "upgrade";
            } else {
                $scope.calculatorMode = null;
            }
        };

        $scope.showCalculator = function showCalculator (kind) {
            return (kind === $scope.calculatorMode) ? ['yes'] : [];
        };

        $scope.store = {
            incrementalValue: function (obj) {
                return (obj.storedCps * CookieClicker.Game.globalCpsMult /
                    CookieClicker.Game.cookiesPs);
            },
            upgradeValue: function (upgrade) {
                /* Cookie flavours have data on their modifiers. Many others don't. */
                if (upgrade.type === 'cookie' && upgrade.power) {
                    var multiplierAdd = upgrade.power / 100;
                    return multiplierAdd / CookieClicker.globalUpgradesMult();
                } else if (CCConstants.milkUpgrades[upgrade.name]) {
                    return (CCConstants.milkUpgrades[upgrade.name] *
                        CookieClicker.milkProgress);
                }
                return undefined;
            },
            // in minutes
            timeToRepayUpgrade: function timeToRepayUpgrade(upgrade) {
                var multiplier = $scope.store.upgradeValue(upgrade);
                var gainedCPS = CookieClicker.Game.cookiesPs * multiplier;
                return upgrade.basePrice / gainedCPS / 60;
            },
            minutesToRepay: function (obj) {
                return obj.price / (obj.storedCps * CookieClicker.Game.globalCpsMult) / 60;
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
        $scope.selectedUpgradeAdd = 0;

        //noinspection UnnecessaryLocalVariableJS
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
            var total = 0,
                basePrice = $scope.selected.basePrice,
                amount = $scope.selected.amount,
                target = $scope.targetAmount;
            while (amount < target) {
                total += basePrice * Math.pow(Game.priceIncrease, amount);
                amount += 1;
            }
            return total;
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

    var defineServices = function defineServices() {
        var module = angular.module("cookieComptroller", []);

        /* Services. */
        module.service("CookieClicker", CookieClickerService);

        /* Controllers. */
        module.controller("ComptrollerController", ComptrollerController);
        module.controller("UpgradeCalculatorController", UpgradeCalculatorController);
        module.controller("BuildingCalculatorController", BuildingCalculatorController);

        /* Filters. */
        module.filter("metricPrefixed", function () { return FormatUtils.metricPrefixed;});

        return module;
    };


    return {
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


var boot = function () {
    "use strict";
    lowFPS(Game);
    loadAngular(function () {
        window.Comptroller = _Comptroller(Game);
        window.Comptroller.Foundation.boot();
    });
};
// boot();


var extension_boot = function extension_boot () {
    "use strict";
    loadAngular(function () {
        // make it so appending #lowFPS to the game URL has us in low-FPS mode.
        if (window.location.hash.match(/lowFPS/)) {
            // kludgey, but this ran before Game was set up before.
            setTimeout(
                function () { execute('(' + lowFPS + ')(Game);'); },
                5000
            );
        }
        execute('/* Cookie Comptroller is an add-on, not hosted or supported ' +
            'by Orteil. See https://github.com/keturn/CookieComptroller for ' +
            'details. */\n' +
            'Comptroller = (' + _Comptroller.toString() + ')(Game);\n' +
            '//@ sourceURL=comptroller-extension.js\n');
        execute('Comptroller.Foundation.boot()');
    });
};
extension_boot();
