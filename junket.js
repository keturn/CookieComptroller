/**
 * Created with PyCharm.
 * User: kevint
 * Date: 9/16/13
 * Time: 1:00 AM
 * To change this template use File | Settings | File Templates.
 */
function () {
    "use strict";
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
}

function () {
    "use strict";
    return {
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
                "<tr><th>Price (<img src='img/money.png' alt='cookies' />)</th>" +
                "<th>Name</th><th>Price<br />(min)</th>" +
                "<th>Incremental<br />Value %</th><th>Time to Repay<br/>(min)</th></tr>\n" +
                /* objects */
                "<tbody>\n" +
                "    <tr ng-repeat='obj in storeObjects()'>" +
                "    <td style='text-align: right'>{{ obj.price | number:0 }}</td>" +
                "    <td style='text-align: left' ng-bind-html-unsafe='obj.name'></td>" +
                "    <td style='text-align: right'>{{ cookiesToMinutes(obj.price) | number:1 }}</td>" +
                "    <td style='text-align: right'>{{ store.incrementalValue(obj) * 100 | number }}%</td>" +
                "    <td style='text-align: right'>{{ store.minutesToRepay(obj) | number:1 }}</td>" +
                "</tr>\n" +
                /* upgrades */
                "<tr ng-repeat='obj in storeUpgrades()' ng-click='$parent.selectedUpgrade = obj'>" +
                "    <td style='text-align: right'>{{ obj.basePrice | number:0 }}</td>" +
                "    <td style='text-align: left' ng-bind-html-unsafe='obj.name'></td>" +
                "    <td style='text-align: right'>{{ cookiesToMinutes(obj.basePrice) | number:1 }}</td>" +
                "    <td style='text-align: right'>{{ store.upgradeValue(obj) * 100 || '?' | number }}%</td>" +
                "    <td style='text-align: right'>{{ store.timeToRepayUpgrade(obj) | number:1 }}</td>" +
                "</tr>\n" +
                "</tbody>\n" +
                /* calculator */
                "<tbody ng-controller='CalculatorController'><tr><th colspan='5'>Upgrade Calculator</th></tr>\n" +
                "<tr>\n" +
                "    <td style='text-align: right'>{{ selectedUpgrade.basePrice | number:0 }}</td>" +
                "    <td>{{ selectedUpgrade.name }}</td>" +
                "    <td style='text-align: right'>{{ cookiesToMinutes(selectedUpgrade.basePrice) | number:1 }}</td>" +
                "    <td colspan='2' rowspan='2'></td></tr>\n" +
                "<tr><td colspan='3' class='description' ng-bind-html-unsafe='selectedUpgrade.desc'></td></tr>\n" +
                "<tr><td colspan='3'>Modifies: " +
                "    <select ng-model='selectedUpgradeDomain' ng-options='obj.name for obj in storeObjects()'>\n" +
                "        <option value=''>*global*</option>\n" +
                "    </select><br />\n" +
                "Multiplier Add: +<input type='number' ng-model='selectedUpgradeAdd' class='pctInput' required />%</td>" +
                "<td style='text-align: right'>{{ calculator.selectedIncValue() * 100 | number }}%</td>" +
                "<td style='text-align: right'>{{ calculator.selectedTTR() | number:1 }}</td>" +
                "</tr>\n</tbody>" +
                "</table>\n" +
                "</div>\n")
    };
}

function _Comptroller(Game) {
    "use strict";

    /* As much as possible, I try to determine relevant factors direct from the game objects, but there are a
     * few that we've specified manually. These could potentially get out of sync.
     * Last verified for Cookie Clicker version 1.036. */
    var CCConstants = {
        // From Game.goldenCookie.click
        GOLDEN_MULTIPLY_FACTOR: 0.1,
        GOLDEN_MULTIPLY_CAP: 60 * 20
    };

    var CCFormatUtils = _CCFormatUtils();

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
            style.textContent = comptrollerAssets().CSS;
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
            div.innerHTML = comptrollerAssets().HTML;
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

        // I think I'm getting *closer* to a proper seperation of concerns here, but I fear that this service
        // definition is still in poor form.

        this.Game = Game;
        this.cookiesToMinutes = function (cookies) {
            return cookies / Game.cookiesPs / 60;
        };
        this.storeObjects = function () { return Game.ObjectsById; };
        this.storeUpgrades = function () { return Game.UpgradesInStore; };
        this.principalSize = function () {
            return (Game.cookiesPs * CCConstants.GOLDEN_MULTIPLY_CAP /
                CCConstants.GOLDEN_MULTIPLY_FACTOR);
        };
        this.globalMultNoFrenzy = function globalMultNoFrenzy () {
            if (Game.frenzy > 0) {
                return Game.globalCpsMult / Game.frenzyPower;
            } else {
                return Game.globalCpsMult;
            }
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
            return CCFormatUtils.timePerCookie(CookieClicker.Game.cookiesPs);
        };
        $scope.cookiesToMinutes = CookieClicker.cookiesToMinutes;

        $scope.storeObjects = CookieClicker.storeObjects;
        $scope.storeUpgrades = CookieClicker.storeUpgrades;
        $scope.enoughDigits = CCFormatUtils.enoughDigits;

        $scope.investmentSize = CookieClicker.principalSize;
        $scope.comptrollerVisible = function () {
            return CookieClicker.onMenu() === "comptroller";
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
                    return multiplierAdd / CookieClicker.globalMultNoFrenzy();
                } else {
                    return undefined;
                }
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

        $scope.selectedUpgrade = undefined;
    };


    /**
     * Controller for the semi-manual Upgrade Calculator.
     * @param $scope
     * @param CookieClicker
     * @constructor
     */
    var CalculatorController = function ($scope, CookieClicker) {
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
                    mult = add / CookieClicker.globalMultNoFrenzy();
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
                if ($scope.selectedUpgrade && $scope.selectedUpgradeAdd) {
                    return calculator.incrementalValue($scope.selectedUpgradeDomain,
                        $scope.selectedUpgradeAdd / 100);
                } else {
                    return undefined;
                }
            },
            selectedTTR: function () {
                if ($scope.selectedUpgrade && $scope.selectedUpgradeAdd) {
                    return calculator.timeToRepay($scope.selectedUpgrade,
                        $scope.selectedUpgradeDomain,
                        $scope.selectedUpgradeAdd / 100);
                } else {
                    return undefined;
                }
            }
        };

        $scope.calculator = calculator;
    };


    var defineServices = function defineServices() {
        var module = angular.module("cookieComptroller", []);

        /* Services. */
        module.service("CookieClicker", CookieClickerService);

        /* Controllers. */
        module.controller("ComptrollerController", ComptrollerController);
        module.controller("CalculatorController", CalculatorController);

        /* Filters. */
        module.filter("metricPrefixed", function () { return CCFormatUtils.metricPrefixed;});

        return module;
    };


    return {
        Foundation: Foundation
    };
}
