// W069 is “['x'] is better written in dot notation”, but Closure Compiler wants ['x'].
// jshint -W069
// jshint bitwise: false
// ==ClosureCompiler==
// @output_file_name tty-player.min.js
// @compilation_level ADVANCED_OPTIMIZATIONS
// @language_out ES6
// ==/ClosureCompiler==
/* global MediaError, TimeRanges, Terminal, HTMLElement */
;(function() {
"use strict";

var textDecoder = new TextDecoder();

/// parseDataURI("data:foo/bar;base64,MTIzNA==#foo") === "1234"
/// @param {string} uri
function parseDataURI(uri) {
	// [whole uri, "base64" or undefined, data]
	var chunks = /^data:([^,]*),([^#]+)/.exec(uri);
	if (chunks === null) {
		return null;
	}
	var data = decodeURIComponent(chunks[2]);
	var mime = chunks[1].replace(/;base64$/, "");
	return [mime, mime === chunks[1] ? data : atob(data)];
}

/// @param {Uint8Array} array
function byteArrayToString(array) {
	// String.fromCharCode.apply can for too large values overflow the call stack.
	// Hence this, though I doubt we actually use large enough strings to worry.
	// http://stackoverflow.com/a/12713326
	var CHUNK_SIZE = 0x8000;
	var c = [];
	for (var i = 0; i < array.length; i += CHUNK_SIZE) {
		c.push(String.fromCharCode.apply(null, array.subarray(i, i + CHUNK_SIZE)));
	}
	return c.join("");
}

function parseNPT(npt) {
	// Format: [npt:]([h:]mm:ss|seconds)[.subsecond]
	// I’ve decided to be lazy and allow "1:2:3.4" as well as "1:02:03.4"
	// This makes it [npt:][[h:]m:]s[.subsecond]
	var match = /^(?:npt:)?(?:(?:(\d+):)?(\d+):)?(\d+(?:\.\d+)?)$/i.exec(npt);
	return match ? (match[1] || 0) * 3600 + (match[2] || 0) * 60 + match[3] : null;
}

function classifyPosterURL(url) {
	if (!url) {
		// There is no poster.
		return {type: null};
	}
	switch (/^(?:(.*):)?/.exec(url)[1]) {
		case "npt":
			var time = parseNPT(url);
			return time ? {type: "npt", time: time} : {type: null};
		case "data":
			var data = parseDataURI(url);
			if (/^text\/plain$/i.test(data[0])) {
				return {type: "text", data: data[1]};
			}
	}
	// TODO: treat all the other possibilities as images.
	return {type: null};
}

/// @param {ArrayBuffer} source
function parseTTYRec(source) {
	var utf8 = true;
	var dimensions = null;
	var data = [];
	var byteOffset = 0;
	var timeOffset = 0;
	var sourceLength = source.byteLength;
	while (byteOffset < sourceLength) {
		var sec, usec, len;
		var header = new DataView(source, byteOffset);
		sec = header.getUint32(0, true);
		usec = header.getUint32(4, true);
		len = header.getUint32(8, true);
		var time = sec + (usec / 1000000);
		byteOffset += 12;
		var payload = new Uint8Array(source, byteOffset, len);
		payload = utf8 ? textDecoder.decode(payload) : byteArrayToString(payload);
		if (byteOffset === 12) {
			// First chunk might be metadata; this is how termrec does it, for example.
			timeOffset = time;
			var metadata = /^\x1b%(G|@)\x1b\[8;([0-9]+);([0-9]+)t$/.exec(payload);
			if (metadata) {
				utf8 = metadata[1] === "G";
				dimensions = {
					rows: +metadata[2],
					cols: +metadata[3]
				};
			}
		}
		time -= timeOffset;
		byteOffset += len;
		data.push([payload, time]);
	}
	return {
		// Heuristic: if the time offset is large enough, it’s probably a timestamp.
		startDate: timeOffset >= 1e8 ? new Date(timeOffset * 1000) : null,
		dimensions: dimensions,
		data: data
	};
}

function formatTime(time) {
	var seconds = time | 0;
	var minutes = seconds / 60 | 0;
	seconds = ("0" + (seconds % 60)).substr(-2);
	if (minutes >= 60) {
		var hours = minutes / 60 | 0;
		minutes = ("0" + (minutes % 60)).substr(-2);
		return hours + ":" + minutes + ":" + seconds;
	} else {
		return minutes + ":" + seconds;
	}
}

function blankableAttributeProperty(name) {
	return {
		get: function() {
			var value = this.getAttribute(name);
			return value === null ? "" : value.trim();
		},
		set: function(value) {
			this.setAttribute(name, value);
		}
	};
}

function attributeBooleanProperty(name) {
	return {
		get: function() {
			return this.hasAttribute(name);
		},
		set: function(bool) {
			if (bool) {
				this.setAttribute(name, "");
			} else {
				this.removeAttribute(name);
			}
		}
	};
}

function invalidStateError() {
	document.createElement("video").currentTime = 1;
}

/** @const */ var NETWORK_EMPTY = 0;
/** @const */ var NETWORK_IDLE = 1;
/** @const */ var NETWORK_LOADING = 2;
/** @const */ var NETWORK_NO_SOURCE = 3;

/** @const */ var HAVE_NOTHING = 0;
/** @const */ var HAVE_METADATA = 1;
/** @const */ var HAVE_CURRENT_DATA = 2;
/** @const */ var HAVE_FUTURE_DATA = 3;
/** @const */ var HAVE_ENOUGH_DATA = 4;

// Annoyingly, with things like MediaError, one apparently can’t construct them in any way.
// So we fake it like this.

// Note that the constants on MediaError are *not* on MyMediaError, though they are on instances.
var MyMediaError = /** @constructor */ function MediaError(code) {
	Object.defineProperty(this, "code", {value: code});
};
MyMediaError.prototype = Object.create(MediaError.prototype);

/** @const */ var EMPTY_TIME_RANGES = document.createElement("video").played;

var MyTimeRanges = /** @constructor */ function TimeRanges(ranges) {
	Object.defineProperty(this, "length", {value: ranges.length});
	this["_"] = ranges;
};
MyTimeRanges.prototype = Object.create(TimeRanges.prototype);

MyTimeRanges.prototype["start"] = function(i) {
	if (i < this["length"]) {
		return this["_"][i][0];
	} else {
		return EMPTY_TIME_RANGES["end"](0);  // Throws IndexSizeError
	}
};

MyTimeRanges.prototype["end"] = function(i) {
	if (i < this["length"]) {
		return this["_"][i][1];
	} else {
		return EMPTY_TIME_RANGES["end"](0);  // Throws IndexSizeError
	}
};

/** @const */ var MEDIA_ERR_ABORTED = 1;
/** @const */ var MEDIA_ERR_NETWORK = 2;
/** @const */ var MEDIA_ERR_DECODE = 3;
/** @const */ var MEDIA_ERR_SRC_NOT_SUPPORTED = 4;

/** @const */ var ERROR_DETAILS = {
	1: ["MEDIA_ERR_ABORTED", "The fetching process for the media resource was aborted by the user agent at the user's request."],
	2: ["MEDIA_ERR_NETWORK", "A network error of some description caused the user agent to stop fetching the media resource, after the resource was established to be usable."],
	3: ["MEDIA_ERR_DECODE", "An error of some description occurred while decoding the media resource, after the resource was established to be usable."],
	4: ["MEDIA_ERR_SRC_NOT_SUPPORTED", "The media resource indicated by the \x1b[4msrc\x1b[24m attribute was not suitable."]
};

/** @const */ var FANCY_TECHNICAL_ERROR_EXPLANATIONS = true;

var menuIdSequence = 0;

function makeMenu(ttyPlayer) {
	// Make a context menu with these items:
	// - Play/Pause
	// - Show/Hide Controls
	//
	// Firefox also has the following ones deemed unnecessary:
	//
	// - Mute/Unmute
	// - Play Speed >
	//   - Slow Motion (0.5×)
	//   - Normal Speed (1×)
	//   - High Speed (1.5×)
	//   - Ludicrous Speed (2×)
	// - Show Statistics
	// - Full Screen
	//
	// Chrome has Show controls (lowercase c) as a toggle and adds a Loop item.
	var menu = document.createElement("menu");
	if (!("type" in menu)) {
		return null;
	}

	menu.type = "context";
	if (menu.type !== "context") {
		return null;
	}
	menu.id = "treplay-contextmenu-" + menuIdSequence++;

	var playPause = document.createElement("menuitem");
	playPause.onclick = function() {
		if (ttyPlayer["paused"]) {
			ttyPlayer["play"]();
		} else {
			ttyPlayer["pause"]();
		}
	};
	function setPlayPauseDetails(label, path) {
		playPause.label = label;
		playPause.icon = "data:image/svg+xml,%3C?xml version='1.0' encoding='UTF-8' standalone='no'?%3E%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16'%3E%3Cpath stroke='%23999' stroke-width='1' fill='%23eee' d='" + path + "'/%3E%3C/svg%3E";
	}
	function onPlay() {
		setPlayPauseDetails("Pause", "m2.5,1.5 0,13 4,0 0,-13zm7,0 0,13 4,0 0,-13z");
	}
	function onPause() {
		setPlayPauseDetails("Play", "m2.5,2 0,12 11,-6z");
	}
	onPause();
	ttyPlayer.addEventListener("play", onPlay);
	ttyPlayer.addEventListener("pause", onPause);

	var controls = document.createElement("menuitem");
	menu.onControlsShownOrHidden = function() {
		if (ttyPlayer["controls"]) {
			controls.label = "Hide Controls";
		} else {
			controls.label = "Show Controls";
		}
	};
	menu.onControlsShownOrHidden();
	controls.onclick = function() {
		ttyPlayer["controls"] = !ttyPlayer["controls"];
	};

	menu.appendChild(playPause);
	menu.appendChild(controls);
	return menu;
}

// TODO: reset() hides the cursor; patch term.js so if useFocus === false it is shown by default?
var stockReset = Terminal.prototype["reset"];
Terminal.prototype["reset"] = function() {
	stockReset.call(this);
	if ("useFocus" in this["options"] && !this["options"]["useFocus"]) {
		this["showCursor"]();
	}
};

// IDL for this code:
//
//     interface HTMLTTYPlayerElement : HTMLMediaElement {
//                attribute DOMString defaultTitle;
//                attribute DOMString title;
//
//       readonly attribute unsigned long cols;
//       readonly attribute unsigned long rows;
//       void resize(unsigned long cols, unsigned long rows);
//
//                attribute EventHandler ontitlechange;
//
//       // This one is straight from HTMLVideoElement.
//                attribute DOMString poster;
//
//       // s/void/avoid/
//       void pretendToBeAVideo();
//     }
//
// IDL taken from HTML 5 spec:
//
//     enum CanPlayTypeEnum { "" /* empty string */, "maybe", "probably" };
//     interface HTMLMediaElement : HTMLElement {
//     
//       // error state
//       readonly attribute MediaError? error;
//     
//       // network state
//                attribute DOMString src;
//       readonly attribute DOMString currentSrc;
//                attribute DOMString crossOrigin;
//       const unsigned short NETWORK_EMPTY = 0;
//       const unsigned short NETWORK_IDLE = 1;
//       const unsigned short NETWORK_LOADING = 2;
//       const unsigned short NETWORK_NO_SOURCE = 3;
//       readonly attribute unsigned short networkState;
//                attribute DOMString preload;
//       readonly attribute TimeRanges buffered;
//       void load();
//       CanPlayTypeEnum canPlayType(DOMString type);
//     
//       // ready state
//       const unsigned short HAVE_NOTHING = 0;
//       const unsigned short HAVE_METADATA = 1;
//       const unsigned short HAVE_CURRENT_DATA = 2;
//       const unsigned short HAVE_FUTURE_DATA = 3;
//       const unsigned short HAVE_ENOUGH_DATA = 4;
//       readonly attribute unsigned short readyState;
//       readonly attribute boolean seeking;
//     
//       // playback state
//                attribute double currentTime;
//       readonly attribute unrestricted double duration;
//       Date getStartDate();
//       readonly attribute boolean paused;
//                attribute double defaultPlaybackRate;
//                attribute double playbackRate;
//       readonly attribute TimeRanges played;
//       readonly attribute TimeRanges seekable;
//       readonly attribute boolean ended;
//                attribute boolean autoplay;
//                attribute boolean loop;
//       void play();
//       void pause();
//     
//       // media controller
//                attribute DOMString mediaGroup;
//                attribute MediaController? controller;
//     
//       // controls
//                attribute boolean controls;
//                attribute double volume;
//                attribute boolean muted;
//                attribute boolean defaultMuted;
//     
//       // tracks
//       readonly attribute AudioTrackList audioTracks;
//       readonly attribute VideoTrackList videoTracks;
//       readonly attribute TextTrackList textTracks;
//       TextTrack addTextTrack(TextTrackKind kind, optional DOMString label = "", optional DOMString language = "");
//     };
//
//     interface HTMLVideoElement : HTMLMediaElement {
//                attribute unsigned long width;
//                attribute unsigned long height;
//       readonly attribute unsigned long videoWidth;
//       readonly attribute unsigned long videoHeight;
//                attribute DOMString poster;
//     };

/** @constructor */
function TTYPlayerInternalState(ttyPlayer) {
	this.ttyPlayer = ttyPlayer;
}

var ISP = TTYPlayerInternalState.prototype;

ISP.setUp = function() {
	var self = this;
	var ttyPlayer = self.ttyPlayer;
	self.titleElement = document.createElement("div");
	self.titleElement.className = "title";
	ttyPlayer.appendChild(self.titleElement);

	self.terminal = new Terminal({"useFocus": false});
	self.terminal.on("title", function(newTitle) {
		ttyPlayer["title"] = newTitle;
	});

	self.terminal.open(ttyPlayer);

	if (FANCY_TECHNICAL_ERROR_EXPLANATIONS) {
		ttyPlayer.addEventListener("error", function() {
			var details = ERROR_DETAILS[self.error.code];
			self.terminal.reset();
			self.terminal.write(
					"\x1b]2;Error :-(\x07" +
					"\r\n\x1b[1mMediaError.\x1b[31m" + details[0] + "\x1b[m " +
					"(numeric value " + self.error.code + ")\r\n\r\n" +
					"    " + details[1] + "\r\n\r\n(Sorry ’bout that.)");
		});
	}

	var rows = +ttyPlayer.getAttribute("rows");
	var cols = +ttyPlayer.getAttribute("cols");
	ttyPlayer["resize"](cols > 0 ? cols : ttyPlayer["cols"],
						rows > 0 ? rows : ttyPlayer["rows"]);

	// XXX: properties with names used in the DOM don’t get shrunk by Closure
	// Compiler’s advanced optimizations, for safety. We could get size down a
	// smidgeon more by renaming them all, but that’d be uglier.
	// Candidates: defaultPlaybackRate, playbackRate, currentSrc, readyState, networkState, paused, duration.

	self.defaultPlaybackRate = self.playbackRate = 1;
	self.defaultPlaybackStartPosition = 0;
	self.currentSrc = "";
	self.readyState = HAVE_NOTHING;
	self.networkState = NETWORK_EMPTY;
	self.paused = true;
	self.duration = NaN;
	self.defaultTitle = ttyPlayer.getAttribute("window-title") || "";
	self.posterOverlay = document.createElement("tty-player-poster");
	self.posterOverlay.onclick = function() {
		ttyPlayer["play"]();
	};

	self.terminal.on("resize", function() {
		// ttyPlayer.rows and ttyPlayer.cols have changed, fire an appropriate event
		self.fireSimpleEvent("resize");
	});

	self.menu = makeMenu(ttyPlayer);
	if (self.menu) {
		ttyPlayer.appendChild(self.menu);
		ttyPlayer.setAttribute("contextmenu", self.menu.id);
	}

	self.controlsElement = document.createElement("tty-player-controls");
	var play = document.createElement("button");
	play.className = "play";
	play.onclick = function() {
		if (ttyPlayer["paused"]) {
			ttyPlayer["play"]();
		} else {
			ttyPlayer["pause"]();
		}
	};
	ttyPlayer.addEventListener("play", function() {
		play.className = "pause";
	});
	ttyPlayer.addEventListener("pause", function() {
		play.className = "play";
	});
	self.currentTimeElement = document.createElement("span");
	self.currentTimeElement.className = "current-time";
	self.currentTimeElement.textContent = "0:00";
	self.durationElement = document.createElement("span");
	self.durationElement.className = "duration";
	self.durationElement.textContent = "0:00";
	self.progressElement = document.createElement("input");
	self.progressElement.type = "range";
	self.progressElement.value = 0;
	self.progressElement.min = 0;
	self.progressElement.step = "any";
	var skipChange = false;
	self.progressElement.addEventListener("input", function() {
		if (!skipChange) {
			skipChange = true;
			self.semipaused = true;
			ttyPlayer["currentTime"] = self.progressElement.value;
			self.updateCurrentTimeElement();
			skipChange = false;
		}
	});
	self.progressElement.addEventListener("change", function() {
		if (!skipChange) {
			skipChange = true;
			self.semipaused = false;
			ttyPlayer["currentTime"] = self.progressElement.value;
			self.updateCurrentTimeElement();
			skipChange = false;
		}
	});
	ttyPlayer.addEventListener("durationchange", function() {
		self.progressElement.max = self.duration;
		self.durationElement.textContent = formatTime(self.duration);
	});
	ttyPlayer.addEventListener("timeupdate", function() {
		if (!skipChange) {
			skipChange = true;
			self.progressElement.value = self.currentTime;
			self.updateCurrentTimeElement();
			skipChange = false;
		}
	});
	self.controlsElement.appendChild(play);
	self.controlsElement.appendChild(self.currentTimeElement);
	self.controlsElement.appendChild(self.progressElement);
	self.controlsElement.appendChild(self.durationElement);
	ttyPlayer.appendChild(self.posterOverlay);
	ttyPlayer.appendChild(self.controlsElement);
	self.showPoster = true;
};

Object.defineProperties(ISP, {
	/** @lends {ISP} */
	showPoster: {
		get: function() {
			return this._showPoster;
		},
		set: function(newValue) {
			// TODO: this is problematic because it doesn’t keep track of what
			// poster is active, it just uses the current value of poster. We
			// should probably store the value of poster and use it for
			// removing it.
			var self = this;
			var oldValue = self._showPoster;
			newValue = !!newValue;

			var newPoster = classifyPosterURL(self.ttyPlayer["poster"]);
			self._showPoster = !!newValue;

			// We don’t show the overlay if there is an error
			var showOverlay = newValue && !self.error;

			self.posterOverlay.style.display = showOverlay ? "" : "none";
			self.controlsElement.classList[showOverlay ? "add" : "remove"]("poster");
			self.progressElement.disabled = newValue;
			self.controlsShownOrHidden();

			if (oldValue === newValue && self.activePoster === newPoster) {
				// No change to make
				return;
			}

			// If we need to do anything special to remove a poster, here’s what we’ll do:
			// if (oldValue) {
			// 	switch (self.activePoster.type) {
			// 		case "foo":
			// 			…
			// 	}
			// }

			self.activePoster = newPoster;

			if (oldValue || newValue) {
				// Yes, we’re missing the optimisation possibility of poster=npt:X
				// changing to poster=npt:Y where Y > X. Seriously, adjusting
				// poster *at all* is rare enough that I don’t care.
				self.resetTerminal();
			}

			if (newValue) {
				// Show the new poster
				switch (newPoster.type) {
					case "npt":
						// We have an NPT poster to create.
						self.resetTerminal();

						var realShowPoster = function() {
							if (newValue !== self._showPoster) {
								// Sorry, you took too long and I don’t want to do anything now;
								// something else is doing it.
								return;
							}

							if (newValue) {
								var currentTime = self.currentTime;
								var semipaused = self.semipaused;
								self.semipaused = true;
								self.currentTime = newPoster.time;
								self.nextDataIndex = 0;
								self.render();
								self.semipaused = semipaused;
								self.currentTime = currentTime;
							}
						};

						if (self.data) {
							realShowPoster();
						} else {
							var loaded = function() {
								self.ttyPlayer.removeEventListener("canplaythrough", loaded);
								realShowPoster();
							};
							self.ttyPlayer.addEventListener("canplaythrough", loaded);
							self.loadIfNotLoading();
						}
						break;
					case "text":
						self.resetTerminal();
						self.terminal.write(newPoster.data);
				}
			}
		}
	}
});

/// Firing a simple event named e means that a trusted event with the name
/// e, which does not bubble (except where otherwise stated) and is not
/// cancelable (except where otherwise stated), and which uses the Event
/// interface, must be created and dispatched at the given target.
/// INCONSISTENCY: isTrusted = false
ISP.fireSimpleEvent = function(name) {
	var event = document.createEvent("HTMLEvents");
	event.initEvent(name, false, false);
	var f = this.ttyPlayer["on" + name];
	if (typeof f === "function") {
		f(event);
	}
	this.ttyPlayer.dispatchEvent(event);
};

ISP.controlsShownOrHidden = function() {
	this.updateCurrentTimeElement();
	if (this.menu) {
		this.menu.onControlsShownOrHidden();
	}
};

ISP.updateCurrentTimeElement = function() {
	this.currentTimeElement.textContent = formatTime(this.currentTime);
	var left = this.progressElement.offsetLeft - (this.currentTimeElement.offsetWidth / 2);
	if (!isNaN(this.duration)) {
		left += this.currentTime / this.duration * this.progressElement.offsetWidth;
	}
	this.currentTimeElement.style.left = left + "px";
};

/** @const */ var TICK = 16;
/** @const */ var TIME_UPDATE_FREQUENCY = 100;
ISP.lastTimeUpdate = 0;

ISP.render = function() {
	// Should the currently rendered frame (next - 1) be drawn?
	if (this.nextDataIndex > 0 && this.data[this.nextDataIndex - 1][1] > this.currentTime) {
		// No, but undoing isn’t possible, so we must replay from the start.
		// This is highly inefficient; for large scripts it’s utterly untenable.
		this.resetTerminal();
		this.nextDataIndex = 0;
	}
	while (this.nextDataIndex < this.data.length && this.data[this.nextDataIndex][1] <= this.currentTime) {
		this.terminal.write(this.data[this.nextDataIndex][0]);
		this.nextDataIndex++;
	}

	if (this.semipaused) {
		return;
	}

	// Have we reached the end? Let’s stop.
	if ((this.currentTime >= this.duration && this.playbackRate > 0) ||
			(this.currentTime <= 0 && this.playbackRate < 0)) {
		if (this.ttyPlayer["loop"]) {
			this.ttyPlayer["currentTime"] = this.playbackRate > 0 ? 0 : this.duration;
		} else {
			this.fireSimpleEvent("timeupdate");
			this.ttyPlayer["pause"]();
			this.fireSimpleEvent("ended");
		}
	} else {
		// Do we need to fire a timeupdate event? We should do them every 66–350ms; Firefox does 250 for video, but because the average length is going to be shorter and because I can, I’m going for 100ms.
		var time = +new Date();
		if (time - this.lastTimeUpdate >= TIME_UPDATE_FREQUENCY) {
			this.lastTimeUpdate = time;
			this.fireSimpleEvent("timeupdate");
		}
	}
};

ISP.resetTerminal = function() {
	this.terminal.reset();
	this.ttyPlayer["title"] = this.defaultTitle;
};

ISP.loadIfNotLoading = function() {
	if (this.networkState < NETWORK_LOADING) {
		this.mediaLoadAlgorithm();
	}
};

ISP.mediaLoadAlgorithm = function() {
	this.resetTerminal();

	// > The media load algorithm consists of the following steps.

	// > 1. Abort any already-running instance of the resource selection
	// >    algorithm for this element.
	if (this.resourceFetchXHR) {
		this.resourceFetchXHR.abort();
	}

	// > 2. If there are any tasks from the media element's media element
	// >    event task source in one of the task queues, then remove those
	// >    tasks.
	// >
	// >    If there are any tasks that were queued by the resource
	// >    selection algorithm (including the algorithms that it itself
	// >    invokes) for this same media element from the DOM manipulation
	// >    task source in one of the task queues, then remove those tasks.
	// >
	// >    Note: Basically, pending events and callbacks for the media
	// >    element are discarded when the media element starts loading a
	// >    new resource.
	//
	// [Nothing to do, we aren’t queuing events.]

	// > 3. If the media element's networkState is set to NETWORK_LOADING
	// >    or NETWORK_IDLE, queue a task to fire a simple event named
	// >    abort at the media element.
	if (this.networkState === NETWORK_LOADING ||
			this.networkState === NETWORK_IDLE) {
		this.fireSimpleEvent("abort");
	}

	// > 4. If the media element's networkState is not set to
	// >    NETWORK_EMPTY, then run these substeps:
	if (this.networkState !== NETWORK_EMPTY) {
		// > 1. Queue a task to fire a simple event named emptied at the
		// >    media element.
		this.fireSimpleEvent("emptied");

		// > 2. If a fetching process is in progress for the media element,
		// >    the user agent should stop it.
		// TODO.

		// > 3. Forget the media element's media-resource-specific tracks.
		// [Not applicable.]

		// > 4. If readyState is not set to HAVE_NOTHING, then set it to
		// >    that state.
		this.readyState = HAVE_NOTHING;

		// > 5. If the paused attribute is false, then set it to true.
		this.paused = true;
		clearInterval(this.ticker);

		// > 6. If seeking is true, set it to false.
		// [Not applicable.]

		// > 7. Set the current playback position to 0.
		// >
		// >    Set the official playback position to 0.
		// >
		// >    If this changed the official playback position, then queue
		// >    a task to fire a simple event named timeupdate at the
		// >    media element.
		var oldTime = this.currentTime;
		this.currentTime = 0;
		this.nextDataIndex = 0;
		if (oldTime !== 0) {
			this.fireSimpleEvent("timeupdate");
		}

		// > 8. Set the initial playback position to 0.
		// Not applicable (TODO? Might be useful?)

		// > 9. Set the timeline offset to Not-a-Number (NaN).
		// TODO (haven’t finished supporting timeline offsets)

		// > 10. Update the duration attribute to Not-a-Number (NaN).
		// >
		// >     The user agent will not fire a durationchange event for
		// >     this particular change of the duration.
		this.data = null;
		this.duration = NaN;
	}

	// > 5. Set the playbackRate attribute to the value of the defaultPlaybackRate attribute.
	this.playbackRate = this.defaultPlaybackRate;

	// > 6. Set the error attribute to null and the autoplaying flag to true.
	this.error = null;
	// TODO.

	// > 7. Invoke the media element's resource selection algorithm.
	this.resourceSelectionAlgorithm();

	// > 8. Note: Playback of any previously playing media resource for this element stops.
	// Already done.
};

ISP.resourceSelectionAlgorithm = function() {
	var self = this;
	// We use a simplified version of the resource selection algorithm,
	// as we support only one type, don’t use <source> (src only) and
	// handle synchronosity differently.

	// > 1. Set the element's networkState attribute to the
	// >    NETWORK_NO_SOURCE value.
	self.networkState = NETWORK_NO_SOURCE;

	// > 2. Set the element's show poster flag to true.
	self.showPoster = true;

	// > 3. Set the media element's delaying-the-load-event flag to
	// >    true (this delays the load event).
	// TODO.

	// > 4. Asynchronously await a stable state, allowing the task that
	// >    invoked this algorithm to continue. The synchronous section
	// >    consists of all the remaining steps of this algorithm until
	// >    the algorithm says the synchronous section has ended.
	// >    (Steps in synchronous sections are marked with ⌛.)

	// > 5. ⌛ If the media element's blocked-on-parser flag is false,
	// >    then populate the list of pending text tracks.
	// [Not applicable.]

	// > 6. ⌛ If the media element has a src attribute, then let mode
	// >    be attribute.
	// >
	// >    ⌛ Otherwise, if the media element does not have a src
	// >    attribute but has a source element child, then let mode be
	// >    children and let candidate be the first such source element
	// >    child in tree order.
	// >
	// >    ⌛ Otherwise the media element has neither a src attribute
	// >    nor a source element child: set the networkState to
	// >    NETWORK_EMPTY, and abort these steps; the synchronous
	// >    section ends.
	//
	// We don’t support <source> at present, so this is simpler.
	var src = self.ttyPlayer.getAttribute("src");
	if (src === null) {
		self.networkState = NETWORK_EMPTY;
		return;
	}

	// > 7. ⌛ Set the media element's networkState to NETWORK_LOADING.
	self.networkState = NETWORK_LOADING;

	// > 8. ⌛ Queue a task to fire a simple event named loadstart at
	// >    the media element.
	self.fireSimpleEvent("loadstart");

	// > 9. If mode is attribute, then run these substeps:
	// [We don’t support <source>, so this is guaranteed.]

	// > 1. ⌛ If the src attribute's value is the empty string, then
	// >    end the synchronous section, and jump down to the failed
	// >    with attribute step below.
	if (src === "") {
		return self.resourceSelectionAlgorithmFailedWithAttribute();
	}

	// > 2. ⌛ Let absolute URL be the absolute URL that would have
	// >    resulted from resolving the URL specified by the src
	// >    attribute's value relative to the media element when the
	// >    src attribute was last changed.
	var absoluteURL = new URL(src.trim(), self.ttyPlayer.baseURI);

	// > 3. ⌛ If absolute URL was obtained successfully, set the
	// >    currentSrc attribute to absolute URL.
	self.currentSrc = absoluteURL.toString();

	// > 4. End the synchronous section, continuing the remaining steps
	// >    asynchronously.
	setTimeout(function() {

		// > 5. If absolute URL was obtained successfully, run the resource
		// >    fetch algorithm with absolute URL. If that algorithm
		// >    returns without aborting this one, then the load failed.
		// Due to the simpler model used, supporting aborting isn’t necessary.
		self.resourceFetchAlgorithm();
	}, 0);
};

ISP.resourceSelectionAlgorithmFailedWithAttribute = function() {
	// > 6. Failed with attribute: Reaching this step indicates that
	// >    the media resource failed to load or that the given URL
	// >    could not be resolved. Queue a task to run the following
	// >    steps, using the DOM manipulation task source:

	// >     1. Set the error attribute to a new MediaError object whose code attribute is set to MEDIA_ERR_SRC_NOT_SUPPORTED.
	this.error = new MyMediaError(MEDIA_ERR_SRC_NOT_SUPPORTED);

	// >     2. Forget the media element's media-resource-specific tracks.
	// [Nothing to do.]

	// >     3. Set the element's networkState attribute to the NETWORK_NO_SOURCE value.
	this.networkState = NETWORK_NO_SOURCE;

	// >     4. Set the element's show poster flag to true.
	this.showPoster = true;

	// >     5. Fire a simple event named error at the media element.
	this.fireSimpleEvent("error");

	// >     6. Set the element's delaying-the-load-event flag to false. This stops delaying the load event.
	//this.delayingTheLoadEvent = false;

	// > 7. Wait for the task queued by the previous step to have executed.
	// [Not queueing tasks, so nothing to do.]

	// > 8. Abort these steps. Until the load() method is invoked or the src attribute is changed, the element won't attempt to load another resource.
};

ISP.resourceFetchAlgorithm = function() {
	var self = this;
	function finishResourceFetchAlgorithm() {
		delete self.resourceFetchXHR;
	}

	function continueResourceFetchAlgorithm(data) {
		// > Once enough of the media data has been fetched to determine
		// > the duration of the media resource, its dimensions, and other
		// > metadata:
		// >
		// > This indicates that the resource is usable. The user agent
		// > must follow these substeps:
		// >
		// > 1. Establish the media timeline for the purposes of the
		// >    current playback position, the earliest possible position,
		// >    and the initial playback position, based on the media data.
		// [TODO support such things?]

		// > 2. Update the timeline offset to the date and time that
		// >    corresponds to the zero time in the media timeline
		// >    established in the previous step, if any. If no explicit
		// >    time and date is given by the media resource, the timeline
		// >    offset must be set to Not-a-Number (NaN).
		// [Nothing to do.]

		// > 3. Set the current playback position and the official playback
		// >    position to the earliest possible position.
		self.currentTime = 0;
		self.nextDataIndex = 0;

		// > 4. Update the duration attribute with the time of the last
		// >    frame of the resource, if known, on the media timeline
		// >    established above. If it is not known (e.g. a stream that
		// >    is in principle infinite), update the duration attribute to
		// >    the value positive Infinity.
		// >
		// >    Note: The user agent will queue a task to fire a simple
		// >    event named durationchange at the element at this point.
		self.data = data.data;
		self.duration = data.data.length === 0 ? 0 : data.data[data.data.length - 1][1];
		self.fireSimpleEvent("durationchange");

		// > 5. For video elements, set the videoWidth and videoHeight
		// >    attributes, and queue a task to fire a simple event named
		// >    resize at the media element.
		// >
		// >    Note: Further resize events will be fired if the dimensions
		// >    subsequently change.
		// TODO: allow this to be written on the HTML
		// TODO: modify the file format to track window sizes, then do
		// something like this (ttyWidth and ttyHeight, in chars, I
		// think).
		// These are taken straight from term.js; TODO: modify it to send resize events.
		if (data.dimensions) {
			self.ttyPlayer["resize"](data.dimensions.cols, data.dimensions.rows);
		}

		// XXX: the spec mentions getStartDate(), which data.startDate
		// covers, but Firefox and Chrome at least (dunno about others)
		// don’t implement that, so I’m not doing anything with it yet.

		// We could render the first frame if we wanted to. Should we?
		//self.render();

		// > 6. Set the readyState attribute to HAVE_METADATA.
		// >
		// >    Note: A loadedmetadata DOM event will be fired as part of
		// >    setting the readyState attribute to a new value.
		self.readyState = HAVE_METADATA;
		self.fireSimpleEvent("loadedmetadata");

		// > 7. Let jumped be false.
		var jumped = false;

		// > 8. If the media element's default playback start position is
		// >    greater than zero, then seek to that time, and let jumped
		// >    be true.
		if (self.defaultPlaybackStartPosition > 0) {
			self.currentTime = self.defaultPlaybackStartPosition;
			jumped = true;
		}

		// > 9. Let the media element's default playback start position be
		// >    zero.
		self.defaultPlaybackStartPosition = 0;

		// > 10. If either the media resource or the address of the current
		// >     media resource indicate a particular start time, then set
		// >     the initial playback position to that time and, if jumped
		// >     is still false, seek to that time and let jumped be true.
		// >
		// >     For example, with media formats that support the Media
		// >     Fragments URI fragment identifier syntax, the fragment
		// >     identifier can be used to indicate a start position.
		// >     [MEDIAFRAG]
		// TODO: support Media Fragments, e.g. ?t=a,b#t=c will trim the
		// range to [a, b) seconds, starting at c seconds into that range,
		// ?t=,b is [0, b); ?t=a is [a, end), it uses NPT.

		// > 11. If either the media resource or the address of the current
		// >     media resource indicate a particular set of audio or video
		// >     tracks to enable, or if the user agent has information
		// >     that would enable it to select specific tracks to improve
		// >     the user's experience, then the relevant audio tracks must
		// >     be enabled in the element's audioTracks object, and, of
		// >     the relevant video tracks, the one that is listed first in
		// >     the element's videoTracks object must be selected. All
		// >     other tracks must be disabled.
		// >
		// >     This could again be triggered by Media Fragments URI
		// >     fragment identifier syntax, but it could also be triggered
		// >     e.g. by the user agent selecting a 5.1 surround sound
		// >     audio track over a stereo audio track. [MEDIAFRAG]
		// [Not applicable.]

		// > 12. If the media element has a current media controller, then:
		// >     if jumped is true and the initial playback position,
		// >     relative to the current media controller's timeline, is
		// >     greater than the current media controller's media
		// >     controller position, then seek the media controller to the
		// >     media element's initial playback position, relative to the
		// >     current media controller's timeline; otherwise, seek the
		// >     media element to the media controller position, relative
		// >     to the media element's timeline.
		// [Not applicable.]

		// >    Once the readyState attribute reaches HAVE_CURRENT_DATA, after the loadeddata event has been fired, set the element's delaying-the-load-event flag to false. This stops delaying the load event.
		// >
		// >    A user agent that is attempting to reduce network usage while still fetching the metadata for each media resource would also stop buffering at this point, following the rules described previously, which involve the networkState attribute switching to the NETWORK_IDLE value and a suspend event firing.
		// >
		// >    The user agent is required to determine the duration of the media resource and go through this step before playing.

		// > Once the entire media resource has been fetched (but
		// > potentially before any of it has been decoded)
		// >
		// >    Fire a simple event named progress at the media element.
		self.fireSimpleEvent("progress");

		// >    Set the networkState to NETWORK_IDLE and fire a simple event named suspend at the media element.
		self.networkState = NETWORK_IDLE;
		self.fireSimpleEvent("suspend");

		// >    If the user agent ever discards any media data and then needs to resume the network activity to obtain it again, then it must queue a task to set the networkState to NETWORK_LOADING.
		// [This won’t happen.]

		// >    If the user agent can keep the media resource loaded, then the algorithm will continue to its final step below, which aborts the algorithm.

		// The description of when this is supposed to happen is
		// surprisingly unclear. Hopefully this will do.
		self.readyState = HAVE_ENOUGH_DATA;
		self.fireSimpleEvent("loadeddata");
		self.fireSimpleEvent("canplay");
		self.fireSimpleEvent("canplaythrough");

		finishResourceFetchAlgorithm();
	}

	// > 1. Let the current media resource be the resource given by the
	// >    absolute URL passed to this algorithm. This is now the
	// >    element's media resource.
	// current media resource = self.currentSrc

	// > 2. Remove all media-resource-specific text tracks from the
	// >    media element's list of pending text tracks, if any.
	// [Nothing to do.]

	// > 3. Optionally, run the following substeps. This is the expected
	// >    behavior if the user agent intends to not attempt to fetch
	// >    the resource until the user requests it explicitly (e.g. as
	// >    a way to implement the preload attribute's none keyword).
	// [Substeps omitted as I don’t wish to implement no-preload.]

	// > 4. Perform a potentially CORS-enabled fetch of the current
	// >    media resource's absolute URL, with the mode being the
	// >    state of the media element's crossorigin content attribute,
	// >    the origin being the origin of the media element's
	// >    Document, and the default origin behaviour set to taint.
	// >
	//
	// [Vast swathes of text follow, mostly irrelevant as we load the
	// entire resource at once; we don’t need to bother about the
	// "stalled" and "suspend" events, and won’t bother for now about
	// "progress" every 350±200ms/every byte (whichever is least
	// frequent)]
	//
	// INCORRECTNESS: the window’s origin is used instead of the media
	// element’s document’s. Security prevents doing this right.
	// Dunno about the taint bit.

	// Past here we go laissez-faire, mostly ignoring the specs.

	var xhr = new XMLHttpRequest();
	if (self.ttyPlayer["crossOrigin"] === "use-credentials") {
		xhr.withCredentials = true;
	} else if (self.ttyPlayer["crossOrigin"] === "anonymous" && "mozAnon" in xhr) {
		// INCORRECTNESS: no anonymous support outside Firefox.
		// (No one has implemented AnonXMLHttpRequest ☹.)
		xhr.mozAnon = true;
	}
	xhr.onabort = finishResourceFetchAlgorithm;
	xhr.open("GET", self.currentSrc);
	xhr.responseType = "arraybuffer";
	xhr.onload = xhr.onerror = function() {
		if (xhr.status === 200) {
			var data;
			try {
				data = parseTTYRec(xhr.response);
				// TODO: add a bit of validation/sanity checking?
			} catch (e) {
				// window.console && console.warn && console.warn("parseTTYRec failed: ", e);
				// > If the media data can be fetched but is found by
				// > inspection to be in an unsupported format, or can
				// > otherwise not be rendered at all
				// > [Give up and go back to resource selection, which
				// > we don’t need to return to due to our design.]
				finishResourceFetchAlgorithm();
				self.resourceSelectionAlgorithmFailedWithAttribute();
				return;
			}

			// TODO: implement something like this:
			//
			// > If the media resource is found to have a video track
			// >
			// > 1. Create a VideoTrack object to represent the
			// >    video track.
			// >
			// > 2. Update the media element's videoTracks
			// >    attribute's VideoTrackList object with the new
			// >    VideoTrack object.
			// >
			// > 3. Fire a trusted event with the name addtrack,
			// >    that does not bubble and is not cancelable, and
			// >    that uses the TrackEvent interface, with the
			// >    track attribute initialized to the new
			// >    VideoTrack object, at this VideoTrackList
			// >    object.
			continueResourceFetchAlgorithm(data);
		} else {
			// > If the media data cannot be fetched at all, due to
			// > network errors, causing the user agent to give up
			// > trying to fetch the resource
			// > [Give up and go back to resource selection, which
			// > we don’t need to return to due to our design.]
			finishResourceFetchAlgorithm();
			self.resourceSelectionAlgorithmFailedWithAttribute();
			return;
		}
	};
	self.resourceFetchXHR = xhr;
	try {
		xhr.send();
	} catch (e) {
		// e.g. relative URL on file: in some browsers.
		xhr.onerror();
	}
};

class TTYPlayerElement extends HTMLElement {

	// FIXME: we used to set up the internal state at construction time, but with custom elements v1 we can no longer do this: it is an error to access or add attributes in the constructor, and browsers do actually barf if you try it. Until we go all in on Shadow DOM, then, we initialise everything in connectedCallback. This means that various state is uninitialised until that time, and the element won’t work properly in various severe ways.

	static get "observedAttributes"() {
		return ["src", "controls", "poster"];
	}

	"attributeChangedCallback"(name, oldValue, value) {
		if (!this["_"]) {
			return;
		}
		if (name === "src" && value !== null) {
			this["pause"]();
			// > If a src attribute of a media element is set or changed, the user
			// > agent must invoke the media element's media element load
			// > algorithm. (Removing the src attribute does not do this, even if
			// > there are source elements present.)
			this["load"]();
		} else if (name === "controls" && value !== null) {
			// While the controls are display: none, the position of
			// this element is garbage, so we need to fix it now.
			this["_"].controlsShownOrHidden();
		} else if (name === "poster") {
			// Update the poster if necessary.
			//
			// > If the specified resource is to be used, then, when the element is
			// > created or when the poster attribute is set, changed, or removed,
			// > the user agent must run the following steps to determine the
			// > element's poster frame (regardless of the value of the element's
			// > show poster flag):
			//
			// Due to the poster=npt:… possibility and how we could otherwise palm
			// it off to the browser, we *do* actually regard the show poster flag
			// in deciding whether to “run these steps”.
			this["_"].showPoster = this["_"].showPoster;
		}
	}

	"connectedCallback"() {
		if (!this["_"]) {
			this["_"] = new TTYPlayerInternalState(this);
			this["_"].setUp();

			// TODO: put no-preload in load(), as defined, rather than here.
			// As it stands, changing src will preload even though it need not.
			if (this["preload"] !== "none") {
				this["load"]();
			}

			if (this["autoplay"]) {
				this["play"]();
			}
		}

		this["_"].controlsShownOrHidden();
	}
}

const TTYPlayerElementPrototype = TTYPlayerElement.prototype;

Object.defineProperties(TTYPlayerElementPrototype, {
	/** @lends {TTYPlayerElementPrototype} */

	/// @idl readonly attribute MediaError? error;
	"error": {
		get: function() {
			return this["_"].error;
		}
	},

	/// @idl attribute DOMString src;
	"src": {
		get: function() {
			// It needs to be an absolute URL, and we’re not doing <source> tags,
			// so src and currentSrc will actually always be the same.
			return this["_"].currentSrc;
		},
		set: function(value) {
			this.setAttribute("src", value);
		}
	},

	/// @idl readonly attribute DOMString currentSrc;
	"currentSrc": {
		get: function() {
			return this["_"].currentSrc;
		}
	},

	/// @idl attribute DOMString crossOrigin;
	"crossOrigin": {
		get: function() {
			var value = this.getAttribute("crossorigin");
			if (value === null || value === "anonymous" || value === "use-credentials") {
				return value;
			} else {
				return "anonymous";
			}
		},
		set: function(value) {
			if (value === null) {
				this.removeAttribute("crossorigin");
			} else if (value === "use-credentials") {
				this.setAttribute("crossorigin", value);
			} else {
				// "" == invalid value == "anonymous"
				this.setAttribute("crossorigin", "anonymous");
			}
		}
	},

	/// @idl const unsigned short NETWORK_EMPTY = 0;
	"NETWORK_EMPTY": { value: 0 },

	/// @idl const unsigned short NETWORK_IDLE = 1;
	"NETWORK_IDLE": { value: 1 },

	/// @idl const unsigned short NETWORK_LOADING = 2;
	"NETWORK_LOADING": { value: 2 },

	/// @idl const unsigned short NETWORK_NO_SOURCE = 3;
	"NETWORK_NO_SOURCE": { value: 3 },

	/// @idl readonly attribute unsigned short networkState;
	"networkState": {
		get: function() {
			return this["_"].networkState;
		}
	},

	/// @idl attribute DOMString preload;
	"preload": {
		get: function() {
			var value = this.getAttribute("preload");
			if (value === "none" || value === "metadata" || value === "auto") {
				return value;
			} else {
				// "" == auto, nothing is said about malformed values, and the missing value default is user-agent defined and we have no use for Metadata.
				return "auto";
			}
		},
		set: function(value) {
			if (value === "none" || value === "metadata" || value === "auto") {
				this.setAttribute("metadata", value);
			} else {
				this.removeAttribute("metadata");
			}
		}
	},

	/// @idl readonly attribute TimeRanges buffered;
	"buffered": {
		get: function() {
			return this["seekable"];
		}
	},

	// Although they sit here in the IDL, load() and canPlayType() are defined
	// later because they’re methods, not properties.

	/// @idl const unsigned short HAVE_NOTHING = 0;
	"HAVE_NOTHING": { value: 0 },

	/// @idl const unsigned short HAVE_METADATA = 1;
	"HAVE_METADATA": { value: 1 },

	/// @idl const unsigned short HAVE_CURRENT_DATA = 2;
	"HAVE_CURRENT_DATA": { value: 2 },

	/// @idl const unsigned short HAVE_FUTURE_DATA = 3;
	"HAVE_FUTURE_DATA": { value: 3 },

	/// @idl const unsigned short HAVE_ENOUGH_DATA = 4;
	"HAVE_ENOUGH_DATA": { value: 4 },

	/// @idl readonly attribute unsigned short readyState;
	"readyState": {
		get: function() {
			return this["_"].readyState;
		}
	},

	/// @idl readonly attribute boolean seeking;
	// I’m sloppily ignoring the whole seeking thing. Meh, it’s fast, hopefully no one cares about the seeking and seeked events? (TODO evaluate further.)
	"seeking": {
		value: false
	},

	/// @idl attribute double currentTime;
	"currentTime": {
		get: function() {
			return this["_"].currentTime;
		},
		set: function(newTime) {
			if (!this["_"].data) {
				throw invalidStateError();
			}
			this["_"].currentTime = Math.max(0, Math.min(newTime, this["duration"]));
			this["_"].render();
		}
	},

	/// @idl readonly attribute unrestricted double duration;
	"duration": {
		get: function() {
			return this["_"].duration;
		}
	},

	// @idl Date getStartDate();
	// Firefox and Chrome don’t implement this on HTMLMediaElement, so I’m skipping it for now.

	/// @idl readonly attribute boolean paused
	"paused": {
		get: function() {
			return this["_"].paused;
		}
	},

	/// @idl attribute double defaultPlaybackRate;
	"defaultPlaybackRate": {
		get: function() {
			return this["_"].defaultPlaybackRate;
		},
		set: function(rate) {
			rate = +rate;
			var notify = this["_"].defaultPlaybackRate !== rate;
			this["_"].defaultPlaybackRate = rate;
			if (notify) {
				this["_"].fireSimpleEvent("ratechange");
			}
		}
	},

	/// @idl attribute double playbackRate;
	"playbackRate": {
		get: function() {
			return this["_"].playbackRate;
		},
		set: function(rate) {
			rate = +rate;
			var notify = this["_"].playbackRate !== rate;
			this["_"].playbackRate = rate;
			if (notify) {
				this["_"].fireSimpleEvent("ratechange");
			}
		}
	},

	/// @idl readonly attribute TimeRanges played;
	/// @stub Tracking which ranges have been played would take effort!
	"played": {
		value: EMPTY_TIME_RANGES
	},

	/// @idl readonly attribute TimeRanges seekable;
	"seekable": {
		get: function() {
			if (this["readyState"] === HAVE_ENOUGH_DATA) {
				return new MyTimeRanges([0, this["duration"]]);
			} else {
				return EMPTY_TIME_RANGES;
			}
		}
	},

	/// @idl readonly attribute boolean ended;
	"ended": {
		get: function() {
			// XXX: I’m guessing these semantics, haven’t checked them.
			return this["paused"] && this["currentTime"] === (this["playbackRate"] < 0 ? 0 : this["duration"]);
		}
	},

	/// @idl attribute boolean autoplay;
	"autoplay": attributeBooleanProperty("autoplay"),

	/// @idl attribute boolean loop;
	"loop": attributeBooleanProperty("loop"),

	// play() and pause() are simple properties and so appear later

	// @idl attribute DOMString mediaGroup;
	// Firefox and Chrome don’t implement this on HTMLMediaElement, so I’m skipping it for now.

	// @idl attribute MediaController? controller;
	// Firefox and Chrome don’t implement this on HTMLMediaElement, so I’m skipping it for now.

	/// @idl attribute boolean controls;
	"controls": attributeBooleanProperty("controls"),

	// volume and muted are simple properties and so appear later

	/// @idl attribute boolean defaultMuted;
	/// @stub volume is irrelevant
	"defaultMuted": attributeBooleanProperty("muted"),

	// @idl readonly attribute AudioTrackList audioTracks;
	// Firefox and Chrome don’t implement this on HTMLMediaElement, so I’m skipping it for now.

	// @idl readonly attribute VideoTrackList videoTracks;
	// Firefox and Chrome don’t implement this on HTMLMediaElement, so I’m skipping it for now.

	/// @idl readonly attribute TextTrackList textTracks;
	/// @stub text tracks aren’t implemented yet—will they be?
	"textTracks": {
		get: function() {
			return document.createElement("video").textTracks;
		}
	},

	// addTextTrack() is a simple property and so is added later.

	// The remainder is things that are not part of HTMLMediaElement, as noted earlier.

	/// The window title.
	///
	/// @idl attribute DOMString title;
	"title": {
		get: function() {
			return this["_"].titleElement.textContent;
		},
		set: function(value) {
			this["_"].titleElement.textContent = value;
			this["_"].fireSimpleEvent("titlechange");
		}
	},

	/// defaultTitle is to title as defaultRateChange is to rateChange.
	///
	/// @idl attribute DOMString defaultTitle;
	"defaultTitle": {
		get: function() {
			return this["_"].defaultTitle;
		},
		set: function(value) {
			this["_"].defaultTitle = value;
			this["_"].fireSimpleEvent("titlechange");
		}
	},

	/// The number of columns in the terminal.
	/// This is like HTMLVideoElement.videoWidth but not in pixels.
	///
	/// Read-only as it’s rarely altered alone; use this.resize(cols, this.rows) instead.
	"cols": {
		get: function() {
			return this["_"].terminal.cols;
		}
	},

	/// The number of rows in the terminal.
	/// This is like HTMLVideoElement.videoHeight but not in pixels.
	///
	/// Read-only as it’s rarely altered alone; use this.resize(this.cols, rows) instead.
	"rows": {
		get: function() {
			return this["_"].terminal.rows;
		}
	},

	// Borrowed from HTMLVideoElement.
	/// @idl attribute DOMString poster;
	"poster": {
		get: function() {
			return (this.getAttribute("poster") || "").trim();
		},
		set: function(value) {
			this.setAttribute("poster", value);
		}
	}
});

// Here are the simple properties that don’t go in the defineProperties block above.

/// @idl void load();
TTYPlayerElementPrototype["load"] = function() {
	this["_"].mediaLoadAlgorithm();
};

/// @idl CanPlayTypeEnum canPlayType(DOMString type);
/// @stub we only support one format at present, anyway.
TTYPlayerElementPrototype["canPlayType"] = function() {
	return "maybe";
};

/// @idl void play();
TTYPlayerElementPrototype["play"] = function() {
	var self = this;

	function realPlay() {
		if (self["ended"]) {
			self["currentTime"] = self["playbackRate"] < 0 ? self["duration"] : 0;
		}
		self["_"].showPoster = false;
		self["_"].paused = false;
		var lastTime = new Date();
		self["_"].ticker = setInterval(function() {
			var newTime = new Date();
			if (!self["_"].semipaused) {
				self["currentTime"] += (newTime - lastTime) / 1000 * self["playbackRate"];
			}
			lastTime = newTime;
		}, TICK);
		self["_"].fireSimpleEvent("play");
	}

	function loaded() {
		self.removeEventListener("loadeddata", loaded);
		realPlay();
	}

	if (this["_"].paused) {
		if (this["_"].data) {
			realPlay();
		} else {
			this.addEventListener("loadeddata", loaded);
			this["_"].loadIfNotLoading();
		}
	}
};

/// @idl void pause();
TTYPlayerElementPrototype["pause"] = function() {
	if (!this["_"].paused) {
		this["_"].paused = true;
		clearInterval(this["_"].ticker);
		this["_"].fireSimpleEvent("pause");
	}
};

/// @idl attribute double volume;
/// @stub volume is irrelevant
TTYPlayerElementPrototype["volume"] = 1;

/// @idl attribute boolean muted;
/// @stub volume is irrelevant
TTYPlayerElementPrototype["muted"] = false;

/// @idl TextTrack addTextTrack(TextTrackKind kind, optional DOMString label = "", optional DOMString language = "");
/// @stub text tracks aren’t implemented yet—will they be?
TTYPlayerElementPrototype["addTextTrack"] = function() {
	return null;
};
// This should theoretically go on HTMLElement.prototype. Too bad.
/// @idl attribute EventHandler ontitlechange;
TTYPlayerElementPrototype["ontitlechange"] = null;

TTYPlayerElementPrototype["resize"] = function(x, y) {
	this["_"].terminal.resize(x, y);
};

TTYPlayerElementPrototype["pretendToBeAVideo"] = function() {
	Object.defineProperties(this, {
		/** @lends {TTYPlayerElementPrototype} */

		// Let’s pretend (badly) that we’re an HTMLVideoElement!
		"tagName": {value: "VIDEO"},
		"width": {
			get: function() {
				return this.offsetWidth;
			},
			set: function(value) {
				// TODO this is a little poor as a technique, refine it.
				this.style.fontSize = "100%";
				this.style.fontSize = (value / this.offsetWidth * 100) + "%";
			}
		},
		"height": {
			get: function() {
				return this.offsetHeight;
			},
			set: function(value) {
				// TODO this is a little poor as a technique, refine it.
				this.style.fontSize = "100%";
				this.style.fontSize = (value / this.offsetHeight * 100) + "%";
			}
		},
		"videoWidth": {
			get: function() {
				return this["width"];
			}
		},
		"videoHeight": {
			get: function() {
				return this["height"];
			}
		}
	});
};

customElements.define("tty-player", TTYPlayerElement);
})();
