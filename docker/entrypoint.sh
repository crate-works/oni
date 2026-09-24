#!/bin/sh

# Check if configuration file exists
if [ ! -f "/configuration.json" ]; then
  echo "Error: Configuration file not found"
  echo "Please mount your configuration.json file to /configuration.json"
  exit 1
fi

# /run is writable even with a read-only root filesystem, as nginx needs it for its pid
mkdir -p /run/oni || exit 1

jq --slurpfile overrides /etc/oni/overrides.json '
  reduce ($overrides[0] | to_entries[]) as $override (.;
    (env[$override.key] // "") as $value
    | if $value != "" then setpath($override.value; $value) else . end)
' /configuration.json > /run/oni/configuration.json || exit 1

exec "$@"
