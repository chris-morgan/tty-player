`<tty-player>`: `<video>`, but for ttyrec scripts
=================================================

- [Examples](#user-content-examples)
- [Using tty-player](#user-content-using-tty-player)
- [Browser compatibility](#user-content-browser-compatibility)
- [Miscellaneous notes](#user-content-miscellaneous-notes)
- [`<tty-player>` as a drop-in replacement for `<video>`](#user-content-tty-player-as-a-drop-in-replacement-for-video)
- [Comparison of similar products](#user-content-comparison-of-similar-products)
- [Author](#user-content-author)
- [License](#user-content-license)

Introduction
------------

Suppose you have a short screencast of doing something in a terminal. You might make a full recording of it and include it in your web page like this:

```html
<video autoplay controls loop src=tty-screencast.webm></video>
```

There are plenty of problems with doing it this way, though:

- Video codecs are a pain. (Would you like to provide it in MP4, H.264, WebM, Ogg Theora, *&c.*? Do you even know what they all *mean* and which entries in that list aren’t actually codecs? Do you know what you need for decent browser compatibility?)
- Video represents text as low-resolution images makes it harder to read;
- You can’t select text;
- Bandwidth requirements are ridiculously high for such a simple thing.

OK, so you use something like `ttyrec` plus `ttygif` to record it and produce an animated GIF. But still:

- You can’t select text;
- The text size is fixed;
- Anything beyond linear, looping playback is out;
- Seriously, who uses GIFs for anything but cat videos anyway? (Don’t answer, I’m not sure I’d want to know.)

This library offers the *real* solution: a player for your ttyrec scripts, implementing basically the same interface as `<video>` so that it’s almost a drop-in replacement.

So here is this library: it provides a `<tty-player>` element, just like `<video>` except taking a ttyrec file as its source. (And this particular little example is only 34KB, 8KB gzipped! Take that, traditional video formats! Even this screenshot of *one frame* of that thing only scrunches to 34KB with <code>optipng -o7</code>, 31KB gzipped.) 

```html
<tty-player autoplay controls loop src=tty-screencast.ttyrec></tty-player>
```

[![A screenshot of <tty-player> in action](https://raw.githubusercontent.com/chris-morgan/tty-player/master/tty-screencast.snapshot.png)](http://tty-player.chrismorgan.info/#tty-screencast)

Examples
--------

- [General examples](http://tty-player.chrismorgan.info/examples.html): a bit of everything with notes on many aspects
- [Popcorn.js](http://tty-player.chrismorgan.info/popcorn.html): interaction with Popcorn.js (drop a <code class=prettyprint><span class=tag>&lt;tty-player&gt;</span></code> where it expects a <code class=prettyprint><span class=tag>&lt;video&gt;</span></code> and it Just Works™!)
- [Star Wars ASCIImation](http://tty-player.chrismorgan.info/star-wars.html): large scripts, trivial styling, preloading and the <code class=prettyprint><span class=atn>poster</span></code> attribute.

Using tty-player
----------------

1. Install a tool that can record your terminal appropriately.

   I recommend **[termrec][]**, because it records the terminal dimensions in the file (and this library knows what to do with it).

   You could also use **[ttyrec][]**, but dimensions won’t be stored. Or anything else that supports the ttyrec format.

   You cannot use plain old `script` because even if it supports timing (Mac OS X’s doesn’t) it uses a different format.

2. Record your terminal! I recommend using the `.ttyrec` extension, for no particularly good reason.

3. Add the requirements to your web page:

   - A Web Components polyfill (optional; Chrome and Opera don’t need it, nor does Firefox with `dom.webcomponents.enabled` set to true).

     Polymer’s webcomponents.js, lite edition is plenty; it’s around 11KB minified and gzipped:
     https://cdnjs.cloudflare.com/ajax/libs/webcomponentsjs/0.7.5/webcomponents-lite.min.js.
     Remember that due to its nature it should be the first script.

     (Actually this library only uses [Custom Elements](http://caniuse.com/#feat=custom-elements) and [Mutation Observer](http://caniuse.com/#feat=mutationobserver) at present, so you could be more picky if you wanted.)

   - [term.js][] (sorry, I don’t know of any CDNs with it). For termrec’s size hints to work, my fork is currently needed (pending: https://github.com/chjj/term.js/pull/75)

   - `tty-player.css`

   - `tty-player.js` (run `make` to minify these last two; `uglifycss` required)

4. Start using the `<tty-player>` element just like you’d use a `<video>` element! Make sure you use the `src` attribute; you can’t use `<source>` elements.

5. Spruce the styles up, if you like. What’s there at present by way of window chrome is borrowed from my own i3 arrangement.

[ttyrec]: http://0xcc.net/ttyrec/
[termrec]: http://angband.pl/termrec.html
[term.js]: https://github.com/chjj/term.js

Browser compatibility
---------------------

Tested in current Firefox and Chromium on Linux and IE 11 on Windows.
Should work across the board in modern browsers.
I haven’t yet gone to the trouble of testing in a broader variety of browser,
nor is there any semblence of a test suite.
Ain’t the web great—if this were Real Life I’d actually feel obliged to write tests!

- **tty-player.js**:
  - General functionality: untested, but probably IE 9+
  - Controls: uses `<input type=range>`, so IE 10+
- **webcomponents.js**: down to at least IE10, not sure about older.
- **term.js**: uncertain, presumed broad.

Miscellaneous notes
-------------------

I like the word miscellany.

Intended future feature: put an `<audio>` inside the `<tty-player>` and playback will be synchronised between them. Text tracks might be implemented as a part of this; I haven’t decided at all. In the mean time, try mixing tty-player with [Popcorn.js](http://popcornjs.org/)!

`<tty-player>` as a drop-in replacement for `<video>`
-----------------------------------------------------

`<tty-player>` implements an interface which I will call `HTMLTTYPlayerElement`. Here’s its definition:

```idl
interface HTMLTTYPlayerElement : HTMLMediaElement {
           attribute DOMString defaultTitle;
           attribute DOMString title;

  readonly attribute unsigned long cols;
  readonly attribute unsigned long rows;
  void resize(unsigned long cols, unsigned long rows);

           attribute EventHandler ontitlechange;

  // This one is straight from HTMLVideoElement.
           attribute DOMString poster;

  // s/void/avoid/
  void pretendToBeAVideo();
}
```

As implemented, `HTMLTTYPlayerElement` does not extend `HTMLMediaElement`, so while `document.createElement("video") instanceof HTMLMediaElement`, `!(document.createElement("tty-player") instanceof HTMLMediaElement`. For the most part it would work fine, because all the standard properties of `HTMLMediaElement.prototype` are overridden in `HTMLTTYPlayerElement.prototype`, but any that are left will be liable to blow up as soon as you touch them—accessing an unknown property would in Firefox yield a `TypeError`, for example, because it does not acknowledge my type as implementing the interface `HTMLMediaElement`. Therefore I think it is safer overall to be content with `HTMLElement`.

Anyhow: because `HTMLTTYPlayerElement` implements the same interface in contents, if not in name, as `HTMLVideoElement`, it’s normally a drop-in replacement. Many things will actually work with it straight off. For those things that don’t, there’s a technique that gets even closer: `HTMLTTYPlayerElement.pretendToBeAVideo()`. This makes an `HTMLTTYPlayerElement` patch itself to implement the interface of `HTMLVideoElement` (`width`, `height`, `videoWidth` and `videoHeight`; it already has `poster`). And, for good (?) measure, to override the `tagName` property so that `this.tagName == "VIDEO"`.

[**MediaElement.js**](http://mediaelementjs.com/) works pretty well with `<tty-player>`s masquerading as `<video>`s, though the handling of the poster is not perfect (you end up with two play button overlays; text posters will probably need to be rasterised with the assistance of a canvas, too).

[**Popcorn.js**](http://popcornjs.org/) doesn’t need the masquerade—give it a `<tty-player>` instead of a `<video>` and it’s perfectly happy. (Some plugins might potentially need the masquerade. I haven’t tried everything.)

Comparison of similar products
------------------------------

**Terminology:**

- **`script -t`:** the `script` program from linux-utils, which supports `-t` (timing).
  Linux machines will normally have it, but no one else is likely to.
  Mac OS X has an older version of `script` without timing support.

- **Poster:** what is shown in the player before you start playing a video. Typically an image that is supposed to show what the video is about.

**Features not assessed:**

- How do they handle Unicode? (tty-player assumes UTF-8 unless the appropriate termrec marker indicating that it is *not* UTF-8 is there, I suspect some of the others won’t handle UTF-8 properly.)

### [asciinema](https://asciinema.org/)

This is the only one I’ve found that doesn’t use term.js.

**Format:**
- [asciicast file format version 1](https://github.com/asciinema/asciinema/blob/master/doc/asciicast-v1.md): ah! they *specified* it! I wish more people would. JSON format very much like `script -t` with the two files merged, with a bit more information. Tweaking timing is thus easy.
- … but the player doesn’t speak that; it speaks a proprietary format not based directly on the ANSI codes. Much of a muchness in the end, though I wouldn’t care to edit that format.

**Audio:** no.

**Recording:**
- **Code:** https://github.com/asciinema/asciinema
- **Usage:** `asciinema` with subcommands: `rec [filename]`, `play <filename>`, `upload <filename>`, `auth`. Configuration file for specifying command to execute when recording. Ability to cap wait duration between frames. Nice stuff.
- **Dependencies:** Linux/Mac OS X. (Written in Go, distributed as binaries for various platforms.)

**Hosting:** asciinema.org
- **Code:** https://github.com/asciinema/asciinema.org
- **Primary deployment:** https://asciinema.org/
- **Fanciness:** quite high; also has oEmbed/Open Graph/Twitter Card support so social sharing is pretty.

**Player:**
- **Code:** https://github.com/asciinema/asciinema-player
- **Complexity:** moderate.
- **API:** uncertain.
- **Dependencies:** React, JSXTransformer, jQuery—but *not* term.js.
- **Attitude to the document:** no thinking outside the box permitted!
- **Embedding:** [rather good](https://asciinema.org/docs/embedding); `<script>`-based, with knobs like autoplay and loop, makes an `<iframe>`; asciinema.org also produces images of the poster for including in other places (impressive!).
- **Compatibility:** uncertain.
- **Prettiness/usability:** quite good; even has support for three themes. However its time progress bar usability is poor.
- **Poster:** yes, embedded into the metadata block.
- **Window title:** no.
- **Experience:** I found some bugs with it; for example, the one on the front page of asciinema.org didn’t work for me first time, and the script finishes with its progress bar still some 20px short of 100%, and if you click in the gap it jumps to there and “plays” indefinitely, without having updated the screen to the right place, either. Not encouraging, frankly.

### [showterm](http://showterm.io/)

**Format:** `script -t` plus initial screen dimensions.

**Audio:** no.

**Recording:**
- **Code:** https://github.com/ConradIrwin/showterm
- **Usage:** `showterm` records and uploads to server; using the `script -t` format, it also allows basic timing editing before uploading.
- **Dependencies:** Ruby, `showterm` gem (it bundles `ttyrec`).

**Hosting platform:**
- **Code:** https://github.com/ConradIrwin/showterm.io
- **Primary deployment:** http://showterm.io/, https://showterm.io/
- **Fanciness:** none.

**Player:**
- **Code:** https://github.com/ConradIrwin/showterm.io/tree/master/app/assets
- **Demo:** https://showterm.io/
- **Complexity:** low.
- **API:** nothing much.
- **Dependencies:** jQuery, jQuery UI, term.js.
- **Attitude to the document:** all your document are belong to us.
- **Embedding:** `<iframe>` (problematic for getting dimensions right).
- **Compatibility:** untested but presumed high (at least IE8+, jQuery UI holding it back).
- **Prettiness/usability:** not *terrible*, but not magnificent either.
- **Poster:** no.
- **Window title:** no.

### [TermRecord](https://github.com/theonewolf/TermRecord)

A tool for producing self-contained HTML.

**Format:** proprietary but simple (`[[text, total milliseconds]]`)

**Audio:** no.

**Recording:**
- **Code:** https://github.com/theonewolf/TermRecord
- **Usage:** `TermRecord -o filename.html`.
- **Dependencies:** Python, jinja2, `script -t` or `ttyrec`.

**Hosting:** n/a (it produces standalone HTML files)

**Web client:**
- **Code:** https://github.com/theonewolf/TermRecord/tree/master/termrecord/templates
- **Demo:** http://theonewolf.github.io/TermRecord/demo-static.html
- **Complexity:** low.
- **API:** nothing worth speaking of; proprietary.
- **Dependencies:** term.js.
- **Attitude to the document:** I *am* the document!
- **Embedding:** why would you bother? (`<iframe>` will work, I guess.)
- **Compatibility:** untested but presumed very high (probably IE6+), though it’ll be uglier where `<input type=range>` isn’t supported.
- **Prettiness/usability:** uhh… I think they went for the “functional” æsthetic. But its usability is tolerable.
- **Poster:** no.
- **Window title:** no.

### [shelr](https://github.com/antono/shelr)

Apparently abandoned.

**Format:** `script -t` plus initial screen dimensions.

**Audio:** no.

**Recording:**
- **Code:** https://github.com/antono/shelr
- **Usage:** ?
- **Dependencies:** Ruby, `shelr` gem, `ttyrec` or `script -t`.

**Hosting:**
- **Code:** https://github.com/shelr/shelr.tv
- **Primary deployment:** was shelr.tv, but now dead.
- **Fanciness:** high; voting, comments, *&c.*

**Player:**
- **Code:** https://github.com/shelr/shelr.tv/tree/master/app/assets/javascripts/player
- **Complexity:** moderate.
- **API:** moderately capable; proprietary.
- **Dependencies:** uncertain, term.js.
- **Attitude to the document:** tell me where to go and I’ll stay inside the lines.
- **Embedding:** uncertain, but I imagine there’s something?
- **Compatibility:** uncertain.
- **Prettiness/usability:** quite good, from the screenshots.
- **Poster:** no.
- **Window title:** no.

### tty-player

(This library.)

**Format:** `ttyrec` (with support for the *slightly* non-standard `termrec` UTF-8 and screen dimension indicators).

**Audio:** no (but planned, having used the `HTMLMediaElement` base will make it easier).

**Recording:** `termrec` (or `ttyrec`). Not good for editing, unless someone’s made a tool to do that that I haven’t noticed? I would like to make one at some point, anyway.

**Hosting:** n/a (it’d be a separate project)

**Player:**
- **Code:** https://github.com/chris-morgan/tty-player
- **Complexity:** moderate; high in some parts due to following the `HTMLMediaElement` spec.
- **API:** `HTMLMediaElement` (standard) plus a little bit more. Can imitate `HTMLVideoElement` fairly completely if instructed to, too.
- **Dependencies:** term.js; webcomponents-lite.js (Web Components polyfill) recommended for better browser compatibility.
- **Attitude to the document:** thus far shall you come, and no farther. (Just like any other HTML element.)
- **Embedding:** that’s all it *is*! `<tty-player src=foo.ttyrec></tty-player>`.
- **Compatibility:** modern browsers plus probably IE10, maybe mostly IE9 (unverified).
- **Prettiness/usability:** Dazzlingly marvelous! Perfect! Flawless! Staggering!
- **Poster:** yes, <code>poster=npt:*time*</code> and it is taken from the source file at that time, or <code>poster=data:text/plain,*text with control sequences*</code>.
- **Window title:** yes (initial value through the `window-title` attribute, can be set through ANSI codes too).

Author
------

[Chris Morgan](http://chrismorgan.info/) ([chris-morgan](https://github.com/chris-morgan)) is the primary author and maintainer of tty-player.

License
-------

This library is distributed under the terms of the MIT license. See LICENSE for details.
