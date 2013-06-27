#!/bin/bash
set -e

# First, ensure that the working copy and index is clean
if [ -n "$(git status --porcelain)" ]; then
    echo "You have uncommitted changes; aborting" >&2
    exit 1
fi

# Use jekyll to perform the build, but allow the user to specify the
# path, if needed. Similarly, set a path to the htmlcompressor
JEKYLL=${JEKYLL-jekyll}
HTMLCOMPRESSOR=${HTMLCOMPRESSOR-htmlcompressor.jar}

# Build the site
$JEKYLL build
# Compress the HTML files
java -jar $HTMLCOMPRESSOR --type html --recursive _site --output _site2/
# Move the compressed HTML files into place
cp -Rf _site2/ _site/
rm -rf _site2/

# Perform the git operations
PLACEHOLDER=$(git rev-parse --symbolic HEAD)
git add -f _site
TREE=$(git write-tree --prefix=_site/)
COMMIT=$(date | git commit-tree $TREE -p deploy)
git update-ref refs/heads/deploy $COMMIT
git checkout -f $PLACEHOLDER
