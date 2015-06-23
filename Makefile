# … and why not?

.PHONY: all clean

all: tty-player.min.js tty-player.min.css

clean:
	rm -f tty-player.min.js

tty-player.min.js: tty-player.js
	@echo Minifying tty-player.js...
	@curl http://www.closure-compiler.appspot.com/compile --compressed -H 'Content-Type: application/x-www-form-urlencoded;charset=utf-8' --data compilation_level=ADVANCED_OPTIMIZATIONS --data output_format=text --data output_info=compiled_code --data-urlencode js_code@tty-player.js --data-urlencode js_externs@term.js/src/term.js > tty-player.min.js

tty-player.min.css: tty-player.css
	@echo Minifying tty-player.css...
	@uglifycss tty-player.css > tty-player.min.css
