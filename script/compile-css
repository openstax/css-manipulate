#!/bin/bash
set -e

for filename in $(ls ./test/*/*.less)
do
  filename="${filename%.*}" # strip off the extension
  $(npm bin)/lessc --source-map "${filename}.less" "${filename}.css"
done
