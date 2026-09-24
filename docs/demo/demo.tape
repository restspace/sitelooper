# sitelooper: record once with the agent, replay with the model asleep.
Output record-once-replay-free.gif
Output record-once-replay-free.mp4

Set Shell cmd
Set FontSize 19
Set Width 1240
Set Height 660
Set Padding 24
Set Theme "Catppuccin Mocha"
Set TypingSpeed 35ms

Hide
Type `"C:/Program Files/Git/bin/bash.exe" --noprofile --norc`
Enter
Sleep 1s
Type "source ./env.sh; export PS1='❯ '; curl -s -X POST http://127.0.0.1:4180/__reset >/dev/null; clear"
Enter
Show

# --- 1. teach it once -------------------------------------------------------
Type "# 1. Teach it once. Plain English in, an agent drives the browser."
Enter
Sleep 2s
Hide
Type "clear; node transcript.mjs recording.log '  warning' | cat"
Enter
Show
Sleep 46s
Sleep 3.5s

# --- 2. reset, then run it again --------------------------------------------
Hide
Type "clear"
Enter
Show
Type "# 2. Wipe the app's database, then run the same job again."
Enter
Sleep 1.5s
Type "curl -s -X POST http://127.0.0.1:4180/__reset >/dev/null && echo 'app reset: 0 Bench tickets'"
Enter
Sleep 1.5s
Type "sitelooper run ticket --var runid=take2"
Enter
Sleep 22s
Sleep 2s
Type "# every step replayed from the stored procedure: 0 model calls, $0.00"
Enter
Sleep 2.5s

# --- 3. the app's own database agrees ---------------------------------------
Type "./db-check   # the app's own database, not the tool's report"
Enter
Sleep 4s
Screenshot final.png
