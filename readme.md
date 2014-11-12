# NodeBB WoW Guild Integration

This is a NodeBB plugin with a bunch of WoW related functionality:
 - Map guilds to specific user groups.
 - Achievement points and image syncing per user.
 - Parser for item links with hover card.
 - (After nodebb-plugin-card upgrade) user hover card.

## Installation

    npm install nodebb-plugin-wow

## Running

Because of a limitation of the [battlenet-api](https://github.com/benweier/battlenet-api) you currently need to set the API key as an environment variable.
The author has mentioned that he plans to change this to allow changing API keys on the fly.
So, in order for this plugin to work, you need to set the following environment variable:

    BATTLENET_API_KEY=[your_api_key]