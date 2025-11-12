// encode.js
const fs = require("fs");
const key = fs.readFileSync("./habit-track-admin-sdk.json", "utf8");
const base64 = Buffer.from(key).toString("base64");
console.log(base64);
