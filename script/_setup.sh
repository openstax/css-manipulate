#!/bin/bash

# the non-npm version of css-tree needs a special `./data/` which is built
# as part of npm install
do_progress 'Building custom data/ dir in css-tree (remove once we use npm version again)'
echo "$(cd ./node_modules/css-tree && npm install)"
