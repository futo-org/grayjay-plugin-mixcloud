#!/bin/sh
set -eu

PRE_RELEASE=${PRE_RELEASE:-false}  # Default to false if not set

# Determine deployment directory
if [ "$PRE_RELEASE" = "true" ]; then
    RELATIVE_PATH="pre-release/Mixcloud"
else
    RELATIVE_PATH="Mixcloud"
fi

sh "$(dirname "$0")/publish-r2.sh" "$RELATIVE_PATH" MixcloudConfig.json MixcloudConfig.json MixcloudScript.js MixcloudIcon.png
