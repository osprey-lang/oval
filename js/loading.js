/*
 * This file is outside the normal build process, because we need to keep it as
 * small as possible. The loading animation should only be shown when it takes
 * a while to load the rest of the app, which means it needs to be loaded before
 * everything else.
 *
 * Unfortunately browsers and Gulp suck, so no ES6 here. :)
 */

(function() {
'use strict';

// Two groups of 3 dots each
var GROUP_DOT_COUNT = 3;

var RADIUS = 25;
var DELTA_RADIUS = 14;
var D360 = 2 * Math.PI;

var DURATION = 1700;

function Throbber(elem) {
	this.elem = elem;

	this.createDots();
}
Throbber.prototype.createDots = function() {
	var dots = [];

	for (var i = 0; i < 2 * GROUP_DOT_COUNT; i++) {
		var dot = document.createElement('div');
		dot.classList.add('throbber__dot');
		this.elem.appendChild(dot);

		dots.push(dot);
	}

	this.dots = dots;
};
Throbber.prototype.renderFrame = function(t) {
	var radius1 = this.getRadius(t);
	var radius2 = this.getRadius(1 - t);

	for (var i = 0; i < GROUP_DOT_COUNT; i++) {
		var angle1 = this.getAngle(t, i);
		var dot1 = this.dots[i];
		dot1.style.left = (radius1 * Math.sin(angle1)) + 'px';
		dot1.style.top = (radius1 * -Math.cos(angle1)) + 'px';

		var angle2 = this.getAngle(1 - t, i);
		var dot2 = this.dots[i + GROUP_DOT_COUNT];
		dot2.style.left = (radius2 * -Math.sin(angle2)) + 'px';
		dot2.style.top = (radius2 * Math.cos(angle2)) + 'px';
	}
};
Throbber.prototype.getRadius = function(t) {
	var sinA = Math.sin(D360 * t);
	return RADIUS - DELTA_RADIUS * sinA * (2 - Math.abs(sinA));
};
Throbber.prototype.getAngle = function(t, i) {
	return D360 * (t + i / GROUP_DOT_COUNT);
};

var appLoaded = false;

function showLoading() {
	if (appLoaded) {
		return;
	}

	var uiElem = document.querySelector('.main');
	var loadingScreen = document.querySelector('.loading-screen');

	var throbber = new Throbber(document.querySelector('.throbber'));

	var startTime = performance.now();
	var throbberFrame = function(time) {
		if (appLoaded) {
			uiElem.classList.remove('main--loading');
			return;
		}

		var t = ((startTime - time) % DURATION) / DURATION;
		throbber.renderFrame(t);

		window.requestAnimationFrame(throbberFrame);
	};
	window.requestAnimationFrame(throbberFrame);

	// After 2.5 seconds, show an additional message.
	window.setTimeout(function() {
		if (appLoaded) {
			return;
		}

		loadingScreen.classList.add('loading--slow');
	}, 2500);

	// After 10 seconds, if we STILL haven't finished loading, something
	// has probably gone wrong.
	window.setTimeout(function() {
		if (appLoaded) {
			return;
		}

		loadingScreen.classList.remove('loading--slow');
		loadingScreen.classList.add('loading--maybe-stuck');
	}, 10000);

	uiElem.classList.add('main--loading');
}

// Wait half a second before showing the loading page. This avoids
// unnecessary and annoying brief flashes of "Loading...".
window.setTimeout(showLoading, 500);

// Expose a function that app.js can call to stop the loading throbber.
var Oval = window.Oval = {
	loaded: function() {
		appLoaded = true;
	}
};

})();
