# … and why not?

.PHONY: all clean

all: tty-player.min.js

clean:
	rm -f tty-player.min.js

tty-player.min.js: tty-player.js
	@echo Minifying tty-player.js...
	@curl https://closure-compiler.appspot.com/compile --compressed -H 'Content-Type: application/x-www-form-urlencoded;charset=utf-8' --data compilation_level=ADVANCED_OPTIMIZATIONS --data language_out=ES6 --data output_format=text --data output_info=compiled_code --data-urlencode js_code@tty-player.js --data-urlencode js_externs@term.js/src/term.js --data-urlencode js_externs='/** @type {!DOMTokenList} */ Element.prototype.part;' > tty-player.min.js
