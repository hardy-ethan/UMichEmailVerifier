require("dotenv").config();

import {Client} from "discord.js";

const client = new Client({intents: []});

client.on("ready", () => {
    console.log("Ready!");
});

client.login(process.env.DISCORD_TOKEN);