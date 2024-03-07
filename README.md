# DiscordFS

## Features
- Virtually unlimited file sizes by splitting files into 25MB chunks.
- WebDav for large support.
- Data security with built-in file encryption.

## Installation & Preparation

If you haven't already created a Discord bot, follow these steps:

### Create a Discord Bot

1. Create a new application on [Discord Developer Portal](https://discord.com/developers/applications).
2. Select your new app, navigate to "Bot" in the sidebar, and click "Add Bot". Copy its Token.
3. Navigate to "OAuth2" in the sidebar, note down your "Client ID".

### Invite the Discord Bot to Your Guild

1. Complete the following URL with your client ID: https://discord.com/oauth2/authorize?response_type=code&client_id=YOUR_CLIENT_ID&scope=bot
2. Navigate to the URL and let the bot join your preferred guild.

You can obtain your guild and channel snowflake (its ID) by enabling Developer Mode on your Discord client (User Settings > Advanced > Developer Mode), then right-clicking on the guild's name or the specific channel and choosing "Copy ID" from the context menu.

## Usage

```bash
git clone https://github.com/goodbyepavlyi/DiscordFS
cd DiscordFS
docker-compose up -d

# After the bot is running, you have to change the config.json file
# You can find the config.json file in the data folder
nano data/config.json
```

## ⚠ Known Issues
- If using rclone, if the file is larger than 1GB, it will fail to upload. I'm not sure why, but I'm working on it. (Any help is appreciated)

## Contributing
Pull requests and any help are welcome <3