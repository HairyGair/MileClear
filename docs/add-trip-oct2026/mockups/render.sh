#!/bin/zsh
# Render every SVG in this folder to a 2x PNG with headless Chrome, using
# the app's own font files (Plus Jakarta Sans + Ionicons). Run build_add.py first.
set -e
HERE=${0:A:h}
REPO=${HERE:h:h:h}
FONTS=$REPO/apps/mobile/assets/fonts
ION=$REPO/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf
[[ -f $ION ]] || ION=/Users/anthony/Projects/MileClear/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
TMP=$(mktemp -d)
for svg in $HERE/*.svg; do
  name=${svg:t:r}
  w=$(sed -n 's/.*<svg[^>]* width="\([0-9]*\)".*/\1/p' $svg | head -1)
  h=$(sed -n 's/.*<svg[^>]* height="\([0-9]*\)".*/\1/p' $svg | head -1)
  cat > $TMP/$name.html <<HTML
<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:"Plus Jakarta Sans";font-weight:300;src:url("file://$FONTS/PlusJakartaSans_300Light.ttf")}
@font-face{font-family:"Plus Jakarta Sans";font-weight:400;src:url("file://$FONTS/PlusJakartaSans_400Regular.ttf")}
@font-face{font-family:"Plus Jakarta Sans";font-weight:500;src:url("file://$FONTS/PlusJakartaSans_500Medium.ttf")}
@font-face{font-family:"Plus Jakarta Sans";font-weight:600;src:url("file://$FONTS/PlusJakartaSans_600SemiBold.ttf")}
@font-face{font-family:"Plus Jakarta Sans";font-weight:700;src:url("file://$FONTS/PlusJakartaSans_700Bold.ttf")}
@font-face{font-family:"Ionicons";src:url("file://$ION")}
html,body{margin:0;padding:0;background:#030712}svg{display:block}
</style></head><body>
$(cat $svg)
</body></html>
HTML
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files \
    --force-device-scale-factor=2 --window-size=$w,$h --virtual-time-budget=3000 \
    --screenshot=$HERE/$name.png file://$TMP/$name.html >/dev/null 2>&1
  echo "rendered $name.png (${w}x${h} pt)"
done
rm -rf $TMP
